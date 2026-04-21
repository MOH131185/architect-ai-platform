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
    .map((wall, index) => {
      const truthState = String(wall.truthState || "direct").toLowerCase();
      const contextual = truthState !== "direct";
      const profileSegments = wall.clipGeometry?.profileSegments || [];
      const interiorGuides =
        profileSegments.length > 1
          ? profileSegments
              .slice(1, -1)
              .map((segment, guideIndex) => {
                const ratio =
                  (guideIndex + 1) / Math.max(2, profileSegments.length);
                const guideX = wall.x + wall.width * ratio;
                return `<line x1="${guideX}" y1="${wall.y}" x2="${guideX}" y2="${wall.y + wall.height}" stroke="#f4f1eb" stroke-width="${lineweights.guide || 0.62}" stroke-opacity="${contextual ? 0.22 : 0.38}" />`;
              })
              .join("")
          : "";
      return `
        <g id="phase13-section-cut-wall-${escapeXml(wall.id || index)}">
          <rect x="${wall.x}" y="${wall.y}" width="${wall.width}" height="${wall.height}" fill="#151515" fill-opacity="${contextual ? 0.68 : 0.84}" stroke="#111" stroke-width="${lineweights.cutOutline || 1.6}"${contextual ? ' stroke-dasharray="6 4"' : ""} />
          <line x1="${wall.x + wall.width * 0.2}" y1="${wall.y}" x2="${wall.x + wall.width * 0.2}" y2="${wall.y + wall.height}" stroke="#f4f1eb" stroke-width="${lineweights.guide || 0.62}" stroke-opacity="${contextual ? 0.2 : 0.35}" />
          <line x1="${wall.x + wall.width * 0.8}" y1="${wall.y}" x2="${wall.x + wall.width * 0.8}" y2="${wall.y + wall.height}" stroke="#f4f1eb" stroke-width="${lineweights.guide || 0.62}" stroke-opacity="${contextual ? 0.2 : 0.35}" />
          ${interiorGuides}
        </g>`;
    })
    .join("");

  return {
    markup: `<g id="phase13-section-cut-walls">${markup}</g>`,
    count: (walls || []).length,
  };
}

export default {
  buildSectionWallDetailMarkup,
};
