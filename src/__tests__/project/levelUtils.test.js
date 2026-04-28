import {
  LEVEL_NAMES,
  LEVEL_NAME_TO_INDEX,
  LEVEL_ROOF_SENTINEL,
  buildLevelOptions,
  levelIndexFromLabel,
  levelName,
  normalizeLevelIndex,
  normalizeProgramSpaces,
  normalizeSpaceLevel,
} from "../../services/project/levelUtils.js";

describe("levelUtils", () => {
  describe("levelName", () => {
    test("maps canonical indices to canonical labels", () => {
      expect(levelName(0)).toBe("Ground");
      expect(levelName(1)).toBe("First");
      expect(levelName(2)).toBe("Second");
      expect(levelName(3)).toBe("Third");
    });
    test("falls through to 'Level N' beyond the named range", () => {
      expect(levelName(8)).toBe("Level 8");
      expect(levelName(20)).toBe("Level 20");
    });
    test("invalid input becomes Ground", () => {
      expect(levelName(undefined)).toBe("Ground");
      expect(levelName(null)).toBe("Ground");
      expect(levelName(NaN)).toBe("Ground");
      expect(levelName(-3)).toBe("Ground");
    });
  });

  describe("levelIndexFromLabel", () => {
    test("named labels", () => {
      expect(levelIndexFromLabel("Ground")).toBe(0);
      expect(levelIndexFromLabel("First")).toBe(1);
      expect(levelIndexFromLabel("Second")).toBe(2);
      expect(levelIndexFromLabel("Third")).toBe(3);
      expect(levelIndexFromLabel("Fourth")).toBe(4);
      expect(levelIndexFromLabel("Fifth")).toBe(5);
    });
    test("'<Name> Floor' aliases", () => {
      expect(levelIndexFromLabel("Ground Floor")).toBe(0);
      expect(levelIndexFromLabel("First Floor")).toBe(1);
      expect(levelIndexFromLabel("Second Floor")).toBe(2);
    });
    test("'Level N' notation", () => {
      expect(levelIndexFromLabel("Level 1")).toBe(1);
      expect(levelIndexFromLabel("Level 2")).toBe(2);
      expect(levelIndexFromLabel("level 3")).toBe(3);
    });
    test("numeric strings", () => {
      expect(levelIndexFromLabel("0")).toBe(0);
      expect(levelIndexFromLabel("1")).toBe(1);
      expect(levelIndexFromLabel("2")).toBe(2);
    });
    test("numeric primitives", () => {
      expect(levelIndexFromLabel(2)).toBe(2);
      expect(levelIndexFromLabel(0)).toBe(0);
    });
    test("basement, mezzanine, roof sentinel", () => {
      expect(levelIndexFromLabel("Basement")).toBe(-1);
      expect(levelIndexFromLabel("Mezzanine")).toBe(1);
      expect(levelIndexFromLabel("roof")).toBe(LEVEL_ROOF_SENTINEL);
    });
    test("invalid / empty / unknown -> 0", () => {
      expect(levelIndexFromLabel("")).toBe(0);
      expect(levelIndexFromLabel(null)).toBe(0);
      expect(levelIndexFromLabel(undefined)).toBe(0);
      expect(levelIndexFromLabel("garage")).toBe(0);
    });
  });

  describe("normalizeLevelIndex", () => {
    test("clamps to [0, floorCount-1]", () => {
      expect(normalizeLevelIndex(2, 2)).toBe(1);
      expect(normalizeLevelIndex(2, 3)).toBe(2);
      expect(normalizeLevelIndex(99, 4)).toBe(3);
      expect(normalizeLevelIndex(-5, 3)).toBe(0);
    });
    test("non-numeric defaults to 0", () => {
      expect(normalizeLevelIndex("abc", 3)).toBe(0);
      expect(normalizeLevelIndex(null, 3)).toBe(0);
    });
    test("roof sentinel resolves to top", () => {
      expect(normalizeLevelIndex(LEVEL_ROOF_SENTINEL, 3)).toBe(2);
      expect(normalizeLevelIndex(LEVEL_ROOF_SENTINEL, 5)).toBe(4);
    });
    test("invalid floorCount falls back to 1 floor", () => {
      expect(normalizeLevelIndex(5, 0)).toBe(0);
      expect(normalizeLevelIndex(5, null)).toBe(0);
    });
  });

  describe("normalizeSpaceLevel", () => {
    test("derives levelIndex from string when missing", () => {
      const result = normalizeSpaceLevel({ level: "Second" }, 3);
      expect(result.levelIndex).toBe(2);
      expect(result.level_index).toBe(2);
      expect(result.level).toBe("Second");
    });
    test("explicit levelIndex wins over string label", () => {
      const result = normalizeSpaceLevel({ levelIndex: 2, level: "Ground" }, 5);
      expect(result.levelIndex).toBe(2);
      expect(result.level).toBe("Second");
    });
    test("level_index is honoured", () => {
      const result = normalizeSpaceLevel(
        { level_index: 1, level: "Ground" },
        3,
      );
      expect(result.levelIndex).toBe(1);
      expect(result.level).toBe("First");
    });
    test("clamps Second to First when floorCount is 2", () => {
      const result = normalizeSpaceLevel({ level: "Second" }, 2);
      expect(result.levelIndex).toBe(1);
      expect(result.level).toBe("First");
    });
    test("missing level defaults to Ground", () => {
      const result = normalizeSpaceLevel({}, 3);
      expect(result.levelIndex).toBe(0);
      expect(result.level).toBe("Ground");
    });
  });

  describe("normalizeProgramSpaces", () => {
    test("preserves array metadata", () => {
      const input = [
        { name: "Living", level: "Ground" },
        { name: "Bedroom", level: "First" },
      ];
      input._calculatedFloorCount = 3;
      input._floorMetrics = { siteCoveragePercent: 42 };
      const out = normalizeProgramSpaces(input, 3);
      expect(out._calculatedFloorCount).toBe(3);
      expect(out._floorMetrics).toEqual({ siteCoveragePercent: 42 });
    });
    test("each space carries level + levelIndex + level_index", () => {
      const out = normalizeProgramSpaces(
        [
          { name: "Living", level: "Ground" },
          { name: "Bedroom", level: "Second" },
        ],
        3,
      );
      expect(out[0]).toMatchObject({
        levelIndex: 0,
        level_index: 0,
        level: "Ground",
      });
      expect(out[1]).toMatchObject({
        levelIndex: 2,
        level_index: 2,
        level: "Second",
      });
    });
    test("non-array input returns empty array", () => {
      expect(normalizeProgramSpaces(null, 3)).toEqual([]);
      expect(normalizeProgramSpaces(undefined, 3)).toEqual([]);
    });
  });

  describe("buildLevelOptions", () => {
    test("returns one option per level", () => {
      expect(buildLevelOptions(3)).toEqual([
        { index: 0, label: "Ground" },
        { index: 1, label: "First" },
        { index: 2, label: "Second" },
      ]);
    });
  });

  describe("constants", () => {
    test("LEVEL_NAMES + LEVEL_NAME_TO_INDEX cover Ground..Seventh", () => {
      expect(LEVEL_NAMES.length).toBeGreaterThanOrEqual(8);
      expect(LEVEL_NAME_TO_INDEX.ground).toBe(0);
      expect(LEVEL_NAME_TO_INDEX.seventh).toBe(7);
      expect(LEVEL_NAME_TO_INDEX.roof).toBe(LEVEL_ROOF_SENTINEL);
    });
  });
});
