/* global globalThis */
import { setCorsHeaders, handlePreflight } from "../../../_shared/cors.js";
import { buildArtifactPackageWithPdfStitching } from "../../../../src/services/export/artifactPackageService.js";
import {
  getDefaultArtifactStorageAdapter,
  DEFAULT_SIGNED_URL_EXPIRES_SECONDS,
} from "../../../../src/services/export/artifactStorageService.js";
import {
  createArtifactHistoryRecord,
  recordArtifactPackageHistory,
} from "../../../../src/services/export/artifactHistoryService.js";
import {
  accessDeniedResponse,
  canStoreArtifactPackage,
  resolveArtifactAccessContext,
} from "../../../../src/services/export/artifactAccessPolicyService.js";
import { __artifactPackageExportInternals } from "../artifact-package.js";

const { buildPackageInput, hasPackageSource, safeProjectName } =
  __artifactPackageExportInternals;

function resolveUserId(req, body = {}) {
  return (
    body.userId ||
    body.metadata?.userId ||
    req.headers?.["x-user-id"] ||
    req.headers?.["X-User-Id"] ||
    null
  );
}

function downloadRouteFor(packageId) {
  return `/api/project/export/artifact-package/${encodeURIComponent(
    packageId,
  )}/download`;
}

function manifestSummary(manifest = {}) {
  return {
    packageId: manifest.packageId,
    packageHash: manifest.packageHash,
    projectId: manifest.projectId,
    projectGraphId: manifest.projectGraphId,
    geometryHash: manifest.geometryHash,
    visualManifestHash: manifest.visualManifestHash,
    styleBlendManifestHash: manifest.styleBlendManifestHash,
    jurisdictionId: manifest.jurisdictionId,
    countryCode: manifest.countryCode,
    artifactCount: Array.isArray(manifest.artifacts)
      ? manifest.artifacts.length
      : 0,
    sourceGapCount: Array.isArray(manifest.sourceGaps)
      ? manifest.sourceGaps.length
      : 0,
    qaSummary: manifest.qaSummary || null,
    flags: manifest.flags || {},
    producerVersions: manifest.producerVersions || {},
  };
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
    const accessContext = resolveArtifactAccessContext(req, req.body || {});
    const accessDecision = canStoreArtifactPackage(accessContext, {
      ...packageInput,
      userId: req.body?.userId || req.body?.metadata?.userId || null,
    });
    if (!accessDecision.allowed) {
      return accessDeniedResponse(res, accessDecision);
    }

    const packageResult =
      await buildArtifactPackageWithPdfStitching(packageInput);
    const adapter = getDefaultArtifactStorageAdapter();
    const userId = accessContext.userId || resolveUserId(req, req.body || {});
    const metadata = {
      projectName: safeProjectName(packageInput.projectName),
      userId,
      packageHash: packageResult.packageHash,
    };
    const storageRecord = await adapter.putArtifactPackage({
      packageId: packageResult.packageId,
      zipBytes: packageResult.zipBytes,
      manifest: packageResult.manifest,
      metadata,
    });
    const signedUrlInfo = await adapter.createSignedDownloadUrl({
      packageId: packageResult.packageId,
      expiresInSeconds:
        Number(req.body?.expiresInSeconds) ||
        Number(globalThis.process?.env?.ARTIFACT_SIGNED_URL_TTL_SECONDS) ||
        DEFAULT_SIGNED_URL_EXPIRES_SECONDS,
    });
    const fallbackDownloadRoute = downloadRouteFor(packageResult.packageId);
    const historyRecord = recordArtifactPackageHistory(
      createArtifactHistoryRecord({
        packageResult,
        storageRecord,
        userId,
        signedUrlInfo,
        downloadRoute: fallbackDownloadRoute,
      }),
    );

    return res.status(200).json({
      packageId: packageResult.packageId,
      packageHash: packageResult.packageHash,
      manifest: manifestSummary(packageResult.manifest),
      storageProvider: adapter.adapterCapabilities?.adapter || "memory",
      storage: {
        adapterCapabilities: adapter.adapterCapabilities,
        storageProvider: adapter.adapterCapabilities?.adapter || "memory",
        storageKey: storageRecord.storageKey,
        byteLength: storageRecord.byteLength,
        status: storageRecord.status,
      },
      signedUrl: signedUrlInfo.supported ? signedUrlInfo.signedUrl : null,
      signedUrlAvailable: signedUrlInfo.supported === true,
      expiresAt:
        storageRecord.expiresAt || storageRecord.metadata?.expiresAt || null,
      signedUrlExpiresAt: signedUrlInfo.supported
        ? signedUrlInfo.expiresAt
        : null,
      retentionDays:
        storageRecord.retentionDays ||
        storageRecord.metadata?.retentionDays ||
        null,
      packageHistoryStatus: historyRecord.status,
      downloadRoute: signedUrlInfo.supported ? null : fallbackDownloadRoute,
      history: historyRecord,
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message || "Artifact package storage failed",
    });
  }
}
