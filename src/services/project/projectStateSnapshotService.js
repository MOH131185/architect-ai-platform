import { summarizeArtifactFreshness } from "./artifactFreshnessService.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function snapshotProjectState({
  label = "snapshot",
  projectGeometry = {},
  validationReport = null,
  artifactStore = null,
  composeReadiness = null,
} = {}) {
  const freshness = artifactStore
    ? summarizeArtifactFreshness(artifactStore)
    : null;

  return {
    version: "phase5-project-state-snapshot-v1",
    label,
    project_id: projectGeometry.project_id || null,
    geometry_signature:
      artifactStore?.geometry_signature ||
      projectGeometry?.metadata?.artifact_state?.geometry_signature ||
      null,
    validation_status:
      validationReport?.status || projectGeometry?.metadata?.status || null,
    compose_status: composeReadiness?.status || null,
    freshness: freshness
      ? {
          staleFamilies: freshness.staleFamilies,
          missingFamilies: freshness.missingFamilies,
          staleFragments: freshness.staleFragments,
          missingFragments: freshness.missingFragments,
        }
      : null,
  };
}

export function diffProjectStateSnapshots(
  previousSnapshot = {},
  nextSnapshot = {},
) {
  const previousFreshness = previousSnapshot.freshness || {};
  const nextFreshness = nextSnapshot.freshness || {};

  return {
    version: "phase5-project-state-snapshot-diff-v1",
    geometryChanged:
      previousSnapshot.geometry_signature !== nextSnapshot.geometry_signature,
    validationChanged:
      previousSnapshot.validation_status !== nextSnapshot.validation_status,
    composeStatusChanged:
      previousSnapshot.compose_status !== nextSnapshot.compose_status,
    staleFamiliesAdded: (nextFreshness.staleFamilies || []).filter(
      (entry) => !(previousFreshness.staleFamilies || []).includes(entry),
    ),
    staleFragmentsAdded: (nextFreshness.staleFragments || []).filter(
      (entry) => !(previousFreshness.staleFragments || []).includes(entry),
    ),
    missingFamiliesAdded: (nextFreshness.missingFamilies || []).filter(
      (entry) => !(previousFreshness.missingFamilies || []).includes(entry),
    ),
    missingFragmentsAdded: (nextFreshness.missingFragments || []).filter(
      (entry) => !(previousFreshness.missingFragments || []).includes(entry),
    ),
  };
}

export function appendProjectSnapshot(projectGeometry = {}, snapshot = {}) {
  const previous = Array.isArray(
    projectGeometry?.metadata?.project_state_snapshots,
  )
    ? projectGeometry.metadata.project_state_snapshots
    : [];
  return [...previous, clone(snapshot)].slice(-8);
}

export default {
  snapshotProjectState,
  diffProjectStateSnapshots,
  appendProjectSnapshot,
};
