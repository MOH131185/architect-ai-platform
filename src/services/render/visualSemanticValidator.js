export const VISUAL_SEMANTIC_QA_VERSION = "visual-semantic-qa-v1";

const REQUIRED_VISUAL_PANEL_TYPES = [
  "hero_3d",
  "exterior_render",
  "axonometric",
  "interior_3d",
];

function normalizeArtifactCollection(panelArtifacts = {}) {
  if (Array.isArray(panelArtifacts)) return panelArtifacts.filter(Boolean);
  if (!panelArtifacts || typeof panelArtifacts !== "object") return [];
  return Object.values(panelArtifacts).filter(Boolean);
}

function findPanelArtifact(panelArtifacts = {}, panelType) {
  return normalizeArtifactCollection(panelArtifacts).find(
    (artifact) =>
      artifact?.panel_type === panelType || artifact?.panelType === panelType,
  );
}

function normalizeClassification(classification = null) {
  if (!classification || typeof classification !== "object") {
    return {};
  }
  const viewClass = String(
    classification.viewClass ||
      classification.view_type ||
      classification.viewType ||
      classification.label ||
      "",
  )
    .trim()
    .toLowerCase();
  return {
    ...classification,
    viewClass,
    isExterior:
      classification.isExterior === true ||
      classification.exterior === true ||
      viewClass === "exterior",
    isInterior:
      classification.isInterior === true ||
      classification.interior === true ||
      viewClass === "interior",
    isAxonometric:
      classification.isAxonometric === true ||
      classification.isIsometric === true ||
      classification.axonometric === true ||
      classification.isometric === true ||
      viewClass === "axonometric" ||
      viewClass === "isometric",
    materialIdentityConflicts:
      classification.materialIdentityConflicts ||
      classification.identityConflicts ||
      (classification.materialConflict ? ["material_conflict"] : []),
  };
}

function defaultClassificationForPanel(panelType, artifact = null) {
  const metadata = artifact?.metadata || {};
  const explicit =
    metadata.visualSemanticClassification ||
    metadata.semanticClassification ||
    artifact?.visualSemanticClassification ||
    artifact?.semanticClassification ||
    null;
  if (explicit) {
    return normalizeClassification(explicit);
  }
  const controlViewType = String(
    artifact?.controlViewType ||
      metadata.controlViewType ||
      metadata.renderKind ||
      "",
  ).toLowerCase();
  if (controlViewType.includes("interior")) {
    return normalizeClassification({
      viewClass: "interior",
      source: "control_view_type",
      confidence: 1,
    });
  }
  if (
    controlViewType.includes("axonometric") ||
    controlViewType.includes("isometric")
  ) {
    return normalizeClassification({
      viewClass: "axonometric",
      source: "control_view_type",
      confidence: 1,
    });
  }
  if (controlViewType.includes("exterior") || panelType !== "interior_3d") {
    return normalizeClassification({
      viewClass: "exterior",
      source: "control_view_type",
      confidence: 1,
    });
  }
  return normalizeClassification({ viewClass: "unknown", confidence: 0 });
}

function buildBlocker(panelType, code, message, details = {}) {
  return {
    panelType,
    code,
    severity: "error",
    message,
    details,
  };
}

function evaluatePanel(panelType, artifact, classification) {
  const blockers = [];
  if (!artifact) {
    blockers.push(
      buildBlocker(
        panelType,
        "VISUAL_SEMANTIC_PANEL_MISSING",
        "Visual semantic QA could not find a required visual panel artifact.",
      ),
    );
    return blockers;
  }
  if (panelType === "interior_3d") {
    if (classification.isExterior || !classification.isInterior) {
      blockers.push(
        buildBlocker(
          panelType,
          "VISUAL_SEMANTIC_INTERIOR_CLASSIFIED_EXTERIOR",
          "The interior_3d panel was classified as exterior or not confidently interior.",
          { classification },
        ),
      );
    }
  } else if (panelType === "axonometric") {
    if (!classification.isAxonometric) {
      blockers.push(
        buildBlocker(
          panelType,
          "VISUAL_SEMANTIC_AXONOMETRIC_CLASS_MISMATCH",
          "The axonometric panel was not classified as axonometric/isometric.",
          { classification },
        ),
      );
    }
  } else if (!classification.isExterior) {
    blockers.push(
      buildBlocker(
        panelType,
        "VISUAL_SEMANTIC_EXTERIOR_CLASS_MISMATCH",
        "An exterior visual panel was not classified as exterior.",
        { classification },
      ),
    );
  }

  const materialConflicts = Array.isArray(
    classification.materialIdentityConflicts,
  )
    ? classification.materialIdentityConflicts.filter(Boolean)
    : [];
  if (materialConflicts.length > 0) {
    blockers.push(
      buildBlocker(
        panelType,
        "VISUAL_SEMANTIC_MATERIAL_IDENTITY_CONFLICT",
        "Visual panel material identity conflicts with the visual manifest.",
        { materialConflicts },
      ),
    );
  }
  return blockers;
}

export function evaluateVisualSemanticQa({
  panelArtifacts = {},
  visualManifest = null,
  classifier = null,
  strictMode = false,
} = {}) {
  const panels = {};
  const blockers = [];
  const warnings = [];

  for (const panelType of REQUIRED_VISUAL_PANEL_TYPES) {
    const artifact = findPanelArtifact(panelArtifacts, panelType);
    let classification = null;
    if (typeof classifier === "function") {
      classification = normalizeClassification(
        classifier(panelType, artifact, visualManifest),
      );
    } else {
      classification = defaultClassificationForPanel(panelType, artifact);
    }
    const panelBlockers = evaluatePanel(panelType, artifact, classification);
    blockers.push(...panelBlockers);
    panels[panelType] = {
      status: panelBlockers.length ? (strictMode ? "fail" : "warning") : "pass",
      controlViewType:
        artifact?.controlViewType ||
        artifact?.metadata?.controlViewType ||
        null,
      classification,
      blockerCodes: panelBlockers.map((blocker) => blocker.code),
    };
  }

  if (blockers.length && !strictMode) {
    warnings.push(
      "Visual semantic mismatches detected; strict mode is off so the report is warning-only.",
    );
  }

  return {
    version: VISUAL_SEMANTIC_QA_VERSION,
    status: blockers.length ? (strictMode ? "fail" : "warning") : "pass",
    severity: blockers.length ? (strictMode ? "error" : "warning") : "info",
    strictMode,
    summary: {
      totalPanels: REQUIRED_VISUAL_PANEL_TYPES.length,
      blockerCount: blockers.length,
      warningCount: warnings.length,
    },
    panels,
    blockers,
    warnings,
  };
}

export default {
  VISUAL_SEMANTIC_QA_VERSION,
  evaluateVisualSemanticQa,
};
