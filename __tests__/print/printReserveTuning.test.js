/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  印刷1ページ高さの「予約量(PRINT_RESERVE_MM)」設計 — 再発防止 & 人間調整の記録
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 【経緯】印刷で「2P目空白 / 下端はみ出し / 上詰め」を何度も繰り返した末の結論:
 *   1. 高さに **vh は使わない**。iOS Safari は印刷時 vh を画面 viewport 基準で解決する
 *      ことがあり、スマホ(縦持ち)で横用紙を印刷すると 100vh が縦持ち viewport 高さ(大)に
 *      なって横用紙を超え、2P目空白になる。
 *   2. 高さは **用紙高から「予約量(mm)」を引いた控えめ mm 実寸**を `.print-page-inner`
 *      に与え、grid `minmax(0,1fr)` で cols×rows 均等分割する (各セルに1枚ずつ)。
 *      `height: auto` は上詰めに、`用紙ぴったりの mm` は iOS 物理余白で空白になるため不可。
 *   3. 予約量は **モバイルと PC で別** (PRINT_RESERVE_MM.mobile / .desktop):
 *      iOS/Android は印刷時に端末の隠し余白を大きく確保するので予約を大きく、PC ブラウザは
 *      @page margin を尊重するので予約を小さく(用紙いっぱい)する。
 *      **共用すると「モバイル基準→PCが上詰め」「PC基準→モバイルがはみ出し」になる**
 *      (実際にモバイル値を PC に流用して PC が上詰めになった → 分離して解決)。
 *
 * 【★最重要・人間調整が必要★】
 *   予約量の **最終値は iOS / 実プリンタの物理余白に依存し、headless では検証できない**。
 *   このユニットテストが守れるのは「構造」だけ:
 *     ・モバイルと PC で予約が分かれていること (上詰め/はみ出しの作り分け)
 *     ・PC は用紙いっぱい寄り (上詰めにしない)
 *     ・vh を使わず mm + 均等分割であること (他テストが担保)
 *   **具体的な mm 値が正しいかは人間が実機で印刷して合わせるもの**。値を疑う前に、
 *   まず実機で「縦/横」「スマホ/PC」を印刷確認すること。調整は printCss.js 上部の
 *   PRINT_RESERVE_MM だけを触る。
 */
import { describe, it, expect } from 'vitest';
import { buildPrintCss } from '../../src/print/printCss.js';
import { LAYOUT_PRESETS } from '../../src/domain/constants.js';

// .print-page-inner の height(mm) を取り出す
const innerMm = (opts) => {
  const inner = buildPrintCss(opts).layout.match(/\.print-page-inner\s*\{([^}]+)\}/)?.[1] ?? '';
  const m = inner.match(/height:\s*([\d.]+)mm/);
  return m ? parseFloat(m[1]) : NaN;
};

describe('印刷予約量 ① モバイルと PC で必ず分離する (共用すると上詰め/はみ出し)', () => {
  for (const orientation of ['portrait', 'landscape']) {
    it(`${orientation}: モバイルの1ページ枠 < PCの1ページ枠 (モバイルは予約が大きい)`, () => {
      const mob = innerMm({ orientation, cols: 2, rows: 2, isMobile: true });
      const pc  = innerMm({ orientation, cols: 2, rows: 2, isMobile: false });
      expect(mob).toBeGreaterThan(0);
      expect(pc).toBeGreaterThan(0);
      // モバイルは iOS 隠し余白ぶん予約が大きい → 使える高さは PC より小さいはず。
      // (両者が同じ = 予約を共用してしまった = PC上詰め or モバイルはみ出しの再発)
      expect(mob).toBeLessThan(pc);
    });
  }
});

describe('印刷予約量 ② PC は用紙いっぱい寄りに使う (PC上詰めの再発防止)', () => {
  // PC が極端に小さい枠(=上詰め)に退行していないことを守る。
  // 値はゆるめの下限 (実機調整の余地は残しつつ、モバイル値の流用=上詰めは確実に弾く)。
  it('PC 縦: 1ページ枠が 200mm 以上 (297mm 用紙の大半を使う)', () => {
    expect(innerMm({ orientation: 'portrait', cols: 2, rows: 2, isMobile: false }))
      .toBeGreaterThanOrEqual(200);
  });
  it('PC 横: 1ページ枠が 120mm 以上 (210mm 用紙の大半を使う)', () => {
    expect(innerMm({ orientation: 'landscape', cols: 2, rows: 2, isMobile: false }))
      .toBeGreaterThanOrEqual(120);
  });
});

describe('印刷予約量 ③ 全レイアウトで枠高さが正の mm で生成される (NaN/負値にしない)', () => {
  for (const [cols, rows] of LAYOUT_PRESETS) {
    for (const orientation of ['portrait', 'landscape']) {
      for (const isMobile of [true, false]) {
        it(`${orientation} ${cols}×${rows} isMobile=${isMobile}: 枠 height が正の mm`, () => {
          const h = innerMm({ orientation, cols, rows, isMobile });
          expect(Number.isFinite(h)).toBe(true);
          expect(h).toBeGreaterThan(0);
        });
      }
    }
  }
});

describe('印刷予約量 ④ 枠は vh を使わず mm で持つ (iOS横印刷の viewport基準破綻を回避)', () => {
  for (const isMobile of [true, false]) {
    for (const orientation of ['portrait', 'landscape']) {
      it(`${orientation} isMobile=${isMobile}: .print-page-inner の height は mm (vh/100vh 不使用)`, () => {
        const inner = buildPrintCss({ orientation, cols: 2, rows: 2, isMobile }).layout
          .match(/\.print-page-inner\s*\{([^}]+)\}/)?.[1] ?? '';
        expect(inner).toMatch(/height:\s*[\d.]+mm/);
        expect(inner).not.toMatch(/height:\s*[\d.]+vh/);
        expect(inner).not.toMatch(/height:\s*100vh/);
      });
    }
  }
});
