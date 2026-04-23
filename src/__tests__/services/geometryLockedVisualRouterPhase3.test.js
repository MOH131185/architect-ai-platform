import { generateLayoutFromProgram } from "../../services/floorplan/floorplanGenerator.js";
import { buildVisualGenerationPackage } from "../../services/visual/geometryLockedVisualRouter.js";

describe("geometryLockedVisualRouter Phase 3", () => {
  test("builds a provider-agnostic visual package from canonical geometry", async () => {
    const result = await generateLayoutFromProgram({
      project_id: "phase3-visual-house",
      footprint: { width_m: 14, depth_m: 10 },
      room_program: [
        { name: "Living Room", target_area_m2: 24, adjacency: ["Kitchen"] },
        { name: "Kitchen", target_area_m2: 16, adjacency: ["Living Room"] },
      ],
    });

    const visualPackage = await buildVisualGenerationPackage(
      result.projectGeometry,
      {
        facade_language: "rhythmic-openings-with-solid-masonry",
        roof_language: "pitched-gable-or-hip",
      },
      "hero_3d",
      {},
    );

    expect(visualPackage.validation.valid).toBe(true);
    expect(visualPackage.controlReferences.references.length).toBeGreaterThan(
      0,
    );
    expect(visualPackage.geometrySignature).toBeTruthy();
    expect(visualPackage.generationDependencies.heroDesignReady).toBe(true);
    expect(visualPackage.generationDependencies.facadeSchemaFinalized).toBe(
      true,
    );
    expect(visualPackage.generationDependencies.openingRhythmFinalized).toBe(
      true,
    );
  });

  test("blocks hero packages when facade opening truth collapses", async () => {
    const result = await generateLayoutFromProgram({
      project_id: "phase3-visual-house-thin-openings",
      footprint: { width_m: 14, depth_m: 10 },
      room_program: [
        { name: "Living Room", target_area_m2: 24, adjacency: ["Kitchen"] },
        { name: "Kitchen", target_area_m2: 16, adjacency: ["Living Room"] },
      ],
    });

    const projectGeometry = {
      ...result.projectGeometry,
      windows: [],
      doors: [],
    };

    const visualPackage = await buildVisualGenerationPackage(
      projectGeometry,
      {
        facade_language: "rhythmic-openings-with-solid-masonry",
        roof_language: "pitched-gable-or-hip",
      },
      "hero_3d",
      {},
    );

    expect(visualPackage.validation.valid).toBe(false);
    expect(visualPackage.generationDependencies.heroDesignReady).toBe(false);
    expect(visualPackage.generationDependencies.openingRhythmFinalized).toBe(
      false,
    );
    expect(visualPackage.validation.errors[0]).toMatch(
      /Hero generation is blocked/i,
    );
  });
});
