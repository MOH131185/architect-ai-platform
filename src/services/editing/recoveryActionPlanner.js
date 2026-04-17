function uniqueById(actions = []) {
  const seen = new Set();
  return actions.filter((action) => {
    if (!action?.id || seen.has(action.id)) {
      return false;
    }
    seen.add(action.id);
    return true;
  });
}

export function buildRecoveryActions(scope = {}) {
  const actions = [];
  const minimumSafeScope = scope.minimumSafeScope || {};

  (minimumSafeScope.geometryFragments || []).forEach((fragmentId) => {
    actions.push({
      id: `repair:${fragmentId}`,
      kind: "repair_geometry",
      target: fragmentId,
      title: `Repair ${fragmentId}`,
    });
  });
  (minimumSafeScope.facadeFragments || []).forEach((fragmentId) => {
    actions.push({
      id: `regenerate:${fragmentId}`,
      kind: "regenerate_facade",
      target: fragmentId,
      title: `Regenerate ${fragmentId}`,
    });
  });
  (minimumSafeScope.drawingFragments || []).forEach((fragmentId) => {
    actions.push({
      id: `regenerate:${fragmentId}`,
      kind: "regenerate_drawing",
      target: fragmentId,
      title: `Regenerate ${fragmentId}`,
    });
  });
  (minimumSafeScope.visualFragments || []).forEach((fragmentId) => {
    actions.push({
      id: `regenerate:${fragmentId}`,
      kind: "regenerate_visual",
      target: fragmentId,
      title: `Regenerate ${fragmentId}`,
    });
  });
  (minimumSafeScope.panelFragments || []).forEach((fragmentId) => {
    actions.push({
      id: `refresh:${fragmentId}`,
      kind: "refresh_panel_candidate",
      target: fragmentId,
      title: `Refresh ${fragmentId}`,
    });
  });
  actions.push({
    id: "refresh:readiness:default",
    kind: "refresh_readiness",
    target: "readiness:default",
    title: "Recompute compose readiness",
  });

  return {
    version: "phase6-recovery-action-plan-v1",
    actions: uniqueById(actions),
  };
}

export default {
  buildRecoveryActions,
};
