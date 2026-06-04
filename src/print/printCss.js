/**
 * 印刷用 CSS を動的生成する。
 *
 * 出力2系統:
 *   - <style id="print-orient">  ... @page (用紙サイズ・マージン)
 *   - <style id="print-layout">  ... 登録スケールグリッドのレイアウトと寸法
 *
 * ── 設計の核心 (iOS Safari 縦印刷で安定する実績ある方式 = dedecc4 復元) ──
 *   `.print-page-group` の高さは **`height: 100vh`** とする。
 *   印刷時 `1vh` = 印刷ページ高さの 1% なので `100vh` で正確に1ページ枠になる。
 *   **iOS が @page margin を無視/変更しても、vh は実際の印刷ページに追従する**ため、
 *   「ページぴったり/オーバーフロー」が起きず空白ページが出ない。
 *
 *   過去に mm 固定 height へ変更したところ、iOS の AirPrint 物理余白を CSS 側で
 *   手動補正する必要が生じ、補正値が機種差に追いつかず縦印刷で2P目空白が再発した。
 *   vh はページ追従なので、この補正自体が不要 = mm 固定には戻さない。
 *
 *   その他の要点:
 *   - `@page { size: <mm>; margin: 10mm 12mm }` — 向きは mm 明示。margin があっても
 *     100vh はページ追従なので干渉しない。モバイルの横印刷は OS 印刷シートで縦のまま
 *     運用する案内を印刷モーダルに表示している (CLAUDE.md 参照)。
 *   - 改ページは隣接兄弟 `.print-page-group + .print-page-group` の
 *     `page-break-before: always` のみ (page-break-after は Safari で最終ページ後に
 *     余分な空白ページを作るため不使用)。
 *   - grid 行/列は **`minmax(0, 1fr)`** — `1fr` (=minmax(auto,1fr)) は子の min-content で
 *     行が膨張して2P目空白になる Safari バグの典型原因。子は overflow:hidden で切る。
 *   - マスクで縦長になった指板は `svg.fb` の `max-height: <セル高さ相当>vh` で枠内に収める
 *     (preserveAspectRatio="xMidYMid meet" で縦長は横が縮みフィット)。
 *
 *  画面用 `#savedGrid.screen-grid` ルールが詳細度 (1,1,0) で当たるため、印刷用の
 *  grid-template-columns / gap / fb-wrap padding は `!important` で確実に勝たせる。
 */

const clamp = (lo, hi, v) => Math.max(lo, Math.min(hi, v));

/**
 * @param {{orientation:'landscape'|'portrait', cols:number, rows:number, isMobile?:boolean}} layout
 * @returns {{orient:string, layout:string}} 各 <style> に流し込む CSS 文字列
 */
export function buildPrintCss({ orientation, cols, rows, isMobile = false }) {
  // @page の向き指定 — PC とモバイルで出し分ける (CRITICAL):
  //   - モバイル: 向きを OS 印刷シートで切り替えるため、orientation media query で
  //     portrait/landscape 両方の @page を出力し実用紙の向きに追従させる。これを
  //     しないと横印刷でタイトルとスケールが別ページに分割される。
  //   - PC: orientation は印刷モーダルの向きボタンで確定 (引数で渡る)。単一ブロックで
  //     出力する。PC の viewport は横長 (例 1280×800) が多く、orientation media query
  //     を使うと viewport 基準で landscape と誤評価され、portrait 印刷なのに @page
  //     landscape(横) が当たって用紙からはみ出す (de2f360 で対処した食い違い)。
  const size = orientation === 'landscape' ? '297mm 210mm' : '210mm 297mm';
  const orient = isMobile
    ? `
@media print and (orientation: portrait)  { @page { size: 210mm 297mm; margin: 10mm 12mm; } }
@media print and (orientation: landscape) { @page { size: 297mm 210mm; margin: 10mm 12mm; } }`
    : `@media print { @page { size: ${size}; margin: 10mm 12mm; } }`;

  const isLand = orientation === 'landscape';
  const pageH  = isLand ? 190 : 277; // @page margin 内の印刷可能高さ (mm) — フォント計算用
  const gapMm  = 3;
  // フォントサイズ計算用の 1 セルあたり目安高さ (mm)。レイアウト自体は grid 1fr 均等分割。
  const cellH  = (pageH - gapMm * (rows - 1)) / rows;
  const titlePt = clamp(5.5, 10, cellH / 9).toFixed(1);
  // マスク縦長指板を1セルに収めるための max-height。100vh をセル数で割った相対値。
  // タイトル/border 分の余裕として 88/rows (vh) を上限にする (横用紙でタイトルと指板が別ページに割れないように 92→88)。
  const svgMaxVh = (88 / rows).toFixed(2);

  const layout = `
@media print {
  /* #savedGrid はラッパーのみ (実際の grid は .print-page-inner 側) */
  #savedGrid {
    display: block !important;
    gap: 0 !important;
  }
  /* ページ枠 — 1グループ = 1ページ。height:100vh が印刷ページに追従する。 */
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
  /* ページ枠の中を cols×rows の grid で均等分割。minmax(0,1fr) で Safari の
     min-content 膨張 (2P目空白の典型原因) を防ぐ。 */
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
  .fb-title, .saved-title-input, .saved-print-title {
    font-size: ${titlePt}pt !important;
    line-height: 1.2;
  }
  .fb-wrap, .saved-card .fb-wrap {
    overflow: hidden !important;
    text-align: center !important;
    padding: 1.5mm 1.5mm 1mm !important;
    border: 1px solid #ddd !important;
    border-radius: 2px !important;
    box-shadow: none !important;
    box-sizing: border-box !important;
  }
  /* 指板 SVG: マスクで縦長になっても max-height(vh) で1セルに収める。
     preserveAspectRatio="xMidYMid meet" なので縦長は横が縮みフィット。 */
  svg.fb {
    min-width: 0 !important;
    width: 100% !important;
    height: auto !important;
    max-width: 100% !important;
    max-height: ${svgMaxVh}vh !important;
    display: block !important;
    margin: 0 auto !important;
  }
  /* 印刷に紛れ込むと .print-page-group の下に余分な高さを作り2P目空白を誘発する
     画面要素を強制非表示 (再発防止の保険)。 */
  .saved-warn-restore { display: none !important; }
  #savedEmpty { display: none !important; }
}`;

  return { orient, layout };
}

export function initPrintCss(store) {
  const orientEl = document.getElementById('print-orient');
  const layoutEl = document.getElementById('print-layout');

  function update() {
    // モバイル (OS 印刷シートで向き切替) は @page を orientation media query で
    // 両方出力。回転で変わるため毎回判定する。
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
