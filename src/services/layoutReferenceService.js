import floorPlanReferenceCorpus from "../data/floorPlanReferenceCorpus.js";

const RESIDENTIAL_HINTS =
  /residential|house|home|dwelling|apartment|flat|bungalow|villa|terrace/i;

const CATEGORY_ALIASES = {
  living: "living_room",
  living_room: "living_room",
  lounge: "living_room",
  dining: "dining_room",
  dining_room: "dining_room",
  kitchen: "kitchen",
  kitchenette: "kitchen",
  bedroom: "bedroom",
  child_room: "bedroom",
  master_bedroom: "bedroom",
  bathroom: "bathroom",
  toilet: "wc",
  wc: "wc",
  cloakroom: "wc",
  hallway: "hallway",
  hall: "hallway",
  landing: "hallway",
  lobby: "hallway",
  corridor: "hallway",
  office: "office",
  study: "office",
  utility: "storage",
  storage: "storage",
  pantry: "storage",
  wardrobe: "wardrobe",
  balcony: "balcony",
  terrace: "terrace",
  garage: "garage",
  gym: "gym",
};

function normalizeCategory(value) {
  const key = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return CATEGORY_ALIASES[key] || key || "room";
}

function isResidentialBuildingType(buildingType) {
  if (!buildingType) {
    return true;
  }

  return RESIDENTIAL_HINTS.test(String(buildingType));
}

function toCategoryCounts(programSpaces = []) {
  return programSpaces.reduce((acc, room) => {
    const category = normalizeCategory(
      room?.program || room?.type || room?.category || room?.name,
    );
    if (!category) {
      return acc;
    }

    acc[category] = (acc[category] || 0) + 1;
    return acc;
  }, {});
}

function formatCategoryCounts(categoryCounts) {
  return Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([category, count]) => `${category} x${count}`)
    .join(", ");
}

function scoreReferenceExample(
  example,
  requestedCategoryCounts,
  requestedRoomCount,
) {
  const exampleCounts = example.categories.reduce((acc, item) => {
    acc[item.category] = item.count;
    return acc;
  }, {});

  const requestedCategories = Object.keys(requestedCategoryCounts);
  const overlapScore = requestedCategories.reduce((sum, category) => {
    if (!(category in exampleCounts)) {
      return sum;
    }

    return (
      sum + Math.min(requestedCategoryCounts[category], exampleCounts[category])
    );
  }, 0);

  return (
    overlapScore * 10 - Math.abs(example.roomCount - requestedRoomCount) * 2
  );
}

export function selectHouseExpoReferenceExamples(
  programSpaces = [],
  limit = 3,
) {
  const houseExpo = floorPlanReferenceCorpus?.houseExpo;
  if (!houseExpo?.referenceExamples?.length) {
    return [];
  }

  const requestedCategoryCounts = toCategoryCounts(programSpaces);
  const requestedRoomCount = programSpaces.length;

  return [...houseExpo.referenceExamples]
    .sort((left, right) => {
      const leftScore = scoreReferenceExample(
        left,
        requestedCategoryCounts,
        requestedRoomCount,
      );
      const rightScore = scoreReferenceExample(
        right,
        requestedCategoryCounts,
        requestedRoomCount,
      );

      return rightScore - leftScore || left.roomCount - right.roomCount;
    })
    .slice(0, limit);
}

export function buildHouseExpoReferenceBlock({
  programSpaces = [],
  buildingType,
} = {}) {
  if (!isResidentialBuildingType(buildingType)) {
    return "";
  }

  const houseExpo = floorPlanReferenceCorpus?.houseExpo;
  if (!houseExpo?.stats) {
    return "";
  }

  const requestedCategoryCounts = toCategoryCounts(programSpaces);
  const examples = selectHouseExpoReferenceExamples(programSpaces, 3);
  const topCategories = (houseExpo.stats.topCategories || [])
    .slice(0, 6)
    .map(
      (item) =>
        `${item.category} (${Math.round(item.planShare * 100)}% plans, avg ${item.meanApproxAreaM2}m2)`,
    )
    .join(", ");

  const lines = [
    "HOUSEEXPO REFERENCE PRIORS:",
    `- ${houseExpo.stats.planCount} residential plans, median ${houseExpo.stats.roomCount.median} rooms, mean ${houseExpo.stats.roomCount.mean} rooms`,
    topCategories ? `- Common room types: ${topCategories}` : "",
    Object.keys(requestedCategoryCounts).length
      ? `- Requested room mix: ${formatCategoryCounts(requestedCategoryCounts)}`
      : "",
  ];

  examples.forEach((example, index) => {
    const categoryCounts = example.categories.reduce((acc, item) => {
      acc[item.category] = item.count;
      return acc;
    }, {});

    lines.push(
      `- Example ${index + 1}: ${example.roomCount} rooms in ${example.bboxMeters.width}m × ${example.bboxMeters.depth}m footprint -> ${formatCategoryCounts(categoryCounts)}`,
    );
  });

  return lines.filter(Boolean).join("\n");
}

export function buildRoboflowSymbolVocabularyBlock() {
  const profiles = floorPlanReferenceCorpus?.roboflowProfiles || [];
  if (!profiles.length) {
    return "";
  }

  const symbolFamilies = [
    ...new Set(profiles.flatMap((profile) => profile.symbolFamilies || [])),
  ];
  if (!symbolFamilies.length) {
    return "";
  }

  return [
    "ROBOFLOW FLOOR-PLAN SYMBOL PRIORS:",
    `- Use standard technical symbols for ${symbolFamilies.join(", ")}`,
    `- Reference datasets: ${profiles.map((profile) => profile.title).join(", ")}`,
    "- Prefer explicit door swings, window openings, stairs, sanitary fixtures, kitchen appliances, and major furniture symbols where programmatically relevant",
  ].join("\n");
}

export default {
  buildHouseExpoReferenceBlock,
  buildRoboflowSymbolVocabularyBlock,
  selectHouseExpoReferenceExamples,
};
