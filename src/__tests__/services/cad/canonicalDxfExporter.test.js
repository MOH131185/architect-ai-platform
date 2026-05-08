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
        type: "living",
        polygon: [
          { x: 3, y: 3 },
          { x: 8, y: 3 },
          { x: 8, y: 10 },
          { x: 3, y: 10 },
        ],
      },
      {
        id: "room-2",
        levelId: "level-0",
        name: "Kitchen",
        type: "kitchen",
        polygon: [
          { x: 8, y: 3 },
          { x: 11, y: 3 },
          { x: 11, y: 7 },
          { x: 8, y: 7 },
        ],
      },
      {
        id: "room-3",
        levelId: "level-0",
        name: "Bathroom",
        type: "bathroom",
        polygon: [
          { x: 11, y: 3 },
          { x: 13, y: 3 },
          { x: 13, y: 7 },
          { x: 11, y: 7 },
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
    expect(dxf).toMatch(/  0\nVIEWPORT\n/);
    expect(dxf).toContain("AcDbViewport");
    expect(dxf).toContain("AcDbLayout");
    expect(dxf).toContain("AcDbPlotSettings");
    expect(dxf).toContain("ACAD_LAYOUT");
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
    expect(dxf).toContain("PLOT_CONFIGURATION: DWG To PDF.pc3");
    expect(dxf).toContain("CANONICAL_MEDIA_NAME: ISO_full_bleed_A1");
    expect(dxf).toContain("PLOT_STYLE_TABLE: archiai-monochrome.ctb");
    expect(dxf).toContain("PLOT_STYLE_METADATA: mode=ctb");
    expect(dxf).toContain("CTB_STB_MAPPING: layer-weight-to-ctb");
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

  test("keeps default DXF export architectural-only without structural opt-in", () => {
    const model = buildCanonicalDrawingModelFromCompiledProject({
      compiledProject: fixtureCompiledProject(),
    });
    const dxf = exportCanonicalDrawingModelToDXF({
      canonicalDrawingModel: model,
    });

    expect(dxf).not.toContain("S-FOUNDATION");
    expect(dxf).not.toContain("S-BEAM");
    expect(dxf).not.toContain("S-GRID");
    expect(dxf).not.toContain("PRELIMINARY STRUCTURAL INFORMATION ONLY");
    expect(dxf).not.toContain("E-LIGHT");
    expect(dxf).not.toContain("P-WATER");
    expect(dxf).not.toContain("P-DRAIN");
    expect(dxf).not.toContain("M-VENT");
    expect(dxf).not.toContain("MEP-NOTES");
    expect(dxf).not.toContain("PRELIMINARY MEP INFORMATION ONLY");
  });

  test("emits structural CAD layers, grid, foundations, roof framing, notes, and no raster entities", () => {
    const model = buildCanonicalDrawingModelFromCompiledProject({
      compiledProject: fixtureCompiledProject(),
      includeStructuralDrawings: true,
    });
    const dxf = exportCanonicalDrawingModelToDXF({
      canonicalDrawingModel: model,
    });

    expect(dxf).toContain("S-FOUNDATION");
    expect(dxf).toContain("S-COLUMN");
    expect(dxf).toContain("S-BEAM");
    expect(dxf).toContain("S-SLAB");
    expect(dxf).toContain("S-ROOF");
    expect(dxf).toContain("S-GRID");
    expect(dxf).toContain("S-NOTES");
    expect(dxf).toContain("S-DIMS");
    expect(dxf).toContain("PRELIMINARY STRUCTURAL INFORMATION ONLY");
    expect(dxf).toContain("FND-001");
    expect(dxf).toContain("RFT-001");
    expect(dxf).not.toMatch(/  0\nIMAGE\n/);
    expect(dxf).not.toMatch(/  0\nRASTER\n/);
  });

  test("emits opt-in MEP CAD layers, symbols, routes, notes, and no raster entities", () => {
    const model = buildCanonicalDrawingModelFromCompiledProject({
      compiledProject: fixtureCompiledProject(),
      includeMepDrawings: true,
    });
    const dxf = exportCanonicalDrawingModelToDXF({
      canonicalDrawingModel: model,
    });

    expect(dxf).toContain("E-LIGHT");
    expect(dxf).toContain("E-POWER");
    expect(dxf).toContain("E-SWITCH");
    expect(dxf).toContain("E-DATA");
    expect(dxf).toContain("P-WATER");
    expect(dxf).toContain("P-DRAIN");
    expect(dxf).toContain("P-SANITARY");
    expect(dxf).toContain("M-DUCT");
    expect(dxf).toContain("M-VENT");
    expect(dxf).toContain("M-EQUIP");
    expect(dxf).toContain("MEP-RISER");
    expect(dxf).toContain("MEP-NOTES");
    expect(dxf).toContain("MEP-DIMS");
    expect(dxf).toContain("MEP_LIGHT_CEILING");
    expect(dxf).toContain("MEP_SOCKET");
    expect(dxf).toContain("MEP_SANITARY_FIXTURE");
    expect(dxf).toContain("MEP_EXTRACT_FAN");
    expect(dxf).toContain("PRELIMINARY MEP INFORMATION ONLY");
    expect(dxf).toContain("MEP coordination route");
    expect(dxf).not.toMatch(/  0\nIMAGE\n/);
    expect(dxf).not.toMatch(/  0\nRASTER\n/);
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

  test("strictValidation blocks DXF export when dimensions are missing", () => {
    const model = buildCanonicalDrawingModelFromCompiledProject({
      compiledProject: fixtureCompiledProject(),
    });
    const modelWithoutDimensions = {
      ...model,
      modelSpace: {
        ...model.modelSpace,
        entities: model.modelSpace.entities.filter(
          (entity) => entity.type !== "DIMENSION",
        ),
      },
    };

    expect(() =>
      exportCanonicalDrawingModelToDXF({
        canonicalDrawingModel: modelWithoutDimensions,
        strictValidation: true,
      }),
    ).toThrow(/CAD_MODEL_DIMENSIONS_MISSING/);
  });

  test("non-strict DXF export allows missing dimensions as a warning-policy case", () => {
    const model = buildCanonicalDrawingModelFromCompiledProject({
      compiledProject: fixtureCompiledProject(),
    });
    const modelWithoutDimensions = {
      ...model,
      modelSpace: {
        ...model.modelSpace,
        entities: model.modelSpace.entities.filter(
          (entity) => entity.type !== "DIMENSION",
        ),
      },
    };

    const dxf = exportCanonicalDrawingModelToDXF({
      canonicalDrawingModel: modelWithoutDimensions,
      strictValidation: false,
    });

    expect(dxf).toContain("SECTION");
    expect(dxf).toMatch(/  0\nEOF\n$/);
    expect(dxf).not.toContain("DIMENSION");
  });
});
