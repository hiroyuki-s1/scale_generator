/**
 * /api/shares — 共有の作成 (POST, ログイン必須)。仕様: docs/features/SHARE.md。
 * share_id はサーバ生成・UNIQUE 衝突時は再生成リトライ。90日で自動失効。
 */
import { requireUserId } from '../../_lib/auth.js';
import { validateShareBody, MAX_SHARES, SHARE_TTL_MS } from '../../_lib/validation.js';
import { genShareId } from '../../_lib/ids.js';
import { json, unauthorized, badRequest, internal } from '../../_lib/responses.js';

const MAX_INSERT_RETRY = 5;

export async function onRequestPost({ request, env }) {
  const userId = await requireUserId(request, env);
  if (!userId) return unauthorized();

  let body;
  try { body = await request.json(); } catch { return badRequest('JSON を解釈できませんでした'); }
  const v = validateShareBody(body);
  if (!v.ok) return badRequest(v.message);

  try {
    const now = Date.now();
    // 有効な共有数の上限チェック（idx_shares_user を使う）。
    const countRow = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM shares WHERE user_id = ? AND expires_at > ?',
    ).bind(userId, now).first();
    if ((countRow?.n ?? 0) >= MAX_SHARES) {
      return badRequest('共有の上限に達しました。古い共有が失効するまでお待ちください');
    }

    const expiresAt = now + SHARE_TTL_MS;
    // UNIQUE(share_id) 衝突時は数回まで再生成（露出しない）。
    for (let attempt = 0; attempt < MAX_INSERT_RETRY; attempt++) {
      const shareId = genShareId();
      try {
        await env.DB.prepare(
          `INSERT INTO shares
             (share_id, user_id, name, scales, schema_version, scale_count, created_at, expires_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(shareId, userId, v.value.name, v.value.scalesJson, v.value.schemaVersion, v.value.scaleCount, now, expiresAt).run();
        return json({ share_id: shareId, expires_at: expiresAt }, 201);
      } catch (e) {
        if (String(e).includes('UNIQUE') && attempt < MAX_INSERT_RETRY - 1) continue;
        throw e;
      }
    }
    return internal();
  } catch (e) {
    console.error('POST /api/shares failed', e);
    return internal();
  }
}
