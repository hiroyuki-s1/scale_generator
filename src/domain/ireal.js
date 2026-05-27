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
 * @typedef {{ root: string, rootPc: number, quality: string, symbol: string, scaleName: string, degrees: number[] }} IrealChord
 */

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
  const style    = fields[2];
  const key      = fields[3];
  const keyPc    = NOTE_PC[key] ?? 0;

  // Chord data is field index 6; everything after is metadata (0s)
  const chordData = fields.slice(6).join('=').replace(/=[\d,]+$/, '');

  const chords = extractChords(chordData);

  return { title, composer, style, key, keyPc, chords };
}

/**
 * Extract all chord objects from raw iReal Pro chord data.
 * @param {string} raw
 * @returns {IrealChord[]}
 */
export function extractChords(raw) {
  // Strip text annotations <...>
  let s = raw.replace(/<[^>]*>/g, ' ');
  // Strip section markers *A *B *C *v *i etc.
  s = s.replace(/\*[A-Za-z]/g, ' ');
  // Strip time signatures T44 T34 T68 etc.
  s = s.replace(/T\d{2,}/g, ' ');
  // Strip structural chars: { } [ ] Z | \
  s = s.replace(/[{}[\]Z|\\]/g, ' ');
  // Strip single-char notation markers (not chord-starting letters)
  // Only remove them if they appear as standalone tokens
  s = s.replace(/\b([QESWpflus])\b/g, ' ');
  // Strip 'x' (repeat measure) and 'n' (no chord) standalone tokens
  s = s.replace(/\bx\b|\bn\b/g, ' ');

  // Tokenize: split on whitespace
  const tokens = s.split(/\s+/).filter(Boolean);

  const chords = [];
  for (const token of tokens) {
    const chord = parseChordToken(token);
    if (chord) chords.push(chord);
  }
  return chords;
}

/**
 * Parse a single chord token like "Cm7", "G7b9", "BbM7", "F#m7b5", "Ab^7".
 * Returns null for non-chord tokens.
 * @param {string} token
 * @returns {IrealChord|null}
 */
export function parseChordToken(token) {
  // Must start with A-G
  if (!/^[A-G]/.test(token)) return null;

  // Extract root: letter + optional accidental
  const rootMatch = token.match(/^([A-G][#b]?)/);
  if (!rootMatch) return null;

  const root = rootMatch[1];
  const rootPc = NOTE_PC[root];
  if (rootPc === undefined) return null;

  const quality = token.slice(root.length);

  // Reject tokens that are clearly not chords (single letters, etc.)
  // A valid chord token has a recognizable root; quality can be empty (major triad)
  const { scaleName, degrees } = chordQualityToScale(quality);

  return { root, rootPc, quality, symbol: token, scaleName, degrees };
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
