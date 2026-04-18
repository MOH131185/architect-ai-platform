import { planTargetedRegeneration } from "./targetedRegenerationPlanner.js";
import { buildFacadeGrammar } from "../facade/facadeGrammarEngine.js";
import { buildVisualGenerationPackage } from "../visual/geometryLockedVisualRouter.js";
import { generateTechnicalDrawings } from "../drawing/technicalDrawingService.js";
import {
  buildProjectArtifactStore,
  createArtifactStorePatch,
  geometrySignature,
  mergeProjectArtifactStore,
} from "../project/projectArtifactStore.js";
import { summarizeArtifactFreshness } from "../project/artifactFreshnessService.js";
import { snapshotProjectState } from "../project/projectStateSnapshotService.js";
import { buildProjectSnapshotDiff } from "../project/projectSnapshotDiffService.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function unique(values = []) {
  return [...new Set((values || []).filter(Boolean))].sort();
}

function normalizeScope(scope = {}) {
  return {
    geometryFragments: unique(scope.geometryFragments || []),
    drawingFragments: unique(scope.drawingFragments || []),
    facadeFragments: unique(scope.facadeFragments || []),
    visualFragments: unique(scope.visualFragments || []),
    panelFragments: unique(scope.panelFragments || []),
    readinessFragments: unique(scope.readinessFragments || []),
  };
}

function ensureDrawings(drawings = null) {
  return clone(
    drawings || {
      plan: [],
      elevation: [],
      section: [],
    },
  );
}

function upsertByKey(entries = [], incoming = [], key) {
  const next = [...(entries || [])];
  (incoming || []).forEach((entry) => {
    const value = entry?.[key];
    const index = next.findIndex((candidate) => candidate?.[key] === value);
    if (index >= 0) {
      next[index] = entry;
    } else {
      next.push(entry);
    }
  });
  return next;
}

function mergeDrawings(
  currentDrawings = {},
  generatedDrawings = {},
  scope = {},
) {
  const next = ensureDrawings(currentDrawings);
  const drawingFragments = scope.drawingFragments || [];

  if (!drawingFragments.length) {
    return {
      plan: generatedDrawings.plan || next.plan,
      elevation: generatedDrawings.elevation || next.elevation,
      section: generatedDrawings.section || next.section,
    };
  }

  next.plan = upsertByKey(
    next.plan,
    (generatedDrawings.plan || []).filter((entry) =>
      drawingFragments.includes(`drawing:plan:${entry.level_id}`),
    ),
    "level_id",
  );
  next.elevation = upsertByKey(
    next.elevation,
    (generatedDrawings.elevation || []).filter((entry) =>
      drawingFragments.includes(`drawing:elevation:${entry.orientation}`),
    ),
    "orientation",
  );
  next.section = upsertByKey(
    next.section,
    (generatedDrawings.section || []).filter((entry) =>
      drawingFragments.includes(`drawing:section:${entry.section_type}`),
    ),
    "section_type",
  );
  return next;
}

function mergeFacadeGrammar(
  currentFacadeGrammar = null,
  generatedFacadeGrammar = null,
  scope = {},
) {
  if (!currentFacadeGrammar || !(scope.facadeFragments || []).length) {
    return generatedFacadeGrammar || currentFacadeGrammar;
  }
  const requestedSides = new Set(
    (scope.facadeFragments || [])
      .map((entry) => String(entry).replace("facade:side:", ""))
      .filter(Boolean),
  );
  return {
    ...currentFacadeGrammar,
    orientations: unique([
      ...(currentFacadeGrammar.orientations || []).map((entry) => entry.side),
      ...(generatedFacadeGrammar?.orientations || []).map(
        (entry) => entry.side,
      ),
    ])
      .map((side) => {
        if (requestedSides.has(side)) {
          return (
            (generatedFacadeGrammar?.orientations || []).find(
              (entry) => entry.side === side,
            ) ||
            (currentFacadeGrammar.orientations || []).find(
              (entry) => entry.side === side,
            )
          );
        }
        return (currentFacadeGrammar.orientations || []).find(
          (entry) => entry.side === side,
        );
      })
      .filter(Boolean),
  };
}

function resolveDrawingRequest(scope = {}) {
  const drawingFragments = scope.drawingFragments || [];
  const plans = [];
  const elevations = [];
  const sections = [];

  drawingFragments.forEach((fragmentId) => {
    if (fragmentId.startsWith("drawing:plan:")) {
      plans.push(fragmentId.replace("drawing:plan:", ""));
    } else if (fragmentId.startsWith("drawing:elevation:")) {
      elevations.push(fragmentId.replace("drawing:elevation:", ""));
    } else if (fragmentId.startsWith("drawing:section:")) {
      sections.push(fragmentId.replace("drawing:section:", ""));
    }
  });

  return {
    plans: unique(plans),
    elevations: unique(elevations),
    sections: unique(sections),
  };
}

function ensureActionablePlan(plan = {}) {
  const scope = normalizeScope(plan.minimumSafeScope || {});
  const actionableCount =
    scope.geometryFragments.length +
    scope.drawingFragments.length +
    scope.facadeFragments.length +
    scope.visualFragments.length +
    scope.panelFragments.length +
    scope.readinessFragments.length;

  if (actionableCount === 0) {
    throw new Error(
      "Approved regeneration plan does not contain an actionable minimumSafeScope.",
    );
  }

  return scope;
}

async function generateScopedDrawings(projectGeometry = {}, scope = {}) {
  const request = resolveDrawingRequest(scope);
  const refreshedFragments = [];
  const failedFragments = [];
  const drawings = {
    plan: [],
    elevation: [],
    section: [],
  };

  for (const levelId of request.plans) {
    // eslint-disable-next-line no-await-in-loop
    const generated = await generateTechnicalDrawings({
      projectGeometry,
      drawingTypes: ["plan"],
      options: { levelId },
    });
    const planEntry = (generated.drawings?.plan || []).find(
      (entry) => entry.level_id === levelId,
    );
    if (planEntry) {
      drawings.plan.push(planEntry);
      refreshedFragments.push(`drawing:plan:${levelId}`);
    } else {
      failedFragments.push(`drawing:plan:${levelId}`);
    }
  }

  for (const orientation of request.elevations) {
    // eslint-disable-next-line no-await-in-loop
    const generated = await generateTechnicalDrawings({
      projectGeometry,
      drawingTypes: ["elevation"],
      orientations: [orientation],
    });
    const elevationEntry = (generated.drawings?.elevation || []).find(
      (entry) => entry.orientation === orientation,
    );
    if (elevationEntry) {
      drawings.elevation.push(elevationEntry);
      refreshedFragments.push(`drawing:elevation:${orientation}`);
    } else {
      failedFragments.push(`drawing:elevation:${orientation}`);
    }
  }

  for (const sectionType of request.sections) {
    // eslint-disable-next-line no-await-in-loop
    const generated = await generateTechnicalDrawings({
      projectGeometry,
      drawingTypes: ["section"],
      sectionTypes: [sectionType],
    });
    const sectionEntry = (generated.drawings?.section || []).find(
      (entry) => entry.section_type === sectionType,
    );
    if (sectionEntry) {
      drawings.section.push(sectionEntry);
      refreshedFragments.push(`drawing:section:${sectionType}`);
    } else {
      failedFragments.push(`drawing:section:${sectionType}`);
    }
  }

  return {
    drawings,
    refreshedFragments,
    failedFragments,
  };
}

export async function executeTargetedRegeneration({
  approvedPlan = null,
  targetLayer = null,
  projectGeometry = {},
  drawings = null,
  facadeGrammar = null,
  visualPackage = null,
  styleDNA = {},
  artifactStore = null,
  validationReport = null,
  options = {},
} = {}) {
  const plan =
    approvedPlan ||
    planTargetedRegeneration({
      targetLayer,
      projectGeometry,
      drawings,
      facadeGrammar,
      visualPackage,
      artifactStore,
      validationReport,
      options,
    });
  if (
    approvedPlan?.targetLayer &&
    targetLayer &&
    approvedPlan.targetLayer !== targetLayer
  ) {
    throw new Error(
      "Approved regeneration plan targetLayer does not match the requested targetLayer.",
    );
  }
  if (
    plan.geometrySignature &&
    plan.geometrySignature !== geometrySignature(projectGeometry)
  ) {
    throw new Error(
      "Approved regeneration plan geometrySignature does not match the supplied projectGeometry.",
    );
  }
  const scope = ensureActionablePlan(plan);
  const baseStore =
    artifactStore ||
    projectGeometry?.metadata?.project_artifact_store ||
    buildProjectArtifactStore({
      projectGeometry,
      ...(drawings ? { drawings } : {}),
      ...(facadeGrammar ? { facadeGrammar } : {}),
      ...(visualPackage ? { visualPackage } : {}),
    });
  const beforeSnapshot = snapshotProjectState({
    label: "before-execute-regeneration",
    projectGeometry,
    validationReport,
    artifactStore: baseStore,
  });
  const nextGeometry = clone(projectGeometry);
  let nextDrawings = ensureDrawings(
    drawings || projectGeometry?.metadata?.drawings || null,
  );
  let nextFacadeGrammar = clone(
    facadeGrammar || projectGeometry?.metadata?.facade_grammar || null,
  );
  let nextVisualPackage = clone(
    visualPackage || projectGeometry?.metadata?.visual_package || null,
  );
  const executedActions = [];
  const refreshedFragments = [];
  const executionWarnings = [];

  if ((scope.drawingFragments || []).length > 0) {
    const generated = await generateScopedDrawings(projectGeometry, scope);
    if (generated.failedFragments.length > 0) {
      throw new Error(
        `Failed to regenerate requested drawing fragments: ${generated.failedFragments.join(
          ", ",
        )}.`,
      );
    }
    nextDrawings = mergeDrawings(nextDrawings, generated.drawings, scope);
    refreshedFragments.push(...generated.refreshedFragments);
    executedActions.push("drawings");
  }

  if ((scope.facadeFragments || []).length > 0) {
    const generatedFacadeGrammar = buildFacadeGrammar(
      projectGeometry,
      styleDNA,
    );
    nextFacadeGrammar = mergeFacadeGrammar(
      nextFacadeGrammar,
      generatedFacadeGrammar,
      scope,
    );
    const refreshedSides = unique(
      (scope.facadeFragments || []).filter((fragmentId) =>
        (generatedFacadeGrammar?.orientations || []).some(
          (entry) =>
            `facade:side:${String(entry.side || "").toLowerCase()}` ===
            fragmentId,
        ),
      ),
    );
    const missingSides = (scope.facadeFragments || []).filter(
      (fragmentId) => !refreshedSides.includes(fragmentId),
    );
    if (missingSides.length > 0) {
      throw new Error(
        `Failed to regenerate requested facade fragments: ${missingSides.join(
          ", ",
        )}.`,
      );
    }
    refreshedFragments.push(...refreshedSides);
    executedActions.push("facade_package");
  }

  if ((scope.visualFragments || []).length > 0) {
    if ((scope.visualFragments || []).length > 1) {
      executionWarnings.push(
        "Visual regeneration currently supports one view per execution. Only the first requested visual fragment was executed.",
      );
    }
    const visualView = (
      scope.visualFragments[0] || "visual:view:hero_3d"
    ).replace("visual:view:", "");
    nextVisualPackage = await buildVisualGenerationPackage(
      projectGeometry,
      styleDNA,
      visualView,
      {
        facadeGrammar: nextFacadeGrammar,
      },
    );
    refreshedFragments.push(`visual:view:${visualView}`);
    executedActions.push("visual_package");
  }

  nextGeometry.metadata = {
    ...(nextGeometry.metadata || {}),
    drawings: nextDrawings,
    facade_grammar: nextFacadeGrammar,
    visual_package: nextVisualPackage,
  };

  const patch = createArtifactStorePatch({
    projectGeometry: nextGeometry,
    drawings: nextDrawings,
    facadeGrammar: nextFacadeGrammar,
    visualPackage: nextVisualPackage,
    readinessMetadata: {
      ready: false,
      status: "stale",
      composeReady: false,
    },
  });
  const nextStore = mergeProjectArtifactStore(baseStore, patch);
  nextGeometry.metadata = {
    ...(nextGeometry.metadata || {}),
    project_artifact_store: nextStore,
  };
  const afterSnapshot = snapshotProjectState({
    label: "after-execute-regeneration",
    projectGeometry: nextGeometry,
    validationReport,
    artifactStore: nextStore,
  });

  return {
    version: "phase7-targeted-regeneration-executor-v1",
    approvedPlan: plan,
    executedActions,
    projectGeometry: nextGeometry,
    drawings: nextDrawings,
    facadeGrammar: nextFacadeGrammar,
    visualPackage: nextVisualPackage,
    artifactStore: nextStore,
    artifactFreshness: summarizeArtifactFreshness(nextStore),
    geometrySignatureBefore: geometrySignature(projectGeometry),
    geometrySignatureAfter: geometrySignature(nextGeometry),
    beforeSnapshot,
    afterSnapshot,
    snapshotDiff: buildProjectSnapshotDiff(beforeSnapshot, afterSnapshot),
    executionWarnings,
    freshnessUpdates: {
      staleFragments: summarizeArtifactFreshness(baseStore).staleFragments,
      refreshedFragments: unique(refreshedFragments),
    },
  };
}

export default {
  executeTargetedRegeneration,
};
