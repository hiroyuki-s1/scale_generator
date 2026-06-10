import { describe, it, expect } from 'vitest';
import {
  downsample, downsampledRate, decimationFactor,
} from '../../../src/domain/dsp/downsample.js';
import { detectPitchYIN } from '../../../src/domain/pitch.js';

const centsDiff = (a, b) => 1200 * Math.log2(a / b);

function sine(freq, size, sr, amp = 0.5) {
  const buf = new Float32Array(size);
  for (let i = 0; i < size; i++) buf[i] = amp * Math.sin((2 * Math.PI * freq * i) / sr);
  return buf;
}

describe('decimationFactor / downsampledRate', () => {
  it('computes integer factor and effective rate', () => {
    expect(decimationFactor(48000, 12000)).toBe(4);
    expect(downsampledRate(48000, 12000)).toBe(12000);
    expect(decimationFactor(44100, 12000)).toBe(4); // round(3.675)=4
    expect(downsampledRate(44100, 12000)).toBeCloseTo(11025, 6);
  });

  it('returns factor 1 (passthrough) when target >= source', () => {
    expect(decimationFactor(12000, 48000)).toBe(1);
  });
});

describe('downsample', () => {
  it('output length ≈ floor(len * dst/src)', () => {
    const out = downsample(sine(440, 4800, 48000), 48000, 12000);
    expect(out.length).toBe(1200);
  });

  it('preserves f0 within ±5 cents for guitar/bass open strings (48k→12k)', () => {
    const SR = 48000;
    const dst = 12000;
    const rate = downsampledRate(SR, dst);
    const freqs = [41.2, 82.41, 110.0, 146.83, 329.63, 440.0];
    for (const f of freqs) {
      const down = downsample(sine(f, 24000, SR), SR, dst);
      const r = detectPitchYIN(down, rate, { minHz: 35, maxHz: 1200 });
      expect(r, `freq ${f}`).not.toBeNull();
      expect(Math.abs(centsDiff(r.hz, f)), `freq ${f}`).toBeLessThan(5);
    }
  });

  // 220Hz の基音に、基音の 1/5（約 -14dB）という実機相当の強い高域倍音 7kHz を載せる。
  function mix220Plus7k(amp7k, SR, size) {
    const buf = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      const t = i / SR;
      buf[i] = 0.5 * Math.sin(2 * Math.PI * 220 * t) + amp7k * Math.sin(2 * Math.PI * 7000 * t);
    }
    return buf;
  }

  it('keeps locking to 220Hz with a realistic strong 7kHz harmonic (anti-alias works)', () => {
    const SR = 48000; const dst = 12000;
    const rate = downsampledRate(SR, dst);
    const down = downsample(mix220Plus7k(0.12, SR, 24000), SR, dst);
    const r = detectPitchYIN(down, rate, { minHz: 70, maxHz: 1200 });
    expect(r).not.toBeNull();
    expect(Math.abs(centsDiff(r.hz, 220))).toBeLessThan(5);
  });

  it('box pre-average cuts alias error far below naive subsampling', () => {
    const SR = 48000; const dst = 12000;
    const rate = downsampledRate(SR, dst);
    const D = decimationFactor(SR, dst);
    const buf = mix220Plus7k(0.3, SR, 24000); // 強めの 7kHz でフィルタ有無を対比
    // 素のサブサンプル（事前平均なし）= アンチエイリアスしていない比較対象。
    const naive = new Float32Array(Math.floor(buf.length / D));
    for (let i = 0; i < naive.length; i++) naive[i] = buf[i * D];

    const boxErr = Math.abs(centsDiff(detectPitchYIN(downsample(buf, SR, dst), rate, { minHz: 70, maxHz: 1200 }).hz, 220));
    const naiveErr = Math.abs(centsDiff(detectPitchYIN(naive, rate, { minHz: 70, maxHz: 1200 }).hz, 220));
    expect(naiveErr).toBeGreaterThan(30);  // 事前平均なしは大きく外す
    expect(boxErr).toBeLessThan(15);       // box 平均ありは大幅に改善
    expect(boxErr).toBeLessThan(naiveErr / 2);
  });
});
