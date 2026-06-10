import { describe, it, expect } from 'vitest';
import { fft, ifft, nextPow2 } from '../../../src/domain/dsp/fft.js';

/** ランダムだが決定論的な配列（テスト再現性のため Math.random は使わない）。 */
function pseudoRandom(n, seed = 7) {
  const a = new Float64Array(n);
  let s = seed;
  for (let i = 0; i < n; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    a[i] = (s / 0x3fffffff) - 1;
  }
  return a;
}

describe('nextPow2', () => {
  it('rounds up to the next power of two', () => {
    expect(nextPow2(1)).toBe(1);
    expect(nextPow2(2)).toBe(2);
    expect(nextPow2(3)).toBe(4);
    expect(nextPow2(1000)).toBe(1024);
    expect(nextPow2(1024)).toBe(1024);
  });
});

describe('fft / ifft', () => {
  it('throws on non power-of-two length', () => {
    expect(() => fft(new Float64Array(3), new Float64Array(3))).toThrow();
  });

  it('FFT of a unit impulse is flat (all bins = 1)', () => {
    const n = 8;
    const re = new Float64Array(n); const im = new Float64Array(n);
    re[0] = 1; // δ[n]
    fft(re, im);
    for (let k = 0; k < n; k++) {
      expect(re[k]).toBeCloseTo(1, 10);
      expect(im[k]).toBeCloseTo(0, 10);
    }
  });

  it('FFT of cos(2π·k0·n/N) concentrates energy at bins k0 and N−k0', () => {
    const n = 16; const k0 = 3;
    const re = new Float64Array(n); const im = new Float64Array(n);
    for (let i = 0; i < n; i++) re[i] = Math.cos((2 * Math.PI * k0 * i) / n);
    fft(re, im);
    const mag = k => Math.hypot(re[k], im[k]);
    // 実コサインは ±k0 に N/2 ずつ。それ以外はほぼ 0。
    expect(mag(k0)).toBeCloseTo(n / 2, 6);
    expect(mag(n - k0)).toBeCloseTo(n / 2, 6);
    for (let k = 0; k < n; k++) {
      if (k === k0 || k === n - k0) continue;
      expect(mag(k)).toBeLessThan(1e-6);
    }
  });

  it('ifft(fft(x)) ≈ x for random vectors', () => {
    const n = 256;
    const x = pseudoRandom(n);
    const re = Float64Array.from(x); const im = new Float64Array(n);
    fft(re, im);
    ifft(re, im);
    for (let i = 0; i < n; i++) {
      expect(re[i]).toBeCloseTo(x[i], 8);
      expect(im[i]).toBeCloseTo(0, 8);
    }
  });

  it('satisfies Parseval energy conservation', () => {
    const n = 128;
    const x = pseudoRandom(n, 99);
    const re = Float64Array.from(x); const im = new Float64Array(n);
    let timeEnergy = 0;
    for (let i = 0; i < n; i++) timeEnergy += x[i] * x[i];
    fft(re, im);
    let freqEnergy = 0;
    for (let k = 0; k < n; k++) freqEnergy += re[k] * re[k] + im[k] * im[k];
    expect(freqEnergy / n).toBeCloseTo(timeEnergy, 6);
  });
});
