/* global globalThis */
import { setCorsHeaders, handlePreflight } from "../../../../_shared/cors.js";
import {
  getDefaultArtifactStorageAdapter,
  verifySignedDownloadToken,
} from "../../../../../src/services/export/artifactStorageService.js";
import {
  accessDeniedResponse,
  canReadArtifactPackage,
  resolveArtifactAccessContext,
} from "../../../../../src/services/export/artifactAccessPolicyService.js";
import { __artifactPackageExportInternals } from "../../artifact-package.js";

const { safeProjectName } = __artifactPackageExportInternals;

function resolvePackageId(req) {
  return req.query?.packageId || req.query?.id || req.body?.packageId || null;
}

function packageFileName(record = {}) {
  const manifest = record.manifest || {};
  const projectName =
    record.metadata?.projectName ||
    manifest.projectId ||
    manifest.projectGraphId ||
    record.packageId ||
    "ArchiAI_Project";
  return `${safeProjectName(projectName)}-deliverables.zip`;
}

async function validateSignedQuery(req, packageId) {
  const signature = req.query?.signature || req.query?.sig || null;
  const expires = req.query?.expires || null;
  if (!signature && !expires) return { ok: true, signed: false };

  const secret =
    globalThis.process?.env?.ARTIFACT_PACKAGE_SIGNING_SECRET ||
    globalThis.process?.env?.ARTIFACT_SIGNING_SECRET ||
    null;
  const verification = await verifySignedDownloadToken({
    packageId,
    expires,
    signature,
    secret,
  });
  if (!verification.valid) {
    return {
      ok: false,
      status: verification.reason === "ARTIFACT_STORAGE_EXPIRED" ? 410 : 403,
      body: {
        error: "Signed artifact download URL is invalid or expired",
        code: verification.reason,
      },
    };
  }
  return { ok: true, signed: true, verification };
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

  const signed = await validateSignedQuery(req, packageId);
  if (!signed.ok) {
    return res.status(signed.status).json(signed.body);
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

  const accessContext = {
    ...resolveArtifactAccessContext(req, {
      ...(req.body || {}),
      projectId: result.record.manifest?.projectId,
    }),
    signedUrlVerified: signed.signed === true,
  };
  const accessDecision = canReadArtifactPackage(accessContext, result.record);
  if (!accessDecision.allowed) {
    return accessDeniedResponse(res, accessDecision);
  }

  const zipBuffer = Buffer.from(result.record.zipBytes);
  res.setHeader("Content-Type", "application/zip");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${packageFileName(result.record)}"`,
  );
  res.setHeader("X-Artifact-Package-Id", result.record.packageId);
  res.setHeader(
    "X-Artifact-Package-Hash",
    result.record.packageHash || result.record.manifest?.packageHash || "",
  );
  return res.status(200).send(zipBuffer);
}
