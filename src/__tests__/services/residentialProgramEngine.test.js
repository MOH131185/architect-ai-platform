import {
  generateResidentialProgramBrief,
  normalizeResidentialProgramSpaces,
} from "../../services/project/residentialProgramEngine.js";

describe("residentialProgramEngine", () => {
  test("builds a deterministic detached-house program brief", () => {
    const brief = generateResidentialProgramBrief({
      subType: "detached-house",
      totalAreaM2: 180,
      siteAreaM2: 420,
      entranceDirection: "S",
    });

    expect(brief.supportedResidentialSubtype).toBe(true);
    expect(brief.levelCount).toBeGreaterThanOrEqual(2);
    expect(brief.recommendedRoof).toBe("gable");
    expect(Array.isArray(brief.spaces)).toBe(true);
    expect(
      brief.spaces.some((space) => String(space.spaceType).includes("living")),
    ).toBe(true);
  });

  test("enforces per-room minimum areas for repeated residential spaces", () => {
    const brief = generateResidentialProgramBrief({
      subType: "detached-house",
      totalAreaM2: 185,
      siteAreaM2: 420,
      entranceDirection: "S",
    });

    const bedrooms = brief.spaces.filter(
      (space) => space.spaceType === "bedroom",
    );
    const bathrooms = brief.spaces.filter(
      (space) => space.spaceType === "bathroom",
    );

    expect(bedrooms.length).toBeGreaterThan(0);
    expect(bedrooms.every((space) => Number(space.area) >= 9)).toBe(true);
    expect(bathrooms.every((space) => Number(space.area) >= 5)).toBe(true);
  });

  test("uses site-fit levels and keeps compact programmes near requested area", () => {
    const brief = generateResidentialProgramBrief({
      subType: "detached-house",
      totalAreaM2: 98,
      siteAreaM2: 2380,
      entranceDirection: "S",
    });

    const total = brief.spaces.reduce(
      (sum, space) => sum + Number(space.area || 0) * Number(space.count || 1),
      0,
    );

    expect(brief.levelCount).toBe(1);
    expect(brief.spaces.every((space) => space.levelIndex === 0)).toBe(true);
    expect(total).toBeGreaterThanOrEqual(98 * 0.95);
    expect(total).toBeLessThanOrEqual(98 * 1.05);
    expect(brief.warnings.length).toBeGreaterThan(0);
  });

  test("respects explicit level-count override even when site-fit recommends fewer levels", () => {
    const brief = generateResidentialProgramBrief({
      subType: "detached-house",
      totalAreaM2: 98,
      siteAreaM2: 2380,
      levelCountOverride: 2,
      entranceDirection: "S",
    });

    expect(brief.levelCount).toBe(2);
    expect(brief.spaces.some((space) => space.levelIndex === 1)).toBe(true);
  });

  test("distributes three-level residential programs across all requested upper levels", () => {
    const brief = generateResidentialProgramBrief({
      subType: "detached-house",
      totalAreaM2: 150,
      siteAreaM2: 147,
      levelCountOverride: 3,
      entranceDirection: "S",
    });

    const occupiedLevels = new Set(
      brief.spaces.map((space) => Number(space.levelIndex)),
    );

    expect(brief.levelCount).toBe(3);
    expect(occupiedLevels.has(0)).toBe(true);
    expect(occupiedLevels.has(1)).toBe(true);
    expect(occupiedLevels.has(2)).toBe(true);
    expect(
      brief.spaces.every(
        (space) => space.levelIndex >= 0 && space.levelIndex < brief.levelCount,
      ),
    ).toBe(true);
  });

  test("normalizes imported spaces into deterministic program rows", () => {
    const normalized = normalizeResidentialProgramSpaces([
      { name: "Living Room", area: "24", count: "1", level: "Ground" },
      { label: "Bedroom", area: 12, count: 2, level: "First" },
    ]);

    expect(normalized).toHaveLength(2);
    expect(normalized[0].name).toBe("Living Room");
    expect(normalized[0].count).toBe(1);
    expect(normalized[1].label).toBe("Bedroom");
    expect(normalized[1].count).toBe(2);
  });

  test("manual override with no site area still distributes across requested levels", () => {
    const brief = generateResidentialProgramBrief({
      subType: "detached-house",
      totalAreaM2: 200,
      siteAreaM2: null,
      levelCountOverride: 3,
      entranceDirection: "S",
    });
    expect(brief.levelCount).toBe(3);
    expect(brief.spaces.some((space) => space.levelIndex === 2)).toBe(true);
    // Forensic: the source is the override, not site-fit.
    expect(brief.levelCountSource).toBe("override");
    expect(brief.clampedBy).toBeNull();
  });

  test("subtype-max clamp is reported on the brief output", () => {
    const brief = generateResidentialProgramBrief({
      subType: "cottage",
      totalAreaM2: 120,
      siteAreaM2: 600,
      levelCountOverride: 3,
      entranceDirection: "S",
    });
    expect(brief.levelCount).toBe(2); // cottage maxLevels = 2
    expect(brief.requestedLevelCount).toBe(3);
    expect(brief.clampedBy).toBe("subtype-max");
    expect(brief.maxLevels).toBe(2);
  });

  test("mansion subtype produces a deterministic brief that respects the 3-level cap", () => {
    const brief = generateResidentialProgramBrief({
      subType: "mansion",
      totalAreaM2: 320,
      siteAreaM2: 1800,
      entranceDirection: "S",
    });
    expect(brief.supportedResidentialSubtype).toBe(true);
    expect(brief.levelCount).toBeGreaterThanOrEqual(1);
    expect(brief.levelCount).toBeLessThanOrEqual(3);
    expect(Array.isArray(brief.spaces)).toBe(true);
    expect(brief.spaces.length).toBeGreaterThan(0);
    expect(
      brief.spaces.every(
        (space) =>
          Number.isFinite(space.area) &&
          Number(space.area) > 0 &&
          space.levelIndex >= 0 &&
          space.levelIndex < brief.levelCount,
      ),
    ).toBe(true);
  });
});
