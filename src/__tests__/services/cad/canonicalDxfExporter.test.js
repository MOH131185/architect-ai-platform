import { buildCanonicalDrawingModelFromCompiledProject } from "../../../services/cad/canonicalDrawingModel.js";
import { exportCanonicalDrawingModelToDXF } from "../../../services/cad/canonicalDxfExporter.js";

function fixtureCompiledProject() {
  return {
    geometryHash: "geometry-hash-dxf-model-001",
    projectGraphHash: "project-graph-hash-dxf-model-001",
    projectName: "DXF Model Fixture",
    site: {
      boundary_polygon: [
        { x: 0, y: 0 },
        { x: 18, y: 0 },
        { x: 18, y: 14 },
        { x: 0, y: 14 },
      ],
    },
    levels: [
      {
        id: "level-0",
        level_number: 0,
        name: "Ground",
        elevation_m: 0,
        height_m: 3.2,
      },
    ],
    slabs: [
      {
        id: "slab-0",
        levelId: "level-0",
        polygon: [
          { x: 3, y: 3 },
          { x: 13, y: 3 },
          { x: 13, y: 10 },
          { x: 3, y: 10 },
        ],
      },
    ],
    rooms: [
      {
        id: "room-1",
        levelId: "level-0",
        name: "Living",
        polygon: [
          { x: 3, y: 3 },
          { x: 13, y: 3 },
          { x: 13, y: 10 },
          { x: 3, y: 10 },
        ],
      },
    ],
    walls: [
      {
        id: "wall-1",
        levelId: "level-0",
        exterior: true,
        start: { x: 3, y: 3 },
        end: { x: 13, y: 3 },
      },
    ],
    openings: [
      {
        id: "door-1",
        levelId: "level-0",
        type: "door",
        width_m: 1,
        position_m: { x: 5, y: 3 },
      },
    ],
  };
}

describe("exportCanonicalDrawingModelToDXF", () => {
  test("exports CanonicalDrawingModel as professional DXF sections", () => {
    const model = buildCanonicalDrawingModelFromCompiledProject({
      compiledProject: fixtureCompiledProject(),
    });
    const dxf = exportCanonicalDrawingModelToDXF({
      canonicalDrawingModel: model,
      sourceModelHash: "source-model-1",
      pipelineVersion: "test-pipeline",
    });

    expect(dxf).toContain("SECTION");
    expect(dxf).toContain("HEADER");
    expect(dxf).toContain("TABLES");
    expect(dxf).toContain("BLOCKS");
    expect(dxf).toContain("ENTITIES");
    expect(dxf).toContain("OBJECTS");
    expect(dxf).toContain("LWPOLYLINE");
    expect(dxf).toContain("DIMENSION");
    expect(dxf).toContain("HATCH");
    expect(dxf).toContain("INSERT");
    expect(dxf).toContain("TITLE_BLOCK_A1");
    expect(dxf).toContain("NORTH_ARROW");
    expect(dxf).toContain("SECTION_MARKER");
    expect(dxf).toContain("L00-A-WALL-EXT");
    expect(dxf).toContain("L00-A-DOOR");
    expect(dxf).toContain("A-METADATA");
    expect(dxf).toContain("PAPER_SPACE_LAYOUT: A-101");
    expect(dxf).toContain("DRAWING_NUMBER: A-101");
    expect(dxf).toContain("TITLE: Ground Plan");
    expect(dxf).toContain("SCALE: 1:100");
    expect(dxf).toContain("REVISION: P01");
    expect(dxf).toContain("VIEWPORT: floor_plan_ground 1:100");
    expect(dxf).toContain("  67\n1\n");
    expect(dxf).toContain("  410\nA-101\n");
    expect(dxf).toContain("GEOMETRY_HASH: geometry-hash-dxf-model-001");
    expect(dxf).toContain(
      "SOURCE_PROJECT_GRAPH_HASH: project-graph-hash-dxf-model-001",
    );
    expect(dxf).toContain("SOURCE_MODEL_HASH: source-model-1");
    expect(dxf).toContain("PIPELINE: test-pipeline");
    expect(dxf).toMatch(/  0\nEOF\n$/);
  });

  test("emits professional CAD dimensions on A-DIMS with dimension text", () => {
    const model = buildCanonicalDrawingModelFromCompiledProject({
      compiledProject: fixtureCompiledProject(),
    });
    const dxf = exportCanonicalDrawingModelToDXF({
      canonicalDrawingModel: model,
    });

    expect(dxf).toContain("DIMENSION");
    expect(dxf).toContain("L00-A-DIMS");
    expect(dxf).toContain("10 m");
    expect(dxf).toContain("7 m");
    expect(dxf).toContain("3.2 m");
    expect(dxf).toContain("ARCH_100");
  });

  test("emits sheet border, viewport frame, and title block as paper-space entities", () => {
    const model = buildCanonicalDrawingModelFromCompiledProject({
      compiledProject: fixtureCompiledProject(),
    });
    const dxf = exportCanonicalDrawingModelToDXF({
      canonicalDrawingModel: model,
    });

    expect(dxf).toContain("PAPER_SPACE_LAYOUT: A-100");
    expect(dxf).toContain("VIEWPORT: site_plan 1:500");
    expect(dxf).toContain("TITLE_BLOCK_A1");
    expect(dxf).toContain("DRAWING_NUMBER: A-100");
    expect(dxf).toContain("SCALE: 1:500");
  });

  test("fails closed when the drawing model is invalid", () => {
    const model = buildCanonicalDrawingModelFromCompiledProject({
      compiledProject: fixtureCompiledProject(),
    });

    expect(() =>
      exportCanonicalDrawingModelToDXF({
        canonicalDrawingModel: {
          ...model,
          geometryHash: null,
        },
      }),
    ).toThrow(/CAD_MODEL_GEOMETRY_HASH_MISSING/);
  });
});
