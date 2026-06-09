import { detectPitchYIN, freqToNote, nearestOpenString } from '../domain/pitch.js';
import {
  TUNING_GUITAR, TUNING_BASS, STRING_LABELS_GUITAR, STRING_LABELS_BASS,
} from '../domain/constants.js';
import { track } from '../state/track.js'; // [removable-analytics] 後で消す前提（migrations/0006）

/**
 * チューナー（全画面オーバーレイ）。`…` メニューの「チューナー」から開く。
 *
 *  - getUserMedia → AudioContext → AnalyserNode を rAF ループで読み、
 *    domain/pitch.js（純 YIN）で F0 を推定 → 音名・セント・最寄り開放弦を表示。
 *  - ギター/ベースを切り替え（弦セット・検出レンジ・解析窓を変える。
 *    ベース最低弦 E1(41Hz) に届くよう fftSize を大きく取る）。
 *  - 閉じる時にマイク（MediaStreamTrack）と AudioContext を確実に解放する。
 *
 * 落とさない方針: マイク不可・未対応ブラウザでもアプリ本体は継続（オーバーレイ内で案内）。
 */

const INSTR = {
  guitar: {
    tuning: TUNING_GUITAR, labels: STRING_LABELS_GUITAR,
    minHz: 70, maxHz: 700, fftSize: 4096,
  },
  bass: {
    tuning: TUNING_BASS, labels: STRING_LABELS_BASS,
    minHz: 35, maxHz: 400, fftSize: 8192, // E1=41Hz は長い窓が必要
  },
};

const IN_TUNE_CENTS = 5;     // ±これ以内で「合っている（緑）」
const NEEDLE_SMOOTH = 0.35;  // 針の EMA 係数（0..1、大きいほど追従が速い）
const ANALYZE_MS = 40;       // 解析の最小間隔（≈25fps。低音の重い解析でも CPU を抑える）

export function initTuner(store) {
  const overlay  = document.getElementById('tunerOverlay');
  const closeBtn = document.getElementById('tunerCloseBtn');
  const instrBox = document.getElementById('tunerInstr');
  const noteEl   = document.getElementById('tunerNote');
  const freqEl   = document.getElementById('tunerFreq');
  const meterEl  = document.getElementById('tunerMeter');
  const needleEl = document.getElementById('tunerNeedle');
  const centsEl  = document.getElementById('tunerCents');
  const stringsEl = document.getElementById('tunerStrings');
  const hintEl   = document.getElementById('tunerHint');
  const openTrigger = document.querySelector('[data-act="tuner"]');
  if (!overlay || !openTrigger) return;

  let instr = store.get().edit?.instrument === 'bass' ? 'bass' : 'guitar';
  let audioCtx = null;
  let analyser = null;
  let mediaStream = null;
  let buf = null;
  let rafId = 0;
  let lastTs = 0;
  let smoothCents = 0;
  let active = false;

  const isOpen = () => !overlay.classList.contains('hidden');

  // ── 弦ピル描画（演奏順 = 低音→高音に左→右で並べる） ──
  function renderStrings() {
    if (!stringsEl) return;
    const cfg = INSTR[instr];
    stringsEl.innerHTML = '';
    // tuning/labels は高音→低音の並び。低音→高音へ反転して表示。
    for (let i = cfg.labels.length - 1; i >= 0; i--) {
      const pill = document.createElement('div');
      pill.className = 'tuner-string';
      pill.dataset.index = String(i); // tuning 配列上の index
      pill.textContent = cfg.labels[i];
      stringsEl.appendChild(pill);
    }
  }

  function clearStringHighlight() {
    stringsEl?.querySelectorAll('.tuner-string').forEach(el => {
      el.classList.remove('target', 'in-tune');
    });
  }

  function setInstrument(next) {
    if (next !== 'guitar' && next !== 'bass') return;
    instr = next;
    instrBox?.querySelectorAll('.tuner-instr-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.instr === instr);
      b.setAttribute('aria-selected', String(b.dataset.instr === instr));
    });
    renderStrings();
    smoothCents = 0;
    if (analyser) {
      analyser.fftSize = INSTR[instr].fftSize;
      buf = new Float32Array(analyser.fftSize);
    }
  }

  function showIdle(message) {
    noteEl.textContent = '–';
    noteEl.classList.remove('in-tune');
    freqEl.textContent = message ?? '弦を鳴らしてください';
    centsEl.textContent = '';
    meterEl?.classList.remove('in-tune');
    if (needleEl) needleEl.style.left = '50%';
    clearStringHighlight();
  }

  function render(result) {
    if (!result) { showIdle(); return; }
    const note = freqToNote(result.hz);
    const near = nearestOpenString(result.hz, INSTR[instr].tuning);
    if (!note) { showIdle(); return; }

    const cents = note.cents;            // 最寄り平均律音からのズレ（-50..+50）
    const inTune = Math.abs(cents) <= IN_TUNE_CENTS;

    noteEl.textContent = note.label;
    noteEl.classList.toggle('in-tune', inTune);
    freqEl.textContent = `${result.hz.toFixed(1)} Hz`;
    centsEl.textContent = `${cents > 0 ? '+' : ''}${cents}¢`;
    meterEl?.classList.toggle('in-tune', inTune);

    // 針：セントを EMA で平滑化し、-50..+50 を 0%..100% にマップ。
    smoothCents += (cents - smoothCents) * NEEDLE_SMOOTH;
    const clamped = Math.max(-50, Math.min(50, smoothCents));
    if (needleEl) needleEl.style.left = `${(clamped + 50)}%`;

    // 弦ハイライト：半音以内に最寄り弦があるときだけ点灯。
    clearStringHighlight();
    if (near && Math.abs(near.cents) < 50) {
      const pill = stringsEl?.querySelector(`.tuner-string[data-index="${near.index}"]`);
      if (pill) { pill.classList.add('target'); pill.classList.toggle('in-tune', inTune); }
    }
  }

  function loop(ts) {
    rafId = requestAnimationFrame(loop);
    if (!analyser || !audioCtx) return;
    if (ts && ts - lastTs < ANALYZE_MS) return;
    lastTs = ts || 0;
    analyser.getFloatTimeDomainData(buf);
    const cfg = INSTR[instr];
    const r = detectPitchYIN(buf, audioCtx.sampleRate, { minHz: cfg.minHz, maxHz: cfg.maxHz });
    render(r);
  }

  async function start() {
    if (active) return;
    active = true;
    showIdle('マイクの準備中…');
    if (!navigator.mediaDevices?.getUserMedia || !(window.AudioContext || window.webkitAudioContext)) {
      hintEl.textContent = 'お使いのブラウザはマイク入力に対応していません。';
      active = false;
      return;
    }
    let stream;
    try {
      // チューナーは生の信号がほしいので各種補正は切る。
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, autoGainControl: false, noiseSuppression: false },
      });
    } catch (e) {
      console.error('チューナー: マイク取得に失敗', e);
      hintEl.textContent = 'マイクを使用できません。ブラウザのマイク許可を確認してください。';
      showIdle('マイク未許可');
      active = false;
      return;
    }
    // await 中にユーザーが閉じていたら、取得したマイクを即解放して中断。
    if (!active || !isOpen()) {
      stream.getTracks().forEach(t => t.stop());
      return;
    }
    mediaStream = stream;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      await audioCtx.resume(); // iOS: ユーザー操作直後に resume
      const srcNode = audioCtx.createMediaStreamSource(mediaStream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = INSTR[instr].fftSize;
      buf = new Float32Array(analyser.fftSize);
      // analyser は destination に繋がない（ハウリング/エコー回避）。
      srcNode.connect(analyser);
      hintEl.textContent = '近くで弦を1本ずつ鳴らしてください';
      lastTs = 0;
      rafId = requestAnimationFrame(loop);
    } catch (e) {
      console.error('チューナー: AudioContext 初期化に失敗', e);
      hintEl.textContent = 'オーディオの初期化に失敗しました。';
      stop();
    }
  }

  function stop() {
    active = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    if (mediaStream) { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null; }
    if (audioCtx) { audioCtx.close().catch(() => {}); audioCtx = null; }
    analyser = null;
    buf = null;
  }

  function open() {
    if (isOpen()) return;
    // 開くたびにアプリの現在楽器に追随（ユーザーが途中で変えていれば尊重）。
    setInstrument(store.get().edit?.instrument === 'bass' ? 'bass' : 'guitar');
    overlay.classList.remove('hidden');
    track('tuner_open', { instrument: instr }); // [removable-analytics]
    start();
  }

  function close() {
    if (!isOpen()) return;
    overlay.classList.add('hidden');
    stop();
  }

  // ── イベント配線 ──
  openTrigger.addEventListener('click', open);
  closeBtn?.addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  instrBox?.addEventListener('click', e => {
    const btn = e.target.closest('.tuner-instr-btn');
    if (btn) setInstrument(btn.dataset.instr);
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && isOpen()) close(); });

  // 初期描画（閉じている状態の弦ピル）。
  setInstrument(instr);

  return { open, close };
}
