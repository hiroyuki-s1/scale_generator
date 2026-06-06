/**
 * 表示設定ファイル — 開発者が変更しやすいよう数値・サイズを一か所にまとめています。
 *
 * 変更後は `npm run dev` で即時反映されます。
 */

// ─────────────────────────────────────────────
// 登録スケール カード — タイトル表示
// ─────────────────────────────────────────────

/** SVGオーバーレイタイトルの文字サイズ — PC（SVG座標単位） */
export const CARD_TITLE_SVG_FONT_SIZE_PC = 68;

/** SVGオーバーレイタイトルの文字サイズ — モバイル（SVG座標単位） */
export const CARD_TITLE_SVG_FONT_SIZE_MOBILE = 120;

/** SVGオーバーレイタイトルの文字間隔 */
export const CARD_TITLE_SVG_LETTER_SPACING = 5;

/** SVGオーバーレイ背景帯の高さ（SVG座標単位） */
export const CARD_TITLE_BG_HEIGHT = 92;

// ─────────────────────────────────────────────
// 印刷タイトル — SVG に焼き込むスケール名 (印刷専用・ユーザー調整ポイント)
// ─────────────────────────────────────────────

/**
 * 印刷時に SVG 上部に焼き込むスケール名の文字サイズ (SVG ユーザー座標)。
 * 大きすぎる/小さすぎる場合はこの値を調整する。
 * フレット番号 (font-size: 24) との比較で大きさ感をイメージ。推奨 18〜32。
 */
export const PRINT_TITLE_FONT_SIZE = 22;

/**
 * 印刷タイトルの揃え方: 'left' | 'center' | 'right'。
 */
export const PRINT_TITLE_ALIGN = 'left';

/**
 * タイトル帯の高さ比率 (指板 viewBox 高さに対する割合・SVG 内で帯ぶん上に拡張)。
 * 文字を小さくしたら帯も狭くする。推奨 0.12〜0.30。
 */
export const PRINT_TITLE_BAND_RATIO = 0.18;

// カード下に表示するテキストタイトルの CSS フォントサイズは、JS からは使わず
// CSS 変数で管理している（src/styles/main.css の :root）:
//   --card-title-size         (通常時)
//   --card-title-size-mobile  (@media max-width:767px)

// ─────────────────────────────────────────────
// モバイル エディター 指板ズーム
// ─────────────────────────────────────────────

/**
 * モバイル（≤MOBILE_ZOOM_BREAKPOINT px）のエディター指板の表示幅（px）。
 * この幅でSVGを固定し、.fb-wrap 内を横スクロールできるようにする。
 * 小さいほど一画面に収まり、大きいほど各フレットが見やすくなる。
 * 推奨: 800〜1200
 */
export const MOBILE_EDITOR_FRETBOARD_WIDTH = 1100;

/**
 * モバイル判定の画面幅上限（px）。この値以下でスクロール表示が有効になる。
 */
export const MOBILE_ZOOM_BREAKPOINT = 767;

// ─────────────────────────────────────────────
// 度数表記ラベル (12半音、インデックス順)
// ─────────────────────────────────────────────

/**
 * 指板ドット・タイトル・ピッカーなど全箇所で使われる度数ラベル。
 * ここを変えるだけでアプリ全体の表記が変わる。
 *
 * インデックス = ルートからの半音数 (0–11)
 */
export const DEGREE_NAMES = [
  'R',    //  0 semitones — 1度  (Root)
  'b9',   //  1 semitones — ♭2度
  '9',    //  2 semitones — 2度
  'm3',   //  3 semitones — ♭3度
  'M3',   //  4 semitones — 3度
  '11',   //  5 semitones — 4度
  '#11',  //  6 semitones — ♯4度
  '5',    //  7 semitones — 5度
  'b13',  //  8 semitones — ♭6度
  '13',   //  9 semitones — 6度
  'm7',   // 10 semitones — ♭7度
  'M7',   // 11 semitones — 7度
];

// ─────────────────────────────────────────────
// 指板ドット — 度数ラベルのフォントサイズ (SVG座標単位)
// ─────────────────────────────────────────────

/** 1文字の度数ラベル (R, 9 など) */
export const DOT_FONT_SIZE_1 = 21;

/** 2文字の度数ラベル (m3, M7, 13 など) */
export const DOT_FONT_SIZE_2 = 16;

/** 3文字以上の度数ラベル (b13, #11 など) */
export const DOT_FONT_SIZE_3 = 12;

// ─────────────────────────────────────────────
// 画像 (PNG) 出力
// ─────────────────────────────────────────────

/**
 * SVG→PNG ラスタライズの解像度スケール係数。論理サイズ × この値の canvas に描く。
 * 大きいほど高精細だが canvas 上限・メモリに注意（3 で実用十分）。
 * docs/features/IMAGE_EXPORT.md §3.1。
 */
export const IMAGE_EXPORT_SCALE = 3;
