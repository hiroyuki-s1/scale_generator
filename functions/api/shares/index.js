/**
 * POST /api/shares — 共有の作成（ログイン必須）。仕様: docs/features/SHARE.md §5。
 *
 * クライアントは scales を再送せず `{ songbook_id }` のみ送る。サーバは所有者一致の
 * ソングブックを取得し、その時点のスナップショットを shares に複製（以後ソングブックを
 * 編集しても発行済み共有は変わらない＝凍結・AC-10）。share_id はサーバ生成・90日失効。
 */
/**
 * POST /api/shares — 共有の作成（ログイン必須）。仕様: docs/features/SHARE.md §5。
 *
 * 期限廃止後の新方針 (migration 0003):
 *   ・共有は明示削除されるまで永続。expires_at は廃止。
 *   ・上限は MAX_SHARES のみ (DB 圧迫対策)。
 *   ・スナップショット方式は維持: 共有時点のソングブック内容を shares に複製し凍結する。
 *
 * クライアントは scales を再送せず `{ songbook_id }` のみ送る。
 */
import { requireUserId } from '../../_lib/auth.js';
import { MAX_SHARES } from '../../_lib/validation.js';
import { genShareId } from '../../_lib/ids.js';
import { json, unauthorized, badRequest, notFound, internal } from '../../_lib/responses.js';

const MAX_INSERT_RETRY = 5;

export async function onRequestPost({ request, env }) {
  const userId = await requireUserId(request, env);
  if (!userId) return unauthorized();

  let body;
  try { body = await request.json(); } catch { return badRequest('JSON を解釈できませんでした'); }
  const songbookId = body?.songbook_id;
  if (typeof songbookId !== 'string' || songbookId === '') {
    return badRequest('songbook_id が必要です');
  }

  try {
    const now = Date.now();
    const sb = await env.DB.prepare(
      `SELECT name, scales, scale_count, schema_version
         FROM songbooks
        WHERE public_id = ? AND user_id = ? AND deleted_at IS NULL`,
    ).bind(songbookId, userId).first();
    if (!sb) return notFound('ソングブックが見つかりません');

    const countRow = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM shares WHERE user_id = ?',
    ).bind(userId).first();
    if ((countRow?.n ?? 0) >= MAX_SHARES) {
      return badRequest('共有の上限に達しました。不要な共有を削除してください');
    }

    const origin = new URL(request.url).origin;
    for (let attempt = 0; attempt < MAX_INSERT_RETRY; attempt++) {
      const shareId = genShareId();
      try {
        await env.DB.prepare(
          `INSERT INTO shares
             (share_id, user_id, name, scales, schema_version, scale_count, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).bind(shareId, userId, sb.name, sb.scales, sb.schema_version, sb.scale_count, now).run();
        return json({
          share_id: shareId,
          url: `${origin}/?share=${shareId}`,
          name: sb.name,
        }, 201);
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
