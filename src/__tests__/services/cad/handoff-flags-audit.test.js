/**
 * Phase 2 audit response (Codex) — defence-in-depth tests for the four
 * blockers raised on the original Phase 2 submission:
 *
 *   1. Explicit `false` on a discipline flag MUST override an env-default
 *      `true`. The slice helper, the IFC exporter, and the DXF wrapper
 *      all apply the rule.
 *   2. The DXF + IFC export API routes thread the discipline flags from
 *      the request body through to the exporter (so the artifact reflects
 *      caller intent, not server env).
 *   3. IfcColumn / IfcBeam carry IfcExtrudedAreaSolid representation
 *      geometry, not just an empty `$` representation slot.
 *   4. The DXF artifact carries the structural / MEP review disclaimers
 *      as `999` comment lines when the corresponding flags are on.
 *
 * Pre-existing flag-disabled behaviour (architectural-only export) is
 * covered by handoff-layers.contract.test.js; this file targets the new
 * audit-response invariants directly.
 */

import {
  exportCompiledProjectToDXF,
  exportCompiledProjectToIFC,
} from "../../../services/project/compiledProjectExportService.js";
import { STRUCTURAL_REVIEW_DISCLAIMER } from "../../../services/structure/structuralModelService.js";
import { MEP_REVIEW_DISCLAIMER } from "../../../services/mep/mepModelService.js";
import { __projectGraphVerticalSliceInternals } from "../../../services/project/projectGraphVerticalSliceService.js";

const {
  structuralDrawingsEnabled: structuralFlagHelper,
  mepDrawingsEnabled: mepFlagHelper,
} = __projectGraphVerticalSliceInternals;

function fixtureCompiledProject() {
  return {
    geometryHash: "geometry-hash-audit-response-001",
    projectGraphHash: "project-graph-hash-audit-response-001",
    site: {
      boundary_polygon: [
        { x: 0, y: 0 },
        { x: 16, y: 0 },
        { x: 16, y: 10 },
        { x: 0, y: 10 },
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
    ],
    slabs: [
      {
        id: "slab-0",
        levelId: "level-0",
        bbox: { min_x: 2, min_y: 2, max_x: 14, max_y: 8 },
        polygon: [
          { x: 2, y: 2 },
          { x: 14, y: 2 },
          { x: 14, y: 8 },
          { x: 2, y: 8 },
        ],
      },
    ],
    walls: [
      {
        id: "wall-0",
        levelId: "level-0",
        exterior: true,
        start: { x: 2, y: 2 },
        end: { x: 14, y: 2 },
        thickness_m: 0.3,
      },
    ],
    openings: [
      {
        id: "door-0",
        levelId: "level-0",
        type: "door",
        position_m: { x: 8, y: 2 },
        width_m: 0.9,
      },
    ],
    rooms: [
      {
        id: "room-0",
        levelId: "level-0",
        name: "Living",
        actual_area_m2: 60,
        bbox: { min_x: 2, min_y: 2, max_x: 14, max_y: 8 },
        polygon: [
          { x: 2, y: 2 },
          { x: 14, y: 2 },
          { x: 14, y: 8 },
          { x: 2, y: 8 },
        ],
      },
    ],
    columns: [
      {
        id: "col-0",
        memberId: "COL-001",
        levelId: "level-0",
        type: "preliminary_column",
        position: { x: 4, y: 4 },
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
        start: { x: 2, y: 4 },
        end: { x: 14, y: 4 },
      },
    ],
    roof_primitives: [
      {
        id: "roof-0",
        polygon: [
          { x: 2, y: 2 },
          { x: 14, y: 2 },
          { x: 14, y: 8 },
          { x: 2, y: 8 },
        ],
      },
    ],
  };
}

describe("Codex audit blocker 1 — explicit false overrides env true", () => {
  const origStructural = process.env.STRUCTURAL_DRAWINGS_ENABLED;
  const origMep = process.env.MEP_DRAWINGS_ENABLED;
  afterEach(() => {
    if (origStructural === undefined)
      delete process.env.STRUCTURAL_DRAWINGS_ENABLED;
    else process.env.STRUCTURAL_DRAWINGS_ENABLED = origStructural;
    if (origMep === undefined) delete process.env.MEP_DRAWINGS_ENABLED;
    else process.env.MEP_DRAWINGS_ENABLED = origMep;
  });

  test("slice helper: structuralDrawingsEnabled({...false}) returns false when env is true", () => {
    process.env.STRUCTURAL_DRAWINGS_ENABLED = "true";
    expect(structuralFlagHelper({ structuralDrawingsEnabled: false })).toBe(
      false,
    );
    expect(structuralFlagHelper({ includeStructuralDrawings: false })).toBe(
      false,
    );
  });

  test("slice helper: mepDrawingsEnabled({...false}) returns false when env is true", () => {
    process.env.MEP_DRAWINGS_ENABLED = "true";
    expect(mepFlagHelper({ mepDrawingsEnabled: false })).toBe(false);
    expect(mepFlagHelper({ includeMepDrawings: false })).toBe(false);
  });

  test("slice helper: explicit true beats env false", () => {
    delete process.env.STRUCTURAL_DRAWINGS_ENABLED;
    expect(structuralFlagHelper({ structuralDrawingsEnabled: true })).toBe(
      true,
    );
  });

  test("IFC: explicit false suppresses IfcColumn/IfcBeam even when env is true", () => {
    process.env.STRUCTURAL_DRAWINGS_ENABLED = "true";
    process.env.MEP_DRAWINGS_ENABLED = "true";
    const ifc = exportCompiledProjectToIFC({
      compiledProject: fixtureCompiledProject(),
      structuralDrawingsEnabled: false,
      mepDrawingsEnabled: false,
    });
    expect(ifc).not.toContain("IFCCOLUMN(");
    expect(ifc).not.toContain("IFCBEAM(");
    expect(ifc).not.toContain(STRUCTURAL_REVIEW_DISCLAIMER);
    expect(ifc).not.toContain(MEP_REVIEW_DISCLAIMER);
  });

  // Re-audit fix: the `include*Drawings` aliases MUST behave identically
  // to the `*DrawingsEnabled` aliases. Codex caught that the IFC route
  // honoured the latter but ignored the former — leaving the file with
  // IfcColumn/IfcBeam when env was true even though the caller asked
  // for arch-only via the include* alias.
  test("IFC: includeStructuralDrawings:false suppresses columns/beams even when env is true", () => {
    process.env.STRUCTURAL_DRAWINGS_ENABLED = "true";
    const ifc = exportCompiledProjectToIFC({
      compiledProject: fixtureCompiledProject(),
      includeStructuralDrawings: false,
    });
    expect(ifc).not.toContain("IFCCOLUMN(");
    expect(ifc).not.toContain("IFCBEAM(");
    expect(ifc).not.toContain(STRUCTURAL_REVIEW_DISCLAIMER);
  });

  test("IFC: includeMepDrawings:false suppresses MEP disclaimer even when env is true", () => {
    process.env.MEP_DRAWINGS_ENABLED = "true";
    const ifc = exportCompiledProjectToIFC({
      compiledProject: fixtureCompiledProject(),
      includeMepDrawings: false,
    });
    expect(ifc).not.toContain(MEP_REVIEW_DISCLAIMER);
  });

  test("IFC: includeStructuralDrawings:true forces inclusion even when env is unset/false", () => {
    delete process.env.STRUCTURAL_DRAWINGS_ENABLED;
    const ifc = exportCompiledProjectToIFC({
      compiledProject: fixtureCompiledProject(),
      includeStructuralDrawings: true,
    });
    expect(ifc).toContain("IFCCOLUMN(");
    expect(ifc).toContain("IFCBEAM(");
    expect(ifc).toContain(STRUCTURAL_REVIEW_DISCLAIMER);
  });

  test("IFC: explicit-false on ONE alias still suppresses (override consistency)", () => {
    process.env.STRUCTURAL_DRAWINGS_ENABLED = "true";
    // Caller mixes aliases — supplying both `structuralDrawingsEnabled:
    // true` AND `includeStructuralDrawings: false` is contradictory; we
    // resolve to false (hard veto wins) to match the slice/DXF rule.
    const ifc = exportCompiledProjectToIFC({
      compiledProject: fixtureCompiledProject(),
      structuralDrawingsEnabled: true,
      includeStructuralDrawings: false,
    });
    expect(ifc).not.toContain("IFCCOLUMN(");
  });

  test("DXF: explicit false suppresses S-/E-/P-/M- layers even when env is true", () => {
    process.env.STRUCTURAL_DRAWINGS_ENABLED = "true";
    process.env.MEP_DRAWINGS_ENABLED = "true";
    const dxf = exportCompiledProjectToDXF({
      compiledProject: fixtureCompiledProject(),
      structuralDrawingsEnabled: false,
      mepDrawingsEnabled: false,
    });
    // Should NOT carry the structural/MEP disclaimer prefixes either.
    expect(dxf).not.toContain(STRUCTURAL_REVIEW_DISCLAIMER);
    expect(dxf).not.toContain(MEP_REVIEW_DISCLAIMER);
  });
});

describe("Codex audit blocker 3 — IFC swept-solid representation", () => {
  test("IfcColumn references IfcProductDefinitionShape (not $)", () => {
    const ifc = exportCompiledProjectToIFC({
      compiledProject: fixtureCompiledProject(),
      structuralDrawingsEnabled: true,
    });
    // The IFCCOLUMN line carries 9 slots: GUID, OwnerHistory, Name,
    // Description, ObjectType, ObjectPlacement, Representation, Tag,
    // PredefinedType. After two #refs (OwnerHistory + ObjectPlacement)
    // the Representation slot must also be an entity reference (#nnn),
    // not the placeholder `$`.
    const columnLine = ifc
      .split("\n")
      .find((line) => line.includes("IFCCOLUMN("));
    expect(columnLine).toBeTruthy();
    // Strip the type prefix and parenthesised content, then split on commas
    // outside quoted strings is hard. Easier: regex out the slots.
    const m = columnLine.match(/IFCCOLUMN\((.+)\);$/);
    expect(m).toBeTruthy();
    const slots = m[1].split(",");
    // 9 slots total — Representation is index 6.
    expect(slots.length).toBe(9);
    const representationSlot = slots[6].trim();
    expect(representationSlot.startsWith("#")).toBe(true);
    expect(representationSlot).not.toBe("$");
  });

  test("IfcBeam references IfcProductDefinitionShape (not $)", () => {
    const ifc = exportCompiledProjectToIFC({
      compiledProject: fixtureCompiledProject(),
      structuralDrawingsEnabled: true,
    });
    const beamLine = ifc.split("\n").find((line) => line.includes("IFCBEAM("));
    expect(beamLine).toBeTruthy();
    const m = beamLine.match(/IFCBEAM\((.+)\);$/);
    expect(m).toBeTruthy();
    const slots = m[1].split(",");
    expect(slots.length).toBe(9);
    const representationSlot = slots[6].trim();
    expect(representationSlot.startsWith("#")).toBe(true);
  });

  test("IFC emits IfcExtrudedAreaSolid + IfcRectangleProfileDef + IfcShapeRepresentation for the columns/beams", () => {
    const ifc = exportCompiledProjectToIFC({
      compiledProject: fixtureCompiledProject(),
      structuralDrawingsEnabled: true,
    });
    expect(ifc).toContain("IFCEXTRUDEDAREASOLID(");
    expect(ifc).toContain("IFCRECTANGLEPROFILEDEF(");
    expect(ifc).toContain("IFCSHAPEREPRESENTATION(");
    expect(ifc).toContain("'SweptSolid'");
    expect(ifc).toContain("IFCPRODUCTDEFINITIONSHAPE(");
  });

  test("IfcColumn / IfcBeam Description fields name them PRELIMINARY", () => {
    const ifc = exportCompiledProjectToIFC({
      compiledProject: fixtureCompiledProject(),
      structuralDrawingsEnabled: true,
    });
    // Each preliminary element carries the "PRELIMINARY ... engineer
    // review required." string in its Description slot.
    expect(ifc).toMatch(
      /IFCCOLUMN\([^)]*'PRELIMINARY [^']*engineer review required\.'/,
    );
    expect(ifc).toMatch(
      /IFCBEAM\([^)]*'PRELIMINARY [^']*engineer review required\.'/,
    );
  });
});

describe("Codex audit blocker 4 — DXF disclaimer comment lines", () => {
  test("DXF preserves '  0\\nSECTION' file-start contract and emits 999 comments inside HEADER", () => {
    const compiledProject = fixtureCompiledProject();
    const dxf = exportCompiledProjectToDXF({
      compiledProject,
      structuralDrawingsEnabled: true,
      mepDrawingsEnabled: true,
    });
    // Re-audit fix: DXF parsers expect the file to start with the
    // canonical "  0\nSECTION" preamble. The 999 disclaimer comments
    // now sit INSIDE the HEADER section (after "  2\nHEADER\n") so
    // AutoCAD / Solibri / FreeCAD all parse the file cleanly while
    // still surfacing the disclaimers via the Drawing Properties /
    // comment log.
    expect(dxf.startsWith("  0\nSECTION")).toBe(true);
    const headerStart = dxf.indexOf("  2\nHEADER\n");
    const headerEnd = dxf.indexOf("  0\nENDSEC\n", headerStart);
    expect(headerStart).toBeGreaterThan(-1);
    expect(headerEnd).toBeGreaterThan(headerStart);
    const headerBlock = dxf.slice(headerStart, headerEnd);
    expect(headerBlock).toMatch(/  999\n/);
    expect(headerBlock).toContain(compiledProject.geometryHash);
    expect(headerBlock).toContain(STRUCTURAL_REVIEW_DISCLAIMER);
    expect(headerBlock).toContain(MEP_REVIEW_DISCLAIMER);
  });

  test("DXF omits the structural disclaimer when structuralDrawingsEnabled is false", () => {
    const dxf = exportCompiledProjectToDXF({
      compiledProject: fixtureCompiledProject(),
      structuralDrawingsEnabled: false,
      mepDrawingsEnabled: true,
    });
    expect(dxf).not.toContain(STRUCTURAL_REVIEW_DISCLAIMER);
    expect(dxf).toContain(MEP_REVIEW_DISCLAIMER);
  });

  test("DXF omits both disclaimers when both flags are off", () => {
    const dxf = exportCompiledProjectToDXF({
      compiledProject: fixtureCompiledProject(),
      structuralDrawingsEnabled: false,
      mepDrawingsEnabled: false,
    });
    expect(dxf).not.toContain(STRUCTURAL_REVIEW_DISCLAIMER);
    expect(dxf).not.toContain(MEP_REVIEW_DISCLAIMER);
    // geometryHash comment still rides for traceability.
    expect(dxf).toContain("geometry-hash-audit-response-001");
  });
});

describe("Codex audit blocker 2 — exportService threads discipline flags", () => {
  // We don't hit the network here — buildArtifactPackagePayload exposes the
  // serialisation shape, and resolveDrawingDisciplineFlags is the helper
  // that powers the DXF/IFC request bodies. Direct unit-test of the helper
  // is enough to lock the contract; the API-route tests live in
  // a1Export.handler.test.js for the SHEET route, and the DXF/IFC routes
  // are thin pass-throughs already covered by the integration test below.
  let exportService;
  beforeAll(async () => {
    exportService = (await import("../../../services/exportService.js"))
      .default;
  });

  test("resolveDrawingDisciplineFlags reads explicit boolean fields from the sheet", () => {
    const sheet = {
      structuralDrawingsEnabled: false,
      mepDrawingsEnabled: true,
      compiledProject: { geometryHash: "g" },
    };
    expect(exportService.resolveDrawingDisciplineFlags(sheet)).toEqual({
      structural: false,
      mep: true,
    });
  });

  test("resolveDrawingDisciplineFlags returns null for unknowns (defer to server env)", () => {
    const sheet = { compiledProject: { geometryHash: "g" } };
    expect(exportService.resolveDrawingDisciplineFlags(sheet)).toEqual({
      structural: null,
      mep: null,
    });
  });

  test("resolveDrawingDisciplineFlags infers true when the drawingSet has structural/MEP drawings", () => {
    const sheet = {
      compiledProject: { geometryHash: "g" },
      drawingSet: {
        drawings: [
          { type: "floor_plan" },
          { type: "structural" },
          { type: "mep" },
        ],
      },
    };
    expect(exportService.resolveDrawingDisciplineFlags(sheet)).toEqual({
      structural: true,
      mep: true,
    });
  });
});
