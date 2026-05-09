import { setCorsHeaders, handlePreflight } from "../../../_shared/cors.js";
import {
  getDefaultArtifactStorageAdapter,
  DEFAULT_SIGNED_URL_EXPIRES_SECONDS,
} from "../../../../src/services/export/artifactStorageService.js";
import { listArtifactPackageHistory } from "../../../../src/services/export/artifactHistoryService.js";

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

async function withDownloadUrls(records, adapter) {
  return Promise.all(
    records.map(async (record) => {
      const signedUrlInfo = await adapter.createSignedDownloadUrl({
        packageId: record.packageId,
        expiresInSeconds: DEFAULT_SIGNED_URL_EXPIRES_SECONDS,
      });
      return {
        ...record,
        signedUrl: signedUrlInfo.supported ? signedUrlInfo.signedUrl : null,
        signedUrlAvailable: signedUrlInfo.supported === true,
        expiresAt: signedUrlInfo.supported ? signedUrlInfo.expiresAt : null,
        downloadUrl: signedUrlInfo.supported
          ? signedUrlInfo.signedUrl
          : directDownloadRoute(record.packageId),
      };
    }),
  );
}

export default async function handler(req, res) {
  if (handlePreflight(req, res, { methods: "GET, OPTIONS" })) return;
  setCorsHeaders(req, res, { methods: "GET, OPTIONS" });

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const adapter = getDefaultArtifactStorageAdapter();
  const query = resolveQuery(req);
  const records = listArtifactPackageHistory(query);
  const history = await withDownloadUrls(records, adapter);

  return res.status(200).json({
    history,
    count: history.length,
    storage: {
      adapterCapabilities: adapter.adapterCapabilities,
    },
  });
}
