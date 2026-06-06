/**
 * SNS 共有リンクの組み立て（pure・DOM 非依存 → Vitest でテスト可能）。
 *
 * X(旧Twitter) の Web Intent を使う。`https://x.com/intent/tweet` は投稿作成画面を開く
 * 公式エンドポイントで、OAuth もアプリ登録も不要（ユーザーのログイン状態で開くだけ）。
 */

/** 本番(カスタムドメイン)の URL。共有テキストの既定 URL に使う。 */
export const SITE_URL = 'https://kami-scale-trainer.org/';

const X_INTENT = 'https://x.com/intent/tweet';

/**
 * X 投稿(Web Intent)の URL を組み立てる。
 * @param {object} opts
 * @param {string} [opts.text]      本文
 * @param {string} [opts.url]       添付 URL（X が自動でカード化する。本文とは別枠）
 * @param {string[]} [opts.hashtags] ハッシュタグ（# は付けない・英数字推奨）
 * @returns {string} intent URL
 */
export function buildXShareUrl({ text = '', url = '', hashtags = [] } = {}) {
  const params = new URLSearchParams();
  if (text) params.set('text', text);
  if (url) params.set('url', url);
  const tags = (hashtags || []).filter(Boolean);
  if (tags.length) params.set('hashtags', tags.join(','));
  return `${X_INTENT}?${params.toString()}`;
}
