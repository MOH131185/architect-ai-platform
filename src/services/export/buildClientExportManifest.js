/**
 * buildClientExportManifest
 *
 * Synthesises an export manifest in the same shape as
 * createCompiledExportManifest (v2ProjectContracts.js) for pipeline paths
 * that do not emit one server-side — primarily the project-graph
 * vertical slice used by non-residential project types.
 *
 * Each entry carries `available`, plus a stable `blockedReason` code when
 * the format cannot be exported. The ExportPanel uses these to render
 * READY vs BLOCKED rows with deterministic reasons.
 *
 * Backing exporters (kept in lockstep with src/services/exportService.js):
 *   - PNG  : a1 sheet rasterisation
 *   - PDF  : a1 sheet PDF
 *   - DXF  : exportCompiledProjectToDXF  (requires geometryHash)
 *   - IFC  : exportCompiledProjectToIFC  (requires geometryHash, IFC4)
 *   - JSON : compiled project authority bundle (requires geometryHash)
 *   - XLSX : cost workbook (requires geometryHash + non-empty takeoff)
 *   - DWG  : no real converter — always blocked
 *   - GLB  : surfaced only when compiledProject.artifacts.glbUrl exists
 */

const BLOCKED_REASONS = Object.freeze({
  COMPILED_PROJECT_MISSING: "COMPILED_PROJECT_MISSING",
  GEOMETRY_HASH_MISSING: "GEOMETRY_HASH_MISSING",
  IFC_EXPORT_UNAVAILABLE: "IFC_EXPORT_UNAVAILABLE",
  IFC_GEOMETRY_INSUFFICIENT: "IFC_GEOMETRY_INSUFFICIENT",
  QUANTITY_TAKEOFF_UNAVAILABLE: "QUANTITY_TAKEOFF_UNAVAILABLE",
  DWG_CONVERSION_UNAVAILABLE: "DWG_CONVERSION_UNAVAILABLE",
  AUTHORITY_JSON_UNAVAILABLE: "AUTHORITY_JSON_UNAVAILABLE",
  REGENERATE_REQUIRED_FOR_ENGINEERING_EXPORT:
    "REGENERATE_REQUIRED_FOR_ENGINEERING_EXPORT",
});

// Engineering exports that cannot execute without the in-scope
// `compiledProject` payload. ExportPanel uses this list to gate restored
// history designs (PNG / PDF / SVG continue to work via the A1 sheet
// artifact which IS persisted).
const ENGINEERING_EXPORT_KEYS = Object.freeze(["dxf", "ifc", "json", "xlsx"]);

function entry({ available, format, blockedReason, ...rest }) {
  const row = { available: Boolean(available), format, ...rest };
  if (!available && blockedReason) row.blockedReason = blockedReason;
  return row;
}

export function buildClientExportManifest({
  compiledProject = null,
  projectQuantityTakeoff = null,
  geometryHash = null,
  projectName = "ArchiAI Project",
  pipelineVersion = "project-graph-vertical-slice-v1",
} = {}) {
  const resolvedHash = geometryHash || compiledProject?.geometryHash || null;
  const hasCompiledProject = Boolean(compiledProject);
  const hasGeometry = Boolean(resolvedHash);
  const hasTakeoff = Boolean(projectQuantityTakeoff?.items?.length);
  const wallCount = Array.isArray(compiledProject?.walls)
    ? compiledProject.walls.length
    : 0;
  const levelCount = Array.isArray(compiledProject?.levels)
    ? compiledProject.levels.length
    : 0;
  const ifcGeometrySufficient = hasGeometry && wallCount > 0 && levelCount > 0;
  const glbUrl =
    compiledProject?.artifacts?.glbUrl ||
    compiledProject?.artifacts?.modelGlb ||
    compiledProject?.artifacts?.modelUrl ||
    null;

  const geometryBlockedReason = hasCompiledProject
    ? BLOCKED_REASONS.GEOMETRY_HASH_MISSING
    : BLOCKED_REASONS.COMPILED_PROJECT_MISSING;

  function ifcBlockedReason() {
    if (!hasCompiledProject) return BLOCKED_REASONS.COMPILED_PROJECT_MISSING;
    if (!hasGeometry) return BLOCKED_REASONS.GEOMETRY_HASH_MISSING;
    return BLOCKED_REASONS.IFC_GEOMETRY_INSUFFICIENT;
  }

  return {
    schema_version: "compiled-export-manifest-v1",
    source: "client_fallback",
    geometryHash: resolvedHash,
    pipelineVersion,
    projectName,
    exports: {
      png: entry({
        available: true,
        format: "PNG",
        source: "a1_compose_output",
      }),
      pdf: entry({
        available: true,
        format: "PDF",
        source: "a1_compose_output",
      }),
      dxf: entry({
        available: hasGeometry,
        format: "DXF",
        method: "POST",
        endpoint: "/api/project/export/dxf",
        blockedReason: geometryBlockedReason,
      }),
      ifc: entry({
        available: ifcGeometrySufficient,
        format: "IFC",
        method: "POST",
        endpoint: "/api/project/export/ifc",
        blockedReason: ifcGeometrySufficient ? null : ifcBlockedReason(),
      }),
      json: entry({
        available: hasGeometry,
        format: "JSON",
        method: "POST",
        endpoint: "/api/project/export/json",
        blockedReason: hasGeometry ? null : geometryBlockedReason,
      }),
      xlsx: entry({
        available: hasGeometry && hasTakeoff,
        format: "XLSX",
        method: "POST",
        endpoint: "/api/project/export/xlsx",
        blockedReason: hasGeometry
          ? BLOCKED_REASONS.QUANTITY_TAKEOFF_UNAVAILABLE
          : geometryBlockedReason,
      }),
      dwg: entry({
        available: false,
        format: "DWG",
        blockedReason: BLOCKED_REASONS.DWG_CONVERSION_UNAVAILABLE,
      }),
      glb: entry({
        available: Boolean(glbUrl),
        format: "GLB",
        url: glbUrl,
      }),
    },
  };
}

/**
 * Phase 2 export-fix — derive the minimum metadata needed to evaluate
 * `buildClientExportManifest` readiness later. The design history layer
 * stores this slim summary (~80 bytes) instead of the full compiledProject
 * (which can be many MB) so a design reloaded from history still renders
 * correct READY/BLOCKED rows in ExportPanel.
 *
 * Keys mirror the manifest inputs:
 *   - geometryHash       → DXF / JSON / XLSX gate
 *   - wallCount + levelCount → IFC gate (requires both non-zero)
 *   - takeoffItemCount   → XLSX gate
 *   - openingCount       → soft signal (not currently a gate, kept for
 *                          forward compatibility / debugging)
 */
export function buildCompiledProjectExportSummary({
  compiledProject = null,
  projectQuantityTakeoff = null,
  geometryHash = null,
} = {}) {
  if (!compiledProject && !geometryHash && !projectQuantityTakeoff) {
    return null;
  }
  const resolvedHash = geometryHash || compiledProject?.geometryHash || null;
  return {
    schema_version: "compiled-project-export-summary-v1",
    geometryHash: resolvedHash,
    wallCount: Array.isArray(compiledProject?.walls)
      ? compiledProject.walls.length
      : 0,
    levelCount: Array.isArray(compiledProject?.levels)
      ? compiledProject.levels.length
      : 0,
    openingCount: Array.isArray(compiledProject?.openings)
      ? compiledProject.openings.length
      : 0,
    takeoffItemCount: Array.isArray(projectQuantityTakeoff?.items)
      ? projectQuantityTakeoff.items.length
      : 0,
    glbAvailable: Boolean(
      compiledProject?.artifacts?.glbUrl ||
      compiledProject?.artifacts?.modelGlb ||
      compiledProject?.artifacts?.modelUrl,
    ),
  };
}

/**
 * Rebuild an export manifest from a previously persisted summary. Returns
 * the same shape as `buildClientExportManifest({compiledProject, …})` so
 * downstream consumers (ExportPanel) need no special case for "restored
 * from history" vs. freshly generated designs.
 */
export function buildExportManifestFromSummary({
  summary = null,
  projectName = "ArchiAI Project",
  pipelineVersion = "project-graph-vertical-slice-v1",
} = {}) {
  if (!summary) return null;
  const synthetic = {
    geometryHash: summary.geometryHash || null,
    walls: new Array(Math.max(0, summary.wallCount || 0)).fill(null),
    levels: new Array(Math.max(0, summary.levelCount || 0)).fill(null),
    openings: new Array(Math.max(0, summary.openingCount || 0)).fill(null),
    artifacts: summary.glbAvailable
      ? { glbUrl: "preserved://restored-from-history" }
      : {},
  };
  const syntheticTakeoff = summary.takeoffItemCount
    ? {
        items: new Array(Math.max(0, summary.takeoffItemCount)).fill({}),
      }
    : null;
  const manifest = buildClientExportManifest({
    compiledProject: synthetic,
    projectQuantityTakeoff: syntheticTakeoff,
    geometryHash: summary.geometryHash || null,
    projectName,
    pipelineVersion,
  });
  return {
    ...manifest,
    source: "restored_from_summary",
  };
}

/**
 * Phase 2 amendment — restored-history gate for engineering exports.
 *
 * The hydrator can restore a manifest (verbatim or rebuilt from summary)
 * that claims DXF/IFC/JSON/XLSX are READY, because those flags reflect what
 * was achievable at generation time. The exporters themselves, however,
 * need the full `compiledProject` body — which is intentionally NOT
 * persisted (it would blow the localStorage budget). Without this gate
 * ExportPanel showed clickable READY rows that 4xx'd inside exportService.
 *
 * Rule: when `restoredFromHistory === true` AND no `compiledProject` is in
 * scope, force every engineering key (`ENGINEERING_EXPORT_KEYS`) to
 * `available: false` with the structured reason
 * `REGENERATE_REQUIRED_FOR_ENGINEERING_EXPORT`. PNG / PDF / SVG / GLB / DWG
 * are not touched — sheet exports flow through the Phase 1 compact-
 * reference route and survive history reload; the DWG row stays blocked
 * for its own reason (no converter); GLB requires a glbUrl that's already
 * lost when compiledProject is.
 *
 * The function preserves the input manifest's other fields (geometryHash,
 * schema_version, projectName, etc.) so the Authority chip in the panel
 * still renders. Pass the original `manifest.source` through so callers
 * can tell freshly-built manifests apart from gated ones.
 */
export function applyHistoryRestoreGate({
  manifest = null,
  restoredFromHistory = false,
  hasCompiledProject = false,
} = {}) {
  if (!manifest) return manifest;
  if (!restoredFromHistory) return manifest;
  if (hasCompiledProject) return manifest;
  const exportsIn = manifest.exports || {};
  const exportsOut = { ...exportsIn };
  for (const key of ENGINEERING_EXPORT_KEYS) {
    if (!exportsOut[key]) continue;
    exportsOut[key] = {
      ...exportsOut[key],
      available: false,
      blockedReason: BLOCKED_REASONS.REGENERATE_REQUIRED_FOR_ENGINEERING_EXPORT,
    };
  }
  return {
    ...manifest,
    exports: exportsOut,
    source: manifest.source
      ? `${manifest.source}+restore_gated`
      : "restore_gated",
  };
}

export { BLOCKED_REASONS, ENGINEERING_EXPORT_KEYS };
export default buildClientExportManifest;
