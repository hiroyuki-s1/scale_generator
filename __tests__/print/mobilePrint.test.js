/**
 * スマホ印刷テスト — 再発防止スイート
 *
 * 背景:
 *   CSS Grid の break-after:page は iOS Safari で動作しないため、
 *   .print-page-break (シンプルな block div) を使って改ページする方式に変更。
 *
 *   スマホ印刷時は @media (max-width: 767px) も同時に適用されるため、
 *   モバイル CSS と印刷 CSS の競合もチェックする必要がある。
 *
 * 検証項目:
 *   A. .print-page-break のルールが static (main.css) に存在する
 *   B. .print-page-break のルールが dynamic (printCss.js) にも存在する
 *   C. .print-page-group に break-after が含まれない (iOS Safari 非対応のため禁止)
 *   D. モバイル CSS (@media max-width) が印刷クラスを上書きしない
 *      D-1. .print-page-break のルールがモバイル CSS に存在しない
 *      D-2. .print-page-group のルールがモバイル CSS に存在しない
 *      D-3. モバイル CSS の競合ルールに !important がなく印刷 CSS が勝てる
 *   E. 印刷時に #panelSaved が確実に表示される CSS が存在する
 *   F. 全 @media (max-width: ...) ブロックに印刷専用クラスが混入していない
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

/** 全 @media print ブロックの内容を結合 (内側 {} も含む) */
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

/** 全 @media (max-width: ...) ブロックの内容を結合 */
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

const PRINT_CSS_STATIC  = extractAllPrintBlocks(CSS);
const MOBILE_CSS_ALL    = extractAllMobileBlocks(CSS);

// ── A. .print-page-break が static CSS (main.css) に存在する ─────────────

describe('A: .print-page-break — static CSS (main.css @media print)', () => {
  it('page-break-before: always !important が存在する (iOS Safari 含む全ブラウザ対応)', () => {
    expect(PRINT_CSS_STATIC).toMatch(
      /\.print-page-break[^{]*\{[^}]*page-break-before:\s*always\s*!important/
    );
  });

  it('break-before: page !important が存在する (モダンブラウザ対応)', () => {
    expect(PRINT_CSS_STATIC).toMatch(
      /\.print-page-break[^{]*\{[^}]*break-before:\s*page\s*!important/
    );
  });

  it('display: block !important が存在する (block 要素として確実に表示)', () => {
    expect(PRINT_CSS_STATIC).toMatch(
      /\.print-page-break[^{]*\{[^}]*display:\s*block\s*!important/
    );
  });

  it('height: 0 !important が存在する (レイアウトに影響しない)', () => {
    expect(PRINT_CSS_STATIC).toMatch(
      /\.print-page-break[^{]*\{[^}]*height:\s*0\s*!important/
    );
  });
});

// ── B. .print-page-break が dynamic CSS (printCss.js) にも存在する ────────

describe('B: .print-page-break — dynamic CSS (printCss.js 生成)', () => {
  // 代表レイアウトで確認 (全レイアウトは printCss.matrix.test.js でカバー済み)
  const SAMPLE_LAYOUTS = [
    { orientation: 'landscape', cols: 1, rows: 2 },
    { orientation: 'portrait',  cols: 2, rows: 3 },
    { orientation: 'landscape', cols: 2, rows: 4 },
  ];

  for (const layout of SAMPLE_LAYOUTS) {
    const label = `${layout.orientation} ${layout.cols}×${layout.rows}`;
    it(`[${label}] page-break-before:always !important が生成される`, () => {
      const { layout: css } = buildPrintCss(layout);
      expect(css).toMatch(/\.print-page-break[^{]*\{[\s\S]*?page-break-before:\s*always\s*!important/);
    });
    it(`[${label}] break-before:page !important が生成される`, () => {
      const { layout: css } = buildPrintCss(layout);
      expect(css).toMatch(/\.print-page-break[^{]*\{[\s\S]*?break-before:\s*page\s*!important/);
    });
  }
});

// ── C. .print-page-group に break-after が含まれない ──────────────────────

describe('C: .print-page-group に break-after:page を使わない (iOS Safari 非対応)', () => {
  it('static CSS (main.css) に .print-page-group の break-after ルールがない', () => {
    // main.css には .print-page-group のルールがそもそもない (dynamic のみ)
    expect(CSS).not.toMatch(/\.print-page-group[^{]*\{[^}]*break-after/);
  });

  for (const [cols, rows] of LAYOUT_PRESETS) {
    for (const orientation of ['landscape', 'portrait']) {
      it(`dynamic [${orientation} ${cols}×${rows}] .print-page-group に break-after がない`, () => {
        const { layout: css } = buildPrintCss({ orientation, cols, rows });
        const pgBlock = css.match(/\.print-page-group\s*\{([^}]+)\}/)?.[1] ?? '';
        expect(pgBlock).not.toMatch(/break-after/);
      });
    }
  }
});

// ── D. モバイル CSS が印刷クラスを上書きしない ────────────────────────────

describe('D-1: .print-page-break のルールがモバイル CSS に存在しない', () => {
  it('モバイル CSS ブロック全体に .print-page-break の記述がない', () => {
    expect(MOBILE_CSS_ALL).not.toMatch(/\.print-page-break/);
  });
});

describe('D-2: .print-page-group のルールがモバイル CSS に存在しない', () => {
  it('モバイル CSS ブロック全体に .print-page-group の記述がない', () => {
    expect(MOBILE_CSS_ALL).not.toMatch(/\.print-page-group/);
  });
});

describe('D-3: モバイル CSS の競合ルールに !important がなく印刷 CSS が勝てる', () => {
  // スマホ印刷時に両方のメディアクエリが適用されるため、
  // モバイル CSS が !important を持っていると印刷 CSS が負ける可能性がある。
  // 以下の競合するプロパティは印刷 CSS 側に !important があり、
  // モバイル CSS 側には !important がないことを確認する。

  it('#savedGrid の gap: モバイルは !important なし → 印刷の gap:0 !important が勝つ', () => {
    // モバイル: #savedGrid { gap: 14px; }  (no !important)
    const mobileGapRule = MOBILE_CSS_ALL.match(/#savedGrid\s*\{([^}]+)\}/)?.[1] ?? '';
    expect(mobileGapRule).toMatch(/gap:/);
    expect(mobileGapRule).not.toMatch(/gap:[^;]*!important/);
  });

  it('.tab-panel.hidden の display: モバイルは !important なし → 印刷の #panelSaved display:flex !important が勝つ', () => {
    // モバイル: .tab-panel.hidden { display: none; }  (no !important)
    const mobileHiddenRule = MOBILE_CSS_ALL.match(/\.tab-panel\.hidden\s*\{([^}]+)\}/)?.[1] ?? '';
    expect(mobileHiddenRule).toMatch(/display:/);
    expect(mobileHiddenRule).not.toMatch(/display:[^;]*!important/);
  });

  it('.saved-section の padding: モバイルは !important なし → 印刷の padding:0 !important が勝つ', () => {
    // モバイル: .saved-section { padding: 12px 12px 20px; }  (no !important)
    // モバイル CSS に .saved-section が複数あるので全件チェック
    const paddingPattern = /\.saved-section\s*\{[^}]*padding:[^;]*!important/;
    expect(MOBILE_CSS_ALL).not.toMatch(paddingPattern);
  });
});

// ── E. 印刷時に #panelSaved が確実に表示される ────────────────────────────

describe('E: 印刷時の #panelSaved 表示保証', () => {
  it('static CSS: #panelSaved に display: flex !important が存在する', () => {
    expect(PRINT_CSS_STATIC).toMatch(
      /#panelSaved[^{]*\{[^}]*display:\s*flex\s*!important/
    );
  });

  it('static CSS: #panelEditor に display: none !important が存在する', () => {
    expect(PRINT_CSS_STATIC).toMatch(
      /#panelEditor[^{]*\{[^}]*display:\s*none\s*!important/
    );
  });

  it('dynamic CSS: #savedGrid に display: block !important が存在する (printCss.js が注入)', () => {
    // #savedGrid の display:block は動的 CSS のみ (static の main.css には含まれない)
    const { layout } = buildPrintCss({ orientation: 'landscape', cols: 2, rows: 3 });
    expect(layout).toMatch(/#savedGrid[^{]*\{[^}]*display:\s*block\s*!important/);
  });
});

// ── F. 全 @media (max-width) ブロックに印刷専用クラスが混入していない ───────

describe('F: 全モバイル CSS ブロックに印刷専用クラスが混入していない', () => {
  const PRINT_ONLY_CLASSES = [
    '.print-page-break',
    '.print-page-group',
    '.saved-print-title',
  ];

  for (const cls of PRINT_ONLY_CLASSES) {
    it(`モバイル CSS に ${cls} の記述がない`, () => {
      expect(MOBILE_CSS_ALL).not.toContain(cls);
    });
  }
});
