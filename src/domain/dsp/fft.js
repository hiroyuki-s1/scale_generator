/**
 * radix-2 反復 Cooley–Tukey FFT/IFFT（pure・DOM 非依存・Node でテスト可）。
 *
 * - 実部/虚部を別々の配列（Float64Array 推奨）で in-place 変換する。
 * - 長さは 2 のべき乗のみ（それ以外は throw）。
 * - 依存ゼロ。ピッチ検出の自己相関高速化（domain/dsp/autocorr.js）から使う。
 *
 * 変換規約: fft は exp(-2πi·kn/N)、ifft は exp(+2πi·kn/N) で 1/N 正規化。
 * ゆえに ifft(fft(x)) == x（数値誤差内）。
 */

/** @param {number} n @returns {boolean} */
function isPow2(n) {
  return n >= 1 && (n & (n - 1)) === 0;
}

/**
 * in-place 変換本体。
 * @param {Float64Array|Float32Array} re 実部（書き換える）
 * @param {Float64Array|Float32Array} im 虚部（書き換える）
 * @param {boolean} inverse true で逆変換（符号反転）
 */
function transform(re, im, inverse) {
  const n = re.length;
  if (n !== im.length) throw new Error('fft: re/im length mismatch');
  if (n <= 1) return;
  if (!isPow2(n)) throw new Error(`fft: length must be a power of 2 (got ${n})`);

  // ビット反転並べ替え。
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }

  // バタフライ。
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k;
        const b = a + half;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

/**
 * 順 FFT（in-place）。
 * @param {Float64Array|Float32Array} re
 * @param {Float64Array|Float32Array} im
 */
export function fft(re, im) {
  transform(re, im, false);
}

/**
 * 逆 FFT（in-place、1/N 正規化込み）。
 * @param {Float64Array|Float32Array} re
 * @param {Float64Array|Float32Array} im
 */
export function ifft(re, im) {
  transform(re, im, true);
  const n = re.length;
  for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}

/**
 * n 以上で最小の 2 のべき乗。
 * @param {number} n
 * @returns {number}
 */
export function nextPow2(n) {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}
