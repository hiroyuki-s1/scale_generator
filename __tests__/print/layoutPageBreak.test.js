/**
 * 印刷レイアウトの再発防止テスト。
 *
 * 過去のバグ:
 *   1. cols×rows 枚目以降を display:none で隠していた (誤り)
 *   2. CSS Grid の nth-child に break-after:page を付けたが PC のみ動作、モバイル2P目が空
 *   3. .print-page-group への break-after:page は iOS Safari で動作しない
 *      → 正しくは JS がグループ間に .print-page-break (block div) を挿入し、
 *        page-break-before:always で改ページする。
 *
 * このテストが守るもの:
 *   1. buildPrintCss が display:none でカードを隠さないこと
 *   2. #savedGrid は block コンテナ (grid-template-columns なし)
 *   3. .print-page-group にグリッドレイアウトが生成される
 *   4. .print-page-break に page-break-before:always が生成される
 *   5. .print-page-group に break-after:page が含まれないこと (iOS Safari 非対応のため使わない)
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

    it(`${label}: .print-page-group に正しい列数の grid が生成される`, () => {
      const { layout: css } = buildPrintCss(layout);
      const re = new RegExp(`\\.print-page-group[^{]*\\{[\\s\\S]*?grid-template-columns:\\s*repeat\\(${layout.cols},`);
      expect(css).toMatch(re);
    });

    it(`${label}: .print-page-break に page-break-before:always が生成される (モバイル対応)`, () => {
      const { layout: css } = buildPrintCss(layout);
      expect(css).toMatch(/\.print-page-break[^{]*\{[\s\S]*?page-break-before:\s*always/);
    });

    it(`${label}: .print-page-group に break-after:page が含まれない (iOS Safari非対応のため)`, () => {
      const { layout: css } = buildPrintCss(layout);
      const pgBlock = css.match(/\.print-page-group\s*\{([^}]+)\}/)?.[1] ?? '';
      expect(pgBlock).not.toMatch(/break-after/);
    });
  }
});
