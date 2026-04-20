import { evaluateDrawingFragmentQuality } from "../drawing/drawingFragmentQualityService.js";

function normalizeStatus(entry = {}) {
  if (entry?.svg === null || entry?.status === "blocked") return "block";
  const directEvidenceQuality = String(
    entry?.technical_quality_metadata?.section_direct_evidence_quality || "",
  ).toLowerCase();
  const inferredEvidenceQuality = String(
    entry?.technical_quality_metadata?.section_inferred_evidence_quality || "",
  ).toLowerCase();
  if (
    directEvidenceQuality === "blocked" ||
    inferredEvidenceQuality === "blocked"
  ) {
    return "block";
  }
  if (directEvidenceQuality === "weak" || inferredEvidenceQuality === "weak") {
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
  const sectionEvidenceQuality = sectionCandidateQuality.some(
    (entry) => entry.evidenceQuality === "block" || entry.status === "block",
  )
    ? "blocked"
    : sectionCandidateQuality.some(
          (entry) =>
            entry.evidenceQuality === "warning" || entry.status === "warning",
        )
      ? "weak"
      : sectionCandidateQuality.length
        ? "verified"
        : "provisional";
  const sectionDirectEvidenceQuality = sectionCandidateQuality.some(
    (entry) =>
      entry.directEvidenceQuality === "blocked" || entry.status === "block",
  )
    ? "blocked"
    : sectionCandidateQuality.some(
          (entry) => entry.directEvidenceQuality === "weak",
        )
      ? "weak"
      : sectionCandidateQuality.length
        ? "verified"
        : "provisional";
  const sectionInferredEvidenceQuality = sectionCandidateQuality.some(
    (entry) => entry.inferredEvidenceQuality === "blocked",
  )
    ? "blocked"
    : sectionCandidateQuality.some(
          (entry) => entry.inferredEvidenceQuality === "weak",
        )
      ? "weak"
      : sectionCandidateQuality.length
        ? "verified"
        : "provisional";

  return {
    version: "phase13-a1-technical-panel-regression-v1",
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
    technicalFragmentScores: fragmentQuality.fragmentScores,
  };
}

export default {
  runA1TechnicalPanelRegression,
};
