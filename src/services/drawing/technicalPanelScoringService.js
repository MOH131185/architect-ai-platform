import { getDrawingQualityThresholds } from "./drawingQualityThresholdService.js";
import { isFeatureEnabled } from "../../config/featureFlags.js";

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function round(value, precision = 3) {
  const factor = 10 ** precision;
  return Math.round(Number(value || 0) * factor) / factor;
}

function positiveScore(flag, hit = 1, miss = 0) {
  return flag ? hit : miss;
}

function computeGeometryCompleteness(
  drawingType = "unknown",
  metadata = {},
  drawing = {},
) {
  if (Number.isFinite(Number(metadata.geometry_completeness))) {
    return clamp(Number(metadata.geometry_completeness), 0, 1);
  }
  if (metadata.geometry_complete === true) {
    return 1;
  }
  if (!drawing.svg) {
    return 0;
  }
  if (drawingType === "plan") {
    return clamp(
      (Number(metadata.room_count || drawing.room_count || 0) > 0
        ? 0.55
        : 0.2) +
        (Number(metadata.wall_count || 0) > 0 ? 0.2 : 0) +
        positiveScore(metadata.has_external_dimensions) * 0.15 +
        positiveScore(metadata.has_north_arrow) * 0.1,
      0,
      1,
    );
  }
  if (drawingType === "elevation") {
    return clamp(
      (Number(metadata.window_count || drawing.window_count || 0) > 0
        ? 0.45
        : 0.18) +
        (Number(metadata.level_label_count || 0) > 0 ? 0.2 : 0) +
        (Number(metadata.ffl_marker_count || 0) > 0 ? 0.18 : 0) +
        (Number(metadata.material_zone_count || 0) > 0 ? 0.17 : 0),
      0,
      1,
    );
  }
  if (drawingType === "section") {
    return clamp(
      (Number(metadata.cut_room_count || 0) > 0 ? 0.45 : 0.16) +
        (Number(metadata.level_label_count || 0) > 0 ? 0.2 : 0) +
        (Number(metadata.foundation_marker_count || 0) > 0 ? 0.18 : 0) +
        positiveScore(metadata.roof_profile_visible) * 0.17,
      0,
      1,
    );
  }
  return drawing.svg ? 0.65 : 0;
}

function computeLabelPresence(
  drawingType = "unknown",
  metadata = {},
  drawing = {},
) {
  const roomCount = Number(metadata.room_count || drawing.room_count || 0);
  const labelCount = Number(
    metadata.room_label_count || metadata.level_label_count || 0,
  );

  if (roomCount > 0) {
    return clamp(labelCount / roomCount, 0, 1);
  }
  return labelCount > 0 ? 1 : 0.3;
}

function computePlanDensity(metadata = {}) {
  if (Number.isFinite(Number(metadata.plan_density_score))) {
    return clamp(Number(metadata.plan_density_score), 0, 1);
  }
  return clamp(
    (Number(metadata.room_count || 0) > 0 ? 0.26 : 0.1) +
      (Number(metadata.window_count || 0) > 0 ? 0.08 : 0) +
      (Number(metadata.door_count || 0) > 0 ? 0.08 : 0) +
      (Number(metadata.door_swing_count || 0) > 0 ? 0.08 : 0) +
      (Number(metadata.furniture_hint_count || 0) > 0 ? 0.08 : 0) +
      positiveScore(metadata.has_external_dimensions) * 0.14 +
      positiveScore(metadata.has_title_block) * 0.1 +
      positiveScore(metadata.has_north_arrow) * 0.08 +
      (Number(metadata.grid_bubble_count || 0) > 0 ? 0.1 : 0),
    0,
    1,
  );
}

function computeElevationRichness(metadata = {}) {
  if (Number.isFinite(Number(metadata.facade_richness_score))) {
    return clamp(Number(metadata.facade_richness_score), 0, 1);
  }
  return clamp(
    (Number(metadata.window_count || 0) > 0 ? 0.22 : 0.08) +
      (Number(metadata.material_zone_count || 0) > 0 ? 0.16 : 0.06) +
      (Number(metadata.ffl_marker_count || 0) > 0 ? 0.12 : 0.03) +
      (Number(metadata.bay_count || 0) > 0 ? 0.1 : 0.02) +
      (Number(metadata.sill_lintel_count || 0) > 0 ? 0.12 : 0.03) +
      (Number(metadata.feature_count || 0) > 0 ? 0.14 : 0.04) +
      positiveScore(metadata.has_title_block || metadata.has_title) * 0.08,
    0,
    1,
  );
}

function computeSectionUsefulness(metadata = {}) {
  if (Number.isFinite(Number(metadata.section_usefulness_score))) {
    return clamp(Number(metadata.section_usefulness_score), 0, 1);
  }
  return clamp(
    (Number(metadata.cut_room_count || 0) > 0 ? 0.26 : 0.08) +
      (Number(metadata.stair_count || 0) > 0 ? 0.18 : 0.04) +
      (Number(metadata.foundation_marker_count || 0) > 0 ? 0.12 : 0.03) +
      (Number(metadata.level_label_count || 0) > 0 ? 0.12 : 0.03) +
      (Number(metadata.stair_tread_count || 0) > 0 ? 0.12 : 0.04) +
      positiveScore(metadata.roof_profile_visible) * 0.12 +
      (Number(metadata.focus_entity_count || 0) > 0 ? 0.08 : 0.02),
    0,
    1,
  );
}

function computeFragmentQuality(drawingType = "unknown", metadata = {}) {
  if (drawingType === "elevation") {
    return clamp(
      Number(
        metadata.side_facade_score ||
          metadata.elevation_semantic_score ||
          metadata.facade_richness_score ||
          0,
      ),
      0,
      1,
    );
  }
  if (drawingType === "section") {
    return clamp(
      Number(
        metadata.section_candidate_score ||
          metadata.section_usefulness_score ||
          0,
      ),
      0,
      1,
    );
  }
  if (drawingType === "plan") {
    return clamp(Number(metadata.plan_density_score || 0), 0, 1);
  }
  return 0;
}

function computeAnnotationCompleteness(
  annotation = null,
  annotationPlacement = null,
  metadata = {},
) {
  if (metadata.annotation_guarantee === false) {
    return 0.25;
  }

  return clamp(
    annotation?.errors?.length
      ? 0.18
      : 1 -
          Math.min(
            0.82,
            (annotation?.warnings?.length || 0) * 0.16 +
              (annotationPlacement?.collisionCount || 0) * 0.16 +
              (annotationPlacement?.fallbackPlacementCount || 0) * 0.08,
          ),
    0,
    1,
  );
}

export function scoreTechnicalPanel({
  drawingType = "unknown",
  drawing = {},
  readability = null,
  annotation = null,
  annotationPlacement = null,
} = {}) {
  const metadata = drawing.technical_quality_metadata || {};
  const thresholds = getDrawingQualityThresholds(drawingType);
  const warnings = [];
  const blockers = [];
  const geometryExplicitlyIncomplete = metadata.geometry_complete === false;
  const annotationStable = annotationPlacement
    ? annotationPlacement.placementStable !== false
    : metadata.annotation_guarantee !== false;

  const readabilityScore = clamp(Number(readability?.score || 0), 0, 1);
  const annotationCompleteness = computeAnnotationCompleteness(
    annotation,
    annotationPlacement,
    metadata,
  );
  const geometryCompleteness = computeGeometryCompleteness(
    drawingType,
    metadata,
    drawing,
  );
  const labelPresence = computeLabelPresence(drawingType, metadata, drawing);
  const planDensity =
    drawingType === "plan" ? computePlanDensity(metadata) : null;
  const elevationRichness =
    drawingType === "elevation" ? computeElevationRichness(metadata) : null;
  const sectionUsefulness =
    drawingType === "section" ? computeSectionUsefulness(metadata) : null;
  const fragmentQuality = isFeatureEnabled("useDrawingFragmentScoringPhase9")
    ? computeFragmentQuality(drawingType, metadata)
    : null;
  const technicalDepth = clamp(
    drawingType === "plan"
      ? (Number(planDensity || 0) + Number(labelPresence || 0)) / 2
      : drawingType === "elevation"
        ? (Number(elevationRichness || 0) + Number(labelPresence || 0)) / 2
        : drawingType === "section"
          ? (Number(sectionUsefulness || 0) + Number(labelPresence || 0)) / 2
          : labelPresence,
    0,
    1,
  );
  const stabilityPenalty = annotationStable ? 0 : 0.08;
  const score = round(
    readabilityScore * (fragmentQuality !== null ? 0.23 : 0.26) +
      annotationCompleteness * 0.19 +
      geometryCompleteness * 0.2 +
      technicalDepth * 0.2 +
      labelPresence * 0.1 +
      Number(fragmentQuality || 0) * (fragmentQuality !== null ? 0.08 : 0) -
      stabilityPenalty,
  );

  warnings.push(
    ...(readability?.warnings || []),
    ...(annotation?.warnings || []),
    ...(annotationPlacement?.warnings || []),
  );
  blockers.push(
    ...(annotation?.errors || []),
    ...(annotationPlacement?.errors || []),
  );

  if (!drawing.svg) {
    blockers.push(
      `${drawing.title || drawingType} drawing SVG payload is missing.`,
    );
  }
  if (geometryExplicitlyIncomplete) {
    blockers.push(
      `${drawing.title || drawingType} canonical geometry was marked incomplete by the renderer, so the panel cannot be treated as credible technical output.`,
    );
  } else if (
    geometryCompleteness < Number(thresholds.minimumGeometryCompleteness || 0)
  ) {
    blockers.push(
      `${drawing.title || drawingType} geometry completeness ${round(
        geometryCompleteness,
      )} is below the required threshold ${
        thresholds.minimumGeometryCompleteness
      }.`,
    );
  }
  if (!annotationStable) {
    blockers.push(
      `${drawing.title || drawingType} has unresolved annotation placement instability.`,
    );
  }
  if (
    fragmentQuality !== null &&
    drawingType === "elevation" &&
    Number(fragmentQuality) < 0.58
  ) {
    blockers.push(
      `${drawing.title || drawingType} side-facade fragment quality ${round(
        fragmentQuality,
      )} is below the minimum Phase 9 threshold 0.58.`,
    );
  }
  if (
    fragmentQuality !== null &&
    drawingType === "section" &&
    Number(fragmentQuality) < 0.64
  ) {
    blockers.push(
      `${drawing.title || drawingType} section candidate quality ${round(
        fragmentQuality,
      )} is below the minimum Phase 9 threshold 0.64.`,
    );
  }
  if (
    Number(annotationCompleteness) <
    Number(thresholds.minimumAnnotationCompleteness || 0)
  ) {
    blockers.push(
      `${drawing.title || drawingType} annotation completeness ${round(
        annotationCompleteness,
      )} is below the required threshold ${
        thresholds.minimumAnnotationCompleteness
      }.`,
    );
  }
  if (
    Number(thresholds.minimumLabelPresence || 0) > 0 &&
    Number(labelPresence) < Number(thresholds.minimumLabelPresence)
  ) {
    warnings.push(
      `${drawing.title || drawingType} label presence ${round(
        labelPresence,
      )} is below the preferred threshold ${thresholds.minimumLabelPresence}.`,
    );
  }

  if (
    drawingType === "plan" &&
    Number(planDensity) < Number(thresholds.minimumPlanDensity || 0)
  ) {
    blockers.push(
      `${drawing.title || drawingType} plan density ${round(
        planDensity,
      )} is below the required threshold ${thresholds.minimumPlanDensity}.`,
    );
  }
  if (
    drawingType === "elevation" &&
    Number(elevationRichness) < Number(thresholds.minimumElevationRichness || 0)
  ) {
    blockers.push(
      `${drawing.title || drawingType} elevation richness ${round(
        elevationRichness,
      )} is below the required threshold ${
        thresholds.minimumElevationRichness
      }.`,
    );
  }
  if (
    drawingType === "section" &&
    Number(sectionUsefulness) < Number(thresholds.minimumSectionUsefulness || 0)
  ) {
    blockers.push(
      `${drawing.title || drawingType} section usefulness ${round(
        sectionUsefulness,
      )} is below the required threshold ${
        thresholds.minimumSectionUsefulness
      }.`,
    );
  }

  if (score < thresholds.blocking) {
    blockers.push(
      `${drawing.title || drawingType} technical score ${score} is below the Phase 8 blocking threshold ${thresholds.blocking}.`,
    );
  } else if (score < thresholds.warning) {
    warnings.push(
      `${drawing.title || drawingType} technical score ${score} is below the preferred threshold ${thresholds.warning}.`,
    );
  }

  const verdict = blockers.length
    ? "block"
    : score < thresholds.warning
      ? "warning"
      : "pass";

  return {
    version:
      fragmentQuality !== null
        ? "phase9-technical-panel-scoring-v1"
        : "phase8-technical-panel-scoring-v1",
    drawingType,
    score,
    verdict,
    thresholds,
    categoryScores: {
      readability: round(readabilityScore),
      annotationCompleteness: round(annotationCompleteness),
      geometryCompleteness: round(geometryCompleteness),
      technicalDepth: round(technicalDepth),
      labelPresence: round(labelPresence),
      ...(fragmentQuality !== null
        ? { fragmentQuality: round(fragmentQuality) }
        : {}),
      ...(drawingType === "plan" ? { planDensity: round(planDensity) } : {}),
      ...(drawingType === "elevation"
        ? { elevationRichness: round(elevationRichness) }
        : {}),
      ...(drawingType === "section"
        ? { sectionUsefulness: round(sectionUsefulness) }
        : {}),
    },
    warnings: [...new Set(warnings)],
    blockers: [...new Set(blockers)],
    blocking: blockers.length > 0,
  };
}

export default {
  scoreTechnicalPanel,
};
