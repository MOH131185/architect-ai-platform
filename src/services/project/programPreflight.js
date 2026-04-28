/**
 * programPreflight - validates a programme + floor count before they are
 * shipped to ProjectGraph. Runs in two places so neither UI nor API can
 * bypass the gate:
 * - src/components/ArchitectAIWizardContainer.jsx (UI generation handler)
 * - src/services/project/projectGraphVerticalSliceService.js (service entry)
 *
 * Returns:
 *   {
 *     ok: boolean,
 *     errors: string[],          // halts generation
 *     warnings: string[],        // surfaced to user but does not halt
 *     normalizedProgramSpaces,   // every space carries level + levelIndex
 *     floorCount,
 *     levels: [{ index, name, spaces[], totalArea }],
 *     totalArea,
 *   }
 *
 * Memory rule (feedback_floor_count_autodetect): manual selections must
 * propagate without silent caps. The preflight enforces "every required
 * level has a real space", which is the catch for the Ground-collapse
 * regression.
 */

import { levelName, normalizeProgramSpaces } from "./levelUtils.js";
import { resolveAuthoritativeFloorCount } from "./floorCountAuthority.js";

const GROUND_FLOOR_PUBLIC_HINTS = [
  "living",
  "lounge",
  "kitchen",
  "dining",
  "entrance",
  "hall",
  "foyer",
  "lobby",
  "wc",
  "toilet",
  "utility",
  "study",
  "office",
  "reception",
  "garage",
];

const UPPER_FLOOR_PRIVATE_HINTS = [
  "bedroom",
  "bath",
  "ensuite",
  "en-suite",
  "wardrobe",
  "study",
  "landing",
  "circulation",
  "stair",
];

const STAIR_OR_CORE_HINTS = [
  "stair",
  "core",
  "lift",
  "elevator",
  "hall",
  "circulation",
];

function spaceLabel(space) {
  return String(space?.name || space?.label || "").toLowerCase();
}

function spaceTypeLabel(space) {
  return String(space?.spaceType || "").toLowerCase();
}

function spaceMatchesAny(space, hints) {
  const label = spaceLabel(space);
  const type = spaceTypeLabel(space);
  return hints.some((hint) => label.includes(hint) || type.includes(hint));
}

function isResidentialCategory(projectDetails = {}) {
  const category = String(projectDetails?.category || "").toLowerCase();
  if (category === "residential") return true;
  const subType = String(projectDetails?.subType || "").toLowerCase();
  return /house|dwelling|apartment|residence|villa/.test(subType);
}

export function runProgramPreflight({
  projectDetails = {},
  programSpaces = [],
  floorCount,
} = {}) {
  const explicit = Number(floorCount);
  const resolvedFloorCount =
    Number.isFinite(explicit) && explicit > 0
      ? Math.max(1, Math.floor(explicit))
      : resolveAuthoritativeFloorCount(projectDetails, { fallback: 1 })
          .floorCount;
  const normalised = normalizeProgramSpaces(programSpaces, resolvedFloorCount);
  const errors = [];
  const warnings = [];

  if (!Array.isArray(normalised) || normalised.length === 0) {
    errors.push("At least one programme space is required.");
  }

  const levels = Array.from({ length: resolvedFloorCount }, (_, index) => {
    const spacesOnLevel = normalised.filter(
      (space) => Number(space?.levelIndex) === index,
    );
    const totalArea = spacesOnLevel.reduce(
      (sum, space) =>
        sum +
        Math.max(0, Number(space?.area || 0)) *
          Math.max(1, Number(space?.count || 1)),
      0,
    );
    return {
      index,
      name: levelName(index),
      spaces: spacesOnLevel,
      totalArea,
    };
  });

  levels.forEach((level) => {
    if (level.spaces.length === 0) {
      errors.push(
        `${level.name} floor has no programme spaces. Assign at least one space to ${level.name} or reduce the floor count.`,
      );
    }
  });

  if (resolvedFloorCount > 1) {
    const hasCore = normalised.some((space) =>
      spaceMatchesAny(space, STAIR_OR_CORE_HINTS),
    );
    if (!hasCore) {
      warnings.push(
        "Multi-storey project should include a stair, hall, or circulation core space.",
      );
    }
  }

  const totalArea = normalised.reduce(
    (sum, space) =>
      sum +
      Math.max(0, Number(space?.area || 0)) *
        Math.max(1, Number(space?.count || 1)),
    0,
  );

  const targetArea = Number(projectDetails?.area || 0);
  if (targetArea > 0 && totalArea > 0) {
    const ratio = totalArea / targetArea;
    if (ratio < 0.7) {
      warnings.push(
        `Programme total ${Math.round(totalArea)} m² is only ${Math.round(ratio * 100)}% of the target ${Math.round(targetArea)} m².`,
      );
    }
    if (ratio > 1.15) {
      errors.push(
        `Programme total ${Math.round(totalArea)} m² is ${Math.round(ratio * 100)}% of the target ${Math.round(targetArea)} m². Reduce areas or increase the project area.`,
      );
    }
  }

  if (isResidentialCategory(projectDetails) && normalised.length > 0) {
    const ground = levels[0];
    if (ground && ground.spaces.length > 0) {
      const hasPublic = ground.spaces.some((space) =>
        spaceMatchesAny(space, GROUND_FLOOR_PUBLIC_HINTS),
      );
      if (!hasPublic) {
        warnings.push(
          "Residential ground floor has no living, kitchen, or arrival space. Check the programme.",
        );
      }
    }
    if (resolvedFloorCount >= 2) {
      const upperLevels = levels.slice(1);
      const hasPrivate = upperLevels.some((level) =>
        level.spaces.some((space) =>
          spaceMatchesAny(space, UPPER_FLOOR_PRIVATE_HINTS),
        ),
      );
      if (!hasPrivate) {
        warnings.push(
          "Residential upper floors have no bedroom, bathroom, or private space. Check the programme.",
        );
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    normalizedProgramSpaces: normalised,
    floorCount: resolvedFloorCount,
    levels,
    totalArea,
  };
}

export default runProgramPreflight;
