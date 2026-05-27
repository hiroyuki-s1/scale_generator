import { describe, it, expect } from 'vitest';
import { qualityToChordTones } from '../../src/domain/chordTones.js';

describe('qualityToChordTones', () => {
  it('empty quality → major triad (R M3 P5)', () => {
    expect(qualityToChordTones('')).toEqual([0, 4, 7]);
  });

  it('^7 → R M3 P5 M7', () => {
    expect(qualityToChordTones('^7')).toEqual([0, 4, 7, 11]);
  });

  it('M7 → R M3 P5 M7', () => {
    expect(qualityToChordTones('M7')).toEqual([0, 4, 7, 11]);
  });

  it('maj7 → R M3 P5 M7', () => {
    expect(qualityToChordTones('maj7')).toEqual([0, 4, 7, 11]);
  });

  it('m7 → R m3 P5 m7', () => {
    expect(qualityToChordTones('m7')).toEqual([0, 3, 7, 10]);
  });

  it('-7 → R m3 P5 m7', () => {
    expect(qualityToChordTones('-7')).toEqual([0, 3, 7, 10]);
  });

  it('7 → R M3 P5 m7', () => {
    expect(qualityToChordTones('7')).toEqual([0, 4, 7, 10]);
  });

  it('m7b5 → R m3 b5 m7', () => {
    expect(qualityToChordTones('m7b5')).toEqual([0, 3, 6, 10]);
  });

  it('h7 → R m3 b5 m7', () => {
    expect(qualityToChordTones('h7')).toEqual([0, 3, 6, 10]);
  });

  it('o7 → R m3 b5 d7', () => {
    expect(qualityToChordTones('o7')).toEqual([0, 3, 6, 9]);
  });

  it('dim7 → R m3 b5 d7', () => {
    expect(qualityToChordTones('dim7')).toEqual([0, 3, 6, 9]);
  });

  it('mM7 → R m3 P5 M7', () => {
    expect(qualityToChordTones('mM7')).toEqual([0, 3, 7, 11]);
  });

  it('m → minor triad', () => {
    expect(qualityToChordTones('m')).toEqual([0, 3, 7]);
  });

  it('7alt → R M3 m7 (simplified)', () => {
    expect(qualityToChordTones('7alt')).toEqual([0, 4, 10]);
  });

  it('7b9 → R b9 M3 P5 m7', () => {
    expect(qualityToChordTones('7b9')).toEqual([0, 1, 4, 7, 10]);
  });

  it('7#9 → R m3 M3 P5 m7', () => {
    expect(qualityToChordTones('7#9')).toEqual([0, 3, 4, 7, 10]);
  });

  it('7#11 → R M3 #11 P5 m7', () => {
    expect(qualityToChordTones('7#11')).toEqual([0, 4, 6, 7, 10]);
  });

  it('sus → R 11 P5', () => {
    expect(qualityToChordTones('sus')).toEqual([0, 5, 7]);
  });

  it('sus4 → R 11 P5', () => {
    expect(qualityToChordTones('sus4')).toEqual([0, 5, 7]);
  });

  it('sus2 → R 9 P5', () => {
    expect(qualityToChordTones('sus2')).toEqual([0, 2, 7]);
  });

  it('aug → R M3 b13', () => {
    expect(qualityToChordTones('aug')).toEqual([0, 4, 8]);
  });

  it('all results contain R (0)', () => {
    ['', 'm7', '7', '^7', 'm7b5', 'o7', '7alt', 'sus', '7b9', '7#11'].forEach(q => {
      expect(qualityToChordTones(q)).toContain(0);
    });
  });
});
