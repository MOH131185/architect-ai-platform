function round(value, precision = 3) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  const factor = 10 ** precision;
  return Math.round(numeric * factor) / factor;
}

function cloneData(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function normalizePoint(point = {}) {
  if (Array.isArray(point)) {
    return {
      x: round(point[0] || 0),
      y: round(point[1] || 0),
    };
  }

  return {
    x: round(point.x || 0),
    y: round(point.y || 0),
  };
}

function polygonFromRect(x = 0, y = 0, width = 0, depth = 0) {
  return [
    { x: round(x), y: round(y) },
    { x: round(x + width), y: round(y) },
    { x: round(x + width), y: round(y + depth) },
    { x: round(x), y: round(y + depth) },
  ];
}

function bboxFromPolygon(polygon = []) {
  const points = Array.isArray(polygon)
    ? polygon.map((point) => normalizePoint(point))
    : [];
  if (!points.length) {
    return {
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0,
      width: 0,
      height: 0,
    };
  }
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return {
    minX: round(minX),
    minY: round(minY),
    maxX: round(maxX),
    maxY: round(maxY),
    width: round(maxX - minX),
    height: round(maxY - minY),
  };
}

function edgeLength(start = {}, end = {}) {
  return Math.hypot(
    Number(end.x || 0) - Number(start.x || 0),
    Number(end.y || 0) - Number(start.y || 0),
  );
}

function normalizeName(value, fallback = "entity") {
  return (
    String(value || fallback)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || fallback
  );
}

function orientationFromSegment(start = {}, end = {}) {
  const dx = Math.abs(Number(end.x || 0) - Number(start.x || 0));
  const dy = Math.abs(Number(end.y || 0) - Number(start.y || 0));
  return dx >= dy ? "horizontal" : "vertical";
}

function edgeSide(start = {}, end = {}, bounds = {}, tolerance = 0.05) {
  if (
    Math.abs(start.y - end.y) <= tolerance &&
    Math.abs(start.y - bounds.minY) <= tolerance &&
    Math.abs(end.y - bounds.minY) <= tolerance
  ) {
    return "north";
  }
  if (
    Math.abs(start.y - end.y) <= tolerance &&
    Math.abs(start.y - bounds.maxY) <= tolerance &&
    Math.abs(end.y - bounds.maxY) <= tolerance
  ) {
    return "south";
  }
  if (
    Math.abs(start.x - end.x) <= tolerance &&
    Math.abs(start.x - bounds.minX) <= tolerance &&
    Math.abs(end.x - bounds.minX) <= tolerance
  ) {
    return "west";
  }
  if (
    Math.abs(start.x - end.x) <= tolerance &&
    Math.abs(start.x - bounds.maxX) <= tolerance &&
    Math.abs(end.x - bounds.maxX) <= tolerance
  ) {
    return "east";
  }
  return null;
}

function normalizedEdgeKey(start = {}, end = {}) {
  const a = normalizePoint(start);
  const b = normalizePoint(end);
  const left = a.x < b.x || (Math.abs(a.x - b.x) < 1e-6 && a.y <= b.y) ? a : b;
  const right = left === a ? b : a;
  return `${left.x},${left.y}|${right.x},${right.y}`;
}

function polygonEdges(polygon = []) {
  const points = Array.isArray(polygon)
    ? polygon.map((point) => normalizePoint(point))
    : [];
  if (points.length < 2) {
    return [];
  }
  return points.map((start, index) => ({
    start,
    end: points[(index + 1) % points.length],
  }));
}

function projectPointToSegment(point = {}, start = {}, end = {}) {
  const px = Number(point.x || 0);
  const py = Number(point.y || 0);
  const ax = Number(start.x || 0);
  const ay = Number(start.y || 0);
  const bx = Number(end.x || 0);
  const by = Number(end.y || 0);
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 1e-9) {
    return { x: round(ax), y: round(ay) };
  }
  const t = Math.max(
    0,
    Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared),
  );
  return {
    x: round(ax + dx * t),
    y: round(ay + dy * t),
  };
}

function distancePointToSegment(point = {}, start = {}, end = {}) {
  const projected = projectPointToSegment(point, start, end);
  return Math.hypot(
    projected.x - Number(point.x || 0),
    projected.y - Number(point.y || 0),
  );
}

function resolveDimensions(masterDNA = {}, baseProjectGeometry = {}) {
  const dims = masterDNA?.dimensions || {};
  const buildable = baseProjectGeometry?.site?.buildable_polygon || [];
  const buildableBounds = bboxFromPolygon(buildable);
  const width =
    Number(dims.length || dims.width) || Number(buildableBounds.width) || 15;
  const depth =
    Number(dims.width || dims.depth) || Number(buildableBounds.height) || 10;
  const floorCount =
    Number(dims.floors || dims.floorCount || dims.floor_count) || 2;
  const floorHeights =
    Array.isArray(dims.floorHeights) && dims.floorHeights.length
      ? dims.floorHeights.map((entry) => round(entry || 3.2))
      : Array.from({ length: floorCount }, () => 3.2);

  return {
    width: round(width),
    depth: round(depth),
    floorCount,
    floorHeights,
  };
}

function normalizePolygonOrFallback(polygon = [], fallback = []) {
  const points = Array.isArray(polygon)
    ? polygon
        .map((point) => normalizePoint(point))
        .filter(
          (point) =>
            Number.isFinite(Number(point.x)) &&
            Number.isFinite(Number(point.y)),
        )
    : [];

  if (points.length >= 3) {
    return points;
  }

  return Array.isArray(fallback)
    ? fallback.map((point) => normalizePoint(point))
    : [];
}

function resolveRoofType(masterDNA = {}) {
  const seed = [
    masterDNA?.roof?.type,
    masterDNA?.roofType,
    masterDNA?.style?.roofType,
    masterDNA?.styleDNA?.roof_language,
    masterDNA?.architecturalStyle,
    masterDNA?.style,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (
    seed.includes("flat") ||
    seed.includes("modern") ||
    seed.includes("contemporary")
  ) {
    return "flat";
  }
  if (seed.includes("hip")) {
    return "hip";
  }
  return "gable";
}

function buildRoomEntries(levelId, floorIndex, floorMetadata = {}) {
  return (Array.isArray(floorMetadata.rooms) ? floorMetadata.rooms : []).map(
    (room, roomIndex) => {
      const polygon =
        Array.isArray(room.polygon) && room.polygon.length >= 3
          ? room.polygon.map((point) => normalizePoint(point))
          : polygonFromRect(
              room.bbox?.x || room.bbox?.minX || 0,
              room.bbox?.y || room.bbox?.minY || 0,
              room.bbox?.width || 0,
              room.bbox?.depth || room.bbox?.height || 0,
            );
      const bbox = bboxFromPolygon(polygon);
      const roomId = `layout-room-${levelId}-${roomIndex}-${normalizeName(room.name || room.type || "room")}`;
      return {
        id: roomId,
        level_id: levelId,
        level: floorIndex,
        name: room.name || `Room ${roomIndex + 1}`,
        type: room.type || room.zone || "room",
        zone: room.zone || null,
        polygon,
        bbox: {
          min_x: bbox.minX,
          min_y: bbox.minY,
          max_x: bbox.maxX,
          max_y: bbox.maxY,
          width: bbox.width,
          height: bbox.height,
        },
        boundingBox: {
          minX: bbox.minX,
          minY: bbox.minY,
          maxX: bbox.maxX,
          maxY: bbox.maxY,
          width: bbox.width,
          height: bbox.height,
        },
        actual_area: round(
          room.computedArea || room.area || bbox.width * bbox.height,
        ),
        target_area: round(
          room.area || room.computedArea || bbox.width * bbox.height,
        ),
        source: "runtime_layout_promotion",
      };
    },
  );
}

function buildExteriorWalls(levelId, footprintPolygon = []) {
  const bounds = bboxFromPolygon(footprintPolygon);
  const segments = [
    {
      side: "north",
      start: { x: bounds.minX, y: bounds.minY },
      end: { x: bounds.maxX, y: bounds.minY },
    },
    {
      side: "east",
      start: { x: bounds.maxX, y: bounds.minY },
      end: { x: bounds.maxX, y: bounds.maxY },
    },
    {
      side: "south",
      start: { x: bounds.maxX, y: bounds.maxY },
      end: { x: bounds.minX, y: bounds.maxY },
    },
    {
      side: "west",
      start: { x: bounds.minX, y: bounds.maxY },
      end: { x: bounds.minX, y: bounds.minY },
    },
  ];

  return segments.map((segment) => ({
    id: `layout-wall-${levelId}-${segment.side}`,
    level_id: levelId,
    start: normalizePoint(segment.start),
    end: normalizePoint(segment.end),
    thickness_m: 0.32,
    kind: "exterior",
    type: "external",
    exterior: true,
    side: segment.side,
    orientation: orientationFromSegment(segment.start, segment.end),
    room_ids: [],
    openings: [],
    source: "runtime_layout_promotion",
  }));
}

function buildInteriorWalls(levelId, rooms = [], footprintPolygon = []) {
  const bounds = bboxFromPolygon(footprintPolygon);
  const wallMap = new Map();

  rooms.forEach((room) => {
    polygonEdges(room.polygon).forEach(({ start, end }) => {
      if (edgeLength(start, end) < 0.4) {
        return;
      }
      if (edgeSide(start, end, bounds)) {
        return;
      }

      const key = normalizedEdgeKey(start, end);
      const existing = wallMap.get(key);
      if (existing) {
        if (!existing.room_ids.includes(room.id)) {
          existing.room_ids.push(room.id);
        }
        return;
      }

      wallMap.set(key, {
        id: `layout-wall-${levelId}-int-${wallMap.size}`,
        level_id: levelId,
        start,
        end,
        thickness_m: 0.14,
        kind: "interior",
        type: "internal",
        exterior: false,
        side: null,
        orientation: orientationFromSegment(start, end),
        room_ids: [room.id],
        openings: [],
        source: "runtime_layout_promotion",
      });
    });
  });

  return Array.from(wallMap.values());
}

function selectWindowConfig(room = {}, spanLength = 0) {
  const roomName = String(room.name || room.type || "")
    .trim()
    .toLowerCase();

  if (
    roomName.includes("hall") ||
    roomName.includes("corridor") ||
    roomName.includes("landing") ||
    roomName.includes("circulation") ||
    roomName.includes("stair")
  ) {
    return { count: 0, width: 0, sill: 0.9, head: 2.1 };
  }

  if (
    roomName.includes("bath") ||
    roomName.includes("wc") ||
    roomName.includes("ensuite") ||
    roomName.includes("toilet")
  ) {
    return {
      count: 1,
      width: Math.min(0.7, Math.max(0.5, spanLength * 0.18)),
      sill: 1.2,
      head: 2.1,
    };
  }

  if (
    roomName.includes("living") ||
    roomName.includes("lounge") ||
    roomName.includes("kitchen") ||
    roomName.includes("dining")
  ) {
    const count = spanLength >= 5.6 ? 2 : 1;
    return {
      count,
      width: Math.min(
        2.4,
        Math.max(1.2, (spanLength / Math.max(count, 1)) * 0.45),
      ),
      sill: 0.45,
      head: 2.3,
    };
  }

  if (roomName.includes("bed")) {
    return {
      count: 1,
      width: Math.min(1.6, Math.max(1.0, spanLength * 0.3)),
      sill: 0.8,
      head: 2.1,
    };
  }

  return {
    count: spanLength >= 5 ? 2 : 1,
    width: Math.min(1.5, Math.max(0.9, spanLength * 0.28)),
    sill: 0.8,
    head: 2.1,
  };
}

function distributeOpeningsOnEdge(start = {}, end = {}, count = 1) {
  const total = Math.max(1, Number(count || 1));
  return Array.from({ length: total }, (_, index) => {
    const t = (index + 1) / (total + 1);
    return {
      x: round(
        Number(start.x || 0) + (Number(end.x || 0) - Number(start.x || 0)) * t,
      ),
      y: round(
        Number(start.y || 0) + (Number(end.y || 0) - Number(start.y || 0)) * t,
      ),
    };
  });
}

function buildWindowEntries(
  levelId,
  rooms = [],
  exteriorWalls = [],
  footprintPolygon = [],
) {
  const bounds = bboxFromPolygon(footprintPolygon);
  const windows = [];

  rooms.forEach((room) => {
    const exteriorEdges = polygonEdges(room.polygon)
      .map(({ start, end }) => ({
        start,
        end,
        side: edgeSide(start, end, bounds),
        length: edgeLength(start, end),
      }))
      .filter((edge) => edge.side && edge.length >= 1.2)
      .sort((left, right) => right.length - left.length);

    if (!exteriorEdges.length) {
      return;
    }

    const selectedEdges = exteriorEdges.slice(
      0,
      String(room.name || room.type || "")
        .toLowerCase()
        .includes("living")
        ? 2
        : 1,
    );

    selectedEdges.forEach((edge) => {
      const wall = exteriorWalls.find((entry) => entry.side === edge.side);
      if (!wall) {
        return;
      }

      const config = selectWindowConfig(room, edge.length);
      const positions = distributeOpeningsOnEdge(
        edge.start,
        edge.end,
        config.count,
      );
      positions.forEach((position, index) => {
        if (config.count <= 0) {
          return;
        }
        windows.push({
          id: `layout-window-${levelId}-${room.id}-${edge.side}-${index}`,
          level_id: levelId,
          wall_id: wall.id,
          room_ids: [room.id],
          position,
          position_m: position,
          width_m: round(config.width),
          sill_height_m: round(config.sill),
          head_height_m: round(config.head),
          type: "window",
          kind: "window",
          source: "runtime_layout_promotion",
        });
      });
    });
  });

  return windows;
}

function findNearestWall(point = {}, walls = [], predicate = () => true) {
  let best = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  walls.forEach((wall) => {
    if (!predicate(wall)) {
      return;
    }
    const distance = distancePointToSegment(point, wall.start, wall.end);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = wall;
    }
  });

  return best;
}

function buildDoorEntries(
  levelId,
  floorMetadata = {},
  walls = [],
  footprintPolygon = [],
) {
  const bounds = bboxFromPolygon(footprintPolygon);
  const southWall = walls.find(
    (wall) => wall.exterior && wall.side === "south",
  );
  const entries = Array.isArray(floorMetadata.doors) ? floorMetadata.doors : [];

  return entries.map((door, doorIndex) => {
    const rawPosition = normalizePoint(door.position || {});
    const wall = door.isMainEntrance
      ? southWall ||
        findNearestWall(rawPosition, walls, (entry) => entry.exterior)
      : findNearestWall(rawPosition, walls);
    const projected = wall
      ? projectPointToSegment(
          door.isMainEntrance
            ? { x: rawPosition.x, y: bounds.maxY }
            : rawPosition,
          wall.start,
          wall.end,
        )
      : rawPosition;

    return {
      id: `layout-door-${levelId}-${doorIndex}-${door.isMainEntrance ? "entry" : normalizeName(door.roomName || "door")}`,
      level_id: levelId,
      wall_id: wall?.id || null,
      room_ids: [],
      position: projected,
      position_m: projected,
      width_m: round(door.width || (door.isMainEntrance ? 1.0 : 0.9)),
      sill_height_m: 0,
      head_height_m: round(door.isMainEntrance ? 2.2 : 2.1),
      type: "door",
      kind: door.isMainEntrance ? "entrance" : "door",
      swing: door.connectsTo === "circulation" ? "single" : null,
      metadata: {
        isMainEntrance: door.isMainEntrance === true,
        connectsTo: door.connectsTo || null,
        roomName: door.roomName || null,
      },
      source: "runtime_layout_promotion",
    };
  });
}

function attachOpeningsToWalls(walls = [], openings = []) {
  const wallMap = new Map(
    walls.map((wall) => [wall.id, { ...wall, openings: [] }]),
  );
  openings.forEach((opening) => {
    if (!opening.wall_id) {
      return;
    }
    const wall = wallMap.get(opening.wall_id);
    if (!wall) {
      return;
    }
    wall.openings.push({
      id: opening.id,
      type: opening.type,
      kind: opening.kind || opening.type,
      position: cloneData(opening.position || opening.position_m),
      width: opening.width_m,
      width_m: opening.width_m,
      sill_height_m: opening.sill_height_m,
      head_height_m: opening.head_height_m,
      metadata: cloneData(opening.metadata || {}),
    });
  });
  return Array.from(wallMap.values());
}

function buildStairEntry(levelId, floorIndex, floorMetadata = {}) {
  const stairCore = floorMetadata.stairCore;
  if (!stairCore?.bbox) {
    return null;
  }
  const x = Number(stairCore.bbox.x || 0);
  const y = Number(stairCore.bbox.y || 0);
  const width = Number(stairCore.bbox.width || 0);
  const depth = Number(stairCore.bbox.depth || 0);
  const polygon =
    Array.isArray(stairCore.polygon) && stairCore.polygon.length >= 3
      ? stairCore.polygon.map((point) => normalizePoint(point))
      : polygonFromRect(x, y, width, depth);

  return {
    id: `layout-stair-${levelId}`,
    level_id: levelId,
    level: floorIndex,
    type: "straight_run",
    x: round(x),
    y: round(y),
    width_m: round(width),
    depth_m: round(depth),
    width: round(width),
    height: round(depth),
    polygon,
    bbox: {
      min_x: round(x),
      min_y: round(y),
      max_x: round(x + width),
      max_y: round(y + depth),
      width: round(width),
      height: round(depth),
    },
    source: "runtime_layout_promotion",
  };
}

export function buildRuntimeProjectGeometryFromLayout({
  masterDNA = {},
  geometryMasks = {},
  baseProjectGeometry = null,
  designFingerprint = null,
} = {}) {
  const floorMetadata = geometryMasks?.floorMetadata || null;
  const levelKeys = floorMetadata
    ? Object.keys(floorMetadata)
        .map((entry) => Number(entry))
        .filter((entry) => Number.isFinite(entry))
        .sort((left, right) => left - right)
    : [];

  if (!levelKeys.length) {
    return null;
  }

  const dimensions = resolveDimensions(masterDNA, baseProjectGeometry || {});
  const footprintPolygon = normalizePolygonOrFallback(
    baseProjectGeometry?.metadata?.runtime_layout_seed?.footprint_polygon ||
      baseProjectGeometry?.footprint?.polygon ||
      baseProjectGeometry?.site?.building_polygon ||
      [],
    polygonFromRect(0, 0, dimensions.width, dimensions.depth),
  );
  const footprintBounds = bboxFromPolygon(footprintPolygon);
  const siteBoundaryPolygon = normalizePolygonOrFallback(
    baseProjectGeometry?.site?.boundary_polygon || [],
    footprintPolygon,
  );
  const siteBuildablePolygon = normalizePolygonOrFallback(
    baseProjectGeometry?.site?.buildable_polygon || [],
    siteBoundaryPolygon,
  );
  const baseStyleDNA =
    baseProjectGeometry?.metadata?.style_dna ||
    masterDNA?.styleDNA ||
    masterDNA?.style_dna ||
    masterDNA?.style ||
    {};

  const populatedGeometry = { floors: [] };
  const levels = [];
  let elevation = 0;

  levelKeys.forEach((floorIndex) => {
    const levelHeight =
      dimensions.floorHeights[floorIndex] ||
      dimensions.floorHeights[dimensions.floorHeights.length - 1] ||
      3.2;
    const levelId = `layout-level-${floorIndex}`;
    const metadata = floorMetadata[floorIndex] || {};
    const rooms = buildRoomEntries(levelId, floorIndex, metadata);
    const exteriorWalls = buildExteriorWalls(levelId, footprintPolygon);
    const interiorWalls = buildInteriorWalls(levelId, rooms, footprintPolygon);
    const doors = buildDoorEntries(
      levelId,
      metadata,
      [...exteriorWalls, ...interiorWalls],
      footprintPolygon,
    );
    const windows = buildWindowEntries(
      levelId,
      rooms,
      exteriorWalls,
      footprintPolygon,
    );
    const walls = attachOpeningsToWalls(
      [...exteriorWalls, ...interiorWalls],
      [...doors, ...windows],
    );
    const stair = buildStairEntry(levelId, floorIndex, metadata);

    levels.push({
      id: levelId,
      name:
        floorIndex === 0
          ? "Ground Floor"
          : floorIndex === 1
            ? "First Floor"
            : `Level ${floorIndex + 1}`,
      level_number: floorIndex,
      elevation_m: round(elevation),
      height_m: round(levelHeight),
      footprint: cloneData(footprintPolygon),
      rooms: rooms.map((room) => ({
        ...room,
        bbox: cloneData(room.bbox),
      })),
      walls: walls.map((wall) => ({
        ...wall,
        openings: cloneData(wall.openings),
      })),
      doors: doors.map((door) => ({
        ...door,
        wall_id: door.wall_id,
      })),
      windows: windows.map((windowElement) => ({
        ...windowElement,
        wall_id: windowElement.wall_id,
      })),
      stairs: stair ? [cloneData(stair)] : [],
    });

    populatedGeometry.floors.push({
      level: floorIndex,
      id: levelId,
      rooms: rooms.map((room) => cloneData(room)),
      walls: walls.map((wall) => cloneData(wall)),
      openings: [...doors, ...windows].map((opening) => cloneData(opening)),
      stairs: stair ? [cloneData(stair)] : [],
      stairCore: cloneData(metadata.stairCore || null),
      circulation: cloneData(metadata.circulation || null),
    });

    elevation += levelHeight;
  });

  const projectGeometry = {
    project_id:
      masterDNA?.projectID ||
      designFingerprint ||
      baseProjectGeometry?.project_id ||
      "runtime-layout-project",
    metadata: {
      source: "runtime_layout_geometry",
      promoted_from: "procedural_geometry_masks",
      style_dna: cloneData(baseStyleDNA),
      designFingerprint:
        designFingerprint ||
        masterDNA?.designFingerprint ||
        masterDNA?.projectID ||
        null,
      promoted_geometry_summary: {
        floor_count: levels.length,
        room_count: populatedGeometry.floors.reduce(
          (sum, floor) => sum + (floor.rooms?.length || 0),
          0,
        ),
        wall_count: populatedGeometry.floors.reduce(
          (sum, floor) => sum + (floor.walls?.length || 0),
          0,
        ),
        opening_count: populatedGeometry.floors.reduce(
          (sum, floor) => sum + (floor.openings?.length || 0),
          0,
        ),
      },
    },
    site: {
      boundary_polygon: cloneData(siteBoundaryPolygon),
      buildable_polygon: cloneData(siteBuildablePolygon),
      north_orientation_deg:
        baseProjectGeometry?.site?.north_orientation_deg ||
        baseProjectGeometry?.site?.orientation_deg ||
        0,
      setbacks: cloneData(baseProjectGeometry?.site?.setbacks || {}),
      area_m2: Number(baseProjectGeometry?.site?.area_m2 || 0),
      climate: cloneData(
        baseProjectGeometry?.site?.climate ||
          masterDNA?.climateData?.climate ||
          null,
      ),
    },
    levels,
    roof: {
      id: "runtime-layout-roof",
      type: resolveRoofType(masterDNA),
      polygon: cloneData(footprintPolygon),
      bbox: {
        min_x: footprintBounds.minX,
        min_y: footprintBounds.minY,
        max_x: footprintBounds.maxX,
        max_y: footprintBounds.maxY,
        width: footprintBounds.width,
        height: footprintBounds.height,
      },
      source: "runtime_layout_promotion",
    },
  };

  return {
    projectGeometry,
    populatedGeometry,
    metrics: {
      levelCount: levels.length,
      roomCount: projectGeometry.metadata.promoted_geometry_summary.room_count,
      wallCount: projectGeometry.metadata.promoted_geometry_summary.wall_count,
      openingCount:
        projectGeometry.metadata.promoted_geometry_summary.opening_count,
    },
  };
}

export default {
  buildRuntimeProjectGeometryFromLayout,
};
