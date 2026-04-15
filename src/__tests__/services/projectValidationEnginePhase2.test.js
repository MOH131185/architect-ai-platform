import { generateLayoutFromProgram } from "../../services/floorplan/floorplanGenerator.js";
import { validateProject } from "../../services/validation/projectValidationEngine.js";
import {
  resetFeatureFlags,
  setFeatureFlag,
} from "../../config/featureFlags.js";
import { regenerateProjectLayer } from "../../services/editing/partialRegenerationService.js";

describe("projectValidationEngine Phase 2", () => {
  afterEach(() => {
    resetFeatureFlags();
  });

  test("returns valid for deterministic canonical geometry", async () => {
    const result = await generateLayoutFromProgram({
      project_id: "valid-project",
      footprint: { width_m: 14, depth_m: 10 },
      room_program: [
        { name: "Living Room", target_area_m2: 24, adjacency: ["Kitchen"] },
        { name: "Kitchen", target_area_m2: 16, adjacency: ["Living Room"] },
      ],
    });

    expect(result.validationReport.status).toBe("valid");
    expect(result.projectGeometry.rooms.length).toBeGreaterThan(0);
  });

  test("returns identical canonical geometry for repeated deterministic runs", async () => {
    const request = {
      project_id: "stable-project",
      footprint: { width_m: 14, depth_m: 10 },
      room_program: [
        { name: "Living Room", target_area_m2: 24, adjacency: ["Kitchen"] },
        { name: "Kitchen", target_area_m2: 16, adjacency: ["Living Room"] },
      ],
    };

    const first = await generateLayoutFromProgram(request);
    const second = await generateLayoutFromProgram(request);

    expect(first.projectGeometry).toEqual(second.projectGeometry);
    expect(first.validationReport).toEqual(second.validationReport);
  });

  test("returns invalid when overlapping rooms are introduced", async () => {
    const result = await generateLayoutFromProgram({
      project_id: "invalid-project",
      footprint: { width_m: 14, depth_m: 10 },
      room_program: [
        { name: "Living Room", target_area_m2: 24, adjacency: ["Kitchen"] },
        { name: "Kitchen", target_area_m2: 16, adjacency: ["Living Room"] },
      ],
    });

    const mutated = JSON.parse(JSON.stringify(result.projectGeometry));
    mutated.rooms[1].bbox = { ...mutated.rooms[0].bbox };

    const report = validateProject({
      projectGeometry: mutated,
      adjacencyGraph: result.adjacencyGraph,
    });

    expect(report.status).toBe("invalid");
    expect(report.errors.some((entry) => entry.includes("overlap"))).toBe(true);
  });

  test("returns invalid when windows are moved onto an interior wall", async () => {
    const result = await generateLayoutFromProgram({
      project_id: "invalid-opening-project",
      footprint: { width_m: 14, depth_m: 10 },
      room_program: [
        { name: "Living Room", target_area_m2: 24, adjacency: ["Kitchen"] },
        { name: "Kitchen", target_area_m2: 16, adjacency: ["Living Room"] },
      ],
    });

    const mutated = JSON.parse(JSON.stringify(result.projectGeometry));
    const interiorWall = mutated.walls.find((wall) => wall.exterior === false);
    mutated.windows[0].wall_id = interiorWall.id;

    const report = validateProject({
      projectGeometry: mutated,
      adjacencyGraph: result.adjacencyGraph,
    });

    expect(report.status).toBe("invalid");
    expect(
      report.errors.some((entry) =>
        entry.includes("must be placed on an exterior wall"),
      ),
    ).toBe(true);
  });

  test("returns a warning-only report when geometry validation is disabled", async () => {
    setFeatureFlag("useGeometryValidationEngine", false);

    const result = await generateLayoutFromProgram({
      project_id: "validation-disabled-project",
      footprint: { width_m: 14, depth_m: 10 },
      room_program: [
        { name: "Living Room", target_area_m2: 24, adjacency: ["Kitchen"] },
        { name: "Kitchen", target_area_m2: 16, adjacency: ["Living Room"] },
      ],
    });

    expect(result.validationReport.status).toBe("valid_with_warnings");
    expect(result.validationReport.warnings).toContain(
      "Geometry validation engine is disabled by feature flag.",
    );
  });

  test("keeps validation passing after a facade-only regeneration with room layout locked", async () => {
    const result = await generateLayoutFromProgram({
      project_id: "facade-edit-project",
      footprint: { width_m: 14, depth_m: 10 },
      room_program: [
        { name: "Living Room", target_area_m2: 24, adjacency: ["Kitchen"] },
        { name: "Kitchen", target_area_m2: 16, adjacency: ["Living Room"] },
      ],
    });

    const edited = await regenerateProjectLayer({
      projectGeometry: result.projectGeometry,
      styleDNA: {
        region: "UK",
        climate_zone: "marine-temperate",
        facade_language: "rhythmic-openings-with-solid-masonry",
        roof_language: "pitched-gable-or-hip",
      },
      targetLayer: "facade",
      locks: { room_layout: true },
    });

    const report = validateProject({
      previousProjectGeometry: result.projectGeometry,
      projectGeometry: edited.projectGeometry,
      facadeGrammar: edited.facadeGrammar,
      locks: { room_layout: true },
      targetLayer: "facade",
    });

    expect(report.status).toMatch(/valid/);
    expect(report.errors).toHaveLength(0);
  });

  test("returns invalid when a multi-level project loses stair-core access doors", async () => {
    const result = await generateLayoutFromProgram({
      project_id: "invalid-stair-access-project",
      level_count: 2,
      footprint: { width_m: 16, depth_m: 12 },
      room_program: [
        { name: "Living Room", target_area_m2: 24, adjacency: ["Kitchen"] },
        { name: "Kitchen", target_area_m2: 16, adjacency: ["Living Room"] },
        { name: "Bedroom 1", target_area_m2: 15, level: 1 },
      ],
    });

    const mutated = JSON.parse(JSON.stringify(result.projectGeometry));
    mutated.doors = mutated.doors.filter(
      (door) =>
        !(
          Array.isArray(door.room_ids) &&
          door.room_ids.some((roomId) => String(roomId).includes("stair-core"))
        ),
    );

    const report = validateProject({
      projectGeometry: mutated,
      adjacencyGraph: result.adjacencyGraph,
      facadeGrammar: mutated.metadata?.facade_grammar || null,
      structuralGrid: mutated.metadata?.structural_grid || null,
    });

    expect(report.status).toBe("invalid");
    expect(
      report.errors.some((entry) =>
        entry.includes("no door linking the stair core"),
      ),
    ).toBe(true);
  });
});
