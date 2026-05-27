import { SVG } from '../domain/constants.js';
import { drawFretboardBase, applyFretboardDiff } from './fretboardSvg.js';
import { renderLegend } from './legend.js';

const NS = 'http://www.w3.org/2000/svg';

export function initSavedTab(container, store) {
  const emptyEl = document.getElementById('savedEmpty');
  let lastIdsKey = '';
  let lastCols = 0;

  function render() {
    const { saved, layout } = store.get();
    if (layout.cols > 1) {
      container.classList.add('screen-grid');
      container.style.gridTemplateColumns = `repeat(${layout.cols}, 1fr)`;
      container.style.gap = '16px';
    } else {
      container.classList.remove('screen-grid');
      container.style.gridTemplateColumns = '1fr';
      container.style.gap = '24px';
    }

    container.innerHTML = '';
    if (emptyEl) emptyEl.style.display = saved.length === 0 ? '' : 'none';
    // Update lastIdsKey BEFORE the loop so a renderCard error doesn't
    // leave it stale and cause infinite re-render attempts on next store update.
    lastIdsKey = saved.map(s => s.id).join(',');
    lastCols = layout.cols;
    saved.forEach(snap => {
      try {
        container.appendChild(renderCard(snap, store));
      } catch (e) {
        console.warn('savedTab: failed to render card', snap.id, e);
      }
    });
  }

  render();
  // Rebuild when cards are added/removed, layout changes, OR the saved tab
  // becomes active (in case render was called while the pane was hidden).
  store.subscribe((s, p) => {
    const idsKey = s.saved.map(c => c.id).join(',');
    const tabOpened = s.activeTab === 'saved' && p?.activeTab !== 'saved';
    if (!tabOpened && idsKey === lastIdsKey && s.layout.cols === lastCols) return;
    render();
  });
}

function renderCard(snap, store) {
  const card = document.createElement('div');
  card.className = 'saved-card';
  card.dataset.id = snap.id;

  const hdr = document.createElement('div');
  hdr.className = 'saved-card-header';

  const inp = document.createElement('input');
  inp.type = 'text';
  inp.className = 'saved-title-input';
  inp.value = snap.title;
  inp.addEventListener('input', e => {
    const newTitle = e.target.value;
    store.set(state => ({
      ...state,
      saved: state.saved.map(s => s.id === snap.id ? { ...s, title: newTitle } : s),
    }));
  });

  const del = document.createElement('button');
  del.className = 'btn-delete';
  del.innerHTML = '<svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/><path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1 0-2h3.5V1h3v1h3.5a1 1 0 0 1 1 1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118z"/></svg>削除';
  del.addEventListener('click', () => {
    store.set(state => ({ ...state, saved: state.saved.filter(s => s.id !== snap.id) }));
  });

  hdr.appendChild(inp);
  hdr.appendChild(del);
  card.appendChild(hdr);

  const wrap = document.createElement('div');
  wrap.className = 'fb-wrap';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'fb');
  svg.setAttribute('id', 'sv' + snap.id);
  svg.setAttribute('viewBox', `0 0 ${SVG.W} ${SVG.H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  wrap.appendChild(svg);
  card.appendChild(wrap);

  const leg = document.createElement('div');
  leg.className = 'legend';
  card.appendChild(leg);

  drawFretboardBase(svg);
  applyFretboardDiff(svg, snap, null);
  renderLegend(leg, snap);

  return card;
}
