/**
 * 印刷用 CSS を動的生成する。
 *
 * 出力2系統:
 *   - <style id="print-orient">  ... @page (用紙サイズ・マージン)
 *   - <style id="print-layout">  ... 登録スケールグリッドのレイアウトと寸法
 *
 * 設計上の最重要ポイント (iOS Safari 横印刷の2P目空白バグの根本対策):
 *   ─ vh は使わない ─
 *     iOS Safari は @media print で vh を「印刷ページ高さ」ではなく
 *     「ビューポート高さ」基準で解決することがある。@page size:auto +
 *     margin:0 でも完全には統一されておらず、特に横用紙(210mm 高)で
 *     vh が 297mm 相当を返してしまい、グループが用紙からはみ出して
 *     2ページ目が空白になる。
 *   ─ orientation を CSS media query で出し分け ─
 *     .print-page-group の height や svg.fb の max-height など
 *     向き依存の寸法は `@media print and (orientation: landscape|portrait)`
 *     ブロックに mm 単位で定義する。
 *     - 向き media query は iOS Safari でも実用紙の向きに正しく反応する
 *     - mm 単位は vh と違いビューポート由来の不定性がない
 *     これにより、ユーザーが OS 印刷シートで縦/横を切り替えても、
 *     実紙の向きに合った寸法が必ず適用される。
 *   ─ orientation 引数の扱い ─
 *     buildPrintCss({orientation, ...}) の orientation は PC の
 *     `@page size` (PC は印刷モーダルの向きボタンに従う) にのみ使う。
 *     `.print-page-group` の height などレイアウト系の寸法は
 *     orientation 引数に関わらず両方の orientation 用ブロックを出力する
 *     (モバイルでは OS シートで向きが切り替わるため、CSS 側はどちらでも
 *     動くようにしておく必要がある)。
 *   ─ 1px 安全マージン ─
 *     `height: calc(297mm - 1px)` のように 1px 引いてある。
 *     ブラウザのサブピクセル丸めで「ちょうど用紙高」が次ページに溢れる
 *     エッジケース (Chrome / Safari いずれも観測例あり) を防ぐ。
 *   ─ grid 行/列は minmax(0, 1fr) ─
 *     `1fr` は実際には `minmax(auto, 1fr)` として解決され、子要素の
 *     min-content が大きいと grid 行が広がってページ枠を突破する
 *     (Safari に顕著)。`minmax(0, 1fr)` で強制的に均等分割し、子要素は
 *     overflow:hidden で切る。
 *
 *  画面用の `#savedGrid.screen-grid` ルールが詳細度 (1,1,0) で当たるため、
 *  印刷用ルールの grid-template-columns / gap / fb-wrap の padding は
 *  `!important` を付けて確実に勝たせる。
 */

const clamp = (lo, hi, v) => Math.max(lo, Math.min(hi, v));

/**
 * 1向き分の派生寸法を計算する。
 * @param {boolean} isLand
 * @param {number}  rows
 * @returns {{pageHmm:number, cellHmm:number, titlePt:string, svgMaxMm:string}}
 */
function deriveOrientationDims(isLand, rows) {
  // ページ枠の padding 8mm/上下 + gap 3mm で内側を rows 等分する
  const pageHmm = isLand ? 210 : 297;
  const padV    = 8;
  const gapMm   = 3;
  const cellHmm = (pageHmm - 2 * padV - gapMm * (rows - 1)) / rows;
  // タイトル + fb-wrap border/padding 等のヘッダ系で約 7mm 確保
  const reserveMm = 7;
  const svgMaxMm  = Math.max(10, cellHmm - reserveMm).toFixed(1);
  const titlePt   = clamp(5.5, 10, cellHmm / 9).toFixed(1);
  return { pageHmm, cellHmm, titlePt, svgMaxMm };
}

/**
 * @param {{orientation:'landscape'|'portrait', cols:number, rows:number, isMobile?:boolean}} layout
 * @returns {{orient:string, layout:string}} 各 <style> に流し込む CSS 文字列
 */
export function buildPrintCss({ orientation, cols, rows, isMobile = false }) {
  // @page の用紙サイズ:
  //   - PC: 印刷モーダルの向きボタンを尊重するため明示 mm 指定
  //   - モバイル: OS 印刷シートで向きを切替できるため size:auto
  // margin:0 にして用紙端の余白は .print-page-group の padding で確保する
  // (これにより 100vh 系の vh-vs-page 不整合と完全に決別できる)
  const sizeMm = orientation === 'landscape' ? '297mm 210mm' : '210mm 297mm';
  const orient = isMobile
    ? `@media print { @page { size: auto; margin: 0; } }`
    : `@media print { @page { size: ${sizeMm}; margin: 0; } }`;

  // 向き別寸法:
  //   - PC: orientation 引数で確定 (印刷モーダルで決まる)。@media (orientation:...) を
  //     使わず単一ブロックで出力する。viewport アスペクトと @page 用紙向きが食い違う
  //     ケース (例: 横長ノートPCで portrait 印刷) で orientation media query が
  //     viewport 基準で評価され「縦 297mm 用紙に landscape ルール (グループ高 210mm)」が
  //     当たって下 87mm が空白になるバグを防ぐ。
  //   - モバイル: @page size:auto + OS シートで向き切替できるため両方の orientation
  //     media query ブロックを出力する。モバイルの場合 viewport 自身も用紙の向きと
  //     同じになる (横向きにして印刷シート開く=横用紙) ため media query で一致する。
  const land = deriveOrientationDims(true,  rows);
  const port = deriveOrientationDims(false, rows);
  const gapMm = 3;

  const layout = `
@media print {
  /* #savedGrid はラッパーのみ (実際の grid は .print-page-inner 側) */
  #savedGrid {
    display: block !important;
    gap: 0 !important;
  }
  /* ページ枠 — 1グループ = 1ページ。
     - display:block + overflow:hidden + break-inside:avoid: グループ内で分割しない
     - padding は中身 (グリッド) との余白として box-sizing:border-box で確保
     - height は下の @media (orientation) で mm 指定 (iOS Safari vh 不定性対策)
     改ページは隣接兄弟 page-break-before のみ
     (page-break-after は Safari で最終ページ後に余分な空白を作るため不使用)。 */
  .print-page-group {
    display: block !important;
    box-sizing: border-box !important;
    padding: 8mm 10mm !important;
    overflow: hidden !important;
    break-inside: avoid !important;
    page-break-inside: avoid !important;
  }
  .print-page-group + .print-page-group {
    break-before: page !important;
    page-break-before: always !important;
  }
  /* ページ枠の中を cols×rows の grid で均等分割。
     minmax(0, 1fr) で子要素の min-content に押されて行が伸びるのを防ぐ
     (Safari の grid + print pagination で顕著な「ちょうどページ高に
     収まらず2P目空白」の典型原因)。 */
  .print-page-inner {
    display: grid !important;
    grid-template-columns: repeat(${cols}, minmax(0, 1fr)) !important;
    grid-template-rows:    repeat(${rows}, minmax(0, 1fr)) !important;
    gap: ${gapMm}mm !important;
    height: 100% !important;
    width: 100% !important;
    box-sizing: border-box !important;
  }
  .saved-card {
    overflow: hidden !important;
    min-width: 0 !important;
    min-height: 0 !important;
    break-inside: avoid;
    margin: 0 !important;
    padding: 0;
  }
  .fb-header, .saved-card-header { margin-bottom: 1mm; }
  .fb-wrap, .saved-card .fb-wrap {
    overflow: hidden !important;
    text-align: center !important;
    padding: 1.5mm 1.5mm 1mm !important;
    border: 1px solid #ddd !important;
    border-radius: 2px !important;
    box-shadow: none !important;
    box-sizing: border-box !important;
  }
  /* SVG: max-height は下の @media (orientation) で mm 指定。
     基本指定 (width/height/display) はここに。 */
  svg.fb {
    min-width: 0 !important;
    width: 100% !important;
    height: auto !important;
    max-width: 100% !important;
    display: block !important;
    margin: 0 auto !important;
  }
  /* 印刷時に紛れ込みやすい要素を強制非表示 (再発防止の保険)。
     画面要素のうち、印刷で出てしまうと .print-page-group の下に余分な
     高さを持つ要素として 2P 目空白を誘発する。
       - .saved-warn-restore: 削除警告を dismiss した状態で表示される
       - #savedEmpty:         登録ゼロ件時のプレースホルダ */
  .saved-warn-restore { display: none !important; }
  #savedEmpty { display: none !important; }
}

${isMobile ? `
/* ── モバイル: OS 印刷シートで向き切替できるため orientation 別ブロック ──
   horizontal: height calc(...-1px) は丸めで次ページに溢れるエッジケース防止。 */
@media print and (orientation: landscape) {
  .print-page-group { height: calc(${land.pageHmm}mm - 1px) !important; }
  .fb-title, .saved-title-input, .saved-print-title {
    font-size: ${land.titlePt}pt !important;
    line-height: 1.2;
  }
  svg.fb { max-height: ${land.svgMaxMm}mm !important; }
}
@media print and (orientation: portrait) {
  .print-page-group { height: calc(${port.pageHmm}mm - 1px) !important; }
  .fb-title, .saved-title-input, .saved-print-title {
    font-size: ${port.titlePt}pt !important;
    line-height: 1.2;
  }
  svg.fb { max-height: ${port.svgMaxMm}mm !important; }
}` : `
/* ── PC: orientation 引数で固定 (印刷モーダルで決まる)。
   @media (orientation:...) は使わず単一ブロックで出力。
   viewport-vs-@page の orientation 食い違いで誤ったブロックが当たり、
   グループが用紙より低くなって下端が空白になる問題を防ぐ。 */
@media print {
  .print-page-group { height: calc(${(orientation === 'landscape' ? land : port).pageHmm}mm - 1px) !important; }
  .fb-title, .saved-title-input, .saved-print-title {
    font-size: ${(orientation === 'landscape' ? land : port).titlePt}pt !important;
    line-height: 1.2;
  }
  svg.fb { max-height: ${(orientation === 'landscape' ? land : port).svgMaxMm}mm !important; }
}`}`;

  return { orient, layout };
}

export function initPrintCss(store) {
  const orientEl = document.getElementById('print-orient');
  const layoutEl = document.getElementById('print-layout');

  function update() {
    const isMobile = typeof window !== 'undefined'
      && window.matchMedia('(max-width: 767px)').matches;
    const css = buildPrintCss({ ...store.get().layout, isMobile });
    orientEl.textContent = css.orient;
    layoutEl.textContent = css.layout;
  }

  update();
  store.subscribe((s, p) => {
    if (p && s.layout === p.layout) return;
    update();
  });
}
