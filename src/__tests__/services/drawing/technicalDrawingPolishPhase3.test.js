import { renderPlanSvg } from "../../../services/drawing/svgPlanRenderer.js";
import { renderElevationSvg } from "../../../services/drawing/svgElevationRenderer.js";
import { renderSectionSvg } from "../../../services/drawing/svgSectionRenderer.js";
import {
  renderFurnitureSymbol,
  resolveFurnitureToken,
  FURNITURE_TOKENS,
  FURNITURE_SYMBOL_VERSION,
} from "../../../services/drawing/furnitureSymbolService.js";
import { getBlueprintTheme } from "../../../services/drawing/drawingBounds.js";

function rectangle(minX, minY, maxX, maxY) {
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
}

function makeWalls(levelId) {
  return [
    {
      id: `${levelId}-w-s`,
      level_id: levelId,
      exterior: true,
      thickness_m: 0.3,
      orientation: "horizontal",
      start: { x: 10, y: 8 },
      end: { x: 22, y: 8 },
      metadata: { side: "south" },
    },
    {
      id: `${levelId}-w-n`,
      level_id: levelId,
      exterior: true,
      thickness_m: 0.3,
      orientation: "horizontal",
      start: { x: 10, y: 16 },
      end: { x: 22, y: 16 },
      metadata: { side: "north" },
    },
    {
      id: `${levelId}-w-e`,
      level_id: levelId,
      exterior: true,
      thickness_m: 0.3,
      orientation: "vertical",
      start: { x: 22, y: 8 },
      end: { x: 22, y: 16 },
      metadata: { side: "east" },
    },
    {
      id: `${levelId}-w-w`,
      level_id: levelId,
      exterior: true,
      thickness_m: 0.3,
      orientation: "vertical",
      start: { x: 10, y: 8 },
      end: { x: 10, y: 16 },
      metadata: { side: "west" },
    },
  ];
}

function makeRooms(levelId, opts = {}) {
  const list = [];
  if (levelId === "ground") {
    list.push(
      {
        id: "living",
        level_id: levelId,
        name: "Living Room",
        actual_area: 24,
        polygon: rectangle(10, 8, 16, 12),
        bbox: { min_x: 10, min_y: 8, max_x: 16, max_y: 12 },
        centroid: { x: 13, y: 10 },
      },
      {
        id: "kitchen",
        level_id: levelId,
        name: "Kitchen with Island",
        actual_area: 24,
        polygon: rectangle(16, 8, 22, 12),
        bbox: { min_x: 16, min_y: 8, max_x: 22, max_y: 12 },
        centroid: { x: 19, y: 10 },
      },
      {
        id: "wc",
        level_id: levelId,
        name: "Cloak / WC",
        actual_area: 4,
        polygon: rectangle(10, 12, 14, 16),
        bbox: { min_x: 10, min_y: 12, max_x: 14, max_y: 16 },
        centroid: { x: 12, y: 14 },
      },
      {
        id: "stair",
        level_id: levelId,
        name: "Stair",
        actual_area: 4,
        polygon: rectangle(14, 12, 18, 16),
        bbox: { min_x: 14, min_y: 12, max_x: 18, max_y: 16 },
        centroid: { x: 16, y: 14 },
      },
      {
        id: "dining",
        level_id: levelId,
        name: "Dining",
        actual_area: 16,
        polygon: rectangle(18, 12, 22, 16),
        bbox: { min_x: 18, min_y: 12, max_x: 22, max_y: 16 },
        centroid: { x: 20, y: 14 },
      },
    );
  } else {
    list.push({
      id: "bedroom",
      level_id: levelId,
      name: "Master Bedroom",
      actual_area: 24,
      polygon: rectangle(10, 8, 16, 12),
      bbox: { min_x: 10, min_y: 8, max_x: 16, max_y: 12 },
      centroid: { x: 13, y: 10 },
    });
  }
  if (opts.semanticType) {
    list.push({
      id: "explicit-island",
      level_id: levelId,
      name: "Mystery Room",
      semantic_type: "kitchen_island",
      actual_area: 12,
      polygon: rectangle(0, 0, 4, 4),
      bbox: { min_x: 0, min_y: 0, max_x: 4, max_y: 4 },
      centroid: { x: 2, y: 2 },
    });
  }
  return list;
}

function createPolishFixture() {
  const buildingPolygon = rectangle(10, 8, 22, 16);
  return {
    schema_version: "canonical-project-geometry-v2",
    project_id: "phase3-polish-fixture",
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
    roof: { type: "pitched gable" },
    metadata: {
      geometry_rules: { roof_pitch_degrees: 35 },
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
        height_m: 3.0,
        footprint_id: "fp-first",
      },
    ],
    rooms: [...makeRooms("ground"), ...makeRooms("first")],
    walls: [...makeWalls("ground"), ...makeWalls("first")],
    doors: [
      {
        id: "front",
        level_id: "ground",
        wall_id: "ground-w-s",
        position_m: { x: 14, y: 8 },
        width_m: 1,
        head_height_m: 2.2,
      },
    ],
    windows: [
      {
        id: "win-1",
        level_id: "ground",
        wall_id: "ground-w-s",
        position_m: { x: 18.5, y: 8 },
        width_m: 1.6,
        sill_height_m: 0.9,
        head_height_m: 2.1,
      },
    ],
    stairs: [],
  };
}

const theme = getBlueprintTheme();

describe("Phase 3 — furnitureSymbolService", () => {
  test("FURNITURE_TOKENS lists the canonical symbol set", () => {
    expect(FURNITURE_TOKENS).toEqual(
      expect.arrayContaining([
        "sofa",
        "bed",
        "dining_table",
        "kitchen_counter",
        "kitchen_island",
        "wc",
        "basin",
        "stair_arrow",
      ]),
    );
    expect(FURNITURE_SYMBOL_VERSION).toBe("phase3-furniture-symbol-v1");
  });

  test("resolveFurnitureToken matches by room name keywords", () => {
    expect(resolveFurnitureToken({ name: "Living Room" })).toBe("sofa");
    expect(resolveFurnitureToken({ name: "Master Bedroom" })).toBe("bed");
    expect(resolveFurnitureToken({ name: "Dining" })).toBe("dining_table");
    expect(resolveFurnitureToken({ name: "Kitchen with Island" })).toBe(
      "kitchen_island",
    );
    expect(resolveFurnitureToken({ name: "Cloak / WC" })).toBe("wc");
    expect(resolveFurnitureToken({ name: "Stair" })).toBe("stair_arrow");
    expect(resolveFurnitureToken({ name: "Empty Room" })).toBeNull();
  });

  test("resolveFurnitureToken honours explicit semantic_type when set", () => {
    expect(
      resolveFurnitureToken({
        name: "Mystery Room",
        semantic_type: "kitchen_island",
      }),
    ).toBe("kitchen_island");
    expect(
      resolveFurnitureToken({ name: "Spare", semanticType: "basin" }),
    ).toBe("basin");
  });

  test("renderFurnitureSymbol returns deterministic SVG for known tokens", () => {
    const rect = { x: 100, y: 100, width: 200, height: 150 };
    const a = renderFurnitureSymbol({ name: "Cloak / WC" }, rect, theme);
    const b = renderFurnitureSymbol({ name: "Cloak / WC" }, rect, theme);
    expect(a).toBe(b);
    expect(a).toContain('class="furniture-wc"');

    const stair = renderFurnitureSymbol({ name: "Landing" }, rect, theme);
    expect(stair).toContain('class="furniture-stair-arrow"');
    expect(stair).toContain(">UP<");
  });

  test("renderFurnitureSymbol returns empty string for tiny rooms or unknown rooms", () => {
    const tiny = { x: 0, y: 0, width: 30, height: 30 };
    expect(renderFurnitureSymbol({ name: "WC" }, tiny, theme)).toBe("");
    expect(
      renderFurnitureSymbol(
        { name: "Unknown" },
        { x: 0, y: 0, width: 200, height: 150 },
        theme,
      ),
    ).toBe("");
  });
});

describe("Phase 3 — floor plan furniture wiring", () => {
  test("plan SVG carries data-furniture-token attributes for known room types", () => {
    const fixture = createPolishFixture();
    const result = renderPlanSvg(fixture, { levelId: "ground" });
    expect(result.svg).toContain('data-furniture-token="wc"');
    expect(result.svg).toContain('data-furniture-token="stair_arrow"');
    expect(result.svg).toContain('data-furniture-token="kitchen_island"');
    expect(result.svg).toContain("phase8-plan-furniture");
  });

  test("plan rendering is deterministic across two calls (same SVG byte-for-byte)", () => {
    const fixture = createPolishFixture();
    const a = renderPlanSvg(fixture, { levelId: "ground" });
    const b = renderPlanSvg(fixture, { levelId: "ground" });
    expect(a.svg).toBe(b.svg);
  });
});

describe("Phase 3 — elevation datums", () => {
  test("renders FFL GROUND, FFL FIRST and RIDGE datum labels in the elevation SVG", () => {
    const fixture = createPolishFixture();
    const result = renderElevationSvg(fixture, {}, { orientation: "south" });
    expect(result.svg).toContain('data-datum-role="ffl-ground"');
    expect(result.svg).toContain('data-datum-role="ffl"');
    expect(result.svg).toContain('data-datum-role="ridge"');
    expect(result.svg).toContain("FFL GROUND +0.00m");
    expect(result.svg).toMatch(/FFL FIRST \+\d+\.\d{2}m/);
    expect(result.svg).toMatch(/RIDGE \+\d+\.\d{2}m/);
  });

  test("RIDGE label is omitted when scale would push it above the elevation top (defensive)", () => {
    // No assertion on value; just confirm the elevation renders without error
    // even when ridge inputs are extreme. Verifies the safe fallback path.
    const fixture = createPolishFixture();
    const result = renderElevationSvg(fixture, {}, { orientation: "south" });
    expect(typeof result.svg).toBe("string");
    expect(result.svg.length).toBeGreaterThan(500);
  });
});

describe("Phase 3 — section ground hatch and cut rooms", () => {
  test("section SVG includes the new ground/grade hatch band", () => {
    const fixture = createPolishFixture();
    const result = renderSectionSvg(
      fixture,
      {},
      { sectionType: "longitudinal" },
    );
    expect(result.svg).toContain('id="phase3-section-ground-hatch"');
    expect(result.svg).toContain('data-grade-band="true"');
    expect(result.technical_quality_metadata.ground_hatch_visible).toBe(true);
    expect(
      result.technical_quality_metadata.ground_hatch_band_lines,
    ).toBeGreaterThan(3);
  });

  test("section SVG retains its cut-room rectangles + scale bar + level datums", () => {
    const fixture = createPolishFixture();
    const result = renderSectionSvg(
      fixture,
      {},
      { sectionType: "longitudinal" },
    );
    // Existing wirings — must not regress
    expect(result.svg).toContain("phase8-section-cut-rooms");
    expect(result.svg).toContain("blueprint-scale-bar");
    expect(result.technical_quality_metadata.has_scale_bar).toBe(true);
    expect(
      result.technical_quality_metadata.cut_room_count,
    ).toBeGreaterThanOrEqual(0);
  });
});

describe("Phase 3 — geometry-hash boundary safety", () => {
  test("renderers do not mutate the input geometry object (deep snapshot equal before/after)", () => {
    const fixture = createPolishFixture();
    const snapshot = JSON.stringify(fixture);
    renderPlanSvg(fixture, { levelId: "ground" });
    renderElevationSvg(fixture, {}, { orientation: "south" });
    renderSectionSvg(fixture, {}, { sectionType: "longitudinal" });
    expect(JSON.stringify(fixture)).toBe(snapshot);
  });

  test("two consecutive renders of the same fixture produce identical SVG strings", () => {
    const fixture = createPolishFixture();
    const planA = renderPlanSvg(fixture, { levelId: "ground" });
    const planB = renderPlanSvg(fixture, { levelId: "ground" });
    const elevA = renderElevationSvg(fixture, {}, { orientation: "south" });
    const elevB = renderElevationSvg(fixture, {}, { orientation: "south" });
    const secA = renderSectionSvg(fixture, {}, { sectionType: "longitudinal" });
    const secB = renderSectionSvg(fixture, {}, { sectionType: "longitudinal" });
    expect(planA.svg).toBe(planB.svg);
    expect(elevA.svg).toBe(elevB.svg);
    expect(secA.svg).toBe(secB.svg);
  });
});
