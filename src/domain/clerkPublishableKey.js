/**
 * Clerk Publishable key から Frontend API ホストを導出する（pure）。
 *
 * Clerk の pk は `pk_test_<base64>` / `pk_live_<base64>` の形で、base64 部分は
 * `"<frontend-api-host>$"` をエンコードしたもの。ClerkJS の CDN スクリプト URL
 * （`https://<host>/npm/@clerk/clerk-js@5/dist/clerk.browser.js`）を組むのに使う。
 *
 * @param {unknown} pk Publishable key
 * @returns {string|null} 例 'set-turkey-55.clerk.accounts.dev'、不正なら null
 */
export function frontendApiFromPublishableKey(pk) {
  if (typeof pk !== 'string') return null;
  const m = pk.match(/^pk_(?:test|live)_(.+)$/);
  if (!m) return null;
  const body = m[1];
  if (!body) return null;
  let decoded;
  try {
    decoded = atob(body);
  } catch {
    return null;
  }
  const host = decoded.replace(/\$+$/, '');
  return host || null;
}
