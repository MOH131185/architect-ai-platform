function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function buildSectionWallDetailMarkup({
  walls = [],
  lineweights = {},
} = {}) {
  const markup = (walls || [])
    .map(
      (wall, index) => `
        <g id="phase13-section-cut-wall-${escapeXml(wall.id || index)}">
          <rect x="${wall.x}" y="${wall.y}" width="${wall.width}" height="${wall.height}" fill="#151515" fill-opacity="0.84" stroke="#111" stroke-width="${lineweights.cutOutline || 1.6}" />
          <line x1="${wall.x + wall.width * 0.2}" y1="${wall.y}" x2="${wall.x + wall.width * 0.2}" y2="${wall.y + wall.height}" stroke="#f4f1eb" stroke-width="${lineweights.guide || 0.62}" stroke-opacity="0.35" />
          <line x1="${wall.x + wall.width * 0.8}" y1="${wall.y}" x2="${wall.x + wall.width * 0.8}" y2="${wall.y + wall.height}" stroke="#f4f1eb" stroke-width="${lineweights.guide || 0.62}" stroke-opacity="0.35" />
        </g>`,
    )
    .join("");

  return {
    markup: `<g id="phase13-section-cut-walls">${markup}</g>`,
    count: (walls || []).length,
  };
}

export default {
  buildSectionWallDetailMarkup,
};
