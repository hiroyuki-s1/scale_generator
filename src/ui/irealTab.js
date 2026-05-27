import { parseIrealUrl } from '../domain/ireal.js';
import { NOTES } from '../domain/constants.js';
import {
  drawFretboardBase,
  applyFretboardDiff,
} from './fretboardSvg.js';

/**
 * iReal Pro タブ。
 * - URL貼り付け → コード進行表示
 * - 各コードセルをクリック or [<][>] でナビゲート
 * - 内蔵フレットボードにスケールを表示
 * - store.edit を更新してメインフレットボードにも反映
 */
export function initIrealTab(store) {
  const pane    = document.getElementById('tabIreal');
  const input   = document.getElementById('irealInput');
  const parseBtn = document.getElementById('irealParseBtn');
  const infoEl  = document.getElementById('irealSongInfo');
  const gridEl  = document.getElementById('irealChordGrid');
  const prevBtn = document.getElementById('irealPrev');
  const nextBtn = document.getElementById('irealNext');
  const curEl   = document.getElementById('irealCurrent');
  const fbEl    = document.getElementById('irealFretboard');

  let chords  = [];
  let current = 0;

  drawFretboardBase(fbEl);
  applyFretboardDiff(fbEl, store.get().edit, null);

  parseBtn.addEventListener('click', parse);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') parse(); });
  prevBtn.addEventListener('click', () => navigate(current - 1));
  nextBtn.addEventListener('click', () => navigate(current + 1));

  function parse() {
    const url = input.value.trim();
    if (!url) return;
    try {
      const song = parseIrealUrl(url);
      chords  = song.chords;
      current = 0;
      infoEl.textContent = `${song.title}  /  Key: ${song.key}  /  ${song.style}`;
      infoEl.classList.remove('hidden');
      buildGrid();
      navigate(0);
    } catch (e) {
      infoEl.textContent = `エラー: ${e.message}`;
      infoEl.classList.remove('hidden');
    }
  }

  function buildGrid() {
    gridEl.innerHTML = '';
    chords.forEach((c, i) => {
      const cell = document.createElement('button');
      cell.className = 'ireal-cell';
      cell.dataset.idx = i;
      const sym  = document.createElement('div');
      sym.className  = 'ireal-cell-sym';
      sym.textContent = c.symbol;
      const sc = document.createElement('div');
      sc.className  = 'ireal-cell-scale';
      sc.textContent = c.scaleName;
      cell.appendChild(sym);
      cell.appendChild(sc);
      cell.addEventListener('click', () => navigate(i));
      gridEl.appendChild(cell);
    });
  }

  function navigate(idx) {
    if (!chords.length) return;
    current = ((idx % chords.length) + chords.length) % chords.length;

    // Highlight active cell
    gridEl.querySelectorAll('.ireal-cell').forEach((el, i) => {
      el.classList.toggle('active', i === current);
    });
    // Scroll into view
    const activeCell = gridEl.querySelector('.ireal-cell.active');
    if (activeCell) activeCell.scrollIntoView({ block: 'nearest', inline: 'nearest' });

    const c = chords[current];
    curEl.textContent = `${c.symbol}  →  ${c.scaleName}`;

    // Build edit state for this chord
    const editPatch = {
      rootIndex: c.rootPc,
      activeDegrees: new Set(c.degrees),
      presetName: c.scaleName,
      mode: 'scale',
    };

    // Update internal fretboard
    const prev = store.get().edit;
    store.updateEdit(editPatch);
    applyFretboardDiff(fbEl, store.get().edit, prev);

    // Scroll active cell into view in chord grid
    prevBtn.disabled = chords.length <= 1;
    nextBtn.disabled = chords.length <= 1;
  }
}
