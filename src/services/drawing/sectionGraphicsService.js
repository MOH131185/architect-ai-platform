import { coerceToCanonicalProjectGeometry } from "../cad/geometryFactory.js";
import { isFeatureEnabled } from "../../config/featureFlags.js";
import { renderSectionSvg } from "./svgSectionRenderer.js";
import { selectSectionCandidates } from "./sectionCutPlanner.js";
import { deriveSectionSemantics } from "./sectionSemanticService.js";
import { buildSectionEvidence } from "./sectionEvidenceService.js";
import { layoutAnnotations } from "./annotationLayoutService.js";
import { validateAnnotationPlacements } from "./annotationPlacementValidator.js";
import { buildSectionAnnotations } from "./sectionAnnotationService.js";

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

function qualityRank(candidate = {}) {
  const normalized = String(candidate.sectionCandidateQuality || "")
    .trim()
    .toLowerCase();
  if (normalized === "pass") return 2;
  if (normalized === "warning") return 1;
  if (normalized === "block") return 0;
  return 1;
}

function evidenceRank(candidate = {}) {
  return Number(
    candidate.sectionEvidenceSummary?.communicationValue ||
      candidate.sectionEvidenceSummary?.usefulnessScore ||
      0,
  );
}

function directTruthRank(candidate = {}) {
  return Number(candidate.sectionEvidenceSummary?.directEvidenceScore || 0);
}

function constructionTruthRank(candidate = {}) {
  return Number(
    candidate.sectionEvidenceSummary?.constructionEvidenceScore || 0,
  );
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
      <text x="${x + 12}" y="${y + 50}" font-size="10" font-family="Arial, sans-serif">${escapeXml(
        semantics.chosenStrategy?.name
          ? `Strategy ${semantics.chosenStrategy.name}`
          : (semantics.rationale || [])[0] ||
              "Geometry-derived section semantics",
      )}</text>
    </g>
  `;
}

export function buildSectionGraphic(
  geometryInput = {},
  styleDNA = {},
  options = {},
) {
  const rawGeometryInput =
    geometryInput?.projectGeometry ||
    geometryInput?.geometry ||
    geometryInput ||
    {};
  const geometry = coerceToCanonicalProjectGeometry({
    ...rawGeometryInput,
    metadata: rawGeometryInput?.metadata || {},
  });
  const sectionPlan = selectSectionCandidates(geometry, options);
  const sectionType = String(
    options.sectionType || "longitudinal",
  ).toLowerCase();
  const sectionProfile = sectionPlan.candidates
    .filter((candidate) => candidate.sectionType === sectionType)
    .sort((left, right) => {
      const qualityDelta = qualityRank(right) - qualityRank(left);
      if (qualityDelta !== 0) {
        return qualityDelta;
      }
      const directTruthDelta = directTruthRank(right) - directTruthRank(left);
      if (directTruthDelta !== 0) {
        return directTruthDelta;
      }
      const constructionTruthDelta =
        constructionTruthRank(right) - constructionTruthRank(left);
      if (constructionTruthDelta !== 0) {
        return constructionTruthDelta;
      }
      const evidenceDelta = evidenceRank(right) - evidenceRank(left);
      if (evidenceDelta !== 0) {
        return evidenceDelta;
      }
      const directEvidenceDelta =
        Number(right.sectionEvidenceSummary?.directEvidenceCount || 0) -
        Number(left.sectionEvidenceSummary?.directEvidenceCount || 0);
      if (directEvidenceDelta !== 0) {
        return directEvidenceDelta;
      }
      const leftRoomFocus = Number(left.focusedRoomCount || 0) > 0 ? 1 : 0;
      const rightRoomFocus = Number(right.focusedRoomCount || 0) > 0 ? 1 : 0;
      if (rightRoomFocus !== leftRoomFocus) {
        return rightRoomFocus - leftRoomFocus;
      }
      if (Number(right.score || 0) !== Number(left.score || 0)) {
        return Number(right.score || 0) - Number(left.score || 0);
      }
      return String(left.id).localeCompare(String(right.id));
    })[0] ||
    sectionPlan.candidates[0] || {
      id: `section:${sectionType}`,
      sectionType,
      title: `Section ${sectionType}`,
      focusEntityIds: [],
    };
  const sectionEvidence =
    sectionProfile.sectionEvidence ||
    buildSectionEvidence(geometry, sectionProfile);
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
    sectionEvidence,
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
        section_evidence_quality:
          sectionEvidence.summary?.evidenceQuality || "block",
        section_direct_evidence_count:
          sectionEvidence.summary?.directEvidenceCount || 0,
        section_direct_evidence_quality:
          sectionEvidence.summary?.directEvidenceQuality || "blocked",
        section_inferred_evidence_quality:
          sectionEvidence.summary?.inferredEvidenceQuality || "blocked",
        section_direct_evidence_score:
          sectionEvidence.summary?.directEvidenceScore || 0,
        section_inferred_evidence_count:
          sectionEvidence.summary?.inferredEvidenceCount || 0,
        section_inferred_evidence_score:
          sectionEvidence.summary?.inferredEvidenceScore || 0,
        section_communication_value:
          sectionEvidence.summary?.communicationValue || 0,
        section_construction_truth_quality:
          sectionEvidence.summary?.sectionConstructionTruthQuality || "blocked",
        section_construction_evidence_score:
          sectionEvidence.summary?.constructionEvidenceScore || 0,
        cut_wall_truth_quality:
          sectionEvidence.summary?.cutWallTruthQuality || "blocked",
        cut_opening_truth_quality:
          sectionEvidence.summary?.cutOpeningTruthQuality || "blocked",
        stair_truth_quality:
          sectionEvidence.summary?.stairTruthQuality || "blocked",
        slab_truth_quality:
          sectionEvidence.summary?.slabTruthQuality || "blocked",
        roof_truth_quality:
          sectionEvidence.summary?.roofTruthQuality || "blocked",
        roof_truth_mode: sectionEvidence.summary?.roofTruthMode || "missing",
        foundation_truth_quality:
          sectionEvidence.summary?.foundationTruthQuality || "blocked",
        foundation_truth_mode:
          sectionEvidence.summary?.foundationTruthMode || "missing",
        slab_exact_clip_count:
          sectionEvidence.summary?.directSlabExactClipCount || 0,
        roof_exact_clip_count:
          sectionEvidence.summary?.directRoofExactClipCount || 0,
        roof_explicit_primitive_count:
          sectionEvidence.summary?.explicitRoofPrimitiveCount || 0,
        roof_edge_count: sectionEvidence.summary?.explicitRoofEdgeCount || 0,
        roof_parapet_count: sectionEvidence.summary?.explicitParapetCount || 0,
        roof_break_count: sectionEvidence.summary?.explicitRoofBreakCount || 0,
        foundation_direct_clip_count:
          sectionEvidence.summary?.directFoundationCount || 0,
        base_condition_direct_clip_count:
          sectionEvidence.summary?.directBaseConditionCount || 0,
        explicit_ground_relation_count:
          sectionEvidence.summary?.explicitGroundRelationCount || 0,
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
  const sectionAnnotations = isFeatureEnabled("useSectionGraphicsUpgradePhase9")
    ? buildSectionAnnotations({
        sectionProfile,
        sectionSemantics: semantics,
        technicalQualityMetadata: drawing.technical_quality_metadata,
        width,
        height,
      })
    : { items: [], markup: "" };
  const svg = replaceSvgTail(
    drawing.svg,
    `${renderPlacements(annotationLayout.placements)}${renderSectionSemanticBlock(
      width,
      height,
      semantics,
    )}${sectionAnnotations.markup}`,
  );

  return {
    ...drawing,
    svg,
    section_profile: sectionProfile,
    section_evidence: sectionEvidence,
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
      annotation_count:
        annotationLayout.placements.length + sectionAnnotations.items.length,
      annotation_guarantee: annotationValidation.placementStable,
      section_candidate_quality: sectionProfile.sectionCandidateQuality || null,
      section_candidate_score: sectionProfile.score || null,
      section_strategy_id:
        sectionProfile.strategyId || sectionProfile.chosenStrategy?.id || null,
      section_strategy_name:
        sectionProfile.strategyName ||
        sectionProfile.chosenStrategy?.name ||
        null,
      section_expected_communication_value: Number(
        sectionProfile.expectedCommunicationValue || 0,
      ),
      section_evidence_quality:
        sectionEvidence.summary?.evidenceQuality || null,
      section_direct_evidence_quality:
        sectionEvidence.summary?.directEvidenceQuality || null,
      section_inferred_evidence_quality:
        sectionEvidence.summary?.inferredEvidenceQuality || null,
      section_direct_evidence_score:
        sectionEvidence.summary?.directEvidenceScore || 0,
      section_direct_evidence_count:
        sectionEvidence.summary?.directEvidenceCount || 0,
      section_communication_value:
        sectionEvidence.summary?.communicationValue || 0,
      section_inferred_evidence_count:
        sectionEvidence.summary?.inferredEvidenceCount || 0,
      section_inferred_evidence_score:
        sectionEvidence.summary?.inferredEvidenceScore || 0,
      section_construction_truth_quality:
        sectionEvidence.summary?.sectionConstructionTruthQuality || null,
      section_construction_evidence_score:
        sectionEvidence.summary?.constructionEvidenceScore || 0,
      cut_wall_truth_quality:
        sectionEvidence.summary?.cutWallTruthQuality || null,
      cut_opening_truth_quality:
        sectionEvidence.summary?.cutOpeningTruthQuality || null,
      stair_truth_quality: sectionEvidence.summary?.stairTruthQuality || null,
      slab_truth_quality: sectionEvidence.summary?.slabTruthQuality || null,
      slab_exact_clip_count:
        sectionEvidence.summary?.directSlabExactClipCount || 0,
      roof_truth_quality: sectionEvidence.summary?.roofTruthQuality || null,
      roof_truth_mode: sectionEvidence.summary?.roofTruthMode || null,
      roof_exact_clip_count:
        sectionEvidence.summary?.directRoofExactClipCount || 0,
      roof_explicit_primitive_count:
        sectionEvidence.summary?.explicitRoofPrimitiveCount || 0,
      roof_edge_count: sectionEvidence.summary?.explicitRoofEdgeCount || 0,
      roof_parapet_count: sectionEvidence.summary?.explicitParapetCount || 0,
      roof_break_count: sectionEvidence.summary?.explicitRoofBreakCount || 0,
      foundation_truth_quality:
        sectionEvidence.summary?.foundationTruthQuality || null,
      foundation_truth_mode:
        sectionEvidence.summary?.foundationTruthMode || null,
      foundation_direct_clip_count:
        sectionEvidence.summary?.directFoundationCount || 0,
      base_condition_direct_clip_count:
        sectionEvidence.summary?.directBaseConditionCount || 0,
      explicit_ground_relation_count:
        sectionEvidence.summary?.explicitGroundRelationCount || 0,
      section_cut_room_count: sectionEvidence.summary?.cutRoomCount || 0,
      section_cut_opening_count: sectionEvidence.summary?.cutOpeningCount || 0,
      section_focus_hit_count: sectionEvidence.summary?.focusHitCount || 0,
    },
  };
}

export default {
  buildSectionGraphic,
};
