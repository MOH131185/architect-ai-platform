import { resolvePanelThresholds } from "../../services/qa/RenderSanityValidator.js";

describe("RenderSanityValidator threshold resolution", () => {
  test("keeps floor-plan occupancy threshold at baseline when aspect matches", () => {
    const thresholds = resolvePanelThresholds("floor_plan_ground", {
      originalWidth: 1200,
      originalHeight: 800,
      slotWidth: 1200,
      slotHeight: 800,
    });

    expect(thresholds.minOccupancyRatio).toBe(0.055);
  });

  test("relaxes floor-plan occupancy threshold for strong contain letterboxing", () => {
    const thresholds = resolvePanelThresholds("floor_plan_ground", {
      originalWidth: 255,
      originalHeight: 510,
      slotWidth: 512,
      slotHeight: 512,
    });

    expect(thresholds.minOccupancyRatio).toBeLessThan(0.04);
    expect(thresholds.minOccupancyRatio).toBeGreaterThanOrEqual(0.02);
  });

  test("applies an absolute occupancy floor for non-floor technical panels", () => {
    const thresholds = resolvePanelThresholds("elevation_north", {
      originalWidth: 120,
      originalHeight: 1200,
      slotWidth: 1200,
      slotHeight: 120,
    });

    expect(thresholds.minOccupancyRatio).toBe(0.018);
  });
});
