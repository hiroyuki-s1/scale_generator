/**
 * /api/shares/:share_id
 *   GET    — 受け取り（公開・認証不要）。失効/不存在は 404。
 *   DELETE — 取り消し（作成者のみ・認証必須）。
 * 仕様: docs/features/SHARE.md, docs/features/EXCEPTION_HANDLING.md。
 */
import { requireUserId } from '../../_lib/auth.js';
import { json, unauthorized, notFound, internal } from '../../_lib/responses.js';

export async function onRequestGet({ env, params }) {
  try {
    const now = Date.now();
    // expires_at <= now は即 404（バッチ削除の遅延に依存しない）。
    const row = await env.DB.prepare(
      `SELECT share_id, name, scales, schema_version, scale_count, created_at, expires_at
         FROM shares
        WHERE share_id = ? AND expires_at > ?`,
    ).bind(params.share_id, now).first();
    if (!row) return notFound('この共有は存在しないか、有効期限が切れています');
    let scales;
    try { scales = JSON.parse(row.scales); } catch { scales = null; }
    return json({ ...row, scales });
  } catch (e) {
    console.error('GET /api/shares/:id failed', e);
    return internal();
  }
}

export async function onRequestDelete({ request, env, params }) {
  const userId = await requireUserId(request, env);
  if (!userId) return unauthorized();
  try {
    const res = await env.DB.prepare(
      'DELETE FROM shares WHERE share_id = ? AND user_id = ?',
    ).bind(params.share_id, userId).run();
    if (!res.meta || res.meta.changes === 0) return notFound();
    return json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/shares/:id failed', e);
    return internal();
  }
}
