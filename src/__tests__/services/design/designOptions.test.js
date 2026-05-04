import { generateRectangularOptions } from "../../../services/design/optionGenerator.js";
import {
  scoreOption,
  selectBestOption,
  CATEGORY_WEIGHTS,
} from "../../../services/design/optionScorer.js";
import {
  __projectGraphVerticalSliceInternals,
  buildArchitectureProjectVerticalSlice,
} from "../../../services/project/projectGraphVerticalSliceService.js";
import { buildLocalStylePackV2 } from "../../../services/style/localStylePack.js";
import { resolveUKVernacular } from "../../../services/style/ukVernacularPacks.js";

const { buildProjectGeometryFromProgramme } =
  __projectGraphVerticalSliceInternals;

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

function footprintSignature(options) {
  return options.map(
    (option) =>
      `${option.option_id}:${option.footprint_width_m.toFixed(3)}:${option.footprint_depth_m.toFixed(3)}`,
  );
}

function expectNarrowDeep(option) {
  expect(option.footprint_width_m).toBeGreaterThan(0);
  expect(option.footprint_depth_m).toBeGreaterThan(0);
  expect(option.footprint_width_m).toBeLessThan(option.footprint_depth_m);
}

function bboxFromPolygon(polygon = []) {
  const xs = polygon.map((point) => Number(point.x)).filter(Number.isFinite);
  const ys = polygon.map((point) => Number(point.y)).filter(Number.isFinite);
  return {
    width: Math.max(...xs) - Math.min(...xs),
    depth: Math.max(...ys) - Math.min(...ys),
  };
}

describe("optionGenerator", () => {
  test("produces 4 candidate options with required keys when no archetype is supplied", () => {
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

  // Phase C — UK regional vernacular layout archetypes. The slice passes
  // localStyle.style_provenance.layout_archetype through to the option
  // generator so a London terrace pack produces narrow-deep candidates,
  // a Cotswolds cottage pack produces near-square candidates, etc. Pack-off
  // / non-UK runs see the original 4-option set unchanged.
  test("linear_side_hall archetype prepends narrow-deep terrace candidates", () => {
    const options = generateRectangularOptions({
      brief: {
        building_type: "dwelling",
        target_storeys: 2,
        target_gia_m2: 150,
      },
      site: buildableSite(40, 40),
      levelAreas: [75, 75],
      archetype: "linear_side_hall",
    });
    expect(options.length).toBe(6); // 2 archetype + 4 default
    const archetypeIds = options.slice(0, 2).map((o) => o.option_id);
    expect(archetypeIds).toContain("option-archetype-terrace-narrow-deep");
    expect(archetypeIds).toContain("option-archetype-terrace-medium");
    // Aspect < 1 means deeper than wide, the canonical terrace shape.
    expect(options[0].aspect).toBeLessThan(1);
    expect(options[0].aspect).toBeLessThanOrEqual(0.5);
    expectNarrowDeep(options[0]);
    expectNarrowDeep(options[1]);
    // Long axis runs front-to-back (north-south = perpendicular to the
    // street).
    expect(options[0].long_axis).toBe("ns");
    expect(options[0].typology).toMatch(/linear_side_hall/);
  });

  test("central_stair_square archetype prepends near-square cottage candidate", () => {
    const options = generateRectangularOptions({
      brief: {
        building_type: "dwelling",
        target_storeys: 2,
        target_gia_m2: 120,
      },
      site: buildableSite(40, 40),
      levelAreas: [60, 60],
      archetype: "central_stair_square",
    });
    expect(options.length).toBe(5);
    expect(options[0].option_id).toBe("option-archetype-cottage-square");
    expect(options[0].aspect).toBeGreaterThanOrEqual(0.95);
    expect(options[0].aspect).toBeLessThan(1.2);
    const actualRatio =
      options[0].footprint_width_m / options[0].footprint_depth_m;
    expect(actualRatio).toBeGreaterThanOrEqual(0.95);
    expect(actualRatio).toBeLessThan(1.2);
    expect(options[0].typology).toBe("central_stair_square");
  });

  test("tenement_common_stair archetype prepends one Edinburgh tenement candidate", () => {
    const options = generateRectangularOptions({
      brief: {
        building_type: "dwelling",
        target_storeys: 2,
        target_gia_m2: 150,
      },
      site: buildableSite(40, 40),
      levelAreas: [75, 75],
      archetype: "tenement_common_stair",
    });
    expect(options.length).toBe(5);
    expect(options[0].option_id).toBe("option-archetype-tenement");
    expect(options[0].typology).toBe("tenement_common_stair");
    expect(options[0].footprint_width_m).toBeLessThan(
      options[0].footprint_depth_m,
    );
    expect(
      options[0].footprint_width_m / options[0].footprint_depth_m,
    ).toBeGreaterThan(0.8);
  });

  test("narrow_two_up_two_down archetype prepends Manchester back-to-back candidate", () => {
    const options = generateRectangularOptions({
      brief: {
        building_type: "dwelling",
        target_storeys: 2,
        target_gia_m2: 110,
      },
      site: buildableSite(40, 40),
      levelAreas: [55, 55],
      archetype: "narrow_two_up_two_down",
    });
    expect(options.length).toBe(5);
    expect(options[0].option_id).toBe("option-archetype-back-to-back");
    expect(options[0].aspect).toBeLessThan(1);
    expectNarrowDeep(options[0]);
  });

  test("unknown / null archetype produces the original 4-option set unchanged", () => {
    const baseline = generateRectangularOptions({
      brief: {
        building_type: "dwelling",
        target_storeys: 2,
        target_gia_m2: 150,
      },
      site: buildableSite(40, 40),
      levelAreas: [75, 75],
    });
    const withNull = generateRectangularOptions({
      brief: {
        building_type: "dwelling",
        target_storeys: 2,
        target_gia_m2: 150,
      },
      site: buildableSite(40, 40),
      levelAreas: [75, 75],
      archetype: null,
    });
    const withUnknown = generateRectangularOptions({
      brief: {
        building_type: "dwelling",
        target_storeys: 2,
        target_gia_m2: 150,
      },
      site: buildableSite(40, 40),
      levelAreas: [75, 75],
      archetype: "no-such-archetype",
    });
    expect(baseline.length).toBe(4);
    expect(withNull.length).toBe(4);
    expect(withUnknown.length).toBe(4);
    expect(withNull.map((o) => o.option_id)).toEqual(
      baseline.map((o) => o.option_id),
    );
    expect(withUnknown.map((o) => o.option_id)).toEqual(
      baseline.map((o) => o.option_id),
    );
    expect(footprintSignature(withNull)).toEqual(footprintSignature(baseline));
    expect(footprintSignature(withUnknown)).toEqual(
      footprintSignature(baseline),
    );
  });

  test("real W2 styleProvenance drives selected ProjectGraph geometry to narrow/deep", () => {
    const brief = {
      project_name: "W2 Terrace Geometry",
      building_type: "dwelling",
      canonical_building_type: "dwelling",
      target_storeys: 2,
      target_gia_m2: 150,
      site_input: { postcode: "W2 5SH" },
    };
    const pack = resolveUKVernacular({ postcode: "W2 5SH" });
    const localStyle = buildLocalStylePackV2({
      brief,
      site: { uk_vernacular_pack: pack },
      climate: { overheating: { risk_level: "low" } },
    });
    expect(localStyle.style_provenance.layout_archetype).toBe(
      "linear_side_hall",
    );

    const projectGeometry = buildProjectGeometryFromProgramme({
      brief,
      site: {
        ...buildableSite(40, 40),
        main_entry: { orientation: "south" },
      },
      programme: {
        area_summary: { gross_internal_area_m2: 150 },
        spaces: [
          {
            space_id: "living",
            name: "Living",
            target_area_m2: 35,
            target_level_index: 0,
          },
          {
            space_id: "kitchen",
            name: "Kitchen",
            target_area_m2: 25,
            target_level_index: 0,
          },
          {
            space_id: "wc",
            name: "WC",
            target_area_m2: 15,
            target_level_index: 0,
          },
          {
            space_id: "primary",
            name: "Primary Bedroom",
            target_area_m2: 35,
            target_level_index: 1,
          },
          {
            space_id: "bedroom-2",
            name: "Bedroom 2",
            target_area_m2: 25,
            target_level_index: 1,
          },
          {
            space_id: "bathroom",
            name: "Bathroom",
            target_area_m2: 15,
            target_level_index: 1,
          },
        ],
      },
      localStyle,
      climate: { overheating: { risk_level: "low" } },
    });

    const selected = projectGeometry.metadata.design_options.find(
      (option) => option.selected === true,
    );
    expect(selected.option_id).toMatch(/^option-archetype-terrace-/);
    const groundFootprint = projectGeometry.footprints.find(
      (footprint) => footprint.level_id === "level-0",
    );
    const bbox = bboxFromPolygon(groundFootprint?.polygon || []);
    expect(bbox.width).toBeGreaterThan(0);
    expect(bbox.depth).toBeGreaterThan(0);
    expect(bbox.width).toBeLessThan(bbox.depth);
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
