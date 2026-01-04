function createDimensionText({ x, y, text }) {
  return `<text x="${x}" y="${y}" font-size="12" fill="#555" text-anchor="middle">${text}</text>`;
}

export function injectDimensions(svgString, { length, width, scale, padding }) {
  if (!svgString || svgString.indexOf('</svg>') === -1) {
    return svgString;
  }

  const annotations = [];
  const lengthPx = (length || 20) * (scale || 50);
  const widthPx = (width || 12) * (scale || 50);

  annotations.push(
    `<line x1="${padding}" y1="${padding / 2}" x2="${padding + lengthPx}" y2="${padding / 2}" stroke="#999" stroke-dasharray="4 2" />`,
    createDimensionText({
      x: padding + lengthPx / 2,
      y: padding / 4,
      text: `${(length || 0).toFixed(2)} m`
    }),
    `<line x1="${padding / 2}" y1="${padding}" x2="${padding / 2}" y2="${padding + widthPx}" stroke="#999" stroke-dasharray="4 2" />`,
    createDimensionText({
      x: padding / 4,
      y: padding + widthPx / 2,
      text: `${(width || 0).toFixed(2)} m`
    })
  );

  return svgString.replace('</svg>', `${annotations.join('\n')}</svg>`);
}

