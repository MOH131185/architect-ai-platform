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
      (Number(metadata.cut_room_count || 0) > 0 ? 0.38 : 0.12) +
        (Number(metadata.section_direct_clip_count || 0) > 0 ? 0.16 : 0.02) +
        (Number(metadata.level_label_count || 0) > 0 ? 0.2 : 0) +
        (Number(metadata.foundation_marker_count || 0) > 0 ? 0.18 : 0) +
        positiveScore(metadata.roof_profile_visible) * 0.14,
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
      (Number(metadata.opening_group_count || 0) > 0 ? 0.08 : 0.02) +
      (Number(metadata.wall_zone_count || 0) > 0 ? 0.08 : 0.02) +
      (Number(metadata.feature_family_count || 0) > 0 ? 0.06 : 0.02) +
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
    const base = clamp(Number(metadata.section_usefulness_score), 0, 1);
    const hasEvidenceBreakdown =
      metadata.section_direct_evidence_score !== undefined ||
      metadata.section_inferred_evidence_score !== undefined ||
      metadata.section_communication_value !== undefined ||
      metadata.section_construction_evidence_score !== undefined;
    if (!hasEvidenceBreakdown) {
      return base;
    }
    const directTruth = clamp(
      Number(metadata.section_direct_evidence_score || 0),
      0,
      1,
    );
    const constructionTruth = clamp(
      Number(metadata.section_construction_evidence_score || 0),
      0,
      1,
    );
    const inferencePenalty = clamp(
      Number(metadata.section_inferred_evidence_score || 0),
      0,
      1,
    );
    const communicationValue = clamp(
      Number(metadata.section_communication_value || base),
      0,
      1,
    );
    return clamp(
      base * 0.42 +
        directTruth * 0.24 +
        constructionTruth * 0.18 +
        communicationValue * 0.24 -
        inferencePenalty * 0.18,
      0,
      1,
    );
  }
  return clamp(
    (Number(metadata.cut_room_count || 0) > 0 ? 0.26 : 0.08) +
      (Number(metadata.stair_count || 0) > 0 ? 0.18 : 0.04) +
      (Number(metadata.foundation_marker_count || 0) > 0 ? 0.12 : 0.03) +
      (Number(metadata.level_label_count || 0) > 0 ? 0.12 : 0.03) +
      (Number(metadata.stair_tread_count || 0) > 0 ? 0.12 : 0.04) +
      (metadata.section_strategy_id ? 0.08 : 0.02) +
      (Number(metadata.section_expected_communication_value || 0) > 0
        ? Math.min(
            0.1,
            Number(metadata.section_expected_communication_value || 0) * 0.1,
          )
        : 0) +
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
          metadata.section_communication_value ||
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
    Number(fragmentQuality) < 0.68
  ) {
    blockers.push(
      `${drawing.title || drawingType} section candidate quality ${round(
        fragmentQuality,
      )} is below the minimum Phase 13 threshold 0.68.`,
    );
  }
  if (
    drawingType === "section" &&
    isFeatureEnabled("useSectionCredibilityGatePhase13") &&
    String(metadata.section_direct_evidence_quality || "").toLowerCase() ===
      "blocked"
  ) {
    blockers.push(
      `${drawing.title || drawingType} direct section evidence is blocked, so the panel cannot be treated as exact technical truth.`,
    );
  }
  if (
    drawingType === "section" &&
    isFeatureEnabled("useSectionConstructionCredibilityGatePhase14") &&
    String(metadata.section_construction_truth_quality || "").toLowerCase() ===
      "blocked"
  ) {
    blockers.push(
      `${drawing.title || drawingType} construction truth is blocked, so the section cannot be treated as drafting-grade technical output.`,
    );
  } else if (
    drawingType === "section" &&
    isFeatureEnabled("useSectionConstructionCredibilityGatePhase14") &&
    String(metadata.section_construction_truth_quality || "").toLowerCase() ===
      "weak"
  ) {
    warnings.push(
      `${drawing.title || drawingType} construction truth is still weaker than preferred for a final board section.`,
    );
  }
  if (
    drawingType === "section" &&
    isFeatureEnabled("useSectionConstructionScoringPhase14") &&
    String(metadata.cut_wall_truth_quality || "").toLowerCase() === "blocked"
  ) {
    const directEvidenceStrong =
      String(metadata.section_direct_evidence_quality || "").toLowerCase() ===
        "verified" &&
      Number(metadata.section_direct_evidence_score || 0) >= 0.72;
    const constructionBlocked =
      String(
        metadata.section_construction_truth_quality || "",
      ).toLowerCase() === "blocked";
    if (constructionBlocked || !directEvidenceStrong) {
      blockers.push(
        `${drawing.title || drawingType} does not resolve enough cut wall truth for drafting-grade section credibility.`,
      );
    } else {
      warnings.push(
        `${drawing.title || drawingType} wall construction truth remains partial even though direct cut evidence is otherwise strong.`,
      );
    }
  }
  if (
    drawingType === "section" &&
    isFeatureEnabled("useSectionConstructionScoringPhase14") &&
    String(metadata.slab_truth_quality || "").toLowerCase() === "blocked"
  ) {
    const directEvidenceStrong =
      String(metadata.section_direct_evidence_quality || "").toLowerCase() ===
        "verified" &&
      Number(metadata.section_direct_evidence_score || 0) >= 0.72;
    if (!directEvidenceStrong) {
      blockers.push(
        `${drawing.title || drawingType} does not communicate slab/floor construction clearly enough.`,
      );
    } else {
      warnings.push(
        `${drawing.title || drawingType} slab/floor construction still depends partly on contextual support.`,
      );
    }
  }
  if (
    drawingType === "section" &&
    isFeatureEnabled("useSectionConstructionScoringPhase14") &&
    String(metadata.foundation_truth_quality || "").toLowerCase() === "blocked"
  ) {
    warnings.push(
      `${drawing.title || drawingType} still relies on ${String(metadata.foundation_truth_mode || "contextual_ground_relation")} foundation truth.`,
    );
  }
  if (
    drawingType === "section" &&
    isFeatureEnabled("useRoofFoundationSectionCredibilityGatePhase15") &&
    String(metadata.roof_truth_quality || "").toLowerCase() === "blocked" &&
    Number(metadata.roof_exact_clip_count || 0) === 0
  ) {
    warnings.push(
      `${drawing.title || drawingType} roof construction truth is still contextual or profile-derived.`,
    );
  }
  if (
    drawingType === "section" &&
    isFeatureEnabled("useRoofFoundationCredibilityGatePhase16") &&
    String(metadata.roof_truth_mode || "").toLowerCase() ===
      "roof_language_only"
  ) {
    blockers.push(
      `${drawing.title || drawingType} only communicates roof language without explicit roof geometry, so the roof portion cannot be treated as construction truth.`,
    );
  } else if (
    drawingType === "section" &&
    isFeatureEnabled("useRoofFoundationCredibilityGatePhase16") &&
    String(metadata.roof_truth_mode || "").toLowerCase() ===
      "derived_profile_only"
  ) {
    warnings.push(
      `${drawing.title || drawingType} roof truth still depends mainly on a derived roof profile rather than richer explicit roof primitives.`,
    );
  }
  if (
    drawingType === "section" &&
    isFeatureEnabled("useRoofFoundationSectionCredibilityGatePhase15") &&
    String(metadata.foundation_truth_quality || "").toLowerCase() ===
      "blocked" &&
    Number(metadata.foundation_direct_clip_count || 0) === 0 &&
    Number(metadata.base_condition_direct_clip_count || 0) === 0
  ) {
    const explicitGroundModel =
      Number(metadata.explicit_foundation_count || 0) > 0 ||
      Number(metadata.explicit_base_condition_count || 0) > 0;
    const directEvidenceStrong =
      String(metadata.section_direct_evidence_quality || "").toLowerCase() ===
        "verified" &&
      Number(metadata.section_direct_evidence_score || 0) >= 0.72;
    if (explicitGroundModel && directEvidenceStrong) {
      blockers.push(
        `${drawing.title || drawingType} does not expose enough explicit foundation/base-condition truth for final technical credibility.`,
      );
    } else {
      warnings.push(
        `${drawing.title || drawingType} foundation/base-condition truth is still contextual because the section lacks strong direct ground-condition proof.`,
      );
    }
  }
  if (
    drawingType === "section" &&
    isFeatureEnabled("useRoofFoundationCredibilityGatePhase16") &&
    String(metadata.foundation_truth_mode || "").toLowerCase() === "missing"
  ) {
    if (
      String(metadata.foundation_truth_quality || "").toLowerCase() ===
      "blocked"
    ) {
      blockers.push(
        `${drawing.title || drawingType} lacks explicit ground-relation primitives, so foundation/base-condition truth remains unsupported.`,
      );
    } else {
      warnings.push(
        `${drawing.title || drawingType} still lacks explicit ground-relation primitives, so foundation/base-condition truth remains provisional rather than final.`,
      );
    }
  } else if (
    drawingType === "section" &&
    isFeatureEnabled("useRoofFoundationCredibilityGatePhase16") &&
    String(metadata.foundation_truth_mode || "").toLowerCase() ===
      "contextual_ground_relation"
  ) {
    warnings.push(
      `${drawing.title || drawingType} foundation/base-condition truth still depends on contextual ground relation rather than explicit ground primitives.`,
    );
  } else if (
    drawingType === "section" &&
    isFeatureEnabled("useRoofFoundationSectionCredibilityGatePhase15") &&
    String(metadata.foundation_truth_quality || "").toLowerCase() === "weak"
  ) {
    warnings.push(
      `${drawing.title || drawingType} foundation/base-condition truth is still thinner than preferred.`,
    );
  }
  if (
    drawingType === "section" &&
    isFeatureEnabled("useSectionCredibilityGatePhase13") &&
    String(metadata.section_inferred_evidence_quality || "").toLowerCase() ===
      "blocked"
  ) {
    blockers.push(
      `${drawing.title || drawingType} still relies too heavily on inferred section evidence.`,
    );
  }
  if (
    drawingType === "section" &&
    isFeatureEnabled("useSectionCredibilityGatePhase13") &&
    String(metadata.section_direct_evidence_quality || "").toLowerCase() ===
      "weak"
  ) {
    warnings.push(
      `${drawing.title || drawingType} direct section evidence is still weaker than preferred for a final board.`,
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
  if (
    drawingType === "section" &&
    metadata.section_strategy_id == null &&
    isFeatureEnabled("useSectionStrategyLibraryPhase10")
  ) {
    warnings.push(
      `${drawing.title || drawingType} did not expose a specialized Phase 10 section strategy identifier.`,
    );
  }
  if (
    drawingType === "elevation" &&
    isFeatureEnabled("useSideFacadeSemanticsPhase10") &&
    Number(metadata.opening_group_count || 0) === 0 &&
    Number(metadata.wall_zone_count || 0) === 0
  ) {
    warnings.push(
      `${drawing.title || drawingType} did not expose richer Phase 10 facade side semantics.`,
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
      drawingType === "section" &&
      (Number(metadata.roof_explicit_primitive_count || 0) > 0 ||
        Number(metadata.explicit_foundation_count || 0) > 0 ||
        Number(metadata.explicit_base_condition_count || 0) > 0 ||
        Number(metadata.foundation_direct_clip_count || 0) > 0 ||
        Number(metadata.base_condition_direct_clip_count || 0) > 0)
        ? "phase15-technical-panel-scoring-v1"
        : drawingType === "section" &&
            (isFeatureEnabled("useSectionConstructionTruthPhase14") ||
              isFeatureEnabled("useDraftingGradeSectionGraphicsPhase14") ||
              isFeatureEnabled("useSectionConstructionScoringPhase14") ||
              isFeatureEnabled("useSectionConstructionCredibilityGatePhase14"))
          ? "phase14-technical-panel-scoring-v1"
          : drawingType === "section" &&
              isFeatureEnabled("useSectionCredibilityGatePhase13")
            ? "phase13-technical-panel-scoring-v1"
            : fragmentQuality !== null &&
                (drawingType === "elevation" || drawingType === "section")
              ? "phase10-technical-panel-scoring-v1"
              : fragmentQuality !== null
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
        ? {
            sectionUsefulness: round(sectionUsefulness),
            sectionConstructionTruth: round(
              Number(metadata.section_construction_evidence_score || 0),
            ),
          }
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
