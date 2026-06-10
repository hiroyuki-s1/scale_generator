import { describe, it, expect } from 'vitest';
import { detectStringOffsets } from '../../src/domain/polyphonic.js';
import { targetsHz, findTuning } from '../../src/domain/tunings.js';

const SR = 44100;

/** 複数の周波数（必要なら弱い倍音つき）を合成した波形。 */
function chord(freqs, size, sr = SR, { harmonics = [1], amp = 0.3 } = {}) {
  const buf = new Float32Array(size);
  const hsum = harmonics.reduce((a, b) => a + Math.abs(b), 0) || 1;
  for (let i = 0; i < size; i++) {
    const t = i / sr;
    let s = 0;
    for (const f of freqs) {
      for (let h = 0; h < harmonics.length; h++) {
        s += (harmonics[h] / hsum) * Math.sin(2 * Math.PI * f * (h + 1) * t);
      }
    }
    buf[i] = (s / freqs.length) * amp;
  }
  return buf;
}

describe('detectStringOffsets', () => {
  const std = findTuning('guitar', 'standard').midi;       // [E4,B3,G3,D3,A2,E2]
  const targets = targetsHz(std);                          // 全弦 ジャスト目標
  const WIN = 16384;                                       // ~0.37s @44100（低音の分解能用）

  it('all six strings in tune → each cents ≈ 0', () => {
    const buf = chord(targets, WIN);
    const res = detectStringOffsets(buf, SR, targets);
    expect(res).toHaveLength(6);
    for (const r of res) {
      expect(r.hz, `string ${r.index}`).not.toBeNull();
      expect(Math.abs(r.cents), `string ${r.index} cents`).toBeLessThan(8);
    }
  });

  it('detects per-string sharp/flat deviations independently', () => {
    // 1弦(E4) を +15¢ シャープ、6弦(E2) を -20¢ フラット、他はジャスト。
    const det = targets.slice();
    det[0] = targets[0] * Math.pow(2, 15 / 1200);
    det[5] = targets[5] * Math.pow(2, -20 / 1200);
    const buf = chord(det, WIN);
    const res = detectStringOffsets(buf, SR, targets);
    expect(res[0].cents).toBeGreaterThan(8);      // シャープ検出
    expect(Math.abs(res[0].cents - 15)).toBeLessThan(8);
    expect(res[5].cents).toBeLessThan(-8);        // フラット検出
    expect(Math.abs(res[5].cents + 20)).toBeLessThan(8);
    // 中間の弦はほぼ 0
    for (const i of [1, 2, 3, 4]) expect(Math.abs(res[i].cents)).toBeLessThan(8);
  });

  it('reports null for a muted (absent) string', () => {
    // 5弦(A2)を抜いた和音 → その弦は鳴っていない＝null
    const present = targets.filter((_, i) => i !== 4);
    const buf = chord(present, WIN);
    const res = detectStringOffsets(buf, SR, targets, { minLevel: 0.06 });
    expect(res[4].hz).toBeNull();
    // 残りは検出される
    for (const i of [0, 1, 2, 3, 5]) expect(res[i].hz, `string ${i}`).not.toBeNull();
  });

  it('tolerates mild harmonics on each note', () => {
    const buf = chord(targets, WIN, SR, { harmonics: [1, 0.25, 0.12] });
    const res = detectStringOffsets(buf, SR, targets);
    for (const r of res) {
      expect(r.hz, `string ${r.index}`).not.toBeNull();
      expect(Math.abs(r.cents), `string ${r.index}`).toBeLessThan(12);
    }
  });

  it('does not read out-of-band bins when a string is detuned to the search-band edge', () => {
    // 1弦(E4) を +110¢（探索窓 120¢ の端ぎりぎり）まで上げても、帯外ビンを読んで
    // 暴れず、おおむね +110¢ 付近に収まる（端での放物線補間オフの検証）。
    const det = targets.slice();
    det[0] = targets[0] * Math.pow(2, 110 / 1200);
    const buf = chord(det, WIN);
    const res = detectStringOffsets(buf, SR, targets, { centsWindow: 120 });
    expect(res[0].hz).not.toBeNull();
    expect(res[0].cents).toBeGreaterThan(90);
    expect(res[0].cents).toBeLessThan(125); // 帯（±120¢）から大きく外れない
  });

  it('handles empty/short input safely', () => {
    const res = detectStringOffsets(new Float32Array(2), SR, targets);
    expect(res).toHaveLength(6);
    expect(res.every(r => r.hz === null)).toBe(true);
  });
});
