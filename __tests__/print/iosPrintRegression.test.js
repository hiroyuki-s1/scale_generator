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
// iOS 実機の印刷を対象とする suite なので isMobile:true で生成する
// (モバイルは @page size:auto / PC は size 明示 mm。@page size 以外の不変条件は共通)。
const ALL = []; // 全 layout×orientation の生成 CSS
for (const [cols, rows] of LAYOUT_PRESETS) {
  for (const orientation of ORIENTATIONS) {
    ALL.push({ label: `${orientation} ${cols}×${rows}`, cols, rows, orientation,
      ...buildPrintCss({ orientation, cols, rows, isMobile: true }) });
  }
}
const pg = (css) => css.match(/\.print-page-group\s*\{([^}]+)\}/)?.[1] ?? '';

describe('iOS印刷 再発防止 ① グループ高さは指定しない (auto)。vh も mm 固定もしない', () => {
  // 履歴 (横印刷2P空白の根治):
  //   `.print-page-group { height: 100vh }` にしていたが、スマホ(縦持ち)で横用紙を
  //   印刷すると iOS Safari が 100vh を「縦持ち viewport の高さ」で解決し、横用紙の
  //   印刷可能高さを大幅に超えて2P目が空白になった (横だけ壊れる)。
  //   一方 height を mm 固定にすると、今度は AirPrint 物理余白の機種差で縦印刷が
  //   オーバーフローした。
  //   → 結論: 枠に height を与えず auto にし、中身(指板)を mm 実寸 (svgMaxMm) で
  //      安全マージン込みに縛る。枠は中身ぶんの高さになり、viewport/用紙の食い違いに
  //      影響されず必ず1ページに収まる。
  for (const c of ALL) {
    it(`${c.label}: .print-page-group に height を指定しない (auto)`, () => {
      expect(pg(c.layout)).not.toMatch(/height:\s*100vh/);
      expect(pg(c.layout)).not.toMatch(/height:\s*[\d.]+mm/);
      expect(pg(c.layout)).not.toMatch(/(^|[;{])\s*height:/);
    });
    it(`${c.label}: overflow:hidden + break-inside:avoid は維持`, () => {
      expect(pg(c.layout)).toMatch(/overflow:\s*hidden/);
      expect(pg(c.layout)).toMatch(/break-inside:\s*avoid/);
    });
  }
});

describe('iOS印刷 再発防止 ② @page は単一 size:auto + margin 10mm 12mm', () => {
  // 履歴 (横印刷分割バグの根治):
  //   @page size を mm 明示 (210mm 297mm=portrait 固定) にしていたところ、モバイルが
  //   OS 印刷シートで「横」を選ぶと @page(縦) と実用紙(横) が衝突し、横印刷で
  //   「タイトルが1P目・スケールが2P目」に割れた (ユーザー報告。explicit-mm では再発)。
  //   → size:auto で OS 印刷シートが選んだ用紙の向きに @page を追従させる。100vh も
  //     実用紙に追従するので縦横どちらも1ページに収まる。
  //   ※ size:auto を「向き明示 mm」に戻すと横印刷分割が再発する → 戻さない。
  //   ※ @page margin:0 は iOS が用紙端まで描画し物理余白で溢れるため使わない。
  for (const c of ALL) {
    it(`${c.label}: @page margin: 10mm 12mm`, () => {
      expect(c.orient).toMatch(/margin:\s*10mm\s+12mm/);
    });
    it(`${c.label}: @page margin:0 を使わない`, () => {
      expect(c.orient).not.toMatch(/margin:\s*0[;\s}]/);
    });
    it(`${c.label}: @page size は auto (向き明示 mm に戻さない)`, () => {
      expect(c.orient).toMatch(/size:\s*auto/);
      expect(c.orient).not.toMatch(/size:\s*\d+mm\s+\d+mm/);
    });
  }
});

describe('iOS印刷 再発防止 ②b @page は単一ブロックのみ (複数@pageはモバイルSafariで崩壊)', () => {
  // 履歴 (重大事故): 横印刷のタイトル分割を直そうと @page を orientation media query で
  //   portrait/landscape 両方出力したら、モバイル Safari 実機で複数@pageを正しく
  //   処理できず印刷レイアウトが完全崩壊した (指板がページをまたぎ4ページにバラける)。
  //   → @page は **常に単一ブロック**にする。orientation media query で @page を
  //      分けてはいけない。
  for (const c of ALL) {
    it(`${c.label}: @page を含む @media print ブロックは1つだけ`, () => {
      const pageBlocks = (c.orient.match(/@page\s*\{/g) || []).length;
      expect(pageBlocks).toBe(1);
    });
    it(`${c.label}: @page を orientation media query で分けない`, () => {
      expect(c.orient).not.toMatch(/@media print and \(orientation/);
    });
  }
  // PC/モバイルどちらの分岐でも @page は単一であること (分岐は JS の isMobile で行い、
  // 出力 @page は常に1つ。複数 @page はモバイル Safari で印刷崩壊する)。
  for (const [cols, rows] of LAYOUT_PRESETS) {
    for (const orientation of ORIENTATIONS) {
      for (const isMobile of [true, false]) {
        it(`${orientation} ${cols}×${rows} isMobile=${isMobile}: @page は単一ブロック`, () => {
          const { orient } = buildPrintCss({ orientation, cols, rows, isMobile });
          expect((orient.match(/@page\s*\{/g) || []).length).toBe(1);
          expect(orient).not.toMatch(/@media print and \(orientation/);
        });
      }
    }
  }
});

describe('iOS印刷 再発防止 ②c @page size は モバイル=auto / PC=明示mm (横印刷分割の根治)', () => {
  // モバイルは OS 印刷シートで向きを切替 → size:auto で実用紙の向きに追従させないと
  //   横用紙で「タイトル1P目・スケール2P目」に割れる。
  // PC は向きボタンで確定 → size 明示 mm で用紙の向きを固定する。
  for (const [cols, rows] of LAYOUT_PRESETS) {
    for (const orientation of ORIENTATIONS) {
      it(`${orientation} ${cols}×${rows}: モバイルは size:auto`, () => {
        const { orient } = buildPrintCss({ orientation, cols, rows, isMobile: true });
        expect(orient).toMatch(/size:\s*auto/);
        expect(orient).not.toMatch(/size:\s*\d+mm\s+\d+mm/);
      });
      it(`${orientation} ${cols}×${rows}: PC は向き明示 mm`, () => {
        const { orient } = buildPrintCss({ orientation, cols, rows, isMobile: false });
        const expected = orientation === 'landscape' ? '297mm 210mm' : '210mm 297mm';
        expect(orient).toContain(expected);
      });
    }
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

describe('iOS印刷 再発防止 ④ 控えめ mm 高さを grid minmax(0,1fr) で均等分割 (上詰め禁止)', () => {
  // 設計: .print-page-inner に「用紙より控えめな mm 実寸 (usableH)」の height を与え、
  //   cols×rows を minmax(0,1fr) で均等分割する。これで各セルに1枚ずつ均等配置され
  //   (上詰めにならない)、かつ控えめ mm + 安全マージンで物理余白の機種差を吸収し
  //   2P空白も出ない。
  //   - vh は使わない (iOS横印刷で viewport基準になり破綻)。
  //   - 素の 1fr ではなく minmax(0,1fr) (Safari の min-content 行膨張による2P空白回避)。
  for (const c of ALL) {
    it(`${c.label}: grid-template-columns は minmax(0, 1fr)`, () => {
      expect(c.layout).toMatch(new RegExp(`grid-template-columns:\\s*repeat\\(${c.cols},\\s*minmax\\(0,\\s*1fr\\)\\)`));
    });
    it(`${c.label}: grid-template-rows は minmax(0, 1fr) (均等分割。素の1fr/autoにしない)`, () => {
      expect(c.layout).toMatch(new RegExp(`grid-template-rows:\\s*repeat\\(${c.rows},\\s*minmax\\(0,\\s*1fr\\)\\)`));
      expect(c.layout).not.toMatch(new RegExp(`grid-template-rows:\\s*repeat\\(${c.rows},\\s*auto\\)`));
    });
    it(`${c.label}: .print-page-inner の height は mm 実寸 (vh/100vh/100% にしない)`, () => {
      const inner = c.layout.match(/\.print-page-inner\s*\{([^}]+)\}/)?.[1] ?? '';
      expect(inner).toMatch(/height:\s*[\d.]+mm/);
      expect(inner).not.toMatch(/height:\s*100vh/);
      expect(inner).not.toMatch(/height:\s*[\d.]+vh/);
      expect(inner).not.toMatch(/height:\s*100%/);
    });
  }
});

describe('iOS印刷 再発防止 ⑤ svg.fb max-height は mm 実寸 (vh は iOS横印刷で破綻)', () => {
  // 履歴: max-height を vh にしていたが、iOS の横印刷では vh が viewport(縦持ち)基準で
  //   解決され用紙からはみ出した。mm 実寸 (印刷可能高さ÷行数 − 安全マージン) で縛る。
  for (const c of ALL) {
    it(`${c.label}: svg.fb に max-height mm (vh ではない)`, () => {
      const svg = c.layout.match(/svg\.fb\s*\{([^}]+)\}/)?.[1] ?? '';
      expect(svg).toMatch(/max-height:\s*[\d.]+mm/);
      expect(svg).not.toMatch(/max-height:\s*[\d.]+vh/);
    });
  }
  it('行数が多いほど svg max-height(mm) が小さい (1セルが小さくなる)', () => {
    const mmOf = (rows) => parseFloat(buildPrintCss({ orientation: 'portrait', cols: 2, rows }).layout.match(/max-height:\s*([\d.]+)mm/)[1]);
    expect(mmOf(2)).toBeGreaterThan(mmOf(3));
    expect(mmOf(3)).toBeGreaterThan(mmOf(5));
  });
  it('全レイアウトで rows×svgMaxMm + gap が印刷可能高さ未満 (1ページに必ず収まる)', () => {
    // 横:190mm / 縦:277mm の印刷可能高さに対し、行合計が必ず収まること (=2P空白を出さない)
    for (const c of ALL) {
      const svgMm = parseFloat(c.layout.match(/max-height:\s*([\d.]+)mm/)[1]);
      const printableH = c.orientation === 'landscape' ? 190 : 277;
      const total = c.rows * (svgMm + 4 /*card padding/border*/) + 3 * (c.rows - 1);
      expect(total).toBeLessThan(printableH);
    }
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
