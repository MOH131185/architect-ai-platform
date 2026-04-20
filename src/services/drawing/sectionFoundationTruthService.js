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

function foundationSupportPenalty(mode = "missing") {
  switch (String(mode || "").toLowerCase()) {
    case "explicit_ground_primitives":
      return 0;
    case "contextual_ground_relation":
      return 0.14;
    case "derived_perimeter":
      return 0.2;
    default:
      return 0.18;
  }
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
    sectionEvidence.sectionIntersections?.explicitFoundationCount ||
      (geometry.foundations || []).length ||
      0,
  );
  const explicitBaseConditionEntities = Number(
    sectionEvidence.sectionIntersections?.explicitBaseConditionCount ||
      (geometry.base_conditions || []).length ||
      0,
  );
  const groundRelationPrimitiveCount = Number(
    sectionEvidence.sectionIntersections?.explicitGroundRelationCount ||
      geometry?.metadata?.canonical_construction_truth?.foundation
        ?.explicit_ground_relation_count ||
      0,
  );
  const exactFoundationDirect = directFoundations.filter(
    (entry) => entry.exactClip === true,
  ).length;
  const exactBaseConditionDirect = directBaseConditions.filter(
    (entry) => entry.exactClip === true,
  ).length;
  const supportMode =
    sectionEvidence.sectionIntersections?.foundationTruthMode ||
    geometry?.metadata?.canonical_construction_truth?.foundation
      ?.support_mode ||
    (explicitFoundationEntities > 0 || groundRelationPrimitiveCount > 0
      ? "explicit_ground_primitives"
      : explicitBaseConditionEntities > 0
        ? "contextual_ground_relation"
        : "missing");
  const groundLineCount = Number(
    geometry?.metadata?.canonical_construction_truth?.foundation?.condition_types?.filter(
      (entry) => entry === "ground_line",
    ).length || 0,
  );
  const plinthCount = Number(
    geometry?.metadata?.canonical_construction_truth?.foundation?.condition_types?.filter(
      (entry) => entry === "plinth_line",
    ).length || 0,
  );
  const slabGroundInterfaceCount = Number(
    geometry?.metadata?.canonical_construction_truth?.foundation?.condition_types?.filter(
      (entry) => entry === "slab_ground_interface",
    ).length || 0,
  );
  const derivedOnly =
    String(supportMode).toLowerCase() !== "explicit_ground_primitives" &&
    explicitFoundationEntities === 0 &&
    groundRelationPrimitiveCount === 0 &&
    (nearWallCount > 0 || nearSlabCount > 0);
  const siteGroundContext = Boolean(
    geometry?.site?.boundary_bbox ||
    geometry?.site?.buildable_bbox ||
    (geometry?.site?.boundary_polygon || []).length ||
    (geometry?.site?.buildable_polygon || []).length,
  );
  const legacyContextualSupport =
    String(supportMode).toLowerCase() === "missing" &&
    directWallCount > 0 &&
    directSlabCount > 0 &&
    siteGroundContext
      ? 0.12
      : 0;

  const score = round(
    Math.min(0.3, exactFoundationDirect * 0.16) +
      Math.min(0.16, directFoundations.length * 0.08) +
      Math.min(0.16, exactBaseConditionDirect * 0.1) +
      Math.min(0.12, directBaseConditions.length * 0.06) +
      Math.min(0.12, groundRelationPrimitiveCount * 0.03) +
      Math.min(0.08, groundLineCount * 0.03) +
      Math.min(0.08, plinthCount * 0.03) +
      Math.min(0.08, slabGroundInterfaceCount * 0.03) +
      (String(supportMode).toLowerCase() === "explicit_ground_primitives" &&
      exactFoundationDirect + exactBaseConditionDirect > 0
        ? 0.18
        : 0) +
      legacyContextualSupport +
      (String(supportMode).toLowerCase() === "missing" && directSlabCount > 0
        ? 0.14
        : 0) +
      (directWallCount > 0 ? 0.18 : 0) +
      (directSlabCount > 0 ? 0.14 : 0) +
      (nearWallCount > 0 ? 0.05 : 0) +
      (nearSlabCount > 0 ? 0.05 : 0) +
      (nearFoundations.length > 0 ? 0.05 : 0) +
      (nearBaseConditions.length > 0 ? 0.05 : 0) +
      (levelCount > 0 ? 0.05 : 0) -
      Math.min(
        0.18,
        inferredWallCount * 0.03 +
          inferredSlabCount * 0.03 +
          inferredFoundations.length * 0.025 +
          inferredBaseConditions.length * 0.02,
      ) -
      Math.min(
        0.22,
        unsupportedWallCount * 0.05 +
          unsupportedSlabCount * 0.05 +
          unsupportedFoundations.length * 0.04 +
          unsupportedBaseConditions.length * 0.03,
      ) -
      foundationSupportPenalty(supportMode) -
      (derivedOnly ? 0.05 : 0),
  );

  return {
    score,
    quality: classifyQuality(score),
    supportMode,
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
    groundRelationPrimitiveCount,
    groundLineCount,
    plinthCount,
    slabGroundInterfaceCount,
    derivedOnly,
    siteGroundContext,
    legacyContextualSupport,
  };
}

export default {
  assessSectionFoundationTruth,
};
