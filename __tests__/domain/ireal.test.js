import { describe, it, expect } from 'vitest';
import { parseIrealUrl, extractChords, parseChordToken, extractIrealUrl } from '../../src/domain/ireal.js';

// Real iReal Pro URL for Autumn Leaves (simplified)
const AUTUMN_LEAVES_URL =
  'irealb://Autumn%20Leaves=Joseph%20Kosma=Medium%20Swing=Bb=n=0=' +
  '*A{Cm7 |F7 |BbM7 |EbM7 |Am7b5 |D7b9 |Gm7 |Gm7 }' +
  '*B{Am7b5 |D7b9 |Gm7 |Gm7 |Cm7 |F7 |BbM7 |EbM7 }' +
  '*C{Am7b5 |D7b9 |Gm7 |Gm6 }Z=0=0=0=0=0';

describe('parseChordToken', () => {
  it('parses plain major triad', () => {
    const c = parseChordToken('C');
    expect(c).not.toBeNull();
    expect(c.root).toBe('C');
    expect(c.rootPc).toBe(0);
    expect(c.quality).toBe('');
  });

  it('parses Cm7', () => {
    const c = parseChordToken('Cm7');
    expect(c.root).toBe('C');
    expect(c.quality).toBe('m7');
    expect(c.scaleName).toBe('Dorian');
  });

  it('parses BbM7', () => {
    const c = parseChordToken('BbM7');
    expect(c.root).toBe('Bb');
    expect(c.rootPc).toBe(10);
    expect(c.quality).toBe('M7');
    expect(c.scaleName).toBe('Ionian');
  });

  it('parses G7b9', () => {
    const c = parseChordToken('G7b9');
    expect(c.root).toBe('G');
    expect(c.scaleName).toBe('Altered');
  });

  it('parses Am7b5', () => {
    const c = parseChordToken('Am7b5');
    expect(c.root).toBe('A');
    expect(c.scaleName).toBe('Locrian');
  });

  it('parses F#m7', () => {
    const c = parseChordToken('F#m7');
    expect(c.root).toBe('F#');
    expect(c.rootPc).toBe(6);
  });

  it('returns null for non-chord tokens', () => {
    expect(parseChordToken('x')).toBeNull();
    expect(parseChordToken('n')).toBeNull();
    expect(parseChordToken('Q')).toBeNull();
  });
});

describe('extractChords', () => {
  it('extracts chords from a simple chord data string', () => {
    const chords = extractChords('Cm7 |F7 |BbM7 |Gm7 ');
    expect(chords.map(c => c.symbol)).toEqual(['Cm7', 'F7', 'BbM7', 'Gm7']);
  });

  it('strips section markers', () => {
    const chords = extractChords('*A{Cm7 |F7 }*B{Gm7 }');
    expect(chords.map(c => c.symbol)).toEqual(['Cm7', 'F7', 'Gm7']);
  });

  it('strips time signatures', () => {
    const chords = extractChords('T44 Cm7 |F7 T34 Gm7 ');
    expect(chords.map(c => c.symbol)).toEqual(['Cm7', 'F7', 'Gm7']);
  });

  it('strips x (repeat) and n (no chord)', () => {
    const chords = extractChords('Cm7 |x |n |F7 ');
    expect(chords.map(c => c.symbol)).toEqual(['Cm7', 'F7']);
  });
});

describe('parseIrealUrl', () => {
  it('parses title, composer, style, key from Autumn Leaves', () => {
    const song = parseIrealUrl(AUTUMN_LEAVES_URL);
    expect(song.title).toBe('Autumn Leaves');
    expect(song.composer).toBe('Joseph Kosma');
    expect(song.style).toBe('Medium Swing');
    expect(song.key).toBe('Bb');
    expect(song.keyPc).toBe(10);
  });

  it('returns non-empty chords array', () => {
    const { chords } = parseIrealUrl(AUTUMN_LEAVES_URL);
    expect(chords.length).toBeGreaterThan(0);
  });

  it('first chord of Autumn Leaves is Cm7 → Dorian', () => {
    const { chords } = parseIrealUrl(AUTUMN_LEAVES_URL);
    expect(chords[0].symbol).toBe('Cm7');
    expect(chords[0].scaleName).toBe('Dorian');
  });

  it('throws on invalid URL', () => {
    expect(() => parseIrealUrl('irealb://foo=bar')).toThrow();
  });

  it('handles irealb:// scheme prefix', () => {
    expect(() => parseIrealUrl(AUTUMN_LEAVES_URL)).not.toThrow();
  });

  it('every chord has root, rootPc, scaleName, degrees', () => {
    const { chords } = parseIrealUrl(AUTUMN_LEAVES_URL);
    chords.forEach(c => {
      expect(c.root).toBeTruthy();
      expect(typeof c.rootPc).toBe('number');
      expect(c.scaleName).toBeTruthy();
      expect(Array.isArray(c.degrees)).toBe(true);
      expect(c.degrees).toContain(0);
    });
  });
});

describe('extractIrealUrl', () => {
  const RAW_URL = 'irealb://Autumn%20Leaves=Joseph%20Kosma=Medium%20Swing=Bb=n=0=*A{Cm7 }Z=0=0=0=0=0';

  it('extracts URL from HTML href attribute (double quotes)', () => {
    const html = `<html><body><a href="${RAW_URL}">Open in iReal Pro</a></body></html>`;
    expect(extractIrealUrl(html)).toBe(RAW_URL);
  });

  it('extracts URL from HTML href attribute (single quotes)', () => {
    const html = `<a href='${RAW_URL}'>Open</a>`;
    expect(extractIrealUrl(html)).toBe(RAW_URL);
  });

  it('extracts bare irealb:// from plain text', () => {
    expect(extractIrealUrl(RAW_URL)).toBe(RAW_URL);
  });

  it('throws when no URL found', () => {
    expect(() => extractIrealUrl('<html><body>no url here</body></html>')).toThrow();
  });

  it('parseIrealUrl accepts HTML content directly', () => {
    const html = `<html><body><a href="${RAW_URL}">Open</a></body></html>`;
    const song = parseIrealUrl(html);
    expect(song.title).toBe('Autumn Leaves');
  });
});
