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

function wallTruth(summary = {}) {
  const cutWallCount = Number(summary.cutWallCount || 0);
  const exactWallClipCount = Number(
    summary.cutWallExactClipCount || summary.cutWallCount || 0,
  );
  const unsupportedWallCount = Number(summary.unsupportedWallCount || 0);
  const inferredWallCount = Number(summary.inferredWallCount || 0);
  const exactWallBonus =
    cutWallCount > 1 && exactWallClipCount >= 2
      ? 0.12
      : cutWallCount > 0 && exactWallClipCount >= 1
        ? 0.06
        : 0;
  const inexactDirectPenalty =
    cutWallCount > 0 && exactWallClipCount === 0 ? 0.12 : 0;
  const score = round(
    Math.min(1, cutWallCount * 0.34) +
      Math.min(0.36, exactWallClipCount * 0.16) +
      exactWallBonus -
      inexactDirectPenalty -
      Math.min(0.12, inferredWallCount * 0.025) -
      Math.min(0.18, unsupportedWallCount * 0.05),
  );
  return {
    score,
    quality: classifyQuality(score),
    exactClipCount: exactWallClipCount,
  };
}

function openingTruth(summary = {}, cutWallQuality = "blocked") {
  const cutOpeningCount = Number(summary.cutOpeningCount || 0);
  const exactOpeningClipCount = Number(
    summary.cutOpeningExactClipCount || summary.cutOpeningCount || 0,
  );
  const nearOpeningCount = Number(summary.nearOpeningCount || 0);
  const inferredOpeningCount = Number(summary.inferredOpeningCount || 0);
  const wallSupportBonus =
    cutWallQuality === "verified" ? 0.2 : cutWallQuality === "weak" ? 0.1 : 0;
  const inexactOpeningPenalty =
    cutOpeningCount > 0 && exactOpeningClipCount === 0 ? 0.1 : 0;
  const score = round(
    Math.min(1, cutOpeningCount * 0.16) +
      Math.min(0.36, exactOpeningClipCount * 0.18) +
      Math.min(0.12, nearOpeningCount * 0.04) +
      wallSupportBonus -
      inexactOpeningPenalty -
      Math.min(0.12, inferredOpeningCount * 0.03),
  );
  return {
    score,
    quality: classifyQuality(score),
    exactClipCount: exactOpeningClipCount,
  };
}

function stairConstructionTruth(summary = {}) {
  const cutStairCount = Number(summary.cutStairCount || 0);
  const nearStairCount = Number(summary.nearStairCount || 0);
  const inferredStairCount = Number(summary.inferredStairCount || 0);
  const score = round(
    Math.min(1, cutStairCount * 0.76) +
      Math.min(0.14, nearStairCount * 0.06) -
      Math.min(0.18, inferredStairCount * 0.08),
  );
  return {
    score,
    quality: classifyQuality(score),
  };
}

export function assessSectionConstructionSemantics({
  sectionEvidence = {},
  geometry = {},
} = {}) {
  const summary = sectionEvidence.summary || {};
  const cutWallTruth = wallTruth(summary);
  const cutOpeningTruth = openingTruth(summary, cutWallTruth.quality);
  const stairTruth = stairConstructionTruth(summary);
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
    cutWallTruth.score * 0.25 +
      cutOpeningTruth.score * 0.2 +
      stairTruth.score * 0.18 +
      slabTruth.score * 0.16 +
      roofTruth.score * 0.1 +
      foundationTruth.score * 0.11 -
      fallbackDependence * 0.06,
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
    version:
      roofTruth.hipCount ||
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
    blockers,
    warnings,
  };
}

export default {
  assessSectionConstructionSemantics,
};
