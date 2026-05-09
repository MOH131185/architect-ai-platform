import { setCorsHeaders, handlePreflight } from "../../../_shared/cors.js";
import { getDefaultArtifactStorageAdapter } from "../../../../src/services/export/artifactStorageService.js";
import { getArtifactPackageHistoryRecord } from "../../../../src/services/export/artifactHistoryService.js";
import {
  accessDeniedResponse,
  canReadArtifactPackage,
  resolveArtifactAccessContext,
} from "../../../../src/services/export/artifactAccessPolicyService.js";

function resolvePackageId(req) {
  return req.query?.packageId || req.query?.id || req.body?.packageId || null;
}

function packageSummary(record = {}) {
  const manifest = record.manifest || {};
  return {
    packageId: record.packageId,
    packageHash: record.packageHash || manifest.packageHash,
    projectId: manifest.projectId || null,
    projectGraphId: manifest.projectGraphId || null,
    geometryHash: manifest.geometryHash || null,
    visualManifestHash: manifest.visualManifestHash || null,
    styleBlendManifestHash: manifest.styleBlendManifestHash || null,
    jurisdictionId: manifest.jurisdictionId || null,
    countryCode: manifest.countryCode || null,
    artifactCount: Array.isArray(manifest.artifacts)
      ? manifest.artifacts.length
      : 0,
    sourceGapCount: Array.isArray(manifest.sourceGaps)
      ? manifest.sourceGaps.length
      : 0,
    byteLength: record.byteLength || 0,
    storageKey: record.storageKey || null,
    status: record.status || "stored",
    expiresAt: record.expiresAt || record.metadata?.expiresAt || null,
    retentionDays:
      record.retentionDays || record.metadata?.retentionDays || null,
    packageHistoryStatus: record.status || "stored",
    qaSummary: manifest.qaSummary || null,
    flags: manifest.flags || {},
    producerVersions: manifest.producerVersions || {},
  };
}

export default async function handler(req, res) {
  if (handlePreflight(req, res, { methods: "GET, OPTIONS" })) return;
  setCorsHeaders(req, res, { methods: "GET, OPTIONS" });

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const packageId = resolvePackageId(req);
  if (!packageId) {
    return res.status(400).json({
      error: "packageId is required",
      code: "PACKAGE_ID_REQUIRED",
    });
  }

  const adapter = getDefaultArtifactStorageAdapter();
  const result = await adapter.getArtifactPackage({ packageId });
  if (!result.found) {
    return res
      .status(result.code === "ARTIFACT_STORAGE_DELETED" ? 410 : 404)
      .json({
        error: "Artifact package not found",
        code: result.code,
      });
  }

  const accessContext = resolveArtifactAccessContext(req, {
    ...(req.body || {}),
    projectId: result.record.manifest?.projectId,
  });
  const accessDecision = canReadArtifactPackage(accessContext, result.record);
  if (!accessDecision.allowed) {
    return accessDeniedResponse(res, accessDecision);
  }

  const history = getArtifactPackageHistoryRecord({ packageId });

  return res.status(200).json({
    package: packageSummary(result.record),
    manifest: result.record.manifest,
    history: history.found ? history.record : null,
    storageProvider: adapter.adapterCapabilities?.adapter || "memory",
    signedUrlAvailable: adapter.adapterCapabilities?.signedUrls === true,
    storage: {
      adapterCapabilities: adapter.adapterCapabilities,
    },
  });
}
