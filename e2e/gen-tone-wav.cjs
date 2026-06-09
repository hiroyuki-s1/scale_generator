/**
 * テスト用トーン WAV 生成（16-bit PCM mono）。
 *
 * チューナー E2E の「オーディオシミュレータ」用。生成した WAV を Chromium の
 * `--use-file-for-fake-audio-capture=<wav>` に渡すと、マイク入力として正弦波が
 * 流れ込む（既定でループ再生）。これで実マイク無しに音名検出を検証できる。
 *
 * CLI:  node e2e/gen-tone-wav.cjs <freqHz> <out.wav> [seconds] [sampleRate]
 * API:  const { writeToneWav } = require('./gen-tone-wav.cjs')
 */
const fs = require('fs');

/**
 * 正弦波（必要なら倍音付き）の 16-bit PCM mono WAV を書き出す。
 * @param {string} outPath 出力パス
 * @param {number} freq 基本周波数(Hz)
 * @param {object} [opts]
 * @param {number} [opts.seconds=2]      長さ(秒)
 * @param {number} [opts.sampleRate=44100]
 * @param {number} [opts.amplitude=0.4]  0..1
 * @param {number[]} [opts.harmonics=[1]] 倍音の相対振幅（[1,0.4,0.3]等で実楽器に寄せる）
 */
function writeToneWav(outPath, freq, opts = {}) {
  const { seconds = 2, sampleRate = 44100, amplitude = 0.4, harmonics = [1] } = opts;
  const n = Math.floor(seconds * sampleRate);
  const bytesPerSample = 2;
  const dataLen = n * bytesPerSample;
  const buf = Buffer.alloc(44 + dataLen);

  // RIFF / WAVE ヘッダ
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataLen, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);          // fmt chunk size
  buf.writeUInt16LE(1, 20);           // PCM
  buf.writeUInt16LE(1, 22);           // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * bytesPerSample, 28); // byte rate
  buf.writeUInt16LE(bytesPerSample, 32);              // block align
  buf.writeUInt16LE(16, 34);          // bits per sample
  buf.write('data', 36);
  buf.writeUInt32LE(dataLen, 40);

  const hsum = harmonics.reduce((a, b) => a + Math.abs(b), 0) || 1;
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    let s = 0;
    for (let h = 0; h < harmonics.length; h++) {
      s += harmonics[h] * Math.sin(2 * Math.PI * freq * (h + 1) * t);
    }
    s = (s / hsum) * amplitude;
    const v = Math.max(-1, Math.min(1, s));
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * bytesPerSample);
  }
  fs.writeFileSync(outPath, buf);
  return outPath;
}

if (require.main === module) {
  const [, , freqArg, outArg, secArg, srArg] = process.argv;
  if (!freqArg || !outArg) {
    console.error('usage: node e2e/gen-tone-wav.cjs <freqHz> <out.wav> [seconds] [sampleRate]');
    process.exit(1);
  }
  writeToneWav(outArg, Number(freqArg), {
    seconds: secArg ? Number(secArg) : 2,
    sampleRate: srArg ? Number(srArg) : 44100,
  });
  console.log(`wrote ${outArg} (${freqArg} Hz)`);
}

module.exports = { writeToneWav };
