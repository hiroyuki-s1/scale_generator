import { SVG } from '../domain/constants.js';
import { buildTitle } from '../domain/title.js';
import { localizeTitle } from '../domain/i18n.js';
import { drawFretboardBase, applyFretboardDiff } from './fretboardSvg.js';
import { renderLegend } from './legend.js';

const NS = 'http://www.w3.org/2000/svg';

/** ひらがな → カタカナ変換 (U+3041–U+3096 → +0x60) */
function toKatakana(str) {
  return str.replace(/[\u3041-\u3096]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60));
}

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

  // Blurred background band filter
  const bgFiltId = 'bgfilt-' + snap.id;
  const bgFilter = document.createElementNS(NS, 'filter');
  bgFilter.setAttribute('id', bgFiltId);
  bgFilter.setAttribute('x', '-2%'); bgFilter.setAttribute('y', '-40%');
  bgFilter.setAttribute('width', '104%'); bgFilter.setAttribute('height', '180%');
  const bgBlur = document.createElementNS(NS, 'feGaussianBlur');
  bgBlur.setAttribute('in', 'SourceGraphic'); bgBlur.setAttribute('stdDeviation', '10');
  bgFilter.appendChild(bgBlur);
  defs.appendChild(bgFilter);

  // Drop-shadow filter for the text
  const filterId = 'tfilt-' + snap.id;
  const filter = document.createElementNS(NS, 'filter');
  filter.setAttribute('id', filterId);
  filter.setAttribute('x', '-5%'); filter.setAttribute('y', '-30%');
  filter.setAttribute('width', '110%'); filter.setAttribute('height', '160%');
  const shadow = document.createElementNS(NS, 'feDropShadow');
  shadow.setAttribute('dx', '0'); shadow.setAttribute('dy', '2');
  shadow.setAttribute('stdDeviation', '3');
  shadow.setAttribute('flood-color', 'rgba(0,0,0,0.4)');
  filter.appendChild(shadow);
  defs.appendChild(filter);

  // Overlay group — appended LAST so it renders above dots
  const overlayGroup = document.createElementNS(NS, 'g');
  overlayGroup.setAttribute('clip-path', `url(#${clipId})`);

  const bgRect = document.createElementNS(NS, 'rect');
  bgRect.setAttribute('x', String(SVG.ML));
  bgRect.setAttribute('y', String(cy - 46));
  bgRect.setAttribute('width', String(SVG.FBW));
  bgRect.setAttribute('height', '92');
  bgRect.setAttribute('fill', 'rgba(252,238,205,0.78)');
  bgRect.setAttribute('filter', `url(#${bgFiltId})`);
  overlayGroup.appendChild(bgRect);

  const titleOverlay = document.createElementNS(NS, 'text');
  titleOverlay.setAttribute('x', String(cx));
  titleOverlay.setAttribute('y', String(cy));
  titleOverlay.setAttribute('text-anchor', 'middle');
  titleOverlay.setAttribute('dominant-baseline', 'middle');
  titleOverlay.setAttribute('fill', 'rgba(28,12,2,0.88)');
  titleOverlay.setAttribute('font-size', '58');
  titleOverlay.setAttribute('font-weight', '600');
  titleOverlay.setAttribute('letter-spacing', '5');
  titleOverlay.setAttribute('font-family', 'Space Grotesk, Inter, system-ui, sans-serif');
  titleOverlay.setAttribute('filter', `url(#${filterId})`);
  titleOverlay.textContent = toKatakana(localizeTitle(snap.title));
  overlayGroup.appendChild(titleOverlay);

  svg.appendChild(overlayGroup);  // frontmost — above all dots

  applyFretboardDiff(svg, snap, null);
  renderLegend(leg, snap);

  return card;
}
