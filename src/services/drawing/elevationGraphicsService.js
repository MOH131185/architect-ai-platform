import { coerceToCanonicalProjectGeometry } from "../cad/geometryFactory.js";
import { renderElevationSvg } from "./svgElevationRenderer.js";
import { layoutAnnotations } from "./annotationLayoutService.js";
import { validateAnnotationPlacements } from "./annotationPlacementValidator.js";

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function replaceSvgTail(svg = "", markup = "") {
  return String(svg || "").replace("</svg>", `${markup}\n</svg>`);
}

function renderPlacements(placements = []) {
  return `
    <g id="phase7-elevation-annotations">
      ${(placements || [])
        .map(
          (placement) => `
        <text x="${placement.x}" y="${placement.y}" font-size="${placement.fontSize}" font-family="Arial, sans-serif" text-anchor="middle">${escapeXml(placement.text)}</text>
      `,
        )
        .join("")}
    </g>
  `;
}

function renderTitleBlock(width, height, orientation) {
  const x = width - 300;
  const y = height - 66;
  return `
    <g id="phase7-elevation-title-block">
      <rect x="${x}" y="${y}" width="240" height="44" fill="#fff" stroke="#333" stroke-width="1.1"/>
      <text x="${x + 12}" y="${y + 18}" font-size="12" font-family="Arial, sans-serif" font-weight="bold">Elevation ${escapeXml(orientation)}</text>
      <text x="${x + 12}" y="${y + 34}" font-size="10" font-family="Arial, sans-serif">Geometry-derived technical linework</text>
    </g>
  `;
}

export function buildElevationGraphic(
  geometryInput = {},
  styleDNA = {},
  options = {},
) {
  const geometry = coerceToCanonicalProjectGeometry(
    geometryInput?.projectGeometry || geometryInput?.geometry || geometryInput,
  );
  const drawing = renderElevationSvg(geometry, styleDNA, options);
  const annotationLayout = layoutAnnotations({
    drawingType: "elevation",
    drawing,
  });
  const annotationValidation = validateAnnotationPlacements(
    annotationLayout.placements,
    { minimumFontSize: 9 },
  );
  const svg = replaceSvgTail(
    drawing.svg,
    `${renderPlacements(annotationLayout.placements)}${renderTitleBlock(
      options.width || 1200,
      options.height || 760,
      drawing.orientation || options.orientation || "south",
    )}`,
  );

  return {
    ...drawing,
    svg,
    annotation_layout: annotationLayout,
    annotation_validation: annotationValidation,
    technical_quality_metadata: {
      ...(drawing.technical_quality_metadata || {}),
      annotation_count: annotationLayout.placements.length,
      has_title_block: true,
      annotation_guarantee: annotationValidation.placementStable,
    },
  };
}

export default {
  buildElevationGraphic,
};
