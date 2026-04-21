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

  const score = round(
    Math.min(1, exactDirect * 0.34) +
      Math.min(0.3, directCount * 0.12) +
      Math.min(0.18, directTruthCount * 0.06) +
      Math.min(0.14, nearCount * 0.05) +
      Math.min(0.08, contextualTruthCount * 0.03) +
      (levelCount > 1 ? 0.08 : 0.03) -
      Math.min(0.08, derivedTruthCount * 0.025) -
      Math.min(0.22, inferredCount * 0.06) -
      Math.min(0.18, unsupportedCount * 0.07) -
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
  };
}

export default {
  assessSectionSlabTruth,
};
