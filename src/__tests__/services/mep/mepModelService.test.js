import {
  MEP_REVIEW_DISCLAIMER,
  REQUIRED_MEP_CAD_LAYERS,
  buildMepDrawingPanelsFromCompiledProject,
  buildMepModelFromCompiledProject,
  validateMepModel,
} from "../../../services/mep/mepModelService.js";

function fixtureCompiledProject() {
  return {
    geometryHash: "geometry-hash-mep-001",
    projectGraphHash: "project-graph-hash-mep-001",
    projectName: "MEP Fixture",
    jurisdiction: "uk",
    buildingType: "residential",
    site: {
      boundary_polygon: [
        { x: 0, y: 0 },
        { x: 18, y: 0 },
        { x: 18, y: 12 },
        { x: 0, y: 12 },
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
          { x: 2, y: 2 },
          { x: 15, y: 2 },
          { x: 15, y: 10 },
          { x: 2, y: 10 },
        ],
      },
    ],
    rooms: [
      {
        id: "room-living",
        levelId: "level-0",
        name: "Living",
        type: "living",
        polygon: [
          { x: 2, y: 2 },
          { x: 8, y: 2 },
          { x: 8, y: 10 },
          { x: 2, y: 10 },
        ],
      },
      {
        id: "room-kitchen",
        levelId: "level-0",
        name: "Kitchen",
        type: "kitchen",
        polygon: [
          { x: 8, y: 2 },
          { x: 12, y: 2 },
          { x: 12, y: 6 },
          { x: 8, y: 6 },
        ],
      },
      {
        id: "room-bath",
        levelId: "level-0",
        name: "Bathroom",
        type: "bathroom",
        polygon: [
          { x: 12, y: 2 },
          { x: 15, y: 2 },
          { x: 15, y: 6 },
          { x: 12, y: 6 },
        ],
      },
      {
        id: "room-hall",
        levelId: "level-0",
        name: "Hall",
        type: "corridor",
        polygon: [
          { x: 8, y: 6 },
          { x: 15, y: 6 },
          { x: 15, y: 10 },
          { x: 8, y: 10 },
        ],
      },
    ],
  };
}

describe("mepModelService", () => {
  test("builds a deterministic preliminary MepModel with authority hashes", () => {
    const first = buildMepModelFromCompiledProject({
      compiledProject: fixtureCompiledProject(),
    });
    const second = buildMepModelFromCompiledProject({
      compiledProject: fixtureCompiledProject(),
    });

    expect(first.geometryHash).toBe("geometry-hash-mep-001");
    expect(first.sourceProjectGraphHash).toBe("project-graph-hash-mep-001");
    expect(first.mepModelHash).toBe(second.mepModelHash);
    expect(first.mepModelId).toBe(second.mepModelId);
    expect(first.reviewRequired).toBe(true);
    expect(first.disclaimers).toContain(MEP_REVIEW_DISCLAIMER);
    expect(first.imageProviderUsed).toBe("none");
    expect(first.requiredCadLayers).toEqual(REQUIRED_MEP_CAD_LAYERS);
  });

  test("derives wet-room plumbing, drainage, and ventilation routes", () => {
    const model = buildMepModelFromCompiledProject({
      compiledProject: fixtureCompiledProject(),
    });

    expect(model.roomFixtureMapping.wetRooms).toContain("room-bath");
    expect(model.roomFixtureMapping.kitchens).toContain("room-kitchen");
    expect(model.plumbingSupplyLayout.lines.length).toBeGreaterThan(0);
    expect(model.drainageWasteLayout.lines.length).toBeGreaterThan(0);
    expect(model.ventilationHvacLayout.routes.length).toBeGreaterThan(0);
    expect(model.ventilationHvacLayout.extractFans.length).toBeGreaterThan(0);
  });

  test("derives habitable-room lighting, power, and data layouts", () => {
    const model = buildMepModelFromCompiledProject({
      compiledProject: fixtureCompiledProject(),
    });

    expect(model.roomFixtureMapping.habitableRooms).toContain("room-living");
    expect(model.electricalLightingLayout.fixtures.length).toBeGreaterThan(0);
    expect(model.electricalPowerSocketLayout.outlets.length).toBeGreaterThan(0);
    expect(model.electricalPowerSocketLayout.switches.length).toBeGreaterThan(
      0,
    );
    expect(model.schedules.lightingSchedule.length).toBeGreaterThan(0);
    expect(model.schedules.powerSchedule.length).toBeGreaterThan(0);
  });

  test("generates deterministic SVG MEP panels without image providers", () => {
    const { mepModel, mepPanels } = buildMepDrawingPanelsFromCompiledProject({
      compiledProject: fixtureCompiledProject(),
    });

    expect(Object.keys(mepPanels)).toEqual(
      expect.arrayContaining([
        "mep_lighting_plan",
        "mep_power_plan",
        "mep_plumbing_plan",
        "mep_drainage_plan",
        "mep_ventilation_plan",
        "mep_schematic_notes",
      ]),
    );
    Object.values(mepPanels).forEach((panel) => {
      expect(panel.svgString).toContain("<svg");
      expect(panel.svgString).toContain("MEP LEGEND");
      expect(panel.svgString).toContain(
        "QUALIFIED MEP ENGINEER REVIEW REQUIRED",
      );
      expect(panel.svgString).toContain('data-image-provider-used="none"');
      expect(panel.technicalDrawing).toBe(true);
      expect(panel.imageProviderUsed).toBe("none");
      expect(panel.reviewRequired).toBe(true);
      expect(panel.geometryHash).toBe(mepModel.geometryHash);
      expect(panel.sourceGeometryHash).toBe(mepModel.geometryHash);
    });
    expect(mepPanels.mep_lighting_plan.svgString).toContain("mep-light-symbol");
    expect(mepPanels.mep_power_plan.svgString).toContain("mep-socket-symbol");
    expect(mepPanels.mep_plumbing_plan.svgString).toContain("mep-water-route");
    expect(mepPanels.mep_drainage_plan.svgString).toContain("mep-drain-route");
    expect(mepPanels.mep_ventilation_plan.svgString).toContain(
      "mep-vent-route",
    );
  });

  test("validates MEP QA failures for missing hashes, review data, routes, and image providers", () => {
    const model = buildMepModelFromCompiledProject({
      compiledProject: fixtureCompiledProject(),
    });
    expect(
      validateMepModel(model, { compiledProject: fixtureCompiledProject() })
        .valid,
    ).toBe(true);

    const broken = validateMepModel(
      {
        ...model,
        mepModelHash: null,
        disclaimers: [],
        drainageWasteLayout: { ...model.drainageWasteLayout, lines: [] },
        electricalLightingLayout: {
          ...model.electricalLightingLayout,
          fixtures: [],
        },
        imageProviderUsed: "openai",
      },
      { compiledProject: fixtureCompiledProject() },
    );
    const codes = broken.errors.map((error) => error.code);

    expect(broken.valid).toBe(false);
    expect(codes).toEqual(
      expect.arrayContaining([
        "MEP_MODEL_HASH_MISSING",
        "MEP_MODEL_DISCLAIMER_MISSING",
        "MEP_MODEL_WET_ROOM_DRAINAGE_MISSING",
        "MEP_MODEL_HABITABLE_LIGHTING_MISSING",
        "MEP_MODEL_IMAGE_PROVIDER_FORBIDDEN",
      ]),
    );
  });
});
