/**
 * 印刷用ページグループ管理。
 *
 * CSS Grid は印刷時のページ分割が不安定なため、
 * beforeprint で cols×rows 枚ずつ .print-page-group div にまとめ、
 * afterprint で元に戻すことで確実な改ページを実現する。
 *
 * calcPageGroupSizes は純粋関数 → テスト容易。
 * wrap/unwrap は DOM 操作 → main.js の beforeprint/afterprint から呼ぶ。
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
 * 改ページの仕組み:
 *   .print-page-group 自体の break-after:page は iOS Safari で動作しない。
 *   そのため 2ページ目以降の先頭に .print-page-break (シンプルな block div) を
 *   挿入し、CSS の page-break-before:always で改ページする。
 *   ブロック要素への page-break-before は全ブラウザで確実に動作する。
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
  for (let i = 0; i < sizes.length; i++) {
    // 2ページ目以降: 改ページ用 div を先に挿入
    if (i > 0) {
      const br = document.createElement('div');
      br.className = 'print-page-break';
      grid.insertBefore(br, cards[idx]);
    }
    const group = document.createElement('div');
    group.className = 'print-page-group';
    grid.insertBefore(group, cards[idx]);
    for (let j = 0; j < sizes[i]; j++) group.appendChild(cards[idx++]);
  }
}

/**
 * .print-page-group / .print-page-break を解体してカードを #savedGrid 直下に戻す。
 * @param {Element} grid
 */
export function unwrapPageGroups(grid) {
  [...grid.querySelectorAll('.print-page-group, .print-page-break')].forEach(el => {
    if (el.classList.contains('print-page-group')) {
      while (el.firstChild) grid.insertBefore(el.firstChild, el);
    }
    el.remove();
  });
}
