/**
 * Clerk JWT 検証（Pages Functions 用）。
 *
 * 設計: ネットワークレス検証（JWKS を取得して RS256 署名を Web Crypto で検証）。
 *   - `Authorization: Bearer <jwt>` から取り出す
 *   - ヘッダ alg=RS256 / kid を確認
 *   - Clerk の JWKS（`${CLERK_ISSUER}/.well-known/jwks.json`）から kid 一致の鍵を取得
 *   - 署名検証・exp/nbf・iss を確認し、ペイロードの `sub`（= Clerk user_id）を返す
 *
 * ⚠️ 実運用前に Clerk Development/Production インスタンスの実トークンで結合テストすること
 *   （JWKS URL・iss は環境変数 `CLERK_ISSUER` で設定。Phase 2 セットアップに従う）。
 *   base64url デコード / 構造パース / exp 判定など pure 部分は Vitest で検証済み。
 *
 * 参考: docs/auth/ARCHITECTURE.md, docs/auth/API.md。
 */

// ── pure helpers（テスト対象） ──────────────────────────────────────────

/** `Authorization` ヘッダから Bearer トークンを取り出す。無ければ null。 */
export function parseBearer(authHeader) {
  if (typeof authHeader !== 'string') return null;
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

/** base64url → Uint8Array。 */
export function base64UrlToBytes(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(str.length / 4) * 4, '=');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** JWT を { header, payload, signingInput, signature } に分解。不正なら null。 */
export function decodeJwt(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(new TextDecoder().decode(base64UrlToBytes(parts[0])));
    const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(parts[1])));
    return {
      header,
      payload,
      signingInput: `${parts[0]}.${parts[1]}`,
      signature: base64UrlToBytes(parts[2]),
    };
  } catch {
    return null;
  }
}

/** exp/nbf を秒で検証（leeway 秒の許容）。exp は必須（無いトークンは拒否）。 */
export function isTimeValid(payload, nowSec, leewaySec = 5) {
  if (typeof payload?.exp !== 'number') return false;        // exp 必須（Clerk 任せにしない）
  if (nowSec > payload.exp + leewaySec) return false;
  if (typeof payload?.nbf === 'number' && nowSec < payload.nbf - leewaySec) return false;
  return true;
}

// ── JWKS 検証（要ネットワーク・要 Clerk 結合テスト） ──────────────────────

const jwksCache = new Map(); // issuer → { keys, fetchedAt }
// 短めの TTL（鍵ローテーション/緊急失効の反映を早める）。kid ミス時は即再取得もする。
const JWKS_TTL_MS = 10 * 60 * 1000;

async function fetchJwks(issuer, fetchImpl) {
  const res = await fetchImpl(`${issuer.replace(/\/$/, '')}/.well-known/jwks.json`);
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  const keys = (await res.json()).keys || [];
  jwksCache.set(issuer, { keys, fetchedAt: Date.now() });
  return keys;
}

async function getSigningKey(issuer, kid, fetchImpl = fetch) {
  const cached = jwksCache.get(issuer);
  const fresh = cached && (Date.now() - cached.fetchedAt) < JWKS_TTL_MS;
  let keys = fresh ? cached.keys : await fetchJwks(issuer, fetchImpl);
  let jwk = keys.find(k => k.kid === kid);
  // kid が見つからない＝ローテーション直後の可能性 → キャッシュが新しくても1回だけ再取得
  if (!jwk && fresh) {
    keys = await fetchJwks(issuer, fetchImpl);
    jwk = keys.find(k => k.kid === kid);
  }
  if (!jwk) throw new Error('signing key (kid) not found in JWKS');
  return crypto.subtle.importKey(
    'jwk', jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['verify'],
  );
}

/**
 * Clerk JWT を検証し、user_id（payload.sub）を返す。失敗時は null。
 * @param {string} token
 * @param {object} env  CLERK_ISSUER を含む環境変数
 * @returns {Promise<string|null>}
 */
export async function verifyClerkJwt(token, env, { fetchImpl = fetch, now = () => Date.now() } = {}) {
  const decoded = decodeJwt(token);
  if (!decoded) return null;
  const { header, payload, signingInput, signature } = decoded;
  if (header.alg !== 'RS256' || !header.kid) return null;
  if (!isTimeValid(payload, Math.floor(now() / 1000))) return null;
  const issuer = env?.CLERK_ISSUER;
  if (!issuer) return null;
  // iss は必須かつ一致を強制（claim 欠落トークンを通さない）。
  if (typeof payload.iss !== 'string'
      || payload.iss.replace(/\/$/, '') !== issuer.replace(/\/$/, '')) return null;

  try {
    const key = await getSigningKey(issuer, header.kid, fetchImpl);
    const ok = await crypto.subtle.verify(
      { name: 'RSASSA-PKCS1-v1_5' },
      key,
      signature,
      new TextEncoder().encode(signingInput),
    );
    if (!ok) return null;
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

/**
 * 保護エンドポイント用: リクエストから user_id を取り出す。
 * @returns {Promise<string|null>} 認証成功なら user_id、失敗なら null（呼び出し側で 401）
 */
export async function requireUserId(request, env) {
  const token = parseBearer(request.headers.get('Authorization'));
  if (!token) return null;
  return verifyClerkJwt(token, env);
}
