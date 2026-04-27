import { computeSunPath } from "../../services/climate/sunPath.js";

describe("computeSunPath (UK)", () => {
  test("returns higher peak altitude in summer than winter for an Islington site", () => {
    const profile = computeSunPath(51.5416, -0.1022);
    expect(profile.summer_solstice.peak.altitudeDeg).toBeGreaterThan(50);
    expect(profile.winter_solstice.peak.altitudeDeg).toBeLessThan(20);
    expect(profile.summer_solstice.peak.altitudeDeg).toBeGreaterThan(
      profile.winter_solstice.peak.altitudeDeg,
    );
  });

  test("recommends south-facing glazing in the northern hemisphere", () => {
    const profile = computeSunPath(51.5416, -0.1022);
    expect(profile.recommendation.primary_glazing_orientation).toBe("south");
    expect(profile.recommendation.avoid_orientation).toBe("west");
    expect(profile.summer_solstice.day_length_hours).toBeGreaterThan(15);
  });

  test("flags overheating risk when summer peak exceeds 55 degrees", () => {
    const profile = computeSunPath(51.5416, -0.1022);
    expect(profile.recommendation.summer_overheating_risk).toBe(
      "controlled-shading-required",
    );
  });

  test("throws on non-finite coordinates", () => {
    expect(() => computeSunPath("nan", -0.1022)).toThrow(/finite lat\/lon/);
  });

  test("is deterministic for fixed year and location", () => {
    const a = computeSunPath(51.5416, -0.1022, { year: 2026 });
    const b = computeSunPath(51.5416, -0.1022, { year: 2026 });
    expect(a.summer_solstice.peak).toEqual(b.summer_solstice.peak);
    expect(a.winter_solstice.peak).toEqual(b.winter_solstice.peak);
  });
});
