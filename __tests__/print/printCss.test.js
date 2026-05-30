import { describe, it, expect } from 'vitest';
import { buildPrintCss } from '../../src/print/printCss.js';

const DEFAULT = { orientation: 'landscape', cols: 2, rows: 3 };

describe('buildPrintCss — orientation', () => {
  it('landscape sets A4 landscape @page', () => {
    const { orient } = buildPrintCss(DEFAULT);
    expect(orient).toContain('size: A4 landscape');
    expect(orient).not.toContain('portrait');
  });
  it('portrait sets A4 portrait @page', () => {
    const { orient } = buildPrintCss({ ...DEFAULT, orientation: 'portrait' });
    expect(orient).toContain('size: A4 portrait');
    expect(orient).not.toContain('landscape');
  });
});

describe('buildPrintCss — layout cols/gap (the actual bug)', () => {
  it('cols=1 → repeat(1, 1fr) with !important', () => {
    const { layout } = buildPrintCss({ ...DEFAULT, cols: 1 });
    expect(layout).toContain('grid-template-columns: repeat(1, 1fr) !important');
  });
  it('cols=2 → repeat(2, 1fr) with !important', () => {
    const { layout } = buildPrintCss({ ...DEFAULT, cols: 2 });
    expect(layout).toContain('grid-template-columns: repeat(2, 1fr) !important');
  });
  it('cols=3 → repeat(3, 1fr) with !important', () => {
    const { layout } = buildPrintCss({ ...DEFAULT, cols: 3 });
    expect(layout).toContain('grid-template-columns: repeat(3, 1fr) !important');
  });
  it('gap always 3mm with !important', () => {
    const { layout } = buildPrintCss(DEFAULT);
    expect(layout).toContain('gap: 3mm !important');
  });
  it('always sets display: grid (no !important needed)', () => {
    const { layout } = buildPrintCss(DEFAULT);
    expect(layout).toMatch(/#savedGrid\s*\{[^}]*display:\s*grid/);
  });
});

describe('buildPrintCss — fb-wrap padding override (secondary bug)', () => {
  it('fb-wrap padding has !important to beat #savedGrid.screen-grid .fb-wrap', () => {
    const { layout } = buildPrintCss(DEFAULT);
    expect(layout).toMatch(/\.fb-wrap[^{]*\{[^}]*padding:\s*1\.5mm 1\.5mm 1mm !important/);
  });
});

describe('buildPrintCss — derived font sizes (cellH)', () => {
  it('rows=1 portrait: titlePt clamped to 10 (cell uses full page height)', () => {
    const { layout } = buildPrintCss({ orientation: 'portrait', cols: 1, rows: 1 });
    expect(layout).toMatch(/font-size:\s*10\.0pt\s*!important/);
  });
  it('rows=5 portrait: titlePt computed (~6.0pt) and below clamp ceiling', () => {
    // cellH = (277 - 3*4)/5 = 53.0; titlePt = 53.0/9 = 5.888 → 5.9
    const { layout } = buildPrintCss({ orientation: 'portrait', cols: 2, rows: 5 });
    expect(layout).toContain('font-size: 5.9pt !important');
  });
  it('landscape rows=3: titlePt = clamp(5.5, 10, (190-6)/3/9) = clamp(..., 6.81) = 6.8', () => {
    const { layout } = buildPrintCss({ orientation: 'landscape', cols: 2, rows: 3 });
    expect(layout).toContain('font-size: 6.8pt !important');
  });
  it('landscape vs portrait at same rows produces different titlePt', () => {
    const land = buildPrintCss({ orientation: 'landscape', cols: 2, rows: 3 });
    const port = buildPrintCss({ orientation: 'portrait',  cols: 2, rows: 3 });
    expect(land.layout).not.toBe(port.layout);
  });
});

describe('buildPrintCss — output shape', () => {
  it('returns both orient and layout strings', () => {
    const out = buildPrintCss(DEFAULT);
    expect(typeof out.orient).toBe('string');
    expect(typeof out.layout).toBe('string');
    expect(out.orient.length).toBeGreaterThan(0);
    expect(out.layout.length).toBeGreaterThan(0);
  });
  it('layout block is wrapped in @media print', () => {
    const { layout } = buildPrintCss(DEFAULT);
    expect(layout.trim()).toMatch(/^@media print\s*\{/);
  });
});
