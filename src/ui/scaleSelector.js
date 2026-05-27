import { PRESET_GROUPS } from '../domain/constants.js';

export function initScaleSelector(container, store) {
  container.innerHTML = '';
  PRESET_GROUPS.forEach(group => {
    const row = document.createElement('div');
    row.className = 'scale-group';
    const lbl = document.createElement('span');
    lbl.className = 'sg-label';
    lbl.textContent = group.label;
    row.appendChild(lbl);
    const btns = document.createElement('div');
    btns.className = 'sg-btns';
    group.presets.forEach(p => {
      const btn = document.createElement('button');
      btn.className = 'scale-btn';
      btn.dataset.pn = p.name;
      btn.textContent = p.name;
      btn.addEventListener('click', () => applyPreset(p));
      btns.appendChild(btn);
    });
    row.appendChild(btns);
    container.appendChild(row);
  });

  function applyPreset(p) {
    store.updateEdit({
      presetName: p.name,
      activeDegrees: new Set(p.degrees),
    });
  }

  function sync() {
    const pn = store.get().edit.presetName;
    container.querySelectorAll('.scale-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.pn === pn);
    });
  }
  sync();
  store.subscribe((s, p) => {
    if (p && s.edit.presetName === p.edit.presetName) return;
    sync();
  });
}
