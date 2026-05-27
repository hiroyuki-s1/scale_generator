/**
 * Chord quality → recommended scale mapping.
 * Priority order: most specific first.
 *
 * @param {string} quality  The part of the chord symbol after the root (e.g. "m7", "7alt", "^7")
 * @returns {{ scaleName: string, degrees: number[] }}
 */

const RULES = [
  // ── Altered dominant ───────────────────────────────────────────────────
  [/^7alt$/,                          'Altered',      [0, 1, 3, 4, 6, 8, 10]],
  [/7.*[#b]9/,                        'Altered',      [0, 1, 3, 4, 6, 8, 10]],
  [/7.*b13/,                          'Altered',      [0, 1, 3, 4, 6, 8, 10]],

  // ── Lydian Dominant ────────────────────────────────────────────────────
  [/7.*#11/,                          'Lydian Dom',   [0, 2, 4, 6, 7, 9, 10]],

  // ── Half-diminished ───────────────────────────────────────────────────
  [/m7b5|-7b5|^h7?$|^ø/,             'Locrian',      [0, 1, 3, 5, 6, 8, 10]],

  // ── Diminished 7 ──────────────────────────────────────────────────────
  [/^(o7|dim7)$/,                     'Diminished',   [0, 2, 3, 5, 6, 8, 9, 11]],

  // ── Minor-major 7 ─────────────────────────────────────────────────────
  [/^(mM7|m\^7|mMaj7|-M7)$/,         'Harmonic Min', [0, 2, 3, 5, 7, 8, 11]],

  // ── Major 7 / major (^, ^7, M7, maj7) ────────────────────────────────
  [/^\^7?|^M7|^[Mm]aj7|^Δ/,          'Ionian',       [0, 2, 4, 5, 7, 9, 11]],

  // ── Minor 7 ───────────────────────────────────────────────────────────
  [/^(m7|-7)/,                        'Dorian',       [0, 2, 3, 5, 7, 9, 10]],

  // ── Dominant 7 (plain / with natural tensions) ────────────────────────
  [/^7/,                              'Mixolydian',   [0, 2, 4, 5, 7, 9, 10]],

  // ── Suspended ─────────────────────────────────────────────────────────
  [/sus/,                             'Mixolydian',   [0, 2, 4, 5, 7, 9, 10]],

  // ── Minor triad / 6 ───────────────────────────────────────────────────
  [/^(m6?|-6?|min)$/,                 'Minor Penta',  [0, 3, 5, 7, 10]],

  // ── Diminished triad ──────────────────────────────────────────────────
  [/^(o|dim)$/,                       'Locrian',      [0, 1, 3, 5, 6, 8, 10]],

  // ── Augmented ─────────────────────────────────────────────────────────
  [/^\+|^aug/,                        'Ionian',       [0, 2, 4, 5, 7, 9, 11]],
];

/** Default for major triad / empty quality. */
const DEFAULT_SCALE = { scaleName: 'Major Penta', degrees: [0, 2, 4, 7, 9] };

/**
 * @param {string} quality
 * @returns {{ scaleName: string, degrees: number[] }}
 */
export function chordQualityToScale(quality) {
  if (!quality) return DEFAULT_SCALE;
  for (const [re, scaleName, degrees] of RULES) {
    if (re.test(quality)) return { scaleName, degrees };
  }
  return DEFAULT_SCALE;
}
