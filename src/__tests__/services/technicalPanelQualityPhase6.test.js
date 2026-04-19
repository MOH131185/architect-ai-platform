import { assessA1ComposeReadiness } from "../../services/a1/a1ComposeReadinessService.js";
import { evaluateA1TechnicalPanelGate } from "../../services/a1/a1TechnicalPanelGateService.js";
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
      result.composeExecutionPlan.minimumRecoveryPlan.some(
        (entry) =>
          entry.kind === "regenerate_drawing" &&
          entry.target === "drawing:plan:ground",
      ),
    ).toBe(true);
    expect(
      result.composeExecutionPlan.minimumRecoveryPlan.length,
    ).toBeGreaterThan(0);
  });

  test("blocks only the panel whose source fragment is stale", () => {
    const gate = evaluateA1TechnicalPanelGate({
      drawings: {
        plan: [
          {
            level_id: "ground",
            title: "Ground Plan",
            room_count: 1,
            svg: '<svg><g id="title-block"></g><text>Ground</text><text>10 m2</text></svg>',
            technical_quality_metadata: {
              line_hierarchy: { exterior_wall: 6, interior_wall: 4 },
              room_label_count: 1,
              window_count: 1,
              wall_count: 2,
              stair_count: 0,
              has_title_block: true,
              has_north_arrow: true,
              has_legend: true,
            },
          },
        ],
        section: [
          {
            section_type: "longitudinal",
            title: "Section",
            svg: "<svg><text>Section</text><text>L0</text><text>LIVING ROOM</text></svg>",
            technical_quality_metadata: {
              has_title: true,
              stair_count: 0,
              room_label_count: 1,
              slab_line_count: 1,
              level_label_count: 1,
              geometry_complete: true,
              cut_room_count: 1,
              foundation_marker_count: 1,
              stair_tread_count: 7,
              roof_profile_visible: true,
              section_usefulness_score: 0.78,
            },
          },
        ],
      },
      panelCandidates: [
        {
          id: "panel:floor-plan:ground",
          type: "floor_plan",
          sourceArtifacts: ["drawing:plan:ground"],
        },
        {
          id: "panel:section:longitudinal",
          type: "section",
          sourceArtifacts: ["drawing:section:longitudinal"],
        },
      ],
      artifactFreshness: {
        staleFragments: ["drawing:plan:ground"],
        missingFragments: [],
      },
    });

    expect(
      gate.blockingReasons.some((entry) =>
        entry.includes("panel:floor-plan:ground"),
      ),
    ).toBe(true);
    expect(
      gate.blockingReasons.some((entry) =>
        entry.includes("panel:section:longitudinal"),
      ),
    ).toBe(false);
  });

  test("blocks a technical panel when no quality evaluation can be resolved", () => {
    const gate = evaluateA1TechnicalPanelGate({
      drawings: {
        plan: [],
      },
      panelCandidates: [
        {
          id: "panel:floor-plan:ground",
          type: "floor_plan",
          sourceArtifacts: ["drawing:plan:ground"],
        },
      ],
      artifactFreshness: {
        staleFragments: [],
        missingFragments: [],
      },
    });

    expect(gate.technicalReady).toBe(false);
    expect(gate.blockingPanels).toContain("panel:floor-plan:ground");
    expect(
      gate.blockingReasons.some((entry) =>
        entry.includes("No technical drawing quality evaluation"),
      ),
    ).toBe(true);
  });
});
