import {
  buildClimateRenderContext,
  buildStyleRenderContext,
  buildProgrammeRenderContext,
  buildReasoningChainBlock,
} from "../../services/a1/panelPromptBuilders.js";

describe("buildClimateRenderContext", () => {
  test("returns empty string when climate is missing", () => {
    expect(buildClimateRenderContext(null)).toBe("");
    expect(buildClimateRenderContext(undefined)).toBe("");
    expect(buildClimateRenderContext({})).toBe("");
  });

  test("emits zone, rainfall, sun, wind for a UK temperate climate", () => {
    const result = buildClimateRenderContext({
      zone: "Cfb (UK temperate maritime)",
      rainfall_mm: 850,
      sun_path: { altitude_summer: 60, altitude_winter: 15, azimuth_noon: 180 },
      wind: { prevailing: "SW", speed_kmh: 12 },
      design_recommendations: ["passive shading", "cross-ventilation"],
    });
    expect(result).toContain("Climate driver:");
    expect(result).toContain("Cfb");
    expect(result).toContain("850mm");
    expect(result).toContain("35-45° pitched roof");
    expect(result).toContain("summer altitude ~60°");
    expect(result).toContain("noon azimuth 180°");
    expect(result).toContain("Prevailing wind SW at 12 km/h");
    expect(result).toContain("sheltered NE entrance");
    expect(result).toContain("passive shading");
  });

  test("dry-climate rainfall < 400mm yields shallow-roof recommendation", () => {
    const result = buildClimateRenderContext({
      zone: "BWh (hot desert)",
      rainfall_mm: 200,
    });
    expect(result).toContain("shallow or flat roof acceptable in dry climate");
  });
});

describe("buildStyleRenderContext", () => {
  test("returns empty string when no inputs", () => {
    expect(buildStyleRenderContext(null, null, null)).toBe("");
    expect(buildStyleRenderContext({}, {}, null)).toBe("");
  });

  test("emits regional vernacular, facade, roof, materials", () => {
    const localStyle = {
      region: "UK South-East",
      materials_local: ["red multi-stock brick", "vertical timber cladding"],
    };
    const styleDNA = {
      facade_language: "red brick lower storey + vertical timber upper accent",
      roof_language: "dark grey slate, 45° pitch, ridge details",
      window_language: "regular fenestration on 1.5m module, anthracite frames",
      massing_language: "compact rectangular gable",
      precedent_keywords: ["UK contemporary detached", "RIBA portfolio"],
    };
    const result = buildStyleRenderContext(
      localStyle,
      styleDNA,
      "UK South-East",
    );
    expect(result).toContain("Regional vernacular: UK South-East");
    expect(result).toContain("red brick lower storey");
    expect(result).toContain("dark grey slate, 45° pitch");
    expect(result).toContain("anthracite frames");
    expect(result).toContain("compact rectangular gable");
    expect(result).toContain("red multi-stock brick");
    expect(result).toContain("UK contemporary detached");
  });
});

describe("buildProgrammeRenderContext", () => {
  test("returns empty string when no programme summary", () => {
    expect(buildProgrammeRenderContext(null, 3)).toBe("");
    expect(buildProgrammeRenderContext({}, 0)).toBe("");
  });

  test("emits storey count, area, room distribution, fenestration logic", () => {
    const result = buildProgrammeRenderContext(
      {
        total_area_m2: 300,
        target_storeys: 3,
        building_type: "detached dwelling",
        rooms_per_level: {
          Ground: [
            "Entrance Hall",
            "Kitchen",
            "Dining",
            "Living",
            "Study",
            "WC",
          ],
          First: ["Master Bedroom", "Bedroom 2", "Bathroom"],
          Second: ["Bedroom 3", "Bedroom 4", "Shower"],
        },
        level_areas: { Ground: 110, First: 95, Second: 95 },
      },
      3,
    );
    expect(result).toContain("300m² 3-storey detached dwelling");
    expect(result).toContain("Ground (110m²): Entrance Hall, Kitchen");
    expect(result).toContain("First (95m²): Master Bedroom");
    expect(result).toContain("Second (95m²): Bedroom 3");
    expect(result).toContain("Fenestration logic");
  });
});

describe("buildReasoningChainBlock", () => {
  test("returns empty string when no upstream data", () => {
    expect(buildReasoningChainBlock({})).toBe("");
    expect(
      buildReasoningChainBlock({
        locationData: {},
        masterDNA: {},
        projectContext: {},
      }),
    ).toBe("");
  });

  test("composes all three blocks when all inputs present (UK contemporary detached scenario)", () => {
    const block = buildReasoningChainBlock({
      locationData: {
        climate: {
          zone: "Cfb (UK temperate maritime)",
          rainfall_mm: 850,
          sun_path: { altitude_summer: 60, altitude_winter: 15 },
          wind: { prevailing: "SW", speed_kmh: 12 },
        },
        region: "UK South-East",
      },
      masterDNA: {
        localStyle: {
          region: "UK South-East",
          materials_local: [
            "red multi-stock brick",
            "vertical timber cladding",
          ],
        },
        styleDNA: {
          facade_language: "red brick + vertical timber upper accent",
          roof_language: "dark grey slate 45° pitch",
        },
      },
      projectContext: {
        programmeSummary: {
          total_area_m2: 300,
          target_storeys: 3,
          building_type: "detached dwelling",
          rooms_per_level: { Ground: ["Kitchen"], First: ["Bedroom"] },
        },
        targetStoreys: 3,
      },
    });
    expect(block).toContain("=== REASONING CHAIN");
    expect(block).toContain("=== END REASONING CHAIN ===");
    expect(block).toContain("Climate driver:");
    expect(block).toContain("Regional style:");
    expect(block).toContain("Programme:");
    // Three drivers must all appear, in order.
    const climatePos = block.indexOf("Climate driver:");
    const stylePos = block.indexOf("Regional style:");
    const progPos = block.indexOf("Programme:");
    expect(climatePos).toBeLessThan(stylePos);
    expect(stylePos).toBeLessThan(progPos);
  });

  test("emits only available blocks when partial inputs", () => {
    const block = buildReasoningChainBlock({
      locationData: { climate: { zone: "Cfb", rainfall_mm: 850 } },
    });
    expect(block).toContain("Climate driver:");
    expect(block).not.toContain("Regional style:");
    expect(block).not.toContain("Programme:");
  });
});
