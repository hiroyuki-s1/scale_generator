/**
 * リアルタイム F0 推定の AudioWorkletProcessor（オーディオスレッドで動く）。
 *
 *  - `process()` は 128 サンプル/quantum・コンテキストレート（通常48000）で呼ばれる。
 *  - **mono モード**（既定・チューナー針/ストロボ用）: 入力をストリーミングでダウンサンプル
 *    （box長2D・ストライドD の安価な移動平均）し、最低音の約2.5周期ぶんのリングで YIN（FFT差分）
 *    を回して `port.postMessage({hz,clarity,rms,t})` を流す（無検出は hz:null）。
 *  - **poly モード**（ポリフォニック・ジャラーンと1回で全弦）: 生波形の長窓リングに対し、
 *    弦ごとの目標周波数 `targets` 近傍のスペクトルピークを拾って各弦の ±cents を
 *    `port.postMessage({type:'poly', strings, t})` で流す。
 *
 * YIN/ポリ検出の本体は src/domain を import（数式はコピペせず一次ソースを共有。esbuild が
 * worklet バンドルへインライン化する）。このファイルは DOM/window を一切触らない。
 */

import { detectPitchYIN } from '../domain/pitch.js';
import { decimationFactor } from '../domain/dsp/downsample.js';
import { detectStringOffsets } from '../domain/polyphonic.js';

const PERIODS_IN_WINDOW = 2.5; // mono 観測窓 = 最低音の約2.5周期（短いほど低レイテンシ）
const POLY_N = 32768;          // poly 生波形窓（~0.68s @48k。高音まで ~7¢/bin の周波数分解能）
const POLY_HOP_MS = 120;       // poly 検出間隔（~8Hz 更新）

class PitchProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const o = (options && options.processorOptions) || {};
    this._threshold = o.threshold ?? 0.12;
    this._rmsGate = o.rmsGate ?? 0.005;
    this._targetRate = o.targetRate ?? 12000;
    this._hopMs = o.hopMs ?? 15;
    this._mode = o.mode === 'poly' ? 'poly' : 'mono';
    this._targets = Array.isArray(o.targets) ? o.targets : null;

    // ── mono: ダウンサンプル係数 D と実効レート（sampleRate は worklet グローバル）。
    this._D = decimationFactor(sampleRate, this._targetRate);
    this._dsRate = sampleRate / this._D;
    this._L = 2 * this._D;
    this._rawHist = new Float32Array(this._L);
    this._rawIdx = 0;
    this._rawSum = 0;
    this._phase = 0;

    // ── poly: 生波形リング。
    this._polyRing = new Float32Array(POLY_N);
    this._polyWrite = 0;
    this._polyFilled = 0;
    this._polyHopSamples = Math.max(1, Math.round((POLY_HOP_MS * sampleRate) / 1000));
    this._polySince = 0;
    this._polyScratch = new Float32Array(POLY_N);

    this._configure(o.minHz ?? 40, o.maxHz ?? 1200);

    this.port.onmessage = (e) => {
      const m = e.data;
      if (!m) return;
      if (m.type === 'config') {
        if (m.threshold != null) this._threshold = m.threshold;
        if (m.rmsGate != null) this._rmsGate = m.rmsGate;
        if (m.hopMs != null) this._hopMs = m.hopMs;
        this._configure(m.minHz != null ? m.minHz : this._minHz, m.maxHz != null ? m.maxHz : this._maxHz);
      } else if (m.type === 'mode') {
        const next = m.mode === 'poly' ? 'poly' : 'mono';
        if (next !== this._mode) { this._mode = next; this._flushMono(); }
      } else if (m.type === 'targets') this._targets = Array.isArray(m.targets) ? m.targets : null;
    };
  }

  /** mono の検出レンジを設定し、窓長依存のバッファを作り直す。 */
  _configure(minHz, maxHz) {
    this._minHz = minHz;
    this._maxHz = maxHz;
    this._windowSamples = Math.max(32, Math.ceil((PERIODS_IN_WINDOW * this._dsRate) / minHz));
    this._hopSamples = Math.max(1, Math.round((this._hopMs * this._dsRate) / 1000));
    this._dsRing = new Float32Array(this._windowSamples);
    this._dsWrite = 0;
    this._dsFilled = 0;
    this._sinceHop = 0;
    this._scratch = new Float32Array(this._windowSamples);
  }

  /** mono のダウンサンプル/移動平均の途中状態を破棄（モード復帰時の過渡グリッチ防止）。 */
  _flushMono() {
    this._rawHist.fill(0);
    this._rawIdx = 0; this._rawSum = 0; this._phase = 0;
    this._dsWrite = 0; this._dsFilled = 0; this._sinceHop = 0;
  }

  /** mono: ダウンサンプル後の1サンプルをリングへ。条件が揃えば検出して投げる。 */
  _pushDownsampled(v) {
    const w = this._windowSamples;
    this._dsRing[this._dsWrite] = v;
    this._dsWrite = (this._dsWrite + 1) % w;
    if (this._dsFilled < w) this._dsFilled++;
    this._sinceHop++;
    if (this._dsFilled === w && this._sinceHop >= this._hopSamples) {
      this._sinceHop = 0;
      const start = this._dsWrite;
      for (let k = 0; k < w; k++) this._scratch[k] = this._dsRing[(start + k) % w];
      const r = detectPitchYIN(this._scratch, this._dsRate, {
        minHz: this._minHz, maxHz: this._maxHz,
        threshold: this._threshold, rmsGate: this._rmsGate, useFFT: true,
      });
      if (r) this.port.postMessage({ hz: r.hz, clarity: r.clarity, rms: r.rms, t: currentTime });
      else this.port.postMessage({ hz: null, clarity: 0, rms: 0, t: currentTime });
    }
  }

  /** poly: 生波形窓が満ちて hop ぶん進んだら全弦のズレを投げる。 */
  _maybePoly() {
    if (this._mode !== 'poly' || !this._targets || this._polyFilled < POLY_N) return;
    if (this._polySince < this._polyHopSamples) return;
    this._polySince = 0;
    const start = this._polyWrite;
    for (let k = 0; k < POLY_N; k++) this._polyScratch[k] = this._polyRing[(start + k) % POLY_N];
    const strings = detectStringOffsets(this._polyScratch, sampleRate, this._targets);
    this.port.postMessage({ type: 'poly', strings, t: currentTime });
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const ch = input[0];
    if (!ch) return true;

    const L = this._L;
    const D = this._D;
    for (let i = 0; i < ch.length; i++) {
      const x = ch[i];
      // 生波形リング（poly 用、常に充填）。
      this._polyRing[this._polyWrite] = x;
      this._polyWrite = (this._polyWrite + 1) % POLY_N;
      if (this._polyFilled < POLY_N) this._polyFilled++;

      if (this._mode === 'mono') {
        // トレーリング 2D 移動平均 → D サンプルごとに1点ダウンサンプル。
        this._rawSum += x - this._rawHist[this._rawIdx];
        this._rawHist[this._rawIdx] = x;
        this._rawIdx = (this._rawIdx + 1) % L;
        if (++this._phase >= D) { this._phase = 0; this._pushDownsampled(this._rawSum / L); }
      }
    }
    this._polySince += ch.length;
    this._maybePoly();
    return true; // 出力なし（destination 非接続＝ハウリング回避）
  }
}

registerProcessor('pitch-processor', PitchProcessor);
