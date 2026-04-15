import { generateProjectPackage } from "../../services/project/projectGenerationService.js";
import {
  buildArtifactState,
  invalidateArtifactsForPlan,
} from "../../services/editing/artifactInvalidationService.js";
import { planRegeneration } from "../../services/editing/regenerationPlanner.js";

describe("regenerationPlanner Phase 4", () => {
  test("computes dependency-driven invalidation for facade edits", async () => {
    const generated = await generateProjectPackage({
      project_id: "phase4-regeneration-plan",
      footprint: { width_m: 14, depth_m: 10 },
      room_program: [
        { name: "Living Room", target_area_m2: 24, adjacency: ["Kitchen"] },
        { name: "Kitchen", target_area_m2: 16, adjacency: ["Living Room"] },
      ],
      styleDNA: {
        facade_language: "rhythmic-openings-with-solid-masonry",
        roof_language: "pitched-gable-or-hip",
      },
    });
    const plan = planRegeneration("facade");
    const invalidated = invalidateArtifactsForPlan(
      buildArtifactState({
        projectGeometry: generated.projectGeometry,
        drawings: generated.drawings,
        facadeGrammar: generated.facadeGrammar,
        visualPackage: generated.visualPackage,
        readiness: generated.a1Readiness,
      }),
      plan,
      generated.projectGeometry,
    );

    expect(plan.impactedLayers).toContain("facade_grammar");
    expect(plan.impactedLayers).toContain("drawings");
    expect(plan.impactedArtifacts.facadePackage).toBe(true);
    expect(invalidated.drawings.stale).toBe(true);
    expect(invalidated.facade_package.stale).toBe(true);
    expect(invalidated.visual_package.stale).toBe(true);
    expect(invalidated.a1_composition.stale).toBe(true);
  });

  test("preserves unrelated stale state and marks regenerated drawings fresh", () => {
    const currentState = {
      version: "phase4-artifact-state-v1",
      geometry_signature: "before",
      drawings: { fresh: false, stale: true, geometry_signature: "before" },
      facade_package: {
        fresh: true,
        stale: false,
        geometry_signature: "before",
      },
      visual_package: {
        fresh: false,
        stale: true,
        geometry_signature: "before",
      },
      a1_composition: {
        fresh: false,
        stale: true,
        geometry_signature: "before",
      },
    };
    const projectGeometry = {
      project_id: "phase4-regeneration-refresh",
      levels: [],
      rooms: [],
      walls: [],
      doors: [],
      windows: [],
      roof: null,
      metadata: {},
    };

    const invalidated = invalidateArtifactsForPlan(
      currentState,
      planRegeneration("drawings"),
      projectGeometry,
      { drawings: true },
    );

    expect(invalidated.drawings.fresh).toBe(true);
    expect(invalidated.drawings.stale).toBe(false);
    expect(invalidated.visual_package.stale).toBe(true);
    expect(invalidated.facade_package.stale).toBe(false);
  });
});
