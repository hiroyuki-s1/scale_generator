/**
 * Pages Functions 共通のレスポンスヘルパ（pure）。
 * エラー形式は docs/songbook/API.md に準拠: { error, message }。
 * 詳細（スタック等）はレスポンスに出さずログのみ（EXCEPTION_HANDLING.md）。
 */

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' };

/** 任意の JSON レスポンス。 */
export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...headers },
  });
}

/** エラー JSON（{ error, message }）。 */
export function errorJson(status, error, message) {
  return json({ error, message }, status);
}

export const unauthorized = (msg = '認証が必要です') => errorJson(401, 'unauthorized', msg);
export const forbidden    = (msg = '権限がありません') => errorJson(403, 'forbidden', msg);
export const badRequest   = (msg = 'リクエストが不正です') => errorJson(400, 'invalid_body', msg);
export const notFound     = (msg = '見つかりません') => errorJson(404, 'not_found', msg);
export const rateLimited  = (msg = '混み合っています。しばらくして再試行してください') => errorJson(429, 'rate_limited', msg);
export const internal     = (msg = 'サーバーエラーが発生しました') => errorJson(500, 'internal', msg);
