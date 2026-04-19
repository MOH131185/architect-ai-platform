function round(value, precision = 3) {
  const factor = 10 ** precision;
  return Math.round(Number(value || 0) * factor) / factor;
}

export function deriveSectionSemantics(
  projectGeometry = {},
  sectionProfile = {},
) {
  const stairs = projectGeometry.stairs || [];
  const levels = projectGeometry.levels || [];
  const openings = projectGeometry.windows || [];
  const walls = projectGeometry.walls || [];
  const rooms = projectGeometry.rooms || [];
  const focusEntityIds = sectionProfile.focusEntityIds || [];
  const candidateScore = Number(sectionProfile.score || 0.55);
  const hasFocusedStair = focusEntityIds.some((entry) =>
    String(entry).startsWith("entity:stair:"),
  );
  const focusedRoomCount = focusEntityIds.filter((entry) =>
    String(entry).startsWith("entity:room:"),
  ).length;

  const verticalCirculationScore = hasFocusedStair
    ? 1
    : stairs.length > 0
      ? 0.7
      : 0.35;
  const floorHeightsScore = levels.length > 1 ? 1 : 0.6;
  const openingRelationshipScore =
    openings.length > 0
      ? Math.max(0.6, Math.min(1, candidateScore + 0.15))
      : 0.45;
  const wallRelationshipScore =
    walls.length > 0
      ? Math.max(0.58, Math.min(0.92, candidateScore + 0.12))
      : 0.4;
  const roomCommunicationScore =
    focusedRoomCount > 1
      ? 0.88
      : focusedRoomCount > 0
        ? 0.72
        : rooms.length > 0
          ? 0.52
          : 0.28;
  const volumetricScore = Math.max(
    levels.length > 1 ? 0.7 : 0.58,
    Math.min(0.96, candidateScore + 0.18),
  );
  const usefulnessScore = round(
    verticalCirculationScore * 0.25 +
      floorHeightsScore * 0.2 +
      openingRelationshipScore * 0.2 +
      wallRelationshipScore * 0.12 +
      roomCommunicationScore * 0.08 +
      volumetricScore * 0.15,
  );

  return {
    version: "phase8-section-semantic-service-v1",
    sectionId: sectionProfile.id || null,
    focusEntityIds,
    communicates: {
      verticalCirculation: hasFocusedStair || stairs.length > 0,
      floorHeights: levels.length > 0,
      wallOpeningRelationships: openings.length > 0 && walls.length > 0,
      roomHierarchy: focusedRoomCount > 0,
      volumetricLogic: true,
    },
    scores: {
      verticalCirculation: round(verticalCirculationScore),
      floorHeights: round(floorHeightsScore),
      openingRelationships: round(openingRelationshipScore),
      wallRelationships: round(wallRelationshipScore),
      roomHierarchy: round(roomCommunicationScore),
      volumetricLogic: round(volumetricScore),
      usefulness: usefulnessScore,
    },
    rationale: [
      hasFocusedStair
        ? "Section captures stair/core relationships with an explicit focused cut."
        : stairs.length
          ? "Section includes vertical circulation, but the cut is not stair-focused."
          : "Section does not include a dedicated stair focus.",
      openings.length
        ? "Section can communicate key opening-to-wall relationships."
        : "Opening relationships remain limited because no window data was resolved.",
      focusedRoomCount
        ? `Section target includes ${focusedRoomCount} named room focus area(s).`
        : "Section target does not include an explicit room focus area.",
    ],
  };
}

export default {
  deriveSectionSemantics,
};
