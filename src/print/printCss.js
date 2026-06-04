/**
 * 印刷用 CSS を動的生成する。
 *
 * 出力2系統:
 *   - <style id="print-orient">  ... @page (用紙サイズ・マージン)
 *   - <style id="print-layout">  ... 登録スケールグリッドのレイアウトと寸法
 *
 * ── 設計の核心 (高さに vh も用紙ぴったりの mm も使わない) ──
 *   印刷の高さ指定は試行錯誤の末、次の3つ全てを避ける結論に至った:
 *     ❌ `.print-page-group { height: 100vh }` …iOS Safari は印刷時 vh を「画面の
 *        viewport 高さ」で解決することがあり、スマホ(縦持ち)で横用紙を印刷すると
 *        100vh が縦持ち viewport 高さ(大)になり横用紙を超えて2P目空白が出る。
 *     ❌ `height: <用紙ぴったりの mm>` …iOS は @page margin の上に端末物理余白を
 *        さらに確保するため、幾何学的な印刷可能高さぴったりだと枠が用紙を超えて空白。
 *     ❌ `height: auto` (高さ無し) …空白は出ないがカードが上詰めになり、ページを
 *        均等分割して各セルに1枚ずつ配置できない。
 *   → **結論**: `.print-page-inner` に **用紙高から大きめ(50mm)予約した控えめ mm 高さ**
 *      (usableH) を与え、それを grid **`minmax(0,1fr)`** で cols×rows 均等分割する。
 *      ・控えめ mm なのでどの向き/機種でも用紙を超えない (2P目空白を出さない)
 *      ・1fr 均等分割なので各セルに1枚ずつ均等配置される (上詰めにならない)
 *      ・vh を使わないので iOS の vh-in-print 問題に影響されない
 *      `.print-page-group` 自体は height 無し(auto) で inner を包むだけ。
 *      ※ usableH の予約量(現50mm)は iOS 実機の印刷可能高さに依存する調整値。
 *        2P空白が出るなら予約を増やす / 余白が多すぎるなら減らす。**実機確認が必要**。
 *
 *   その他の要点:
 *   - `@page` は PC / モバイルで size を出し分ける (詳細は buildPrintCss 内コメント)。
 *     モバイルは `size: auto` で OS 印刷シートが選んだ用紙の向きに追従させる
 *     (mm 明示で portrait 固定すると横用紙で「タイトル1P目・スケール2P目」に割れる)。
 *     PC は `size: <mm>` で向きボタンの指定を用紙に効かせる。**どちらの分岐も @page は
 *     単一ブロック**。@page を orientation media query で複数に分けるのは厳禁
 *     (モバイル Safari が複数 @page を処理できず印刷崩壊する → 3f4c03b で実証・revert)。
 *   - 改ページは隣接兄弟 `.print-page-group + .print-page-group` の
 *     `page-break-before: always` のみ (page-break-after は Safari で最終ページ後に
 *     余分な空白ページを作るため不使用)。
 *   - grid 行/列は **`minmax(0, 1fr)`** — 素の `1fr` (=minmax(auto,1fr)) は子の
 *     min-content で行が膨張して2P目空白になる Safari バグの典型原因。子は overflow:hidden。
 *   - マスクで縦長になった指板は `svg.fb` の `max-height: <mm>` で枠内に収める
 *     (preserveAspectRatio="xMidYMid meet" で縦長は横が縮みフィット)。
 *
 *  画面用 `#savedGrid.screen-grid` ルールが詳細度 (1,1,0) で当たるため、印刷用の
 *  grid-template-columns / gap / fb-wrap padding は `!important` で確実に勝たせる。
 */

// ═══════════════════════════════════════════════════════════════════════════
//  ★★★ 印刷の調整パラメータ (ここだけ触ればOK) ★★★
//
//  印刷1ページの「実際に使える高さ」を、用紙高から何 mm 引くかの予約量。
//  この値を引いた高さを1ページ枠とし、grid で cols×rows 均等分割して各セルに
//  スケールを1枚ずつ置く。
//
//  iOS は印刷時に用紙の上下へ「見えない余白」を確保するため、用紙の幾何学サイズの
//  ままだと枠が用紙を超え、2P目に空白やはみ出しが出る。それを吸収する予約量。
//
//   ・2P目に空白が出る / 下端がはみ出す → 数値を【大きく】する (枠が短くなる)
//   ・下に余白が空きすぎる              → 数値を【小さく】する (枠が長くなる)
//
//  縦・横で別々に調整できる。用紙高: 縦(A4 portrait)=297mm / 横(A4 landscape)=210mm。
//  実際の1ページ枠の高さ = 用紙高 − 下の予約値。
//    例) 縦: 297 − 64 = 233mm が1ページ枠   /   横: 210 − 64 = 146mm が1ページ枠
const PRINT_RESERVE_MM = {
  portrait:  164,   // ← 縦印刷の予約量(mm)。縦で空白が出るなら増やす
  landscape: 164,   // ← 横印刷の予約量(mm)。横ではみ出すなら増やす
};
// ═══════════════════════════════════════════════════════════════════════════

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
  const gapMm  = 3;
  // ── グリッド高さの算出 (2P目空白を出さないための核心) ────────────────────
  // 用紙の高さ (A4: landscape=短辺210mm / portrait=長辺297mm)。
  const sheetH = isLand ? 210 : 297;
  // iOS は `@page margin` に加えて端末側の物理余白をさらに確保するため、幾何学的な
  // 印刷可能高さ (sheet − @page margin) より「実際に使える高さ」はかなり小さい。
  // 控えめすぎる予約 (以前は @page margin 20mm + 16mm=計36mm) では横印刷で枠が用紙を
  // 超え2P目空白が再発した。→ 用紙高から **50mm** を予約 (@page上下20mm + iOS物理余白の
  // 機種差ぶんを多めに) し、どの向き/機種でも用紙を超えないようにする。
  // 予約量はファイル上部の PRINT_RESERVE_MM (縦/横で別々) を参照。調整はそこだけ。
  const RESERVE_MM = isLand ? PRINT_RESERVE_MM.landscape : PRINT_RESERVE_MM.portrait;
  const usableH = sheetH - RESERVE_MM; // 例: landscape 210-64=146mm / portrait 297-64=233mm
  // 1 セル(指板1枚)の高さ。usableH を行数で均等分割した値。
  const cellMm  = Math.max(18, (usableH - gapMm * (rows - 1)) / rows);
  const titlePt = clamp(5.5, 10, cellMm / 9).toFixed(1);
  // svg(タイトル焼き込み済み)の高さ上限。セルの padding/border ぶん少し引く。
  const svgMaxMm = Math.max(14, cellMm - 4).toFixed(1);

  const layout = `
@media print {
  /* #savedGrid はラッパーのみ (実際の grid は .print-page-inner 側) */
  #savedGrid {
    display: block !important;
    gap: 0 !important;
  }
  /* ページ枠 — 1グループ = 1ページ。枠自体に height は与えない (auto)。
     高さは内側 .print-page-inner が mm 実寸で持つ (下記)。 */
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
  /* ★ レイアウトの核心 (空白バグと上詰めの両方を解決):
     高さを **用紙高から 50mm 予約した控えめ mm 実寸 (usableH)** で持ち、それを cols×rows
     の grid で **均等分割 (minmax(0,1fr))** する。各セルに1枚ずつ・ページに均等配置され
     (上詰めにならない)、かつ控えめ高さなので用紙を超えず2P空白も出ない。
     - vh は使わない: iOS 横印刷で viewport(縦持ち)基準になり用紙を超え2P空白が出る。
     - 「控えめ(用紙高 − 50mm)」: iOS は @page margin の上に端末物理余白を足すため、
       幾何学的な印刷可能高さより小さくしないと枠が用紙を超える。50mm 予約で吸収。
     - 行は minmax(0,1fr): 素の 1fr だと Safari の min-content 膨張で行が伸び2P空白。 */
  .print-page-inner {
    display: grid !important;
    grid-template-columns: repeat(${cols}, minmax(0, 1fr)) !important;
    grid-template-rows:    repeat(${rows}, minmax(0, 1fr)) !important;
    gap: ${gapMm}mm !important;
    height: ${usableH}mm !important;
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
