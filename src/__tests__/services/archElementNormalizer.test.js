import {
  buildCadSemanticIndex,
  normalizeArchitecturalGeometry,
} from "../../services/cad/archElementNormalizer.js";

describe("archElementNormalizer", () => {
  test("normalizes flat architectural elements into the internal schema", () => {
    const geometry = normalizeArchitecturalGeometry({
      project_id: "cad-demo",
      footprint: {
        id: "footprint-ground",
        points: [
          { x: 0, y: 0 },
          { x: 6, y: 0 },
          { x: 6, y: 4 },
          { x: 0, y: 4 },
        ],
      },
      elements: [
        {
          id: "wall-1",
          type: "LINE",
          semantic: "wall",
          level: "ground",
          start: { x: 0, y: 0 },
          end: { x: 6, y: 0 },
        },
        {
          id: "door-1",
          type: "ARC",
          semantic: "single_door",
          level: "ground",
          bbox: { x: 2, y: 0, width: 1, height: 1 },
        },
        {
          id: "room-1",
          type: "POLYLINE",
          semantic: "room",
          level: "ground",
          bbox: { x: 0, y: 0, width: 6, height: 4 },
        },
      ],
    });

    const semanticIndex = buildCadSemanticIndex(geometry);

    expect(geometry.project_id).toBe("cad-demo");
    expect(geometry.levels.length).toBeGreaterThan(0);
    expect(geometry.walls).toHaveLength(1);
    expect(geometry.doors).toHaveLength(1);
    expect(geometry.footprints).toHaveLength(1);
    expect(semanticIndex.wall).toBe(1);
    expect(semanticIndex.single_door).toBe(1);
  });
});
