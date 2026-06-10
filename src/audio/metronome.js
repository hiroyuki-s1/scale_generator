/**
 * 単純メトロノーム・クリック（Web Audio）。スケールトレーニングの拍頭/拍を鳴らす。
 *
 *  - 1600/2000Hz の **ごく短い（~35ms）ビープ**。StableNoteTracker（~130ms 安定で確定）には
 *    絶対に拾われず、かつ検出レンジ外（trainer engine maxHz < 1500）なので採点に干渉しない。
 *  - 拍頭（スケール切替）はアクセント（高め・大きめ）。
 *  - 出力専用に独立 AudioContext を持つ（PitchEngine の入力 Context とは別）。
 */
export function createClicker() {
  let ctx = null;
  function ensure() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!ctx) ctx = new Ctx();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }
  /** クリックを鳴らす。accent=true で拍頭（高め・強め）。 */
  function click(accent = false) {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = 'square';
    osc.frequency.value = accent ? 2000 : 1500;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(accent ? 0.5 : 0.28, t + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
    osc.connect(g); g.connect(c.destination);
    osc.start(t);
    osc.stop(t + 0.05);
  }
  function close() { if (ctx) { ctx.close().catch(() => {}); ctx = null; } }
  return { click, close };
}
