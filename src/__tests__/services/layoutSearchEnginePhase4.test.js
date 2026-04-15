import {
  buildBoundingBoxFromRect,
  rectangleToPolygon,
} from "../../services/cad/projectGeometrySchema.js";
import { buildAdjacencyGraph } from "../../services/floorplan/adjacencyGraphBuilder.js";
import { searchDeterministicLayouts } from "../../services/floorplan/layoutSearchEngine.js";

function room(id, x, y, width, height, extras = {}) {
  return {
    id,
    name: id,
    type: "room",
    requires_daylight: true,
    wet_zone: false,
    bbox: buildBoundingBoxFromRect(x, y, width, height),
    polygon: rectangleToPolygon(x, y, width, height),
    centroid: {
      x: x + width / 2,
      y: y + height / 2,
    },
    ...extras,
  };
}

describe("layoutSearchEngine Phase 4", () => {
  test("selects the highest-scoring deterministic candidate", () => {
    const program = [
      {
        id: "living",
        name: "Living Room",
        type: "living_room",
        adjacency_preferences: [
          { target: "kitchen", weight: 1, type: "preferred" },
        ],
      },
      {
        id: "kitchen",
        name: "Kitchen",
        type: "kitchen",
        wet_zone: true,
        adjacency_preferences: [
          { target: "living", weight: 1, type: "preferred" },
        ],
      },
    ];
    const context = {
      adjacencyGraph: buildAdjacencyGraph(program),
    };
    const buildableBbox = buildBoundingBoxFromRect(0, 0, 12, 8);
    const candidateBuilder = (strategy = {}) => {
      if (strategy.id === "good-adjacent") {
        return {
          candidate_id: strategy.id,
          buildable_bbox: buildableBbox,
          levels: [
            {
              level_number: 0,
              rooms: [
                room("living", 0, 0, 6, 4),
                room("kitchen", 6, 0, 4, 4, { wet_zone: true }),
              ],
            },
          ],
        };
      }

      return {
        candidate_id: strategy.id,
        buildable_bbox: buildableBbox,
        levels: [
          {
            level_number: 0,
            rooms: [
              room("living", 1, 1, 4, 3),
              room("kitchen", 7, 4, 3, 3, { wet_zone: true }),
            ],
          },
        ],
      };
    };

    const first = searchDeterministicLayouts(context, {
      strategies: [{ id: "poor-separated" }, { id: "good-adjacent" }],
      candidateBuilder,
    });
    const second = searchDeterministicLayouts(context, {
      strategies: [{ id: "poor-separated" }, { id: "good-adjacent" }],
      candidateBuilder,
    });

    expect(first.selected_candidate).toBe("good-adjacent");
    expect(first.candidate_evaluations[0].candidate_id).toBe("good-adjacent");
    expect(first.candidate_evaluations[0].score).toBeGreaterThan(
      first.candidate_evaluations[1].score,
    );
    expect(first.candidate_evaluations).toEqual(second.candidate_evaluations);
  });
});
