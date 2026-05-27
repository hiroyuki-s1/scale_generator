import { DEGREES } from '../domain/constants.js';

export function initDegreeToggle(container, store) {
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
    store.updateEdit(edit => {
      const next = new Set(edit.activeDegrees);
      if (next.has(i)) next.delete(i); else next.add(i);
      return { activeDegrees: next, presetName: null };
    });
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
        btn.classList.add('active');
        dot.style.background = dc.color;
        dot.style.borderColor = dc.color;
      } else {
        btn.style.cssText = '';
        dot.style.cssText = '';
        btn.classList.remove('active');
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
