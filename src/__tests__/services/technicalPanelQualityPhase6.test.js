import { assessA1ComposeReadiness } from "../../services/a1/a1ComposeReadinessService.js";
import {
  resetFeatureFlags,
  setFeatureFlag,
} from "../../config/featureFlags.js";

describe("Phase 6 technical panel gating", () => {
  afterEach(() => {
    resetFeatureFlags();
  });

  test("blocks compose when a technical panel has broken annotation payloads", () => {
    setFeatureFlag("useComposeExecutionPlanning", true);
    setFeatureFlag("useA1TechnicalPanelGating", true);

    const result = assessA1ComposeReadiness({
      projectGeometry: {
        project_id: "quality-phase6",
        metadata: {},
      },
      drawings: {
        plan: [
          {
            level_id: "ground",
            title: "Ground Plan",
            room_count: 4,
            svg: '<svg><path d="undefined"/><text>Ground</text></svg>',
            technical_quality_metadata: {
              line_hierarchy: { exterior_wall: 6, interior_wall: 4 },
              room_label_count: 4,
              window_count: 2,
              wall_count: 6,
              stair_count: 1,
              has_title_block: true,
              has_north_arrow: true,
              has_legend: true,
            },
          },
        ],
        elevation: [
          {
            orientation: "north",
            title: "North Elevation",
            svg: "<svg><text>North</text><text>L0</text></svg>",
            technical_quality_metadata: {
              has_title: true,
              window_count: 2,
              floor_line_count: 2,
              level_label_count: 2,
            },
          },
        ],
        section: [
          {
            section_type: "longitudinal",
            title: "Longitudinal Section",
            svg: "<svg><text>Section</text><text>L0</text></svg>",
            technical_quality_metadata: {
              has_title: true,
              stair_count: 1,
              room_label_count: 2,
              slab_line_count: 2,
              level_label_count: 2,
            },
          },
        ],
      },
    });

    expect(result.composeBlocked).toBe(true);
    expect(result.technicalPanelGate.technicalReady).toBe(false);
    expect(
      result.technicalPanelGate.blockingReasons.some((entry) =>
        entry.includes("panel:floor-plan:ground"),
      ),
    ).toBe(true);
    expect(
      result.composeExecutionPlan.minimumRecoveryPlan.length,
    ).toBeGreaterThan(0);
  });
});
