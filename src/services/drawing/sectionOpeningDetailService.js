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
    .map((opening, index) => {
      const truthState = String(opening.truthState || "direct").toLowerCase();
      const contextual = truthState !== "direct";
      const nearBoolean = opening.clipGeometry?.nearBoolean === true;
      const jambInset = Math.max(2, opening.width * 0.14);
      return `
        <g id="phase13-section-cut-opening-${escapeXml(opening.id || index)}">
          <rect x="${opening.x}" y="${opening.y}" width="${opening.width}" height="${opening.height}" fill="#ffffff" stroke="#475569" stroke-width="${lineweights.secondary || 1}"${contextual ? ' stroke-dasharray="5 4" stroke-opacity="0.76"' : ""} />
          <line x1="${opening.x}" y1="${opening.y}" x2="${opening.x + opening.width}" y2="${opening.y}" stroke="#111" stroke-width="${nearBoolean ? lineweights.cutOutline || 1.6 : lineweights.primary || 1.2}"${contextual ? ' stroke-dasharray="5 4" stroke-opacity="0.78"' : ""} />
          <line x1="${opening.x}" y1="${opening.y + opening.height}" x2="${opening.x + opening.width}" y2="${opening.y + opening.height}" stroke="#111" stroke-width="${nearBoolean ? lineweights.cutOutline || 1.6 : lineweights.primary || 1.2}"${contextual ? ' stroke-dasharray="5 4" stroke-opacity="0.78"' : ""} />
          <line x1="${opening.x + jambInset}" y1="${opening.y}" x2="${opening.x + jambInset}" y2="${opening.y + opening.height}" stroke="#64748b" stroke-width="${lineweights.tertiary || 0.8}" stroke-opacity="${contextual ? 0.46 : 0.7}" />
          <line x1="${opening.x + opening.width - jambInset}" y1="${opening.y}" x2="${opening.x + opening.width - jambInset}" y2="${opening.y + opening.height}" stroke="#64748b" stroke-width="${lineweights.tertiary || 0.8}" stroke-opacity="${contextual ? 0.46 : 0.7}" />
          <line x1="${opening.x + 2}" y1="${opening.y + opening.height * 0.5}" x2="${opening.x + opening.width - 2}" y2="${opening.y + opening.height * 0.5}" stroke="#94a3b8" stroke-width="${lineweights.tertiary || 0.8}" stroke-opacity="${contextual ? 0.56 : 0.82}" />
          ${nearBoolean ? `<line x1="${opening.x + 2}" y1="${opening.y + opening.height * 0.22}" x2="${opening.x + opening.width - 2}" y2="${opening.y + opening.height * 0.22}" stroke="#64748b" stroke-width="${lineweights.guide || 0.62}" stroke-opacity="0.68" />` : ""}
        </g>`;
    })
    .join("");

  return {
    markup: `<g id="phase13-section-cut-openings">${markup}</g>`,
    count: (openings || []).length,
  };
}

export default {
  buildSectionOpeningDetailMarkup,
};
