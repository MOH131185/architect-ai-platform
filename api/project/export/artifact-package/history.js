/* global globalThis */
import { setCorsHeaders, handlePreflight } from "../../../_shared/cors.js";
import {
  getDefaultArtifactStorageAdapter,
  DEFAULT_SIGNED_URL_EXPIRES_SECONDS,
} from "../../../../src/services/export/artifactStorageService.js";
import { listArtifactPackageHistory } from "../../../../src/services/export/artifactHistoryService.js";
import {
  accessDeniedResponse,
  canListArtifactHistory,
  canReadArtifactPackage,
  resolveArtifactAccessContext,
} from "../../../../src/services/export/artifactAccessPolicyService.js";

function resolveQuery(req) {
  return {
    projectId: req.query?.projectId || req.query?.project_id || null,
    userId:
      req.query?.userId ||
      req.query?.user_id ||
      req.headers?.["x-user-id"] ||
      null,
    includeDeleted: req.query?.includeDeleted === "true",
  };
}

function directDownloadRoute(packageId) {
  return `/api/project/export/artifact-package/${encodeURIComponent(
    packageId,
  )}/download`;
}

async function withDownloadUrls(records, adapter, accessContext) {
  const signedUrlTtlSeconds =
    Number(globalThis.process?.env?.ARTIFACT_SIGNED_URL_TTL_SECONDS) ||
    DEFAULT_SIGNED_URL_EXPIRES_SECONDS;
  const hydrated = await Promise.all(
    records.map(async (record) => {
      // listArtifactPackageHistory matches by record.projectId OR
      // record.projectGraphId. The per-record access check needs the same
      // either-or semantics: pass whichever id the caller's accessContext
      // actually matches, so projectAllowed doesn't deny a row that the
      // listing layer already authorized.
      const queriedProjectId = accessContext?.projectId || null;
      const manifestProjectIdForCheck =
        queriedProjectId &&
        queriedProjectId !== record.projectId &&
        queriedProjectId === record.projectGraphId
          ? record.projectGraphId
          : record.projectId;
      const accessDecision = canReadArtifactPackage(accessContext, {
        manifest: {
          projectId: manifestProjectIdForCheck,
        },
        metadata: {
          userId: record.userId,
        },
      });
      if (!accessDecision.allowed) return null;
      const signedUrlInfo = await adapter.createSignedDownloadUrl({
        packageId: record.packageId,
        expiresInSeconds: signedUrlTtlSeconds,
      });
      return {
        ...record,
        storageProvider: adapter.adapterCapabilities?.adapter || "memory",
        signedUrl: signedUrlInfo.supported ? signedUrlInfo.signedUrl : null,
        signedUrlAvailable: signedUrlInfo.supported === true,
        signedUrlExpiresAt: signedUrlInfo.supported
          ? signedUrlInfo.expiresAt
          : null,
        downloadUrl: signedUrlInfo.supported
          ? signedUrlInfo.signedUrl
          : directDownloadRoute(record.packageId),
      };
    }),
  );
  return hydrated.filter(Boolean);
}

export default async function handler(req, res) {
  if (handlePreflight(req, res, { methods: "GET, OPTIONS" })) return;
  setCorsHeaders(req, res, { methods: "GET, OPTIONS" });

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const adapter = getDefaultArtifactStorageAdapter();
  const query = resolveQuery(req);
  const accessContext = resolveArtifactAccessContext(req, query);
  const accessDecision = canListArtifactHistory(accessContext, {
    projectId: query.projectId,
  });
  if (!accessDecision.allowed) {
    return accessDeniedResponse(res, accessDecision);
  }
  const records = listArtifactPackageHistory(query);
  const history = await withDownloadUrls(records, adapter, accessContext);

  return res.status(200).json({
    history,
    count: history.length,
    storageProvider: adapter.adapterCapabilities?.adapter || "memory",
    storage: {
      adapterCapabilities: adapter.adapterCapabilities,
    },
  });
}
