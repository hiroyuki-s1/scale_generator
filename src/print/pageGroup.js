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
 * iOS で afterprint が発火しない場合など二重呼び出しに備え、先に unwrap してから実行する。
 * @param {Element} grid
 * @param {number}  cols - >= 1 (persist.js の sanitizeLayout で保証)
 * @param {number}  rows - >= 1 (persist.js の sanitizeLayout で保証)
 */
export function wrapIntoPageGroups(grid, cols, rows) {
  unwrapPageGroups(grid); // 二重呼び出し対策: 既存グループを先に解体して冪等性を確保
  const cards = [...grid.querySelectorAll(':scope > .saved-card')];
  if (cards.length === 0) return;
  const perPage = cols * rows;
  const sizes = calcPageGroupSizes(cards.length, perPage);
  let idx = 0;
  for (const size of sizes) {
    const group = document.createElement('div');
    group.className = 'print-page-group';
    grid.insertBefore(group, cards[idx]);
    for (let i = 0; i < size; i++) group.appendChild(cards[idx++]);
  }
}

/**
 * .print-page-group を解体してカードを #savedGrid 直下に戻す。
 * @param {Element} grid
 */
export function unwrapPageGroups(grid) {
  [...grid.querySelectorAll('.print-page-group')].forEach(group => {
    while (group.firstChild) grid.insertBefore(group.firstChild, group);
    group.remove();
  });
}
