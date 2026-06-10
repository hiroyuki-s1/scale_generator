import { DEGREE_NAMES } from '../config.js';
import { pitchClassToDegree } from './music.js';

/**
 * スケール練習の判定（pure・DOM 非依存・Node でテスト可）。
 *
 * saved スケールは `rootIndex`(0–11 のルート pitch class) と
 * `activeDegrees`(度数インデックス=ルートからの半音 0–11 の集合) を持つ。
 * 弾いた音の pitch class が「スケール内か」を度数で判定し、鍵盤ハイライト/バツに使う。
 */

/** activeDegrees(Set|配列) を Set<number> に正規化。 */
function toDegreeSet(activeDegrees) {
  if (activeDegrees instanceof Set) return activeDegrees;
  return new Set(Array.isArray(activeDegrees) ? activeDegrees : []);
}

/**
 * スケールに含まれる pitch class 集合（鍵盤の常時ハイライト用）。
 * @param {number} rootIndex 0–11
 * @param {Set<number>|number[]} activeDegrees 度数インデックス集合
 * @returns {Set<number>} pitch class の集合（0–11）
 */
export function scalePitchClassSet(rootIndex, activeDegrees) {
  const out = new Set();
  const r = ((rootIndex % 12) + 12) % 12;
  for (const d of toDegreeSet(activeDegrees)) out.add((r + (((d % 12) + 12) % 12)) % 12);
  return out;
}

/**
 * 弾いた pitch class をスケールに照らして分類。
 * @param {number} pc 弾いた音の pitch class（0–11）
 * @param {number} rootIndex ルート pitch class
 * @param {Set<number>|number[]} activeDegrees
 * @returns {{ degree:number, inScale:boolean, degreeName:string|null, isRoot:boolean }}
 */
export function classifyAgainstScale(pc, rootIndex, activeDegrees) {
  const set = toDegreeSet(activeDegrees);
  const degree = pitchClassToDegree(((pc % 12) + 12) % 12, ((rootIndex % 12) + 12) % 12);
  const inScale = set.has(degree);
  return {
    degree,
    inScale,
    degreeName: inScale ? DEGREE_NAMES[degree] : null,
    isRoot: degree === 0 && inScale,
  };
}
