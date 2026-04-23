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

function resolveStairTruthKind(stair = {}) {
  return (
    stair.truthKind ||
    stair.clipGeometry?.truthKind ||
    (stair.clipGeometry?.nearBoolean
      ? "cut_profile"
      : String(stair.truthState || "direct").toLowerCase() === "direct"
        ? "cut_profile"
        : String(stair.truthState || "direct").toLowerCase() === "contextual"
          ? "contextual_profile"
          : "derived_profile")
  );
}

function resolveStairTruthLabel(truthState = "direct", truthKind = null) {
  const normalizedState = String(truthState || "direct").toLowerCase();
  const normalizedKind = String(truthKind || "").toLowerCase();
  if (normalizedKind === "cut_face") {
    return "DIRECT CUT";
  }
  if (normalizedKind === "cut_profile") {
    return "DIRECT CUT";
  }
  if (
    normalizedKind === "contextual_profile" ||
    normalizedState === "contextual"
  ) {
    return "CONTEXTUAL";
  }
  if (normalizedKind === "derived_profile" || normalizedState === "derived") {
    return "DERIVED";
  }
  return "DIRECT CUT";
}

export function buildSectionStairDetailMarkup({
  stairs = [],
  lineweights = {},
} = {}) {
  const phase21 = phase21SectionGraphicsEnabled();
  const markup = (stairs || [])
    .map((stair) => {
      const truthState = String(stair.truthState || "direct").toLowerCase();
      const contextual = truthState !== "direct";
      const nearBoolean = stair.clipGeometry?.nearBoolean === true;
      const truthKind = phase21 ? resolveStairTruthKind(stair) : null;
      const isCutFace = phase21 && truthKind === "cut_face";
      const isCutProfile = phase21 && truthKind === "cut_profile";
      const treadSpacing = stair.height / Math.max(1, stair.treadCount);
      const treadWeight = isCutFace
        ? (lineweights.tertiary || 0.8) * 1.35
        : isCutProfile
          ? (lineweights.tertiary || 0.8) * 1.1
          : lineweights.tertiary || 0.8;
      const treadDash =
        isCutFace || isCutProfile
          ? ""
          : contextual
            ? ' stroke-dasharray="4 4" stroke-opacity="0.68"'
            : "";
      const treadStroke = isCutFace ? "#1f2937" : "#444";
      const treads = Array.from({ length: stair.treadCount }, (_, index) => {
        const treadY = stair.y + treadSpacing * (index + 1);
        return `<line x1="${stair.x + 4}" y1="${treadY}" x2="${stair.x + stair.width - 4}" y2="${treadY}" stroke="${treadStroke}" stroke-width="${treadWeight}"${treadDash} />`;
      }).join("");
      const risers = isCutFace
        ? Array.from({ length: stair.treadCount }, (_, index) => {
            const ratio = (index + 0.5) / Math.max(1, stair.treadCount);
            const riserX = stair.x + 4 + (stair.width - 8) * ratio;
            return `<line x1="${riserX}" y1="${stair.y + treadSpacing * index}" x2="${riserX}" y2="${stair.y + treadSpacing * (index + 1)}" stroke="#1f2937" stroke-width="${(lineweights.tertiary || 0.8) * 0.95}" stroke-opacity="0.8" />`;
          }).join("")
        : "";
      const outlineWeight = isCutFace
        ? (lineweights.cutOutline || 1.6) * 1.2
        : isCutProfile
          ? (lineweights.cutOutline || 1.6) * 1.05
          : nearBoolean
            ? lineweights.cutOutline || 1.6
            : lineweights.primary || 1.2;
      const outlineDash =
        isCutFace || isCutProfile
          ? ""
          : contextual
            ? ' stroke-dasharray="5 4" stroke-opacity="0.76"'
            : "";
      const fillOpacity = isCutFace ? 1.0 : nearBoolean ? 0.98 : 0.9;
      const truthLabel = resolveStairTruthLabel(truthState, truthKind);
      const truthLabelWidth = Math.min(
        Math.max(52, truthLabel.length * 5.4 + 8),
        Math.max(stair.width - 10, 52),
      );
      const truthFill = isCutFace
        ? "#ffffff"
        : contextual
          ? "#f5f5f5"
          : "#ffffff";
      return `
        <g id="phase14-section-stair-${escapeXml(stair.id || "stair")}" data-truth-kind="${escapeXml(truthKind || truthState)}">
          <rect x="${stair.x}" y="${stair.y}" width="${stair.width}" height="${stair.height}" fill="#efefef" fill-opacity="${fillOpacity}" stroke="#333" stroke-width="${outlineWeight}"${outlineDash} />
          ${treads}
          ${risers}
          <line x1="${stair.x + 8}" y1="${stair.y + stair.height - 10}" x2="${stair.x + stair.width - 16}" y2="${stair.y + 12}" stroke="#111" stroke-width="${lineweights.secondary || 1}"${contextual && !isCutFace ? ' stroke-dasharray="5 4" stroke-opacity="0.76"' : ""} marker-end="url(#phase14-stair-arrow)" />
          <rect x="${stair.x + (stair.width - truthLabelWidth) / 2}" y="${stair.y + 4}" width="${truthLabelWidth}" height="12" rx="3" ry="3" fill="${truthFill}" fill-opacity="0.94" stroke="#9ca3af" stroke-width="0.7" />
          <text x="${stair.x + stair.width / 2}" y="${stair.y + 13}" font-size="8" font-family="Arial, sans-serif" font-weight="700" text-anchor="middle" fill="${contextual ? "#4b5563" : "#111"}">${escapeXml(
            truthLabel,
          )}</text>
          <text x="${stair.x + stair.width / 2}" y="${stair.y + 27}" font-size="10" font-family="Arial, sans-serif" text-anchor="middle" fill="${isCutFace ? "#0f172a" : contextual ? "#4b5563" : "#111"}">STAIR</text>
          <text x="${stair.x + stair.width / 2}" y="${stair.y + stair.height - 6}" font-size="9" font-family="Arial, sans-serif" text-anchor="middle" fill="${isCutFace ? "#0f172a" : contextual ? "#4b5563" : "#111"}">UP</text>
        </g>`;
    })
    .join("");

  const cutFaceCount = phase21
    ? (stairs || []).filter(
        (stair) => resolveStairTruthKind(stair) === "cut_face",
      ).length
    : 0;
  const cutProfileCount = phase21
    ? (stairs || []).filter(
        (stair) => resolveStairTruthKind(stair) === "cut_profile",
      ).length
    : 0;

  return {
    defs: `
      <marker id="phase14-stair-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto" markerUnits="strokeWidth">
        <path d="M0,0 L0,6 L6,3 z" fill="#111" />
      </marker>
    `,
    markup: `<g id="phase8-section-stair-cuts">${markup}</g>`,
    count: (stairs || []).length,
    cutFaceCount,
    cutProfileCount,
    phase21,
    treadCount: (stairs || []).reduce(
      (sum, stair) => sum + Number(stair.treadCount || 0),
      0,
    ),
  };
}

export default {
  buildSectionStairDetailMarkup,
};
