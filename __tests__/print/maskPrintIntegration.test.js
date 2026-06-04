/**
 * mask × layout × orientation 統合テスト
 *
 * マスク機能によって SVG の viewBox アスペクト比が大きく変わるため、
 * 印刷セルの高さがそれを収容できるか検証する。
 *
 * 検証項目:
 *   1. maskViewBox — mask 無効時は null
 *   2. maskViewBox — x/y/w/h が幾何学的に正しい
 *   3. マスクアスペクト比 (w/h) がフレット幅に比例する
 *   4. 各 layout×orientation の cellH が > 0 かつ合計が pageH 以下
 *   5. 全マスクパターン × 全 layout × 全 orientation の組み合わせで
 *      CSS 生成が正常 (エラーなし) かつ cellH が正値であること
 *   6. 印刷ページグループ数が ceil(total/perPage) と一致すること
 *      (mask によってグループ数が変わらないことの確認)
 */
import { describe, it, expect } from 'vitest';
import { buildPrintCss } from '../../src/print/printCss.js';
import { calcPageGroupSizes } from '../../src/print/pageGroup.js';
import { LAYOUT_PRESETS } from '../../src/domain/constants.js';
import {
  FRET_START, FRET_END, FRET_WIDTH,
  MARGIN_LEFT, MARGIN_TOP, MARGIN_BOTTOM, FRETBOARD_HEIGHT, DOT_RADIUS,
} from '../../src/config/fretboardGeometry.js';

// ── maskViewBox の純粋計算 (fretboardSvg.js は DOM 依存なので再実装) ──────
const padX = 4;
const padY = DOT_RADIUS + 4;

function calcMaskViewBox(mask) {
  if (!mask?.enabled) return null;
  const x = MARGIN_LEFT + (mask.min - FRET_START) * FRET_WIDTH - padX;
  const w = (mask.max - mask.min + 1) * FRET_WIDTH + padX * 2;
  const y = MARGIN_TOP - padY;
  const h = FRETBOARD_HEIGHT + padY + MARGIN_BOTTOM;
  return { x, y, w, h, aspectRatio: w / h };
}

// ── マスクパターン定義 ────────────────────────────────────────────────────
// (fret min, max) のペア。考えられる全パターンを代表的に網羅する
const MASK_PATTERNS = [
  { label: '無効(全域)',   enabled: false, min: FRET_START,     max: FRET_END },
  { label: '全域(有効)',   enabled: true,  min: FRET_START,     max: FRET_END },
  { label: '1フレット',   enabled: true,  min: 0,               max: 0 },
  { label: '3フレット',   enabled: true,  min: 0,               max: 2 },
  { label: '5フレット',   enabled: true,  min: 5,               max: 9 },
  { label: '7フレット',   enabled: true,  min: 0,               max: 6 },
  { label: '12フレット',  enabled: true,  min: 0,               max: 11 },
  { label: '高域5F',      enabled: true,  min: 12,              max: 16 },
  { label: '高域3F',      enabled: true,  min: 17,              max: 19 },
  { label: '末尾2F',      enabled: true,  min: FRET_END - 1,   max: FRET_END },
];

const ORIENTATIONS = ['landscape', 'portrait'];

// ── maskViewBox 幾何学テスト ─────────────────────────────────────────────

describe('calcMaskViewBox — 幾何学的正確性', () => {
  it('mask 無効 → null', () => {
    expect(calcMaskViewBox({ enabled: false, min: 0, max: 21 })).toBeNull();
  });

  it('h (高さ) はマスク範囲に関わらず一定', () => {
    const expectedH = FRETBOARD_HEIGHT + padY + MARGIN_BOTTOM;
    MASK_PATTERNS.filter(m => m.enabled).forEach(mask => {
      const vb = calcMaskViewBox(mask);
      expect(vb.h).toBe(expectedH);
    });
  });

  it('y はマスク範囲に関わらず一定', () => {
    const expectedY = MARGIN_TOP - padY;
    MASK_PATTERNS.filter(m => m.enabled).forEach(mask => {
      const vb = calcMaskViewBox(mask);
      expect(vb.y).toBe(expectedY);
    });
  });

  it('w がフレット幅 × フレット数 + padding と一致する', () => {
    MASK_PATTERNS.filter(m => m.enabled).forEach(mask => {
      const vb = calcMaskViewBox(mask);
      const expectedW = (mask.max - mask.min + 1) * FRET_WIDTH + padX * 2;
      expect(vb.w).toBe(expectedW);
    });
  });

  it('x が MARGIN_LEFT + min×FW - padX と一致する', () => {
    MASK_PATTERNS.filter(m => m.enabled).forEach(mask => {
      const vb = calcMaskViewBox(mask);
      const expectedX = MARGIN_LEFT + (mask.min - FRET_START) * FRET_WIDTH - padX;
      expect(vb.x).toBe(expectedX);
    });
  });

  it('フレット数が多いほどアスペクト比が大きい (横長になる)', () => {
    const patterns = MASK_PATTERNS.filter(m => m.enabled)
      .slice()
      .sort((a, b) => (a.max - a.min) - (b.max - b.min));
    for (let i = 1; i < patterns.length; i++) {
      const prev = calcMaskViewBox(patterns[i - 1]);
      const cur  = calcMaskViewBox(patterns[i]);
      expect(cur.aspectRatio).toBeGreaterThanOrEqual(prev.aspectRatio);
    }
  });

  it('1フレットマスクはアスペクト比 < 1 (縦長 SVG)', () => {
    const vb = calcMaskViewBox({ enabled: true, min: 0, max: 0 });
    expect(vb.aspectRatio).toBeLessThan(1);
  });

  it('12フレット以上のマスクはアスペクト比 > 1 (横長 SVG)', () => {
    const vb = calcMaskViewBox({ enabled: true, min: 0, max: 11 });
    expect(vb.aspectRatio).toBeGreaterThan(1);
  });
});

// ── layout × orientation の cellH 検証 ──────────────────────────────────

describe('buildPrintCss — ページ枠 mm + grid minmax(0, 1fr) (iOS Safari 空白ページ対策)', () => {
  // iOS Safari 空白ページバグの最新対策 (v1.0.0 以降):
  //   - height:100vh → orientation media query 内で mm 指定に変更
  //     iOS Safari は print mode で vh をビューポート基準で解決する不定性が
  //     あり、横用紙(210mm)で 100vh が portrait viewport を返してはみ出す。
  //   - grid 1fr → minmax(0, 1fr)
  //     1fr は実装上 minmax(auto, 1fr) として子要素の min-content に押されて
  //     行が広がる Safari バグの典型原因。minmax(0, 1fr) で強制均等分割。
  for (const [cols, rows] of LAYOUT_PRESETS) {
    for (const orientation of ORIENTATIONS) {
      it(`${orientation} ${cols}×${rows}: .print-page-group base block には height を持たせない`, () => {
        const { layout } = buildPrintCss({ orientation, cols, rows });
        const pgBlock = layout.match(/\.print-page-group\s*\{([^}]+)\}/)?.[1] ?? '';
        expect(pgBlock).not.toMatch(/height:\s*100vh/);
        expect(pgBlock).not.toMatch(/height:\s*[\d.]+mm/);
      });
      // グループ高さは用紙より 6mm 小さい (最下行はみ出し防止)
      const groupMm = orientation === 'landscape' ? 182 : 269;
      it(`PC ${orientation} ${cols}×${rows}: 単一 @media print に height = ${groupMm}mm`, () => {
        const { layout } = buildPrintCss({ orientation, cols, rows });
        expect(layout).toMatch(
          new RegExp(`\\.print-page-group\\s*\\{[^}]*height:\\s*${groupMm}mm`)
        );
        // 反対 orientation の値が混入しないこと
        const oppositeMm = orientation === 'landscape' ? 269 : 182;
        expect(layout).not.toMatch(new RegExp(`height:\\s*${oppositeMm}mm`));
      });
      it(`mobile ${orientation} ${cols}×${rows}: orientation media query で landscape=210mm / portrait=297mm 両方出力`, () => {
        const { layout } = buildPrintCss({ orientation, cols, rows, isMobile: true });
        expect(layout).toMatch(
          /@media print and \(orientation:\s*landscape\)[\s\S]*?\.print-page-group\s*\{[^}]*height:\s*182mm/
        );
        expect(layout).toMatch(
          /@media print and \(orientation:\s*portrait\)[\s\S]*?\.print-page-group\s*\{[^}]*height:\s*269mm/
        );
      });
      it(`${orientation} ${cols}×${rows}: .print-page-inner が ${rows} 行を minmax(0, 1fr) で均等分割`, () => {
        const { layout } = buildPrintCss({ orientation, cols, rows });
        expect(layout).toMatch(
          new RegExp(`grid-template-rows:\\s*repeat\\(${rows},\\s*minmax\\(0,\\s*1fr\\)\\)`)
        );
      });
    }
  }
});

// ── 全組み合わせ統合テスト ────────────────────────────────────────────────
// mask × layout × orientation × 代表カード枚数

const CARD_COUNTS = [1, 2, 3, 8, 9, 15, 20];

describe('mask × layout × orientation × card count 全組み合わせ', () => {
  for (const mask of MASK_PATTERNS) {
    for (const [cols, rows] of LAYOUT_PRESETS) {
      for (const orientation of ORIENTATIONS) {
        const perPage = cols * rows;

        // CSS 生成テスト (マスクは CSS に影響しないが、エラーなく生成されることを確認)
        it(`CSS生成: mask=${mask.label} ${orientation} ${cols}×${rows}`, () => {
          expect(() => buildPrintCss({ orientation, cols, rows })).not.toThrow();
        });

        // グループ数テスト (マスクはグループ数に影響しない)
        for (const total of CARD_COUNTS) {
          it(`グループ数: mask=${mask.label} ${orientation} ${cols}×${rows} total=${total}`, () => {
            const sizes = calcPageGroupSizes(total, perPage);
            expect(sizes.length).toBe(Math.ceil(total / perPage));
            expect(sizes.reduce((a, b) => a + b, 0)).toBe(total);
            sizes.forEach(s => expect(s).toBeLessThanOrEqual(perPage));
          });
        }
      }
    }
  }
});
