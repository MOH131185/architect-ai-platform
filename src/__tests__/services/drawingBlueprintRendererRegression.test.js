import { renderPlanSvg } from "../../services/drawing/svgPlanRenderer.js";
import { renderElevationSvg } from "../../services/drawing/svgElevationRenderer.js";
import { renderSectionSvg } from "../../services/drawing/svgSectionRenderer.js";
import {
  getEnvelopeDrawingBoundsWithSource,
  getLevelDrawingBoundsWithSource,
} from "../../services/drawing/drawingBounds.js";

function rectangle(minX, minY, maxX, maxY) {
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
}

function createCompiledProjectFixture() {
  const buildingPolygon = rectangle(10, 8, 22, 16);
  const geometry = {
    schema_version: "canonical-project-geometry-v2",
    project_id: "blueprint-regression",
    site: {
      boundary_bbox: {
        min_x: 0,
        min_y: 0,
        max_x: 60,
        max_y: 40,
        width: 60,
        height: 40,
      },
      buildable_bbox: {
        min_x: 2,
        min_y: 2,
        max_x: 58,
        max_y: 38,
        width: 56,
        height: 36,
      },
      boundary_polygon: rectangle(0, 0, 60, 40),
      buildable_polygon: rectangle(2, 2, 58, 38),
      north_orientation_deg: 0,
    },
    roof: {
      type: "pitched gable",
    },
    footprints: [
      {
        id: "fp-ground",
        level_id: "ground",
        polygon: buildingPolygon,
        bbox: { min_x: 10, min_y: 8, max_x: 22, max_y: 16 },
      },
      {
        id: "fp-first",
        level_id: "first",
        polygon: buildingPolygon,
        bbox: { min_x: 10, min_y: 8, max_x: 22, max_y: 16 },
      },
    ],
    slabs: [
      {
        id: "slab-ground",
        level_id: "ground",
        polygon: buildingPolygon,
        bbox: { min_x: 10, min_y: 8, max_x: 22, max_y: 16 },
      },
      {
        id: "slab-first",
        level_id: "first",
        polygon: buildingPolygon,
        bbox: { min_x: 10, min_y: 8, max_x: 22, max_y: 16 },
      },
    ],
    levels: [
      {
        id: "ground",
        level_number: 0,
        name: "Ground Floor",
        height_m: 3.2,
        footprint_id: "fp-ground",
      },
      {
        id: "first",
        level_number: 1,
        name: "First Floor",
        height_m: 3.1,
        footprint_id: "fp-first",
      },
    ],
    rooms: [
      {
        id: "living",
        level_id: "ground",
        name: "Living Room",
        actual_area: 24,
        polygon: rectangle(10, 8, 16, 12),
        bbox: { min_x: 10, min_y: 8, max_x: 16, max_y: 12 },
        centroid: { x: 13, y: 10 },
      },
      {
        id: "kitchen",
        level_id: "ground",
        name: "Kitchen",
        actual_area: 24,
        polygon: rectangle(16, 8, 22, 12),
        bbox: { min_x: 16, min_y: 8, max_x: 22, max_y: 12 },
        centroid: { x: 19, y: 10 },
      },
      {
        id: "bedroom",
        level_id: "first",
        name: "Bedroom 1",
        actual_area: 24,
        polygon: rectangle(10, 8, 16, 12),
        bbox: { min_x: 10, min_y: 8, max_x: 16, max_y: 12 },
        centroid: { x: 13, y: 10 },
      },
      {
        id: "study",
        level_id: "first",
        name: "Study",
        actual_area: 24,
        polygon: rectangle(16, 8, 22, 12),
        bbox: { min_x: 16, min_y: 8, max_x: 22, max_y: 12 },
        centroid: { x: 19, y: 10 },
      },
    ],
    walls: [
      {
        id: "wall-south-ground",
        level_id: "ground",
        exterior: true,
        thickness_m: 0.3,
        orientation: "horizontal",
        start: { x: 10, y: 8 },
        end: { x: 22, y: 8 },
        metadata: { side: "south" },
      },
      {
        id: "wall-north-ground",
        level_id: "ground",
        exterior: true,
        thickness_m: 0.3,
        orientation: "horizontal",
        start: { x: 10, y: 16 },
        end: { x: 22, y: 16 },
        metadata: { side: "north" },
      },
      {
        id: "wall-east-ground",
        level_id: "ground",
        exterior: true,
        thickness_m: 0.3,
        orientation: "vertical",
        start: { x: 22, y: 8 },
        end: { x: 22, y: 16 },
        metadata: { side: "east" },
      },
      {
        id: "wall-west-ground",
        level_id: "ground",
        exterior: true,
        thickness_m: 0.3,
        orientation: "vertical",
        start: { x: 10, y: 8 },
        end: { x: 10, y: 16 },
        metadata: { side: "west" },
      },
      {
        id: "wall-core-ground",
        level_id: "ground",
        exterior: false,
        thickness_m: 0.14,
        orientation: "vertical",
        start: { x: 16, y: 8 },
        end: { x: 16, y: 12 },
        metadata: {},
      },
      {
        id: "wall-south-first",
        level_id: "first",
        exterior: true,
        thickness_m: 0.3,
        orientation: "horizontal",
        start: { x: 10, y: 8 },
        end: { x: 22, y: 8 },
        metadata: { side: "south" },
      },
      {
        id: "wall-north-first",
        level_id: "first",
        exterior: true,
        thickness_m: 0.3,
        orientation: "horizontal",
        start: { x: 10, y: 16 },
        end: { x: 22, y: 16 },
        metadata: { side: "north" },
      },
      {
        id: "wall-east-first",
        level_id: "first",
        exterior: true,
        thickness_m: 0.3,
        orientation: "vertical",
        start: { x: 22, y: 8 },
        end: { x: 22, y: 16 },
        metadata: { side: "east" },
      },
      {
        id: "wall-west-first",
        level_id: "first",
        exterior: true,
        thickness_m: 0.3,
        orientation: "vertical",
        start: { x: 10, y: 8 },
        end: { x: 10, y: 16 },
        metadata: { side: "west" },
      },
    ],
    doors: [
      {
        id: "front-door",
        level_id: "ground",
        wall_id: "wall-south-ground",
        position_m: { x: 14.2, y: 8 },
        width_m: 1,
        head_height_m: 2.2,
      },
    ],
    windows: [
      {
        id: "south-window-ground",
        level_id: "ground",
        wall_id: "wall-south-ground",
        position_m: { x: 18.8, y: 8 },
        width_m: 1.6,
        sill_height_m: 0.9,
        head_height_m: 2.1,
      },
      {
        id: "south-window-first",
        level_id: "first",
        wall_id: "wall-south-first",
        position_m: { x: 18.4, y: 8 },
        width_m: 1.5,
        sill_height_m: 0.9,
        head_height_m: 2.1,
      },
    ],
    stairs: [
      {
        id: "main-stair",
        level_id: "ground",
        polygon: rectangle(15.2, 11.8, 17.2, 15.6),
        bbox: { min_x: 15.2, min_y: 11.8, max_x: 17.2, max_y: 15.6 },
      },
    ],
    circulation: [
      {
        id: "ground-corridor",
        level_id: "ground",
        polyline: [
          { x: 11, y: 14.2 },
          { x: 16.2, y: 14.2 },
          { x: 21.2, y: 14.2 },
        ],
      },
    ],
    metadata: {
      facade_grammar: {
        orientations: [
          {
            side: "south",
            material_zones: [
              { material: "primary facade", start_m: 0, end_m: 7.2 },
              { material: "secondary accent", start_m: 7.2, end_m: 12 },
            ],
            opening_rhythm: { opening_count: 2 },
            components: {
              bays: [{ id: "south-bay-1" }, { id: "south-bay-2" }],
              feature_frames: [{ id: "south-frame-1" }],
            },
          },
        ],
      },
    },
  };

  return {
    designFingerprint: "compiled-blueprint-regression",
    styleDNA: {
      roof_language: "pitched gable",
      materials: [
        { role: "primary", name: "Brick", color: "#B55D4C" },
        { role: "secondary", name: "Timber", color: "#9A6A3A" },
        { role: "roof", name: "Slate", color: "#5F6670" },
      ],
    },
    compiledProject: {
      projectGeometry: geometry,
    },
  };
}

describe("Blueprint renderer regressions", () => {
  test("prefers building-derived bounds over oversized site bounds for compiled-project input", () => {
    const compiled = createCompiledProjectFixture();

    const envelope = getEnvelopeDrawingBoundsWithSource(compiled);
    const level = getLevelDrawingBoundsWithSource(compiled, "ground");

    expect(envelope.source).toBe("building_derived");
    expect(level.source).toBe("building_derived");
    expect(envelope.bounds.width).toBeCloseTo(12.3, 1);
    expect(level.bounds.height).toBeCloseTo(8.3, 1);
  });

  test("sheet-mode renderers emit a monochrome blueprint theme without site chrome", () => {
    const compiled = createCompiledProjectFixture();
    const plan = renderPlanSvg(compiled, {
      levelId: "ground",
      sheetMode: true,
    });
    const elevation = renderElevationSvg(
      compiled,
      {},
      {
        orientation: "south",
        sheetMode: true,
      },
    );
    const section = renderSectionSvg(
      compiled,
      {},
      {
        sheetMode: true,
        sectionType: "longitudinal",
        sectionProfile: {
          id: "section:blueprint-regression",
          sectionType: "longitudinal",
          cutLine: {
            from: { x: 16.2, y: 8 },
            to: { x: 16.2, y: 16 },
          },
          focusEntityIds: ["main-stair", "living"],
        },
      },
    );

    [plan, elevation, section].forEach((drawing) => {
      expect(drawing.svg).toContain('data-theme="blueprint-monochrome"');
      expect(drawing.svg).not.toContain("#B55D4C");
      expect(drawing.svg).not.toContain("#2c78c4");
      expect(drawing.svg).not.toContain("#f6ede3");
    });
    expect(plan.svg).not.toContain('id="north-arrow"');
    expect(plan.technical_quality_metadata.bounds_source).toBe(
      "building_derived",
    );
  });

  test("plans elevations and sections maintain strong slot occupancy", () => {
    const compiled = createCompiledProjectFixture();
    const plan = renderPlanSvg(compiled, {
      levelId: "ground",
      sheetMode: true,
    });
    const elevation = renderElevationSvg(
      compiled,
      {},
      {
        orientation: "south",
        sheetMode: true,
      },
    );
    const section = renderSectionSvg(
      compiled,
      {},
      {
        sheetMode: true,
        sectionType: "longitudinal",
        sectionProfile: {
          id: "section:blueprint-occupancy",
          sectionType: "longitudinal",
          cutLine: {
            from: { x: 16.2, y: 8 },
            to: { x: 16.2, y: 16 },
          },
        },
      },
    );

    expect(
      plan.technical_quality_metadata.slot_occupancy_ratio,
    ).toBeGreaterThan(0.55);
    expect(
      elevation.technical_quality_metadata.slot_occupancy_ratio,
    ).toBeGreaterThan(0.45);
    expect(
      section.technical_quality_metadata.slot_occupancy_ratio,
    ).toBeGreaterThan(0.35);
  });

  test("renderers emit richer visible technical content across plan elevation and section", () => {
    const compiled = createCompiledProjectFixture();
    const sectionOptions = {
      sheetMode: true,
      sectionType: "longitudinal",
      sectionProfile: {
        id: "section:blueprint-richness",
        sectionType: "longitudinal",
        cutLine: {
          from: { x: 16.2, y: 8 },
          to: { x: 16.2, y: 16 },
        },
        focusEntityIds: ["main-stair", "living"],
      },
    };

    const plan = renderPlanSvg(compiled, {
      levelId: "ground",
      sheetMode: true,
    });
    const elevation = renderElevationSvg(
      compiled,
      {},
      {
        orientation: "south",
        sheetMode: true,
      },
    );
    const section = renderSectionSvg(compiled, {}, sectionOptions);

    expect(plan.svg).toContain('id="phase8-plan-furniture"');
    expect(plan.svg).toContain("LIVING ROOM");
    expect(plan.svg).toContain("24.0 M2");
    expect(plan.svg).toContain("6.0 x 4.0 M");
    expect(
      plan.technical_quality_metadata.furniture_hint_count,
    ).toBeGreaterThan(0);

    expect(elevation.svg).toContain('id="phase8-elevation-material-zones"');
    expect(elevation.svg).toContain('id="phase8-elevation-articulation"');
    expect(elevation.svg).toContain('id="phase8-elevation-rhythm"');
    expect(elevation.svg).toContain('id="phase8-feature-frame"');
    expect(
      elevation.technical_quality_metadata.facade_articulation_count,
    ).toBeGreaterThan(0);

    expect(section.svg).toContain("GROUND RELATION");
    expect(section.svg).toContain("DIRECT CUT");
    expect(section.svg).toContain('id="phase14-section-slabs"');
    expect(section.svg).toContain('class="phase8-section-level-label"');
  });

  test("renderers remain deterministic for repeated compiled-project renders", () => {
    const compiled = createCompiledProjectFixture();
    const sectionOptions = {
      sectionType: "longitudinal",
      sheetMode: true,
      sectionProfile: {
        id: "section:blueprint-deterministic",
        sectionType: "longitudinal",
        cutLine: {
          from: { x: 16.2, y: 8 },
          to: { x: 16.2, y: 16 },
        },
        focusEntityIds: ["main-stair", "living"],
      },
    };

    expect(renderPlanSvg(compiled, { levelId: "ground" }).svg).toBe(
      renderPlanSvg(compiled, { levelId: "ground" }).svg,
    );
    expect(renderElevationSvg(compiled, {}, { orientation: "south" }).svg).toBe(
      renderElevationSvg(compiled, {}, { orientation: "south" }).svg,
    );
    expect(renderSectionSvg(compiled, {}, sectionOptions).svg).toBe(
      renderSectionSvg(compiled, {}, sectionOptions).svg,
    );
  });
});
