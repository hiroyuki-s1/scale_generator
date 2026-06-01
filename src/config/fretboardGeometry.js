/**
 * 指板SVGジオメトリ設定 — 開発者用ノブ (ユーザー設定ではない)
 *
 * このファイル下部の SVG オブジェクトは下記「ノブ」から自動計算される。
 * 「フレット間隔を広げたい/縮めたい」「指板を縦に厚くしたい」等の調整は、
 * このファイルの上部ノブ群だけを書き換えれば、影響箇所すべてが自動追従する。
 *
 * 自動追従する箇所:
 *   - ナット位置 (= ML + FW)
 *   - フレット線の x 座標   (ML + (f - F0) × FW)
 *   - インレイマーカー位置   (fx(f))
 *   - ポジション番号テキスト (fx(f))
 *   - 弦の左右端
 *   - 度数ドットの cx
 *   - マスクオーバーレイ矩形
 *   - SVG viewBox の幅
 *   - 保存済みカードの viewBox / クリップ / タイトル背景の中心
 *
 * 単位はすべて SVG ユーザー座標 (px相当)。実画面サイズは CSS の width:100%
 * と viewBox によりブラウザが自動スケール。
 *
 * 注意:
 *   - フォントサイズ (度数ドット文字 / 弦ラベル / ポジション番号) は固定値で
 *     スケールしない。FRET_WIDTH を大きく変えた場合は fretboardSvg.js 側の
 *     font-size リテラルも見直すこと。
 *   - 弦本数 (Guitar 6 / Bass 4) は constants.js の TUNING_* と連動。
 *     STRING_PITCH_* は弦間隔の計算式に Magic number (5/3) として直書きしている。
 */

// ═══ プライマリノブ (開発者が変更する場所) ════════════════════════════
//
// 表示するフレット範囲 (両端含む)。0=ナット側(開放弦), 22=最大フレット。
export const FRET_START = 0;
export const FRET_END   = 22;

// 1フレット分の幅 (横方向)。大きくすると指板が横に伸び SVG全体幅も自動拡張。
// 現行 38.96 ≈ FBW(896) / 23フレット の歴史的値。
export const FRET_WIDTH = 38.96;

// 指板枠の高さ (縦方向)。大きくすると弦間隔も自動で広がる。
export const FRETBOARD_HEIGHT = 168;

// ドット (音名表示円) の半径。FRET_WIDTH の 1/4 程度が見やすい目安。
export const DOT_RADIUS = 10;

// 指板枠の上下内側余白 (最上弦・最下弦と枠線の距離)。
export const STRING_PADDING = 12;

// 指板外周マージン。
//   LEFT  : 弦ラベル(E2/E1等) を載せる余白
//   BOTTOM: ポジション番号(3/5/7…) を載せる余白
export const MARGIN_LEFT   = 54;
export const MARGIN_RIGHT  = 10;
export const MARGIN_TOP    = 20;
export const MARGIN_BOTTOM = 58;

// ═══ 派生値 (自動計算 — 直接書き換えない) ════════════════════════════
const N_FRETS         = FRET_END - FRET_START + 1;
const FRETBOARD_WIDTH = FRET_WIDTH * N_FRETS;
const SVG_WIDTH       = FRETBOARD_WIDTH + MARGIN_LEFT + MARGIN_RIGHT;
const SVG_HEIGHT      = FRETBOARD_HEIGHT + MARGIN_TOP + MARGIN_BOTTOM;
const STRING_AREA_H   = FRETBOARD_HEIGHT - 2 * STRING_PADDING;

/**
 * UI モジュール (fretboardSvg / savedTab / main) が参照するエントリポイント。
 * 短いキー名は歴史的な互換性のため維持 (W/H/ML/MR/MT/MB/F0/F1/CR/SP/FW/SH...)。
 */
export const SVG = {
  W:   SVG_WIDTH,
  H:   SVG_HEIGHT,
  ML:  MARGIN_LEFT,
  MR:  MARGIN_RIGHT,
  MT:  MARGIN_TOP,
  MB:  MARGIN_BOTTOM,
  F0:  FRET_START,
  F1:  FRET_END,
  CR:  DOT_RADIUS,
  SP:  STRING_PADDING,
  FBW: FRETBOARD_WIDTH,
  FBH: FRETBOARD_HEIGHT,
  FW:  FRET_WIDTH,
  SH:      STRING_AREA_H / 5,  // Guitar : 6弦 → 5 gap
  SH_BASS: STRING_AREA_H / 3,  // Bass   : 4弦 → 3 gap
};
