import { setCorsHeaders, handlePreflight } from "../_shared/cors.js";
import { buildArchitectureProjectVerticalSlice } from "../../src/services/project/projectGraphVerticalSliceService.js";
import { buildArtifactPackageWithPdfStitching } from "../../src/services/export/artifactPackageService.js";
import {
  getDefaultArtifactStorageAdapter,
  DEFAULT_SIGNED_URL_EXPIRES_SECONDS,
} from "../../src/services/export/artifactStorageService.js";
import { __artifactPackageExportInternals } from "./export/artifact-package.js";

const { buildPackageInput, hasPackageSource, safeProjectName } =
  __artifactPackageExportInternals;

// Phase A close-out: 300 DPI A1 rasterisation + tofu QA + PDF embed needs
// substantially more than the previous 120s default. Vercel Pro allows up to
// 300s per function. Force Node runtime because Sharp/librsvg requires
// native modules that the Edge runtime cannot load.
export const runtime = "nodejs";
export const config = {
  runtime: "nodejs",
  maxDuration: 300,
};

// Step 02 / §6.2: tri-state policy for the UK context aggregator.
//   CONTEXT_PROVIDERS_ENABLED='true'  -> always enabled (this server runtime).
//   CONTEXT_PROVIDERS_ENABLED='false' -> always disabled.
//   unset                             -> enabled only on Vercel / production.
// Server-only by construction: this handler runs in a Node serverless function.
// The aggregator itself layers a browser guard for defence in depth.
export function shouldEnableContextProviders(env = process.env) {
  const flag =
    typeof env.CONTEXT_PROVIDERS_ENABLED === "string"
      ? env.CONTEXT_PROVIDERS_ENABLED.trim().toLowerCase()
      : "";
  if (flag === "true") return true;
  if (flag === "false") return false;
  return Boolean(env.VERCEL) || env.NODE_ENV === "production";
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

// Pre-bake the deliverables ZIP into storage during the generation request so
// the client never has to re-upload tens of MB of artifacts at Save time.
// Returns a small reference object the client stores on designData.package and
// later sends back to /store as a compact ref. Failure is non-fatal — the
// client falls back to the legacy full-payload Save path. No effect on the
// generated artifacts themselves; the slice result is returned untouched.
async function prebakeArtifactPackage({ result, payload, req }) {
  if (!result || !result.success) return null;
  try {
    const userId = resolveUserId(req, payload);
    const projectName =
      payload?.projectName ||
      payload?.metadata?.projectName ||
      result?.projectName ||
      "ArchiAI_Project";
    const packageInput = buildPackageInput({
      ...payload,
      ...result,
      projectName,
      userId,
      result,
    });
    if (!hasPackageSource(packageInput)) return null;
    const packageResult =
      await buildArtifactPackageWithPdfStitching(packageInput);
    const adapter = getDefaultArtifactStorageAdapter();
    const storageRecord = await adapter.putArtifactPackage({
      packageId: packageResult.packageId,
      zipBytes: packageResult.zipBytes,
      manifest: packageResult.manifest,
      metadata: {
        projectName: safeProjectName(projectName),
        userId,
        projectId: packageInput.projectId,
        packageHash: packageResult.packageHash,
        source: "generation_prebake",
      },
    });
    const signedUrlInfo = await adapter.createSignedDownloadUrl({
      packageId: packageResult.packageId,
      expiresInSeconds:
        Number(process.env?.ARTIFACT_SIGNED_URL_TTL_SECONDS) ||
        DEFAULT_SIGNED_URL_EXPIRES_SECONDS,
    });
    return {
      packageId: packageResult.packageId,
      packageHash: packageResult.packageHash,
      byteLength: storageRecord.byteLength || null,
      downloadRoute: signedUrlInfo.supported
        ? null
        : downloadRouteFor(packageResult.packageId),
      signedUrl: signedUrlInfo.supported ? signedUrlInfo.signedUrl : null,
      signedUrlAvailable: signedUrlInfo.supported === true,
      signedUrlExpiresAt: signedUrlInfo.supported
        ? signedUrlInfo.expiresAt
        : null,
      expiresAt:
        storageRecord.expiresAt || storageRecord.metadata?.expiresAt || null,
      retentionDays:
        storageRecord.retentionDays ||
        storageRecord.metadata?.retentionDays ||
        null,
      storageProvider: adapter.adapterCapabilities?.adapter || "memory",
      source: "generation_prebake",
    };
  } catch (error) {
    // Pre-bake is opportunistic. Generation must not fail if it does.
    // The client transparently falls back to legacy full-payload Save.
    console.warn(
      "[generate-vertical-slice] artifact pre-bake skipped:",
      error?.message || error,
    );
    return null;
  }
}

export default async function handler(req, res) {
  if (handlePreflight(req, res, { methods: "POST, OPTIONS" })) return;
  setCorsHeaders(req, res, { methods: "POST, OPTIONS" });

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = req.body || {};
    // Caller-provided contextProviders wins (lets integration tests pass an
    // explicit { useDefaultFetch: false } to keep the slice offline). Otherwise
    // inject a default per the tri-state env policy.
    const payload =
      body.contextProviders === undefined && shouldEnableContextProviders()
        ? { ...body, contextProviders: { useDefaultFetch: true } }
        : body;
    const result = await buildArchitectureProjectVerticalSlice(payload);
    if (result && result.success) {
      const packageRef = await prebakeArtifactPackage({ result, payload, req });
      if (packageRef) {
        result.package = packageRef;
      }
    }
    return res.status(result.success ? 200 : 422).json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || "ProjectGraph vertical slice generation failed",
    });
  }
}
