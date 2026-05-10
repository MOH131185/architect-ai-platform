/**
 * Regression: listArtifactPackageHistory must match by either projectId or
 * projectGraphId so the panel can find a saved row from EITHER the wizard's
 * client-generated designId (which becomes the record's projectId during
 * compact-mode store) or the slice service's auto-generated projectGraphId
 * (the case the wizard hits today because designId isn't generated until
 * AFTER the slice request).
 *
 * Without this, Save Package returns 200 and the row exists in storage, but
 * the panel's per-project filter returns empty because the projectId the
 * panel queries with doesn't equal the projectId on the record.
 */

import {
  clearArtifactPackageHistory,
  listArtifactPackageHistory,
  recordArtifactPackageHistory,
} from "../../../services/export/artifactHistoryService.js";

function fixture(overrides = {}) {
  return {
    schemaVersion: "artifact-package-history-record-v1",
    packageId: `pkg-${Math.random().toString(36).slice(2, 10)}`,
    packageHash: `hash-${Math.random().toString(36).slice(2, 10)}`,
    projectId: "alpha-design",
    projectGraphId: "graph-alpha",
    userId: "user-1",
    createdAt: new Date().toISOString(),
    artifactCount: 1,
    sourceGapCount: 0,
    status: "stored",
    flags: {},
    producerVersions: {},
    ...overrides,
  };
}

describe("listArtifactPackageHistory — projectId OR projectGraphId filter", () => {
  beforeEach(() => clearArtifactPackageHistory());
  afterEach(() => clearArtifactPackageHistory());

  test("matches by projectId (existing behaviour)", () => {
    recordArtifactPackageHistory(fixture({ packageId: "pkg-a" }));
    recordArtifactPackageHistory(
      fixture({
        packageId: "pkg-b",
        projectId: "beta-design",
        projectGraphId: "graph-beta",
      }),
    );

    const result = listArtifactPackageHistory({ projectId: "alpha-design" });
    expect(result).toHaveLength(1);
    expect(result[0].packageId).toBe("pkg-a");
  });

  test("matches by projectGraphId when projectId differs (the wizard case)", () => {
    // Storage filed this entry under the slice's auto-generated projectGraphId
    // because the wizard's designId wasn't available at slice time.
    recordArtifactPackageHistory(
      fixture({
        packageId: "pkg-wiz",
        projectId: "graph-auto-from-slice",
        projectGraphId: "graph-auto-from-slice",
      }),
    );

    // The wizard later queries with its client-generated designId. The
    // record's projectGraphId was returned to the client in result.package.*
    // and is also visible on designData.metadata.projectGraphId, so the
    // panel can supply EITHER id and find the row.
    const byGraphId = listArtifactPackageHistory({
      projectId: "graph-auto-from-slice",
    });
    expect(byGraphId).toHaveLength(1);
    expect(byGraphId[0].packageId).toBe("pkg-wiz");
  });

  test("matches by projectGraphId when record's projectId is a separate id", () => {
    // Defensive scenario: storage entry has BOTH ids populated and they
    // differ. The filter must accept either lookup key.
    recordArtifactPackageHistory(
      fixture({
        packageId: "pkg-dual",
        projectId: "wizard-design-id",
        projectGraphId: "slice-graph-id",
      }),
    );

    expect(
      listArtifactPackageHistory({ projectId: "wizard-design-id" }),
    ).toHaveLength(1);
    expect(
      listArtifactPackageHistory({ projectId: "slice-graph-id" }),
    ).toHaveLength(1);
    expect(
      listArtifactPackageHistory({ projectId: "neither-of-them" }),
    ).toHaveLength(0);
  });

  test("does not cross-leak between unrelated designs", () => {
    recordArtifactPackageHistory(
      fixture({
        packageId: "pkg-1",
        projectId: "design-1",
        projectGraphId: "graph-1",
      }),
    );
    recordArtifactPackageHistory(
      fixture({
        packageId: "pkg-2",
        projectId: "design-2",
        projectGraphId: "graph-2",
      }),
    );

    const byDesign1 = listArtifactPackageHistory({ projectId: "design-1" });
    expect(byDesign1).toHaveLength(1);
    expect(byDesign1[0].packageId).toBe("pkg-1");

    const byGraph2 = listArtifactPackageHistory({ projectId: "graph-2" });
    expect(byGraph2).toHaveLength(1);
    expect(byGraph2[0].packageId).toBe("pkg-2");

    expect(
      listArtifactPackageHistory({ projectId: "graph-1" }).map(
        (r) => r.packageId,
      ),
    ).toEqual(["pkg-1"]);
  });

  test("no projectId filter returns all non-deleted records (unchanged)", () => {
    recordArtifactPackageHistory(fixture({ packageId: "pkg-1" }));
    recordArtifactPackageHistory(
      fixture({
        packageId: "pkg-2",
        projectId: "other",
        projectGraphId: "graph-other",
      }),
    );
    expect(
      listArtifactPackageHistory({})
        .map((r) => r.packageId)
        .sort(),
    ).toEqual(["pkg-1", "pkg-2"]);
  });

  test("respects userId filter alongside the dual-id projectId match", () => {
    recordArtifactPackageHistory(
      fixture({
        packageId: "pkg-mine",
        userId: "me",
        projectGraphId: "shared-graph",
      }),
    );
    recordArtifactPackageHistory(
      fixture({
        packageId: "pkg-theirs",
        userId: "someone-else",
        projectId: "their-design",
        projectGraphId: "shared-graph",
      }),
    );

    const result = listArtifactPackageHistory({
      projectId: "shared-graph",
      userId: "me",
    });
    expect(result).toHaveLength(1);
    expect(result[0].packageId).toBe("pkg-mine");
  });
});
