export function planProjectRollback(projectGeometry = {}) {
  const snapshots = Array.isArray(
    projectGeometry?.metadata?.project_state_snapshots,
  )
    ? projectGeometry.metadata.project_state_snapshots
    : [];
  const healthySnapshot = [...snapshots]
    .reverse()
    .find(
      (snapshot) =>
        snapshot.compose_status === "ready" &&
        String(snapshot.validation_status || "").startsWith("valid"),
    );

  return {
    version: "phase6-project-rollback-planner-v1",
    hasHealthySnapshot: Boolean(healthySnapshot),
    recommendedSnapshot: healthySnapshot || null,
    rollbackActions: healthySnapshot
      ? [
          {
            id: `rollback:${healthySnapshot.label || "snapshot"}`,
            kind: "rollback_to_snapshot",
            target: healthySnapshot.label || "snapshot",
            title: `Rollback to ${healthySnapshot.label || "healthy snapshot"}`,
          },
        ]
      : [],
  };
}

export default {
  planProjectRollback,
};
