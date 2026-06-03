/**
 * 印刷レイアウトの再発防止テスト。
 *
 * 過去のバグ:
 *   - cols×rows 枚目以降を display:none で隠していた (誤り)
 *     → 正しくは cols×rows 枚ごとに改ページ (break-after:page) すること
 *
 * このテストが守るもの:
 *   1. buildPrintCss が display:none でカードを隠さないこと
 *   2. nth-child(N) に break-after:page が生成されること
 *   3. grid-auto-rows が生成されること (行の高さを固定してページに収める)
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
    const cardsPerPage = layout.cols * layout.rows;

    it(`${label}: カードを display:none で隠さない`, () => {
      const { layout: css } = buildPrintCss(layout);
      expect(css).not.toMatch(/display:\s*none.*saved-card|saved-card.*display:\s*none/);
      expect(css).not.toMatch(/nth-child\(n\s*\+\s*\d+\)\s*\{[^}]*display:\s*none/);
    });

    it(`${label}: ${cardsPerPage}枚目ごとに break-after:page が入る`, () => {
      const { layout: css } = buildPrintCss(layout);
      const re = new RegExp(`nth-child\\(${cardsPerPage}n\\)[^{]*\\{[^}]*break-after:\\s*page`);
      expect(css).toMatch(re);
    });

    it(`${label}: grid-auto-rows で行の高さを固定する`, () => {
      const { layout: css } = buildPrintCss(layout);
      expect(css).toMatch(/grid-auto-rows:\s*[\d.]+mm/);
    });
  }
});
