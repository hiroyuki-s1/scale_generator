import { describe, it, expect } from 'vitest';
import { buildPrintCss } from '../../src/print/printCss.js';

const DEFAULT = { orientation: 'landscape', cols: 2, rows: 3 };

describe('buildPrintCss — orientation', () => {
  // `size: A4 landscape` 表記はモバイル Safari / Android Chrome で respect されにくいので、
  // 明示的な mm 寸法 (297×210 / 210×297) で出力する設計に変更済み。
  it('landscape sets explicit landscape mm dimensions (297×210)', () => {
    const { orient } = buildPrintCss(DEFAULT);
    expect(orient).toContain('size: 297mm 210mm');
  });
  it('portrait sets explicit portrait mm dimensions (210×297)', () => {
    const { orient } = buildPrintCss({ ...DEFAULT, orientation: 'portrait' });
    expect(orient).toContain('size: 210mm 297mm');
  });
  it('orient string always contains @page and margin:13mm (iOS 物理余白を内側に収める)', () => {
    // @page margin:0 だと iOS Safari が用紙端まで描画し、AirPrint 物理余白
    // (~10mm) や Safari デフォルト余白(~12.7mm)で最下部が溢れて2P目空白になる。
    // 物理余白以上の 13mm を設定してコンテンツを余白の内側に確実に収める。
    const land = buildPrintCss(DEFAULT);
    const port = buildPrintCss({ ...DEFAULT, orientation: 'portrait' });
    expect(land.orient).toContain('@page');
    expect(land.orient).toMatch(/margin:\s*13mm/);
    expect(port.orient).toContain('@page');
    expect(port.orient).toMatch(/margin:\s*13mm/);
  });

  // iOS 横印刷の空白ページ対策: モバイルは @page size:auto で用紙の向きに追従させる
  it('isMobile=true sets @page size:auto (用紙の向きに追従, iOS 横印刷の空白防止)', () => {
    const land = buildPrintCss({ ...DEFAULT, isMobile: true });
    const port = buildPrintCss({ ...DEFAULT, orientation: 'portrait', isMobile: true });
    expect(land.orient).toContain('size: auto');
    expect(port.orient).toContain('size: auto');
    // mm 固定は出さない (固定すると横切替で 100vh がはみ出す)
    expect(land.orient).not.toContain('297mm 210mm');
    expect(port.orient).not.toContain('210mm 297mm');
  });

  it('isMobile=false (PC) は従来通り mm 寸法で size 指定 (向きボタン有効)', () => {
    const land = buildPrintCss({ ...DEFAULT, isMobile: false });
    expect(land.orient).toContain('size: 297mm 210mm');
  });
});

describe('buildPrintCss — layout cols/gap (the actual bug)', () => {
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
  it('#savedGrid is block container; grid layout is in .print-page-inner', () => {
    const { layout } = buildPrintCss(DEFAULT);
    // #savedGrid はラッパーのみ
    expect(layout).toMatch(/#savedGrid\s*\{[^}]*display:\s*block/);
    // .print-page-group は block div (page-break-after 用)、グリッドは .print-page-inner
    expect(layout).toMatch(/\.print-page-group[^{]*\{[^}]*display:\s*block/);
    expect(layout).toMatch(/\.print-page-inner[^{]*\{[\s\S]*?display:\s*grid/);
  });
});

describe('buildPrintCss — fb-wrap padding override (secondary bug)', () => {
  it('fb-wrap padding has !important to beat #savedGrid.screen-grid .fb-wrap', () => {
    const { layout } = buildPrintCss(DEFAULT);
    expect(layout).toMatch(/\.fb-wrap[^{]*\{[^}]*padding:\s*1\.5mm 1\.5mm 1mm !important/);
  });
});

describe('buildPrintCss — derived font sizes (cellH)', () => {
  // 計算式: cellH = (groupHmm - 2*padV - gapMm*(rows-1)) / rows
  //   groupHmm = printableHmm - SAFETY = landscape:182 / portrait:269 (@page margin 13mm)
  //   padV=3mm, gapMm=3mm / titlePt = clamp(5.5, 10, cellH / 9)
  // PC は orientation 引数固定の単一ブロック、mobile は orientation media query 両方
  it('PC portrait rows=1: titlePt が clamp 上限 10.0pt', () => {
    const { layout } = buildPrintCss({ orientation: 'portrait', cols: 1, rows: 1 });
    expect(layout).toMatch(/font-size:\s*10\.0pt/);
  });
  it('PC portrait rows=5: titlePt 5.6', () => {
    // groupHmm=269, padV=3: cellH=(269-6-12)/5=50.2; 50.2/9=5.58 → 5.6
    const { layout } = buildPrintCss({ orientation: 'portrait', cols: 2, rows: 5 });
    expect(layout).toMatch(/font-size:\s*5\.6pt/);
  });
  it('PC landscape rows=3: titlePt 6.3', () => {
    // groupHmm=182, padV=3: cellH=(182-6-6)/3=56.67; 56.67/9=6.30 → 6.3
    const { layout } = buildPrintCss({ orientation: 'landscape', cols: 2, rows: 3 });
    expect(layout).toMatch(/font-size:\s*6\.3pt/);
  });
  it('mobile: landscape と portrait の titlePt が異なる (両方の media query block 出力)', () => {
    const { layout } = buildPrintCss({ orientation: 'landscape', cols: 2, rows: 3, isMobile: true });
    const landMatch = layout.match(
      /@media print and \(orientation:\s*landscape\)[\s\S]*?font-size:\s*([\d.]+)pt/
    );
    const portMatch = layout.match(
      /@media print and \(orientation:\s*portrait\)[\s\S]*?font-size:\s*([\d.]+)pt/
    );
    expect(landMatch?.[1]).not.toBe(portMatch?.[1]);
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
