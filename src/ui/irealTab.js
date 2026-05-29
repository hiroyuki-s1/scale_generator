import { parseIrealUrl } from '../domain/ireal.js';
import { cloneEditAsSnapshot } from '../state/snapshot.js';

/**
 * iReal Pro section — ファイルボタンのみ。コードチップにスケール名なし。
 */
export function initIrealSection(store) {
  const fileBtn        = document.getElementById('irealFileBtn');
  const sectionEl      = document.getElementById('irealSection');
  const gridEl         = document.getElementById('irealChordGrid');
  const registerAllBtn = document.getElementById('irealRegisterAll');

  let chords = [];

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.irealb,.html';
  fileInput.style.cssText = 'position:absolute;width:0;height:0;opacity:0;pointer-events:none;';
  document.body.appendChild(fileInput);

  fileBtn?.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) loadFile(fileInput.files[0]);
    fileInput.value = '';
  });

  sectionEl?.addEventListener('dragover', e => { e.preventDefault(); sectionEl.classList.add('drag-over'); });
  sectionEl?.addEventListener('dragleave', () => sectionEl.classList.remove('drag-over'));
  sectionEl?.addEventListener('drop', e => {
    e.preventDefault();
    sectionEl.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) loadFile(file);
  });

  function loadFile(file) {
    const reader = new FileReader();
    reader.onload = ev => parse(ev.target.result);
    reader.readAsText(file);
  }

  function parse(content) {
    try {
      const song = parseIrealUrl(content);
      const seen = new Set();
      chords = song.chords.filter(c => {
        if (seen.has(c.displayName)) return false;
        seen.add(c.displayName);
        return true;
      });
      buildGrid();
      if (chords.length > 0) {
        selectChord(0);
        registerAllBtn.classList.remove('hidden');
      }
    } catch (e) {
      if (gridEl) {
        const errEl = document.createElement('span');
        errEl.className = 'ireal-error';
        errEl.textContent = `エラー: ${e.message}`;
        gridEl.innerHTML = '';
        gridEl.appendChild(errEl);
      }
    }
  }

  function buildGrid() {
    if (!gridEl) return;
    gridEl.innerHTML = '';
    chords.forEach((c, i) => {
      const chip = document.createElement('button');
      chip.className = 'ireal-chip';
      chip.textContent = c.displayName;
      chip.addEventListener('click', () => selectChord(i));
      gridEl.appendChild(chip);
    });
  }

  registerAllBtn?.addEventListener('click', () => {
    if (chords.length === 0) return;
    const { saved } = store.get();
    const msg = saved.length > 0
      ? `登録済みのスケール ${saved.length} 件をすべて削除して、\niReal Proのコード ${chords.length} 件を新たに登録します。\nよろしいですか？`
      : `iReal Proのコード ${chords.length} 件を登録スケールに追加します。\nよろしいですか？`;
    if (!confirm(msg)) return;
    store.set(state => {
      let nextId = state.nextId;
      const newSaved = chords.map(c => {
        const editSnap = {
          rootIndex: c.rootPc,
          activeDegrees: new Set(c.degrees),
          presetName: null,
          mode: 'chord',
          mask: { enabled: false, min: 1, max: 22 },
          degreeColors: state.edit.degreeColors,
        };
        return { title: c.displayName, ...cloneEditAsSnapshot(editSnap), id: nextId++ };
      });
      const base = saved.length > 0 ? [] : saved;
      return { ...state, saved: [...base, ...newSaved], nextId };
    });
    registerAllBtn.classList.add('hidden');
  });

  function selectChord(idx) {
    gridEl?.querySelectorAll('.ireal-chip').forEach((el, i) => {
      el.classList.toggle('active', i === idx);
    });
    const c = chords[idx];
    store.updateEdit({
      rootIndex: c.rootPc,
      activeDegrees: new Set(c.degrees),
      presetName: null,
      mode: 'chord',
    });
  }
}
