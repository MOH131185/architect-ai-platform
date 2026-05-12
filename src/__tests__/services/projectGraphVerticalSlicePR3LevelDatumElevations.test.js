// PR3 of the A1 defect remediation plan. Asserts:
//   1. Section renderer suppresses the topmost level's FFL/ceiling label
//      when it coincides with EAVES (kills the "FFL ROOF +6.40m / EAVES
//      +6.40m" duplicate seen on the reviewed A1 sheet).
//   2. EAVES + RIDGE datums emit with correct ordering and naming.
//   3. Internal doors are dropped from elevation projection.
//   4. Plan SVG always emits the north arrow, even in sheetMode.

import { __svgSectionRendererInternals } from "../../services/drawing/svgSectionRenderer.js";
import { projectFacadeGeometry } from "../../services/facade/facadeProjectionService.js";
import { renderPlanSvg } from "../../services/drawing/svgPlanRenderer.js";

const { renderLevelDatums } = __svgSectionRendererInternals;

function fixtureLevelProfiles() {
  return [
    {
      id: "level-0",
      name: "Ground Floor",
      level_number: 0,
      elevation_m: 0,
      height_m: 3.2,
      bottom_m: 0,
      top_m: 3.2,
    },
    {
      id: "level-1",
      name: "First Floor",
      level_number: 1,
      elevation_m: 3.2,
      height_m: 3.2,
      bottom_m: 3.2,
      top_m: 6.4,
    },
  ];
}

describe("PR3 — section renderer level-datum chain de-dupes FFL ROOF / EAVES", () => {
  const baseX = 200;
  const baseY = 600;
  const widthPx = 800;
  const scale = 40;

  test("EAVES datum is emitted when eavesHeightM is supplied", () => {
    const result = renderLevelDatums(
      baseX,
      baseY,
      widthPx,
      fixtureLevelProfiles(),
      scale,
      {},
      {},
      { eavesHeightM: 6.4, ridgeHeightM: 7.28 },
    );
    expect(result.markup).toMatch(/data-datum-role="eaves"/);
    expect(result.markup).toMatch(/EAVES \+6\.40m/);
    expect(result.hasEaves).toBe(true);
  });

  test("RIDGE datum is emitted when ridgeHeightM > eavesHeightM", () => {
    const result = renderLevelDatums(
      baseX,
      baseY,
      widthPx,
      fixtureLevelProfiles(),
      scale,
      {},
      {},
      { eavesHeightM: 6.4, ridgeHeightM: 7.28 },
    );
    expect(result.markup).toMatch(/data-datum-role="ridge"/);
    expect(result.markup).toMatch(/RIDGE \+7\.28m/);
    expect(result.hasRidge).toBe(true);
  });

  test("topmost level FFL label is suppressed when level.top_m equals eavesHeightM", () => {
    const result = renderLevelDatums(
      baseX,
      baseY,
      widthPx,
      fixtureLevelProfiles(), // top level top_m = 6.4
      scale,
      {},
      {},
      { eavesHeightM: 6.4, ridgeHeightM: 7.28 },
    );
    // "First Floor +6.40m" label MUST NOT appear (eaves wins).
    expect(result.markup).not.toMatch(/First Floor \+6\.40m/);
    // "Ground Floor +3.20m" label still appears.
    expect(result.markup).toMatch(/Ground Floor \+3\.20m/);
    // EAVES label takes its place at 6.40m.
    expect(result.markup).toMatch(/EAVES \+6\.40m/);
  });

  test("topmost level FFL label is KEPT when level.top_m differs from eavesHeightM", () => {
    // E.g. mansard or set-back top floor: eaves at 5.4m, top floor top at 6.4m.
    const result = renderLevelDatums(
      baseX,
      baseY,
      widthPx,
      fixtureLevelProfiles(),
      scale,
      {},
      {},
      { eavesHeightM: 5.4, ridgeHeightM: 7.0 },
    );
    expect(result.markup).toMatch(/First Floor \+6\.40m/);
    expect(result.markup).toMatch(/EAVES \+5\.40m/);
  });

  test("when no eavesHeightM is supplied, all levels keep their labels", () => {
    const result = renderLevelDatums(
      baseX,
      baseY,
      widthPx,
      fixtureLevelProfiles(),
      scale,
      {},
      {},
      {},
    );
    expect(result.markup).toMatch(/Ground Floor \+3\.20m/);
    expect(result.markup).toMatch(/First Floor \+6\.40m/);
    expect(result.hasEaves).toBe(false);
    expect(result.hasRidge).toBe(false);
  });

  test("EAVES is rendered above RIDGE in elevation order (ridge > eaves)", () => {
    const result = renderLevelDatums(
      baseX,
      baseY,
      widthPx,
      fixtureLevelProfiles(),
      scale,
      {},
      {},
      { eavesHeightM: 6.4, ridgeHeightM: 7.28 },
    );
    const ridgeMatch = result.markup.match(/RIDGE \+(\d+\.\d+)m/);
    const eavesMatch = result.markup.match(/EAVES \+(\d+\.\d+)m/);
    expect(ridgeMatch).not.toBeNull();
    expect(eavesMatch).not.toBeNull();
    expect(parseFloat(ridgeMatch[1])).toBeGreaterThan(
      parseFloat(eavesMatch[1]),
    );
  });
});

describe("PR3 — facade projection drops internal doors from elevations", () => {
  function fixtureGeometry({ doors }) {
    return {
      levels: [
        {
          id: "level-0",
          name: "Ground Floor",
          level_number: 0,
          height_m: 3.0,
          elevation_m: 0,
        },
      ],
      walls: [
        // South exterior wall along y_min.
        {
          id: "wall-south-ext",
          level_id: "level-0",
          start: { x: 0, y: 0 },
          end: { x: 10, y: 0 },
          exterior: true,
          orientation: "south",
        },
        // Internal wall between two rooms, also "south" oriented for our
        // simplified resolveEntitySide fixture.
        {
          id: "wall-south-int",
          level_id: "level-0",
          start: { x: 2, y: 0 },
          end: { x: 8, y: 0 },
          exterior: false,
          orientation: "south",
        },
      ],
      doors,
      windows: [],
      bounds: { min_x: 0, min_y: 0, max_x: 10, max_y: 8 },
    };
  }

  test("door on exterior wall is projected onto elevation", () => {
    const geometry = fixtureGeometry({
      doors: [
        {
          id: "door-front",
          wall_id: "wall-south-ext",
          width_m: 1.1,
          position_m: { x: 5, y: 0 },
          head_height_m: 2.1,
          kind: "main_entrance",
        },
      ],
    });
    const projection = projectFacadeGeometry(geometry, "south");
    expect(projection.projectedDoors).toHaveLength(1);
    expect(projection.projectedDoors[0].id).toContain("door-front");
  });

  test("door on interior wall is dropped from elevation projection", () => {
    const geometry = fixtureGeometry({
      doors: [
        {
          id: "door-internal",
          wall_id: "wall-south-int",
          width_m: 0.9,
          position_m: { x: 5, y: 0 },
          head_height_m: 2.0,
          kind: "door",
        },
      ],
    });
    const projection = projectFacadeGeometry(geometry, "south");
    expect(projection.projectedDoors).toHaveLength(0);
  });

  test("mixed: only the exterior door survives the filter", () => {
    const geometry = fixtureGeometry({
      doors: [
        {
          id: "door-front",
          wall_id: "wall-south-ext",
          width_m: 1.1,
          position_m: { x: 5, y: 0 },
          head_height_m: 2.1,
          kind: "main_entrance",
        },
        {
          id: "door-internal-1",
          wall_id: "wall-south-int",
          width_m: 0.9,
          position_m: { x: 3, y: 0 },
          head_height_m: 2.0,
          kind: "door",
        },
        {
          id: "door-internal-2",
          wall_id: "wall-south-int",
          width_m: 0.9,
          position_m: { x: 7, y: 0 },
          head_height_m: 2.0,
          kind: "door",
        },
      ],
    });
    const projection = projectFacadeGeometry(geometry, "south");
    expect(projection.projectedDoors).toHaveLength(1);
    expect(projection.projectedDoors[0].id).toContain("door-front");
  });
});

describe("PR3 — plan renderer always renders north arrow", () => {
  // Minimal geometry sufficient for renderPlanSvg to produce a plan SVG.
  function fixtureGeometry() {
    return {
      bounds: { min_x: 0, min_y: 0, max_x: 10, max_y: 8 },
      footprints: [
        {
          id: "footprint-0",
          level_id: "level-0",
          polygon: [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 8 },
            { x: 0, y: 8 },
          ],
        },
      ],
      levels: [
        {
          id: "level-0",
          name: "Ground Floor",
          level_number: 0,
          height_m: 3.0,
        },
      ],
      rooms: [
        {
          id: "room-1",
          name: "Living room",
          type: "family living space",
          level_id: "level-0",
          polygon: [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 8 },
            { x: 0, y: 8 },
          ],
          actual_area_m2: 80,
        },
      ],
      walls: [],
      doors: [],
      windows: [],
      stairs: [],
      site: { north_orientation_deg: 0 },
    };
  }

  test('sheetMode=true (A1) emits id="north-arrow"', () => {
    const result = renderPlanSvg(fixtureGeometry(), {
      level: { id: "level-0" },
      sheetMode: true,
    });
    expect(result.svg).toContain('id="north-arrow"');
    expect(result.technical_quality_metadata.has_north_arrow).toBe(true);
  });

  test('sheetMode=false also emits id="north-arrow"', () => {
    const result = renderPlanSvg(fixtureGeometry(), {
      level: { id: "level-0" },
      sheetMode: false,
    });
    expect(result.svg).toContain('id="north-arrow"');
    expect(result.technical_quality_metadata.has_north_arrow).toBe(true);
  });
});
