import { __projectGraphVerticalSliceInternals } from "../../../services/project/projectGraphVerticalSliceService.js";

function fixtureCompiledProject() {
  return {
    geometryHash: "geometry-hash-structural-drawing-set-001",
    projectGraphHash: "project-graph-hash-structural-drawing-set-001",
    site: {
      boundary_polygon: [
        { x: 0, y: 0 },
        { x: 18, y: 0 },
        { x: 18, y: 12 },
        { x: 0, y: 12 },
      ],
    },
    levels: [{ id: "level-0", level_number: 0, name: "Ground", height_m: 3.2 }],
    slabs: [
      {
        id: "slab-0",
        levelId: "level-0",
        polygon: [
          { x: 3, y: 3 },
          { x: 14, y: 3 },
          { x: 14, y: 9 },
          { x: 3, y: 9 },
        ],
      },
    ],
    rooms: [
      {
        id: "room-0",
        levelId: "level-0",
        name: "Living",
        polygon: [
          { x: 3, y: 3 },
          { x: 14, y: 3 },
          { x: 14, y: 9 },
          { x: 3, y: 9 },
        ],
      },
    ],
    walls: [
      {
        id: "wall-0",
        levelId: "level-0",
        exterior: true,
        start: { x: 3, y: 3 },
        end: { x: 14, y: 3 },
      },
    ],
  };
}

describe("structural drawing-set integration", () => {
  test("keeps structural sheets disabled by default", () => {
    const result = __projectGraphVerticalSliceInternals.buildDrawingSet(
      fixtureCompiledProject(),
      {
        layoutTemplate: "presentation-v3",
      },
    );
    const panelTypes = result.drawingSet.drawings.map(
      (drawing) => drawing.panel_type,
    );

    expect(panelTypes).not.toContain("foundation_plan");
    expect(panelTypes).not.toContain("structural_ground_floor");
    expect(result.technicalBuild.structuralModel).toBeNull();
  });

  test("adds structural drawing sheets and manifest entries when enabled", () => {
    const result = __projectGraphVerticalSliceInternals.buildDrawingSet(
      fixtureCompiledProject(),
      {
        layoutTemplate: "presentation-v3",
        structuralDrawingsEnabled: true,
      },
    );
    const panelTypes = result.drawingSet.drawings.map(
      (drawing) => drawing.panel_type,
    );
    const structuralArtifacts = Object.values(result.drawingArtifacts).filter(
      (artifact) => artifact.drawingType === "structural",
    );

    expect(panelTypes).toEqual(
      expect.arrayContaining([
        "foundation_plan",
        "structural_ground_floor",
        "roof_framing_plan",
        "structural_section",
        "structural_notes",
      ]),
    );
    expect(structuralArtifacts.length).toBeGreaterThan(0);
    structuralArtifacts.forEach((artifact) => {
      expect(artifact.technicalDrawing).toBe(true);
      expect(artifact.imageProviderUsed).toBe("none");
      expect(artifact.metadata.structuralModelHash).toBeTruthy();
      expect(artifact.metadata.reviewRequired).toBe(true);
      expect(artifact.svgString).toContain("ENGINEER REVIEW REQUIRED");
    });
  });
});

describe("structural drawing set environment gating", () => {
  const originalStructuralEnv = process.env.STRUCTURAL_DRAWINGS_ENABLED;

  afterEach(() => {
    if (originalStructuralEnv === undefined) {
      delete process.env.STRUCTURAL_DRAWINGS_ENABLED;
    } else {
      process.env.STRUCTURAL_DRAWINGS_ENABLED = originalStructuralEnv;
    }
  });

  test("includes structural panels when STRUCTURAL_DRAWINGS_ENABLED=true", () => {
    process.env.STRUCTURAL_DRAWINGS_ENABLED = "true";
    const result = __projectGraphVerticalSliceInternals.buildDrawingSet(
      fixtureCompiledProject(),
    );
    const drawingTypes = result.drawingSet.drawings.map(
      (drawing) => drawing.panel_type,
    );

    expect(drawingTypes).toEqual(
      expect.arrayContaining([
        "foundation_plan",
        "structural_ground_floor",
        "roof_framing_plan",
        "structural_section",
        "structural_notes",
      ]),
    );
  });

  test("keeps structural panels absent when STRUCTURAL_DRAWINGS_ENABLED=false", () => {
    process.env.STRUCTURAL_DRAWINGS_ENABLED = "false";
    const result = __projectGraphVerticalSliceInternals.buildDrawingSet(
      fixtureCompiledProject(),
    );
    const drawingTypes = result.drawingSet.drawings.map(
      (drawing) => drawing.panel_type,
    );

    expect(drawingTypes).not.toEqual(
      expect.arrayContaining(["foundation_plan", "structural_ground_floor"]),
    );
  });
});
