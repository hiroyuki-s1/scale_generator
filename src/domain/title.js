import { NOTES, DEGREES } from './constants.js';
import { midiToPitchClass } from './music.js';

export function keyLabel(rootIndex) {
  return NOTES[midiToPitchClass(rootIndex)];
}

/**
 * @param {{rootIndex:number, activeDegrees:Set<number>, presetName:?string}} state
 */
export function buildTitle(state) {
  const key = keyLabel(state.rootIndex);
  if (state.presetName) return `${key} ${state.presetName}`;
  const names = [...state.activeDegrees]
    .sort((a, b) => a - b)
    .map(i => DEGREES[i].name)
    .join(', ');
  return `${key} — カスタム (${names})`;
}
