import { getDrawingQualityThresholds } from "./drawingQualityThresholdService.js";

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function round(value, precision = 3) {
  const factor = 10 ** precision;
  return Math.round(Number(value || 0) * factor) / factor;
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
  const annotationStable = annotationPlacement
    ? annotationPlacement.placementStable !== false
    : true;

  const readabilityScore = Number(readability?.score || 0);
  const annotationCompleteness = clamp(
    annotation?.errors?.length
      ? 0.2
      : 1 -
          Math.min(
            0.8,
            (annotation?.warnings?.length || 0) * 0.18 +
              (annotationPlacement?.collisionCount || 0) * 0.14 +
              (annotationPlacement?.fallbackPlacementCount || 0) * 0.06,
          ),
    0,
    1,
  );
  const geometryConsistency =
    drawing.svg && !annotation?.errors?.length ? 1 : 0.25;
  const labelPresence = clamp(
    Number(metadata.room_label_count || metadata.level_label_count || 0) > 0
      ? 1
      : 0.35,
    0,
    1,
  );
  const sectionUsefulness =
    drawingType === "section"
      ? Number(metadata.section_usefulness_score || 0.55)
      : drawingType === "elevation"
        ? clamp(
            (Number(metadata.window_count || 0) > 0 ? 0.55 : 0.35) +
              (Number(metadata.bay_count || 0) > 0 ? 0.2 : 0),
            0,
            1,
          )
        : clamp(
            (Number(metadata.stair_count || 0) > 0 ? 0.62 : 0.45) +
              (metadata.has_title_block ? 0.12 : 0),
            0,
            1,
          );
  const scorePenalty = annotationStable ? 0 : 0.1;

  const score = round(
    readabilityScore * 0.36 +
      annotationCompleteness * 0.24 +
      geometryConsistency * 0.14 +
      sectionUsefulness * 0.16 +
      labelPresence * 0.1 -
      scorePenalty,
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

  if (!annotationStable) {
    blockers.push(
      `${
        drawing.title || drawingType
      } has unresolved annotation placement instability.`,
    );
  }
  if (
    Number(annotationCompleteness) <
    Number(thresholds.minimumAnnotationCompleteness || 0)
  ) {
    blockers.push(
      `${
        drawing.title || drawingType
      } annotation completeness ${round(annotationCompleteness)} is below the required threshold ${
        thresholds.minimumAnnotationCompleteness
      }.`,
    );
  }
  if (
    Number(thresholds.minimumLabelPresence || 0) > 0 &&
    Number(labelPresence) < Number(thresholds.minimumLabelPresence)
  ) {
    warnings.push(
      `${
        drawing.title || drawingType
      } label presence ${round(labelPresence)} is below the preferred threshold ${
        thresholds.minimumLabelPresence
      }.`,
    );
  }
  if (
    drawingType === "section" &&
    Number(sectionUsefulness) < Number(thresholds.minimumSectionUsefulness || 0)
  ) {
    blockers.push(
      `${
        drawing.title || drawingType
      } section usefulness ${round(sectionUsefulness)} is below the required threshold ${
        thresholds.minimumSectionUsefulness
      }.`,
    );
  }
  if (drawingType === "plan" && metadata.has_scale_bar !== true) {
    warnings.push("Plan scale bar metadata is missing.");
  }
  if (drawingType === "plan" && metadata.has_north_arrow !== true) {
    warnings.push("Plan north arrow metadata is missing.");
  }

  if (score < thresholds.blocking) {
    blockers.push(
      `${
        drawing.title || drawingType
      } technical score ${score} is below the Phase 7 blocking threshold ${
        thresholds.blocking
      }.`,
    );
  } else if (score < thresholds.warning) {
    warnings.push(
      `${
        drawing.title || drawingType
      } technical score ${score} is below the preferred threshold ${
        thresholds.warning
      }.`,
    );
  }

  return {
    version: "phase7-technical-panel-scoring-v1",
    drawingType,
    score,
    thresholds,
    categoryScores: {
      readability: round(readabilityScore),
      annotationCompleteness: round(annotationCompleteness),
      geometryConsistency: round(geometryConsistency),
      sectionUsefulness: round(sectionUsefulness),
      labelPresence: round(labelPresence),
    },
    warnings: [...new Set(warnings)],
    blockers: [...new Set(blockers)],
    blocking: blockers.length > 0,
  };
}

export default {
  scoreTechnicalPanel,
};
