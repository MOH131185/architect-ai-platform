import { buildRuntimeProjectGeometryFromLayout } from "../../../services/compiler/runtimeProjectGeometryFromLayout.js";

describe("buildRuntimeProjectGeometryFromLayout", () => {
  test("promotes floor metadata into runtime project geometry with walls and openings", () => {
    const result = buildRuntimeProjectGeometryFromLayout({
      masterDNA: {
        designFingerprint: "layout-test",
        dimensions: {
          length: 12,
          width: 8,
          floors: 2,
          floorHeights: [3.1, 3.0],
        },
        styleDNA: {
          roof_language: "pitched gable",
        },
      },
      geometryMasks: {
        floorMetadata: {
          0: {
            rooms: [
              {
                name: "Living Room",
                type: "PUBLIC",
                zone: "public",
                polygon: [
                  { x: 0, y: 3 },
                  { x: 7, y: 3 },
                  { x: 7, y: 8 },
                  { x: 0, y: 8 },
                ],
                area: 35,
                computedArea: 35,
              },
              {
                name: "Kitchen",
                type: "SEMI_PUBLIC",
                zone: "service",
                polygon: [
                  { x: 7, y: 3 },
                  { x: 12, y: 3 },
                  { x: 12, y: 8 },
                  { x: 7, y: 8 },
                ],
                area: 25,
                computedArea: 25,
              },
            ],
            doors: [
              {
                roomName: "Living Room",
                position: { x: 6.9, y: 5.5 },
                width: 0.9,
                connectsTo: "circulation",
              },
              {
                roomName: "Entrance",
                position: { x: 3.2, y: 7.9 },
                width: 1.0,
                connectsTo: "circulation",
                isMainEntrance: true,
              },
            ],
            stairCore: {
              bbox: { x: 5.2, y: 0, width: 1.6, depth: 2.8 },
            },
          },
          1: {
            rooms: [
              {
                name: "Bedroom 1",
                type: "PRIVATE",
                zone: "private",
                polygon: [
                  { x: 0, y: 3 },
                  { x: 6, y: 3 },
                  { x: 6, y: 8 },
                  { x: 0, y: 8 },
                ],
                area: 30,
                computedArea: 30,
              },
            ],
            doors: [],
            stairCore: {
              bbox: { x: 5.2, y: 0, width: 1.6, depth: 2.8 },
            },
          },
        },
      },
    });

    expect(result).toBeTruthy();
    expect(result.metrics.levelCount).toBe(2);
    expect(result.metrics.roomCount).toBe(3);
    expect(result.metrics.wallCount).toBeGreaterThanOrEqual(8);
    expect(result.metrics.openingCount).toBeGreaterThanOrEqual(4);
    expect(result.projectGeometry.levels).toHaveLength(2);
    expect(
      result.projectGeometry.levels[0].doors.length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      result.projectGeometry.levels[0].windows.length,
    ).toBeGreaterThanOrEqual(2);
    expect(result.populatedGeometry.floors[0].walls.length).toBeGreaterThan(0);
    expect(
      result.projectGeometry.metadata.promoted_geometry_summary.room_count,
    ).toBe(3);
  });

  test("preserves site envelope while using the seeded building footprint", () => {
    const result = buildRuntimeProjectGeometryFromLayout({
      masterDNA: {
        designFingerprint: "layout-test-envelope",
        dimensions: {
          length: 12,
          width: 8,
          floors: 1,
        },
      },
      baseProjectGeometry: {
        site: {
          boundary_polygon: [
            { x: 0, y: 0 },
            { x: 30, y: 0 },
            { x: 30, y: 24 },
            { x: 0, y: 24 },
          ],
          buildable_polygon: [
            { x: 2, y: 2 },
            { x: 28, y: 2 },
            { x: 28, y: 22 },
            { x: 2, y: 22 },
          ],
          orientation_deg: 14,
          setbacks: { front: 5, rear: 4 },
          area_m2: 720,
        },
        metadata: {
          runtime_layout_seed: {
            footprint_polygon: [
              { x: 9, y: 8 },
              { x: 21, y: 8 },
              { x: 21, y: 16 },
              { x: 9, y: 16 },
            ],
          },
        },
      },
      geometryMasks: {
        floorMetadata: {
          0: {
            rooms: [
              {
                name: "Living Room",
                type: "PUBLIC",
                zone: "public",
                polygon: [
                  { x: 9, y: 8 },
                  { x: 15, y: 8 },
                  { x: 15, y: 16 },
                  { x: 9, y: 16 },
                ],
                area: 48,
                computedArea: 48,
              },
              {
                name: "Kitchen",
                type: "SEMI_PUBLIC",
                zone: "service",
                polygon: [
                  { x: 15, y: 8 },
                  { x: 21, y: 8 },
                  { x: 21, y: 16 },
                  { x: 15, y: 16 },
                ],
                area: 48,
                computedArea: 48,
              },
            ],
            doors: [],
            stairCore: null,
          },
        },
      },
    });

    expect(result.projectGeometry.site.boundary_polygon).toEqual([
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 30, y: 24 },
      { x: 0, y: 24 },
    ]);
    expect(result.projectGeometry.site.buildable_polygon).toEqual([
      { x: 2, y: 2 },
      { x: 28, y: 2 },
      { x: 28, y: 22 },
      { x: 2, y: 22 },
    ]);
    expect(result.projectGeometry.site.north_orientation_deg).toBe(14);
    expect(result.projectGeometry.levels[0].footprint).toEqual([
      { x: 9, y: 8 },
      { x: 21, y: 8 },
      { x: 21, y: 16 },
      { x: 9, y: 16 },
    ]);
    expect(result.projectGeometry.roof.polygon).toEqual([
      { x: 9, y: 8 },
      { x: 21, y: 8 },
      { x: 21, y: 16 },
      { x: 9, y: 16 },
    ]);
  });
});
