import { isFeatureEnabled } from "../../config/featureFlags.js";

function round(value, precision = 3) {
  const factor = 10 ** precision;
  return Math.round(Number(value || 0) * factor) / factor;
}

function classifyQuality(score = 0) {
  const resolved = Number(score || 0);
  if (resolved >= 0.74) return "verified";
  if (resolved >= 0.42) return "weak";
  return "blocked";
}

function phase21TruthEnabled() {
  return (
    isFeatureEnabled("useTrueGeometricSectioningPhase21") ||
    isFeatureEnabled("useCentralizedSectionTruthModelPhase21") ||
    isFeatureEnabled("useConstructionTruthDrivenSectionRankingPhase21")
  );
}

export function assessSectionSlabTruth(sectionEvidence = {}, geometry = {}) {
  const summary = sectionEvidence.summary || {};
  const exactDirect = (sectionEvidence.intersections?.slabs || []).filter(
    (entry) => entry.exactClip === true,
  ).length;
  const directCount = Number(summary.directSlabCount || 0);
  const nearCount = Number(summary.nearSlabCount || 0);
  const inferredCount = Number(summary.inferredSlabCount || 0);
  const unsupportedCount = Number(summary.unsupportedSlabCount || 0);
  const directTruthCount = Number(summary.directSlabCount || 0);
  const contextualTruthCount = Number(summary.nearSlabCount || 0);
  const derivedTruthCount = Number(summary.inferredSlabCount || 0);
  const derivedOnly = (
    sectionEvidence.sectionIntersections?.geometrySupport?.slabs || []
  ).every((entry) =>
    ["derived_level_profile", "bbox", "missing_geometry"].includes(
      String(entry),
    ),
  );
  const levelCount = Number(
    summary.levelCount || (geometry.levels || []).length || 0,
  );
  const phase21 = phase21TruthEnabled();
  const faceBundle = sectionEvidence.sectionFaceBundle || null;
  const slabFaces = faceBundle?.perKind?.slabs || null;
  const cutFaceCount = phase21 ? Number(slabFaces?.cutFaceCount || 0) : 0;
  const cutProfileCount = phase21 ? Number(slabFaces?.cutProfileCount || 0) : 0;
  const contextualFaceCount = phase21
    ? Number(slabFaces?.contextualCount || 0)
    : 0;
  const derivedFaceCount = phase21 ? Number(slabFaces?.derivedCount || 0) : 0;

  const score = round(
    Math.min(1, exactDirect * 0.34) +
      Math.min(0.3, directCount * 0.12) +
      Math.min(0.18, directTruthCount * 0.06) +
      Math.min(0.14, nearCount * 0.05) +
      Math.min(0.08, contextualTruthCount * 0.03) +
      (levelCount > 1 ? 0.08 : 0.03) +
      (phase21 ? Math.min(0.2, cutFaceCount * 0.08) : 0) +
      (phase21 ? Math.min(0.1, cutProfileCount * 0.04) : 0) -
      Math.min(0.08, derivedTruthCount * 0.025) -
      Math.min(0.22, inferredCount * 0.06) -
      Math.min(0.18, unsupportedCount * 0.07) -
      (phase21 ? Math.min(0.08, derivedFaceCount * 0.03) : 0) -
      (derivedOnly ? 0.12 : 0),
  );

  return {
    score,
    quality: classifyQuality(score),
    exactDirectCount: exactDirect,
    directCount,
    nearCount,
    inferredCount,
    directTruthCount,
    contextualTruthCount,
    derivedTruthCount,
    unsupportedCount,
    derivedOnly,
    cutFaceCount,
    cutProfileCount,
    contextualFaceCount,
    derivedFaceCount,
    phase21,
  };
}

export default {
  assessSectionSlabTruth,
};
