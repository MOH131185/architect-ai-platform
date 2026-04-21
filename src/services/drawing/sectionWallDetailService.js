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
      const bandCoverage = Math.max(
        0,
        Math.min(1, Number(wall.clipGeometry?.bandCoverageRatio || 0)),
      );
      const nearBoolean = wall.clipGeometry?.nearBoolean === true;
      const profileSegments = wall.clipGeometry?.profileSegments || [];
      const pocheOpacity = nearBoolean
        ? 0.9
        : contextual
          ? 0.62
          : 0.76 + bandCoverage * 0.1;
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
          <rect x="${wall.x}" y="${wall.y}" width="${wall.width}" height="${wall.height}" fill="#151515" fill-opacity="${pocheOpacity}" stroke="#111" stroke-width="${lineweights.cutOutline || 1.6}"${contextual ? ' stroke-dasharray="6 4"' : ""} />
          <rect x="${wall.x + Math.max(1.5, wall.width * 0.08)}" y="${wall.y + 1.5}" width="${Math.max(2, wall.width - Math.max(3, wall.width * 0.16))}" height="${Math.max(6, wall.height - 3)}" fill="none" stroke="#f5f2ec" stroke-width="${nearBoolean ? lineweights.hatch || 0.7 : lineweights.guide || 0.62}" stroke-opacity="${nearBoolean ? 0.42 : contextual ? 0.18 : 0.28}"${nearBoolean ? "" : ' stroke-dasharray="4 4"'} />
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
