import { assessProjectHealth } from "../../services/project/projectHealthService.js";

describe("Phase 6 project health service", () => {
  test("returns recovery and rollback planning for blocked technical readiness", () => {
    const result = assessProjectHealth({
      projectGeometry: {
        project_id: "health-phase6",
        metadata: {
          project_state_snapshots: [
            {
              label: "healthy-snapshot",
              compose_status: "ready",
              validation_status: "valid",
            },
          ],
        },
      },
      drawings: {
        plan: [
          {
            level_id: "ground",
            title: "Ground Plan",
            room_count: 2,
            svg: '<svg><path d="undefined"/></svg>',
            technical_quality_metadata: {
              line_hierarchy: { exterior_wall: 6, interior_wall: 4 },
              room_label_count: 2,
              window_count: 1,
              wall_count: 3,
              has_title_block: true,
              has_north_arrow: true,
              has_legend: true,
            },
          },
        ],
      },
      validationReport: {
        status: "valid_with_warnings",
        warnings: [],
        errors: [],
      },
    });

    expect(result.healthStatus).toBe("recoverable");
    expect(
      result.recoveryPlan.minimumStepsToComposeReady.length,
    ).toBeGreaterThan(0);
    expect(result.rollbackPlan.hasHealthySnapshot).toBe(true);
  });
});
