import {
  detectPitchYIN, freqToNote, nearestOpenString, midiToFreq, noteLabelFromMidi,
} from '../domain/pitch.js';
import {
  TUNING_GUITAR, TUNING_BASS, STRING_LABELS_GUITAR, STRING_LABELS_BASS,
} from '../domain/constants.js';
import { track } from '../state/track.js'; // [removable-analytics] 後で消す前提（migrations/0006）

/**
 * チューナー（全画面オーバーレイ）。`…` メニューの「チューナー」から開く。
 *
 *  - getUserMedia → AudioContext → AnalyserNode を rAF ループで読み、
 *    domain/pitch.js（純 YIN）で F0 を推定。
 *  - モード:
 *      ギター/ベース … 対応する開放弦のみを対象（最寄り開放弦に合わせる。Eの次はA）
 *      ノーマル       … 12 音クロマチック（最寄り平均律音に合わせる。Eの次はF）
 *  - 上部はデジタル表示（粗くチェック）、下部のグラフでピッチの揺れを細かく確認。
 *  - 基準ピッチ A は 430〜450Hz（既定440）で可変。localStorage に保存。
 *  - 音が一瞬途切れても表示は HOLD_MS（3秒）まで維持し、グラフもその間は線を繋ぐ。
 *  - このオーバーレイは「戻る」ボタン（と Esc）でのみ閉じる（背景クリックでは閉じない）。
 *  - 閉じる時にマイク（MediaStreamTrack）と AudioContext を確実に解放する。
 *
 * 落とさない方針: マイク不可・未対応ブラウザでもアプリ本体は継続（オーバーレイ内で案内）。
 */

const INSTR = {
  guitar: { mode: 'string',    tuning: TUNING_GUITAR, labels: STRING_LABELS_GUITAR, minHz: 70, maxHz: 700,  fftSize: 4096 },
  bass:   { mode: 'string',    tuning: TUNING_BASS,   labels: STRING_LABELS_BASS,   minHz: 35, maxHz: 400,  fftSize: 8192 }, // E1=41Hz は長い窓が必要
  normal: { mode: 'chromatic', tuning: null,          labels: [],                   minHz: 40, maxHz: 2000, fftSize: 8192 },
};

const IN_TUNE_CENTS = 5;      // ±これ以内で「合っている（緑）」
const ANALYZE_MS = 40;        // 解析の最小間隔（≈25fps。低音の重い解析でも CPU を抑える）
const HOLD_MS = 3000;         // 音が途切れても表示を維持する時間
const GRAPH_WINDOW_MS = 6000; // ピッチ推移グラフの時間窓（横軸）
const GRAPH_CENTS_SPAN = 50;  // 縦軸の上下レンジ（基準音 ±この cents 相当の Hz）

const A4_DEFAULT = 440, A4_MIN = 430, A4_MAX = 450;
const A4_KEY = 'sg.v1.tunerA4';
function loadA4() {
  try {
    const v = parseInt(localStorage.getItem(A4_KEY), 10);
    if (Number.isFinite(v) && v >= A4_MIN && v <= A4_MAX) return v;
  } catch { /* private mode */ }
  return A4_DEFAULT;
}
function saveA4(v) { try { localStorage.setItem(A4_KEY, String(v)); } catch { /* noop */ } }

export function initTuner(store) {
  const overlay   = document.getElementById('tunerOverlay');
  const backBtn   = document.getElementById('tunerBackBtn');
  const instrBox  = document.getElementById('tunerInstr');
  const digitalEl = document.getElementById('tunerDigital');
  const noteEl    = document.getElementById('tunerNote');
  const freqEl    = document.getElementById('tunerFreq');
  const centsEl   = document.getElementById('tunerCents');
  const dirFlatEl = document.getElementById('tunerDirFlat');
  const dirSharpEl= document.getElementById('tunerDirSharp');
  const stringsEl = document.getElementById('tunerStrings');
  const hintEl    = document.getElementById('tunerHint');
  const retryBtn  = document.getElementById('tunerRetryBtn');
  const a4ValEl   = document.getElementById('tunerA4Val');
  const a4DownBtn = document.getElementById('tunerA4Down');
  const a4UpBtn   = document.getElementById('tunerA4Up');
  const graphCanvas = document.getElementById('tunerGraph');
  const gctx = graphCanvas ? graphCanvas.getContext('2d') : null;
  const openTrigger = document.querySelector('[data-act="tuner"]');
  if (!overlay || !openTrigger) return;

  let instr = store.get().edit?.instrument === 'bass' ? 'bass' : 'guitar';
  let a4 = loadA4();
  let audioCtx = null, analyser = null, mediaStream = null, buf = null;
  let rafId = 0, lastTs = 0, active = false;
  let lastResult = null, lastResultT = 0;  // 直近の有効検出（ホールド用）
  let history = [];   // ピッチ推移: { t:ms, hz:number|null } の時系列（直近 GRAPH_WINDOW_MS）
  let refHz = null;   // グラフ縦軸の基準周波数（対象音の周波数）
  let gW = 0, gH = 0; // canvas の論理サイズ(px)

  const isOpen = () => !overlay.classList.contains('hidden');

  // ── 基準ピッチ A ───────────────────────────────────────────────
  function renderA4() {
    if (a4ValEl) a4ValEl.textContent = `${a4} Hz`;
    if (a4DownBtn) a4DownBtn.disabled = a4 <= A4_MIN;
    if (a4UpBtn) a4UpBtn.disabled = a4 >= A4_MAX;
  }
  function setA4(v) {
    const n = Math.max(A4_MIN, Math.min(A4_MAX, Math.round(v)));
    if (n === a4) return;
    a4 = n; saveA4(a4); renderA4();
    resetGraph(); // 基準が変わると縦軸が変わるため推移はリセット
  }

  // ── 弦ピル（演奏順 = 低音→高音に左→右で並べる。ノーマルでは非表示） ──
  function renderStrings() {
    if (!stringsEl) return;
    const cfg = INSTR[instr];
    stringsEl.innerHTML = '';
    if (cfg.mode !== 'string') { stringsEl.style.display = 'none'; return; }
    stringsEl.style.display = '';
    for (let i = cfg.labels.length - 1; i >= 0; i--) {
      const pill = document.createElement('div');
      pill.className = 'tuner-string';
      pill.dataset.index = String(i); // tuning 配列上の index
      pill.textContent = cfg.labels[i];
      stringsEl.appendChild(pill);
    }
  }
  function clearStringHighlight() {
    stringsEl?.querySelectorAll('.tuner-string').forEach(el => el.classList.remove('target', 'in-tune'));
  }

  function setInstrument(next) {
    if (!INSTR[next]) return;
    instr = next;
    instrBox?.querySelectorAll('.tuner-instr-btn').forEach(b => {
      const on = b.dataset.instr === instr;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', String(on));
    });
    renderStrings();
    resetGraph();          // 音域が変わるので推移はリセット
    lastResult = null;
    if (analyser) {
      analyser.fftSize = INSTR[instr].fftSize;
      buf = new Float32Array(analyser.fftSize);
    }
  }

  function showIdle(message) {
    noteEl.textContent = '–';
    digitalEl?.classList.remove('in-tune', 'held');
    freqEl.textContent = message ?? '音を鳴らしてください';
    centsEl.textContent = '--';
    dirFlatEl?.classList.remove('on');
    dirSharpEl?.classList.remove('on');
    clearStringHighlight();
  }

  /**
   * 検出結果を表示。
   * @param {{hz:number}|null} result detectPitchYIN の戻り
   * @param {boolean} held ホールド（直近値の維持）表示か
   */
  function render(result, held) {
    if (!result) { showIdle(); return; }
    const cfg = INSTR[instr];
    let label, cents, targetMidi, nearIndex = -1;

    if (cfg.mode === 'string') {
      // 対応する開放弦のうち最寄りに合わせる（Eの次はA…）。
      const near = nearestOpenString(result.hz, cfg.tuning, a4);
      if (!near) { showIdle(); return; }
      targetMidi = near.midi;
      nearIndex = near.index;
      cents = Math.round(near.cents);
      label = noteLabelFromMidi(near.midi).label;
    } else {
      // 12 音クロマチック（Eの次はF…）。
      const note = freqToNote(result.hz, a4);
      if (!note) { showIdle(); return; }
      targetMidi = note.midi;
      cents = note.cents;
      label = note.label;
    }

    const inTune = Math.abs(cents) <= IN_TUNE_CENTS;
    refHz = midiToFreq(targetMidi, a4);

    noteEl.textContent = label;
    centsEl.textContent = cents === 0 ? '±0¢' : `${cents > 0 ? '+' : ''}${cents}¢`;
    freqEl.textContent = `${result.hz.toFixed(1)} Hz`;
    digitalEl?.classList.toggle('in-tune', inTune && !held);
    digitalEl?.classList.toggle('held', !!held);
    dirFlatEl?.classList.toggle('on', cents < -IN_TUNE_CENTS);   // 低い → ♭ を点灯（上げる）
    dirSharpEl?.classList.toggle('on', cents > IN_TUNE_CENTS);   // 高い → ♯ を点灯（下げる）

    clearStringHighlight();
    if (cfg.mode === 'string' && nearIndex >= 0 && Math.abs(cents) < 50) {
      const pill = stringsEl?.querySelector(`.tuner-string[data-index="${nearIndex}"]`);
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
      if (r) {
        lastResult = r; lastResultT = now;
        render(r, false);
        pushHistory(now, r.hz);
      } else if (lastResult && now - lastResultT <= HOLD_MS) {
        // 一瞬の途切れ: 直近値を維持（表示は薄く）。グラフも直近値で線を繋ぐ。
        render(lastResult, true);
        pushHistory(now, lastResult.hz);
      } else {
        lastResult = null;
        render(null, false);
        pushHistory(now, null);
      }
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

    // ピッチ推移ライン（検出が完全に途切れた区間＝null はギャップ）
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

  // ── マイク取得 ───────────────────────────────────────────────
  // 生信号がほしいので補正を切るが、端末が拒否(Overconstrained/NotReadable)した場合は
  // 素の audio:true に後退して再取得する。
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
      hintEl.textContent = '近くで1音ずつ鳴らしてください';
      lastTs = 0;
      lastResult = null;
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
    renderA4();
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
  backBtn?.addEventListener('click', close);
  retryBtn?.addEventListener('click', () => { if (!active) start(); });
  a4DownBtn?.addEventListener('click', () => setA4(a4 - 1));
  a4UpBtn?.addEventListener('click', () => setA4(a4 + 1));
  instrBox?.addEventListener('click', e => {
    const btn = e.target.closest('.tuner-instr-btn');
    if (btn) setInstrument(btn.dataset.instr);
  });
  // 背景クリックでは閉じない（このオーバーレイは「戻る」ボタン / Esc でのみ閉じる）。
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && isOpen()) close(); });
  window.addEventListener('resize', () => { if (isOpen()) resizeGraph(); });

  // 初期描画（閉じている状態の弦ピル・A4 表示）。
  setInstrument(instr);
  renderA4();

  return { open, close };
}
