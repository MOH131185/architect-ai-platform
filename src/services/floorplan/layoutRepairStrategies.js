function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function roundMetric(value, precision = 3) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  const factor = 10 ** precision;
  return Math.round(numeric * factor) / factor;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function bboxFromRoom(room = {}) {
  const bbox = room.bbox || {};
  return {
    min_x: Number(bbox.min_x || 0),
    min_y: Number(bbox.min_y || 0),
    max_x: Number(bbox.max_x || 0),
    max_y: Number(bbox.max_y || 0),
    width: Number(
      bbox.width ||
        Math.max(0, Number(bbox.max_x || 0) - Number(bbox.min_x || 0)),
    ),
    height: Number(
      bbox.height ||
        Math.max(0, Number(bbox.max_y || 0) - Number(bbox.min_y || 0)),
    ),
  };
}

function polygonFromBbox(bbox = {}) {
  return [
    { x: roundMetric(bbox.min_x), y: roundMetric(bbox.min_y) },
    { x: roundMetric(bbox.max_x), y: roundMetric(bbox.min_y) },
    { x: roundMetric(bbox.max_x), y: roundMetric(bbox.max_y) },
    { x: roundMetric(bbox.min_x), y: roundMetric(bbox.max_y) },
  ];
}

function updateRoomGeometry(room = {}, nextBbox = {}) {
  const bbox = {
    min_x: roundMetric(nextBbox.min_x),
    min_y: roundMetric(nextBbox.min_y),
    max_x: roundMetric(nextBbox.max_x),
    max_y: roundMetric(nextBbox.max_y),
    width: roundMetric(nextBbox.max_x - nextBbox.min_x),
    height: roundMetric(nextBbox.max_y - nextBbox.min_y),
  };
  const area = roundMetric(bbox.width * bbox.height);

  return {
    ...room,
    bbox,
    polygon: polygonFromBbox(bbox),
    centroid: {
      x: roundMetric(bbox.min_x + bbox.width / 2),
      y: roundMetric(bbox.min_y + bbox.height / 2),
    },
    actual_area: area,
  };
}

function groupRoomsByLevel(projectGeometry = {}) {
  return (projectGeometry.levels || []).map((level) => ({
    ...level,
    rooms: (projectGeometry.rooms || []).filter(
      (room) => room.level_id === level.id,
    ),
  }));
}

function sortRooms(rooms = [], strategy = {}) {
  return [...rooms].sort((left, right) => {
    if (
      strategy.prioritizeWetZones &&
      Number(right.wet_zone) !== Number(left.wet_zone)
    ) {
      return Number(right.wet_zone) - Number(left.wet_zone);
    }
    if (strategy.prioritizeAdjacency) {
      const leftScore = Number(strategy.adjacencyWeights?.[left.id] || 0);
      const rightScore = Number(strategy.adjacencyWeights?.[right.id] || 0);
      if (rightScore !== leftScore) {
        return rightScore - leftScore;
      }
    }
    if (strategy.prioritizeCoreAccess) {
      if (
        Number(right.type === "stair_core") !==
        Number(left.type === "stair_core")
      ) {
        return (
          Number(right.type === "stair_core") -
          Number(left.type === "stair_core")
        );
      }
    }
    if (Number(left.stack_order || 0) !== Number(right.stack_order || 0)) {
      return Number(left.stack_order || 0) - Number(right.stack_order || 0);
    }
    return String(left.id || "").localeCompare(String(right.id || ""));
  });
}

function adjacencyWeights(validationReport = {}) {
  const weights = {};
  (validationReport?.affectedEntities || []).forEach((entityId, index) => {
    weights[entityId] = (weights[entityId] || 0) + (10 - index);
  });
  (
    validationReport?.checks?.geometry?.adjacency?.metrics?.missing_edges || []
  ).forEach((entityId, index) => {
    weights[entityId] = (weights[entityId] || 0) + (6 - index);
  });
  return weights;
}

function packRoomsIntoEnvelope(rooms = [], envelope = {}, options = {}) {
  const gutter = Number(options.gutter ?? 0.18);
  const corridorReserve = Number(options.corridorReserve ?? 0);
  const minX = Number(envelope.min_x || 0) + corridorReserve;
  const minY = Number(envelope.min_y || 0);
  const maxX = Number(envelope.max_x || minX + Number(envelope.width || 0));
  const maxY = Number(envelope.max_y || minY + Number(envelope.height || 0));
  const usableWidth = Math.max(4, maxX - minX);
  const usableHeight = Math.max(4, maxY - minY);
  const totalArea = rooms.reduce(
    (sum, room) => sum + Number(room.target_area || room.actual_area || 8),
    0,
  );
  const scale =
    totalArea > usableWidth * usableHeight
      ? Math.sqrt((usableWidth * usableHeight) / Math.max(totalArea, 1))
      : 1;
  let cursorX = minX;
  let cursorY = minY;
  let currentRowHeight = 0;

  return rooms.map((room) => {
    const source = bboxFromRoom(room);
    const sourceWidth = Math.max(source.width, 2.4);
    const sourceHeight = Math.max(source.height, 2.4);
    const aspect = clamp(
      sourceWidth / Math.max(sourceHeight, 0.01),
      0.65,
      1.75,
    );
    const area = Math.max(
      4,
      Number(
        room.target_area || room.actual_area || sourceWidth * sourceHeight || 8,
      ) * scale,
    );
    let width = clamp(Math.sqrt(area * aspect), 2.4, usableWidth);
    let height = clamp(area / Math.max(width, 0.01), 2.2, usableHeight);

    if (cursorX + width > maxX && cursorX > minX) {
      cursorX = minX;
      cursorY = cursorY + currentRowHeight + gutter;
      currentRowHeight = 0;
    }

    if (cursorY + height > maxY) {
      const overflow = cursorY + height - maxY;
      height = Math.max(2.2, height - overflow);
    }

    const nextBbox = {
      min_x: cursorX,
      min_y: cursorY,
      max_x: Math.min(maxX, cursorX + width),
      max_y: Math.min(maxY, cursorY + height),
    };
    cursorX = nextBbox.max_x + gutter;
    currentRowHeight = Math.max(
      currentRowHeight,
      nextBbox.max_y - nextBbox.min_y,
    );
    return updateRoomGeometry(room, nextBbox);
  });
}

function clampRoomsToEnvelope(projectGeometry = {}) {
  const envelope = projectGeometry.site?.buildable_bbox;
  if (!envelope) return projectGeometry;

  const nextGeometry = clone(projectGeometry);
  nextGeometry.rooms = (nextGeometry.rooms || []).map((room) => {
    const current = bboxFromRoom(room);
    const width = Math.max(current.width, 2.2);
    const height = Math.max(current.height, 2.2);
    const minX = clamp(
      current.min_x,
      Number(envelope.min_x || 0),
      Number(envelope.max_x || 0) - width,
    );
    const minY = clamp(
      current.min_y,
      Number(envelope.min_y || 0),
      Number(envelope.max_y || 0) - height,
    );
    return updateRoomGeometry(room, {
      min_x: minX,
      min_y: minY,
      max_x: minX + width,
      max_y: minY + height,
    });
  });
  return nextGeometry;
}

function repackLevelRooms(
  projectGeometry = {},
  strategy = {},
  validationReport = {},
) {
  const nextGeometry = clone(projectGeometry);
  const levelGroups = groupRoomsByLevel(projectGeometry);
  const envelope = projectGeometry.site?.buildable_bbox || {
    min_x: 0,
    min_y: 0,
    max_x: 16,
    max_y: 12,
    width: 16,
    height: 12,
  };
  const weights = adjacencyWeights(validationReport);
  const nextRooms = [];

  levelGroups.forEach((level) => {
    const sortedRooms = sortRooms(level.rooms, {
      ...strategy,
      adjacencyWeights: weights,
    });
    const packed = packRoomsIntoEnvelope(sortedRooms, envelope, {
      corridorReserve: strategy.reserveCorridor ? 1.4 : 0,
    });
    nextRooms.push(...packed);
  });

  nextGeometry.rooms = nextRooms;
  return nextGeometry;
}

function alignWetZones(projectGeometry = {}) {
  const nextGeometry = clone(projectGeometry);
  const levelGroups = groupRoomsByLevel(nextGeometry).sort(
    (left, right) =>
      Number(left.level_number || 0) - Number(right.level_number || 0),
  );

  levelGroups.slice(1).forEach((level) => {
    const currentWet = (nextGeometry.rooms || []).filter(
      (room) => room.level_id === level.id && room.wet_zone,
    );
    const below = levelGroups.find(
      (entry) =>
        Number(entry.level_number || 0) === Number(level.level_number || 0) - 1,
    );
    const belowWet = (nextGeometry.rooms || []).filter(
      (room) => room.level_id === below?.id && room.wet_zone,
    );
    currentWet.forEach((room) => {
      const target = belowWet[0];
      if (!target) return;
      const current = bboxFromRoom(room);
      const targetBox = bboxFromRoom(target);
      const width = current.width;
      const minX = targetBox.min_x;
      const maxX = minX + width;
      const updated = updateRoomGeometry(room, {
        min_x: minX,
        min_y: current.min_y,
        max_x: maxX,
        max_y: current.max_y,
      });
      nextGeometry.rooms = nextGeometry.rooms.map((entry) =>
        entry.id === room.id ? updated : entry,
      );
    });
  });

  return nextGeometry;
}

function normalizeStairCore(projectGeometry = {}) {
  const nextGeometry = clone(projectGeometry);
  const coreRooms = (nextGeometry.rooms || []).filter(
    (room) => room.type === "stair_core",
  );
  if (!coreRooms.length) {
    return nextGeometry;
  }

  const averageCenterX =
    coreRooms.reduce(
      (sum, room) =>
        sum +
        Number(
          room.centroid?.x ||
            bboxFromRoom(room).min_x + bboxFromRoom(room).width / 2,
        ),
      0,
    ) / Math.max(coreRooms.length, 1);

  nextGeometry.rooms = (nextGeometry.rooms || []).map((room) => {
    if (room.type !== "stair_core") {
      return room;
    }
    const current = bboxFromRoom(room);
    const minX = averageCenterX - current.width / 2;
    return updateRoomGeometry(room, {
      min_x: minX,
      min_y: current.min_y,
      max_x: minX + current.width,
      max_y: current.max_y,
    });
  });

  return nextGeometry;
}

export const LAYOUT_REPAIR_STRATEGIES = [
  {
    id: "repair:band-repack",
    description: "Repack rooms deterministically into the buildable envelope.",
    apply(projectGeometry, validationReport) {
      return clampRoomsToEnvelope(
        repackLevelRooms(projectGeometry, {}, validationReport),
      );
    },
  },
  {
    id: "repair:adjacency-cluster",
    description:
      "Bias room ordering toward flagged adjacency conflicts before deterministic repacking.",
    apply(projectGeometry, validationReport) {
      return clampRoomsToEnvelope(
        repackLevelRooms(
          projectGeometry,
          { prioritizeAdjacency: true },
          validationReport,
        ),
      );
    },
  },
  {
    id: "repair:circulation-spine",
    description:
      "Reserve a corridor strip during repacking to improve circulation and stair/core approach.",
    apply(projectGeometry, validationReport) {
      return clampRoomsToEnvelope(
        repackLevelRooms(
          projectGeometry,
          { reserveCorridor: true, prioritizeCoreAccess: true },
          validationReport,
        ),
      );
    },
  },
  {
    id: "repair:wet-stack-align",
    description:
      "Repack rooms, then realign wet zones above the level below to reduce stack drift.",
    apply(projectGeometry, validationReport) {
      return clampRoomsToEnvelope(
        alignWetZones(
          repackLevelRooms(
            projectGeometry,
            { prioritizeWetZones: true },
            validationReport,
          ),
        ),
      );
    },
  },
  {
    id: "repair:core-access-normalize",
    description:
      "Normalize stair/core placement across levels, then clamp rooms back inside the envelope.",
    apply(projectGeometry, validationReport) {
      return clampRoomsToEnvelope(
        normalizeStairCore(
          repackLevelRooms(
            projectGeometry,
            {
              prioritizeCoreAccess: true,
              prioritizeWetZones: true,
            },
            validationReport,
          ),
        ),
      );
    },
  },
];

export default {
  LAYOUT_REPAIR_STRATEGIES,
};
