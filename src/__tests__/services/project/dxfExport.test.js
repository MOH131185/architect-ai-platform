import { exportCompiledProjectToDXF } from "../../../services/project/compiledProjectExportService.js";

function fixtureCompiledProject() {
  return {
    geometryHash: "test-hash-abcdef0123456789",
    levels: [
      { id: "level-0", level_number: 0, name: "Ground" },
      { id: "level-1", level_number: 1, name: "First" },
    ],
    site: {
      boundary_polygon: [
        { x: -7, y: -11 },
        { x: 7, y: -11 },
        { x: 7, y: 11 },
        { x: -7, y: 11 },
      ],
      buildable_polygon: [
        { x: -5, y: -9 },
        { x: 5, y: -9 },
        { x: 5, y: 9 },
        { x: -5, y: 9 },
      ],
    },
    walls: [
      {
        id: "w-ext-1",
        levelId: "level-0",
        start: { x: -5, y: -9 },
        end: { x: 5, y: -9 },
        exterior: true,
      },
      {
        id: "w-int-1",
        levelId: "level-0",
        start: { x: 0, y: -9 },
        end: { x: 0, y: 9 },
        exterior: false,
      },
    ],
    rooms: [
      {
        id: "r-1",
        levelId: "level-0",
        name: "Living Room",
        actual_area_m2: 24.5,
        target_area_m2: 25,
        polygon: [
          { x: -5, y: -9 },
          { x: 0, y: -9 },
          { x: 0, y: 9 },
          { x: -5, y: 9 },
        ],
        bbox: { min_x: -5, min_y: -9, max_x: 0, max_y: 9 },
      },
    ],
    openings: [
      {
        id: "d-1",
        levelId: "level-0",
        type: "door",
        kind: "main_entrance",
        position: { x: -2.5, y: -9 },
        width_m: 1.1,
      },
      {
        id: "win-1",
        levelId: "level-0",
        type: "window",
        kind: "window",
        position: { x: 2.5, y: -9 },
        width_m: 1.4,
      },
    ],
    stairs: [
      {
        id: "stair-1",
        levelId: "level-0",
        polygon: [
          { x: 1, y: 5 },
          { x: 2.2, y: 5 },
          { x: 2.2, y: 9 },
          { x: 1, y: 9 },
        ],
        connects_to_level: "level-1",
      },
    ],
    slabs: [
      {
        id: "slab-0",
        levelId: "level-0",
        polygon: [
          { x: -5, y: -9 },
          { x: 5, y: -9 },
          { x: 5, y: 9 },
          { x: -5, y: 9 },
        ],
      },
    ],
    columns: [],
    footprint: {
      polygon: [
        { x: -5, y: -9 },
        { x: 5, y: -9 },
        { x: 5, y: 9 },
        { x: -5, y: 9 },
      ],
    },
  };
}

function extractDeclaredLayers(dxf) {
  // Parse the LAYER TABLE block and collect declared layer names.
  const layers = [];
  const tablesIdx = dxf.indexOf("\nTABLES\n");
  const endsecIdx = dxf.indexOf("\nENDSEC\n", tablesIdx);
  if (tablesIdx === -1 || endsecIdx === -1) return layers;
  const block = dxf.slice(tablesIdx, endsecIdx);
  const lines = block.split("\n");
  for (let i = 0; i < lines.length - 1; i += 1) {
    if (lines[i].trim() === "0" && lines[i + 1].trim() === "LAYER") {
      // The next "  2" line carries the layer name.
      for (let j = i + 2; j < Math.min(i + 12, lines.length - 1); j += 1) {
        if (lines[j].trim() === "2") {
          layers.push(lines[j + 1].trim());
          break;
        }
      }
    }
  }
  return layers;
}

function extractEntityLayers(dxf) {
  // Scan entities-section for code-8 layer references on actual geometry.
  const entitiesIdx = dxf.indexOf("\nENTITIES\n");
  if (entitiesIdx === -1) return [];
  const tail = dxf.slice(entitiesIdx);
  const lines = tail.split("\n");
  const layers = new Set();
  for (let i = 0; i < lines.length - 1; i += 1) {
    if (lines[i].trim() === "8") {
      layers.add(lines[i + 1].trim());
    }
  }
  return [...layers];
}

function findHeaderUnits(dxf) {
  const idx = dxf.indexOf("$INSUNITS");
  if (idx === -1) return null;
  // dxf.slice(idx) starts at $INSUNITS; the value is on line index 2:
  //   [0]=$INSUNITS, [1]="  70", [2]="<value>"
  const lines = dxf.slice(idx).split("\n");
  return (lines[2] || "").trim();
}

describe("exportCompiledProjectToDXF (Tier 3.6)", () => {
  test("throws when geometryHash is missing", () => {
    expect(() => exportCompiledProjectToDXF({ compiledProject: {} })).toThrow(
      /geometryHash is required/,
    );
  });

  test("emits DXF preamble with metres unit (INSUNITS=6)", () => {
    const dxf = exportCompiledProjectToDXF({
      compiledProject: fixtureCompiledProject(),
      projectName: "TestProject",
    });
    expect(dxf.startsWith("  0\nSECTION")).toBe(true);
    expect(dxf.endsWith("EOF\n")).toBe(true);
    expect(findHeaderUnits(dxf)).toBe("6");
  });

  test("LAYER table declares AIA-style names with per-level prefixes", () => {
    const dxf = exportCompiledProjectToDXF({
      compiledProject: fixtureCompiledProject(),
      projectName: "TestProject",
    });
    const declared = extractDeclaredLayers(dxf);
    // Global, level-agnostic layers
    expect(declared).toEqual(
      expect.arrayContaining(["A-SITE", "A-NORTH", "A-METADATA", "A-TEXT"]),
    );
    // Per-level (L00 + L01) architectural layers
    expect(declared).toEqual(
      expect.arrayContaining([
        "L00-A-WALL",
        "L00-A-WALL-EXT",
        "L00-A-DOOR",
        "L00-A-WINDOW",
        "L00-A-STAIR",
        "L00-A-ROOM",
        "L00-A-AREA",
        "L00-A-SLAB",
        "L01-A-WALL",
      ]),
    );
  });

  test("entities reference per-level architectural layers", () => {
    const dxf = exportCompiledProjectToDXF({
      compiledProject: fixtureCompiledProject(),
      projectName: "TestProject",
    });
    const entityLayers = extractEntityLayers(dxf);
    expect(entityLayers).toEqual(
      expect.arrayContaining([
        "L00-A-WALL",
        "L00-A-WALL-EXT",
        "L00-A-DOOR",
        "L00-A-WINDOW",
        "L00-A-STAIR",
        "L00-A-ROOM",
        "L00-A-AREA",
        "L00-A-SLAB",
        "A-SITE",
        "A-NORTH",
        "A-METADATA",
      ]),
    );
  });

  test("doors and windows are routed to distinct layers", () => {
    const dxf = exportCompiledProjectToDXF({
      compiledProject: fixtureCompiledProject(),
      projectName: "TestProject",
    });
    expect(dxf).toMatch(/L00-A-DOOR/);
    expect(dxf).toMatch(/L00-A-WINDOW/);
  });

  test("exterior walls are routed to A-WALL-EXT, interior walls to A-WALL", () => {
    const dxf = exportCompiledProjectToDXF({
      compiledProject: fixtureCompiledProject(),
      projectName: "TestProject",
    });
    expect(dxf).toMatch(/L00-A-WALL-EXT/);
    expect(dxf).toMatch(/L00-A-WALL\n/);
  });

  test("site boundary lands on A-SITE", () => {
    const dxf = exportCompiledProjectToDXF({
      compiledProject: fixtureCompiledProject(),
      projectName: "TestProject",
    });
    const sitePolylineHits = dxf.match(/  8\nA-SITE\n/g) || [];
    // boundary + buildable polygon
    expect(sitePolylineHits.length).toBeGreaterThanOrEqual(2);
  });

  test("provenance metadata text mentions geometryHash on A-METADATA", () => {
    const dxf = exportCompiledProjectToDXF({
      compiledProject: fixtureCompiledProject(),
      projectName: "TestProject",
      sourceModelHash: "abc123",
      pipelineVersion: "test-v1",
    });
    expect(dxf).toMatch(/A-METADATA/);
    expect(dxf).toMatch(/test-hash-abcdef0123456789/);
    expect(dxf).toMatch(/SOURCE_MODEL_HASH: abc123/);
    expect(dxf).toMatch(/PIPELINE: test-v1/);
  });

  test("north arrow is drawn on A-NORTH", () => {
    const dxf = exportCompiledProjectToDXF({
      compiledProject: fixtureCompiledProject(),
      projectName: "TestProject",
    });
    const northHits = dxf.match(/  8\nA-NORTH\n/g) || [];
    // 3 lines + 1 text = 4 entities on the layer
    expect(northHits.length).toBeGreaterThanOrEqual(4);
  });

  test("stairs land on per-level A-STAIR", () => {
    const dxf = exportCompiledProjectToDXF({
      compiledProject: fixtureCompiledProject(),
      projectName: "TestProject",
    });
    expect(dxf).toMatch(/L00-A-STAIR/);
  });
});
