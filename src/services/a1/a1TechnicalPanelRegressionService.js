import { evaluateDrawingFragmentQuality } from "../drawing/drawingFragmentQualityService.js";
import { truthBucketFromMode } from "../drawing/constructionTruthModel.js";

function normalizeStatus(entry = {}) {
  if (entry?.svg === null || entry?.status === "blocked") return "block";
  const directEvidenceQuality = String(
    entry?.technical_quality_metadata?.section_direct_evidence_quality || "",
  ).toLowerCase();
  const inferredEvidenceQuality = String(
    entry?.technical_quality_metadata?.section_inferred_evidence_quality || "",
  ).toLowerCase();
  const constructionTruthQuality = String(
    entry?.technical_quality_metadata?.section_construction_truth_quality || "",
  ).toLowerCase();
  const constructionEvidenceQuality = String(
    entry?.technical_quality_metadata?.section_construction_evidence_quality ||
      "",
  ).toLowerCase();
  const cutWallTruthQuality = String(
    entry?.technical_quality_metadata?.cut_wall_truth_quality || "",
  ).toLowerCase();
  const cutOpeningTruthQuality = String(
    entry?.technical_quality_metadata?.cut_opening_truth_quality || "",
  ).toLowerCase();
  const stairTruthQuality = String(
    entry?.technical_quality_metadata?.stair_truth_quality || "",
  ).toLowerCase();
  const slabTruthQuality = String(
    entry?.technical_quality_metadata?.slab_truth_quality || "",
  ).toLowerCase();
  const roofTruthQuality = String(
    entry?.technical_quality_metadata?.roof_truth_quality || "",
  ).toLowerCase();
  const roofTruthMode = String(
    entry?.technical_quality_metadata?.roof_truth_mode || "",
  ).toLowerCase();
  const foundationTruthQuality = String(
    entry?.technical_quality_metadata?.foundation_truth_quality || "",
  ).toLowerCase();
  const foundationTruthMode = String(
    entry?.technical_quality_metadata?.foundation_truth_mode || "",
  ).toLowerCase();
  if (
    directEvidenceQuality === "blocked" ||
    inferredEvidenceQuality === "blocked" ||
    constructionEvidenceQuality === "blocked" ||
    constructionTruthQuality === "blocked" ||
    cutWallTruthQuality === "blocked" ||
    slabTruthQuality === "blocked" ||
    foundationTruthQuality === "blocked"
  ) {
    return "block";
  }
  if (
    directEvidenceQuality === "weak" ||
    inferredEvidenceQuality === "weak" ||
    constructionEvidenceQuality === "weak" ||
    constructionTruthQuality === "weak" ||
    cutWallTruthQuality === "weak" ||
    cutOpeningTruthQuality === "weak" ||
    stairTruthQuality === "weak" ||
    slabTruthQuality === "weak" ||
    roofTruthQuality === "weak" ||
    foundationTruthQuality === "weak"
  ) {
    return "warning";
  }
  if (
    roofTruthMode === "roof_language_only" ||
    (foundationTruthMode === "missing" && foundationTruthQuality === "blocked")
  ) {
    return "block";
  }
  if (
    roofTruthMode === "derived_profile_only" ||
    foundationTruthMode === "contextual_ground_relation" ||
    foundationTruthMode === "missing"
  ) {
    return "warning";
  }
  const richness = Number(
    entry?.technical_quality_metadata?.facade_richness_score || 0,
  );
  const usefulness = Number(
    entry?.technical_quality_metadata?.section_usefulness_score || 0,
  );
  if (richness && richness < 0.62) return "warning";
  if (usefulness && usefulness < 0.68) return "warning";
  return "pass";
}

export function runA1TechnicalPanelRegression({
  drawings = {},
  technicalPanelQuality = null,
} = {}) {
  const fragmentQuality = evaluateDrawingFragmentQuality({
    drawings,
    technicalPanelQuality,
  });
  const perSideElevationStatus = Object.fromEntries(
    (drawings.elevation || []).map((entry) => [
      String(entry.orientation || "unknown").toLowerCase(),
      {
        status: normalizeStatus(entry),
        richnessScore: Number(
          entry.technical_quality_metadata?.facade_richness_score || 0,
        ),
        geometrySource:
          entry.technical_quality_metadata?.geometry_source || null,
        blockers: entry.blocking_reasons || [],
        warnings: entry.annotation_validation?.warnings || [],
        summary: entry.technical_quality_metadata?.side_facade_summary || null,
        evidenceQuality:
          entry.technical_quality_metadata?.side_facade_schema_quality ||
          entry.technical_quality_metadata?.side_facade_status ||
          null,
      },
    ]),
  );
  const sectionCandidateQuality = (drawings.section || []).map((entry) => ({
    sectionType: entry.section_type || "unknown",
    status:
      entry.section_profile?.sectionCandidateQuality || normalizeStatus(entry),
    score: Number(
      entry.technical_quality_metadata?.section_usefulness_score || 0,
    ),
    strategyId:
      entry.technical_quality_metadata?.section_strategy_id ||
      entry.section_profile?.strategyId ||
      null,
    strategyName:
      entry.technical_quality_metadata?.section_strategy_name ||
      entry.section_profile?.strategyName ||
      null,
    expectedCommunicationValue: Number(
      entry.technical_quality_metadata?.section_expected_communication_value ||
        entry.section_profile?.expectedCommunicationValue ||
        0,
    ),
    rationale:
      entry.section_semantics?.rationale ||
      entry.section_profile?.rationale ||
      [],
    evidenceQuality:
      entry.technical_quality_metadata?.section_evidence_quality || null,
    directEvidenceQuality:
      entry.technical_quality_metadata?.section_direct_evidence_quality || null,
    inferredEvidenceQuality:
      entry.technical_quality_metadata?.section_inferred_evidence_quality ||
      null,
    directEvidenceScore: Number(
      entry.technical_quality_metadata?.section_direct_evidence_score || 0,
    ),
    inferredEvidenceScore: Number(
      entry.technical_quality_metadata?.section_inferred_evidence_score || 0,
    ),
    communicationValue: Number(
      entry.technical_quality_metadata?.section_communication_value || 0,
    ),
    constructionEvidenceQuality:
      entry.technical_quality_metadata?.section_construction_evidence_quality ||
      null,
    constructionTruthQuality:
      entry.technical_quality_metadata?.section_construction_truth_quality ||
      null,
    cutWallTruthQuality:
      entry.technical_quality_metadata?.cut_wall_truth_quality || null,
    cutOpeningTruthQuality:
      entry.technical_quality_metadata?.cut_opening_truth_quality || null,
    stairTruthQuality:
      entry.technical_quality_metadata?.stair_truth_quality || null,
    slabTruthQuality:
      entry.technical_quality_metadata?.slab_truth_quality || null,
    roofTruthQuality:
      entry.technical_quality_metadata?.roof_truth_quality || null,
    roofTruthMode: entry.technical_quality_metadata?.roof_truth_mode || null,
    foundationTruthQuality:
      entry.technical_quality_metadata?.foundation_truth_quality || null,
    foundationTruthMode:
      entry.technical_quality_metadata?.foundation_truth_mode || null,
    constructionEvidenceScore: Number(
      entry.technical_quality_metadata?.section_construction_evidence_score ||
        0,
    ),
    directConstructionTruthCount: Number(
      entry.technical_quality_metadata
        ?.section_direct_construction_truth_count || 0,
    ),
    exactConstructionClipCount: Number(
      entry.technical_quality_metadata?.section_exact_construction_clip_count ||
        0,
    ),
  }));

  const blockers = [];
  const warnings = [];

  ["east", "west"].forEach((side) => {
    const status = perSideElevationStatus[side];
    if (!status) {
      blockers.push(`Elevation ${side} is missing from the technical set.`);
      return;
    }
    if (status.status === "block") {
      blockers.push(
        `Elevation ${side} failed the Phase 9 side-facade credibility gate.`,
      );
    } else if (status.status === "warning") {
      warnings.push(
        `Elevation ${side} remains weaker than preferred for final A1 composition.`,
      );
    }
  });

  sectionCandidateQuality.forEach((entry) => {
    if (entry.status === "block") {
      blockers.push(
        `Section ${entry.sectionType} is semantically too weak for final technical composition.`,
      );
    } else if (entry.status === "warning") {
      warnings.push(
        `Section ${entry.sectionType} is serviceable but still semantically thin.`,
      );
    }
  });

  const sideFacadeEvidenceQuality = Object.values(perSideElevationStatus).some(
    (entry) => entry.evidenceQuality === "block" || entry.status === "block",
  )
    ? "blocked"
    : Object.values(perSideElevationStatus).some(
          (entry) =>
            entry.evidenceQuality === "warning" || entry.status === "warning",
        )
      ? "weak"
      : Object.keys(perSideElevationStatus).length
        ? "verified"
        : "provisional";
  const sectionEvidenceEntries = sectionCandidateQuality.filter(
    (entry) => entry.evidenceQuality != null,
  );
  const sectionDirectEntries = sectionCandidateQuality.filter(
    (entry) => entry.directEvidenceQuality != null,
  );
  const sectionInferredEntries = sectionCandidateQuality.filter(
    (entry) => entry.inferredEvidenceQuality != null,
  );
  const sectionConstructionEntries = sectionCandidateQuality.filter(
    (entry) => entry.constructionTruthQuality != null,
  );
  const sectionConstructionEvidenceEntries = sectionCandidateQuality.filter(
    (entry) => entry.constructionEvidenceQuality != null,
  );
  const sectionWallTruthEntries = sectionCandidateQuality.filter(
    (entry) => entry.cutWallTruthQuality != null,
  );
  const sectionOpeningTruthEntries = sectionCandidateQuality.filter(
    (entry) => entry.cutOpeningTruthQuality != null,
  );
  const sectionStairTruthEntries = sectionCandidateQuality.filter(
    (entry) => entry.stairTruthQuality != null,
  );
  const sectionSlabEntries = sectionCandidateQuality.filter(
    (entry) => entry.slabTruthQuality != null,
  );
  const sectionRoofEntries = sectionCandidateQuality.filter(
    (entry) => entry.roofTruthQuality != null,
  );
  const sectionFoundationEntries = sectionCandidateQuality.filter(
    (entry) => entry.foundationTruthQuality != null,
  );
  const roofTruthModes = sectionCandidateQuality
    .map((entry) => entry.roofTruthMode)
    .filter(Boolean);
  const foundationTruthModes = sectionCandidateQuality
    .map((entry) => entry.foundationTruthMode)
    .filter(Boolean);
  const sectionEvidenceQuality = sectionEvidenceEntries.some(
    (entry) => entry.evidenceQuality === "block" || entry.status === "block",
  )
    ? "blocked"
    : sectionEvidenceEntries.some(
          (entry) =>
            entry.evidenceQuality === "warning" || entry.status === "warning",
        )
      ? "weak"
      : sectionEvidenceEntries.length
        ? "verified"
        : "provisional";
  const sectionDirectEvidenceQuality = sectionDirectEntries.some(
    (entry) => entry.directEvidenceQuality === "blocked",
  )
    ? "blocked"
    : sectionDirectEntries.some(
          (entry) => entry.directEvidenceQuality === "weak",
        )
      ? "weak"
      : sectionDirectEntries.length
        ? "verified"
        : "provisional";
  const sectionInferredEvidenceQuality = sectionInferredEntries.some(
    (entry) => entry.inferredEvidenceQuality === "blocked",
  )
    ? "blocked"
    : sectionInferredEntries.some(
          (entry) => entry.inferredEvidenceQuality === "weak",
        )
      ? "weak"
      : sectionInferredEntries.length
        ? "verified"
        : "provisional";
  const sectionConstructionTruthQuality = sectionConstructionEntries.some(
    (entry) => entry.constructionTruthQuality === "blocked",
  )
    ? "blocked"
    : sectionConstructionEntries.some(
          (entry) => entry.constructionTruthQuality === "weak",
        )
      ? "weak"
      : sectionConstructionEntries.length
        ? "verified"
        : "provisional";
  const sectionConstructionEvidenceQuality =
    sectionConstructionEvidenceEntries.some(
      (entry) => entry.constructionEvidenceQuality === "blocked",
    )
      ? "blocked"
      : sectionConstructionEvidenceEntries.some(
            (entry) => entry.constructionEvidenceQuality === "weak",
          )
        ? "weak"
        : sectionConstructionEvidenceEntries.length
          ? "verified"
          : "provisional";
  const cutWallTruthQuality = sectionWallTruthEntries.some(
    (entry) => entry.cutWallTruthQuality === "blocked",
  )
    ? "blocked"
    : sectionWallTruthEntries.some(
          (entry) => entry.cutWallTruthQuality === "weak",
        )
      ? "weak"
      : sectionWallTruthEntries.length
        ? "verified"
        : "provisional";
  const cutOpeningTruthQuality = sectionOpeningTruthEntries.some(
    (entry) => entry.cutOpeningTruthQuality === "blocked",
  )
    ? "blocked"
    : sectionOpeningTruthEntries.some(
          (entry) => entry.cutOpeningTruthQuality === "weak",
        )
      ? "weak"
      : sectionOpeningTruthEntries.length
        ? "verified"
        : "provisional";
  const stairTruthQuality = sectionStairTruthEntries.some(
    (entry) => entry.stairTruthQuality === "blocked",
  )
    ? "blocked"
    : sectionStairTruthEntries.some(
          (entry) => entry.stairTruthQuality === "weak",
        )
      ? "weak"
      : sectionStairTruthEntries.length
        ? "verified"
        : "provisional";
  const slabTruthQuality = sectionSlabEntries.some(
    (entry) => entry.slabTruthQuality === "blocked",
  )
    ? "blocked"
    : sectionSlabEntries.some((entry) => entry.slabTruthQuality === "weak")
      ? "weak"
      : sectionSlabEntries.length
        ? "verified"
        : "provisional";
  const roofTruthQuality = sectionRoofEntries.some(
    (entry) => entry.roofTruthQuality === "blocked",
  )
    ? "blocked"
    : sectionRoofEntries.some((entry) => entry.roofTruthQuality === "weak")
      ? "weak"
      : sectionRoofEntries.length
        ? "verified"
        : "provisional";
  const foundationTruthQuality = sectionFoundationEntries.some(
    (entry) => entry.foundationTruthQuality === "blocked",
  )
    ? "blocked"
    : sectionFoundationEntries.some(
          (entry) => entry.foundationTruthQuality === "weak",
        )
      ? "weak"
      : sectionFoundationEntries.length
        ? "verified"
        : "provisional";
  const roofTruthMode = roofTruthModes.includes("roof_language_only")
    ? "roof_language_only"
    : roofTruthModes.includes("derived_profile_only")
      ? "derived_profile_only"
      : roofTruthModes.includes("explicit_generated")
        ? "explicit_generated"
        : roofTruthModes[0] || "missing";
  const foundationTruthMode = foundationTruthModes.includes("missing")
    ? "missing"
    : foundationTruthModes.includes("contextual_ground_relation")
      ? "contextual_ground_relation"
      : foundationTruthModes.includes("explicit_ground_primitives")
        ? "explicit_ground_primitives"
        : foundationTruthModes[0] || "missing";
  const roofTruthState = truthBucketFromMode(roofTruthMode);
  const foundationTruthState = truthBucketFromMode(foundationTruthMode);
  const chosenSectionRationale =
    sectionCandidateQuality.find((entry) => entry.selectedForBoard)
      ?.rationale?.[0] ||
    sectionCandidateQuality[0]?.rationale?.[0] ||
    null;

  return {
    version:
      sectionConstructionEvidenceQuality !== "provisional" ||
      cutWallTruthQuality !== "provisional" ||
      cutOpeningTruthQuality !== "provisional" ||
      stairTruthQuality !== "provisional"
        ? "phase18-a1-technical-panel-regression-v1"
        : roofTruthState !== "unsupported" ||
            foundationTruthState !== "unsupported"
          ? "phase17-a1-technical-panel-regression-v1"
          : roofTruthMode !== "missing" || foundationTruthMode !== "missing"
            ? "phase16-a1-technical-panel-regression-v1"
            : roofTruthQuality !== "provisional" ||
                foundationTruthQuality !== "provisional"
              ? "phase15-a1-technical-panel-regression-v1"
              : sectionConstructionTruthQuality !== "provisional"
                ? "phase14-a1-technical-panel-regression-v1"
                : "phase13-a1-technical-panel-regression-v1",
    regressionReady: blockers.length === 0,
    status: blockers.length ? "block" : warnings.length ? "warning" : "pass",
    blockers: [...new Set(blockers)],
    warnings: [...new Set(warnings)],
    perSideElevationStatus,
    sectionCandidateQuality,
    sideFacadeEvidenceQuality,
    sectionEvidenceQuality,
    sectionDirectEvidenceQuality,
    sectionInferredEvidenceQuality,
    sectionConstructionEvidenceQuality,
    sectionConstructionTruthQuality,
    cutWallTruthQuality,
    cutOpeningTruthQuality,
    stairTruthQuality,
    slabTruthQuality,
    roofTruthQuality,
    roofTruthMode,
    roofTruthState,
    foundationTruthQuality,
    foundationTruthMode,
    foundationTruthState,
    chosenSectionRationale,
    technicalFragmentScores: fragmentQuality.fragmentScores,
  };
}

export default {
  runA1TechnicalPanelRegression,
};
