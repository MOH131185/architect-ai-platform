/**
 * Smoke test for the quantity-takeoff wiring inside the ProjectGraph
 * vertical slice. We don't run the full pipeline — that requires OpenAI
 * and many other live providers. Instead, we verify the contract that
 * the takeoff helper consumes the same compiledProject shape the slice
 * exposes via artifacts.compiledProject and that the resulting takeoff
 * carries the items the export manifest gates on.
 */

import { buildProjectQuantityTakeoff } from "../../services/project/projectQuantityTakeoffService.js";
import { buildClientExportManifest } from "../../services/export/buildClientExportManifest.js";

function compiledFixture() {
  return {
    geometryHash: "vs-fixture-geom-hash-001",
    metadata: { source: "test-fixture", buildingType: "residential" },
    site: { area_m2: 200 },
    footprint: {
      polygon: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 8 },
        { x: 0, y: 8 },
      ],
      area_m2: 80,
    },
    levels: [
      { id: "L0", elevation_m: 0, height_m: 3, name: "Ground" },
      { id: "L1", elevation_m: 3, height_m: 3, name: "First" },
    ],
    walls: [
      {
        id: "w1",
        levelId: "L0",
        exterior: true,
        start: { x: 0, y: 0 },
        end: { x: 10, y: 0 },
        length_m: 10,
        height_m: 3,
      },
      {
        id: "w2",
        levelId: "L0",
        exterior: true,
        start: { x: 10, y: 0 },
        end: { x: 10, y: 8 },
        length_m: 8,
        height_m: 3,
      },
    ],
    slabs: [{ id: "s1", levelId: "L0", area_m2: 80 }],
    rooms: [{ id: "r1", levelId: "L0", actual_area_m2: 80, name: "Studio" }],
    openings: [
      {
        id: "win1",
        levelId: "L0",
        type: "window",
        width_m: 1.2,
        head_height_m: 1.5,
      },
      {
        id: "d1",
        levelId: "L0",
        type: "door",
        width_m: 0.9,
        head_height_m: 2.1,
      },
    ],
    stairs: [],
  };
}

describe("vertical-slice quantity takeoff", () => {
  test("buildProjectQuantityTakeoff emits items for an Office-Studio-sized compiledProject", () => {
    const takeoff = buildProjectQuantityTakeoff(compiledFixture(), {
      pipelineVersion: "project-graph-vertical-slice-v1",
    });
    expect(takeoff.schema_version).toBe("project-quantity-takeoff-v1");
    expect(takeoff.geometryHash).toBe("vs-fixture-geom-hash-001");
    expect(Array.isArray(takeoff.items)).toBe(true);
    expect(takeoff.items.length).toBeGreaterThan(0);
    expect(takeoff.summary.grossFloorAreaM2).toBeGreaterThan(0);
  });

  test("XLSX becomes READY in the client manifest once the takeoff is attached", () => {
    const compiledProject = compiledFixture();
    const takeoff = buildProjectQuantityTakeoff(compiledProject, {
      pipelineVersion: "project-graph-vertical-slice-v1",
    });

    const beforeManifest = buildClientExportManifest({
      compiledProject,
      projectQuantityTakeoff: null,
    });
    expect(beforeManifest.exports.xlsx.available).toBe(false);
    expect(beforeManifest.exports.xlsx.blockedReason).toBe(
      "QUANTITY_TAKEOFF_UNAVAILABLE",
    );

    const afterManifest = buildClientExportManifest({
      compiledProject,
      projectQuantityTakeoff: takeoff,
    });
    expect(afterManifest.exports.xlsx.available).toBe(true);
    expect(afterManifest.exports.xlsx.blockedReason).toBeUndefined();
  });
});
