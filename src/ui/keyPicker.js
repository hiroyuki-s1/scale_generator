import { NOTES } from '../domain/constants.js';

const BLACK_PCS = new Set([1, 3, 6, 8, 10]);

/** キー選択ボタン + ドロップダウングリッド */
export function initKeyPicker(store) {
  const triggerBtn = document.getElementById('keyPickerBtn');
  const popup      = document.getElementById('keyPickerPopup');
  const gridEl     = document.getElementById('keyPickerPiano');

  let isOpen = false;

  // Build 12-note grid once
  NOTES.forEach((note, i) => {
    const btn = document.createElement('button');
    btn.className = 'note-key ' + (BLACK_PCS.has(i) ? 'note-key-black' : 'note-key-white');
    btn.dataset.idx = i;
    btn.textContent = note;
    btn.addEventListener('click', () => {
      store.updateEdit({ rootIndex: i });
      close();
    });
    gridEl.appendChild(btn);
  });

  triggerBtn.addEventListener('click', e => {
    e.stopPropagation();
    isOpen ? close() : open();
  });
  document.addEventListener('click', e => {
    if (isOpen && !popup.contains(e.target)) close();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && isOpen) close();
  });

  function open() {
    isOpen = true;
    popup.classList.remove('hidden');
    position();
    syncActive();
  }
  function close() {
    isOpen = false;
    popup.classList.add('hidden');
  }
  function position() {
    const r = triggerBtn.getBoundingClientRect();
    const pW = 340;
    let left = r.left;
    if (left + pW > window.innerWidth - 8) left = window.innerWidth - pW - 8;
    popup.style.top  = `${r.bottom + 6}px`;
    popup.style.left = `${Math.max(8, left)}px`;
  }

  function syncActive() {
    const { rootIndex } = store.get().edit;
    gridEl.querySelectorAll('.note-key').forEach(btn => {
      btn.classList.toggle('note-key-active', Number(btn.dataset.idx) === rootIndex);
    });
  }

  function syncBtn() {
    triggerBtn.textContent = `${NOTES[store.get().edit.rootIndex]} ▾`;
  }

  syncBtn();
  store.subscribe((s, p) => {
    if (p && s.edit.rootIndex === p.edit.rootIndex) return;
    syncBtn();
    if (isOpen) syncActive();
  });
}
