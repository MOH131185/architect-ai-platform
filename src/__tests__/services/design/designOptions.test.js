import { generateRectangularOptions } from "../../../services/design/optionGenerator.js";
import {
  scoreOption,
  selectBestOption,
  CATEGORY_WEIGHTS,
} from "../../../services/design/optionScorer.js";
import { buildArchitectureProjectVerticalSlice } from "../../../services/project/projectGraphVerticalSliceService.js";

const READING_ROOM_BRIEF = {
  brief: {
    project_name: "Reading Room Options",
    building_type: "community",
    site_input: { postcode: "N1 1AA", lat: 51.5416, lon: -0.1022 },
    target_gia_m2: 320,
    target_storeys: 2,
  },
};

function buildableSite(width, height) {
  return {
    buildable_polygon: [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: width, y: height },
      { x: 0, y: height },
      { x: 0, y: 0 },
    ],
  };
}

describe("optionGenerator", () => {
  test("produces 4 candidate options with required keys", () => {
    const options = generateRectangularOptions({
      brief: {
        building_type: "community",
        target_storeys: 2,
        target_gia_m2: 320,
      },
      site: buildableSite(20, 20),
      levelAreas: [160, 160],
    });
    expect(options.length).toBe(4);
    for (const option of options) {
      expect(option.option_id).toBeTruthy();
      expect(option.footprint_polygon.length).toBeGreaterThanOrEqual(4);
      expect(option.footprint_bbox).toBeTruthy();
      expect(typeof option.fits_buildable).toBe("boolean");
    }
  });

  test("clamping preserves footprint area when buildable is tight", () => {
    const options = generateRectangularOptions({
      brief: {
        building_type: "community",
        target_storeys: 2,
        target_gia_m2: 320,
      },
      site: buildableSite(10, 18),
      levelAreas: [160, 160],
    });
    // Each option should have ≥160 m² area (or hit buildable max if undersized).
    for (const option of options) {
      const area = option.footprint_width_m * option.footprint_depth_m;
      expect(area).toBeGreaterThan(150);
    }
  });

  test("includes both EW and NS bar variants", () => {
    const options = generateRectangularOptions({
      brief: {
        building_type: "community",
        target_storeys: 2,
        target_gia_m2: 320,
      },
      site: buildableSite(40, 40),
      levelAreas: [160, 160],
    });
    const longAxes = options.map((o) => o.long_axis);
    expect(longAxes).toContain("ew");
    expect(longAxes).toContain("ns");
  });
});

describe("optionScorer", () => {
  const baseSite = buildableSite(40, 40);
  const baseProgramme = { area_summary: { gross_internal_area_m2: 320 } };
  const baseClimate = {
    overheating: { risk_level: "medium" },
    sun_path: { recommendation: { primary_glazing_orientation: "south" } },
  };

  test("category weights sum to 1.0", () => {
    const sum = Object.values(CATEGORY_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(Math.abs(sum - 1)).toBeLessThan(1e-6);
  });

  test("subscores are clamped to 0..1", () => {
    const options = generateRectangularOptions({
      brief: {
        building_type: "community",
        target_storeys: 2,
        target_gia_m2: 320,
      },
      site: baseSite,
      levelAreas: [160, 160],
    });
    const scored = scoreOption({
      option: options[0],
      brief: { building_type: "community", target_storeys: 2 },
      site: baseSite,
      climate: baseClimate,
      programme: baseProgramme,
    });
    for (const value of Object.values(scored.subscores)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
    expect(scored.aggregate_score).toBeGreaterThan(0);
    expect(scored.aggregate_score).toBeLessThanOrEqual(1);
  });

  test("E-W long-axis option scores higher on climate fit when sun recommends south", () => {
    const options = generateRectangularOptions({
      brief: {
        building_type: "community",
        target_storeys: 2,
        target_gia_m2: 320,
      },
      site: baseSite,
      levelAreas: [160, 160],
    });
    const ew = options.find((o) => o.option_id === "option-bar-ew");
    const ns = options.find((o) => o.option_id === "option-bar-ns");
    const ewScored = scoreOption({
      option: ew,
      brief: { building_type: "community" },
      site: baseSite,
      climate: baseClimate,
      programme: baseProgramme,
    });
    const nsScored = scoreOption({
      option: ns,
      brief: { building_type: "community" },
      site: baseSite,
      climate: baseClimate,
      programme: baseProgramme,
    });
    expect(ewScored.subscores.climateFit).toBeGreaterThan(
      nsScored.subscores.climateFit,
    );
  });

  test("selectBestOption picks the highest aggregate from fit-buildable pool", () => {
    const options = generateRectangularOptions({
      brief: {
        building_type: "community",
        target_storeys: 2,
        target_gia_m2: 320,
      },
      site: baseSite,
      levelAreas: [160, 160],
    });
    const scored = options.map((option) =>
      scoreOption({
        option,
        brief: { building_type: "community" },
        site: baseSite,
        climate: baseClimate,
        programme: baseProgramme,
      }),
    );
    const best = selectBestOption(scored);
    expect(best).toBeTruthy();
    for (const candidate of scored.filter((s) => s.fits_buildable)) {
      expect(candidate.aggregate_score).toBeLessThanOrEqual(
        best.aggregate_score,
      );
    }
  });
});

describe("design options — integration", () => {
  beforeEach(() => {
    process.env.MODEL_SOURCE = "base";
    process.env.OPENAI_REASONING_MODEL = "gpt-5.4";
    process.env.OPENAI_FAST_MODEL = "gpt-5.4-mini";
  });

  test("Reading Room slice surfaces ≥3 scored design options with one selected", async () => {
    const result =
      await buildArchitectureProjectVerticalSlice(READING_ROOM_BRIEF);
    const options = result.projectGraph.design_options;
    expect(options.length).toBeGreaterThanOrEqual(3);
    const selected = options.filter((o) => o.selected);
    expect(selected.length).toBe(1);
    expect(selected[0].source_model_hash).toBe(result.geometryHash);
    for (const option of options) {
      if (option.subscores) {
        expect(option.aggregate_score).toBeGreaterThanOrEqual(0);
        expect(option.aggregate_score).toBeLessThanOrEqual(1);
      }
    }
  });
});
