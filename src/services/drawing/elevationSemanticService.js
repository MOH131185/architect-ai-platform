function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function round(value, precision = 3) {
  const factor = 10 ** precision;
  return Math.round(Number(value || 0) * factor) / factor;
}

export function assessElevationSemantics(sideFacade = {}, palette = null) {
  const openingCount = Number(sideFacade.projectedOpenings?.length || 0);
  const doorCount = Number(sideFacade.projectedDoors?.length || 0);
  const featureCount = Number(sideFacade.features?.length || 0);
  const rhythmCount = Number(sideFacade.rhythmCount || 0);
  const materialZoneCount = Number(sideFacade.materialZones?.length || 0);
  const explicitCoverageRatio = Number(sideFacade.explicitCoverageRatio || 0);
  const explicitGeometryScore =
    sideFacade.geometrySource === "explicit_side_walls"
      ? clamp(0.72 + explicitCoverageRatio * 0.28, 0, 1)
      : clamp(0.34 + explicitCoverageRatio * 0.22, 0, 0.72);
  const articulationScore = clamp(
    (materialZoneCount ? 0.26 : 0.06) +
      (rhythmCount ? Math.min(0.22, rhythmCount * 0.06) : 0) +
      (featureCount ? Math.min(0.2, featureCount * 0.06) : 0),
    0,
    1,
  );
  const openingScore = clamp(
    (openingCount ? Math.min(0.68, openingCount * 0.12) : 0.08) +
      (doorCount > 0 ? 0.12 : 0),
    0,
    1,
  );
  const materialIdentityScore = clamp(
    palette?.primary?.hexColor ? 0.62 : 0.3 + (materialZoneCount ? 0.14 : 0),
    0,
    1,
  );
  const readabilityScore = clamp(
    explicitGeometryScore * 0.34 +
      articulationScore * 0.22 +
      openingScore * 0.24 +
      materialIdentityScore * 0.2,
    0,
    1,
  );

  const warnings = [];
  const blockers = [...(sideFacade.blockingReasons || [])];

  if (sideFacade.geometrySource === "envelope_derived") {
    warnings.push(
      `Elevation ${sideFacade.side} relies on envelope-derived width because no explicit side wall set was resolved.`,
    );
  }
  if (openingCount === 0) {
    warnings.push(
      `Elevation ${sideFacade.side} has no projected openings; readability depends on facade grammar only.`,
    );
  }
  if (
    readabilityScore < 0.58 &&
    blockers.length === 0 &&
    sideFacade.geometrySource !== "explicit_side_walls"
  ) {
    blockers.push(
      `Elevation ${sideFacade.side} semantic readability ${round(readabilityScore)} is too weak for a credible A1 technical panel.`,
    );
  } else if (readabilityScore < 0.7) {
    warnings.push(
      `Elevation ${sideFacade.side} semantic readability ${round(readabilityScore)} is below the preferred Phase 9 richness threshold.`,
    );
  }

  return {
    version: "phase9-elevation-semantic-service-v1",
    side: sideFacade.side || null,
    status: blockers.length ? "block" : warnings.length ? "warning" : "pass",
    warnings: [...new Set(warnings)],
    blockers: [...new Set(blockers)],
    scores: {
      explicitGeometry: round(explicitGeometryScore),
      articulation: round(articulationScore),
      openingReadability: round(openingScore),
      materialIdentity: round(materialIdentityScore),
      readability: round(readabilityScore),
    },
  };
}

export default {
  assessElevationSemantics,
};
