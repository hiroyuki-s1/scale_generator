import { buildTitle } from '../domain/title.js';
import { localizeTitle } from '../domain/i18n.js';
import { drawFretboardBase, applyFretboardDiff } from './fretboardSvg.js';

/**
 * ソングファイルタブ上部の「編集中スケール」プレビュー（docs/songbook/SPEC.md §6）。
 * エディターで編集中のスケールを小さくプレビューし、「登録する」でソングファイルへ追加。
 * 楽器未選択時は非表示。
 *
 * @param {object} store
 * @param {() => string} getTitle 表示タイトル（タイトル入力欄の値 or 自動生成）
 * @param {() => void} onRegister 「登録する」押下時（既存の登録フローを呼ぶ）
 */
export function initEditPreview(store, getTitle, onRegister) {
  const wrap    = document.getElementById('songfileEditPreview');
  const svg     = document.getElementById('editPreviewSvg');
  const titleEl = document.getElementById('sfpTitle');
  const regBtn  = document.getElementById('sfpRegisterBtn');
  if (!wrap || !svg) return;

  let prevInstr = null;
  let prevEdit = null;

  regBtn?.addEventListener('click', () => onRegister?.());

  function sync(edit) {
    const instr = edit.instrument;
    if (!instr) { wrap.classList.add('hidden'); prevInstr = null; prevEdit = null; return; }
    wrap.classList.remove('hidden');
    if (instr !== prevInstr) {
      drawFretboardBase(svg, instr);
      applyFretboardDiff(svg, edit, null);
      prevInstr = instr;
    } else {
      applyFretboardDiff(svg, edit, prevEdit);
    }
    prevEdit = edit;
    if (titleEl) titleEl.textContent = (getTitle && getTitle()) || localizeTitle(buildTitle(edit));
  }

  sync(store.get().edit);
  store.subscribe((s, p) => {
    if (p && s.edit === p.edit) return;
    sync(s.edit);
  });
}
