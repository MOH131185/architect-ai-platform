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

// Detect the compact-ref Save shape: body carries only a packageId (and
// optional projectId / userId / expiresInSeconds metadata), no artifact bytes.
// Triggered when generation pre-baked the package and the client is asking us
// to promote the existing storage entry into history rather than re-uploading
// tens of MB of artifacts. See fix/save-package-reference-architecture PR.
function isCompactRefBody(body = {}) {
  if (!body || typeof body !== "object") return false;
  if (!body.packageId || typeof body.packageId !== "string") return false;
  const ARTIFACT_FIELDS = [
    "a1Sheet",
    "a1Pdf",
    "a1Png",
    "dxfArtifact",
    "dwgArtifact",
    "ifcArtifact",
    "technicalDrawings",
    "structuralArtifacts",
    "mepArtifacts",
    "detailArtifacts",
    "schedulesWorkbook",
    "compiledProject",
    "projectGraph",
    "artifacts",
    "result",
    "packageInput",
  ];
  return !ARTIFACT_FIELDS.some(
    (key) => body[key] !== undefined && body[key] !== null,
  );
}

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
    // Compact-ref mode: client sends only { packageId, projectId, userId,
    // expiresInSeconds } pointing at a package pre-baked at generation time.
    // Look up the existing storage entry, validate access, record history,
    // and respond with the same shape the legacy full-payload path returns.
    // Falls back to the legacy path below if the body still carries artifact
    // bytes (older clients, integration tests, etc.).
    if (isCompactRefBody(req.body || {})) {
      const adapter = getDefaultArtifactStorageAdapter();
      const lookup = await adapter.getArtifactPackage({
        packageId: req.body.packageId,
      });
      if (!lookup.found) {
        const code =
          lookup.code === "ARTIFACT_STORAGE_DELETED"
            ? "PACKAGE_DRAFT_DELETED"
            : "PACKAGE_DRAFT_NOT_FOUND";
        return res
          .status(lookup.code === "ARTIFACT_STORAGE_DELETED" ? 410 : 404)
          .json({
            error:
              "Package not found in storage. Re-generate the design before saving.",
            code,
            packageId: req.body.packageId,
          });
      }
      const storageRecord = lookup.record;
      // In compact-ref mode, the stored entry's manifest.projectId is the
      // source of truth — the slice service generates its own projectId
      // during pre-bake, which usually differs from whatever the wizard's
      // designData currently calls "projectId". Override the resolved
      // context with the storage projectId so projectAllowed lines up.
      // The userId check still runs against the caller's actual identity.
      const baseContext = resolveArtifactAccessContext(req, req.body || {});
      const accessContext = {
        ...baseContext,
        projectId: storageRecord.manifest?.projectId || baseContext.projectId,
      };
      const accessDecision = canStoreArtifactPackage(accessContext, {
        projectId: storageRecord.manifest?.projectId,
        userId:
          req.body.userId ||
          req.body.metadata?.userId ||
          storageRecord.metadata?.userId ||
          null,
      });
      if (!accessDecision.allowed) {
        return accessDeniedResponse(res, accessDecision);
      }
      const userId =
        accessContext.userId ||
        resolveUserId(req, req.body || {}) ||
        storageRecord.metadata?.userId ||
        null;
      const signedUrlInfo = await adapter.createSignedDownloadUrl({
        packageId: storageRecord.packageId,
        expiresInSeconds:
          Number(req.body?.expiresInSeconds) ||
          Number(globalThis.process?.env?.ARTIFACT_SIGNED_URL_TTL_SECONDS) ||
          DEFAULT_SIGNED_URL_EXPIRES_SECONDS,
      });
      const fallbackDownloadRoute = downloadRouteFor(storageRecord.packageId);
      const packageResultLike = {
        packageId: storageRecord.packageId,
        packageHash:
          storageRecord.manifest?.packageHash ||
          storageRecord.metadata?.packageHash,
        manifest: storageRecord.manifest || {},
      };
      const historyRecord = recordArtifactPackageHistory(
        createArtifactHistoryRecord({
          packageResult: packageResultLike,
          storageRecord,
          userId,
          signedUrlInfo,
          downloadRoute: fallbackDownloadRoute,
        }),
      );
      return res.status(200).json({
        packageId: storageRecord.packageId,
        packageHash: packageResultLike.packageHash,
        manifest: manifestSummary(storageRecord.manifest || {}),
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
        source: "compact_ref",
      });
    }

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
