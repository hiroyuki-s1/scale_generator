import { buildTitle } from '../domain/title.js';
import { cloneEditAsSnapshot } from '../state/snapshot.js';

export function initSaveModal(store, openBtn) {
  const modal = document.getElementById('saveModal');
  const input = document.getElementById('modalInput');
  const cancelBtn = modal.querySelector('[data-act="cancel"]');
  const confirmBtn = modal.querySelector('[data-act="confirm"]');

  openBtn.addEventListener('click', open);
  cancelBtn.addEventListener('click', close);
  confirmBtn.addEventListener('click', confirm);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') confirm(); });

  function open() {
    input.value = buildTitle(store.get().edit);
    modal.classList.add('show');
    setTimeout(() => input.select(), 50);
  }

  function close() { modal.classList.remove('show'); }

  function confirm() {
    const title = input.value.trim() || buildTitle(store.get().edit);
    close();
    store.set(state => {
      const id = state.nextId;
      const snap = { id, title, ...cloneEditAsSnapshot(state.edit) };
      return { ...state, saved: [...state.saved, snap], nextId: id + 1 };
    });
  }
}
