import { DEGREES, DEFAULT_COLORS } from '../domain/constants.js';
import { cloneColors, propagateColors } from '../state/snapshot.js';

const PALETTE = [
  '#d92b2b', '#f0b429', '#27ae60', '#2980b9', '#ffffff', '#1c1c1c',
];

export function initColorModal(store, openBtn) {
  const modal    = document.getElementById('colorModal');
  const list     = document.getElementById('colorList');
  const closeBtn = modal.querySelector('[data-act="close"]');
  const resetBtn = modal.querySelector('[data-act="reset"]');

  openBtn.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  resetBtn.addEventListener('click', reset);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modal.classList.contains('show')) close();
  });

  function open()  { build(); modal.classList.add('show'); }
  function close() { modal.classList.remove('show'); }

  // 度数カラーは一括設定 → 編集中＋登録済みスケールすべてに反映
  function reset() {
    store.set(state => propagateColors(state, cloneColors(DEFAULT_COLORS)));
    build();
  }

  function setColor(i, patch) {
    store.set(state => {
      const next = cloneColors(state.edit.degreeColors);
      next[i] = { ...next[i], ...patch };
      return propagateColors(state, next);
    });
  }

  function build() {
    const colors = store.get().edit.degreeColors;
    list.innerHTML = '';
    DEGREES.forEach((d, i) => {
      const dc  = colors[i];
      const row = document.createElement('div');
      row.className = 'color-row';

      // ── top: badge + name + solid/outline toggle ──
      const top = document.createElement('div');
      top.className = 'color-row-top';

      const badge = document.createElement('div');
      badge.className = 'color-row-badge';
      badge.textContent = d.name;
      badge.style.fontSize = d.name.length >= 3 ? '9px' : d.name.length === 1 ? '14px' : '11px';
      applyBadge(badge, dc);

      const name = document.createElement('span');
      name.className = 'color-row-name';
      name.textContent = d.name;

      const modeBtns = document.createElement('div');
      modeBtns.className = 'color-mode-btns';
      ['塗り', 'アウトライン'].forEach((label, si) => {
        const btn = document.createElement('button');
        btn.className = 'color-mode-btn' + ((si === 0) === dc.solid ? ' active' : '');
        btn.textContent = label;
        btn.addEventListener('click', () => { setColor(i, { solid: si === 0 }); build(); });
        modeBtns.appendChild(btn);
      });

      top.appendChild(badge);
      top.appendChild(name);
      top.appendChild(modeBtns);

      // ── palette rows for 枠 and 文字 ──
      const palettes = document.createElement('div');
      palettes.className = 'color-palettes';

      [['枠', 'color'], ['文字', 'text']].forEach(([lbl, key]) => {
        const prow = document.createElement('div');
        prow.className = 'color-palette-row';

        const lblEl = document.createElement('span');
        lblEl.className = 'color-palette-label';
        lblEl.textContent = lbl;

        const chips = document.createElement('div');
        chips.className = 'color-chips';

        PALETTE.forEach(hex => {
          const chip = document.createElement('button');
          chip.className = 'color-chip' + (dc[key] === hex ? ' active' : '');
          chip.style.background = hex;
          if (hex === '#ffffff') chip.style.boxShadow = 'inset 0 0 0 1.5px #ccc';
          chip.title = hex;
          chip.addEventListener('click', () => {
            setColor(i, { [key]: hex });
            applyBadge(badge, store.get().edit.degreeColors[i]);
            prow.querySelectorAll('.color-chip').forEach((c, ci) => {
              c.classList.toggle('active', PALETTE[ci] === hex);
            });
          });
          chips.appendChild(chip);
        });

        prow.appendChild(lblEl);
        prow.appendChild(chips);
        palettes.appendChild(prow);
      });

      row.appendChild(top);
      row.appendChild(palettes);
      list.appendChild(row);
    });
  }
}

function applyBadge(badge, dc) {
  badge.style.background  = dc.solid ? dc.color : '#fff';
  badge.style.borderColor = dc.color;
  badge.style.color       = dc.text;
}
