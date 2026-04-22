import { isFeatureEnabled } from "../../config/featureFlags.js";

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function phase21SectionGraphicsEnabled() {
  return (
    isFeatureEnabled("useDraftingGradeSectionGraphicsPhase21") ||
    isFeatureEnabled("useTrueGeometricSectioningPhase21")
  );
}

function resolveWallTruthKind(wall = {}) {
  const kind =
    wall.truthKind ||
    wall.clipGeometry?.truthKind ||
    (wall.clipGeometry?.nearBoolean
      ? "cut_profile"
      : String(wall.truthState || "direct").toLowerCase() === "direct"
        ? "cut_profile"
        : String(wall.truthState || "direct").toLowerCase() === "contextual"
          ? "contextual_profile"
          : "derived_profile");
  return kind;
}

export function buildSectionWallDetailMarkup({
  walls = [],
  lineweights = {},
} = {}) {
  const phase21 = phase21SectionGraphicsEnabled();
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
      const profileContinuity = Math.max(
        0,
        Math.min(1, Number(wall.clipGeometry?.profileContinuity || 0)),
      );
      const truthKind = phase21 ? resolveWallTruthKind(wall) : null;
      const isCutFace = phase21 && truthKind === "cut_face";
      const isCutProfile = phase21 && truthKind === "cut_profile";
      const pocheOpacity = isCutFace
        ? 0.96
        : isCutProfile
          ? 0.86 + bandCoverage * 0.06
          : nearBoolean
            ? 0.9
            : contextual
              ? 0.62
              : 0.76 + bandCoverage * 0.1;
      const outlineWeight = isCutFace
        ? Math.max(2, (lineweights.cutOutline || 1.6) * 1.22)
        : isCutProfile
          ? Math.max(1.7, (lineweights.cutOutline || 1.6) * 1.08)
          : lineweights.cutOutline || 1.6;
      const dashArray =
        isCutFace || (!contextual && !isCutProfile)
          ? ""
          : isCutProfile
            ? ""
            : contextual
              ? ' stroke-dasharray="6 4"'
              : "";
      const interiorHatchOpacity = isCutFace
        ? 0.54
        : isCutProfile
          ? 0.48 + profileContinuity * 0.08
          : nearBoolean
            ? 0.42
            : contextual
              ? 0.18
              : 0.28;
      const interiorHatchDash =
        isCutFace || nearBoolean ? "" : ' stroke-dasharray="4 4"';
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
      const cutFaceReveal = isCutFace
        ? `<rect x="${wall.x}" y="${wall.y}" width="${wall.width}" height="${Math.max(2, Math.min(6, wall.height * 0.09))}" fill="#0b0b0b" fill-opacity="0.55" />`
        : "";
      return `
        <g id="phase13-section-cut-wall-${escapeXml(wall.id || index)}" data-truth-kind="${escapeXml(truthKind || truthState)}">
          <rect x="${wall.x}" y="${wall.y}" width="${wall.width}" height="${wall.height}" fill="#151515" fill-opacity="${pocheOpacity}" stroke="#111" stroke-width="${outlineWeight}"${dashArray} />
          ${cutFaceReveal}
          <rect x="${wall.x + Math.max(1.5, wall.width * 0.08)}" y="${wall.y + 1.5}" width="${Math.max(2, wall.width - Math.max(3, wall.width * 0.16))}" height="${Math.max(6, wall.height - 3)}" fill="none" stroke="#f5f2ec" stroke-width="${isCutFace ? (lineweights.hatch || 0.7) * 1.2 : nearBoolean ? lineweights.hatch || 0.7 : lineweights.guide || 0.62}" stroke-opacity="${interiorHatchOpacity}"${interiorHatchDash} />
          <line x1="${wall.x + wall.width * 0.2}" y1="${wall.y}" x2="${wall.x + wall.width * 0.2}" y2="${wall.y + wall.height}" stroke="#f4f1eb" stroke-width="${lineweights.guide || 0.62}" stroke-opacity="${isCutFace ? 0.46 : contextual ? 0.2 : 0.35}" />
          <line x1="${wall.x + wall.width * 0.8}" y1="${wall.y}" x2="${wall.x + wall.width * 0.8}" y2="${wall.y + wall.height}" stroke="#f4f1eb" stroke-width="${lineweights.guide || 0.62}" stroke-opacity="${isCutFace ? 0.46 : contextual ? 0.2 : 0.35}" />
          ${interiorGuides}
        </g>`;
    })
    .join("");

  const cutFaceCount = phase21
    ? (walls || []).filter((wall) => resolveWallTruthKind(wall) === "cut_face")
        .length
    : 0;
  const cutProfileCount = phase21
    ? (walls || []).filter(
        (wall) => resolveWallTruthKind(wall) === "cut_profile",
      ).length
    : 0;

  return {
    markup: `<g id="phase13-section-cut-walls">${markup}</g>`,
    count: (walls || []).length,
    cutFaceCount,
    cutProfileCount,
    phase21,
  };
}

export default {
  buildSectionWallDetailMarkup,
};
