import { resetFeatureFlags } from "../../config/featureFlags.js";
import {
  buildCanonicalPack,
  CanonicalPackError,
  ERROR_CODES,
} from "../../services/canonical/CanonicalGeometryPackService.js";
import { compileProject } from "../../services/compiler/compiledProjectCompiler.js";
import * as planRenderer from "../../services/drawing/svgPlanRenderer.js";
import * as sectionRenderer from "../../services/drawing/svgSectionRenderer.js";

function rectangle(minX, minY, maxX, maxY) {
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
}

function createProjectGeometry() {
  return {
    schema_version: "canonical-project-geometry-v2",
    project_id: "canonical-pack-compiled-project",
    designFingerprint: "fp-canonical-pack-compiled-project",
    site: {
      boundary_bbox: {
        min_x: 0,
        min_y: 0,
        max_x: 12,
        max_y: 10,
        width: 12,
        height: 10,
      },
      buildable_bbox: {
        min_x: 0,
        min_y: 0,
        max_x: 12,
        max_y: 10,
        width: 12,
        height: 10,
      },
      boundary_polygon: rectangle(0, 0, 12, 10),
      buildable_polygon: rectangle(0, 0, 12, 10),
      north_orientation_deg: 0,
    },
    roof: {
      id: "roof-main",
      type: "pitched gable",
      polygon: rectangle(0, 0, 12, 10),
      bbox: {
        min_x: 0,
        min_y: 0,
        max_x: 12,
        max_y: 10,
        width: 12,
        height: 10,
      },
    },
    levels: [
      {
        id: "ground",
        level_number: 0,
        name: "Ground Floor",
        height_m: 3.2,
        footprint: rectangle(0, 0, 12, 10),
      },
      {
        id: "first",
        level_number: 1,
        name: "First Floor",
        height_m: 3.1,
        footprint: rectangle(0, 0, 12, 10),
      },
    ],
    footprints: [
      {
        id: "footprint-ground",
        polygon: rectangle(0, 0, 12, 10),
      },
    ],
    rooms: [
      {
        id: "living",
        level_id: "ground",
        name: "Living Room",
        zone: "public",
        polygon: rectangle(0.6, 0.6, 5.8, 4.8),
        bbox: {
          min_x: 0.6,
          min_y: 0.6,
          max_x: 5.8,
          max_y: 4.8,
        },
        centroid: { x: 3.2, y: 2.7 },
        actual_area: 21.8,
      },
      {
        id: "kitchen",
        level_id: "ground",
        name: "Kitchen",
        zone: "service",
        polygon: rectangle(6.2, 0.6, 11.4, 4.8),
        bbox: {
          min_x: 6.2,
          min_y: 0.6,
          max_x: 11.4,
          max_y: 4.8,
        },
        centroid: { x: 8.8, y: 2.7 },
        actual_area: 21.8,
      },
      {
        id: "bedroom",
        level_id: "first",
        name: "Bedroom",
        zone: "private",
        polygon: rectangle(1, 1, 11, 8.8),
        bbox: {
          min_x: 1,
          min_y: 1,
          max_x: 11,
          max_y: 8.8,
        },
        centroid: { x: 6, y: 4.9 },
        actual_area: 78,
      },
    ],
    slabs: [
      {
        id: "slab-ground",
        level_id: "ground",
        polygon: rectangle(0, 0, 12, 10),
        bbox: { min_x: 0, min_y: 0, max_x: 12, max_y: 10 },
      },
      {
        id: "slab-first",
        level_id: "first",
        polygon: rectangle(0, 0, 12, 10),
        bbox: { min_x: 0, min_y: 0, max_x: 12, max_y: 10 },
      },
    ],
    walls: [
      {
        id: "ground-north",
        level_id: "ground",
        exterior: true,
        kind: "exterior",
        side: "north",
        orientation: "horizontal",
        start: { x: 0, y: 0 },
        end: { x: 12, y: 0 },
        metadata: { side: "north" },
      },
      {
        id: "ground-south",
        level_id: "ground",
        exterior: true,
        kind: "exterior",
        side: "south",
        orientation: "horizontal",
        start: { x: 0, y: 10 },
        end: { x: 12, y: 10 },
        metadata: { side: "south", features: ["porch"] },
      },
      {
        id: "ground-east",
        level_id: "ground",
        exterior: true,
        kind: "exterior",
        side: "east",
        orientation: "vertical",
        start: { x: 12, y: 0 },
        end: { x: 12, y: 10 },
        metadata: { side: "east" },
      },
      {
        id: "ground-west",
        level_id: "ground",
        exterior: true,
        kind: "exterior",
        side: "west",
        orientation: "vertical",
        start: { x: 0, y: 0 },
        end: { x: 0, y: 10 },
        metadata: { side: "west" },
      },
      {
        id: "first-north",
        level_id: "first",
        exterior: true,
        kind: "exterior",
        side: "north",
        orientation: "horizontal",
        start: { x: 0, y: 0 },
        end: { x: 12, y: 0 },
        metadata: { side: "north" },
      },
      {
        id: "first-south",
        level_id: "first",
        exterior: true,
        kind: "exterior",
        side: "south",
        orientation: "horizontal",
        start: { x: 0, y: 10 },
        end: { x: 12, y: 10 },
        metadata: { side: "south", features: ["dormer"] },
      },
      {
        id: "first-east",
        level_id: "first",
        exterior: true,
        kind: "exterior",
        side: "east",
        orientation: "vertical",
        start: { x: 12, y: 0 },
        end: { x: 12, y: 10 },
        metadata: { side: "east" },
      },
      {
        id: "first-west",
        level_id: "first",
        exterior: true,
        kind: "exterior",
        side: "west",
        orientation: "vertical",
        start: { x: 0, y: 0 },
        end: { x: 0, y: 10 },
        metadata: { side: "west" },
      },
      {
        id: "ground-core",
        level_id: "ground",
        exterior: false,
        kind: "interior",
        orientation: "vertical",
        start: { x: 6, y: 0.6 },
        end: { x: 6, y: 4.8 },
      },
      {
        id: "first-core",
        level_id: "first",
        exterior: false,
        kind: "interior",
        orientation: "vertical",
        start: { x: 6, y: 1 },
        end: { x: 6, y: 8.8 },
      },
    ],
    doors: [
      {
        id: "front-door",
        level_id: "ground",
        wall_id: "ground-south",
        position_m: { x: 1.6, y: 10 },
        width_m: 1.1,
        head_height_m: 2.2,
      },
    ],
    windows: [
      {
        id: "window-north-ground",
        level_id: "ground",
        wall_id: "ground-north",
        position_m: { x: 3.2, y: 0 },
        width_m: 1.5,
        sill_height_m: 0.9,
        head_height_m: 2.1,
      },
      {
        id: "window-south-ground",
        level_id: "ground",
        wall_id: "ground-south",
        position_m: { x: 8.8, y: 10 },
        width_m: 1.5,
        sill_height_m: 0.9,
        head_height_m: 2.1,
      },
      {
        id: "window-east-first",
        level_id: "first",
        wall_id: "first-east",
        position_m: { x: 12, y: 5.2 },
        width_m: 1.4,
        sill_height_m: 0.9,
        head_height_m: 2.1,
      },
      {
        id: "window-west-first",
        level_id: "first",
        wall_id: "first-west",
        position_m: { x: 0, y: 5.2 },
        width_m: 1.4,
        sill_height_m: 0.9,
        head_height_m: 2.1,
      },
    ],
    stairs: [
      {
        id: "main-stair",
        level_id: "ground",
        polygon: rectangle(5.1, 1.4, 6.9, 7.2),
        bbox: {
          min_x: 5.1,
          min_y: 1.4,
          max_x: 6.9,
          max_y: 7.2,
        },
      },
    ],
  };
}

function createCompiledProject() {
  return compileProject({
    projectGeometry: createProjectGeometry(),
    masterDNA: {
      designFingerprint: "fp-canonical-pack-compiled-project",
      styleDNA: {
        facade_language: "stacked-solid-void-rhythm",
        roof_language: "pitched gable",
      },
    },
    locationData: {
      climate: {
        type: "temperate oceanic",
        zone: "Cfb",
      },
    },
  });
}

describe("CanonicalGeometryPackService", () => {
  beforeEach(() => {
    resetFeatureFlags();
    jest.restoreAllMocks();
  });

  test("builds technical panels from compiled project geometry with compiled-project metadata", () => {
    const planSpy = jest.spyOn(planRenderer, "renderPlanSvg");
    const pack = buildCanonicalPack({
      designFingerprint: "fp-test-pack",
      compiledProject: createCompiledProject(),
    });

    expect(pack.status).toBe("COMPLETE");
    expect(pack.geometryHash).toBeTruthy();
    expect(pack.panelCount).toBeGreaterThanOrEqual(11);
    expect(pack.metadata).toEqual(
      expect.objectContaining({
        source: "compiled_project",
        authoritySource: "compiled_project",
        compiledProjectSchemaVersion: "compiled-project-v1",
      }),
    );
    expect(planSpy).toHaveBeenCalled();
    planSpy.mock.calls.forEach((call) => {
      expect(call[1]?.theme).toBeUndefined();
    });

    [
      "floor_plan_ground",
      "floor_plan_first",
      "elevation_north",
      "elevation_south",
      "elevation_east",
      "elevation_west",
      "section_AA",
      "section_BB",
    ].forEach((panelType) => {
      const panel = pack.panels[panelType];
      expect(panel).toBeTruthy();
      expect(panel.svgString).toContain("<svg");
      expect(panel.dataUrl).toMatch(/^data:image\/svg\+xml;base64,/);
      expect(panel.svgHash).toBeTruthy();
      expect(panel.geometryHash).toBe(pack.geometryHash);
      expect(panel.metadata).toEqual(
        expect.objectContaining({
          source: "compiled_project",
          authoritySource: "compiled_project",
          compiledProjectSchemaVersion: "compiled-project-v1",
          panelType,
          geometryHash: pack.geometryHash,
          svgHash: panel.svgHash,
          technical: true,
        }),
      );
    });

    ["hero_3d", "axonometric", "interior_3d"].forEach((panelType) => {
      const panel = pack.panels[panelType];
      expect(panel).toBeTruthy();
      expect(panel.dataUrl).toMatch(/^data:image\/svg\+xml;base64,/);
      expect(panel.geometryHash).toBe(pack.geometryHash);
      expect(panel.metadata).toEqual(
        expect.objectContaining({
          source: "compiled_project",
          panelType,
          geometryHash: pack.geometryHash,
          technical: false,
          sourceType: "compiled_render_input",
        }),
      );
      expect(panel.metadata.aliasOf).toBeUndefined();
    });
  });

  test("fails deterministically when a compiled-project technical view cannot be rendered", () => {
    jest.spyOn(sectionRenderer, "renderSectionSvg").mockImplementation(() => ({
      svg: null,
      status: "blocked",
      blocking_reasons: ["section profile unavailable"],
    }));

    try {
      buildCanonicalPack({
        designFingerprint: "fp-test-pack",
        compiledProject: createCompiledProject(),
      });
      throw new Error("Expected buildCanonicalPack to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(CanonicalPackError);
      expect(error.code).toBe(ERROR_CODES.INCOMPLETE_PACK);
      expect(error.message).toContain("compiled project");
      expect(error.message).toContain("section_AA");
    }
  });

  test("fails when the input only contains canonical project geometry", () => {
    try {
      buildCanonicalPack({
        designFingerprint: "fp-test-pack",
        projectGeometry: createProjectGeometry(),
      });
      throw new Error("Expected buildCanonicalPack to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(CanonicalPackError);
      expect(error.code).toBe(ERROR_CODES.MISSING_GEOMETRY);
      expect(error.message).toContain("compiled project");
    }
  });
});
