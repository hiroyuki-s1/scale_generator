/**
 * 共有リンクの組み立て・解釈（pure・DOM 非依存 → Vitest でテスト可能）。
 *
 * 方針（無期限・自動生成）:
 *   ソングブックの public_id（推測不能な UUID）をそのまま共有キーに使う。共有 URL は
 *   `<origin><base>?share=<public_id>` で、ソングブックが存在する限り無期限に有効
 *   （別途「共有を作成」する操作も期限も管理も不要）。
 */

/**
 * 共有 URL を組み立てる。
 * @param {string} origin   例: 'https://kami-scale-trainer.org'（末尾スラッシュ無し想定）
 * @param {string} base     Vite の BASE_URL（例 '/' or '/scale_generator/'）
 * @param {string} publicId ソングブックの public_id
 * @returns {string}
 */
export function buildShareUrl(origin, base, publicId) {
  const o = String(origin || '').replace(/\/+$/, '');
  const b = String(base || '/');
  const path = b.endsWith('/') ? b : `${b}/`;
  return `${o}${path}?share=${encodeURIComponent(String(publicId || ''))}`;
}

/**
 * 入力（URL でも生 ID でも）から共有 ID（= public_id）を取り出す。
 * @param {string} raw
 * @returns {string} 取り出せなければ ''
 */
export function extractShareId(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (s === '') return '';
  const m = s.match(/[?&]share=([^&\s#]+)/);
  if (m) {
    try { return decodeURIComponent(m[1]); } catch { return m[1]; }
  }
  // クエリが無い生入力はそのまま ID とみなす（前後の空白のみ除去）
  return s;
}

/**
 * 共有 ID として妥当そうか（起動時 `?share=` の自動読込で雑な値を弾く）。
 * public_id は crypto.randomUUID（英数字 + ハイフン）。レガシーの短い share_id も許容。
 * @param {string} id
 * @returns {boolean}
 */
export function isLikelyShareId(id) {
  return /^[A-Za-z0-9-]{6,40}$/.test(String(id || ''));
}

/**
 * X(旧Twitter) の Web Intent URL を組み立てる（OAuth/アプリ登録不要・投稿作成画面を開くだけ）。
 * @param {object} opts
 * @param {string} [opts.text]      本文
 * @param {string} [opts.url]       添付 URL（X がカード化。本文とは別枠）
 * @param {string[]} [opts.hashtags] ハッシュタグ（# は付けない）
 * @returns {string} intent URL
 */
export function buildXShareUrl({ text = '', url = '', hashtags = [] } = {}) {
  const params = new URLSearchParams();
  if (text) params.set('text', text);
  if (url) params.set('url', url);
  const tags = (hashtags || []).filter(Boolean);
  if (tags.length) params.set('hashtags', tags.join(','));
  return `https://x.com/intent/tweet?${params.toString()}`;
}
