/**
 * /api/shares/mine — 自分の有効な共有一覧（認証必須）。仕様: docs/features/SHARE.md。
 * idx_shares_user (user_id, expires_at) を使い、失効済みを除外して新しい順に返す。
 */
import { requireUserId } from '../../_lib/auth.js';
import { json, unauthorized, internal } from '../../_lib/responses.js';

export async function onRequestGet({ request, env }) {
  const userId = await requireUserId(request, env);
  if (!userId) return unauthorized();
  try {
    const now = Date.now();
    const { results } = await env.DB.prepare(
      `SELECT share_id, name, scale_count, created_at, expires_at
         FROM shares
        WHERE user_id = ? AND expires_at > ?
        ORDER BY created_at DESC`,
    ).bind(userId, now).all();
    return json({ shares: results ?? [] });
  } catch (e) {
    console.error('GET /api/shares/mine failed', e);
    return internal();
  }
}
