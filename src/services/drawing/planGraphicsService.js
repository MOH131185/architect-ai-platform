import { coerceToCanonicalProjectGeometry } from "../cad/geometryFactory.js";
import { renderPlanSvg } from "./svgPlanRenderer.js";
import { layoutAnnotations } from "./annotationLayoutService.js";
import { validateAnnotationPlacements } from "./annotationPlacementValidator.js";
import { selectSectionCandidates } from "./sectionCutPlanner.js";
import {
  getLevelDrawingBounds,
  resolveCompiledProjectGeometryInput,
} from "./drawingBounds.js";

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function findLevel(geometry, levelId = null) {
  return (
    geometry.levels.find((level) => level.id === levelId) || geometry.levels[0]
  );
}

function buildTransform(bounds, width, height, padding) {
  const scale = Math.min(
    (width - padding * 2) / Math.max(bounds.width, 1),
    (height - padding * 2) / Math.max(bounds.height, 1),
  );

  return (point = {}) => ({
    x: Number((padding + (point.x - bounds.min_x) * scale).toFixed(2)),
    y: Number((padding + (point.y - bounds.min_y) * scale).toFixed(2)),
  });
}

function replaceSvgTail(svg = "", markup = "") {
  return String(svg || "").replace("</svg>", `${markup}\n</svg>`);
}

function renderPlacements(placements = []) {
  return `
    <g id="phase7-plan-annotations">
      ${(placements || [])
        .map(
          (placement) => `
        <rect x="${placement.box.x}" y="${placement.box.y}" width="${placement.box.width}" height="${placement.box.height}" rx="3" fill="#ffffff" fill-opacity="0.92" stroke="#6b7280" stroke-width="0.6"/>
        <text x="${placement.x}" y="${placement.y + 4}" font-size="${placement.fontSize}" font-family="Arial, sans-serif" text-anchor="middle">${escapeXml(placement.text)}</text>
      `,
        )
        .join("")}
    </g>
  `;
}

function renderSectionMarkers(sectionPlan = {}, project = (point) => point) {
  return `
    <g id="phase7-section-markers">
      ${(sectionPlan.candidates || [])
        .slice(0, 2)
        .map((candidate, index) => {
          const from = project(candidate.cutLine.from);
          const to = project(candidate.cutLine.to);
          const label = index === 0 ? "A-A" : "B-B";
          return `
            <line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke="#111" stroke-width="1.4" stroke-dasharray="10 6"/>
            <text x="${from.x + 8}" y="${from.y - 8}" font-size="11" font-family="Arial, sans-serif" fill="#111">${label}</text>
          `;
        })
        .join("")}
    </g>
  `;
}

export function buildPlanGraphic(geometryInput = {}, options = {}) {
  const geometry = coerceToCanonicalProjectGeometry(
    resolveCompiledProjectGeometryInput(geometryInput),
  );
  const level = findLevel(geometry, options.levelId || null);
  const width = options.width || 1200;
  const height = options.height || 900;
  const padding = options.sheetMode === true ? 48 : 70;
  const bounds = getLevelDrawingBounds(geometry, level?.id || null);
  const project = buildTransform(bounds, width, height - 70, padding);
  const drawing = renderPlanSvg(geometry, {
    ...options,
    levelId: level?.id || null,
    hideRoomLabels: true,
  });
  const sectionPlan = selectSectionCandidates(geometry, {
    levelId: level?.id || null,
  });

  if (!drawing?.svg) {
    return {
      ...drawing,
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
          "Plan SVG payload is unavailable because the renderer blocked.",
        ],
      },
      section_candidates: sectionPlan.candidates,
      technical_quality_metadata: {
        ...(drawing.technical_quality_metadata || {}),
        annotation_count: 0,
        annotation_fallback_count: 0,
        section_marker_count: Math.min(2, sectionPlan.candidates.length),
        has_scale_bar: false,
        annotation_guarantee: false,
      },
    };
  }

  const annotationLayout = layoutAnnotations({
    drawingType: "plan",
    projectGeometry: geometry,
    levelId: level?.id || null,
    project,
  });
  const annotationValidation = validateAnnotationPlacements(
    annotationLayout.placements,
  );
  const svg = replaceSvgTail(
    drawing.svg,
    [
      renderPlacements(annotationLayout.placements),
      renderSectionMarkers(sectionPlan, project),
    ].join(""),
  );

  return {
    ...drawing,
    svg,
    annotation_layout: annotationLayout,
    annotation_validation: annotationValidation,
    section_candidates: sectionPlan.candidates,
    technical_quality_metadata: {
      ...(drawing.technical_quality_metadata || {}),
      room_label_count: annotationLayout.placements.length,
      area_label_count: annotationLayout.placements.length,
      annotation_count: annotationLayout.placements.length,
      annotation_fallback_count: annotationValidation.fallbackPlacementCount,
      section_marker_count: Math.min(2, sectionPlan.candidates.length),
      has_scale_bar: drawing.technical_quality_metadata?.has_scale_bar === true,
      annotation_guarantee: annotationValidation.placementStable,
    },
  };
}

export default {
  buildPlanGraphic,
};
