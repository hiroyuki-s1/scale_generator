import { DEGREES } from '../domain/constants.js';
import { renderLegend } from './legend.js';

// White key semitones (piano layout order)
const WHITE_SEMIS = [0, 2, 4, 5, 7, 9, 11];
// Black key semitones and their left-% positions on the keyboard
const BLACK_KEYS = [
  { semi: 1,  left: 10       },  // b9  (C#)
  { semi: 3,  left: 24.286   },  // m3  (D#)
  { semi: 6,  left: 52.857   },  // #11 (F#)
  { semi: 8,  left: 67.143   },  // b13 (G#)
  { semi: 10, left: 81.429   },  // m7  (A#)
];

/** 度数設定モーダル — フルピアノ鍵盤 */
export function initDegreePicker(store) {
  const triggerBtn = document.getElementById('degPickerBtn');
  const modal      = document.getElementById('degPickerModal');
  const closeBtn   = document.getElementById('degPickerClose');
  const doneBtn    = document.getElementById('degPickerDone');
  const pianoEl    = document.getElementById('degPickerPiano');
  const legendEl   = document.getElementById('legend');

  // Build keyboard once
  WHITE_SEMIS.forEach(semi => {
    const deg = DEGREES.find(d => d.semi === semi);
    if (!deg) return;
    const btn = document.createElement('button');
    btn.className = 'piano-white-key';
    btn.dataset.semi = semi;
    btn.textContent = deg.name;
    btn.addEventListener('click', () => toggle(semi));
    pianoEl.appendChild(btn);
  });

  BLACK_KEYS.forEach(({ semi, left }) => {
    const deg = DEGREES.find(d => d.semi === semi);
    if (!deg) return;
    const btn = document.createElement('button');
    btn.className = 'piano-black-key';
    btn.dataset.semi = semi;
    btn.style.left = left + '%';
    btn.textContent = deg.name;
    btn.addEventListener('click', () => toggle(semi));
    pianoEl.appendChild(btn);
  });

  triggerBtn.addEventListener('click', openModal);
  closeBtn.addEventListener('click', closeModal);
  doneBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modal.classList.contains('show')) closeModal();
  });

  function openModal() {
    syncStyles();
    modal.classList.add('show');
  }
  function closeModal() { modal.classList.remove('show'); }

  function syncStyles() {
    const { activeDegrees } = store.get().edit;
    pianoEl.querySelectorAll('[data-semi]').forEach(btn => {
      btn.classList.toggle('active', activeDegrees.has(Number(btn.dataset.semi)));
    });
  }

  function toggle(semi) {
    store.updateEdit(edit => {
      const next = new Set(edit.activeDegrees);
      if (next.has(semi)) next.delete(semi); else next.add(semi);
      return { activeDegrees: next, presetName: null };
    });
  }

  function syncTrigger() {
    const { activeDegrees } = store.get().edit;
    triggerBtn.textContent = `スケール設定  設定数：${activeDegrees.size}`;
  }

  syncTrigger();
  renderLegend(legendEl, store.get().edit);

  store.subscribe((s, p) => {
    if (p && s.edit.activeDegrees === p.edit.activeDegrees) return;
    syncTrigger();
    renderLegend(legendEl, s.edit);
    if (modal.classList.contains('show')) syncStyles();
  });
}
