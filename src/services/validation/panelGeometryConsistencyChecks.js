/**
 * Phase 4 — 2D/3D panel geometry + material consistency.
 *
 * Phase 1–3 fixed the export transport (compact-reference route, magic-byte
 * truth), engineering-bundle hydration (manifest + restored-history gate),
 * and A1 layout / QA blocking. Phase 4 enforces that every 2D and 3D panel
 * on the A1 print master shares the same authority — a single compiled
 * project, a single visual manifest, a coherent material palette, and
 * domain-level agreement on the building's storey count, roof, entrance,
 * openings, and primary materials.
 *
 * Mismatches surface as structured codes that `a1FinalExportContract`'s
 * gate folds into the existing `evaluateFinalA1ExportGate` aggregator,
 * which in turn lights up Phase 3's `a1ExportQa` field and the UI
 * "A1 export blocked / warning" banner. The module is intentionally
 * dependency-free (no rendering, no IO) so the gate stays deterministic
 * and unit-testable.
 *
 * The validator is silent when given empty / missing inputs (returns
 * `evaluated: false`), so call sites that don't yet opt into Phase 4
 * (e.g. the multi-panel V2 path) keep their previous gate result.
 */

const PHASE_4_PANEL_CONSISTENCY_VERSION = "phase-4-panel-consistency-v1";

// Panel types that MUST carry 3D-render metadata (visualManifestHash,
// materialPaletteHash, camera/view). Mirrors visualManifestValidator's
// implicit list (hero_3d / exterior_render / interior_3d / axonometric).
const PANEL_TYPES_3D = Object.freeze([
  "hero_3d",
  "exterior_render",
  "interior_3d",
  "axonometric",
]);

// Panel types that contribute 2D drawing authority — all derived from
// the compiled project's deterministic technical SVGs.
const PANEL_TYPE_2D_PREFIXES = Object.freeze([
  "floor_plan_",
  "elevation_",
  "section_",
  "site_diagram",
  "site_plan",
]);

const STRUCTURED_CODES = Object.freeze({
  PANEL_GEOMETRY_HASH_MISMATCH: "PANEL_GEOMETRY_HASH_MISMATCH",
  PANEL_GEOMETRY_HASH_MISSING: "PANEL_GEOMETRY_HASH_MISSING",
  VISUAL_MANIFEST_HASH_MISMATCH: "VISUAL_MANIFEST_HASH_MISMATCH",
  VISUAL_MANIFEST_HASH_MISSING: "VISUAL_MANIFEST_HASH_MISSING",
  MATERIAL_PALETTE_HASH_MISSING: "MATERIAL_PALETTE_HASH_MISSING",
  MATERIAL_PALETTE_HASH_MISMATCH: "MATERIAL_PALETTE_HASH_MISMATCH",
  CAMERA_VIEW_METADATA_MISSING: "CAMERA_VIEW_METADATA_MISSING",
  FLOOR_COUNT_MISMATCH: "FLOOR_COUNT_MISMATCH",
  ROOF_TYPE_MISMATCH: "ROOF_TYPE_MISMATCH",
  ENTRANCE_ORIENTATION_MISMATCH: "ENTRANCE_ORIENTATION_MISMATCH",
  PRIMARY_FACADE_MATERIAL_MISMATCH: "PRIMARY_FACADE_MATERIAL_MISMATCH",
  OPENING_COUNT_MISMATCH: "OPENING_COUNT_MISMATCH",
});

function normalize(value) {
  if (value === null || value === undefined) return null;
  const str = String(value).trim().toLowerCase();
  return str.length > 0 ? str : null;
}

function isPanel3D(panelType) {
  return PANEL_TYPES_3D.includes(String(panelType || ""));
}

function isPanel2D(panelType) {
  const key = String(panelType || "");
  return PANEL_TYPE_2D_PREFIXES.some(
    (prefix) => key === prefix || key.startsWith(prefix),
  );
}

function readPanelGeometryHash(panel) {
  if (!panel || typeof panel !== "object") return null;
  return (
    normalize(panel.geometryHash) ||
    normalize(panel.sourceGeometryHash) ||
    normalize(panel.source_model_hash) ||
    normalize(panel.sourceModelHash) ||
    normalize(panel.metadata?.geometryHash) ||
    normalize(panel.metadata?.sourceGeometryHash) ||
    normalize(panel.metadata?.source_model_hash) ||
    null
  );
}

function readPanelVisualManifestHash(panel) {
  if (!panel || typeof panel !== "object") return null;
  return (
    normalize(panel.visualManifestHash) ||
    normalize(panel.metadata?.visualManifestHash) ||
    null
  );
}

function readPanelMaterialPaletteHash(panel) {
  if (!panel || typeof panel !== "object") return null;
  return (
    normalize(panel.materialPaletteHash) ||
    normalize(panel.paletteHash) ||
    normalize(panel.metadata?.materialPaletteHash) ||
    normalize(panel.metadata?.paletteHash) ||
    null
  );
}

function readPanelCameraView(panel) {
  if (!panel || typeof panel !== "object") return null;
  const metadata = panel.metadata || {};
  const camera =
    panel.cameraId ||
    panel.camera_id ||
    panel.viewId ||
    panel.view_id ||
    metadata.cameraId ||
    metadata.camera_id ||
    metadata.viewId ||
    metadata.view_id;
  const direction =
    panel.viewDirection ||
    panel.view_direction ||
    metadata.viewDirection ||
    metadata.view_direction;
  if (!camera && !direction) return null;
  return { camera: camera || null, direction: direction || null };
}

function panelType(panel) {
  if (!panel || typeof panel !== "object") return null;
  return panel.panel_type || panel.panelType || panel.type || null;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return Object.values(value);
  return [];
}

function manifestStoreyCount(visualManifest) {
  if (!visualManifest) return null;
  const value = Number(visualManifest.storeyCount);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function compiledLevelCount(compiledProject) {
  if (!compiledProject) return null;
  const levels = compiledProject.levels;
  if (Array.isArray(levels) && levels.length > 0) return levels.length;
  const fallback = Number(
    compiledProject.levelCount ||
      compiledProject.storeyCount ||
      compiledProject.metadata?.storeyCount,
  );
  return Number.isFinite(fallback) && fallback > 0 ? fallback : null;
}

function manifestRoofForm(visualManifest) {
  return (
    normalize(visualManifest?.roof?.form) ||
    normalize(visualManifest?.roof?.type) ||
    null
  );
}

function compiledRoofForm(compiledProject) {
  return (
    normalize(compiledProject?.roof?.form) ||
    normalize(compiledProject?.roof?.type) ||
    normalize(compiledProject?.massing?.roof?.form) ||
    null
  );
}

function compiledEntranceOrientation(compiledProject, projectGeometry) {
  return (
    normalize(compiledProject?.entranceOrientation) ||
    normalize(compiledProject?.metadata?.entranceOrientation) ||
    normalize(projectGeometry?.entranceOrientation) ||
    null
  );
}

function compiledOpeningCount(compiledProject, projectGeometry) {
  const openings = compiledProject?.openings;
  if (Array.isArray(openings)) return openings.length;
  const geomCount = Number(
    projectGeometry?.openingCount || projectGeometry?.openings?.length,
  );
  if (Number.isFinite(geomCount) && geomCount >= 0) return geomCount;
  return null;
}

function manifestOpeningCount(visualManifest) {
  // The window rhythm fingerprint encodes per-bay window counts; total
  // is the sum. When the fingerprint is absent we fall back to explicit
  // counts on the manifest.
  const fingerprint = visualManifest?.windowRhythmFingerprint;
  if (Array.isArray(fingerprint)) {
    return fingerprint.reduce(
      (sum, n) => (Number.isFinite(Number(n)) ? sum + Number(n) : sum),
      0,
    );
  }
  const explicit = Number(
    visualManifest?.openingCount ||
      visualManifest?.windowCount ||
      visualManifest?.metadata?.openingCount,
  );
  return Number.isFinite(explicit) && explicit >= 0 ? explicit : null;
}

function manifestPrimaryMaterial(visualManifest) {
  return (
    normalize(visualManifest?.primaryFacadeMaterial?.name) ||
    normalize(visualManifest?.primaryFacadeMaterial) ||
    normalize(visualManifest?.materials?.[0]?.name) ||
    null
  );
}

function palettePrimaryMaterial(materialPalette) {
  if (!materialPalette) return null;
  // Common shapes the slice service hands us — try each before declaring
  // the palette doesn't have a primary.
  return (
    normalize(materialPalette.primary?.name) ||
    normalize(materialPalette.primaryFacade?.name) ||
    normalize(materialPalette.primary) ||
    normalize(materialPalette.facade?.primary) ||
    normalize(materialPalette.facade) ||
    normalize(materialPalette.materials?.[0]?.name) ||
    null
  );
}

function paletteHash(materialPalette) {
  if (!materialPalette || typeof materialPalette !== "object") return null;
  return (
    normalize(materialPalette.hash) ||
    normalize(materialPalette.paletteHash) ||
    normalize(materialPalette.materialPaletteHash) ||
    normalize(materialPalette.id) ||
    null
  );
}

/**
 * Run the 2D/3D panel geometry + material consistency suite.
 *
 * @param {Object} args
 * @param {Object} [args.compiledProject]  authority (geometryHash, levels, …)
 * @param {Object} [args.visualManifest]   visualManifestService output
 * @param {Object} [args.materialPalette]  resolved material palette
 * @param {Array|Object} [args.panels]     panel artifacts (3D + 2D)
 * @param {Object} [args.drawings]         { plan, elevation, section } arrays
 * @param {Object} [args.projectGeometry]  projectGraph geometry summary
 * @returns {{
 *   evaluated: boolean,
 *   status: "pass" | "warning" | "blocked",
 *   blockers: string[],
 *   warnings: string[],
 *   codes: string[],
 *   mismatches: object,
 * }}
 */
export function runPanelGeometryConsistencyChecks({
  compiledProject = null,
  visualManifest = null,
  materialPalette = null,
  panels = null,
  drawings = null,
  projectGeometry = null,
} = {}) {
  const blockers = [];
  const warnings = [];
  const codes = new Set();
  const mismatches = {
    geometryHash: [],
    visualManifestHash: [],
    materialPaletteHash: [],
    cameraView: [],
    floorCount: null,
    roofType: null,
    entranceOrientation: null,
    primaryMaterial: null,
    openingCount: null,
  };

  const expectedGeometryHash =
    normalize(compiledProject?.geometryHash) ||
    normalize(visualManifest?.geometryHash) ||
    null;
  const expectedVisualManifestHash =
    normalize(visualManifest?.manifestHash) || null;
  const expectedPaletteHash = paletteHash(materialPalette);

  const allPanels = []
    .concat(asArray(panels))
    .concat(asArray(drawings?.plan))
    .concat(asArray(drawings?.elevation))
    .concat(asArray(drawings?.section));

  const evaluated =
    Boolean(compiledProject) || Boolean(visualManifest) || allPanels.length > 0;

  if (!evaluated) {
    return {
      version: PHASE_4_PANEL_CONSISTENCY_VERSION,
      evaluated: false,
      status: "pass",
      blockers,
      warnings,
      codes: [],
      mismatches,
    };
  }

  // ------------------------------------------------------------------
  // 1. Every 2D + 3D panel must reference the same compiled geometry.
  // ------------------------------------------------------------------
  if (expectedGeometryHash) {
    for (const panel of allPanels) {
      const type = panelType(panel);
      if (!type || (!isPanel3D(type) && !isPanel2D(type))) continue;
      const hash = readPanelGeometryHash(panel);
      if (!hash) {
        // Missing geometryHash on a panel that should anchor authority.
        // Treated as a blocker for 3D panels (where it's expected to be
        // stamped by projectGraphImageRenderer) and as a warning for 2D
        // panels (deterministic SVGs may not always stamp it explicitly).
        if (isPanel3D(type)) {
          codes.add(STRUCTURED_CODES.PANEL_GEOMETRY_HASH_MISSING);
          blockers.push(
            `${STRUCTURED_CODES.PANEL_GEOMETRY_HASH_MISSING}: 3D panel "${type}" carries no geometryHash; cannot verify same-source authority.`,
          );
          mismatches.geometryHash.push({
            panelType: type,
            expected: expectedGeometryHash,
            actual: null,
            severity: "blocker",
          });
        } else {
          warnings.push(
            `2D panel "${type}" has no geometryHash; same-source authority cannot be verified for this drawing.`,
          );
          mismatches.geometryHash.push({
            panelType: type,
            expected: expectedGeometryHash,
            actual: null,
            severity: "warning",
          });
        }
        continue;
      }
      if (hash !== expectedGeometryHash) {
        codes.add(STRUCTURED_CODES.PANEL_GEOMETRY_HASH_MISMATCH);
        blockers.push(
          `${STRUCTURED_CODES.PANEL_GEOMETRY_HASH_MISMATCH}: panel "${type}" geometryHash ${hash.slice(0, 12)} ≠ compiled ${expectedGeometryHash.slice(0, 12)}.`,
        );
        mismatches.geometryHash.push({
          panelType: type,
          expected: expectedGeometryHash,
          actual: hash,
          severity: "blocker",
        });
      }
    }
  }

  // ------------------------------------------------------------------
  // 2. Every 3D panel must carry visualManifestHash + (palette hash) +
  //    camera/view metadata.
  // ------------------------------------------------------------------
  for (const panel of allPanels) {
    const type = panelType(panel);
    if (!isPanel3D(type)) continue;

    // visualManifestHash — blocker when missing (the renderer is supposed
    // to stamp it) or mismatch (cross-pipeline regression).
    const panelManifestHash = readPanelVisualManifestHash(panel);
    if (!panelManifestHash) {
      codes.add(STRUCTURED_CODES.VISUAL_MANIFEST_HASH_MISSING);
      blockers.push(
        `${STRUCTURED_CODES.VISUAL_MANIFEST_HASH_MISSING}: 3D panel "${type}" carries no visualManifestHash; identity lock cannot be verified.`,
      );
      mismatches.visualManifestHash.push({
        panelType: type,
        expected: expectedVisualManifestHash,
        actual: null,
        severity: "blocker",
      });
    } else if (
      expectedVisualManifestHash &&
      panelManifestHash !== expectedVisualManifestHash
    ) {
      codes.add(STRUCTURED_CODES.VISUAL_MANIFEST_HASH_MISMATCH);
      blockers.push(
        `${STRUCTURED_CODES.VISUAL_MANIFEST_HASH_MISMATCH}: panel "${type}" visualManifestHash ${panelManifestHash.slice(0, 12)} ≠ active manifest ${expectedVisualManifestHash.slice(0, 12)}.`,
      );
      mismatches.visualManifestHash.push({
        panelType: type,
        expected: expectedVisualManifestHash,
        actual: panelManifestHash,
        severity: "blocker",
      });
    }

    // materialPaletteHash — warning when missing (renderer doesn't always
    // stamp it), blocker only on explicit mismatch against the palette.
    const panelPaletteHash = readPanelMaterialPaletteHash(panel);
    if (!panelPaletteHash) {
      codes.add(STRUCTURED_CODES.MATERIAL_PALETTE_HASH_MISSING);
      warnings.push(
        `3D panel "${type}" carries no materialPaletteHash; material lock cannot be confirmed.`,
      );
      mismatches.materialPaletteHash.push({
        panelType: type,
        expected: expectedPaletteHash,
        actual: null,
        severity: "warning",
      });
    } else if (
      expectedPaletteHash &&
      panelPaletteHash !== expectedPaletteHash
    ) {
      codes.add(STRUCTURED_CODES.MATERIAL_PALETTE_HASH_MISMATCH);
      blockers.push(
        `${STRUCTURED_CODES.MATERIAL_PALETTE_HASH_MISMATCH}: panel "${type}" materialPaletteHash ${panelPaletteHash.slice(0, 12)} ≠ palette ${expectedPaletteHash.slice(0, 12)}.`,
      );
      mismatches.materialPaletteHash.push({
        panelType: type,
        expected: expectedPaletteHash,
        actual: panelPaletteHash,
        severity: "blocker",
      });
    }

    // Camera / view metadata — warning when missing. Mismatches between
    // panels are diagnostic only (different panels deliberately show
    // different cameras), so we only flag absence.
    const cameraView = readPanelCameraView(panel);
    if (!cameraView) {
      codes.add(STRUCTURED_CODES.CAMERA_VIEW_METADATA_MISSING);
      warnings.push(
        `3D panel "${type}" carries no cameraId / viewDirection metadata; cannot verify locked view.`,
      );
      mismatches.cameraView.push({ panelType: type, severity: "warning" });
    }
  }

  // ------------------------------------------------------------------
  // 3. Domain-level agreement between visualManifest, compiledProject,
  //    drawings, and material palette.
  // ------------------------------------------------------------------
  const manifestStorey = manifestStoreyCount(visualManifest);
  const compiledStorey = compiledLevelCount(compiledProject);
  if (manifestStorey && compiledStorey && manifestStorey !== compiledStorey) {
    codes.add(STRUCTURED_CODES.FLOOR_COUNT_MISMATCH);
    blockers.push(
      `${STRUCTURED_CODES.FLOOR_COUNT_MISMATCH}: visualManifest reports ${manifestStorey} storeys; compiled project has ${compiledStorey}.`,
    );
    mismatches.floorCount = {
      manifest: manifestStorey,
      compiled: compiledStorey,
      severity: "blocker",
    };
  }

  const manifestRoof = manifestRoofForm(visualManifest);
  const compiledRoof = compiledRoofForm(compiledProject);
  if (manifestRoof && compiledRoof && manifestRoof !== compiledRoof) {
    codes.add(STRUCTURED_CODES.ROOF_TYPE_MISMATCH);
    blockers.push(
      `${STRUCTURED_CODES.ROOF_TYPE_MISMATCH}: visualManifest roof "${manifestRoof}" ≠ compiled roof "${compiledRoof}".`,
    );
    mismatches.roofType = {
      manifest: manifestRoof,
      compiled: compiledRoof,
      severity: "blocker",
    };
  }

  const manifestEntrance = normalize(visualManifest?.entranceOrientation);
  const compiledEntrance = compiledEntranceOrientation(
    compiledProject,
    projectGeometry,
  );
  if (
    manifestEntrance &&
    compiledEntrance &&
    manifestEntrance !== compiledEntrance
  ) {
    // Entrance orientation is contextual (resolved from site, can shift
    // when the architect repositions on a redrew lot). Warning, not
    // blocker — but logged so the reviewer can decide.
    codes.add(STRUCTURED_CODES.ENTRANCE_ORIENTATION_MISMATCH);
    warnings.push(
      `Entrance orientation mismatch: visualManifest "${manifestEntrance}" vs compiled "${compiledEntrance}".`,
    );
    mismatches.entranceOrientation = {
      manifest: manifestEntrance,
      compiled: compiledEntrance,
      severity: "warning",
    };
  }

  const manifestPrimary = manifestPrimaryMaterial(visualManifest);
  const palettePrimary = palettePrimaryMaterial(materialPalette);
  if (manifestPrimary && palettePrimary && manifestPrimary !== palettePrimary) {
    codes.add(STRUCTURED_CODES.PRIMARY_FACADE_MATERIAL_MISMATCH);
    warnings.push(
      `Primary facade material mismatch: visualManifest "${manifestPrimary}" vs palette "${palettePrimary}".`,
    );
    mismatches.primaryMaterial = {
      manifest: manifestPrimary,
      palette: palettePrimary,
      severity: "warning",
    };
  }

  const manifestOpenings = manifestOpeningCount(visualManifest);
  const compiledOpenings = compiledOpeningCount(
    compiledProject,
    projectGeometry,
  );
  if (
    Number.isFinite(manifestOpenings) &&
    Number.isFinite(compiledOpenings) &&
    manifestOpenings !== compiledOpenings
  ) {
    // Treat opening count as a warning by default — small drift between
    // the deterministic compiled count and the manifest's rhythm
    // fingerprint can happen on partial regenerations.
    codes.add(STRUCTURED_CODES.OPENING_COUNT_MISMATCH);
    warnings.push(
      `Opening count mismatch: visualManifest reports ${manifestOpenings} openings; compiled project has ${compiledOpenings}.`,
    );
    mismatches.openingCount = {
      manifest: manifestOpenings,
      compiled: compiledOpenings,
      severity: "warning",
    };
  }

  const status = blockers.length
    ? "blocked"
    : warnings.length
      ? "warning"
      : "pass";

  return {
    version: PHASE_4_PANEL_CONSISTENCY_VERSION,
    evaluated: true,
    status,
    blockers,
    warnings,
    codes: [...codes],
    mismatches,
  };
}

export {
  PHASE_4_PANEL_CONSISTENCY_VERSION,
  PANEL_TYPES_3D,
  PANEL_TYPE_2D_PREFIXES,
  STRUCTURED_CODES as PANEL_CONSISTENCY_CODES,
};

export default runPanelGeometryConsistencyChecks;
