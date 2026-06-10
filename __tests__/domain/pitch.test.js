import { describe, it, expect } from 'vitest';
import {
  detectPitchYIN, freqToNote, nearestOpenString, noteLabelFromMidi, midiToFreq, A4,
} from '../../src/domain/pitch.js';
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

// AudioWorklet 経路で使う useFFT を「実行経路＝テスト経路」にするためのパリティ確認。
describe('detectPitchYIN useFFT path parity', () => {
  const golden = [
    ['E1', 41.2, 8192, 35, 400],
    ['E2', 82.41, 4096, 70, 700],
    ['A2', 110.0, 4096, 70, 700],
    ['D3', 146.83, 4096, 70, 700],
    ['E4', 329.63, 4096, 70, 700],
    ['A4', 440.0, 2048, 70, 1200],
  ];

  for (const [name, f, size, minHz, maxHz] of golden) {
    for (const cents of [0, 20, -35]) {
      const detuned = f * Math.pow(2, cents / 1200);
      it(`${name} ${cents >= 0 ? '+' : ''}${cents}¢ (sine, useFFT)`, () => {
        const r = detectPitchYIN(sine(detuned, size), SR, { minHz, maxHz, useFFT: true });
        expect(r, `${name} ${cents}`).not.toBeNull();
        expect(Math.abs(centsDiff(r.hz, detuned)), `${name} ${cents}`).toBeLessThan(5);
      });
    }
  }

  it('picks the fundamental on harmonic-rich signal (useFFT)', () => {
    const r = detectPitchYIN(harmonic(110, 4096), SR, { minHz: 70, maxHz: 700, useFFT: true });
    expect(r).not.toBeNull();
    expect(Math.abs(centsDiff(r.hz, 110))).toBeLessThan(5);
  });

  it('FFT path agrees with time-domain path within 0.5 cents', () => {
    for (const [name, f, size, minHz, maxHz] of golden) {
      const buf = sine(f, size);
      const a = detectPitchYIN(buf, SR, { minHz, maxHz, useFFT: false });
      const b = detectPitchYIN(buf, SR, { minHz, maxHz, useFFT: true });
      expect(a, name).not.toBeNull();
      expect(b, name).not.toBeNull();
      expect(Math.abs(centsDiff(a.hz, b.hz)), name).toBeLessThan(0.5);
    }
  });

  it('rejects white noise on the FFT path too', () => {
    const buf = new Float32Array(2048);
    let s = 12345;
    for (let i = 0; i < buf.length; i++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      buf[i] = (s / 0x3fffffff) - 1;
    }
    expect(detectPitchYIN(buf, SR, { minHz: 70, maxHz: 700, useFFT: true })).toBeNull();
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

describe('noteLabelFromMidi', () => {
  it('maps reference MIDI numbers to labels', () => {
    expect(noteLabelFromMidi(69).label).toBe('A4');   // A4
    expect(noteLabelFromMidi(60).label).toBe('C4');   // C4
    expect(noteLabelFromMidi(64).label).toBe('E4');   // guitar 1st
    expect(noteLabelFromMidi(40).label).toBe('E2');   // guitar 6th
    expect(noteLabelFromMidi(28).label).toBe('E1');   // bass 4th
  });
  it('returns parts (noteName, octave)', () => {
    const n = noteLabelFromMidi(46); // A#2 / Bb2
    expect(n.noteName).toBe('A#');
    expect(n.octave).toBe(2);
  });
});

describe('midiToFreq', () => {
  it('A4(69) = a4 reference', () => {
    expect(midiToFreq(69, 440)).toBeCloseTo(440, 6);
    expect(midiToFreq(69, 442)).toBeCloseTo(442, 6);
  });
  it('E2(40) ≈ 82.41Hz at A4=440', () => {
    expect(midiToFreq(40, 440)).toBeCloseTo(82.41, 1);
  });
  it('scales with reference A4 (442 shifts everything up)', () => {
    expect(midiToFreq(40, 442)).toBeGreaterThan(midiToFreq(40, 440));
  });
  it('round-trips with freqToNote', () => {
    for (const midi of [28, 40, 55, 64, 69]) {
      const n = freqToNote(midiToFreq(midi, 440), 440);
      expect(n.midi).toBe(midi);
      expect(n.cents).toBe(0);
    }
  });
});

describe('reference pitch (a4) affects detection', () => {
  it('same hz reads as sharper when a4 is lower', () => {
    // 440Hz は A4=440 で 0¢、A4=435 だと基準が下がるので + 側にずれる
    expect(freqToNote(440, 440).cents).toBe(0);
    expect(freqToNote(440, 435).cents).toBeGreaterThan(0);
    expect(freqToNote(440, 445).cents).toBeLessThan(0);
  });
});

describe('A4 constant', () => {
  it('is 440', () => expect(A4).toBe(440));
});
