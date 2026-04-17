export function resolveA1Freshness({
  panelCandidates = [],
  artifactFreshness = null,
} = {}) {
  const freshPanels = (panelCandidates || []).filter((entry) => entry.fresh);
  const stalePanels = (panelCandidates || []).filter((entry) => entry.stale);
  const missingPanels = (panelCandidates || []).filter(
    (entry) => entry.missing,
  );
  const regenerablePanels = [
    ...new Set([...stalePanels, ...missingPanels].map((entry) => entry.id)),
  ];

  return {
    version: "phase6-a1-freshness-resolver-v1",
    freshPanels,
    stalePanels,
    missingPanels,
    regenerablePanels,
    staleAssets: artifactFreshness?.staleFamilies || [],
    missingAssets: artifactFreshness?.missingFamilies || [],
    staleFragments: artifactFreshness?.staleFragments || [],
    missingFragments: artifactFreshness?.missingFragments || [],
  };
}

export default {
  resolveA1Freshness,
};
