function round(value, precision = 3) {
  const factor = 10 ** precision;
  return Math.round(Number(value || 0) * factor) / factor;
}

function getBounds(projectGeometry = {}) {
  return (
    projectGeometry.site?.buildable_bbox ||
    projectGeometry.site?.boundary_bbox || {
      min_x: 0,
      min_y: 0,
      max_x: 12,
      max_y: 10,
      width: 12,
      height: 10,
    }
  );
}

function roomCenter(room = {}) {
  return {
    x: (Number(room.bbox?.min_x || 0) + Number(room.bbox?.max_x || 0)) / 2,
    y: (Number(room.bbox?.min_y || 0) + Number(room.bbox?.max_y || 0)) / 2,
  };
}

function buildLongitudinalCut(x, bounds) {
  return {
    from: { x, y: Number(bounds.min_y || 0) },
    to: { x, y: Number(bounds.max_y || bounds.height || 10) },
  };
}

function buildTransverseCut(y, bounds) {
  return {
    from: { x: Number(bounds.min_x || 0), y },
    to: { x: Number(bounds.max_x || bounds.width || 12), y },
  };
}

function createCandidate({
  id,
  title,
  strategyId,
  strategyName,
  sectionType,
  cutLine,
  rationale = [],
  focusEntityIds = [],
  expectedCommunicationValue = 0.6,
  semanticGoal = "primary_volume",
} = {}) {
  return {
    id,
    title,
    sectionType,
    cutLine,
    strategyId,
    strategyName,
    rationale,
    focusEntityIds,
    expectedCommunicationValue: round(expectedCommunicationValue),
    semanticGoal,
  };
}

export function buildSectionStrategyCandidates(
  projectGeometry = {},
  options = {},
) {
  const bounds = getBounds(projectGeometry);
  const rooms = (projectGeometry.rooms || [])
    .slice()
    .sort(
      (left, right) =>
        Number(right.actual_area || right.target_area_m2 || 0) -
        Number(left.actual_area || left.target_area_m2 || 0),
    );
  const stairs = projectGeometry.stairs || [];
  const openings = [
    ...(projectGeometry.windows || []),
    ...(projectGeometry.doors || []),
  ];
  const entrances = projectGeometry.entrances || [];
  const levels = projectGeometry.levels || [];
  const primaryRoom = rooms[0] || null;
  const secondaryRoom = rooms[1] || primaryRoom || null;
  const stair = stairs[0] || null;
  const entrance = entrances[0] || null;
  const centerX = Number(bounds.min_x || 0) + Number(bounds.width || 12) / 2;
  const centerY = Number(bounds.min_y || 0) + Number(bounds.height || 10) / 2;

  const candidates = [];

  if (stair) {
    const stairX =
      (Number(stair.bbox?.min_x || 0) + Number(stair.bbox?.max_x || 0)) / 2;
    candidates.push(
      createCandidate({
        id: "section:strategy:stair-communication",
        title: "Section - Stair Communication",
        strategyId: "stair-communication",
        strategyName: "Stair Communication",
        sectionType: "longitudinal",
        cutLine: buildLongitudinalCut(stairX || centerX, bounds),
        focusEntityIds: [`entity:stair:${stair.id || "main-stair"}`],
        rationale: [
          "Strategy targets the main stair/core so the section communicates vertical circulation first.",
          "Cut is aligned to the stair centerline rather than a generic building midpoint.",
        ],
        expectedCommunicationValue:
          0.78 + (levels.length > 1 ? 0.08 : 0) + (rooms.length > 2 ? 0.04 : 0),
        semanticGoal: "vertical_circulation",
      }),
    );
  }

  if (primaryRoom) {
    const center = roomCenter(primaryRoom);
    candidates.push(
      createCandidate({
        id: "section:strategy:volume-reveal",
        title: "Section - Volume Reveal",
        strategyId: "volume-reveal",
        strategyName: "Volume Reveal",
        sectionType:
          Number(bounds.width || 0) >= Number(bounds.height || 0)
            ? "longitudinal"
            : "transverse",
        cutLine:
          Number(bounds.width || 0) >= Number(bounds.height || 0)
            ? buildLongitudinalCut(center.x || centerX, bounds)
            : buildTransverseCut(center.y || centerY, bounds),
        focusEntityIds: [`entity:room:${primaryRoom.id}`],
        rationale: [
          `Strategy targets ${primaryRoom.name || primaryRoom.id} because it is the largest resolved room volume.`,
          levels.length > 1
            ? "Multiple levels increase the value of a volume-reveal section."
            : "Single-level geometry still benefits from a spatial reveal section.",
        ],
        expectedCommunicationValue:
          0.68 +
          (levels.length > 1 ? 0.1 : 0) +
          (Number(primaryRoom.actual_area || primaryRoom.target_area_m2 || 0) >=
          22
            ? 0.06
            : 0),
        semanticGoal: "primary_volume",
      }),
    );
  }

  if (openings.length) {
    const sideOpening = openings
      .slice()
      .sort(
        (left, right) =>
          Number((right.position_m || right.position || {}).y || 0) -
          Number((left.position_m || left.position || {}).y || 0),
      )[0];
    const openingY = Number(
      sideOpening?.position_m?.y || sideOpening?.position?.y || centerY,
    );
    candidates.push(
      createCandidate({
        id: "section:strategy:facade-depth",
        title: "Section - Facade Depth",
        strategyId: "facade-depth",
        strategyName: "Facade Depth",
        sectionType: "transverse",
        cutLine: buildTransverseCut(openingY, bounds),
        focusEntityIds: secondaryRoom
          ? [`entity:room:${secondaryRoom.id}`]
          : [],
        rationale: [
          "Strategy samples the facade depth where openings are already resolved, so the section can communicate wall-openings depth relationships.",
          "This avoids a generic center cut when facade depth is the clearer story.",
        ],
        expectedCommunicationValue:
          0.64 + Math.min(0.12, openings.length * 0.02),
        semanticGoal: "facade_depth",
      }),
    );
  }

  if (secondaryRoom || primaryRoom) {
    const room = secondaryRoom || primaryRoom;
    const center = roomCenter(room);
    candidates.push(
      createCandidate({
        id: "section:strategy:room-sequence",
        title: "Section - Room Sequence",
        strategyId: "room-sequence",
        strategyName: "Room Sequence",
        sectionType: "transverse",
        cutLine: buildTransverseCut(center.y || centerY, bounds),
        focusEntityIds: room ? [`entity:room:${room.id}`] : [],
        rationale: [
          `Strategy centers the transverse cut through ${room?.name || room?.id || "the primary room"} so at least one named space is always communicated.`,
          "This acts as the deterministic transverse fallback when stronger facade-depth or entry-to-core cues are unavailable.",
        ],
        expectedCommunicationValue:
          0.62 + (levels.length > 1 ? 0.06 : 0) + (room ? 0.04 : 0),
        semanticGoal: "room_sequence",
      }),
    );
  }

  candidates.push(
    createCandidate({
      id: "section:strategy:roof-profile",
      title: "Section - Roof Profile",
      strategyId: "roof-profile",
      strategyName: "Roof Profile",
      sectionType: "longitudinal",
      cutLine: buildLongitudinalCut(centerX, bounds),
      focusEntityIds: [],
      rationale: [
        "Strategy stays on the building centerline so the roof form and vertical stack remain legible.",
        "This acts as a deterministic fallback when stair or entry anchors are weaker than the roof story.",
      ],
      expectedCommunicationValue: 0.6 + (levels.length > 1 ? 0.06 : 0),
      semanticGoal: "roof_profile",
    }),
  );

  if (entrance && stair) {
    const entranceX = Number(
      entrance.position_m?.x || entrance.position?.x || centerX,
    );
    const stairX =
      (Number(stair.bbox?.min_x || 0) + Number(stair.bbox?.max_x || 0)) / 2;
    const cutX = round((entranceX + stairX) / 2);
    candidates.push(
      createCandidate({
        id: "section:strategy:entry-to-core",
        title: "Section - Entry To Core",
        strategyId: "entry-to-core",
        strategyName: "Entry To Core",
        sectionType: "longitudinal",
        cutLine: buildLongitudinalCut(cutX, bounds),
        focusEntityIds: [
          `entity:entrance:${entrance.id || "main-entry"}`,
          `entity:stair:${stair.id || "main-stair"}`,
        ],
        rationale: [
          "Strategy connects the arrival axis to the stair/core so the section explains how the building is entered and organized.",
          "Entry-to-core alignment is more communicative than a neutral axis cut when both anchors exist.",
        ],
        expectedCommunicationValue: 0.74 + (levels.length > 1 ? 0.08 : 0),
        semanticGoal: "entrance_axis",
      }),
    );
  }

  return {
    version: "phase10-section-strategy-library-v1",
    candidates,
    bounds,
  };
}

export default {
  buildSectionStrategyCandidates,
};
