import { __projectGraphVerticalSliceInternals } from "../../../services/project/projectGraphVerticalSliceService.js";

function fixtureCompiledProject() {
  return {
    geometryHash: "geometry-hash-detail-drawing-set-001",
    projectGraphHash: "project-graph-hash-detail-drawing-set-001",
    site: {
      boundary_polygon: [
        { x: 0, y: 0 },
        { x: 18, y: 0 },
        { x: 18, y: 12 },
        { x: 0, y: 12 },
      ],
    },
    levels: [{ id: "level-0", level_number: 0, name: "Ground", height_m: 3.2 }],
    rooms: [{ id: "room-1", name: "Bathroom", type: "bathroom" }],
    walls: [{ id: "wall-1" }],
    openings: [{ id: "door-1", type: "door" }],
    roof_primitives: [{ id: "roof-1" }],
  };
}

describe("construction detail drawing-set integration", () => {
  test("keeps detail sheets disabled by default", () => {
    const result = __projectGraphVerticalSliceInternals.buildDrawingSet(
      fixtureCompiledProject(),
      {
        layoutTemplate: "presentation-v3",
      },
    );
    const panelTypes = result.drawingSet.drawings.map(
      (drawing) => drawing.panel_type,
    );

    expect(panelTypes).not.toContain("detail_sheet_architectural");
    expect(panelTypes).not.toContain("detail_sheet_envelope");
    expect(result.technicalBuild.detailLibrary).toBeNull();
  });

  test("adds detail drawing sheets and manifest entries when explicitly enabled", () => {
    const result = __projectGraphVerticalSliceInternals.buildDrawingSet(
      fixtureCompiledProject(),
      {
        layoutTemplate: "presentation-v3",
        includeDetailDrawings: true,
      },
    );
    const panelTypes = result.drawingSet.drawings.map(
      (drawing) => drawing.panel_type,
    );
    const detailArtifacts = Object.values(result.drawingArtifacts).filter(
      (artifact) => artifact.drawingType === "detail",
    );

    expect(panelTypes).toEqual(
      expect.arrayContaining([
        "detail_sheet_architectural",
        "detail_sheet_envelope",
        "detail_sheet_wetroom_drainage",
        "detail_sheet_mep_riser",
        "detail_notes",
      ]),
    );
    expect(result.technicalBuild.detailLibrary?.detailLibraryHash).toBeTruthy();
    expect(detailArtifacts.length).toBeGreaterThan(0);
    detailArtifacts.forEach((artifact) => {
      expect(artifact.technicalDrawing).toBe(true);
      expect(artifact.imageProviderUsed).toBe("none");
      expect(artifact.metadata.detailLibraryHash).toBeTruthy();
      expect(artifact.metadata.detailHashes.length).toBeGreaterThan(0);
      expect(artifact.metadata.reviewRequired).toBe(true);
      expect(artifact.svgString).toContain(
        "ARCHITECT / ENGINEER REVIEW REQUIRED",
      );
    });
  });
});

describe("construction detail drawing set environment gating", () => {
  const originalDetailEnv = process.env.DETAIL_DRAWINGS_ENABLED;

  afterEach(() => {
    if (originalDetailEnv === undefined) {
      delete process.env.DETAIL_DRAWINGS_ENABLED;
    } else {
      process.env.DETAIL_DRAWINGS_ENABLED = originalDetailEnv;
    }
  });

  test("includes detail panels when DETAIL_DRAWINGS_ENABLED=true", () => {
    process.env.DETAIL_DRAWINGS_ENABLED = "true";
    const result = __projectGraphVerticalSliceInternals.buildDrawingSet(
      fixtureCompiledProject(),
    );
    const drawingTypes = result.drawingSet.drawings.map(
      (drawing) => drawing.panel_type,
    );

    expect(drawingTypes).toEqual(
      expect.arrayContaining([
        "detail_sheet_architectural",
        "detail_sheet_envelope",
        "detail_sheet_wetroom_drainage",
      ]),
    );
  });

  test("keeps detail panels absent when DETAIL_DRAWINGS_ENABLED=false", () => {
    process.env.DETAIL_DRAWINGS_ENABLED = "false";
    const result = __projectGraphVerticalSliceInternals.buildDrawingSet(
      fixtureCompiledProject(),
    );
    const drawingTypes = result.drawingSet.drawings.map(
      (drawing) => drawing.panel_type,
    );

    expect(drawingTypes).not.toEqual(
      expect.arrayContaining([
        "detail_sheet_architectural",
        "detail_sheet_envelope",
      ]),
    );
  });
});
