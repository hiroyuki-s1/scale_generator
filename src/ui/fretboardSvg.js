import { DEGREES, TUNING, STRING_LABELS, SVG, DEFAULT_COLORS } from '../domain/constants.js';
import { computeFretNotes } from '../domain/fretboard.js';

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
 * SVG要素にフレットボードを描画する。
 * scale = { rootIndex, activeDegrees:Set, mask, degreeColors? }
 */
export function drawFretboard(svgEl, scale) {
  const mon = scale.mask?.enabled;
  const mlo = scale.mask?.min ?? SVG.F0;
  const mhi = scale.mask?.max ?? SVG.F1;
  const colors = scale.degreeColors || DEFAULT_COLORS;
  const uid = svgEl.id || ('fb' + Math.random().toString(36).slice(2));

  svgEl.innerHTML = '';
  svgEl.appendChild(el('rect', { x: 0, y: 0, width: SVG.W, height: SVG.H, fill: '#fff' }));

  // grad bg
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

  // inlay dots
  [3, 5, 7, 9].forEach(f => svgEl.appendChild(el('circle', {
    cx: fx(f), cy: SVG.MT + SVG.FBH / 2, r: 4.5, fill: 'rgba(180,140,80,.22)',
  })));
  [SVG.MT + SVG.FBH / 3, SVG.MT + SVG.FBH * 2 / 3].forEach(cy => svgEl.appendChild(el('circle', {
    cx: fx(12), cy, r: 4.5, fill: 'rgba(180,140,80,.22)',
  })));

  // nut
  svgEl.appendChild(el('rect', { x: SVG.ML - 5, y: SVG.MT, width: 6, height: SVG.FBH, fill: '#d8c8a0', rx: '1.5' }));
  svgEl.appendChild(el('rect', { x: SVG.ML - 5, y: SVG.MT, width: 3, height: SVG.FBH, fill: 'rgba(255,255,255,.35)', rx: '1.5' }));

  // fret lines
  for (let f = SVG.F0; f <= SVG.F1 + 1; f++) {
    const x = SVG.ML + (f - SVG.F0) * SVG.FW;
    const is12 = f === 12;
    svgEl.appendChild(el('line', {
      x1: x, y1: SVG.MT + 1, x2: x, y2: SVG.MT + SVG.FBH - 1,
      stroke: is12 ? '#8a6635' : '#c8a45a',
      'stroke-width': is12 ? 2.5 : 1.2, opacity: is12 ? 1 : 0.8,
    }));
  }

  // fret numbers & inlay dots below
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

  // strings
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

  // dots — domain layer decides which notes are visible (respects mask too)
  for (const n of computeFretNotes(scale)) {
    appendDot(svgEl, n.string, n.fret, n.degree, colors);
  }

  // mask overlay
  if (mon) {
    const mf = 'rgba(215,210,205,.75)';
    if (mlo > SVG.F0) {
      const x1 = SVG.ML;
      const x2 = SVG.ML + (mlo - SVG.F0) * SVG.FW;
      svgEl.appendChild(el('rect', { x: x1, y: SVG.MT, width: x2 - x1, height: SVG.FBH, fill: mf, rx: '3' }));
    }
    if (mhi < SVG.F1) {
      const x1 = SVG.ML + (mhi - SVG.F0 + 1) * SVG.FW;
      const x2 = SVG.ML + SVG.FBW;
      svgEl.appendChild(el('rect', { x: x1, y: SVG.MT, width: x2 - x1, height: SVG.FBH, fill: mf, rx: '3' }));
    }
    const rx = SVG.ML + (mlo - SVG.F0) * SVG.FW;
    const rw = (mhi - mlo + 1) * SVG.FW;
    svgEl.appendChild(el('rect', {
      x: rx, y: SVG.MT - 2, width: rw, height: SVG.FBH + 4,
      fill: 'none', stroke: '#7c3aed', 'stroke-width': '2', rx: '4', opacity: '.9',
    }));
  }
}

function appendDot(svgEl, s, f, deg, colors) {
  const cx = fx(f), cy = sy(s);
  const { name } = DEGREES[deg];
  const isRoot = deg === 0;
  const dc = colors[deg];
  const dotFill = dc.solid ? dc.color : '#ffffff';
  const fs = name.length >= 4 ? '8.5' : name.length === 1 ? '15' : '12';
  const delay = `${(f - SVG.F0) * 22}ms`;

  svgEl.appendChild(el('circle', {
    cx: cx + 0.5, cy: cy + 1.5, r: SVG.CR, fill: 'rgba(0,0,0,.10)',
    class: 'fb-dot', 'data-deg': deg, style: `animation-delay:${delay}`,
  }));
  svgEl.appendChild(el('circle', {
    cx, cy, r: SVG.CR, fill: dotFill, stroke: dc.color,
    'stroke-width': isRoot ? 2.5 : 1.8,
    class: 'fb-dot', 'data-deg': deg, style: `animation-delay:${delay}`,
  }));
  if (isRoot) {
    svgEl.appendChild(el('circle', {
      cx, cy, r: SVG.CR - 3.5, fill: 'none', stroke: dc.color,
      'stroke-width': '1', opacity: '.45',
      class: 'fb-dot', 'data-deg': deg, style: `animation-delay:${delay}`,
    }));
  }
  svgEl.appendChild(el('text', {
    x: cx, y: cy + 4.5, 'text-anchor': 'middle', fill: dc.text,
    'font-size': fs, 'font-weight': 'bold', 'font-family': "'Courier New',monospace",
    class: 'fb-dot', 'data-deg': deg, style: `animation-delay:${delay}`,
  }, name));
}

/**
 * 既存svgに指定度数のドットだけ追加（編集タブのアニメーション用）。
 */
export function appendDegreeDots(svgEl, scale, deg) {
  const colors = scale.degreeColors || DEFAULT_COLORS;
  const singleDegScale = { ...scale, activeDegrees: new Set([deg]) };
  for (const n of computeFretNotes(singleDegScale)) {
    appendDot(svgEl, n.string, n.fret, n.degree, colors);
  }
}
