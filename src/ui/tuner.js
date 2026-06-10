import { freqToNote, midiToFreq, noteLabelFromMidi } from '../domain/pitch.js';
import { createPitchEngine, isPitchEngineSupported } from '../audio/pitchEngine.js';
import {
  tuningsFor, findTuning, labelsForMidi, nearestStringWithOffset, tuningRange,
  targetsHz, SWEETENED, zeroOffsets,
} from '../domain/tunings.js';
import { advanceStrobePhase } from '../domain/strobe.js';
import { track } from '../state/track.js'; // [removable-analytics] 後で消す前提（migrations/0006）

/**
 * チューナー（全画面オーバーレイ）。`…` メニューの「チューナー」から開く。
 *
 *  - getUserMedia → audio/pitchEngine（AudioWorklet）でオーディオスレッド上で検出。
 *  - 楽器: ギター/ベース（チューニング対応・開放弦に合わせる）/ ノーマル（12音クロマチック）。
 *  - チューニング: スタンダード＋オルタネート（Drop D, DADGAD, Open G/D, 半音/1音下げ…）を無料提供。
 *  - 甘い調弦（スウィートンド/オフセット）: 弦ごとに目標を ±¢ 補正し開放和音の濁りを抑える。
 *  - 表示モード3種:
 *      メーター … 音名/セント + ピッチ推移グラフ（mono・低レイテンシ）
 *      ストロボ … 縞の流れで高精度に合わせる（mono・位相積分で高感度）
 *      ポリ     … ジャラーンと1回で全弦の過不足を同時表示（poly）
 *  - 基準ピッチ A は 430〜450Hz（既定440）。チューニング/甘い調弦/モードは localStorage 保存。
 *  - 「戻る」/ Esc でのみ閉じる（背景クリックでは閉じない）。閉じる時にマイク/AudioContext を解放。
 *
 * 落とさない方針: マイク不可・未対応でもアプリ本体は継続（オーバーレイ内で案内）。
 * AudioWorklet 非対応端末は検出せず案内のみ（メインスレッド・フォールバックは持たない）。
 */

const NORMAL = { minHz: 40, maxHz: 2000 };
const IN_TUNE_CENTS = 5;      // ±これ以内で「合っている（緑）」
const HOP_MS = 15;            // mono エンジンの検出間隔（≈66Hz）
const HOLD_MS = 3000;         // 音が途切れても表示を維持する時間
const STROBE_PERIOD_PX = 56;  // ストロボ縞の1周期px

const A4_DEFAULT = 440, A4_MIN = 430, A4_MAX = 450;
const A4_KEY = 'sg.v1.tunerA4';
const TUNING_KEY = 'sg.v1.tunerTuning';   // { guitar:id, bass:id }
const SWEETEN_KEY = 'sg.v1.tunerSweeten'; // '1' | '0'
const VIEW_KEY = 'sg.v1.tunerView';       // 'needle' | 'strobe' | 'poly'

function loadA4() {
  try {
    const v = parseInt(localStorage.getItem(A4_KEY), 10);
    if (Number.isFinite(v) && v >= A4_MIN && v <= A4_MAX) return v;
  } catch { /* private mode */ }
  return A4_DEFAULT;
}
function saveA4(v) { try { localStorage.setItem(A4_KEY, String(v)); } catch { /* noop */ } }
function loadTuningIds() {
  try { return JSON.parse(localStorage.getItem(TUNING_KEY)) || {}; } catch { return {}; }
}
function saveTuningIds(m) { try { localStorage.setItem(TUNING_KEY, JSON.stringify(m)); } catch { /* noop */ } }
function loadSweeten() { try { return localStorage.getItem(SWEETEN_KEY) === '1'; } catch { return false; } }
function saveSweeten(v) { try { localStorage.setItem(SWEETEN_KEY, v ? '1' : '0'); } catch { /* noop */ } }
function loadView() {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    if (v === 'needle' || v === 'strobe' || v === 'poly') return v;
  } catch { /* noop */ }
  return 'needle';
}
function saveView(v) { try { localStorage.setItem(VIEW_KEY, v); } catch { /* noop */ } }

export function initTuner(store) {
  const overlay   = document.getElementById('tunerOverlay');
  const backBtn   = document.getElementById('tunerBackBtn');
  const instrBox  = document.getElementById('tunerInstr');
  const tuningRow = document.getElementById('tunerTuningRow');
  const tuningSel = document.getElementById('tunerTuning');
  const sweetenBtn= document.getElementById('tunerSweeten');
  const viewTabs  = document.getElementById('tunerViewTabs');
  const settingsToggle = document.getElementById('tunerSettingsToggle');
  const settingsPanel = document.getElementById('tunerSettings');
  const noteRow   = document.getElementById('tunerNoteRow');
  const noteEl    = document.getElementById('tunerNote');
  const arrowL    = document.getElementById('tunerArrowL');
  const arrowR    = document.getElementById('tunerArrowR');
  const freqEl    = document.getElementById('tunerFreq');
  const centsEl   = document.getElementById('tunerCents');
  const centsBox  = centsEl ? centsEl.parentElement : null;
  const stringsEl = document.getElementById('tunerStrings');
  const hintEl    = document.getElementById('tunerHint');
  const retryBtn  = document.getElementById('tunerRetryBtn');
  const a4ValEl   = document.getElementById('tunerA4Val');
  const a4DownBtn = document.getElementById('tunerA4Down');
  const a4UpBtn   = document.getElementById('tunerA4Up');
  const instrNameEl = document.getElementById('tunerInstrName');
  const tuningNameEl = document.getElementById('tunerTuningName');
  const meterEl   = document.getElementById('tunerMeter');
  const barsEl    = document.getElementById('tunerBars');
  const baselineEl= document.getElementById('tunerBaseline');
  const rulerStrip= document.getElementById('tunerRulerStrip');
  const rulerNeedle = document.getElementById('tunerRulerNeedle');
  const strobeWrap = document.getElementById('tunerStrobeWrap');
  const strobeCanvas = document.getElementById('tunerStrobe');
  const sctx = strobeCanvas ? strobeCanvas.getContext('2d') : null;
  const polyEl = document.getElementById('tunerPoly');

  // バーメーターの基準目盛 + バーを一度だけ生成。
  const BAR_HEIGHTS = [26, 42, 60, 72, 56];
  const barEls = [];
  function buildMeterDom() {
    if (baselineEl && !baselineEl.childElementCount) {
      for (let i = 0; i < 25; i++) { const t = document.createElement('div'); t.className = 'tk-tick'; baselineEl.appendChild(t); }
    }
    if (barsEl && !barsEl.childElementCount) {
      for (const h of BAR_HEIGHTS) { const b = document.createElement('div'); b.className = 'tk-bar'; b.style.height = `${h}px`; barsEl.appendChild(b); barEls.push(b); }
    }
  }
  const CHROM = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const openTrigger = document.querySelector('[data-act="tuner"]');
  if (!overlay || !openTrigger) return;

  let instr = store.get().edit?.instrument === 'bass' ? 'bass' : 'guitar';
  let a4 = loadA4();
  let tuningIds = loadTuningIds();
  let sweeten = loadSweeten();
  let viewMode = loadView();
  let currentMidi = null;   // ギター/ベース時の弦 MIDI 配列（ノーマルは null）
  let currentLabels = [];
  let offsets = [];

  let engine = null, mediaStream = null;
  let rafId = 0, active = false;
  let lastResult = null, lastResultT = 0;
  // ストロボ
  let strobePhase = 0, strobeLastT = 0, strobeDetectedHz = 0, strobeTargetHz = 0, strobePresent = false;
  let sW = 0, sH = 0;

  const isOpen = () => !overlay.classList.contains('hidden');
  const isStringInstr = () => instr !== 'normal';

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
    resetGraph(); resetStrobe();
    syncEngine(); // 目標周波数が全体的に移調する
  }

  // ── チューニング/オフセット ───────────────────────────────────
  function recomputeTuning() {
    if (isStringInstr()) {
      const t = findTuning(instr, tuningIds[instr]);
      if (tuningIds[instr] !== t.id) tuningIds = { ...tuningIds, [instr]: t.id };
      currentMidi = t.midi;
      currentLabels = labelsForMidi(t.midi);
      offsets = sweeten ? (SWEETENED[instr] || zeroOffsets(t.midi.length)) : zeroOffsets(t.midi.length);
    } else {
      currentMidi = null; currentLabels = []; offsets = [];
    }
    updateIdLabel();
  }

  // ヘッダの「ギター 6弦 / スタンダード」表示を現在状態に同期。
  function updateIdLabel() {
    if (instrNameEl) {
      instrNameEl.textContent = instr === 'bass' ? `ベース ${currentLabels.length}弦`
        : instr === 'normal' ? 'クロマチック'
          : `ギター ${currentLabels.length || 6}弦`;
    }
    if (tuningNameEl) {
      if (!isStringInstr()) tuningNameEl.textContent = '全音検出';
      else {
        const t = findTuning(instr, tuningIds[instr]);
        tuningNameEl.textContent = sweeten ? `${t.name} · 甘い調弦` : t.name;
      }
    }
  }

  function populateTuningSelect() {
    if (!tuningSel || !tuningRow) return;
    // ノーマルは visibility:hidden で「消さず高さだけ予約」→ 楽器切替で位置がずれない。
    if (!isStringInstr()) { tuningRow.style.visibility = 'hidden'; return; }
    tuningRow.style.visibility = 'visible';
    tuningSel.innerHTML = '';
    for (const t of tuningsFor(instr)) {
      const opt = document.createElement('option');
      opt.value = t.id; opt.textContent = t.name;
      tuningSel.appendChild(opt);
    }
    tuningSel.value = tuningIds[instr] || 'standard';
    renderSweeten();
  }

  function renderSweeten() {
    if (!sweetenBtn) return;
    sweetenBtn.classList.toggle('active', sweeten && isStringInstr());
    sweetenBtn.setAttribute('aria-pressed', String(sweeten && isStringInstr()));
    sweetenBtn.disabled = !isStringInstr();
  }

  function setTuning(id) {
    if (!isStringInstr()) return;
    tuningIds = { ...tuningIds, [instr]: id }; saveTuningIds(tuningIds);
    recomputeTuning();
    renderStrings(); renderPolyScaffold();
    resetGraph(); resetStrobe();
    lastResult = null;
    showIdle(); // 旧チューニングの音名が一瞬残らないよう即クリア（次サンプルで再表示）
    syncEngine();
  }

  function setSweeten(on) {
    sweeten = !!on; saveSweeten(sweeten);
    recomputeTuning(); renderSweeten();
    resetGraph(); resetStrobe();
    lastResult = null;
    showIdle();
    syncEngine();
  }

  // ── 弦チップ（横並び。演奏順 低音→高音で左→右。ノーマルは空で領域のみ予約） ──
  function renderStrings() {
    if (!stringsEl) return;
    stringsEl.innerHTML = '';
    if (!isStringInstr()) return;
    for (let i = currentLabels.length - 1; i >= 0; i--) {
      const chip = document.createElement('div');
      chip.className = 'tuner-string';
      chip.dataset.index = String(i);
      chip.textContent = currentLabels[i];
      stringsEl.appendChild(chip);
    }
  }
  function clearStringHighlight() {
    stringsEl?.querySelectorAll('.tuner-string').forEach(el => el.classList.remove('target', 'in-tune'));
  }

  // ── ポリフォニック行（低音→高音） ──
  function renderPolyScaffold() {
    if (!polyEl) return;
    polyEl.innerHTML = '';
    if (!isStringInstr()) return;
    for (let i = currentLabels.length - 1; i >= 0; i--) {
      const row = document.createElement('div');
      row.className = 'tuner-poly-row'; row.dataset.index = String(i);
      row.innerHTML =
        `<span class="tuner-poly-name">${currentLabels[i]}</span>`
        + '<div class="tuner-poly-bar"><span class="tuner-poly-mid"></span><span class="tuner-poly-dot"></span></div>'
        + '<span class="tuner-poly-cents">—</span>';
      polyEl.appendChild(row);
    }
  }

  function renderPoly(strings) {
    if (!polyEl || !Array.isArray(strings)) return;
    for (const s of strings) {
      const row = polyEl.querySelector(`.tuner-poly-row[data-index="${s.index}"]`);
      if (!row) continue;
      const dot = row.querySelector('.tuner-poly-dot');
      const val = row.querySelector('.tuner-poly-cents');
      if (s.hz == null || s.cents == null) {
        row.classList.remove('in-tune', 'off');
        row.classList.add('absent');
        if (val) val.textContent = '—';
        if (dot) dot.style.left = '50%';
        continue;
      }
      row.classList.remove('absent');
      const cents = Math.round(s.cents);
      const inTune = Math.abs(cents) <= IN_TUNE_CENTS;
      row.classList.toggle('in-tune', inTune);
      row.classList.toggle('off', !inTune);
      if (val) val.textContent = cents === 0 ? '±0¢' : `${cents > 0 ? '+' : ''}${cents}¢`;
      if (dot) {
        const clamped = Math.max(-50, Math.min(50, s.cents));
        dot.style.left = `${50 + clamped}%`;
      }
    }
  }

  function setInstrument(next) {
    if (next !== 'guitar' && next !== 'bass' && next !== 'normal') return;
    instr = next;
    instrBox?.querySelectorAll('.tuner-instr-btn').forEach(b => {
      const on = b.dataset.instr === instr;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', String(on));
    });
    if (!isStringInstr() && viewMode === 'poly') setView('needle'); // ノーマルはポリ不可
    recomputeTuning();
    populateTuningSelect();
    updateViewTabs();
    renderStrings(); renderPolyScaffold();
    resetGraph(); resetStrobe();
    lastResult = null;
    showIdle(); // 楽器切替で旧音名が残らないよう即クリア
    syncEngine();
  }

  // ── 表示モード ───────────────────────────────────────────────
  function updateViewTabs() {
    viewTabs?.querySelectorAll('.tuner-view-btn').forEach(b => {
      const v = b.dataset.view;
      const disabled = v === 'poly' && !isStringInstr();
      b.disabled = disabled;
      const on = v === viewMode && !disabled;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', String(on));
    });
  }

  function setView(view) {
    if (view === 'poly' && !isStringInstr()) view = 'needle';
    viewMode = view; saveView(view);
    updateViewTabs();
    // ステージの3表示（メーター/ストロボ/ポリ）を同枠で入れ替え。音名行/セント/弦/ルーラーは常時表示。
    meterEl?.classList.toggle('hidden', view !== 'needle');
    strobeWrap?.classList.toggle('hidden', view !== 'strobe');
    polyEl?.classList.toggle('hidden', view !== 'poly');
    resetStrobe();
    if (view === 'poly') showIdle();
    syncEngine();
    if (isOpen()) resizeStrobe();
  }

  // ── エンジン同期（レンジ/目標/モード） ──
  function syncEngine() {
    if (!engine) return;
    if (isStringInstr()) {
      const r = tuningRange(currentMidi, a4);
      engine.setRange(r.minHz, r.maxHz);
      engine.setTargets(targetsHz(currentMidi, { a4, offsets }));
    } else {
      engine.setRange(NORMAL.minHz, NORMAL.maxHz);
      engine.setTargets([]);
    }
    engine.setMode(viewMode === 'poly' ? 'poly' : 'mono');
  }

  function showIdle(message) {
    noteEl.textContent = '–';
    noteRow?.classList.remove('in-tune', 'held');
    centsBox?.classList.remove('in-tune');
    freqEl.textContent = message ?? '';
    centsEl.textContent = '--';
    arrowL?.classList.remove('on');
    arrowR?.classList.remove('on');
    strobePresent = false;
    updateMeter(null);
    clearStringHighlight();
  }

  // セントを "-05" / "+12" / " 00" 形式へ（モック準拠）。
  function formatCents(c) {
    const sign = c > 0 ? '+' : c < 0 ? '-' : '';
    return sign + String(Math.abs(c)).padStart(2, '0');
  }

  /** mono 検出結果を表示（音名/矢印/バーメーター/ルーラー/弦ハイライト/ストロボ目標）。 */
  function render(result, held) {
    if (!result) { showIdle(); return; }
    let cents, nearIndex = -1, target, noteName;

    if (isStringInstr()) {
      const near = nearestStringWithOffset(result.hz, currentMidi, { a4, offsets });
      if (!near) { showIdle(); return; }
      nearIndex = near.index;
      cents = Math.round(near.cents);
      noteName = noteLabelFromMidi(near.midi).noteName;
      target = near.targetHz;
    } else {
      const note = freqToNote(result.hz, a4);
      if (!note) { showIdle(); return; }
      cents = note.cents;
      noteName = note.noteName;
      target = midiToFreq(note.midi, a4);
    }

    const inTune = Math.abs(cents) <= IN_TUNE_CENTS;
    strobeDetectedHz = result.hz; strobeTargetHz = target; strobePresent = true;

    noteEl.textContent = noteName;
    centsEl.textContent = formatCents(cents);
    freqEl.textContent = `${result.hz.toFixed(1)} Hz`;
    noteRow?.classList.toggle('in-tune', inTune && !held);
    noteRow?.classList.toggle('held', !!held);
    centsBox?.classList.toggle('in-tune', inTune && !held);
    // 矢印: ♭側(低い)=左 / ♯側(高い)=右 を緑点灯。合致時は消灯。
    arrowL?.classList.toggle('on', cents < -IN_TUNE_CENTS);
    arrowR?.classList.toggle('on', cents > IN_TUNE_CENTS);

    updateMeter(cents);
    renderRuler(noteName, cents);

    clearStringHighlight();
    if (isStringInstr() && nearIndex >= 0 && Math.abs(cents) < 50) {
      const chip = stringsEl?.querySelector(`.tuner-string[data-index="${nearIndex}"]`);
      if (chip) { chip.classList.add('target'); chip.classList.toggle('in-tune', inTune); }
    }
  }

  // バーメーター: クラスタを cents ぶん左右シフト＋近さで色付け。
  function updateMeter(cents) {
    if (!barsEl) return;
    if (cents == null) {
      barsEl.style.setProperty('--shift', '0px');
      for (const b of barEls) b.style.background = 'var(--tk-muted2)';
      return;
    }
    const cl = Math.max(-50, Math.min(50, cents));
    barsEl.style.setProperty('--shift', `${(cl / 50) * 70}px`);
    const a = Math.abs(cents);
    const col = a <= IN_TUNE_CENTS ? 'var(--tk-green)' : a <= 18 ? 'var(--tk-yellow)' : 'var(--tk-orange)';
    for (const b of barEls) b.style.background = col;
  }

  // クロマチック・ルーラー: 現在音を中央セルに、ニードルを cents ぶんオフセット。
  function renderRuler(noteName, cents) {
    if (!rulerStrip) return;
    let base = CHROM.indexOf(noteName);
    if (base < 0) base = 0;
    let html = '';
    for (let k = -4; k <= 4; k++) {
      const n = CHROM[(((base + k) % 12) + 12) % 12];
      html += `<div class="tuner-ruler-cell${k === 0 ? ' cur' : ''}">`
        + `<div class="lbl">${n}</div><div class="maj"></div><div class="min a"></div><div class="min b"></div></div>`;
    }
    rulerStrip.innerHTML = html;
    if (rulerNeedle) {
      const cl = Math.max(-50, Math.min(50, cents || 0));
      rulerNeedle.style.left = `calc(50% + ${(cl / 50) * 28}px)`;
    }
  }

  // rAF はストロボ表示のアニメ専用（メーター/ポリは DOM 更新で十分）。
  function loop(ts) {
    rafId = requestAnimationFrame(loop);
    if (viewMode === 'strobe') drawStrobe(ts || 0);
  }

  // mono サンプル（≈66Hz）。poly モードでは届かない（worklet が mono を出さない）。
  function onPitch(sample) {
    const now = (typeof performance !== 'undefined' ? performance.now() : 0);
    if (sample && sample.hz != null) {
      lastResult = sample; lastResultT = now;
      render(sample, false);
    } else if (lastResult && now - lastResultT <= HOLD_MS) {
      render(lastResult, true);
    } else {
      lastResult = null;
      render(null, false);
    }
  }

  // poly サンプル（≈8Hz）。
  function onPoly(payload) {
    if (viewMode !== 'poly') return;
    renderPoly(payload && payload.strings);
  }

  function resizeCanvas(canvas, ctx) {
    if (!canvas || !ctx) return [0, 0];
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return [0, 0];
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return [rect.width, rect.height];
  }
  function resizeStrobe() { [sW, sH] = resizeCanvas(strobeCanvas, sctx); }

  // ストロボ: 合っていれば縞が静止、ずれていれば流れる（右=高い/左=低い）。
  function drawStrobe(now) {
    if (!sctx) return;
    if (sW === 0) { resizeStrobe(); if (sW === 0) return; }
    const dt = strobeLastT ? Math.min(0.1, Math.max(0, (now - strobeLastT) / 1000)) : 0;
    strobeLastT = now;

    const bg = '#16191d';
    sctx.fillStyle = bg; sctx.fillRect(0, 0, sW, sH);
    const present = strobePresent && strobeTargetHz > 0 && strobeDetectedHz > 0
      && lastResult && now - lastResultT <= HOLD_MS;
    if (!present) {
      sctx.fillStyle = 'rgba(255,255,255,0.4)';
      sctx.font = '12px sans-serif'; sctx.textAlign = 'center';
      sctx.fillText('音を鳴らすと縞が表示されます', sW / 2, sH / 2);
      return;
    }
    strobePhase = advanceStrobePhase(strobePhase, strobeDetectedHz, strobeTargetHz, dt);
    const cents = 1200 * Math.log2(strobeDetectedHz / strobeTargetHz);
    const locked = Math.abs(cents) <= IN_TUNE_CENTS;
    const bar = locked ? '#46e35b' : '#ff7a3a';
    const off = strobePhase * STROBE_PERIOD_PX;
    sctx.fillStyle = bar;
    for (let x = -STROBE_PERIOD_PX; x < sW + STROBE_PERIOD_PX; x += STROBE_PERIOD_PX) {
      sctx.fillRect(x + off, 0, STROBE_PERIOD_PX / 2, sH);
    }
  }

  function resetGraph() {
    updateMeter(null);
    if (rulerStrip) rulerStrip.innerHTML = '';
    if (rulerNeedle) rulerNeedle.style.left = '50%';
  }
  function resetStrobe() {
    strobePhase = 0; strobeLastT = 0; strobeDetectedHz = 0; strobeTargetHz = 0; strobePresent = false;
    if (sctx && sW > 0) sctx.clearRect(0, 0, sW, sH);
  }

  // ── マイク取得 ───────────────────────────────────────────────
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
    if (!navigator.mediaDevices?.getUserMedia) {
      hintEl.textContent = 'お使いのブラウザはマイク入力に対応していません。';
      active = false; return;
    }
    if (!isPitchEngineSupported()) {
      hintEl.textContent = 'お使いのブラウザは AudioWorklet 非対応のため、チューナーを利用できません。';
      active = false; return;
    }
    retryBtn?.classList.add('hidden');
    let stream;
    try {
      stream = await acquireMic();
    } catch (e) {
      console.error('チューナー: マイク取得に失敗', e);
      showMicError(e); active = false; return;
    }
    if (!active || !isOpen()) { stream.getTracks().forEach(t => t.stop()); return; }
    mediaStream = stream;
    try {
      const r = isStringInstr() ? tuningRange(currentMidi, a4) : NORMAL;
      engine = createPitchEngine({ minHz: r.minHz, maxHz: r.maxHz, hopMs: HOP_MS });
      await engine.start(mediaStream);
      if (!active || !isOpen()) { stop(); return; }
      engine.onPitch(onPitch);
      engine.onPoly(onPoly);
      syncEngine();
      hintEl.textContent = viewMode === 'poly'
        ? '全弦を1回ジャラーンと鳴らしてください'
        : '近くで1音ずつ鳴らしてください';
      lastResult = null;
      rafId = requestAnimationFrame(loop);
    } catch (e) {
      console.error('チューナー: オーディオ初期化に失敗', e);
      hintEl.textContent = 'オーディオの初期化に失敗しました。';
      stop();
    }
  }

  function stop() {
    active = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    if (engine) { engine.stop(); engine = null; }
    if (mediaStream) { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null; }
  }

  function open() {
    if (isOpen()) return;
    buildMeterDom();
    setInstrument(store.get().edit?.instrument === 'bass' ? 'bass' : 'guitar');
    renderA4();
    setView(viewMode); // 保存モードを復元（表示の出し分け）
    overlay.classList.remove('hidden');
    resetGraph(); resetStrobe();
    renderRuler(currentLabels.length ? noteLabelFromMidi(currentMidi[currentMidi.length - 1]).noteName : 'A', 0);
    resizeStrobe();
    track('tuner_open', { instrument: instr }); // [removable-analytics]
    start();
  }

  function close() {
    if (!isOpen()) return;
    overlay.classList.add('hidden');
    retryBtn?.classList.add('hidden');
    stop();
    resetGraph(); resetStrobe();
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
  tuningSel?.addEventListener('change', e => setTuning(e.target.value));
  sweetenBtn?.addEventListener('click', () => setSweeten(!sweeten));
  viewTabs?.addEventListener('click', e => {
    const btn = e.target.closest('.tuner-view-btn');
    if (btn && !btn.disabled) setView(btn.dataset.view);
  });
  settingsToggle?.addEventListener('click', () => {
    const open = settingsPanel?.classList.toggle('hidden') === false;
    settingsToggle.setAttribute('aria-expanded', String(open));
    if (isOpen()) resizeStrobe();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && isOpen()) close(); });
  window.addEventListener('resize', () => { if (isOpen()) resizeStrobe(); });

  // 初期描画。
  buildMeterDom();
  setInstrument(instr);
  setView(viewMode);
  renderA4();

  return { open, close };
}
