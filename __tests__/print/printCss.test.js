import { describe, it, expect } from 'vitest';
import { buildPrintCss } from '../../src/print/printCss.js';

const DEFAULT = { orientation: 'landscape', cols: 2, rows: 3 };

describe('buildPrintCss — orientation', () => {
  it('landscape sets explicit landscape mm dimensions (297×210)', () => {
    const { orient } = buildPrintCss(DEFAULT);
    expect(orient).toContain('size: 297mm 210mm');
  });
  it('portrait sets explicit portrait mm dimensions (210×297)', () => {
    const { orient } = buildPrintCss({ ...DEFAULT, orientation: 'portrait' });
    expect(orient).toContain('size: 210mm 297mm');
  });
  it('@page margin は 10mm 12mm (margin:0 は iOS で用紙端まで描画し2P空白)', () => {
    // height:100vh は印刷ページに追従するので margin があっても干渉しない。
    // むしろ margin:0 だと iOS Safari が用紙端まで描画し物理余白で溢れる。
    const land = buildPrintCss(DEFAULT);
    const port = buildPrintCss({ ...DEFAULT, orientation: 'portrait' });
    expect(land.orient).toMatch(/margin:\s*10mm\s+12mm/);
    expect(port.orient).toMatch(/margin:\s*10mm\s+12mm/);
  });
});

describe('buildPrintCss — layout cols/gap', () => {
  it('cols=1 → repeat(1, minmax(0, 1fr)) with !important', () => {
    const { layout } = buildPrintCss({ ...DEFAULT, cols: 1 });
    expect(layout).toContain('grid-template-columns: repeat(1, minmax(0, 1fr)) !important');
  });
  it('cols=2 → repeat(2, minmax(0, 1fr)) with !important', () => {
    const { layout } = buildPrintCss({ ...DEFAULT, cols: 2 });
    expect(layout).toContain('grid-template-columns: repeat(2, minmax(0, 1fr)) !important');
  });
  it('cols=3 → repeat(3, minmax(0, 1fr)) with !important', () => {
    const { layout } = buildPrintCss({ ...DEFAULT, cols: 3 });
    expect(layout).toContain('grid-template-columns: repeat(3, minmax(0, 1fr)) !important');
  });
  it('gap always 3mm with !important', () => {
    const { layout } = buildPrintCss(DEFAULT);
    expect(layout).toContain('gap: 3mm !important');
  });
  it('#savedGrid is block; grid layout is in .print-page-inner', () => {
    const { layout } = buildPrintCss(DEFAULT);
    expect(layout).toMatch(/#savedGrid\s*\{[^}]*display:\s*block/);
    expect(layout).toMatch(/\.print-page-group[^{]*\{[^}]*display:\s*block/);
    expect(layout).toMatch(/\.print-page-inner[^{]*\{[\s\S]*?display:\s*grid/);
  });
});

describe('buildPrintCss — ページ枠 height:100vh (iOS ページ追従)', () => {
  it('.print-page-group は height:100vh (mm固定にしない)', () => {
    const { layout } = buildPrintCss(DEFAULT);
    const pg = layout.match(/\.print-page-group\s*\{([^}]+)\}/)?.[1] ?? '';
    expect(pg).toMatch(/height:\s*100vh/);
    expect(pg).not.toMatch(/height:\s*[\d.]+mm/);
  });
  it('改ページは隣接兄弟 page-break-before のみ (page-break-after 不使用)', () => {
    const { layout } = buildPrintCss(DEFAULT);
    expect(layout).toMatch(/\.print-page-group\s*\+\s*\.print-page-group\s*\{[^}]*page-break-before:\s*always/);
    const pg = layout.match(/\.print-page-group\s*\{([^}]+)\}/)?.[1] ?? '';
    expect(pg).not.toMatch(/page-break-after/);
  });
  it('svg.fb に max-height vh (マスク縦長対策、行数で変わる)', () => {
    const r2 = buildPrintCss({ ...DEFAULT, rows: 2 }).layout.match(/max-height:\s*([\d.]+)vh/)?.[1];
    const r5 = buildPrintCss({ ...DEFAULT, rows: 5 }).layout.match(/max-height:\s*([\d.]+)vh/)?.[1];
    expect(parseFloat(r2)).toBeGreaterThan(parseFloat(r5)); // 行数が多いほど1セルが小さい
  });
});

describe('buildPrintCss — derived font sizes (cellH)', () => {
  // cellH = (pageH - gapMm*(rows-1)) / rows, pageH = landscape:190 / portrait:277
  // titlePt = clamp(5.5, 10, cellH / 9)
  it('portrait rows=1: titlePt clamp 上限 10.0pt', () => {
    const { layout } = buildPrintCss({ orientation: 'portrait', cols: 1, rows: 1 });
    expect(layout).toMatch(/font-size:\s*10\.0pt/);
  });
  it('portrait rows=5: cellH=53.0 → titlePt 5.9', () => {
    // (277 - 3*4)/5 = 53.0; 53.0/9 = 5.89 → 5.9
    const { layout } = buildPrintCss({ orientation: 'portrait', cols: 2, rows: 5 });
    expect(layout).toMatch(/font-size:\s*5\.9pt/);
  });
  it('landscape rows=3: cellH=61.33 → titlePt 6.8', () => {
    // (190 - 3*2)/3 = 61.33; 61.33/9 = 6.81 → 6.8
    const { layout } = buildPrintCss({ orientation: 'landscape', cols: 2, rows: 3 });
    expect(layout).toMatch(/font-size:\s*6\.8pt/);
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
