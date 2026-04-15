import { generateLayoutFromProgram } from "../../services/floorplan/floorplanGenerator.js";
import {
  resetFeatureFlags,
  setFeatureFlag,
} from "../../config/featureFlags.js";

describe("floorplanGenerator", () => {
  afterEach(() => {
    resetFeatureFlags();
  });

  test("generates deterministic canonical geometry from a room program", async () => {
    const result = await generateLayoutFromProgram({
      project_id: "test-house",
      level_count: 2,
      footprint: { width_m: 14, depth_m: 10 },
      room_program: [
        {
          id: "living",
          name: "Living Room",
          target_area_m2: 24,
          zone: "public",
          adjacency: ["kitchen"],
        },
        {
          id: "kitchen",
          name: "Kitchen",
          target_area_m2: 16,
          zone: "public",
          adjacency: ["living"],
        },
        {
          id: "bed-1",
          name: "Bedroom 1",
          target_area_m2: 15,
          zone: "private",
          level: 1,
        },
        {
          id: "bath-1",
          name: "Bathroom",
          target_area_m2: 8,
          zone: "private",
          level: 1,
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.layout.levels).toHaveLength(2);
    expect(result.layoutGraph.nodes.length).toBeGreaterThan(0);
    expect(result.projectGeometry.schema_version).toBe(
      "canonical-project-geometry-v2",
    );
    expect(result.projectGeometry.stairs.length).toBeGreaterThan(0);
    expect(result.validationReport.status).toMatch(/valid/);
  });

  test("falls back to the legacy placeholder layout when Phase 2 solver flags are disabled", async () => {
    setFeatureFlag("useCanonicalGeometryPhase2", false);

    const result = await generateLayoutFromProgram({
      project_id: "legacy-floorplan",
      footprint: { width_m: 14, depth_m: 10 },
      room_program: [
        { id: "living", name: "Living Room", target_area_m2: 24 },
        { id: "kitchen", name: "Kitchen", target_area_m2: 16 },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.projectGeometry).toBeNull();
    expect(result.layout).not.toBeNull();
    expect(
      result.warnings.some((entry) =>
        entry.includes("legacy deterministic placeholder layout"),
      ),
    ).toBe(true);
  });
});
