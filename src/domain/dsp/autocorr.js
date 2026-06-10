/**
 * YIN 差分関数 d(tau) の FFT 高速版（pure・DOM 非依存・Node でテスト可）。
 *
 * 時間領域の素朴な実装は d(tau) = Σ_{j=0}^{W-1} (x[j] − x[j+tau])² を tau ごとに
 * O(W) で回すため全体 O(W·tauMax)。これを以下の恒等式で O(N log N) に落とす:
 *
 *   d(tau) = p0 + pTau(tau) − 2·r(tau)
 *     p0      = Σ_{j=0}^{W-1} x[j]²                         （tau 不変）
 *     pTau    = Σ_{j=tau}^{tau+W-1} x[j]²                   （二乗の前置和で O(1)）
 *     r(tau)  = Σ_{j=0}^{W-1} x[j]·x[j+tau]                 （相互相関＝FFT で一括）
 *
 * r(tau) は「先頭 W 点だけを残した y」と「全信号 x」の相互相関で、
 * r = ifft( conj(FFT(y)) · FFT(x) ) の先頭 tauMax+1 点。ゼロ詰めで巡回畳み込みの
 * 回り込みを避ける。W = SIZE − tauMax は src/domain/pitch.js の定義に一致させる。
 */

import { fft, ifft, nextPow2 } from './fft.js';

/**
 * FFT による YIN 差分関数。pitch.js の時間領域版と数値誤差内で一致する。
 * @param {Float32Array} buf 時間波形
 * @param {number} tauMax 探索する最大周期（サンプル）
 * @returns {Float32Array} d[0..tauMax]（d[0]=0）
 */
export function differenceFunctionFFT(buf, tauMax) {
  const SIZE = buf.length;
  const W = SIZE - tauMax;
  const d = new Float32Array(tauMax + 1);
  if (W < 1 || tauMax < 1) return d;

  // 二乗の前置和: P[k] = Σ_{i<k} x[i]²。pTau / p0 を O(1) で引く。
  const P = new Float64Array(SIZE + 1);
  for (let i = 0; i < SIZE; i++) P[i + 1] = P[i] + buf[i] * buf[i];
  const p0 = P[W];

  // 相互相関 r(tau) を FFT で。M はゼロ詰め長（先頭 W の y と全長 x が回り込まない大きさ）。
  const M = nextPow2(SIZE + W);
  const yr = new Float64Array(M); // 先頭 W 点だけの第1オペランド
  const yi = new Float64Array(M);
  const xr = new Float64Array(M); // 全信号
  const xi = new Float64Array(M);
  for (let j = 0; j < W; j++) yr[j] = buf[j];
  for (let j = 0; j < SIZE; j++) xr[j] = buf[j];

  fft(yr, yi);
  fft(xr, xi);
  // conj(Y) · X を pr/pi に。
  const pr = new Float64Array(M);
  const pi = new Float64Array(M);
  for (let k = 0; k < M; k++) {
    pr[k] = yr[k] * xr[k] + yi[k] * xi[k];
    pi[k] = yr[k] * xi[k] - yi[k] * xr[k];
  }
  ifft(pr, pi);

  for (let tau = 1; tau <= tauMax; tau++) {
    const pTau = P[tau + W] - P[tau];
    d[tau] = p0 + pTau - 2 * pr[tau];
  }
  return d;
}
