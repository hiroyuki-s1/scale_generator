import { describe, it, expect } from 'vitest';
import {
  SCALE_GROUPS,
  CHORD_GROUPS,
  findPresetEverywhere,
} from '../../src/domain/constants.js';

describe('preset groups', () => {
  it('scale group names are stable', () => {
    expect(SCALE_GROUPS.map(g => g.label)).toEqual(['Penta', 'Diatonic', 'Advanced']);
  });
  it('chord group names are stable', () => {
    expect(CHORD_GROUPS.map(g => g.label)).toEqual(['Triad', '7th', 'Extended']);
  });
  it('every preset has degrees starting at 0 (root)', () => {
    [...SCALE_GROUPS, ...CHORD_GROUPS].forEach(g => {
      g.presets.forEach(p => {
        expect(p.degrees[0]).toBe(0);
        // degrees are in 0-11 semitone space
        p.degrees.forEach(d => expect(d).toBeGreaterThanOrEqual(0));
        p.degrees.forEach(d => expect(d).toBeLessThan(12));
      });
    });
  });
});

describe('findPresetEverywhere', () => {
  it('finds scale presets and reports mode=scale', () => {
    const r = findPresetEverywhere('Minor Penta');
    expect(r).not.toBeNull();
    expect(r.mode).toBe('scale');
    expect(r.preset.degrees).toEqual([0, 3, 5, 7, 10]);
  });
  it('finds chord presets and reports mode=chord', () => {
    const r = findPresetEverywhere('maj7');
    expect(r).not.toBeNull();
    expect(r.mode).toBe('chord');
    expect(r.preset.degrees).toEqual([0, 4, 7, 11]);
  });
  it('returns null for unknown names', () => {
    expect(findPresetEverywhere('does-not-exist')).toBeNull();
  });
});
