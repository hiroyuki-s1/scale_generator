import { describe, it, expect } from 'vitest';
import { differenceFunctionFFT } from '../../../src/domain/dsp/autocorr.js';

const SR = 44100;

function sine(freq, size, sr = SR, amp = 0.5) {
  const buf = new Float32Array(size);
  for (let i = 0; i < size; i++) buf[i] = amp * Math.sin((2 * Math.PI * freq * i) / sr);
  return buf;
}

function harmonic(freq, size, sr = SR) {
  const buf = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const t = i / sr;
    buf[i] = 0.5 * Math.sin(2 * Math.PI * freq * t)
      + 0.4 * Math.sin(2 * Math.PI * 2 * freq * t)
      + 0.3 * Math.sin(2 * Math.PI * 3 * freq * t);
  }
  return buf;
}

function pseudoNoise(size, seed = 12345) {
  const buf = new Float32Array(size);
  let s = seed;
  for (let i = 0; i < size; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    buf[i] = (s / 0x3fffffff) - 1;
  }
  return buf;
}

/** 時間領域の素朴な YIN 差分関数（参照実装、pitch.js の lines 48–56 と同一式）。 */
function differenceFunctionTime(buf, tauMax) {
  const SIZE = buf.length;
  const W = SIZE - tauMax;
  const d = new Float32Array(tauMax + 1);
  for (let tau = 1; tau <= tauMax; tau++) {
    let sum = 0;
    for (let j = 0; j < W; j++) {
      const diff = buf[j] - buf[j + tau];
      sum += diff * diff;
    }
    d[tau] = sum;
  }
  return d;
}

describe('differenceFunctionFFT ≡ time-domain difference function', () => {
  const cases = [
    ['sine 220', sine(220, 2048), 630],
    ['sine 82.41', sine(82.41, 4096), 630],
    ['harmonic 110', harmonic(110, 4096), 630],
    ['pseudo-noise', pseudoNoise(2048), 512],
  ];

  for (const [name, buf, tauMax] of cases) {
    it(`matches within relative 1e-4 (${name})`, () => {
      const fftD = differenceFunctionFFT(buf, tauMax);
      const timeD = differenceFunctionTime(buf, tauMax);
      expect(fftD.length).toBe(timeD.length);
      let maxScale = 1e-9;
      for (let tau = 1; tau <= tauMax; tau++) maxScale = Math.max(maxScale, Math.abs(timeD[tau]));
      for (let tau = 1; tau <= tauMax; tau++) {
        expect(Math.abs(fftD[tau] - timeD[tau]) / maxScale, `tau ${tau}`).toBeLessThan(1e-4);
      }
    });
  }

  it('d[0] = 0', () => {
    expect(differenceFunctionFFT(sine(220, 1024), 256)[0]).toBe(0);
  });

  it('returns zeros when window is degenerate', () => {
    const d = differenceFunctionFFT(new Float32Array(10), 10);
    expect(d.every(v => v === 0)).toBe(true);
  });
});
