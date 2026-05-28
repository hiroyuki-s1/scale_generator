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
  // Locrian #2 (= 6th mode of melodic minor) preferred over Locrian for m7b5
  [/m7b5|-7b5|^h7?$|^ø/,             'Locrian #2',   [0, 2, 3, 5, 6, 8, 10]],

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

/**
 * Key-context-aware chord-scale assignment.
 *
 * Uses the chord's diatonic function within the song key to assign a more
 * harmonically accurate mode (e.g. IVM7→Lydian, IIIm7→Phrygian, VIm7→Natural Minor).
 * Falls back to chordQualityToScale() for unrecognised cases.
 *
 * @param {string}  quality
 * @param {number}  rootPc      pitch class of chord root (0–11)
 * @param {number}  keyPc       pitch class of song key (0–11)
 * @param {boolean} keyIsMinor  true when key signature is minor (e.g. "G-")
 * @returns {{ scaleName: string, degrees: number[] }}
 */
export function chordQualityToScaleCtx(quality, rootPc, keyPc, keyIsMinor) {
  const iv = (rootPc - keyPc + 12) % 12;

  // Classify quality (avoid mis-matching m7b5 as isMin7)
  const isHalfDim   = /m7b5|-7b5|^h7?$|^ø/.test(quality);
  const isMaj7      = /^\^7?|^M7|^[Mm]aj7|^Δ/.test(quality);
  const isMin7      = /^(m7|-7)/.test(quality) && !isHalfDim;
  // Plain dominant 7 (no explicit tension alterations already covered by RULES)
  const isPlainDom7 = /^7/.test(quality) && !/[#b]9|b13|#11|alt/.test(quality);

  if (!keyIsMinor) {
    // IVM7 → Lydian (avoids the avoid note on the natural 11th)
    if (iv === 5 && isMaj7)      return { scaleName: 'Lydian',        degrees: [0, 2, 4, 6, 7, 9, 11] };
    // IIIm7 → Phrygian
    if (iv === 4 && isMin7)      return { scaleName: 'Phrygian',      degrees: [0, 1, 3, 5, 7, 8, 10] };
    // VIm7 → Aeolian (Natural Minor)
    if (iv === 9 && isMin7)      return { scaleName: 'Aeolian',  degrees: [0, 2, 3, 5, 7, 8, 10] };
    // bII7 → Lydian Dom (tritone substitution)
    if (iv === 1 && isPlainDom7) return { scaleName: 'Lydian Dom',    degrees: [0, 2, 4, 6, 7, 9, 10] };
  } else {
    // bVIM7, bVIIM7 in minor → Lydian
    if ((iv === 8 || iv === 10) && isMaj7) return { scaleName: 'Lydian', degrees: [0, 2, 4, 6, 7, 9, 11] };
    // bII7 → Lydian Dom
    if (iv === 1 && isPlainDom7) return { scaleName: 'Lydian Dom',    degrees: [0, 2, 4, 6, 7, 9, 10] };
  }

  return chordQualityToScale(quality);
}
