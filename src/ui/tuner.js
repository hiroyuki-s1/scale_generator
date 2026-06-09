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
const GRAPH_WINDOW_MS = 6000; // ピッチ推移グラフの時間窓（横軸）
const GRAPH_CENTS_SPAN = 50;  // 縦軸の上下レンジ（基準音 ±この cents 相当の Hz）

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
  const retryBtn = document.getElementById('tunerRetryBtn');
  const graphCanvas = document.getElementById('tunerGraph');
  const gctx = graphCanvas ? graphCanvas.getContext('2d') : null;
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
  let history = [];   // ピッチ推移: { t:ms, hz:number|null } の時系列（直近 GRAPH_WINDOW_MS）
  let refHz = null;   // グラフ縦軸の基準周波数（直近検出音の平均律周波数）
  let gW = 0, gH = 0; // canvas の論理サイズ(px)

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
    resetGraph(); // 楽器が変わると音域が変わるので推移はリセット
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

    // グラフ縦軸の基準＝検出音の平均律周波数（揺れはこの線まわりに見える）。
    refHz = 440 * Math.pow(2, (note.midi - 69) / 12);

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
    const now = ts || 0;
    // 解析は ANALYZE_MS 間隔（重い低音解析を抑制）。描画は毎フレームで滑らかにスクロール。
    if (now - lastTs >= ANALYZE_MS) {
      lastTs = now;
      analyser.getFloatTimeDomainData(buf);
      const cfg = INSTR[instr];
      const r = detectPitchYIN(buf, audioCtx.sampleRate, { minHz: cfg.minHz, maxHz: cfg.maxHz });
      render(r);
      pushHistory(now, r ? r.hz : null);
    }
    drawGraph(now);
  }

  // ── ピッチ推移グラフ（横:時間 / 縦:周波数） ──────────────────────────
  function pushHistory(t, hz) {
    history.push({ t, hz });
    const cutoff = t - GRAPH_WINDOW_MS - 200;
    while (history.length && history[0].t < cutoff) history.shift();
  }

  function resizeGraph() {
    if (!graphCanvas || !gctx) return;
    const rect = graphCanvas.getBoundingClientRect();
    if (rect.width === 0) return; // 非表示中は 0 → 後で再試行
    const dpr = window.devicePixelRatio || 1;
    graphCanvas.width = Math.round(rect.width * dpr);
    graphCanvas.height = Math.round(rect.height * dpr);
    gW = rect.width; gH = rect.height;
    gctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function cssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name);
    return (v && v.trim()) || fallback;
  }

  function drawGraph(now) {
    if (!gctx) return;
    if (gW === 0) { resizeGraph(); if (gW === 0) return; }
    gctx.clearRect(0, 0, gW, gH);

    if (!refHz) {
      gctx.fillStyle = cssVar('--text-3', '#b0a9a1');
      gctx.font = '12px sans-serif';
      gctx.textAlign = 'center';
      gctx.fillText('音を鳴らすとピッチの推移が表示されます', gW / 2, gH / 2);
      return;
    }

    const loHz = refHz * Math.pow(2, -GRAPH_CENTS_SPAN / 1200);
    const hiHz = refHz * Math.pow(2, GRAPH_CENTS_SPAN / 1200);
    const yOf = hz => {
      const c = Math.max(loHz, Math.min(hiHz, hz));
      return gH * (1 - (c - loHz) / (hiHz - loHz));
    };
    const xOf = t => gW * (1 - (now - t) / GRAPH_WINDOW_MS);

    const colBorder = cssVar('--border-2', '#f0ece5');
    const colText   = cssVar('--text-3', '#b0a9a1');
    const colAccent = cssVar('--accent', '#c0511f');
    const colGreen  = cssVar('--green', '#16a34a');

    // 補助線（±25 / ±50 cents 相当）
    gctx.lineWidth = 1; gctx.strokeStyle = colBorder;
    [-50, -25, 25, 50].forEach(c => {
      const y = yOf(refHz * Math.pow(2, c / 1200));
      gctx.beginPath(); gctx.moveTo(0, y); gctx.lineTo(gW, y); gctx.stroke();
    });
    // 中心線（緑＝ジャスト）
    const yc = yOf(refHz);
    gctx.strokeStyle = colGreen; gctx.lineWidth = 1.5;
    gctx.beginPath(); gctx.moveTo(0, yc); gctx.lineTo(gW, yc); gctx.stroke();

    // 縦軸ラベル（Hz）
    gctx.fillStyle = colText; gctx.font = '10px sans-serif'; gctx.textAlign = 'left';
    gctx.fillText(`${hiHz.toFixed(1)}Hz`, 4, 11);
    gctx.fillText(`${refHz.toFixed(1)}Hz`, 4, Math.max(20, yc - 3));
    gctx.fillText(`${loHz.toFixed(1)}Hz`, 4, gH - 4);

    // ピッチ推移ライン（検出が途切れた区間はギャップ）
    gctx.strokeStyle = colAccent; gctx.lineWidth = 2;
    gctx.lineJoin = 'round'; gctx.lineCap = 'round';
    gctx.beginPath();
    let pen = false;
    for (const s of history) {
      if (s.hz == null) { pen = false; continue; }
      const x = xOf(s.t);
      if (x < 0) { pen = false; continue; }
      const y = yOf(s.hz);
      if (!pen) { gctx.moveTo(x, y); pen = true; } else gctx.lineTo(x, y);
    }
    gctx.stroke();
  }

  function resetGraph() {
    history = [];
    refHz = null;
    if (gctx && gW > 0) gctx.clearRect(0, 0, gW, gH);
  }

  // マイク取得。生信号がほしいので補正を切るが、端末が拒否(Overconstrained/NotReadable)した
  // 場合は素の audio:true に後退して再取得する。
  async function acquireMic() {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, autoGainControl: false, noiseSuppression: false },
      });
    } catch (e) {
      if (e && (e.name === 'OverconstrainedError' || e.name === 'NotReadableError')) {
        return await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      throw e;
    }
  }

  // 失敗理由ごとに案内を出し、「再試行」ボタンを表示する。
  function showMicError(e) {
    const name = e && e.name;
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      showIdle('マイク未許可');
      hintEl.textContent = 'マイクがブロックされています。アドレスバーのマイクアイコンから「許可」して再試行してください。';
    } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      showIdle('マイクなし');
      hintEl.textContent = 'マイクが見つかりません。デバイスの接続を確認してください。';
    } else if (name === 'NotReadableError') {
      showIdle('使用中');
      hintEl.textContent = '他のアプリがマイクを使用中の可能性があります。閉じてから再試行してください。';
    } else {
      showIdle('エラー');
      hintEl.textContent = 'マイクを使用できませんでした。許可状況を確認して再試行してください。';
    }
    retryBtn?.classList.remove('hidden');
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
    retryBtn?.classList.add('hidden');
    let stream;
    try {
      stream = await acquireMic();
    } catch (e) {
      console.error('チューナー: マイク取得に失敗', e);
      showMicError(e);
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
    resetGraph();
    resizeGraph(); // オーバーレイ表示後にレイアウト確定 → canvas 実寸を取得
    track('tuner_open', { instrument: instr }); // [removable-analytics]
    start();
  }

  function close() {
    if (!isOpen()) return;
    overlay.classList.add('hidden');
    retryBtn?.classList.add('hidden');
    stop();
    resetGraph();
  }

  // ── イベント配線 ──
  openTrigger.addEventListener('click', open);
  closeBtn?.addEventListener('click', close);
  retryBtn?.addEventListener('click', () => { if (!active) start(); });
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  instrBox?.addEventListener('click', e => {
    const btn = e.target.closest('.tuner-instr-btn');
    if (btn) setInstrument(btn.dataset.instr);
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && isOpen()) close(); });
  window.addEventListener('resize', () => { if (isOpen()) resizeGraph(); });

  // 初期描画（閉じている状態の弦ピル）。
  setInstrument(instr);

  return { open, close };
}
