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
