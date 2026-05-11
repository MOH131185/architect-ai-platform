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
  QUANTITY_TAKEOFF_UNAVAILABLE: "QUANTITY_TAKEOFF_UNAVAILABLE",
  DWG_CONVERSION_UNAVAILABLE: "DWG_CONVERSION_UNAVAILABLE",
  AUTHORITY_JSON_UNAVAILABLE: "AUTHORITY_JSON_UNAVAILABLE",
});

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
  const glbUrl =
    compiledProject?.artifacts?.glbUrl ||
    compiledProject?.artifacts?.modelGlb ||
    compiledProject?.artifacts?.modelUrl ||
    null;

  const geometryBlockedReason = hasCompiledProject
    ? BLOCKED_REASONS.GEOMETRY_HASH_MISSING
    : BLOCKED_REASONS.COMPILED_PROJECT_MISSING;

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
        available: hasGeometry,
        format: "IFC",
        method: "POST",
        endpoint: "/api/project/export/ifc",
        blockedReason: hasGeometry
          ? null
          : hasCompiledProject
            ? BLOCKED_REASONS.GEOMETRY_HASH_MISSING
            : BLOCKED_REASONS.COMPILED_PROJECT_MISSING,
      }),
      json: entry({
        available: hasGeometry,
        format: "JSON",
        method: "POST",
        endpoint: "/api/project/export/json",
        blockedReason: hasGeometry
          ? null
          : BLOCKED_REASONS.AUTHORITY_JSON_UNAVAILABLE,
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

export { BLOCKED_REASONS };
export default buildClientExportManifest;
