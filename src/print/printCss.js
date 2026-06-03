/**
 * 印刷用 CSS を動的生成する。
 *
 * - 用紙の向き (`<style id="print-orient">`)
 * - 登録スケールグリッドのレイアウトとセルごとのフォントサイズ
 *   (`<style id="print-layout">`)
 *
 * 画面用の `#savedGrid.screen-grid` ルールが詳細度 (1,1,0) で当たるため、
 * 印刷用ルールの grid-template-columns / gap / fb-wrap の padding は
 * `!important` を付けて確実に勝たせる。
 */

const clamp = (lo, hi, v) => Math.max(lo, Math.min(hi, v));

/**
 * @param {{orientation:'landscape'|'portrait', cols:number, rows:number}} layout
 * @returns {{orient:string, layout:string}} 各 <style> に流し込む CSS 文字列
 */
export function buildPrintCss({ orientation, cols, rows }) {
  // `size: A4 landscape` 表記はモバイル Safari / Android Chrome で respect されにくい。
  // 明示的な mm 寸法 (210×297 / 297×210) で書くほうがブラウザ実装の幅広い差を吸収できる。
  // ただし最終的な向きは OS の印刷ダイアログ側でも上書き可能なので、モバイルでは
  // ユーザーに「OS ダイアログでも向きを揃える」よう案内している (印刷モーダル内)。
  const size   = orientation === 'landscape' ? '297mm 210mm' : '210mm 297mm';
  const orient = `@media print { @page { size: ${size}; margin: 10mm 12mm; } }`;

  const isLand = orientation === 'landscape';
  const pageH  = isLand ? 190 : 277;
  const gapMm  = 3;
  // フォントサイズ計算用の 1 セルあたりの目安高さ (mm)。
  // レイアウト自体は .print-page-inner の grid 1fr 均等分割で行うため、
  // この値はフォントサイズの算出だけに使う。
  const cellH  = (pageH - gapMm * (rows - 1)) / rows;

  const titlePt = clamp(5.5, 10, cellH / 9).toFixed(1);

  const layout = `
@media print {
  /* #savedGrid はラッパーのみ */
  #savedGrid {
    display: block !important;
    gap: 0 !important;
  }
  /* ── ページ枠アプローチ (iOS Safari 空白ページ対策の決定版) ──
     各 .print-page-group を「1ページ分の枠」にする:
       - height: 100vh → 印刷時 1vh = 印刷ページ高さの 1%。100vh で正確に1ページ。
         iOS が @page margin を無視して余白を変えても、vh はページに追従するため
         「ページぴったり/オーバーフロー」が起きず空白ページが出ない。
       - overflow: hidden → 万一はみ出ても切る (溢れて次ページに行かない)
       - break-inside: avoid → 枠の内部で改ページしない
     改ページは隣接兄弟の page-break-before のみ (page-break-after は Safari で
     最終ページ後に余分な空白ページを作るため使わない)。 */
  .print-page-group {
    display: block !important;
    height: 100vh !important;
    overflow: hidden !important;
    break-inside: avoid !important;
    page-break-inside: avoid !important;
  }
  .print-page-group + .print-page-group {
    break-before: page !important;
    page-break-before: always !important;
  }
  /* ページ枠の中を cols×rows の grid で均等分割し、各セルにカードを入れる。
     grid-template-rows: 1fr で枠 (100vh) を行数で等分するため、mm 固定や
     ページぴったりの行高を使わずに済む (iOS の空白ページバグを回避)。 */
  .print-page-inner {
    display: grid !important;
    grid-template-columns: repeat(${cols}, 1fr) !important;
    grid-template-rows: repeat(${rows}, 1fr) !important;
    gap: ${gapMm}mm !important;
    height: 100% !important;
    box-sizing: border-box !important;
  }
  .saved-card {
    overflow: hidden !important;
    min-height: 0 !important;
    min-width: 0 !important;
  }
  .saved-card { break-inside: avoid; margin: 0 !important; padding: 0; }
  .fb-header, .saved-card-header { margin-bottom: 1mm; }
  .fb-title, .saved-title-input {
    font-size: ${titlePt}pt !important;
    line-height: 1.2;
  }
  .fb-wrap, .saved-card .fb-wrap {
    padding: 1.5mm 1.5mm 1mm !important;
    overflow: visible;
    border: 1px solid #ddd !important;
    border-radius: 2px !important;
    box-shadow: none !important;
  }
  svg.fb { min-width: 0 !important; width: 100% !important; height: auto !important; display: block !important; }
  /* .legend は main.css の @media print で display:none !important のため
     印刷では非表示。ここで凡例のサイズ指定はしない (dead code を避ける)。 */
}`;

  return { orient, layout };
}

export function initPrintCss(store) {
  const orientEl = document.getElementById('print-orient');
  const layoutEl = document.getElementById('print-layout');

  function update() {
    const css = buildPrintCss(store.get().layout);
    orientEl.textContent = css.orient;
    layoutEl.textContent = css.layout;
  }

  update();
  store.subscribe((s, p) => {
    if (p && s.layout === p.layout) return;
    update();
  });
}
