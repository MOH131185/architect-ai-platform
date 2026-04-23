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

function renderTitleBlock(width, height, orientation, drawing = {}) {
  const x = width - 300;
  const y = height - 66;
  const metadata = drawing.technical_quality_metadata || {};
  return `
    <g id="phase7-elevation-title-block">
      <rect x="${x}" y="${y}" width="240" height="44" fill="#fff" stroke="#333" stroke-width="1.1"/>
      <text x="${x + 12}" y="${y + 18}" font-size="12" font-family="Arial, sans-serif" font-weight="bold">Elevation ${escapeXml(orientation)}</text>
      <text x="${x + 12}" y="${y + 34}" font-size="10" font-family="Arial, sans-serif">Geometry-derived technical linework</text>
      <text x="${x + 228}" y="${y + 34}" font-size="8" font-family="Arial, sans-serif" text-anchor="end" fill="#475569">${escapeXml(
        `${metadata.geometry_source || "geometry"} · ${Number(
          metadata.facade_richness_score || 0,
        ).toFixed(2)}`,
      )}</text>
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
  const showSheetTitleBlock = options.sheetMode !== true;
  const svg = replaceSvgTail(
    drawing.svg,
    `${renderPlacements(annotationLayout.placements)}${
      showSheetTitleBlock
        ? renderTitleBlock(
            options.width || 1200,
            options.height || 760,
            drawing.orientation || options.orientation || "south",
            drawing,
          )
        : ""
    }`,
  );

  return {
    ...drawing,
    svg,
    annotation_layout: annotationLayout,
    annotation_validation: annotationValidation,
    technical_quality_metadata: {
      ...(drawing.technical_quality_metadata || {}),
      annotation_count: annotationLayout.placements.length,
      sheet_mode: options.sheetMode === true,
      has_title_block: showSheetTitleBlock,
      annotation_guarantee: annotationValidation.placementStable,
    },
  };
}

export default {
  buildElevationGraphic,
};
