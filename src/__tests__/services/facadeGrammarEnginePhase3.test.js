import { generateLayoutFromProgram } from "../../services/floorplan/floorplanGenerator.js";
import { buildFacadeGrammar } from "../../services/facade/facadeGrammarEngine.js";

describe("facadeGrammarEngine Phase 3", () => {
  test("builds geometry-aware facade grammar with opening rhythm", async () => {
    const result = await generateLayoutFromProgram({
      project_id: "phase3-facade-house",
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
      window_language: "vertical-punched-openings",
    });

    expect(facadeGrammar.orientations).toHaveLength(4);
    expect(facadeGrammar.orientations[0].opening_rhythm).toBeTruthy();
    expect(
      facadeGrammar.orientations.every((entry) =>
        Number.isFinite(Number(entry.target_solid_void_ratio)),
      ),
    ).toBe(true);
  });
});
