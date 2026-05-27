import { NOTES, DEGREES } from './constants.js';
import { midiToPitchClass } from './music.js';

export function keyLabel(rootIndex) {
  return NOTES[midiToPitchClass(rootIndex)];
}

/**
 * @param {{rootIndex:number, activeDegrees:Set<number>, presetName:?string, mode?:string}} state
 */
export function buildTitle(state) {
  const key = keyLabel(state.rootIndex);
  if (state.presetName) {
    // Chord names are written tight ("A7", "Cmaj7") to read naturally;
    // scale names get a space ("A Minor Penta").
    const sep = state.mode === 'chord' ? '' : ' ';
    return `${key}${sep}${state.presetName}`;
  }
  const names = [...state.activeDegrees]
    .sort((a, b) => a - b)
    .map(i => DEGREES[i].name)
    .join(', ');
  return `${key} — カスタム (${names})`;
}
