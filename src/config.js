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

/** カード下に表示するテキストタイトルのフォントサイズ（CSS値、例: '15px'） */
export const CARD_TITLE_CSS_SIZE = '15px';

/** モバイル時のカードタイトルフォントサイズ（CSS値） */
export const CARD_TITLE_CSS_SIZE_MOBILE = '17px';

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
