import { WHITE_KEYS, BLACK_KEYS, NOTES } from '../domain/constants.js';

/** キー選択ボタン + ポップアップピアノ */
export function initKeyPicker(store) {
  const triggerBtn = document.getElementById('keyPickerBtn');
  const popup      = document.getElementById('keyPickerPopup');
  const pianoEl    = document.getElementById('keyPickerPiano');

  let isOpen = false;

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
    buildPiano();
  }
  function close() {
    isOpen = false;
    popup.classList.add('hidden');
  }
  function position() {
    const r = triggerBtn.getBoundingClientRect();
    const pW = 300;
    let left = r.left;
    if (left + pW > window.innerWidth - 8) left = window.innerWidth - pW - 8;
    popup.style.top  = `${r.bottom + 6}px`;
    popup.style.left = `${Math.max(8, left)}px`;
  }

  function buildPiano() {
    pianoEl.innerHTML = '';
    const { rootIndex } = store.get().edit;
    const WW = 40, BW = 25, WH = 72, BH = 46;
    pianoEl.style.cssText = `position:relative;width:${WHITE_KEYS.length * WW}px;height:${WH}px`;

    WHITE_KEYS.forEach((k, i) => {
      const btn = document.createElement('button');
      btn.className = 'ppkey-w' + (k.idx === rootIndex ? ' ppkey-on' : '');
      btn.style.cssText = `left:${i * WW}px;width:${WW - 2}px;height:${WH}px`;
      btn.textContent = k.note;
      btn.addEventListener('click', () => {
        store.updateEdit({ rootIndex: k.idx });
        close();
      });
      pianoEl.appendChild(btn);
    });
    BLACK_KEYS.forEach(k => {
      const btn = document.createElement('button');
      btn.className = 'ppkey-b' + (k.idx === rootIndex ? ' ppkey-on' : '');
      btn.style.cssText = `left:${(k.wi + 1) * WW - BW / 2 - 1}px;width:${BW}px;height:${BH}px`;
      btn.textContent = k.note;
      btn.addEventListener('click', () => {
        store.updateEdit({ rootIndex: k.idx });
        close();
      });
      pianoEl.appendChild(btn);
    });
  }

  function syncBtn() {
    const { rootIndex } = store.get().edit;
    triggerBtn.textContent = `${NOTES[rootIndex]} ▾`;
  }
  syncBtn();
  store.subscribe((s, p) => {
    if (p && s.edit.rootIndex === p.edit.rootIndex) return;
    syncBtn();
    if (isOpen) buildPiano();
  });
}
