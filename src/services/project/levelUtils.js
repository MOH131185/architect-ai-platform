/**
 * levelUtils - canonical floor/level name <-> index conversion.
 *
 * Single authority used by:
 * - src/components/steps/SpecsStep.jsx (programme table editing)
 * - src/components/specs/BuildingProgramTable.jsx (CSV import)
 * - src/hooks/useArchitectAIWorkflow.js (request compaction)
 * - src/services/project/projectGraphVerticalSliceService.js (normalisation)
 * - src/services/project/residentialProgramEngine.js (residential template
 *   normalisation)
 * - src/services/project/programPreflight.js (validation)
 *
 * Memory rule (feedback_floor_count_autodetect): manual level selections must
 * propagate end-to-end without silent caps. The `level` string and the
 * numeric `levelIndex` must always agree. Missing input falls back to
 * Ground (index 0) only as a deliberate last resort.
 */

export const LEVEL_NAMES = Object.freeze([
  "Ground",
  "First",
  "Second",
  "Third",
  "Fourth",
  "Fifth",
  "Sixth",
  "Seventh",
]);

export const LEVEL_NAME_TO_INDEX = Object.freeze({
  basement: -1,
  "lower ground": -1,
  ground: 0,
  "ground floor": 0,
  "ground level": 0,
  g: 0,
  0: 0,
  first: 1,
  "first floor": 1,
  1: 1,
  "level 1": 1,
  mezzanine: 1,
  second: 2,
  "second floor": 2,
  2: 2,
  "level 2": 2,
  third: 3,
  "third floor": 3,
  3: 3,
  "level 3": 3,
  fourth: 4,
  "fourth floor": 4,
  4: 4,
  "level 4": 4,
  fifth: 5,
  "fifth floor": 5,
  5: 5,
  "level 5": 5,
  sixth: 6,
  "sixth floor": 6,
  6: 6,
  seventh: 7,
  "seventh floor": 7,
  7: 7,
  roof: 999,
  rooftop: 999,
});

export const LEVEL_ROOF_SENTINEL = 999;

export function levelName(index = 0) {
  const numeric = Number(index);
  if (!Number.isFinite(numeric)) return LEVEL_NAMES[0];
  const safe = Math.max(0, Math.floor(numeric));
  return LEVEL_NAMES[safe] || `Level ${safe}`;
}

export function levelIndexFromLabel(value) {
  if (value === null || value === undefined) return 0;
  const numericPrimitive = Number(value);
  if (Number.isFinite(numericPrimitive) && typeof value !== "string") {
    return Math.floor(numericPrimitive);
  }
  const raw = String(value).trim().toLowerCase();
  if (!raw) return 0;
  if (Object.prototype.hasOwnProperty.call(LEVEL_NAME_TO_INDEX, raw)) {
    return LEVEL_NAME_TO_INDEX[raw];
  }
  const levelMatch = raw.match(/^level\s*(-?\d+)$/);
  if (levelMatch) return Number.parseInt(levelMatch[1], 10);
  const numericString = Number.parseInt(raw, 10);
  if (Number.isFinite(numericString)) return numericString;
  return 0;
}

export function normalizeLevelIndex(value, floorCount = 1) {
  const safeFloorCount = Math.max(1, Math.floor(Number(floorCount) || 1));
  const maxIndex = safeFloorCount - 1;
  let numeric = Number(value);
  if (!Number.isFinite(numeric)) numeric = 0;
  if (numeric === LEVEL_ROOF_SENTINEL) numeric = maxIndex;
  return Math.max(0, Math.min(maxIndex, Math.floor(numeric)));
}

export function normalizeSpaceLevel(space = {}, floorCount = 1) {
  const explicitNumeric = Number.isFinite(Number(space?.levelIndex))
    ? Number(space.levelIndex)
    : Number.isFinite(Number(space?.level_index))
      ? Number(space.level_index)
      : Number.isFinite(Number(space?.target_level_index))
        ? Number(space.target_level_index)
        : null;
  const rawIndex =
    explicitNumeric !== null
      ? explicitNumeric
      : levelIndexFromLabel(space?.level ?? space?.target_level);
  const levelIndex = normalizeLevelIndex(rawIndex, floorCount);
  return {
    ...space,
    levelIndex,
    level_index: levelIndex,
    level: levelName(levelIndex),
  };
}

export function normalizeProgramSpaces(spaces = [], floorCount = 1) {
  const safeFloorCount = Math.max(1, Math.floor(Number(floorCount) || 1));
  const source = Array.isArray(spaces) ? spaces : [];
  const normalised = source.map((space) =>
    normalizeSpaceLevel(space, safeFloorCount),
  );
  if (Array.isArray(spaces)) {
    if (Object.prototype.hasOwnProperty.call(spaces, "_calculatedFloorCount")) {
      normalised._calculatedFloorCount = spaces._calculatedFloorCount;
    }
    if (Object.prototype.hasOwnProperty.call(spaces, "_floorMetrics")) {
      normalised._floorMetrics = spaces._floorMetrics;
    }
  }
  return normalised;
}

export function buildLevelOptions(floorCount = 1) {
  const safeFloorCount = Math.max(1, Math.floor(Number(floorCount) || 1));
  const options = [];
  for (let index = 0; index < safeFloorCount; index += 1) {
    options.push({ index, label: levelName(index) });
  }
  return options;
}

export default {
  LEVEL_NAMES,
  LEVEL_NAME_TO_INDEX,
  LEVEL_ROOF_SENTINEL,
  levelName,
  levelIndexFromLabel,
  normalizeLevelIndex,
  normalizeSpaceLevel,
  normalizeProgramSpaces,
  buildLevelOptions,
};
