import {
  DEGREES, SVG, DEFAULT_COLORS,
  TUNING_GUITAR, TUNING_BASS,
  STRING_LABELS_GUITAR, STRING_LABELS_BASS,
} from '../domain/constants.js';
import { diffFretNotes, noteKey } from '../domain/fretboard.js';
import { DOT_FONT_SIZE_1, DOT_FONT_SIZE_2, DOT_FONT_SIZE_3 } from '../config.js';

const NS = 'http://www.w3.org/2000/svg';
const fx = f => SVG.ML + (f - SVG.F0) * SVG.FW + SVG.FW / 2;

/** instrument に応じた弦ピッチを返す */
const getSH = (instrument) => instrument === 'bass' ? SVG.SH_BASS : SVG.SH;
const makeSy = (sh) => (s) => SVG.MT + SVG.SP + s * sh;

function el(tag, attrs, txt) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (txt !== undefined) e.textContent = txt;
  return e;
}

/**
 * Draw the static parts of the fretboard (background, frets, strings, inlays).
 * Idempotent — clears the svg and rebuilds the base. Call once per svg lifecycle.
 * @param {SVGElement} svgEl
 * @param {'guitar'|'bass'|null} [instrument='guitar']
 */
export function drawFretboardBase(svgEl, instrument = 'guitar') {
  const tuning     = instrument === 'bass' ? TUNING_BASS : TUNING_GUITAR;
  const strLabels  = instrument === 'bass' ? STRING_LABELS_BASS : STRING_LABELS_GUITAR;
  const sh         = getSH(instrument);
  const sy         = makeSy(sh);

  const uid = svgEl.id || ('fb' + Math.random().toString(36).slice(2));
  svgEl.innerHTML = '';
  // viewBox を毎描画でジオメトリ設定 (config/fretboardGeometry.js) から再生成。
  // HTML 側に静的値を残すと FRET_WIDTH 等を変えたとき不整合が出るため。
  svgEl.setAttribute('viewBox', `0 0 ${SVG.W} ${SVG.H}`);
  svgEl.appendChild(el('rect', { x: 0, y: 0, width: SVG.W, height: SVG.H, fill: '#fff' }));

  // Guitar: warm maple tone / Bass: darker rosewood tone
  const [gradTop, gradBot] = instrument === 'bass'
    ? ['#f0e8d8', '#e4d4b8']
    : ['#fef6e7', '#f8ead0'];
  const defs = el('defs', {});
  const grad = el('linearGradient', { id: 'g' + uid, x1: '0', y1: '0', x2: '0', y2: '1' });
  grad.appendChild(el('stop', { offset: '0%',   'stop-color': gradTop }));
  grad.appendChild(el('stop', { offset: '100%', 'stop-color': gradBot }));
  defs.appendChild(grad);
  svgEl.appendChild(defs);
  svgEl.appendChild(el('rect', {
    x: SVG.ML, y: SVG.MT, width: SVG.FBW, height: SVG.FBH,
    fill: `url(#g${uid})`, stroke: '#cca86a', 'stroke-width': '1.5', rx: '4',
  }));

  // Fret 0 area — 外枠なし・完全白 (外枠 stroke を覆うよう少し広げる)
  const nutX = SVG.ML + SVG.FW; // nut = line between fret 0 and fret 1
  svgEl.appendChild(el('rect', {
    x: SVG.ML - 2, y: SVG.MT - 2,
    width: SVG.FW + 2, height: SVG.FBH + 4,
    fill: '#ffffff', rx: '3',
  }));

  // Inlay dots (3,5,7,9,12,15,17,19,21)
  [3, 5, 7, 9, 15, 17, 19, 21].forEach(f => {
    if (f < SVG.F0 || f > SVG.F1) return;
    svgEl.appendChild(el('circle', {
      cx: fx(f), cy: SVG.MT + SVG.FBH / 2, r: 4, fill: 'rgba(80,55,20,.50)',
    }));
  });
  [SVG.MT + SVG.FBH / 3, SVG.MT + SVG.FBH * 2 / 3].forEach(cy => {
    if (12 < SVG.F0 || 12 > SVG.F1) return;
    svgEl.appendChild(el('circle', { cx: fx(12), cy, r: 4, fill: 'rgba(80,55,20,.50)' }));
  });

  // Nut bar — silver metallic bar
  svgEl.appendChild(el('rect', { x: nutX - 7, y: SVG.MT - 1, width: 10, height: SVG.FBH + 2, fill: '#8a9aaa', rx: '2' }));
  svgEl.appendChild(el('rect', { x: nutX - 7, y: SVG.MT - 1, width: 5,  height: SVG.FBH + 2, fill: 'rgba(255,255,255,.55)', rx: '2' }));
  svgEl.appendChild(el('rect', { x: nutX + 1,  y: SVG.MT,    width: 2,  height: SVG.FBH, fill: 'rgba(0,0,0,.22)' }));

  // Fret lines (skip fret 1 line — that's the nut)
  for (let f = SVG.F0; f <= SVG.F1 + 1; f++) {
    const x = SVG.ML + (f - SVG.F0) * SVG.FW;
    if (f === 1 || f === SVG.F0) continue; // nut and left edge already drawn
    const is12 = f === 12;
    svgEl.appendChild(el('line', {
      x1: x, y1: SVG.MT + 1, x2: x, y2: SVG.MT + SVG.FBH - 1,
      stroke: is12 ? '#8a6635' : '#c8a45a',
      'stroke-width': is12 ? 2.5 : 1.2, opacity: is12 ? 1 : 0.8,
    }));
  }

  // Fret position numbers — below fretboard box, small gap
  const posY = SVG.MT + SVG.FBH + 12;
  [0, 3, 5, 7, 9, 12, 15, 17, 19, 21].forEach(f => {
    if (f < SVG.F0 || f > SVG.F1) return;
    svgEl.appendChild(el('text', {
      x: fx(f), y: posY, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
      fill: '#8a8079', 'font-size': '12', 'font-family': 'monospace', 'font-weight': 'bold',
    }, String(f)));
  });

  // Strings — guitar: 6 wound strings, bass: 4 thicker strings
  const guitarColors = ['#b8b2a8', '#b0aaa0', '#a8a298', '#a09890', '#988f85', '#90877c'];
  const bassColors   = ['#a8a090', '#988878', '#887060', '#786050'];
  const sc = instrument === 'bass' ? bassColors : guitarColors;

  for (let s = 0; s < tuning.length; s++) {
    const y = sy(s);
    const sw = instrument === 'bass'
      ? (1.4 + s * 0.7).toFixed(2)
      : (0.8 + s * 0.42).toFixed(2);
    svgEl.appendChild(el('line', {
      x1: nutX, y1: y, x2: SVG.ML + SVG.FBW, y2: y,
      stroke: sc[s], 'stroke-width': sw,
    }));
    svgEl.appendChild(el('text', {
      x: SVG.ML - 5, y: y + 4, 'text-anchor': 'end',
      fill: '#c5bfb5', 'font-size': '9', 'font-family': 'monospace',
    }, strLabels[s]));
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
  const instrument = nextScale.instrument || 'guitar';
  const sh = getSH(instrument);
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
  added.forEach(n => appendDot(svgEl, n, colors, sh));

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

function appendDot(svgEl, n, colors, sh) {
  const { string: s, fret: f, degree: deg } = n;
  const cx = fx(f), cy = SVG.MT + SVG.SP + s * sh;
  const { name } = DEGREES[deg];
  const isRoot = deg === 0;
  const dc = colors[deg];
  const dotFill = dc.solid ? dc.color : '#ffffff';
  const fs = name.length >= 3 ? String(DOT_FONT_SIZE_3) : name.length === 2 ? String(DOT_FONT_SIZE_2) : String(DOT_FONT_SIZE_1);
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
}

/** Compute the viewBox that crops to the mask range (for print/fullscreen). */
export function maskViewBox(mask) {
  if (!mask?.enabled) return null;
  const padX = 4;  // ドット半径(CR=10) より小さくして範囲外ドットが見えないようにする
  const padY = SVG.CR + 4;
  const x = SVG.ML + (mask.min - SVG.F0) * SVG.FW - padX;
  const w = (mask.max - mask.min + 1) * SVG.FW + padX * 2;
  const y = SVG.MT - padY;
  const h = SVG.FBH + padY + SVG.MB;
  return `${x} ${y} ${w} ${h}`;
}

/** Toggle mask overlays' visibility — used during print so the cropped view is clean. */
export function setMaskOverlayVisible(svgEl, visible) {
  svgEl.querySelectorAll('[data-mask]').forEach(e => {
    e.style.display = visible ? '' : 'none';
  });
}

const PRINT_TITLE_CLASS = 'fb-print-title';
// タイトル帯の高さ = 指板表示高さ(viewBox の h)に対する比率。
// 帯を上に足すぶん、固定セル内では指板が少し縮小して見える (= ユーザー要望
// 「スケールを少し縮小して上部に文字」)。
const PRINT_TITLE_BAND_RATIO = 0.30;

/**
 * 印刷用にスケール名を SVG 内の上部へ焼き込む (スケール名＋指板で1枚の画像にする)。
 *
 * 仕組み: 指板は動かさず、viewBox の上端をタイトル帯ぶんだけ上へ広げ、その帯に
 *   タイトル text を1つ置く。これで「タイトルと指板が必ず同じ1枚の SVG 画像」になり、
 *   印刷でタイトルだけ別ページに割れる/別要素が min-content 膨張で崩れる、が起きない。
 *   帯は指板の「上」なのでドットや指板と重ならない (かぶらない)。
 *
 * @param {SVGElement} svgEl
 * @param {string} title          表示するタイトル (ローカライズ済み文字列)
 * @param {string} baseViewBox    帯を足す前の viewBox 文字列 "minX minY w h"
 * @returns {string} 帯を加えた新しい viewBox 文字列 (呼び出し側が setAttribute する)
 */
export function bakePrintTitle(svgEl, title, baseViewBox) {
  removePrintTitle(svgEl);
  const [minX, minY, w, h] = baseViewBox.split(/\s+/).map(Number);
  if (![minX, minY, w, h].every(Number.isFinite)) return baseViewBox;

  const band   = Math.round(h * PRINT_TITLE_BAND_RATIO);
  const newMinY = minY - band;
  const newH    = h + band;
  const fontSize = Math.round(band * 0.56);

  // 帯の白背景 (透明だと用紙では白だが、画面プレビュー時の見た目を安定させる)
  svgEl.appendChild(el('rect', {
    class: PRINT_TITLE_CLASS,
    x: minX, y: newMinY, width: w, height: band, fill: '#ffffff',
  }));
  // タイトル本体 — 帯の中央。指板(y >= minY)とは重ならない。
  svgEl.appendChild(el('text', {
    class: PRINT_TITLE_CLASS,
    x: minX + w / 2,
    y: newMinY + band * 0.60,
    'text-anchor': 'middle',
    'dominant-baseline': 'middle',
    fill: '#1c1c1c',
    'font-size': String(fontSize),
    'font-weight': '700',
    'font-family': "'Space Grotesk', Inter, system-ui, sans-serif",
  }, title));

  return `${minX} ${newMinY} ${w} ${newH}`;
}

/** 焼き込んだ印刷タイトルを除去する (afterprint で画面表示へ戻すとき)。 */
export function removePrintTitle(svgEl) {
  svgEl.querySelectorAll('.' + PRINT_TITLE_CLASS).forEach(e => e.remove());
}

