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
    isFeatureEnabled("useDeeperSectionClippingPhase19") ||
    isFeatureEnabled("useDraftingGradeSectionGraphicsPhase19") ||
    isFeatureEnabled("useConstructionTruthDrivenSectionRankingPhase19") ||
    isFeatureEnabled("useSectionConstructionCredibilityGatePhase19") ||
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

function phase18SectionRankingEnabled() {
  return (
    isFeatureEnabled("useConstructionTruthDrivenSectionRankingPhase18") ||
    isFeatureEnabled("useDeeperSectionClippingPhase18") ||
    isFeatureEnabled("useSectionConstructionCredibilityGatePhase18")
  );
}

function phase19SectionRankingEnabled() {
  return (
    isFeatureEnabled("useConstructionTruthDrivenSectionRankingPhase19") ||
    isFeatureEnabled("useDeeperSectionClippingPhase19") ||
    isFeatureEnabled("useSectionConstructionCredibilityGatePhase19")
  );
}

function phase20SectionRankingEnabled() {
  return (
    isFeatureEnabled("useNearBooleanSectioningPhase20") ||
    isFeatureEnabled("useCentralizedSectionTruthModelPhase20") ||
    isFeatureEnabled("useDraftingGradeSectionGraphicsPhase20") ||
    isFeatureEnabled("useConstructionTruthDrivenSectionRankingPhase20") ||
    isFeatureEnabled("useSectionConstructionCredibilityGatePhase20")
  );
}

function phase21SectionRankingEnabled() {
  return (
    isFeatureEnabled("useTrueGeometricSectioningPhase21") ||
    isFeatureEnabled("useCentralizedSectionTruthModelPhase21") ||
    isFeatureEnabled("useDraftingGradeSectionGraphicsPhase21") ||
    isFeatureEnabled("useConstructionTruthDrivenSectionRankingPhase21") ||
    isFeatureEnabled("useSectionConstructionCredibilityGatePhase21")
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
  const usePhase18SectionRanking = phase18SectionRankingEnabled();
  const usePhase19SectionRanking = phase19SectionRankingEnabled();
  const usePhase20SectionRanking = phase20SectionRankingEnabled();
  const usePhase21SectionRanking = phase21SectionRankingEnabled();
  const sectionEvidence = buildSectionEvidence(projectGeometry, candidate);
  const sectionEvidenceSummary = buildSectionEvidenceSummary(sectionEvidence);
  const sectionTruthModel = sectionEvidence.sectionTruthModel || null;
  const sectionTruthOverall = sectionTruthModel?.overall || {};
  const sectionFaceBundle = sectionEvidence.sectionFaceBundle || null;
  const sectionFaceSummary = sectionEvidence.sectionFaceSummary || null;
  const cutFaceConstructionCount =
    Number(sectionEvidenceSummary.cutFaceConstructionTruthCount || 0) +
    Number(sectionFaceBundle?.summary?.cutFaceCount || 0);
  const cutProfileConstructionCount =
    Number(sectionEvidenceSummary.cutProfileConstructionTruthCount || 0) +
    Number(sectionFaceBundle?.summary?.cutProfileCount || 0);
  const contextualProfileCount =
    Number(
      sectionEvidenceSummary.contextualProfileConstructionTruthCount || 0,
    ) + Number(sectionFaceBundle?.summary?.contextualCount || 0);
  const derivedProfileCount =
    Number(sectionEvidenceSummary.derivedProfileConstructionTruthCount || 0) +
    Number(sectionFaceBundle?.summary?.derivedCount || 0);
  const averageProfileContinuity = clamp(
    Number(sectionEvidenceSummary.averageConstructionProfileContinuity || 0),
    0,
    1,
  );
  const faceCredibilityScore = clamp(
    Number(
      sectionFaceBundle?.credibility?.score ||
        sectionFaceSummary?.credibilityScore ||
        0,
    ),
    0,
    1,
  );
  const faceCredibilityQuality = String(
    sectionFaceBundle?.credibility?.quality ||
      sectionFaceSummary?.credibilityQuality ||
      "blocked",
  ).toLowerCase();
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
    Number(sectionEvidenceSummary.constructionEvidenceScore || 0) +
      (usePhase18SectionRanking
        ? Math.min(
            0.18,
            Number(sectionEvidenceSummary.directConstructionTruthCount || 0) *
              0.018,
          ) +
          Math.min(
            0.12,
            Number(sectionEvidenceSummary.exactConstructionClipCount || 0) *
              0.02,
          ) +
          Math.min(
            0.08,
            (Number(sectionEvidenceSummary.cutWallDirectTruthCount || 0) +
              Number(sectionEvidenceSummary.cutOpeningDirectTruthCount || 0) +
              Number(sectionEvidenceSummary.stairDirectTruthCount || 0)) *
              0.015,
          ) +
          Math.min(
            0.08,
            (Number(sectionEvidenceSummary.roofDirectTruthCount || 0) +
              Number(sectionEvidenceSummary.foundationDirectTruthCount || 0) +
              Number(
                sectionEvidenceSummary.baseConditionDirectTruthCount || 0,
              )) *
              0.02,
          ) -
          Math.min(
            0.16,
            Number(
              sectionEvidenceSummary.contextualConstructionTruthCount || 0,
            ) *
              0.01 +
              Number(
                sectionEvidenceSummary.derivedConstructionTruthCount || 0,
              ) *
                0.015 +
              Number(
                sectionEvidenceSummary.unsupportedConstructionTruthCount || 0,
              ) *
                0.02,
          )
        : 0),
    0,
    1,
  );
  const constructionEvidenceQuality = String(
    sectionEvidenceSummary.sectionConstructionEvidenceQuality || "provisional",
  ).toLowerCase();
  const qualityScore = (value, fallback = 0.35) => {
    const normalized = String(value || "").toLowerCase();
    if (normalized === "verified") return 1;
    if (normalized === "weak") return 0.55;
    if (normalized === "blocked") return 0;
    return fallback;
  };
  const wallClipQualityScore = clamp(
    qualityScore(sectionEvidenceSummary.wallSectionClipQuality),
    0,
    1,
  );
  const openingClipQualityScore = clamp(
    qualityScore(sectionEvidenceSummary.openingSectionClipQuality),
    0,
    1,
  );
  const stairClipQualityScore = clamp(
    qualityScore(sectionEvidenceSummary.stairSectionClipQuality),
    0,
    1,
  );
  const slabClipQualityScore = clamp(
    qualityScore(sectionEvidenceSummary.slabSectionClipQuality),
    0,
    1,
  );
  const roofClipQualityScore = clamp(
    qualityScore(sectionEvidenceSummary.roofSectionClipQuality),
    0,
    1,
  );
  const foundationClipQualityScore = clamp(
    qualityScore(sectionEvidenceSummary.foundationSectionClipQuality),
    0,
    1,
  );
  const sectionProfileComplexityScore = clamp(
    Number(sectionEvidenceSummary.sectionProfileComplexityScore || 0),
    0,
    1,
  );
  const sectionDraftingEvidenceScore = clamp(
    Number(sectionEvidenceSummary.sectionDraftingEvidenceScore || 0),
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
  const nearBooleanClipCount = clamp(
    Number(sectionEvidenceSummary.nearBooleanConstructionClipCount || 0),
    0,
    12,
  );
  const averageBandCoverageRatio = clamp(
    Number(sectionEvidenceSummary.averageConstructionBandCoverageRatio || 0),
    0,
    1,
  );
  const contextualEvidenceBurden = clamp(
    Number(
      sectionEvidenceSummary.sectionContextualEvidenceScore ||
        sectionTruthModel?.contextualEvidenceScore ||
        0,
    ),
    0,
    1,
  );
  const derivedEvidenceBurden = clamp(
    Number(
      sectionEvidenceSummary.sectionDerivedEvidenceScore ||
        sectionTruthModel?.derivedEvidenceScore ||
        0,
    ),
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
  const phase18ConstructionPenalty =
    useSectionEvidence && usePhase18SectionRanking
      ? constructionEvidenceQuality === "blocked"
        ? 0.16
        : constructionEvidenceQuality === "weak"
          ? 0.06
          : 0
      : 0;
  const phase19ConstructionPenalty =
    useSectionEvidence && usePhase19SectionRanking
      ? [
          sectionEvidenceSummary.wallSectionClipQuality,
          sectionEvidenceSummary.openingSectionClipQuality,
          sectionEvidenceSummary.stairSectionClipQuality,
          sectionEvidenceSummary.slabSectionClipQuality,
          sectionEvidenceSummary.roofSectionClipQuality,
          sectionEvidenceSummary.foundationSectionClipQuality,
        ].reduce(
          (sum, quality) =>
            sum +
            (quality === "blocked" ? 0.028 : quality === "weak" ? 0.012 : 0),
          0,
        )
      : 0;
  const phase20ConstructionPenalty =
    useSectionEvidence && usePhase20SectionRanking
      ? (String(sectionTruthOverall.directQuality || "").toLowerCase() ===
        "blocked"
          ? 0.18
          : String(sectionTruthOverall.directQuality || "").toLowerCase() ===
              "weak"
            ? 0.08
            : 0) +
        Math.min(0.16, contextualEvidenceBurden * 0.14) +
        Math.min(0.18, derivedEvidenceBurden * 0.18) -
        Math.min(0.12, nearBooleanClipCount * 0.012) -
        Math.min(0.08, averageBandCoverageRatio * 0.08)
      : 0;
  const phase21ConstructionPenalty =
    useSectionEvidence && usePhase21SectionRanking
      ? (faceCredibilityQuality === "blocked"
          ? 0.16
          : faceCredibilityQuality === "weak"
            ? 0.07
            : 0) +
        (cutFaceConstructionCount === 0 && cutProfileConstructionCount === 0
          ? 0.12
          : cutFaceConstructionCount === 0
            ? 0.05
            : 0) +
        Math.min(0.1, derivedProfileCount * 0.012) -
        Math.min(0.14, cutFaceConstructionCount * 0.025) -
        Math.min(0.08, cutProfileConstructionCount * 0.012) -
        Math.min(0.06, averageProfileContinuity * 0.08)
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
      (useSectionEvidence ? directEvidenceScore * 0.16 : 0) +
      (useSectionEvidence ? constructionTruthScore * 0.12 : 0) +
      (useSectionEvidence && usePhase20SectionRanking
        ? clamp(Number(sectionTruthOverall.directScore || 0), 0, 1) * 0.12 +
          Math.min(0.12, nearBooleanClipCount * 0.012) +
          averageBandCoverageRatio * 0.08
        : 0) +
      (useSectionEvidence && usePhase21SectionRanking
        ? Math.min(0.18, cutFaceConstructionCount * 0.04) +
          Math.min(0.08, cutProfileConstructionCount * 0.02) +
          averageProfileContinuity * 0.08 +
          faceCredibilityScore * 0.08
        : 0) +
      (useSectionEvidence && usePhase19SectionRanking
        ? sectionDraftingEvidenceScore * 0.12 +
          sectionProfileComplexityScore * 0.08 +
          wallClipQualityScore * 0.05 +
          openingClipQualityScore * 0.04 +
          stairClipQualityScore * 0.04 +
          slabClipQualityScore * 0.04 +
          roofClipQualityScore * 0.03 +
          foundationClipQualityScore * 0.04
        : 0) +
      (useSectionEvidence ? roofTruthScore * 0.05 : 0) +
      (useSectionEvidence ? foundationTruthScore * 0.05 : 0) +
      (useSectionEvidence ? communicationValue * 0.05 : 0) +
      (useSectionEvidence ? nearEvidenceScore * 0.05 : 0) +
      (useSectionEvidence ? cutSpecificity * 0.05 : 0) -
      phase18ConstructionPenalty -
      phase19ConstructionPenalty -
      phase20ConstructionPenalty -
      phase21ConstructionPenalty -
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
    usePhase18SectionRanking &&
    constructionEvidenceQuality === "blocked"
  ) {
    sectionCandidateQuality = "block";
  } else if (
    useSectionEvidence &&
    usePhase18SectionRanking &&
    constructionEvidenceQuality === "weak" &&
    sectionCandidateQuality === "pass"
  ) {
    sectionCandidateQuality = "warning";
  }
  if (
    useSectionEvidence &&
    usePhase21SectionRanking &&
    (faceCredibilityQuality === "blocked" ||
      (cutFaceConstructionCount === 0 &&
        cutProfileConstructionCount === 0 &&
        Number(sectionEvidenceSummary.exactConstructionClipCount || 0) === 0))
  ) {
    sectionCandidateQuality = "block";
  } else if (
    useSectionEvidence &&
    usePhase21SectionRanking &&
    (faceCredibilityQuality === "weak" ||
      (cutFaceConstructionCount === 0 && sectionCandidateQuality === "pass"))
  ) {
    if (sectionCandidateQuality === "pass") {
      sectionCandidateQuality = "warning";
    }
  }
  if (
    useSectionEvidence &&
    usePhase20SectionRanking &&
    (String(sectionTruthOverall.directQuality || "").toLowerCase() ===
      "blocked" ||
      String(
        sectionTruthModel?.nodes?.wall?.directQuality || "",
      ).toLowerCase() === "blocked" ||
      String(
        sectionTruthModel?.nodes?.slab?.directQuality || "",
      ).toLowerCase() === "blocked")
  ) {
    sectionCandidateQuality = "block";
  } else if (
    useSectionEvidence &&
    usePhase19SectionRanking &&
    [
      sectionEvidenceSummary.wallSectionClipQuality,
      sectionEvidenceSummary.slabSectionClipQuality,
    ].includes("blocked")
  ) {
    sectionCandidateQuality = "block";
  } else if (
    useSectionEvidence &&
    usePhase19SectionRanking &&
    [
      sectionEvidenceSummary.openingSectionClipQuality,
      sectionEvidenceSummary.stairSectionClipQuality,
      sectionEvidenceSummary.roofSectionClipQuality,
      sectionEvidenceSummary.foundationSectionClipQuality,
    ].includes("blocked") &&
    sectionCandidateQuality === "pass"
  ) {
    sectionCandidateQuality = "warning";
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
      ? `Construction evidence ${String(sectionEvidenceSummary.sectionConstructionEvidenceQuality || "provisional")} with ${Number(sectionEvidenceSummary.directConstructionTruthCount || 0)} direct construction truth hit(s) and ${Number(sectionEvidenceSummary.exactConstructionClipCount || 0)} exact construction clip(s).`
      : "Construction evidence propagation is not active for this candidate.",
    useSectionEvidence && usePhase20SectionRanking
      ? `Phase 20 cut truth ${String(sectionTruthOverall.quality || "provisional")} with direct ${String(sectionTruthOverall.directQuality || "provisional")}, contextual burden ${contextualEvidenceBurden.toFixed(2)}, derived burden ${derivedEvidenceBurden.toFixed(2)}, near-boolean clips ${Number(nearBooleanClipCount || 0)}, and band coverage ${averageBandCoverageRatio.toFixed(2)}.`
      : "Phase 20 centralized section-truth ranking is not active for this candidate.",
    useSectionEvidence && usePhase21SectionRanking
      ? `Phase 21 cut-face truth: ${cutFaceConstructionCount} cut-face, ${cutProfileConstructionCount} cut-profile, ${contextualProfileCount} contextual, ${derivedProfileCount} derived constructions; face credibility ${faceCredibilityQuality} (${faceCredibilityScore.toFixed(2)}); profile continuity ${averageProfileContinuity.toFixed(2)}.`
      : "Phase 21 true-geometric cut-face ranking is not active for this candidate.",
    useSectionEvidence && usePhase19SectionRanking
      ? `Clip-quality wall ${String(sectionEvidenceSummary.wallSectionClipQuality || "provisional")}, opening ${String(sectionEvidenceSummary.openingSectionClipQuality || "provisional")}, stair ${String(sectionEvidenceSummary.stairSectionClipQuality || "provisional")}, slab ${String(sectionEvidenceSummary.slabSectionClipQuality || "provisional")}, roof ${String(sectionEvidenceSummary.roofSectionClipQuality || "provisional")}, foundation ${String(sectionEvidenceSummary.foundationSectionClipQuality || "provisional")} with profile complexity ${Number(sectionEvidenceSummary.sectionProfileComplexityScore || 0).toFixed(2)} and drafting evidence ${Number(sectionEvidenceSummary.sectionDraftingEvidenceScore || 0).toFixed(2)}.`
      : "Phase 19 clip-quality ranking is not active for this candidate.",
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
      sectionConstructionEvidenceQuality: constructionEvidenceQuality,
      sectionDraftingEvidenceScore: round(sectionDraftingEvidenceScore),
      sectionProfileComplexityScore: round(sectionProfileComplexityScore),
      wallClipQualityScore: round(wallClipQualityScore),
      openingClipQualityScore: round(openingClipQualityScore),
      stairClipQualityScore: round(stairClipQualityScore),
      slabClipQualityScore: round(slabClipQualityScore),
      roofClipQualityScore: round(roofClipQualityScore),
      foundationClipQualityScore: round(foundationClipQualityScore),
      roofTruthScore: round(roofTruthScore),
      foundationTruthScore: round(foundationTruthScore),
      inferredEvidenceScore: round(inferredEvidenceScore),
      communicationValue: round(communicationValue),
      sectionNearEvidence: round(nearEvidenceScore),
      cutSpecificity: round(cutSpecificity),
      inferencePenalty: round(inferencePenalty),
      phase16SupportPenalty: round(phase16SupportPenalty),
      phase18ConstructionPenalty: round(phase18ConstructionPenalty),
      phase19ConstructionPenalty: round(phase19ConstructionPenalty),
      phase20ConstructionPenalty: round(phase20ConstructionPenalty),
      phase21ConstructionPenalty: round(phase21ConstructionPenalty),
      cutFaceConstructionTruthCount: cutFaceConstructionCount,
      cutProfileConstructionTruthCount: cutProfileConstructionCount,
      contextualProfileConstructionTruthCount: contextualProfileCount,
      derivedProfileConstructionTruthCount: derivedProfileCount,
      averageConstructionProfileContinuity: round(averageProfileContinuity),
      sectionFaceCredibilityScore: round(faceCredibilityScore),
      sectionFaceCredibilityQuality: faceCredibilityQuality,
      roofFoundationPenalty: round(roofFoundationPenalty),
      constructionPenalty: round(constructionPenalty),
      sectionEvidencePenalty: round(evidencePenalty),
      unsupportedEvidencePenalty: round(unsupportedPenalty),
      sectionTruthModelVersion:
        sectionTruthModel?.version ||
        sectionEvidenceSummary.sectionTruthModelVersion ||
        null,
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
  const usePhase18SectionRanking = phase18SectionRankingEnabled();
  const usePhase19SectionRanking = phase19SectionRankingEnabled();
  const usePhase20SectionRanking = phase20SectionRankingEnabled();
  const usePhase21SectionRanking = phase21SectionRankingEnabled();
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
      const rightTruthDirect = Number(
        right.sectionEvidence?.sectionTruthModel?.overall?.directScore || 0,
      );
      const leftTruthDirect = Number(
        left.sectionEvidence?.sectionTruthModel?.overall?.directScore || 0,
      );
      const rightNearBoolean = Number(
        right.sectionEvidenceSummary?.nearBooleanConstructionClipCount || 0,
      );
      const leftNearBoolean = Number(
        left.sectionEvidenceSummary?.nearBooleanConstructionClipCount || 0,
      );
      const rightContextualBurden = Number(
        right.sectionEvidenceSummary?.sectionContextualEvidenceScore || 0,
      );
      const leftContextualBurden = Number(
        left.sectionEvidenceSummary?.sectionContextualEvidenceScore || 0,
      );
      const rightDerivedBurden = Number(
        right.sectionEvidenceSummary?.sectionDerivedEvidenceScore || 0,
      );
      const leftDerivedBurden = Number(
        left.sectionEvidenceSummary?.sectionDerivedEvidenceScore || 0,
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
      const rightDirectConstructionTruth = Number(
        right.sectionEvidenceSummary?.directConstructionTruthCount || 0,
      );
      const leftDirectConstructionTruth = Number(
        left.sectionEvidenceSummary?.directConstructionTruthCount || 0,
      );
      const rightContextualConstructionTruth = Number(
        right.sectionEvidenceSummary?.contextualConstructionTruthCount || 0,
      );
      const leftContextualConstructionTruth = Number(
        left.sectionEvidenceSummary?.contextualConstructionTruthCount || 0,
      );
      const rightDerivedConstructionTruth = Number(
        right.sectionEvidenceSummary?.derivedConstructionTruthCount || 0,
      );
      const leftDerivedConstructionTruth = Number(
        left.sectionEvidenceSummary?.derivedConstructionTruthCount || 0,
      );
      const rightPhase19ClipValue = usePhase19SectionRanking
        ? Number(
            right.sectionEvidenceSummary?.sectionDraftingEvidenceScore || 0,
          ) +
          Number(
            right.sectionEvidenceSummary?.sectionProfileComplexityScore || 0,
          )
        : 0;
      const leftPhase19ClipValue = usePhase19SectionRanking
        ? Number(
            left.sectionEvidenceSummary?.sectionDraftingEvidenceScore || 0,
          ) +
          Number(
            left.sectionEvidenceSummary?.sectionProfileComplexityScore || 0,
          )
        : 0;
      const rightCutFace = usePhase21SectionRanking
        ? Number(
            right.sectionEvidenceSummary?.cutFaceConstructionTruthCount || 0,
          ) +
          Number(
            right.sectionEvidence?.sectionFaceBundle?.summary?.cutFaceCount ||
              0,
          )
        : 0;
      const leftCutFace = usePhase21SectionRanking
        ? Number(
            left.sectionEvidenceSummary?.cutFaceConstructionTruthCount || 0,
          ) +
          Number(
            left.sectionEvidence?.sectionFaceBundle?.summary?.cutFaceCount || 0,
          )
        : 0;
      const rightCutProfile = usePhase21SectionRanking
        ? Number(
            right.sectionEvidenceSummary?.cutProfileConstructionTruthCount || 0,
          ) +
          Number(
            right.sectionEvidence?.sectionFaceBundle?.summary
              ?.cutProfileCount || 0,
          )
        : 0;
      const leftCutProfile = usePhase21SectionRanking
        ? Number(
            left.sectionEvidenceSummary?.cutProfileConstructionTruthCount || 0,
          ) +
          Number(
            left.sectionEvidence?.sectionFaceBundle?.summary?.cutProfileCount ||
              0,
          )
        : 0;
      const rightFaceCredibility = usePhase21SectionRanking
        ? Number(
            right.sectionEvidence?.sectionFaceBundle?.credibility?.score || 0,
          )
        : 0;
      const leftFaceCredibility = usePhase21SectionRanking
        ? Number(
            left.sectionEvidence?.sectionFaceBundle?.credibility?.score || 0,
          )
        : 0;
      const rightProfileContinuity = usePhase21SectionRanking
        ? Number(
            right.sectionEvidenceSummary
              ?.averageConstructionProfileContinuity || 0,
          )
        : 0;
      const leftProfileContinuity = usePhase21SectionRanking
        ? Number(
            left.sectionEvidenceSummary?.averageConstructionProfileContinuity ||
              0,
          )
        : 0;
      if (usePhase21SectionRanking && rightCutFace !== leftCutFace) {
        return rightCutFace - leftCutFace;
      }
      if (rightDirect !== leftDirect) {
        return rightDirect - leftDirect;
      }
      if (usePhase21SectionRanking && rightCutProfile !== leftCutProfile) {
        return rightCutProfile - leftCutProfile;
      }
      if (
        usePhase21SectionRanking &&
        rightFaceCredibility !== leftFaceCredibility
      ) {
        return rightFaceCredibility - leftFaceCredibility;
      }
      if (usePhase20SectionRanking && rightTruthDirect !== leftTruthDirect) {
        return rightTruthDirect - leftTruthDirect;
      }
      if (
        usePhase21SectionRanking &&
        rightProfileContinuity !== leftProfileContinuity
      ) {
        return rightProfileContinuity - leftProfileContinuity;
      }
      if (usePhase20SectionRanking && rightNearBoolean !== leftNearBoolean) {
        return rightNearBoolean - leftNearBoolean;
      }
      if (
        usePhase20SectionRanking &&
        rightContextualBurden !== leftContextualBurden
      ) {
        return leftContextualBurden - rightContextualBurden;
      }
      if (
        usePhase20SectionRanking &&
        rightDerivedBurden !== leftDerivedBurden
      ) {
        return leftDerivedBurden - rightDerivedBurden;
      }
      if (rightPhase19ClipValue !== leftPhase19ClipValue) {
        return rightPhase19ClipValue - leftPhase19ClipValue;
      }
      if (
        usePhase18SectionRanking &&
        rightDirectConstructionTruth !== leftDirectConstructionTruth
      ) {
        return rightDirectConstructionTruth - leftDirectConstructionTruth;
      }
      if (rightConstruction !== leftConstruction) {
        return rightConstruction - leftConstruction;
      }
      if (rightConstructionSpecificity !== leftConstructionSpecificity) {
        return rightConstructionSpecificity - leftConstructionSpecificity;
      }
      if (
        usePhase18SectionRanking &&
        rightContextualConstructionTruth !== leftContextualConstructionTruth
      ) {
        return (
          leftContextualConstructionTruth - rightContextualConstructionTruth
        );
      }
      if (
        usePhase18SectionRanking &&
        rightDerivedConstructionTruth !== leftDerivedConstructionTruth
      ) {
        return leftDerivedConstructionTruth - rightDerivedConstructionTruth;
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
            : usePhase21SectionRanking &&
                (Number(
                  entry.sectionEvidenceSummary?.cutFaceConstructionTruthCount ||
                    0,
                ) +
                  Number(
                    entry.sectionEvidence?.sectionFaceBundle?.summary
                      ?.cutFaceCount || 0,
                  ) <
                  Number(
                    candidate.sectionEvidenceSummary
                      ?.cutFaceConstructionTruthCount || 0,
                  ) +
                    Number(
                      candidate.sectionEvidence?.sectionFaceBundle?.summary
                        ?.cutFaceCount || 0,
                    ) ||
                  Number(
                    entry.sectionEvidence?.sectionFaceBundle?.credibility
                      ?.score || 0,
                  ) <
                    Number(
                      candidate.sectionEvidence?.sectionFaceBundle?.credibility
                        ?.score || 0,
                    ) ||
                  String(
                    entry.sectionEvidence?.sectionFaceBundle?.credibility
                      ?.quality || "",
                  ).toLowerCase() === "blocked" ||
                  (String(
                    entry.sectionEvidence?.sectionFaceBundle?.credibility
                      ?.quality || "",
                  ).toLowerCase() === "weak" &&
                    String(
                      candidate.sectionEvidence?.sectionFaceBundle?.credibility
                        ?.quality || "",
                    ).toLowerCase() === "verified"))
              ? "Rejected because its true cut-face construction truth was thinner or its section-face credibility was weaker."
              : usePhase20SectionRanking &&
                  Number(
                    entry.sectionEvidence?.sectionTruthModel?.overall
                      ?.directScore || 0,
                  ) <
                    Number(
                      candidate.sectionEvidence?.sectionTruthModel?.overall
                        ?.directScore || 0,
                    )
                ? "Rejected because its centralized cut-truth model carried weaker direct construction truth."
                : usePhase19SectionRanking &&
                    Number(
                      entry.sectionEvidenceSummary
                        ?.sectionDraftingEvidenceScore || 0,
                    ) <
                      Number(
                        candidate.sectionEvidenceSummary
                          ?.sectionDraftingEvidenceScore || 0,
                      )
                  ? "Rejected because its clipped construction profile and drafting evidence were weaker."
                  : usePhase18SectionRanking &&
                      Number(
                        entry.sectionEvidenceSummary
                          ?.directConstructionTruthCount || 0,
                      ) <
                        Number(
                          candidate.sectionEvidenceSummary
                            ?.directConstructionTruthCount || 0,
                        )
                    ? "Rejected because it carried weaker direct construction truth across walls/openings/slabs/roof/foundation."
                    : Number(
                          entry.sectionEvidenceSummary?.directEvidenceScore ||
                            0,
                        ) <
                        Number(
                          candidate.sectionEvidenceSummary
                            ?.directEvidenceScore || 0,
                        )
                      ? "Rejected because it had weaker direct cut evidence."
                      : Number(
                            entry.sectionEvidenceSummary
                              ?.inferredEvidenceScore || 0,
                          ) >
                          Number(
                            candidate.sectionEvidenceSummary
                              ?.inferredEvidenceScore || 0,
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
