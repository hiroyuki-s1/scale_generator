import { DEGREES, NOTES, DEFAULT_COLORS } from '../domain/constants.js';

export function renderLegend(container, scale) {
  const colors = scale.degreeColors || DEFAULT_COLORS;
  container.innerHTML = '';
  [...scale.activeDegrees].sort((a, b) => a - b).forEach(i => {
    const { name } = DEGREES[i];
    const dc = colors[i];
    const chip = document.createElement('div');
    chip.className = 'legend-chip';
    chip.style.cssText = `background:${dc.solid ? dc.color : '#fff'};border-color:${dc.color};color:${dc.text}`;
    const dot = document.createElement('div');
    dot.className = 'legend-dot';
    dot.style.cssText = `background:${dc.solid ? dc.color : '#fff'};border:1.5px solid ${dc.color};color:${dc.text}`;
    dot.textContent = name.length <= 2 ? name : '';
    chip.appendChild(dot);
    chip.appendChild(document.createTextNode(name));
    container.appendChild(chip);
  });
}
