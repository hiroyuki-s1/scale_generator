import { DEGREES, TUNING, STRING_LABELS, SVG, DEFAULT_COLORS } from '../domain/constants.js';
import { diffFretNotes, noteKey } from '../domain/fretboard.js';

const NS = 'http://www.w3.org/2000/svg';
const fx = f => SVG.ML + (f - SVG.F0) * SVG.FW + SVG.FW / 2;
const sy = s => SVG.MT + s * SVG.SH;

function el(tag, attrs, txt) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (txt !== undefined) e.textContent = txt;
  return e;
}

/**
 * Draw the static parts of the fretboard (background, frets, strings, inlays).
 * Idempotent — clears the svg and rebuilds the base. Call once per svg lifecycle.
 */
export function drawFretboardBase(svgEl) {
  const uid = svgEl.id || ('fb' + Math.random().toString(36).slice(2));
  svgEl.innerHTML = '';
  svgEl.appendChild(el('rect', { x: 0, y: 0, width: SVG.W, height: SVG.H, fill: '#fff' }));

  const defs = el('defs', {});
  const grad = el('linearGradient', { id: 'g' + uid, x1: '0', y1: '0', x2: '0', y2: '1' });
  grad.appendChild(el('stop', { offset: '0%',   'stop-color': '#fef6e7' }));
  grad.appendChild(el('stop', { offset: '100%', 'stop-color': '#f8ead0' }));
  defs.appendChild(grad);
  svgEl.appendChild(defs);
  svgEl.appendChild(el('rect', {
    x: SVG.ML, y: SVG.MT, width: SVG.FBW, height: SVG.FBH,
    fill: `url(#g${uid})`, stroke: '#cca86a', 'stroke-width': '1.5', rx: '4',
  }));

  [3, 5, 7, 9].forEach(f => svgEl.appendChild(el('circle', {
    cx: fx(f), cy: SVG.MT + SVG.FBH / 2, r: 4.5, fill: 'rgba(180,140,80,.22)',
  })));
  [SVG.MT + SVG.FBH / 3, SVG.MT + SVG.FBH * 2 / 3].forEach(cy => svgEl.appendChild(el('circle', {
    cx: fx(12), cy, r: 4.5, fill: 'rgba(180,140,80,.22)',
  })));

  svgEl.appendChild(el('rect', { x: SVG.ML - 5, y: SVG.MT, width: 6, height: SVG.FBH, fill: '#d8c8a0', rx: '1.5' }));
  svgEl.appendChild(el('rect', { x: SVG.ML - 5, y: SVG.MT, width: 3, height: SVG.FBH, fill: 'rgba(255,255,255,.35)', rx: '1.5' }));

  for (let f = SVG.F0; f <= SVG.F1 + 1; f++) {
    const x = SVG.ML + (f - SVG.F0) * SVG.FW;
    const is12 = f === 12;
    svgEl.appendChild(el('line', {
      x1: x, y1: SVG.MT + 1, x2: x, y2: SVG.MT + SVG.FBH - 1,
      stroke: is12 ? '#8a6635' : '#c8a45a',
      'stroke-width': is12 ? 2.5 : 1.2, opacity: is12 ? 1 : 0.8,
    }));
  }

  [3, 5, 7, 9, 12, 15].forEach(f => {
    if (f < SVG.F0 || f > SVG.F1) return;
    svgEl.appendChild(el('text', {
      x: fx(f), y: SVG.MT + SVG.FBH + 15, 'text-anchor': 'middle',
      fill: '#bbb', 'font-size': '10', 'font-family': 'monospace', 'font-weight': '600',
    }, String(f)));
  });
  [3, 5, 7, 9].forEach(f => {
    if (f < SVG.F0 || f > SVG.F1) return;
    svgEl.appendChild(el('circle', { cx: fx(f), cy: SVG.MT + SVG.FBH + 26, r: 3.5, fill: '#d0cbc3' }));
  });
  [-7, 7].forEach(dx => svgEl.appendChild(el('circle', {
    cx: fx(12) + dx, cy: SVG.MT + SVG.FBH + 26, r: 3.5, fill: '#d0cbc3',
  })));

  const sc = ['#b8b2a8', '#b0aaa0', '#a8a298', '#a09890', '#988f85', '#90877c'];
  for (let s = 0; s < TUNING.length; s++) {
    const y = sy(s);
    svgEl.appendChild(el('line', {
      x1: SVG.ML, y1: y, x2: SVG.ML + SVG.FBW, y2: y,
      stroke: sc[s], 'stroke-width': (0.8 + s * 0.42).toFixed(2),
    }));
    svgEl.appendChild(el('text', {
      x: SVG.ML - 7, y: y + 4, 'text-anchor': 'end',
      fill: '#c5bfb5', 'font-size': '9', 'font-family': 'monospace',
    }, STRING_LABELS[s]));
  }

  // Dot layer is always the last child so dots always render above mask overlays
  svgEl.appendChild(el('g', { class: 'dot-layer' }));
}

/**
 * Append/remove dot DOM to bring svg in sync with `nextScale`, only animating
 * the difference from `prevScale`. Mask overlay is regenerated each call.
 *
 * Pass prevScale=null on first render to animate everything in.
 */
export function applyFretboardDiff(svgEl, nextScale, prevScale) {
  const colors = nextScale.degreeColors || DEFAULT_COLORS;
  const { added, removed } = diffFretNotes(prevScale, nextScale);

  removed.forEach(n => {
    svgEl.querySelectorAll(`[data-pos="${noteKey(n)}"]`).forEach(node => {
      // strip the data-pos so a same-key add can't match this exiting node
      node.removeAttribute('data-pos');
      node.style.animationDelay = '0s';
      node.classList.add('fb-dot-exit');
      node.addEventListener('animationend', () => node.remove(), { once: true });
    });
  });
  added.forEach(n => appendDot(svgEl, n, colors));

  if (prevScale && prevScale.degreeColors !== colors) {
    repaintDotColors(svgEl, colors);
  }

  // mask overlay is cheap (1–3 rects) — just remove + re-add
  updateMaskOverlay(svgEl, nextScale);
}

/**
 * 既存のドット要素の色だけ書き換える（カラー設定変更時、再アニメ無しで反映）。
 */
function repaintDotColors(svgEl, colors) {
  for (let d = 0; d < colors.length; d++) {
    const dc = colors[d];
    const dotFill = dc.solid ? dc.color : '#ffffff';
    svgEl.querySelectorAll(`[data-deg="${d}"]:not(.fb-dot-exit)`).forEach(node => {
      if (node.tagName === 'text') {
        node.setAttribute('fill', dc.text);
        return;
      }
      // circle: 3 kinds — shadow (rgba fill), root-inner-ring (fill='none'), main dot
      const fill = node.getAttribute('fill');
      if (fill && fill.startsWith('rgba')) return;          // shadow: leave alone
      if (fill === 'none') { node.setAttribute('stroke', dc.color); return; }
      node.setAttribute('fill', dotFill);
      node.setAttribute('stroke', dc.color);
    });
  }
}

function appendDot(svgEl, n, colors) {
  const { string: s, fret: f, degree: deg } = n;
  const cx = fx(f), cy = sy(s);
  const { name } = DEGREES[deg];
  const isRoot = deg === 0;
  const dc = colors[deg];
  const dotFill = dc.solid ? dc.color : '#ffffff';
  const fs = name.length >= 4 ? '8.5' : name.length === 1 ? '15' : '12';
  const delay = `${(f - SVG.F0) * 22}ms`;
  const pos = noteKey(n);
  // Set transform-origin explicitly in SVG user-space coordinates so that
  // scale() animates from the dot centre on all browsers (incl. iOS Safari
  // where transform-box:fill-box is unreliable for <text> elements).
  const common = { class: 'fb-dot', 'data-deg': deg, 'data-pos': pos,
    style: `animation-delay:${delay};transform-origin:${cx}px ${cy}px` };

  // Append into the dot-layer group (always last child) so dots render above mask overlays
  const layer = svgEl.querySelector('.dot-layer') || svgEl;
  layer.appendChild(el('circle', {
    cx: cx + 0.5, cy: cy + 1.5, r: SVG.CR, fill: 'rgba(0,0,0,.10)', ...common,
  }));
  layer.appendChild(el('circle', {
    cx, cy, r: SVG.CR, fill: dotFill, stroke: dc.color,
    'stroke-width': isRoot ? 2.5 : 1.8, ...common,
  }));
  if (isRoot) {
    layer.appendChild(el('circle', {
      cx, cy, r: SVG.CR - 3.5, fill: 'none', stroke: dc.color,
      'stroke-width': '1', opacity: '.45', ...common,
    }));
  }
  layer.appendChild(el('text', {
    x: cx, y: cy + 4.5, 'text-anchor': 'middle', fill: dc.text,
    'font-size': fs, 'font-weight': 'bold', 'font-family': "'Courier New',monospace",
    ...common,
  }, name));
}

function updateMaskOverlay(svgEl, scale) {
  svgEl.querySelectorAll('[data-mask]').forEach(e => e.remove());
  const m = scale.mask;
  if (!m?.enabled) return;
  // Insert mask elements BEFORE the dot-layer so dots always render on top
  const dotLayer = svgEl.querySelector('.dot-layer');
  const insert = elem => dotLayer ? svgEl.insertBefore(elem, dotLayer) : svgEl.appendChild(elem);
  const mf = 'rgba(215,210,205,.75)';
  if (m.min > SVG.F0) {
    const x1 = SVG.ML;
    const x2 = SVG.ML + (m.min - SVG.F0) * SVG.FW;
    insert(el('rect', {
      x: x1, y: SVG.MT, width: x2 - x1, height: SVG.FBH, fill: mf, rx: '3',
      'data-mask': 'left',
    }));
  }
  if (m.max < SVG.F1) {
    const x1 = SVG.ML + (m.max - SVG.F0 + 1) * SVG.FW;
    const x2 = SVG.ML + SVG.FBW;
    insert(el('rect', {
      x: x1, y: SVG.MT, width: x2 - x1, height: SVG.FBH, fill: mf, rx: '3',
      'data-mask': 'right',
    }));
  }
  const rx = SVG.ML + (m.min - SVG.F0) * SVG.FW;
  const rw = (m.max - m.min + 1) * SVG.FW;
  // Extend border to fully enclose dot circles on edge strings (CR = 12.5)
  // so the stroke never crosses through dot labels
  const bpad = SVG.CR + 2;
  insert(el('rect', {
    x: rx, y: SVG.MT - bpad, width: rw, height: SVG.FBH + bpad * 2,
    fill: 'none', stroke: '#7c3aed', 'stroke-width': '2', rx: '5', opacity: '.9',
    'data-mask': 'border',
  }));
}

/** Compute the viewBox that crops to the mask range (for print). */
export function maskViewBox(mask) {
  if (!mask?.enabled) return null;
  const padX = 14;
  const padY = 8;
  const x = SVG.ML + (mask.min - SVG.F0) * SVG.FW - padX;
  const w = (mask.max - mask.min + 1) * SVG.FW + padX * 2;
  // Crop vertical dead space too so the masked region fills the card area
  // instead of letterboxing.
  const y = SVG.MT - padY;
  const h = SVG.FBH + padY * 2 + 26;
  return `${x} ${y} ${w} ${h}`;
}

/** Toggle mask overlays' visibility — used during print so the cropped view is clean. */
export function setMaskOverlayVisible(svgEl, visible) {
  svgEl.querySelectorAll('[data-mask]').forEach(e => {
    e.style.display = visible ? '' : 'none';
  });
}

