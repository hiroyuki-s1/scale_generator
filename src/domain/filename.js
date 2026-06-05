/**
 * ファイル名サニタイズ（pure・DOM非依存）。画像（PNG）出力のファイル名に使う。
 * 仕様: docs/features/IMAGE_EXPORT.md（不正文字を除去、空なら fallback）。
 *
 * - OS/ブラウザのダウンロードで問題になる文字 `/ \ : * ? " < > |` と制御文字を除去
 * - 前後の空白とドット（隠しファイル化・拡張子境界の事故）を除去
 * - 長すぎる名前は 120 文字に切り詰め
 * - 結果が空なら fallback（既定 'scale'）。スペースは保持する。
 *
 * @param {unknown} name もとの名前（スケール名など）
 * @param {string} [fallback='scale'] サニタイズ結果が空のときの代替
 * @returns {string}
 */
const RESERVED = new Set(['/', '\\', ':', '*', '?', '"', '<', '>', '|']);

/** OS 予約文字と制御文字 (U+0000–U+001F, U+007F) を除去。スペースは保持。 */
function stripIllegal(str) {
  let out = '';
  for (const ch of str) {
    const code = ch.codePointAt(0);
    if (code < 0x20 || code === 0x7f) continue; // 制御文字
    if (RESERVED.has(ch)) continue;             // OS 予約文字
    out += ch;
  }
  return out;
}

export function sanitizeFilename(name, fallback = 'scale') {
  if (typeof name !== 'string') return fallback;
  const cleaned = stripIllegal(name)
    .replace(/^[\s.]+|[\s.]+$/g, '')   // 前後の空白・ドット
    .slice(0, 120)
    .replace(/[\s.]+$/g, '');          // 切り詰めで末尾に残った空白・ドット
  return cleaned === '' ? fallback : cleaned;
}
