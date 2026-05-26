// ============================================================
// Core music theory types
// ============================================================

export type NoteName = 'C' | 'C#' | 'D' | 'D#' | 'E' | 'F' | 'F#' | 'G' | 'G#' | 'A' | 'A#' | 'B';

export type Degree =
  | 'R' | 'b9' | '9' | 'm3' | 'M3'
  | '11' | '#11' | 'P5' | 'b13' | '13' | 'm7' | 'M7';

export type DegreeIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

export interface DegreeInfo {
  readonly name: Degree;
  readonly semitones: number;
  readonly color: DegreeColor;
}

export interface DegreeColor {
  readonly fill: string;
  readonly stroke: string;
  readonly text: string;
}

export interface ScalePreset {
  readonly name: string;
  readonly degrees: readonly DegreeIndex[];
}

export interface FretNote {
  readonly string: number;   // 0 = 1st string (E4), 5 = 6th string (E2)
  readonly fret: number;
  readonly midi: number;
  readonly noteName: NoteName;
  readonly degree: DegreeIndex;
}

export interface MaskRange {
  readonly enabled: boolean;
  readonly min: number;
  readonly max: number;
}

export interface Tuning {
  readonly name: string;
  readonly openMidi: readonly number[]; // index 0 = 1st string
}
