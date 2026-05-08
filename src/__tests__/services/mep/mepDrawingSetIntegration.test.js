import { __projectGraphVerticalSliceInternals } from "../../../services/project/projectGraphVerticalSliceService.js";

function fixtureCompiledProject() {
  return {
    geometryHash: "geometry-hash-mep-drawing-set-001",
    projectGraphHash: "project-graph-hash-mep-drawing-set-001",
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
    ],
  };
}

describe("MEP drawing-set integration", () => {
  test("keeps MEP sheets disabled by default", () => {
    const result = __projectGraphVerticalSliceInternals.buildDrawingSet(
      fixtureCompiledProject(),
      {
        layoutTemplate: "presentation-v3",
      },
    );
    const panelTypes = result.drawingSet.drawings.map(
      (drawing) => drawing.panel_type,
    );

    expect(panelTypes).not.toContain("mep_lighting_plan");
    expect(panelTypes).not.toContain("mep_power_plan");
    expect(panelTypes).not.toContain("mep_plumbing_plan");
    expect(result.technicalBuild.mepModel).toBeNull();
  });

  test("adds MEP drawing sheets and manifest entries when explicitly enabled", () => {
    const result = __projectGraphVerticalSliceInternals.buildDrawingSet(
      fixtureCompiledProject(),
      {
        layoutTemplate: "presentation-v3",
        includeMepDrawings: true,
      },
    );
    const panelTypes = result.drawingSet.drawings.map(
      (drawing) => drawing.panel_type,
    );
    const mepArtifacts = Object.values(result.drawingArtifacts).filter(
      (artifact) => artifact.drawingType === "mep",
    );

    expect(panelTypes).toEqual(
      expect.arrayContaining([
        "mep_lighting_plan",
        "mep_power_plan",
        "mep_plumbing_plan",
        "mep_drainage_plan",
        "mep_ventilation_plan",
        "mep_schematic_notes",
      ]),
    );
    expect(result.technicalBuild.mepModel?.mepModelHash).toBeTruthy();
    expect(mepArtifacts.length).toBeGreaterThan(0);
    mepArtifacts.forEach((artifact) => {
      expect(artifact.technicalDrawing).toBe(true);
      expect(artifact.imageProviderUsed).toBe("none");
      expect(artifact.metadata.mepModelHash).toBeTruthy();
      expect(artifact.metadata.reviewRequired).toBe(true);
      expect(artifact.svgString).toContain(
        "QUALIFIED MEP ENGINEER REVIEW REQUIRED",
      );
    });
  });
});

describe("MEP drawing set environment gating", () => {
  const originalMepEnv = process.env.MEP_DRAWINGS_ENABLED;

  afterEach(() => {
    if (originalMepEnv === undefined) {
      delete process.env.MEP_DRAWINGS_ENABLED;
    } else {
      process.env.MEP_DRAWINGS_ENABLED = originalMepEnv;
    }
  });

  test("includes MEP panels when MEP_DRAWINGS_ENABLED=true", () => {
    process.env.MEP_DRAWINGS_ENABLED = "true";
    const result = __projectGraphVerticalSliceInternals.buildDrawingSet(
      fixtureCompiledProject(),
    );
    const drawingTypes = result.drawingSet.drawings.map(
      (drawing) => drawing.panel_type,
    );

    expect(drawingTypes).toEqual(
      expect.arrayContaining([
        "mep_lighting_plan",
        "mep_power_plan",
        "mep_plumbing_plan",
        "mep_drainage_plan",
        "mep_ventilation_plan",
      ]),
    );
  });

  test("keeps MEP panels absent when MEP_DRAWINGS_ENABLED=false", () => {
    process.env.MEP_DRAWINGS_ENABLED = "false";
    const result = __projectGraphVerticalSliceInternals.buildDrawingSet(
      fixtureCompiledProject(),
    );
    const drawingTypes = result.drawingSet.drawings.map(
      (drawing) => drawing.panel_type,
    );

    expect(drawingTypes).not.toEqual(
      expect.arrayContaining(["mep_lighting_plan", "mep_power_plan"]),
    );
  });
});
