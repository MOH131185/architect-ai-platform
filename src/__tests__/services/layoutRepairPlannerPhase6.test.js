import { repairLayout } from "../../services/floorplan/layoutRepairEngine.js";
import {
  resetFeatureFlags,
  setFeatureFlag,
} from "../../config/featureFlags.js";

function createProjectGeometry() {
  return {
    project_id: "phase6-repair-house",
    site: {
      buildable_bbox: {
        min_x: 0,
        min_y: 0,
        max_x: 12,
        max_y: 8,
        width: 12,
        height: 8,
      },
      boundary_bbox: {
        min_x: 0,
        min_y: 0,
        max_x: 12,
        max_y: 8,
        width: 12,
        height: 8,
      },
    },
    levels: [
      { id: "ground", level_number: 0, name: "Ground Floor" },
      { id: "first", level_number: 1, name: "First Floor" },
    ],
    rooms: [
      {
        id: "living",
        name: "Living Room",
        level_id: "ground",
        bbox: { min_x: 0, min_y: 0, max_x: 8, max_y: 6, width: 8, height: 6 },
      },
      {
        id: "kitchen",
        name: "Kitchen",
        level_id: "ground",
        bbox: { min_x: 4, min_y: 2, max_x: 10, max_y: 7, width: 6, height: 5 },
        wet_zone: true,
      },
      {
        id: "stair",
        name: "Stair",
        level_id: "ground",
        type: "stair_core",
        bbox: {
          min_x: 10.5,
          min_y: 0,
          max_x: 13.5,
          max_y: 4,
          width: 3,
          height: 4,
        },
      },
      {
        id: "bathroom",
        name: "Bathroom",
        level_id: "first",
        wet_zone: true,
        bbox: {
          min_x: 9.5,
          min_y: 1,
          max_x: 13.5,
          max_y: 5,
          width: 4,
          height: 4,
        },
      },
    ],
    stairs: [
      {
        id: "stair",
        level_id: "ground",
        bbox: {
          min_x: 10.5,
          min_y: 0,
          max_x: 13.5,
          max_y: 4,
          width: 3,
          height: 4,
        },
      },
    ],
    metadata: {
      adjacency_graph: {
        living: ["kitchen"],
        kitchen: ["living"],
      },
    },
  };
}

describe("Phase 6 layout repair planner", () => {
  afterEach(() => {
    resetFeatureFlags();
  });

  test("chooses the same repair path deterministically for the same invalid geometry", () => {
    setFeatureFlag("usePhase6RepairSearch", true);

    const validationReport = {
      status: "invalid",
      errors: [
        'Required adjacency: "Kitchen" and "Living Room" are not adjacent',
        "Footprint exceeds buildable envelope",
        "Stair/core access is weak",
      ],
      warnings: ["Circulation quality is weak", "Wet-zone stacking is weak"],
    };

    const first = repairLayout(createProjectGeometry(), validationReport, {
      maxCandidates: 6,
    });
    const second = repairLayout(createProjectGeometry(), validationReport, {
      maxCandidates: 6,
    });

    expect(first.version).toBe("phase6-layout-repair-v1");
    expect(first.selectedCandidate).not.toBeNull();
    expect(first.selectedCandidate.candidateId).toBe(
      second.selectedCandidate.candidateId,
    );
    expect(first.chosenPath).toEqual(second.chosenPath);
    expect(first.candidates.map((entry) => entry.candidateId)).toEqual(
      second.candidates.map((entry) => entry.candidateId),
    );
    expect(first.repairedProjectGeometry.metadata.repair.selected_path).toEqual(
      first.chosenPath,
    );
  });
});
