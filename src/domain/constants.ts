import type { DegreeInfo, NoteName, ScalePreset, Tuning } from './types';

export const NOTE_NAMES: readonly NoteName[] = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
];

export const DEGREE_INFO: readonly DegreeInfo[] = [
  { name: 'R',   semitones: 0,  color: { fill: '#fde8e8', stroke: '#c0392b', text: '#c0392b' } },
  { name: 'b9',  semitones: 1,  color: { fill: '#f3e8fd', stroke: '#7c3aed', text: '#7c3aed' } },
  { name: '9',   semitones: 2,  color: { fill: '#e8f4fd', stroke: '#2980b9', text: '#2980b9' } },
  { name: 'm3',  semitones: 3,  color: { fill: '#ede8fd', stroke: '#5b2d91', text: '#5b2d91' } },
  { name: 'M3',  semitones: 4,  color: { fill: '#edfdf3', stroke: '#1e8449', text: '#1e8449' } },
  { name: '11',  semitones: 5,  color: { fill: '#e8f7fd', stroke: '#1a7fa8', text: '#1a7fa8' } },
  { name: '#11', semitones: 6,  color: { fill: '#fdf3e8', stroke: '#d35400', text: '#d35400' } },
  { name: 'P5',  semitones: 7,  color: { fill: '#e8fdf0', stroke: '#1a8c5a', text: '#1a8c5a' } },
  { name: 'b13', semitones: 8,  color: { fill: '#f9e8fd', stroke: '#9b2dbf', text: '#9b2dbf' } },
  { name: '13',  semitones: 9,  color: { fill: '#e8fdf5', stroke: '#148f6e', text: '#148f6e' } },
  { name: 'm7',  semitones: 10, color: { fill: '#f0f0f0', stroke: '#555555', text: '#333333' } },
  { name: 'M7',  semitones: 11, color: { fill: '#fdf0e8', stroke: '#b94a1c', text: '#b94a1c' } },
] as const;

export const SCALE_PRESETS: readonly ScalePreset[] = [
  { name: 'Major',         degrees: [0, 2, 4, 5, 7, 9, 11] },
  { name: 'Natural Minor', degrees: [0, 2, 3, 5, 7, 8, 10] },
  { name: 'Major Penta',   degrees: [0, 2, 4, 7, 9]        },
  { name: 'Minor Penta',   degrees: [0, 3, 5, 7, 10]       },
  { name: 'Blues',         degrees: [0, 3, 5, 6, 7, 10]    },
  { name: 'Dorian',        degrees: [0, 2, 3, 5, 7, 9, 10] },
  { name: 'Mixolydian',    degrees: [0, 2, 4, 5, 7, 9, 10] },
  { name: 'Lydian Dom',    degrees: [0, 2, 4, 6, 7, 9, 10] },
  { name: 'Altered',       degrees: [0, 1, 3, 4, 6, 8, 10] },
  { name: 'Harmonic Min',  degrees: [0, 2, 3, 5, 7, 8, 11] },
] as const;

export const STANDARD_TUNING: Tuning = {
  name: 'Standard',
  openMidi: [64, 59, 55, 50, 45, 40], // E4 B3 G3 D3 A2 E2
};

export const STRING_LABELS = ['E4', 'B3', 'G3', 'D3', 'A2', 'E2'] as const;

export const FRET_START = 1;
export const FRET_END   = 15;
