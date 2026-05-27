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

export const PRESET_GROUPS = [
  {
    label: 'Penta',
    presets: [
      { name: 'Major Penta', degrees: [0, 2, 4, 7, 9]    },
      { name: 'Minor Penta', degrees: [0, 3, 5, 7, 10]   },
      { name: 'Blues',       degrees: [0, 3, 5, 6, 7, 10] },
    ],
  },
  {
    label: 'Diatonic',
    presets: [
      { name: 'Major',         degrees: [0, 2, 4, 5, 7, 9, 11] },
      { name: 'Natural Minor', degrees: [0, 2, 3, 5, 7, 8, 10] },
      { name: 'Dorian',        degrees: [0, 2, 3, 5, 7, 9, 10] },
      { name: 'Mixolydian',    degrees: [0, 2, 4, 5, 7, 9, 10] },
    ],
  },
  {
    label: 'Advanced',
    presets: [
      { name: 'Lydian Dom',   degrees: [0, 2, 4, 6, 7, 9, 10] },
      { name: 'Altered',      degrees: [0, 1, 3, 4, 6, 8, 10] },
      { name: 'Harmonic Min', degrees: [0, 2, 3, 5, 7, 8, 11] },
    ],
  },
];

export const TUNING = [64, 59, 55, 50, 45, 40];
export const STRING_LABELS = ['E4', 'B3', 'G3', 'D3', 'A2', 'E2'];

export const FRET_START = 1;
export const FRET_END = 15;

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

export const SVG = {
  W: 960, H: 230,
  ML: 50, MT: 20, MR: 10, MB: 42,
  F0: FRET_START, F1: FRET_END,
  CR: 12.5,
};
SVG.FBW = SVG.W - SVG.ML - SVG.MR;
SVG.FBH = SVG.H - SVG.MT - SVG.MB;
SVG.FW  = SVG.FBW / (SVG.F1 - SVG.F0 + 1);
SVG.SH  = SVG.FBH / 5;
