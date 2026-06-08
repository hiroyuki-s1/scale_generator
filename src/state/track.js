/**
 * 行動ログ送信ヘルパ（POST /api/events）。
 *
 * ⚠️【一時的・実験的な行動ログ。「後で消す前提」の独立 feature】⚠️
 *   このファイルを削除し、`track(` の呼び出しを grep して消せば完全に除去できる。
 *   全体の削除手順は migrations/0006_create_analytics_events.sql のコメント参照。
 *
 * 方針:
 *   ・fire-and-forget。失敗しても throw せずアプリを止めない。
 *   ・anon_id は起動ログ(cloudSync)が作る 'sg.v1.anonId' を read-only で借用する。
 *   ・PII は送らない（props は root/mode/件数などの文脈のみ）。
 */
import { authedFetch } from './cloudSync.js';

const ANON_ID_KEY = 'sg.v1.anonId';

/**
 * 行動イベントを1件送る。
 * @param {string} type  例: 'scale_save' | 'share_create' | 'onboarding_done'
 * @param {object} [props] 任意の文脈データ（PII禁止）
 */
export function track(type, props = undefined) {
  try {
    let anonId = null;
    try { anonId = localStorage.getItem(ANON_ID_KEY); } catch { /* iOS private mode */ }
    const body = { type };
    if (anonId) body.anon_id = anonId;
    if (props && typeof props === 'object') body.props = props;
    authedFetch('api/events', { method: 'POST', body: JSON.stringify(body) }).catch(() => {});
  } catch { /* 計測でアプリを止めない */ }
}
