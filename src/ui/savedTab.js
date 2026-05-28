import { SVG } from '../domain/constants.js';
import { buildTitle } from '../domain/title.js';
import { drawFretboardBase, applyFretboardDiff } from './fretboardSvg.js';
import { renderLegend } from './legend.js';

const NS = 'http://www.w3.org/2000/svg';

export function initSavedTab(container, store, openFullscreen) {
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
    lastIdsKey = saved.map(s => s.id).join(',');
    lastCols = layout.cols;
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
    const colsChanged = s.layout.cols !== lastCols;
    if (idsKey === lastIdsKey && !colsChanged) return;
    render();
  });
}

function renderCard(snap, store, openFullscreen) {
  const card = document.createElement('div');
  card.className = 'saved-card';
  card.dataset.id = snap.id;

  // ── ヘッダー ──
  const hdr = document.createElement('div');
  hdr.className = 'saved-card-header';

  const inp = document.createElement('input');
  inp.type = 'text';
  inp.className = 'saved-title-input';
  inp.value = snap.title;

  const printTitle = document.createElement('span');
  printTitle.className = 'saved-title-print';
  printTitle.textContent = snap.title;

  inp.addEventListener('input', e => {
    const newTitle = e.target.value;
    printTitle.textContent = newTitle;
    store.set(state => ({
      ...state,
      saved: state.saved.map(s => s.id === snap.id ? { ...s, title: newTitle } : s),
    }));
  });

  // 編集ボタン: 保存済みスケールを編集エリアに読み込む
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
    // タイトル入力も更新
    const ti = document.getElementById('fbTitleInput');
    if (ti) { ti.value = snap.title; }
    // ページトップへスクロール
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

  hdr.appendChild(inp);
  hdr.appendChild(printTitle);
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
  applyFretboardDiff(svg, snap, null);
  renderLegend(leg, snap);

  return card;
}
