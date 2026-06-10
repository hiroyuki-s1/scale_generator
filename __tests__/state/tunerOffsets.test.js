import { describe, it, expect } from 'vitest';
import {
  clampOffset, defaultOffsets, sanitizeOffsetsMap, OFFSET_MAX,
} from '../../src/state/tunerOffsets.js';
import { SWEETENED } from '../../src/domain/tunings.js';

describe('clampOffset', () => {
  it('rounds to int and clamps to ±OFFSET_MAX', () => {
    expect(clampOffset(3.4)).toBe(3);
    expect(clampOffset(-2.6)).toBe(-3);
    expect(clampOffset(999)).toBe(OFFSET_MAX);
    expect(clampOffset(-999)).toBe(-OFFSET_MAX);
  });
  it('non-finite → 0', () => {
    expect(clampOffset(NaN)).toBe(0);
    expect(clampOffset('x')).toBe(0);
    expect(clampOffset(undefined)).toBe(0);
  });
});

describe('defaultOffsets', () => {
  it('clones the SWEETENED preset (not the same reference)', () => {
    const d = defaultOffsets();
    expect(d.guitar).toEqual(SWEETENED.guitar);
    expect(d.bass).toEqual(SWEETENED.bass);
    expect(d.guitar).not.toBe(SWEETENED.guitar);
  });
});

describe('sanitizeOffsetsMap', () => {
  it('returns defaults for junk input', () => {
    expect(sanitizeOffsetsMap(null)).toEqual(defaultOffsets());
    expect(sanitizeOffsetsMap('nope')).toEqual(defaultOffsets());
    expect(sanitizeOffsetsMap(42)).toEqual(defaultOffsets());
  });

  it('coerces to correct lengths (guitar 6 / bass 4)', () => {
    const out = sanitizeOffsetsMap({ guitar: [1, 2], bass: [9, 9, 9, 9, 9, 9] });
    expect(out.guitar).toHaveLength(6);
    expect(out.bass).toHaveLength(4);
    // 欠けた弦は既定で埋める
    expect(out.guitar[0]).toBe(1);
    expect(out.guitar[1]).toBe(2);
    expect(out.guitar[2]).toBe(defaultOffsets().guitar[2]);
  });

  it('clamps and rounds each value', () => {
    const out = sanitizeOffsetsMap({ guitar: [100, -100, 2.6, 0, 0, 0], bass: [0, 0, 0, 0] });
    expect(out.guitar[0]).toBe(OFFSET_MAX);
    expect(out.guitar[1]).toBe(-OFFSET_MAX);
    expect(out.guitar[2]).toBe(3);
  });

  it('round-trips a valid map unchanged', () => {
    const m = { guitar: [-1, -4, -2, -1, 0, 0], bass: [-1, -1, 0, 0] };
    expect(sanitizeOffsetsMap(m)).toEqual(m);
  });
});
