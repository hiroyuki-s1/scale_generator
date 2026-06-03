/**
 * buildPrintCss — 全 layout × orientation 行列テスト
 *
 * LAYOUT_PRESETS (9種) × orientation (2種) = 18 パターンすべてを網羅し、
 * 生成される CSS の構造・数値が正しいことを保証する。
 *
 * 検証項目:
 *   1. @page size が orientation に応じた mm 寸法になる
 *   2. .print-page-group に正しい grid-template-columns が生成される
 *   3. .print-page-group に正しい grid-template-rows (cellH) が生成される
 *   4. cellH が 0 より大きい正の値であること
 *   5. break-after:page と page-break-after:always が両方存在すること
 *   6. titlePt / legPt が clamp 範囲内 [5.5–10] / [5–8] に収まること
 *   7. #savedGrid は display:block (グリッドではなくラッパー)
 *   8. display:none でカードを隠す記述が存在しないこと (過去バグの再発防止)
 */
import { describe, it, expect } from 'vitest';
import { buildPrintCss } from '../../src/print/printCss.js';
import { LAYOUT_PRESETS } from '../../src/domain/constants.js';

const ORIENTATIONS = ['landscape', 'portrait'];

// A4 印刷可能エリア高さ (mm): margin 10mm×2 除いた値
const PAGE_H = { landscape: 190, portrait: 277 };
const GAP_MM = 3;

// .saved-card の height mm 値を CSS から抽出するヘルパー
// (iOS Safari 空白ページバグ対策で grid-template-rows から .saved-card height に変更)
function extractCellHmm(css) {
  const m = css.match(/\.saved-card\s*\{[^}]*height:\s*([\d.]+)mm/);
  return m ? parseFloat(m[1]) : null;
}

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

      it(`[${label}] .saved-card に cellH mm の height が生成される (iOS Safari対応)`, () => {
        // grid-template-rows ではなく .saved-card height でカード高さを制御する
        expect(layout).toMatch(/\.saved-card\s*\{[^}]*height:\s*[\d.]+mm/);
      });

      // ── cellH 計算の正確性 ──────────────────────────────────────────
      it(`[${label}] cellH が正の値かつ期待値と一致する`, () => {
        const cellHmm = extractCellHmm(layout);
        const expected = (PAGE_H[orientation] - GAP_MM * (rows - 1)) / rows;
        expect(cellHmm).not.toBeNull();
        expect(cellHmm).toBeGreaterThan(0);
        expect(cellHmm).toBeCloseTo(expected, 1);
      });

      // ── 改ページ (.print-page-group block + page-break-after:always) ──────
      it(`[${label}] .print-page-group に page-break-after:always が存在する`, () => {
        expect(pgBlock).toMatch(/page-break-after:\s*always/);
      });

      it(`[${label}] .print-page-group は display:block (grid でない)`, () => {
        expect(pgBlock).toMatch(/display:\s*block/);
        expect(pgBlock).not.toMatch(/display:\s*grid/);
      });

      it(`[${label}] .print-page-group:last-child が page-break-after:auto (末尾空白ページ防止)`, () => {
        expect(layout).toMatch(/\.print-page-group:last-child[^{]*\{[^}]*page-break-after:\s*auto/);
      });

      it(`[${label}] .print-page-inner に grid-template-columns が存在する`, () => {
        expect(layout).toMatch(
          new RegExp(`\\.print-page-inner[^{]*\\{[\\s\\S]*?grid-template-columns:\\s*repeat\\(${cols},`)
        );
      });

      // ── フォントサイズ clamp ─────────────────────────────────────────
      it(`[${label}] titlePt が clamp 範囲 [5.5, 10] 内`, () => {
        const m = layout.match(/\.fb-title[^{]*\{[^}]*font-size:\s*([\d.]+)pt/);
        expect(m).not.toBeNull();
        const pt = parseFloat(m[1]);
        expect(pt).toBeGreaterThanOrEqual(5.5);
        expect(pt).toBeLessThanOrEqual(10);
      });

      it(`[${label}] legPt が clamp 範囲 [5, 8] 内`, () => {
        const m = layout.match(/\.legend-chip[^{]*\{[^}]*font-size:\s*([\d.]+)pt/);
        expect(m).not.toBeNull();
        const pt = parseFloat(m[1]);
        expect(pt).toBeGreaterThanOrEqual(5);
        expect(pt).toBeLessThanOrEqual(8);
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
