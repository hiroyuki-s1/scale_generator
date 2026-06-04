/**
 * buildPrintCss — 全 layout × orientation 行列テスト (100vh 方式)
 *
 * LAYOUT_PRESETS (9種) × orientation (2種) = 18 パターンを網羅。
 * 印刷の核心は `.print-page-group { height: 100vh }` で印刷ページに追従する方式
 * (dedecc4 復元。mm 固定は iOS 物理余白補正が機種差に追いつかず縦印刷で2P空白再発)。
 *
 * 検証項目:
 *   1. @page size が orientation に応じた mm 寸法 + margin 10mm 12mm
 *   2. .print-page-group が height:100vh + overflow:hidden + break-inside:avoid
 *   3. .print-page-group に mm 固定 height が無い (100vh のみ)
 *   4. 改ページは隣接兄弟 page-break-before のみ (page-break-after 不使用)
 *   5. .print-page-inner が grid minmax(0,1fr) cols×rows + height:100%
 *   6. svg.fb に max-height vh (マスク縦長対策)
 *   7. titlePt が clamp [5.5,10] 内
 *   8. #savedGrid は display:block / display:none でカードを隠さない
 */
import { describe, it, expect } from 'vitest';
import { buildPrintCss } from '../../src/print/printCss.js';
import { LAYOUT_PRESETS } from '../../src/domain/constants.js';

const ORIENTATIONS = ['landscape', 'portrait'];

function pgBlockOf(css) {
  return css.match(/\.print-page-group\s*\{([^}]+)\}/)?.[1] ?? '';
}
function innerBlockOf(css) {
  return css.match(/\.print-page-inner\s*\{([^}]+)\}/)?.[1] ?? '';
}

describe('buildPrintCss — 全 layout×orientation 行列 (18パターン, 100vh方式)', () => {
  for (const [cols, rows] of LAYOUT_PRESETS) {
    for (const orientation of ORIENTATIONS) {
      const label = `${orientation} ${cols}×${rows}`;
      const { orient, layout } = buildPrintCss({ orientation, cols, rows });
      const pgBlock = pgBlockOf(layout);
      const innerBlock = innerBlockOf(layout);

      // ── @page ──────────────────────────────────────────────────────
      it(`[${label}] PC は @page size が orientation に対応した mm 寸法`, () => {
        const expected = orientation === 'landscape' ? '297mm 210mm' : '210mm 297mm';
        expect(orient).toContain(expected);
      });

      it(`[${label}] モバイルは @page size: auto (OS 印刷シートの用紙向きに追従)`, () => {
        const { orient: mob } = buildPrintCss({ orientation, cols, rows, isMobile: true });
        expect(mob).toContain('size: auto');
        expect(mob).not.toMatch(/size:\s*\d+mm\s+\d+mm/);
      });

      it(`[${label}] @page margin: 10mm 12mm (margin:0 は iOS で用紙端まで描画し2P空白)`, () => {
        expect(orient).toMatch(/margin:\s*10mm\s+12mm/);
      });

      // ── ページ枠 height:100vh ──────────────────────────────────────
      it(`[${label}] .print-page-group が height:100vh (印刷ページに追従)`, () => {
        expect(pgBlock).toMatch(/height:\s*100vh/);
      });

      it(`[${label}] .print-page-group に mm 固定 height が無い (100vh のみ)`, () => {
        expect(pgBlock).not.toMatch(/height:\s*[\d.]+mm/);
      });

      it(`[${label}] .print-page-group が overflow:hidden + break-inside:avoid + block`, () => {
        expect(pgBlock).toMatch(/display:\s*block/);
        expect(pgBlock).toMatch(/overflow:\s*hidden/);
        expect(pgBlock).toMatch(/break-inside:\s*avoid/);
        expect(pgBlock).not.toMatch(/display:\s*grid/);
      });

      // ── 改ページ ────────────────────────────────────────────────────
      it(`[${label}] 隣接兄弟 .print-page-group+.print-page-group に page-break-before:always`, () => {
        expect(layout).toMatch(/\.print-page-group\s*\+\s*\.print-page-group\s*\{[^}]*page-break-before:\s*always/);
      });

      it(`[${label}] .print-page-group 単体に page-break-after を使わない (Safari 余分空白回避)`, () => {
        expect(pgBlock).not.toMatch(/page-break-after/);
      });

      // ── グリッド minmax(0,1fr) ──────────────────────────────────────
      it(`[${label}] .print-page-inner: grid-template-columns = repeat(${cols}, minmax(0, 1fr))`, () => {
        expect(innerBlock).toMatch(new RegExp(`grid-template-columns:\\s*repeat\\(${cols},\\s*minmax\\(0,\\s*1fr\\)\\)`));
      });

      it(`[${label}] .print-page-inner: grid-template-rows = repeat(${rows}, minmax(0, 1fr))`, () => {
        expect(innerBlock).toMatch(new RegExp(`grid-template-rows:\\s*repeat\\(${rows},\\s*minmax\\(0,\\s*1fr\\)\\)`));
      });

      it(`[${label}] .print-page-inner が height:100%`, () => {
        expect(innerBlock).toMatch(/height:\s*100%/);
      });

      // ── 指板 SVG (マスク縦長対策) ───────────────────────────────────
      it(`[${label}] svg.fb に max-height vh (マスク縦長を1セルに収める)`, () => {
        expect(layout).toMatch(/svg\.fb\s*\{[^}]*max-height:\s*[\d.]+vh/);
      });

      it(`[${label}] svg.fb は height:auto + width:100% + display:block`, () => {
        const svgBlock = layout.match(/svg\.fb\s*\{([^}]+)\}/)?.[1] ?? '';
        expect(svgBlock).toMatch(/height:\s*auto/);
        expect(svgBlock).toMatch(/width:\s*100%/);
        expect(svgBlock).toMatch(/display:\s*block/);
      });

      // ── フォントサイズ clamp ────────────────────────────────────────
      it(`[${label}] titlePt が clamp 範囲 [5.5, 10] 内`, () => {
        const m = layout.match(/\.fb-title[^{]*\{[^}]*font-size:\s*([\d.]+)pt/);
        expect(m).not.toBeNull();
        const pt = parseFloat(m[1]);
        expect(pt).toBeGreaterThanOrEqual(5.5);
        expect(pt).toBeLessThanOrEqual(10);
      });

      // ── 構造的整合性 ────────────────────────────────────────────────
      it(`[${label}] #savedGrid は display:block (ラッパー)`, () => {
        expect(layout).toMatch(/#savedGrid\s*\{[^}]*display:\s*block/);
      });

      it(`[${label}] カードを display:none で隠す記述がない`, () => {
        expect(layout).not.toMatch(/nth-child[^{]*\{[^}]*display:\s*none/);
      });
    }
  }
});

// ── vh 不使用への退行を防ぐのではなく、100vh の維持を守る ─────────────────
describe('印刷 height は 100vh で orientation 非依存 (iOS ページ追従)', () => {
  for (const [cols, rows] of LAYOUT_PRESETS) {
    it(`${cols}×${rows}: landscape も portrait も同じ height:100vh (mm固定にしない)`, () => {
      for (const o of ORIENTATIONS) {
        const pg = pgBlockOf(buildPrintCss({ orientation: o, cols, rows }).layout);
        expect(pg).toMatch(/height:\s*100vh/);
        expect(pg).not.toMatch(/height:\s*[\d.]+mm/);
      }
    });
  }
});
