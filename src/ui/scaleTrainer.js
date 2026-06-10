import { NOTES } from '../domain/constants.js';
import { PitchEngine, isPitchEngineSupported } from '../audio/pitchEngine.js';
import { StableNoteTracker } from '../domain/noteDetect.js';
import { classifyAgainstScale, scalePitchClassSet } from '../domain/scalePractice.js';
import { track } from '../state/track.js'; // [removable-analytics]

/**
 * スケール練習モード（全画面オーバーレイ）。
 *
 *  - saved スケール1件で開く（savedTab の「練習」ボタン）。{rootIndex, activeDegrees, title}。
 *  - マイク → PitchEngine（再利用クラス・内蔵マイク取得）→ StableNoteTracker で「弾いた音」を確定。
 *  - 弾いた音がスケール内なら鍵盤を緑に＋○、外れたら赤＋✕（バツ）。音名と度数も表示。
 *  - ピアノ鍵盤UI（1オクターブ）にスケール内の音を常時ハイライト（度数ラベル付き）。
 *
 * 落とさない方針: マイク不可・未対応でもアプリ本体は継続（オーバーレイ内で案内）。
 */

const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11];          // C D E F G A B
const BLACK_PCS = [1, 3, 6, 8, 10];                // C# D# F# G# A#
const BLACK_AFTER_WHITE = { 1: 0, 3: 1, 6: 3, 8: 4, 10: 5 }; // 黒鍵が「何番目の白鍵の後ろ」か

export function initScaleTrainer(store) { // eslint-disable-line no-unused-vars
  const overlay   = document.getElementById('strainerOverlay');
  const backBtn   = document.getElementById('strainerBackBtn');
  const titleEl   = document.getElementById('strainerTitle');
  const subEl     = document.getElementById('strainerSub');
  const noteEl    = document.getElementById('strainerNote');
  const degEl     = document.getElementById('strainerDeg');
  const verdictEl = document.getElementById('strainerVerdict');
  const pianoEl   = document.getElementById('strainerPiano');
  const hintEl    = document.getElementById('strainerHint');
  const retryBtn  = document.getElementById('strainerRetryBtn');
  if (!overlay) return { open() {}, close() {} };

  let rootIndex = 0;
  let activeDegrees = new Set();
  let scaleSet = new Set();
  let engine = null, tracker = null, active = false;

  const isOpen = () => !overlay.classList.contains('hidden');

  // ── ピアノ鍵盤生成（スケール内を常時ハイライト＋度数ラベル） ──
  function mkKey(pc, kind) {
    const k = document.createElement('div');
    k.className = `strainer-key ${kind}`;
    k.dataset.pc = String(pc);
    if (scaleSet.has(pc)) {
      k.classList.add('in-scale');
      const c = classifyAgainstScale(pc, rootIndex, activeDegrees);
      if (c.isRoot) k.classList.add('root');
      const mark = document.createElement('span');
      mark.className = 'skey-mark';
      mark.textContent = c.degreeName || '';
      k.appendChild(mark);
    }
    const lbl = document.createElement('span');
    lbl.className = 'skey-lbl';
    lbl.textContent = NOTES[pc];
    k.appendChild(lbl);
    return k;
  }
  function renderPiano() {
    if (!pianoEl) return;
    pianoEl.innerHTML = '';
    WHITE_PCS.forEach(pc => pianoEl.appendChild(mkKey(pc, 'white')));
    BLACK_PCS.forEach(pc => {
      const k = mkKey(pc, 'black');
      const wi = BLACK_AFTER_WHITE[pc];
      k.style.left = `calc(${((wi + 1) / 7) * 100}% - 4.5%)`;
      pianoEl.appendChild(k);
    });
  }
  function clearLit() {
    pianoEl?.querySelectorAll('.strainer-key.lit').forEach(e => e.classList.remove('lit', 'correct', 'wrong'));
  }

  // ── 弾いた音（確定）の判定表示 ──
  function onNote(ev) {
    const pc = (((ev.midi % 12) + 12) % 12);
    const c = classifyAgainstScale(pc, rootIndex, activeDegrees);
    noteEl.textContent = NOTES[pc];
    noteEl.classList.toggle('correct', c.inScale);
    noteEl.classList.toggle('wrong', !c.inScale);
    degEl.textContent = c.inScale ? `${c.degreeName}${c.isRoot ? '（ルート）' : ''}` : 'スケール外';
    verdictEl.textContent = c.inScale ? '○' : '✕';
    verdictEl.classList.toggle('ok', c.inScale);
    verdictEl.classList.toggle('ng', !c.inScale);

    clearLit();
    const key = pianoEl?.querySelector(`.strainer-key[data-pc="${pc}"]`);
    if (key) key.classList.add('lit', c.inScale ? 'correct' : 'wrong');
    // 判定・点灯は次の音まで残す（最後に弾いた結果が見える）。
  }

  // ── マイク/エンジン ──
  async function start() {
    if (active) return;
    active = true;
    hintEl.textContent = 'マイクの準備中…';
    if (!isPitchEngineSupported()) {
      hintEl.textContent = 'お使いのブラウザは AudioWorklet 非対応のため利用できません。';
      active = false;
      return;
    }
    retryBtn?.classList.add('hidden');
    try {
      engine = new PitchEngine({ minHz: 55, maxHz: 1320, hopMs: 20 });
      await engine.start(); // PitchEngine が内部でマイク取得（stop で解放）
      if (!active || !isOpen()) { stop(); return; }
      tracker = new StableNoteTracker({ stableMs: 130, releaseMs: 250 });
      engine.onPitch((s) => {
        const ev = tracker.push(s.hz, (typeof performance !== 'undefined' ? performance.now() : 0), s.clarity);
        if (ev) onNote(ev);
      });
      hintEl.textContent = 'スケールの音を1音ずつ弾いてみよう（外れた音はバツ）';
    } catch (e) {
      console.error('スケール練習: 開始に失敗', e);
      hintEl.textContent = 'マイクを使用できませんでした。許可状況を確認して再試行してください。';
      retryBtn?.classList.remove('hidden');
      stop();
    }
  }
  function stop() {
    active = false;
    if (engine) { engine.stop(); engine = null; }
    tracker = null;
  }

  // ── 開閉 ──
  function open(snap) {
    if (!snap) return;
    rootIndex = (((snap.rootIndex | 0) % 12) + 12) % 12;
    activeDegrees = snap.activeDegrees instanceof Set ? snap.activeDegrees : new Set(snap.activeDegrees || []);
    scaleSet = scalePitchClassSet(rootIndex, activeDegrees);
    titleEl.textContent = snap.title || 'スケール練習';
    subEl.textContent = `${NOTES[rootIndex]} ルート ・ 緑=スケール内 / ✕=外`;
    noteEl.textContent = '–';
    noteEl.classList.remove('correct', 'wrong');
    degEl.textContent = '';
    verdictEl.textContent = '';
    verdictEl.classList.remove('ok', 'ng');
    renderPiano();
    overlay.classList.remove('hidden');
    track('scale_trainer_open', {}); // [removable-analytics]
    start();
  }
  function close() {
    if (!isOpen()) return;
    overlay.classList.add('hidden');
    retryBtn?.classList.add('hidden');
    stop();
  }

  backBtn?.addEventListener('click', close);
  retryBtn?.addEventListener('click', () => { if (!active) start(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen()) close(); });

  return { open, close };
}
