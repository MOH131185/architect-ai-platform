import { generateLayoutFromProgram } from "../../services/floorplan/floorplanGenerator.js";
import { regenerateProjectLayer } from "../../services/editing/partialRegenerationService.js";

describe("partialRegenerationService Phase 3", () => {
  test("regenerates facade-only without changing room layout", async () => {
    const result = await generateLayoutFromProgram({
      project_id: "phase3-regen-house",
      footprint: { width_m: 14, depth_m: 10 },
      room_program: [
        { name: "Living Room", target_area_m2: 24, adjacency: ["Kitchen"] },
        { name: "Kitchen", target_area_m2: 16, adjacency: ["Living Room"] },
      ],
    });

    const regenerated = await regenerateProjectLayer({
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

    expect(regenerated.facadeGrammar).toBeTruthy();
    expect(regenerated.projectGeometry.rooms).toEqual(
      result.projectGeometry.rooms,
    );
    expect(regenerated.diff.metadataChanged).toBe(true);
    expect(regenerated.projectGeometry.metadata.locks.lockedLayers).toContain(
      "room_layout",
    );
  });

  test("blocks facade regeneration when facade_grammar is locked via alias", async () => {
    const result = await generateLayoutFromProgram({
      project_id: "phase3-regen-lock-house",
      footprint: { width_m: 14, depth_m: 10 },
      room_program: [
        { name: "Living Room", target_area_m2: 24, adjacency: ["Kitchen"] },
        { name: "Kitchen", target_area_m2: 16, adjacency: ["Living Room"] },
      ],
    });

    await expect(
      regenerateProjectLayer({
        projectGeometry: result.projectGeometry,
        styleDNA: {
          region: "UK",
          climate_zone: "marine-temperate",
          facade_language: "rhythmic-openings-with-solid-masonry",
        },
        targetLayer: "facade",
        locks: { facade_grammar: true },
      }),
    ).rejects.toThrow(/conflicts with locked layers/i);
  });

  test("blocks one-level regeneration when openings are locked", async () => {
    const result = await generateLayoutFromProgram({
      project_id: "phase3-regen-openings-lock-house",
      level_count: 2,
      footprint: { width_m: 16, depth_m: 12 },
      room_program: [
        { name: "Living Room", target_area_m2: 24, adjacency: ["Kitchen"] },
        { name: "Kitchen", target_area_m2: 16, adjacency: ["Living Room"] },
        { name: "Bedroom 1", target_area_m2: 15, level: 1 },
      ],
    });

    await expect(
      regenerateProjectLayer({
        projectGeometry: result.projectGeometry,
        targetLayer: "one_level",
        locks: { openings: true },
        options: { levelId: "level-1" },
      }),
    ).rejects.toThrow(/conflicts with locked layers/i);
  });
});
