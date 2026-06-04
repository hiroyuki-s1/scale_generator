import { describe, it, expect } from 'vitest';
import { buildPrintCss } from '../../src/print/printCss.js';

const DEFAULT = { orientation: 'landscape', cols: 2, rows: 3 };

describe('buildPrintCss — orientation', () => {
  // PC (isMobile 既定 false) は向きボタンで確定するため @page size を mm 明示。
  it('PC landscape sets explicit landscape mm dimensions (297×210)', () => {
    const { orient } = buildPrintCss(DEFAULT);
    expect(orient).toContain('size: 297mm 210mm');
  });
  it('PC portrait sets explicit portrait mm dimensions (210×297)', () => {
    const { orient } = buildPrintCss({ ...DEFAULT, orientation: 'portrait' });
    expect(orient).toContain('size: 210mm 297mm');
  });
  // モバイルは OS 印刷シートで向き切替 → size:auto で実用紙の向きに追従 (横印刷分割の根治)。
  it('mobile uses @page size: auto (向き明示 mm に戻さない)', () => {
    const land = buildPrintCss({ ...DEFAULT, isMobile: true });
    const port = buildPrintCss({ ...DEFAULT, orientation: 'portrait', isMobile: true });
    expect(land.orient).toContain('size: auto');
    expect(land.orient).not.toMatch(/size:\s*\d+mm\s+\d+mm/);
    expect(port.orient).toContain('size: auto');
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
  // スケール名は SVG 内へ焼き込む (bakePrintTitle) ため、HTML の .saved-print-title は
  // 印刷で非表示。これを表示に戻すとタイトルが二重 (SVG内 + HTML) になり、別要素ぶん
  // レイアウトが膨張して印刷崩れの原因になる → 必ず display:none を維持する。
  it('.saved-print-title は印刷で display:none (SVG 焼き込みと二重表示しない)', () => {
    const { layout } = buildPrintCss(DEFAULT);
    expect(layout).toMatch(/\.saved-print-title\s*\{[^}]*display:\s*none\s*!important/);
  });
  it('#savedGrid is block; grid layout is in .print-page-inner', () => {
    const { layout } = buildPrintCss(DEFAULT);
    expect(layout).toMatch(/#savedGrid\s*\{[^}]*display:\s*block/);
    expect(layout).toMatch(/\.print-page-group[^{]*\{[^}]*display:\s*block/);
    expect(layout).toMatch(/\.print-page-inner[^{]*\{[\s\S]*?display:\s*grid/);
  });
});

describe('buildPrintCss — 枠 height auto / 指板 mm (vh は iOS横印刷で破綻)', () => {
  it('.print-page-group に height を指定しない (vh も mm も)', () => {
    const { layout } = buildPrintCss(DEFAULT);
    const pg = layout.match(/\.print-page-group\s*\{([^}]+)\}/)?.[1] ?? '';
    expect(pg).not.toMatch(/height:\s*100vh/);
    expect(pg).not.toMatch(/height:\s*[\d.]+mm/);
  });
  it('改ページは隣接兄弟 page-break-before のみ (page-break-after 不使用)', () => {
    const { layout } = buildPrintCss(DEFAULT);
    expect(layout).toMatch(/\.print-page-group\s*\+\s*\.print-page-group\s*\{[^}]*page-break-before:\s*always/);
    const pg = layout.match(/\.print-page-group\s*\{([^}]+)\}/)?.[1] ?? '';
    expect(pg).not.toMatch(/page-break-after/);
  });
  it('svg.fb に max-height mm (vh ではない、行数で変わる)', () => {
    const r2 = buildPrintCss({ ...DEFAULT, rows: 2 }).layout.match(/max-height:\s*([\d.]+)mm/)?.[1];
    const r5 = buildPrintCss({ ...DEFAULT, rows: 5 }).layout.match(/max-height:\s*([\d.]+)mm/)?.[1];
    expect(parseFloat(r2)).toBeGreaterThan(parseFloat(r5)); // 行数が多いほど1セルが小さい
    expect(buildPrintCss(DEFAULT).layout).not.toMatch(/max-height:\s*[\d.]+vh/);
  });
});

describe('buildPrintCss — derived font sizes (cellMm)', () => {
  // usableH = sheetH - 50 (予約), sheetH = landscape:210 / portrait:297
  // cellMm = max(18, (usableH - 3*(rows-1)) / rows); titlePt = clamp(5.5, 10, cellMm / 9)
  it('portrait rows=1: titlePt clamp 上限 10.0pt', () => {
    // usableH=247, cellMm=247 → 247/9=27 → clamp 10.0
    const { layout } = buildPrintCss({ orientation: 'portrait', cols: 1, rows: 1 });
    expect(layout).toMatch(/font-size:\s*10\.0pt/);
  });
  it('portrait rows=5: cellMm=47 → titlePt clamp 下限 5.5', () => {
    // (247 - 3*4)/5 = 47.0; 47/9 = 5.22 → clamp 5.5
    const { layout } = buildPrintCss({ orientation: 'portrait', cols: 2, rows: 5 });
    expect(layout).toMatch(/font-size:\s*5\.5pt/);
  });
  it('landscape rows=3: cellMm≈51.3 → titlePt 5.7', () => {
    // usableH=160; (160 - 3*2)/3 = 51.33; 51.33/9 = 5.70 → 5.7
    const { layout } = buildPrintCss({ orientation: 'landscape', cols: 2, rows: 3 });
    expect(layout).toMatch(/font-size:\s*5\.7pt/);
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
