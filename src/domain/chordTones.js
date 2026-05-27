/**
 * Chord quality → chord tone degrees.
 *
 * Returns the semitone intervals that form the actual chord (not the full scale).
 * Used as the default active degrees when selecting a chord in the iReal tab.
 *
 * Degree semitones: R=0, b9=1, 9=2, m3=3, M3=4, 11=5, #11=6, P5=7, b13=8, 13=9, m7=10, M7=11
 */

const RULES = [
  // Half-diminished (m7b5): R m3 b5 m7
  [/m7b5|-7b5|^h7?$|^ø/,              [0, 3, 6, 10]],
  // Diminished 7: R m3 b5 d7(=13)
  [/^(o7|dim7)$/,                      [0, 3, 6, 9]],
  // Minor-major 7: R m3 P5 M7
  [/^(mM7|m\^7|mMaj7|-M7)$/,          [0, 3, 7, 11]],
  // Major 7: R M3 P5 M7
  [/^\^7?|^M7|^[Mm]aj7|^Δ/,          [0, 4, 7, 11]],
  // Altered dominant (simplified to R M3 m7)
  [/^7alt$/,                           [0, 4, 10]],
  // Dom7 b9: R b9 M3 P5 m7
  [/7.*b9/,                            [0, 1, 4, 7, 10]],
  // Dom7 #9: R m3 M3 P5 m7
  [/7.*#9/,                            [0, 3, 4, 7, 10]],
  // Dom7 #11: R M3 #11 P5 m7
  [/7.*#11/,                           [0, 4, 6, 7, 10]],
  // Minor 7: R m3 P5 m7
  [/^(m7|-7)/,                         [0, 3, 7, 10]],
  // Dominant 7: R M3 P5 m7
  [/^7/,                               [0, 4, 7, 10]],
  // Suspended 4: R 11 P5
  [/sus4|^sus$/,                       [0, 5, 7]],
  // Suspended 2: R 9 P5
  [/sus2/,                             [0, 2, 7]],
  // Minor triad / minor 6
  [/^(m6?|-6?|min)$/,                  [0, 3, 7]],
  // Augmented: R M3 b13
  [/^\+|^aug/,                         [0, 4, 8]],
  // Diminished triad: R m3 b5
  [/^(o|dim)$/,                        [0, 3, 6]],
];

const MAJOR_TRIAD = [0, 4, 7];

/**
 * @param {string} quality  chord quality string (the part after the root)
 * @returns {number[]}  sorted semitone intervals forming the chord tones
 */
export function qualityToChordTones(quality) {
  if (!quality) return MAJOR_TRIAD;
  for (const [re, degrees] of RULES) {
    if (re.test(quality)) return degrees;
  }
  return MAJOR_TRIAD;
}
