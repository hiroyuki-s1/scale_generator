import { describe, it, expect } from 'vitest';
import { diffFretNotes, noteKey } from '../../src/domain/fretboard.js';

const baseState = {
  rootIndex: 9,
  activeDegrees: new Set([0, 3, 5, 7, 10]), // A Minor Penta
  mask: { enabled: false, min: 1, max: 15 },
};

describe('diffFretNotes', () => {
  it('returns all added and no removed when prev is null', () => {
    const { added, removed } = diffFretNotes(null, baseState);
    expect(added.length).toBeGreaterThan(0);
    expect(removed).toEqual([]);
  });

  it('returns empty diff for identical state', () => {
    const { added, removed } = diffFretNotes(baseState, baseState);
    expect(added).toEqual([]);
    expect(removed).toEqual([]);
  });

  it('toggling one degree off shows up as removed', () => {
    const prev = baseState;
    const next = {
      ...baseState,
      activeDegrees: new Set([0, 3, 5, 7]), // m7 removed
    };
    const { added, removed } = diffFretNotes(prev, next);
    expect(added).toEqual([]);
    expect(removed.length).toBeGreaterThan(0);
    removed.forEach(n => expect(n.degree).toBe(10));
  });

  it('narrowing the mask range removes notes outside the new range', () => {
    const prev = { ...baseState, mask: { enabled: true, min: 1, max: 15 } };
    const next = { ...baseState, mask: { enabled: true, min: 5, max: 7 } };
    const { added, removed } = diffFretNotes(prev, next);
    expect(added).toEqual([]);
    expect(removed.length).toBeGreaterThan(0);
    removed.forEach(n => {
      const outOfRange = n.fret < 5 || n.fret > 7;
      expect(outOfRange).toBe(true);
    });
  });

  it('widening the mask range adds notes inside the newly-visible region', () => {
    const prev = { ...baseState, mask: { enabled: true, min: 5, max: 7 } };
    const next = { ...baseState, mask: { enabled: true, min: 1, max: 10 } };
    const { added, removed } = diffFretNotes(prev, next);
    expect(removed).toEqual([]);
    expect(added.length).toBeGreaterThan(0);
    added.forEach(n => {
      const inNewRange = (n.fret >= 1 && n.fret < 5) || (n.fret > 7 && n.fret <= 10);
      expect(inNewRange).toBe(true);
    });
  });

  it('noteKey produces a stable identifier suitable for DOM lookups', () => {
    expect(noteKey({ string: 5, fret: 5, degree: 0 })).toBe('5-5-0');
  });
});
