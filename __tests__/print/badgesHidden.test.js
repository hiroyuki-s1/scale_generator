/**
 * 印刷時に画面専用バッジが必ず非表示になることを保証する回帰テスト。
 *
 * 過去に何度か「NEW/EDIT は隠したが UPDATE を追加したときに print の
 * 非表示リストへの追加を忘れた」事故が起きた。再発防止として:
 *   1. main.css の @media print 内で `.screen-only` 全般を非表示にしている
 *      ことを確認 (新規バッジは class="screen-only" を付ければ自動で隠れる)
 *   2. 既存の具体クラス (.new-badge / .update-badge / .edit-badge /
 *      .particle-burst) も明示的に非表示リストに含まれていることを確認
 *   3. savedTab.js 内のバッジ生成箇所が `screen-only` クラスを併用している
 *      ことを確認
 *
 * これにより、新しいバッジクラスが将来追加されても上記いずれかの安全網に
 * 引っかかる確率を高めている。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(join(__dirname, '../../src/styles/main.css'), 'utf8');
const SAVED_TAB = readFileSync(join(__dirname, '../../src/ui/savedTab.js'), 'utf8');

/** @media print { ... } の全ブロックの中身を結合して返す (内側の {} も含む) */
function extractPrintMedia(css) {
  let result = '';
  let pos = 0;
  while (true) {
    const start = css.indexOf('@media print', pos);
    if (start < 0) break;
    let depth = 0;
    let inBlock = false;
    for (let i = css.indexOf('{', start); i < css.length; i++) {
      const c = css[i];
      if (c === '{') {
        depth++;
        inBlock = true;
        if (depth > 1) result += c; // 内側の { は結果に含める
      } else if (c === '}') {
        depth--;
        if (depth === 0 && inBlock) { pos = i + 1; break; }
        else if (depth >= 1) result += c; // 内側の } は結果に含める
      } else if (inBlock && depth >= 1) {
        result += c;
      }
    }
    if (!inBlock) break;
  }
  return result;
}

describe('print badge regression guard', () => {
  const printBody = extractPrintMedia(CSS);

  it('print rule hides .screen-only catch-all (future-proof)', () => {
    expect(printBody).toMatch(/\.screen-only[^{]*\{[^}]*display:\s*none\s*!important/);
  });

  // 既存のすべての画面専用バッジが明示リストに含まれていること
  for (const cls of ['new-badge', 'update-badge', 'edit-badge', 'particle-burst']) {
    it(`print rule explicitly hides .${cls}`, () => {
      // .screen-only を含むセレクタリスト or 個別ルールのどちらでも一致する
      const re = new RegExp(`\\.${cls}[^{]*\\{[^}]*display:\\s*none\\s*!important|\\.${cls}[\\s,][^{]*\\{[^}]*display:\\s*none\\s*!important|,\\s*\\.${cls}[\\s,][\\s\\S]*?display:\\s*none\\s*!important`);
      expect(printBody).toMatch(re);
    });
  }

  it('savedTab.js: new/update/edit badges all add "screen-only" class', () => {
    // EDIT! / NEW! / UPDATE! いずれのバッジ生成箇所も screen-only を併用
    expect(SAVED_TAB).toMatch(/edit-badge\s+screen-only/);
    expect(SAVED_TAB).toMatch(/(?:new|update)-badge[^']*'\s*\+\s*'\s*screen-only|new-badge.*screen-only|update-badge.*screen-only/);
  });
});
