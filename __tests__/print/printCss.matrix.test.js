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
      // モバイル CSS は orientation 両方を出すので、両ブロック必須テストはこちらで検証する
      const mobileOut = buildPrintCss({ orientation, cols, rows, isMobile: true });
      const pgBlock    = extractPageGroupBlock(layout);  // .print-page-group (block)
      const innerBlock = extractPageInnerBlock(layout);  // .print-page-inner (grid)

      // ── @page ──────────────────────────────────────────────────────
      it(`[${label}] @page size が orientation に対応した mm 寸法`, () => {
        const expected = orientation === 'landscape' ? '297mm 210mm' : '210mm 297mm';
        expect(orient).toContain(expected);
      });

      // ── グリッド構造 (.print-page-inner) — minmax(0, 1fr) ──────────
      // 過去 `1fr` だけだと Safari で子要素 min-content に押されて
      // 行が広がり 2P 目空白になる事故があった。minmax(0, 1fr) で固定。
      it(`[${label}] .print-page-inner: grid-template-columns = repeat(${cols}, minmax(0, 1fr))`, () => {
        expect(innerBlock).toMatch(
          new RegExp(`grid-template-columns:\\s*repeat\\(${cols},\\s*minmax\\(0,\\s*1fr\\)\\)`)
        );
      });

      it(`[${label}] .print-page-inner: grid-template-rows = repeat(${rows}, minmax(0, 1fr)) で均等分割`, () => {
        expect(innerBlock).toMatch(
          new RegExp(`grid-template-rows:\\s*repeat\\(${rows},\\s*minmax\\(0,\\s*1fr\\)\\)`)
        );
      });

      it(`[${label}] .print-page-inner が height:100% (枠いっぱいに広がる)`, () => {
        expect(innerBlock).toMatch(/height:\s*100%/);
      });

      // ── orientation 別の mm 寸法 (iOS Safari vh 不定性対策) ──
      // 向きに依存する寸法は landscape/portrait 両方を出力し、実紙の向きに
      // 応じて適用される。base block の .print-page-group には height を
      // 出さない (置くと両 orientation block より早い順序で勝つ可能性)。
      it(`[${label}] .print-page-group の base block には height を持たせない`, () => {
        expect(pgBlock).not.toMatch(/height:\s*[0-9]/);
        expect(pgBlock).not.toMatch(/height:\s*100vh/);
      });

      // グループ高さは用紙より SAFETY_MM(22mm) 小さい (実機iOS物理余白の吸収)
      const groupMm = orientation === 'landscape' ? 188 : 275;
      it(`[${label}] PC: 単一 @media print に .print-page-group height = ${groupMm}mm (orientation 引数固定)`, () => {
        expect(layout).toMatch(
          new RegExp(`\\.print-page-group\\s*\\{[^}]*height:\\s*${groupMm}mm`)
        );
      });

      it(`[${label}] mobile: @media print and (orientation: landscape) で height = 188mm`, () => {
        expect(mobileOut.layout).toMatch(
          /@media print and \(orientation:\s*landscape\)[\s\S]*?\.print-page-group\s*\{[^}]*height:\s*188mm/
        );
      });

      it(`[${label}] mobile: @media print and (orientation: portrait) で height = 275mm`, () => {
        expect(mobileOut.layout).toMatch(
          /@media print and \(orientation:\s*portrait\)[\s\S]*?\.print-page-group\s*\{[^}]*height:\s*275mm/
        );
      });

      it(`[${label}] mobile: 両方の (orientation: ...) block が出力される (OS シートで切替するため)`, () => {
        expect(mobileOut.layout).toMatch(/@media print and \(orientation:\s*landscape\)/);
        expect(mobileOut.layout).toMatch(/@media print and \(orientation:\s*portrait\)/);
      });

      it(`[${label}] PC: 反対 orientation の mm 値が混入しない (viewport-vs-@page 食い違い防止)`, () => {
        const oppositeMm = orientation === 'landscape' ? 275 : 188;
        expect(layout).not.toMatch(new RegExp(`height:\\s*${oppositeMm}mm`));
      });

      // ── 改ページ (隣接兄弟 page-break-before — Safari 空白ページバグ回避) ──
      it(`[${label}] 隣接兄弟 .print-page-group+.print-page-group に page-break-before:always`, () => {
        expect(layout).toMatch(/\.print-page-group\s*\+\s*\.print-page-group\s*\{[^}]*page-break-before:\s*always/);
      });

      it(`[${label}] .print-page-group 単体に page-break-after を使わない`, () => {
        expect(pgBlock).not.toMatch(/page-break-after/);
      });

      it(`[${label}] .print-page-group に padding + box-sizing:border-box (用紙端余白を vh 内で確保)`, () => {
        expect(pgBlock).toMatch(/padding:\s*[\d.]+mm/);
        expect(pgBlock).toMatch(/box-sizing:\s*border-box/);
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

      // ── 指板はみ出し防止: svg.fb に max-height mm (orientation 別) ──────
      it(`[${label}] svg.fb base block は height:auto + display:block (max-height は orientation block 側)`, () => {
        const svgBlock = layout.match(/svg\.fb\s*\{([^}]+)\}/)?.[1] ?? '';
        expect(svgBlock).toMatch(/height:\s*auto/);
        expect(svgBlock).toMatch(/display:\s*block/);
        // base block には max-height vh を残してはいけない (orientation 不定)
        expect(svgBlock).not.toMatch(/max-height:\s*[\d.]+vh/);
      });

      it(`[${label}] PC: svg.fb に max-height mm が生成 (単一ブロック)`, () => {
        expect(layout).toMatch(/svg\.fb\s*\{[^}]*max-height:\s*[\d.]+mm/);
      });

      it(`[${label}] mobile: landscape / portrait どちらの media query にも svg.fb max-height mm`, () => {
        expect(mobileOut.layout).toMatch(
          /@media print and \(orientation:\s*landscape\)[\s\S]*?svg\.fb\s*\{[^}]*max-height:\s*[\d.]+mm/
        );
        expect(mobileOut.layout).toMatch(
          /@media print and \(orientation:\s*portrait\)[\s\S]*?svg\.fb\s*\{[^}]*max-height:\s*[\d.]+mm/
        );
      });

      // ── フォントサイズ clamp ─────────────
      it(`[${label}] titlePt が clamp 範囲 [5.5, 10] 内`, () => {
        const ms = [...layout.matchAll(/\.fb-title[^{]*\{[^}]*font-size:\s*([\d.]+)pt/g)];
        expect(ms.length).toBeGreaterThanOrEqual(1);
        for (const m of ms) {
          const pt = parseFloat(m[1]);
          expect(pt).toBeGreaterThanOrEqual(5.5);
          expect(pt).toBeLessThanOrEqual(10);
        }
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

// ── 最下行はみ出し再発防止: グループ高さの安全マージン不変条件 ──────────────
// pull 実装で calc(pageHmm - 1px) (= 用紙ほぼ同寸) だったため、プリンタ物理余白や
// サブピクセル丸めで最下行カードが用紙下端を数mm超えて切れていた。
// グループ高さを用紙より十分 (>= 5mm) 小さくすることで、はみ出しと
// 次ページ溢れ(空白ページ)の両方を防ぐ。値リテラル(204/291)のマッチだけだと
// 「なぜその値か」が守られないため、用紙との差を不変条件として検証する。
describe('印刷グループ高さ — 用紙との安全マージン (最下行はみ出し再発防止)', () => {
  const SAFE_MIN_MM = 18;     // 用紙との最小マージン
  const padV = 8, gapMm = 3; // printCss.js と一致させる
  for (const [cols, rows] of LAYOUT_PRESETS) {
    for (const orientation of ORIENTATIONS) {
      const pageH = orientation === 'landscape' ? 210 : 297;

      it(`${orientation} ${cols}×${rows}: グループ高さ(mm)が用紙より ${SAFE_MIN_MM}mm 以上小さい`, () => {
        // PC は単一 @media print ブロックの .print-page-group height(mm)
        const { layout } = buildPrintCss({ orientation, cols, rows });
        const m = layout.match(/\.print-page-group\s*\{[^}]*height:\s*([\d.]+)mm/);
        expect(m).not.toBeNull();
        const groupH = parseFloat(m[1]);
        expect(groupH).toBeLessThan(pageH);
        expect(pageH - groupH).toBeGreaterThanOrEqual(SAFE_MIN_MM);
      });

      it(`${orientation} ${cols}×${rows}: グループ内の中身(行×cellH + gap + padding)がグループ高さに収まる`, () => {
        const { layout } = buildPrintCss({ orientation, cols, rows });
        const m = layout.match(/\.print-page-group\s*\{[^}]*height:\s*([\d.]+)mm/);
        const groupH = parseFloat(m[1]);
        // cellHmm = (groupH - 2*padV - gap*(rows-1)) / rows なので、
        // 逆算した中身合計はグループ高さ以下でなければならない (= はみ出さない)
        const cellH = (groupH - 2 * padV - gapMm * (rows - 1)) / rows;
        expect(cellH).toBeGreaterThan(0);
        const content = cellH * rows + gapMm * (rows - 1) + 2 * padV;
        expect(content).toBeLessThanOrEqual(groupH + 0.01); // 丸め許容
      });
    }
  }
});

// vh は二度と使わない (iOS Safari の vh 不定性で2P目空白が再発するため)
describe('印刷CSS — vh 不使用の不変条件 (iOS 2P空白 再発防止)', () => {
  for (const [cols, rows] of LAYOUT_PRESETS) {
    for (const orientation of ORIENTATIONS) {
      it(`${orientation} ${cols}×${rows}: 生成CSSに 100vh / max-height vh が一切ない`, () => {
        const pc = buildPrintCss({ orientation, cols, rows }).layout;
        const mo = buildPrintCss({ orientation, cols, rows, isMobile: true }).layout;
        for (const css of [pc, mo]) {
          expect(css).not.toMatch(/height:\s*100vh/);
          expect(css).not.toMatch(/max-height:\s*[\d.]+vh/);
        }
      });
    }
  }
});
