import { resolveArtifactFragments } from "./artifactFragmentResolver.js";

export function buildDependencyFragmentRegistry({
  projectGeometry = {},
  drawings = null,
  facadeGrammar = null,
  visualPackage = null,
  panelCandidates = [],
  artifactStore = null,
} = {}) {
  const resolved = resolveArtifactFragments({
    drawings,
    facadeGrammar,
    visualPackage,
    panelCandidates,
    artifactStore,
  });
  const levels = (projectGeometry.levels || []).map((level) => ({
    id: `geometry:level:${level.id}`,
    family: "canonical_geometry",
    subtype: "level",
    levelId: level.id,
    title: level.name || level.id,
  }));
  const cores = (projectGeometry.stairs || []).map((stair, index) => ({
    id: `geometry:core:${stair.id || index}`,
    family: "canonical_geometry",
    subtype: "stair_core",
    levelId: stair.level_id || null,
    title: stair.name || stair.id || `Core ${index + 1}`,
  }));

  return {
    version: "phase6-dependency-fragment-registry-v1",
    canonical: [
      {
        id: "geometry:canonical",
        family: "canonical_geometry",
        subtype: "geometry",
        title: "Canonical Geometry",
      },
      ...levels,
      ...cores,
    ],
    drawings: resolved.drawings,
    facadeSides: resolved.facadeSides,
    visualViews: resolved.visualViews,
    panels: resolved.panels,
  };
}

export default {
  buildDependencyFragmentRegistry,
};
