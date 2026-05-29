import { describe, it, expect } from 'vitest';
import { computeFretNotes } from '../../src/domain/fretboard.js';
import { TUNING, FRET_START, FRET_END } from '../../src/domain/constants.js';

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
    // Fret 0 (open strings) is always shown regardless of mask
    masked.forEach(n => {
      if (n.fret !== 0) {
        expect(n.fret).toBeGreaterThanOrEqual(5);
        expect(n.fret).toBeLessThanOrEqual(7);
      }
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
});
