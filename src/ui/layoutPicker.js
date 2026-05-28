import { LAYOUT_PRESETS } from '../domain/constants.js';

function makeGridSVG(cols, rows, size) {
  const W = size;
  const H = Math.round(size * 0.77);
  const pad = 1.5, gap = 1;
  const cw = (W - pad * 2 - gap * (cols - 1)) / cols;
  const ch = (H - pad * 2 - gap * (rows - 1)) / rows;
  let rects = '';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = (pad + c * (cw + gap)).toFixed(1);
      const y = (pad + r * (ch + gap)).toFixed(1);
      rects += `<rect x="${x}" y="${y}" width="${cw.toFixed(1)}" height="${ch.toFixed(1)}" rx="0.5"/>`;
    }
  }
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" fill="currentColor">${rects}</svg>`;
}

function buildLayoutGrid(container, store, size, onPick) {
  container.innerHTML = '';
  const { cols, rows } = store.get().layout;
  LAYOUT_PRESETS.forEach(([c, r]) => {
    const btn = document.createElement('button');
    btn.className = 'layout-menu-btn' + (c === cols && r === rows ? ' active' : '');
    btn.dataset.cols = c;
    btn.dataset.rows = r;
    btn.title = `${c}列 × ${r}行`;
    btn.innerHTML = makeGridSVG(c, r, size) + `<span>${c}×${r}</span>`;
    btn.addEventListener('click', () => {
      store.updateLayout({ cols: c, rows: r });
      onPick?.();
    });
    container.appendChild(btn);
  });
}

export function initLayoutPicker(store) {
  const trigger      = document.getElementById('layoutTrigger');
  const menu         = document.getElementById('layoutMenu');
  const headerGrid   = document.getElementById('layoutMenuGrid');
  const printGrid    = document.getElementById('printLayoutGrid');
  const triggerIcon  = document.getElementById('layoutTriggerIcon');
  const triggerLabel = document.getElementById('layoutTriggerLabel');

  function buildMenus() {
    if (headerGrid) buildLayoutGrid(headerGrid, store, 28, closeMenu);
    if (printGrid)  buildLayoutGrid(printGrid,  store, 28, null);
  }

  function updateTrigger() {
    const { cols, rows } = store.get().layout;
    if (triggerIcon)  triggerIcon.innerHTML = makeGridSVG(cols, rows, 18);
    if (triggerLabel) triggerLabel.textContent = `${cols}×${rows}`;
  }

  function closeMenu() {
    trigger?.classList.remove('open');
    menu?.classList.remove('open');
  }

  trigger?.addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = menu.classList.toggle('open');
    trigger.classList.toggle('open', isOpen);
    if (isOpen) {
      setTimeout(() => document.addEventListener('click', closeMenu, { once: true }), 0);
    }
  });

  buildMenus();
  updateTrigger();
  store.subscribe((s, p) => {
    if (p && s.layout === p.layout) return;
    buildMenus();
    updateTrigger();
  });
}
