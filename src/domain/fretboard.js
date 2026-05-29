import { TUNING_GUITAR, TUNING_BASS, FRET_START, FRET_END } from './constants.js';
import { midiToPitchClass, pitchClassToDegree } from './music.js';

/**
 * stateから指板上の表示対象ノート配列を返す。
 * @param {object} state
 *   rootIndex, activeDegrees(Set<number>), mask{enabled,min,max}, instrument?
 * @returns {Array<{string:number, fret:number, midi:number, degree:number}>}
 */
export function computeFretNotes(state) {
  const { rootIndex, activeDegrees, mask, instrument } = state;
  const tuning = instrument === 'bass' ? TUNING_BASS : TUNING_GUITAR;
  const useMask = mask && mask.enabled;
  const lo = useMask ? mask.min : FRET_START;
  const hi = useMask ? mask.max : FRET_END;
  const notes = [];
  for (let s = 0; s < tuning.length; s++) {
    for (let f = FRET_START; f <= FRET_END; f++) {
      if (useMask && (f < lo || f > hi)) continue;
      const midi = tuning[s] + f;
      const pc = midiToPitchClass(midi);
      const degree = pitchClassToDegree(pc, rootIndex);
      if (!activeDegrees.has(degree)) continue;
      notes.push({ string: s, fret: f, midi, degree });
    }
  }
  return notes;
}

export function noteKey(n) {
  return `${n.string}-${n.fret}-${n.degree}`;
}

/**
 * 2つの状態間で表示するノートの差分 (追加/削除) を計算する。
 * UIはこれを使って差分アニメーションのみ走らせる (全dot消えて再登場を避ける)。
 */
export function diffFretNotes(prevState, nextState) {
  const prevNotes = prevState ? computeFretNotes(prevState) : [];
  const nextNotes = computeFretNotes(nextState);
  const prevByKey = new Map(prevNotes.map(n => [noteKey(n), n]));
  const nextByKey = new Map(nextNotes.map(n => [noteKey(n), n]));

  const added = nextNotes.filter(n => !prevByKey.has(noteKey(n)));
  const removed = prevNotes.filter(n => !nextByKey.has(noteKey(n)));
  return { added, removed };
}
