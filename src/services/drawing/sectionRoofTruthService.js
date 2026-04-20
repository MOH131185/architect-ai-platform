function round(value, precision = 3) {
  const factor = 10 ** precision;
  return Math.round(Number(value || 0) * factor) / factor;
}

function classifyQuality(score = 0) {
  const resolved = Number(score || 0);
  if (resolved >= 0.7) return "verified";
  if (resolved >= 0.4) return "weak";
  return "blocked";
}

export function assessSectionRoofTruth(sectionEvidence = {}, geometry = {}) {
  const roofElements = sectionEvidence.intersections?.roofElements || [];
  const exactDirect = roofElements.filter(
    (entry) => entry.exactClip === true,
  ).length;
  const nearCount = Number(
    (sectionEvidence.intersections?.nearRoofElements || []).length,
  );
  const inferredCount = Number(
    (sectionEvidence.intersections?.inferredRoofElements || []).length,
  );
  const unsupportedCount = Number(
    (sectionEvidence.intersections?.unsupportedRoofElements || []).length,
  );
  const hasRoofLanguage = Boolean(
    geometry?.roof?.type || sectionEvidence?.roofLanguage,
  );
  const derivedOnly = (
    sectionEvidence.sectionIntersections?.geometrySupport?.roofElements || []
  ).every((entry) =>
    ["derived_roof_profile", "bbox", "missing_geometry"].includes(
      String(entry),
    ),
  );

  const score = round(
    Math.min(1, exactDirect * 0.36) +
      (hasRoofLanguage ? 0.14 : 0) +
      Math.min(0.12, nearCount * 0.05) +
      Math.min(0.08, inferredCount * 0.03) -
      Math.min(0.18, unsupportedCount * 0.08) -
      (derivedOnly ? 0.1 : 0),
  );

  return {
    score,
    quality: classifyQuality(score),
    exactDirectCount: exactDirect,
    nearCount,
    inferredCount,
    unsupportedCount,
    derivedOnly,
    hasRoofLanguage,
  };
}

export default {
  assessSectionRoofTruth,
};
