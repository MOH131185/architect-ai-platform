import { isFeatureEnabled } from "../../config/featureFlags.js";
import { truthBucketFromMode } from "./constructionTruthModel.js";

function round(value, precision = 3) {
  const factor = 10 ** precision;
  return Math.round(Number(value || 0) * factor) / factor;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function truthQuality(score = 0, { strong = 0.72, weak = 0.42 } = {}) {
  const resolved = Number(score || 0);
  if (resolved >= strong) return "verified";
  if (resolved >= weak) return "weak";
  return "blocked";
}

function burdenQuality(score = 0) {
  const resolved = Number(score || 0);
  if (resolved <= 0.22) return "verified";
  if (resolved <= 0.5) return "weak";
  return "blocked";
}

function count(summary = {}, field) {
  return Number(summary?.[field] || 0);
}

function buildNode({
  summary = {},
  quality = "provisional",
  score = 0,
  supportMode = "missing",
  truthState = null,
  directField = null,
  contextualField = null,
  derivedField = null,
  unsupportedField = null,
  exactClipField = null,
  exactProfileField = null,
  profileSegmentField = null,
  directProfileHitField = null,
  directFallbackField = null,
  contextualFallbackField = null,
  derivedFallbackField = null,
  unsupportedFallbackField = null,
  exactClipFallbackField = null,
} = {}) {
  const directCount = directField
    ? count(summary, directField)
    : count(summary, directFallbackField);
  const contextualCount = contextualField
    ? count(summary, contextualField)
    : count(summary, contextualFallbackField);
  const derivedCount = derivedField
    ? count(summary, derivedField)
    : count(summary, derivedFallbackField);
  const unsupportedCount = unsupportedField
    ? count(summary, unsupportedField)
    : count(summary, unsupportedFallbackField);
  const exactClipCount = exactClipField
    ? count(summary, exactClipField)
    : count(summary, exactClipFallbackField);
  const exactProfileClipCount = exactProfileField
    ? count(summary, exactProfileField)
    : 0;
  const profileSegmentCount = profileSegmentField
    ? count(summary, profileSegmentField)
    : 0;
  const directProfileHitCount = directProfileHitField
    ? count(summary, directProfileHitField)
    : 0;
  const totalCount =
    directCount + contextualCount + derivedCount + unsupportedCount;
  const directScore = clamp(
    directCount * 0.16 +
      exactClipCount * 0.18 +
      exactProfileClipCount * 0.12 +
      directProfileHitCount * 0.09 +
      profileSegmentCount * 0.025,
    0,
    1,
  );
  const contextualRelianceScore = clamp(
    contextualCount * 0.14 +
      derivedCount * 0.18 +
      unsupportedCount * 0.24 -
      exactClipCount * 0.04,
    0,
    1,
  );

  return {
    quality,
    score: round(score),
    supportMode,
    truthState: truthState || truthBucketFromMode(supportMode),
    totalCount,
    directCount,
    contextualCount,
    derivedCount,
    unsupportedCount,
    exactClipCount,
    exactProfileClipCount,
    profileSegmentCount,
    directProfileHitCount,
    directScore: round(directScore),
    directQuality: truthQuality(directScore),
    contextualRelianceScore: round(contextualRelianceScore),
    contextualQuality: burdenQuality(contextualRelianceScore),
    derivedQuality: burdenQuality(
      clamp(derivedCount * 0.22 + unsupportedCount * 0.28, 0, 1),
    ),
  };
}

function buildOverallNode(summary = {}, constructionSemantics = null) {
  const evidenceScore = Number(
    constructionSemantics?.constructionEvidenceScore ||
      summary.sectionConstructionEvidenceScore ||
      0,
  );
  const supportMode =
    count(summary, "explicitRoofPrimitiveCount") > 0 ||
    count(summary, "explicitFoundationCount") > 0 ||
    count(summary, "explicitBaseConditionCount") > 0
      ? "explicit_generated"
      : summary.foundationTruthMode !== "missing"
        ? summary.foundationTruthMode
        : summary.roofTruthMode || "missing";
  const overallNode = buildNode({
    summary,
    quality:
      summary.sectionConstructionTruthQuality ||
      summary.sectionConstructionEvidenceQuality ||
      "provisional",
    score: evidenceScore,
    supportMode,
    truthState: truthBucketFromMode(supportMode),
    directFallbackField: "directConstructionTruthCount",
    contextualFallbackField: "contextualConstructionTruthCount",
    derivedFallbackField: "derivedConstructionTruthCount",
    unsupportedFallbackField: "unsupportedConstructionTruthCount",
    exactClipFallbackField: "exactConstructionClipCount",
    exactProfileField: "exactConstructionProfileClipCount",
    profileSegmentField: "constructionProfileSegmentCount",
    directProfileHitField: "directConstructionProfileHitCount",
  });
  const phase20TruthEnabled =
    isFeatureEnabled("useNearBooleanSectioningPhase20") ||
    isFeatureEnabled("useCentralizedSectionTruthModelPhase20") ||
    isFeatureEnabled("useDraftingGradeSectionGraphicsPhase20") ||
    isFeatureEnabled("useConstructionTruthDrivenSectionRankingPhase20") ||
    isFeatureEnabled("useSectionConstructionCredibilityGatePhase20");
  if (!phase20TruthEnabled) {
    return overallNode;
  }

  const bandCoverageRatio = clamp(
    Number(summary.averageConstructionBandCoverageRatio || 0),
    0,
    1,
  );
  const nearBooleanClipCount = count(
    summary,
    "nearBooleanConstructionClipCount",
  );
  const exactProfileClipCount = count(
    summary,
    "exactConstructionProfileClipCount",
  );
  const directScore = clamp(
    Number(overallNode.directScore || 0) * 0.55 +
      bandCoverageRatio * 0.2 +
      Math.min(0.16, nearBooleanClipCount * 0.08) +
      Math.min(0.12, exactProfileClipCount * 0.02),
    0,
    1,
  );

  return {
    ...overallNode,
    directScore: round(directScore),
    directQuality: truthQuality(directScore),
  };
}

function buildConstructionTruthNodes(
  summary = {},
  constructionSemantics = null,
) {
  return {
    wall: buildNode({
      summary,
      quality: constructionSemantics?.cutWallTruth?.quality || "provisional",
      score: constructionSemantics?.cutWallTruth?.score || 0,
      supportMode: "exact_cut_relationship",
      truthState: constructionSemantics?.cutWallTruth?.truthState || "direct",
      directField: "cutWallDirectTruthCount",
      contextualField: "cutWallContextualTruthCount",
      derivedField: "cutWallDerivedTruthCount",
      unsupportedField: "cutWallUnsupportedTruthCount",
      exactClipField: "cutWallExactClipCount",
    }),
    opening: buildNode({
      summary,
      quality: constructionSemantics?.cutOpeningTruth?.quality || "provisional",
      score: constructionSemantics?.cutOpeningTruth?.score || 0,
      supportMode: "opening_cut_relationship",
      truthState:
        constructionSemantics?.cutOpeningTruth?.truthState || "direct",
      directField: "cutOpeningDirectTruthCount",
      contextualField: "cutOpeningContextualTruthCount",
      derivedField: "cutOpeningDerivedTruthCount",
      unsupportedField: "cutOpeningUnsupportedTruthCount",
      exactClipField: "cutOpeningExactClipCount",
    }),
    stair: buildNode({
      summary,
      quality: constructionSemantics?.stairTruth?.quality || "provisional",
      score: constructionSemantics?.stairTruth?.score || 0,
      supportMode: "stair_cut_relationship",
      truthState: constructionSemantics?.stairTruth?.truthState || "direct",
      directField: "stairDirectTruthCount",
      contextualField: "stairContextualTruthCount",
      derivedField: "stairDerivedTruthCount",
      exactClipFallbackField: "cutStairCount",
    }),
    slab: buildNode({
      summary,
      quality: constructionSemantics?.slabTruth?.quality || "provisional",
      score: constructionSemantics?.slabTruth?.score || 0,
      supportMode: "slab_cut_relationship",
      truthState: constructionSemantics?.slabTruth?.truthState || "direct",
      directFallbackField: "directSlabCount",
      contextualFallbackField: "nearSlabCount",
      derivedFallbackField: "inferredSlabCount",
      unsupportedFallbackField: "unsupportedSlabCount",
      exactClipFallbackField: "directSlabExactClipCount",
    }),
    roof: buildNode({
      summary,
      quality: constructionSemantics?.roofTruth?.quality || "provisional",
      score: constructionSemantics?.roofTruth?.score || 0,
      supportMode:
        constructionSemantics?.roofTruth?.supportMode ||
        summary.roofTruthMode ||
        "missing",
      truthState:
        constructionSemantics?.roofTruth?.truthState ||
        truthBucketFromMode(summary.roofTruthMode || "missing"),
      directFallbackField: "roofDirectTruthCount",
      contextualFallbackField: "roofContextualTruthCount",
      derivedFallbackField: "roofDerivedTruthCount",
      unsupportedFallbackField: "unsupportedRoofCount",
      exactClipFallbackField: "directRoofExactClipCount",
    }),
    foundation: buildNode({
      summary,
      quality: constructionSemantics?.foundationTruth?.quality || "provisional",
      score: constructionSemantics?.foundationTruth?.score || 0,
      supportMode:
        constructionSemantics?.foundationTruth?.supportMode ||
        summary.foundationTruthMode ||
        "missing",
      truthState:
        constructionSemantics?.foundationTruth?.truthState ||
        truthBucketFromMode(summary.foundationTruthMode || "missing"),
      directFallbackField: "foundationDirectTruthCount",
      contextualFallbackField: "foundationContextualTruthCount",
      derivedFallbackField: "foundationDerivedTruthCount",
      unsupportedFallbackField: "unsupportedFoundationCount",
      exactClipFallbackField: "directFoundationExactClipCount",
    }),
    baseCondition: buildNode({
      summary,
      quality: constructionSemantics?.foundationTruth?.quality || "provisional",
      score:
        Number(constructionSemantics?.foundationTruth?.score || 0) *
        (count(summary, "directBaseConditionCount") > 0 ? 1 : 0.85),
      supportMode:
        constructionSemantics?.foundationTruth?.supportMode ||
        summary.foundationTruthMode ||
        "missing",
      truthState:
        constructionSemantics?.foundationTruth?.truthState ||
        truthBucketFromMode(summary.foundationTruthMode || "missing"),
      directFallbackField: "baseConditionDirectTruthCount",
      contextualFallbackField: "baseConditionContextualTruthCount",
      derivedFallbackField: "baseConditionDerivedTruthCount",
      unsupportedFallbackField: "unsupportedBaseConditionCount",
      exactClipFallbackField: "directBaseConditionExactClipCount",
    }),
  };
}

export function buildSectionTruthModel({
  sectionEvidence = {},
  constructionSemantics = null,
} = {}) {
  const summary = sectionEvidence?.summary || {};
  const nodes = buildConstructionTruthNodes(summary, constructionSemantics);
  const overall = buildOverallNode(summary, constructionSemantics);
  const contextualEvidenceScore = clamp(
    overall.contextualCount * 0.16 +
      overall.derivedCount * 0.18 +
      overall.unsupportedCount * 0.22 -
      overall.exactClipCount * 0.04,
    0,
    1,
  );
  const derivedEvidenceScore = clamp(
    overall.derivedCount * 0.22 + overall.unsupportedCount * 0.28,
    0,
    1,
  );
  const version =
    isFeatureEnabled("useNearBooleanSectioningPhase20") ||
    isFeatureEnabled("useCentralizedSectionTruthModelPhase20") ||
    isFeatureEnabled("useDraftingGradeSectionGraphicsPhase20") ||
    isFeatureEnabled("useConstructionTruthDrivenSectionRankingPhase20") ||
    isFeatureEnabled("useSectionConstructionCredibilityGatePhase20")
      ? "phase20-section-truth-model-v1"
      : "phase19-section-truth-model-v1";

  return {
    version,
    overall,
    nodes,
    directEvidenceQuality: summary.directEvidenceQuality || "provisional",
    contextualEvidenceScore: round(contextualEvidenceScore),
    contextualEvidenceQuality: burdenQuality(contextualEvidenceScore),
    derivedEvidenceScore: round(derivedEvidenceScore),
    derivedEvidenceQuality: burdenQuality(derivedEvidenceScore),
    chosenSectionRationale:
      summary.chosenSectionRationale ||
      sectionEvidence?.sectionProfile?.rationale?.[0] ||
      null,
  };
}

export default {
  buildSectionTruthModel,
};
