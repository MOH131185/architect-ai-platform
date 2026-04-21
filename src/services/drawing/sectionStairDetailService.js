function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function buildSectionStairDetailMarkup({
  stairs = [],
  lineweights = {},
} = {}) {
  const markup = (stairs || [])
    .map((stair) => {
      const truthState = String(stair.truthState || "direct").toLowerCase();
      const contextual = truthState !== "direct";
      const nearBoolean = stair.clipGeometry?.nearBoolean === true;
      const treadSpacing = stair.height / Math.max(1, stair.treadCount);
      const treads = Array.from({ length: stair.treadCount }, (_, index) => {
        const treadY = stair.y + treadSpacing * (index + 1);
        return `<line x1="${stair.x + 4}" y1="${treadY}" x2="${stair.x + stair.width - 4}" y2="${treadY}" stroke="#444" stroke-width="${lineweights.tertiary || 0.8}"${contextual ? ' stroke-dasharray="4 4" stroke-opacity="0.68"' : ""} />`;
      }).join("");
      return `
        <g id="phase14-section-stair-${escapeXml(stair.id || "stair")}">
          <rect x="${stair.x}" y="${stair.y}" width="${stair.width}" height="${stair.height}" fill="#efefef" fill-opacity="${nearBoolean ? 0.98 : 0.9}" stroke="#333" stroke-width="${nearBoolean ? lineweights.cutOutline || 1.6 : lineweights.primary || 1.2}"${contextual ? ' stroke-dasharray="5 4" stroke-opacity="0.76"' : ""} />
          ${treads}
          <line x1="${stair.x + 8}" y1="${stair.y + stair.height - 10}" x2="${stair.x + stair.width - 16}" y2="${stair.y + 12}" stroke="#111" stroke-width="${lineweights.secondary || 1}"${contextual ? ' stroke-dasharray="5 4" stroke-opacity="0.76"' : ""} marker-end="url(#phase14-stair-arrow)" />
          <text x="${stair.x + stair.width / 2}" y="${stair.y + 16}" font-size="10" font-family="Arial, sans-serif" text-anchor="middle" fill="${contextual ? "#4b5563" : "#111"}">STAIR</text>
        </g>`;
    })
    .join("");

  return {
    defs: `
      <marker id="phase14-stair-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto" markerUnits="strokeWidth">
        <path d="M0,0 L0,6 L6,3 z" fill="#111" />
      </marker>
    `,
    markup: `<g id="phase8-section-stair-cuts">${markup}</g>`,
    count: (stairs || []).length,
    treadCount: (stairs || []).reduce(
      (sum, stair) => sum + Number(stair.treadCount || 0),
      0,
    ),
  };
}

export default {
  buildSectionStairDetailMarkup,
};
