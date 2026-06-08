/**
 * POST /api/events — 汎用行動ログ受付（analytics_events へ1行 INSERT）。
 *
 * ⚠️【一時的・実験的な行動ログ。「後で消す前提」の独立 feature】⚠️
 *   削除手順は migrations/0006_create_analytics_events.sql のコメント参照。
 *   既存の /api/events/launch（user_events 起動ログ）とは別物・無関係。
 *
 * 設計:
 *   ・認証は任意。ログイン時は user_id、未ログインは anon_id を記録。
 *   ・body: { type: string, props?: object, anon_id?: string }。
 *   ・PII は受け取らない前提（props は root/mode/件数などの文脈のみ・サイズ上限あり）。
 *   ・記録失敗してもユーザー体験を妨げないため常に 204 を返す（本文無し）。
 */
import { requireUserId } from '../../_lib/auth.js';

const MAX_TYPE_LEN = 40;
const MAX_ANON_ID_LEN = 64;
const MAX_PROPS_BYTES = 2000; // 巨大 props を弾く（PII/事故防止・行肥大化防止）

function noContent() { return new Response(null, { status: 204 }); }

export async function onRequestPost({ request, env }) {
  try {
    const userId = await requireUserId(request, env).catch(() => null);
    let body = {};
    try { body = await request.json(); } catch { /* 本文不正でも 204 */ }

    const type = typeof body?.type === 'string' ? body.type.trim() : '';
    if (type.length < 1 || type.length > MAX_TYPE_LEN) return noContent(); // 不正な type は黙って捨てる

    const anonId = typeof body?.anon_id === 'string'
      && body.anon_id.length > 0 && body.anon_id.length <= MAX_ANON_ID_LEN
      ? body.anon_id : null;

    let props = null;
    if (body?.props && typeof body.props === 'object' && !Array.isArray(body.props)) {
      const json = JSON.stringify(body.props);
      if (json.length <= MAX_PROPS_BYTES) props = json;
    }

    // user_id も anon_id も無ければ記録しない（誰の行動か紐づかないため）。
    if (!userId && !anonId) return noContent();

    await env.DB.prepare(
      'INSERT INTO analytics_events (at, event_type, user_id, anon_id, props) VALUES (?, ?, ?, ?, ?)',
    ).bind(Date.now(), type, userId, anonId, props).run();
    return noContent();
  } catch (e) {
    console.error('POST /api/events failed', e);
    return noContent(); // 起動・操作を阻害しない
  }
}
