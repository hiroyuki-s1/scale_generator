import { NOTES } from '../domain/constants.js';
import { PitchEngine, isPitchEngineSupported } from '../audio/pitchEngine.js';
import { StableNoteTracker } from '../domain/noteDetect.js';
import { buildGame, scheduleAt, judgePlay, rankFor } from '../domain/scaleGame.js';
import { createClicker } from '../audio/metronome.js';
import { track } from '../state/track.js'; // [removable-analytics]

/**
 * スケールトレーニング（全画面・テンポ同期ゲーム）。`…`メニュー →「スケールトレーニング」。
 *
 *  - 設定（テンポ/ループ回数）→ START → 4拍カウントイン → プレイ → リザルト（ゲーム風）。
 *  - ソングファイルのスケール進行を 4拍ずつ・ループ回数ぶん進める（domain/scaleGame.js）。
 *  - マイク（PitchEngine + StableNoteTracker）で弾いた音を判定: 現在スケール内=正解、外=ミス、
 *    切替直後1拍だけ直前スケールの音は許容（鳴り残り）。
 *  - メトロノーム（検出レンジ外の短いクリック）で拍を提示。
 */

const TEMPO_MIN = 40, TEMPO_MAX = 240, TEMPO_DEFAULT = 120;
const LOOP_MIN = 1, LOOP_MAX = 16, LOOP_DEFAULT = 2;
const TEMPO_KEY = 'sg.v1.stgTempo', LOOP_KEY = 'sg.v1.stgLoops';
const clampI = (v, lo, hi) => Math.max(lo, Math.min(hi, v | 0));

function loadInt(key, def, lo, hi) {
  try { const v = parseInt(localStorage.getItem(key), 10); if (Number.isFinite(v)) return clampI(v, lo, hi); } catch { /* noop */ }
  return def;
}
function saveInt(key, v) { try { localStorage.setItem(key, String(v)); } catch { /* noop */ } }

export function initScaleTrainGame(store) {
  const $ = (id) => document.getElementById(id);
  const overlay = $('stgOverlay');
  const openTrigger = document.querySelector('[data-act="scaletrain"]');
  if (!overlay) return { open() {}, close() {} };

  const els = {
    back: $('stgBackBtn'),
    setup: $('stgSetup'), play: $('stgPlay'), result: $('stgResult'),
    tempo: $('stgTempo'), loops: $('stgLoops'),
    progression: $('stgProgression'), start: $('stgStartBtn'), setupNote: $('stgSetupNote'),
    progressFill: $('stgProgressFill'), now: $('stgNow'), scaleName: $('stgScaleName'),
    beats: $('stgBeats'), allowed: $('stgAllowed'), verdict: $('stgVerdict'), played: $('stgPlayedNote'),
    scoreOk: $('stgScoreOk'), scoreNg: $('stgScoreNg'), scoreCombo: $('stgScoreCombo'),
    rank: $('stgRank'), accuracy: $('stgAccuracy'), resultStats: $('stgResultStats'),
    retry: $('stgRetryBtn'), close: $('stgCloseBtn'), hint: $('stgHint'), retryMic: $('stgRetryMicBtn'),
  };

  let tempo = loadInt(TEMPO_KEY, TEMPO_DEFAULT, TEMPO_MIN, TEMPO_MAX);
  let loops = loadInt(LOOP_KEY, LOOP_DEFAULT, LOOP_MIN, LOOP_MAX);
  let engine = null, tracker = null, clicker = null;
  let game = null, phase = 'idle', rafId = 0;
  let countinStart = 0, startT = 0, lastBeatIndex = -1, lastStepIndex = -1, lastCountBeat = -1, litTimer = 0;
  let score = { ok: 0, ng: 0, tol: 0, combo: 0, maxCombo: 0 };

  const isOpen = () => !overlay.classList.contains('hidden');

  function showScreen(name) {
    els.setup.classList.toggle('hidden', name !== 'setup');
    els.play.classList.toggle('hidden', name !== 'play');
    els.result.classList.toggle('hidden', name !== 'result');
  }

  // ── 設定画面 ──
  function renderSetup() {
    els.tempo.textContent = String(tempo);
    els.loops.textContent = String(loops);
    const saved = store.get().saved;
    els.progression.innerHTML = '';
    saved.forEach((s, i) => {
      const c = document.createElement('span');
      c.className = 'stg-prog-chip';
      c.innerHTML = `<span class="stg-prog-idx">${i + 1}</span>${s.title || 'スケール'}`;
      els.progression.appendChild(c);
    });
    const ok = saved.length > 0 && isPitchEngineSupported();
    els.start.disabled = !ok;
    els.setupNote.textContent = saved.length === 0
      ? 'ソングファイルにスケールがありません。スケールを登録してください。'
      : !isPitchEngineSupported() ? 'お使いのブラウザは AudioWorklet 非対応のため利用できません。'
        : `${saved.length}スケール × ${loops}ループ ＝ ${saved.length * loops * 4} 拍`;
  }
  function setTempo(d) { tempo = clampI(tempo + d, TEMPO_MIN, TEMPO_MAX); saveInt(TEMPO_KEY, tempo); renderSetup(); }
  function setLoops(d) { loops = clampI(loops + d, LOOP_MIN, LOOP_MAX); saveInt(LOOP_KEY, loops); renderSetup(); }

  // ── プレイ画面 ──
  function renderBeats(beatInStep) {
    if (els.beats.childElementCount !== 4) {
      els.beats.innerHTML = '';
      for (let i = 0; i < 4; i++) { const d = document.createElement('div'); d.className = `stg-beat-dot${i === 0 ? ' downbeat' : ''}`; els.beats.appendChild(d); }
    }
    [...els.beats.children].forEach((d, i) => d.classList.toggle('on', i === beatInStep));
  }
  function renderPlayScale(scaleIndex) {
    const s = game.scales[scaleIndex];
    const set = game.scaleSets[scaleIndex];
    const root = (((s.rootIndex % 12) + 12) % 12);
    els.scaleName.textContent = s.title || `${NOTES[root]} スケール`;
    els.scaleName.style.animation = 'none'; void els.scaleName.offsetWidth; els.scaleName.style.animation = 'stgRankPop .3s ease';
    els.allowed.innerHTML = '';
    for (let pc = 0; pc < 12; pc++) {
      if (!set.has(pc)) continue;
      const c = document.createElement('div');
      c.className = `stg-allowed-chip${pc === root ? ' root' : ''}`;
      c.dataset.pc = String(pc);
      c.textContent = NOTES[pc];
      els.allowed.appendChild(c);
    }
  }
  function flashChip(pc) {
    const c = els.allowed.querySelector(`.stg-allowed-chip[data-pc="${pc}"]`);
    if (!c) return;
    c.classList.add('lit');
    setTimeout(() => c.classList.remove('lit'), 280);
  }
  function showVerdict(kind, pc) {
    els.verdict.textContent = kind === 'correct' ? '○' : kind === 'miss' ? '✕' : '';
    els.verdict.classList.toggle('ok', kind === 'correct');
    els.verdict.classList.toggle('ng', kind === 'miss');
    els.played.textContent = pc != null ? `弾いた音: ${NOTES[pc]}` : '';
    clearTimeout(litTimer);
    litTimer = setTimeout(() => { els.verdict.textContent = ''; els.verdict.classList.remove('ok', 'ng'); }, 650);
  }
  function renderScore() {
    els.scoreOk.textContent = `正解 ${score.ok}`;
    els.scoreNg.textContent = `ミス ${score.ng}`;
    els.scoreCombo.textContent = `コンボ ${score.combo}`;
  }

  // ── 判定（確定音1つ） ──
  function onNote(ev) {
    if (phase !== 'play' || !game) return;
    const t = nowMs() - startT;
    const pc = (((ev.midi % 12) + 12) % 12);
    const verdict = judgePlay(pc, t, game);
    if (verdict === 'correct') { score.ok++; score.combo++; score.maxCombo = Math.max(score.maxCombo, score.combo); flashChip(pc); showVerdict('correct', pc); }
    else if (verdict === 'miss') { score.ng++; score.combo = 0; showVerdict('miss', pc); }
    else if (verdict === 'tolerated') { score.tol++; showVerdict('tolerated', pc); }
    else return; // idle
    renderScore();
  }

  const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  // ── ループ（カウントイン → プレイ） ──
  function loop() {
    rafId = requestAnimationFrame(loop);
    if (!game) return;
    const bm = game.beatMs;
    if (phase === 'countin') {
      const c = nowMs() - countinStart;
      const beat = Math.floor(c / bm);
      if (beat !== lastCountBeat) { lastCountBeat = beat; clicker?.click(true); }
      const left = game.beatsPerScale - beat;
      els.scaleName.textContent = left > 0 ? `スタートまで ${left}` : 'スタート！';
      els.now.textContent = 'カウントイン';
      renderBeats(beat % 4);
      if (c >= game.beatsPerScale * bm) {
        phase = 'play';
        startT = countinStart + game.beatsPerScale * bm;
        lastBeatIndex = -1; lastStepIndex = -1;
        tracker?.reset(); // カウントイン中の音を持ち越さず、プレイ開始時の音から判定
      }
      return;
    }
    if (phase === 'play') {
      const t = nowMs() - startT;
      const s = scheduleAt(t, game);
      if (s.finished) { finish(); return; }
      els.progressFill.style.width = `${Math.min(100, (t / game.totalMs) * 100)}%`;
      const loopNum = Math.floor(s.stepIndex / game.scaleCount) + 1;
      els.now.textContent = `${loopNum} / ${game.loops} ループ`;
      if (s.stepIndex !== lastStepIndex) { lastStepIndex = s.stepIndex; renderPlayScale(s.scaleIndex); }
      renderBeats(s.beatInStep);
      if (s.beatIndex !== lastBeatIndex) { lastBeatIndex = s.beatIndex; clicker?.click(s.beatInStep === 0); }
    }
  }

  // ── リザルト ──
  function finish() {
    phase = 'result';
    stopAudio();
    const total = score.ok + score.ng;
    const acc = total > 0 ? score.ok / total : 0;
    const rank = rankFor(acc);
    els.rank.textContent = rank;
    els.rank.setAttribute('data-rank', rank);
    els.rank.style.animation = 'none'; void els.rank.offsetWidth; els.rank.style.animation = '';
    els.accuracy.textContent = `${Math.round(acc * 100)}%`;
    els.resultStats.innerHTML = [
      ['正解', score.ok], ['ミス', score.ng], ['最大コンボ', score.maxCombo], ['許容（鳴り残り）', score.tol],
    ].map(([k, v]) => `<div class="stg-stat-row"><span>${k}</span><span class="stg-stat-v">${v}</span></div>`).join('');
    els.hint.textContent = '';
    showScreen('result');
    track('scale_train_result', { rank, acc: Math.round(acc * 100) }); // [removable-analytics]
  }

  // ── 開始/停止 ──
  async function startGame() {
    const saved = store.get().saved;
    if (!saved.length || !isPitchEngineSupported()) return;
    score = { ok: 0, ng: 0, tol: 0, combo: 0, maxCombo: 0 };
    renderScore();
    game = buildGame({ scales: saved, tempo, loops });
    els.hint.textContent = 'マイクの準備中…';
    els.retryMic.classList.add('hidden');
    showScreen('play');
    els.verdict.textContent = ''; els.played.textContent = '';
    try {
      engine = new PitchEngine({ minHz: 70, maxHz: 1100, hopMs: 20 });
      await engine.start(); // 内部マイク
      if (!isOpen()) { stopAudio(); return; }
      tracker = new StableNoteTracker({ stableMs: 110, releaseMs: 220 });
      clicker = createClicker();
      engine.onPitch((sm) => { const ev = tracker.push(sm.hz, nowMs(), sm.clarity); if (ev) onNote(ev); });
      els.hint.textContent = '鳴っている音が今のスケールに入っていれば○・外れたら✕';
      phase = 'countin'; countinStart = nowMs(); lastCountBeat = -1;
      cancelAnimationFrame(rafId); rafId = requestAnimationFrame(loop);
      track('scale_train_start', { tempo, loops, scales: saved.length }); // [removable-analytics]
    } catch (e) {
      console.error('スケールトレーニング: 開始に失敗', e);
      els.hint.textContent = 'マイクを使用できませんでした。許可状況を確認して再試行してください。';
      els.retryMic.classList.remove('hidden');
      phase = 'idle';
    }
  }
  function stopAudio() {
    cancelAnimationFrame(rafId); rafId = 0;
    clearTimeout(litTimer);
    if (engine) { engine.stop(); engine = null; }
    if (clicker) { clicker.close(); clicker = null; }
    tracker = null;
  }

  function open() {
    if (isOpen()) return;
    stopAudio(); phase = 'idle';
    renderSetup();
    showScreen('setup');
    overlay.classList.remove('hidden');
    els.hint.textContent = '';
    track('scale_train_open', {}); // [removable-analytics]
  }
  function close() {
    if (!isOpen()) return;
    overlay.classList.add('hidden');
    stopAudio(); phase = 'idle';
  }

  // ── 配線 ──
  openTrigger?.addEventListener('click', open);
  els.back?.addEventListener('click', close);
  els.start?.addEventListener('click', startGame);
  els.retry?.addEventListener('click', () => { stopAudio(); phase = 'idle'; renderSetup(); showScreen('setup'); });
  els.close?.addEventListener('click', close);
  els.retryMic?.addEventListener('click', () => { if (phase === 'idle') startGame(); });
  document.querySelector('.stg-setup-card')?.addEventListener('click', (e) => {
    const tb = e.target.closest('[data-tempo]'); if (tb) { setTempo(Number(tb.dataset.tempo)); return; }
    const lb = e.target.closest('[data-loop]'); if (lb) setLoops(Number(lb.dataset.loop));
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen()) close(); });

  return { open, close };
}
