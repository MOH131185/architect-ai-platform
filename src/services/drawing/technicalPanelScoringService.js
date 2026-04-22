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
    const contextualEvidenceScore = clamp(
      Number(metadata.section_contextual_evidence_score || 0),
      0,
      1,
    );
    const derivedEvidenceScore = clamp(
      Number(metadata.section_derived_evidence_score || 0),
      0,
      1,
    );
    const nearBooleanClipCount = clamp(
      Number(metadata.section_near_boolean_clip_count || 0),
      0,
      10,
    );
    const bandCoverageRatio = clamp(
      Number(metadata.section_band_coverage_ratio || 0),
      0,
      1,
    );
    const cutFaceCount = clamp(
      Number(
        metadata.section_cut_face_construction_truth_count ||
          metadata.section_face_cut_face_count ||
          0,
      ),
      0,
      20,
    );
    const cutProfileCount = clamp(
      Number(
        metadata.section_cut_profile_construction_truth_count ||
          metadata.section_face_cut_profile_count ||
          0,
      ),
      0,
      20,
    );
    const derivedProfileCount = clamp(
      Number(
        metadata.section_derived_profile_construction_truth_count ||
          metadata.section_face_derived_count ||
          0,
      ),
      0,
      20,
    );
    const profileContinuity = clamp(
      Number(metadata.section_average_construction_profile_continuity || 0),
      0,
      1,
    );
    const faceCredibilityScore = clamp(
      Number(metadata.section_face_credibility_score || 0),
      0,
      1,
    );
    return clamp(
      base * 0.4 +
        directTruth * 0.22 +
        constructionTruth * 0.16 +
        communicationValue * 0.22 -
        inferencePenalty * 0.18 -
        contextualEvidenceScore * 0.08 -
        derivedEvidenceScore * 0.1 +
        Math.min(0.08, nearBooleanClipCount * 0.01) +
        bandCoverageRatio * 0.06 +
        Math.min(0.12, cutFaceCount * 0.025) +
        Math.min(0.06, cutProfileCount * 0.012) +
        profileContinuity * 0.06 +
        faceCredibilityScore * 0.08 -
        Math.min(0.08, derivedProfileCount * 0.012),
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
    isFeatureEnabled("useSectionConstructionCredibilityGatePhase18") &&
    String(
      metadata.section_construction_evidence_quality || "",
    ).toLowerCase() === "blocked"
  ) {
    blockers.push(
      `${drawing.title || drawingType} exact construction evidence is blocked, so the section cannot be treated as a credible cut-construction drawing.`,
    );
  } else if (
    drawingType === "section" &&
    isFeatureEnabled("useSectionConstructionCredibilityGatePhase18") &&
    String(
      metadata.section_construction_evidence_quality || "",
    ).toLowerCase() === "weak"
  ) {
    warnings.push(
      `${drawing.title || drawingType} exact construction evidence remains thinner than preferred for final A1 credibility.`,
    );
  }
  if (
    drawingType === "section" &&
    isFeatureEnabled("useSectionConstructionCredibilityGatePhase19") &&
    String(metadata.wall_section_clip_quality || "").toLowerCase() === "blocked"
  ) {
    blockers.push(
      `${drawing.title || drawingType} does not resolve enough exact clipped wall profile truth for drafting-grade section credibility.`,
    );
  } else if (
    drawingType === "section" &&
    isFeatureEnabled("useSectionConstructionCredibilityGatePhase19") &&
    String(metadata.wall_section_clip_quality || "").toLowerCase() === "weak"
  ) {
    warnings.push(
      `${drawing.title || drawingType} wall clip truth remains weaker than preferred for drafting-grade section communication.`,
    );
  }
  if (
    drawingType === "section" &&
    isFeatureEnabled("useSectionConstructionCredibilityGatePhase19") &&
    String(metadata.opening_section_clip_quality || "").toLowerCase() ===
      "blocked"
  ) {
    warnings.push(
      `${drawing.title || drawingType} opening clip truth is still too thin to communicate cut opening depth cleanly.`,
    );
  }
  if (
    drawingType === "section" &&
    isFeatureEnabled("useSectionConstructionCredibilityGatePhase19") &&
    String(metadata.stair_section_clip_quality || "").toLowerCase() ===
      "blocked" &&
    Number(metadata.stair_count || 0) > 0
  ) {
    warnings.push(
      `${drawing.title || drawingType} stair clip truth remains too thin for a strong section communication narrative.`,
    );
  }
  if (
    drawingType === "section" &&
    isFeatureEnabled("useSectionConstructionCredibilityGatePhase19") &&
    String(metadata.roof_section_clip_quality || "").toLowerCase() === "weak"
  ) {
    warnings.push(
      `${drawing.title || drawingType} roof clip truth is still more contextual than preferred for final technical credibility.`,
    );
  }
  if (
    drawingType === "section" &&
    isFeatureEnabled("useSectionConstructionCredibilityGatePhase19") &&
    String(metadata.foundation_section_clip_quality || "").toLowerCase() ===
      "blocked"
  ) {
    warnings.push(
      `${drawing.title || drawingType} foundation/base-condition clip truth remains too thin for strong substructure communication.`,
    );
  }
  if (
    drawingType === "section" &&
    isFeatureEnabled("useSectionConstructionCredibilityGatePhase20")
  ) {
    if (
      String(
        metadata.section_contextual_evidence_quality || "",
      ).toLowerCase() === "blocked" ||
      String(metadata.section_derived_evidence_quality || "").toLowerCase() ===
        "blocked"
    ) {
      blockers.push(
        `${drawing.title || drawingType} still relies too heavily on contextual or derived section truth for Phase 20 credibility.`,
      );
    } else if (
      Number(metadata.section_near_boolean_clip_count || 0) === 0 &&
      Number(metadata.section_exact_construction_clip_count || 0) < 2
    ) {
      warnings.push(
        `${drawing.title || drawingType} lacks stronger near-boolean cut support, so the section still reads thinner than preferred for Phase 20.`,
      );
    }
  }
  if (
    drawingType === "section" &&
    isFeatureEnabled("useSectionConstructionCredibilityGatePhase21")
  ) {
    const faceQuality = String(
      metadata.section_face_credibility_quality || "",
    ).toLowerCase();
    const cutFaceCount = Number(
      metadata.section_cut_face_construction_truth_count ||
        metadata.section_face_cut_face_count ||
        0,
    );
    const cutProfileCount = Number(
      metadata.section_cut_profile_construction_truth_count ||
        metadata.section_face_cut_profile_count ||
        0,
    );
    const derivedFaceCount = Number(
      metadata.section_derived_profile_construction_truth_count ||
        metadata.section_face_derived_count ||
        0,
    );
    const profileContinuity = Number(
      metadata.section_average_construction_profile_continuity || 0,
    );
    if (faceQuality === "blocked") {
      blockers.push(
        `${drawing.title || drawingType} true cut-face credibility is blocked, so the section cannot be treated as drafting-grade geometric truth.`,
      );
    } else if (faceQuality === "weak") {
      warnings.push(
        `${drawing.title || drawingType} true cut-face credibility is still weaker than preferred for final Phase 21 drafting-grade credibility.`,
      );
    }
    if (
      cutFaceCount === 0 &&
      cutProfileCount === 0 &&
      Number(metadata.section_exact_construction_clip_count || 0) < 2
    ) {
      blockers.push(
        `${drawing.title || drawingType} does not expose any true cut-face or cut-profile construction truth, so the section reads as interpretation rather than geometry.`,
      );
    } else if (cutFaceCount === 0) {
      warnings.push(
        `${drawing.title || drawingType} has no exact cut-face construction truth; section still relies on cut-profile interpretation rather than true geometric cut-faces.`,
      );
    }
    if (
      derivedFaceCount > 0 &&
      cutFaceCount + cutProfileCount < derivedFaceCount
    ) {
      warnings.push(
        `${drawing.title || drawingType} still leans more on derived profile truth than on exact cut-face or cut-profile truth for Phase 21 credibility.`,
      );
    }
    if (profileContinuity > 0 && profileContinuity < 0.32) {
      warnings.push(
        `${drawing.title || drawingType} cut-profile continuity ${round(profileContinuity)} is weaker than preferred for a coherent drafting-grade section profile.`,
      );
    }
  }
  if (
    drawingType === "section" &&
    isFeatureEnabled("useSectionConstructionCredibilityGatePhase19") &&
    Number(metadata.section_profile_complexity_score || 0) < 0.28 &&
    Number(metadata.section_direct_evidence_score || 0) < 0.82
  ) {
    warnings.push(
      `${drawing.title || drawingType} clipped section profile remains simpler than preferred, so the drawing still risks reading as overly schematic.`,
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
    isFeatureEnabled("useSectionConstructionCredibilityGatePhase18") &&
    String(metadata.cut_opening_truth_quality || "").toLowerCase() ===
      "blocked" &&
    Number(metadata.cut_opening_direct_truth_count || 0) === 0 &&
    Number(metadata.cut_opening_exact_clip_count || 0) === 0
  ) {
    warnings.push(
      `${drawing.title || drawingType} does not resolve enough direct cut-opening truth for drafting-grade section communication.`,
    );
  }
  if (
    drawingType === "section" &&
    isFeatureEnabled("useSectionConstructionCredibilityGatePhase18") &&
    String(metadata.stair_truth_quality || "").toLowerCase() === "blocked" &&
    Number(metadata.stair_direct_truth_count || 0) === 0 &&
    Number(metadata.stair_count || 0) > 0
  ) {
    warnings.push(
      `${drawing.title || drawingType} includes stair geometry, but the cut does not communicate stair truth strongly enough.`,
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
    isFeatureEnabled("useRoofFoundationCredibilityGatePhase17")
  ) {
    const explicitRoofBreakdown =
      Number(metadata.roof_hip_count || 0) +
      Number(metadata.roof_valley_count || 0) +
      Number(metadata.roof_edge_count || 0) +
      Number(metadata.roof_parapet_count || 0) +
      Number(metadata.roof_break_count || 0);
    const explicitGroundBreakdown =
      Number(metadata.foundation_zone_count || 0) +
      Number(metadata.base_wall_condition_count || 0) +
      Number(metadata.explicit_ground_relation_count || 0);
    if (
      String(metadata.roof_truth_mode || "").toLowerCase() ===
        "explicit_generated" &&
      explicitRoofBreakdown === 0
    ) {
      warnings.push(
        `${drawing.title || drawingType} exposes explicit roof truth mode, but the cut does not surface richer roof primitive families yet.`,
      );
    }
    if (
      String(metadata.foundation_truth_mode || "").toLowerCase() ===
        "explicit_ground_primitives" &&
      explicitGroundBreakdown === 0
    ) {
      warnings.push(
        `${drawing.title || drawingType} exposes explicit ground truth mode, but the cut does not surface richer foundation/base-condition primitives yet.`,
      );
    }
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
      (metadata.section_cut_face_truth_available === true ||
        metadata.section_face_bundle_version != null ||
        metadata.section_face_credibility_quality != null ||
        metadata.section_face_cut_face_count != null ||
        metadata.section_face_cut_profile_count != null ||
        metadata.section_cut_face_construction_truth_count != null ||
        metadata.section_average_construction_profile_continuity != null)
        ? "phase21-technical-panel-scoring-v1"
        : drawingType === "section" &&
            (metadata.section_truth_model_version != null ||
              metadata.section_contextual_evidence_quality != null ||
              metadata.section_derived_evidence_quality != null ||
              metadata.section_near_boolean_clip_count != null ||
              metadata.section_band_coverage_ratio != null)
          ? "phase20-technical-panel-scoring-v1"
          : drawingType === "section" &&
              (metadata.wall_section_clip_quality != null ||
                metadata.section_profile_complexity_score != null ||
                metadata.section_drafting_evidence_score != null)
            ? "phase19-technical-panel-scoring-v1"
            : drawingType === "section" &&
                (Number(metadata.roof_hip_count || 0) > 0 ||
                  Number(metadata.roof_valley_count || 0) > 0 ||
                  Number(metadata.foundation_zone_count || 0) > 0 ||
                  Number(metadata.base_wall_condition_count || 0) > 0)
              ? "phase17-technical-panel-scoring-v1"
              : drawingType === "section" &&
                  (Number(metadata.roof_explicit_primitive_count || 0) > 0 ||
                    Number(metadata.explicit_foundation_count || 0) > 0 ||
                    Number(metadata.explicit_base_condition_count || 0) > 0 ||
                    Number(metadata.foundation_direct_clip_count || 0) > 0 ||
                    Number(metadata.base_condition_direct_clip_count || 0) > 0)
                ? "phase15-technical-panel-scoring-v1"
                : drawingType === "section" &&
                    (isFeatureEnabled("useSectionConstructionTruthPhase14") ||
                      isFeatureEnabled(
                        "useDraftingGradeSectionGraphicsPhase14",
                      ) ||
                      isFeatureEnabled(
                        "useSectionConstructionScoringPhase14",
                      ) ||
                      isFeatureEnabled(
                        "useSectionConstructionCredibilityGatePhase14",
                      ))
                  ? "phase14-technical-panel-scoring-v1"
                  : drawingType === "section" &&
                      isFeatureEnabled("useSectionCredibilityGatePhase13")
                    ? "phase13-technical-panel-scoring-v1"
                    : fragmentQuality !== null &&
                        (drawingType === "elevation" ||
                          drawingType === "section")
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
