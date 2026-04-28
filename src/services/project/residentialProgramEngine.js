import { createProjectBrief } from "./v2ProjectContracts.js";
import { levelIndexFromLabel, levelName } from "./levelUtils.js";

function round(value, precision = 2) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  const factor = 10 ** precision;
  return Math.round(numeric * factor) / factor;
}

function clamp(value, minimum, maximum) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return minimum;
  }
  return Math.max(minimum, Math.min(maximum, numeric));
}

function slugify(value) {
  return String(value || "space")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function distributeCounts(totalCount, levelCount, preferred = "upper") {
  const levels = Array.from({ length: levelCount }, () => 0);
  const startIndex = preferred === "ground" ? 0 : Math.max(0, levelCount - 1);
  for (let index = 0; index < totalCount; index += 1) {
    const offset =
      preferred === "ground"
        ? index % levelCount
        : (startIndex - (index % levelCount) + levelCount) % levelCount;
    levels[offset] += 1;
  }
  return levels;
}

const PROGRAM_TEMPLATES = {
  "detached-house": {
    defaultLevels: 2,
    preferredRoof: "gable",
    circulationRatio: 0.13,
    spaces: [
      {
        name: "Entrance Hall",
        type: "entrance_hall",
        share: 0.07,
        level: "Ground",
        minArea: 6,
        maxCount: 1,
      },
      {
        name: "Living Room",
        type: "living_room",
        share: 0.18,
        level: "Ground",
        minArea: 20,
        maxCount: 1,
      },
      {
        name: "Kitchen",
        type: "kitchen",
        share: 0.12,
        level: "Ground",
        minArea: 12,
        maxCount: 1,
        wet: true,
      },
      {
        name: "Dining Area",
        type: "dining",
        share: 0.1,
        level: "Ground",
        minArea: 10,
        maxCount: 1,
      },
      {
        name: "Study",
        type: "study",
        share: 0.07,
        level: "Ground",
        minArea: 8,
        maxCount: 1,
      },
      {
        name: "WC",
        type: "wc",
        share: 0.03,
        level: "Ground",
        minArea: 3,
        maxCount: 1,
        wet: true,
      },
      {
        name: "Utility",
        type: "utility",
        share: 0.05,
        level: "Ground",
        minArea: 4,
        maxCount: 1,
        wet: true,
      },
      {
        name: "Primary Bedroom",
        type: "bedroom_primary",
        share: 0.14,
        level: "Upper",
        minArea: 14,
        maxCount: 1,
      },
      {
        name: "Bedroom",
        type: "bedroom",
        share: 0.11,
        level: "Upper",
        minArea: 9,
        countByArea: [120, 180, 240],
        countValues: [2, 3, 4],
      },
      {
        name: "Bathroom",
        type: "bathroom",
        share: 0.06,
        level: "Upper",
        minArea: 5,
        countByArea: [140, 220],
        countValues: [1, 2],
        wet: true,
      },
      {
        name: "Landing",
        type: "circulation",
        share: 0.05,
        level: "Upper",
        minArea: 5,
        maxCount: 1,
      },
      {
        name: "Storage",
        type: "storage",
        share: 0.02,
        level: "Upper",
        minArea: 2,
        maxCount: 1,
      },
    ],
  },
  "semi-detached-house": {
    defaultLevels: 2,
    preferredRoof: "gable",
    circulationRatio: 0.12,
    spaces: [
      {
        name: "Entrance Hall",
        type: "entrance_hall",
        share: 0.07,
        level: "Ground",
        minArea: 5,
        maxCount: 1,
      },
      {
        name: "Living Room",
        type: "living_room",
        share: 0.19,
        level: "Ground",
        minArea: 18,
        maxCount: 1,
      },
      {
        name: "Kitchen",
        type: "kitchen",
        share: 0.13,
        level: "Ground",
        minArea: 10,
        maxCount: 1,
        wet: true,
      },
      {
        name: "Dining Area",
        type: "dining",
        share: 0.08,
        level: "Ground",
        minArea: 8,
        maxCount: 1,
      },
      {
        name: "WC",
        type: "wc",
        share: 0.03,
        level: "Ground",
        minArea: 3,
        maxCount: 1,
        wet: true,
      },
      {
        name: "Utility",
        type: "utility",
        share: 0.04,
        level: "Ground",
        minArea: 3,
        maxCount: 1,
        wet: true,
      },
      {
        name: "Primary Bedroom",
        type: "bedroom_primary",
        share: 0.15,
        level: "Upper",
        minArea: 13,
        maxCount: 1,
      },
      {
        name: "Bedroom",
        type: "bedroom",
        share: 0.12,
        level: "Upper",
        minArea: 8,
        countByArea: [100, 160, 220],
        countValues: [2, 3, 4],
      },
      {
        name: "Bathroom",
        type: "bathroom",
        share: 0.06,
        level: "Upper",
        minArea: 5,
        countByArea: [120, 200],
        countValues: [1, 2],
        wet: true,
      },
      {
        name: "Landing",
        type: "circulation",
        share: 0.04,
        level: "Upper",
        minArea: 4,
        maxCount: 1,
      },
    ],
  },
  "terraced-house": {
    defaultLevels: 3,
    preferredRoof: "gable",
    circulationRatio: 0.15,
    spaces: [
      {
        name: "Entrance Hall",
        type: "entrance_hall",
        share: 0.06,
        level: "Ground",
        minArea: 5,
        maxCount: 1,
      },
      {
        name: "Living Room",
        type: "living_room",
        share: 0.16,
        level: "Ground",
        minArea: 16,
        maxCount: 1,
      },
      {
        name: "Kitchen",
        type: "kitchen",
        share: 0.1,
        level: "Ground",
        minArea: 9,
        maxCount: 1,
        wet: true,
      },
      {
        name: "Dining Area",
        type: "dining",
        share: 0.08,
        level: "Ground",
        minArea: 7,
        maxCount: 1,
      },
      {
        name: "WC",
        type: "wc",
        share: 0.03,
        level: "Ground",
        minArea: 3,
        maxCount: 1,
        wet: true,
      },
      {
        name: "Utility",
        type: "utility",
        share: 0.03,
        level: "Ground",
        minArea: 3,
        maxCount: 1,
        wet: true,
      },
      {
        name: "Bedroom",
        type: "bedroom",
        share: 0.11,
        level: "Upper",
        minArea: 8,
        countByArea: [110, 180, 240],
        countValues: [2, 3, 4],
      },
      {
        name: "Primary Bedroom",
        type: "bedroom_primary",
        share: 0.13,
        level: "Upper",
        minArea: 12,
        maxCount: 1,
      },
      {
        name: "Bathroom",
        type: "bathroom",
        share: 0.06,
        level: "Upper",
        minArea: 5,
        countByArea: [130, 210],
        countValues: [1, 2],
        wet: true,
      },
      {
        name: "Study",
        type: "study",
        share: 0.05,
        level: "Upper",
        minArea: 6,
        maxCount: 1,
      },
      {
        name: "Landing",
        type: "circulation",
        share: 0.05,
        level: "Upper",
        minArea: 4,
        maxCount: 2,
      },
    ],
  },
  villa: {
    defaultLevels: 2,
    preferredRoof: "hip",
    circulationRatio: 0.15,
    spaces: [
      {
        name: "Entrance Hall",
        type: "entrance_hall",
        share: 0.06,
        level: "Ground",
        minArea: 8,
        maxCount: 1,
      },
      {
        name: "Living Room",
        type: "living_room",
        share: 0.17,
        level: "Ground",
        minArea: 24,
        maxCount: 1,
      },
      {
        name: "Kitchen",
        type: "kitchen",
        share: 0.11,
        level: "Ground",
        minArea: 14,
        maxCount: 1,
        wet: true,
      },
      {
        name: "Dining Area",
        type: "dining",
        share: 0.09,
        level: "Ground",
        minArea: 12,
        maxCount: 1,
      },
      {
        name: "Family Room",
        type: "family_room",
        share: 0.08,
        level: "Ground",
        minArea: 12,
        maxCount: 1,
      },
      {
        name: "Guest Suite",
        type: "guest_suite",
        share: 0.1,
        level: "Ground",
        minArea: 14,
        maxCount: 1,
        wet: true,
      },
      {
        name: "WC",
        type: "wc",
        share: 0.03,
        level: "Ground",
        minArea: 3,
        maxCount: 1,
        wet: true,
      },
      {
        name: "Utility",
        type: "utility",
        share: 0.04,
        level: "Ground",
        minArea: 4,
        maxCount: 1,
        wet: true,
      },
      {
        name: "Primary Suite",
        type: "bedroom_primary",
        share: 0.14,
        level: "Upper",
        minArea: 18,
        maxCount: 1,
        wet: true,
      },
      {
        name: "Bedroom",
        type: "bedroom",
        share: 0.1,
        level: "Upper",
        minArea: 10,
        countByArea: [180, 260, 340],
        countValues: [2, 3, 4],
      },
      {
        name: "Bathroom",
        type: "bathroom",
        share: 0.06,
        level: "Upper",
        minArea: 6,
        countByArea: [180, 260],
        countValues: [2, 3],
        wet: true,
      },
      {
        name: "Landing",
        type: "circulation",
        share: 0.04,
        level: "Upper",
        minArea: 5,
        maxCount: 1,
      },
    ],
  },
  cottage: {
    defaultLevels: 2,
    preferredRoof: "gable",
    circulationRatio: 0.11,
    spaces: [
      {
        name: "Entrance Hall",
        type: "entrance_hall",
        share: 0.06,
        level: "Ground",
        minArea: 4,
        maxCount: 1,
      },
      {
        name: "Living Room",
        type: "living_room",
        share: 0.2,
        level: "Ground",
        minArea: 16,
        maxCount: 1,
      },
      {
        name: "Kitchen",
        type: "kitchen",
        share: 0.13,
        level: "Ground",
        minArea: 9,
        maxCount: 1,
        wet: true,
      },
      {
        name: "Dining Area",
        type: "dining",
        share: 0.08,
        level: "Ground",
        minArea: 7,
        maxCount: 1,
      },
      {
        name: "WC",
        type: "wc",
        share: 0.03,
        level: "Ground",
        minArea: 3,
        maxCount: 1,
        wet: true,
      },
      {
        name: "Utility",
        type: "utility",
        share: 0.03,
        level: "Ground",
        minArea: 3,
        maxCount: 1,
        wet: true,
      },
      {
        name: "Primary Bedroom",
        type: "bedroom_primary",
        share: 0.14,
        level: "Upper",
        minArea: 12,
        maxCount: 1,
      },
      {
        name: "Bedroom",
        type: "bedroom",
        share: 0.12,
        level: "Upper",
        minArea: 8,
        countByArea: [90, 130, 170],
        countValues: [1, 2, 3],
      },
      {
        name: "Bathroom",
        type: "bathroom",
        share: 0.07,
        level: "Upper",
        minArea: 5,
        countByArea: [110, 170],
        countValues: [1, 2],
        wet: true,
      },
      {
        name: "Landing",
        type: "circulation",
        share: 0.04,
        level: "Upper",
        minArea: 3,
        maxCount: 1,
      },
    ],
  },
  "apartment-building": {
    defaultLevels: 3,
    preferredRoof: "flat",
    circulationRatio: 0.18,
    spaces: [
      {
        name: "Entrance Lobby",
        type: "lobby",
        share: 0.06,
        level: "Ground",
        minArea: 10,
        maxCount: 1,
      },
      {
        name: "Apartment Living/Kitchen",
        type: "living_kitchen",
        share: 0.2,
        level: "All",
        minArea: 22,
        unitized: true,
      },
      {
        name: "Apartment Bedroom",
        type: "apartment_bedroom",
        share: 0.15,
        level: "All",
        minArea: 11,
        unitized: true,
      },
      {
        name: "Apartment Bathroom",
        type: "apartment_bathroom",
        share: 0.07,
        level: "All",
        minArea: 4,
        unitized: true,
        wet: true,
      },
      {
        name: "Plant/Storage",
        type: "plant_storage",
        share: 0.05,
        level: "Ground",
        minArea: 8,
        maxCount: 1,
        wet: true,
      },
      {
        name: "Core Hall",
        type: "circulation",
        share: 0.08,
        level: "All",
        minArea: 8,
        maxCount: 3,
      },
    ],
  },
};

function resolveTemplate(subType) {
  return PROGRAM_TEMPLATES[subType] || PROGRAM_TEMPLATES["detached-house"];
}

function resolveCountFromArea(areaM2, thresholds = [], values = []) {
  for (let index = 0; index < thresholds.length; index += 1) {
    if (areaM2 <= thresholds[index]) {
      return values[index];
    }
  }
  return values[values.length - 1] || 1;
}

const SUBTYPE_SITE_RULES = {
  "detached-house": { minLevels: 1, maxLevels: 3, coverageRatio: 0.35 },
  "semi-detached-house": { minLevels: 1, maxLevels: 3, coverageRatio: 0.4 },
  "terraced-house": { minLevels: 2, maxLevels: 4, coverageRatio: 0.5 },
  villa: { minLevels: 1, maxLevels: 3, coverageRatio: 0.3 },
  cottage: { minLevels: 1, maxLevels: 2, coverageRatio: 0.25 },
  mansion: { minLevels: 1, maxLevels: 3, coverageRatio: 0.3 },
  "apartment-building": { minLevels: 2, maxLevels: 4, coverageRatio: 0.6 },
  "multi-family": { minLevels: 2, maxLevels: 6, coverageRatio: 0.55 },
  duplex: { minLevels: 2, maxLevels: 3, coverageRatio: 0.45 },
};

const SITE_SETBACK_FACTOR = 0.85;
const AREA_TOLERANCE = 0.05;
const OPTIONAL_SPACE_DROP_ORDER = [
  "study",
  "storage",
  "utility",
  "dining",
  "plant_storage",
];

function getSubtypeRule(subType) {
  return (
    SUBTYPE_SITE_RULES[subType] || {
      minLevels: 1,
      maxLevels: subType === "apartment-building" ? 4 : 3,
      coverageRatio: 0.4,
    }
  );
}

function resolveSiteFitLevelCount(subType, totalAreaM2, siteAreaM2) {
  const targetArea = Number(totalAreaM2);
  const siteArea = Number(siteAreaM2);
  if (
    !Number.isFinite(targetArea) ||
    targetArea <= 0 ||
    !Number.isFinite(siteArea) ||
    siteArea <= 0
  ) {
    return null;
  }

  const rule = getSubtypeRule(subType);
  const maxFootprint =
    siteArea * Number(rule.coverageRatio || 0.4) * SITE_SETBACK_FACTOR;
  if (!Number.isFinite(maxFootprint) || maxFootprint <= 0) {
    return null;
  }

  return clamp(
    Math.ceil(targetArea / maxFootprint),
    rule.minLevels || 1,
    rule.maxLevels || 3,
  );
}

function calculateProgramArea(spaces) {
  return (Array.isArray(spaces) ? spaces : []).reduce(
    (sum, space) => sum + Number(space.area || 0) * Number(space.count || 1),
    0,
  );
}

function isOptionalSpace(space, optionalType) {
  const type = slugify(space?.spaceType || "");
  const name = slugify(space?.name || space?.label || "");
  return type === optionalType || name.includes(optionalType);
}

function fitSpacesToTargetArea(spaces, targetAreaM2) {
  const targetArea = Number(targetAreaM2);
  if (!Number.isFinite(targetArea) || targetArea <= 0 || !spaces.length) {
    return { spaces, warnings: [] };
  }

  let fitted = [...spaces];
  const warnings = [];
  const maximumArea = targetArea * (1 + AREA_TOLERANCE);
  let currentArea = calculateProgramArea(fitted);

  for (const optionalType of OPTIONAL_SPACE_DROP_ORDER) {
    if (currentArea <= maximumArea) break;
    const index = fitted.findIndex((space) =>
      isOptionalSpace(space, optionalType),
    );
    if (index === -1) continue;

    const [removed] = fitted.splice(index, 1);
    warnings.push(
      `${removed.name || removed.label || optionalType} omitted to keep the programme within the requested area.`,
    );
    currentArea = calculateProgramArea(fitted);
  }

  const minimumArea = targetArea * (1 - AREA_TOLERANCE);
  if (currentArea < minimumArea) {
    const deficit = targetArea - currentArea;
    const eligible = fitted.filter((space) => {
      const type = slugify(space.spaceType || space.name || "");
      return (
        !type.includes("stair") &&
        !type.includes("circulation") &&
        !type.includes("wc") &&
        !type.includes("bathroom")
      );
    });
    const eligibleArea = calculateProgramArea(eligible);
    if (eligible.length > 0 && eligibleArea > 0 && deficit > 0) {
      fitted = fitted.map((space) => {
        if (!eligible.includes(space)) {
          return space;
        }
        const share = Number(space.area || 0) / eligibleArea;
        return {
          ...space,
          area: round(Number(space.area || 0) + deficit * share),
        };
      });
      currentArea = calculateProgramArea(fitted);
    }
  }

  if (currentArea > maximumArea) {
    warnings.push(
      `Minimum room standards require ${round(currentArea)} m², above the requested ${round(targetArea)} m² target.`,
    );
  }

  return { spaces: fitted, warnings };
}

function resolveLevelCount(
  subType,
  totalAreaM2,
  siteAreaM2 = null,
  { levelCountOverride = null } = {},
) {
  const template = resolveTemplate(subType);
  const rule = getSubtypeRule(subType);
  const requestedLevelCount = Number(levelCountOverride);
  if (Number.isFinite(requestedLevelCount) && requestedLevelCount > 0) {
    return clamp(
      Math.round(requestedLevelCount),
      rule.minLevels || 1,
      rule.maxLevels || 3,
    );
  }

  const siteFitLevelCount = resolveSiteFitLevelCount(
    subType,
    totalAreaM2,
    siteAreaM2,
  );
  if (siteFitLevelCount) {
    return siteFitLevelCount;
  }

  let levelCount = template.defaultLevels;
  if (subType === "apartment-building" || subType === "multi-family") {
    if (totalAreaM2 <= 260) levelCount = 2;
    else if (totalAreaM2 <= 420) levelCount = 3;
    else levelCount = 4;
  } else if (totalAreaM2 <= 110) {
    levelCount = Math.min(levelCount, 2);
  } else if (totalAreaM2 >= 260) {
    levelCount = Math.max(levelCount, 3);
  }

  return clamp(levelCount, rule.minLevels || 1, rule.maxLevels || 3);
}

function getLevelName(levelIndex) {
  if (levelIndex === 0) return "Ground";
  if (levelIndex === 1) return "First";
  if (levelIndex === 2) return "Second";
  return `Level ${levelIndex}`;
}

function isStairOrVerticalCore(space = {}) {
  const type = slugify(space.spaceType || space.type || "");
  const name = slugify(space.name || space.label || "");
  return (
    type.includes("stair") ||
    name.includes("stair") ||
    name.includes("vertical-circulation")
  );
}

function normaliseSpaceLevel(space = {}, levelIndex = 0) {
  const safeLevelIndex = Math.max(0, Math.floor(Number(levelIndex) || 0));
  return {
    ...space,
    levelIndex: safeLevelIndex,
    level: getLevelName(safeLevelIndex),
  };
}

function rebalanceUpperSpacesAcrossLevels(spaces = [], levelCount = 1) {
  const floorCount = Math.max(1, Math.floor(Number(levelCount) || 1));
  if (floorCount <= 1) {
    return spaces.map((space) => normaliseSpaceLevel(space, 0));
  }

  const floorAreas = Array.from({ length: floorCount }, () => 0);
  const fixedSpaces = [];
  const upperCandidates = [];
  const areaOf = (space) => Number(space.area || 0) * Number(space.count || 1);

  spaces.forEach((space) => {
    const currentIndex = clamp(Number(space.levelIndex), 0, floorCount - 1);
    const nextSpace = normaliseSpaceLevel(space, currentIndex);

    if (currentIndex === 0 || isStairOrVerticalCore(nextSpace)) {
      fixedSpaces.push(nextSpace);
      floorAreas[nextSpace.levelIndex] += areaOf(nextSpace);
      return;
    }

    upperCandidates.push(nextSpace);
  });

  upperCandidates
    .sort((a, b) => areaOf(b) - areaOf(a))
    .forEach((space) => {
      let targetLevelIndex = 1;
      for (let index = 2; index < floorCount; index += 1) {
        if (floorAreas[index] < floorAreas[targetLevelIndex]) {
          targetLevelIndex = index;
        }
      }

      const assigned = normaliseSpaceLevel(space, targetLevelIndex);
      fixedSpaces.push(assigned);
      floorAreas[targetLevelIndex] += areaOf(assigned);
    });

  return fixedSpaces;
}

function pushSpace(spaces, descriptor, levelIndex, countIndex, areaM2) {
  const level = getLevelName(levelIndex);
  const suffix =
    descriptor.maxCount === 1 && !descriptor.unitized && countIndex === 0
      ? ""
      : ` ${countIndex + 1}`;
  spaces.push({
    id: `${slugify(descriptor.type)}-${levelIndex}-${countIndex}`,
    label: `${descriptor.name}${suffix}`,
    name: `${descriptor.name}${suffix}`,
    area: round(areaM2),
    count: 1,
    level,
    levelIndex,
    spaceType: descriptor.type,
    wet: descriptor.wet === true,
    source: "residential_program_engine",
  });
}

export function generateResidentialProgramBrief({
  subType = "detached-house",
  totalAreaM2 = 160,
  siteAreaM2 = null,
  levelCountOverride = null,
  entranceDirection = "S",
  qualityTier = "mid",
  customNotes = "",
} = {}) {
  const template = resolveTemplate(subType);
  const levelCount = resolveLevelCount(subType, totalAreaM2, siteAreaM2, {
    levelCountOverride,
  });
  const usableArea = round(totalAreaM2 * (1 - template.circulationRatio));
  let spaces = [];

  template.spaces.forEach((descriptor) => {
    const count = descriptor.maxCount
      ? descriptor.maxCount
      : descriptor.countByArea
        ? resolveCountFromArea(
            totalAreaM2,
            descriptor.countByArea,
            descriptor.countValues,
          )
        : 1;
    const grossArea = Math.max(
      Number(descriptor.minArea || 0) * Math.max(1, count),
      round(usableArea * Number(descriptor.share || 0)),
    );
    const unitArea = round(grossArea / Math.max(1, count));

    if (descriptor.level === "Ground") {
      for (let index = 0; index < count; index += 1) {
        pushSpace(spaces, descriptor, 0, index, unitArea);
      }
      return;
    }

    if (descriptor.level === "Upper") {
      if (levelCount <= 1) {
        for (let index = 0; index < count; index += 1) {
          pushSpace(spaces, descriptor, 0, index, unitArea);
        }
        return;
      }

      const distribution = distributeCounts(count, Math.max(1, levelCount - 1));
      distribution.forEach((countOnLevel, upperIndex) => {
        for (let index = 0; index < countOnLevel; index += 1) {
          pushSpace(spaces, descriptor, upperIndex + 1, index, unitArea);
        }
      });
      return;
    }

    if (descriptor.level === "All") {
      const perLevelArea = round(grossArea / levelCount);
      for (let levelIndex = 0; levelIndex < levelCount; levelIndex += 1) {
        pushSpace(spaces, descriptor, levelIndex, 0, perLevelArea);
      }
    }
  });

  const stairArea =
    levelCount > 1 ? Math.max(7.5, round(totalAreaM2 * 0.04)) : 0;
  if (stairArea > 0) {
    for (let levelIndex = 0; levelIndex < levelCount; levelIndex += 1) {
      pushSpace(
        spaces,
        { name: "Stair", type: "stair", maxCount: 1 },
        levelIndex,
        0,
        stairArea / levelCount,
      );
    }
  }

  const areaFit = fitSpacesToTargetArea(spaces, totalAreaM2);
  spaces = rebalanceUpperSpacesAcrossLevels(areaFit.spaces, levelCount);

  const adjacency = [
    ["Entrance Hall", "Living Room"],
    ["Living Room", "Dining Area"],
    ["Kitchen", "Dining Area"],
    ["Kitchen", "Utility"],
    ["Primary Bedroom", "Bathroom"],
  ];

  const preferences = {
    entranceDirection,
    preferredRoof: template.preferredRoof,
    circulationRatio: template.circulationRatio,
    customNotes: customNotes || null,
  };

  return {
    ...createProjectBrief({
      projectType: subType,
      targetAreaM2: totalAreaM2,
      qualityTier,
      preferences,
      requiredSpaces: spaces,
    }),
    schema_version: "program-brief-v1",
    supportedResidentialSubtype: true,
    levelCount,
    entranceDirection,
    circulationRatio: template.circulationRatio,
    adjacency,
    wetCoreStrategy:
      levelCount > 1 ? "stacked_vertical_wet_core" : "single_level_wet_core",
    recommendedRoof: template.preferredRoof,
    spaces,
    warnings: areaFit.warnings,
    blockers: [],
    confidence: {
      score: 0.88,
      sources: ["residential program template", "uk residential v2 rules"],
      fallbackReason: null,
    },
  };
}

export function normalizeResidentialProgramSpaces(programSpaces = []) {
  return (Array.isArray(programSpaces) ? programSpaces : []).map(
    (space, index) => {
      const explicitNumeric = Number.isFinite(Number(space?.levelIndex))
        ? Number(space.levelIndex)
        : Number.isFinite(Number(space?.level_index))
          ? Number(space.level_index)
          : null;
      const rawIndex =
        explicitNumeric !== null
          ? explicitNumeric
          : levelIndexFromLabel(space?.level);
      const levelIndex = Math.max(0, Math.floor(rawIndex || 0));
      return {
        id: space.id || `manual-space-${index}`,
        label: String(space.label || space.name || `Space ${index + 1}`),
        name: String(space.name || space.label || `Space ${index + 1}`),
        area: round(space.area || 0),
        count: Math.max(1, Number(space.count || 1)),
        level: levelName(levelIndex),
        levelIndex,
        level_index: levelIndex,
        spaceType: slugify(
          space.spaceType || space.label || space.name || "space",
        ),
        wet: Boolean(space.wet),
        source: space.source || "manual_program",
      };
    },
  );
}

export default {
  generateResidentialProgramBrief,
  normalizeResidentialProgramSpaces,
};
