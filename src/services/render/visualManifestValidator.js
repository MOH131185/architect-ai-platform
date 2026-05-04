/**
 * Phase 5B — Visual Identity Validator (post-render).
 *
 * The visual identity manifest (Phase D) and the SheetDesignContext
 * (Phase 1) are injected into every visual-panel prompt. That guarantees
 * the *intent* shared across hero_3d / exterior_render / axonometric /
 * interior_3d, but it does not guarantee the rendered PNGs/SVGs actually
 * preserve that identity. Phase 5B adds a deterministic, cheap, post-
 * render validator that reads what panel artifacts now carry and produces
 * a `visualIdentityValidation` report.
 *
 * Scope (intentionally narrow for this phase):
 *   - panel exists and has the expected `panel_type`
 *   - panel dimensions are positive numbers
 *   - panel content is non-blank (`svgString` contains at least one
 *     drawing primitive: <path>, <polygon>, <rect>, <polyline>, <circle>,
 *     or <image>; image-render panels also must report a non-trivial
 *     `imageRenderByteLength`)
 *   - panel `metadata.visualManifestHash` matches the build-time manifest
 *     and is identical across all four panels
 *   - panel `metadata.visualManifestId` is set
 *   - panel `metadata.visualIdentityLocked === true`
 *   - sheet `metadata.sheetDesignContextHash` matches the build-time
 *     SheetDesignContext (sheet-level, not per-panel — only the sheet
 *     artifact stamps the context hash today)
 *
 * Out of scope here (called out so the next phase has a clear hook):
 *   - decoding rendered PNGs to sample dominant colours
 *   - perceptual edge-density / storey-count proofs
 *   - regenerating non-conforming panels
 *   - blocking the export gate (warning-only by default; strict mode is a
 *     separate, opt-in flag described in `evaluateVisualIdentity()`)
 *
 * The validator is pure and synchronous. It returns a structured report
 * that the slice service attaches to `sheetArtifact.metadata` and to the
 * top-level `artifacts.visualIdentityValidation` slot.
 */

export const VISUAL_MANIFEST_VALIDATOR_VERSION = "visual-manifest-validator-v1";

export const REQUIRED_VISUAL_PANEL_TYPES = Object.freeze([
  "hero_3d",
  "exterior_render",
  "axonometric",
  "interior_3d",
]);

const MIN_NON_BLANK_SVG_LENGTH = 200;
const MIN_PHOTOREAL_PNG_BYTES = 1024;

const DRAWING_PRIMITIVE_PATTERN =
  /<(?:path|polygon|polyline|rect|circle|image|line|ellipse)\b/i;

const SEVERITY_INFO = "info";
const SEVERITY_WARNING = "warning";
const SEVERITY_ERROR = "error";

const SEVERITY_RANK = Object.freeze({
  [SEVERITY_INFO]: 0,
  [SEVERITY_WARNING]: 1,
  [SEVERITY_ERROR]: 2,
});

function bumpSeverity(current, candidate) {
  return SEVERITY_RANK[candidate] > SEVERITY_RANK[current]
    ? candidate
    : current;
}

function isPositiveNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
}

function looksLikePhotorealRender(panel) {
  const meta = panel?.metadata || {};
  if (meta.visualRenderMode === "photoreal_image_gen") return true;
  if (meta.imageProviderUsed === "openai") return true;
  if (Number(meta.imageRenderByteLength || 0) > 0) return true;
  return false;
}

function isDeterministicFallback(panel) {
  const meta = panel?.metadata || {};
  if (meta.visualRenderMode === "deterministic_fallback") return true;
  if (meta.imageRenderFallback === true) return true;
  return false;
}

function panelKey(panel, fallback) {
  return panel?.panel_type || panel?.panelType || fallback || "unknown_panel";
}

/**
 * Validate a single visual-panel artifact against the manifest.
 * Pure: returns a per-panel report with structured checks and severity.
 *
 * @param {object} params
 * @param {string} params.panelType - one of REQUIRED_VISUAL_PANEL_TYPES
 * @param {object|null} params.panel - panel artifact (or null when missing)
 * @param {string} params.expectedManifestHash
 * @param {string|null} params.expectedManifestId
 * @returns {{ panelType: string, status: "pass"|"warning"|"fail", severity: string, checks: object, warnings: string[] }}
 */
export function validateVisualPanelArtifact({
  panelType,
  panel,
  expectedManifestHash,
  expectedManifestId,
}) {
  const checks = {
    panelExists: false,
    panelTypeMatches: false,
    dimensionsValid: false,
    nonBlankContent: false,
    manifestHashMatches: false,
    manifestIdMatches: false,
    visualIdentityLocked: false,
  };
  const warnings = [];
  let severity = SEVERITY_INFO;

  if (!panel || typeof panel !== "object") {
    warnings.push(`Panel artifact missing for ${panelType}.`);
    return {
      panelType,
      status: "fail",
      severity: SEVERITY_ERROR,
      checks,
      warnings,
    };
  }

  checks.panelExists = true;
  const actualType = panelKey(panel, panelType);
  checks.panelTypeMatches = actualType === panelType;
  if (!checks.panelTypeMatches) {
    warnings.push(
      `Panel ${panelType} reports panel_type="${actualType}" — does not match expected slot.`,
    );
    severity = bumpSeverity(severity, SEVERITY_WARNING);
  }

  const width = Number(panel.width || panel.metadata?.width || 0);
  const height = Number(panel.height || panel.metadata?.height || 0);
  checks.dimensionsValid = isPositiveNumber(width) && isPositiveNumber(height);
  if (!checks.dimensionsValid) {
    warnings.push(
      `Panel ${panelType} has invalid dimensions: ${width}x${height}.`,
    );
    severity = bumpSeverity(severity, SEVERITY_WARNING);
  }

  const svgString = String(panel.svgString || "");
  const hasPrimitive = DRAWING_PRIMITIVE_PATTERN.test(svgString);
  const meetsLengthFloor = svgString.length >= MIN_NON_BLANK_SVG_LENGTH;
  const photorealByteFloorOk =
    !looksLikePhotorealRender(panel) ||
    Number(panel.metadata?.imageRenderByteLength || 0) >=
      MIN_PHOTOREAL_PNG_BYTES;
  checks.nonBlankContent =
    Boolean(svgString) &&
    hasPrimitive &&
    meetsLengthFloor &&
    photorealByteFloorOk;
  if (!checks.nonBlankContent) {
    if (!svgString) {
      warnings.push(`Panel ${panelType} svgString is empty.`);
    } else if (!hasPrimitive) {
      warnings.push(
        `Panel ${panelType} svgString contains no drawing primitives.`,
      );
    } else if (!meetsLengthFloor) {
      warnings.push(
        `Panel ${panelType} svgString below non-blank floor (${svgString.length} < ${MIN_NON_BLANK_SVG_LENGTH}).`,
      );
    } else if (!photorealByteFloorOk) {
      warnings.push(
        `Panel ${panelType} reports photoreal render but PNG byte length below floor (${panel.metadata?.imageRenderByteLength || 0} < ${MIN_PHOTOREAL_PNG_BYTES}).`,
      );
    }
    severity = bumpSeverity(severity, SEVERITY_WARNING);
  }

  const manifestHash = panel.metadata?.visualManifestHash || null;
  checks.manifestHashMatches = Boolean(
    manifestHash &&
    expectedManifestHash &&
    manifestHash === expectedManifestHash,
  );
  if (!checks.manifestHashMatches) {
    if (!manifestHash) {
      warnings.push(
        `Panel ${panelType} is missing metadata.visualManifestHash.`,
      );
    } else if (!expectedManifestHash) {
      warnings.push(
        `Panel ${panelType} carries metadata.visualManifestHash="${manifestHash}" but no manifest hash was provided to the validator.`,
      );
    } else {
      warnings.push(
        `Panel ${panelType} metadata.visualManifestHash mismatch (got "${manifestHash}", expected "${expectedManifestHash}").`,
      );
    }
    severity = bumpSeverity(severity, SEVERITY_WARNING);
  }

  const manifestId = panel.metadata?.visualManifestId || null;
  checks.manifestIdMatches = Boolean(
    manifestId && expectedManifestId && manifestId === expectedManifestId,
  );
  if (!checks.manifestIdMatches && expectedManifestId) {
    if (!manifestId) {
      warnings.push(`Panel ${panelType} is missing metadata.visualManifestId.`);
    } else {
      warnings.push(
        `Panel ${panelType} metadata.visualManifestId mismatch (got "${manifestId}", expected "${expectedManifestId}").`,
      );
    }
    severity = bumpSeverity(severity, SEVERITY_WARNING);
  }

  checks.visualIdentityLocked = panel.metadata?.visualIdentityLocked === true;
  if (!checks.visualIdentityLocked) {
    warnings.push(
      `Panel ${panelType} metadata.visualIdentityLocked is not true.`,
    );
    severity = bumpSeverity(severity, SEVERITY_WARNING);
  }

  let status = "pass";
  if (severity === SEVERITY_ERROR) status = "fail";
  else if (severity === SEVERITY_WARNING) status = "warning";

  return {
    panelType,
    status,
    severity,
    checks,
    warnings,
    visualRenderMode: panel.metadata?.visualRenderMode || null,
    visualFidelityStatus: panel.metadata?.visualFidelityStatus || null,
    deterministicFallback: isDeterministicFallback(panel),
    photoreal: looksLikePhotorealRender(panel),
  };
}

/**
 * Top-level validator: takes the build-time manifest + sheetDesignContext
 * + the four rendered visual panels and returns a structured report that
 * the slice service can stamp onto sheet/artifacts metadata.
 *
 * The validator is **report-only** by default. The optional `strictMode`
 * flag (typically wired to `process.env.PROJECT_GRAPH_VISUAL_IDENTITY_STRICT`)
 * promotes warnings to error severity so an external export gate can
 * choose to demote — but this validator never throws and never decides
 * for the gate. It only reports.
 *
 * @param {object} params
 * @param {object|null} params.visualManifest - manifest from buildVisualManifest()
 * @param {object|null} params.sheetDesignContext - context from buildSheetDesignContext()
 * @param {string|null} params.sheetDesignContextHash - optional explicit hash
 *        if the slice service has it readily available; falls back to
 *        sheetDesignContext?.contextHash.
 * @param {object} params.panelArtifacts - { hero_3d, exterior_render, axonometric, interior_3d }
 * @param {object|null} params.sheetMetadata - sheet artifact metadata; used to
 *        verify sheetDesignContextHash on the sheet (per-panel hash is not
 *        currently stamped, only the sheet stamps it).
 * @param {object} [params.options]
 * @param {boolean} [params.options.strictMode=false]
 * @returns {object} report
 */
export function evaluateVisualIdentity({
  visualManifest = null,
  sheetDesignContext = null,
  sheetDesignContextHash = null,
  panelArtifacts = {},
  sheetMetadata = null,
  options = {},
} = {}) {
  const strictMode = options.strictMode === true;
  const expectedManifestHash = visualManifest?.manifestHash || null;
  const expectedManifestId = visualManifest?.manifestId || null;
  const expectedSheetDesignContextHash =
    sheetDesignContextHash || sheetDesignContext?.contextHash || null;

  const panels = {};
  let totalWarnings = 0;
  let topSeverity = SEVERITY_INFO;
  let missingPanels = 0;
  let warningPanels = 0;
  let passedPanels = 0;
  const allManifestHashes = new Set();

  for (const panelType of REQUIRED_VISUAL_PANEL_TYPES) {
    const panel = panelArtifacts ? panelArtifacts[panelType] : null;
    const report = validateVisualPanelArtifact({
      panelType,
      panel,
      expectedManifestHash,
      expectedManifestId,
    });
    panels[panelType] = report;
    totalWarnings += report.warnings.length;
    topSeverity = bumpSeverity(topSeverity, report.severity);
    if (!report.checks.panelExists) missingPanels += 1;
    else if (report.status === "warning") warningPanels += 1;
    else if (report.status === "pass") passedPanels += 1;
    if (panel?.metadata?.visualManifestHash) {
      allManifestHashes.add(panel.metadata.visualManifestHash);
    }
  }

  const sheetWarnings = [];
  const sheetChecks = {
    manifestPresent: Boolean(visualManifest && expectedManifestHash),
    sheetDesignContextHashMatches: false,
    crossPanelManifestHashUnique: allManifestHashes.size <= 1,
  };
  if (!sheetChecks.manifestPresent) {
    sheetWarnings.push(
      "visualManifest is missing or has no manifestHash; cannot validate identity.",
    );
    topSeverity = bumpSeverity(topSeverity, SEVERITY_WARNING);
  }

  const sheetActualContextHash = sheetMetadata?.sheetDesignContextHash || null;
  sheetChecks.sheetDesignContextHashMatches = Boolean(
    expectedSheetDesignContextHash &&
    sheetActualContextHash &&
    sheetActualContextHash === expectedSheetDesignContextHash,
  );
  if (!sheetChecks.sheetDesignContextHashMatches) {
    if (!expectedSheetDesignContextHash) {
      sheetWarnings.push(
        "No SheetDesignContext hash was provided; cannot assert sheet-level identity hash.",
      );
    } else if (!sheetActualContextHash) {
      sheetWarnings.push("Sheet metadata is missing sheetDesignContextHash.");
    } else {
      sheetWarnings.push(
        `Sheet metadata.sheetDesignContextHash mismatch (got "${sheetActualContextHash}", expected "${expectedSheetDesignContextHash}").`,
      );
    }
    topSeverity = bumpSeverity(topSeverity, SEVERITY_WARNING);
  }

  if (!sheetChecks.crossPanelManifestHashUnique) {
    sheetWarnings.push(
      `Visual panels carry ${allManifestHashes.size} distinct visualManifestHash values: [${Array.from(allManifestHashes).join(", ")}]. All four panels must share one identity.`,
    );
    topSeverity = bumpSeverity(topSeverity, SEVERITY_WARNING);
  }

  const flatWarnings = [];
  for (const panelType of REQUIRED_VISUAL_PANEL_TYPES) {
    panels[panelType].warnings.forEach((w) =>
      flatWarnings.push(`[${panelType}] ${w}`),
    );
  }
  sheetWarnings.forEach((w) => flatWarnings.push(`[sheet] ${w}`));

  let finalSeverity = topSeverity;
  if (strictMode && finalSeverity === SEVERITY_WARNING) {
    finalSeverity = SEVERITY_ERROR;
  }

  let status = "pass";
  if (finalSeverity === SEVERITY_ERROR) status = "fail";
  else if (finalSeverity === SEVERITY_WARNING) status = "warning";

  return {
    version: VISUAL_MANIFEST_VALIDATOR_VERSION,
    status,
    severity: finalSeverity,
    strictMode,
    expectedManifestHash,
    expectedManifestId,
    expectedSheetDesignContextHash,
    sheetActualContextHash,
    summary: {
      totalPanels: REQUIRED_VISUAL_PANEL_TYPES.length,
      passedPanels,
      warningPanels,
      missingPanels,
      totalWarnings,
      distinctManifestHashes: allManifestHashes.size,
    },
    sheetChecks,
    sheetWarnings,
    panels,
    warnings: flatWarnings,
  };
}

export default {
  VISUAL_MANIFEST_VALIDATOR_VERSION,
  REQUIRED_VISUAL_PANEL_TYPES,
  evaluateVisualIdentity,
  validateVisualPanelArtifact,
};
