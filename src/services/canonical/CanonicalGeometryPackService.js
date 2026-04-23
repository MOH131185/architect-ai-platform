/**
 * Canonical Geometry Pack Service
 *
 * Builds the canonical technical pack directly from compiled project geometry.
 * Technical SVGs must come from deterministic compiled-project renderers only.
 *
 * The canonical pack is the single source of truth for building geometry.
 * No panel may generate without receiving its canonical SVG as init_image
 * when the `requireCanonicalPack` feature flag is enabled.
 */

import { computeCDSHashSync } from "../validation/cdsHash.js";
import { buildCompiledProjectTechnicalPanels } from "./compiledProjectTechnicalPackBuilder.js";
import { ensureCompiledProjectRenderInputs } from "../compiler/compiledProjectRenderInputs.js";

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class CanonicalPackError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "CanonicalPackError";
    this.code = code;
  }
}

export const ERROR_CODES = {
  MISSING_GEOMETRY: "MISSING_GEOMETRY",
  INVALID_PACK: "INVALID_PACK",
  BUILD_FAILED: "BUILD_FAILED",
  INCOMPLETE_PACK: "INCOMPLETE_PACK",
  HASH_MISMATCH: "HASH_MISMATCH",
};

// ---------------------------------------------------------------------------
// In-memory pack cache (keyed by design fingerprint/design id)
// ---------------------------------------------------------------------------

const canonicalPackStore = new Map();

function normalizeLookupKey(value) {
  if (typeof value !== "string") return null;
  const key = value.trim();
  return key.length > 0 ? key : null;
}

function getLookupKeys(value) {
  const key = normalizeLookupKey(value);
  if (!key) return [];
  const lower = key.toLowerCase();
  return lower === key ? [key] : [key, lower];
}

function cachePack(pack, ...keys) {
  if (!pack) return;
  const candidates = [];
  for (const key of keys) {
    candidates.push(...getLookupKeys(key));
  }
  for (const key of candidates) {
    canonicalPackStore.set(key, pack);
  }
}

function normalizeBuildOptions(options = {}, legacyOptions = undefined) {
  const legacy =
    legacyOptions && typeof legacyOptions === "object" ? legacyOptions : {};

  // Backward compatibility:
  // buildCanonicalPack(cds, "designFingerprint", legacyThirdArgIgnored)
  if (typeof options === "string") {
    return { ...legacy, designFingerprint: options };
  }
  if (!options || typeof options !== "object") {
    return { ...legacy };
  }
  return { ...legacy, ...options };
}

// ---------------------------------------------------------------------------
// Panel type normalization (resolves section naming drift)
// ---------------------------------------------------------------------------

const PANEL_TYPE_ALIASES = {
  section_a_a: "section_AA",
  section_aa: "section_AA",
  section_a: "section_AA",
  section_b_b: "section_BB",
  section_bb: "section_BB",
  section_b: "section_BB",
};

function normalizePanelType(panelType) {
  if (!panelType) return panelType;
  return PANEL_TYPE_ALIASES[panelType] || panelType;
}

function getPanelLookupCandidates(panelType) {
  const normalized = normalizePanelType(panelType);
  if (normalized === "section_AA") {
    return ["section_AA", "section_a_a", "section_aa"];
  }
  if (normalized === "section_BB") {
    return ["section_BB", "section_b_b", "section_bb"];
  }
  return [normalized];
}

export function clearCanonicalPackCache(key) {
  if (!key) {
    canonicalPackStore.clear();
    return;
  }
  for (const lookupKey of getLookupKeys(key)) {
    canonicalPackStore.delete(lookupKey);
  }
}

export function registerCanonicalPack(pack, key) {
  if (!pack) return null;
  cachePack(pack, key, pack.designFingerprint, pack.designId);
  return pack;
}

// ---------------------------------------------------------------------------
// Panel types that receive canonical geometry control
// ---------------------------------------------------------------------------

export const CANONICAL_PANEL_TYPES = [
  "floor_plan_ground",
  "floor_plan_first",
  "floor_plan_level2",
  "floor_plan_level3",
  "elevation_north",
  "elevation_south",
  "elevation_east",
  "elevation_west",
  "section_AA",
  "section_BB",
  "hero_3d",
  "interior_3d",
  "axonometric",
];

// ---------------------------------------------------------------------------
// init_image strength policy per panel type
// ---------------------------------------------------------------------------

const STRENGTH_POLICY = {
  // TIER 1: Deterministic SVG (these values are only used as fallback
  // when threeTierPanelConsistency is disabled and panels go to FLUX)
  floor_plan_ground: 0.15,
  floor_plan_first: 0.15,
  floor_plan_level2: 0.15,
  floor_plan_level3: 0.15,
  elevation_north: 0.35,
  elevation_south: 0.35,
  elevation_east: 0.35,
  elevation_west: 0.35,
  section_AA: 0.15,
  section_BB: 0.15,
  // TIER 2: Geometry-conditioned FLUX for 3D panels
  // Together.ai inverts: imageStrength = 1.0 - strength
  // Lower strength = more adherence to init_image geometry.
  // Now using proper isometric SVG projections (not flat elevation proxies),
  // so we can tighten control for better massing fidelity while FLUX
  // adds materials, lighting, landscaping, and photorealism.
  hero_3d: 0.22, // imageStrength=0.78 → tighter massing from isometric control
  axonometric: 0.18, // imageStrength=0.82 → strict massing for axon diagram
  // TIER 3: Style-guided FLUX (moderate control — creative freedom for interiors)
  interior_3d: 0.3, // imageStrength=0.70 → room layout from floor plan
};

// ---------------------------------------------------------------------------
// SVG → data URL helper
// ---------------------------------------------------------------------------

function svgToDataUrl(svgString) {
  if (!svgString || typeof svgString !== "string") return null;
  try {
    const encoded =
      typeof btoa === "function"
        ? btoa(unescape(encodeURIComponent(svgString)))
        : Buffer.from(svgString, "utf-8").toString("base64");
    return `data:image/svg+xml;base64,${encoded}`;
  } catch {
    return null;
  }
}

function evaluateTechnicalAuthorityReadiness(
  technicalBuild = {},
  technicalPanels = {},
) {
  const validation =
    technicalBuild.compiledProjectSource?.validation ||
    technicalBuild.compiledProject?.validation ||
    {};
  const counts = validation.counts || {};
  const reasons = [];

  const planPanels = Object.entries(technicalPanels).filter(([panelType]) =>
    panelType.startsWith("floor_plan_"),
  );
  const elevationPanels = Object.entries(technicalPanels).filter(
    ([panelType]) => panelType.startsWith("elevation_"),
  );
  const sectionPanels = Object.entries(technicalPanels).filter(([panelType]) =>
    panelType.startsWith("section_"),
  );

  const strongPlanCount = planPanels.filter(([, panel]) => {
    const quality = panel.technicalQualityMetadata || {};
    return (
      quality.geometry_complete === true &&
      Number(quality.room_count || 0) >= 1 &&
      Number(quality.wall_count || 0) >= 4 &&
      Number(quality.slot_occupancy_ratio || 0) >= 0.38
    );
  }).length;

  const strongElevationCount = elevationPanels.filter(([, panel]) => {
    const quality = panel.technicalQualityMetadata || {};
    return (
      quality.geometry_complete === true &&
      String(quality.side_facade_status || "").toLowerCase() !== "block" &&
      Number(quality.window_count || 0) + Number(quality.door_count || 0) >=
        1 &&
      Number(quality.facade_richness_score || 0) >= 0.26
    );
  }).length;

  const strongSectionCount = sectionPanels.filter(([, panel]) => {
    const quality = panel.technicalQualityMetadata || {};
    return (
      quality.geometry_complete === true &&
      (Number(quality.cut_room_count || 0) >= 1 ||
        Number(quality.section_direct_evidence_count || 0) >= 1) &&
      Number(quality.section_usefulness_score || 0) >= 0.22
    );
  }).length;

  if (Number(counts.room_count || 0) < 3) {
    reasons.push(
      "compiled project resolved too few rooms for technical authority",
    );
  }
  if (Number(counts.wall_count || 0) < 6) {
    reasons.push(
      "compiled project resolved too few wall segments for technical authority",
    );
  }
  if (Number(counts.opening_count || 0) < 3) {
    reasons.push(
      "compiled project resolved too few openings for facade authority",
    );
  }
  if (strongPlanCount === 0) {
    reasons.push("no floor plan panel met geometry-complete readiness");
  }
  if (strongElevationCount === 0) {
    reasons.push("no elevation met facade-readiness thresholds");
  }
  if (strongSectionCount === 0) {
    reasons.push("no section panel met section-usefulness readiness");
  }
  if (validation.valid === false) {
    reasons.push("compiled project validation reported blockers");
  }

  const ready = reasons.length === 0;
  const score = Number(
    Math.max(
      0,
      Math.min(
        1,
        (validation.valid === false ? 0 : 0.18) +
          Math.min(0.18, Number(counts.room_count || 0) * 0.0225) +
          Math.min(0.18, Number(counts.wall_count || 0) * 0.0125) +
          Math.min(0.14, Number(counts.opening_count || 0) * 0.0175) +
          Math.min(0.16, strongPlanCount * 0.16) +
          Math.min(0.1, strongElevationCount * 0.05) +
          Math.min(0.06, strongSectionCount * 0.06),
      ),
    ).toFixed(3),
  );

  return {
    ready,
    score,
    reasons,
    counts: {
      ...counts,
      rendered_plan_count: planPanels.length,
      rendered_elevation_count: elevationPanels.length,
      rendered_section_count: sectionPanels.length,
      strong_plan_count: strongPlanCount,
      strong_elevation_count: strongElevationCount,
      strong_section_count: strongSectionCount,
    },
    geometrySourcePath:
      technicalBuild.compiledProjectSource?.metadata?.geometry_source_path ||
      technicalBuild.compiledProject?.metadata?.geometry_source_path ||
      null,
  };
}

// ---------------------------------------------------------------------------
// Build Canonical Pack
// ---------------------------------------------------------------------------

/**
 * Build a canonical geometry pack from a real compiled-project input or wrapper.
 *
 * 1. Resolves a compiled project from CDS/input
 * 2. Generates deterministic compiled-project SVGs (plans/elevations/sections)
 * 3. Converts SVGs to data URLs for use as init_image
 * 4. Computes a geometryHash over all SVG hashes
 * 5. Returns a frozen pack
 *
 * @param {Object} cds - Source wrapper that must resolve to a real compiled project
 * @param {Object} [options]
 * @param {number} [options.scale] - SVG scale (default 80 px/m)
 * @param {number} [options.width] - SVG width (default 1200)
 * @param {number} [options.height] - SVG height (default 900)
 * @returns {Object} Frozen canonical pack
 */
export function buildCanonicalPack(
  cds,
  options = {},
  legacyOptions = undefined,
) {
  if (!cds) {
    throw new CanonicalPackError(
      "A compiled-project source object is required to build canonical pack",
      ERROR_CODES.MISSING_GEOMETRY,
    );
  }

  const normalizedOptions = normalizeBuildOptions(options, legacyOptions);
  const { scale = 80, width = 1200, height = 900 } = normalizedOptions;
  const designFingerprint =
    normalizeLookupKey(normalizedOptions.designFingerprint) ||
    normalizeLookupKey(cds.designFingerprint) ||
    normalizeLookupKey(cds.designId) ||
    normalizeLookupKey(cds.meta?.designFingerprint) ||
    null;
  const technicalBuild = buildCompiledProjectTechnicalPanels(cds, {
    scale,
    width,
    height,
  });

  if (!technicalBuild.ok) {
    const reason = technicalBuild.failures
      .map((failure) => `${failure.panelType}: ${failure.message}`)
      .join("; ");
    const code =
      technicalBuild.failures[0]?.panelType === "compiled_project"
        ? ERROR_CODES.MISSING_GEOMETRY
        : ERROR_CODES.INCOMPLETE_PACK;
    throw new CanonicalPackError(
      `Failed to build canonical technical pack from compiled project: ${reason}`,
      code,
    );
  }

  const createdAt = new Date().toISOString();
  const technicalPanels = technicalBuild.technicalPanels || {};
  const technicalSvgHashes = Object.fromEntries(
    Object.entries(technicalPanels).map(([panelType, panel]) => [
      panelType,
      panel.svgHash,
    ]),
  );
  const technicalSvgBundleHash = computeCDSHashSync(technicalSvgHashes);
  const geometryHash =
    technicalBuild.compiledProjectSource?.geometryHash ||
    technicalBuild.compiledProject?.geometryHash ||
    technicalSvgBundleHash;
  const compiledProjectSchemaVersion =
    technicalBuild.compiledProjectSchemaVersion ||
    technicalBuild.compiledProjectSource?.schema_version ||
    null;
  const technicalAuthority = evaluateTechnicalAuthorityReadiness(
    technicalBuild,
    technicalPanels,
  );
  const cdsHash = cds.hash || computeCDSHashSync(cds);
  const panels = {};

  for (const [panelType, panel] of Object.entries(technicalPanels)) {
    panels[panelType] = {
      ...panel,
      dataUrl: svgToDataUrl(panel.svgString),
      geometryHash,
      generatedAt: createdAt,
      metadata: {
        source: "compiled_project",
        authoritySource: "compiled_project",
        compiledProjectSchemaVersion,
        panelType,
        geometryHash,
        svgHash: panel.svgHash,
        drawingType: panel.drawingType || null,
        technical: true,
      },
    };
  }

  const compiledRenderInputs = ensureCompiledProjectRenderInputs(
    technicalBuild.compiledProjectSource ||
      technicalBuild.compiledProject ||
      {},
    { geometryHash },
  );

  function buildCompiledRenderPanel(panelType) {
    const renderInput = compiledRenderInputs?.[panelType];
    if (!renderInput?.dataUrl && !renderInput?.svgString && !renderInput?.url) {
      throw new CanonicalPackError(
        `Missing compiled-project render input for ${panelType}`,
        ERROR_CODES.INCOMPLETE_PACK,
      );
    }

    const svgHash =
      renderInput.svgHash ||
      (renderInput.svgString
        ? computeCDSHashSync({ panelType, svg: renderInput.svgString })
        : computeCDSHashSync({
            panelType,
            payload: renderInput.dataUrl || renderInput.url,
          }));

    return {
      dataUrl: renderInput.dataUrl || renderInput.url || null,
      svgString: renderInput.svgString || null,
      svgHash,
      width: renderInput.width || null,
      height: renderInput.height || null,
      title: renderInput.title || panelType,
      status: "ready",
      geometryHash,
      generatedAt: createdAt,
      metadata: {
        source: "compiled_project",
        authoritySource: "compiled_project",
        compiledProjectSchemaVersion,
        panelType,
        geometryHash,
        svgHash,
        technical: false,
        sourceType: renderInput.sourceType || "compiled_render_input",
        renderKind: renderInput.metadata?.renderKind || null,
      },
    };
  }

  panels.hero_3d = buildCompiledRenderPanel("hero_3d");
  panels.axonometric = buildCompiledRenderPanel("axonometric");
  panels.interior_3d = buildCompiledRenderPanel("interior_3d");

  const pack = {
    panels,
    geometryHash,
    cdsHash,
    designFingerprint,
    designId: normalizeLookupKey(cds.designId) || null,
    status: Object.keys(technicalPanels).length > 0 ? "COMPLETE" : "EMPTY",
    panelCount: Object.keys(panels).length,
    createdAt,
    metadata: {
      source: "compiled_project",
      authoritySource: "compiled_project",
      compiledProjectSchemaVersion,
      authoritativeGeometryHash: geometryHash,
      technicalSvgBundleHash,
      technicalAuthorityReady: technicalAuthority.ready,
      technicalAuthoritySummary: technicalAuthority,
      compiledProjectValidation:
        technicalBuild.compiledProjectSource?.validation ||
        technicalBuild.compiledProject?.validation ||
        null,
    },
  };

  // Freeze the pack — it should never be mutated after construction
  Object.freeze(pack.metadata);
  Object.freeze(pack);
  Object.freeze(pack.panels);
  for (const p of Object.values(pack.panels)) {
    if (p.metadata) {
      Object.freeze(p.metadata);
    }
    Object.freeze(p);
  }

  cachePack(
    pack,
    designFingerprint,
    cds.designId,
    cds.designFingerprint,
    normalizedOptions.designFingerprint,
  );

  return pack;
}

// ---------------------------------------------------------------------------
// Query functions
// ---------------------------------------------------------------------------

/**
 * Get the canonical control data URL for a specific panel type.
 *
 * @param {Object} pack - Canonical pack from buildCanonicalPack()
 * @param {string} panelType - e.g. "floor_plan_ground", "elevation_north"
 * @returns {string|null} data URL or null if not available
 */
export function getControlForPanel(pack, panelType) {
  if (!pack?.panels) return null;
  const candidates = getPanelLookupCandidates(panelType);
  for (const candidate of candidates) {
    const control = pack.panels[candidate]?.dataUrl;
    if (control) return control;
  }
  return null;
}

/**
 * Get init_image parameters for a panel, including data URL and strength.
 *
 * @param {Object} pack - Canonical pack
 * @param {string} panelType - Panel type
 * @returns {{ init_image: string, strength: number }|null}
 */
export function getInitImageParams(pack, panelType) {
  const normalizedType = normalizePanelType(panelType);

  // Skip geometry init_image for panels that have no meaningful geometry conditioning.
  // NOTE: hero_3d, axonometric, interior_3d are NOW enabled — server-side
  // SVG→PNG rasterization in api/together-image.js handles the conversion
  // that was previously causing Together.ai 500 errors on raw SVG data URLs.
  const SKIP_GEOMETRY = new Set([
    "exterior_front_3d", // No canonical projection available
    "site_diagram", // Site context, not building geometry
    "site_plan", // Site context, not building geometry
  ]);
  if (SKIP_GEOMETRY.has(normalizedType)) {
    return null;
  }

  const dataUrl = getControlForPanel(pack, normalizedType);
  if (!dataUrl) return null;
  const strength = STRENGTH_POLICY[normalizedType] ?? 0.5;
  return { init_image: dataUrl, strength };
}

/**
 * Check whether a canonical pack exists and is complete.
 *
 * @param {Object} data - Object that may contain a canonical pack
 * @returns {boolean}
 */
export function hasCanonicalPack(data) {
  if (!data) return false;
  if (typeof data === "string") {
    return !!getCanonicalPack(data);
  }
  // Direct pack object
  if (data.status === "COMPLETE" && data.geometryHash && data.panels)
    return true;
  // Nested in data.canonicalPack
  if (data.canonicalPack?.status === "COMPLETE") return true;
  return false;
}

/**
 * Retrieve the canonical pack from various container shapes.
 *
 * @param {Object} data
 * @returns {Object|null}
 */
export function getCanonicalPack(data) {
  if (!data) return null;
  if (typeof data === "string") {
    for (const key of getLookupKeys(data)) {
      const cachedPack = canonicalPackStore.get(key);
      if (cachedPack) return cachedPack;
    }
    return null;
  }
  if (data.status === "COMPLETE" && data.geometryHash) return data;
  if (data.canonicalPack?.status === "COMPLETE") return data.canonicalPack;
  if (data.designFingerprint) {
    for (const key of getLookupKeys(data.designFingerprint)) {
      const cachedPack = canonicalPackStore.get(key);
      if (cachedPack) return cachedPack;
    }
  }
  if (data.designId) {
    for (const key of getLookupKeys(data.designId)) {
      const cachedPack = canonicalPackStore.get(key);
      if (cachedPack) return cachedPack;
    }
  }
  return null;
}

/**
 * Validate a canonical pack for completeness.
 *
 * @param {Object} pack
 * @returns {{ valid: boolean, missing: string[], errors: string[] }}
 */
export function validateControlPack(pack) {
  const errors = [];
  const missing = [];

  if (!pack) {
    errors.push("Pack is null");
    return { valid: false, missing, errors };
  }

  if (pack.status !== "COMPLETE") {
    errors.push(`Pack status is '${pack.status}', expected 'COMPLETE'`);
  }

  if (!pack.geometryHash) {
    errors.push("Pack is missing geometryHash");
  }

  // Check for minimum required panels: at least ground floor plan + 2 elevations + 1 section
  const required = [
    "floor_plan_ground",
    "elevation_north",
    "elevation_south",
    "section_AA",
  ];
  for (const pt of required) {
    if (!getControlForPanel(pack, pt)) {
      missing.push(pt);
    }
  }

  if (missing.length > 0) {
    errors.push(`Missing required panels: ${missing.join(", ")}`);
  }

  return { valid: errors.length === 0, missing, errors };
}

// ---------------------------------------------------------------------------
// Default export (backward compat)
// ---------------------------------------------------------------------------

const CanonicalGeometryPackServiceExports = {
  CanonicalPackError,
  ERROR_CODES,
  CANONICAL_PANEL_TYPES,
  hasCanonicalPack,
  buildCanonicalPack,
  getCanonicalPack,
  getControlForPanel,
  getInitImageParams,
  validateControlPack,
  registerCanonicalPack,
  clearCanonicalPackCache,
};
export default CanonicalGeometryPackServiceExports;
