function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function normalizeRoomKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[/,_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const ROOM_CANONICAL_NAMES = {
  wc: "wc",
  toilet: "wc",
  cloakroom: "wc",
  "powder room": "wc",
  lavatory: "wc",
  "guest wc": "wc",
  "living room": "living room",
  living: "living room",
  lounge: "living room",
  "sitting room": "living room",
  reception: "living room",
  "reception room": "living room",
  kitchen: "kitchen",
  "kitchen dining": "kitchen dining",
  "kitchen-dining": "kitchen dining",
  "kitchen/dining": "kitchen dining",
  "kitchen diner": "kitchen dining",
  "dining kitchen": "kitchen dining",
  dining: "dining room",
  "dining area": "dining room",
  "dining room": "dining room",
  hall: "circulation",
  hallway: "circulation",
  corridor: "circulation",
  circulation: "circulation",
  landing: "circulation",
  stairwell: "circulation",
  "entrance hall": "circulation",
  "upper hall": "circulation",
  "upper landing": "circulation",
  "first floor landing": "circulation",
  "staircase circulation": "circulation",
  "staircase and circulation": "circulation",
  "staircase & circulation": "circulation",
  "master bedroom": "master bedroom",
  "bedroom 1": "master bedroom",
  "main bedroom": "master bedroom",
  "principal bedroom": "master bedroom",
  "en-suite": "ensuite",
  ensuite: "ensuite",
  "en suite": "ensuite",
  "ensuite bathroom": "ensuite",
  "shower room": "ensuite",
  utility: "utility",
  "utility room": "utility",
  laundry: "utility",
  "boot room": "utility",
  study: "study",
  office: "study",
  "home office": "study",
  bathroom: "bathroom",
  "family bathroom": "bathroom",
  "main bathroom": "bathroom",
};

function canonicalizeRoomName(value) {
  const normalized = normalizeRoomKey(value);
  return ROOM_CANONICAL_NAMES[normalized] || normalized;
}

function fuzzyMatchRoom(spaces, aiRoom, levelIndex) {
  const aiId = normalizeRoomKey(aiRoom.id);
  const aiName = normalizeRoomKey(aiRoom.name);
  const aiCanonical = canonicalizeRoomName(aiRoom.name);
  const levelSpaces = spaces.filter(
    (space) => (space.levelIndex || 0) === levelIndex,
  );

  let match = levelSpaces.find(
    (space) => normalizeRoomKey(space.id) === aiId && aiId.length > 0,
  );
  if (match) return match;

  match = levelSpaces.find((space) => normalizeRoomKey(space.name) === aiName);
  if (match) return match;

  match = levelSpaces.find((space) => {
    const programCanonical = canonicalizeRoomName(
      space.program || space.category,
    );
    const nameCanonical = canonicalizeRoomName(space.name);
    return nameCanonical === aiCanonical || programCanonical === aiCanonical;
  });
  if (match) return match;

  match = levelSpaces.find((space) => {
    const normalizedName = normalizeRoomKey(space.name);
    const canonicalName = canonicalizeRoomName(space.name);
    return (
      (normalizedName.includes(aiName) ||
        aiName.includes(normalizedName) ||
        canonicalName.includes(aiCanonical) ||
        aiCanonical.includes(canonicalName)) &&
      normalizedName.length > 0 &&
      aiName.length > 0
    );
  });

  return match || null;
}

export function ensureMutableWorkingDNA(masterDNA = null, logger = null) {
  if (!masterDNA || typeof masterDNA !== "object") {
    return masterDNA;
  }

  const isFrozenAuthority =
    Object.isFrozen(masterDNA) ||
    Object.isFrozen(masterDNA._structured || {}) ||
    Object.isFrozen(masterDNA.dimensions || {}) ||
    Object.isFrozen(masterDNA.rooms || []);

  if (!isFrozenAuthority) {
    return masterDNA;
  }

  logger?.info?.(
    "🧊 DNA authority is frozen; using a mutable runtime copy for downstream enrichment.",
  );
  return clone(masterDNA);
}

export function applyAiLayoutRuntimeEnrichment({
  masterDNA = {},
  typesCDS = {},
  aiLayout = {},
  climateContext = null,
  logger = null,
} = {}) {
  const nextMasterDNA = clone(masterDNA) || {};
  const nextTypesCDS = clone(typesCDS) || {};
  const nextProgramRooms = Array.isArray(nextTypesCDS.programRooms)
    ? nextTypesCDS.programRooms
    : [];
  const nextStructured = clone(nextMasterDNA._structured) || {};

  nextStructured.program = nextStructured.program || {};
  nextStructured.site = nextStructured.site || {};
  nextTypesCDS.site = clone(nextTypesCDS.site) || {};

  let injected = 0;
  const alreadyMatched = new Set();

  for (const level of aiLayout.levels || []) {
    for (const room of level.rooms || []) {
      const unmatched = nextProgramRooms.filter(
        (entry) => !alreadyMatched.has(entry),
      );
      const match = fuzzyMatchRoom(unmatched, room, level.index);
      if (!match) {
        logger?.warn?.(
          `⚠️ AI layout room "${room.name}" (level ${level.index}) not matched to any programRoom`,
        );
        continue;
      }

      match.x = room.x;
      match.y = room.y;
      match.width = room.width;
      match.depth = room.depth;
      match.hasExternalWall = room.hasExternalWall;
      match.adjacentTo = room.adjacentTo;
      alreadyMatched.add(match);
      injected += 1;
    }
  }

  nextMasterDNA.spatialGraph = aiLayout.spatialGraph || null;
  nextMasterDNA.qualityEvaluation = aiLayout.qualityEvaluation || null;
  nextMasterDNA.qualityScore = aiLayout.qualityEvaluation?.total || null;
  nextMasterDNA.climateData =
    climateContext || nextMasterDNA.climateData || null;

  nextStructured.program.spatialGraph = aiLayout.spatialGraph || null;
  nextStructured.site.climateData =
    climateContext || nextStructured.site.climateData || null;

  if (climateContext?.climate) {
    nextStructured.site.climate_zone =
      climateContext.climate.zone || nextStructured.site.climate_zone || null;
    nextStructured.site.sun_path =
      climateContext.sunPath || nextStructured.site.sun_path || null;
    nextMasterDNA.climateDesign = {
      ...(clone(nextMasterDNA.climateDesign) || {}),
      zone: climateContext.climate.zone || nextMasterDNA.climateDesign?.zone,
      orientation:
        climateContext.design_recommendations?.orientation ||
        nextMasterDNA.climateDesign?.orientation,
    };
    nextTypesCDS.site.climate = {
      ...(clone(nextTypesCDS.site.climate) || {}),
      zone:
        climateContext.climate.zone ||
        nextTypesCDS.site.climate?.zone ||
        "temperate",
      prevailingWind:
        climateContext.climate.prevailing_wind?.direction ||
        nextTypesCDS.site.climate?.prevailingWind,
      annualRainfallMm:
        climateContext.climate.rainfall_mm_annual ||
        nextTypesCDS.site.climate?.annualRainfallMm,
    };
  }

  if (climateContext?.sunPath) {
    nextTypesCDS.site.sunPath = {
      ...(clone(nextTypesCDS.site.sunPath) || {}),
      ...climateContext.sunPath,
    };
  }

  nextTypesCDS.programRooms = nextProgramRooms;
  nextMasterDNA._structured = nextStructured;

  return {
    masterDNA: nextMasterDNA,
    typesCDS: nextTypesCDS,
    injected,
  };
}

export default {
  ensureMutableWorkingDNA,
  applyAiLayoutRuntimeEnrichment,
};
