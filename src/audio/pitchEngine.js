import { pitchWorkletUrl } from './workletUrl.js';

/**
 * 再利用可能な低レイテンシ・ピッチ検出エンジン（クラス）。
 *
 *  - AudioContext → AudioWorkletNode をオーディオスレッドで動かし、生の F0 を購読者へ流す。
 *  - mono: `{hz,clarity,rms,t}`（onPitch） / poly: `{type:'poly',strings,t}`（onPoly）。
 *  - **音名判定はここでは行わない**。consumer が domain（freqToNote / nearestStringWithOffset /
 *    StableNoteTracker 等）で解釈する。チューナーにも、将来のスケールあてクイズにも流用できる。
 *  - 設定は `config` で持ち、`configure(partial)` で **起動中でも柔軟に変更**できる
 *    （minHz/maxHz/threshold/rmsGate/hopMs/mode/targets を worklet へ反映）。
 *  - マイクは start(stream) で外から渡すか、start() 省略で **エンジンが内部取得**（その場合は
 *    stop() で解放する）。AudioContext は常にエンジンが所有・破棄する。
 *
 * 依存ゼロ（Web 標準 AudioWorklet のみ）。非対応環境では isSupported()=false。
 *
 * @typedef {Object} PitchEngineConfig
 * @property {number} minHz
 * @property {number} maxHz
 * @property {number} hopMs        mono 検出間隔（ms）
 * @property {number} targetRate   ダウンサンプル目標(Hz)
 * @property {number} threshold    YIN 絶対閾値
 * @property {number} rmsGate      無音ゲート
 * @property {'mono'|'poly'} mode
 * @property {number[]|null} targets poly の弦ごと目標周波数
 *
 * @typedef {Object} PitchSample
 * @property {number|null} hz
 * @property {number} clarity
 * @property {number} rms
 * @property {number} t
 */

/** @type {PitchEngineConfig} */
export const PITCH_ENGINE_DEFAULTS = {
  minHz: 70, maxHz: 700, hopMs: 15, targetRate: 12000,
  threshold: 0.12, rmsGate: 0.005, mode: 'mono', targets: null,
};

/** AudioWorklet が使えるか（DOM 文脈で判定）。 */
export function isPitchEngineSupported() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  return !!(Ctx && Ctx.prototype && 'audioWorklet' in Ctx.prototype);
}

const MIC_CONSTRAINTS = { echoCancellation: false, autoGainControl: false, noiseSuppression: false };

export class PitchEngine {
  /** @param {Partial<PitchEngineConfig>} [config] */
  constructor(config = {}) {
    /** @type {PitchEngineConfig} */
    this._cfg = { ...PITCH_ENGINE_DEFAULTS, ...config };
    this._audioCtx = null;
    this._src = null;
    this._node = null;
    this._ownStream = null;   // エンジンが取得した stream（あれば stop で解放）
    this._started = false;
    this._pitchSubs = new Set();
    this._polySubs = new Set();
  }

  static isSupported() { return isPitchEngineSupported(); }

  /** 現在の設定（コピー）。 */
  get config() { return { ...this._cfg }; }
  get isRunning() { return this._started; }

  /** mono の F0 サンプルを購読。解除関数を返す。 */
  onPitch(cb) { this._pitchSubs.add(cb); return () => this._pitchSubs.delete(cb); }
  /** poly（全弦ズレ）の結果を購読。解除関数を返す。 */
  onPoly(cb) { this._polySubs.add(cb); return () => this._polySubs.delete(cb); }

  _emit(subs, payload) {
    for (const cb of subs) { try { cb(payload); } catch (e) { console.error('PitchEngine subscriber threw', e); } }
  }
  _route(data) {
    if (data && data.type === 'poly') this._emit(this._polySubs, data);
    else this._emit(this._pitchSubs, data);
  }

  async _acquireMic() {
    try { return await navigator.mediaDevices.getUserMedia({ audio: MIC_CONSTRAINTS }); }
    catch (e) {
      if (e && (e.name === 'OverconstrainedError' || e.name === 'NotReadableError')) {
        return await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      throw e;
    }
  }

  /**
   * 計測開始。ユーザー操作直後に呼ぶこと（iOS の resume 制約）。
   * @param {MediaStream} [mediaStream] 省略時はエンジンが内部でマイク取得（stop で解放）。
   */
  async start(mediaStream) {
    if (this._started) return;
    if (!isPitchEngineSupported()) throw new Error('AudioWorklet unsupported');
    let stream = mediaStream;
    if (!stream) { stream = await this._acquireMic(); this._ownStream = stream; }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this._audioCtx = new Ctx();
    await this._audioCtx.resume();
    await this._audioCtx.audioWorklet.addModule(pitchWorkletUrl);
    this._src = this._audioCtx.createMediaStreamSource(stream);
    const c = this._cfg;
    this._node = new AudioWorkletNode(this._audioCtx, 'pitch-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 0, // 解析専用（destination 非接続＝ハウリング回避）
      processorOptions: {
        minHz: c.minHz, maxHz: c.maxHz, hopMs: c.hopMs, targetRate: c.targetRate,
        threshold: c.threshold, rmsGate: c.rmsGate, mode: c.mode, targets: c.targets,
      },
    });
    this._node.port.onmessage = (e) => this._route(e.data);
    this._src.connect(this._node);
    this._started = true;
  }

  /**
   * 設定を部分更新し、起動中なら worklet へ反映（AudioContext は壊さない＝軽い）。
   * @param {Partial<PitchEngineConfig>} partial
   */
  configure(partial = {}) {
    this._cfg = { ...this._cfg, ...partial };
    const p = this._node?.port;
    if (!p) return;
    if ('mode' in partial) p.postMessage({ type: 'mode', mode: this._cfg.mode });
    if ('targets' in partial) p.postMessage({ type: 'targets', targets: this._cfg.targets });
    if (['minHz', 'maxHz', 'threshold', 'rmsGate', 'hopMs'].some(k => k in partial)) {
      p.postMessage({
        type: 'config',
        minHz: this._cfg.minHz, maxHz: this._cfg.maxHz,
        threshold: this._cfg.threshold, rmsGate: this._cfg.rmsGate, hopMs: this._cfg.hopMs,
      });
    }
  }

  /** 検出レンジ変更（configure のショートカット）。 */
  setRange(minHz, maxHz) { this.configure({ minHz, maxHz }); }
  /** 検出モード切替（'mono' | 'poly'）。 */
  setMode(mode) { this.configure({ mode }); }
  /** poly の弦ごと目標周波数を設定。 */
  setTargets(targets) { this.configure({ targets }); }

  /** 計測停止・AudioContext 破棄。内部取得した stream のみ解放（外部 stream は呼び出し側責務）。 */
  stop() {
    this._started = false;
    if (this._src) { try { this._src.disconnect(); } catch { /* noop */ } this._src = null; }
    if (this._node) { try { this._node.disconnect(); } catch { /* noop */ } this._node.port.onmessage = null; this._node = null; }
    if (this._audioCtx) { this._audioCtx.close().catch(() => {}); this._audioCtx = null; }
    if (this._ownStream) { this._ownStream.getTracks().forEach(t => t.stop()); this._ownStream = null; }
    this._pitchSubs.clear();
    this._polySubs.clear();
  }
}

/**
 * 互換ファクトリ（既存呼び出し用の薄いラッパ）。新規コードは `new PitchEngine()` を推奨。
 * @param {Partial<PitchEngineConfig>} config
 */
export function createPitchEngine(config) {
  const e = new PitchEngine(config);
  return {
    start: (s) => e.start(s),
    onPitch: (cb) => e.onPitch(cb),
    onPoly: (cb) => e.onPoly(cb),
    setRange: (a, b) => e.setRange(a, b),
    setMode: (m) => e.setMode(m),
    setTargets: (t) => e.setTargets(t),
    configure: (p) => e.configure(p),
    stop: () => e.stop(),
    isSupported: isPitchEngineSupported,
    engine: e,
  };
}
