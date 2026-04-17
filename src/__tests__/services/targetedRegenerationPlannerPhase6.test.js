import { planTargetedRegeneration } from "../../services/editing/targetedRegenerationPlanner.js";

describe("Phase 6 targeted regeneration planner", () => {
  test("keeps room-layout regeneration scoped to one level plan plus dependent sections and panels", () => {
    const result = planTargetedRegeneration({
      targetLayer: "room_layout",
      projectGeometry: {
        project_id: "regen-phase6",
        levels: [
          { id: "ground", level_number: 0, name: "Ground" },
          { id: "first", level_number: 1, name: "First" },
        ],
      },
      drawings: {
        plan: [
          {
            level_id: "ground",
            title: "Ground",
            svg: "<svg><text>Ground</text></svg>",
          },
          {
            level_id: "first",
            title: "First",
            svg: "<svg><text>First</text></svg>",
          },
        ],
        section: [
          {
            section_type: "longitudinal",
            title: "Section",
            svg: "<svg><text>Section</text></svg>",
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
      options: { levelId: "ground" },
    });

    expect(result.minimumSafeScope.drawingFragments).toContain(
      "drawing:plan:ground",
    );
    expect(result.minimumSafeScope.drawingFragments).not.toContain(
      "drawing:plan:first",
    );
    expect(result.minimumSafeScope.drawingFragments).toContain(
      "drawing:section:longitudinal",
    );
    expect(result.impactedFragments.panels).toContain(
      "panel:floor-plan:ground",
    );
    expect(
      result.plannedActions.some(
        (entry) =>
          entry.kind === "regenerate_drawing" &&
          entry.target === "drawing:plan:ground",
      ),
    ).toBe(true);
  });
});
