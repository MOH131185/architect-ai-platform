import { isFeatureEnabled } from "../../config/featureFlags.js";
import {
  buildSectionEvidence,
  buildSectionEvidenceSummary,
} from "./sectionEvidenceService.js";

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function round(value, precision = 3) {
  const factor = 10 ** precision;
  return Math.round(Number(value || 0) * factor) / factor;
}

function isLongitudinal(candidate = {}) {
  return String(candidate.sectionType || "").toLowerCase() === "longitudinal";
}

function cutCoordinate(candidate = {}) {
  if (isLongitudinal(candidate)) {
    return Number(candidate.cutLine?.from?.x || candidate.cutLine?.to?.x || 0);
  }
  return Number(candidate.cutLine?.from?.y || candidate.cutLine?.to?.y || 0);
}

function sectionTruthEnabled() {
  return (
    isFeatureEnabled("useCanonicalConstructionTruthModelPhase17") ||
    isFeatureEnabled("useExplicitRoofPrimitiveSynthesisPhase17") ||
    isFeatureEnabled("useExplicitFoundationPrimitiveSynthesisPhase17") ||
    isFeatureEnabled("useDeeperRoofFoundationClippingPhase17") ||
    isFeatureEnabled("useRoofFoundationCredibilityGatePhase17") ||
    isFeatureEnabled("useRoofFoundationSectionTruthPhase15") ||
    isFeatureEnabled("useSectionConstructionTruthPhase14") ||
    isFeatureEnabled("useSectionConstructionScoringPhase14") ||
    isFeatureEnabled("useTrueSectionClippingPhase13") ||
    isFeatureEnabled("useSectionTruthScoringPhase13") ||
    isFeatureEnabled("useTrueSectionEvidencePhase12") ||
    isFeatureEnabled("useSectionEvidencePhase10")
  );
}

function entityDistance(entity = {}, candidate = {}) {
  const coordinate = cutCoordinate(candidate);
  const bbox = entity.bbox || {};
  const min = Number(
    isLongitudinal(candidate)
      ? bbox.min_x || bbox.x || 0
      : bbox.min_y || bbox.y || 0,
  );
  const max = Number(
    isLongitudinal(candidate)
      ? bbox.max_x || (bbox.x || 0) + (bbox.width || 0)
      : bbox.max_y || (bbox.y || 0) + (bbox.height || 0),
  );
  if (coordinate >= min && coordinate <= max) {
    return 0;
  }
  return Math.min(Math.abs(coordinate - min), Math.abs(coordinate - max));
}

function countFocusedRooms(
  projectGeometry = {},
  candidate = {},
  sectionEvidenceSummary = null,
) {
  if (sectionTruthEnabled() && sectionEvidenceSummary) {
    return (
      Number(sectionEvidenceSummary.cutRoomCount || 0) +
      Math.min(1, Number(sectionEvidenceSummary.nearRoomCount || 0))
    );
  }
  return (projectGeometry.rooms || []).filter(
    (room) => entityDistance(room, candidate) < 0.65,
  ).length;
}

function scoreStairAlignment(
  projectGeometry = {},
  candidate = {},
  sectionEvidenceSummary = null,
) {
  if (sectionTruthEnabled() && sectionEvidenceSummary) {
    if (Number(sectionEvidenceSummary.cutStairCount || 0) > 0) return 1;
    if (Number(sectionEvidenceSummary.nearStairCount || 0) > 0) return 0.56;
    if (Number(sectionEvidenceSummary.inferredStairCount || 0) > 0) return 0.28;
  }
  const stairs = projectGeometry.stairs || [];
  if (!stairs.length) return 0.25;
  const bestDistance = Math.min(
    ...stairs.map((stair) => entityDistance(stair, candidate)),
  );
  return clamp(1 - bestDistance / 3.2, 0, 1);
}

function scoreRoomCoverage(
  projectGeometry = {},
  candidate = {},
  sectionEvidenceSummary = null,
) {
  if (sectionTruthEnabled() && sectionEvidenceSummary) {
    const roomWeight =
      Number(sectionEvidenceSummary.cutRoomCount || 0) +
      Number(sectionEvidenceSummary.nearRoomCount || 0) * 0.45 +
      Number(sectionEvidenceSummary.inferredRoomCount || 0) * 0.18;
    if (roomWeight <= 0) {
      return 0.05;
    }
    return clamp(roomWeight / 3, 0.18, 1);
  }
  const roomCount = countFocusedRooms(projectGeometry, candidate);
  if (roomCount <= 0) {
    return 0.05;
  }
  return clamp(roomCount / 3, 0.25, 1);
}

function scoreEntranceAlignment(projectGeometry = {}, candidate = {}) {
  const entrances = projectGeometry.entrances || [];
  if (!entrances.length) return 0.35;
  const coordinate = cutCoordinate(candidate);
  const bestDistance = Math.min(
    ...entrances.map((entry) =>
      Math.abs(
        coordinate -
          Number(
            isLongitudinal(candidate)
              ? entry.position_m?.x || entry.position?.x || 0
              : entry.position_m?.y || entry.position?.y || 0,
          ),
      ),
    ),
  );
  return clamp(1 - bestDistance / 4, 0, 1);
}

function scoreCirculation(projectGeometry = {}, candidate = {}) {
  const circulation = projectGeometry.circulation || [];
  if (!circulation.length) return 0.35;
  const coordinate = cutCoordinate(candidate);
  const bestDistance = Math.min(
    ...circulation.flatMap((path) =>
      (path.polyline || []).map((point) =>
        Math.abs(
          coordinate -
            Number(isLongitudinal(candidate) ? point.x || 0 : point.y || 0),
        ),
      ),
    ),
  );
  return clamp(1 - bestDistance / 3.5, 0, 1);
}

export function scoreSectionCandidate(projectGeometry = {}, candidate = {}) {
  const useSectionEvidence = sectionTruthEnabled();
  const sectionEvidence = buildSectionEvidence(projectGeometry, candidate);
  const sectionEvidenceSummary = buildSectionEvidenceSummary(sectionEvidence);
  const nonConstructionBlockers = (sectionEvidence.blockers || []).filter(
    (entry) =>
      !/construction truth|cut wall truth|slab\/floor construction|foundation communication/i.test(
        String(entry || ""),
      ),
  );
  const stairAlignment = scoreStairAlignment(
    projectGeometry,
    candidate,
    sectionEvidenceSummary,
  );
  const roomCoverage = scoreRoomCoverage(
    projectGeometry,
    candidate,
    sectionEvidenceSummary,
  );
  const entranceAlignment = scoreEntranceAlignment(projectGeometry, candidate);
  const circulationScore = scoreCirculation(projectGeometry, candidate);
  const levelSpan = (projectGeometry.levels || []).length > 1 ? 1 : 0.58;
  const strategyCommunication = clamp(
    Number(candidate.expectedCommunicationValue || 0.58),
    0,
    1,
  );
  const evidenceUsefulness = clamp(
    Number(
      sectionEvidenceSummary.usefulnessScore ||
        sectionEvidenceSummary.communicationValue ||
        0,
    ),
    0,
    1,
  );
  const directEvidenceScore = clamp(
    Number(sectionEvidenceSummary.directEvidenceScore || 0),
    0,
    1,
  );
  const inferredEvidenceScore = clamp(
    Number(sectionEvidenceSummary.inferredEvidenceScore || 0),
    0,
    1,
  );
  const communicationValue = clamp(
    Number(sectionEvidenceSummary.communicationValue || 0),
    0,
    1,
  );
  const roofTruthScore = clamp(
    Number(
      sectionEvidence.sectionConstructionSemantics?.roofTruth?.score || 0,
    ) +
      Math.min(
        0.12,
        Number(sectionEvidenceSummary.directRoofExactClipCount || 0) * 0.05,
      ) +
      (Number(sectionEvidenceSummary.explicitRoofPrimitiveCount || 0) > 0
        ? 0.05
        : 0) +
      (String(sectionEvidenceSummary.roofTruthMode || "").toLowerCase() ===
      "explicit_generated"
        ? 0.08
        : String(sectionEvidenceSummary.roofTruthMode || "").toLowerCase() ===
            "derived_profile_only"
          ? -0.05
          : String(sectionEvidenceSummary.roofTruthMode || "").toLowerCase() ===
              "roof_language_only"
            ? -0.12
            : 0) +
      Math.min(
        0.08,
        Number(sectionEvidenceSummary.explicitRoofEdgeCount || 0) * 0.015,
      ) +
      Math.min(
        0.06,
        Number(sectionEvidenceSummary.explicitParapetCount || 0) * 0.02,
      ) +
      Math.min(
        0.05,
        Number(sectionEvidenceSummary.explicitRoofBreakCount || 0) * 0.02,
      ) +
      Math.min(
        0.05,
        Number(sectionEvidenceSummary.explicitHipCount || 0) * 0.02,
      ) +
      Math.min(
        0.05,
        Number(sectionEvidenceSummary.explicitValleyCount || 0) * 0.02,
      ) +
      Math.min(
        0.12,
        Number(sectionEvidenceSummary.directRoofStructuralClipCount || 0) *
          0.08,
      ) -
      (Number(sectionEvidenceSummary.directRoofExactClipCount || 0) === 0
        ? String(sectionEvidenceSummary.roofTruthMode || "").toLowerCase() ===
            "explicit_generated" &&
          (Number(sectionEvidenceSummary.explicitRoofEdgeCount || 0) +
            Number(sectionEvidenceSummary.explicitParapetCount || 0) +
            Number(sectionEvidenceSummary.explicitRoofBreakCount || 0) >=
            2 ||
            Number(sectionEvidenceSummary.directRoofStructuralClipCount || 0) >
              0)
          ? 0.04
          : 0.14
        : 0) -
      (sectionEvidenceSummary.geometryCommunicable === false ? 0.18 : 0),
    0,
    1,
  );
  const foundationTruthScore = clamp(
    Number(
      sectionEvidence.sectionConstructionSemantics?.foundationTruth?.score || 0,
    ) +
      Math.min(
        0.1,
        (Number(sectionEvidenceSummary.directFoundationExactClipCount || 0) +
          Number(
            sectionEvidenceSummary.directBaseConditionExactClipCount || 0,
          )) *
          0.05,
      ) +
      (Number(sectionEvidenceSummary.explicitFoundationCount || 0) > 0 ||
      Number(sectionEvidenceSummary.explicitBaseConditionCount || 0) > 0
        ? 0.04
        : 0) +
      (String(
        sectionEvidenceSummary.foundationTruthMode || "",
      ).toLowerCase() === "explicit_ground_primitives"
        ? 0.08
        : String(
              sectionEvidenceSummary.foundationTruthMode || "",
            ).toLowerCase() === "contextual_ground_relation"
          ? -0.04
          : -0.1) +
      Math.min(
        0.08,
        Number(sectionEvidenceSummary.explicitGroundRelationCount || 0) * 0.02,
      ) +
      Math.min(
        0.06,
        Number(sectionEvidenceSummary.foundationZoneCount || 0) * 0.02,
      ) +
      Math.min(
        0.05,
        Number(sectionEvidenceSummary.baseWallConditionCount || 0) * 0.02,
      ) -
      (Number(sectionEvidenceSummary.directFoundationExactClipCount || 0) ===
        0 &&
      Number(sectionEvidenceSummary.directBaseConditionExactClipCount || 0) ===
        0
        ? String(
            sectionEvidenceSummary.foundationTruthMode || "",
          ).toLowerCase() === "explicit_ground_primitives" &&
          Number(sectionEvidenceSummary.explicitGroundRelationCount || 0) >=
            2 &&
          Number(sectionEvidenceSummary.directSlabCount || 0) > 0
          ? 0.04
          : 0.12
        : 0),
    0,
    1,
  );
  const constructionTruthScore = clamp(
    Number(sectionEvidenceSummary.constructionEvidenceScore || 0),
    0,
    1,
  );
  const nearEvidenceScore = clamp(
    Number(sectionEvidenceSummary.nearEvidenceCount || 0) / 6,
    0,
    1,
  );
  const cutSpecificity = clamp(
    Number(sectionEvidenceSummary.cutSpecificity || 0),
    0,
    1,
  );
  const unsupportedPenalty = useSectionEvidence
    ? Math.min(
        0.32,
        Number(sectionEvidenceSummary.unsupportedEvidenceCount || 0) * 0.045,
      )
    : 0;
  const evidencePenalty = useSectionEvidence
    ? Math.min(0.26, Number(nonConstructionBlockers.length || 0) * 0.12)
    : 0;
  const inferencePenalty = useSectionEvidence
    ? Math.min(0.22, inferredEvidenceScore * 0.22)
    : 0;
  const spatialTruthPenalty =
    useSectionEvidence &&
    Number(sectionEvidenceSummary.cutRoomCount || 0) === 0 &&
    Number(sectionEvidenceSummary.cutStairCount || 0) === 0
      ? 0.14
      : 0;
  const constructionPenalty =
    useSectionEvidence &&
    String(
      sectionEvidenceSummary.sectionConstructionTruthQuality || "",
    ).toLowerCase() === "blocked"
      ? 0.18
      : useSectionEvidence &&
          String(
            sectionEvidenceSummary.sectionConstructionTruthQuality || "",
          ).toLowerCase() === "weak"
        ? 0.08
        : 0;
  const roofFoundationPenalty =
    useSectionEvidence &&
    isFeatureEnabled("useRoofFoundationSectionCredibilityGatePhase15") &&
    String(sectionEvidenceSummary.roofTruthQuality || "").toLowerCase() ===
      "blocked" &&
    String(
      sectionEvidenceSummary.foundationTruthQuality || "",
    ).toLowerCase() === "blocked"
      ? 0.12
      : 0;
  const phase16SupportPenalty =
    useSectionEvidence &&
    isFeatureEnabled("useRoofFoundationCredibilityGatePhase16")
      ? (String(sectionEvidenceSummary.roofTruthMode || "").toLowerCase() ===
        "roof_language_only"
          ? 0.06
          : String(sectionEvidenceSummary.roofTruthMode || "").toLowerCase() ===
              "derived_profile_only"
            ? 0.03
            : 0) +
        (String(
          sectionEvidenceSummary.foundationTruthMode || "",
        ).toLowerCase() === "contextual_ground_relation"
          ? 0.04
          : String(
                sectionEvidenceSummary.foundationTruthMode || "",
              ).toLowerCase() === "missing"
            ? 0.08
            : 0)
      : 0;
  const usefulness = clamp(
    stairAlignment * 0.19 +
      roomCoverage * 0.16 +
      circulationScore * 0.12 +
      entranceAlignment * 0.08 +
      levelSpan * 0.1 +
      strategyCommunication * 0.08 +
      (useSectionEvidence ? evidenceUsefulness * 0.12 : 0) +
      (useSectionEvidence ? directEvidenceScore * 0.17 : 0) +
      (useSectionEvidence ? constructionTruthScore * 0.08 : 0) +
      (useSectionEvidence ? roofTruthScore * 0.05 : 0) +
      (useSectionEvidence ? foundationTruthScore * 0.05 : 0) +
      (useSectionEvidence ? communicationValue * 0.05 : 0) +
      (useSectionEvidence ? nearEvidenceScore * 0.05 : 0) +
      (useSectionEvidence ? cutSpecificity * 0.05 : 0) -
      phase16SupportPenalty -
      roofFoundationPenalty -
      constructionPenalty -
      spatialTruthPenalty -
      inferencePenalty -
      evidencePenalty -
      unsupportedPenalty,
    0,
    1,
  );

  let sectionCandidateQuality =
    usefulness >= 0.78 ? "pass" : usefulness >= 0.64 ? "warning" : "block";
  if (
    useSectionEvidence &&
    sectionEvidenceSummary.evidenceQuality === "pass" &&
    sectionEvidenceSummary.directEvidenceQuality === "verified" &&
    usefulness >= 0.74
  ) {
    sectionCandidateQuality = "pass";
  }
  if (
    useSectionEvidence &&
    (sectionEvidenceSummary.evidenceQuality === "block" ||
      sectionEvidenceSummary.directEvidenceQuality === "blocked" ||
      sectionEvidenceSummary.inferredEvidenceQuality === "blocked") &&
    usefulness < 0.84
  ) {
    sectionCandidateQuality = "block";
  } else if (
    useSectionEvidence &&
    (sectionEvidenceSummary.evidenceQuality === "warning" ||
      sectionEvidenceSummary.directEvidenceQuality === "weak" ||
      sectionEvidenceSummary.inferredEvidenceQuality === "weak") &&
    sectionCandidateQuality === "pass"
  ) {
    sectionCandidateQuality = "warning";
  }
  if (
    useSectionEvidence &&
    sectionEvidenceSummary.geometryCommunicable === false &&
    sectionEvidenceSummary.directEvidenceCount < 4
  ) {
    sectionCandidateQuality = "block";
  }
  if (
    useSectionEvidence &&
    Number(sectionEvidenceSummary.unsupportedEvidenceCount || 0) > 3 &&
    Number(sectionEvidenceSummary.directEvidenceCount || 0) < 3
  ) {
    sectionCandidateQuality = "block";
  }
  if (
    useSectionEvidence &&
    String(
      sectionEvidenceSummary.sectionConstructionTruthQuality || "",
    ).toLowerCase() === "blocked"
  ) {
    sectionCandidateQuality = "block";
  } else if (
    useSectionEvidence &&
    String(
      sectionEvidenceSummary.sectionConstructionTruthQuality || "",
    ).toLowerCase() === "weak" &&
    sectionCandidateQuality === "pass"
  ) {
    sectionCandidateQuality = "warning";
  }
  if (
    useSectionEvidence &&
    isFeatureEnabled("useRoofFoundationSectionCredibilityGatePhase15") &&
    String(sectionEvidenceSummary.roofTruthQuality || "").toLowerCase() ===
      "blocked" &&
    String(
      sectionEvidenceSummary.foundationTruthQuality || "",
    ).toLowerCase() === "blocked" &&
    usefulness < 0.88
  ) {
    sectionCandidateQuality = "block";
  }

  const rationale = [
    candidate.strategyName
      ? `${candidate.strategyName} strategy was selected as the deterministic section candidate.`
      : "Section candidate uses the default deterministic cut strategy.",
    stairAlignment > 0.72
      ? "Cut aligns strongly with stair/core relationships."
      : "Cut only partially aligns with stair/core relationships.",
    roomCoverage > 0.72
      ? "Cut crosses multiple meaningful rooms."
      : "Cut crosses a limited room set.",
    circulationScore > 0.7
      ? "Cut follows the main circulation narrative."
      : "Cut is not strongly aligned to the main circulation path.",
    useSectionEvidence
      ? `Direct evidence ${directEvidenceScore.toFixed(2)}, inferred burden ${inferredEvidenceScore.toFixed(2)}, communication value ${communicationValue.toFixed(2)}.`
      : "Section truth scoring is not active for this candidate.",
    useSectionEvidence
      ? `Construction truth ${constructionTruthScore.toFixed(2)} (${String(sectionEvidenceSummary.sectionConstructionTruthQuality || "provisional")}).`
      : "Construction truth scoring is not active for this candidate.",
    useSectionEvidence
      ? `Roof truth ${roofTruthScore.toFixed(2)} (${String(sectionEvidenceSummary.roofTruthQuality || "provisional")} / ${String(sectionEvidenceSummary.roofTruthMode || "missing")}), foundation truth ${foundationTruthScore.toFixed(2)} (${String(sectionEvidenceSummary.foundationTruthQuality || "provisional")} / ${String(sectionEvidenceSummary.foundationTruthMode || "missing")}).`
      : "Roof/foundation truth scoring is not active for this candidate.",
    ...sectionEvidence.rationale,
  ];

  return {
    score: round(usefulness),
    sectionCandidateQuality,
    categoryScores: {
      stairAlignment: round(stairAlignment),
      roomCoverage: round(roomCoverage),
      circulation: round(circulationScore),
      entranceAlignment: round(entranceAlignment),
      levelSpan: round(levelSpan),
      strategyCommunication: round(strategyCommunication),
      sectionEvidenceUsefulness: round(evidenceUsefulness),
      directEvidenceScore: round(directEvidenceScore),
      constructionTruthScore: round(constructionTruthScore),
      roofTruthScore: round(roofTruthScore),
      foundationTruthScore: round(foundationTruthScore),
      inferredEvidenceScore: round(inferredEvidenceScore),
      communicationValue: round(communicationValue),
      sectionNearEvidence: round(nearEvidenceScore),
      cutSpecificity: round(cutSpecificity),
      inferencePenalty: round(inferencePenalty),
      phase16SupportPenalty: round(phase16SupportPenalty),
      roofFoundationPenalty: round(roofFoundationPenalty),
      constructionPenalty: round(constructionPenalty),
      sectionEvidencePenalty: round(evidencePenalty),
      unsupportedEvidencePenalty: round(unsupportedPenalty),
    },
    rationale,
    focusedRoomCount: countFocusedRooms(
      projectGeometry,
      candidate,
      sectionEvidenceSummary,
    ),
    sectionEvidence,
    sectionEvidenceSummary,
  };
}

function qualityRank(candidate = {}) {
  const normalized = String(
    candidate.sectionCandidateQuality || "",
  ).toLowerCase();
  if (normalized === "pass") return 2;
  if (normalized === "warning") return 1;
  return 0;
}

export function rankSectionCandidates(projectGeometry = {}, candidates = []) {
  const ranked = (candidates || [])
    .map((candidate) => {
      const evaluation = scoreSectionCandidate(projectGeometry, candidate);
      return {
        ...candidate,
        score: evaluation.score,
        sectionCandidateQuality: evaluation.sectionCandidateQuality,
        categoryScores: evaluation.categoryScores,
        chosenStrategy: {
          id: candidate.strategyId || "default-section-strategy",
          name: candidate.strategyName || "Default Section Strategy",
          expectedCommunicationValue: Number(
            candidate.expectedCommunicationValue || 0,
          ),
        },
        rationale: [
          ...new Set([...(candidate.rationale || []), ...evaluation.rationale]),
        ],
        focusedRoomCount: evaluation.focusedRoomCount,
        sectionEvidence: evaluation.sectionEvidence,
        sectionEvidenceSummary: evaluation.sectionEvidenceSummary,
      };
    })
    .sort((left, right) => {
      const qualityDelta = qualityRank(right) - qualityRank(left);
      if (qualityDelta !== 0) {
        return qualityDelta;
      }
      const rightDirect = Number(
        right.sectionEvidenceSummary?.directEvidenceScore || 0,
      );
      const leftDirect = Number(
        left.sectionEvidenceSummary?.directEvidenceScore || 0,
      );
      const rightConstruction = Number(
        right.sectionEvidenceSummary?.constructionEvidenceScore || 0,
      );
      const leftConstruction = Number(
        left.sectionEvidenceSummary?.constructionEvidenceScore || 0,
      );
      const rightConstructionSpecificity =
        Number(right.sectionEvidenceSummary?.cutWallExactClipCount || 0) +
        Number(right.sectionEvidenceSummary?.cutOpeningExactClipCount || 0) +
        Number(right.sectionEvidenceSummary?.cutStairCount || 0) +
        Number(right.sectionEvidenceSummary?.directSlabExactClipCount || 0) +
        Number(right.sectionEvidenceSummary?.directRoofExactClipCount || 0) +
        Number(
          right.sectionEvidenceSummary?.directFoundationExactClipCount || 0,
        ) +
        Number(
          right.sectionEvidenceSummary?.directBaseConditionExactClipCount || 0,
        );
      const leftConstructionSpecificity =
        Number(left.sectionEvidenceSummary?.cutWallExactClipCount || 0) +
        Number(left.sectionEvidenceSummary?.cutOpeningExactClipCount || 0) +
        Number(left.sectionEvidenceSummary?.cutStairCount || 0) +
        Number(left.sectionEvidenceSummary?.directSlabExactClipCount || 0) +
        Number(left.sectionEvidenceSummary?.directRoofExactClipCount || 0) +
        Number(
          left.sectionEvidenceSummary?.directFoundationExactClipCount || 0,
        ) +
        Number(
          left.sectionEvidenceSummary?.directBaseConditionExactClipCount || 0,
        );
      if (rightDirect !== leftDirect) {
        return rightDirect - leftDirect;
      }
      if (rightConstruction !== leftConstruction) {
        return rightConstruction - leftConstruction;
      }
      if (rightConstructionSpecificity !== leftConstructionSpecificity) {
        return rightConstructionSpecificity - leftConstructionSpecificity;
      }
      const rightCommunication = Number(
        right.sectionEvidenceSummary?.communicationValue || 0,
      );
      const leftCommunication = Number(
        left.sectionEvidenceSummary?.communicationValue || 0,
      );
      if (rightCommunication !== leftCommunication) {
        return rightCommunication - leftCommunication;
      }
      const leftInferred = Number(
        left.sectionEvidenceSummary?.inferredEvidenceScore || 0,
      );
      const rightInferred = Number(
        right.sectionEvidenceSummary?.inferredEvidenceScore || 0,
      );
      if (leftInferred !== rightInferred) {
        return leftInferred - rightInferred;
      }
      if (right.score !== left.score) return right.score - left.score;
      return String(left.id).localeCompare(String(right.id));
    });

  return ranked.map((candidate, index, array) => ({
    ...candidate,
    rejectedAlternatives: array
      .filter((entry) => entry.id !== candidate.id)
      .slice(0, 3)
      .map((entry) => ({
        id: entry.id,
        title: entry.title,
        strategyId: entry.strategyId || null,
        score: entry.score,
        reason:
          entry.sectionCandidateQuality === "block"
            ? "Rejected because direct cut evidence was too weak to support credible section truth."
            : Number(entry.sectionEvidenceSummary?.directEvidenceScore || 0) <
                Number(
                  candidate.sectionEvidenceSummary?.directEvidenceScore || 0,
                )
              ? "Rejected because it had weaker direct cut evidence."
              : Number(
                    entry.sectionEvidenceSummary?.inferredEvidenceScore || 0,
                  ) >
                  Number(
                    candidate.sectionEvidenceSummary?.inferredEvidenceScore ||
                      0,
                  )
                ? "Rejected because it relied more on inferred/contextual evidence."
                : "Rejected because it communicated the section narrative less clearly.",
      })),
    selectedForBoard: index === 0,
  }));
}

export default {
  scoreSectionCandidate,
  rankSectionCandidates,
};
