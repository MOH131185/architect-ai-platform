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
});
