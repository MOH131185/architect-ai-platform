/**
 * Phase 4b — assert the rendering polish flags carried on the panel specs
 * actually appear in the generated panel SVG output, not just in spec
 * metadata. Each test calls the production renderer directly with the
 * relevant flag and greps the output SVG for the marker id/class. This is
 * the "visible-output" test contract Codex required after Phase 4 audit.
 */

import { renderPlanSvg } from "../../../services/drawing/svgPlanRenderer.js";
import { renderElevationSvg } from "../../../services/drawing/svgElevationRenderer.js";
import { renderSectionSvg } from "../../../services/drawing/svgSectionRenderer.js";

function compiledProject() {
  return {
    schema_version: "compiled-project-v1",
    metadata: { source: "compiled_project" },
    geometryHash: "phase4b-rendered-test",
    levels: [
      {
        id: "L0",
        level_number: 0,
        name: "Ground",
        height_m: 3.0,
        footprint_id: "fp-0",
      },
      {
        id: "L1",
        level_number: 1,
        name: "First",
        height_m: 2.8,
        footprint_id: "fp-1",
      },
    ],
    footprints: [
      {
        id: "fp-0",
        level_id: "L0",
        polygon: [
          { x: -5, y: -4 },
          { x: 5, y: -4 },
          { x: 5, y: 4 },
          { x: -5, y: 4 },
        ],
      },
      {
        id: "fp-1",
        level_id: "L1",
        polygon: [
          { x: -5, y: -4 },
          { x: 5, y: -4 },
          { x: 5, y: 4 },
          { x: -5, y: 4 },
        ],
      },
    ],
    walls: [
      {
        id: "w-S",
        level_id: "L0",
        exterior: true,
        start: { x: -5, y: 4 },
        end: { x: 5, y: 4 },
      },
      {
        id: "w-N",
        level_id: "L0",
        exterior: true,
        start: { x: -5, y: -4 },
        end: { x: 5, y: -4 },
      },
      {
        id: "w-W",
        level_id: "L0",
        exterior: true,
        start: { x: -5, y: -4 },
        end: { x: -5, y: 4 },
      },
      {
        id: "w-E",
        level_id: "L0",
        exterior: true,
        start: { x: 5, y: -4 },
        end: { x: 5, y: 4 },
      },
    ],
    rooms: [
      {
        id: "room-living",
        level_id: "L0",
        name: "Living",
        type: "living",
        bbox: { min_x: -4, min_y: -3, max_x: 4, max_y: 3 },
        polygon: [
          { x: -4, y: -3 },
          { x: 4, y: -3 },
          { x: 4, y: 3 },
          { x: -4, y: 3 },
        ],
      },
    ],
    windows: [
      {
        id: "win-S-1",
        level_id: "L0",
        wall_id: "w-S",
        position_m: 2,
        width_m: 1.5,
        height_m: 1.4,
        sill_m: 0.9,
      },
      {
        id: "win-S-2",
        level_id: "L0",
        wall_id: "w-S",
        position_m: 6,
        width_m: 1.5,
        height_m: 1.4,
        sill_m: 0.9,
      },
    ],
    doors: [
      {
        id: "door-S-1",
        level_id: "L0",
        wall_id: "w-S",
        position_m: 4,
        width_m: 1.0,
        height_m: 2.1,
      },
    ],
    site: { north_orientation_deg: 0 },
    envelope: {
      height: 5.8,
      polygon: [
        { x: -5, y: -4 },
        { x: 5, y: -4 },
        { x: 5, y: 4 },
        { x: -5, y: 4 },
      ],
    },
    roof: {
      type: "pitched_gable",
      pitch_degrees: 35,
      ridge_height_m: 8.2,
      peak_height_m: 8.2,
    },
    metadata: {
      source: "compiled_project",
      canonical_construction_truth: {
        roof: { ridge_height_m: 8.2, pitch_deg: 35 },
      },
    },
  };
}

describe("renderPlanSvg — Phase 4b outer perimeter chain", () => {
  test("flag off → no outer-perimeter group emitted", () => {
    const result = renderPlanSvg(compiledProject(), {
      levelId: "L0",
      width: 800,
      height: 600,
      sheetMode: true,
    });
    expect(result.svg).not.toMatch(/plan-outer-perimeter-dimensions/);
    expect(result.technical_quality_metadata.has_outer_perimeter_chain).toBe(
      false,
    );
    expect(
      result.technical_quality_metadata.outer_perimeter_chain_sides,
    ).toEqual([]);
  });

  test("showOuterDimensionChain:true → emits group on S+W by default", () => {
    const result = renderPlanSvg(compiledProject(), {
      levelId: "L0",
      width: 800,
      height: 600,
      sheetMode: true,
      showOuterDimensionChain: true,
    });
    expect(result.svg).toMatch(/plan-outer-perimeter-dimensions/);
    expect(result.svg).toMatch(/data-perimeter-side="S"/);
    expect(result.svg).toMatch(/data-perimeter-side="W"/);
    expect(result.svg).not.toMatch(/data-perimeter-side="N"/);
    expect(result.svg).not.toMatch(/data-perimeter-side="E"/);
    expect(result.technical_quality_metadata.has_outer_perimeter_chain).toBe(
      true,
    );
    expect(
      result.technical_quality_metadata.outer_perimeter_chain_sides,
    ).toEqual(["S", "W"]);
  });

  test("outerDimensionSides override emits only requested sides", () => {
    const result = renderPlanSvg(compiledProject(), {
      levelId: "L0",
      width: 800,
      height: 600,
      sheetMode: true,
      showOuterDimensionChain: true,
      outerDimensionSides: ["N", "E"],
    });
    expect(result.svg).toMatch(/data-perimeter-side="N"/);
    expect(result.svg).toMatch(/data-perimeter-side="E"/);
    expect(result.svg).not.toMatch(/data-perimeter-side="S"/);
    expect(result.svg).not.toMatch(/data-perimeter-side="W"/);
    expect(
      result.technical_quality_metadata.outer_perimeter_chain_sides,
    ).toEqual(["N", "E"]);
  });
});

describe("renderElevationSvg — Phase 4b ground hatch + 45° shadow + material legend", () => {
  test("flags off → no phase4b groups emitted", () => {
    const result = renderElevationSvg(
      compiledProject(),
      {},
      {
        orientation: "south",
        width: 800,
        height: 600,
        sheetMode: true,
        allowWeakFacadeFallback: true,
      },
    );
    expect(result.svg).not.toMatch(/phase4b-ground-hatch/);
    expect(result.svg).not.toMatch(/phase4b-shadow-45/);
    expect(result.svg).not.toMatch(/phase4b-material-legend/);
    expect(result.technical_quality_metadata.has_phase4b_ground_hatch).toBe(
      false,
    );
    expect(result.technical_quality_metadata.has_phase4b_shadow_45).toBe(false);
    expect(result.technical_quality_metadata.has_phase4b_material_legend).toBe(
      false,
    );
  });

  test("showGroundHatch:true → emits ground hatch group with N lines", () => {
    const result = renderElevationSvg(
      compiledProject(),
      {},
      {
        orientation: "south",
        width: 800,
        height: 600,
        sheetMode: true,
        allowWeakFacadeFallback: true,
        showGroundHatch: true,
      },
    );
    expect(result.svg).toMatch(/phase4b-ground-hatch/);
    expect(result.technical_quality_metadata.has_phase4b_ground_hatch).toBe(
      true,
    );
    expect(
      result.technical_quality_metadata.phase4b_ground_hatch_lines,
    ).toBeGreaterThan(0);
  });

  test("showShadow:{azimuth, elevation} → emits shadow polygon group", () => {
    const result = renderElevationSvg(
      compiledProject(),
      {},
      {
        orientation: "south",
        width: 800,
        height: 600,
        sheetMode: true,
        allowWeakFacadeFallback: true,
        showShadow: { azimuth: 45, elevation: 30 },
      },
    );
    expect(result.svg).toMatch(/phase4b-shadow-45/);
    expect(result.svg).toMatch(/data-shadow-azimuth="45"/);
    expect(result.svg).toMatch(/data-shadow-elevation="30"/);
    expect(result.technical_quality_metadata.has_phase4b_shadow_45).toBe(true);
  });

  test("showMaterialLegend:true → emits material legend strip", () => {
    const result = renderElevationSvg(
      compiledProject(),
      {},
      {
        orientation: "south",
        width: 800,
        height: 600,
        sheetMode: true,
        allowWeakFacadeFallback: true,
        showMaterialLegend: true,
      },
    );
    expect(result.svg).toMatch(/phase4b-material-legend/);
    expect(result.technical_quality_metadata.has_phase4b_material_legend).toBe(
      true,
    );
    expect(
      result.technical_quality_metadata.phase4b_material_legend_swatches,
    ).toBeGreaterThan(0);
  });
});

describe("renderSectionSvg — Phase 4b floor-to-floor + ridge labels", () => {
  test("flags off → no phase4b label groups emitted", () => {
    const result = renderSectionSvg(
      compiledProject(),
      {},
      {
        sectionType: "longitudinal",
        width: 800,
        height: 600,
        sheetMode: true,
      },
    );
    expect(result.svg).not.toMatch(/phase4b-floor-to-floor-labels/);
    expect(result.svg).not.toMatch(/phase4b-ridge-label/);
    expect(
      result.technical_quality_metadata.has_phase4b_floor_to_floor_labels,
    ).toBe(false);
    expect(result.technical_quality_metadata.has_phase4b_ridge_label).toBe(
      false,
    );
  });

  test("showFloorToFloorLabels:true → labels every level", () => {
    const result = renderSectionSvg(
      compiledProject(),
      {},
      {
        sectionType: "longitudinal",
        width: 800,
        height: 600,
        sheetMode: true,
        showFloorToFloorLabels: true,
      },
    );
    expect(result.svg).toMatch(/phase4b-floor-to-floor-labels/);
    expect(result.svg).toMatch(/F2F 3\.00m/);
    expect(result.svg).toMatch(/F2F 2\.80m/);
    expect(
      result.technical_quality_metadata.has_phase4b_floor_to_floor_labels,
    ).toBe(true);
    expect(
      result.technical_quality_metadata.phase4b_floor_to_floor_label_count,
    ).toBe(2);
  });

  test("showRidgeLabel:true → emits ridge label with metric height", () => {
    const result = renderSectionSvg(
      compiledProject(),
      {},
      {
        sectionType: "longitudinal",
        width: 800,
        height: 600,
        sheetMode: true,
        showRidgeLabel: true,
      },
    );
    expect(result.svg).toMatch(/phase4b-ridge-label/);
    expect(result.svg).toMatch(/Ridge \d+\.\d{2}m/);
    expect(result.technical_quality_metadata.has_phase4b_ridge_label).toBe(
      true,
    );
  });
});
