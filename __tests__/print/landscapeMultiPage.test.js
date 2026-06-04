/**
 * iOS Safari 横レイアウト複数ページ印刷の回帰テスト。
 *
 * バグの履歴:
 *   - iOS Safari で「横」+ 2ページ以上の印刷時、2P目が空白になる事故が
 *     何度も再発した (v1.0.0 までの fix だけで 9 回以上の commit を要した)。
 *   - 直接の原因は CSS の `100vh` が iOS Safari の print mode で実紙ではなく
 *     ビューポート由来の値を返すこと。さらに grid `1fr` が `minmax(auto, 1fr)`
 *     として解決されて行が広がるバグも重なっていた。
 *
 * 本テストの目的:
 *   - 修正の重要構造 (orientation 別 mm 寸法 + minmax(0, 1fr)) を CSS レベルで
 *     固定し、将来の編集で「うっかり 100vh に戻す」事故を CI で落とす。
 *   - 横向きで複数ページにわたるレイアウト全パターン (LAYOUT_PRESETS × 全カード枚数)
 *     について、calcPageGroupSizes が期待通りのページ数を返すことを確認。
 *   - 印刷時に紛れ込みやすい要素 (.saved-warn-restore / #savedEmpty) が
 *     確実に非表示になることを CSS で保証。
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

// ── 1. 横レイアウト × 複数ページ: ページ数とグループ数が一致する ────────

describe('横レイアウト複数ページ: calcPageGroupSizes の整合性 (全パターン)', () => {
  // 各 LAYOUT_PRESETS について「1ページ目満杯 + 余り 1枚」「ちょうど2ページ」「3ページ」を網羅
  for (const [cols, rows] of LAYOUT_PRESETS) {
    const perPage = cols * rows;
    const totals = [
      perPage + 1,       // 1ページ + 1枚 → 2グループ (2ページ印刷)
      perPage * 2,       // ちょうど 2 ページ
      perPage * 2 + 1,   // 2 ページ + 1枚 → 3グループ (3ページ印刷)
      perPage * 3,       // ちょうど 3 ページ
    ];
    for (const total of totals) {
      it(`landscape [${cols}×${rows}] total=${total} → グループ数 = ceil(${total}/${perPage})`, () => {
        const sizes = calcPageGroupSizes(total, perPage);
        const expected = Math.ceil(total / perPage);
        expect(sizes.length).toBe(expected);
        // 合計枚数も一致
        const sum = sizes.reduce((a, b) => a + b, 0);
        expect(sum).toBe(total);
      });
    }
  }
});

// ── 2. 横向き CSS 出力: orientation 別の寸法ブロック内容を網羅検証 ─────

describe('横向き印刷用 CSS の構造', () => {
  for (const [cols, rows] of LAYOUT_PRESETS) {
    it(`[${cols}×${rows}] PC orientation=landscape: 単一 @media print に height 204mm + svg.fb max-height mm + title pt`, () => {
      const { layout } = buildPrintCss({ orientation: 'landscape', cols, rows });
      expect(layout).toMatch(/\.print-page-group\s*\{[^}]*height:\s*204mm/);
      expect(layout).toMatch(/svg\.fb\s*\{[^}]*max-height:\s*[\d.]+mm/);
      expect(layout).toMatch(/\.fb-title[^{]*\{[^}]*font-size:\s*[\d.]+pt/);
    });

    it(`[${cols}×${rows}] mobile: landscape orientation media query に height 204mm`, () => {
      const { layout } = buildPrintCss({ orientation: 'landscape', cols, rows, isMobile: true });
      const landBlock = layout.match(
        /@media print and \(orientation:\s*landscape\)\s*\{([\s\S]*?)\n\}/
      )?.[1] ?? '';
      expect(landBlock).toMatch(/\.print-page-group\s*\{[^}]*height:\s*204mm/);
      expect(landBlock).toMatch(/svg\.fb\s*\{[^}]*max-height:\s*[\d.]+mm/);
    });
  }

  it('PC: orientation=landscape 引数のときは portrait 用 orientation media query は出力されない', () => {
    const { layout } = buildPrintCss({ orientation: 'landscape', cols: 2, rows: 2 });
    expect(layout).not.toMatch(/@media print and \(orientation:\s*portrait\)/);
    expect(layout).not.toMatch(/@media print and \(orientation:\s*landscape\)/);
  });

  it('PC: orientation=portrait 引数では portrait 寸法のみ出力 (両方の混在は viewport-vs-@page 食い違いの原因)', () => {
    const { layout } = buildPrintCss({ orientation: 'portrait', cols: 2, rows: 2 });
    expect(layout).toMatch(/\.print-page-group\s*\{[^}]*height:\s*291mm/);
    expect(layout).not.toMatch(/204mm/);
  });

  it('mobile: 両方の orientation media query を出力 (OS 印刷シートで切替可能なため)', () => {
    const { layout } = buildPrintCss({ orientation: 'portrait', cols: 2, rows: 2, isMobile: true });
    expect(layout).toMatch(/@media print and \(orientation:\s*landscape\)/);
    expect(layout).toMatch(/@media print and \(orientation:\s*portrait\)/);
  });
});

// ── 3. 100vh の混入を絶対に許さない (v1.0.0 までの事故防止) ──────────────

describe('100vh の混入防止 (CI ガード)', () => {
  for (const [cols, rows] of LAYOUT_PRESETS) {
    for (const orientation of ['landscape', 'portrait']) {
      it(`[${orientation} ${cols}×${rows}] 動的 CSS に height:100vh / max-height:Xvh が含まれない`, () => {
        const { layout } = buildPrintCss({ orientation, cols, rows });
        expect(layout).not.toMatch(/\.print-page-group\s*\{[^}]*height:\s*100vh/);
        expect(layout).not.toMatch(/svg\.fb\s*\{[^}]*max-height:\s*[\d.]+vh/);
        // orientation block 内の svg.fb / .print-page-group も vh ではなく mm のはず
        expect(layout).not.toMatch(
          /@media print and \(orientation:[^)]*\)[\s\S]*?\.print-page-group\s*\{[^}]*height:\s*[\d.]+vh/
        );
      });
    }
  }

  it('main.css の @media print 内 .print-page-group にも 100vh が混入していない', () => {
    // static CSS の @media print ブロックを抽出
    const pgInMainCss = CSS.match(
      /@media print\s*\{[\s\S]*?\.print-page-group\s*\{([^}]+)\}/
    )?.[1] ?? '';
    expect(pgInMainCss).not.toMatch(/height:\s*100vh/);
  });
});

// ── 4. grid minmax(0, 1fr) — Safari の grid + print pagination 対策 ───────

describe('grid minmax(0, 1fr) が必須 (素の 1fr に戻すと Safari で 2P 目空白)', () => {
  for (const [cols, rows] of LAYOUT_PRESETS) {
    it(`[${cols}×${rows}] .print-page-inner に minmax(0, 1fr) が両軸で出力される`, () => {
      const { layout } = buildPrintCss({ orientation: 'portrait', cols, rows });
      expect(layout).toMatch(
        new RegExp(`grid-template-columns:\\s*repeat\\(${cols},\\s*minmax\\(0,\\s*1fr\\)\\)`)
      );
      expect(layout).toMatch(
        new RegExp(`grid-template-rows:\\s*repeat\\(${rows},\\s*minmax\\(0,\\s*1fr\\)\\)`)
      );
    });
  }
});

// ── 5. 印刷時に紛れ込みやすい要素の非表示 (再発防止の保険) ────────────────

describe('print mode で紛れ込み要素が確実に非表示', () => {
  it('main.css @media print: .saved-warn-restore が display:none !important', () => {
    expect(CSS).toMatch(
      /@media print\s*\{[\s\S]*?\.saved-warn-restore\s*\{[^}]*display:\s*none\s*!important/
    );
  });

  it('main.css @media print: #savedEmpty が display:none !important', () => {
    expect(CSS).toMatch(
      /@media print\s*\{[\s\S]*?#savedEmpty\s*\{[^}]*display:\s*none\s*!important/
    );
  });

  it('動的 CSS (printCss.js) でも保険的に同じ要素を hidden にする', () => {
    const { layout } = buildPrintCss({ orientation: 'portrait', cols: 2, rows: 2 });
    expect(layout).toMatch(/\.saved-warn-restore\s*\{[^}]*display:\s*none\s*!important/);
    expect(layout).toMatch(/#savedEmpty\s*\{[^}]*display:\s*none\s*!important/);
  });
});

// ── 6. svg.fb の max-height が mm 単位で、横で十分小さい ──────────────────

describe('svg.fb max-height が orientation 別の cellH 以下に収まる', () => {
  function extractSvgMaxMm(block) {
    const m = block.match(/svg\.fb\s*\{[^}]*max-height:\s*([\d.]+)mm/);
    return m ? parseFloat(m[1]) : null;
  }

  for (const [cols, rows] of LAYOUT_PRESETS) {
    it(`[${cols}×${rows}] PC landscape: svg max-height ≤ cellH (はみ出さない)`, () => {
      const { layout } = buildPrintCss({ orientation: 'landscape', cols, rows });
      const svgMm = extractSvgMaxMm(layout);
      const cellH = (210 - 16 - 3 * (rows - 1)) / rows;
      expect(svgMm).not.toBeNull();
      expect(svgMm).toBeLessThanOrEqual(cellH);
    });

    it(`[${cols}×${rows}] PC portrait: svg max-height ≤ cellH`, () => {
      const { layout } = buildPrintCss({ orientation: 'portrait', cols, rows });
      const svgMm = extractSvgMaxMm(layout);
      const cellH = (297 - 16 - 3 * (rows - 1)) / rows;
      expect(svgMm).not.toBeNull();
      expect(svgMm).toBeLessThanOrEqual(cellH);
    });
  }
});
