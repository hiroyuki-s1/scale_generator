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
  // ── 安全マージン (CRITICAL) ──
  // ページグループの総高さがページ可能高さと「ぴったり一致」すると、
  // ブラウザの印刷はサブピクセルの丸めで「わずかに超過」と誤判定し、
  // グループを次ページへ押し出して空白ページを生む (特に iOS Safari)。
  // グループ高さ = cellH×rows + gap×(rows-1) を pageH より SAFETY_MM 分
  // 確実に小さくして、空白ページを防ぐ。
  // iOS Safari は @page margin 指定を無視してシステムのデフォルト余白
  // (各辺 ~12mm) を使うことがあり、その分だけ印刷可能高さが縮む。
  // グループ高さがそれを超えると次ページへ溢れて空白ページが出るため、
  // 12mm の余裕を持たせて余白が大きめでも収まるようにする。
  const SAFETY_MM = 12;
  const cellH  = (pageH - SAFETY_MM - gapMm * (rows - 1)) / rows;

  const titlePt = clamp(5.5, 10, cellH / 9).toFixed(1);
  const legPt   = clamp(5,   8,  cellH / 11).toFixed(1);
  const legDot  = clamp(9,   16, cellH / 7).toFixed(0);

  const cellHmm = cellH.toFixed(1);
  // グループの固定高さ = カード高さ×行数 + 行間gap。pageH より SAFETY_MM 小さい。
  const groupHmm = (cellH * rows + gapMm * (rows - 1)).toFixed(1);

  const layout = `
@media print {
  /* #savedGrid はラッパーのみ */
  #savedGrid {
    display: block !important;
    gap: 0 !important;
  }
  /* .print-page-group = block div。1ページ1グループを厳密に保証する:
       - height 固定 + overflow:hidden → グループは絶対にページ高さを超えない
         (iOS は @page margin を無視して余白を大きく取ることがあり、高さが
          少しでもページを超えると次ページに溢れて空白ページが出る。固定高さで防ぐ)
       - break-inside:avoid → グループ内部での改ページを禁止 (分割させない)
       - page-break-after:always → グループの後で改ページ
     block への page-break は iOS Safari 含む全ブラウザで動作する。 */
  .print-page-group {
    display: block !important;
    height: ${groupHmm}mm !important;
    overflow: hidden !important;
    break-inside: avoid !important;
    page-break-inside: avoid !important;
  }
  /* 改ページは「2番目以降のグループの前」で行う (隣接兄弟セレクタ)。
     page-break-after:always は Safari で最終ページの後に余分な空白ページを
     作る既知バグがあるため使わない。page-break-before なら最後のグループの
     後ろに改ページが入らず、空白ページが出ない。 */
  .print-page-group + .print-page-group {
    break-before: page !important;
    page-break-before: always !important;
  }
  /* 最終グループは高さ自由 (端数ページが固定高さで余白を作らないように) */
  .print-page-group:last-child {
    height: auto !important;
  }
  /* .print-page-inner = 実際のグリッドレイアウト
     grid-template-rows は指定しない:
     ページ高さぴったりの行高 + page-break-after:always の組み合わせが
     iOS Safari で空白ページを生成するバグの原因のため。
     代わりに .saved-card に高さを指定してレイアウトを制御する。 */
  .print-page-inner {
    display: grid !important;
    grid-template-columns: repeat(${cols}, 1fr) !important;
    gap: ${gapMm}mm !important;
  }
  .saved-card {
    height: ${cellHmm}mm !important;
    overflow: hidden !important;
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
  .legend { margin-top: 1mm; gap: 3px; }
  .legend-chip { font-size: ${legPt}pt !important; padding: 1px 5px 1px 3px !important; }
  .legend-dot  { width: ${legDot}px !important; height: ${legDot}px !important; font-size: 5px !important; }
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
