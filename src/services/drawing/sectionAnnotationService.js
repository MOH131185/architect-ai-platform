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
  const baseX = 72;
  const baseY = 68;
  const lineHeight = 14;

  items.push({
    id: "section-callout-title",
    text: `${String(sectionProfile.title || "Section").toUpperCase()} FOCUS`,
    x: baseX,
    y: baseY,
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
    x: baseX,
    y: baseY + lineHeight,
    fontSize: 9,
    fontWeight: 600,
  });

  (sectionSemantics.rationale || []).slice(0, 2).forEach((text, index) => {
    items.push({
      id: `section-rationale-${index}`,
      text,
      x: baseX,
      y: baseY + lineHeight * (index + 2),
      fontSize: 8,
      fontWeight: 500,
    });
  });

  const markup = `
    <g id="phase9-section-annotations">
      ${(items || [])
        .map(
          (item) => `
        <text x="${item.x}" y="${item.y}" font-size="${item.fontSize}" font-family="Arial, sans-serif" font-weight="${item.fontWeight}" fill="#1f2937">${escapeXml(item.text)}</text>
      `,
        )
        .join("")}
      <line x1="${width - 118}" y1="${height - 84}" x2="${width - 36}" y2="${height - 84}" stroke="#1f2937" stroke-width="1.4" />
      <text x="${width - 77}" y="${height - 92}" font-size="8" font-family="Arial, sans-serif" text-anchor="middle" fill="#475569">5m datum</text>
    </g>
  `;

  return {
    version: "phase9-section-annotation-service-v1",
    items,
    markup,
  };
}

export default {
  buildSectionAnnotations,
};
