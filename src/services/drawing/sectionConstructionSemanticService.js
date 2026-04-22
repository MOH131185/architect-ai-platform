import { isFeatureEnabled } from "../../config/featureFlags.js";
import { assessSectionFoundationTruth } from "./sectionFoundationTruthService.js";
import { assessSectionRoofTruth } from "./sectionRoofTruthService.js";
import { assessSectionSlabTruth } from "./sectionSlabTruthService.js";

function round(value, precision = 3) {
  const factor = 10 ** precision;
  return Math.round(Number(value || 0) * factor) / factor;
}

function classifyQuality(score = 0) {
  const resolved = Number(score || 0);
  if (resolved >= 0.62) return "verified";
  if (resolved >= 0.34) return "weak";
  return "blocked";
}

function phase21TruthEnabled() {
  return (
    isFeatureEnabled("useTrueGeometricSectioningPhase21") ||
    isFeatureEnabled("useCentralizedSectionTruthModelPhase21") ||
    isFeatureEnabled("useConstructionTruthDrivenSectionRankingPhase21")
  );
}

function faceContribution(perKind = {}) {
  const cutFaceCount = Number(perKind?.cutFaceCount || 0);
  const cutProfileCount = Number(perKind?.cutProfileCount || 0);
  const contextualCount = Number(perKind?.contextualCount || 0);
  const derivedCount = Number(perKind?.derivedCount || 0);
  return {
    cutFaceCount,
    cutProfileCount,
    contextualCount,
    derivedCount,
    bonus: round(
      Math.min(0.24, cutFaceCount * 0.1) +
        Math.min(0.12, cutProfileCount * 0.04) +
        Math.min(0.04, contextualCount * 0.015) -
        Math.min(0.06, derivedCount * 0.02),
    ),
  };
}

function wallTruth(summary = {}, faceBundle = null, phase21 = false) {
  const cutWallCount = Number(summary.cutWallCount || 0);
  const exactWallClipCount = Number(
    summary.cutWallExactClipCount || summary.cutWallCount || 0,
  );
  const directTruthCount = Number(summary.cutWallDirectTruthCount || 0);
  const contextualTruthCount = Number(summary.cutWallContextualTruthCount || 0);
  const derivedTruthCount = Number(summary.cutWallDerivedTruthCount || 0);
  const unsupportedWallCount = Number(summary.unsupportedWallCount || 0);
  const inferredWallCount = Number(summary.inferredWallCount || 0);
  const faces = phase21 ? faceContribution(faceBundle?.perKind?.walls) : null;
  const exactWallBonus =
    cutWallCount > 1 && exactWallClipCount >= 2
      ? 0.12
      : cutWallCount > 0 && exactWallClipCount >= 1
        ? 0.06
        : 0;
  const inexactDirectPenalty =
    cutWallCount > 0 && exactWallClipCount === 0 ? 0.12 : 0;
  const phase21Bonus = phase21 ? Number(faces?.bonus || 0) : 0;
  const score = round(
    Math.min(1, cutWallCount * 0.34) +
      Math.min(0.36, exactWallClipCount * 0.16) +
      Math.min(0.22, directTruthCount * 0.08) +
      Math.min(0.06, contextualTruthCount * 0.03) -
      Math.min(0.12, derivedTruthCount * 0.03) +
      exactWallBonus +
      phase21Bonus -
      inexactDirectPenalty -
      Math.min(0.12, inferredWallCount * 0.025) -
      Math.min(0.18, unsupportedWallCount * 0.05),
  );
  return {
    score,
    quality: classifyQuality(score),
    exactClipCount: exactWallClipCount,
    cutFaceCount: phase21 ? Number(faces?.cutFaceCount || 0) : 0,
    cutProfileCount: phase21 ? Number(faces?.cutProfileCount || 0) : 0,
    truthState:
      classifyQuality(score) === "verified"
        ? "direct"
        : classifyQuality(score) === "weak"
          ? "contextual"
          : "derived",
  };
}

function openingTruth(
  summary = {},
  cutWallQuality = "blocked",
  faceBundle = null,
  phase21 = false,
) {
  const cutOpeningCount = Number(summary.cutOpeningCount || 0);
  const exactOpeningClipCount = Number(
    summary.cutOpeningExactClipCount || summary.cutOpeningCount || 0,
  );
  const directTruthCount = Number(summary.cutOpeningDirectTruthCount || 0);
  const contextualTruthCount = Number(
    summary.cutOpeningContextualTruthCount || 0,
  );
  const derivedTruthCount = Number(summary.cutOpeningDerivedTruthCount || 0);
  const nearOpeningCount = Number(summary.nearOpeningCount || 0);
  const inferredOpeningCount = Number(summary.inferredOpeningCount || 0);
  const faces = phase21
    ? faceContribution(faceBundle?.perKind?.openings)
    : null;
  const wallSupportBonus =
    cutWallQuality === "verified" ? 0.2 : cutWallQuality === "weak" ? 0.1 : 0;
  const inexactOpeningPenalty =
    cutOpeningCount > 0 && exactOpeningClipCount === 0 ? 0.1 : 0;
  const phase21Bonus = phase21 ? Number(faces?.bonus || 0) : 0;
  const score = round(
    Math.min(1, cutOpeningCount * 0.16) +
      Math.min(0.36, exactOpeningClipCount * 0.18) +
      Math.min(0.18, directTruthCount * 0.08) +
      Math.min(0.12, nearOpeningCount * 0.04) +
      Math.min(0.08, contextualTruthCount * 0.03) +
      wallSupportBonus +
      phase21Bonus -
      Math.min(0.08, derivedTruthCount * 0.025) -
      inexactOpeningPenalty -
      Math.min(0.12, inferredOpeningCount * 0.03),
  );
  return {
    score,
    quality: classifyQuality(score),
    exactClipCount: exactOpeningClipCount,
    cutFaceCount: phase21 ? Number(faces?.cutFaceCount || 0) : 0,
    cutProfileCount: phase21 ? Number(faces?.cutProfileCount || 0) : 0,
    truthState:
      classifyQuality(score) === "verified"
        ? "direct"
        : classifyQuality(score) === "weak"
          ? "contextual"
          : "derived",
  };
}

function stairConstructionTruth(
  summary = {},
  faceBundle = null,
  phase21 = false,
) {
  const cutStairCount = Number(summary.cutStairCount || 0);
  const nearStairCount = Number(summary.nearStairCount || 0);
  const inferredStairCount = Number(summary.inferredStairCount || 0);
  const directTruthCount = Number(summary.stairDirectTruthCount || 0);
  const contextualTruthCount = Number(summary.stairContextualTruthCount || 0);
  const derivedTruthCount = Number(summary.stairDerivedTruthCount || 0);
  const faces = phase21 ? faceContribution(faceBundle?.perKind?.stairs) : null;
  const phase21Bonus = phase21 ? Number(faces?.bonus || 0) : 0;
  const score = round(
    Math.min(1, cutStairCount * 0.76) +
      Math.min(0.18, directTruthCount * 0.08) +
      Math.min(0.08, contextualTruthCount * 0.03) +
      Math.min(0.14, nearStairCount * 0.06) +
      phase21Bonus -
      Math.min(0.08, derivedTruthCount * 0.03) -
      Math.min(0.18, inferredStairCount * 0.08),
  );
  return {
    score,
    quality: classifyQuality(score),
    cutFaceCount: phase21 ? Number(faces?.cutFaceCount || 0) : 0,
    cutProfileCount: phase21 ? Number(faces?.cutProfileCount || 0) : 0,
    truthState:
      classifyQuality(score) === "verified"
        ? "direct"
        : classifyQuality(score) === "weak"
          ? "contextual"
          : "derived",
  };
}

export function assessSectionConstructionSemantics({
  sectionEvidence = {},
  geometry = {},
} = {}) {
  const phase20TruthModel =
    isFeatureEnabled("useNearBooleanSectioningPhase20") ||
    isFeatureEnabled("useCentralizedSectionTruthModelPhase20") ||
    isFeatureEnabled("useDraftingGradeSectionGraphicsPhase20") ||
    isFeatureEnabled("useConstructionTruthDrivenSectionRankingPhase20") ||
    isFeatureEnabled("useSectionConstructionCredibilityGatePhase20");
  const phase21TruthModel = phase21TruthEnabled();
  const summary = sectionEvidence.summary || {};
  const faceBundle = sectionEvidence.sectionFaceBundle || null;
  const faceCredibilityScore = Number(faceBundle?.credibility?.score || 0);
  const faceCredibilityQuality = faceBundle?.credibility?.quality || "blocked";
  const cutWallTruth = wallTruth(summary, faceBundle, phase21TruthModel);
  const cutOpeningTruth = openingTruth(
    summary,
    cutWallTruth.quality,
    faceBundle,
    phase21TruthModel,
  );
  const stairTruth = stairConstructionTruth(
    summary,
    faceBundle,
    phase21TruthModel,
  );
  const slabTruth = assessSectionSlabTruth(sectionEvidence, geometry);
  const roofTruth = assessSectionRoofTruth(sectionEvidence, geometry);
  const foundationTruth = assessSectionFoundationTruth(
    sectionEvidence,
    geometry,
  );
  const fallbackDependence = round(
    Math.min(
      1,
      Number(summary.approximateEvidenceCount || 0) * 0.08 +
        Number(summary.inferredEvidenceCount || 0) * 0.04,
    ),
  );
  const constructionEvidenceScore = round(
    Math.max(Number(summary.sectionConstructionEvidenceScore || 0), 0) * 0.22 +
      cutWallTruth.score * 0.21 +
      cutOpeningTruth.score * 0.2 +
      stairTruth.score * 0.18 +
      slabTruth.score * 0.16 +
      roofTruth.score * 0.1 +
      foundationTruth.score * 0.11 +
      (phase21TruthModel ? faceCredibilityScore * 0.08 : 0) -
      fallbackDependence * 0.06 -
      (phase21TruthModel && faceCredibilityQuality === "blocked"
        ? 0.08
        : phase21TruthModel && faceCredibilityQuality === "weak"
          ? 0.04
          : 0),
  );
  const constructionTruthQuality = classifyQuality(constructionEvidenceScore);

  const blockers = [];
  const warnings = [];
  if (constructionTruthQuality === "blocked") {
    blockers.push(
      "Section construction truth is too weak; cut wall, opening, stair, slab, roof, and foundation evidence do not support drafting-grade section credibility.",
    );
  } else if (constructionTruthQuality === "weak") {
    warnings.push(
      "Section construction truth remains thinner than preferred for a final board section.",
    );
  }
  if (cutWallTruth.quality === "blocked") {
    blockers.push(
      "Cut wall truth is blocked because the cut does not resolve enough canonical wall structure.",
    );
  }
  if (
    cutOpeningTruth.quality === "blocked" &&
    Number(summary.cutOpeningCount || 0) === 0
  ) {
    warnings.push(
      "Cut opening truth remains contextual because no opening is directly cut against a resolved wall.",
    );
  }
  if (
    stairTruth.quality === "blocked" &&
    Number(summary.cutStairCount || 0) === 0
  ) {
    warnings.push(
      "Stair truth remains thin because the section does not cut through a stair/core transition.",
    );
  }
  if (roofTruth.quality === "blocked") {
    warnings.push(
      `Roof construction truth remains ${String(roofTruth.supportMode || "contextual")} because explicit roof primitives are too thin at the cut.`,
    );
  } else if (roofTruth.quality === "weak") {
    warnings.push(
      `Roof construction truth is present, but it still depends partly on ${String(roofTruth.supportMode || "contextual")} support.`,
    );
  }
  if (foundationTruth.quality === "blocked") {
    warnings.push(
      `Foundation/base-condition truth remains ${String(foundationTruth.supportMode || "contextual")} because the cut does not resolve enough explicit substructure primitives.`,
    );
  } else if (foundationTruth.quality === "weak") {
    warnings.push(
      "Foundation/base-condition truth is present, but it is still thinner than preferred for final section credibility.",
    );
  }

  return {
    version: phase21TruthModel
      ? "phase21-section-construction-semantics-v1"
      : phase20TruthModel
        ? "phase20-section-construction-semantics-v1"
        : roofTruth.hipCount ||
            roofTruth.valleyCount ||
            foundationTruth.foundationZoneCount ||
            foundationTruth.baseWallConditionCount
          ? "phase17-section-construction-semantics-v1"
          : roofTruth.supportMode || foundationTruth.supportMode
            ? "phase16-section-construction-semantics-v1"
            : roofTruth.explicitRoofPrimitiveCount ||
                foundationTruth.explicitFoundationEntities ||
                foundationTruth.explicitBaseConditionEntities
              ? "phase15-section-construction-semantics-v1"
              : "phase14-section-construction-semantics-v1",
    constructionEvidenceScore,
    constructionTruthQuality,
    fallbackDependence,
    cutWallTruth,
    cutOpeningTruth,
    stairTruth,
    slabTruth,
    roofTruth,
    foundationTruth,
    faceCredibilityScore: phase21TruthModel ? round(faceCredibilityScore) : 0,
    faceCredibilityQuality: phase21TruthModel
      ? faceCredibilityQuality
      : "blocked",
    blockers,
    warnings,
  };
}

export default {
  assessSectionConstructionSemantics,
};
