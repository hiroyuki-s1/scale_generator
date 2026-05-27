export function initPrintCss(store) {
  const orientEl = document.getElementById('print-orient');
  const layoutEl = document.getElementById('print-layout');

  function update() {
    const { orientation, cols, rows } = store.get().layout;
    orientEl.textContent = `@media print { @page { size: A4 ${orientation}; margin: 10mm 12mm; } }`;

    const isLand = orientation === 'landscape';
    const pageH = isLand ? 190 : 277;
    const gapMm = 3;
    const cellH = (pageH - gapMm * (rows - 1)) / rows;

    const clamp = (lo, hi, v) => Math.max(lo, Math.min(hi, v));
    const titlePt = clamp(5.5, 10, cellH / 9).toFixed(1);
    const legPt   = clamp(5,   8,  cellH / 11).toFixed(1);
    const legDot  = clamp(9,   16, cellH / 7).toFixed(0);

    layoutEl.textContent = `
@media print {
  #savedGrid {
    display: grid;
    grid-template-columns: repeat(${cols}, 1fr);
    gap: ${gapMm}mm;
    align-items: start;
  }
  .saved-card { break-inside: avoid; margin: 0 !important; padding: 0; }
  .fb-header, .saved-card-header { margin-bottom: 1mm; }
  .fb-title, .saved-title-input {
    font-size: ${titlePt}pt !important;
    line-height: 1.2;
  }
  .fb-wrap, .saved-card .fb-wrap {
    padding: 1.5mm 1.5mm 1mm;
    overflow: visible;
    border: 1px solid #ddd !important;
    border-radius: 2px !important;
    box-shadow: none !important;
  }
  svg.fb { min-width: 0 !important; width: 100% !important; height: auto !important; display: block !important; }
  .legend { margin-top: 1mm; gap: 3px; }
  .legend-chip { font-size: ${legPt}pt !important; padding: 1px 5px 1px 3px !important; }
  .legend-dot  { width: ${legDot}px !important; height: ${legDot}px !important; font-size: 5px !important; }
}`;
  }

  update();
  store.subscribe((s, p) => {
    if (p && s.layout === p.layout) return;
    update();
  });
}
