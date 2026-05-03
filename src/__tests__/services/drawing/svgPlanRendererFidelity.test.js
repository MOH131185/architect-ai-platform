/**
 * Phase 1 — plan renderer fidelity coverage.
 *
 * Verifies the visual upgrades in svgPlanRenderer + furnitureSymbolService:
 *   - furniture symbols cover the new room types (hallway, garage,
 *     utility, wardrobe) in addition to the existing 8
 *   - door swing arcs render
 *   - window double-lines + jamb ticks render
 *   - north arrow + scale bar render
 *   - dimension chain segments render alongside the overall dimension
 *   - section markers A-A / B-B render from compiledProject.sections
 *   - the renderer is deterministic (same input → identical SVG)
 *   - the renderer never mutates its geometry input (geometryHash safety)
 */

import { renderPlanSvg } from "../../../services/drawing/svgPlanRenderer.js";
import {
  renderFurnitureSymbol,
  resolveFurnitureToken,
  FURNITURE_TOKENS,
  FURNITURE_SYMBOL_VERSION,
} from "../../../services/drawing/furnitureSymbolService.js";
import { getBlueprintTheme } from "../../../services/drawing/drawingBounds.js";

function rect(minX, minY, maxX, maxY) {
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
}

function room(id, name, minX, minY, maxX, maxY, extra = {}) {
  return {
    id,
    level_id: "ground",
    name,
    actual_area: (maxX - minX) * (maxY - minY),
    polygon: rect(minX, minY, maxX, maxY),
    bbox: { min_x: minX, min_y: minY, max_x: maxX, max_y: maxY },
    centroid: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
    ...extra,
  };
}

function exteriorWall(id, sx, sy, ex, ey) {
  return {
    id,
    level_id: "ground",
    exterior: true,
    thickness_m: 0.3,
    orientation: sy === ey ? "horizontal" : "vertical",
    start: { x: sx, y: sy },
    end: { x: ex, y: ey },
  };
}

function fixture(extra = {}) {
  const buildingPolygon = rect(0, 0, 24, 16);
  return {
    schema_version: "canonical-project-geometry-v2",
    project_id: "phase1-fidelity-fixture",
    site: {
      boundary_bbox: {
        min_x: -5,
        min_y: -5,
        max_x: 30,
        max_y: 22,
        width: 35,
        height: 27,
      },
      buildable_bbox: {
        min_x: 0,
        min_y: 0,
        max_x: 24,
        max_y: 16,
        width: 24,
        height: 16,
      },
      boundary_polygon: rect(-5, -5, 30, 22),
      buildable_polygon: buildingPolygon,
      north_orientation_deg: 0,
    },
    metadata: { geometry_rules: { roof_pitch_degrees: 35 } },
    footprints: [
      {
        id: "fp-ground",
        level_id: "ground",
        polygon: buildingPolygon,
        bbox: { min_x: 0, min_y: 0, max_x: 24, max_y: 16 },
      },
    ],
    slabs: [
      {
        id: "slab-ground",
        level_id: "ground",
        polygon: buildingPolygon,
        bbox: { min_x: 0, min_y: 0, max_x: 24, max_y: 16 },
      },
    ],
    levels: [
      {
        id: "ground",
        level_number: 0,
        name: "Ground Floor",
        height_m: 3.0,
        footprint_id: "fp-ground",
      },
    ],
    rooms: [
      room("living", "Living Room", 0, 0, 8, 8),
      room("kitchen", "Kitchen Diner", 8, 0, 16, 8),
      room("hall", "Hallway", 16, 0, 19, 16),
      room("garage", "Garage", 19, 0, 24, 8),
      room("utility", "Utility", 19, 8, 24, 12),
      room("wc", "Cloak / WC", 0, 8, 4, 12),
      room("study", "Study", 4, 8, 8, 12),
      room("dining", "Dining", 8, 8, 16, 16),
      room("master", "Master Bedroom", 0, 12, 8, 16),
      room("dressing", "Dressing Room", 19, 12, 24, 16),
    ],
    walls: [
      exteriorWall("w-s", 0, 0, 24, 0),
      exteriorWall("w-n", 0, 16, 24, 16),
      exteriorWall("w-e", 24, 0, 24, 16),
      exteriorWall("w-w", 0, 0, 0, 16),
    ],
    doors: [
      {
        id: "front",
        level_id: "ground",
        wall_id: "w-s",
        position_m: { x: 17, y: 0 },
        width_m: 0.95,
        head_height_m: 2.1,
      },
    ],
    windows: [
      {
        id: "win-living",
        level_id: "ground",
        wall_id: "w-s",
        position_m: { x: 4, y: 0 },
        width_m: 1.6,
        sill_height_m: 0.9,
        head_height_m: 2.1,
      },
      {
        id: "win-kitchen",
        level_id: "ground",
        wall_id: "w-s",
        position_m: { x: 12, y: 0 },
        width_m: 1.4,
        sill_height_m: 0.9,
        head_height_m: 2.1,
      },
    ],
    stairs: [],
    sections: [
      {
        id: "section-long",
        sectionType: "longitudinal",
        title: "Section Longitudinal",
        cutLine: { from: { x: 12, y: 0 }, to: { x: 12, y: 16 } },
      },
      {
        id: "section-trans",
        sectionType: "transverse",
        title: "Section Transverse",
        cutLine: { from: { x: 0, y: 8 }, to: { x: 24, y: 8 } },
      },
    ],
    ...extra,
  };
}

const theme = getBlueprintTheme();

describe("furnitureSymbolService — Phase 1 expanded coverage", () => {
  test("FURNITURE_TOKENS includes all four new tokens", () => {
    expect(FURNITURE_TOKENS).toEqual(
      expect.arrayContaining([
        "hallway_runner",
        "garage_doors",
        "utility_appliances",
        "wardrobe",
      ]),
    );
    expect(FURNITURE_SYMBOL_VERSION).toBe("phase3-furniture-symbol-v2");
  });

  test("resolveFurnitureToken matches new room name keywords", () => {
    expect(resolveFurnitureToken({ name: "Hallway" })).toBe("hallway_runner");
    expect(resolveFurnitureToken({ name: "Entrance Foyer" })).toBe(
      "hallway_runner",
    );
    expect(resolveFurnitureToken({ name: "Corridor" })).toBe("hallway_runner");
    expect(resolveFurnitureToken({ name: "Garage" })).toBe("garage_doors");
    expect(resolveFurnitureToken({ name: "Carport" })).toBe("garage_doors");
    expect(resolveFurnitureToken({ name: "Utility" })).toBe(
      "utility_appliances",
    );
    expect(resolveFurnitureToken({ name: "Walk-in Wardrobe" })).toBe(
      "wardrobe",
    );
    expect(resolveFurnitureToken({ name: "Dressing Room" })).toBe("wardrobe");
  });

  test("renderFurnitureSymbol returns deterministic SVG for new tokens", () => {
    const big = { x: 100, y: 100, width: 240, height: 160 };
    for (const name of ["Garage", "Utility Room", "Walk-in Wardrobe"]) {
      const a = renderFurnitureSymbol({ name }, big, theme);
      const b = renderFurnitureSymbol({ name }, big, theme);
      expect(a).toBe(b);
      expect(a.length).toBeGreaterThan(0);
    }
  });

  test("renderFurnitureSymbol now permits narrow hallway-shaped rectangles", () => {
    // Real corridor: ~1.2 m wide × 4 m long → ~36 px × 120 px at scale.
    const corridor = { x: 0, y: 0, width: 36, height: 120 };
    const markup = renderFurnitureSymbol({ name: "Hallway" }, corridor, theme);
    expect(markup).toContain('class="furniture-hallway-runner"');
  });

  test("renderFurnitureSymbol still rejects pathologically tiny rectangles", () => {
    const tiny = { x: 0, y: 0, width: 12, height: 12 };
    expect(renderFurnitureSymbol({ name: "Living Room" }, tiny, theme)).toBe(
      "",
    );
    expect(renderFurnitureSymbol({ name: "Garage" }, tiny, theme)).toBe("");
  });
});

describe("renderPlanSvg — Phase 1 fidelity features", () => {
  test("renders door swing arc + hinge marker for every door", () => {
    const result = renderPlanSvg(fixture(), { width: 1200, height: 900 });
    expect(result.svg).toContain('class="plan-door"');
    // Swing arc is the SVG path A command; the hinge is the small filled
    // circle at the hinge point.
    expect(result.svg).toMatch(/<path d="M [^"]+A /);
    expect(result.svg).toMatch(
      /<circle cx="[^"]+" cy="[^"]+" r="1\.8"[^/]*\/>/,
    );
    expect(result.technical_quality_metadata.door_swing_count).toBe(1);
  });

  test("renders window double-lines plus the new jamb ticks", () => {
    const result = renderPlanSvg(fixture(), { width: 1200, height: 900 });
    expect(result.svg).toContain('class="plan-window"');
    // Each window now emits 2 jamb-tick lines (one per end).
    const jambMatches = result.svg.match(/class="window-jamb-tick"/g);
    expect(jambMatches?.length).toBe(4); // 2 windows × 2 ticks
    expect(result.technical_quality_metadata.window_jamb_tick_count).toBe(4);
  });

  test("renders the north arrow group on plan views", () => {
    const result = renderPlanSvg(fixture(), { width: 1200, height: 900 });
    expect(result.svg).toContain('id="north-arrow"');
    expect(result.technical_quality_metadata.has_north_arrow).toBe(true);
  });

  test("renders the scale bar with a metres label", () => {
    const result = renderPlanSvg(fixture(), { width: 1200, height: 900 });
    expect(result.svg).toContain('id="blueprint-scale-bar"');
    expect(result.svg).toMatch(/>\s*\d+\s*m\s*</);
    expect(result.technical_quality_metadata.has_scale_bar).toBe(true);
    expect(result.technical_quality_metadata.scale_bar_meters).toBeGreaterThan(
      0,
    );
  });

  test("renders dimension chain segments alongside the overall dimensions", () => {
    const result = renderPlanSvg(fixture(), { width: 1200, height: 900 });
    expect(result.svg).toContain('class="dimension-chain horizontal"');
    expect(result.svg).toContain('class="dimension-chain vertical"');
    // Fixture has rooms breaking the building into 3+ horizontal segments
    // (x edges at 8, 16, 19) and 3+ vertical segments (y edges at 8, 12).
    const meta = result.technical_quality_metadata;
    expect(meta.dimension_chain_horizontal_segments).toBeGreaterThanOrEqual(3);
    expect(meta.dimension_chain_vertical_segments).toBeGreaterThanOrEqual(3);
  });

  test("renders section markers A-A and B-B from compiledProject.sections", () => {
    const result = renderPlanSvg(fixture(), { width: 1200, height: 900 });
    expect(result.svg).toContain('id="plan-section-markers"');
    expect(result.svg).toContain('data-section-letter="A"');
    expect(result.svg).toContain('data-section-letter="B"');
    expect(result.svg).toContain('data-section-type="longitudinal"');
    expect(result.svg).toContain('data-section-type="transverse"');
    expect(result.technical_quality_metadata.section_marker_count).toBe(2);
    expect(result.technical_quality_metadata.section_marker_labels).toEqual([
      "A-A",
      "B-B",
    ]);
  });

  test("section markers degrade gracefully when no sections exist", () => {
    const noSections = fixture({ sections: [] });
    const result = renderPlanSvg(noSections, { width: 1200, height: 900 });
    expect(result.svg).not.toContain('id="plan-section-markers"');
    expect(result.technical_quality_metadata.section_marker_count).toBe(0);
    expect(result.technical_quality_metadata.section_marker_labels).toEqual([]);
  });

  test("furniture coverage spans common UK residential rooms", () => {
    const result = renderPlanSvg(fixture(), { width: 1200, height: 900 });
    // The fixture mixes living, kitchen, hall, garage, utility, wc, study,
    // dining, master bedroom, dressing room — at least 6 distinct furniture
    // groups should surface on the plan.
    const hintGroups = result.svg.match(/class="plan-furniture-hint"/g) || [];
    expect(hintGroups.length).toBeGreaterThanOrEqual(6);
    // Spot-check the new symbol classes appear at least once.
    expect(result.svg).toContain('class="furniture-hallway-runner"');
    expect(result.svg).toContain('class="furniture-garage"');
    expect(result.svg).toContain('class="furniture-utility"');
    expect(result.svg).toContain('class="furniture-wardrobe"');
  });
});

describe("renderPlanSvg — determinism + geometry-hash safety", () => {
  test("identical input produces byte-identical SVG", () => {
    const a = renderPlanSvg(fixture(), { width: 1200, height: 900 });
    const b = renderPlanSvg(fixture(), { width: 1200, height: 900 });
    expect(a.svg).toBe(b.svg);
    expect(a.technical_quality_metadata).toEqual(b.technical_quality_metadata);
  });

  test("section letter assignment is stable across reordering", () => {
    const baseline = fixture();
    const reordered = fixture();
    reordered.sections = [
      reordered.sections[1], // transverse first
      reordered.sections[0], // longitudinal second
    ];
    const a = renderPlanSvg(baseline, { width: 1200, height: 900 });
    const b = renderPlanSvg(reordered, { width: 1200, height: 900 });
    // Despite the input order change, A-A must remain the longitudinal cut
    // and B-B the transverse cut (sort key = section type).
    expect(a.technical_quality_metadata.section_marker_labels).toEqual([
      "A-A",
      "B-B",
    ]);
    expect(b.technical_quality_metadata.section_marker_labels).toEqual([
      "A-A",
      "B-B",
    ]);
    expect(
      a.svg.includes('data-section-letter="A"') &&
        a.svg.includes('data-section-type="longitudinal"'),
    ).toBe(true);
  });

  test("renderer does not mutate the geometry input (geometryHash safety)", () => {
    const original = fixture();
    const snapshot = JSON.parse(JSON.stringify(original));
    renderPlanSvg(original, { width: 1200, height: 900 });
    expect(original).toEqual(snapshot);
  });
});
