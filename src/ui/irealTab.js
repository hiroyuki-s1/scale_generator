import { parseIrealUrl } from '../domain/ireal.js';
import { cloneEditAsSnapshot } from '../state/snapshot.js';

/**
 * iReal Pro バー（編集タブ内に統合）。
 * - 折りたたみ/展開
 * - URL貼り付け → コード進行表示
 * - コードチップまたは[←][→]でナビゲート
 * - ナビゲートのたびに store.edit を更新 + 自動保存
 */
export function initIrealTab(store) {
  const toggleBtn  = document.getElementById('irealToggle');
  const barBody    = document.getElementById('irealBarBody');
  const barNav     = document.getElementById('irealBarNav');
  const songNameEl = document.getElementById('irealSongName');
  const input      = document.getElementById('irealInput');
  const parseBtn   = document.getElementById('irealParseBtn');
  const gridEl     = document.getElementById('irealChordGrid');
  const prevBtn    = document.getElementById('irealPrev');
  const nextBtn    = document.getElementById('irealNext');
  const currentEl  = document.getElementById('irealCurrent');

  let chords    = [];
  let current   = -1;
  let songTitle = '';
  let isOpen    = false;

  toggleBtn.addEventListener('click', () => {
    isOpen = !isOpen;
    barBody.classList.toggle('hidden', !isOpen);
    toggleBtn.textContent = `iReal Pro ${isOpen ? '▲' : '▼'}`;
  });

  parseBtn.addEventListener('click', parse);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') parse(); });
  prevBtn.addEventListener('click', () => navigate(current - 1));
  nextBtn.addEventListener('click', () => navigate(current + 1));

  function parse() {
    const url = input.value.trim();
    if (!url) return;
    try {
      const song = parseIrealUrl(url);
      chords    = song.chords;
      songTitle = song.title;
      current   = -1;
      songNameEl.textContent = `${song.title}  /  Key: ${song.key}`;
      barNav.classList.remove('hidden');
      buildGrid();
      navigate(0);
    } catch (e) {
      songNameEl.textContent = `エラー: ${e.message}`;
    }
  }

  function buildGrid() {
    gridEl.innerHTML = '';
    chords.forEach((c, i) => {
      const chip = document.createElement('button');
      chip.className = 'ireal-chip';
      const sym  = document.createElement('span');
      sym.className = 'ireal-chip-sym';
      sym.textContent = c.symbol;
      const sc = document.createElement('span');
      sc.className = 'ireal-chip-scale';
      sc.textContent = c.scaleName;
      chip.appendChild(sym);
      chip.appendChild(sc);
      chip.addEventListener('click', () => navigate(i));
      gridEl.appendChild(chip);
    });
  }

  function navigate(idx) {
    if (!chords.length) return;
    current = ((idx % chords.length) + chords.length) % chords.length;

    gridEl.querySelectorAll('.ireal-chip').forEach((el, i) => {
      el.classList.toggle('active', i === current);
    });
    const activeChip = gridEl.querySelector('.ireal-chip.active');
    if (activeChip) activeChip.scrollIntoView({ block: 'nearest', inline: 'nearest' });

    const c = chords[current];
    currentEl.textContent = `${c.symbol} → ${c.scaleName}`;

    // Edit状態を更新（フレットボードに反映）
    store.updateEdit({
      rootIndex: c.rootPc,
      activeDegrees: new Set(c.degrees),
      presetName: c.scaleName,
      mode: 'scale',
    });

    // 自動保存
    const title = `${songTitle} — ${c.symbol} (${c.scaleName})`;
    store.set(state => {
      const id   = state.nextId;
      const snap = { id, title, ...cloneEditAsSnapshot(state.edit) };
      return { ...state, saved: [...state.saved, snap], nextId: id + 1 };
    });
  }
}
