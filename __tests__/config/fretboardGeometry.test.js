/**
 * 指板ジオメトリ設定の派生値が壊れないことを確認する不変条件テスト。
 *
 * config/fretboardGeometry.js は開発者がノブを書き換えるためのファイル。
 * 派生値 (SVG.W / SVG.FBW / SVG.SH ...) は手で書き換えてはいけない。
 * 本テストは「ノブと派生値の関係」を回帰防止としてロックする。
 */
import { describe, it, expect } from 'vitest';
import {
  SVG,
  FRET_START,
  FRET_END,
  FRET_WIDTH,
  FRETBOARD_HEIGHT,
  DOT_RADIUS,
  STRING_PADDING,
  MARGIN_LEFT,
  MARGIN_RIGHT,
  MARGIN_TOP,
  MARGIN_BOTTOM,
} from '../../src/config/fretboardGeometry.js';

describe('fretboardGeometry — primary knobs surface on SVG', () => {
  it('SVG.FW equals FRET_WIDTH', () => {
    expect(SVG.FW).toBe(FRET_WIDTH);
  });
  it('SVG.FBH equals FRETBOARD_HEIGHT', () => {
    expect(SVG.FBH).toBe(FRETBOARD_HEIGHT);
  });
  it('SVG.CR equals DOT_RADIUS', () => {
    expect(SVG.CR).toBe(DOT_RADIUS);
  });
  it('SVG.SP equals STRING_PADDING', () => {
    expect(SVG.SP).toBe(STRING_PADDING);
  });
  it('SVG margins match', () => {
    expect(SVG.ML).toBe(MARGIN_LEFT);
    expect(SVG.MR).toBe(MARGIN_RIGHT);
    expect(SVG.MT).toBe(MARGIN_TOP);
    expect(SVG.MB).toBe(MARGIN_BOTTOM);
  });
  it('SVG.F0 / F1 match FRET_START / FRET_END', () => {
    expect(SVG.F0).toBe(FRET_START);
    expect(SVG.F1).toBe(FRET_END);
  });
});

describe('fretboardGeometry — derived dimensions', () => {
  it('SVG.FBW = FRET_WIDTH × number-of-frets', () => {
    expect(SVG.FBW).toBe(FRET_WIDTH * (FRET_END - FRET_START + 1));
  });
  it('SVG.W = SVG.FBW + MARGIN_LEFT + MARGIN_RIGHT', () => {
    expect(SVG.W).toBe(SVG.FBW + MARGIN_LEFT + MARGIN_RIGHT);
  });
  it('SVG.H = FRETBOARD_HEIGHT + MARGIN_TOP + MARGIN_BOTTOM', () => {
    expect(SVG.H).toBe(FRETBOARD_HEIGHT + MARGIN_TOP + MARGIN_BOTTOM);
  });
  it('SVG.SH (guitar) = (FBH − 2×SP) / 5  // 6弦 → 5gap', () => {
    expect(SVG.SH).toBe((FRETBOARD_HEIGHT - 2 * STRING_PADDING) / 5);
  });
  it('SVG.SH_BASS = (FBH − 2×SP) / 3  // 4弦 → 3gap', () => {
    expect(SVG.SH_BASS).toBe((FRETBOARD_HEIGHT - 2 * STRING_PADDING) / 3);
  });
});

describe('fretboardGeometry — nut / fret line positions follow FRET_WIDTH', () => {
  // Nut is the line between fret 0 and fret 1.
  it('nut x-coordinate = ML + FW', () => {
    const nutX = SVG.ML + SVG.FW;
    expect(nutX).toBe(MARGIN_LEFT + FRET_WIDTH);
  });
  // Right edge of the visible fretboard equals ML + FBW exactly,
  // so the last fret line and right boundary coincide.
  it('right edge of fretboard = ML + FBW = ML + FW × N', () => {
    expect(SVG.ML + SVG.FBW).toBe(MARGIN_LEFT + FRET_WIDTH * (FRET_END - FRET_START + 1));
  });
});

describe('fretboardGeometry — sanity', () => {
  it('FRET_START < FRET_END', () => {
    expect(FRET_START).toBeLessThan(FRET_END);
  });
  it('all primary knobs are positive numbers', () => {
    for (const v of [FRET_WIDTH, FRETBOARD_HEIGHT, DOT_RADIUS, STRING_PADDING,
                     MARGIN_LEFT, MARGIN_RIGHT, MARGIN_TOP, MARGIN_BOTTOM]) {
      expect(typeof v).toBe('number');
      expect(v).toBeGreaterThan(0);
    }
  });
});

describe('fretboardGeometry — re-export through domain/constants is consistent', () => {
  // 既存コードは `import { SVG, FRET_START, FRET_END } from 'domain/constants'`
  // の経路で参照する。re-export の同一性を保証する。
  it('domain/constants re-exports the same SVG object', async () => {
    const constants = await import('../../src/domain/constants.js');
    expect(constants.SVG).toBe(SVG);
    expect(constants.FRET_START).toBe(FRET_START);
    expect(constants.FRET_END).toBe(FRET_END);
  });
});
