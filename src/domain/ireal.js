/**
 * iReal Pro URL parser.
 *
 * Format: irealb://Title=Composer=Style=Key=n=0=ChordData=0=0=0=0=0
 * Multiple songs joined by ===
 *
 * Chord data tokens:
 *   *A *B *C      section markers (ignored)
 *   { } [ ] Z     repeat/barline (ignored)
 *   T44 T34       time signature (ignored)
 *   | \           barline (split point)
 *   x             repeat measure (skip)
 *   n             no chord (skip)
 *   Q E S         rhythm markers (ignored)
 *   W p f l u s   notation markers (ignored)
 *   <...>         text annotation (ignored)
 *   [A-G][#b]?... chord symbol
 */

import { chordQualityToScale } from './chordScale.js';
import { NOTES } from './constants.js';

/** Pitch class for note names (supports # and b). */
const NOTE_PC = {
  'C': 0, 'B#': 0,
  'C#': 1, 'Db': 1,
  'D': 2,
  'D#': 3, 'Eb': 3,
  'E': 4, 'Fb': 4,
  'F': 5, 'E#': 5,
  'F#': 6, 'Gb': 6,
  'G': 7,
  'G#': 8, 'Ab': 8,
  'A': 9,
  'A#': 10, 'Bb': 10,
  'B': 11, 'Cb': 11,
};

/**
 * @typedef {{ root: string, rootPc: number, quality: string, symbol: string, displayName: string, scaleName: string, degrees: number[] }} IrealChord
 */

/**
 * Convert internal quality string to human-readable standard notation.
 * "^7"→"M7", "h7"→"m7b5", "-7"→"m7", "-"→"m", "o7"→"dim7"
 * @param {string} quality
 * @returns {string}
 */
function qualityToDisplay(quality) {
  return quality
    .replace(/^\^7?/, 'M7')    // ^ or ^7  → M7
    .replace(/^h7?$/, 'm7b5')  // h or h7  → m7b5
    .replace(/^o7?$/, 'dim7')  // o or o7  → dim7
    .replace(/^-/, 'm');       // -7→m7, -6→m6, -→m
}

/**
 * @typedef {{ title: string, composer: string, style: string, key: string, keyPc: number, chords: IrealChord[] }} IrealSong
 */

/**
 * Parse an irealb:// URL (or plain decoded string) and return song data.
 * @param {string} url
 * @returns {IrealSong}
 * @throws {Error} if format is invalid
 */
/**
 * .irealb ファイルの内容（HTML or プレーンテキスト）から irealb:// URL を抽出する。
 * @param {string} content  ファイルの文字列内容
 * @returns {string}  irealb:// URL
 */
export function extractIrealUrl(content) {
  const trimmed = content.trim();
  // すでに irealb:// URL そのものの場合はそのまま返す
  if (/^irealb:\/\//i.test(trimmed)) return trimmed;
  // HTML の href="irealb://..." を探す
  const hrefMatch = trimmed.match(/href=["'](irealb:\/\/[^"']+)["']/i);
  if (hrefMatch) return hrefMatch[1];
  // その他のインラインURL（スペース不含）
  const linkMatch = trimmed.match(/(irealb:\/\/\S+)/i);
  if (linkMatch) return linkMatch[1];
  throw new Error('.irealb ファイルに irealb:// URLが見つかりません');
}

export function parseIrealUrl(url) {
  // HTML / ファイル内容が渡された場合も対応
  const rawUrl = url.includes('irealb://') && !url.startsWith('irealb://')
    ? extractIrealUrl(url)
    : url;

  const withoutScheme = rawUrl.replace(/^irealb:\/\//i, '');
  const decoded = decodeURIComponent(withoutScheme);

  // Multiple songs are separated by ===; take the first
  const songStr = decoded.split('===')[0];

  // Fields separated by =
  const fields = songStr.split('=');
  if (fields.length < 7) {
    throw new Error('Invalid iReal Pro URL: expected at least 7 fields separated by "="');
  }

  const title    = fields[0];
  const composer = fields[1];
  // Style is the first non-empty field at position 2 or 3.
  const style    = fields[2] || fields[3] || '';
  // Key field position varies by iReal Pro version:
  //   old: Title=Composer=Style=Key=n=0=Chords
  //   new: Title=Composer==Style=Key==Chords  (empty fields at 2 and 5)
  // Scan positions 2-5 for a value matching a key name [A-G][#b]?-?
  const KEY_RE = /^[A-G][#b]?-?$/;
  let key = '';
  for (let i = 2; i <= Math.min(5, fields.length - 1); i++) {
    if (KEY_RE.test(fields[i])) { key = fields[i]; break; }
  }
  if (!key) key = fields[3] || '';
  const keyPc    = NOTE_PC[key.replace(/-$/, '')] ?? 0;

  // Chord data is field index 6; everything after is metadata (0s)
  const chordData = fields.slice(6).join('=').replace(/=[\d,]+$/, '');

  const chords = extractChords(chordData);

  return { title, composer, style, key, keyPc, chords };
}

/**
 * Extract all chord objects from raw iReal Pro chord data.
 *
 * Uses a global regex to find chord patterns directly, handling both:
 *   - quality-first obfuscated notation: ^bB, hA, -G
 *   - standard root-first notation:      Cm7, BbM7, F, G-7
 *
 * @param {string} raw
 * @returns {IrealChord[]}
 */
export function extractChords(raw) {
  // Strip text annotations <...>
  let s = raw.replace(/<[^>]*>/g, ' ');
  // Strip section markers *A *B *C etc.
  s = s.replace(/\*[A-Za-z]/g, ' ');
  // Strip time signatures T44 T34 T68 etc.
  s = s.replace(/T\d{2,}/g, ' ');
  // Strip structural chars: { } [ ] Z | \
  s = s.replace(/[{}[\]Z|\\]/g, ' ');

  // Quality suffix char class: only characters appearing in valid chord quality strings.
  // Excludes known iReal noise chars: Q y X x K c r L W p f
  // Covers: m7b5, M7, maj7, ^7, 7alt, 7b9, 7#9, 7#11, 7b13, dim7, sus4, aug, h7, -7, etc.
  //
  // Two alternatives tried left-to-right at each position:
  //   1. quality-first: [\^ho-] optional-b root quality-suffix   (^bB, hA, -G)
  //   2. root-first:    root-letter optional-accidental quality-suffix  (Cm7, BbM7)
  const CHORD_RE = /[\^ho-]b?[A-G][#b]?[majMhlostdin#b+\-^0-9Δøug]*|[A-G][#b]?[majMhlostdin#b+\-^0-9Δøug]*/g;

  const chords = [];
  let match;
  while ((match = CHORD_RE.exec(s)) !== null) {
    const chord = parseChordToken(match[0]);
    if (chord) chords.push(chord);
  }
  return chords;
}

/**
 * Parse a single chord token like "Cm7", "G7b9", "BbM7", "F#m7b5", "Ab^7".
 *
 * Also handles iReal Pro quality-first notation:
 *   "^bB"  → Bbmaj7  (prefix ^ + flat + root B)
 *   "hA"   → Am7b5   (prefix h = half-dim + root A)
 *   "-G"   → Gm      (prefix - = minor + root G)
 *   "^bE"  → Ebmaj7
 *
 * Returns null for non-chord tokens.
 * @param {string} token
 * @returns {IrealChord|null}
 */
export function parseChordToken(token) {
  // Quality-first notation: prefix + optional flat + root letter
  const prefixMatch = token.match(/^([\^ho-])(b?)([A-G][#b]?)(.*)/);
  if (prefixMatch) {
    const [, prefix, flat, letter, extra] = prefixMatch;
    // Build root: if flat present, append 'b' to the letter (bB → Bb, bE → Eb)
    const root = flat ? (letter + 'b') : letter;
    const rootPc = NOTE_PC[root];
    if (rootPc === undefined) return null;
    const baseQuality = prefix === '^' ? '^7'
                      : prefix === 'h' ? 'h7'
                      : prefix === 'o' ? 'o7'
                      : /* '-' */        '-';
    const quality = baseQuality + extra;
    const { scaleName, degrees } = chordQualityToScale(quality);
    const displayName = root + qualityToDisplay(quality);
    return { root, rootPc, quality, symbol: token, displayName, scaleName, degrees };
  }

  // Standard root-first notation: Cm7, BbM7, G-7, Am7b5, Bb^, F
  if (!/^[A-G]/.test(token)) return null;
  const rootMatch = token.match(/^([A-G][#b]?)/);
  if (!rootMatch) return null;
  const root = rootMatch[1];
  const rootPc = NOTE_PC[root];
  if (rootPc === undefined) return null;
  const quality = token.slice(root.length);
  const { scaleName, degrees } = chordQualityToScale(quality);
  const displayName = root + qualityToDisplay(quality);
  return { root, rootPc, quality, symbol: token, displayName, scaleName, degrees };
}

/**
 * Convert a note name (from iReal key field) to a display name from NOTES array.
 * e.g. "Bb" → "A#" (if NOTES uses sharps), or keep as-is.
 * Returns the pitch class index.
 * @param {string} keyName  e.g. "G", "Bb", "F#"
 * @returns {number}  pitch class 0-11
 */
export function keyNameToPc(keyName) {
  return NOTE_PC[keyName] ?? 0;
}
