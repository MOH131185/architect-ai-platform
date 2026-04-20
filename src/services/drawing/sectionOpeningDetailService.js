function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function buildSectionOpeningDetailMarkup({
  openings = [],
  lineweights = {},
} = {}) {
  const markup = (openings || [])
    .map(
      (opening, index) => `
        <g id="phase13-section-cut-opening-${escapeXml(opening.id || index)}">
          <rect x="${opening.x}" y="${opening.y}" width="${opening.width}" height="${opening.height}" fill="#ffffff" stroke="#475569" stroke-width="${lineweights.secondary || 1}" />
          <line x1="${opening.x}" y1="${opening.y}" x2="${opening.x + opening.width}" y2="${opening.y}" stroke="#111" stroke-width="${lineweights.primary || 1.2}" />
          <line x1="${opening.x}" y1="${opening.y + opening.height}" x2="${opening.x + opening.width}" y2="${opening.y + opening.height}" stroke="#111" stroke-width="${lineweights.primary || 1.2}" />
          <line x1="${opening.x + 2}" y1="${opening.y + opening.height * 0.5}" x2="${opening.x + opening.width - 2}" y2="${opening.y + opening.height * 0.5}" stroke="#94a3b8" stroke-width="${lineweights.tertiary || 0.8}" />
        </g>`,
    )
    .join("");

  return {
    markup: `<g id="phase13-section-cut-openings">${markup}</g>`,
    count: (openings || []).length,
  };
}

export default {
  buildSectionOpeningDetailMarkup,
};
