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

function resolveOpeningTruthKind(opening = {}) {
  return (
    opening.truthKind ||
    opening.clipGeometry?.truthKind ||
    (opening.clipGeometry?.nearBoolean
      ? "cut_profile"
      : String(opening.truthState || "direct").toLowerCase() === "direct"
        ? "cut_profile"
        : String(opening.truthState || "direct").toLowerCase() === "contextual"
          ? "contextual_profile"
          : "derived_profile")
  );
}

export function buildSectionOpeningDetailMarkup({
  openings = [],
  lineweights = {},
} = {}) {
  const phase21 = phase21SectionGraphicsEnabled();
  const markup = (openings || [])
    .map((opening, index) => {
      const truthState = String(opening.truthState || "direct").toLowerCase();
      const contextual = truthState !== "direct";
      const nearBoolean = opening.clipGeometry?.nearBoolean === true;
      const truthKind = phase21 ? resolveOpeningTruthKind(opening) : null;
      const isCutFace = phase21 && truthKind === "cut_face";
      const isCutProfile = phase21 && truthKind === "cut_profile";
      const jambInset = Math.max(2, opening.width * 0.14);
      const frameWeight = isCutFace
        ? (lineweights.cutOutline || 1.6) * 1.2
        : isCutProfile
          ? (lineweights.cutOutline || 1.6) * 1.05
          : nearBoolean
            ? lineweights.cutOutline || 1.6
            : lineweights.primary || 1.2;
      const frameDash =
        isCutFace || isCutProfile
          ? ""
          : contextual
            ? ' stroke-dasharray="5 4" stroke-opacity="0.78"'
            : "";
      const bodyDash =
        isCutFace || isCutProfile
          ? ""
          : contextual
            ? ' stroke-dasharray="5 4" stroke-opacity="0.76"'
            : "";
      const jambOpacity = isCutFace
        ? 0.92
        : isCutProfile
          ? 0.8
          : contextual
            ? 0.46
            : 0.7;
      const centerOpacity = isCutFace
        ? 0.96
        : isCutProfile
          ? 0.88
          : contextual
            ? 0.56
            : 0.82;
      const cutFaceSill = isCutFace
        ? `<rect x="${opening.x}" y="${opening.y + opening.height - Math.max(1.6, opening.height * 0.1)}" width="${opening.width}" height="${Math.max(1.6, opening.height * 0.1)}" fill="#1f2937" fill-opacity="0.68" />`
        : "";
      const cutFaceHead = isCutFace
        ? `<rect x="${opening.x}" y="${opening.y}" width="${opening.width}" height="${Math.max(1.4, opening.height * 0.08)}" fill="#1f2937" fill-opacity="0.78" />`
        : "";
      return `
        <g id="phase13-section-cut-opening-${escapeXml(opening.id || index)}" data-truth-kind="${escapeXml(truthKind || truthState)}">
          <rect x="${opening.x}" y="${opening.y}" width="${opening.width}" height="${opening.height}" fill="#ffffff" stroke="#475569" stroke-width="${lineweights.secondary || 1}"${bodyDash} />
          ${cutFaceHead}
          ${cutFaceSill}
          <line x1="${opening.x}" y1="${opening.y}" x2="${opening.x + opening.width}" y2="${opening.y}" stroke="#111" stroke-width="${frameWeight}"${frameDash} />
          <line x1="${opening.x}" y1="${opening.y + opening.height}" x2="${opening.x + opening.width}" y2="${opening.y + opening.height}" stroke="#111" stroke-width="${frameWeight}"${frameDash} />
          <line x1="${opening.x + jambInset}" y1="${opening.y}" x2="${opening.x + jambInset}" y2="${opening.y + opening.height}" stroke="#64748b" stroke-width="${isCutFace ? (lineweights.tertiary || 0.8) * 1.25 : lineweights.tertiary || 0.8}" stroke-opacity="${jambOpacity}" />
          <line x1="${opening.x + opening.width - jambInset}" y1="${opening.y}" x2="${opening.x + opening.width - jambInset}" y2="${opening.y + opening.height}" stroke="#64748b" stroke-width="${isCutFace ? (lineweights.tertiary || 0.8) * 1.25 : lineweights.tertiary || 0.8}" stroke-opacity="${jambOpacity}" />
          <line x1="${opening.x + 2}" y1="${opening.y + opening.height * 0.5}" x2="${opening.x + opening.width - 2}" y2="${opening.y + opening.height * 0.5}" stroke="#94a3b8" stroke-width="${lineweights.tertiary || 0.8}" stroke-opacity="${centerOpacity}" />
          ${nearBoolean || isCutFace ? `<line x1="${opening.x + 2}" y1="${opening.y + opening.height * 0.22}" x2="${opening.x + opening.width - 2}" y2="${opening.y + opening.height * 0.22}" stroke="#64748b" stroke-width="${lineweights.guide || 0.62}" stroke-opacity="${isCutFace ? 0.82 : 0.68}" />` : ""}
        </g>`;
    })
    .join("");

  const cutFaceCount = phase21
    ? (openings || []).filter(
        (opening) => resolveOpeningTruthKind(opening) === "cut_face",
      ).length
    : 0;
  const cutProfileCount = phase21
    ? (openings || []).filter(
        (opening) => resolveOpeningTruthKind(opening) === "cut_profile",
      ).length
    : 0;

  return {
    markup: `<g id="phase13-section-cut-openings">${markup}</g>`,
    count: (openings || []).length,
    cutFaceCount,
    cutProfileCount,
    phase21,
  };
}

export default {
  buildSectionOpeningDetailMarkup,
};
