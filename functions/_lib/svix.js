/**
 * Svix (Clerk Webhook) 署名検証。Web Crypto の HMAC-SHA256 で行う。
 * 退会クリーンアップは取り消せないため、未署名の偽リクエストを必ず弾く（docs/auth/API.md）。
 *
 * 署名仕様:
 *   signedContent = `${svix-id}.${svix-timestamp}.${rawBody}`
 *   secret は `whsec_<base64>`。base64 部分を鍵にして HMAC-SHA256 → base64。
 *   `svix-signature` ヘッダはスペース区切りの `v1,<b64sig>` を複数含みうる（鍵ローテーション）。
 */

const WEBHOOK_TOLERANCE_SEC = 5 * 60;

function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
function bytesToBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/** 長さに依存しにくい定数時間比較。 */
export function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** 署名対象文字列を組み立てる（テスト可能な pure 部分）。 */
export function buildSignedContent(svixId, svixTimestamp, rawBody) {
  return `${svixId}.${svixTimestamp}.${rawBody}`;
}

async function hmacBase64(secret, content) {
  const secretBytes = base64ToBytes(secret.replace(/^whsec_/, ''));
  const key = await crypto.subtle.importKey(
    'raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(content));
  return bytesToBase64(new Uint8Array(sig));
}

/**
 * Svix 署名を検証する。
 * @param {string} rawBody  リクエストボディ（生文字列）
 * @param {{['svix-id']?:string,['svix-timestamp']?:string,['svix-signature']?:string}} headers
 * @param {string} secret  CLERK_WEBHOOK_SIGNING_SECRET（whsec_...）
 * @param {() => number} [now]  現在時刻 ms（テスト用）
 * @returns {Promise<boolean>}
 */
export async function verifySvixSignature(rawBody, headers, secret, now = () => Date.now()) {
  const id = headers['svix-id'];
  const ts = headers['svix-timestamp'];
  const sigHeader = headers['svix-signature'];
  if (!id || !ts || !sigHeader || !secret) return false;

  // タイムスタンプ許容範囲（リプレイ対策）
  const tsSec = Number(ts);
  if (!Number.isFinite(tsSec)) return false;
  const nowSec = Math.floor(now() / 1000);
  if (Math.abs(nowSec - tsSec) > WEBHOOK_TOLERANCE_SEC) return false;

  const expected = await hmacBase64(secret, buildSignedContent(id, ts, rawBody));
  // ヘッダ内のいずれかの v1 署名が一致すれば OK。
  return sigHeader.split(' ').some(part => {
    const idx = part.indexOf(',');
    if (idx < 0) return false;
    const ver = part.slice(0, idx);
    const val = part.slice(idx + 1);
    return ver === 'v1' && timingSafeEqual(val, expected);
  });
}
