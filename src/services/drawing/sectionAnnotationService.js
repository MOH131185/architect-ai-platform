import { placeSectionTextBlocks } from "./sectionTextPlacementService.js";

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function buildSectionAnnotations({
  sectionProfile = {},
  sectionSemantics = {},
  technicalQualityMetadata = {},
  width = 1200,
  height = 760,
} = {}) {
  const items = [];

  items.push({
    id: "section-callout-title",
    text: `${String(sectionProfile.title || "Section").toUpperCase()} FOCUS`,
    fontSize: 11,
    fontWeight: 700,
  });
  items.push({
    id: "section-callout-quality",
    text: `Candidate ${String(sectionProfile.sectionCandidateQuality || "warning").toUpperCase()} · usefulness ${Number(
      sectionSemantics.scores?.usefulness ||
        technicalQualityMetadata.section_usefulness_score ||
        0,
    ).toFixed(2)}`,
    fontSize: 9,
    fontWeight: 600,
  });
  if (sectionProfile.strategyName || sectionProfile.chosenStrategy?.name) {
    items.push({
      id: "section-callout-strategy",
      text: `Strategy ${String(
        sectionProfile.strategyName ||
          sectionProfile.chosenStrategy?.name ||
          "deterministic default",
      ).toUpperCase()}`,
      fontSize: 8.5,
      fontWeight: 600,
    });
  }

  (sectionSemantics.rationale || []).slice(0, 3).forEach((text, index) => {
    items.push({
      id: `section-rationale-${index}`,
      text,
      fontSize: 8,
      fontWeight: 500,
    });
  });
  let placement = placeSectionTextBlocks({
    items,
    width,
    height,
    anchor: "top-left",
  });
  if (placement.overflow) {
    placement = placeSectionTextBlocks({
      items,
      width,
      height,
      anchor: "top-right",
    });
  }

  const markup = `
    <g id="phase10-section-annotations">
      ${(placement.placements || [])
        .map(
          (item) => `
        <rect x="${item.box.x}" y="${item.box.y}" width="${item.box.width}" height="${item.box.height}" rx="2" fill="#ffffff" fill-opacity="0.92" />
        <text x="${item.x}" y="${item.y}" font-size="${item.fontSize}" font-family="Arial, sans-serif" font-weight="${item.fontWeight}" fill="#1f2937">${escapeXml(item.text)}</text>
      `,
        )
        .join("")}
      <line x1="${width - 118}" y1="${height - 84}" x2="${width - 36}" y2="${height - 84}" stroke="#1f2937" stroke-width="1.4" />
      <text x="${width - 77}" y="${height - 92}" font-size="8" font-family="Arial, sans-serif" text-anchor="middle" fill="#475569">5m datum</text>
    </g>
  `;

  return {
    version: "phase10-section-annotation-service-v1",
    items: placement.placements,
    markup,
    textPlacement: placement,
  };
}

export default {
  buildSectionAnnotations,
};
