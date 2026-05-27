import { DEGREES, DEFAULT_COLORS } from '../domain/constants.js';
import { cloneColors } from '../state/snapshot.js';

export function initColorModal(store, openBtn) {
  const modal = document.getElementById('colorModal');
  const list  = document.getElementById('colorList');
  const closeBtn = modal.querySelector('[data-act="close"]');
  const resetBtn = modal.querySelector('[data-act="reset"]');

  openBtn.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  resetBtn.addEventListener('click', reset);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });

  function open() {
    build();
    modal.classList.add('show');
  }
  function close() { modal.classList.remove('show'); }

  function reset() {
    store.updateEdit({ degreeColors: cloneColors(DEFAULT_COLORS) });
    build();
  }

  function setColor(i, patch) {
    store.updateEdit(edit => {
      const next = cloneColors(edit.degreeColors);
      next[i] = { ...next[i], ...patch };
      return { degreeColors: next };
    });
  }

  function build() {
    const colors = store.get().edit.degreeColors;
    list.innerHTML = '';
    DEGREES.forEach((d, i) => {
      const dc = colors[i];
      const row = document.createElement('div');
      row.className = 'color-row';

      const badge = document.createElement('div');
      badge.className = 'color-row-badge';
      applyBadge(badge, dc);

      const name = document.createElement('span');
      name.className = 'color-row-name';
      name.textContent = d.name;

      const modeBtns = document.createElement('div');
      modeBtns.className = 'color-mode-btns';
      ['塗', '白'].forEach((label, si) => {
        const btn = document.createElement('button');
        btn.className = 'color-mode-btn' + ((si === 0) === dc.solid ? ' active' : '');
        btn.textContent = label;
        btn.addEventListener('click', () => {
          setColor(i, { solid: si === 0 });
          build();
        });
        modeBtns.appendChild(btn);
      });

      const swatchGroup = document.createElement('div');
      swatchGroup.className = 'color-swatch-group';
      [['枠', 'color'], ['文字', 'text']].forEach(([lbl, key]) => {
        const pair = document.createElement('div');
        pair.className = 'color-swatch-pair';
        const lblEl = document.createElement('span');
        lblEl.className = 'color-swatch-label';
        lblEl.textContent = lbl;
        const sw = document.createElement('label');
        sw.className = 'color-swatch';
        sw.style.background = dc[key];
        const inp = document.createElement('input');
        inp.type = 'color';
        inp.value = dc[key];
        inp.addEventListener('input', e => {
          setColor(i, { [key]: e.target.value });
          sw.style.background = e.target.value;
          applyBadge(badge, store.get().edit.degreeColors[i]);
        });
        sw.appendChild(inp);
        pair.appendChild(lblEl);
        pair.appendChild(sw);
        swatchGroup.appendChild(pair);
      });

      row.appendChild(badge);
      row.appendChild(name);
      row.appendChild(modeBtns);
      row.appendChild(swatchGroup);
      list.appendChild(row);
    });
  }
}

function applyBadge(badge, dc) {
  badge.style.background = dc.solid ? dc.color : '#fff';
  badge.style.borderColor = dc.color;
}
