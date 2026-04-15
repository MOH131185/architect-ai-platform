import { generateLayoutFromProgram } from "../../services/floorplan/floorplanGenerator.js";
import { buildFacadeGrammar } from "../../services/facade/facadeGrammarEngine.js";

describe("facadeAssembly Phase 4", () => {
  test("assembles facade components from canonical geometry and Style DNA", async () => {
    const result = await generateLayoutFromProgram({
      project_id: "phase4-facade-assembly",
      footprint: { width_m: 14, depth_m: 10 },
      room_program: [
        { name: "Living Room", target_area_m2: 24, adjacency: ["Kitchen"] },
        { name: "Kitchen", target_area_m2: 16, adjacency: ["Living Room"] },
      ],
    });

    const facadeGrammar = buildFacadeGrammar(result.projectGeometry, {
      region: "UK",
      climate_zone: "marine-temperate",
      facade_language: "rhythmic-openings-with-solid-masonry",
      roof_language: "pitched-gable-or-hip",
      window_language: "grouped-horizontal",
    });

    const richestOrientation = [...facadeGrammar.orientations].sort(
      (left, right) =>
        (right.components?.bays?.length || 0) -
        (left.components?.bays?.length || 0),
    )[0];

    expect(facadeGrammar.component_library_version).toBe(
      "phase4-facade-components-v1",
    );
    expect(richestOrientation.components.bays.length).toBeGreaterThan(0);
    expect(richestOrientation.components.component_family.bay_family).toBe(
      "masonry-bay",
    );
    expect(Array.isArray(richestOrientation.components.shading_elements)).toBe(
      true,
    );
  });
});
