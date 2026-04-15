import {
  applyAiLayoutRuntimeEnrichment,
  ensureMutableWorkingDNA,
} from "../../services/aiLayoutRuntimeService.js";

describe("ai layout runtime service", () => {
  test("creates a mutable runtime copy when upstream DNA authority is frozen", () => {
    const frozenDNA = Object.freeze({
      dimensions: Object.freeze({ floors: 2, length: 10, width: 8 }),
      _structured: Object.freeze({
        program: Object.freeze({ rooms: [] }),
        site: Object.freeze({}),
      }),
    });

    const workingDNA = ensureMutableWorkingDNA(frozenDNA);

    expect(workingDNA).not.toBe(frozenDNA);
    expect(Object.isFrozen(workingDNA)).toBe(false);
    workingDNA.qualityScore = 81;
    expect(workingDNA.qualityScore).toBe(81);
  });

  test("applies AI layout enrichment without mutating the original inputs", () => {
    const masterDNA = {
      dimensions: { floors: 2 },
      _structured: {
        program: { rooms: [] },
        site: {},
      },
    };
    const typesCDS = {
      programRooms: [
        {
          id: "living_room",
          name: "Living Room",
          program: "living",
          levelIndex: 0,
        },
      ],
      site: {},
    };
    const aiLayout = {
      levels: [
        {
          index: 0,
          rooms: [
            {
              id: "living_room",
              name: "Living Room",
              x: 1.2,
              y: 0.8,
              width: 4.5,
              depth: 4.2,
              hasExternalWall: true,
              adjacentTo: ["kitchen"],
            },
          ],
        },
      ],
      spatialGraph: { building: { floors: [] } },
      qualityEvaluation: { total: 78, grade: "B" },
    };

    const enriched = applyAiLayoutRuntimeEnrichment({
      masterDNA,
      typesCDS,
      aiLayout,
      climateContext: {
        climate: {
          zone: "temperate",
          prevailing_wind: { direction: "SW" },
          rainfall_mm_annual: 700,
        },
        design_recommendations: {
          orientation: "south-facing living spaces",
        },
        sunPath: {
          optimalOrientation: "south",
        },
      },
    });

    expect(masterDNA.spatialGraph).toBeUndefined();
    expect(typesCDS.programRooms[0].x).toBeUndefined();
    expect(enriched.injected).toBe(1);
    expect(enriched.masterDNA.qualityScore).toBe(78);
    expect(enriched.typesCDS.programRooms[0].width).toBe(4.5);
    expect(enriched.masterDNA._structured.program.spatialGraph).toEqual(
      aiLayout.spatialGraph,
    );
  });
});
