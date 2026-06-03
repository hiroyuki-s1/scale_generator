/**
 * pageGroup — ページグループ分割ロジック テスト
 *
 * calcPageGroupSizes は純粋関数なので DOM 不要でテスト可能。
 *
 * 検証項目:
 *   1. 0枚 → グループなし
 *   2. ちょうど perPage 枚 → 1グループ
 *   3. perPage+1 枚 → 2グループ (端数あり)
 *   4. 全 LAYOUT_PRESETS × 代表的カード枚数でグループ枚数の合計がtotalと一致
 *   5. 各グループが perPage 以下であること
 *   6. 最終グループのみ端数が許される (それ以外は perPage ちょうど)
 *   7. perPage < 1 で RangeError
 *   8. .print-page-break 挿入数 = グループ数 - 1 (2ページ目以降の先頭に1つずつ)
 */
import { describe, it, expect } from 'vitest';
import { calcPageGroupSizes } from '../../src/print/pageGroup.js';
import { LAYOUT_PRESETS } from '../../src/domain/constants.js';

// ── 基本ケース ────────────────────────────────────────────────────────────

describe('calcPageGroupSizes — 基本ケース', () => {
  it('total=0 → []', () => {
    expect(calcPageGroupSizes(0, 4)).toEqual([]);
  });

  it('total=perPage → [perPage] (1グループちょうど)', () => {
    expect(calcPageGroupSizes(4, 4)).toEqual([4]);
    expect(calcPageGroupSizes(1, 1)).toEqual([1]);
    expect(calcPageGroupSizes(6, 6)).toEqual([6]);
  });

  it('total=perPage+1 → [perPage, 1] (2ページ目に1枚)', () => {
    expect(calcPageGroupSizes(5, 4)).toEqual([4, 1]);
    expect(calcPageGroupSizes(2, 1)).toEqual([1, 1]);
  });

  it('total が perPage の倍数 → 全グループが perPage ちょうど', () => {
    expect(calcPageGroupSizes(8, 4)).toEqual([4, 4]);
    expect(calcPageGroupSizes(6, 2)).toEqual([2, 2, 2]);
    expect(calcPageGroupSizes(15, 5)).toEqual([5, 5, 5]);
  });

  it('total が perPage の倍数でない → 最終グループのみ端数', () => {
    const sizes = calcPageGroupSizes(10, 3);
    expect(sizes).toEqual([3, 3, 3, 1]);
  });

  it('perPage=1 → total 個のグループ (1枚ずつ)', () => {
    expect(calcPageGroupSizes(5, 1)).toEqual([1, 1, 1, 1, 1]);
  });

  it('perPage < 1 → RangeError', () => {
    expect(() => calcPageGroupSizes(5, 0)).toThrow(RangeError);
    expect(() => calcPageGroupSizes(5, -1)).toThrow(RangeError);
  });
});

// ── 不変条件 (invariant) ─────────────────────────────────────────────────

describe('calcPageGroupSizes — 不変条件', () => {
  // 代表的なカード枚数パターン
  const CARD_COUNTS = [0, 1, 2, 3, 5, 8, 9, 15, 16, 17, 20, 45];

  for (const [cols, rows] of LAYOUT_PRESETS) {
    const perPage = cols * rows;
    for (const total of CARD_COUNTS) {
      const label = `layout=${cols}×${rows}(perPage=${perPage}) total=${total}`;

      it(`[${label}] 合計枚数が total と一致する`, () => {
        const sizes = calcPageGroupSizes(total, perPage);
        const sum = sizes.reduce((a, b) => a + b, 0);
        expect(sum).toBe(total);
      });

      it(`[${label}] 各グループが perPage 以下`, () => {
        const sizes = calcPageGroupSizes(total, perPage);
        sizes.forEach((s, i) => {
          expect(s).toBeGreaterThan(0);
          expect(s).toBeLessThanOrEqual(perPage);
        });
      });

      it(`[${label}] 最終グループ以外は perPage ちょうど`, () => {
        const sizes = calcPageGroupSizes(total, perPage);
        sizes.slice(0, -1).forEach(s => {
          expect(s).toBe(perPage);
        });
      });

      it(`[${label}] グループ数が ceil(total/perPage) と一致`, () => {
        const sizes = calcPageGroupSizes(total, perPage);
        const expected = total === 0 ? 0 : Math.ceil(total / perPage);
        expect(sizes.length).toBe(expected);
      });

      it(`[${label}] .print-page-break 挿入数 = グループ数 - 1`, () => {
        const sizes = calcPageGroupSizes(total, perPage);
        const pageBreakCount = Math.max(0, sizes.length - 1);
        // 2ページ目以降の先頭に1つずつ挿入される
        expect(pageBreakCount).toBe(sizes.length > 0 ? sizes.length - 1 : 0);
      });
    }
  }
});
