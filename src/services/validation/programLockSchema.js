/**
 * ProgramSpacesLock Schema & Builder
 *
 * Converts user-supplied programSpaces into a hard, immutable lock
 * that gates every stage of the pipeline. Once built, the lock
 * dictates which spaces exist on which levels, and the pipeline
 * MUST NOT add, remove, or redistribute them.
 *
 * Invariants enforced:
 * - forbidUnexpectedLevels: no panel may depict a level not in the lock
 * - maxProgramViolations: 0 (any mismatch blocks composition)
 */

import { computeCDSHashSync } from "./cdsHash.js";

/**
 * @typedef {Object} LockedSpace
 * @property {string} spaceId       - Unique identifier (slug)
 * @property {string} name          - Human-readable name
 * @property {number} lockedLevel   - 0-based level index (0 = ground)
 * @property {number} count         - How many instances on that level
 * @property {number} targetAreaM2  - Target area in m²
 * @property {boolean} hard         - Always true (immutable)
 * @property {string[]} [instanceIds] - DNA v2 room instance IDs for this space
 * @property {string} [spaceHash]   - Deterministic hash of space identity
 */

/**
 * @typedef {Object} ProgramSpacesLock
 * @property {string} version
 * @property {number} levelCount
 * @property {LockedSpace[]} spaces
 * @property {{ forbidUnexpectedLevels: boolean, maxProgramViolations: number, areaTolerance: number }} invariants
 * @property {Array<{spaceA: string, spaceB: string, priority: 'required'|'preferred'}>} [adjacencyRequirements]
 * @property {string} hash
 */

/** Default residential adjacency requirements (mirrors BuildingModel.ADJACENCY_RULES) */
const DEFAULT_ADJACENCY = {
  Entry: {
    "Living Room": "required",
    Hall: "required",
    Circulation: "preferred",
  },
  "Living Room": {
    Kitchen: "preferred",
    Dining: "preferred",
    Entry: "required",
  },
  Kitchen: {
    Dining: "required",
    "Living Room": "preferred",
    Utility: "preferred",
  },
  Dining: { Kitchen: "required", "Living Room": "preferred" },
  "Master Bedroom": { "En-Suite": "required", "Walk-in Wardrobe": "preferred" },
  Bedroom: { Bathroom: "preferred" },
};

/**
 * Build adjacency requirements based on the spaces in the program.
 * Only includes requirements where both spaces are present.
 *
 * @param {Array} spaces - Array of { name, ... } space objects
 * @returns {Array<{spaceA: string, spaceB: string, priority: 'required'|'preferred'}>}
 */
function buildAdjacencyRequirements(spaces) {
  const requirements = [];
  const spaceNames = spaces.map((s) => s.name);
  for (const [roomA, neighbors] of Object.entries(DEFAULT_ADJACENCY)) {
    if (!spaceNames.some((n) => n.toLowerCase().includes(roomA.toLowerCase())))
      continue;
    for (const [roomB, priority] of Object.entries(neighbors)) {
      if (
        !spaceNames.some((n) => n.toLowerCase().includes(roomB.toLowerCase()))
      )
        continue;
      requirements.push({ spaceA: roomA, spaceB: roomB, priority });
    }
  }
  return requirements;
}

/**
 * Normalise a floor/level descriptor to a 0-based index.
 *
 * @param {string|number|undefined} raw
 * @returns {number}
 */
function normaliseLevelIndex(raw) {
  if (typeof raw === "number") return raw;
  const s = String(raw || "")
    .trim()
    .toLowerCase();
  if (!s || s === "ground" || s === "g" || s === "0") return 0;
  if (s === "basement" || s === "b" || s === "-1" || s === "lower") return -1;
  if (s === "1" || s === "1st" || s === "first") return 1;
  if (s === "2" || s === "2nd" || s === "second") return 2;
  if (s === "3" || s === "3rd" || s === "third") return 3;
  const num = parseInt(s, 10);
  return isNaN(num) ? 0 : num;
}

/**
 * Slugify a space name for ID generation.
 */
function slugify(name) {
  return String(name || "room")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

/**
 * Build a ProgramSpacesLock from raw user input.
 *
 * @param {Array} programSpaces - User-supplied array of spaces
 *   Each item: { name, area, floor?, level?, count?, preferredOrientation? }
 * @param {Object} [options]
 * @param {number} [options.floors] - Explicit floor count override
 * @returns {ProgramSpacesLock}
 */
export function buildProgramLock(programSpaces, options = {}) {
  if (!Array.isArray(programSpaces) || programSpaces.length === 0) {
    throw new ProgramLockError("programSpaces must be a non-empty array");
  }

  const seen = new Map(); // spaceId -> count (for dedup)
  const spaces = [];

  for (const raw of programSpaces) {
    const name = raw.name || raw.type || "Room";
    const level = normaliseLevelIndex(
      raw.floor ?? raw.level ?? raw.lockedLevel ?? 0,
    );
    const area = parseFloat(raw.area || raw.targetAreaM2 || raw.area_m2) || 20;
    const count = parseInt(raw.count, 10) || 1;

    const baseId = slugify(name);
    const suffix = seen.get(baseId) || 0;
    seen.set(baseId, suffix + 1);
    const spaceId = suffix === 0 ? baseId : `${baseId}_${suffix}`;

    // Collect instance IDs from DNA v2 rooms if available
    const instanceIds = [];
    if (Array.isArray(raw.instanceIds)) {
      instanceIds.push(...raw.instanceIds);
    } else if (raw.instanceId) {
      instanceIds.push(raw.instanceId);
    }

    // Compute per-space hash for integrity tracking
    const spaceHash = computeCDSHashSync({
      spaceId,
      name,
      lockedLevel: level,
      targetAreaM2: area,
    });

    spaces.push({
      spaceId,
      name,
      lockedLevel: level,
      count,
      targetAreaM2: area,
      hard: true,
      instanceIds,
      spaceHash,
    });
  }

  // Derive level count: max lockedLevel + 1 (minimum 1)
  const maxLevel = Math.max(0, ...spaces.map((s) => s.lockedLevel));
  const levelCount = options.floors
    ? Math.max(options.floors, maxLevel + 1)
    : maxLevel + 1;

  const areaTolerance = options.areaTolerance ?? 0.03; // Default 3%

  const adjacencyRequirements = buildAdjacencyRequirements(spaces);

  const lock = {
    version: "1.0.0",
    levelCount,
    spaces,
    adjacencyRequirements,
    invariants: {
      forbidUnexpectedLevels: true,
      maxProgramViolations: 0,
      areaTolerance,
    },
  };

  lock.hash = computeCDSHashSync(lock);
  return lock;
}

/**
 * Get all spaces assigned to a given level.
 *
 * @param {ProgramSpacesLock} lock
 * @param {number} levelIndex - 0-based
 * @returns {LockedSpace[]}
 */
export function getSpacesForLevel(lock, levelIndex) {
  if (!lock || !lock.spaces) return [];
  return lock.spaces.filter((s) => s.lockedLevel === levelIndex);
}

/**
 * Get a human-readable room list for a given level.
 *
 * @param {ProgramSpacesLock} lock
 * @param {number} levelIndex
 * @returns {string} e.g. "Living Room (25m²), Kitchen (15m²), WC (4m²)"
 */
export function getRoomListForLevel(lock, levelIndex) {
  const spaces = getSpacesForLevel(lock, levelIndex);
  if (spaces.length === 0) return "";
  return spaces.map((s) => `${s.name} (${s.targetAreaM2}m²)`).join(", ");
}

/**
 * Get all distinct level indices from the lock.
 *
 * @param {ProgramSpacesLock} lock
 * @returns {number[]} sorted ascending
 */
export function getLevels(lock) {
  if (!lock || !lock.spaces) return [0];
  const levels = [...new Set(lock.spaces.map((s) => s.lockedLevel))];
  return levels.sort((a, b) => a - b);
}

/**
 * Get instance IDs for all spaces on a given level.
 *
 * @param {ProgramSpacesLock} lock
 * @param {number} levelIndex - 0-based
 * @returns {string[]} All instance IDs for spaces on that level
 */
export function getSpaceInstanceIds(lock, levelIndex) {
  if (!lock || !lock.spaces) return [];
  return lock.spaces
    .filter((s) => s.lockedLevel === levelIndex)
    .flatMap((s) => s.instanceIds || []);
}

/**
 * Validate that a set of panels respects the lock's level constraints.
 * Returns violations if any panel depicts a level not in the lock.
 *
 * @param {ProgramSpacesLock} lock
 * @param {Array} panelPlan - Array of { panelType, levelIndex? }
 * @returns {{ valid: boolean, violations: string[] }}
 */
export function validatePanelPlanAgainstLock(lock, panelPlan) {
  const violations = [];
  if (!lock) return { valid: true, violations };

  const allowedLevels = getLevels(lock);

  for (const panel of panelPlan) {
    const { panelType, levelIndex } = panel;

    // Check floor_plan panels
    if (panelType && panelType.startsWith("floor_plan_")) {
      if (levelIndex !== undefined && !allowedLevels.includes(levelIndex)) {
        violations.push(
          `Panel ${panelType} depicts level ${levelIndex} which is not in the program lock (allowed: ${allowedLevels.join(",")})`,
        );
      }

      // Check that a 1-level program doesn't have upper floor plans
      if (lock.levelCount === 1) {
        if (
          panelType === "floor_plan_first" ||
          panelType === "floor_plan_level2"
        ) {
          violations.push(
            `Panel ${panelType} generated for a ${lock.levelCount}-level program — no upper floor should exist`,
          );
        }
      }

      if (lock.levelCount <= 2 && panelType === "floor_plan_level2") {
        violations.push(
          `Panel ${panelType} generated for a ${lock.levelCount}-level program — level 2 should not exist`,
        );
      }
    }

    // Check section panels for unexpected levels
    if (panelType && panelType.startsWith("section_")) {
      // Sections shouldn't show more levels than lock allows
      // (This is enforced via prompt, checked structurally post-render)
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

/**
 * Custom error for ProgramLock failures.
 */
export class ProgramLockError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "ProgramLockError";
    this.details = details;
  }
}

export { buildAdjacencyRequirements };

export default {
  buildProgramLock,
  buildAdjacencyRequirements,
  getSpacesForLevel,
  getSpaceInstanceIds,
  getRoomListForLevel,
  getLevels,
  validatePanelPlanAgainstLock,
  ProgramLockError,
};
