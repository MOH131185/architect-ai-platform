import { getArtifactFamily } from "./projectArtifactStore.js";

function summarizeFamily(family = {}, storeSignature = null) {
  const fragments = Object.values(family.fragments || {});
  const signatureMismatch =
    Boolean(storeSignature) &&
    Boolean(family.geometry_signature) &&
    family.geometry_signature !== storeSignature;
  const staleFragmentIds = fragments
    .filter(
      (entry) =>
        entry.stale === true ||
        (entry.geometry_signature &&
          storeSignature &&
          entry.geometry_signature !== storeSignature),
    )
    .map((entry) => entry.id);
  const freshFragmentIds = fragments
    .filter(
      (entry) =>
        entry.fresh === true &&
        !entry.missing &&
        !(
          entry.geometry_signature &&
          storeSignature &&
          entry.geometry_signature !== storeSignature
        ),
    )
    .map((entry) => entry.id);
  return {
    family: family.id || null,
    fresh: family.fresh === true && !signatureMismatch,
    stale: family.stale === true || signatureMismatch,
    missing: family.missing === true,
    fragmentIds: fragments.map((entry) => entry.id),
    staleFragmentIds,
    missingFragmentIds: fragments
      .filter((entry) => entry.missing === true)
      .map((entry) => entry.id),
    freshFragmentIds,
    signatureMismatch,
  };
}

export function resolveArtifactFragment(store = {}, fragmentId = "") {
  const families = Object.values(store.artifacts || {});
  for (const family of families) {
    if (family.fragments?.[fragmentId]) {
      return {
        ...family.fragments[fragmentId],
        geometry_signature:
          family.fragments[fragmentId].geometry_signature ||
          family.geometry_signature ||
          store.geometry_signature ||
          null,
      };
    }
  }
  return null;
}

export function summarizeArtifactFreshness(store = {}) {
  const families = Object.values(store.artifacts || {});
  const familySummaries = families.map((family) =>
    summarizeFamily(family, store.geometry_signature || null),
  );
  const staleFamilies = familySummaries
    .filter((entry) => entry.stale)
    .map((entry) => entry.family);
  const missingFamilies = familySummaries
    .filter((entry) => entry.missing)
    .map((entry) => entry.family);

  return {
    version: "phase5-artifact-freshness-v1",
    geometry_signature: store.geometry_signature || null,
    staleFamilies,
    missingFamilies,
    staleFragments: familySummaries.flatMap((entry) => entry.staleFragmentIds),
    missingFragments: familySummaries.flatMap(
      (entry) => entry.missingFragmentIds,
    ),
    freshFragments: familySummaries.flatMap((entry) => entry.freshFragmentIds),
    families: familySummaries,
  };
}

export function buildLegacyArtifactStateFromStore(
  store = {},
  readiness = null,
) {
  const drawings = getArtifactFamily(store, "drawings");
  const facade = getArtifactFamily(store, "facade_package");
  const visual = getArtifactFamily(store, "visual_package");
  const readinessFamily = getArtifactFamily(store, "a1_readiness");
  const compose = getArtifactFamily(store, "compose_candidates");

  const drawingsSignatureMismatch =
    drawings?.geometry_signature &&
    store.geometry_signature &&
    drawings.geometry_signature !== store.geometry_signature;
  const facadeSignatureMismatch =
    facade?.geometry_signature &&
    store.geometry_signature &&
    facade.geometry_signature !== store.geometry_signature;
  const visualSignatureMismatch =
    visual?.geometry_signature &&
    store.geometry_signature &&
    visual.geometry_signature !== store.geometry_signature;
  const a1Stale =
    compose?.stale === true ||
    compose?.missing === true ||
    readinessFamily?.stale === true ||
    readinessFamily?.missing === true ||
    readiness?.ready === false;

  return {
    version: "phase5-legacy-artifact-state-v1",
    geometry_signature: store.geometry_signature || null,
    drawings: {
      fresh: drawings?.fresh === true && !drawingsSignatureMismatch,
      stale:
        drawings?.stale === true ||
        drawings?.missing === true ||
        drawingsSignatureMismatch,
      missing: drawings?.missing === true,
      geometry_signature:
        drawings?.geometry_signature || store.geometry_signature,
    },
    facade_package: {
      fresh: facade?.fresh === true && !facadeSignatureMismatch,
      stale:
        facade?.stale === true ||
        facade?.missing === true ||
        facadeSignatureMismatch,
      missing: facade?.missing === true,
      geometry_signature:
        facade?.geometry_signature || store.geometry_signature,
    },
    visual_package: {
      fresh: visual?.fresh === true && !visualSignatureMismatch,
      stale:
        visual?.stale === true ||
        visual?.missing === true ||
        visualSignatureMismatch,
      missing: visual?.missing === true,
      geometry_signature:
        visual?.geometry_signature || store.geometry_signature,
    },
    a1_composition: {
      fresh: !a1Stale,
      stale: a1Stale,
      missing: compose?.missing === true,
      geometry_signature: store.geometry_signature || null,
    },
  };
}

export default {
  summarizeArtifactFreshness,
  resolveArtifactFragment,
  buildLegacyArtifactStateFromStore,
};
