/**
 * floorCountAuthority - single source of truth for the wizard's floor count.
 *
 * Phases 1-8 fixed the request/normalisation transport layer (see
 * levelUtils.js). This module fixes the *generation* layer: every UI
 * component, every program engine path, every preflight check, and the
 * ProjectGraph request must agree on which floor count is currently
 * authoritative.
 *
 * Authority rule:
 * - if projectDetails.floorCountLocked === true: floorCount wins (source: locked).
 * - else: autoDetectedFloorCount || floorCount || fallback (source: auto/manual/fallback).
 *
 * Memory rule (feedback_floor_count_autodetect): manual selections must
 * propagate without silent caps. The resolver clamps only when the caller
 * supplies a maxFloors AND records `clampedFromUser: true` so the wizard
 * can warn the user instead of failing silently.
 */

import autoLevelAssignmentService from "../autoLevelAssignmentService.js";
import { levelName, normalizeProgramSpaces } from "./levelUtils.js";

export function resolveAuthoritativeFloorCount(
  projectDetails = {},
  { fallback = 2, maxFloors = null } = {},
) {
  const locked = Boolean(projectDetails?.floorCountLocked);
  const lockedCount = Number(projectDetails?.floorCount);
  const autoCount = Number(projectDetails?.autoDetectedFloorCount);
  const manualCount = Number(projectDetails?.floorCount);
  const fallbackCount = Math.max(1, Math.floor(Number(fallback) || 2));

  let raw;
  let source;

  if (locked && Number.isFinite(lockedCount) && lockedCount > 0) {
    raw = lockedCount;
    source = "locked";
  } else if (Number.isFinite(autoCount) && autoCount > 0) {
    raw = autoCount;
    source = "auto";
  } else if (Number.isFinite(manualCount) && manualCount > 0) {
    raw = manualCount;
    source = "manual";
  } else {
    raw = fallbackCount;
    source = "fallback";
  }

  const requested = Math.max(1, Math.floor(raw));
  const cap =
    Number.isFinite(Number(maxFloors)) && Number(maxFloors) > 0
      ? Math.max(1, Math.floor(Number(maxFloors)))
      : null;
  const clamped = cap ? Math.min(requested, cap) : requested;
  return {
    floorCount: clamped,
    requested,
    source,
    clampedFromUser: cap ? requested > cap : false,
    maxFloors: cap,
  };
}

function isStairOrCircSpace(space = {}) {
  const haystack =
    `${space?.spaceType || ""} ${space?.name || ""} ${space?.label || ""}`.toLowerCase();
  return (
    haystack.includes("stair") ||
    haystack.includes("circulation") ||
    haystack.includes("vertical-circ")
  );
}

function spaceArea(space = {}) {
  return (
    Math.max(0, Number(space.area || 0)) * Math.max(1, Number(space.count || 1))
  );
}

// Reassign space to the given level, keeping level/levelIndex/level_index
// in sync via levelUtils canonical names.
function assignToLevel(space, levelIndex) {
  const safeIndex = Math.max(0, Math.floor(Number(levelIndex) || 0));
  return {
    ...space,
    level: levelName(safeIndex),
    levelIndex: safeIndex,
    level_index: safeIndex,
  };
}

function levelHasStair(spaces, levelIndex) {
  return spaces.some(
    (space) =>
      Number(space.levelIndex) === levelIndex && isStairOrCircSpace(space),
  );
}

function ensureStairsOnEveryLevel(spaces, floorCount) {
  if (floorCount <= 1) return { spaces, addedStairs: 0 };
  const next = [...spaces];
  let added = 0;
  for (let level = 0; level < floorCount; level += 1) {
    if (levelHasStair(next, level)) continue;
    next.push(
      assignToLevel(
        {
          id: `stair-${level}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          name: level === 0 ? "Stair & Hall" : "Stair",
          label: level === 0 ? "Stair & Hall" : "Stair",
          spaceType: "stair",
          area: 6,
          count: 1,
          source: "floorCountAuthority_sync",
        },
        level,
      ),
    );
    added += 1;
  }
  return { spaces: next, addedStairs: added };
}

// Move the largest non-stair, non-Ground-locked space from the most
// populated upper level into an empty upper level. Repeats until every
// upper level has at least one non-stair space.
function fillEmptyUpperLevels(spaces, floorCount) {
  if (floorCount <= 1) return { spaces, movedRows: 0 };
  let working = [...spaces];
  let moved = 0;
  for (let attempts = 0; attempts < floorCount; attempts += 1) {
    const byLevel = Array.from({ length: floorCount }, () => []);
    working.forEach((space) => {
      const idx = Math.max(
        0,
        Math.min(floorCount - 1, Number(space.levelIndex) || 0),
      );
      byLevel[idx].push(space);
    });
    let emptyLevel = -1;
    for (let level = 1; level < floorCount; level += 1) {
      const nonStair = byLevel[level].filter(
        (space) => !isStairOrCircSpace(space),
      );
      if (nonStair.length === 0) {
        emptyLevel = level;
        break;
      }
    }
    if (emptyLevel < 0) break;

    let donorLevel = -1;
    let donorAreaSum = -Infinity;
    for (let level = 1; level < floorCount; level += 1) {
      if (level === emptyLevel) continue;
      const nonStair = byLevel[level].filter(
        (space) => !isStairOrCircSpace(space),
      );
      if (nonStair.length < 2) continue;
      const sum = nonStair.reduce((acc, space) => acc + spaceArea(space), 0);
      if (sum > donorAreaSum) {
        donorAreaSum = sum;
        donorLevel = level;
      }
    }
    if (donorLevel < 0) {
      // Fall back to Ground if no upper donor has spare rows.
      const groundDonors = byLevel[0]
        .filter((space) => !isStairOrCircSpace(space))
        .filter((space) => {
          const haystack =
            `${space?.spaceType || ""} ${space?.name || ""}`.toLowerCase();
          return !(
            haystack.includes("entrance") ||
            haystack.includes("kitchen") ||
            haystack.includes("living") ||
            haystack.includes("dining") ||
            haystack.includes("wc") ||
            haystack.includes("utility")
          );
        });
      if (groundDonors.length === 0) break;
      donorLevel = 0;
    }
    const donorPool = byLevel[donorLevel]
      .filter((space) => !isStairOrCircSpace(space))
      .sort((a, b) => spaceArea(b) - spaceArea(a));
    if (donorPool.length === 0) break;
    const donor = donorPool[0];
    working = working.map((space) =>
      space === donor ? assignToLevel(donor, emptyLevel) : space,
    );
    moved += 1;
  }
  return { spaces: working, movedRows: moved };
}

export function syncProgramToFloorCount(
  programSpaces = [],
  floorCount = 1,
  { buildingType = "mixed-use", projectDetails = {} } = {},
) {
  const safeFloorCount = Math.max(1, Math.floor(Number(floorCount) || 1));
  if (!Array.isArray(programSpaces) || programSpaces.length === 0) {
    const empty = [];
    empty._calculatedFloorCount = safeFloorCount;
    empty._floorMetrics = projectDetails?.floorMetrics ?? null;
    return { spaces: empty, warnings: [], changed: false };
  }

  // Step 1: canonical level/levelIndex round-trip + clamp.
  const normalised = normalizeProgramSpaces(programSpaces, safeFloorCount);
  let movedDuringNormalise = false;
  const normalisedClamped = normalised.map((space, index) => {
    const original = programSpaces[index] || {};
    const originalIdx = Number(original?.levelIndex ?? original?.level_index);
    if (Number.isFinite(originalIdx) && originalIdx !== space.levelIndex) {
      movedDuringNormalise = true;
    }
    return space;
  });

  // Step 2: redistribute via the existing assignment service so the rules
  // around public/upper/private rooms stay in one place. Only do this when
  // we have spaces and a multi-level brief; single-level shortcuts to a
  // Ground-only programme.
  let working = normalisedClamped;
  let stepRedistributed = false;
  if (safeFloorCount > 1) {
    const reassigned = autoLevelAssignmentService.autoAssignSpacesToLevels(
      normalisedClamped,
      safeFloorCount,
      buildingType,
    );
    if (Array.isArray(reassigned) && reassigned.length > 0) {
      working = reassigned.map((space, index) => {
        const idx = Math.max(
          0,
          Math.min(safeFloorCount - 1, Number(space.levelIndex) || 0),
        );
        return assignToLevel(space, idx);
      });
      // If the assignment moved at least one row, mark changed.
      stepRedistributed = working.some((space, index) => {
        const before = normalisedClamped[index];
        return before && Number(before.levelIndex) !== Number(space.levelIndex);
      });
    }
  } else {
    working = normalisedClamped.map((space) => assignToLevel(space, 0));
  }

  // Step 3: ensure every upper level has at least one non-stair room.
  const fillResult = fillEmptyUpperLevels(working, safeFloorCount);
  working = fillResult.spaces;

  // Step 4: ensure every level has a stair/circulation when floorCount > 1.
  const stairResult = ensureStairsOnEveryLevel(working, safeFloorCount);
  working = stairResult.spaces;

  // Step 5: re-stamp diagnostic metadata. The UI does NOT read this for
  // dropdown rendering (that's the new resolver's job) but we still keep
  // it for downstream consumers that grep for the array-level metadata.
  working._calculatedFloorCount = safeFloorCount;
  working._floorMetrics = projectDetails?.floorMetrics ?? null;

  const warnings = [];
  if (stairResult.addedStairs > 0) {
    warnings.push(
      `Inserted ${stairResult.addedStairs} circulation/stair space${stairResult.addedStairs === 1 ? "" : "s"} to satisfy multi-storey access.`,
    );
  }
  if (fillResult.movedRows > 0) {
    warnings.push(
      `Redistributed ${fillResult.movedRows} room${fillResult.movedRows === 1 ? "" : "s"} so every upper level has programme content.`,
    );
  }

  const changed =
    movedDuringNormalise ||
    stepRedistributed ||
    fillResult.movedRows > 0 ||
    stairResult.addedStairs > 0;

  return {
    spaces: working,
    warnings,
    changed,
  };
}

export default {
  resolveAuthoritativeFloorCount,
  syncProgramToFloorCount,
};
