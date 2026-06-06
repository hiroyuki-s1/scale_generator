/**
 * POST /api/events/launch — 起動イベント記録 (粒度: 1 起動 = 1 行)。
 *
 * 設計:
 *   ・認証は任意。ログイン時は Clerk user_id を記録、未ログイン時は anon_id を記録。
 *   ・body: { anon_id?: string, tz_offset?: number } (どちらも任意・サーバ側で最小限の検証)。
 *   ・連投を防ぐ簡易抑制: 同一 IP からの瞬間連打は素直に書く (Cloudflare WAF 任せ)。
 *     アプリ側で「セッション中に既に送ったらスキップ」する (cloudSync.js)。
 *   ・記録失敗してもユーザー体験を妨げないため 4xx/5xx でも 204 を返す (本文無し)。
 */
import { requireUserId } from '../../_lib/auth.js';

const MAX_ANON_ID_LEN = 64;

function noContent() { return new Response(null, { status: 204 }); }

export async function onRequestPost({ request, env }) {
  try {
    const userId = await requireUserId(request, env).catch(() => null);
    let body = {};
    try { body = await request.json(); } catch { /* 本文無しでも OK */ }
    const anonId = typeof body?.anon_id === 'string' && body.anon_id.length > 0
      && body.anon_id.length <= MAX_ANON_ID_LEN
      ? body.anon_id
      : null;
    const tzOffset = Number.isInteger(body?.tz_offset) ? body.tz_offset : null;

    // user_id か anon_id のどちらも無ければ無視 (匿名 ID 未生成のケース)。
    if (!userId && !anonId) return noContent();

    await env.DB.prepare(
      `INSERT INTO user_events (at, event_type, user_id, anon_id, tz_offset)
       VALUES (?, 'launch', ?, ?, ?)`,
    ).bind(Date.now(), userId, anonId, tzOffset).run();
    return noContent();
  } catch (e) {
    // ログだけ残してクライアントには成功扱いを返す (起動を阻害しない)。
    console.error('POST /api/events/launch failed', e);
    return noContent();
  }
}
