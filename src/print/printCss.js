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
 *   - `@page` は PC / モバイルで size を出し分ける (詳細は buildPrintCss 内コメント)。
 *     モバイルは `size: auto` で OS 印刷シートが選んだ用紙の向きに追従させる
 *     (mm 明示で portrait 固定すると横用紙で「タイトル1P目・スケール2P目」に割れる)。
 *     PC は `size: <mm>` で向きボタンの指定を用紙に効かせる。**どちらの分岐も @page は
 *     単一ブロック**。@page を orientation media query で複数に分けるのは厳禁
 *     (モバイル Safari が複数 @page を処理できず印刷崩壊する → 3f4c03b で実証・revert)。
 *     margin があっても 100vh はページ追従なので干渉しない。
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
  // @page size — PC とモバイルで出し分ける (どちらも必ず「単一」@page) (CRITICAL):
  //
  //   ■ モバイル (isMobile): `size: auto`
  //     モバイルは向きを OS 印刷シートで切り替える運用 (アプリ側の向きUIは隠して縦固定)。
  //     @page を mm 明示 (210mm 297mm=portrait) で固定すると、OS 印刷シートで横用紙を
  //     選んだとき @page(縦) と実用紙(横) が衝突し、横印刷で「タイトルが1P目・スケールが
  //     2P目」に分割される (ユーザー報告。mm 明示では再発)。size:auto なら OS 印刷シートが
  //     選んだ用紙の向きに @page が追従し、100vh も実用紙に追従して1ページに収まる。
  //
  //   ■ PC (!isMobile): `size: <mm>` (orientation 引数で確定)
  //     PC は印刷モーダルの向きボタンで orientation を確定する。mm 明示で用紙の向きを
  //     固定でき、向きボタンが印刷プレビューにそのまま効く (de2f360 で対処済の挙動)。
  //
  //   ※ どちらの分岐も @page は **単一ブロック**。@page を orientation media query で
  //     portrait/landscape 2つ出力するのは厳禁 (モバイル Safari が複数 @page を処理できず
  //     印刷が完全崩壊する → 3f4c03b で実証・revert)。分岐は JS 側の isMobile で行い、
  //     出力される @page は常に1つだけにする。
  const size   = orientation === 'landscape' ? '297mm 210mm' : '210mm 297mm';
  const orient = isMobile
    ? `@media print { @page { size: auto; margin: 10mm 12mm; } }`
    : `@media print { @page { size: ${size}; margin: 10mm 12mm; } }`;

  const isLand = orientation === 'landscape';
  const pageH  = isLand ? 190 : 277; // @page margin 内の印刷可能高さ (mm)
  const gapMm  = 3;
  // iOS AirPrint 物理余白の機種差 + カード余白を吸収する安全マージン。
  // これを引いた高さを「実際に使える高さ」とし、必ず1ページに収めて2P目空白を防ぐ。
  const SAFETY_MM = 16;
  const usableH = pageH - SAFETY_MM;
  // 1 セル(指板1枚)の高さ上限を mm 実寸で決める (vh を使わない — 後述)。
  const cellMm  = Math.max(18, (usableH - gapMm * (rows - 1)) / rows);
  const titlePt = clamp(5.5, 10, cellMm / 9).toFixed(1);
  // svg(タイトル焼き込み済み)の高さ上限。カード枠の padding/border ぶん少し引く。
  const svgMaxMm = Math.max(14, cellMm - 4).toFixed(1);

  const layout = `
@media print {
  /* #savedGrid はラッパーのみ (実際の grid は .print-page-inner 側) */
  #savedGrid {
    display: block !important;
    gap: 0 !important;
  }
  /* ページ枠 — 1グループ = 1ページ。
     ★ height は指定しない (auto)。以前は height:100vh としていたが、スマホ(縦持ち)で
       横用紙を印刷すると iOS Safari が 100vh を「縦持ち viewport の高さ」で解決し、
       横用紙の印刷可能高さを大幅に超えて2P目空白が出た (横だけ壊れる原因)。
       枠を中身ぶんの高さ(auto)にし、中の指板を mm 実寸 (svgMaxMm) で縛ることで、
       viewport と用紙の食い違いに影響されず必ず1ページに収める。 */
  .print-page-group {
    display: block !important;
    overflow: hidden !important;
    break-inside: avoid !important;
    page-break-inside: avoid !important;
  }
  .print-page-group + .print-page-group {
    break-before: page !important;
    page-break-before: always !important;
  }
  /* ページ枠の中を cols×rows の grid に配置。行は auto (中身=mm実寸の指板の高さ)。
     vh/1fr のような「枠の高さ依存」を排除し、用紙との食い違いで膨張しないようにする。 */
  .print-page-inner {
    display: grid !important;
    grid-template-columns: repeat(${cols}, minmax(0, 1fr)) !important;
    grid-template-rows:    repeat(${rows}, auto) !important;
    gap: ${gapMm}mm !important;
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
  .fb-title, .saved-title-input {
    font-size: ${titlePt}pt !important;
    line-height: 1.2;
  }
  /* スケール名は SVG 内の上部へ焼き込む (bakePrintTitle) ので、別要素の
     HTML タイトルは印刷では非表示にする。これでタイトルと指板が必ず1枚の
     画像になり、別ページに割れたり min-content 膨張で崩れたりしない。 */
  .saved-print-title { display: none !important; }
  .fb-wrap, .saved-card .fb-wrap {
    overflow: hidden !important;
    text-align: center !important;
    padding: 1.5mm 1.5mm 1mm !important;
    border: 1px solid #ddd !important;
    border-radius: 2px !important;
    box-shadow: none !important;
    box-sizing: border-box !important;
  }
  /* 指板 SVG (タイトル焼き込み済み): 高さ上限を mm 実寸で指定する。
     vh だと iOS の横印刷で viewport 基準になり用紙からはみ出す (2P目空白の原因)
     ため mm にする。preserveAspectRatio="xMidYMid meet" なので縦長は横が縮みフィット。 */
  svg.fb {
    min-width: 0 !important;
    width: 100% !important;
    height: auto !important;
    max-width: 100% !important;
    max-height: ${svgMaxMm}mm !important;
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
    // モバイル (OS 印刷シートで向き切替) は @page size:auto で用紙向きに追従。
    // 回転で max-width 判定が変わるため毎回評価する。
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
