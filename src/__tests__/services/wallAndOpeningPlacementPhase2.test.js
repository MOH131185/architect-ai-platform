import { solveDeterministicLayout } from "../../services/floorplan/layoutSolver.js";
import { buildWallGraph } from "../../services/floorplan/wallGraphBuilder.js";
import { placeOpenings } from "../../services/floorplan/openingPlacementService.js";

describe("wall and opening placement Phase 2", () => {
  test("places doors on shared walls and windows on exterior walls only", () => {
    const layout = solveDeterministicLayout({
      project_id: "wall-openings",
      footprint: { width_m: 14, depth_m: 10 },
      room_program: [
        {
          id: "living",
          name: "Living Room",
          target_area_m2: 24,
          adjacency: ["kitchen"],
        },
        {
          id: "kitchen",
          name: "Kitchen",
          target_area_m2: 16,
          adjacency: ["living"],
        },
      ],
    });
    const level = layout.levels[0];
    const walls = buildWallGraph(
      {
        ...level,
        id: "level-0",
      },
      {
        projectId: layout.project_id,
        levelId: "level-0",
      },
    ).walls;
    const openings = placeOpenings(
      {
        ...level,
        id: "level-0",
        walls,
      },
      {
        projectId: layout.project_id,
        levelId: "level-0",
        adjacencyGraph: layout.adjacency_graph,
      },
    );

    expect(openings.doors.length).toBeGreaterThan(0);
    expect(openings.windows.length).toBeGreaterThan(0);

    const wallMap = new Map(walls.map((wall) => [wall.id, wall]));
    expect(
      openings.doors.every(
        (door) => wallMap.get(door.wall_id)?.exterior === false,
      ),
    ).toBe(true);
    expect(
      openings.windows.every(
        (windowElement) =>
          wallMap.get(windowElement.wall_id)?.exterior === true,
      ),
    ).toBe(true);
  });
});
