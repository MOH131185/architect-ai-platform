/**
 * Phase 4b — integration: `buildCompiledProjectTechnicalPanels` accepts a
 * `panelSpecsByType` lookup and threads the deterministic-SVG rendering
 * polish flags from each panel spec into renderPlanSvg / renderElevationSvg
 * / renderSectionSvg. The resulting panel SVG strings carry the rendered
 * polish markers (e.g. `plan-outer-perimeter-dimensions`,
 * `phase4b-ground-hatch`, `phase4b-floor-to-floor-labels`).
 *
 * Without panelSpecsByType, the builder behaves exactly as before — no
 * polish groups in any panel SVG. This locks the regression guarantee for
 * existing callers that don't decorate panel specs.
 */

import { buildCompiledProjectTechnicalPanels } from "../../../services/canonical/compiledProjectTechnicalPackBuilder.js";

function compiledProject() {
  return {
    schema_version: "compiled-project-v1",
    metadata: {
      source: "compiled_project",
      canonical_construction_truth: {
        roof: { ridge_height_m: 8.2, pitch_deg: 35 },
      },
    },
    geometryHash: "phase4b-threading-test",
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
      {
        id: "room-bed",
        level_id: "L1",
        name: "Bedroom",
        type: "bedroom",
        bbox: { min_x: -4, min_y: -3, max_x: 4, max_y: 3 },
        polygon: [
          { x: -4, y: -3 },
          { x: 4, y: -3 },
          { x: 4, y: 3 },
          { x: -4, y: 3 },
        ],
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
    roof: { type: "pitched_gable", ridge_height_m: 8.2 },
  };
}

const PRESENTATION_SPECS_BY_TYPE = {
  floor_plan_ground: {
    panelType: "floor_plan_ground",
    showOuterDimensionChain: true,
    outerDimensionSides: ["S", "W"],
  },
  floor_plan_first: {
    panelType: "floor_plan_first",
    showOuterDimensionChain: true,
    outerDimensionSides: ["S", "W"],
  },
  elevation_south: {
    panelType: "elevation_south",
    showGroundHatch: true,
    showShadow: { azimuth: 45, elevation: 30 },
    showMaterialLegend: true,
  },
  elevation_north: {
    panelType: "elevation_north",
    showGroundHatch: true,
    showShadow: { azimuth: 45, elevation: 30 },
    showMaterialLegend: true,
  },
  elevation_east: {
    panelType: "elevation_east",
    showGroundHatch: true,
    showShadow: { azimuth: 45, elevation: 30 },
    showMaterialLegend: true,
  },
  elevation_west: {
    panelType: "elevation_west",
    showGroundHatch: true,
    showShadow: { azimuth: 45, elevation: 30 },
    showMaterialLegend: true,
  },
  section_AA: {
    panelType: "section_AA",
    showFloorToFloorLabels: true,
    showRidgeLabel: true,
  },
  section_BB: {
    panelType: "section_BB",
    showFloorToFloorLabels: true,
    showRidgeLabel: true,
  },
};

describe("buildCompiledProjectTechnicalPanels — Phase 4b panelSpecsByType threading", () => {
  test("WITHOUT panelSpecsByType → no Phase 4b polish in any panel", () => {
    const result = buildCompiledProjectTechnicalPanels(compiledProject(), {
      layoutTemplate: "presentation-v3",
    });
    expect(result.ok).toBe(true);
    const panels = result.technicalPanels;
    expect(panels.floor_plan_ground.svgString).not.toMatch(
      /plan-outer-perimeter-dimensions/,
    );
    expect(panels.elevation_south.svgString).not.toMatch(
      /phase4b-ground-hatch/,
    );
    expect(panels.elevation_south.svgString).not.toMatch(/phase4b-shadow-45/);
    expect(panels.elevation_south.svgString).not.toMatch(
      /phase4b-material-legend/,
    );
    expect(panels.section_AA.svgString).not.toMatch(
      /phase4b-floor-to-floor-labels/,
    );
    expect(panels.section_AA.svgString).not.toMatch(/phase4b-ridge-label/);
  });

  test("WITH panelSpecsByType → every spec'd polish marker appears in the right panel", () => {
    const result = buildCompiledProjectTechnicalPanels(compiledProject(), {
      layoutTemplate: "presentation-v3",
      panelSpecsByType: PRESENTATION_SPECS_BY_TYPE,
    });
    expect(result.ok).toBe(true);
    const panels = result.technicalPanels;

    // Floor plans
    expect(panels.floor_plan_ground.svgString).toMatch(
      /plan-outer-perimeter-dimensions/,
    );
    expect(panels.floor_plan_ground.svgString).toMatch(
      /data-perimeter-side="S"/,
    );
    expect(panels.floor_plan_ground.svgString).toMatch(
      /data-perimeter-side="W"/,
    );
    expect(panels.floor_plan_first.svgString).toMatch(
      /plan-outer-perimeter-dimensions/,
    );

    // Elevations
    for (const elevPanel of [
      panels.elevation_south,
      panels.elevation_north,
      panels.elevation_east,
      panels.elevation_west,
    ]) {
      if (!elevPanel) continue; // skip if a side wasn't emitted
      expect(elevPanel.svgString).toMatch(/phase4b-ground-hatch/);
      expect(elevPanel.svgString).toMatch(/phase4b-shadow-45/);
      expect(elevPanel.svgString).toMatch(/phase4b-material-legend/);
    }

    // Sections
    expect(panels.section_AA.svgString).toMatch(
      /phase4b-floor-to-floor-labels/,
    );
    expect(panels.section_AA.svgString).toMatch(/phase4b-ridge-label/);
    expect(panels.section_BB.svgString).toMatch(
      /phase4b-floor-to-floor-labels/,
    );
  });

  test("WITH panelSpecsByType but only some panels flagged → flagged panels carry markers, unflagged stay clean", () => {
    const partial = {
      floor_plan_ground: {
        panelType: "floor_plan_ground",
        showOuterDimensionChain: true,
      },
      // No elevation/section flags.
    };
    const result = buildCompiledProjectTechnicalPanels(compiledProject(), {
      layoutTemplate: "presentation-v3",
      panelSpecsByType: partial,
    });
    expect(result.ok).toBe(true);
    expect(result.technicalPanels.floor_plan_ground.svgString).toMatch(
      /plan-outer-perimeter-dimensions/,
    );
    expect(result.technicalPanels.floor_plan_first.svgString).not.toMatch(
      /plan-outer-perimeter-dimensions/,
    );
    expect(result.technicalPanels.elevation_south.svgString).not.toMatch(
      /phase4b-ground-hatch/,
    );
    expect(result.technicalPanels.section_AA.svgString).not.toMatch(
      /phase4b-ridge-label/,
    );
  });
});
