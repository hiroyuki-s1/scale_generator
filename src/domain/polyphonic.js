import { fft, nextPow2 } from './dsp/fft.js';

/**
 * ポリフォニック弦ごとオフセット検出（pure・DOM 非依存・Node でテスト可）。
 *
 * 完全な多重音採譜はしない。**狙う弦の目標周波数は既知**（チューニングから決まる）なので、
 * Hann 窓 + FFT の振幅スペクトルで各目標の近傍ピークを拾い、放物線補間でサブビン精度に上げて
 * 「その弦が今何 Hz か＝何¢ずれているか」を返す。1回のジャラーンで全弦の過不足が見える。
 *
 * 各目標の探索窓（centsWindow）を弦間隔の半分未満に取るのでバンド同士は重ならない
 * （ギター開放弦の最小音程は長3度=400¢、既定 window=120¢ なら干渉しない）。
 *
 * 周波数分解能は窓の長さ（秒）で決まる: 分解能 ≒ sampleRate/N。低音ほど長い窓が要るので
 * 呼び出し側は ~0.3–0.7s 相当のサンプルを渡すこと。内部で nextPow2 にゼロ詰めして補間する。
 */

/**
 * @typedef {Object} StringOffset
 * @property {number} index        targets 配列上の弦インデックス
 * @property {number} targetHz     目標周波数（offset 適用済み）
 * @property {number|null} hz       検出周波数（弦が鳴っていなければ null）
 * @property {number|null} cents    目標からのズレ（+で高い / −で低い）
 * @property {number} level         ピークの相対レベル（0..1、スペクトル最大で正規化）
 */

/** Hann 窓を掛けて実部配列に展開（虚部 0）。長さ N（2^n）。 */
function hannWindowed(buf, N) {
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const L = Math.min(buf.length, N);
  for (let i = 0; i < L; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (L - 1));
    re[i] = buf[i] * w;
  }
  return { re, im };
}

/**
 * 各目標周波数の近傍ピークを拾って弦ごとのズレを返す。
 * @param {Float32Array} buf 時間波形（弦を鳴らして少し持続させた区間）
 * @param {number} sampleRate
 * @param {number[]} targets 弦ごとの目標周波数（Hz、offset 適用済み）
 * @param {object} [opts]
 * @param {number} [opts.centsWindow=120] 各目標の探索半幅（cents）
 * @param {number} [opts.minLevel=0.06] これ未満のピークは「鳴っていない」= null
 * @returns {StringOffset[]}
 */
export function detectStringOffsets(buf, sampleRate, targets, opts = {}) {
  const { centsWindow = 120, minLevel = 0.06 } = opts;
  const out = targets.map((t, index) => ({ index, targetHz: t, hz: null, cents: null, level: 0 }));
  if (!buf || buf.length < 4 || !(sampleRate > 0) || !targets.length) return out;

  const N = nextPow2(buf.length);
  const { re, im } = hannWindowed(buf, N);
  fft(re, im);

  // 片側スペクトルの振幅と全体最大（正規化用）。
  const half = N >> 1;
  const mag = new Float64Array(half + 1);
  let maxMag = 1e-12;
  for (let k = 0; k <= half; k++) {
    const m = Math.hypot(re[k], im[k]);
    mag[k] = m;
    if (m > maxMag) maxMag = m;
  }
  const binHz = sampleRate / N;

  for (let s = 0; s < targets.length; s++) {
    const target = targets[s];
    if (!(target > 0)) continue;
    const loHz = target * Math.pow(2, -centsWindow / 1200);
    const hiHz = target * Math.pow(2, centsWindow / 1200);
    let loK = Math.max(1, Math.floor(loHz / binHz));
    let hiK = Math.min(half - 1, Math.ceil(hiHz / binHz));
    if (hiK <= loK) continue;

    // 探索帯のピークビン。
    let peakK = loK;
    for (let k = loK; k <= hiK; k++) if (mag[k] > mag[peakK]) peakK = k;
    const level = mag[peakK] / maxMag;
    if (level < minLevel) continue; // 鳴っていない弦

    // 放物線補間でサブビン精度に。ピークが探索帯の端なら帯外ビン（隣弦/雑音）を読まないよう補間しない。
    const b = mag[peakK];
    const canInterp = peakK > loK && peakK < hiK;
    const a = canInterp ? mag[peakK - 1] : b;
    const c = canInterp ? mag[peakK + 1] : b;
    const denom = a - 2 * b + c;
    const delta = denom !== 0 ? (0.5 * (a - c)) / denom : 0;
    const hz = (peakK + delta) * binHz;
    out[s] = {
      index: s,
      targetHz: target,
      hz,
      cents: 1200 * Math.log2(hz / target),
      level,
    };
  }
  return out;
}
