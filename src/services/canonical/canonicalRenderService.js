/**
 * Canonical Render Service
 *
 * Delegates 3D canonical control to CanonicalGeometryPackService (SSOT).
 * No stub behavior: every function resolves against the real canonical pack.
 */

import {
  buildCanonicalPack,
  getCanonicalPack,
  getControlForPanel,
  hasCanonicalPack,
} from "./CanonicalGeometryPackService.js";
import { computeCDSHashSync } from "../validation/cdsHash.js";

// Constants
export const MANDATORY_3D_PANELS = ["hero_3d", "interior_3d", "axonometric"];
export const CANONICAL_3D_VIEWS = ["exterior", "interior", "aerial"];
export const CANONICAL_3D_STRENGTH_POLICY = {
  hero_3d: 0.65,
  interior_3d: 0.65,
  axonometric: 0.55,
};
export const CANONICAL_3D_NEGATIVE_PROMPTS = {
  hero_3d: "blurry, distorted, low quality, watermark",
  interior_3d: "blurry, distorted, low quality, watermark, empty room",
  axonometric:
    "blurry, distorted, low quality, watermark, perspective distortion",
};

const PANEL_TO_VIEW = {
  hero_3d: "exterior",
  interior_3d: "interior",
  axonometric: "aerial",
};

function resolvePack(data) {
  if (!data) return null;

  // Design key / fingerprint path
  if (typeof data === "string") {
    return getCanonicalPack(data);
  }

  // Existing pack / wrapper path
  const fromStore = getCanonicalPack(data);
  if (fromStore) return fromStore;

  // Build pack from provided source object if needed
  const source =
    data.canonicalDesignState || data.cds || data.masterDNA || data.dna || data;
  if (source && !hasCanonicalPack(source)) {
    try {
      return buildCanonicalPack(source, {
        designFingerprint:
          data.designFingerprint || data.designId || source.designId,
      });
    } catch {
      return null;
    }
  }

  return hasCanonicalPack(source) ? getCanonicalPack(source) : null;
}

function buildRenderEntry(pack, panelType, metadata = {}) {
  const dataUrl = getControlForPanel(pack, panelType);
  if (!dataUrl) return null;
  return {
    panelType,
    viewType: PANEL_TO_VIEW[panelType] || "exterior",
    baselineKey: `canonical:${panelType}`,
    dataUrl,
    hash: computeCDSHashSync({ panelType, dataUrl }),
    strength: CANONICAL_3D_STRENGTH_POLICY[panelType] ?? 0.6,
    designFingerprint:
      metadata.designFingerprint || pack?.designFingerprint || null,
    runId: metadata.runId || null,
  };
}

function getStrengthBand(retryAttempt = 0) {
  if (!retryAttempt || retryAttempt <= 0) return "initial";
  return `retry${retryAttempt}`;
}

function getStrengthForAttempt(baseStrength, retryAttempt = 0) {
  const bump = Math.max(0, Number(retryAttempt) || 0) * 0.08;
  return Math.min(0.95, (baseStrength ?? 0.6) + bump);
}

// Functions
export function generateCanonical3DRenders(params = {}) {
  const pack = resolvePack(params);
  if (!pack) return null;

  const designFingerprint =
    params.designFingerprint ||
    params.designId ||
    pack.designFingerprint ||
    null;
  const runId = params.runId || null;
  const panels = {};

  for (const panelType of MANDATORY_3D_PANELS) {
    const entry = buildRenderEntry(pack, panelType, {
      designFingerprint,
      runId,
    });
    if (entry) {
      panels[panelType] = entry;
    }
  }

  return {
    status:
      Object.keys(panels).length === MANDATORY_3D_PANELS.length
        ? "COMPLETE"
        : "PARTIAL",
    designFingerprint,
    geometryHash: pack.geometryHash || null,
    runId,
    generatedAt: new Date().toISOString(),
    panels,
  };
}

export function getCanonical3DRender(renders, panelType) {
  if (!requiresCanonical3DRender(panelType)) return null;

  const direct = renders?.panels?.[panelType];
  if (direct?.dataUrl) {
    return direct;
  }

  const pack = resolvePack(renders);
  if (!pack) return null;
  return buildRenderEntry(pack, panelType, {
    designFingerprint:
      renders?.designFingerprint ||
      renders?.designId ||
      pack?.designFingerprint,
    runId: renders?.runId,
  });
}

export function requireCanonical3DRender(renders, panelType) {
  const resolved = getCanonical3DRender(renders, panelType);
  if (resolved?.dataUrl) return resolved;
  throw new Error(
    `Canonical 3D render is required for "${panelType}" but was not found`,
  );
}

export function requiresCanonical3DRender(panelType) {
  return MANDATORY_3D_PANELS.includes(panelType);
}

export function getCanonical3DInitParams(data, panelType, retryAttempt = 0) {
  if (!requiresCanonical3DRender(panelType)) return null;

  const render = getCanonical3DRender(data, panelType);
  if (!render?.dataUrl) return null;

  const baseStrength = CANONICAL_3D_STRENGTH_POLICY[panelType] ?? 0.6;
  const strengthBand = getStrengthBand(retryAttempt);
  const strength = getStrengthForAttempt(baseStrength, retryAttempt);
  const negativePrompt = CANONICAL_3D_NEGATIVE_PROMPTS[panelType] || "";
  const negative_prompt_additions = negativePrompt
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    init_image: render.dataUrl,
    strength,
    negative_prompt_additions,
    _canonical: {
      baselineKey: render.baselineKey,
      hash: render.hash,
      runId: render.runId || data?.runId || null,
      viewType: render.viewType,
      designFingerprint:
        render.designFingerprint || data?.designFingerprint || null,
      strengthBand,
    },
  };
}

export function buildCanonical3DNegativePrompt(
  panelTypeOrParams,
  baseNegative = "",
) {
  const panelType =
    typeof panelTypeOrParams === "string"
      ? panelTypeOrParams
      : panelTypeOrParams?.panelType;
  const baseFromParams =
    typeof panelTypeOrParams === "object"
      ? panelTypeOrParams.baseNegative || panelTypeOrParams.base || ""
      : "";

  const base = baseNegative || baseFromParams;
  const canonical = CANONICAL_3D_NEGATIVE_PROMPTS[panelType] || "";

  if (!base) return canonical;
  if (!canonical) return base;
  return `${base}, ${canonical}`;
}

export function hasCanonical3DRenders(data) {
  const pack = resolvePack(data);
  if (!pack) return false;
  return MANDATORY_3D_PANELS.every((panelType) =>
    Boolean(getControlForPanel(pack, panelType)),
  );
}

export function getCanonical3DDebugReport(renders) {
  const pack = resolvePack(renders);
  const panelStatus = Object.fromEntries(
    MANDATORY_3D_PANELS.map((panelType) => [
      panelType,
      Boolean(pack && getControlForPanel(pack, panelType)),
    ]),
  );
  return {
    hasPack: Boolean(pack),
    designFingerprint:
      renders?.designFingerprint || pack?.designFingerprint || null,
    geometryHash: pack?.geometryHash || null,
    panelStatus,
  };
}

export function validateCanonical3DRenders(renders) {
  const errors = [];
  const warnings = [];
  const pack = resolvePack(renders);

  if (!pack) {
    errors.push("Canonical pack not found for 3D validation");
    return { valid: false, errors, warnings };
  }

  if (!pack.geometryHash) {
    errors.push("Canonical pack is missing geometryHash");
  }

  for (const panelType of MANDATORY_3D_PANELS) {
    const control = getControlForPanel(pack, panelType);
    if (!control) {
      errors.push(`Missing canonical 3D control for ${panelType}`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

const canonicalRenderServiceExports = {
  MANDATORY_3D_PANELS,
  CANONICAL_3D_VIEWS,
  CANONICAL_3D_STRENGTH_POLICY,
  CANONICAL_3D_NEGATIVE_PROMPTS,
  generateCanonical3DRenders,
  getCanonical3DRender,
  requireCanonical3DRender,
  requiresCanonical3DRender,
  getCanonical3DInitParams,
  buildCanonical3DNegativePrompt,
  hasCanonical3DRenders,
  getCanonical3DDebugReport,
  validateCanonical3DRenders,
};

export default canonicalRenderServiceExports;
