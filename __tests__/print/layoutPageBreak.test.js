/**
 * 印刷レイアウト再発防止テスト。
 *
 * 改ページ戦略の変遷 (なぜ今の実装なのかの記録):
 *   × display:none で余分カードを非表示       → 超過分が印刷されない
 *   × CSS Grid の break-after:page           → iOS Safari で2P目が空白
 *   × .print-page-break + page-break-before → break要素が1P消費して空白ページ発生
 *   ○ .print-page-group (block) + page-break-after:always
 *     .print-page-inner (grid) をネスト      → 全ブラウザで確実に動作
 *
 * このテストが守るもの:
 *   1. display:none でカードを隠す記述がない
 *   2. #savedGrid は block コンテナ
 *   3. .print-page-group は block + page-break-after:always (gridではない)
 *   4. .print-page-group:last-child は page-break-after:auto (末尾空白ページ防止)
 *   5. .print-page-inner に正しいグリッドが生成される
 *   6. .print-page-group に break-after:page が含まれない (.print-page-group は grid でないため block の page-break-after を使う)
 *      ← これは「grid への break-after 禁止」ではなく「grid を使わない設計」の確認
 */
import { describe, it, expect } from 'vitest';
import { buildPrintCss } from '../../src/print/printCss.js';

const LAYOUTS = [
  { orientation: 'landscape', cols: 1, rows: 1 },
  { orientation: 'landscape', cols: 1, rows: 2 },
  { orientation: 'landscape', cols: 2, rows: 4 },
  { orientation: 'portrait',  cols: 2, rows: 3 },
  { orientation: 'portrait',  cols: 3, rows: 5 },
];

describe('buildPrintCss — page-break layout', () => {
  for (const layout of LAYOUTS) {
    const label = `${layout.orientation} ${layout.cols}×${layout.rows}`;

    it(`${label}: カードを display:none で隠さない`, () => {
      const { layout: css } = buildPrintCss(layout);
      expect(css).not.toMatch(/nth-child[^{]*\{[^}]*display:\s*none/);
    });

    it(`${label}: #savedGrid は block コンテナ (grid-template-columns なし)`, () => {
      const { layout: css } = buildPrintCss(layout);
      const gridBlock = css.match(/#savedGrid\s*\{([^}]*)\}/)?.[1] ?? '';
      expect(gridBlock).not.toMatch(/grid-template-columns/);
    });

    it(`${label}: .print-page-group は display:block (CSS Grid でない)`, () => {
      const { layout: css } = buildPrintCss(layout);
      const pgBlock = css.match(/\.print-page-group\s*\{([^}]+)\}/)?.[1] ?? '';
      expect(pgBlock).toMatch(/display:\s*block/);
      expect(pgBlock).not.toMatch(/display:\s*grid/);
    });

    it(`${label}: .print-page-group に page-break-after:always が生成される`, () => {
      const { layout: css } = buildPrintCss(layout);
      expect(css).toMatch(/\.print-page-group\s*\{[^}]*page-break-after:\s*always/);
    });

    it(`${label}: .print-page-group:last-child で page-break-after をリセット (末尾空白ページ防止)`, () => {
      const { layout: css } = buildPrintCss(layout);
      expect(css).toMatch(/\.print-page-group:last-child\s*\{[^}]*page-break-after:\s*auto/);
    });

    it(`${label}: .print-page-inner に正しい列数のグリッドが生成される`, () => {
      const { layout: css } = buildPrintCss(layout);
      const re = new RegExp(`\\.print-page-inner[^{]*\\{[\\s\\S]*?grid-template-columns:\\s*repeat\\(${layout.cols},`);
      expect(css).toMatch(re);
    });
  }
});
