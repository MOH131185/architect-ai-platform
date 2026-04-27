import { exportCompiledProjectToIFC } from "../../../services/project/compiledProjectExportService.js";

function fixtureCompiledProject() {
  return {
    geometryHash: "test-hash-ifc-001",
    levels: [
      { id: "level-0", level_number: 0, name: "Ground", elevation_m: 0 },
      { id: "level-1", level_number: 1, name: "First", elevation_m: 3.2 },
    ],
    site: {
      area_m2: 308,
      boundary_polygon: [
        { x: 0, y: 0 },
        { x: 14, y: 0 },
        { x: 14, y: 22 },
        { x: 0, y: 22 },
      ],
    },
    walls: [
      {
        id: "w-0",
        levelId: "level-0",
        start: { x: 0, y: 0 },
        end: { x: 5, y: 0 },
        exterior: true,
      },
      {
        id: "w-1",
        levelId: "level-1",
        start: { x: 0, y: 0 },
        end: { x: 0, y: 5 },
        exterior: false,
      },
    ],
    slabs: [
      {
        id: "slab-0",
        levelId: "level-0",
        bbox: { min_x: 0, min_y: 0, max_x: 10, max_y: 10 },
      },
    ],
    openings: [
      {
        id: "d-0",
        levelId: "level-0",
        type: "door",
        kind: "main_entrance",
        position: { x: 2.5, y: 0 },
        width_m: 1.1,
        head_height_m: 2.1,
      },
      {
        id: "win-0",
        levelId: "level-0",
        type: "window",
        kind: "window",
        position: { x: 5, y: 0 },
        width_m: 1.4,
        head_height_m: 1.2,
      },
    ],
    stairs: [
      {
        id: "stair-0",
        levelId: "level-0",
        bbox: { min_x: 8, min_y: 8, max_x: 10, max_y: 12 },
      },
    ],
    rooms: [
      {
        id: "room-0",
        levelId: "level-0",
        name: "Living Room",
        actual_area_m2: 24,
        target_area_m2: 25,
        bbox: { min_x: 0, min_y: 0, max_x: 5, max_y: 5 },
      },
      {
        id: "room-1",
        levelId: "level-1",
        name: "Bedroom",
        actual_area_m2: 18,
        target_area_m2: 18,
        bbox: { min_x: 0, min_y: 0, max_x: 4.5, max_y: 4 },
      },
    ],
  };
}

function entityCounts(ifc, type) {
  const re = new RegExp(`=${type}\\(`, "g");
  return (ifc.match(re) || []).length;
}

describe("exportCompiledProjectToIFC (Tier 3.3)", () => {
  test("throws when geometryHash is missing", () => {
    expect(() => exportCompiledProjectToIFC({ compiledProject: {} })).toThrow(
      /geometryHash is required/,
    );
  });

  test("emits IFC4 STEP-formatted preamble and ISO end marker", () => {
    const ifc = exportCompiledProjectToIFC({
      compiledProject: fixtureCompiledProject(),
      projectName: "Test Project",
    });
    expect(ifc.startsWith("ISO-10303-21;")).toBe(true);
    expect(ifc.includes("FILE_SCHEMA(('IFC4'));")).toBe(true);
    expect(ifc.includes("DATA;")).toBe(true);
    expect(ifc.endsWith("END-ISO-10303-21;")).toBe(true);
  });

  test("project → site → building hierarchy is fully present", () => {
    const ifc = exportCompiledProjectToIFC({
      compiledProject: fixtureCompiledProject(),
      projectName: "Test",
    });
    expect(entityCounts(ifc, "IFCPROJECT")).toBe(1);
    expect(entityCounts(ifc, "IFCSITE")).toBe(1);
    expect(entityCounts(ifc, "IFCBUILDING")).toBe(1);
  });

  test("storeys are emitted per level (2 levels = 2 IFCBUILDINGSTOREY)", () => {
    const ifc = exportCompiledProjectToIFC({
      compiledProject: fixtureCompiledProject(),
      projectName: "Test",
    });
    expect(entityCounts(ifc, "IFCBUILDINGSTOREY")).toBe(2);
  });

  test("walls, slabs, doors, windows, stairs, spaces are emitted", () => {
    const ifc = exportCompiledProjectToIFC({
      compiledProject: fixtureCompiledProject(),
      projectName: "Test",
    });
    expect(entityCounts(ifc, "IFCWALL")).toBe(2);
    expect(entityCounts(ifc, "IFCSLAB")).toBe(1);
    expect(entityCounts(ifc, "IFCDOOR")).toBe(1);
    expect(entityCounts(ifc, "IFCWINDOW")).toBe(1);
    expect(entityCounts(ifc, "IFCSTAIR")).toBe(1);
    expect(entityCounts(ifc, "IFCSPACE")).toBe(2);
  });

  test("aggregation relations bind project → site → building → storeys", () => {
    const ifc = exportCompiledProjectToIFC({
      compiledProject: fixtureCompiledProject(),
      projectName: "Test",
    });
    // 3 IfcRelAggregates: project-site, site-building, building-storeys
    expect(entityCounts(ifc, "IFCRELAGGREGATES")).toBe(3);
  });

  test("each storey contains its elements via IfcRelContainedInSpatialStructure", () => {
    const ifc = exportCompiledProjectToIFC({
      compiledProject: fixtureCompiledProject(),
      projectName: "Test",
    });
    expect(
      entityCounts(ifc, "IFCRELCONTAINEDINSPATIALSTRUCTURE"),
    ).toBeGreaterThanOrEqual(2);
  });

  test("owner history + person + organization + application present", () => {
    const ifc = exportCompiledProjectToIFC({
      compiledProject: fixtureCompiledProject(),
      projectName: "Test",
    });
    expect(entityCounts(ifc, "IFCOWNERHISTORY")).toBe(1);
    expect(entityCounts(ifc, "IFCPERSON")).toBe(1);
    expect(entityCounts(ifc, "IFCORGANIZATION")).toBe(1);
    expect(entityCounts(ifc, "IFCAPPLICATION")).toBe(1);
  });

  test("provenance comment includes geometry hash and source model hash when supplied", () => {
    const ifc = exportCompiledProjectToIFC({
      compiledProject: fixtureCompiledProject(),
      projectName: "Test",
      sourceModelHash: "model-abc",
    });
    expect(ifc).toMatch(/GEOMETRY_HASH: test-hash-ifc-001/);
    expect(ifc).toMatch(/SOURCE_MODEL_HASH: model-abc/);
  });

  test("entity ids are unique and monotonically increasing", () => {
    const ifc = exportCompiledProjectToIFC({
      compiledProject: fixtureCompiledProject(),
      projectName: "Test",
    });
    const ids = (ifc.match(/^#(\d+)=/gm) || []).map((m) =>
      Number(m.slice(1, -1)),
    );
    expect(ids.length).toBeGreaterThan(20);
    expect(new Set(ids).size).toBe(ids.length);
    for (let i = 1; i < ids.length; i += 1) {
      expect(ids[i]).toBeGreaterThan(ids[i - 1]);
    }
  });
});
