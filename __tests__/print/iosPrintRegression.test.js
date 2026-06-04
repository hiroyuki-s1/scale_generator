/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  iOS 縦横印刷 2P目空白 — 再発防止の不変条件 (絶対に壊さない)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 経緯: iOS Safari の印刷で「2ページ目が空白」になるバグに 20回以上の commit を
 *   要した。最終的に「dedecc4 の height:100vh 方式」に戻して iPhone 実機で
 *   縦・横とも問題なしを確認 (ユーザー確認済み)。
 *
 * このファイルは「実機で動いた構成」を1箇所に集約した不変条件テスト。
 *   各 it は「これを変えると iOS で 2P目空白 が再発する」項目を守る。
 *   将来 CSS を触る人がうっかり壊したら、ここが必ず赤くなる。
 *
 * ⚠️ ここが赤くなったら = iOS 印刷を壊した可能性が高い。値を更新する前に
 *    「本当に iOS 実機で確認したか」を必ず自問すること。Playwright/PDF では
 *    iOS の印刷ページネーションを完全再現できない (CLAUDE.md 参照)。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { buildPrintCss } from '../../src/print/printCss.js';
import { LAYOUT_PRESETS } from '../../src/domain/constants.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAIN_CSS = readFileSync(join(__dirname, '../../src/styles/main.css'), 'utf8');

const ORIENTATIONS = ['landscape', 'portrait'];
const ALL = []; // 全 layout×orientation の生成 CSS
for (const [cols, rows] of LAYOUT_PRESETS) {
  for (const orientation of ORIENTATIONS) {
    ALL.push({ label: `${orientation} ${cols}×${rows}`, cols, rows, orientation,
      ...buildPrintCss({ orientation, cols, rows }) });
  }
}
const pg = (css) => css.match(/\.print-page-group\s*\{([^}]+)\}/)?.[1] ?? '';

describe('iOS印刷 再発防止 ① グループ高さは height:100vh (mm固定は縦印刷2P空白の元凶)', () => {
  // 履歴: height を mm 固定にしたところ、iOS 実機 AirPrint の物理余白(機種差10〜16mm)を
  //   CSS で補正しきれず縦印刷で2P空白が再発。100vh は印刷ページに追従し補正不要。
  for (const c of ALL) {
    it(`${c.label}: .print-page-group が height:100vh`, () => {
      expect(pg(c.layout)).toMatch(/height:\s*100vh\s*!important/);
    });
    it(`${c.label}: mm 固定 height を持たない (二度と mm に戻さない)`, () => {
      expect(pg(c.layout)).not.toMatch(/height:\s*[\d.]+mm/);
    });
  }
});

describe('iOS印刷 再発防止 ② @page margin は 10mm 12mm (margin:0/auto は用紙端溢れ)', () => {
  // 履歴: @page margin:0 にしたら iOS が用紙端まで描画し物理余白で溢れて2P空白。
  //   size:auto も縦横の不整合を生んだ。明示 mm 指定 + margin 10mm 12mm に固定。
  for (const c of ALL) {
    it(`${c.label}: @page margin: 10mm 12mm`, () => {
      expect(c.orient).toMatch(/margin:\s*10mm\s+12mm/);
    });
    it(`${c.label}: @page margin:0 / auto を使わない`, () => {
      expect(c.orient).not.toMatch(/margin:\s*0[;\s}]/);
      expect(c.orient).not.toMatch(/size:\s*auto/);
    });
    it(`${c.label}: @page size は向き明示 mm`, () => {
      const expected = c.orientation === 'landscape' ? '297mm 210mm' : '210mm 297mm';
      expect(c.orient).toContain(expected);
    });
  }
});

describe('iOS印刷 再発防止 ③ 改ページは隣接兄弟 page-break-before のみ', () => {
  // 履歴: page-break-after:always は Safari が最終ページ後に余分な空白ページを作る。
  //   隣接兄弟 .print-page-group + .print-page-group の page-break-before だけを使う。
  for (const c of ALL) {
    it(`${c.label}: 隣接兄弟に page-break-before:always`, () => {
      expect(c.layout).toMatch(/\.print-page-group\s*\+\s*\.print-page-group\s*\{[^}]*page-break-before:\s*always/);
    });
    it(`${c.label}: .print-page-group 単体に page-break-after を使わない`, () => {
      expect(pg(c.layout)).not.toMatch(/page-break-after/);
    });
  }
});

describe('iOS印刷 再発防止 ④ grid は minmax(0,1fr) (1fr は Safari 行膨張で2P空白)', () => {
  // 履歴: 1fr (=minmax(auto,1fr)) は子の min-content に押されて行が膨張しページ超過。
  //   minmax(0,1fr) で強制均等分割し、子は overflow:hidden で切る。
  for (const c of ALL) {
    it(`${c.label}: grid-template-columns/rows が minmax(0, 1fr)`, () => {
      expect(c.layout).toMatch(new RegExp(`grid-template-columns:\\s*repeat\\(${c.cols},\\s*minmax\\(0,\\s*1fr\\)\\)`));
      expect(c.layout).toMatch(new RegExp(`grid-template-rows:\\s*repeat\\(${c.rows},\\s*minmax\\(0,\\s*1fr\\)\\)`));
    });
    it(`${c.label}: grid に素の 1fr (minmax無し) を使わない`, () => {
      // "repeat(N, 1fr)" のような minmax 無しの 1fr が無いこと
      // (minmax(0, 1fr) 内の 1fr は誤検出しないよう repeat(数字, 1fr) のみ)
      expect(c.layout).not.toMatch(/repeat\(\d+,\s*1fr\)/);
    });
  }
});

describe('iOS印刷 再発防止 ⑤ svg.fb max-height は vh (マスク縦長の枠内収め)', () => {
  // 履歴: マスクで縦長になった指板が枠を超えて切れる/溢れる。100vh 枠内の相対 vh で収める。
  for (const c of ALL) {
    it(`${c.label}: svg.fb に max-height vh`, () => {
      expect(c.layout).toMatch(/svg\.fb\s*\{[^}]*max-height:\s*[\d.]+vh/);
    });
  }
  it('行数が多いほど svg max-height(vh) が小さい (1セルが小さくなる)', () => {
    const vhOf = (rows) => parseFloat(buildPrintCss({ orientation: 'portrait', cols: 2, rows }).layout.match(/max-height:\s*([\d.]+)vh/)[1]);
    expect(vhOf(2)).toBeGreaterThan(vhOf(3));
    expect(vhOf(3)).toBeGreaterThan(vhOf(5));
  });
});

describe('iOS印刷 再発防止 ⑥ #panelSaved は block (flex は iOS で page-break 無視)', () => {
  // 履歴: #panelSaved が display:flex だと iOS が flex 内の page-break を無視して2P空白。
  //   印刷時は block にする (main.css @media print)。
  it('main.css @media print で #panelSaved が display:block !important', () => {
    expect(MAIN_CSS).toMatch(/#panelSaved[^}]*display:\s*block\s*!important/);
  });
  it('main.css @media print で #panelSaved を flex にしない', () => {
    expect(MAIN_CSS).not.toMatch(/#panelSaved[^}]*display:\s*flex\s*!important/);
  });
});

describe('iOS印刷 再発防止 ⑦ .print-page-group は block + overflow:hidden + break-inside:avoid', () => {
  for (const c of ALL) {
    it(`${c.label}: block + overflow:hidden + break-inside:avoid (grid でない)`, () => {
      const b = pg(c.layout);
      expect(b).toMatch(/display:\s*block/);
      expect(b).not.toMatch(/display:\s*grid/);
      expect(b).toMatch(/overflow:\s*hidden/);
      expect(b).toMatch(/break-inside:\s*avoid/);
    });
  }
});
