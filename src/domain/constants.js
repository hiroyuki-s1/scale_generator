export const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const DEGREES = [
  { name: 'R',   semi: 0  },
  { name: 'b9',  semi: 1  },
  { name: '9',   semi: 2  },
  { name: 'm3',  semi: 3  },
  { name: 'M3',  semi: 4  },
  { name: '11',  semi: 5  },
  { name: '#11', semi: 6  },
  { name: 'P5',  semi: 7  },
  { name: 'b13', semi: 8  },
  { name: '13',  semi: 9  },
  { name: 'm7',  semi: 10 },
  { name: 'M7',  semi: 11 },
];

export const SCALE_GROUPS = [
  {
    label: 'Penta',
    presets: [
      { name: 'Major Penta', degrees: [0, 2, 4, 7, 9]    },
      { name: 'Minor Penta', degrees: [0, 3, 5, 7, 10]   },
      { name: 'Blues',       degrees: [0, 3, 5, 6, 7, 10] },
    ],
  },
  {
    label: 'Church Mode',
    presets: [
      { name: 'Ionian',     degrees: [0, 2, 4, 5, 7, 9, 11] },
      { name: 'Dorian',     degrees: [0, 2, 3, 5, 7, 9, 10] },
      { name: 'Phrygian',   degrees: [0, 1, 3, 5, 7, 8, 10] },
      { name: 'Lydian',     degrees: [0, 2, 4, 6, 7, 9, 11] },
      { name: 'Mixolydian', degrees: [0, 2, 4, 5, 7, 9, 10] },
      { name: 'Aeolian',    degrees: [0, 2, 3, 5, 7, 8, 10] },
      { name: 'Locrian',    degrees: [0, 1, 3, 5, 6, 8, 10] },
    ],
  },
  {
    label: 'Advanced',
    presets: [
      { name: 'Lydian Dom',   degrees: [0, 2, 4, 6, 7, 9, 10] },
      { name: 'Altered',      degrees: [0, 1, 3, 4, 6, 8, 10] },
      { name: 'Locrian #2',   degrees: [0, 2, 3, 5, 6, 8, 10] },
      { name: 'Harmonic Min', degrees: [0, 2, 3, 5, 7, 8, 11] },
      { name: 'Diminished',   degrees: [0, 2, 3, 5, 6, 8, 9, 11] },
    ],
  },
];

export const CHORD_GROUPS = [
  {
    label: 'Triad',
    presets: [
      { name: 'maj',  degrees: [0, 4, 7]  },
      { name: 'min',  degrees: [0, 3, 7]  },
      { name: 'dim',  degrees: [0, 3, 6]  },
      { name: 'aug',  degrees: [0, 4, 8]  },
      { name: 'sus4', degrees: [0, 5, 7]  },
      { name: 'sus2', degrees: [0, 2, 7]  },
    ],
  },
  {
    label: '7th',
    presets: [
      { name: 'maj7',  degrees: [0, 4, 7, 11] },
      { name: '7',     degrees: [0, 4, 7, 10] },
      { name: 'm7',    degrees: [0, 3, 7, 10] },
      { name: 'm7b5',  degrees: [0, 3, 6, 10] },
      { name: 'dim7',  degrees: [0, 3, 6, 9]  },
      { name: 'mMaj7', degrees: [0, 3, 7, 11] },
    ],
  },
  {
    label: 'Extended',
    presets: [
      { name: '9',    degrees: [0, 2, 4, 7, 10] },
      { name: 'maj9', degrees: [0, 2, 4, 7, 11] },
      { name: 'm9',   degrees: [0, 2, 3, 7, 10] },
      { name: '13',   degrees: [0, 4, 7, 9, 10] },
    ],
  },
];

export const PRESETS_BY_MODE = {
  scale: SCALE_GROUPS,
  chord: CHORD_GROUPS,
};

/**
 * Return { preset, mode } looking up the name across both scale and chord
 * groups. Returns null if not found.
 */
export function findPresetEverywhere(name) {
  for (const [mode, groups] of Object.entries(PRESETS_BY_MODE)) {
    for (const g of groups) {
      const p = g.presets.find(x => x.name === name);
      if (p) return { preset: p, mode };
    }
  }
  return null;
}

export const TUNING_GUITAR = [64, 59, 55, 50, 45, 40];   // E4 B3 G3 D3 A2 E2
export const TUNING_BASS   = [43, 38, 33, 28];           // G2 D2 A1 E1

export const STRING_LABELS_GUITAR = ['E4', 'B3', 'G3', 'D3', 'A2', 'E2'];
export const STRING_LABELS_BASS   = ['G2', 'D2', 'A1', 'E1'];

// 指板ジオメトリ (フレット数 / SVG寸法) は開発者ノブとして
// `src/config/fretboardGeometry.js` に切り出し、ここでは互換 re-export のみ行う。
export { FRET_START, FRET_END, SVG } from '../config/fretboardGeometry.js';

export const WHITE_KEYS = [
  { note: 'C', idx: 0 }, { note: 'D', idx: 2 }, { note: 'E', idx: 4 },
  { note: 'F', idx: 5 }, { note: 'G', idx: 7 }, { note: 'A', idx: 9 }, { note: 'B', idx: 11 },
];
export const BLACK_KEYS = [
  { note: 'C#', idx: 1,  wi: 0 }, { note: 'D#', idx: 3,  wi: 1 },
  { note: 'F#', idx: 6,  wi: 3 }, { note: 'G#', idx: 8,  wi: 4 },
  { note: 'A#', idx: 10, wi: 5 },
];

export const DEFAULT_COLORS = [
  { solid: true,  color: '#d92b2b', text: '#ffffff' },
  { solid: false, color: '#1c1c1c', text: '#1c1c1c' },
  { solid: false, color: '#1c1c1c', text: '#1c1c1c' },
  { solid: false, color: '#d92b2b', text: '#d92b2b' },
  { solid: false, color: '#d92b2b', text: '#d92b2b' },
  { solid: false, color: '#1c1c1c', text: '#1c1c1c' },
  { solid: false, color: '#1c1c1c', text: '#1c1c1c' },
  { solid: false, color: '#d92b2b', text: '#d92b2b' },
  { solid: false, color: '#1c1c1c', text: '#1c1c1c' },
  { solid: false, color: '#1c1c1c', text: '#1c1c1c' },
  { solid: false, color: '#d92b2b', text: '#d92b2b' },
  { solid: false, color: '#d92b2b', text: '#d92b2b' },
];

export const LAYOUT_PRESETS = [
  [1, 1], [1, 2], [2, 1], [2, 2],
  [2, 3], [2, 4], [3, 3], [3, 4], [3, 5],
];

// (SVG ジオメトリは config/fretboardGeometry.js に移動済み — 上部の re-export 参照)
