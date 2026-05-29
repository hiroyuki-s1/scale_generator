import { parseIrealUrl } from '../domain/ireal.js';
import { cloneEditAsSnapshot } from '../state/snapshot.js';

/**
 * iReal Pro section — lives in the edit tab sidebar.
 *
 * Parse a song URL / file → deduplicated chord chip grid.
 * Clicking a chip loads the chord into the main edit state so the
 * existing fretboard, degree buttons, scale selector and save button
 * all work naturally with iReal chords.
 */
export function initIrealSection(store) {
  const fileBtn        = document.getElementById('irealFileBtn');
  const input          = document.getElementById('irealInput');
  const parseBtn       = document.getElementById('irealParseBtn');
  const sectionEl      = document.getElementById('irealSection');
  const songNameEl     = document.getElementById('irealSongName');
  const gridEl         = document.getElementById('irealChordGrid');
  const registerAllBtn = document.getElementById('irealRegisterAll');

  let chords = [];

  // ── Hidden file input ────────────────────────────────────────────────────
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.irealb,.html';
  fileInput.style.cssText = 'position:absolute;width:0;height:0;opacity:0;pointer-events:none;';
  document.body.appendChild(fileInput);

  fileBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) loadFile(fileInput.files[0]);
    fileInput.value = '';
  });

  // ── Drag-and-drop onto the section ──────────────────────────────────────
  sectionEl.addEventListener('dragover', e => {
    e.preventDefault();
    sectionEl.classList.add('drag-over');
  });
  sectionEl.addEventListener('dragleave', () => sectionEl.classList.remove('drag-over'));
  sectionEl.addEventListener('drop', e => {
    e.preventDefault();
    sectionEl.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) loadFile(file);
  });

  // ── Parse trigger ────────────────────────────────────────────────────────
  parseBtn.addEventListener('click', parse);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') parse(); });

  // ────────────────────────────────────────────────────────────────────────

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
      const seen = new Set();
      chords = song.chords.filter(c => {
        if (seen.has(c.displayName)) return false;
        seen.add(c.displayName);
        return true;
      });
      songNameEl.textContent = `${song.title}  /  Key: ${song.key}`;
      songNameEl.classList.remove('hidden');
      buildGrid();
      if (chords.length > 0) {
        selectChord(0);
        registerAllBtn.classList.remove('hidden');
      }
    } catch (e) {
      songNameEl.textContent = `エラー: ${e.message}`;
      songNameEl.classList.remove('hidden');
      gridEl.innerHTML = '';
    }
  }

  function buildGrid() {
    gridEl.innerHTML = '';
    chords.forEach((c, i) => {
      const chip = document.createElement('button');
      chip.className = 'ireal-chip';
      const sym = document.createElement('span');
      sym.className = 'ireal-chip-sym';
      sym.textContent = c.displayName;
      const sc = document.createElement('span');
      sc.className = 'ireal-chip-scale';
      sc.textContent = c.scaleName;
      chip.appendChild(sym);
      chip.appendChild(sc);
      chip.addEventListener('click', () => selectChord(i));
      gridEl.appendChild(chip);
    });
  }

  registerAllBtn.addEventListener('click', () => {
    if (chords.length === 0) return;
    const { saved } = store.get();
    const msg = saved.length > 0
      ? `登録済みのスケール ${saved.length} 件をすべて削除して、\niReal Proのコード ${chords.length} 件を新たに登録します。\nこの操作は元に戻せません。よろしいですか？`
      : `iReal Proのコード ${chords.length} 件を登録スケールに追加します。\nよろしいですか？`;
    if (!confirm(msg)) return;
    store.set(state => {
      let nextId = 1;
      const newSaved = chords.map(c => {
        const editSnap = {
          rootIndex: c.rootPc,
          activeDegrees: new Set(c.degrees),
          presetName: c.scaleName,
          mode: 'scale',
          mask: { enabled: false, min: 1, max: 15 },
          degreeColors: state.edit.degreeColors,
        };
        return { title: c.displayName, ...cloneEditAsSnapshot(editSnap), id: nextId++ };
      });
      return { ...state, saved: newSaved, nextId };
    });
    registerAllBtn.classList.add('hidden');
  });

  function selectChord(idx) {
    gridEl.querySelectorAll('.ireal-chip').forEach((el, i) => {
      el.classList.toggle('active', i === idx);
    });
    const c = chords[idx];
    store.updateEdit({
      rootIndex: c.rootPc,
      activeDegrees: new Set(c.degrees),
      presetName: c.scaleName,
      mode: 'scale',
    });
  }
}
