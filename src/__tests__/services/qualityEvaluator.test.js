import { evaluateFloorPlan } from "../../services/qualityEvaluator.js";

function createSpatialGraph() {
  return {
    building: {
      floors: [
        {
          level: 0,
          height_m: 3,
          rooms: [
            {
              id: "hallway",
              type: "hallway",
              area_m2: 8,
              min_width_m: 1.2,
              min_length_m: 3,
              adjacencies: ["living_room", "kitchen", "bedroom_1", "bathroom"],
              orientation: "any",
              natural_light: false,
            },
            {
              id: "living_room",
              type: "living",
              area_m2: 20,
              min_width_m: 4,
              min_length_m: 4,
              adjacencies: ["hallway", "kitchen"],
              orientation: "south",
              natural_light: true,
            },
            {
              id: "kitchen",
              type: "kitchen",
              area_m2: 12,
              min_width_m: 3,
              min_length_m: 3,
              adjacencies: ["hallway", "living_room"],
              orientation: "east",
              natural_light: true,
            },
            {
              id: "bedroom_1",
              type: "bedroom",
              area_m2: 14,
              min_width_m: 3,
              min_length_m: 3,
              adjacencies: ["hallway"],
              orientation: "south",
              natural_light: true,
            },
            {
              id: "bathroom",
              type: "bathroom",
              area_m2: 6,
              min_width_m: 2.2,
              min_length_m: 2.2,
              adjacencies: ["hallway"],
              orientation: "any",
              natural_light: false,
            },
          ],
        },
      ],
      envelope: {
        width_m: 12,
        depth_m: 10,
      },
    },
  };
}

function createGoodLayout() {
  return {
    levels: [
      {
        index: 0,
        rooms: [
          { id: "hallway", x: 4, y: 0, width: 2, depth: 6 },
          {
            id: "living_room",
            x: 0,
            y: 0,
            width: 4,
            depth: 5,
            hasExternalWall: true,
          },
          {
            id: "kitchen",
            x: 0,
            y: 5,
            width: 4,
            depth: 3,
            hasExternalWall: true,
          },
          {
            id: "bedroom_1",
            x: 6,
            y: 0,
            width: 3.5,
            depth: 4,
            hasExternalWall: true,
          },
          {
            id: "bathroom",
            x: 6,
            y: 4,
            width: 2.4,
            depth: 2.5,
            hasExternalWall: false,
          },
        ],
      },
    ],
  };
}

describe("qualityEvaluator", () => {
  test("scores a coherent floor plan positively", () => {
    const score = evaluateFloorPlan(createSpatialGraph(), createGoodLayout());

    expect(score.total).toBeGreaterThanOrEqual(60);
    expect(score.grade).toMatch(/[AB]/);
    expect(score.explanations.length).toBeLessThan(3);
  });

  test("penalises broken adjacencies and light access", () => {
    const brokenLayout = createGoodLayout();
    brokenLayout.levels[0].rooms = brokenLayout.levels[0].rooms.map((room) => {
      if (room.id === "kitchen") {
        return { ...room, x: 9, y: 7, width: 2, depth: 2 };
      }
      if (room.id === "bedroom_1") {
        return { ...room, x: 2, y: 2, width: 1.2, depth: 6 };
      }
      return room;
    });

    const score = evaluateFloorPlan(createSpatialGraph(), brokenLayout);

    expect(score.total).toBeLessThan(60);
    expect(score.explanations.join(" ")).toContain("Adjacency");
  });
});
