import { WHITE_KEYS, BLACK_KEYS } from '../domain/constants.js';

function getKeyDims() {
  return window.matchMedia('(max-width: 767px)').matches
    ? { WW: 60, BW: 36, BH: 56, WH: 90 }
    : { WW: 46, BW: 28, BH: 42, WH: 68 };
}

export function initPiano(container, store) {
  function build() {
    container.innerHTML = '';
    const { rootIndex } = store.get().edit;
    const { WW, BW, BH, WH } = getKeyDims();
    container.style.width = `${WHITE_KEYS.length * WW}px`;
    container.style.height = `${WH}px`;
    WHITE_KEYS.forEach((k, i) => {
      const btn = document.createElement('button');
      btn.className = 'wkey' + (k.idx === rootIndex ? ' active' : '');
      btn.dataset.ni = k.idx;
      btn.style.left = `${i * WW}px`;
      btn.style.width = `${WW - 2}px`;
      btn.style.height = `${WH}px`;
      btn.textContent = k.note;
      btn.addEventListener('click', () => setRoot(k.idx));
      container.appendChild(btn);
    });
    BLACK_KEYS.forEach(k => {
      const btn = document.createElement('button');
      btn.className = 'bkey' + (k.idx === rootIndex ? ' active' : '');
      btn.dataset.ni = k.idx;
      btn.style.left = `${(k.wi + 1) * WW - BW / 2 - 1}px`;
      btn.style.width = `${BW}px`;
      btn.style.height = `${BH}px`;
      btn.textContent = k.note;
      btn.addEventListener('click', () => setRoot(k.idx));
      container.appendChild(btn);
    });
  }

  function setRoot(idx) {
    store.updateEdit({ rootIndex: idx });
  }

  function syncActive() {
    const { rootIndex } = store.get().edit;
    container.querySelectorAll('.wkey,.bkey').forEach(b => {
      b.classList.toggle('active', parseInt(b.dataset.ni) === rootIndex);
    });
  }

  build();
  store.subscribe((s, p) => {
    if (p && s.edit.rootIndex === p.edit.rootIndex) return;
    syncActive();
  });
}
