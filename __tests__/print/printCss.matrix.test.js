/**
 * buildPrintCss — 全 layout × orientation 行列テスト
 *
 * LAYOUT_PRESETS (9種) × orientation (2種) = 18 パターンすべてを網羅し、
 * 生成される CSS の構造・数値が正しいことを保証する。
 *
 * 検証項目:
 *   1. @page size が orientation に応じた mm 寸法になる
 *   2. .print-page-inner に grid-template-columns / rows: repeat(n, 1fr) が生成される
 *   3. .print-page-group が height:100vh (1ページ枠) + overflow:hidden
 *   4. 改ページは隣接兄弟 page-break-before のみ (page-break-after は不使用)
 *   5. titlePt が clamp 範囲内 [5.5–10] に収まること
 *   6. #savedGrid は display:block (グリッドではなくラッパー)
 *   7. display:none でカードを隠す記述が存在しないこと (過去バグの再発防止)
 */
import { describe, it, expect } from 'vitest';
import { buildPrintCss } from '../../src/print/printCss.js';
import { LAYOUT_PRESETS } from '../../src/domain/constants.js';

const ORIENTATIONS = ['landscape', 'portrait'];

// .print-page-group ブロックの中身を抽出 (block + page-break 用)
function extractPageGroupBlock(css) {
  const m = css.match(/\.print-page-group\s*\{([^}]+)\}/);
  return m ? m[1] : '';
}

// .print-page-inner ブロックの中身を抽出 (grid レイアウト用)
function extractPageInnerBlock(css) {
  const m = css.match(/\.print-page-inner\s*\{([^}]+)\}/);
  return m ? m[1] : '';
}

describe('buildPrintCss — 全 layout×orientation 行列 (18パターン)', () => {
  for (const [cols, rows] of LAYOUT_PRESETS) {
    for (const orientation of ORIENTATIONS) {
      const label = `${orientation} ${cols}×${rows}`;
      const { orient, layout } = buildPrintCss({ orientation, cols, rows });
      const pgBlock    = extractPageGroupBlock(layout);  // .print-page-group (block)
      const innerBlock = extractPageInnerBlock(layout);  // .print-page-inner (grid)

      // ── @page ──────────────────────────────────────────────────────
      it(`[${label}] @page size が orientation に対応した mm 寸法`, () => {
        const expected = orientation === 'landscape' ? '297mm 210mm' : '210mm 297mm';
        expect(orient).toContain(expected);
      });

      // ── グリッド構造 (.print-page-inner) ──────────────────────────
      it(`[${label}] .print-page-inner: grid-template-columns = repeat(${cols}, 1fr)`, () => {
        expect(innerBlock).toMatch(
          new RegExp(`grid-template-columns:\\s*repeat\\(${cols},\\s*1fr\\)`)
        );
      });

      it(`[${label}] .print-page-inner: grid-template-rows = repeat(${rows}, 1fr) で均等分割`, () => {
        expect(innerBlock).toMatch(
          new RegExp(`grid-template-rows:\\s*repeat\\(${rows},\\s*1fr\\)`)
        );
      });

      // ── 空白ページ防止: ページ枠は 100vh (iOS Safari 余白に追従) ────────
      it(`[${label}] .print-page-group が height:100vh (1ページ枠)`, () => {
        expect(pgBlock).toMatch(/height:\s*100vh/);
      });

      it(`[${label}] .print-page-inner が height:100% (枠いっぱいに広がる)`, () => {
        expect(innerBlock).toMatch(/height:\s*100%/);
      });

      // ── 改ページ (隣接兄弟 page-break-before — Safari 空白ページバグ回避) ──
      it(`[${label}] 隣接兄弟 .print-page-group+.print-page-group に page-break-before:always`, () => {
        expect(layout).toMatch(/\.print-page-group\s*\+\s*\.print-page-group\s*\{[^}]*page-break-before:\s*always/);
      });

      it(`[${label}] .print-page-group 単体に page-break-after を使わない`, () => {
        expect(pgBlock).not.toMatch(/page-break-after/);
      });

      it(`[${label}] .print-page-group は display:block + overflow:hidden (grid でない)`, () => {
        expect(pgBlock).toMatch(/display:\s*block/);
        expect(pgBlock).not.toMatch(/display:\s*grid/);
        expect(pgBlock).toMatch(/overflow:\s*hidden/);
      });

      it(`[${label}] .print-page-inner に grid-template-columns が存在する`, () => {
        expect(layout).toMatch(
          new RegExp(`\\.print-page-inner[^{]*\\{[\\s\\S]*?grid-template-columns:\\s*repeat\\(${cols},`)
        );
      });

      // ── 指板はみ出し防止: svg.fb に max-height vh (マスク縦長対策) ──────
      it(`[${label}] svg.fb に max-height:(88/rows)vh が生成される (縦長指板はみ出し防止)`, () => {
        const expected = (88 / rows).toFixed(2);
        expect(layout).toMatch(
          new RegExp(`svg\\.fb\\s*\\{[^}]*max-height:\\s*${expected.replace('.', '\\.')}vh`)
        );
      });

      it(`[${label}] svg.fb は height:auto + display:block (1.0.0 で動作した形)`, () => {
        const svgBlock = layout.match(/svg\.fb\s*\{([^}]+)\}/)?.[1] ?? '';
        expect(svgBlock).toMatch(/height:\s*auto/);
        expect(svgBlock).toMatch(/display:\s*block/);
      });

      // ── フォントサイズ clamp ─────────────────────────────────────────
      it(`[${label}] titlePt が clamp 範囲 [5.5, 10] 内`, () => {
        const m = layout.match(/\.fb-title[^{]*\{[^}]*font-size:\s*([\d.]+)pt/);
        expect(m).not.toBeNull();
        const pt = parseFloat(m[1]);
        expect(pt).toBeGreaterThanOrEqual(5.5);
        expect(pt).toBeLessThanOrEqual(10);
      });

      // ── 構造的整合性 ─────────────────────────────────────────────────
      it(`[${label}] #savedGrid は display:block (ラッパー)`, () => {
        expect(layout).toMatch(/#savedGrid\s*\{[^}]*display:\s*block/);
      });

      it(`[${label}] カードを display:none で隠す記述がない (過去バグ再発防止)`, () => {
        expect(layout).not.toMatch(/nth-child[^{]*\{[^}]*display:\s*none/);
      });
    }
  }
});
