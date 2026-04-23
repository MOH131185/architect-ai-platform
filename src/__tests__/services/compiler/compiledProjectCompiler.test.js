import { resetFeatureFlags } from "../../../config/featureFlags.js";
import {
  COMPILED_PROJECT_SCHEMA_VERSION,
  compileProject,
} from "../../../services/compiler/compiledProjectCompiler.js";

function rectangle(minX, minY, maxX, maxY) {
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
}

function createCompilerInput() {
  return {
    project_id: "compiled-project-house",
    locationData: {
      city: "York",
      region: "North Yorkshire",
      country: "United Kingdom",
      recommendedStyle: "Contemporary Vernacular",
      localMaterials: ["brick", "timber"],
      climate: {
        type: "temperate oceanic",
        zone: "Cfb",
      },
      optimalOrientation: 182,
    },
    materialPriority: {
      primary: "brick",
      secondary: "timber",
    },
    masterDNA: {
      buildingOrientation: 182,
      climateDesign: {
        thermal: {
          strategy: "compact insulated envelope",
        },
        solar: {
          shading: "moderate seasonal shading",
        },
        ventilation: {
          strategy: "cross ventilation",
        },
      },
      environmental: {
        uValues: {
          wall: 0.18,
          roof: 0.13,
          glazing: 1.4,
          floor: 0.15,
        },
      },
      styleWeights: {
        local: 0.35,
        portfolio: 0.65,
        localStyle: "Contemporary Vernacular",
        portfolioStyle: "Nordic Minimal",
        dominantInfluence: "portfolio",
      },
    },
    styleDNA: {
      vernacularStyle: "Contemporary Vernacular",
      facade_language: "stacked-solid-void-rhythm",
      roof_language: "pitched gable",
      window_language: "grouped",
      roof_material: "slate",
      materials: ["brick", "timber", "slate"],
    },
    projectGeometry: {
      project_id: "compiled-project-house",
      site: {
        boundary_bbox: {
          min_x: 0,
          min_y: 0,
          max_x: 16,
          max_y: 14,
          width: 16,
          height: 14,
        },
        buildable_bbox: {
          min_x: 1,
          min_y: 1,
          max_x: 15,
          max_y: 13,
          width: 14,
          height: 12,
        },
        boundary_polygon: rectangle(0, 0, 16, 14),
        buildable_polygon: rectangle(1, 1, 15, 13),
      },
      metadata: {
        style_dna: {
          facade_language: "stacked-solid-void-rhythm",
          roof_language: "pitched gable",
        },
      },
      levels: [
        {
          id: "ground",
          level_number: 0,
          name: "Ground Floor",
          height_m: 3.2,
          footprint: rectangle(2, 2, 13, 10),
        },
        {
          id: "first",
          level_number: 1,
          name: "First Floor",
          height_m: 3.0,
          footprint: rectangle(2, 2, 13, 10),
        },
      ],
      rooms: [
        {
          id: "living",
          level_id: "ground",
          name: "Living Room",
          type: "living",
          actual_area: 29,
          polygon: rectangle(2.3, 2.3, 7.5, 6.6),
        },
        {
          id: "kitchen",
          level_id: "ground",
          name: "Kitchen",
          type: "kitchen",
          actual_area: 18,
          polygon: rectangle(7.5, 2.3, 12.6, 6.2),
        },
        {
          id: "bedroom-1",
          level_id: "first",
          name: "Bedroom 1",
          type: "bedroom",
          actual_area: 21,
          polygon: rectangle(2.3, 2.3, 7.2, 6.8),
        },
      ],
      walls: [
        {
          id: "wall-north",
          level_id: "ground",
          exterior: true,
          kind: "exterior",
          side: "north",
          start: { x: 2, y: 2 },
          end: { x: 13, y: 2 },
          thickness_m: 0.24,
          room_ids: ["living", "kitchen"],
        },
        {
          id: "wall-south",
          level_id: "ground",
          exterior: true,
          kind: "exterior",
          side: "south",
          start: { x: 2, y: 10 },
          end: { x: 13, y: 10 },
          thickness_m: 0.24,
          room_ids: ["living", "kitchen"],
        },
        {
          id: "wall-east",
          level_id: "ground",
          exterior: true,
          kind: "exterior",
          side: "east",
          start: { x: 13, y: 2 },
          end: { x: 13, y: 10 },
          thickness_m: 0.24,
          room_ids: ["kitchen"],
        },
        {
          id: "wall-west",
          level_id: "ground",
          exterior: true,
          kind: "exterior",
          side: "west",
          start: { x: 2, y: 2 },
          end: { x: 2, y: 10 },
          thickness_m: 0.24,
          room_ids: ["living"],
        },
        {
          id: "wall-internal",
          level_id: "ground",
          start: { x: 7.5, y: 2.3 },
          end: { x: 7.5, y: 8.8 },
          thickness_m: 0.14,
          room_ids: ["living", "kitchen"],
        },
      ],
      windows: [
        {
          id: "window-north-living",
          level_id: "ground",
          wall_id: "wall-north",
          width_m: 1.8,
          sill_height_m: 0.9,
          head_height_m: 2.1,
          position_m: { x: 4.8, y: 2 },
          room_ids: ["living"],
        },
        {
          id: "window-south-kitchen",
          level_id: "ground",
          wall_id: "wall-south",
          width_m: 1.5,
          sill_height_m: 0.9,
          head_height_m: 2.1,
          position_m: { x: 10.6, y: 10 },
          room_ids: ["kitchen"],
        },
      ],
      doors: [
        {
          id: "door-main",
          level_id: "ground",
          wall_id: "wall-south",
          width_m: 1.0,
          head_height_m: 2.2,
          position_m: { x: 8.7, y: 10 },
          swing: "left-in",
        },
      ],
      stairs: [
        {
          id: "stair-main",
          level_id: "ground",
          type: "straight_run",
          polygon: rectangle(6.1, 6.4, 8.4, 9.2),
        },
      ],
      roof: {
        id: "roof-main",
        type: "pitched gable",
        polygon: rectangle(2, 2, 13, 10),
      },
      roof_primitives: [
        {
          id: "roof-plane-west",
          primitive_family: "roof_plane",
          polygon: [
            { x: 2, y: 2 },
            { x: 7.5, y: 2 },
            { x: 7.5, y: 10 },
            { x: 2, y: 10 },
          ],
          slope_deg: 35,
          eave_depth_m: 0.6,
        },
        {
          id: "roof-plane-east",
          primitive_family: "roof_plane",
          polygon: [
            { x: 7.5, y: 2 },
            { x: 13, y: 2 },
            { x: 13, y: 10 },
            { x: 7.5, y: 10 },
          ],
          slope_deg: 35,
          eave_depth_m: 0.6,
        },
        {
          id: "ridge-main",
          primitive_family: "ridge",
          start: { x: 7.5, y: 2 },
          end: { x: 7.5, y: 10 },
          ridge_height_m: 3.4,
        },
        {
          id: "eave-south",
          primitive_family: "eave",
          side: "south",
          start: { x: 2, y: 10 },
          end: { x: 13, y: 10 },
        },
      ],
    },
  };
}

describe("compiledProjectCompiler", () => {
  beforeEach(() => {
    resetFeatureFlags();
  });

  it("builds a deterministic compiled project schema", () => {
    const compiled = compileProject(createCompilerInput());

    expect(compiled.schema_version).toBe(COMPILED_PROJECT_SCHEMA_VERSION);
    expect(compiled.metadata.source).toBe("compiled_project");
    expect(compiled.geometryHash).toBeTruthy();
    expect(compiled.footprint.polygon.length).toBeGreaterThanOrEqual(4);
    expect(compiled.levels).toHaveLength(2);
    expect(compiled.rooms.length).toBeGreaterThanOrEqual(3);
    expect(compiled.walls.length).toBeGreaterThanOrEqual(5);
    expect(compiled.openings.length).toBe(3);
    expect(compiled.roof.planes.length).toBeGreaterThanOrEqual(2);
    expect(compiled.roof.ridges.length).toBeGreaterThanOrEqual(1);
    expect(compiled.roof.eaves.length).toBeGreaterThanOrEqual(1);
    expect(compiled.facades.byOrientation.north).toBeDefined();
    expect(compiled.sectionCuts.candidates.length).toBeGreaterThan(0);
    expect(compiled.climateStrategy.type).toBe("temperate oceanic");
    expect(compiled.localeStyle.name).toBe("Contemporary Vernacular");
    expect(compiled.portfolioBlend.portfolioWeight).toBe(0.65);
    expect(Object.keys(compiled.renderInputs || {}).sort()).toEqual([
      "axonometric",
      "hero_3d",
      "interior_3d",
    ]);
    expect(compiled.renderInputs.hero_3d.sourceType).toBe(
      "compiled_render_input",
    );
    expect(compiled.renderInputs.hero_3d.dataUrl).toMatch(
      /^data:image\/svg\+xml;base64,/,
    );
    expect(compiled.renderInputs.hero_3d.geometryHash).toBe(
      compiled.geometryHash,
    );
    expect(compiled.artifacts.modelGlb).toBeNull();
  });

  it("keeps geometry hash stable when source arrays are reordered", () => {
    const base = createCompilerInput();
    const reordered = createCompilerInput();
    reordered.projectGeometry.levels = [
      ...reordered.projectGeometry.levels,
    ].reverse();
    reordered.projectGeometry.rooms = [
      ...reordered.projectGeometry.rooms,
    ].reverse();
    reordered.projectGeometry.walls = [
      ...reordered.projectGeometry.walls,
    ].reverse();
    reordered.projectGeometry.windows = [
      ...reordered.projectGeometry.windows,
    ].reverse();
    reordered.projectGeometry.roof_primitives = [
      ...reordered.projectGeometry.roof_primitives,
    ].reverse();

    const first = compileProject(base);
    const second = compileProject(reordered);

    expect(second.geometryHash).toBe(first.geometryHash);
    expect(second.footprint).toEqual(first.footprint);
    expect(second.rooms).toEqual(first.rooms);
    expect(second.walls).toEqual(first.walls);
    expect(second.renderInputs).toEqual(first.renderInputs);
  });

  it("is repeatable for the same input", () => {
    const input = createCompilerInput();

    const first = compileProject(input);
    const second = compileProject(input);

    expect(second).toEqual(first);
  });
});
