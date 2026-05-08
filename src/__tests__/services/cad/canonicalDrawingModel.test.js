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
        type: "kitchen",
        polygon: [
          { x: 8, y: 3 },
          { x: 11, y: 3 },
          { x: 11, y: 7 },
          { x: 8, y: 7 },
        ],
      },
      {
        id: "room-bath",
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

const MEP_LAYER_NAMES = [
  "E-LIGHT",
  "E-POWER",
  "E-SWITCH",
  "E-DATA",
  "P-WATER",
  "P-DRAIN",
  "P-SANITARY",
  "M-DUCT",
  "M-VENT",
  "M-EQUIP",
  "MEP-RISER",
  "MEP-NOTES",
  "MEP-DIMS",
];

const DETAIL_LAYER_NAMES = [
  "A-DETAIL",
  "A-DETAIL-DIMS",
  "A-DETAIL-TEXT",
  "A-DETAIL-HATCH",
  "A-CALLOUT",
  "D-CONCRETE",
  "D-MASONRY",
  "D-INSULATION",
  "D-TIMBER",
  "D-MEMBRANE",
  "D-EARTH",
  "D-GLAZING",
  "D-METAL",
];

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
        "NORTH_ARROW",
        "SECTION_MARKER",
        "LEVEL_DATUM",
      ]),
    );
    expect(model.hatches.map((hatch) => hatch.name)).toEqual(
      expect.arrayContaining(["BRICK", "CONCRETE", "STEEL"]),
    );
    expect(model.dimensionStyles.map((style) => style.name)).toContain(
      "ARCH_100",
    );
    expect(model.textStyles.map((style) => style.name)).toContain("ARCH_BODY");
    expect(model.plotStyleMetadata).toEqual(
      expect.objectContaining({
        mode: "ctb",
        ctbFile: "archiai-monochrome.ctb",
      }),
    );
    expect(model.structuralModel).toBeUndefined();
    expect(model.mepModel).toBeUndefined();
    expect(model.detailLibrary).toBeUndefined();
    expect(
      model.modelSpace.entities.filter((entity) =>
        String(entity.layer || "").startsWith("S-"),
      ),
    ).toEqual([]);
    expect(
      model.modelSpace.entities.filter((entity) =>
        MEP_LAYER_NAMES.includes(entity.layer),
      ),
    ).toEqual([]);
    expect(
      model.modelSpace.entities.filter((entity) =>
        DETAIL_LAYER_NAMES.includes(entity.layer),
      ),
    ).toEqual([]);
  });

  test("carries explicit paper-space sheets, viewports, title block fields, and drawing scales", () => {
    const model = buildCanonicalDrawingModelFromCompiledProject({
      compiledProject: fixtureCompiledProject(),
    });
    const planSheet = model.paperSpace.sheets.find(
      (sheet) => sheet.sheetId === "A-101",
    );

    expect(planSheet).toEqual(
      expect.objectContaining({
        sheetId: "A-101",
        sheetNumber: "A-101",
        drawingNumber: "A-101",
        layoutName: "A-101",
        paperSize: "A1",
        orientation: "landscape",
        scale: "1:100",
        titleBlock: "TITLE_BLOCK_A1",
        geometryHash: model.geometryHash,
        sourceProjectGraphHash: model.sourceProjectGraphHash,
        jurisdiction: "uk",
        revision: "P01",
        status: "Preliminary",
        date: "undated",
        author: "Architect AI Platform",
        company: "Architect AI Platform",
      }),
    );
    expect(planSheet.viewports).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          viewportId: "vp-floor_plan_ground",
          viewId: "floor_plan_ground",
          viewType: "floor_plan",
          scale: "1:100",
          nativeViewport: expect.objectContaining({
            entityType: "VIEWPORT",
            className: "AcDbViewport",
            viewportHandle: expect.any(String),
          }),
          geometryHash: model.geometryHash,
          sourceProjectGraphHash: model.sourceProjectGraphHash,
        }),
      ]),
    );
    expect(planSheet.nativeLayout).toEqual(
      expect.objectContaining({
        className: "AcDbLayout",
        layoutName: "A-101",
        layoutHandle: expect.any(String),
        blockRecordHandle: expect.any(String),
      }),
    );
    expect(planSheet.plotSettings).toEqual(
      expect.objectContaining({
        plotConfigurationName: "DWG To PDF.pc3",
        paperSize: "A1",
        orientation: "landscape",
        plotStyleTable: "archiai-monochrome.ctb",
      }),
    );
    expect(planSheet.modelViews).toContain("floor_plan_ground");
    expect(planSheet.drawingIndex).toEqual(
      expect.objectContaining({
        sheetNumber: "A-101",
        title: "Ground Floor Plan",
        scale: "1:100",
      }),
    );
    expect(model.titleBlocks[0]).toEqual(
      expect.objectContaining({
        name: "TITLE_BLOCK_A1",
        fields: expect.arrayContaining([
          "projectName",
          "drawingNumber",
          "title",
          "revision",
          "status",
          "scale",
        ]),
      }),
    );
    expect(model.drawingScales.map((scale) => scale.ratio)).toEqual(
      expect.arrayContaining(["1:500", "1:100", "1:20", "1:5"]),
    );
  });

  test("declares the required professional CAD layers", () => {
    const model = buildCanonicalDrawingModelFromCompiledProject({
      compiledProject: fixtureCompiledProject(),
    });
    const layerNames = model.layers.map((layer) => layer.name);
    const architecturalLayerNames = REQUIRED_CANONICAL_CAD_LAYERS.filter(
      (layerName) =>
        !layerName.startsWith("S-") &&
        !MEP_LAYER_NAMES.includes(layerName) &&
        !DETAIL_LAYER_NAMES.includes(layerName),
    );

    expect(layerNames).toEqual(expect.arrayContaining(architecturalLayerNames));
    expect(layerNames).not.toEqual(
      expect.arrayContaining(["S-FOUNDATION", "S-BEAM", "S-GRID"]),
    );
    expect(layerNames).not.toEqual(expect.arrayContaining(MEP_LAYER_NAMES));
    expect(layerNames).not.toEqual(expect.arrayContaining(DETAIL_LAYER_NAMES));

    const structuralModel = buildCanonicalDrawingModelFromCompiledProject({
      compiledProject: fixtureCompiledProject(),
      includeStructuralDrawings: true,
    });
    expect(structuralModel.layers.map((layer) => layer.name)).toEqual(
      expect.arrayContaining(
        REQUIRED_CANONICAL_CAD_LAYERS.filter(
          (layerName) =>
            !MEP_LAYER_NAMES.includes(layerName) &&
            !DETAIL_LAYER_NAMES.includes(layerName),
        ),
      ),
    );

    const mepModel = buildCanonicalDrawingModelFromCompiledProject({
      compiledProject: fixtureCompiledProject(),
      includeMepDrawings: true,
    });
    expect(mepModel.layers.map((layer) => layer.name)).toEqual(
      expect.arrayContaining(
        REQUIRED_CANONICAL_CAD_LAYERS.filter(
          (layerName) =>
            !layerName.startsWith("S-") &&
            !DETAIL_LAYER_NAMES.includes(layerName),
        ),
      ),
    );

    const detailModel = buildCanonicalDrawingModelFromCompiledProject({
      compiledProject: fixtureCompiledProject(),
      includeDetailDrawings: true,
    });
    expect(detailModel.layers.map((layer) => layer.name)).toEqual(
      expect.arrayContaining(
        REQUIRED_CANONICAL_CAD_LAYERS.filter(
          (layerName) =>
            !layerName.startsWith("S-") && !MEP_LAYER_NAMES.includes(layerName),
        ),
      ),
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
    expect(result.checks.hasTitleBlock).toBe(true);
    expect(result.checks.hasPaperSpace).toBe(true);
    expect(result.checks.hasDimensions).toBe(true);
    expect(result.checks.hasNativeLayouts).toBe(true);
    expect(result.checks.hasNativeViewports).toBe(true);
    expect(result.checks.hasPlotSettings).toBe(true);
    expect(result.checks.hasPlotStyleMetadata).toBe(true);
    expect(result.checks.hasStructuralModelHash).toBe(false);
    expect(result.checks.hasStructuralDisclaimer).toBe(false);
    expect(result.checks.structuralReviewRequired).toBe(false);
    expect(result.checks.structuralImageProviderUsed).toBe(null);
    expect(result.checks.hasMepModelHash).toBe(false);
    expect(result.checks.hasMepDisclaimer).toBe(false);
    expect(result.checks.mepReviewRequired).toBe(false);
    expect(result.checks.mepImageProviderUsed).toBe(null);
    expect(result.checks.hasDetailLibraryHash).toBe(false);
    expect(result.checks.hasDetailDisclaimer).toBe(false);
    expect(result.checks.detailReviewRequired).toBe(false);
    expect(result.checks.detailImageProviderUsed).toBe(null);
  });

  test("adds structural CAD entities, dimensions, grid, and review notes", () => {
    const model = buildCanonicalDrawingModelFromCompiledProject({
      compiledProject: fixtureCompiledProject(),
      includeStructuralDrawings: true,
    });
    expect(model.structuralModel).toEqual(
      expect.objectContaining({
        geometryHash: model.geometryHash,
        sourceProjectGraphHash: model.sourceProjectGraphHash,
        reviewRequired: true,
        imageProviderUsed: "none",
      }),
    );
    expect(model.structuralModel.disclaimers.join(" ")).toMatch(
      /licensed structural engineer/i,
    );
    const structuralEntities = model.modelSpace.entities.filter((entity) =>
      String(entity.layer || "").startsWith("S-"),
    );
    const layers = new Set(structuralEntities.map((entity) => entity.layer));
    const roles = new Set(
      structuralEntities.map((entity) => entity.metadata?.role).filter(Boolean),
    );

    expect([...layers]).toEqual(
      expect.arrayContaining([
        "S-FOUNDATION",
        "S-COLUMN",
        "S-BEAM",
        "S-SLAB",
        "S-ROOF",
        "S-GRID",
        "S-NOTES",
        "S-DIMS",
      ]),
    );
    expect([...roles]).toEqual(
      expect.arrayContaining([
        "foundation_outline",
        "structural_grid",
        "roof_rafter",
        "review_disclaimer",
      ]),
    );
    structuralEntities.forEach((entity) => {
      expect(entity.imageProviderUsed).toBe("none");
      expect(entity.technicalDrawing).toBe(true);
      expect(entity.geometryHash).toBe(model.geometryHash);
    });
  });

  test("adds opt-in MEP CAD entities, symbols, routes, dimensions, and review notes", () => {
    const model = buildCanonicalDrawingModelFromCompiledProject({
      compiledProject: fixtureCompiledProject(),
      includeMepDrawings: true,
    });

    expect(model.mepModel).toEqual(
      expect.objectContaining({
        geometryHash: model.geometryHash,
        sourceProjectGraphHash: model.sourceProjectGraphHash,
        reviewRequired: true,
        imageProviderUsed: "none",
      }),
    );
    expect(model.mepModel.disclaimers.join(" ")).toMatch(
      /qualified MEP engineer/i,
    );

    const mepEntities = model.modelSpace.entities.filter((entity) =>
      MEP_LAYER_NAMES.includes(entity.layer),
    );
    const layers = new Set(mepEntities.map((entity) => entity.layer));
    const roles = new Set(
      mepEntities.map((entity) => entity.metadata?.role).filter(Boolean),
    );

    expect([...layers]).toEqual(expect.arrayContaining(MEP_LAYER_NAMES));
    expect([...roles]).toEqual(
      expect.arrayContaining([
        "mep_light_fixture",
        "mep_power_outlet",
        "mep_switch",
        "mep_plumbing_supply",
        "mep_drainage_waste",
        "mep_ventilation_route",
        "mep_riser",
        "mep_equipment",
        "review_disclaimer",
      ]),
    );
    mepEntities.forEach((entity) => {
      expect(entity.imageProviderUsed).toBe("none");
      expect(entity.technicalDrawing).toBe(true);
      expect(entity.geometryHash).toBe(model.geometryHash);
    });
  });

  test("CAD QA validates MEP only when a MepModel is present or required", () => {
    const defaultModel = buildCanonicalDrawingModelFromCompiledProject({
      compiledProject: fixtureCompiledProject(),
    });
    const defaultResult = validateCanonicalDrawingModel(defaultModel);

    expect(defaultModel.mepModel).toBeUndefined();
    expect(defaultResult.valid).toBe(true);
    expect(defaultResult.errors.map((error) => error.code)).not.toEqual(
      expect.arrayContaining(["CAD_MODEL_MEP_MODEL_HASH_MISSING"]),
    );

    const mepModel = buildCanonicalDrawingModelFromCompiledProject({
      compiledProject: fixtureCompiledProject(),
      includeMepDrawings: true,
    });
    const brokenResult = validateCanonicalDrawingModel({
      ...mepModel,
      mepModel: {
        ...mepModel.mepModel,
        mepModelHash: null,
        disclaimers: [],
        drainageWasteLayout: {
          ...mepModel.mepModel.drainageWasteLayout,
          lines: [],
        },
        electricalLightingLayout: {
          ...mepModel.mepModel.electricalLightingLayout,
          fixtures: [],
        },
        imageProviderUsed: "openai",
      },
    });
    const codes = brokenResult.errors.map((error) => error.code);

    expect(brokenResult.valid).toBe(false);
    expect(codes).toEqual(
      expect.arrayContaining([
        "CAD_MODEL_MEP_MODEL_HASH_MISSING",
        "CAD_MODEL_MEP_DISCLAIMER_MISSING",
        "CAD_MODEL_MEP_WET_ROOM_DRAINAGE_MISSING",
        "CAD_MODEL_MEP_HABITABLE_LIGHTING_MISSING",
        "CAD_MODEL_MEP_IMAGE_PROVIDER_FORBIDDEN",
      ]),
    );

    const requiredResult = validateCanonicalDrawingModel(defaultModel, {
      requireMepModel: true,
    });
    expect(requiredResult.valid).toBe(false);
    expect(requiredResult.errors.map((error) => error.code)).toContain(
      "CAD_MODEL_MEP_MODEL_HASH_MISSING",
    );
  });

  test("adds opt-in construction detail CAD entities, sheets, callouts, hatches, dimensions, and review notes", () => {
    const model = buildCanonicalDrawingModelFromCompiledProject({
      compiledProject: fixtureCompiledProject(),
      includeDetailDrawings: true,
    });

    expect(model.detailLibrary).toEqual(
      expect.objectContaining({
        geometryHash: model.geometryHash,
        sourceProjectGraphHash: model.sourceProjectGraphHash,
        reviewRequired: true,
        imageProviderUsed: "none",
      }),
    );
    expect(model.detailLibrary.disclaimers.join(" ")).toMatch(
      /architect and engineer/i,
    );
    expect(model.paperSpace.sheets.map((sheet) => sheet.sheetId)).toEqual(
      expect.arrayContaining(["D-501", "D-502", "D-503", "D-504"]),
    );

    const detailEntities = model.modelSpace.entities.filter((entity) =>
      DETAIL_LAYER_NAMES.includes(entity.layer),
    );
    const layers = new Set(detailEntities.map((entity) => entity.layer));
    const roles = new Set(
      detailEntities.map((entity) => entity.metadata?.role).filter(Boolean),
    );

    expect([...layers]).toEqual(expect.arrayContaining(DETAIL_LAYER_NAMES));
    expect([...roles]).toEqual(
      expect.arrayContaining([
        "detail_title",
        "detail_material_hatch",
        "detail_dimension",
        "detail_callout",
        "detail_callout_marker",
        "detail_callout_reference",
        "review_disclaimer",
      ]),
    );
    detailEntities.forEach((entity) => {
      expect(entity.imageProviderUsed).toBe("none");
      expect(entity.technicalDrawing).toBe(true);
      expect(entity.geometryHash).toBe(model.geometryHash);
    });
  });

  test("CAD QA validates construction details only when detail library is present or required", () => {
    const defaultModel = buildCanonicalDrawingModelFromCompiledProject({
      compiledProject: fixtureCompiledProject(),
    });
    const defaultResult = validateCanonicalDrawingModel(defaultModel);

    expect(defaultModel.detailLibrary).toBeUndefined();
    expect(defaultResult.valid).toBe(true);
    expect(defaultResult.errors.map((error) => error.code)).not.toEqual(
      expect.arrayContaining(["CAD_MODEL_DETAIL_LIBRARY_HASH_MISSING"]),
    );

    const detailModel = buildCanonicalDrawingModelFromCompiledProject({
      compiledProject: fixtureCompiledProject(),
      includeDetailDrawings: true,
    });
    const brokenResult = validateCanonicalDrawingModel({
      ...detailModel,
      detailLibrary: {
        ...detailModel.detailLibrary,
        detailLibraryHash: null,
        disclaimers: [],
        imageProviderUsed: "openai",
        details: detailModel.detailLibrary.details
          .filter((detail) => detail.detailType !== "wall_foundation_junction")
          .map((detail, index) =>
            index === 0
              ? {
                  ...detail,
                  detailHash: null,
                  hatches: [],
                  dimensions: [],
                  dxfEntities: [],
                  imageProviderUsed: "openai",
                }
              : detail,
          ),
      },
    });
    const codes = brokenResult.errors.map((error) => error.code);

    expect(brokenResult.valid).toBe(false);
    expect(codes).toEqual(
      expect.arrayContaining([
        "CAD_MODEL_DETAIL_LIBRARY_HASH_MISSING",
        "CAD_MODEL_DETAIL_DISCLAIMER_MISSING",
        "CAD_MODEL_DETAIL_REQUIRED_TYPE_MISSING",
        "CAD_MODEL_DETAIL_HASH_MISSING",
        "CAD_MODEL_DETAIL_HATCHES_MISSING",
        "CAD_MODEL_DETAIL_DIMENSIONS_MISSING",
        "CAD_MODEL_DETAIL_CALLOUTS_MISSING",
        "CAD_MODEL_DETAIL_IMAGE_PROVIDER_FORBIDDEN",
      ]),
    );

    const requiredResult = validateCanonicalDrawingModel(defaultModel, {
      requireDetailLibrary: true,
    });
    expect(requiredResult.valid).toBe(false);
    expect(requiredResult.errors.map((error) => error.code)).toContain(
      "CAD_MODEL_DETAIL_LIBRARY_HASH_MISSING",
    );
  });

  test("CAD QA fails when title blocks are missing", () => {
    const model = buildCanonicalDrawingModelFromCompiledProject({
      compiledProject: fixtureCompiledProject(),
    });
    const result = validateCanonicalDrawingModel({
      ...model,
      titleBlocks: [],
    });
    const codes = result.errors.map((error) => error.code);

    expect(result.valid).toBe(false);
    expect(codes).toContain("CAD_MODEL_TITLE_BLOCK_MISSING");
  });

  test("CAD QA requires sheet date while generated models keep a default fallback", () => {
    const model = buildCanonicalDrawingModelFromCompiledProject({
      compiledProject: fixtureCompiledProject(),
    });
    expect(model.paperSpace.sheets[0].date).toBe("undated");

    const result = validateCanonicalDrawingModel({
      ...model,
      paperSpace: {
        ...model.paperSpace,
        sheets: model.paperSpace.sheets.map((sheet, index) =>
          index === 0 ? { ...sheet, date: null } : sheet,
        ),
      },
    });
    const codes = result.errors.map((error) => error.code);

    expect(result.valid).toBe(false);
    expect(codes).toContain("CAD_MODEL_SHEET_FIELD_MISSING");
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          details: expect.objectContaining({ field: "date" }),
        }),
      ]),
    );
  });

  test("CAD QA validates native layouts, viewports, plot settings, and plot styles", () => {
    const model = buildCanonicalDrawingModelFromCompiledProject({
      compiledProject: fixtureCompiledProject(),
    });
    const result = validateCanonicalDrawingModel({
      ...model,
      plotStyleMetadata: null,
      paperSpace: {
        ...model.paperSpace,
        sheets: model.paperSpace.sheets.map((sheet) =>
          sheet.sheetId === "A-101"
            ? {
                ...sheet,
                nativeLayout: null,
                plotSettings: null,
                viewports: sheet.viewports.map((viewport) => ({
                  ...viewport,
                  nativeViewport: null,
                })),
              }
            : sheet,
        ),
      },
    });
    const codes = result.errors.map((error) => error.code);

    expect(result.valid).toBe(false);
    expect(codes).toEqual(
      expect.arrayContaining([
        "CAD_MODEL_NATIVE_LAYOUT_MISSING",
        "CAD_MODEL_NATIVE_VIEWPORT_MISSING",
        "CAD_MODEL_PLOT_SETTINGS_MISSING",
        "CAD_MODEL_PLOT_STYLE_METADATA_MISSING",
      ]),
    );
  });

  test("CAD QA can fail missing dimensions in strict mode", () => {
    const model = buildCanonicalDrawingModelFromCompiledProject({
      compiledProject: fixtureCompiledProject(),
    });
    const result = validateCanonicalDrawingModel(
      {
        ...model,
        modelSpace: {
          ...model.modelSpace,
          entities: model.modelSpace.entities.filter(
            (entity) => entity.type !== "DIMENSION",
          ),
        },
      },
      { dimensionPolicy: "error" },
    );
    const codes = result.errors.map((error) => error.code);

    expect(result.valid).toBe(false);
    expect(codes).toContain("CAD_MODEL_DIMENSIONS_MISSING");
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
