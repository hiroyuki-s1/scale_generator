import { describe, it, expect } from 'vitest';
import { scalePitchClassSet, classifyAgainstScale } from '../../src/domain/scalePractice.js';

// C メジャー（Ionian）= 度数 {0,2,4,5,7,9,11}、root C=0
const C_MAJOR = new Set([0, 2, 4, 5, 7, 9, 11]);

describe('scalePitchClassSet', () => {
  it('C major → C D E F G A B (0 2 4 5 7 9 11)', () => {
    const s = scalePitchClassSet(0, C_MAJOR);
    expect([...s].sort((a, b) => a - b)).toEqual([0, 2, 4, 5, 7, 9, 11]);
  });
  it('transposes with root: G major → G A B C D E F# (7 9 11 0 2 4 6)', () => {
    const s = scalePitchClassSet(7, C_MAJOR);
    expect([...s].sort((a, b) => a - b)).toEqual([0, 2, 4, 6, 7, 9, 11]);
  });
  it('accepts an array for activeDegrees', () => {
    const s = scalePitchClassSet(0, [0, 4, 7]); // major triad
    expect([...s].sort((a, b) => a - b)).toEqual([0, 4, 7]);
  });
});

describe('classifyAgainstScale (C major)', () => {
  it('E (4) is in scale = M3', () => {
    const r = classifyAgainstScale(4, 0, C_MAJOR);
    expect(r.inScale).toBe(true);
    expect(r.degree).toBe(4);
    expect(r.degreeName).toBe('M3');
    expect(r.isRoot).toBe(false);
  });
  it('C (0) is the root', () => {
    const r = classifyAgainstScale(0, 0, C_MAJOR);
    expect(r.inScale).toBe(true);
    expect(r.isRoot).toBe(true);
    expect(r.degreeName).toBe('R');
  });
  it('F# (6) is OUT of C major', () => {
    const r = classifyAgainstScale(6, 0, C_MAJOR);
    expect(r.inScale).toBe(false);
    expect(r.degreeName).toBeNull();
  });
  it('works transposed: in A minor, C(0) is m3', () => {
    // A natural minor = A B C D E F G = degrees from A(9): {0,2,3,5,7,8,10}
    const aMinor = new Set([0, 2, 3, 5, 7, 8, 10]);
    const r = classifyAgainstScale(0, 9, aMinor); // C against root A
    expect(r.inScale).toBe(true);
    expect(r.degree).toBe(3);
    expect(r.degreeName).toBe('m3');
  });
  it('out-of-scale transposed: A# (10) is out of C major', () => {
    expect(classifyAgainstScale(10, 0, C_MAJOR).inScale).toBe(false);
  });
});
