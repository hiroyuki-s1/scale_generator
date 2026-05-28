import { SVG } from '../domain/constants.js';
import { buildTitle } from '../domain/title.js';
import { drawFretboardBase, applyFretboardDiff } from './fretboardSvg.js';
import { renderLegend } from './legend.js';

const NS = 'http://www.w3.org/2000/svg';

export function initSavedTab(container, store, openFullscreen) {
  const emptyEl = document.getElementById('savedEmpty');
  let lastIdsKey = '';

  container.classList.add('screen-grid');
  container.style.gridTemplateColumns = 'repeat(2, 1fr)';
  container.style.gap = '16px';

  function render() {
    const { saved } = store.get();
    container.innerHTML = '';
    if (emptyEl) emptyEl.style.display = saved.length === 0 ? '' : 'none';
    lastIdsKey = saved.map(s => s.id).join(',');
    saved.forEach(snap => {
      try {
        container.appendChild(renderCard(snap, store, openFullscreen));
      } catch (e) {
        console.warn('savedTab: failed to render card', snap.id, e);
      }
    });
  }

  render();
  store.subscribe((s, p) => {
    const idsKey = s.saved.map(c => c.id).join(',');
    if (idsKey === lastIdsKey) return;
    render();
  });
}

function renderCard(snap, store, openFullscreen) {
  const card = document.createElement('div');
  card.className = 'saved-card';
  card.dataset.id = snap.id;

  // ── ヘッダー (編集 / 削除ボタンのみ) ──
  const hdr = document.createElement('div');
  hdr.className = 'saved-card-header';

  const editBtn = document.createElement('button');
  editBtn.className = 'btn-edit-saved';
  editBtn.title = '編集エリアに読み込む';
  editBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
    <path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10z"/>
  </svg>編集`;
  editBtn.addEventListener('click', () => {
    if (!confirm(`「${snap.title}」を読み込みます。\n現在の編集内容は失われます。よろしいですか？`)) return;
    store.updateEdit({
      rootIndex:     snap.rootIndex,
      activeDegrees: new Set(snap.activeDegrees),
      presetName:    snap.presetName,
      mode:          snap.mode,
      mask:          { ...snap.mask },
      degreeColors:  snap.degreeColors,
    });
    const ti = document.getElementById('fbTitleInput');
    if (ti) { ti.value = snap.title; }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  const del = document.createElement('button');
  del.className = 'btn-delete';
  del.innerHTML = `<svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
    <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
    <path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1 0-2h3.5V1h3v1h3.5a1 1 0 0 1 1 1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118z"/>
  </svg>削除`;
  del.addEventListener('click', () => {
    store.set(state => ({ ...state, saved: state.saved.filter(s => s.id !== snap.id) }));
  });

  hdr.appendChild(editBtn);
  hdr.appendChild(del);
  card.appendChild(hdr);

  // ── 指板 (クリックで全画面) ──
  const wrap = document.createElement('div');
  wrap.className = 'fb-wrap saved-fb-wrap';
  wrap.title = 'タップで全画面表示';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'fb');
  svg.setAttribute('id', 'sv' + snap.id);
  svg.setAttribute('viewBox', `0 0 ${SVG.W} ${SVG.H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  wrap.appendChild(svg);
  card.appendChild(wrap);

  // 全画面クリック
  wrap.addEventListener('click', () => {
    if (openFullscreen) openFullscreen(snap, snap.title);
  });

  const leg = document.createElement('div');
  leg.className = 'legend';
  card.appendChild(leg);

  drawFretboardBase(svg);

  // Title overlay: large elegant text spanning the fretboard width
  const cx = SVG.ML + SVG.FBW / 2;
  const cy = SVG.MT + SVG.FBH / 2;
  const defs = svg.querySelector('defs');
  const clipId = 'tclip-' + snap.id;
  const clipPath = document.createElementNS(NS, 'clipPath');
  clipPath.setAttribute('id', clipId);
  const clipRect = document.createElementNS(NS, 'rect');
  clipRect.setAttribute('x', SVG.ML);
  clipRect.setAttribute('y', SVG.MT);
  clipRect.setAttribute('width', SVG.FBW);
  clipRect.setAttribute('height', SVG.FBH);
  clipPath.appendChild(clipRect);
  defs.appendChild(clipPath);

  const titleOverlay = document.createElementNS(NS, 'text');
  titleOverlay.setAttribute('x', String(cx));
  titleOverlay.setAttribute('y', String(cy));
  titleOverlay.setAttribute('text-anchor', 'middle');
  titleOverlay.setAttribute('dominant-baseline', 'middle');
  titleOverlay.setAttribute('fill', 'rgba(28,12,2,0.72)');
  titleOverlay.setAttribute('font-size', '62');
  titleOverlay.setAttribute('font-weight', '500');
  titleOverlay.setAttribute('letter-spacing', '4');
  titleOverlay.setAttribute('textLength', String(SVG.FBW - 20));
  titleOverlay.setAttribute('lengthAdjust', 'spacingAndGlyphs');
  titleOverlay.setAttribute('font-family', 'Space Grotesk, Inter, system-ui, sans-serif');
  titleOverlay.setAttribute('clip-path', `url(#${clipId})`);
  titleOverlay.textContent = snap.title.toUpperCase();
  svg.insertBefore(titleOverlay, svg.querySelector('.dot-layer'));

  applyFretboardDiff(svg, snap, null);
  renderLegend(leg, snap);

  return card;
}
