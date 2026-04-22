import { isFeatureEnabled } from "../../config/featureFlags.js";
import {
  buildSectionIntersections,
  resolveSectionCutCoordinate,
  sectionAxis,
} from "./sectionGeometryIntersectionService.js";
import { truthBucketFromMode } from "./constructionTruthModel.js";
import { assessSectionConstructionSemantics } from "./sectionConstructionSemanticService.js";
import { buildSectionTruthModel } from "./sectionTruthModel.js";

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function round(value, precision = 3) {
  const factor = 10 ** precision;
  return Math.round(Number(value || 0) * factor) / factor;
}

function unique(items = []) {
  return [...new Set((items || []).filter(Boolean))];
}

function getLevelProfiles(geometry = {}) {
  let offset = 0;
  return (geometry.levels || [])
    .slice()
    .sort(
      (left, right) =>
        Number(left.level_number || 0) - Number(right.level_number || 0),
    )
    .map((level) => {
      const height = Number(level.height_m || 3.2);
      const profile = {
        ...level,
        bottom_m: offset,
        top_m: offset + height,
      };
      offset += height;
      return profile;
    });
}

function summarizeFocusHits(
  sectionProfile = {},
  directRooms = [],
  directStairs = [],
  directEntrances = [],
) {
  const ids = new Set([
    ...directRooms.map((room) => `entity:room:${room.id}`),
    ...directStairs.map((stair) => `entity:stair:${stair.id}`),
    ...directEntrances.map((entry) => `entity:entrance:${entry.id || "main"}`),
  ]);
  return (sectionProfile.focusEntityIds || []).filter((entry) =>
    ids.has(String(entry)),
  );
}

function roomArea(room = {}) {
  return Number(room.actual_area || room.target_area_m2 || 0);
}

function evidenceQualityFromScore(
  score = 0,
  { strong = 0.72, weak = 0.42, blockedWhenZero = true } = {},
) {
  const resolved = Number(score || 0);
  if (blockedWhenZero && resolved <= 0.02) {
    return "blocked";
  }
  if (resolved >= strong) {
    return "verified";
  }
  if (resolved >= weak) {
    return "weak";
  }
  return "blocked";
}

export function classifySectionEvidence(summary = {}) {
  if (
    summary.directEvidenceQuality === "blocked" ||
    summary.inferredEvidenceQuality === "blocked"
  ) {
    return "block";
  }
  if (
    Number(summary.communicationValue || 0) >= 0.76 &&
    summary.directEvidenceQuality === "verified" &&
    Number(summary.directClipCount || 0) >= 3
  ) {
    return "pass";
  }
  if (
    Number(summary.communicationValue || 0) >= 0.58 &&
    summary.directEvidenceQuality !== "blocked"
  ) {
    return "warning";
  }
  return "block";
}

export function explainSectionEvidence(summary = {}, sectionProfile = {}) {
  const rationale = [];

  if (summary.cutRoomCount > 0) {
    rationale.push(
      `Cut directly clips ${summary.cutRoomCount} room volume(s) with ${summary.totalCutRoomAreaM2.toFixed(1)}m2 of exact room evidence.`,
    );
  } else if (summary.nearRoomCount > 0) {
    rationale.push(
      `Room evidence is near-cut only (${summary.nearRoomCount} room volume(s)); no room is directly clipped.`,
    );
  } else {
    rationale.push("Cut does not directly clip a named room volume.");
  }

  if (summary.cutStairCount > 0) {
    rationale.push(
      `Cut directly clips ${summary.cutStairCount} stair/core element(s), improving vertical circulation truth.`,
    );
  } else if (summary.nearStairCount > 0) {
    rationale.push(
      `Stair/core evidence is contextual only (${summary.nearStairCount} near-cut element(s)).`,
    );
  } else {
    rationale.push("No stair/core geometry is directly clipped by the cut.");
  }

  if (summary.cutOpeningCount > 0) {
    rationale.push(
      `Cut resolves ${summary.cutOpeningCount} direct opening marker(s) against ${summary.cutWallCount} direct wall clip(s).`,
    );
  } else if (summary.nearOpeningCount > 0) {
    rationale.push(
      `Openings are near-cut/contextual only (${summary.nearOpeningCount} marker(s)); they are not clipped directly.`,
    );
  } else if (summary.inferredOpeningCount > 0) {
    rationale.push(
      `Opening relationships remain inferred from ${summary.inferredOpeningCount} non-clipped marker(s).`,
    );
  } else {
    rationale.push("No opening relationship is directly resolved by the cut.");
  }

  if (summary.directSlabCount > 0) {
    rationale.push(
      `Section includes ${summary.directSlabCount} exact slab/floor clip(s).`,
    );
  } else if (summary.nearSlabCount > 0) {
    rationale.push(
      `Slab/floor structure is contextual only (${summary.nearSlabCount} near-cut slab reference(s)).`,
    );
  }

  if (summary.focusHitCount > 0) {
    rationale.push(
      `Cut hits ${summary.focusHitCount} focused semantic anchor(s) from the chosen section strategy.`,
    );
  }

  if (summary.directClipCount > 0) {
    rationale.push(
      `${summary.directClipCount} exact clip primitive(s) were derived from canonical geometry.`,
    );
  }
  if (summary.approximateEvidenceCount > 0) {
    rationale.push(
      `${summary.approximateEvidenceCount} evidence fragment(s) still rely on contextual, bbox, or derived support rather than exact clipping.`,
    );
  }
  if (summary.unsupportedEvidenceCount > 0) {
    rationale.push(
      `${summary.unsupportedEvidenceCount} evidence fragment(s) remain unsupported because canonical cut primitives are incomplete.`,
    );
  }

  if (summary.directEvidenceQuality === "blocked") {
    rationale.push(
      "Direct cut evidence is too weak to treat this section as credible final technical truth.",
    );
  } else if (summary.directEvidenceQuality === "weak") {
    rationale.push(
      "Direct cut evidence exists, but it is still thinner than preferred for a final board section.",
    );
  } else {
    rationale.push(
      "Direct cut evidence is strong enough to support a credible technical section.",
    );
  }

  if (summary.inferredEvidenceQuality === "blocked") {
    rationale.push(
      "The section still relies too heavily on inferred/contextual evidence.",
    );
  } else if (summary.inferredEvidenceQuality === "weak") {
    rationale.push(
      "Some section meaning still depends on inferred/contextual evidence.",
    );
  } else {
    rationale.push(
      "Inference burden is low enough that exact clipping remains the primary truth source.",
    );
  }

  if (sectionProfile?.strategyName) {
    rationale.push(
      `${sectionProfile.strategyName} remains the deterministic strategy anchor for this section.`,
    );
  }

  return rationale;
}

export function buildSectionEvidenceSummary(evidence = {}) {
  return (
    evidence.summary || {
      evidenceQuality: "block",
      usefulnessScore: 0,
      cutSpecificity: 0,
      communicationValue: 0,
      directEvidenceScore: 0,
      inferredEvidenceScore: 0,
      directEvidenceQuality: "blocked",
      inferredEvidenceQuality: "blocked",
      directEvidenceCount: 0,
      nearEvidenceCount: 0,
      inferredEvidenceCount: 0,
      unsupportedEvidenceCount: 0,
      directConstructionTruthCount: 0,
      contextualConstructionTruthCount: 0,
      derivedConstructionTruthCount: 0,
      unsupportedConstructionTruthCount: 0,
      directClipCount: 0,
      approximateEvidenceCount: 0,
      exactConstructionClipCount: 0,
      exactConstructionProfileClipCount: 0,
      constructionProfileSegmentCount: 0,
      directConstructionProfileHitCount: 0,
      focusHitCount: 0,
      cutRoomCount: 0,
      nearRoomCount: 0,
      inferredRoomCount: 0,
      unsupportedRoomCount: 0,
      cutStairCount: 0,
      nearStairCount: 0,
      inferredStairCount: 0,
      unsupportedStairCount: 0,
      cutWallCount: 0,
      cutWallExactClipCount: 0,
      nearWallCount: 0,
      inferredWallCount: 0,
      unsupportedWallCount: 0,
      cutOpeningCount: 0,
      cutOpeningExactClipCount: 0,
      nearOpeningCount: 0,
      inferredOpeningCount: 0,
      unsupportedOpeningCount: 0,
      cutDoorCount: 0,
      entranceHitCount: 0,
      directSlabCount: 0,
      directSlabExactClipCount: 0,
      nearSlabCount: 0,
      inferredSlabCount: 0,
      unsupportedSlabCount: 0,
      directRoofCount: 0,
      directRoofExactClipCount: 0,
      directRoofStructuralClipCount: 0,
      nearRoofCount: 0,
      inferredRoofCount: 0,
      unsupportedRoofCount: 0,
      directFoundationCount: 0,
      directFoundationExactClipCount: 0,
      nearFoundationCount: 0,
      inferredFoundationCount: 0,
      unsupportedFoundationCount: 0,
      directBaseConditionCount: 0,
      directBaseConditionExactClipCount: 0,
      nearBaseConditionCount: 0,
      inferredBaseConditionCount: 0,
      unsupportedBaseConditionCount: 0,
      cutWallDirectTruthCount: 0,
      cutWallContextualTruthCount: 0,
      cutWallDerivedTruthCount: 0,
      cutWallUnsupportedTruthCount: 0,
      cutOpeningDirectTruthCount: 0,
      cutOpeningContextualTruthCount: 0,
      cutOpeningDerivedTruthCount: 0,
      cutOpeningUnsupportedTruthCount: 0,
      stairDirectTruthCount: 0,
      stairContextualTruthCount: 0,
      stairDerivedTruthCount: 0,
      roofDirectTruthCount: 0,
      roofContextualTruthCount: 0,
      roofDerivedTruthCount: 0,
      foundationDirectTruthCount: 0,
      foundationContextualTruthCount: 0,
      foundationDerivedTruthCount: 0,
      baseConditionDirectTruthCount: 0,
      baseConditionContextualTruthCount: 0,
      baseConditionDerivedTruthCount: 0,
      sectionConstructionEvidenceScore: 0,
      sectionConstructionEvidenceQuality: "provisional",
      sectionConstructionTruthQuality: "provisional",
      constructionEvidenceScore: 0,
      sectionProfileComplexityScore: 0,
      sectionDraftingEvidenceScore: 0,
      wallSectionClipQuality: "provisional",
      openingSectionClipQuality: "provisional",
      stairSectionClipQuality: "provisional",
      slabSectionClipQuality: "provisional",
      roofSectionClipQuality: "provisional",
      foundationSectionClipQuality: "provisional",
      cutWallTruthQuality: "provisional",
      cutOpeningTruthQuality: "provisional",
      stairTruthQuality: "provisional",
      slabTruthQuality: "provisional",
      roofTruthQuality: "provisional",
      foundationTruthQuality: "provisional",
      roofTruthMode: "missing",
      roofTruthState: "unsupported",
      foundationTruthMode: "missing",
      foundationTruthState: "unsupported",
      explicitRoofEdgeCount: 0,
      explicitParapetCount: 0,
      explicitRoofBreakCount: 0,
      explicitHipCount: 0,
      explicitValleyCount: 0,
      explicitDormerAttachmentCount: 0,
      explicitGroundRelationCount: 0,
      foundationZoneCount: 0,
      baseWallConditionCount: 0,
      constructionFallbackDependence: 1,
      explicitRoofPrimitiveCount: 0,
      explicitFoundationCount: 0,
      explicitBaseConditionCount: 0,
      levelCount: 0,
      roofCommunicated: false,
      foundationCommunicated: false,
      geometryCommunicable: false,
      geometrySupportLimited: true,
      totalCutRoomAreaM2: 0,
      chosenSectionRationale: null,
    }
  );
}

export function summarizeSectionEvidence(summary = {}) {
  return buildSectionEvidenceSummary({ summary });
}

export function scoreSectionEvidence(summary = {}) {
  const resolved = summarizeSectionEvidence(summary);
  return {
    evidenceQuality: classifySectionEvidence(resolved),
    usefulnessScore: Number(resolved.usefulnessScore || 0),
    cutSpecificity: Number(resolved.cutSpecificity || 0),
    directEvidenceScore: Number(resolved.directEvidenceScore || 0),
    inferredEvidenceScore: Number(resolved.inferredEvidenceScore || 0),
    communicationValue: Number(resolved.communicationValue || 0),
  };
}

export function buildSectionEvidence(
  projectGeometry = {},
  sectionProfile = {},
) {
  const sectionType = String(
    sectionProfile.sectionType || "longitudinal",
  ).toLowerCase();
  const axis = sectionAxis(sectionType);
  const cutCoordinate = resolveSectionCutCoordinate(
    projectGeometry,
    sectionProfile,
    sectionType,
  );
  const levelProfiles = getLevelProfiles(projectGeometry);
  const roofLanguage = String(
    sectionProfile.roofLanguage ||
      projectGeometry?.roof?.type ||
      projectGeometry?.metadata?.style_dna?.roof_language ||
      "pitched gable",
  ).toLowerCase();
  const useTrueEvidence =
    isFeatureEnabled("useTrueSectionClippingPhase13") ||
    isFeatureEnabled("useTrueSectionEvidencePhase12") ||
    isFeatureEnabled("useTrueSectionEvidencePhase11");
  const useConstructionTruth = isFeatureEnabled(
    "useSectionConstructionTruthPhase14",
  );
  const usePhase15Truth =
    isFeatureEnabled("useCanonicalRoofPrimitivesPhase15") ||
    isFeatureEnabled("useCanonicalFoundationPrimitivesPhase15") ||
    isFeatureEnabled("useRoofFoundationSectionTruthPhase15");
  const usePhase17Truth =
    isFeatureEnabled("useCanonicalConstructionTruthModelPhase17") ||
    isFeatureEnabled("useExplicitRoofPrimitiveSynthesisPhase17") ||
    isFeatureEnabled("useExplicitFoundationPrimitiveSynthesisPhase17");
  const usePhase18Truth =
    isFeatureEnabled("useDeeperSectionClippingPhase18") ||
    isFeatureEnabled("useDraftingGradeSectionGraphicsPhase18") ||
    isFeatureEnabled("useConstructionTruthDrivenSectionRankingPhase18") ||
    isFeatureEnabled("useSectionConstructionCredibilityGatePhase18");
  const usePhase19Truth =
    isFeatureEnabled("useDeeperSectionClippingPhase19") ||
    isFeatureEnabled("useDraftingGradeSectionGraphicsPhase19") ||
    isFeatureEnabled("useConstructionTruthDrivenSectionRankingPhase19") ||
    isFeatureEnabled("useSectionConstructionCredibilityGatePhase19");
  const usePhase20Truth =
    isFeatureEnabled("useNearBooleanSectioningPhase20") ||
    isFeatureEnabled("useCentralizedSectionTruthModelPhase20") ||
    isFeatureEnabled("useDraftingGradeSectionGraphicsPhase20") ||
    isFeatureEnabled("useConstructionTruthDrivenSectionRankingPhase20") ||
    isFeatureEnabled("useSectionConstructionCredibilityGatePhase20");
  const usePhase21Truth =
    isFeatureEnabled("useTrueGeometricSectioningPhase21") ||
    isFeatureEnabled("useCentralizedSectionTruthModelPhase21") ||
    isFeatureEnabled("useDraftingGradeSectionGraphicsPhase21") ||
    isFeatureEnabled("useConstructionTruthDrivenSectionRankingPhase21") ||
    isFeatureEnabled("useSectionConstructionCredibilityGatePhase21");

  const intersectionBundle = buildSectionIntersections(
    projectGeometry,
    sectionProfile,
    useTrueEvidence
      ? {
          directBand: usePhase21Truth ? 0.1 : usePhase20Truth ? 0.12 : 0.14,
          nearBand: usePhase21Truth ? 0.8 : usePhase20Truth ? 0.82 : 0.9,
        }
      : undefined,
  );
  const rooms = intersectionBundle.intersections.rooms || {};
  const stairs = intersectionBundle.intersections.stairs || {};
  const walls = intersectionBundle.intersections.walls || {};
  const windows = intersectionBundle.intersections.windows || {};
  const doors = intersectionBundle.intersections.doors || {};
  const entrances = intersectionBundle.intersections.entrances || {};
  const slabs = intersectionBundle.intersections.slabs || {};
  const roofElements = intersectionBundle.intersections.roofElements || {};
  const foundations = intersectionBundle.intersections.foundations || {};
  const baseConditions = intersectionBundle.intersections.baseConditions || {};

  const directRooms = rooms.direct || [];
  const nearRooms = rooms.near || [];
  const inferredRooms = rooms.inferred || [];
  const unsupportedRooms = rooms.unsupported || [];
  const directStairs = stairs.direct || [];
  const nearStairs = stairs.near || [];
  const inferredStairs = stairs.inferred || [];
  const unsupportedStairs = stairs.unsupported || [];
  const directWalls = walls.direct || [];
  const nearWalls = walls.near || [];
  const inferredWalls = walls.inferred || [];
  const unsupportedWalls = walls.unsupported || [];
  const directWindows = windows.direct || [];
  const nearWindows = windows.near || [];
  const inferredWindows = windows.inferred || [];
  const unsupportedWindows = windows.unsupported || [];
  const directDoors = doors.direct || [];
  const nearDoors = doors.near || [];
  const inferredDoors = doors.inferred || [];
  const unsupportedDoors = doors.unsupported || [];
  const directOpenings = [...directWindows, ...directDoors];
  const nearOpenings = [...nearWindows, ...nearDoors];
  const inferredOpenings = [...inferredWindows, ...inferredDoors];
  const unsupportedOpenings = [...unsupportedWindows, ...unsupportedDoors];
  const directEntrances = entrances.direct || [];
  const nearEntrances = entrances.near || [];
  const unsupportedEntrances = entrances.unsupported || [];
  const directSlabs = slabs.direct || [];
  const nearSlabs = slabs.near || [];
  const inferredSlabs = slabs.inferred || [];
  const unsupportedSlabs = slabs.unsupported || [];
  const directRoof = roofElements.direct || [];
  const nearRoof = roofElements.near || [];
  const inferredRoof = roofElements.inferred || [];
  const unsupportedRoof = roofElements.unsupported || [];
  const directFoundations = foundations.direct || [];
  const nearFoundations = foundations.near || [];
  const inferredFoundations = foundations.inferred || [];
  const unsupportedFoundations = foundations.unsupported || [];
  const directBaseConditions = baseConditions.direct || [];
  const nearBaseConditions = baseConditions.near || [];
  const inferredBaseConditions = baseConditions.inferred || [];
  const unsupportedBaseConditions = baseConditions.unsupported || [];
  const focusHits = summarizeFocusHits(
    sectionProfile,
    directRooms,
    directStairs,
    directEntrances,
  );
  const constructionTruthSummary =
    intersectionBundle.constructionTruthSummary || {};
  const wallConstructionTruth = constructionTruthSummary.walls || {};
  const openingConstructionTruth = {
    totalCount:
      Number(constructionTruthSummary.windows?.totalCount || 0) +
      Number(constructionTruthSummary.doors?.totalCount || 0),
    directCount:
      Number(constructionTruthSummary.windows?.directCount || 0) +
      Number(constructionTruthSummary.doors?.directCount || 0),
    contextualCount:
      Number(constructionTruthSummary.windows?.contextualCount || 0) +
      Number(constructionTruthSummary.doors?.contextualCount || 0),
    derivedCount:
      Number(constructionTruthSummary.windows?.derivedCount || 0) +
      Number(constructionTruthSummary.doors?.derivedCount || 0),
    unsupportedCount:
      Number(constructionTruthSummary.windows?.unsupportedCount || 0) +
      Number(constructionTruthSummary.doors?.unsupportedCount || 0),
    exactClipCount:
      Number(constructionTruthSummary.windows?.exactClipCount || 0) +
      Number(constructionTruthSummary.doors?.exactClipCount || 0),
    exactProfileClipCount:
      Number(constructionTruthSummary.windows?.exactProfileClipCount || 0) +
      Number(constructionTruthSummary.doors?.exactProfileClipCount || 0),
    profileSegmentCount:
      Number(constructionTruthSummary.windows?.profileSegmentCount || 0) +
      Number(constructionTruthSummary.doors?.profileSegmentCount || 0),
    directProfileHitCount:
      Number(constructionTruthSummary.windows?.directProfileHitCount || 0) +
      Number(constructionTruthSummary.doors?.directProfileHitCount || 0),
    profileComplexityScore: round(
      clamp(
        (Number(constructionTruthSummary.windows?.profileComplexityScore || 0) +
          Number(constructionTruthSummary.doors?.profileComplexityScore || 0)) /
          2,
        0,
        1,
      ),
    ),
  };
  const stairConstructionTruth = constructionTruthSummary.stairs || {};
  const slabConstructionTruth = constructionTruthSummary.slabs || {};
  const roofConstructionTruth = constructionTruthSummary.roofElements || {};
  const foundationConstructionTruth =
    constructionTruthSummary.foundations || {};
  const baseConditionConstructionTruth =
    constructionTruthSummary.baseConditions || {};
  const overallConstructionTruth = {
    totalCount:
      Number(wallConstructionTruth.totalCount || 0) +
      Number(openingConstructionTruth.totalCount || 0) +
      Number(stairConstructionTruth.totalCount || 0) +
      Number(slabConstructionTruth.totalCount || 0) +
      Number(roofConstructionTruth.totalCount || 0) +
      Number(foundationConstructionTruth.totalCount || 0) +
      Number(baseConditionConstructionTruth.totalCount || 0),
    directCount:
      Number(wallConstructionTruth.directCount || 0) +
      Number(openingConstructionTruth.directCount || 0) +
      Number(stairConstructionTruth.directCount || 0) +
      Number(slabConstructionTruth.directCount || 0) +
      Number(roofConstructionTruth.directCount || 0) +
      Number(foundationConstructionTruth.directCount || 0) +
      Number(baseConditionConstructionTruth.directCount || 0),
    contextualCount:
      Number(wallConstructionTruth.contextualCount || 0) +
      Number(openingConstructionTruth.contextualCount || 0) +
      Number(stairConstructionTruth.contextualCount || 0) +
      Number(slabConstructionTruth.contextualCount || 0) +
      Number(roofConstructionTruth.contextualCount || 0) +
      Number(foundationConstructionTruth.contextualCount || 0) +
      Number(baseConditionConstructionTruth.contextualCount || 0),
    derivedCount:
      Number(wallConstructionTruth.derivedCount || 0) +
      Number(openingConstructionTruth.derivedCount || 0) +
      Number(stairConstructionTruth.derivedCount || 0) +
      Number(slabConstructionTruth.derivedCount || 0) +
      Number(roofConstructionTruth.derivedCount || 0) +
      Number(foundationConstructionTruth.derivedCount || 0) +
      Number(baseConditionConstructionTruth.derivedCount || 0),
    unsupportedCount:
      Number(wallConstructionTruth.unsupportedCount || 0) +
      Number(openingConstructionTruth.unsupportedCount || 0) +
      Number(stairConstructionTruth.unsupportedCount || 0) +
      Number(slabConstructionTruth.unsupportedCount || 0) +
      Number(roofConstructionTruth.unsupportedCount || 0) +
      Number(foundationConstructionTruth.unsupportedCount || 0) +
      Number(baseConditionConstructionTruth.unsupportedCount || 0),
    exactClipCount:
      Number(wallConstructionTruth.exactClipCount || 0) +
      Number(openingConstructionTruth.exactClipCount || 0) +
      Number(stairConstructionTruth.exactClipCount || 0) +
      Number(slabConstructionTruth.exactClipCount || 0) +
      Number(roofConstructionTruth.exactClipCount || 0) +
      Number(foundationConstructionTruth.exactClipCount || 0) +
      Number(baseConditionConstructionTruth.exactClipCount || 0),
    exactProfileClipCount:
      Number(wallConstructionTruth.exactProfileClipCount || 0) +
      Number(openingConstructionTruth.exactProfileClipCount || 0) +
      Number(stairConstructionTruth.exactProfileClipCount || 0) +
      Number(slabConstructionTruth.exactProfileClipCount || 0) +
      Number(roofConstructionTruth.exactProfileClipCount || 0) +
      Number(foundationConstructionTruth.exactProfileClipCount || 0) +
      Number(baseConditionConstructionTruth.exactProfileClipCount || 0),
    profileSegmentCount:
      Number(wallConstructionTruth.profileSegmentCount || 0) +
      Number(openingConstructionTruth.profileSegmentCount || 0) +
      Number(stairConstructionTruth.profileSegmentCount || 0) +
      Number(slabConstructionTruth.profileSegmentCount || 0) +
      Number(roofConstructionTruth.profileSegmentCount || 0) +
      Number(foundationConstructionTruth.profileSegmentCount || 0) +
      Number(baseConditionConstructionTruth.profileSegmentCount || 0),
    directProfileHitCount:
      Number(wallConstructionTruth.directProfileHitCount || 0) +
      Number(openingConstructionTruth.directProfileHitCount || 0) +
      Number(stairConstructionTruth.directProfileHitCount || 0) +
      Number(slabConstructionTruth.directProfileHitCount || 0) +
      Number(roofConstructionTruth.directProfileHitCount || 0) +
      Number(foundationConstructionTruth.directProfileHitCount || 0) +
      Number(baseConditionConstructionTruth.directProfileHitCount || 0),
    nearBooleanClipCount:
      Number(wallConstructionTruth.nearBooleanClipCount || 0) +
      Number(openingConstructionTruth.nearBooleanClipCount || 0) +
      Number(stairConstructionTruth.nearBooleanClipCount || 0) +
      Number(slabConstructionTruth.nearBooleanClipCount || 0) +
      Number(roofConstructionTruth.nearBooleanClipCount || 0) +
      Number(foundationConstructionTruth.nearBooleanClipCount || 0) +
      Number(baseConditionConstructionTruth.nearBooleanClipCount || 0),
    averageBandCoverageRatio: round(
      [
        Number(wallConstructionTruth.averageBandCoverageRatio || 0),
        Number(openingConstructionTruth.averageBandCoverageRatio || 0),
        Number(stairConstructionTruth.averageBandCoverageRatio || 0),
        Number(slabConstructionTruth.averageBandCoverageRatio || 0),
        Number(roofConstructionTruth.averageBandCoverageRatio || 0),
        Number(foundationConstructionTruth.averageBandCoverageRatio || 0),
        Number(baseConditionConstructionTruth.averageBandCoverageRatio || 0),
      ].reduce((sum, value) => sum + value, 0) / 7,
    ),
    profileComplexityScore: round(
      clamp(
        (Number(wallConstructionTruth.profileComplexityScore || 0) +
          Number(openingConstructionTruth.profileComplexityScore || 0) +
          Number(stairConstructionTruth.profileComplexityScore || 0) +
          Number(slabConstructionTruth.profileComplexityScore || 0) +
          Number(roofConstructionTruth.profileComplexityScore || 0) +
          Number(foundationConstructionTruth.profileComplexityScore || 0) +
          Number(baseConditionConstructionTruth.profileComplexityScore || 0)) /
          7,
        0,
        1,
      ),
    ),
  };
  const circulationHitCount = Number(projectGeometry.circulation?.length || 0);

  const directEvidenceCount =
    directRooms.length +
    directStairs.length +
    directWalls.length +
    directOpenings.length +
    directEntrances.length +
    directSlabs.length +
    directRoof.length;
  const nearEvidenceCount =
    nearRooms.length +
    nearStairs.length +
    nearWalls.length +
    nearOpenings.length +
    nearEntrances.length +
    nearSlabs.length +
    nearRoof.length;
  const inferredEvidenceCount =
    inferredRooms.length +
    inferredStairs.length +
    inferredWalls.length +
    inferredOpenings.length +
    inferredSlabs.length +
    inferredRoof.length;
  const unsupportedEvidenceCount =
    unsupportedRooms.length +
    unsupportedStairs.length +
    unsupportedWalls.length +
    unsupportedOpenings.length +
    unsupportedEntrances.length +
    unsupportedSlabs.length +
    unsupportedRoof.length;

  const directClipCount = Number(
    intersectionBundle.clipSummary?.directClipCount || 0,
  );
  const approximateEvidenceCount = Number(
    intersectionBundle.clipSummary?.approximateEvidenceCount || 0,
  );
  const directConstructionTruthCount = Number(
    overallConstructionTruth.directCount || 0,
  );
  const contextualConstructionTruthCount = Number(
    overallConstructionTruth.contextualCount || 0,
  );
  const derivedConstructionTruthCount = Number(
    overallConstructionTruth.derivedCount || 0,
  );
  const unsupportedConstructionTruthCount = Number(
    overallConstructionTruth.unsupportedCount || 0,
  );
  const exactConstructionClipCount = Number(
    overallConstructionTruth.exactClipCount || 0,
  );
  const exactConstructionProfileClipCount = Number(
    overallConstructionTruth.exactProfileClipCount || 0,
  );
  const constructionProfileSegmentCount = Number(
    overallConstructionTruth.profileSegmentCount || 0,
  );
  const directConstructionProfileHitCount = Number(
    overallConstructionTruth.directProfileHitCount || 0,
  );

  const clipQualityFromGroup = (group = {}) => {
    const totalCount = Number(group.totalCount || 0);
    if (totalCount <= 0) {
      return {
        score: 0,
        quality: "provisional",
      };
    }
    const score = round(
      clamp(
        Number(group.directCount || 0) * 0.16 +
          Number(group.exactClipCount || 0) * 0.14 +
          Number(group.exactProfileClipCount || 0) * 0.12 +
          Number(group.directProfileHitCount || 0) * 0.1 +
          Number(group.profileSegmentCount || 0) * 0.03 +
          Number(group.profileComplexityScore || 0) * 0.28 -
          Number(group.contextualCount || 0) * 0.06 -
          Number(group.derivedCount || 0) * 0.08 -
          Number(group.unsupportedCount || 0) * 0.1,
        0,
        1,
      ),
    );
    return {
      score,
      quality: score >= 0.72 ? "verified" : score >= 0.42 ? "weak" : "blocked",
    };
  };

  const wallClipQuality = clipQualityFromGroup(wallConstructionTruth);
  const normalizedWallClipQuality =
    wallClipQuality.quality === "blocked" &&
    Number(wallConstructionTruth.directCount || 0) > 0 &&
    Number(wallConstructionTruth.exactClipCount || 0) > 0 &&
    Number(wallConstructionTruth.exactProfileClipCount || 0) > 0
      ? {
          score: Math.max(Number(wallClipQuality.score || 0), 0.42),
          quality: "weak",
        }
      : wallClipQuality;
  const openingClipQuality = clipQualityFromGroup(openingConstructionTruth);
  const stairClipQuality = clipQualityFromGroup(stairConstructionTruth);
  const slabClipQuality = clipQualityFromGroup(slabConstructionTruth);
  const roofClipQuality = clipQualityFromGroup(roofConstructionTruth);
  const foundationClipQuality = clipQualityFromGroup({
    totalCount:
      Number(foundationConstructionTruth.totalCount || 0) +
      Number(baseConditionConstructionTruth.totalCount || 0),
    directCount:
      Number(foundationConstructionTruth.directCount || 0) +
      Number(baseConditionConstructionTruth.directCount || 0),
    contextualCount:
      Number(foundationConstructionTruth.contextualCount || 0) +
      Number(baseConditionConstructionTruth.contextualCount || 0),
    derivedCount:
      Number(foundationConstructionTruth.derivedCount || 0) +
      Number(baseConditionConstructionTruth.derivedCount || 0),
    unsupportedCount:
      Number(foundationConstructionTruth.unsupportedCount || 0) +
      Number(baseConditionConstructionTruth.unsupportedCount || 0),
    exactClipCount:
      Number(foundationConstructionTruth.exactClipCount || 0) +
      Number(baseConditionConstructionTruth.exactClipCount || 0),
    exactProfileClipCount:
      Number(foundationConstructionTruth.exactProfileClipCount || 0) +
      Number(baseConditionConstructionTruth.exactProfileClipCount || 0),
    directProfileHitCount:
      Number(foundationConstructionTruth.directProfileHitCount || 0) +
      Number(baseConditionConstructionTruth.directProfileHitCount || 0),
    profileSegmentCount:
      Number(foundationConstructionTruth.profileSegmentCount || 0) +
      Number(baseConditionConstructionTruth.profileSegmentCount || 0),
    profileComplexityScore: round(
      clamp(
        (Number(foundationConstructionTruth.profileComplexityScore || 0) +
          Number(baseConditionConstructionTruth.profileComplexityScore || 0)) /
          2,
        0,
        1,
      ),
    ),
  });
  const sectionProfileComplexityScore = round(
    clamp(
      Number(overallConstructionTruth.profileComplexityScore || 0) * 0.62 +
        Math.min(0.24, constructionProfileSegmentCount * 0.018) +
        Math.min(0.14, directConstructionProfileHitCount * 0.032) +
        (usePhase20Truth
          ? Math.min(
              0.18,
              Number(overallConstructionTruth.nearBooleanClipCount || 0) * 0.03,
            ) +
            Math.min(
              0.12,
              Number(overallConstructionTruth.averageBandCoverageRatio || 0) *
                0.12,
            )
          : 0),
      0,
      1,
    ),
  );
  const sectionDraftingEvidenceScore = round(
    clamp(
      normalizedWallClipQuality.score * 0.22 +
        openingClipQuality.score * 0.16 +
        stairClipQuality.score * 0.12 +
        slabClipQuality.score * 0.14 +
        roofClipQuality.score * 0.16 +
        foundationClipQuality.score * 0.2 +
        (usePhase20Truth
          ? Math.min(
              0.12,
              Number(overallConstructionTruth.nearBooleanClipCount || 0) *
                0.018,
            ) +
            Math.min(
              0.08,
              Number(overallConstructionTruth.averageBandCoverageRatio || 0) *
                0.08,
            )
          : 0),
      0,
      1,
    ),
  );

  const roomCommunicationScore =
    directRooms.length > 1
      ? 1
      : directRooms.length === 1
        ? 0.82
        : nearRooms.length > 0
          ? 0.44
          : inferredRooms.length > 0
            ? 0.28
            : 0.12;
  const verticalCirculationScore = directStairs.length
    ? 1
    : nearStairs.length
      ? 0.52
      : inferredStairs.length
        ? 0.32
        : (projectGeometry.stairs || []).length
          ? 0.2
          : 0.08;
  const wallOpeningScore =
    directWalls.length && directOpenings.length
      ? clamp(0.6 + directOpenings.length * 0.06, 0, 1)
      : directWalls.length
        ? 0.42
        : nearWalls.length || nearOpenings.length
          ? 0.28
          : inferredOpenings.length
            ? 0.18
            : 0.08;
  const slabDatumScore = directSlabs.length
    ? 0.86
    : nearSlabs.length
      ? 0.56
      : inferredSlabs.length || levelProfiles.length
        ? 0.38
        : 0.14;
  const focusScore =
    focusHits.length > 0
      ? clamp(0.58 + focusHits.length * 0.1, 0, 1)
      : (sectionProfile.focusEntityIds || []).length
        ? 0.24
        : 0.14;
  const roofScore =
    directRoof.length > 0
      ? 0.74
      : nearRoof.length > 0
        ? 0.52
        : inferredRoof.length > 0 || roofLanguage
          ? 0.36
          : 0.16;
  const groundConditionScore =
    directFoundations.length > 0 || directBaseConditions.length > 0
      ? 0.72
      : nearFoundations.length > 0 || nearBaseConditions.length > 0
        ? 0.48
        : inferredFoundations.length > 0 || inferredBaseConditions.length > 0
          ? 0.3
          : 0.14;
  const cutSpecificity =
    directEvidenceCount + nearEvidenceCount + inferredEvidenceCount > 0
      ? directEvidenceCount /
        (directEvidenceCount +
          nearEvidenceCount * 0.75 +
          inferredEvidenceCount * 0.45)
      : 0;
  const directEvidenceScore = round(
    clamp(
      (directRooms.length > 0 ? 0.24 : 0) +
        Math.min(0.16, directWalls.length * 0.04) +
        Math.min(0.16, directOpenings.length * 0.05) +
        (directStairs.length > 0 ? 0.22 : 0) +
        (directSlabs.length > 0 ? 0.1 : 0) +
        (directRoof.length > 0 ? 0.06 : 0) +
        Math.min(0.1, directClipCount * 0.02),
      0,
      1,
    ),
  );
  const inferredEvidenceScore = round(
    clamp(
      (directEvidenceCount > 0
        ? 0
        : nearEvidenceCount > 0
          ? 0.14
          : inferredEvidenceCount > 0
            ? 0.28
            : 0.42) +
        Math.min(0.22, inferredEvidenceCount * 0.03) +
        Math.min(0.28, unsupportedEvidenceCount * 0.045) +
        Math.min(0.14, approximateEvidenceCount * 0.02) -
        Math.min(0.12, directClipCount * 0.015),
      0,
      1,
    ),
  );
  const communicationValue = round(
    clamp(
      roomCommunicationScore * 0.22 +
        verticalCirculationScore * 0.22 +
        wallOpeningScore * 0.16 +
        slabDatumScore * 0.12 +
        focusScore * 0.1 +
        roofScore * 0.08 +
        groundConditionScore * 0.06 +
        clamp(cutSpecificity, 0, 1) * 0.1,
      0,
      1,
    ),
  );
  const directEvidenceQuality = evidenceQualityFromScore(directEvidenceScore, {
    strong: 0.72,
    weak: 0.44,
  });
  const inferredEvidenceQuality =
    inferredEvidenceScore >= 0.66
      ? "blocked"
      : inferredEvidenceScore >= 0.4
        ? "weak"
        : "verified";
  const sectionConstructionEvidenceScore = round(
    clamp(
      directConstructionTruthCount * 0.08 +
        exactConstructionClipCount * 0.05 +
        (usePhase19Truth
          ? exactConstructionProfileClipCount * 0.04 +
            constructionProfileSegmentCount * 0.012 +
            sectionProfileComplexityScore * 0.12 +
            sectionDraftingEvidenceScore * 0.14
          : 0) +
        (usePhase20Truth
          ? Math.min(
              0.1,
              Number(overallConstructionTruth.nearBooleanClipCount || 0) * 0.02,
            ) +
            Math.min(
              0.08,
              Number(overallConstructionTruth.averageBandCoverageRatio || 0) *
                0.08,
            )
          : 0) +
        Number(roofConstructionTruth.directCount || 0) * 0.04 +
        Number(foundationConstructionTruth.directCount || 0) * 0.04 +
        Number(baseConditionConstructionTruth.directCount || 0) * 0.03 -
        contextualConstructionTruthCount * 0.03 -
        derivedConstructionTruthCount * 0.045 -
        unsupportedConstructionTruthCount * 0.06,
      0,
      1,
    ),
  );
  const sectionConstructionEvidenceQuality =
    sectionConstructionEvidenceScore >= 0.72
      ? "verified"
      : sectionConstructionEvidenceScore >= 0.42
        ? "weak"
        : "blocked";

  const summary = {
    sectionType,
    cutCoordinate: round(cutCoordinate),
    cutAxis: axis,
    directEvidenceCount,
    nearEvidenceCount,
    inferredEvidenceCount,
    unsupportedEvidenceCount,
    directConstructionTruthCount,
    contextualConstructionTruthCount,
    derivedConstructionTruthCount,
    unsupportedConstructionTruthCount,
    directClipCount,
    approximateEvidenceCount,
    exactConstructionClipCount,
    exactConstructionProfileClipCount,
    constructionProfileSegmentCount,
    directConstructionProfileHitCount,
    nearBooleanConstructionClipCount: Number(
      overallConstructionTruth.nearBooleanClipCount || 0,
    ),
    averageConstructionBandCoverageRatio: Number(
      overallConstructionTruth.averageBandCoverageRatio || 0,
    ),
    cutSpecificity: round(cutSpecificity),
    directEvidenceScore,
    inferredEvidenceScore,
    directEvidenceQuality,
    inferredEvidenceQuality,
    communicationValue,
    focusHitCount: focusHits.length,
    cutRoomCount: directRooms.length,
    nearRoomCount: nearRooms.length,
    inferredRoomCount: inferredRooms.length,
    unsupportedRoomCount: unsupportedRooms.length,
    cutStairCount: directStairs.length,
    nearStairCount: nearStairs.length,
    inferredStairCount: inferredStairs.length,
    unsupportedStairCount: unsupportedStairs.length,
    cutWallCount: directWalls.length,
    cutWallExactClipCount: directWalls.filter(
      (entry) => entry.exactClip === true,
    ).length,
    nearWallCount: nearWalls.length,
    inferredWallCount: inferredWalls.length,
    unsupportedWallCount: unsupportedWalls.length,
    cutOpeningCount: directOpenings.length,
    cutOpeningExactClipCount: directOpenings.filter(
      (entry) => entry.exactClip === true,
    ).length,
    nearOpeningCount: nearOpenings.length,
    inferredOpeningCount: inferredOpenings.length,
    unsupportedOpeningCount: unsupportedOpenings.length,
    cutDoorCount: directDoors.length,
    entranceHitCount: directEntrances.length,
    circulationHitCount,
    directSlabCount: directSlabs.length,
    directSlabExactClipCount: directSlabs.filter(
      (entry) => entry.exactClip === true,
    ).length,
    nearSlabCount: nearSlabs.length,
    inferredSlabCount: inferredSlabs.length,
    unsupportedSlabCount: unsupportedSlabs.length,
    directRoofCount: directRoof.length,
    directRoofExactClipCount: directRoof.filter(
      (entry) => entry.exactClip === true,
    ).length,
    directRoofStructuralClipCount: directRoof.filter(
      (entry) =>
        (entry.exactClip === true &&
          ["ridge", "roof_edge", "eave", "parapet", "roof_break"].includes(
            String(entry.primitive_family || ""),
          )) ||
        ["hip", "valley"].includes(String(entry.primitive_family || "")),
    ).length,
    nearRoofCount: nearRoof.length,
    inferredRoofCount: inferredRoof.length,
    unsupportedRoofCount: unsupportedRoof.length,
    directFoundationCount: directFoundations.length,
    directFoundationExactClipCount: directFoundations.filter(
      (entry) => entry.exactClip === true,
    ).length,
    nearFoundationCount: nearFoundations.length,
    inferredFoundationCount: inferredFoundations.length,
    unsupportedFoundationCount: unsupportedFoundations.length,
    directBaseConditionCount: directBaseConditions.length,
    directBaseConditionExactClipCount: directBaseConditions.filter(
      (entry) => entry.exactClip === true,
    ).length,
    nearBaseConditionCount: nearBaseConditions.length,
    inferredBaseConditionCount: inferredBaseConditions.length,
    unsupportedBaseConditionCount: unsupportedBaseConditions.length,
    cutWallDirectTruthCount: Number(wallConstructionTruth.directCount || 0),
    cutWallContextualTruthCount: Number(
      wallConstructionTruth.contextualCount || 0,
    ),
    cutWallDerivedTruthCount: Number(wallConstructionTruth.derivedCount || 0),
    cutWallUnsupportedTruthCount: Number(
      wallConstructionTruth.unsupportedCount || 0,
    ),
    cutOpeningDirectTruthCount: openingConstructionTruth.directCount,
    cutOpeningContextualTruthCount: openingConstructionTruth.contextualCount,
    cutOpeningDerivedTruthCount: openingConstructionTruth.derivedCount,
    cutOpeningUnsupportedTruthCount: openingConstructionTruth.unsupportedCount,
    stairDirectTruthCount: Number(stairConstructionTruth.directCount || 0),
    stairContextualTruthCount: Number(
      stairConstructionTruth.contextualCount || 0,
    ),
    stairDerivedTruthCount: Number(stairConstructionTruth.derivedCount || 0),
    roofDirectTruthCount: Number(roofConstructionTruth.directCount || 0),
    roofContextualTruthCount: Number(
      roofConstructionTruth.contextualCount || 0,
    ),
    roofDerivedTruthCount: Number(roofConstructionTruth.derivedCount || 0),
    foundationDirectTruthCount: Number(
      foundationConstructionTruth.directCount || 0,
    ),
    foundationContextualTruthCount: Number(
      foundationConstructionTruth.contextualCount || 0,
    ),
    foundationDerivedTruthCount: Number(
      foundationConstructionTruth.derivedCount || 0,
    ),
    baseConditionDirectTruthCount: Number(
      baseConditionConstructionTruth.directCount || 0,
    ),
    baseConditionContextualTruthCount: Number(
      baseConditionConstructionTruth.contextualCount || 0,
    ),
    baseConditionDerivedTruthCount: Number(
      baseConditionConstructionTruth.derivedCount || 0,
    ),
    sectionProfileComplexityScore,
    sectionDraftingEvidenceScore,
    wallSectionClipQuality: normalizedWallClipQuality.quality,
    openingSectionClipQuality: openingClipQuality.quality,
    stairSectionClipQuality: stairClipQuality.quality,
    slabSectionClipQuality: slabClipQuality.quality,
    roofSectionClipQuality: roofClipQuality.quality,
    foundationSectionClipQuality: foundationClipQuality.quality,
    sectionConstructionEvidenceScore,
    sectionConstructionEvidenceQuality,
    sectionTruthModelVersion: usePhase21Truth
      ? "phase21-section-truth-model-v1"
      : usePhase20Truth
        ? "phase20-section-truth-model-v1"
        : "phase19-section-truth-model-v1",
    cutFaceConstructionTruthCount: Number(
      overallConstructionTruth.cutFaceClipCount || 0,
    ),
    cutProfileConstructionTruthCount: Number(
      overallConstructionTruth.cutProfileClipCount || 0,
    ),
    contextualProfileConstructionTruthCount: Number(
      overallConstructionTruth.contextualProfileClipCount || 0,
    ),
    derivedProfileConstructionTruthCount: Number(
      overallConstructionTruth.derivedProfileClipCount || 0,
    ),
    averageConstructionProfileContinuity: Number(
      overallConstructionTruth.averageProfileContinuity || 0,
    ),
    sectionFaceTotalCount: Number(
      intersectionBundle.sectionFaceSummary?.totalCount || 0,
    ),
    sectionFaceCutFaceCount: Number(
      intersectionBundle.sectionFaceSummary?.cutFaceCount || 0,
    ),
    sectionFaceCutProfileCount: Number(
      intersectionBundle.sectionFaceSummary?.cutProfileCount || 0,
    ),
    sectionFaceContextualCount: Number(
      intersectionBundle.sectionFaceSummary?.contextualCount || 0,
    ),
    sectionFaceDerivedCount: Number(
      intersectionBundle.sectionFaceSummary?.derivedCount || 0,
    ),
    sectionFaceTotalAreaM2: Number(
      intersectionBundle.sectionFaceSummary?.totalAreaM2 || 0,
    ),
    sectionFaceCredibilityScore: Number(
      intersectionBundle.sectionFaceSummary?.credibilityScore || 0,
    ),
    sectionFaceCredibilityQuality: String(
      intersectionBundle.sectionFaceSummary?.credibilityQuality || "blocked",
    ),
    explicitRoofPrimitiveCount: Number(
      intersectionBundle.explicitRoofPrimitiveCount || 0,
    ),
    explicitRoofEdgeCount: Number(
      intersectionBundle.explicitRoofEdgeCount || 0,
    ),
    explicitParapetCount: Number(intersectionBundle.explicitParapetCount || 0),
    explicitRoofBreakCount: Number(
      intersectionBundle.explicitRoofBreakCount || 0,
    ),
    explicitHipCount: Number(intersectionBundle.explicitHipCount || 0),
    explicitValleyCount: Number(intersectionBundle.explicitValleyCount || 0),
    explicitDormerAttachmentCount: Number(
      intersectionBundle.explicitDormerAttachmentCount || 0,
    ),
    explicitFoundationCount: Number(
      intersectionBundle.explicitFoundationCount || 0,
    ),
    explicitBaseConditionCount: Number(
      intersectionBundle.explicitBaseConditionCount || 0,
    ),
    explicitGroundRelationCount: Number(
      intersectionBundle.explicitGroundRelationCount || 0,
    ),
    foundationZoneCount: Number(intersectionBundle.foundationZoneCount || 0),
    baseWallConditionCount: Number(
      intersectionBundle.baseWallConditionCount || 0,
    ),
    roofTruthMode: intersectionBundle.roofTruthMode || "missing",
    roofTruthState: truthBucketFromMode(
      intersectionBundle.roofTruthMode || "missing",
    ),
    foundationTruthMode: intersectionBundle.foundationTruthMode || "missing",
    foundationTruthState: truthBucketFromMode(
      intersectionBundle.foundationTruthMode || "missing",
    ),
    levelCount: levelProfiles.length,
    roofCommunicated:
      directRoof.length > 0 || nearRoof.length > 0 || inferredRoof.length > 0,
    foundationCommunicated:
      directFoundations.length > 0 ||
      nearFoundations.length > 0 ||
      inferredFoundations.length > 0 ||
      directBaseConditions.length > 0 ||
      nearBaseConditions.length > 0 ||
      inferredBaseConditions.length > 0,
    geometryCommunicable:
      levelProfiles.length > 0 &&
      (directRooms.length > 0 ||
        directStairs.length > 0 ||
        directWalls.length > 0),
    geometrySupportLimited: Object.values(
      intersectionBundle.geometrySupport || {},
    ).some((supports) =>
      (supports || []).some((entry) =>
        [
          "bbox",
          "derived_level_profile",
          "derived_roof_profile",
          "missing_geometry",
        ].includes(entry),
      ),
    ),
    totalCutRoomAreaM2: round(
      directRooms.reduce((sum, room) => sum + roomArea(room), 0),
    ),
    chosenSectionRationale:
      sectionProfile.rationale?.[0] ||
      sectionProfile.strategyName ||
      sectionProfile.semanticGoal ||
      null,
  };
  summary.usefulnessScore = communicationValue;
  summary.evidenceQuality = classifySectionEvidence(summary);

  const constructionSemantics = useConstructionTruth
    ? assessSectionConstructionSemantics({
        sectionEvidence: {
          sectionIntersections: intersectionBundle,
          intersections: {
            rooms: directRooms,
            nearRooms,
            inferredRooms,
            unsupportedRooms,
            stairs: directStairs,
            nearStairs,
            inferredStairs,
            unsupportedStairs,
            walls: directWalls,
            nearWalls,
            inferredWalls,
            unsupportedWalls,
            openings: directOpenings,
            nearOpenings,
            inferredOpenings,
            unsupportedOpenings,
            slabs: directSlabs,
            nearSlabs,
            inferredSlabs,
            unsupportedSlabs,
            roofElements: directRoof,
            nearRoofElements: nearRoof,
            inferredRoofElements: inferredRoof,
            unsupportedRoofElements: unsupportedRoof,
            foundations: directFoundations,
            nearFoundations,
            inferredFoundations,
            unsupportedFoundations,
            baseConditions: directBaseConditions,
            nearBaseConditions,
            inferredBaseConditions,
            unsupportedBaseConditions,
          },
          summary,
          roofLanguage,
        },
        geometry: projectGeometry,
      })
    : null;
  if (constructionSemantics) {
    summary.sectionConstructionTruthQuality =
      constructionSemantics.constructionTruthQuality;
    summary.constructionEvidenceScore =
      constructionSemantics.constructionEvidenceScore;
    summary.cutWallTruthQuality = constructionSemantics.cutWallTruth.quality;
    summary.cutOpeningTruthQuality =
      constructionSemantics.cutOpeningTruth.quality;
    summary.stairTruthQuality = constructionSemantics.stairTruth.quality;
    summary.slabTruthQuality = constructionSemantics.slabTruth.quality;
    summary.roofTruthQuality = constructionSemantics.roofTruth.quality;
    summary.roofTruthMode = constructionSemantics.roofTruth.supportMode;
    summary.roofTruthState =
      constructionSemantics.roofTruth.truthState ||
      truthBucketFromMode(constructionSemantics.roofTruth.supportMode);
    summary.foundationTruthQuality =
      constructionSemantics.foundationTruth.quality;
    summary.foundationTruthMode =
      constructionSemantics.foundationTruth.supportMode;
    summary.foundationTruthState =
      constructionSemantics.foundationTruth.truthState ||
      truthBucketFromMode(constructionSemantics.foundationTruth.supportMode);
    summary.constructionFallbackDependence =
      constructionSemantics.fallbackDependence;
    if (
      constructionSemantics.constructionTruthQuality === "blocked" &&
      summary.evidenceQuality !== "block"
    ) {
      summary.evidenceQuality = "block";
    } else if (
      constructionSemantics.constructionTruthQuality === "weak" &&
      summary.evidenceQuality === "pass"
    ) {
      summary.evidenceQuality = "warning";
    }
  }

  const sectionTruthModel = buildSectionTruthModel({
    sectionEvidence: {
      summary,
      sectionProfile,
      sectionIntersections: intersectionBundle,
    },
    constructionSemantics,
  });
  summary.sectionTruthModelVersion = sectionTruthModel.version;
  summary.sectionContextualEvidenceScore =
    sectionTruthModel.contextualEvidenceScore;
  summary.sectionContextualEvidenceQuality =
    sectionTruthModel.contextualEvidenceQuality;
  summary.sectionDerivedEvidenceScore = sectionTruthModel.derivedEvidenceScore;
  summary.sectionDerivedEvidenceQuality =
    sectionTruthModel.derivedEvidenceQuality;
  summary.sectionDirectConstructionTruthCount =
    sectionTruthModel.overall.directCount;
  summary.sectionContextualConstructionTruthCount =
    sectionTruthModel.overall.contextualCount;
  summary.sectionDerivedConstructionTruthCount =
    sectionTruthModel.overall.derivedCount;
  summary.sectionUnsupportedConstructionTruthCount =
    sectionTruthModel.overall.unsupportedCount;

  if (usePhase19Truth) {
    const criticalConstructionClipQualities = [
      summary.wallSectionClipQuality,
      summary.slabSectionClipQuality,
    ].map((value) => String(value || "").toLowerCase());
    const supportingConstructionClipQualities = [
      summary.openingSectionClipQuality,
      summary.stairSectionClipQuality,
      summary.roofSectionClipQuality,
      summary.foundationSectionClipQuality,
    ].map((value) => String(value || "").toLowerCase());

    if (
      criticalConstructionClipQualities.some((quality) => quality === "blocked")
    ) {
      summary.sectionConstructionEvidenceQuality = "blocked";
    } else if (
      summary.sectionConstructionEvidenceQuality === "verified" &&
      (criticalConstructionClipQualities.some((quality) =>
        ["weak", "provisional"].includes(quality),
      ) ||
        supportingConstructionClipQualities.some(
          (quality) => quality === "blocked",
        ))
    ) {
      summary.sectionConstructionEvidenceQuality = "weak";
    }
  }

  if (usePhase20Truth) {
    if (sectionTruthModel.overall.directQuality === "blocked") {
      summary.sectionConstructionEvidenceQuality = "blocked";
      summary.sectionConstructionTruthQuality = "blocked";
    } else if (
      summary.sectionConstructionEvidenceQuality === "verified" &&
      (sectionTruthModel.contextualEvidenceQuality === "blocked" ||
        sectionTruthModel.derivedEvidenceQuality === "blocked")
    ) {
      summary.sectionConstructionEvidenceQuality = "weak";
    }
  }
  if (usePhase21Truth) {
    const faceCredibility =
      intersectionBundle.sectionFaceSummary?.credibilityQuality || "blocked";
    const hasCutFaceEvidence =
      Number(summary.cutFaceConstructionTruthCount || 0) > 0 ||
      Number(summary.sectionFaceCutFaceCount || 0) > 0;
    if (faceCredibility === "blocked" && !hasCutFaceEvidence) {
      if (summary.sectionConstructionEvidenceQuality === "verified") {
        summary.sectionConstructionEvidenceQuality = "weak";
      }
    }
    if (
      summary.sectionConstructionEvidenceQuality === "verified" &&
      faceCredibility === "weak" &&
      !hasCutFaceEvidence
    ) {
      summary.sectionConstructionEvidenceQuality = "weak";
    }
    summary.sectionCutFaceTruthAvailable = hasCutFaceEvidence;
  }

  const blockers = [];
  const warnings = [];

  if (!levelProfiles.length) {
    blockers.push(
      `Section ${sectionType} cannot communicate levels because no canonical levels were resolved.`,
    );
  }
  if (summary.directEvidenceQuality === "blocked") {
    blockers.push(
      `Section ${sectionType} lacks sufficient direct cut truth; the cut does not clip enough canonical room, stair, wall, or opening geometry.`,
    );
  }
  if (
    summary.geometryCommunicable === false &&
    summary.cutRoomCount === 0 &&
    summary.cutStairCount === 0
  ) {
    blockers.push(
      `Section ${sectionType} does not cut a named room or stair/core element in a meaningful way and should not be treated as credible final technical output.`,
    );
  }
  if (summary.inferredEvidenceQuality === "blocked") {
    blockers.push(
      `Section ${sectionType} relies too heavily on inferred or approximate evidence for final technical credibility.`,
    );
  } else if (summary.inferredEvidenceQuality === "weak") {
    warnings.push(
      `Section ${sectionType} still depends partly on inferred or approximate evidence.`,
    );
  }
  if (summary.cutWallCount === 0) {
    warnings.push(
      `Section ${sectionType} does not resolve a direct wall clip; wall emphasis remains contextual.`,
    );
  }
  if (summary.cutOpeningCount === 0 && summary.nearOpeningCount > 0) {
    warnings.push(
      `Section ${sectionType} only has near-cut opening evidence, so facade-depth communication remains contextual.`,
    );
  }
  if (summary.approximateEvidenceCount > 0) {
    warnings.push(
      `Section ${sectionType} still contains ${summary.approximateEvidenceCount} approximate evidence fragment(s) from bbox or derived geometry.`,
    );
  }
  if (!focusHits.length && (sectionProfile.focusEntityIds || []).length) {
    warnings.push(
      `Section ${sectionType} missed the main focused semantic anchors for the chosen strategy.`,
    );
  }
  if (constructionSemantics) {
    blockers.push(...(constructionSemantics.blockers || []));
    warnings.push(...(constructionSemantics.warnings || []));
    if (summary.cutWallTruthQuality === "weak") {
      warnings.push(
        `Section ${sectionType} resolves wall truth, but cut-wall construction depth is still thinner than preferred.`,
      );
    }
    if (summary.slabTruthQuality === "blocked") {
      blockers.push(
        `Section ${sectionType} cannot clearly communicate slab/floor construction from canonical cut truth.`,
      );
    }
    if (summary.foundationTruthQuality === "blocked") {
      warnings.push(
        `Section ${sectionType} foundation communication still depends on derived or contextual truth.`,
      );
    } else if (summary.foundationTruthQuality === "weak") {
      warnings.push(
        `Section ${sectionType} resolves some explicit ground condition, but foundation/base-condition truth is still thinner than preferred.`,
      );
    }
    if (summary.roofTruthQuality === "blocked") {
      warnings.push(
        `Section ${sectionType} roof communication still depends on profile-derived or contextual truth.`,
      );
    }
  }

  return {
    version: usePhase20Truth
      ? "phase20-section-evidence-service-v1"
      : usePhase19Truth
        ? "phase19-section-evidence-service-v1"
        : usePhase18Truth
          ? "phase18-section-evidence-service-v1"
          : usePhase17Truth
            ? "phase17-section-evidence-service-v1"
            : usePhase15Truth
              ? "phase15-section-evidence-service-v1"
              : useTrueEvidence
                ? useConstructionTruth
                  ? "phase14-section-evidence-service-v1"
                  : "phase13-section-evidence-service-v1"
                : "phase10-section-evidence-service-v1",
    sectionType,
    cutCoordinate: round(cutCoordinate),
    cutAxis: axis,
    sectionIntersections: intersectionBundle,
    intersections: {
      rooms: directRooms,
      nearRooms,
      inferredRooms,
      unsupportedRooms,
      stairs: directStairs,
      nearStairs,
      inferredStairs,
      unsupportedStairs,
      walls: directWalls,
      nearWalls,
      inferredWalls,
      unsupportedWalls,
      windows: directWindows,
      nearWindows,
      inferredWindows,
      unsupportedWindows,
      doors: directDoors,
      nearDoors,
      inferredDoors,
      unsupportedDoors,
      openings: directOpenings,
      nearOpenings,
      inferredOpenings,
      unsupportedOpenings,
      entrances: directEntrances,
      nearEntrances,
      inferredEntrances: entrances.inferred || [],
      unsupportedEntrances,
      slabs: directSlabs,
      nearSlabs,
      inferredSlabs,
      unsupportedSlabs,
      roofElements: directRoof,
      nearRoofElements: nearRoof,
      inferredRoofElements: inferredRoof,
      unsupportedRoofElements: unsupportedRoof,
      foundations: directFoundations,
      nearFoundations,
      inferredFoundations,
      unsupportedFoundations,
      baseConditions: directBaseConditions,
      nearBaseConditions,
      inferredBaseConditions,
      unsupportedBaseConditions,
    },
    levelProfiles,
    roofLanguage,
    focusHits,
    circulationHitCount,
    sectionConstructionSemantics: constructionSemantics,
    sectionTruthModel,
    blockers: unique(blockers),
    warnings: unique(warnings),
    rationale: [
      ...explainSectionEvidence(summary, sectionProfile),
      ...(constructionSemantics
        ? [
            `Construction truth ${summary.sectionConstructionTruthQuality}; wall ${summary.cutWallTruthQuality}, opening ${summary.cutOpeningTruthQuality}, stair ${summary.stairTruthQuality}, slab ${summary.slabTruthQuality}, roof ${summary.roofTruthQuality}, foundation ${summary.foundationTruthQuality}.`,
          ]
        : []),
    ],
    summary,
  };
}

export { resolveSectionCutCoordinate, sectionAxis };

export default {
  buildSectionEvidence,
  buildSectionEvidenceSummary,
  summarizeSectionEvidence,
  scoreSectionEvidence,
  classifySectionEvidence,
  explainSectionEvidence,
  resolveSectionCutCoordinate,
  sectionAxis,
};
