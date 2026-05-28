import { WHITE_KEYS, BLACK_KEYS, DEGREES } from '../domain/constants.js';
import { renderLegend } from './legend.js';

/** 度数ボタン + ポップアップ（ピアノ型） + 指板下の度数チップ表示 */
export function initDegreePicker(store) {
  const triggerBtn = document.getElementById('degPickerBtn');
  const popup      = document.getElementById('degPickerPopup');
  const pianoEl    = document.getElementById('degPickerPiano');
  const doneBtn    = document.getElementById('degPickerDone');
  const legendEl   = document.getElementById('legend');

  let isOpen = false;

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
    buildPiano();
  }
  function close() {
    isOpen = false;
    popup.classList.add('hidden');
  }
  function position() {
    const r = triggerBtn.getBoundingClientRect();
    const pW = 310;
    let left = r.left;
    if (left + pW > window.innerWidth - 8) left = window.innerWidth - pW - 8;
    // ポップアップを上に出すか下に出すか判断
    const spaceBelow = window.innerHeight - r.bottom;
    if (spaceBelow < 200) {
      popup.style.bottom = `${window.innerHeight - r.top + 6}px`;
      popup.style.top = 'auto';
    } else {
      popup.style.top  = `${r.bottom + 6}px`;
      popup.style.bottom = 'auto';
    }
    popup.style.left = `${Math.max(8, left)}px`;
  }

  function buildPiano() {
    pianoEl.innerHTML = '';
    const { activeDegrees, degreeColors } = store.get().edit;
    const WW = 40, BW = 25, WH = 82, BH = 50;
    pianoEl.style.cssText = `position:relative;width:${WHITE_KEYS.length * WW}px;height:${WH}px`;

    WHITE_KEYS.forEach((k, i) => {
      const semi = k.idx;
      const isActive = activeDegrees.has(semi);
      const dc = isActive ? degreeColors[semi] : null;
      const isRoot = semi === 0;
      const btn = document.createElement('button');
      btn.className = 'ppkey-w deg-ppkey' + (isActive ? ' ppkey-on' : '') + (isRoot ? ' ppkey-root' : '');
      btn.style.cssText = `left:${i * WW}px;width:${WW - 2}px;height:${WH}px`;
      if (isActive && dc) {
        btn.style.background = dc.solid ? dc.color : '#fff';
        btn.style.borderColor = dc.color;
        btn.style.color = dc.text;
      }
      const noteSpan = document.createElement('span');
      noteSpan.className = 'ppkey-note';
      noteSpan.textContent = k.note;
      const degSpan = document.createElement('span');
      degSpan.className = 'ppkey-deg';
      degSpan.textContent = DEGREES[semi]?.name ?? '';
      btn.appendChild(noteSpan);
      btn.appendChild(degSpan);
      if (!isRoot) {
        btn.addEventListener('click', () => toggle(semi));
      }
      pianoEl.appendChild(btn);
    });

    BLACK_KEYS.forEach(k => {
      const semi = k.idx;
      const isActive = activeDegrees.has(semi);
      const dc = isActive ? degreeColors[semi] : null;
      const btn = document.createElement('button');
      btn.className = 'ppkey-b deg-ppkey' + (isActive ? ' ppkey-on' : '');
      btn.style.cssText = `left:${(k.wi + 1) * WW - BW / 2 - 1}px;width:${BW}px;height:${BH}px`;
      if (isActive && dc) {
        btn.style.background = dc.solid ? dc.color : '#1c1c1c';
        btn.style.borderColor = dc.color;
        btn.style.color = dc.text;
      }
      const noteSpan = document.createElement('span');
      noteSpan.className = 'ppkey-note';
      noteSpan.textContent = k.note;
      const degSpan = document.createElement('span');
      degSpan.className = 'ppkey-deg';
      degSpan.textContent = DEGREES[semi]?.name ?? '';
      btn.appendChild(noteSpan);
      btn.appendChild(degSpan);
      btn.addEventListener('click', () => toggle(semi));
      pianoEl.appendChild(btn);
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
    // Root is always included, show count excluding root
    const cnt = activeDegrees.size;
    triggerBtn.textContent = `度数 (${cnt}) ▾`;
  }

  syncTrigger();
  renderLegend(legendEl, store.get().edit);

  store.subscribe((s, p) => {
    const degChanged  = !p || s.edit.activeDegrees !== p.edit.activeDegrees;
    const colorChanged = !p || s.edit.degreeColors !== p.edit.degreeColors;
    if (!degChanged && !colorChanged) return;
    syncTrigger();
    renderLegend(legendEl, s.edit);
    if (isOpen) buildPiano();
  });
}
