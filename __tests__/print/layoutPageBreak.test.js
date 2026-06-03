/**
 * 印刷レイアウトの再発防止テスト。
 *
 * 過去のバグ:
 *   1. cols×rows 枚目以降を display:none で隠していた (誤り)
 *   2. CSS Grid の nth-child に break-after:page を付けたが2P目が空になった
 *      → CSS Grid はブラウザの印刷分割が不安定。
 *      → 正しくは JS が cols×rows 枚ずつ .print-page-group div にまとめ、
 *        div 間で改ページする。
 *
 * このテストが守るもの:
 *   1. buildPrintCss が display:none でカードを隠さないこと
 *   2. #savedGrid 自体は block コンテナになること (grid ではない)
 *   3. .print-page-group に grid-template-columns / break-after:page が生成されること
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
      // #savedGrid ブロック内に grid-template-columns が入っていないことを確認
      const gridBlock = css.match(/#savedGrid\s*\{([^}]*)\}/)?.[1] ?? '';
      expect(gridBlock).not.toMatch(/grid-template-columns/);
    });

    it(`${label}: .print-page-group に正しい列数の grid が生成される`, () => {
      const { layout: css } = buildPrintCss(layout);
      const re = new RegExp(`\\.print-page-group[^{]*\\{[\\s\\S]*?grid-template-columns:\\s*repeat\\(${layout.cols},`);
      expect(css).toMatch(re);
    });

    it(`${label}: .print-page-group に break-after:page が生成される`, () => {
      const { layout: css } = buildPrintCss(layout);
      expect(css).toMatch(/\.print-page-group[^{]*\{[\s\S]*?break-after:\s*page/);
    });
  }
});
