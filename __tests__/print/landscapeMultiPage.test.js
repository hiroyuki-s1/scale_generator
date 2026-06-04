/**
 * 横レイアウト複数ページ印刷の回帰テスト (100vh 方式)。
 *
 * 重要な訂正:
 *   一時期「mm 固定 height + orientation media query」へ変更したが、iOS 実機の
 *   AirPrint 物理余白を CSS 側で補正しきれず**縦印刷で2P目空白が再発**した。
 *   ユーザー証言「以前 (100vh 時代 = dedecc4) は縦印刷が動いていた」に基づき
 *   `.print-page-group { height: 100vh }` に復元 (vh は印刷ページに追従するため
 *   物理余白の手動補正が不要)。本テストは 100vh 維持と複数ページ整合性を守る。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { buildPrintCss } from '../../src/print/printCss.js';
import { calcPageGroupSizes } from '../../src/print/pageGroup.js';
import { LAYOUT_PRESETS } from '../../src/domain/constants.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(join(__dirname, '../../src/styles/main.css'), 'utf8');

// ── 1. 複数ページ: calcPageGroupSizes の整合性 (全パターン) ──────────────

describe('複数ページ: calcPageGroupSizes の整合性 (全パターン)', () => {
  for (const [cols, rows] of LAYOUT_PRESETS) {
    const perPage = cols * rows;
    const totals = [perPage + 1, perPage * 2, perPage * 2 + 1, perPage * 3];
    for (const total of totals) {
      it(`[${cols}×${rows}] total=${total}: グループ数 = ceil(${total}/${perPage})`, () => {
        const sizes = calcPageGroupSizes(total, perPage);
        expect(sizes.length).toBe(Math.ceil(total / perPage));
        expect(sizes.reduce((a, b) => a + b, 0)).toBe(total);
        sizes.forEach(s => expect(s).toBeLessThanOrEqual(perPage));
      });
    }
  }
});

// ── 2. 横向き CSS が height:100vh で生成される (mm固定に戻さない) ──────────

describe('横向き印刷 CSS は height:100vh (iOS ページ追従)', () => {
  for (const [cols, rows] of LAYOUT_PRESETS) {
    it(`[${cols}×${rows}] landscape: @page landscape mm + .print-page-group height:100vh`, () => {
      const { orient, layout } = buildPrintCss({ orientation: 'landscape', cols, rows });
      expect(orient).toContain('size: 297mm 210mm');
      const pg = layout.match(/\.print-page-group\s*\{([^}]+)\}/)?.[1] ?? '';
      expect(pg).toMatch(/height:\s*100vh/);
      expect(pg).not.toMatch(/height:\s*[\d.]+mm/); // mm 固定に戻さない
    });

    it(`[${cols}×${rows}] grid 行/列が minmax(0, 1fr) (Safari 行膨張回避)`, () => {
      const { layout } = buildPrintCss({ orientation: 'landscape', cols, rows });
      expect(layout).toMatch(new RegExp(`grid-template-columns:\\s*repeat\\(${cols},\\s*minmax\\(0,\\s*1fr\\)\\)`));
      expect(layout).toMatch(new RegExp(`grid-template-rows:\\s*repeat\\(${rows},\\s*minmax\\(0,\\s*1fr\\)\\)`));
    });
  }
});

// ── 3. 印刷に紛れ込む画面要素が非表示 (2P目空白の誘発要素を排除) ───────────

describe('印刷時に紛れ込む要素の非表示', () => {
  it('printCss.js: .saved-warn-restore と #savedEmpty を display:none', () => {
    const { layout } = buildPrintCss({ orientation: 'portrait', cols: 2, rows: 2 });
    expect(layout).toMatch(/\.saved-warn-restore\s*\{[^}]*display:\s*none/);
    expect(layout).toMatch(/#savedEmpty\s*\{[^}]*display:\s*none/);
  });
  it('main.css @media print: #panelSaved block 表示', () => {
    expect(CSS).toMatch(/#panelSaved[^}]*display:\s*block\s*!important/);
  });
});
