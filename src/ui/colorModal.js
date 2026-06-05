import { DEGREES, DEFAULT_COLORS } from '../domain/constants.js';
import { localizeTitle } from '../domain/i18n.js';
import { cloneColors, applyColorsToAllSaved } from '../state/snapshot.js';
import { showToast } from './toast.js';

const PALETTE = [
  '#d92b2b', '#f0b429', '#27ae60', '#2980b9', '#ffffff', '#1c1c1c',
];

/**
 * 度数カラー設定モーダル。色は「スケールごとの個別設定」(docs/features/DEGREE_COLORS.md)。
 *  - openForEdit()    … 編集中スケール(edit)の色を編集
 *  - openForSaved(id) … 登録済みスケール1件の色を個別に編集
 *  - 色変更は対象スケールにのみ反映（自動伝播しない）。
 *  - 「一括反映」ボタンで、現在の色設定を全 saved スケールへ明示的に上書き。
 *
 * @returns {{ openForEdit: () => void, openForSaved: (id:number)=>void }}
 */
export function initColorModal(store) {
  const modal    = document.getElementById('colorModal');
  const list     = document.getElementById('colorList');
  const titleEl  = document.getElementById('colorModalTitle');
  const closeBtn = modal.querySelector('[data-act="close"]');
  const resetBtn = modal.querySelector('[data-act="reset"]');
  const bulkBtn  = document.getElementById('colorBulkApplyBtn');

  // 編集対象: { type:'edit' } または { type:'saved', id }
  let target = { type: 'edit' };

  closeBtn.addEventListener('click', close);
  resetBtn.addEventListener('click', reset);
  bulkBtn.addEventListener('click', bulkApply);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modal.classList.contains('show')) close();
  });

  function open() { if (!build()) return; modal.classList.add('show'); }
  function close() { modal.classList.remove('show'); }

  function openForEdit() { target = { type: 'edit' }; open(); }
  function openForSaved(id) { target = { type: 'saved', id }; open(); }

  /** 対象スケールの degreeColors を返す。saved が消えていれば null。 */
  function getColors() {
    if (target.type === 'saved') {
      const s = store.get().saved.find(x => x.id === target.id);
      return s ? s.degreeColors : null;
    }
    return store.get().edit.degreeColors;
  }

  /** 対象スケールの degreeColors を更新（不変・対象のみ）。 */
  function setColors(updater) {
    store.set(state => {
      if (target.type === 'saved') {
        return {
          ...state,
          saved: state.saved.map(s => s.id === target.id
            ? { ...s, degreeColors: updater(s.degreeColors) } : s),
        };
      }
      return { ...state, edit: { ...state.edit, degreeColors: updater(state.edit.degreeColors) } };
    });
  }

  function setColor(i, patch) {
    setColors(colors => {
      const next = cloneColors(colors);
      next[i] = { ...next[i], ...patch };
      return next;
    });
  }

  function reset() {
    if (!getColors()) { close(); return; }
    setColors(() => cloneColors(DEFAULT_COLORS));
    build();
  }

  // 「一括反映」: 現在の色設定を全 saved スケールへ明示的に適用（確認ダイアログ必須）。
  function bulkApply() {
    const n = store.get().saved.length;
    if (n === 0) return;
    const colors = getColors();
    if (!colors) { close(); return; }
    const ok = window.confirm(
      `現在の色設定をソングファイルの全スケール（${n}件）に適用します。\n`
      + '各スケールの個別設定は上書きされます。よろしいですか？',
    );
    if (!ok) return;
    const snapshot = cloneColors(colors);
    store.set(state => applyColorsToAllSaved(state, snapshot));
    showToast(`全スケール（${n}件）に色を適用しました`);
  }

  /** 一括反映ボタンの活性/ラベルを現在の saved 件数で更新。 */
  function syncBulkBtn() {
    const n = store.get().saved.length;
    bulkBtn.disabled = n === 0;
    bulkBtn.textContent = n === 0
      ? '一括反映できる登録スケールがありません'
      : `現在の色設定をソングファイルの全スケール（${n}件）に適用`;
  }

  /** モーダル内容を構築。対象が消えていれば閉じて false を返す。 */
  function build() {
    const colors = getColors();
    if (!colors) { close(); return false; }

    // タイトル: 個別編集なら対象スケール名を出す
    if (target.type === 'saved') {
      const s = store.get().saved.find(x => x.id === target.id);
      titleEl.textContent = s ? `度数カラー設定 — ${localizeTitle(s.title)}` : '度数カラー設定';
    } else {
      titleEl.textContent = '度数カラー設定';
    }
    syncBulkBtn();

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
            const cur = getColors();
            if (cur) applyBadge(badge, cur[i]);
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
    return true;
  }

  // 個別編集中に対象スケールが削除されたらモーダルを閉じる（操作を破棄）。
  store.subscribe(s => {
    if (!modal.classList.contains('show')) return;
    if (target.type === 'saved' && !s.saved.some(x => x.id === target.id)) close();
  });

  return { openForEdit, openForSaved };
}

function applyBadge(badge, dc) {
  badge.style.background  = dc.solid ? dc.color : '#fff';
  badge.style.borderColor = dc.color;
  badge.style.color       = dc.text;
}
