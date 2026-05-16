/**
 * Phase 2 (Track 3) — CAD/BIM layer + entity handoff contract.
 *
 * When STRUCTURAL_DRAWINGS_ENABLED and MEP_DRAWINGS_ENABLED are on, the
 * canonical drawing model and the IFC export must carry every layer /
 * entity class downstream BIM tools expect from a "professional handoff
 * package". This regression locks the architectural + structural + MEP
 * layer registry so a refactor of the CAD exporter (e.g. dropping the
 * S-/E-/P-/M- pass-through) is caught immediately.
 *
 * Single-file contract — no end-to-end slice run; instead we feed a
 * minimal fixture compiledProject through the same canonical-drawing
 * builder + DXF exporter + IFC exporter that the production export route
 * uses.
 */

import { buildCanonicalDrawingModelFromCompiledProject } from "../../../services/cad/canonicalDrawingModel.js";
import { exportCanonicalDrawingModelToDXF } from "../../../services/cad/canonicalDxfExporter.js";
import { exportCompiledProjectToIFC } from "../../../services/project/compiledProjectExportService.js";
import { STRUCTURAL_REVIEW_DISCLAIMER } from "../../../services/structure/structuralModelService.js";
import { MEP_REVIEW_DISCLAIMER } from "../../../services/mep/mepModelService.js";

function fixtureCompiledProject() {
  return {
    geometryHash: "geometry-hash-handoff-layers-001",
    projectGraphHash: "project-graph-hash-handoff-layers-001",
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
        height_m: 3.0,
        elevation_m: 0,
      },
      {
        id: "level-1",
        level_number: 1,
        name: "First",
        height_m: 3.0,
        elevation_m: 3.0,
      },
    ],
    slabs: [
      {
        id: "slab-0",
        levelId: "level-0",
        type: "ground_bearing_slab",
        bbox: { min_x: 3, min_y: 3, max_x: 15, max_y: 11 },
        polygon: [
          { x: 3, y: 3 },
          { x: 15, y: 3 },
          { x: 15, y: 11 },
          { x: 3, y: 11 },
        ],
        thickness_m: 0.2,
      },
    ],
    walls: [
      {
        id: "wall-0",
        levelId: "level-0",
        exterior: true,
        start: { x: 3, y: 3 },
        end: { x: 15, y: 3 },
        thickness_m: 0.3,
      },
      {
        id: "wall-1",
        levelId: "level-0",
        exterior: true,
        start: { x: 15, y: 3 },
        end: { x: 15, y: 11 },
        thickness_m: 0.3,
      },
      {
        id: "wall-2",
        levelId: "level-0",
        exterior: true,
        start: { x: 15, y: 11 },
        end: { x: 3, y: 11 },
        thickness_m: 0.3,
      },
      {
        id: "wall-3",
        levelId: "level-0",
        exterior: true,
        start: { x: 3, y: 11 },
        end: { x: 3, y: 3 },
        thickness_m: 0.3,
      },
    ],
    openings: [
      {
        id: "door-0",
        levelId: "level-0",
        type: "door",
        position_m: { x: 9, y: 3 },
        width_m: 0.9,
        head_height_m: 2.1,
      },
      {
        id: "win-0",
        levelId: "level-0",
        type: "window",
        position_m: { x: 9, y: 11 },
        width_m: 1.2,
        head_height_m: 1.2,
      },
    ],
    rooms: [
      {
        id: "room-0",
        levelId: "level-0",
        name: "Living",
        actual_area_m2: 60,
        bbox: { min_x: 3, min_y: 3, max_x: 15, max_y: 11 },
        polygon: [
          { x: 3, y: 3 },
          { x: 15, y: 3 },
          { x: 15, y: 11 },
          { x: 3, y: 11 },
        ],
      },
    ],
    columns: [
      {
        id: "col-0",
        memberId: "COL-001",
        levelId: "level-0",
        type: "preliminary_column",
        position: { x: 6, y: 6 },
        width_m: 0.3,
        depth_m: 0.3,
      },
    ],
    beams: [
      {
        id: "bm-0",
        memberId: "BM-001",
        levelId: "level-0",
        type: "preliminary_beam",
        start: { x: 3, y: 6 },
        end: { x: 15, y: 6 },
      },
    ],
    roof_primitives: [
      {
        id: "roof-0",
        polygon: [
          { x: 3, y: 3 },
          { x: 15, y: 3 },
          { x: 15, y: 11 },
          { x: 3, y: 11 },
        ],
      },
    ],
  };
}

describe("Phase 2 — CAD/IFC handoff layer contract", () => {
  test("DXF carries architectural + structural + MEP layer names when both flags are enabled", () => {
    const compiledProject = fixtureCompiledProject();
    const model = buildCanonicalDrawingModelFromCompiledProject({
      compiledProject,
      structuralDrawingsEnabled: true,
      mepDrawingsEnabled: true,
    });
    const dxf = exportCanonicalDrawingModelToDXF({
      canonicalDrawingModel: model,
    });
    expect(typeof dxf).toBe("string");

    const expectedLayers = [
      // architectural
      "A-WALL",
      "A-DOOR",
      "A-WINDOW",
      // structural
      "S-FOUNDATION",
      "S-COLUMN",
      "S-BEAM",
      "S-SLAB",
      // MEP — electrical / plumbing / mechanical
      "E-LIGHT",
      "E-POWER",
      "P-WATER",
      "P-DRAIN",
      "M-DUCT",
      "M-VENT",
    ];

    for (const layer of expectedLayers) {
      // Each layer must appear in the DXF LAYER table (as a `LAYER` record).
      // The level-tag rename rule only affects A-* layers in floor_plan
      // views; S-/E-/P-/M- layers pass through unchanged so the bare name
      // is the canonical reference.
      expect(dxf).toContain(`\n${layer}\n`);
    }
  });

  test("DXF strips structural / MEP layers when their flags are off", () => {
    const compiledProject = fixtureCompiledProject();
    const model = buildCanonicalDrawingModelFromCompiledProject({
      compiledProject,
      structuralDrawingsEnabled: false,
      mepDrawingsEnabled: false,
    });
    const dxf = exportCanonicalDrawingModelToDXF({
      canonicalDrawingModel: model,
    });
    // No structural primitive entities → S-* / MEP-only entries should be
    // absent from the entities. We do not assert layer-table emptiness
    // because the registry may pre-declare layers; we assert the absence
    // of structural ENTITIES referencing them in the model space.
    const structuralEntityCount = (model.modelSpace?.entities || []).filter(
      (e) =>
        typeof e.layer === "string" &&
        (e.layer.startsWith("S-") ||
          e.layer.startsWith("E-") ||
          e.layer.startsWith("P-") ||
          e.layer.startsWith("M-")),
    ).length;
    expect(structuralEntityCount).toBe(0);
  });

  test("IFC export emits IfcColumn / IfcBeam / IfcDoor / IfcWindow / IfcBuildingStorey", () => {
    const compiledProject = fixtureCompiledProject();
    const ifc = exportCompiledProjectToIFC({
      compiledProject,
      structuralDrawingsEnabled: true,
      mepDrawingsEnabled: true,
    });
    expect(typeof ifc).toBe("string");
    expect(ifc).toContain("IFC4");
    expect(ifc).toContain("IFCPROJECT(");
    expect(ifc).toContain("IFCBUILDINGSTOREY(");
    expect(ifc).toContain("IFCWALL(");
    expect(ifc).toContain("IFCSLAB(");
    expect(ifc).toContain("IFCDOOR(");
    expect(ifc).toContain("IFCWINDOW(");
    expect(ifc).toContain("IFCCOLUMN(");
    expect(ifc).toContain("IFCBEAM(");
  });

  test("IFC IfcProject.Description carries STRUCTURAL_REVIEW_DISCLAIMER, MEP_REVIEW_DISCLAIMER + geometryHash when flags are enabled", () => {
    const compiledProject = fixtureCompiledProject();
    const ifc = exportCompiledProjectToIFC({
      compiledProject,
      structuralDrawingsEnabled: true,
      mepDrawingsEnabled: true,
    });
    // The Description is the second arg of IFCPROJECT after the GUID +
    // ownerHistory + Name. We do not parse IFC strictly — just assert the
    // text occurs in the IFCPROJECT line and the trailing comments.
    const projectLine = ifc
      .split("\n")
      .find((line) => line.startsWith("#") && line.includes("IFCPROJECT("));
    expect(projectLine).toBeTruthy();
    expect(projectLine).toContain("geometryHash=");
    expect(projectLine).toContain(compiledProject.geometryHash);
    // Trailing comment block always carries the disclaimers when flagged.
    expect(ifc).toContain(STRUCTURAL_REVIEW_DISCLAIMER);
    expect(ifc).toContain(MEP_REVIEW_DISCLAIMER);
  });

  test("IFC IfcProject.Description omits MEP_REVIEW_DISCLAIMER when MEP flag is off", () => {
    const compiledProject = fixtureCompiledProject();
    const ifc = exportCompiledProjectToIFC({
      compiledProject,
      structuralDrawingsEnabled: true,
      mepDrawingsEnabled: false,
    });
    expect(ifc).toContain(STRUCTURAL_REVIEW_DISCLAIMER);
    expect(ifc).not.toContain(MEP_REVIEW_DISCLAIMER);
  });

  test("IFC export still works when both flags are off (architectural-only fallback)", () => {
    const compiledProject = fixtureCompiledProject();
    const ifc = exportCompiledProjectToIFC({
      compiledProject,
      structuralDrawingsEnabled: false,
      mepDrawingsEnabled: false,
    });
    expect(ifc).toContain("IFCPROJECT(");
    expect(ifc).toContain("IFCWALL(");
    expect(ifc).toContain("IFCSLAB(");
    // Columns/beams not emitted when structural off.
    expect(ifc).not.toContain("IFCCOLUMN(");
    expect(ifc).not.toContain("IFCBEAM(");
    expect(ifc).not.toContain(STRUCTURAL_REVIEW_DISCLAIMER);
    expect(ifc).not.toContain(MEP_REVIEW_DISCLAIMER);
  });
});
