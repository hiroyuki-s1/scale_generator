import { describe, it, expect } from 'vitest';
import { computeFretNotes, diffFretNotes } from '../../src/domain/fretboard.js';
import { TUNING, TUNING_BASS, FRET_START, FRET_END } from '../../src/domain/constants.js';

describe('computeFretNotes', () => {
  it('returns empty when no degrees active', () => {
    const notes = computeFretNotes({
      rootIndex: 9,
      activeDegrees: new Set(),
      mask: { enabled: false, min: 1, max: 15 },
    });
    expect(notes).toEqual([]);
  });

  it('A Minor Penta: contains the A root at 6th string fret 5 (E2 + 5 = A2)', () => {
    const notes = computeFretNotes({
      rootIndex: 9,
      activeDegrees: new Set([0, 3, 5, 7, 10]),
      mask: { enabled: false, min: 1, max: 15 },
    });
    const aRoots = notes.filter(n => n.degree === 0);
    // 6弦5フレットの A2 が含まれる
    const e2_a = aRoots.find(n => n.string === 5 && n.fret === 5);
    expect(e2_a).toBeDefined();
    expect(e2_a.midi).toBe(TUNING[5] + 5);
  });

  it('mask filters notes outside the range', () => {
    const all = computeFretNotes({
      rootIndex: 9,
      activeDegrees: new Set([0, 3, 5, 7, 10]),
      mask: { enabled: false, min: 1, max: 15 },
    });
    const masked = computeFretNotes({
      rootIndex: 9,
      activeDegrees: new Set([0, 3, 5, 7, 10]),
      mask: { enabled: true, min: 5, max: 7 },
    });
    expect(masked.length).toBeLessThan(all.length);
    masked.forEach(n => {
      expect(n.fret).toBeGreaterThanOrEqual(5);
      expect(n.fret).toBeLessThanOrEqual(7);
    });
  });

  it('every returned note has a degree present in activeDegrees', () => {
    const active = new Set([0, 4, 7]); // R, M3, P5 — Major triad
    const notes = computeFretNotes({
      rootIndex: 0,
      activeDegrees: active,
      mask: { enabled: false, min: FRET_START, max: FRET_END },
    });
    expect(notes.length).toBeGreaterThan(0);
    notes.forEach(n => expect(active.has(n.degree)).toBe(true));
  });

  // ── Bass instrument ────────────────────────────────────────────────
  it('bass: only 4 strings (string indices 0-3)', () => {
    const notes = computeFretNotes({
      rootIndex: 9,
      activeDegrees: new Set([0, 3, 5, 7, 10]),
      mask: { enabled: false, min: FRET_START, max: FRET_END },
      instrument: 'bass',
    });
    expect(notes.length).toBeGreaterThan(0);
    const strings = [...new Set(notes.map(n => n.string))];
    expect(strings.every(s => s >= 0 && s <= 3)).toBe(true);
    expect(strings.length).toBeLessThanOrEqual(4);
  });

  it('bass: fewer notes than guitar for same scale (4 vs 6 strings)', () => {
    const state = {
      rootIndex: 9,
      activeDegrees: new Set([0, 3, 5, 7, 10]),
      mask: { enabled: false, min: FRET_START, max: FRET_END },
    };
    const guitar = computeFretNotes({ ...state, instrument: 'guitar' });
    const bass   = computeFretNotes({ ...state, instrument: 'bass' });
    expect(bass.length).toBeLessThan(guitar.length);
  });

  it('bass: MIDI values use TUNING_BASS (G2=43, D2=38, A2=33, E2=28)', () => {
    // Open strings (fret 0) should produce MIDIs from TUNING_BASS
    const notes = computeFretNotes({
      rootIndex: 0,
      activeDegrees: new Set([...Array(12).keys()]), // all 12 degrees
      mask: { enabled: false, min: 0, max: 0 }, // fret 0 only
      instrument: 'bass',
    });
    const openMidis = notes.filter(n => n.fret === 0).map(n => n.midi).sort((a,b) => a-b);
    TUNING_BASS.forEach(expected => {
      expect(openMidis).toContain(expected);
    });
  });

  it('bass: A root at 4th string fret 5 (E2=28 + 5 = A2=33? no, 28+5=33=A2 yes)', () => {
    // TUNING_BASS[3] = 28 (E2), fret 5 = 28+5=33 = A2
    const notes = computeFretNotes({
      rootIndex: 9, // A
      activeDegrees: new Set([0]),
      mask: { enabled: false, min: 0, max: 22 },
      instrument: 'bass',
    });
    const aRoot4thString = notes.find(n => n.string === 3 && n.fret === 5);
    expect(aRoot4thString).toBeDefined();
    expect(aRoot4thString.midi).toBe(TUNING_BASS[3] + 5);
  });

  it('instrument defaults to guitar when omitted', () => {
    const noInstrument = computeFretNotes({
      rootIndex: 9,
      activeDegrees: new Set([0]),
      mask: { enabled: false, min: FRET_START, max: FRET_END },
    });
    const explicit = computeFretNotes({
      rootIndex: 9,
      activeDegrees: new Set([0]),
      mask: { enabled: false, min: FRET_START, max: FRET_END },
      instrument: 'guitar',
    });
    expect(noInstrument).toEqual(explicit);
  });
});

// ── diffFretNotes: instrument switch ──────────────────────────────────────
describe('diffFretNotes: guitar ↔ bass', () => {
  const base = {
    rootIndex: 9,
    activeDegrees: new Set([0, 3, 5, 7, 10]),
    mask: { enabled: false, min: FRET_START, max: FRET_END },
  };

  it('switching guitar→bass removes guitar-only strings (4,5) completely', () => {
    const prev = { ...base, instrument: 'guitar' };
    const next = { ...base, instrument: 'bass' };
    const { removed } = diffFretNotes(prev, next);
    // Guitar strings 4 and 5 (high E, B) should be entirely removed
    const removedStrings = [...new Set(removed.map(n => n.string))];
    expect(removedStrings).toContain(4);
    expect(removedStrings).toContain(5);
  });

  it('switching bass→guitar adds guitar-only strings (4,5)', () => {
    const prev = { ...base, instrument: 'bass' };
    const next = { ...base, instrument: 'guitar' };
    const { added } = diffFretNotes(prev, next);
    const addedStrings = [...new Set(added.map(n => n.string))];
    expect(addedStrings).toContain(4);
    expect(addedStrings).toContain(5);
  });
});
