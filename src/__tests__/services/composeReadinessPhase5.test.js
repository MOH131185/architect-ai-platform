import { assessA1ComposeReadiness } from "../../services/a1/a1ComposeReadinessService.js";
import { invalidateA1ComposeState } from "../../services/a1/a1ComposeInvalidationService.js";
import { planFragmentInvalidation } from "../../services/editing/fragmentInvalidationService.js";
import { updateArtifactStoreFamily } from "../../services/project/projectArtifactStore.js";
import { generateProjectPackage } from "../../services/project/projectGenerationService.js";

describe("compose readiness Phase 5", () => {
  test("distinguishes fresh vs stale panel sets after targeted facade invalidation", async () => {
    const generated = await generateProjectPackage({
      project_id: "phase5-compose-readiness",
      footprint: { width_m: 14, depth_m: 10 },
      room_program: [
        { name: "Living Room", target_area_m2: 24, adjacency: ["Kitchen"] },
        { name: "Kitchen", target_area_m2: 16, adjacency: ["Living Room"] },
      ],
      styleDNA: {
        facade_language: "rhythmic-openings-with-solid-masonry",
      },
    });

    const ready = assessA1ComposeReadiness({
      projectGeometry: generated.projectGeometry,
      validationReport: generated.validationReport,
      artifactStore: generated.artifactStore,
    });
    expect(ready.composeReady).toBe(true);

    const invalidationPlan = planFragmentInvalidation({
      targetLayer: "facade_grammar",
      projectGeometry: generated.projectGeometry,
      options: { side: "north" },
      artifactStore: generated.artifactStore,
    });
    const staleStore = invalidateA1ComposeState({
      artifactStore: generated.artifactStore,
      invalidationPlan,
    });
    const staleReadiness = assessA1ComposeReadiness({
      projectGeometry: generated.projectGeometry,
      validationReport: generated.validationReport,
      artifactStore: staleStore,
    });

    expect(staleReadiness.composeReady).toBe(false);
    expect(staleReadiness.stalePanels.length).toBeGreaterThan(0);
    expect(staleReadiness.blockingReasons.join(" ")).toContain("Stale");
  });

  test("prefers explicit fresh assets over stale stored metadata when assessing compose readiness", async () => {
    const generated = await generateProjectPackage({
      project_id: "phase5-compose-readiness-explicit-assets",
      footprint: { width_m: 14, depth_m: 10 },
      room_program: [
        { name: "Living Room", target_area_m2: 24, adjacency: ["Kitchen"] },
        { name: "Kitchen", target_area_m2: 16, adjacency: ["Living Room"] },
      ],
      styleDNA: {
        facade_language: "rhythmic-openings-with-solid-masonry",
      },
    });

    const drawingFragmentIds = Object.keys(
      generated.artifactStore.artifacts.drawings.fragments,
    );
    const panelFragmentIds = Object.keys(
      generated.artifactStore.artifacts.compose_candidates.fragments,
    );
    let staleStore = updateArtifactStoreFamily(
      generated.artifactStore,
      "drawings",
      drawingFragmentIds,
      { fresh: false, stale: true, missing: false },
    );
    staleStore = updateArtifactStoreFamily(
      staleStore,
      "compose_candidates",
      panelFragmentIds,
      { fresh: false, stale: true, missing: false },
    );
    staleStore = updateArtifactStoreFamily(
      staleStore,
      "a1_readiness",
      ["readiness:default"],
      { fresh: false, stale: true, missing: false },
    );

    const readiness = assessA1ComposeReadiness({
      projectGeometry: generated.projectGeometry,
      drawings: generated.drawings,
      visualPackage: generated.visualPackage,
      validationReport: generated.validationReport,
      artifactStore: staleStore,
    });

    expect(readiness.composeReady).toBe(true);
    expect(readiness.stalePanels).toHaveLength(0);
    expect(readiness.staleAssets).not.toContain("drawings");
  });
});
