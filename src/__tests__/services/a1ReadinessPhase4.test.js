import { assessA1ProjectReadiness } from "../../services/a1/a1ProjectReadinessService.js";
import { regenerateProjectLayer } from "../../services/editing/partialRegenerationService.js";
import { generateProjectPackage } from "../../services/project/projectGenerationService.js";

describe("A1 readiness Phase 4", () => {
  test("reports ready when canonical geometry, drawings, and visuals are fresh", async () => {
    const result = await generateProjectPackage({
      project_id: "phase4-a1-ready",
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

    expect(result.a1Readiness.ready).toBe(true);
    expect(result.a1Readiness.panelSummary.validPanelCount).toBeGreaterThan(0);
    expect(result.artifactState.drawings.fresh).toBe(true);
  });

  test("marks A1 readiness stale after facade-only regeneration", async () => {
    const result = await generateProjectPackage({
      project_id: "phase4-a1-stale-after-edit",
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

    const regenerated = await regenerateProjectLayer({
      projectGeometry: result.projectGeometry,
      targetLayer: "facade",
      locks: { room_layout: true },
      styleDNA: {
        facade_language: "climate-screened-modern",
        roof_language: "pitched-gable-or-hip",
      },
    });

    expect(regenerated.projectGeometry.metadata.locks.lockedLayers).toContain(
      "room_layout",
    );
    expect(regenerated.artifactState.drawings.stale).toBe(true);
    expect(regenerated.a1Readiness.ready).toBe(false);
    expect(regenerated.a1Readiness.staleAssets).toContain("drawings");
  });

  test("reuses persisted readiness state when explicit drawings are omitted", async () => {
    const result = await generateProjectPackage({
      project_id: "phase4-a1-metadata-fallback",
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

    const readiness = assessA1ProjectReadiness({
      projectGeometry: result.projectGeometry,
    });

    expect(readiness.ready).toBe(true);
    expect(readiness.panelCandidates.length).toBeGreaterThan(0);
    expect(readiness.artifactState.a1_composition.stale).toBe(false);
  });
});
