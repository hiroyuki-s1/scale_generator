import { TUNING, FRET_START, FRET_END } from './constants.js';
import { midiToPitchClass, pitchClassToDegree } from './music.js';

/**
 * stateから指板上の表示対象ノート配列を返す。
 * @param {object} state
 *   rootIndex, activeDegrees(Set<number>), mask{enabled,min,max}
 * @returns {Array<{string:number, fret:number, midi:number, degree:number}>}
 */
export function computeFretNotes(state) {
  const { rootIndex, activeDegrees, mask } = state;
  const useMask = mask && mask.enabled;
  const lo = useMask ? mask.min : FRET_START;
  const hi = useMask ? mask.max : FRET_END;
  const notes = [];
  for (let s = 0; s < TUNING.length; s++) {
    for (let f = FRET_START; f <= FRET_END; f++) {
      if (useMask && (f < lo || f > hi)) continue;
      const midi = TUNING[s] + f;
      const pc = midiToPitchClass(midi);
      const degree = pitchClassToDegree(pc, rootIndex);
      if (!activeDegrees.has(degree)) continue;
      notes.push({ string: s, fret: f, midi, degree });
    }
  }
  return notes;
}
