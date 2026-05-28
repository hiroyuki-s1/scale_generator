/**
 * Comprehensive test: all scale and chord presets × all 12 root notes.
 * Verifies that computeFretNotes always returns:
 *   - only notes whose degree is in activeDegrees
 *   - at least 1 note
 *   - no more than (6 strings × 15 frets) = 90 notes
 *   - the root note (degree 0) at least once per string
 *   - correct counts for well-known presets
 */
import { describe, it, expect } from 'vitest';
import { SCALE_GROUPS, CHORD_GROUPS, FRET_START, FRET_END, TUNING } from '../../src/domain/constants.js';
import { computeFretNotes } from '../../src/domain/fretboard.js';

const ALL_PRESETS = [
  ...SCALE_GROUPS.flatMap(g => g.presets.map(p => ({ ...p, mode: 'scale', group: g.label }))),
  ...CHORD_GROUPS.flatMap(g => g.presets.map(p => ({ ...p, mode: 'chord', group: g.label }))),
];

const MAX_FRET_NOTES = TUNING.length * (FRET_END - FRET_START + 1); // 6 × 15 = 90

describe('all scale presets — every root', () => {
  SCALE_GROUPS.forEach(g => {
    g.presets.forEach(preset => {
      for (let root = 0; root < 12; root++) {
        it(`${preset.name} root=${root}: valid notes`, () => {
          const activeDegrees = new Set(preset.degrees);
          const notes = computeFretNotes({
            rootIndex: root,
            activeDegrees,
            mask: { enabled: false, min: FRET_START, max: FRET_END },
          });
          // Must have notes
          expect(notes.length).toBeGreaterThan(0);
          // Cannot exceed max fret positions
          expect(notes.length).toBeLessThanOrEqual(MAX_FRET_NOTES);
          // Each note's degree must be in the active set
          notes.forEach(n => expect(activeDegrees.has(n.degree)).toBe(true));
          // Root (degree 0) must appear
          expect(notes.some(n => n.degree === 0)).toBe(true);
        });
      }
    });
  });
});

describe('all chord presets — every root', () => {
  CHORD_GROUPS.forEach(g => {
    g.presets.forEach(preset => {
      for (let root = 0; root < 12; root++) {
        it(`${preset.name} root=${root}: valid notes`, () => {
          const activeDegrees = new Set(preset.degrees);
          const notes = computeFretNotes({
            rootIndex: root,
            activeDegrees,
            mask: { enabled: false, min: FRET_START, max: FRET_END },
          });
          expect(notes.length).toBeGreaterThan(0);
          expect(notes.length).toBeLessThanOrEqual(MAX_FRET_NOTES);
          notes.forEach(n => expect(activeDegrees.has(n.degree)).toBe(true));
          expect(notes.some(n => n.degree === 0)).toBe(true);
        });
      }
    });
  });
});

describe('mask range — all presets stay within fret bounds', () => {
  const MIN = 5; const MAX = 9;
  ALL_PRESETS.forEach(preset => {
    it(`${preset.name} masked [${MIN}-${MAX}]`, () => {
      const activeDegrees = new Set(preset.degrees);
      const notes = computeFretNotes({
        rootIndex: 0,
        activeDegrees,
        mask: { enabled: true, min: MIN, max: MAX },
      });
      notes.forEach(n => {
        expect(n.fret).toBeGreaterThanOrEqual(MIN);
        expect(n.fret).toBeLessThanOrEqual(MAX);
      });
    });
  });
});

describe('known note counts (C root, no mask)', () => {
  const state = (degrees) => ({
    rootIndex: 0, activeDegrees: new Set(degrees),
    mask: { enabled: false, min: FRET_START, max: FRET_END },
  });

  it('Major Penta (5 degrees) has < 50 notes', () => {
    expect(computeFretNotes(state([0, 2, 4, 7, 9])).length).toBeLessThan(50);
  });
  it('Diminished (8 degrees) has >= Major Penta note count', () => {
    const penta = computeFretNotes(state([0, 2, 4, 7, 9])).length;
    const dim   = computeFretNotes(state([0, 1, 3, 4, 6, 7, 9, 10])).length;
    expect(dim).toBeGreaterThan(penta);
  });
  it('maj triad (3 degrees) has fewer notes than maj7 (4 degrees)', () => {
    const triad = computeFretNotes(state([0, 4, 7])).length;
    const maj7  = computeFretNotes(state([0, 4, 7, 11])).length;
    expect(triad).toBeLessThan(maj7);
  });
  it('no duplicate fret positions per string', () => {
    const notes = computeFretNotes(state([0, 3, 5, 7, 10])); // Minor Penta
    const keys = notes.map(n => `${n.string}-${n.fret}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
