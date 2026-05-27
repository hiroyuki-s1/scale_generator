import { DEGREES } from '../domain/constants.js';
import { appendDegreeDots } from './fretboardSvg.js';

export function initDegreeToggle(container, store, fretboardEl) {
  container.innerHTML = '';
  DEGREES.forEach((d, i) => {
    const btn = document.createElement('button');
    btn.className = 'deg-btn' + (i === 0 ? ' root' : '');
    btn.dataset.di = i;
    const dot = document.createElement('span');
    dot.className = 'deg-dot';
    btn.appendChild(dot);
    btn.appendChild(document.createTextNode(d.name));
    if (i !== 0) btn.addEventListener('click', () => toggle(i));
    container.appendChild(btn);
  });

  function toggle(i) {
    let wasActive = false;
    store.updateEdit(edit => {
      wasActive = edit.activeDegrees.has(i);
      const next = new Set(edit.activeDegrees);
      if (wasActive) next.delete(i); else next.add(i);
      return { activeDegrees: next, presetName: null };
    });

    if (wasActive) {
      // animate-out only this degree's dots, then remove
      fretboardEl.querySelectorAll(`[data-deg="${i}"]`).forEach(el => {
        el.style.animationDelay = '0s';
        el.classList.add('fb-dot-exit');
        el.addEventListener('animationend', () => el.remove(), { once: true });
      });
    } else {
      appendDegreeDots(fretboardEl, store.get().edit, i);
    }
  }

  function sync() {
    const { activeDegrees, degreeColors } = store.get().edit;
    container.querySelectorAll('.deg-btn').forEach(btn => {
      const i = parseInt(btn.dataset.di);
      const dot = btn.querySelector('.deg-dot');
      if (activeDegrees.has(i)) {
        const dc = degreeColors[i];
        const bg = dc.solid ? dc.color : '#ffffff';
        btn.style.background = bg;
        btn.style.borderColor = dc.color;
        btn.style.color = dc.text;
        dot.style.background = dc.color;
        dot.style.borderColor = dc.color;
      } else {
        btn.style.cssText = '';
        dot.style.cssText = '';
      }
    });
  }
  sync();
  store.subscribe((s, p) => {
    if (p
        && s.edit.activeDegrees === p.edit.activeDegrees
        && s.edit.degreeColors === p.edit.degreeColors) return;
    sync();
  });
}
