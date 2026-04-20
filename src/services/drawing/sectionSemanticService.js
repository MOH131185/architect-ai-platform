import {
  buildSectionEvidence,
  buildSectionEvidenceSummary,
} from "./sectionEvidenceService.js";

function round(value, precision = 3) {
  const factor = 10 ** precision;
  return Math.round(Number(value || 0) * factor) / factor;
}

export function deriveSectionSemantics(
  projectGeometry = {},
  sectionProfile = {},
) {
  const sectionEvidence =
    sectionProfile.sectionEvidence ||
    buildSectionEvidence(projectGeometry, sectionProfile);
  const sectionEvidenceSummary =
    sectionProfile.sectionEvidenceSummary ||
    buildSectionEvidenceSummary(sectionEvidence);
  const cutRooms = sectionEvidence.intersections?.rooms || [];
  const nearRooms = sectionEvidence.intersections?.nearRooms || [];
  const unsupportedRooms =
    sectionEvidence.intersections?.unsupportedRooms || [];
  const cutStairs = sectionEvidence.intersections?.stairs || [];
  const nearStairs = sectionEvidence.intersections?.nearStairs || [];
  const unsupportedStairs =
    sectionEvidence.intersections?.unsupportedStairs || [];
  const cutWalls = sectionEvidence.intersections?.walls || [];
  const unsupportedWalls =
    sectionEvidence.intersections?.unsupportedWalls || [];
  const cutOpenings = sectionEvidence.intersections?.openings || [];
  const nearOpenings = sectionEvidence.intersections?.nearOpenings || [];
  const unsupportedOpenings =
    sectionEvidence.intersections?.unsupportedOpenings || [];
  const levels = sectionEvidence.levelProfiles || [];
  const focusEntityIds = sectionProfile.focusEntityIds || [];
  const candidateScore = Number(sectionProfile.score || 0.55);
  const candidateQuality = String(
    sectionProfile.sectionCandidateQuality ||
      sectionEvidenceSummary.evidenceQuality ||
      "warning",
  ).toLowerCase();
  const categoryScores = sectionProfile.categoryScores || {};
  const hasFocusedStair =
    sectionEvidence.focusHits?.some((entry) =>
      String(entry).startsWith("entity:stair:"),
    ) ||
    focusEntityIds.some((entry) => String(entry).startsWith("entity:stair:"));
  const hasEntranceFocus =
    sectionEvidence.focusHits?.some((entry) =>
      String(entry).startsWith("entity:entrance:"),
    ) ||
    focusEntityIds.some((entry) =>
      String(entry).startsWith("entity:entrance:"),
    );
  const focusedRoomCount = (sectionEvidence.focusHits || []).filter((entry) =>
    String(entry).startsWith("entity:room:"),
  ).length;

  const verticalCirculationScore = hasFocusedStair
    ? 1
    : cutStairs.length > 0
      ? 0.7
      : nearStairs.length > 0
        ? 0.48
        : 0.35;
  const floorHeightsScore = levels.length > 1 ? 1 : 0.6;
  const entranceScore = hasEntranceFocus
    ? 0.86
    : Number(categoryScores.entranceAlignment || 0.4);
  const openingRelationshipScore =
    cutOpenings.length > 0 && cutWalls.length > 0
      ? Math.max(
          0.62,
          Math.min(
            1,
            Math.max(
              candidateScore + 0.15,
              Number(sectionEvidenceSummary.usefulnessScore || 0),
            ),
          ),
        )
      : nearOpenings.length > 0 && cutWalls.length > 0
        ? 0.52
        : 0.45;
  const wallRelationshipScore =
    cutWalls.length > 0
      ? Math.max(0.58, Math.min(0.92, candidateScore + 0.12))
      : unsupportedWalls.length > 0
        ? 0.28
        : 0.4;
  const roomCommunicationScore =
    cutRooms.length > 1 || focusedRoomCount > 1
      ? 0.88
      : cutRooms.length > 0 || focusedRoomCount > 0
        ? 0.72
        : nearRooms.length > 0
          ? 0.58
          : unsupportedRooms.length > 0
            ? 0.34
            : (projectGeometry.rooms || []).length > 0
              ? 0.52
              : 0.28;
  const circulationNarrativeScore = Math.max(
    Number(categoryScores.circulation || 0.42),
    cutStairs.length > 0 || Number(sectionEvidence.circulationHitCount || 0) > 0
      ? 0.58
      : 0.3,
  );
  const volumetricScore = Math.max(
    levels.length > 1 ? 0.7 : 0.58,
    Math.min(
      0.96,
      Math.max(
        candidateScore + 0.18,
        Number(sectionEvidenceSummary.usefulnessScore || 0),
      ),
    ),
  );
  const usefulnessScore = round(
    verticalCirculationScore * 0.25 +
      floorHeightsScore * 0.18 +
      openingRelationshipScore * 0.14 +
      wallRelationshipScore * 0.1 +
      roomCommunicationScore * 0.1 +
      volumetricScore * 0.13 +
      entranceScore * 0.05 +
      circulationNarrativeScore * 0.05,
  );

  return {
    version: sectionEvidence?.sectionIntersections?.version?.startsWith(
      "phase12",
    )
      ? "phase12-section-semantic-service-v1"
      : sectionProfile?.strategyId
        ? "phase10-section-semantic-service-v1"
        : "phase9-section-semantic-service-v1",
    sectionId: sectionProfile.id || null,
    chosenStrategy: sectionProfile?.chosenStrategy || {
      id: sectionProfile?.strategyId || null,
      name: sectionProfile?.strategyName || null,
      expectedCommunicationValue: Number(
        sectionProfile?.expectedCommunicationValue || 0,
      ),
    },
    rejectedAlternatives: sectionProfile?.rejectedAlternatives || [],
    focusEntityIds,
    sectionEvidence,
    sectionEvidenceSummary,
    communicates: {
      verticalCirculation: hasFocusedStair || cutStairs.length > 0,
      floorHeights: levels.length > 0,
      wallOpeningRelationships: cutOpenings.length > 0 && cutWalls.length > 0,
      roomHierarchy: cutRooms.length > 0 || focusedRoomCount > 0,
      entranceSequence: hasEntranceFocus,
      circulationNarrative: circulationNarrativeScore > 0.55,
      volumetricLogic: true,
    },
    scores: {
      verticalCirculation: round(verticalCirculationScore),
      floorHeights: round(floorHeightsScore),
      entranceSequence: round(entranceScore),
      openingRelationships: round(openingRelationshipScore),
      wallRelationships: round(wallRelationshipScore),
      roomHierarchy: round(roomCommunicationScore),
      circulationNarrative: round(circulationNarrativeScore),
      volumetricLogic: round(volumetricScore),
      usefulness: usefulnessScore,
    },
    sectionCandidateQuality: candidateQuality,
    rationale: [
      hasFocusedStair
        ? "Section captures stair/core relationships with an explicit focused cut."
        : cutStairs.length
          ? "Section includes vertical circulation, but the cut is not stair-focused."
          : "Section does not include a dedicated stair focus.",
      sectionProfile?.strategyName
        ? `${sectionProfile.strategyName} strategy was chosen to maximize communication value.`
        : "No specialized section strategy was recorded for this cut.",
      hasEntranceFocus
        ? "Section also communicates the arrival axis and entry sequence."
        : "Section is not explicitly aligned to the entry sequence.",
      cutOpenings.length
        ? "Section can communicate key opening-to-wall relationships."
        : nearOpenings.length
          ? "Section can only communicate opening relationships contextually because no opening is directly cut."
          : unsupportedOpenings.length
            ? "Section cannot fully prove opening relationships because some opening geometry is unsupported."
            : "Opening relationships remain limited because no window data was resolved.",
      cutRooms.length
        ? `Section cuts through ${cutRooms.length} named room volume(s).`
        : nearRooms.length
          ? `Section runs close to ${nearRooms.length} named room volume(s), but does not cut them directly.`
          : unsupportedRooms.length
            ? `Section cannot fully classify ${unsupportedRooms.length} room volume(s) because cut geometry support is incomplete.`
            : focusedRoomCount
              ? `Section target includes ${focusedRoomCount} named room focus area(s).`
              : "Section target does not include an explicit room focus area.",
      unsupportedStairs.length
        ? `Stair/core geometry remains partially unsupported for ${unsupportedStairs.length} element(s).`
        : "Stair/core geometry support is sufficient for the resolved evidence.",
      ...sectionEvidence.rationale,
      candidateQuality === "pass"
        ? "Candidate scoring rated this cut as strong enough for final technical communication."
        : candidateQuality === "warning"
          ? "Candidate scoring rated this cut as usable but still weaker than preferred."
          : "Candidate scoring rated this cut as weak and it should not silently pass into final composition.",
    ],
    expectedCommunicationValue: Number(
      sectionProfile?.expectedCommunicationValue || 0,
    ),
  };
}

export default {
  deriveSectionSemantics,
};
