function round(value, precision = 2) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  const factor = 10 ** precision;
  return Math.round(numeric * factor) / factor;
}

function lengthOfSegment(start = {}, end = {}) {
  return Math.hypot(
    Number(end.x || 0) - Number(start.x || 0),
    Number(end.y || 0) - Number(start.y || 0),
  );
}

function polygonArea(points = []) {
  if (!Array.isArray(points) || points.length < 3) {
    return 0;
  }
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += Number(current.x || 0) * Number(next.y || 0);
    area -= Number(next.x || 0) * Number(current.y || 0);
  }
  return Math.abs(area) / 2;
}

function pushQuantity(items, category, item, unit, quantity, metadata = {}) {
  const numeric = round(quantity);
  if (!(numeric > 0)) {
    return;
  }
  items.push({
    category,
    item,
    unit,
    quantity: numeric,
    metadata,
  });
}

export function buildProjectQuantityTakeoff(
  compiledProject = {},
  context = {},
) {
  const items = [];
  const walls = Array.isArray(compiledProject.walls)
    ? compiledProject.walls
    : [];
  const openings = Array.isArray(compiledProject.openings)
    ? compiledProject.openings
    : [];
  const slabs = Array.isArray(compiledProject.slabs)
    ? compiledProject.slabs
    : [];
  const stairs = Array.isArray(compiledProject.stairs)
    ? compiledProject.stairs
    : [];
  const rooms = Array.isArray(compiledProject.rooms)
    ? compiledProject.rooms
    : [];
  const roofPlanes = Array.isArray(compiledProject.roof?.planes)
    ? compiledProject.roof.planes
    : [];

  const grossFloorAreaM2 = round(
    rooms.reduce(
      (sum, room) =>
        sum +
        Number(
          room.actual_area_m2 ||
            room.target_area_m2 ||
            polygonArea(room.polygon),
        ),
      0,
    ),
  );
  const slabAreaM2 = round(
    slabs.reduce(
      (sum, slab) => sum + Number(slab.area_m2 || polygonArea(slab.polygon)),
      0,
    ),
  );
  const roofAreaM2 = round(
    roofPlanes.reduce(
      (sum, plane) => sum + Number(plane.area_m2 || polygonArea(plane.polygon)),
      0,
    ),
  );
  const wallLengthM = round(
    walls.reduce(
      (sum, wall) =>
        sum + Number(wall.length_m || lengthOfSegment(wall.start, wall.end)),
      0,
    ),
  );
  const wallAreaM2 = round(
    walls.reduce((sum, wall) => {
      const lengthM = Number(
        wall.length_m || lengthOfSegment(wall.start, wall.end),
      );
      const level = (compiledProject.levels || []).find(
        (entry) => entry.id === wall.levelId,
      );
      const heightM = Number(wall.height_m || level?.height_m || 3);
      return sum + lengthM * heightM;
    }, 0),
  );
  const glazingAreaM2 = round(
    openings
      .filter((opening) => String(opening.type || "").includes("window"))
      .reduce(
        (sum, opening) =>
          sum + Number(opening.width_m || 0) * Number(opening.height_m || 0),
        0,
      ),
  );
  const doorCount = openings.filter((opening) =>
    String(opening.type || "").includes("door"),
  ).length;
  const windowCount = openings.filter((opening) =>
    String(opening.type || "").includes("window"),
  ).length;
  const stairCount = stairs.length;
  const envelopePerimeterM = round(
    polygonArea(compiledProject.footprint?.polygon || []) > 0
      ? walls
          .filter((wall) => wall.exterior)
          .reduce(
            (sum, wall) =>
              sum +
              Number(wall.length_m || lengthOfSegment(wall.start, wall.end)),
            0,
          )
      : 0,
  );

  pushQuantity(items, "areas", "Gross Floor Area", "m2", grossFloorAreaM2);
  pushQuantity(items, "areas", "Slab Area", "m2", slabAreaM2);
  pushQuantity(items, "areas", "Roof Area", "m2", roofAreaM2);
  pushQuantity(items, "envelope", "External Wall Area", "m2", wallAreaM2);
  pushQuantity(items, "envelope", "External Wall Length", "m", wallLengthM);
  pushQuantity(items, "envelope", "Glazing Area", "m2", glazingAreaM2);
  pushQuantity(
    items,
    "envelope",
    "Envelope Perimeter",
    "m",
    envelopePerimeterM,
  );
  pushQuantity(items, "counts", "Doors", "nr", doorCount);
  pushQuantity(items, "counts", "Windows", "nr", windowCount);
  pushQuantity(items, "counts", "Stairs", "nr", stairCount);

  const roomFinishArea = round(
    rooms.reduce((sum, room) => {
      const area = Number(
        room.actual_area_m2 || room.target_area_m2 || polygonArea(room.polygon),
      );
      return sum + area;
    }, 0),
  );
  pushQuantity(
    items,
    "finishes",
    "Internal Floor Finish",
    "m2",
    roomFinishArea,
  );

  return {
    schema_version: "project-quantity-takeoff-v1",
    geometryHash: compiledProject.geometryHash || null,
    pipelineVersion: context.pipelineVersion || "uk-residential-v2.0.0",
    summary: {
      grossFloorAreaM2,
      slabAreaM2,
      roofAreaM2,
      wallAreaM2,
      glazingAreaM2,
      doorCount,
      windowCount,
      stairCount,
      envelopePerimeterM,
    },
    items,
    provenance: {
      compiler: compiledProject.metadata?.compiler || "compiledProjectCompiler",
      deterministic: true,
      source: "compiled_project",
    },
  };
}

export default {
  buildProjectQuantityTakeoff,
};
