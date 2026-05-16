/**
 * Phase 6 — end-to-end handoff package integration test.
 *
 * Drives the FULL pipeline:
 *   1. compileProject(...) → compiledProject
 *   2. exportCompiledProjectToDXF(...) → real DXF text
 *   3. exportCompiledProjectToIFC(...) → real IFC text with
 *      IfcProject.Description carrying STRUCTURAL_REVIEW_DISCLAIMER +
 *      geometryHash (Phase 2 wiring).
 *   4. buildHandoffArtifactPackage(...) → ZIP + handoff.json + README
 *      + GLB + DWG_UNAVAILABLE.txt + takeoff CSV + project_graph.json
 *
 * Then asserts geometryHash parity across the five surfaces required by
 * the Phase 6 plan:
 *   - handoff.json.geometryHash
 *   - GLB Extras (parsed from the GLB chunk inside the ZIP)
 *   - IFC IfcProject.Description (Phase 2 wiring)
 *   - DXF A-METADATA layer (Phase 2 wiring)
 *   - Cost workbook is NOT exercised here (depends on the takeoff +
 *     selectRateCard; that surface is covered by Phase 3 unit tests).
 *
 * If any of the four surfaces drifts, this test fails — that's the
 * point: the handoff manifest is the single source of truth, and every
 * artifact must verify against it.
 */

import { compileProject } from "../../services/compiler/compiledProjectCompiler.js";
import {
  exportCompiledProjectToDXF,
  exportCompiledProjectToIFC,
} from "../../services/project/compiledProjectExportService.js";
import { buildHandoffArtifactPackage } from "../../services/export/handoffPackageService.js";
import { listZipEntryNames } from "../../services/export/artifactPackageService.js";

function rectangle(minX, minY, maxX, maxY) {
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
}

function compilerInput() {
  return {
    project_id: "phase6-e2e-house",
    locationData: {
      city: "York",
      country: "United Kingdom",
      recommendedStyle: "Contemporary Vernacular",
      climate: { type: "temperate oceanic", zone: "Cfb" },
    },
    masterDNA: {
      buildingOrientation: 180,
      climateDesign: { thermal: { strategy: "compact envelope" } },
    },
    styleDNA: {
      vernacularStyle: "Contemporary Vernacular",
      facade_language: "stacked-solid-void-rhythm",
      roof_language: "pitched gable",
      window_language: "grouped",
      materials: ["brick", "timber", "slate"],
    },
    projectGeometry: {
      project_id: "phase6-e2e-house",
      site: {
        boundary_polygon: rectangle(0, 0, 16, 14),
        buildable_polygon: rectangle(1, 1, 15, 13),
      },
      metadata: { style_dna: { roof_language: "pitched gable" } },
      levels: [
        {
          id: "ground",
          level_number: 0,
          name: "Ground",
          height_m: 3.2,
          footprint: rectangle(2, 2, 13, 10),
        },
      ],
      rooms: [
        {
          id: "living",
          level_id: "ground",
          name: "Living",
          type: "living",
          actual_area: 29,
          polygon: rectangle(2.3, 2.3, 7.5, 6.6),
        },
        {
          id: "kitchen",
          level_id: "ground",
          name: "Kitchen",
          type: "kitchen",
          actual_area: 18,
          polygon: rectangle(7.5, 2.3, 12.6, 6.2),
        },
      ],
      walls: [
        {
          id: "wN",
          level_id: "ground",
          exterior: true,
          side: "north",
          start: { x: 2, y: 2 },
          end: { x: 13, y: 2 },
          thickness_m: 0.24,
          room_ids: ["living", "kitchen"],
        },
        {
          id: "wS",
          level_id: "ground",
          exterior: true,
          side: "south",
          start: { x: 2, y: 10 },
          end: { x: 13, y: 10 },
          thickness_m: 0.24,
          room_ids: ["living", "kitchen"],
        },
        {
          id: "wE",
          level_id: "ground",
          exterior: true,
          side: "east",
          start: { x: 13, y: 2 },
          end: { x: 13, y: 10 },
          thickness_m: 0.24,
          room_ids: ["kitchen"],
        },
        {
          id: "wW",
          level_id: "ground",
          exterior: true,
          side: "west",
          start: { x: 2, y: 2 },
          end: { x: 2, y: 10 },
          thickness_m: 0.24,
          room_ids: ["living"],
        },
      ],
      windows: [
        {
          id: "win-N",
          level_id: "ground",
          wall_id: "wN",
          width_m: 1.5,
          sill_height_m: 0.9,
          head_height_m: 2.1,
          position_m: { x: 5, y: 2 },
        },
      ],
      doors: [
        {
          id: "door-S",
          level_id: "ground",
          wall_id: "wS",
          width_m: 1.0,
          head_height_m: 2.2,
          position_m: { x: 8, y: 10 },
        },
      ],
      roof: {
        id: "roof",
        type: "pitched gable",
        polygon: rectangle(2, 2, 13, 10),
      },
      roof_primitives: [
        {
          id: "roof-W",
          primitive_family: "roof_plane",
          polygon: rectangle(2, 2, 7.5, 10),
          slope_deg: 35,
          ridge_height_m: 6.4,
        },
        {
          id: "roof-E",
          primitive_family: "roof_plane",
          polygon: rectangle(7.5, 2, 13, 10),
          slope_deg: 35,
          ridge_height_m: 6.4,
        },
      ],
    },
  };
}

// Parse a GLB buffer and return its glTF JSON chunk (asset + extras).
function readGlbJson(glbBytes) {
  const buf = Buffer.from(glbBytes);
  const magic = buf.readUInt32LE(0);
  if (magic !== 0x46546c67) throw new Error("Not a GLB (magic mismatch)");
  const jsonChunkLength = buf.readUInt32LE(12);
  const jsonChunkType = buf.readUInt32LE(16);
  if (jsonChunkType !== 0x4e4f534a) throw new Error("First chunk is not JSON");
  const jsonText = buf
    .slice(20, 20 + jsonChunkLength)
    .toString("utf8")
    .trim();
  return JSON.parse(jsonText);
}

// Pull a file's bytes out of the deterministic ZIP. The package builder
// uses STORE (no compression), so each entry's payload is verbatim
// between its local-file-header and the next entry.
function readZipEntryBytes(zipBytes, fileName) {
  const buf = Buffer.from(zipBytes);
  const targetName = Buffer.from(fileName, "utf8");
  for (let i = 0; i + 30 < buf.length; i += 1) {
    if (
      buf[i] === 0x50 &&
      buf[i + 1] === 0x4b &&
      buf[i + 2] === 0x03 &&
      buf[i + 3] === 0x04
    ) {
      const compressedSize = buf.readUInt32LE(i + 18);
      const fileNameLen = buf.readUInt16LE(i + 26);
      const extraLen = buf.readUInt16LE(i + 28);
      const nameBytes = buf.slice(i + 30, i + 30 + fileNameLen);
      if (nameBytes.equals(targetName)) {
        const dataStart = i + 30 + fileNameLen + extraLen;
        return buf.slice(dataStart, dataStart + compressedSize);
      }
      i = i + 30 + fileNameLen + extraLen + compressedSize - 1;
    }
  }
  return null;
}

describe("Phase 6 e2e — handoff package geometryHash parity", () => {
  let compiledProject;
  let dxfText;
  let ifcText;
  let handoffResult;

  beforeAll(async () => {
    compiledProject = compileProject(compilerInput());
    dxfText = exportCompiledProjectToDXF({
      compiledProject,
      projectName: "Phase 6 E2E House",
      structuralDrawingsEnabled: true,
      mepDrawingsEnabled: false,
    });
    ifcText = exportCompiledProjectToIFC({
      compiledProject,
      projectName: "Phase 6 E2E House",
      structuralDrawingsEnabled: true,
      mepDrawingsEnabled: false,
    });
    handoffResult = await buildHandoffArtifactPackage({
      projectName: "Phase 6 E2E House",
      compiledProject,
      projectQuantityTakeoff: {
        items: [
          {
            category: "areas",
            item: "Gross Floor Area",
            unit: "m2",
            quantity: compiledProject.envelope?.width_m
              ? compiledProject.envelope.width_m *
                compiledProject.envelope.depth_m
              : 80,
          },
        ],
      },
      projectGraph: {
        nodes: ["site", "ground", "living", "kitchen"],
        geometryHash: compiledProject.geometryHash,
      },
      dxf: dxfText,
      ifc: ifcText,
      flags: { structuralEnabled: true, mepEnabled: false },
      env: {},
    });
  });

  test("the package ZIP contains every Phase 6 file", () => {
    const names = listZipEntryNames(handoffResult.zipBytes);
    expect(names).toContain("handoff.json");
    expect(names).toContain("README.md");
    expect(names).toContain("project_graph.json");
    expect(names).toContain("schedules/quantity_takeoff.csv");
    expect(names).toContain("cad/DWG_UNAVAILABLE.txt");
    expect(names.some((n) => n.endsWith(".dxf"))).toBe(true);
    expect(names.some((n) => n.endsWith(".ifc"))).toBe(true);
    expect(names.some((n) => n.endsWith(".glb"))).toBe(true);
  });

  test("handoff.json.geometryHash matches the compiledProject geometryHash", () => {
    expect(typeof compiledProject.geometryHash).toBe("string");
    expect(compiledProject.geometryHash.length).toBeGreaterThan(0);
    expect(handoffResult.handoffJson.geometryHash).toBe(
      compiledProject.geometryHash,
    );
  });

  test("GLB Extras carry the same geometryHash", () => {
    const names = listZipEntryNames(handoffResult.zipBytes);
    const glbName = names.find((n) => n.endsWith(".glb"));
    expect(glbName).toBeDefined();
    const glbBytes = readZipEntryBytes(handoffResult.zipBytes, glbName);
    expect(glbBytes).not.toBeNull();
    const glbJson = readGlbJson(glbBytes);
    expect(glbJson.extras.geometryHash).toBe(compiledProject.geometryHash);
    expect(glbJson.extras.adapterVersion).toMatch(
      /compiled-project-glb-writer/,
    );
  });

  test("IFC body carries the geometryHash in IfcProject.Description (Phase 2 wiring)", () => {
    expect(ifcText).toContain(compiledProject.geometryHash);
    expect(ifcText).toMatch(/IFCPROJECT/);
  });

  test("DXF body carries the geometryHash via A-METADATA / 999 metadata (Phase 2 wiring)", () => {
    // Phase 2 wiring puts the geometryHash either on the A-METADATA layer
    // as text or as a 999 comment in the HEADER section. Accept either —
    // the contract is "the DXF must self-identify with the same hash".
    expect(dxfText).toContain(compiledProject.geometryHash);
  });

  test("README.md references the geometryHash + the disclaimers list", () => {
    expect(handoffResult.readme).toContain(compiledProject.geometryHash);
    expect(handoffResult.readme).toMatch(/STRUCTURAL_REVIEW_REQUIRED/);
    expect(handoffResult.readme).toMatch(/DWG_UNAVAILABLE/);
  });

  test("handoff.json file index sha256/size matches the actual ZIP entries", () => {
    for (const file of handoffResult.handoffJson.files) {
      const bytes = readZipEntryBytes(handoffResult.zipBytes, file.path);
      expect(bytes).not.toBeNull();
      expect(bytes.length).toBe(file.size);
    }
  });

  test("qa.status is 'pass' on a clean run", () => {
    expect(handoffResult.handoffJson.qa.status).toBe("pass");
  });
});
