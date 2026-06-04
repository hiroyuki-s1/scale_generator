/**
 * スマホ印刷テスト — 再発防止スイート
 *
 * 背景・改ページ戦略の変遷 (なぜ今の実装かの記録):
 *   × CSS Grid の break-after:page              → iOS Safari で動作しない
 *   × 空の .print-page-break + page-break-before → break要素が1P消費して空白
 *   × .print-page-group に page-break-after:always → Safari は最終ページ後に
 *                                                    余分な空白ページを作る
 *   × .print-page-group に mm 固定 height        → iOS の @page margin 解釈差で溢れる
 *   ○ .print-page-group に height:100vh (1ページ枠) + overflow:hidden +
 *      break-inside:avoid。.print-page-inner を grid 1fr で均等分割。
 *      改ページは隣接兄弟 .print-page-group + .print-page-group の
 *      page-break-before のみ (page-break-after は不使用) → 全 OS で空白ページなし
 *
 * スマホ印刷時は @media (max-width: 767px) も同時に適用されるため、
 * モバイル CSS と印刷 CSS の競合もチェックする。
 *
 * 検証項目:
 *   A. .print-page-group が block + overflow:hidden, page-break-after 不使用,
 *      隣接兄弟に page-break-before:always (static CSS)
 *   B. dynamic CSS でも同様 + .print-page-inner が grid 1fr
 *   C. ページ枠 height:100vh + grid-template-rows 1fr 均等分割
 *   D. モバイル CSS が印刷クラスを上書きしない
 *   E. 印刷時に #panelSaved が block 表示される
 *   F. 全モバイル CSS に印刷専用クラスが混入していない
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { buildPrintCss } from '../../src/print/printCss.js';
import { LAYOUT_PRESETS } from '../../src/domain/constants.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(join(__dirname, '../../src/styles/main.css'), 'utf8');

// ── CSS パース ユーティリティ ─────────────────────────────────────────────

function extractAllPrintBlocks(css) {
  let result = '';
  let pos = 0;
  while (true) {
    const start = css.indexOf('@media print', pos);
    if (start < 0) break;
    let depth = 0, inBlock = false;
    for (let i = css.indexOf('{', start); i < css.length; i++) {
      const c = css[i];
      if (c === '{') { depth++; inBlock = true; if (depth > 1) result += c; }
      else if (c === '}') { depth--; if (depth === 0 && inBlock) { pos = i + 1; break; } else if (depth >= 1) result += c; }
      else if (inBlock && depth >= 1) result += c;
    }
    if (!inBlock) break;
  }
  return result;
}

function extractAllMobileBlocks(css) {
  let result = '';
  let pos = 0;
  while (true) {
    const start = css.indexOf('@media (max-width:', pos);
    if (start < 0) break;
    let depth = 0, inBlock = false;
    for (let i = css.indexOf('{', start); i < css.length; i++) {
      const c = css[i];
      if (c === '{') { depth++; inBlock = true; if (depth > 1) result += c; }
      else if (c === '}') { depth--; if (depth === 0 && inBlock) { pos = i + 1; break; } else if (depth >= 1) result += c; }
      else if (inBlock && depth >= 1) result += c;
    }
    if (!inBlock) break;
  }
  return result;
}

const PRINT_CSS_STATIC = extractAllPrintBlocks(CSS);
const MOBILE_CSS_ALL   = extractAllMobileBlocks(CSS);

// ── A. static CSS: .print-page-group が block + overflow:hidden ────────────

describe('A: .print-page-group — static CSS (main.css @media print)', () => {
  it('display: block !important が存在する', () => {
    expect(PRINT_CSS_STATIC).toMatch(/\.print-page-group[^{+]*\{[^}]*display:\s*block\s*!important/);
  });

  it('overflow: hidden !important が存在する (ページ高さ超過分を切る)', () => {
    expect(PRINT_CSS_STATIC).toMatch(/\.print-page-group[^{+]*\{[^}]*overflow:\s*hidden\s*!important/);
  });

  it('break-inside: avoid !important が存在する (グループ内で分割しない)', () => {
    expect(PRINT_CSS_STATIC).toMatch(/\.print-page-group[^{+]*\{[^}]*break-inside:\s*avoid\s*!important/);
  });

  it('.print-page-group 単体に page-break-after を使わない (Safari 空白ページバグ回避)', () => {
    const pgBlock = PRINT_CSS_STATIC.match(/\.print-page-group\s*\{([^}]+)\}/)?.[1] ?? '';
    expect(pgBlock).not.toMatch(/page-break-after/);
    expect(pgBlock).not.toMatch(/display:\s*grid/);
  });

  it('隣接兄弟 .print-page-group + .print-page-group に page-break-before:always', () => {
    expect(PRINT_CSS_STATIC).toMatch(
      /\.print-page-group\s*\+\s*\.print-page-group[^{]*\{[^}]*page-break-before:\s*always\s*!important/
    );
  });
});

// ── B. dynamic CSS: 全 layout×orientation で同様のルールが生成される ────────

describe('B: .print-page-group — dynamic CSS (printCss.js 生成、全18パターン)', () => {
  for (const [cols, rows] of LAYOUT_PRESETS) {
    for (const orientation of ['landscape', 'portrait']) {
      const label = `${orientation} ${cols}×${rows}`;

      it(`[${label}] .print-page-group: display:block + overflow:hidden, page-break-after なし`, () => {
        const { layout: css } = buildPrintCss({ orientation, cols, rows });
        const pgBlock = css.match(/\.print-page-group\s*\{([^}]+)\}/)?.[1] ?? '';
        expect(pgBlock).toMatch(/display:\s*block/);
        expect(pgBlock).toMatch(/overflow:\s*hidden/);
        expect(pgBlock).not.toMatch(/page-break-after/);
        expect(pgBlock).not.toMatch(/display:\s*grid/);
      });

      it(`[${label}] 隣接兄弟に page-break-before:always`, () => {
        const { layout: css } = buildPrintCss({ orientation, cols, rows });
        expect(css).toMatch(/\.print-page-group\s*\+\s*\.print-page-group\s*\{[^}]*page-break-before:\s*always/);
      });

      it(`[${label}] .print-page-inner: grid-template-columns repeat(${cols})`, () => {
        const { layout: css } = buildPrintCss({ orientation, cols, rows });
        expect(css).toMatch(
          new RegExp(`\\.print-page-inner[^{]*\\{[\\s\\S]*?grid-template-columns:\\s*repeat\\(${cols},`)
        );
      });
    }
  }
});

// ── C. orientation 別 mm 寸法 + grid minmax(0, 1fr) (iOS Safari 横印刷 2P空白対策) ───
// v1.0.0 以前は .print-page-group に height:100vh を一律に当てていたが、
// iOS Safari は print + landscape で vh をビューポート基準に解決する
// 不定性があり、グループが用紙からはみ出して2P目空白になる事故が頻発した。
// 現在は orientation media query 内で mm 単位で出すことで根本回避している。

describe('C: orientation 別 mm 寸法 + grid minmax(0, 1fr)', () => {
  for (const [cols, rows] of LAYOUT_PRESETS) {
    it(`dynamic [${cols}×${rows}]: .print-page-group base block には height を持たせない`, () => {
      const { layout: css } = buildPrintCss({ orientation: 'portrait', cols, rows });
      const pgBlock = css.match(/\.print-page-group\s*\{([^}]+)\}/)?.[1] ?? '';
      expect(pgBlock).not.toMatch(/height:\s*100vh/);
      expect(pgBlock).not.toMatch(/height:\s*[\d]+mm/);
    });

    it(`mobile [${cols}×${rows}]: orientation:landscape で height = 182mm`, () => {
      const { layout: css } = buildPrintCss({ orientation: 'portrait', cols, rows, isMobile: true });
      expect(css).toMatch(
        /@media print and \(orientation:\s*landscape\)[\s\S]*?\.print-page-group\s*\{[^}]*height:\s*182mm/
      );
    });

    it(`mobile [${cols}×${rows}]: orientation:portrait で height = 269mm`, () => {
      const { layout: css } = buildPrintCss({ orientation: 'portrait', cols, rows, isMobile: true });
      expect(css).toMatch(
        /@media print and \(orientation:\s*portrait\)[\s\S]*?\.print-page-group\s*\{[^}]*height:\s*269mm/
      );
    });

    it(`PC [${cols}×${rows}]: orientation 引数固定で単一 @media print ブロック (反対 orientation の値は出ない)`, () => {
      const { layout: css } = buildPrintCss({ orientation: 'portrait', cols, rows });
      expect(css).toMatch(/\.print-page-group\s*\{[^}]*height:\s*269mm/);
      expect(css).not.toMatch(/182mm/);
    });

    it(`dynamic [${cols}×${rows}]: .print-page-inner が ${rows} 行を minmax(0, 1fr) で均等分割`, () => {
      const { layout: css } = buildPrintCss({ orientation: 'portrait', cols, rows });
      expect(css).toMatch(
        new RegExp(`grid-template-rows:\\s*repeat\\(${rows},\\s*minmax\\(0,\\s*1fr\\)\\)`)
      );
    });
  }
});

// ── D. モバイル CSS が印刷クラスを上書きしない ────────────────────────────

describe('D: モバイル CSS と印刷 CSS の競合チェック', () => {
  it('モバイル CSS に .print-page-group の記述がない', () => {
    expect(MOBILE_CSS_ALL).not.toMatch(/\.print-page-group/);
  });

  it('モバイル CSS に .print-page-inner の記述がない', () => {
    expect(MOBILE_CSS_ALL).not.toMatch(/\.print-page-inner/);
  });

  it('#savedGrid の gap: モバイルは !important なし → 印刷の gap:0 !important が勝つ', () => {
    const mobileRule = MOBILE_CSS_ALL.match(/#savedGrid\s*\{([^}]+)\}/)?.[1] ?? '';
    expect(mobileRule).toMatch(/gap:/);
    expect(mobileRule).not.toMatch(/gap:[^;]*!important/);
  });

  it('.tab-panel.hidden の display: モバイルは !important なし → 印刷の #panelSaved:flex !important が勝つ', () => {
    const mobileRule = MOBILE_CSS_ALL.match(/\.tab-panel\.hidden\s*\{([^}]+)\}/)?.[1] ?? '';
    expect(mobileRule).toMatch(/display:/);
    expect(mobileRule).not.toMatch(/display:[^;]*!important/);
  });

  it('.saved-section の padding: モバイルは !important なし → 印刷の padding:0 !important が勝つ', () => {
    expect(MOBILE_CSS_ALL).not.toMatch(/\.saved-section\s*\{[^}]*padding:[^;]*!important/);
  });
});

// ── E. 印刷時に #panelSaved が確実に表示される ────────────────────────────

describe('E: 印刷時の #panelSaved 表示保証', () => {
  it('static CSS: #panelSaved に display: block !important (flex は iOS Safari で page-break 非対応)', () => {
    expect(PRINT_CSS_STATIC).toMatch(/#panelSaved[^{]*\{[^}]*display:\s*block\s*!important/);
  });

  it('static CSS: #panelEditor に display: none !important', () => {
    expect(PRINT_CSS_STATIC).toMatch(/#panelEditor[^{]*\{[^}]*display:\s*none\s*!important/);
  });

  it('dynamic CSS: #savedGrid に display: block !important', () => {
    const { layout } = buildPrintCss({ orientation: 'landscape', cols: 2, rows: 3 });
    expect(layout).toMatch(/#savedGrid[^{]*\{[^}]*display:\s*block\s*!important/);
  });
});

// ── F. 全モバイル CSS に印刷専用クラスが混入していない ───────────────────

describe('F: 印刷専用クラスがモバイル CSS に混入していない', () => {
  const PRINT_ONLY_CLASSES = [
    '.print-page-group',
    '.print-page-inner',
    '.print-page-break',
    '.saved-print-title',
  ];

  for (const cls of PRINT_ONLY_CLASSES) {
    it(`モバイル CSS に ${cls} の記述がない`, () => {
      expect(MOBILE_CSS_ALL).not.toContain(cls);
    });
  }
});
