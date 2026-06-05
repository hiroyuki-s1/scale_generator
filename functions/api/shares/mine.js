/**
 * /api/shares/mine — 自分の共有一覧（認証必須）。仕様: docs/features/SHARE.md。
 * 期限廃止 (migration 0003) — idx_shares_user (user_id, created_at) を使い新しい順に返す。
 */
import { requireUserId } from '../../_lib/auth.js';
import { json, unauthorized, internal } from '../../_lib/responses.js';

export async function onRequestGet({ request, env }) {
  const userId = await requireUserId(request, env);
  if (!userId) return unauthorized();
  try {
    const { results } = await env.DB.prepare(
      `SELECT share_id, name, scale_count, created_at
         FROM shares
        WHERE user_id = ?
        ORDER BY created_at DESC`,
    ).bind(userId).all();
    return json({ shares: results ?? [] });
  } catch (e) {
    console.error('GET /api/shares/mine failed', e);
    return internal();
  }
}
