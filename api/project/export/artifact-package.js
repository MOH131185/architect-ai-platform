import { setCorsHeaders, handlePreflight } from "../../_shared/cors.js";
import { buildArtifactPackage } from "../../../src/services/export/artifactPackageService.js";
import { exportCompiledProjectToDXF } from "../../../src/services/project/compiledProjectExportService.js";

function safeProjectName(value, fallback = "ArchiAI_Project") {
  const cleaned = String(value || fallback)
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return cleaned || fallback;
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : Object.values(value);
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

function resolvePayload(body = {}) {
  return body.packageInput || body.result || body;
}

function resolveArtifacts(payload = {}) {
  return payload.artifacts || payload.result?.artifacts || {};
}

function resolveCompiledProject(payload = {}, artifacts = {}) {
  return (
    payload.compiledProject ||
    artifacts.compiledProject ||
    payload.result?.compiledProject ||
    payload.result?.artifacts?.compiledProject ||
    null
  );
}

function hasContent(value) {
  if (!value) return false;
  if (typeof value === "string") return value.length > 0;
  if (value instanceof Uint8Array || value instanceof ArrayBuffer) {
    return value.byteLength > 0;
  }
  if (ArrayBuffer.isView(value)) return value.byteLength > 0;
  if (typeof value !== "object") return false;
  return Boolean(
    value.svgString ||
    value.svg ||
    value.dataUrl ||
    value.dataUri ||
    value.pdfDataUrl ||
    value.pngDataUrl ||
    value.content ||
    value.bytes ||
    value.dxf ||
    value.ifc ||
    value.workbookArray ||
    value.json ||
    value.geometryHash,
  );
}

function buildDxfArtifact({
  compiledProject,
  projectName,
  includeDetailDrawings,
  detailDrawingsEnabled,
}) {
  if (!compiledProject?.geometryHash) return null;
  const dxf = exportCompiledProjectToDXF({
    compiledProject,
    projectName,
    includeDetailDrawings,
    detailDrawingsEnabled,
  });
  return {
    type: "dxf",
    fileName: `cad/${safeProjectName(projectName)}.dxf`,
    mimeType: "application/dxf",
    role: "cad_exchange",
    discipline: "cad",
    source: "CanonicalDrawingModel DXF export",
    content: dxf,
    geometryHash: compiledProject.geometryHash,
    sourceGeometryHash: compiledProject.geometryHash,
  };
}

function buildPackageInput(body = {}) {
  const payload = resolvePayload(body);
  const artifacts = resolveArtifacts(payload);
  const compiledProject = resolveCompiledProject(payload, artifacts);
  const projectName = firstValue(
    payload.projectName,
    payload.metadata?.projectName,
    payload.result?.projectName,
    "ArchiAI_Project",
  );
  const dxfArtifact =
    payload.dxfArtifact ||
    artifacts.dxf ||
    buildDxfArtifact({
      compiledProject,
      projectName,
      includeDetailDrawings: payload.includeDetailDrawings === true,
      detailDrawingsEnabled: payload.detailDrawingsEnabled === true,
    });
  const structuralArtifacts = firstValue(
    payload.structuralArtifacts,
    artifacts.structuralArtifacts,
  );
  const mepArtifacts = firstValue(payload.mepArtifacts, artifacts.mepArtifacts);
  const detailArtifacts = firstValue(
    payload.detailArtifacts,
    artifacts.detailArtifacts,
  );

  return {
    projectName,
    projectId: firstValue(
      payload.projectId,
      payload.project_id,
      payload.designId,
      payload.metadata?.projectId,
      payload.result?.projectId,
    ),
    projectGraphId: firstValue(
      payload.projectGraphId,
      payload.project_graph_id,
      artifacts.projectGraphId,
      payload.projectGraph?.projectGraphId,
      payload.projectGraph?.project_id,
      payload.result?.projectGraphId,
    ),
    projectGraph: payload.projectGraph || payload.result?.projectGraph || null,
    compiledProject,
    geometryHash: firstValue(
      payload.geometryHash,
      artifacts.geometryHash,
      compiledProject?.geometryHash,
      payload.result?.geometryHash,
    ),
    visualManifestHash: firstValue(
      payload.visualManifestHash,
      artifacts.visualManifestHash,
      payload.visualManifest?.manifestHash,
      payload.result?.visualManifestHash,
    ),
    styleBlendManifestHash: firstValue(
      payload.styleBlendManifestHash,
      artifacts.styleBlendManifestHash,
      payload.styleBlendManifest?.manifestHash,
      payload.result?.styleBlendManifestHash,
    ),
    jurisdictionId: firstValue(
      payload.jurisdictionId,
      payload.jurisdictionPack?.jurisdictionId,
      payload.result?.jurisdictionPack?.jurisdictionId,
      compiledProject?.jurisdictionId,
    ),
    countryCode: firstValue(
      payload.countryCode,
      payload.jurisdictionPack?.countryCode,
      payload.result?.jurisdictionPack?.countryCode,
      compiledProject?.countryCode,
    ),
    flags: {
      ...(payload.flags || {}),
      structuralEnabled:
        payload.flags?.structuralEnabled === true ||
        asArray(structuralArtifacts).length > 0,
      mepEnabled:
        payload.flags?.mepEnabled === true || asArray(mepArtifacts).length > 0,
      detailsEnabled:
        payload.flags?.detailsEnabled === true ||
        asArray(detailArtifacts).length > 0,
      dwgEnabled: payload.flags?.dwgEnabled === true,
      ifcEnabled: payload.flags?.ifcEnabled === true,
    },
    a1Sheet: firstValue(payload.a1Sheet, artifacts.a1Sheet),
    a1Pdf: firstValue(payload.a1Pdf, artifacts.a1Pdf),
    a1Png: firstValue(payload.a1Png, artifacts.a1Png, artifacts.renderedProof),
    dxfArtifact,
    dwgArtifact: firstValue(payload.dwgArtifact, artifacts.dwg),
    ifcArtifact: firstValue(payload.ifcArtifact, artifacts.ifc),
    technicalDrawings: firstValue(
      payload.technicalDrawings,
      artifacts.drawings,
    ),
    existingArtifacts: payload.existingArtifacts || [],
    structuralArtifacts,
    mepArtifacts,
    detailArtifacts,
    schedulesWorkbook: firstValue(
      payload.schedulesWorkbook,
      artifacts.schedulesWorkbook,
    ),
    qaReport: firstValue(payload.qaReport, artifacts.qaReport, payload.qa),
    visualManifest: firstValue(
      payload.visualManifest,
      artifacts.visualManifest,
    ),
    styleBlendManifest: firstValue(
      payload.styleBlendManifest,
      artifacts.styleBlendManifest,
    ),
    jurisdictionPack: firstValue(
      payload.jurisdictionPack,
      payload.jurisdiction,
      artifacts.jurisdictionPack,
    ),
    sourceGaps: payload.sourceGaps || [],
    producerVersions: payload.producerVersions || {},
  };
}

function hasPackageSource(input = {}) {
  return Boolean(
    input.compiledProject?.geometryHash ||
    hasContent(input.a1Sheet) ||
    hasContent(input.a1Pdf) ||
    hasContent(input.a1Png) ||
    hasContent(input.dxfArtifact) ||
    hasContent(input.dwgArtifact) ||
    hasContent(input.ifcArtifact) ||
    asArray(input.technicalDrawings).some(hasContent) ||
    asArray(input.existingArtifacts).some(hasContent) ||
    asArray(input.structuralArtifacts).some(hasContent) ||
    asArray(input.mepArtifacts).some(hasContent) ||
    asArray(input.detailArtifacts).some(hasContent) ||
    hasContent(input.schedulesWorkbook),
  );
}

export default async function handler(req, res) {
  if (handlePreflight(req, res, { methods: "POST, OPTIONS" })) return;
  setCorsHeaders(req, res, { methods: "POST, OPTIONS" });

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const packageInput = buildPackageInput(req.body || {});
    if (!hasPackageSource(packageInput)) {
      return res.status(400).json({
        error: "At least one generated artifact or compiledProject is required",
        code: "PACKAGE_ARTIFACTS_REQUIRED",
      });
    }

    const packageResult = buildArtifactPackage(packageInput);
    const safeName = safeProjectName(packageInput.projectName);
    const zipBuffer = Buffer.from(packageResult.zipBytes);

    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeName}-deliverables.zip"`,
    );
    res.setHeader("X-Artifact-Package-Id", packageResult.packageId);
    res.setHeader("X-Artifact-Package-Hash", packageResult.packageHash);
    res.setHeader(
      "X-Artifact-Source-Gap-Count",
      String(packageResult.sourceGaps.length),
    );
    return res.status(200).send(zipBuffer);
  } catch (error) {
    return res.status(500).json({
      error: error.message || "Artifact package export failed",
    });
  }
}

export const __artifactPackageExportInternals = Object.freeze({
  buildPackageInput,
  safeProjectName,
  hasPackageSource,
});
