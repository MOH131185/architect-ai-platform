// PR4 of the A1 defect remediation plan. Asserts:
//   1. deriveSiteZones default falls back to LAWN + DRIVE only (was 4-zone
//      lawn/patio/drive/planting); drive position respects main_entry.orientation.
//   2. normalizeMaterialPaletteEntries deduplicates ROOF-category entries
//      (kills the CONCRETE TILE + NATURAL SLATE + SLATE pile-up seen on
//      the reviewed sheet); other categories keep their multi-entry
//      behaviour.
//   3. Key Notes "Roof" group drops the "rooflights where indicated on
//      plan" suffix when projectGeometry has no opening with
//      kind === "rooflight"; keeps the legacy suffix when projectGeometry
//      is omitted (backward-compat).

import {
  buildKeyNotesPanelArtifact,
  __projectGraphVerticalSliceInternals,
} from "../../services/project/projectGraphVerticalSliceService.js";
import { normalizeMaterialPaletteEntries } from "../../services/a1/materialTexturePatterns.js";

const { deriveSiteZones } = __projectGraphVerticalSliceInternals;

describe("PR4 — deriveSiteZones default: LAWN + DRIVE only", () => {
  const bbox = { min_x: 0, min_y: 0, width: 20, height: 16 };

  test("with no explicit zones, returns exactly 2 zones (LAWN + DRIVE)", () => {
    const zones = deriveSiteZones({}, bbox);
    expect(zones).toHaveLength(2);
    const types = zones.map((z) => z.type);
    expect(types).toEqual(["lawn", "drive"]);
  });

  test("does NOT emit patio or planting defaults anymore", () => {
    const zones = deriveSiteZones({}, bbox);
    const types = zones.map((z) => z.type);
    expect(types).not.toContain("patio");
    expect(types).not.toContain("planting");
  });

  test("explicit zones from site.zones are preserved verbatim", () => {
    const zones = deriveSiteZones(
      {
        zones: [
          {
            type: "patio",
            label: "Patio",
            polygon: [
              { x: 0, y: 0 },
              { x: 2, y: 0 },
              { x: 2, y: 2 },
              { x: 0, y: 2 },
            ],
          },
          {
            type: "planting",
            label: "Planting",
            polygon: [
              { x: 5, y: 5 },
              { x: 7, y: 5 },
              { x: 7, y: 7 },
              { x: 5, y: 7 },
            ],
          },
        ],
      },
      bbox,
    );
    expect(zones.map((z) => z.type)).toEqual(["patio", "planting"]);
  });

  test("DRIVE polygon shifts based on main_entry.orientation = north", () => {
    const zones = deriveSiteZones(
      { main_entry: { orientation: "north" } },
      bbox,
    );
    const drive = zones.find((z) => z.type === "drive");
    expect(drive).toBeDefined();
    // North-facing entry → driveway slot at the top edge (low y values).
    const driveMinY = Math.min(...drive.polygon.map((p) => p.y));
    expect(driveMinY).toBeLessThan(bbox.height * 0.25);
  });

  test("DRIVE polygon shifts based on main_entry.orientation = east", () => {
    const zones = deriveSiteZones(
      { main_entry: { orientation: "east" } },
      bbox,
    );
    const drive = zones.find((z) => z.type === "drive");
    // East-facing entry → driveway slot at the right edge (high x values).
    const driveMaxX = Math.max(...drive.polygon.map((p) => p.x));
    expect(driveMaxX).toBeGreaterThan(bbox.width * 0.75);
  });

  test("DRIVE defaults to south edge when orientation missing", () => {
    const zones = deriveSiteZones({}, bbox);
    const drive = zones.find((z) => z.type === "drive");
    // South-facing default → driveway slot at the bottom edge (high y).
    const driveMaxY = Math.max(...drive.polygon.map((p) => p.y));
    expect(driveMaxY).toBeGreaterThan(bbox.height * 0.75);
  });
});

describe("PR4 — material palette deduplicates ROOF category", () => {
  test("CONCRETE TILE + NATURAL SLATE + SLATE collapses to a single ROOF entry", () => {
    const entries = normalizeMaterialPaletteEntries({
      localStyle: {
        material_palette: [
          { name: "London Stock Brick", application: "primary facade" },
          { name: "Concrete Tile", application: "roof" },
          { name: "Natural Slate", application: "roof" },
          { name: "Slate", application: "roof" },
        ],
      },
    });
    const roofs = entries.filter((entry) => {
      const name = String(entry.name).toLowerCase();
      return /\b(slate|tile|shingle)\b/.test(name);
    });
    expect(roofs).toHaveLength(1);
    // Collection order means CONCRETE TILE wins (first roof encountered).
    expect(roofs[0].name).toBe("Concrete Tile");
  });

  test("non-ROOF entries are kept (multiple façade materials are valid)", () => {
    const entries = normalizeMaterialPaletteEntries({
      localStyle: {
        material_palette: [
          { name: "London Stock Brick", application: "primary facade" },
          { name: "Render", application: "secondary facade" },
          { name: "Timber Boarding", application: "feature cladding" },
          { name: "Concrete Tile", application: "roof" },
        ],
      },
    });
    const names = entries.map((e) => e.name);
    expect(names).toContain("London Stock Brick");
    expect(names).toContain("Render");
    expect(names).toContain("Timber Boarding");
    expect(names).toContain("Concrete Tile");
  });

  test("single ROOF entry is preserved (no over-eager filter)", () => {
    const entries = normalizeMaterialPaletteEntries({
      localStyle: {
        material_palette: [
          { name: "Brick", application: "primary facade" },
          { name: "Natural Slate", application: "roof" },
        ],
      },
    });
    expect(entries).toHaveLength(2);
    const roofs = entries.filter((e) => /slate|tile/i.test(e.name));
    expect(roofs).toHaveLength(1);
  });
});

describe("PR4 — Key Notes Roof line gated on actual rooflight openings", () => {
  function baseArgs(extras = {}) {
    return {
      projectGraphId: "pr4-test",
      brief: { project_name: "PR4 Test" },
      site: { area_m2: 320 },
      climate: null,
      regulations: null,
      localStyle: null,
      geometryHash: "abc123",
      ...extras,
    };
  }

  test("legacy behaviour preserved when projectGeometry is omitted", () => {
    const artifact = buildKeyNotesPanelArtifact(baseArgs());
    expect(artifact.svgString).toMatch(/rooflights where indicated on plan/);
  });

  test("rooflight suffix is DROPPED when projectGeometry has no rooflight openings", () => {
    const artifact = buildKeyNotesPanelArtifact(
      baseArgs({
        projectGeometry: { openings: [{ kind: "window" }, { kind: "door" }] },
      }),
    );
    expect(artifact.svgString).not.toMatch(
      /rooflights where indicated on plan/,
    );
    expect(artifact.svgString).toMatch(/Concealed gutters\./);
  });

  test("rooflight suffix is KEPT when projectGeometry has at least one rooflight", () => {
    const artifact = buildKeyNotesPanelArtifact(
      baseArgs({
        projectGeometry: {
          openings: [{ kind: "window" }, { kind: "rooflight" }],
        },
      }),
    );
    expect(artifact.svgString).toMatch(/rooflights where indicated on plan/);
  });

  test("rooflight suffix is DROPPED when projectGeometry.openings is empty", () => {
    const artifact = buildKeyNotesPanelArtifact(
      baseArgs({ projectGeometry: { openings: [] } }),
    );
    expect(artifact.svgString).not.toMatch(
      /rooflights where indicated on plan/,
    );
  });
});
