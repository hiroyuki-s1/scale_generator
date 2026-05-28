import { DEGREES } from '../domain/constants.js';
import { renderLegend } from './legend.js';

const BLACK_SEMITONES = new Set([1, 3, 6, 8, 10]);

/** 度数設定ボタン + ドロップダウングリッド + 指板下の度数チップ表示 */
export function initDegreePicker(store) {
  const triggerBtn = document.getElementById('degPickerBtn');
  const popup      = document.getElementById('degPickerPopup');
  const gridEl     = document.getElementById('degPickerPiano');
  const doneBtn    = document.getElementById('degPickerDone');
  const legendEl   = document.getElementById('legend');

  let isOpen = false;

  // Build 12-degree grid once
  DEGREES.forEach(deg => {
    const semi = deg.semi;
    const btn = document.createElement('button');
    btn.className = 'note-key ' + (BLACK_SEMITONES.has(semi) ? 'note-key-black' : 'note-key-white');
    btn.dataset.semi = semi;
    btn.textContent = deg.name;
    if (semi === 0) {
      btn.classList.add('root-key');
    } else {
      btn.addEventListener('click', () => toggle(semi));
    }
    gridEl.appendChild(btn);
  });

  triggerBtn.addEventListener('click', e => {
    e.stopPropagation();
    isOpen ? close() : open();
  });
  doneBtn.addEventListener('click', close);
  document.addEventListener('click', e => {
    if (isOpen && !popup.contains(e.target) && e.target !== triggerBtn) close();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && isOpen) close();
  });

  function open() {
    isOpen = true;
    popup.classList.remove('hidden');
    position();
    syncStyles();
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
    const spaceBelow = window.innerHeight - r.bottom;
    if (spaceBelow < 160) {
      popup.style.bottom = `${window.innerHeight - r.top + 6}px`;
      popup.style.top = 'auto';
    } else {
      popup.style.top    = `${r.bottom + 6}px`;
      popup.style.bottom = 'auto';
    }
    popup.style.left = `${Math.max(8, left)}px`;
  }

  function syncStyles() {
    const { activeDegrees, degreeColors } = store.get().edit;
    gridEl.querySelectorAll('.note-key').forEach(btn => {
      const semi = Number(btn.dataset.semi);
      const isActive = activeDegrees.has(semi);
      const dc = isActive ? degreeColors[semi] : null;
      btn.classList.toggle('note-key-active', isActive);
      if (isActive && dc) {
        btn.style.background  = dc.solid ? dc.color : (BLACK_SEMITONES.has(semi) ? '#2a2520' : 'var(--surface)');
        btn.style.borderColor = dc.color;
        btn.style.color       = dc.text;
      } else {
        btn.style.background  = '';
        btn.style.borderColor = '';
        btn.style.color       = '';
      }
    });
  }

  function toggle(semi) {
    store.updateEdit(edit => {
      const next = new Set(edit.activeDegrees);
      if (next.has(semi)) next.delete(semi); else next.add(semi);
      next.add(0); // ルートは常にオン
      return { activeDegrees: next, presetName: null };
    });
  }

  function syncTrigger() {
    const { activeDegrees } = store.get().edit;
    triggerBtn.textContent = `度数設定 (${activeDegrees.size}) ▾`;
  }

  syncTrigger();
  renderLegend(legendEl, store.get().edit);

  store.subscribe((s, p) => {
    const degChanged   = !p || s.edit.activeDegrees !== p.edit.activeDegrees;
    const colorChanged = !p || s.edit.degreeColors  !== p.edit.degreeColors;
    if (!degChanged && !colorChanged) return;
    syncTrigger();
    renderLegend(legendEl, s.edit);
    if (isOpen) syncStyles();
  });
}
