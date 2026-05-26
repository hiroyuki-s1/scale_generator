import { NOTE_NAMES, DEGREE_INFO, STANDARD_TUNING, FRET_START, FRET_END } from './constants';
import type { DegreeIndex, FretNote, NoteName, Tuning } from './types';

// ============================================================
// Pure domain logic — no UI, no framework dependencies
// ============================================================

/** Convert MIDI note number to 0-11 pitch class */
export function midiToPitchClass(midi: number): number {
  return ((midi % 12) + 12) % 12;
}

/** Given a pitch class and a root pitch class, return the degree index (0-11) */
export function pitchClassToDegree(pitchClass: number, rootPitchClass: number): DegreeIndex {
  return (((pitchClass - rootPitchClass) % 12) + 12) % 12 as DegreeIndex;
}

/** Convert NOTE_NAMES index to NoteName */
export function indexToNoteName(index: number): NoteName {
  return NOTE_NAMES[((index % 12) + 12) % 12];
}

/** Return key label like "A", "C#" etc. */
export function keyLabel(rootIndex: number): string {
  return NOTE_NAMES[rootIndex];
}

/**
 * Compute all fret notes that belong to the selected degrees.
 * Returns immutable array of FretNote.
 */
export function computeFretNotes(
  rootIndex: number,
  activeDegrees: ReadonlySet<DegreeIndex>,
  tuning: Tuning = STANDARD_TUNING,
  fretStart: number = FRET_START,
  fretEnd: number = FRET_END,
): readonly FretNote[] {
  const notes: FretNote[] = [];

  for (let string = 0; string < tuning.openMidi.length; string++) {
    const openMidi = tuning.openMidi[string];
    for (let fret = fretStart; fret <= fretEnd; fret++) {
      const midi   = openMidi + fret;
      const pc     = midiToPitchClass(midi);
      const degree = pitchClassToDegree(pc, rootIndex);
      if (!activeDegrees.has(degree)) continue;
      notes.push({
        string,
        fret,
        midi,
        noteName: indexToNoteName(pc),
        degree,
      });
    }
  }

  return notes;
}

/** Build a human-readable title like "A Minor Penta" or "G# カスタム" */
export function buildTitle(
  rootIndex: number,
  presetName: string | null,
  activeDegrees: ReadonlySet<DegreeIndex>,
): string {
  const key = keyLabel(rootIndex);
  if (presetName) return `${key} ${presetName}`;
  const names = [...activeDegrees]
    .sort((a, b) => a - b)
    .map(i => DEGREE_INFO[i].name)
    .join(', ');
  return `${key} — カスタム (${names})`;
}
