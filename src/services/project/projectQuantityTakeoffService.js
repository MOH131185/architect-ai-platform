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

// Phase 3 (Track 5) — door/window size-class bands derived from physical
// dimensions on the compiled project's openings[]. Buckets mirror the
// rate-card columns ("Doors (small)", "Doors (medium)", "Doors (large)"
// etc.) so the cost workbook can price each band at a different rate.
function classifyDoorSize(opening) {
  const widthM = Number(opening.width_m || 0);
  if (widthM > 0 && widthM < 0.8) return "small";
  if (widthM >= 1.0) return "large";
  return "medium";
}

function classifyWindowSize(opening) {
  const widthM = Number(opening.width_m || 0);
  const heightM = Number(opening.height_m || 0);
  const areaM2 = widthM * heightM;
  if (areaM2 > 0 && areaM2 < 1) return "small";
  if (areaM2 >= 2) return "large";
  return "medium";
}

function isKitchenRoom(room) {
  const haystack =
    `${String(room?.type || "")} ${String(room?.category || "")} ${String(room?.usage || "")} ${String(room?.name || "")}`.toLowerCase();
  return /kitchen|kitch|galley/.test(haystack);
}

function isBathroomRoom(room) {
  const haystack =
    `${String(room?.type || "")} ${String(room?.category || "")} ${String(room?.usage || "")} ${String(room?.name || "")}`.toLowerCase();
  return /bathroom|wc\b|ensuite|en[-_ ]suite|shower\s*room|powder[-_ ]room|toilet/.test(
    haystack,
  );
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

  // Phase 3 (Track 5): door / window size-class breakdown. Each band
  // becomes its own takeoff line so the cost workbook can price
  // "Doors (small)" / "Doors (medium)" / "Doors (large)" at the
  // rate-card columns of the same name. Falls back gracefully when
  // dimensions are absent — items emit only when count > 0.
  const doorSizeCounts = { small: 0, medium: 0, large: 0 };
  const windowSizeCounts = { small: 0, medium: 0, large: 0 };
  for (const opening of openings) {
    const type = String(opening.type || "");
    if (type.includes("door")) {
      doorSizeCounts[classifyDoorSize(opening)] += 1;
    } else if (type.includes("window")) {
      windowSizeCounts[classifyWindowSize(opening)] += 1;
    }
  }
  for (const band of ["small", "medium", "large"]) {
    if (doorSizeCounts[band] > 0) {
      pushQuantity(
        items,
        "counts",
        `Doors (${band})`,
        "nr",
        doorSizeCounts[band],
        { sizeBand: band },
      );
    }
    if (windowSizeCounts[band] > 0) {
      pushQuantity(
        items,
        "counts",
        `Windows (${band})`,
        "nr",
        windowSizeCounts[band],
        { sizeBand: band },
      );
    }
  }

  // Phase 3 (Track 5): kitchens + bathrooms surface as fit-out lines. A
  // kitchen / bathroom is identified by room type, category, usage tag,
  // OR a substring match in the name (caters for compiled-project rooms
  // labelled "Master Bathroom" / "Galley Kitchen" without a structured
  // type).
  let kitchenCount = 0;
  let bathroomCount = 0;
  for (const room of rooms) {
    if (isKitchenRoom(room)) kitchenCount += 1;
    if (isBathroomRoom(room)) bathroomCount += 1;
  }
  pushQuantity(items, "fitOut", "Kitchen", "nr", kitchenCount);
  pushQuantity(items, "fitOut", "Bathroom", "nr", bathroomCount);

  // Phase 3 audit response: read the REAL mepModelService output shape.
  // Codex caught that the prior nested form (`mepModel.electrical.*`) is
  // not what the service emits — it produces top-level layout objects:
  //   electricalLightingLayout: { fixtures: [...], ... }
  //   electricalPowerSocketLayout: { outlets, switches, dataPoints }
  //   plumbingSupplyLayout: { fixtures: [...] }
  //   drainageWasteLayout: { fixtures: [...] }
  //   ventilationHvacLayout: { extractFans: [...] }
  // The reader below honours that shape AND a legacy nested shape for
  // back-compat with test fixtures that predate the production model.
  const mepModel = context?.mepModel || null;
  if (mepModel) {
    const readCount = (...paths) => {
      for (const path of paths) {
        const value = path.reduce(
          (acc, key) => (acc == null ? acc : acc[key]),
          mepModel,
        );
        if (Array.isArray(value)) return value.length;
      }
      return 0;
    };
    const lightingCount = readCount(
      ["electricalLightingLayout", "fixtures"],
      ["electrical", "lightingLayout", "fixtures"],
      ["electrical", "lightingLayout"], // legacy: array directly
    );
    const powerSocketCount = readCount(
      ["electricalPowerSocketLayout", "outlets"],
      ["electrical", "powerSocketLayout", "outlets"],
      ["electrical", "powerSocketLayout"],
    );
    const switchCount = readCount(
      ["electricalPowerSocketLayout", "switches"],
      ["electrical", "powerSocketLayout", "switches"],
      ["electrical", "switchLayout"],
    );
    const dataOutletCount = readCount(
      ["electricalPowerSocketLayout", "dataPoints"],
      ["electrical", "powerSocketLayout", "dataPoints"],
      ["electrical", "dataPointLayout"],
    );
    const sanitaryCount = readCount(
      ["plumbingSupplyLayout", "fixtures"],
      ["plumbing", "plumbingSupplyLayout", "fixtures"],
      ["plumbing", "plumbingSupplyLayout"],
    );
    const drainageCount = readCount(
      ["drainageWasteLayout", "fixtures"],
      ["plumbing", "drainageWasteLayout", "fixtures"],
      ["plumbing", "drainageWasteLayout"],
    );
    const ventilationExtractCount = readCount(
      ["ventilationHvacLayout", "extractFans"],
      ["ventilation", "ventilationHvacLayout", "extractFans"],
    );
    pushQuantity(items, "mep", "Lighting Point", "nr", lightingCount);
    pushQuantity(items, "mep", "Power Socket", "nr", powerSocketCount);
    pushQuantity(items, "mep", "Switch", "nr", switchCount);
    pushQuantity(items, "mep", "Data Outlet", "nr", dataOutletCount);
    pushQuantity(items, "mep", "Sanitary Fixture", "nr", sanitaryCount);
    pushQuantity(items, "mep", "Drainage Outlet", "nr", drainageCount);
    pushQuantity(
      items,
      "mep",
      "Ventilation Extract",
      "nr",
      ventilationExtractCount,
    );
  }

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
      doorSizeCounts,
      windowSizeCounts,
      kitchenCount,
      bathroomCount,
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
