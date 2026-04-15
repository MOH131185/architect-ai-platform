import { planFragmentInvalidation } from "../../services/editing/fragmentInvalidationService.js";
import { generateProjectPackage } from "../../services/project/projectGenerationService.js";

describe("fragment invalidation Phase 5", () => {
  test("targets one level plan drawing instead of broadly invalidating every plan", async () => {
    const generated = await generateProjectPackage({
      project_id: "phase5-fragment-invalidation",
      level_count: 2,
      footprint: { width_m: 16, depth_m: 12 },
      room_program: [
        { name: "Living Room", target_area_m2: 24, adjacency: ["Kitchen"] },
        { name: "Kitchen", target_area_m2: 16, adjacency: ["Living Room"] },
        { name: "Bedroom 1", target_area_m2: 14, level: 1 },
      ],
      styleDNA: {
        facade_language: "rhythmic-openings-with-solid-masonry",
      },
    });

    const groundLevelId = generated.projectGeometry.levels[0].id;
    const upperLevelId = generated.projectGeometry.levels[1].id;
    const plan = planFragmentInvalidation({
      targetLayer: "room_layout",
      projectGeometry: generated.projectGeometry,
      options: {
        levelId: groundLevelId,
      },
      artifactStore: generated.artifactStore,
    });

    expect(plan.impactedFragments.drawings).toContain(
      `drawing:plan:${groundLevelId}`,
    );
    expect(plan.impactedFragments.drawings).not.toContain(
      `drawing:plan:${upperLevelId}`,
    );
    expect(
      plan.impactedFragments.panels.some((entry) =>
        entry.includes(`floor-plan:${groundLevelId}`),
      ),
    ).toBe(true);
  });

  test("falls back to stored fragment ids when live drawing payloads are omitted", async () => {
    const generated = await generateProjectPackage({
      project_id: "phase5-fragment-invalidation-store-fallback",
      footprint: { width_m: 14, depth_m: 10 },
      room_program: [
        { name: "Living Room", target_area_m2: 24, adjacency: ["Kitchen"] },
        { name: "Kitchen", target_area_m2: 16, adjacency: ["Living Room"] },
      ],
      styleDNA: {
        facade_language: "rhythmic-openings-with-solid-masonry",
      },
    });

    const plan = planFragmentInvalidation({
      targetLayer: "drawings",
      projectGeometry: generated.projectGeometry,
      artifactStore: generated.artifactStore,
    });

    expect(plan.seedFragments.length).toBeGreaterThan(0);
    expect(plan.impactedFragments.panels.length).toBeGreaterThan(0);
    expect(plan.impactedArtifacts.a1Readiness).toBe(true);
  });
});
