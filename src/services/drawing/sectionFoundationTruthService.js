function round(value, precision = 3) {
  const factor = 10 ** precision;
  return Math.round(Number(value || 0) * factor) / factor;
}

function classifyQuality(score = 0) {
  const resolved = Number(score || 0);
  if (resolved >= 0.68) return "verified";
  if (resolved >= 0.38) return "weak";
  return "blocked";
}

export function assessSectionFoundationTruth(
  sectionEvidence = {},
  geometry = {},
) {
  const summary = sectionEvidence.summary || {};
  const directWallCount = Number(summary.cutWallCount || 0);
  const directSlabCount = Number(summary.directSlabCount || 0);
  const nearWallCount = Number(summary.nearWallCount || 0);
  const nearSlabCount = Number(summary.nearSlabCount || 0);
  const inferredWallCount = Number(summary.inferredWallCount || 0);
  const inferredSlabCount = Number(summary.inferredSlabCount || 0);
  const unsupportedWallCount = Number(summary.unsupportedWallCount || 0);
  const unsupportedSlabCount = Number(summary.unsupportedSlabCount || 0);
  const levelCount = Number(
    summary.levelCount || (geometry.levels || []).length || 0,
  );
  const explicitFoundationEntities = Number(
    (geometry.foundations || []).length || 0,
  );
  const derivedOnly =
    explicitFoundationEntities === 0 &&
    directWallCount === 0 &&
    directSlabCount === 0 &&
    (nearWallCount > 0 || nearSlabCount > 0);

  const score = round(
    (directWallCount > 0 ? 0.32 : 0) +
      (directSlabCount > 0 ? 0.24 : 0) +
      (nearWallCount > 0 ? 0.08 : 0) +
      (nearSlabCount > 0 ? 0.08 : 0) +
      (levelCount > 0 ? 0.08 : 0) +
      (explicitFoundationEntities > 0 ? 0.2 : 0) -
      Math.min(0.12, inferredWallCount * 0.03 + inferredSlabCount * 0.03) -
      Math.min(
        0.16,
        unsupportedWallCount * 0.05 + unsupportedSlabCount * 0.05,
      ) -
      (derivedOnly ? 0.06 : 0),
  );

  return {
    score,
    quality: classifyQuality(score),
    directWallCount,
    directSlabCount,
    nearWallCount,
    nearSlabCount,
    inferredWallCount,
    inferredSlabCount,
    unsupportedWallCount,
    unsupportedSlabCount,
    explicitFoundationEntities,
    derivedOnly,
  };
}

export default {
  assessSectionFoundationTruth,
};
