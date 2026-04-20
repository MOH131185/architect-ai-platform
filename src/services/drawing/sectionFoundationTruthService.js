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
  const directFoundations = sectionEvidence.intersections?.foundations || [];
  const nearFoundations = sectionEvidence.intersections?.nearFoundations || [];
  const inferredFoundations =
    sectionEvidence.intersections?.inferredFoundations || [];
  const unsupportedFoundations =
    sectionEvidence.intersections?.unsupportedFoundations || [];
  const directBaseConditions =
    sectionEvidence.intersections?.baseConditions || [];
  const nearBaseConditions =
    sectionEvidence.intersections?.nearBaseConditions || [];
  const inferredBaseConditions =
    sectionEvidence.intersections?.inferredBaseConditions || [];
  const unsupportedBaseConditions =
    sectionEvidence.intersections?.unsupportedBaseConditions || [];
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
  const explicitBaseConditionEntities = Number(
    (geometry.base_conditions || []).length || 0,
  );
  const exactFoundationDirect = directFoundations.filter(
    (entry) => entry.exactClip === true,
  ).length;
  const exactBaseConditionDirect = directBaseConditions.filter(
    (entry) => entry.exactClip === true,
  ).length;
  const derivedOnly =
    explicitFoundationEntities === 0 &&
    explicitBaseConditionEntities === 0 &&
    directWallCount === 0 &&
    directSlabCount === 0 &&
    (nearWallCount > 0 || nearSlabCount > 0);

  const score = round(
    Math.min(0.34, exactFoundationDirect * 0.18) +
      Math.min(0.18, directFoundations.length * 0.08) +
      Math.min(0.18, exactBaseConditionDirect * 0.12) +
      Math.min(0.12, directBaseConditions.length * 0.06) +
      (directWallCount > 0 ? 0.32 : 0) +
      (directSlabCount > 0 ? 0.24 : 0) +
      (nearWallCount > 0 ? 0.08 : 0) +
      (nearSlabCount > 0 ? 0.08 : 0) +
      (nearFoundations.length > 0 ? 0.07 : 0) +
      (nearBaseConditions.length > 0 ? 0.05 : 0) +
      (levelCount > 0 ? 0.08 : 0) +
      (explicitFoundationEntities > 0 ? 0.2 : 0) -
      Math.min(
        0.18,
        inferredWallCount * 0.03 +
          inferredSlabCount * 0.03 +
          inferredFoundations.length * 0.025 +
          inferredBaseConditions.length * 0.02,
      ) -
      Math.min(
        0.2,
        unsupportedWallCount * 0.05 +
          unsupportedSlabCount * 0.05 +
          unsupportedFoundations.length * 0.04 +
          unsupportedBaseConditions.length * 0.03,
      ) -
      (derivedOnly ? 0.06 : 0),
  );

  return {
    score,
    quality: classifyQuality(score),
    exactFoundationDirect,
    exactBaseConditionDirect,
    directFoundationCount: directFoundations.length,
    directBaseConditionCount: directBaseConditions.length,
    nearFoundationCount: nearFoundations.length,
    nearBaseConditionCount: nearBaseConditions.length,
    inferredFoundationCount: inferredFoundations.length,
    inferredBaseConditionCount: inferredBaseConditions.length,
    unsupportedFoundationCount: unsupportedFoundations.length,
    unsupportedBaseConditionCount: unsupportedBaseConditions.length,
    directWallCount,
    directSlabCount,
    nearWallCount,
    nearSlabCount,
    inferredWallCount,
    inferredSlabCount,
    unsupportedWallCount,
    unsupportedSlabCount,
    explicitFoundationEntities,
    explicitBaseConditionEntities,
    derivedOnly,
  };
}

export default {
  assessSectionFoundationTruth,
};
