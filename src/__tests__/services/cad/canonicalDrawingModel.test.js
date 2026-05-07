import {
  CANONICAL_DRAWING_MODEL_VERSION,
  REQUIRED_CANONICAL_CAD_LAYERS,
  buildCanonicalDrawingModelFromCompiledProject,
  validateCanonicalDrawingModel,
} from "../../../services/cad/canonicalDrawingModel.js";

function fixtureCompiledProject() {
  return {
    geometryHash: "geometry-hash-cad-001",
    projectGraphHash: "project-graph-hash-001",
    projectName: "Canonical CAD Fixture",
    jurisdiction: "uk",
    site: {
      boundary_polygon: [
        { x: 0, y: 0 },
        { x: 18, y: 0 },
        { x: 18, y: 14 },
        { x: 0, y: 14 },
      ],
      buildable_polygon: [
        { x: 2, y: 2 },
        { x: 16, y: 2 },
        { x: 16, y: 12 },
        { x: 2, y: 12 },
      ],
    },
    levels: [
      {
        id: "level-0",
        level_number: 0,
        name: "Ground Floor",
        elevation_m: 0,
        height_m: 3.2,
      },
      {
        id: "level-1",
        level_number: 1,
        name: "First Floor",
        elevation_m: 3.2,
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
        id: "room-living",
        levelId: "level-0",
        name: "Living",
        polygon: [
          { x: 3, y: 3 },
          { x: 8, y: 3 },
          { x: 8, y: 10 },
          { x: 3, y: 10 },
        ],
      },
      {
        id: "room-kitchen",
        levelId: "level-0",
        name: "Kitchen",
        polygon: [
          { x: 8, y: 3 },
          { x: 13, y: 3 },
          { x: 13, y: 10 },
          { x: 8, y: 10 },
        ],
      },
    ],
    walls: [
      {
        id: "wall-south",
        levelId: "level-0",
        exterior: true,
        start: { x: 3, y: 3 },
        end: { x: 13, y: 3 },
        thickness_m: 0.3,
      },
      {
        id: "wall-party",
        levelId: "level-0",
        exterior: false,
        start: { x: 8, y: 3 },
        end: { x: 8, y: 10 },
        thickness_m: 0.14,
      },
    ],
    openings: [
      {
        id: "door-main",
        levelId: "level-0",
        type: "door",
        width_m: 1,
        position_m: { x: 5, y: 3 },
      },
      {
        id: "window-living",
        levelId: "level-0",
        type: "window",
        width_m: 1.5,
        position_m: { x: 10, y: 3 },
      },
    ],
    stairs: [
      {
        id: "stair-main",
        levelId: "level-0",
        polygon: [
          { x: 10, y: 6 },
          { x: 12.5, y: 6 },
          { x: 12.5, y: 9 },
          { x: 10, y: 9 },
        ],
      },
    ],
    columns: [
      {
        id: "column-1",
        levelId: "level-0",
        position: { x: 6, y: 6 },
        width_m: 0.3,
      },
    ],
    beams: [
      {
        id: "beam-1",
        levelId: "level-0",
        start: { x: 3, y: 6 },
        end: { x: 13, y: 6 },
      },
    ],
    foundations: [
      {
        id: "foundation-1",
        levelId: "level-0",
        polygon: [
          { x: 2.7, y: 2.7 },
          { x: 13.3, y: 2.7 },
          { x: 13.3, y: 10.3 },
          { x: 2.7, y: 10.3 },
        ],
      },
    ],
    roof_primitives: [
      {
        id: "roof-1",
        levelId: "level-1",
        polygon: [
          { x: 3, y: 3 },
          { x: 13, y: 3 },
          { x: 13, y: 10 },
          { x: 3, y: 10 },
        ],
      },
    ],
  };
}

function entitiesByViewType(model, viewType) {
  return model.modelSpace.entities.filter(
    (entity) => entity.viewType === viewType,
  );
}

function entityTypes(entities) {
  return new Set(entities.map((entity) => entity.type));
}

describe("CanonicalDrawingModel", () => {
  test("throws when CompiledProject geometryHash is missing", () => {
    expect(() =>
      buildCanonicalDrawingModelFromCompiledProject({ compiledProject: {} }),
    ).toThrow(/geometryHash is required/);
  });

  test("builds the professional CAD/BIM contract surface", () => {
    const model = buildCanonicalDrawingModelFromCompiledProject({
      compiledProject: fixtureCompiledProject(),
    });

    expect(model.schema_version).toBe(CANONICAL_DRAWING_MODEL_VERSION);
    expect(model.geometryHash).toBe("geometry-hash-cad-001");
    expect(model.sourceProjectGraphHash).toBe("project-graph-hash-001");
    expect(model.units).toBe("meters");
    expect(model.modelSpace.entities.length).toBeGreaterThan(0);
    expect(model.paperSpace.sheets.length).toBeGreaterThan(0);
    expect(model.blocks.map((block) => block.name)).toEqual(
      expect.arrayContaining([
        "TITLE_BLOCK_A1",
        "DOOR_SINGLE",
        "WINDOW_SYMBOL",
      ]),
    );
    expect(model.hatches.map((hatch) => hatch.name)).toEqual(
      expect.arrayContaining(["BRICK", "CONCRETE", "STEEL"]),
    );
    expect(model.dimensionStyles.map((style) => style.name)).toContain(
      "ARCH_100",
    );
    expect(model.textStyles.map((style) => style.name)).toContain("ARCH_BODY");
  });

  test("declares the required professional CAD layers", () => {
    const model = buildCanonicalDrawingModelFromCompiledProject({
      compiledProject: fixtureCompiledProject(),
    });
    const layerNames = model.layers.map((layer) => layer.name);

    expect(layerNames).toEqual(
      expect.arrayContaining(REQUIRED_CANONICAL_CAD_LAYERS),
    );
  });

  test("floor plans produce real vector CAD entities and dimensions", () => {
    const model = buildCanonicalDrawingModelFromCompiledProject({
      compiledProject: fixtureCompiledProject(),
    });
    const planEntities = entitiesByViewType(model, "floor_plan");
    const types = entityTypes(planEntities);
    const layers = new Set(planEntities.map((entity) => entity.layer));

    expect([...types]).toEqual(
      expect.arrayContaining(["LINE", "LWPOLYLINE", "DIMENSION"]),
    );
    expect([...layers]).toEqual(
      expect.arrayContaining([
        "A-WALL-EXT",
        "A-WALL",
        "A-DOOR",
        "A-WINDOW",
        "A-ROOM",
      ]),
    );
    expect(planEntities.some((entity) => entity.type === "IMAGE")).toBe(false);
  });

  test("elevations and sections produce line, polyline, hatch, and dimension entities", () => {
    const model = buildCanonicalDrawingModelFromCompiledProject({
      compiledProject: fixtureCompiledProject(),
    });
    const elevationTypes = entityTypes(entitiesByViewType(model, "elevation"));
    const sectionTypes = entityTypes(entitiesByViewType(model, "section"));

    expect(elevationTypes.has("LINE")).toBe(true);
    expect(elevationTypes.has("LWPOLYLINE")).toBe(true);
    expect(elevationTypes.has("HATCH")).toBe(true);
    expect(elevationTypes.has("DIMENSION")).toBe(true);
    expect(sectionTypes.has("LINE")).toBe(true);
    expect(sectionTypes.has("LWPOLYLINE")).toBe(true);
    expect(sectionTypes.has("HATCH")).toBe(true);
    expect(sectionTypes.has("DIMENSION")).toBe(true);
  });

  test('technical entities use imageProviderUsed="none" and carry geometryHash', () => {
    const model = buildCanonicalDrawingModelFromCompiledProject({
      compiledProject: fixtureCompiledProject(),
    });

    model.modelSpace.entities.forEach((entity) => {
      expect(entity.imageProviderUsed).toBe("none");
      expect(entity.technicalDrawing).toBe(true);
      expect(entity.geometryHash).toBe(model.geometryHash);
    });
  });

  test("validates a complete CanonicalDrawingModel", () => {
    const model = buildCanonicalDrawingModelFromCompiledProject({
      compiledProject: fixtureCompiledProject(),
    });
    const result = validateCanonicalDrawingModel(model);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.checks.entityCount).toBe(model.modelSpace.entities.length);
    expect(result.checks.imageProviderUsed).toBe("none");
  });

  test("fails closed when geometry authority or vector-only guarantees are broken", () => {
    const model = buildCanonicalDrawingModelFromCompiledProject({
      compiledProject: fixtureCompiledProject(),
    });
    const broken = {
      ...model,
      geometryHash: null,
      modelSpace: {
        ...model.modelSpace,
        entities: [
          ...model.modelSpace.entities,
          {
            id: "bad-image",
            type: "IMAGE",
            layer: "A-WALL",
            geometryHash: model.geometryHash,
            imageProviderUsed: "openai",
          },
        ],
      },
    };
    const result = validateCanonicalDrawingModel(broken);
    const codes = result.errors.map((error) => error.code);

    expect(result.valid).toBe(false);
    expect(codes).toContain("CAD_MODEL_GEOMETRY_HASH_MISSING");
    expect(codes).toContain("CAD_MODEL_RASTER_TECHNICAL_ENTITY");
  });
});
