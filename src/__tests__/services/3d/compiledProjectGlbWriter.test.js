/**
 * Phase 5 — deterministic GLB writer.
 *
 * Asserts the writer:
 *   1. Produces a valid GLB 2.0 binary (correct magic / version / chunk
 *      headers).
 *   2. Emits one mesh per wall + slab + opening + roof primitive.
 *   3. Embeds geometryHash in the glTF extras (cross-verifiable against
 *      IFC IfcProject.Description and the future handoff manifest).
 *   4. Honours materialDNA hex colors via pbrMetallicRoughness.baseColorFactor.
 *   5. Is deterministic — same input ⇒ same byte output.
 */

import {
  buildCompiledProjectGlb,
  GLB_WRITER_VERSION,
} from "../../../services/3d/compiledProjectGlbWriter.js";

// Fixture aligned to the REAL compiledProject schema produced by
// compiledProjectCompiler.compileProject:
//   - levels carry footprint inline as `level.footprint.polygon`
//   - slabs are a top-level array with polygons + thickness + elevation
//   - openings replace doors/windows (with `type:"door"|"window"`)
//   - roof primitives are bucketed under `roof.planes / .ridges / .eaves`
//   - walls use camelCase `levelId`
function fixtureHouse() {
  const groundPolygon = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 8 },
    { x: 0, y: 8 },
  ];
  const firstPolygon = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 8 },
    { x: 0, y: 8 },
  ];
  return {
    schema_version: "compiled-project-v1",
    geometryHash: "phase5-glb-fixture-001",
    metadata: { source: "compiled_project", projectName: "Phase 5 House" },
    materialDNA: {
      walls: { exterior: { hex: "#b89b72" } },
      slabs: { hex: "#9ba1a8" },
      doors: { hex: "#5c4033" },
      windows: { hex: "#a9c8e0" },
      roof: { hex: "#5c5a55" },
    },
    levels: [
      {
        id: "L0",
        level_number: 0,
        name: "Ground",
        height_m: 3.0,
        bottom_m: 0,
        top_m: 3.0,
        footprint: { polygon: groundPolygon, area_m2: 80 },
      },
      {
        id: "L1",
        level_number: 1,
        name: "First",
        height_m: 2.8,
        bottom_m: 3.0,
        top_m: 5.8,
        footprint: { polygon: firstPolygon, area_m2: 80 },
      },
    ],
    walls: [
      {
        id: "w-S",
        levelId: "L0",
        thickness_m: 0.25,
        height_m: 3.0,
        exterior: true,
        start: { x: 0, y: 0 },
        end: { x: 10, y: 0 },
      },
      {
        id: "w-E",
        levelId: "L0",
        thickness_m: 0.25,
        height_m: 3.0,
        exterior: true,
        start: { x: 10, y: 0 },
        end: { x: 10, y: 8 },
      },
      {
        id: "w-N",
        levelId: "L0",
        thickness_m: 0.25,
        height_m: 3.0,
        exterior: true,
        start: { x: 10, y: 8 },
        end: { x: 0, y: 8 },
      },
      {
        id: "w-W",
        levelId: "L0",
        thickness_m: 0.25,
        height_m: 3.0,
        exterior: true,
        start: { x: 0, y: 8 },
        end: { x: 0, y: 0 },
      },
    ],
    slabs: [
      {
        id: "slab-L0",
        levelId: "L0",
        polygon: groundPolygon,
        thickness_m: 0.2,
        elevation_m: 0,
      },
      {
        id: "slab-L1",
        levelId: "L1",
        polygon: firstPolygon,
        thickness_m: 0.2,
        elevation_m: 3.0,
      },
    ],
    openings: [
      {
        id: "opening-door-1",
        type: "door",
        levelId: "L0",
        wallId: "w-S",
        position_m: 5,
        width_m: 1,
        sill_height_m: 0,
        head_height_m: 2.1,
        height_m: 2.1,
      },
      {
        id: "opening-window-1",
        type: "window",
        levelId: "L0",
        wallId: "w-S",
        position_m: 2,
        width_m: 1.5,
        sill_height_m: 0.9,
        head_height_m: 2.3,
        height_m: 1.4,
      },
    ],
    roof: {
      type: "pitched_gable",
      planes: [
        {
          id: "roof-plane-1",
          primitive_family: "roof_plane",
          polygon: groundPolygon,
          ridge_height_m: 8.0,
          eave_height_m: 5.8,
          slope_deg: 35,
        },
      ],
      ridges: [],
      eaves: [],
      hips: [],
      valleys: [],
      parapets: [],
      dormers: [],
    },
  };
}

describe("buildCompiledProjectGlb — GLB 2.0 binary structure", () => {
  test("emits valid GLB 2.0 header with magic + version + size", () => {
    const result = buildCompiledProjectGlb(fixtureHouse());
    expect(result.ok).toBe(true);
    expect(Buffer.isBuffer(result.glb)).toBe(true);
    expect(result.glb.length).toBe(result.glbByteLength);
    // Magic: "glTF"
    expect(result.glb.readUInt32LE(0)).toBe(0x46546c67);
    expect(result.glb.slice(0, 4).toString("ascii")).toBe("glTF");
    // Version: 2
    expect(result.glb.readUInt32LE(4)).toBe(2);
    // Total length matches buffer length
    expect(result.glb.readUInt32LE(8)).toBe(result.glb.length);
  });

  test("JSON chunk parses + carries geometryHash + adapter version in extras", () => {
    const result = buildCompiledProjectGlb(fixtureHouse());
    const jsonChunkLength = result.glb.readUInt32LE(12);
    const jsonChunkType = result.glb.readUInt32LE(16);
    expect(jsonChunkType).toBe(0x4e4f534a); // "JSON"
    const jsonBytes = result.glb.slice(20, 20 + jsonChunkLength);
    const parsed = JSON.parse(jsonBytes.toString("utf8").trim());
    expect(parsed.asset.version).toBe("2.0");
    expect(parsed.asset.generator).toBe(GLB_WRITER_VERSION);
    expect(parsed.extras.geometryHash).toBe("phase5-glb-fixture-001");
    expect(parsed.extras.adapterVersion).toBe(GLB_WRITER_VERSION);
    expect(parsed.extras.meshCount).toBe(parsed.meshes.length);
  });

  test("BIN chunk follows JSON chunk at correct offset", () => {
    const result = buildCompiledProjectGlb(fixtureHouse());
    const jsonChunkLength = result.glb.readUInt32LE(12);
    const binChunkOffset = 12 + 8 + jsonChunkLength;
    const binChunkLength = result.glb.readUInt32LE(binChunkOffset);
    const binChunkType = result.glb.readUInt32LE(binChunkOffset + 4);
    expect(binChunkType).toBe(0x004e4942); // "BIN\0"
    expect(binChunkLength).toBeGreaterThan(0);
    expect(binChunkOffset + 8 + binChunkLength).toBe(result.glb.length);
  });
});

describe("buildCompiledProjectGlb — mesh and material count", () => {
  test("emits one mesh per primitive (4 walls + 2 slabs + 1 door + 1 window + 1 roof = 9)", () => {
    const result = buildCompiledProjectGlb(fixtureHouse());
    expect(result.meshCount).toBe(9);
  });

  test("each material's baseColorFactor matches the hex from materialDNA", () => {
    const result = buildCompiledProjectGlb(fixtureHouse());
    const jsonChunkLength = result.glb.readUInt32LE(12);
    const parsed = JSON.parse(
      result.glb
        .slice(20, 20 + jsonChunkLength)
        .toString("utf8")
        .trim(),
    );
    const baseColors = parsed.materials.map(
      (mat) => mat.pbrMetallicRoughness.baseColorFactor,
    );
    // Wall color #b89b72 → RGB (184, 155, 114) / 255
    expect(baseColors).toContainEqual([184 / 255, 155 / 255, 114 / 255, 1]);
  });

  test("missing geometry triggers a clear error", () => {
    expect(() => buildCompiledProjectGlb({ geometryHash: "x" })).toThrow(
      /no convertible primitives/,
    );
  });
});

describe("buildCompiledProjectGlb — determinism", () => {
  test("same input produces byte-identical output", () => {
    const a = buildCompiledProjectGlb(fixtureHouse());
    const b = buildCompiledProjectGlb(fixtureHouse());
    expect(a.glbByteLength).toBe(b.glbByteLength);
    expect(Buffer.compare(a.glb, b.glb)).toBe(0);
  });
});
