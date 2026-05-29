import { describe, it, expect } from 'vitest';
import { buildTitle, keyLabel } from '../../src/domain/title.js';

describe('keyLabel', () => {
  it('returns correct sharp note names', () => {
    expect(keyLabel(0)).toBe('C');
    expect(keyLabel(1)).toBe('C#');
    expect(keyLabel(9)).toBe('A');
    expect(keyLabel(11)).toBe('B');
  });
  it('wraps modulo 12', () => {
    expect(keyLabel(12)).toBe('C');
    expect(keyLabel(-1)).toBe('B');
  });
});

describe('buildTitle', () => {
  it('uses preset name with space for scales', () => {
    expect(buildTitle({
      rootIndex: 9,
      activeDegrees: new Set([0, 3, 5, 7, 10]),
      presetName: 'Minor Penta',
      mode: 'scale',
    })).toBe('A Minor Penta');
  });
  it('uses tight format (no space) for chords', () => {
    expect(buildTitle({
      rootIndex: 0,
      activeDegrees: new Set([0, 4, 7, 11]),
      presetName: 'maj7',
      mode: 'chord',
    })).toBe('Cmaj7');
  });
  it('falls back to custom listing when presetName is null', () => {
    expect(buildTitle({
      rootIndex: 0,
      activeDegrees: new Set([0, 3, 7]),
      presetName: null,
    })).toBe('C (R, m3, P5)');
  });
});
