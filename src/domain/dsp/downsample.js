/**
 * box 事前平均つきデシメーション（pure・DOM 非依存・Node でテスト可）。
 *
 * F0 検出は数 kHz もあれば十分なので、生信号を ~12kHz へ落として YIN の演算量を
 * 大幅に削る。素のサブサンプル（D 個ごとに 1 点）は dsRate/2 を超える倍音を
 * 折り返して F0 帯に偽の低音を作るため、デシメーション前に **長さ 2D の移動平均**
 * を掛けてエイリアスを抑える（ストライドは D、平均窓は 2D で最初のヌルが dsRate/2
 * 付近にくる安価な LPF。基音帯はほぼ無減衰）。出力 1 点あたりの計算は窓長に比例する
 * だけで O(1) 相当に収まり、AudioWorklet でも安い。
 *
 * ブラウザの AudioWorklet（src/audio/pitchProcessor.worklet.js）と同一ロジックを
 * ここに置き、Node の単体テストで f0 保存・エイリアス棄却を担保する（一次ソース）。
 */

/**
 * srcRate→dstRate の整数デシメーション係数（1 以上）。
 * 実効レートは srcRate / factor（dstRate ぴったりとは限らない）なので、
 * 検出側は必ず downsampledRate() の値を sampleRate として渡すこと。
 * @param {number} srcRate
 * @param {number} dstRate
 * @returns {number}
 */
export function decimationFactor(srcRate, dstRate) {
  if (!(srcRate > 0) || !(dstRate > 0)) return 1;
  return Math.max(1, Math.round(srcRate / dstRate));
}

/**
 * デシメーション後の実効サンプリングレート（Hz）。
 * @param {number} srcRate
 * @param {number} dstRate
 * @returns {number}
 */
export function downsampledRate(srcRate, dstRate) {
  return srcRate / decimationFactor(srcRate, dstRate);
}

/**
 * box 事前平均つきダウンサンプル。
 * @param {Float32Array} buf 入力波形
 * @param {number} srcRate 入力サンプリングレート（Hz）
 * @param {number} dstRate 目標レート（Hz、おおよそ）
 * @returns {Float32Array} 実効レート downsampledRate(srcRate,dstRate) の波形
 */
export function downsample(buf, srcRate, dstRate) {
  const D = decimationFactor(srcRate, dstRate);
  if (D <= 1) return buf.slice();
  const L = 2 * D;            // 平均窓長（ストライド D より広く取りエイリアスを抑える）
  const len = buf.length;
  const outLen = Math.floor(len / D);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const base = i * D;
    let sum = 0;
    for (let k = 0; k < L; k++) {
      const idx = base + k;
      if (idx < len) sum += buf[idx];   // 末尾はゼロ詰め（最終数点のみ・無視できる）
    }
    out[i] = sum / L;
  }
  return out;
}
