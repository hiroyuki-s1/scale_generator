/**
 * 印刷レイアウト再発防止テスト。
 *
 * 改ページ戦略の変遷 (なぜ今の実装なのかの記録):
 *   × display:none で余分カードを非表示          → 超過分が印刷されない
 *   × CSS Grid の break-after:page              → iOS Safari で2P目が空白
 *   × 空の .print-page-break + page-break-before → break要素が1P消費して空白
 *   × .print-page-group に page-break-after:always → Safari は最終ページの後に
 *     余分な空白ページを作る既知バグ (これが「2P目空白」の主因)
 *   ○ .print-page-group + .print-page-group に page-break-before:always
 *     (隣接兄弟セレクタ = 2番目以降のグループの「前」で改ページ)
 *     + 固定 height + overflow:hidden + break-inside:avoid で各ページに収める
 *
 * このテストが守るもの:
 *   1. display:none でカードを隠す記述がない
 *   2. #savedGrid は block コンテナ
 *   3. .print-page-group は block (gridではない) + 固定 height + overflow:hidden
 *   4. 改ページは隣接兄弟 .print-page-group + .print-page-group の page-break-before
 *   5. .print-page-group に page-break-after を使わない (Safari 空白ページバグ回避)
 *   6. .print-page-inner に正しいグリッドが生成される
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

    it(`${label}: .print-page-group は display:block + overflow:hidden (CSS Grid でない)`, () => {
      const { layout: css } = buildPrintCss(layout);
      const pgBlock = css.match(/\.print-page-group\s*\{([^}]+)\}/)?.[1] ?? '';
      expect(pgBlock).toMatch(/display:\s*block/);
      expect(pgBlock).not.toMatch(/display:\s*grid/);
      expect(pgBlock).toMatch(/overflow:\s*hidden/);
    });

    it(`${label}: 改ページは隣接兄弟 page-break-before で行う`, () => {
      const { layout: css } = buildPrintCss(layout);
      expect(css).toMatch(/\.print-page-group\s*\+\s*\.print-page-group\s*\{[^}]*page-break-before:\s*always/);
    });

    it(`${label}: .print-page-group に page-break-after を使わない (Safari 空白ページバグ回避)`, () => {
      const { layout: css } = buildPrintCss(layout);
      // .print-page-group { ... } 単体ブロックに page-break-after が無いこと
      const pgBlock = css.match(/\.print-page-group\s*\{([^}]+)\}/)?.[1] ?? '';
      expect(pgBlock).not.toMatch(/page-break-after/);
    });

    it(`${label}: .print-page-inner に正しい列数のグリッドが生成される`, () => {
      const { layout: css } = buildPrintCss(layout);
      const re = new RegExp(`\\.print-page-inner[^{]*\\{[\\s\\S]*?grid-template-columns:\\s*repeat\\(${layout.cols},`);
      expect(css).toMatch(re);
    });
  }
});
