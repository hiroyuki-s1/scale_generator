import { NOTES } from '../domain/constants.js';

/** キー選択モーダル — 全12キー */
export function initKeyPicker(store) {
  const triggerBtn = document.getElementById('keyPickerBtn');
  const modal      = document.getElementById('keyPickerModal');
  const closeBtn   = document.getElementById('keyPickerClose');
  const listEl     = document.getElementById('keyPickerList');

  NOTES.forEach((note, i) => {
    const btn = document.createElement('button');
    btn.className = 'picker-sq-btn';
    btn.dataset.idx = i;
    btn.textContent = note;
    btn.addEventListener('click', () => {
      store.updateEdit({ rootIndex: i });
      closeModal();
    });
    listEl.appendChild(btn);
  });

  triggerBtn.addEventListener('click', openModal);
  closeBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modal.classList.contains('show')) closeModal();
  });

  function openModal() {
    syncActive();
    modal.classList.add('show');
  }
  function closeModal() { modal.classList.remove('show'); }

  function syncActive() {
    const { rootIndex } = store.get().edit;
    listEl.querySelectorAll('[data-idx]').forEach(btn => {
      btn.classList.toggle('active', Number(btn.dataset.idx) === rootIndex);
    });
  }

  function syncBtn() {
    triggerBtn.textContent = `${NOTES[store.get().edit.rootIndex]} ▾`;
  }

  syncBtn();
  store.subscribe((s, p) => {
    if (p && s.edit.rootIndex === p.edit.rootIndex) return;
    syncBtn();
    if (modal.classList.contains('show')) syncActive();
  });
}
