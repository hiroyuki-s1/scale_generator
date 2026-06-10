import { describe, it, expect } from 'vitest';
import {
  beatHz, centsOff, advanceStrobePhase, wrap01, isLocked,
} from '../../src/domain/strobe.js';

describe('beatHz / centsOff', () => {
  it('beat is detected − target', () => {
    expect(beatHz(441, 440)).toBeCloseTo(1, 9);
    expect(beatHz(439, 440)).toBeCloseTo(-1, 9);
  });
  it('centsOff sign: sharp positive / flat negative', () => {
    expect(centsOff(440, 440)).toBeCloseTo(0, 9);
    expect(centsOff(445, 440)).toBeGreaterThan(0);
    expect(centsOff(435, 440)).toBeLessThan(0);
  });
  it('centsOff guards non-positive', () => {
    expect(centsOff(0, 440)).toBe(0);
    expect(centsOff(440, 0)).toBe(0);
  });
});

describe('wrap01', () => {
  it('wraps into [0,1)', () => {
    expect(wrap01(0.3)).toBeCloseTo(0.3, 9);
    expect(wrap01(1.3)).toBeCloseTo(0.3, 9);
    expect(wrap01(-0.2)).toBeCloseTo(0.8, 9);
    expect(wrap01(Infinity)).toBe(0);
  });
});

describe('advanceStrobePhase', () => {
  it('in-tune (beat 0) keeps phase static', () => {
    expect(advanceStrobePhase(0.42, 440, 440, 0.1)).toBeCloseTo(0.42, 9);
  });

  it('sharp drifts phase forward, flat backward', () => {
    expect(advanceStrobePhase(0, 441, 440, 0.25)).toBeCloseTo(0.25, 6); // +1Hz * 0.25s
    expect(advanceStrobePhase(0, 439, 440, 0.25)).toBeCloseTo(0.75, 6); // -1Hz → wrap
  });

  it('integrates tiny errors over time (high sensitivity)', () => {
    // 0.02Hz のズレでも 5 秒で 0.1 周ぶん動く → 視認可能。
    let p = 0;
    for (let i = 0; i < 50; i++) p = advanceStrobePhase(p, 440.02, 440, 0.1);
    expect(p).toBeCloseTo(0.1, 4);
  });

  it('speedScale slows the drift', () => {
    expect(advanceStrobePhase(0, 444, 440, 0.25, 0.25)).toBeCloseTo(0.25, 6); // 4Hz*0.25*0.25
  });

  it('guards bad input', () => {
    expect(advanceStrobePhase(0.3, 0, 440, 0.1)).toBeCloseTo(0.3, 9);
    expect(advanceStrobePhase(0.3, 440, 0, 0.1)).toBeCloseTo(0.3, 9);
  });
});

describe('isLocked', () => {
  it('true within tolerance, false outside', () => {
    expect(isLocked(440, 440, 1)).toBe(true);
    expect(isLocked(440.2, 440, 1)).toBe(true);   // ~0.8 cents
    expect(isLocked(443, 440, 1)).toBe(false);     // ~11.8 cents
  });
});
