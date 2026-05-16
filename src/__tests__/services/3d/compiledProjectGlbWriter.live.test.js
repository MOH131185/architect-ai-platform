/**
 * Phase 5 — Codex audit follow-up.
 *
 * Drives the GLB writer with a REAL compileProject(...) result so we
 * catch any future drift between the compiler output schema and the GLB
 * writer reader. Codex's Phase 5 audit caught the writer reading
 * `doors`/`windows`/`footprints`/`roof_primitives` while the compiler
 * emits `openings`/`slabs`/`levels[].footprint`/`roof.{planes,ridges,…}`.
 *
 * Asserts wall + slab + opening + roof meshes ALL appear in the output —
 * not just walls — so the GLB is a meaningful handoff artifact, not a
 * tabletop.
 */

import { compileProject } from "../../../services/compiler/compiledProjectCompiler.js";
import { buildCompiledProjectGlb } from "../../../services/3d/compiledProjectGlbWriter.js";

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
    project_id: "phase5-live-glb-house",
    locationData: {
      city: "York",
      region: "North Yorkshire",
      country: "United Kingdom",
      recommendedStyle: "Contemporary Vernacular",
      localMaterials: ["brick", "timber"],
      climate: { type: "temperate oceanic", zone: "Cfb" },
      optimalOrientation: 180,
    },
    materialPriority: { primary: "brick", secondary: "timber" },
    masterDNA: {
      buildingOrientation: 180,
      climateDesign: {
        thermal: { strategy: "compact insulated envelope" },
        solar: { shading: "moderate seasonal shading" },
        ventilation: { strategy: "cross ventilation" },
      },
    },
    styleDNA: {
      vernacularStyle: "Contemporary Vernacular",
      facade_language: "stacked-solid-void-rhythm",
      roof_language: "pitched gable",
      window_language: "grouped",
      roof_material: "slate",
      materials: ["brick", "timber", "slate"],
    },
    projectGeometry: {
      project_id: "phase5-live-glb-house",
      site: {
        boundary_bbox: { min_x: 0, min_y: 0, max_x: 16, max_y: 14 },
        buildable_bbox: { min_x: 1, min_y: 1, max_x: 15, max_y: 13 },
        boundary_polygon: rectangle(0, 0, 16, 14),
        buildable_polygon: rectangle(1, 1, 15, 13),
      },
      metadata: {
        style_dna: {
          facade_language: "stacked-solid-void-rhythm",
          roof_language: "pitched gable",
        },
      },
      levels: [
        {
          id: "ground",
          level_number: 0,
          name: "Ground Floor",
          height_m: 3.2,
          footprint: rectangle(2, 2, 13, 10),
        },
        {
          id: "first",
          level_number: 1,
          name: "First Floor",
          height_m: 3.0,
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
        {
          id: "bed-1",
          level_id: "first",
          name: "Bedroom 1",
          type: "bedroom",
          actual_area: 21,
          polygon: rectangle(2.3, 2.3, 7.2, 6.8),
        },
      ],
      walls: [
        {
          id: "wall-N",
          level_id: "ground",
          exterior: true,
          side: "north",
          start: { x: 2, y: 2 },
          end: { x: 13, y: 2 },
          thickness_m: 0.24,
          room_ids: ["living", "kitchen"],
        },
        {
          id: "wall-S",
          level_id: "ground",
          exterior: true,
          side: "south",
          start: { x: 2, y: 10 },
          end: { x: 13, y: 10 },
          thickness_m: 0.24,
          room_ids: ["living", "kitchen"],
        },
        {
          id: "wall-E",
          level_id: "ground",
          exterior: true,
          side: "east",
          start: { x: 13, y: 2 },
          end: { x: 13, y: 10 },
          thickness_m: 0.24,
          room_ids: ["kitchen"],
        },
        {
          id: "wall-W",
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
          id: "window-N",
          level_id: "ground",
          wall_id: "wall-N",
          width_m: 1.8,
          sill_height_m: 0.9,
          head_height_m: 2.1,
          position_m: { x: 4.8, y: 2 },
          room_ids: ["living"],
        },
      ],
      doors: [
        {
          id: "door-main",
          level_id: "ground",
          wall_id: "wall-S",
          width_m: 1.0,
          head_height_m: 2.2,
          position_m: { x: 8.7, y: 10 },
          swing: "left-in",
        },
      ],
      roof: {
        id: "roof-main",
        type: "pitched gable",
        polygon: rectangle(2, 2, 13, 10),
      },
      roof_primitives: [
        {
          id: "roof-plane-west",
          primitive_family: "roof_plane",
          polygon: rectangle(2, 2, 7.5, 10),
          slope_deg: 35,
          eave_depth_m: 0.6,
        },
        {
          id: "roof-plane-east",
          primitive_family: "roof_plane",
          polygon: rectangle(7.5, 2, 13, 10),
          slope_deg: 35,
          eave_depth_m: 0.6,
        },
        {
          id: "ridge-main",
          primitive_family: "ridge",
          start: { x: 7.5, y: 2 },
          end: { x: 7.5, y: 10 },
          ridge_height_m: 3.4,
        },
      ],
    },
  };
}

describe("compiledProjectGlbWriter — live compileProject integration", () => {
  let compiled;
  let glbResult;

  beforeAll(() => {
    compiled = compileProject(compilerInput());
    glbResult = buildCompiledProjectGlb(compiled);
  });

  test("compileProject produced the post-Phase-5 schema we expect", () => {
    expect(Array.isArray(compiled.walls)).toBe(true);
    expect(compiled.walls.length).toBeGreaterThan(0);
    expect(Array.isArray(compiled.openings)).toBe(true);
    expect(compiled.openings.length).toBeGreaterThan(0);
    expect(Array.isArray(compiled.slabs)).toBe(true);
    expect(compiled.slabs.length).toBeGreaterThan(0);
    expect(Array.isArray(compiled.levels)).toBe(true);
    expect(compiled.levels[0]?.footprint?.polygon).toBeDefined();
    expect(compiled.roof.planes.length).toBeGreaterThan(0);
  });

  test("GLB writer produces wall + slab + opening + roof meshes (not walls only)", () => {
    expect(glbResult.ok).toBe(true);
    expect(glbResult.meshCount).toBeGreaterThan(0);
    const kinds = new Set(glbResult.meshKinds || []);
    expect(kinds.has("wall")).toBe(true);
    expect(kinds.has("slab")).toBe(true);
    expect(kinds.has("door") || kinds.has("window")).toBe(true);
    expect(kinds.has("roof")).toBe(true);
  });

  test("GLB carries the compiled geometryHash in glTF Extras", () => {
    expect(typeof compiled.geometryHash).toBe("string");
    expect(compiled.geometryHash.length).toBeGreaterThan(0);
    expect(glbResult.geometryHash).toBe(compiled.geometryHash);
    // Decode the JSON chunk and assert it surfaces in Extras too.
    const jsonChunkLength = glbResult.glb.readUInt32LE(12);
    const parsed = JSON.parse(
      glbResult.glb
        .slice(20, 20 + jsonChunkLength)
        .toString("utf8")
        .trim(),
    );
    expect(parsed.extras.geometryHash).toBe(compiled.geometryHash);
    expect(parsed.extras.meshKinds).toEqual(glbResult.meshKinds);
  });

  test("mesh count is consistent with compiled primitive counts", () => {
    const expectedMinimum =
      compiled.walls.length +
      compiled.slabs.length +
      compiled.openings.length +
      compiled.roof.planes.length;
    expect(glbResult.meshCount).toBeGreaterThanOrEqual(expectedMinimum);
  });
});
