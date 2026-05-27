import { describe, it, expect } from 'vitest';
import { parseIrealUrl, extractChords, parseChordToken, extractIrealUrl } from '../../src/domain/ireal.js';

// Simplified iReal URL (old format: 7 fields, key at index 3)
const AUTUMN_LEAVES_URL =
  'irealb://Autumn%20Leaves=Joseph%20Kosma=Medium%20Swing=Bb=n=0=' +
  '*A{Cm7 |F7 |BbM7 |EbM7 |Am7b5 |D7b9 |Gm7 |Gm7 }' +
  '*B{Am7b5 |D7b9 |Gm7 |Gm7 |Cm7 |F7 |BbM7 |EbM7 }' +
  '*C{Am7b5 |D7b9 |Gm7 |Gm6 }Z=0=0=0=0=0';

// Actual iReal Pro export format (new format: empty fields at positions 2 and 5, key at index 4)
// Chord data uses obfuscated notation: ^bB=BbM7, hA=Am7b5, C-7=Cm7
const AUTUMN_LEAVES_ACTUAL_URL =
  'irealb://Autumn%20Leaves=Kosma%20Joseph==Medium%20Swing=G-==' +
  '1r34LbKcu7QyX314C%2D7XyX7hA%7CQyX7%5EbE%7CyQX7%5EbB%7CQyX7F%7CQyQ%7CD7b4T%7BA%2AQyX7%2DyQKclcKQyX6%2DG%7CQyX317bD%7CQyX7hA%5BB%2A%7D%20%20l%20LZCX6%2DG%7CL7bG%20Q%7CBb%5EyX31b7D%7CQyX7hAC%5B%2A%5DQyX7%5EbE%7CQyX7Q%7CG%2D7yX7F%7CZF%2D7%20E7LZAh7XyQ%7CD7b13XyQ%7CG%2D6XyQKcl%20%20Z==83=0';

// HTML export from iReal Pro (as produced by "Autumn Leaves.html")
const AUTUMN_LEAVES_HTML = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
  <head><title>iReal Pro</title></head>
  <body>
    <a href="${AUTUMN_LEAVES_ACTUAL_URL}">Autumn Leaves</a>
  </body>
</html>`;

describe('parseChordToken — standard root-first', () => {
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

  it('parses G-7 (iReal minus notation)', () => {
    const c = parseChordToken('G-7');
    expect(c.root).toBe('G');
    expect(c.scaleName).toBe('Dorian');
  });

  it('parses C-7', () => {
    const c = parseChordToken('C-7');
    expect(c.root).toBe('C');
    expect(c.scaleName).toBe('Dorian');
  });

  it('parses Gm6', () => {
    const c = parseChordToken('Gm6');
    expect(c.root).toBe('G');
    expect(c.scaleName).toBe('Minor Penta');
  });

  it('parses Bb^ (maj7 with caret suffix)', () => {
    const c = parseChordToken('Bb^');
    expect(c.root).toBe('Bb');
    expect(c.scaleName).toBe('Ionian');
  });

  it('returns null for non-chord tokens', () => {
    expect(parseChordToken('x')).toBeNull();
    expect(parseChordToken('n')).toBeNull();
    expect(parseChordToken('Q')).toBeNull();
    expect(parseChordToken('7')).toBeNull();
  });
});

describe('parseChordToken — quality-first (iReal Pro obfuscated)', () => {
  it('parses ^bB → Bbmaj7', () => {
    const c = parseChordToken('^bB');
    expect(c).not.toBeNull();
    expect(c.root).toBe('Bb');
    expect(c.rootPc).toBe(10);
    expect(c.scaleName).toBe('Ionian');
  });

  it('parses ^bE → Ebmaj7', () => {
    const c = parseChordToken('^bE');
    expect(c.root).toBe('Eb');
    expect(c.rootPc).toBe(3);
    expect(c.scaleName).toBe('Ionian');
  });

  it('parses hA → Am7b5', () => {
    const c = parseChordToken('hA');
    expect(c.root).toBe('A');
    expect(c.rootPc).toBe(9);
    expect(c.scaleName).toBe('Locrian');
  });

  it('parses -G → Gm', () => {
    const c = parseChordToken('-G');
    expect(c.root).toBe('G');
    expect(c.rootPc).toBe(7);
    expect(c.scaleName).toBe('Minor Penta');
  });

  it('parses oG → G diminished', () => {
    const c = parseChordToken('oG');
    expect(c.root).toBe('G');
    expect(c.scaleName).toBe('Diminished');
  });

  it('every quality-first chord has root, rootPc, scaleName, degrees', () => {
    ['^bB', 'hA', '-G', '^bE', 'oC'].forEach(token => {
      const c = parseChordToken(token);
      expect(c).not.toBeNull();
      expect(c.root).toBeTruthy();
      expect(typeof c.rootPc).toBe('number');
      expect(c.scaleName).toBeTruthy();
      expect(Array.isArray(c.degrees)).toBe(true);
    });
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

  it('extracts quality-first chords embedded in noise (^bE from QyX7^bE)', () => {
    const chords = extractChords('QyX7^bE|QyX7^bB|hAQyX');
    const symbols = chords.map(c => c.symbol);
    expect(symbols).toContain('^bE');
    expect(symbols).toContain('^bB');
    expect(symbols).toContain('hA');
  });

  it('extracts G-6 embedded in noise', () => {
    const chords = extractChords('G-6XyQ');
    expect(chords.some(c => c.symbol === 'G-6')).toBe(true);
    expect(chords.find(c => c.symbol === 'G-6').scaleName).toBe('Minor Penta');
  });

  it('extracts D7b13 from D7b13XyQ', () => {
    const chords = extractChords('D7b13XyQ');
    expect(chords.some(c => c.symbol === 'D7b13')).toBe(true);
    expect(chords.find(c => c.symbol === 'D7b13').scaleName).toBe('Altered');
  });
});

describe('parseIrealUrl — old format (key at field 3)', () => {
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

describe('parseIrealUrl — new format (key at field 4, empty fields at 2 and 5)', () => {
  it('parses title and key (G minor) from new-format URL', () => {
    const song = parseIrealUrl(AUTUMN_LEAVES_ACTUAL_URL);
    expect(song.title).toBe('Autumn Leaves');
    expect(song.key).toBe('G-');
    expect(song.keyPc).toBe(7);  // G = pitch class 7
  });

  it('extracts chords from obfuscated chord data', () => {
    const { chords } = parseIrealUrl(AUTUMN_LEAVES_ACTUAL_URL);
    expect(chords.length).toBeGreaterThan(0);
  });

  it('finds Cm7 (C-7 notation) in actual chord data', () => {
    const { chords } = parseIrealUrl(AUTUMN_LEAVES_ACTUAL_URL);
    const cm7 = chords.find(c => c.root === 'C' && c.scaleName === 'Dorian');
    expect(cm7).toBeTruthy();
  });

  it('finds Am7b5 (hA notation) in actual chord data', () => {
    const { chords } = parseIrealUrl(AUTUMN_LEAVES_ACTUAL_URL);
    const am7b5 = chords.find(c => c.root === 'A' && c.scaleName === 'Locrian');
    expect(am7b5).toBeTruthy();
  });

  it('finds Ebmaj7 (^bE notation) in actual chord data', () => {
    const { chords } = parseIrealUrl(AUTUMN_LEAVES_ACTUAL_URL);
    const ebM7 = chords.find(c => c.root === 'Eb' && c.scaleName === 'Ionian');
    expect(ebM7).toBeTruthy();
  });

  it('finds Bbmaj7 (^bB notation) in actual chord data', () => {
    const { chords } = parseIrealUrl(AUTUMN_LEAVES_ACTUAL_URL);
    const bbM7 = chords.find(c => c.root === 'Bb' && c.scaleName === 'Ionian');
    expect(bbM7).toBeTruthy();
  });

  it('accepts HTML content directly', () => {
    const song = parseIrealUrl(AUTUMN_LEAVES_HTML);
    expect(song.title).toBe('Autumn Leaves');
    expect(song.key).toBe('G-');
    expect(song.keyPc).toBe(7);
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
