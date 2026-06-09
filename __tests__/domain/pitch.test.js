import { describe, it, expect } from 'vitest';
import { detectPitchYIN, freqToNote, nearestOpenString, A4 } from '../../src/domain/pitch.js';
import { TUNING_GUITAR, TUNING_BASS } from '../../src/domain/constants.js';

const SR = 44100;

/** 純正弦波バッファを生成。 */
function sine(freq, size, sr = SR, amp = 0.5) {
  const buf = new Float32Array(size);
  for (let i = 0; i < size; i++) buf[i] = amp * Math.sin((2 * Math.PI * freq * i) / sr);
  return buf;
}

/** 基音 + 倍音（オクターブ誤り耐性の確認用に倍音を厚めに）。 */
function harmonic(freq, size, sr = SR) {
  const buf = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const t = i / sr;
    buf[i] =
      0.5 * Math.sin(2 * Math.PI * freq * t) +
      0.4 * Math.sin(2 * Math.PI * 2 * freq * t) +
      0.3 * Math.sin(2 * Math.PI * 3 * freq * t);
  }
  return buf;
}

/** Hz 差をセントに。 */
const centsDiff = (a, b) => 1200 * Math.log2(a / b);

describe('detectPitchYIN', () => {
  it('detects A4 = 440Hz within 3 cents', () => {
    const r = detectPitchYIN(sine(440, 2048), SR);
    expect(r).not.toBeNull();
    expect(Math.abs(centsDiff(r.hz, 440))).toBeLessThan(3);
    expect(r.clarity).toBeGreaterThan(0.8);
  });

  it('detects guitar open strings (E2..E4)', () => {
    const freqs = [82.41, 110.0, 146.83, 196.0, 246.94, 329.63];
    for (const f of freqs) {
      const r = detectPitchYIN(sine(f, 4096), SR, { minHz: 70, maxHz: 700 });
      expect(r, `freq ${f}`).not.toBeNull();
      expect(Math.abs(centsDiff(r.hz, f)), `freq ${f}`).toBeLessThan(5);
    }
  });

  it('detects bass low E1 = 41.2Hz with a large buffer', () => {
    const r = detectPitchYIN(sine(41.2, 8192), SR, { minHz: 35, maxHz: 400 });
    expect(r).not.toBeNull();
    expect(Math.abs(centsDiff(r.hz, 41.2))).toBeLessThan(8);
  });

  it('detects all bass open strings (E1..G2)', () => {
    const freqs = [41.2, 55.0, 73.42, 98.0];
    for (const f of freqs) {
      const r = detectPitchYIN(sine(f, 8192), SR, { minHz: 35, maxHz: 400 });
      expect(r, `freq ${f}`).not.toBeNull();
      expect(Math.abs(centsDiff(r.hz, f)), `freq ${f}`).toBeLessThan(8);
    }
  });

  it('picks the fundamental, not an octave, on harmonic-rich signal', () => {
    const r = detectPitchYIN(harmonic(110, 4096), SR, { minHz: 70, maxHz: 700 });
    expect(r).not.toBeNull();
    expect(Math.abs(centsDiff(r.hz, 110))).toBeLessThan(5);
  });

  it('returns null on silence (below RMS gate)', () => {
    expect(detectPitchYIN(new Float32Array(2048), SR)).toBeNull();
  });

  it('returns null on white-noise-like non-periodic input', () => {
    const buf = new Float32Array(2048);
    // 決定論的な擬似ノイズ（テスト再現性のため Math.random は使わない）。
    let s = 12345;
    for (let i = 0; i < buf.length; i++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      buf[i] = (s / 0x3fffffff) - 1;
    }
    expect(detectPitchYIN(buf, SR, { minHz: 70, maxHz: 700 })).toBeNull();
  });
});

describe('freqToNote', () => {
  it('A4 = 440 → A4, 0 cents', () => {
    const n = freqToNote(440);
    expect(n.label).toBe('A4');
    expect(n.midi).toBe(69);
    expect(n.cents).toBe(0);
  });

  it('C4 = ~261.63 → C4', () => {
    const n = freqToNote(261.63);
    expect(n.label).toBe('C4');
    expect(n.midi).toBe(60);
  });

  it('reports sharp/flat cents sign correctly', () => {
    expect(freqToNote(445).cents).toBeGreaterThan(0);   // 高い → +
    expect(freqToNote(435).cents).toBeLessThan(0);      // 低い → −
  });

  it('low E1 ≈ 41.2 → E1', () => {
    const n = freqToNote(41.2);
    expect(n.noteName).toBe('E');
    expect(n.octave).toBe(1);
    expect(n.label).toBe('E1');
  });

  it('uses configurable A4 reference', () => {
    expect(freqToNote(442, 442).cents).toBe(0);
  });

  it('returns null for non-positive input', () => {
    expect(freqToNote(0)).toBeNull();
    expect(freqToNote(-100)).toBeNull();
  });
});

describe('nearestOpenString', () => {
  it('maps 82.41Hz to guitar 6th string (E2, last index)', () => {
    const r = nearestOpenString(82.41, TUNING_GUITAR);
    expect(r.index).toBe(TUNING_GUITAR.length - 1); // E2 is last
    expect(r.midi).toBe(40);
    expect(Math.abs(r.cents)).toBeLessThan(5);
  });

  it('maps 41.2Hz to bass low E1 (last index)', () => {
    const r = nearestOpenString(41.2, TUNING_BASS);
    expect(r.index).toBe(TUNING_BASS.length - 1);
    expect(r.midi).toBe(28);
    expect(Math.abs(r.cents)).toBeLessThan(5);
  });

  it('reports positive cents when sharp of target string', () => {
    const r = nearestOpenString(112, TUNING_GUITAR); // A2=110 を少し上回る
    expect(r.midi).toBe(45); // A2
    expect(r.cents).toBeGreaterThan(0);
  });

  it('returns null for empty tuning', () => {
    expect(nearestOpenString(110, [])).toBeNull();
  });
});

describe('A4 constant', () => {
  it('is 440', () => expect(A4).toBe(440));
});
