/**
 * 印刷用ページグループ管理。
 *
 * 改ページ戦略 (試行錯誤の記録):
 *   × CSS Grid の break-after:page     → iOS Safari で動作しない
 *   × 空の .print-page-break + page-break-before → break要素自体が1P消費して空白ページが発生
 *   × .print-page-group に page-break-after:always → Safari が最終ページ後に余分な空白ページを作る
 *   ○ .print-page-group を block div にまとめ、**2番目以降のグループの「前」**に
 *     隣接兄弟セレクタ `.print-page-group + .print-page-group { page-break-before: always }`
 *     で改ページする (printCss.js が出力)。page-break-after は一切使わない。
 *     → グリッドレイアウトは内側の .print-page-inner で担う
 *   (詳細は CLAUDE.md の印刷セクション参照)
 */

/**
 * カード総数とページあたり枚数から、各ページの枚数配列を返す。
 * @param {number} total   - 登録スケールの総枚数
 * @param {number} perPage - cols × rows
 * @returns {number[]}     - 各ページのカード枚数 (最終ページは端数あり)
 */
export function calcPageGroupSizes(total, perPage) {
  if (perPage < 1) throw new RangeError('perPage must be >= 1');
  const sizes = [];
  for (let remaining = total; remaining > 0; remaining -= perPage) {
    sizes.push(Math.min(perPage, remaining));
  }
  return sizes;
}

/**
 * #savedGrid 直下の .saved-card を cols×rows 枚ずつ .print-page-group にまとめる。
 *
 * 構造:
 *   .print-page-group (block; 2番目以降は page-break-before:always で改ページ)
 *     .print-page-inner (grid, cols × rows レイアウト)
 *       .saved-card × N
 *
 * iOS afterprint 未発火など二重呼び出しに備え、先に unwrap してから実行する。
 * @param {Element} grid
 * @param {number}  cols - >= 1 (persist.js の sanitizeLayout で保証)
 * @param {number}  rows - >= 1 (persist.js の sanitizeLayout で保証)
 */
export function wrapIntoPageGroups(grid, cols, rows) {
  unwrapPageGroups(grid); // 冪等性: 既存グループを先に解体
  const cards = [...grid.querySelectorAll(':scope > .saved-card')];
  if (cards.length === 0) return;
  const perPage = cols * rows;
  const sizes = calcPageGroupSizes(cards.length, perPage);
  let idx = 0;
  for (const size of sizes) {
    const group = document.createElement('div');
    group.className = 'print-page-group';
    const inner = document.createElement('div');
    inner.className = 'print-page-inner';
    group.appendChild(inner);
    grid.insertBefore(group, cards[idx]);
    for (let i = 0; i < size; i++) inner.appendChild(cards[idx++]);
  }
}

/**
 * .print-page-group を解体してカードを #savedGrid 直下に戻す。
 * @param {Element} grid
 */
export function unwrapPageGroups(grid) {
  [...grid.querySelectorAll('.print-page-group')].forEach(group => {
    const inner = group.querySelector('.print-page-inner');
    const src = inner ?? group;
    while (src.firstChild) grid.insertBefore(src.firstChild, group);
    group.remove();
  });
}
