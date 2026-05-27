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

  // ── ファイルドロップ & ファイル選択 ──────────────────────────────────
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.irealb,.html';
  fileInput.style.cssText = 'position:absolute;width:0;height:0;opacity:0;pointer-events:none;';
  document.body.appendChild(fileInput);

  const fileBtn = document.getElementById('irealFileBtn');
  fileBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) loadFile(fileInput.files[0]);
    fileInput.value = '';
  });

  const barEl = document.getElementById('irealBar');
  barEl.addEventListener('dragover', e => { e.preventDefault(); barEl.classList.add('drag-over'); });
  barEl.addEventListener('dragleave', () => barEl.classList.remove('drag-over'));
  barEl.addEventListener('drop', e => {
    e.preventDefault();
    barEl.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) loadFile(file);
  });

  function loadFile(file) {
    const reader = new FileReader();
    reader.onload = e => { input.value = e.target.result; parse(); };
    reader.readAsText(file);
  }

  function parse() {
    const url = input.value.trim();
    if (!url) return;
    try {
      const song = parseIrealUrl(url);
      // 重複除去: displayName が同じコードは初回出現のみ残す
      const seen = new Set();
      chords = song.chords.filter(c => {
        if (seen.has(c.displayName)) return false;
        seen.add(c.displayName);
        return true;
      });
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
      sym.textContent = c.displayName;
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
    currentEl.textContent = `${c.displayName} → ${c.scaleName}`;

    // Edit状態を更新（フレットボードに反映）
    store.updateEdit({
      rootIndex: c.rootPc,
      activeDegrees: new Set(c.degrees),
      presetName: c.scaleName,
      mode: 'scale',
    });

    // 自動保存
    const title = `${songTitle} — ${c.displayName} (${c.scaleName})`;
    store.set(state => {
      const id   = state.nextId;
      const snap = { id, title, ...cloneEditAsSnapshot(state.edit) };
      return { ...state, saved: [...state.saved, snap], nextId: id + 1 };
    });
  }
}
