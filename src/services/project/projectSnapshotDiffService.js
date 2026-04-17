import { diffProjectStateSnapshots } from "./projectStateSnapshotService.js";

export function buildProjectSnapshotDiff(
  previousSnapshot = {},
  nextSnapshot = {},
) {
  const baseDiff = diffProjectStateSnapshots(previousSnapshot, nextSnapshot);

  return {
    version: "phase6-project-snapshot-diff-v1",
    ...baseDiff,
    changedFamilies:
      baseDiff.staleFamiliesAdded.length || baseDiff.missingFamiliesAdded.length
        ? [
            ...new Set([
              ...baseDiff.staleFamiliesAdded,
              ...baseDiff.missingFamiliesAdded,
            ]),
          ]
        : [],
    changedFragments: [
      ...new Set([
        ...(baseDiff.staleFragmentsAdded || []),
        ...(baseDiff.missingFragmentsAdded || []),
      ]),
    ],
  };
}

export default {
  buildProjectSnapshotDiff,
};
