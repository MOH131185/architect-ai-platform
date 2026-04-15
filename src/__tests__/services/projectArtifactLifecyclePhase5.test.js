import { updateArtifactStoreFamily } from "../../services/project/projectArtifactStore.js";
import {
  diffProjectStateSnapshots,
  snapshotProjectState,
} from "../../services/project/projectStateSnapshotService.js";
import { generateProjectPackage } from "../../services/project/projectGenerationService.js";

describe("project artifact lifecycle Phase 5", () => {
  test("captures diff-friendly before/after snapshots when artifact freshness changes", async () => {
    const generated = await generateProjectPackage({
      project_id: "phase5-artifact-lifecycle",
      footprint: { width_m: 14, depth_m: 10 },
      room_program: [
        { name: "Living Room", target_area_m2: 24, adjacency: ["Kitchen"] },
        { name: "Kitchen", target_area_m2: 16, adjacency: ["Living Room"] },
      ],
      styleDNA: {
        facade_language: "rhythmic-openings-with-solid-masonry",
      },
    });

    const before = snapshotProjectState({
      label: "before",
      projectGeometry: generated.projectGeometry,
      validationReport: generated.validationReport,
      artifactStore: generated.artifactStore,
      composeReadiness: generated.a1Readiness,
    });
    const staleStore = updateArtifactStoreFamily(
      generated.artifactStore,
      "drawings",
      [Object.keys(generated.artifactStore.artifacts.drawings.fragments)[0]],
      { fresh: false, stale: true, missing: false },
    );
    const after = snapshotProjectState({
      label: "after",
      projectGeometry: generated.projectGeometry,
      validationReport: generated.validationReport,
      artifactStore: staleStore,
      composeReadiness: generated.a1Readiness,
    });
    const diff = diffProjectStateSnapshots(before, after);

    expect(diff.staleFamiliesAdded).toContain("drawings");
    expect(diff.staleFragmentsAdded.length).toBeGreaterThan(0);
  });
});
