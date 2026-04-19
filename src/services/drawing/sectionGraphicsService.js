import { coerceToCanonicalProjectGeometry } from "../cad/geometryFactory.js";
import { renderSectionSvg } from "./svgSectionRenderer.js";
import { selectSectionCandidates } from "./sectionCutPlanner.js";
import { deriveSectionSemantics } from "./sectionSemanticService.js";
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

function getSourceBounds(geometry = {}) {
  return (
    geometry.site?.buildable_bbox ||
    geometry.site?.boundary_bbox || {
      min_x: 0,
      min_y: 0,
      width: 12,
      height: 10,
    }
  );
}

function buildTransform(bounds, width, height, padding) {
  const totalHeight = height - padding * 2;
  const horizontalExtent = Math.max(bounds.width || 12, bounds.height || 10);
  const scale = Math.min(
    (width - padding * 2) / Math.max(horizontalExtent, 1),
    totalHeight / Math.max(12, 1),
  );
  return (point = {}) => ({
    x: Number((padding + (point.x - (bounds.min_x || 0)) * scale).toFixed(2)),
    y: Number((padding + (point.y - (bounds.min_y || 0)) * scale).toFixed(2)),
  });
}

function replaceSvgTail(svg = "", markup = "") {
  return String(svg || "").replace("</svg>", `${markup}\n</svg>`);
}

function renderPlacements(placements = []) {
  return `
    <g id="phase7-section-annotations">
      ${(placements || [])
        .map(
          (placement) => `
        <rect x="${placement.box.x}" y="${placement.box.y}" width="${placement.box.width}" height="${placement.box.height}" rx="2" fill="#ffffff" fill-opacity="0.9"/>
        <text x="${placement.x}" y="${placement.y + 4}" font-size="${placement.fontSize}" font-family="Arial, sans-serif" text-anchor="middle">${escapeXml(placement.text)}</text>
      `,
        )
        .join("")}
    </g>
  `;
}

function renderSectionSemanticBlock(width, height, semantics = {}) {
  const x = width - 330;
  const y = 52;
  return `
    <g id="phase7-section-semantics">
      <rect x="${x}" y="${y}" width="260" height="62" fill="#fff" stroke="#333" stroke-width="1"/>
      <text x="${x + 12}" y="${y + 18}" font-size="11" font-family="Arial, sans-serif" font-weight="bold">Section focus</text>
      <text x="${x + 12}" y="${y + 34}" font-size="10" font-family="Arial, sans-serif">Usefulness ${Number(semantics.scores?.usefulness || 0).toFixed(2)}</text>
      <text x="${x + 12}" y="${y + 50}" font-size="10" font-family="Arial, sans-serif">${escapeXml((semantics.rationale || [])[0] || "Geometry-derived section semantics")}</text>
    </g>
  `;
}

export function buildSectionGraphic(
  geometryInput = {},
  styleDNA = {},
  options = {},
) {
  const geometry = coerceToCanonicalProjectGeometry(
    geometryInput?.projectGeometry || geometryInput?.geometry || geometryInput,
  );
  const sectionPlan = selectSectionCandidates(geometry, options);
  const sectionType = String(
    options.sectionType || "longitudinal",
  ).toLowerCase();
  const sectionProfile = sectionPlan.candidates.find(
    (candidate) => candidate.sectionType === sectionType,
  ) ||
    sectionPlan.candidates[0] || {
      id: `section:${sectionType}`,
      sectionType,
      title: `Section ${sectionType}`,
      focusEntityIds: [],
    };
  const semantics = deriveSectionSemantics(geometry, sectionProfile);
  const width = options.width || 1200;
  const height = options.height || 760;
  const padding = 80;
  const project = buildTransform(
    getSourceBounds(geometry),
    width,
    height,
    padding,
  );
  const drawing = renderSectionSvg(geometry, styleDNA, {
    ...options,
    sectionType: sectionProfile.sectionType,
    sectionProfile,
    sectionSemantics: semantics,
    hideRoomLabels: true,
  });
  if (!drawing?.svg) {
    return {
      ...drawing,
      section_profile: sectionProfile,
      section_semantics: semantics,
      annotation_layout: {
        placements: [],
        warnings: [],
      },
      annotation_validation: {
        placementStable: false,
        collisionCount: 0,
        collisions: [],
        fallbackPlacementCount: 0,
        warnings: [],
        errors: [
          "Section SVG payload is unavailable because the renderer blocked.",
        ],
      },
      technical_quality_metadata: {
        ...(drawing.technical_quality_metadata || {}),
        room_label_count: 0,
        section_usefulness_score: semantics.scores?.usefulness || 0,
        focus_entity_count: (sectionProfile.focusEntityIds || []).length,
        annotation_count: 0,
        annotation_guarantee: false,
      },
    };
  }
  const annotationLayout = layoutAnnotations({
    drawingType: "section",
    projectGeometry: geometry,
    drawing,
    sectionProfile,
    project,
  });
  const annotationValidation = validateAnnotationPlacements(
    annotationLayout.placements,
    { minimumFontSize: 9 },
  );
  const svg = replaceSvgTail(
    drawing.svg,
    `${renderPlacements(annotationLayout.placements)}${renderSectionSemanticBlock(
      width,
      height,
      semantics,
    )}`,
  );

  return {
    ...drawing,
    svg,
    section_profile: sectionProfile,
    section_semantics: semantics,
    annotation_layout: annotationLayout,
    annotation_validation: annotationValidation,
    technical_quality_metadata: {
      ...(drawing.technical_quality_metadata || {}),
      room_label_count: Math.max(
        Number(drawing.technical_quality_metadata?.room_label_count || 0),
        annotationLayout.placements.length,
      ),
      section_usefulness_score: semantics.scores?.usefulness || 0,
      focus_entity_count: (sectionProfile.focusEntityIds || []).length,
      annotation_count: annotationLayout.placements.length,
      annotation_guarantee: annotationValidation.placementStable,
    },
  };
}

export default {
  buildSectionGraphic,
};
