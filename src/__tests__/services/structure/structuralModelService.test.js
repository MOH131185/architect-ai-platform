import {
  STRUCTURAL_REVIEW_DISCLAIMER,
  buildStructuralDrawingPanelsFromCompiledProject,
  buildStructuralModelFromCompiledProject,
  validateStructuralModel,
} from "../../../services/structure/structuralModelService.js";

function fixtureCompiledProject() {
  return {
    geometryHash: "geometry-hash-structural-001",
    projectGraphHash: "project-graph-hash-structural-001",
    projectName: "Structural Fixture",
    jurisdiction: "uk",
    buildingType: "residential",
    site: {
      boundary_polygon: [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 14 },
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
      {
        id: "level-1",
        level_number: 1,
        name: "First",
        elevation_m: 3.2,
        height_m: 3.2,
      },
    ],
    slabs: [
      {
        id: "slab-ground",
        levelId: "level-0",
        polygon: [
          { x: 3, y: 3 },
          { x: 15, y: 3 },
          { x: 15, y: 10 },
          { x: 3, y: 10 },
        ],
      },
      {
        id: "slab-first",
        levelId: "level-1",
        polygon: [
          { x: 3, y: 3 },
          { x: 15, y: 3 },
          { x: 15, y: 10 },
          { x: 3, y: 10 },
        ],
      },
    ],
    walls: [
      {
        id: "wall-south",
        levelId: "level-0",
        exterior: true,
        start: { x: 3, y: 3 },
        end: { x: 15, y: 3 },
      },
    ],
    roof_primitives: [
      {
        id: "roof-main",
        levelId: "level-1",
        polygon: [
          { x: 3, y: 3 },
          { x: 15, y: 3 },
          { x: 15, y: 10 },
          { x: 3, y: 10 },
        ],
      },
    ],
  };
}

describe("structuralModelService", () => {
  test("builds a deterministic preliminary StructuralModel with authority hashes", () => {
    const first = buildStructuralModelFromCompiledProject({
      compiledProject: fixtureCompiledProject(),
    });
    const second = buildStructuralModelFromCompiledProject({
      compiledProject: fixtureCompiledProject(),
    });

    expect(first.geometryHash).toBe("geometry-hash-structural-001");
    expect(first.sourceProjectGraphHash).toBe(
      "project-graph-hash-structural-001",
    );
    expect(first.structuralModelHash).toBe(second.structuralModelHash);
    expect(first.structuralModelId).toBe(second.structuralModelId);
  });

  test("derives foundations, slabs, roof framing, grid, and member IDs", () => {
    const model = buildStructuralModelFromCompiledProject({
      compiledProject: fixtureCompiledProject(),
    });

    expect(model.foundationSystem.foundations.length).toBeGreaterThan(0);
    expect(model.slabs.length).toBeGreaterThan(0);
    expect(model.roofFraming.rafters.length).toBeGreaterThan(0);
    expect(model.structuralGrid.x_axes.length).toBeGreaterThan(1);
    expect(model.memberIds.length).toBeGreaterThan(0);
    expect(model.schedules.beams).toBeDefined();
  });

  test("requires licensed structural engineer review and disclaimer", () => {
    const model = buildStructuralModelFromCompiledProject({
      compiledProject: fixtureCompiledProject(),
    });
    const result = validateStructuralModel(model, {
      compiledProject: fixtureCompiledProject(),
    });

    expect(model.reviewRequired).toBe(true);
    expect(model.disclaimers).toContain(STRUCTURAL_REVIEW_DISCLAIMER);
    expect(result.valid).toBe(true);
    expect(result.checks.imageProviderUsed).toBe("none");
  });

  test("generates deterministic SVG structural panels without image providers", () => {
    const { structuralModel, structuralPanels } =
      buildStructuralDrawingPanelsFromCompiledProject({
        compiledProject: fixtureCompiledProject(),
      });

    expect(Object.keys(structuralPanels)).toEqual(
      expect.arrayContaining([
        "foundation_plan",
        "structural_ground_floor",
        "structural_upper_floor",
        "roof_framing_plan",
        "structural_section",
        "structural_notes",
      ]),
    );
    Object.values(structuralPanels).forEach((panel) => {
      expect(panel.svgString).toContain("<svg");
      expect(panel.svgString).toContain("s-grid");
      expect(panel.svgString).toContain("member-tag");
      expect(panel.svgString).toContain("ENGINEER REVIEW REQUIRED");
      expect(panel.technicalDrawing).toBe(true);
      expect(panel.imageProviderUsed).toBe("none");
      expect(panel.geometryHash).toBe(structuralModel.geometryHash);
      expect(panel.sourceGeometryHash).toBe(structuralModel.geometryHash);
    });
  });
});
