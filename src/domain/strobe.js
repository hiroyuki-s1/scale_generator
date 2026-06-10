/**
 * ストロボ・チューナーの位相演算（pure・DOM 非依存・Node でテスト可）。
 *
 * 物理ストロボは入力と基準のうなり（beat = f_in − f_ref）の速さでパターンが流れる。
 * 瞬時 cents 表示より桁違いに高感度なのは、**位相が時間積分で溜まる**から：
 * わずか 0.02Hz のズレでも数秒で目に見えてドリフトする（プロ機が ~0.02¢ を謳う理屈）。
 *
 *   phase(t+dt) = frac( phase(t) + (f_in − f_ref) · dt )
 *
 * パターンを位相ぶん横にずらして描けば、合っていれば静止・ずれていれば流れる。
 * 流れる向き（位相速度の符号）が ♯/♭ を示す。
 */

/** うなり（Hz）= 検出 − 目標。正で高い（♯）、負で低い（♭）。 */
export function beatHz(detectedHz, targetHz) {
  return detectedHz - targetHz;
}

/** 目標からのズレ（cents）。基準が非正なら 0。 */
export function centsOff(detectedHz, targetHz) {
  if (!(detectedHz > 0) || !(targetHz > 0)) return 0;
  return 1200 * Math.log2(detectedHz / targetHz);
}

/**
 * 位相を dt 秒ぶん進める（[0,1) に正規化）。
 * @param {number} phase 現在位相 [0,1)
 * @param {number} detectedHz 検出周波数（Hz）
 * @param {number} targetHz 目標周波数（Hz）
 * @param {number} dtSec 経過秒
 * @param {number} [speedScale=1] 表示速度の倍率（うなりが速すぎる時に落とす用）
 * @returns {number} 新しい位相 [0,1)
 */
export function advanceStrobePhase(phase, detectedHz, targetHz, dtSec, speedScale = 1) {
  if (!(detectedHz > 0) || !(targetHz > 0) || !(dtSec >= 0)) return wrap01(phase);
  const v = (detectedHz - targetHz) * speedScale; // cycles/sec
  return wrap01(phase + v * dtSec);
}

/** [0,1) への巻き戻し。 */
export function wrap01(x) {
  if (!Number.isFinite(x)) return 0;
  const f = x - Math.floor(x);
  return f < 0 ? f + 1 : f;
}

/**
 * 「合っている」かどうか（|cents| が許容内）。在/不在は呼び出し側で判断。
 * @param {number} detectedHz
 * @param {number} targetHz
 * @param {number} [tolCents=1] 許容 cents
 */
export function isLocked(detectedHz, targetHz, tolCents = 1) {
  return Math.abs(centsOff(detectedHz, targetHz)) <= tolCents;
}
