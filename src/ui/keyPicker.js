import { NOTES } from '../domain/constants.js';

const WHITE_KEY_INDICES = [0, 2, 4, 5, 7, 9, 11]; // C D E F G A B

/** キー選択モーダル */
export function initKeyPicker(store) {
  const triggerBtn = document.getElementById('keyPickerBtn');
  const modal      = document.getElementById('keyPickerModal');
  const closeBtn   = document.getElementById('keyPickerClose');
  const listEl     = document.getElementById('keyPickerList');

  WHITE_KEY_INDICES.forEach(i => {
    const btn = document.createElement('button');
    btn.className = 'key-choice-btn';
    btn.dataset.idx = i;
    btn.textContent = NOTES[i];
    btn.addEventListener('click', () => {
      const { edit } = store.get();
      if (edit.presetName === null && edit.activeDegrees.size > 0) {
        if (!confirm('カスタム設定した度数が失われます。\nキーを変更しますか？')) { closeModal(); return; }
      }
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
    listEl.querySelectorAll('.key-choice-btn').forEach(btn => {
      btn.classList.toggle('key-choice-btn--active', Number(btn.dataset.idx) === rootIndex);
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
