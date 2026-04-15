import { createStableHash } from "../cad/projectGeometrySchema.js";

export const PROJECT_ARTIFACT_STORE_VERSION =
  "phase5-project-artifact-store-v1";
export const ARTIFACT_FAMILY_NAMES = [
  "canonical_geometry",
  "drawings",
  "facade_package",
  "visual_package",
  "a1_readiness",
  "compose_candidates",
];

function hasOwn(input = {}, key) {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function safeString(value, fallback = "") {
  return value === undefined || value === null ? fallback : String(value);
}

export function geometrySignature(projectGeometry = {}) {
  return createStableHash(
    JSON.stringify({
      project_id: projectGeometry.project_id || null,
      schema_version: projectGeometry.schema_version || null,
      site: projectGeometry.site || null,
      levels: projectGeometry.levels || [],
      rooms: projectGeometry.rooms || [],
      walls: projectGeometry.walls || [],
      doors: projectGeometry.doors || [],
      windows: projectGeometry.windows || [],
      stairs: projectGeometry.stairs || [],
      roof: projectGeometry.roof || null,
    }),
  );
}

function createEmptyFamily(id, signature) {
  return {
    id,
    geometry_signature: signature,
    fresh: false,
    stale: false,
    missing: true,
    fragmentCount: 0,
    freshCount: 0,
    staleCount: 0,
    missingCount: 0,
    fragments: {},
  };
}

function buildFragmentSignature(signature, family, id, payload = {}) {
  return createStableHash(
    JSON.stringify({
      geometry_signature: signature,
      family,
      id,
      payload,
    }),
  );
}

function createFragment({
  id,
  family,
  subtype = null,
  title = null,
  sourceFragments = [],
  fresh = true,
  stale = false,
  missing = false,
  geometrySignature: signature = null,
  payload = {},
}) {
  const resolvedSignature =
    signature || buildFragmentSignature("missing", family, id, payload);
  return {
    id,
    family,
    subtype,
    title,
    geometry_signature: resolvedSignature,
    sourceFragments: [...new Set((sourceFragments || []).filter(Boolean))],
    fresh: Boolean(fresh) && !missing,
    stale: Boolean(stale) && !missing,
    missing: Boolean(missing),
    signature: buildFragmentSignature(resolvedSignature, family, id, payload),
  };
}

function summarizeFamily(id, signature, fragments = {}) {
  const entries = Object.values(fragments || {});
  const fragmentCount = entries.length;
  const freshCount = entries.filter((entry) => entry.fresh === true).length;
  const staleCount = entries.filter((entry) => entry.stale === true).length;
  const missingCount = entries.filter((entry) => entry.missing === true).length;
  return {
    id,
    geometry_signature: signature,
    fresh: fragmentCount > 0 && staleCount === 0 && missingCount === 0,
    stale: staleCount > 0,
    missing: fragmentCount === 0 || missingCount === fragmentCount,
    fragmentCount,
    freshCount,
    staleCount,
    missingCount,
    fragments,
  };
}

function mapFragmentsById(fragments = []) {
  return fragments.reduce((accumulator, fragment) => {
    accumulator[fragment.id] = fragment;
    return accumulator;
  }, {});
}

function buildPlanFragments(drawings = {}, signature) {
  return (drawings.plan || []).map((entry, index) =>
    createFragment({
      id: `drawing:plan:${safeString(entry.level_id, index)}`,
      family: "drawings",
      subtype: "plan",
      title: entry.title || `Plan ${index + 1}`,
      fresh: Boolean(entry.svg),
      stale: !entry.svg,
      missing: !entry.svg,
      geometrySignature: signature,
      payload: {
        level_id: entry.level_id || null,
        title: entry.title || null,
      },
    }),
  );
}

function buildElevationFragments(drawings = {}, signature) {
  return (drawings.elevation || []).map((entry, index) =>
    createFragment({
      id: `drawing:elevation:${safeString(entry.orientation, index)}`,
      family: "drawings",
      subtype: "elevation",
      title: entry.title || `Elevation ${index + 1}`,
      fresh: Boolean(entry.svg),
      stale: !entry.svg,
      missing: !entry.svg,
      geometrySignature: signature,
      payload: {
        orientation: entry.orientation || null,
        title: entry.title || null,
      },
    }),
  );
}

function buildSectionFragments(drawings = {}, signature) {
  return (drawings.section || []).map((entry, index) =>
    createFragment({
      id: `drawing:section:${safeString(entry.section_type, index)}`,
      family: "drawings",
      subtype: "section",
      title: entry.title || `Section ${index + 1}`,
      fresh: Boolean(entry.svg),
      stale: !entry.svg,
      missing: !entry.svg,
      geometrySignature: signature,
      payload: {
        section_type: entry.section_type || null,
        title: entry.title || null,
      },
    }),
  );
}

function buildDrawingFamily(drawings, signature) {
  if (!drawings) {
    return createEmptyFamily("drawings", signature);
  }
  return summarizeFamily(
    "drawings",
    signature,
    mapFragmentsById([
      ...buildPlanFragments(drawings, signature),
      ...buildElevationFragments(drawings, signature),
      ...buildSectionFragments(drawings, signature),
    ]),
  );
}

function buildFacadeFamily(projectGeometry = {}, facadeGrammar, signature) {
  if (!facadeGrammar) {
    return createEmptyFamily("facade_package", signature);
  }
  const sides = facadeGrammar?.orientations
    ?.map((entry) => entry.side)
    .filter(Boolean) || ["north", "south", "east", "west"];
  return summarizeFamily(
    "facade_package",
    signature,
    mapFragmentsById(
      sides.map((side) =>
        createFragment({
          id: `facade:side:${side}`,
          family: "facade_package",
          subtype: "side",
          title: `Facade ${side}`,
          geometrySignature: signature,
          payload: {
            project_id: projectGeometry.project_id || null,
            side,
          },
        }),
      ),
    ),
  );
}

function buildVisualFamily(visualPackage, signature) {
  if (!visualPackage) {
    return createEmptyFamily("visual_package", signature);
  }
  const fragment = createFragment({
    id: `visual:view:${safeString(visualPackage.viewType, "hero_3d")}`,
    family: "visual_package",
    subtype: "view",
    title: `Visual ${safeString(visualPackage.viewType, "hero_3d")}`,
    fresh: visualPackage.validation?.valid !== false,
    stale: visualPackage.validation?.valid === false,
    missing: false,
    geometrySignature: signature,
    payload: {
      package_id: visualPackage.package_id || null,
      viewType: visualPackage.viewType || "hero_3d",
    },
  });
  return summarizeFamily("visual_package", signature, {
    [fragment.id]: fragment,
  });
}

function buildReadinessFamily(readinessMetadata, signature) {
  if (!readinessMetadata) {
    return createEmptyFamily("a1_readiness", signature);
  }
  const fragment = createFragment({
    id: "readiness:default",
    family: "a1_readiness",
    subtype: "summary",
    title: "A1 Readiness",
    fresh: readinessMetadata.ready === true,
    stale: readinessMetadata.ready !== true,
    missing: false,
    geometrySignature: signature,
    payload: {
      status: readinessMetadata.status || null,
      composeReady: readinessMetadata.composeReady || null,
    },
  });
  return summarizeFamily("a1_readiness", signature, {
    [fragment.id]: fragment,
  });
}

function buildComposeCandidateFamily(composeCandidates = [], signature) {
  if (!Array.isArray(composeCandidates) || !composeCandidates.length) {
    return createEmptyFamily("compose_candidates", signature);
  }
  return summarizeFamily(
    "compose_candidates",
    signature,
    mapFragmentsById(
      composeCandidates.map((candidate, index) =>
        createFragment({
          id: candidate.id || `panel:${index}`,
          family: "compose_candidates",
          subtype: candidate.type || "panel",
          title: candidate.title || candidate.id || `Panel ${index + 1}`,
          sourceFragments: candidate.sourceArtifacts || [],
          fresh: candidate.fresh !== false && candidate.missing !== true,
          stale: candidate.stale === true,
          missing: candidate.missing === true,
          geometrySignature: signature,
          payload: {
            type: candidate.type || null,
            ready: candidate.ready === true,
          },
        }),
      ),
    ),
  );
}

function ensureStoreShape(store = {}, signature = null) {
  const resolvedSignature = signature || store.geometry_signature || "missing";
  const artifacts = ARTIFACT_FAMILY_NAMES.reduce((accumulator, family) => {
    accumulator[family] =
      store.artifacts?.[family] || createEmptyFamily(family, resolvedSignature);
    return accumulator;
  }, {});
  return {
    version: PROJECT_ARTIFACT_STORE_VERSION,
    project_id: store.project_id || null,
    geometry_signature: resolvedSignature,
    artifacts,
  };
}

export function createArtifactStorePatch(input = {}) {
  const projectGeometry = input.projectGeometry || {};
  const signature = geometrySignature(projectGeometry);
  const patch = {
    version: PROJECT_ARTIFACT_STORE_VERSION,
    project_id: projectGeometry.project_id || null,
    geometry_signature: signature,
    artifacts: {},
  };

  if (projectGeometry?.project_id) {
    const canonicalFragment = createFragment({
      id: "geometry:canonical",
      family: "canonical_geometry",
      subtype: "geometry",
      title: "Canonical Geometry",
      geometrySignature: signature,
      payload: {
        project_id: projectGeometry.project_id,
      },
    });
    patch.artifacts.canonical_geometry = summarizeFamily(
      "canonical_geometry",
      signature,
      {
        [canonicalFragment.id]: canonicalFragment,
      },
    );
  }
  if (hasOwn(input, "drawings")) {
    patch.artifacts.drawings = buildDrawingFamily(input.drawings, signature);
  }
  if (hasOwn(input, "facadeGrammar")) {
    patch.artifacts.facade_package = buildFacadeFamily(
      projectGeometry,
      input.facadeGrammar,
      signature,
    );
  }
  if (hasOwn(input, "visualPackage")) {
    patch.artifacts.visual_package = buildVisualFamily(
      input.visualPackage,
      signature,
    );
  }
  if (hasOwn(input, "readinessMetadata")) {
    patch.artifacts.a1_readiness = buildReadinessFamily(
      input.readinessMetadata,
      signature,
    );
  }
  if (hasOwn(input, "composeCandidates")) {
    patch.artifacts.compose_candidates = buildComposeCandidateFamily(
      input.composeCandidates,
      signature,
    );
  }

  return patch;
}

export function mergeProjectArtifactStore(currentStore = {}, patch = {}) {
  const resolved = ensureStoreShape(
    currentStore,
    patch.geometry_signature || currentStore.geometry_signature || "missing",
  );
  const nextStore = clone(resolved);
  nextStore.project_id = patch.project_id || currentStore.project_id || null;
  nextStore.geometry_signature =
    patch.geometry_signature || currentStore.geometry_signature || "missing";

  Object.entries(patch.artifacts || {}).forEach(([family, familyPatch]) => {
    nextStore.artifacts[family] = familyPatch;
  });

  ARTIFACT_FAMILY_NAMES.forEach((family) => {
    nextStore.artifacts[family] =
      nextStore.artifacts[family] ||
      createEmptyFamily(family, nextStore.geometry_signature);
  });

  return nextStore;
}

export function buildProjectArtifactStore(input = {}) {
  const signature = geometrySignature(input.projectGeometry || {});
  const baseStore = ensureStoreShape({}, signature);
  return mergeProjectArtifactStore(baseStore, createArtifactStorePatch(input));
}

export function updateArtifactStoreFamily(
  currentStore = {},
  familyName,
  fragmentIds = [],
  updates = {},
  signature = null,
) {
  const nextStore = ensureStoreShape(currentStore, signature);
  const family =
    nextStore.artifacts[familyName] ||
    createEmptyFamily(familyName, nextStore.geometry_signature);
  const fragments = clone(family.fragments || {});

  fragmentIds.forEach((fragmentId) => {
    const previous = fragments[fragmentId] || {
      id: fragmentId,
      family: familyName,
      subtype: null,
      title: fragmentId,
      sourceFragments: [],
      signature: buildFragmentSignature(
        nextStore.geometry_signature,
        familyName,
        fragmentId,
      ),
      fresh: false,
      stale: false,
      missing: true,
    };
    fragments[fragmentId] = {
      ...previous,
      ...updates,
      fresh: updates.fresh ?? previous.fresh,
      stale: updates.stale ?? previous.stale,
      missing: updates.missing ?? previous.missing,
    };
  });

  nextStore.artifacts[familyName] = summarizeFamily(
    familyName,
    nextStore.geometry_signature,
    fragments,
  );
  return nextStore;
}

export function getArtifactFamily(store = {}, familyName = "") {
  return ensureStoreShape(store).artifacts[familyName] || null;
}

export default {
  PROJECT_ARTIFACT_STORE_VERSION,
  ARTIFACT_FAMILY_NAMES,
  geometrySignature,
  buildProjectArtifactStore,
  createArtifactStorePatch,
  mergeProjectArtifactStore,
  updateArtifactStoreFamily,
  getArtifactFamily,
};
