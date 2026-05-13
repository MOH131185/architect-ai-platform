import { setCorsHeaders, handlePreflight } from "../_shared/cors.js";
import { buildArchitectureProjectVerticalSlice } from "../../src/services/project/projectGraphVerticalSliceService.js";
import { ProgrammeNDSSViolationError } from "../../src/services/project/ndssValidator.js";
import { buildArtifactPackageWithPdfStitching } from "../../src/services/export/artifactPackageService.js";
import {
  getDefaultArtifactStorageAdapter,
  DEFAULT_SIGNED_URL_EXPIRES_SECONDS,
  BLOB_KIND_A1_SHEET_SVG,
} from "../../src/services/export/artifactStorageService.js";
import { resolveComposeOutputDir } from "../../src/services/a1/composeRuntime.js";
import a1ComposePayload from "../../server/utils/a1ComposePayload.cjs";
import { __artifactPackageExportInternals } from "./export/artifact-package.js";

const { buildComposeSvgUrl } = a1ComposePayload;

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

// The wizard sends its own projectId/designId on the request payload; the
// slice service generates an unrelated projectId on the result (typically
// derived from projectGraph.project_id). For the prebaked artifact package
// to be filterable from the panel by the same projectId the wizard's
// designData carries, the wizard's id MUST win — otherwise Save Package
// succeeds but the per-project history filter shows nothing.
//
// Exported via __verticalSlicePrebakeInternals so the precedence is unit-
// testable without spinning up the full slice service.
function resolveWizardProjectId(payload = {}, result = {}) {
  return (
    payload?.projectId ||
    payload?.project_id ||
    payload?.designId ||
    payload?.metadata?.projectId ||
    result?.projectId ||
    result?.projectGraph?.project_id ||
    result?.projectGraph?.projectGraphId ||
    result?.metadata?.projectId ||
    null
  );
}

export const __verticalSlicePrebakeInternals = {
  resolveWizardProjectId,
};

// Phase 1 export-fix: persist the master A1 SVG so the new `/api/a1/export`
// route can recover it without round-tripping a multi-MB data URL through
// JSON (which 413s on Vercel). Two transports are layered:
//
//   1. Filesystem under A1_COMPOSE_OUTPUT_DIR. Fast and matches the existing
//      compose-output static serve. Survives same-instance dev + Vercel.
//   2. Durable adapter blob via `putBlobArtifact({packageId, kind: "a1-sheet-svg"})`.
//      Survives Vercel cold start / cross-instance reads. Backed by the same
//      storage adapter (in-memory / filesystem / S3) the artifact package
//      already uses, so production durability follows the existing infra.
//
// `result.artifacts.a1Sheet` gets two new fields the client can use to build
// a compact request body:
//
//   - `svgOutputFile` / `svgUrl`  → file-transport (filesystem path)
//   - `svgArtifactRef`            → durable reference { packageId, kind,
//                                                       adapter, available }
//
// Both writes are opportunistic — slice generation is never failed by an
// export-side optimisation. When neither path is available the client falls
// back to the inline data URL gate in `exportService.buildA1ExportRequestBody`,
// which surfaces a clear error rather than producing a corrupt download.
async function persistMasterSvgForExport(result, { designId, packageId } = {}) {
  if (!result || !result.success) return result;
  const a1Sheet = result?.artifacts?.a1Sheet;
  const svgString = a1Sheet?.svgString;
  if (typeof svgString !== "string" || svgString.length === 0) {
    return result;
  }
  // Cheap precheck: if the URL-encoded SVG is going to fit in the inline
  // budget anyway, skip both disk + adapter writes.
  const approxEncodedBytes = svgString.length * 2 + 64;
  if (approxEncodedBytes <= 180 * 1024) {
    return result;
  }
  const sanitisedDesignId =
    String(
      designId ||
        result?.projectGraph?.project_id ||
        result?.projectGraph?.projectGraphId ||
        "unknown",
    )
      .replace(/[^a-z0-9_-]/gi, "")
      .slice(0, 60) || "unknown";

  let nextA1Sheet = a1Sheet;

  // (1) Filesystem transport — best-effort.
  try {
    const outputDir = resolveComposeOutputDir();
    const payload = buildComposeSvgUrl({
      svgString,
      outputDir,
      designId: sanitisedDesignId,
    });
    if (payload?.success && payload.transport === "file") {
      nextA1Sheet = {
        ...nextA1Sheet,
        transport: "file",
        svgUrl: payload.sheetUrl,
        svgOutputFile: payload.svgOutputFile,
        svgFilename: payload.filename,
        svgBytes: payload.svgBytes,
      };
    }
  } catch (err) {
    console.warn(
      "[generate-vertical-slice] master SVG filesystem persistence skipped:",
      err?.message || err,
    );
  }

  // (2) Durable adapter transport — survives cold starts. Skipped silently
  //     when no packageId is available (e.g. when prebake is disabled) or
  //     the adapter does not implement putBlobArtifact.
  if (packageId) {
    try {
      const adapter = getDefaultArtifactStorageAdapter();
      if (typeof adapter?.putBlobArtifact === "function") {
        const stored = await adapter.putBlobArtifact({
          packageId,
          kind: BLOB_KIND_A1_SHEET_SVG,
          bytes: Buffer.from(svgString, "utf8"),
          contentType: "image/svg+xml; charset=utf-8",
        });
        if (stored?.stored) {
          nextA1Sheet = {
            ...nextA1Sheet,
            svgArtifactRef: {
              packageId,
              kind: BLOB_KIND_A1_SHEET_SVG,
              adapter:
                stored.adapter || adapter.adapterCapabilities?.adapter || null,
              byteLength: stored.byteLength || null,
              available: true,
            },
          };
        }
      }
    } catch (err) {
      console.warn(
        "[generate-vertical-slice] master SVG durable persistence skipped:",
        err?.message || err,
      );
    }
  }

  if (nextA1Sheet !== a1Sheet) {
    result.artifacts.a1Sheet = nextA1Sheet;
  }
  return result;
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
    // Explicit projectId override: the wizard's id must beat the
    // slice-generated one regardless of spread order. Without this, the
    // panel's history filter (queried with the wizard's projectId) returns
    // empty after a successful Save because the storage entry was filed
    // under the slice's auto-generated projectId.
    //
    // CRITICAL: do not pass a `result` key here. buildPackageInput's
    // resolvePayload helper preferences body.result over body, which would
    // cause the explicit projectId set at body level to be dropped on the
    // floor. The spread `...result` already exposes artifacts, projectGraph,
    // compiledProject, etc. at top level for buildPackageInput to find.
    const wizardProjectId = resolveWizardProjectId(payload, result);
    const packageInput = buildPackageInput({
      ...payload,
      ...result,
      projectId: wizardProjectId,
      projectName,
      userId,
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
      // Prebake first so the artifact package is in the durable adapter
      // before we attempt to file the master SVG as a sibling blob — the
      // blob keys reuse the same packageId.
      const packageRef = await prebakeArtifactPackage({ result, payload, req });
      if (packageRef) {
        result.package = packageRef;
      }
      await persistMasterSvgForExport(result, {
        designId:
          payload?.projectId ||
          payload?.designId ||
          payload?.metadata?.projectId ||
          null,
        packageId: packageRef?.packageId || null,
      });
    }
    return res.status(result.success ? 200 : 422).json(result);
  } catch (error) {
    // PR7 (production hardening): NDSS violations are an unprocessable-
    // brief problem, not a server crash. Return 422 with the structured
    // violation list so the caller can show the architect exactly which
    // rooms breach which rule (and which target_gia_m2 / target_bedrooms
    // combination would resolve it).
    if (error instanceof ProgrammeNDSSViolationError) {
      return res.status(422).json({
        success: false,
        error: error.message,
        code: "PROGRAMME_NDSS_VIOLATION",
        ndss_violations: Array.isArray(error.violations)
          ? error.violations
          : [],
      });
    }
    return res.status(500).json({
      success: false,
      error: error.message || "ProjectGraph vertical slice generation failed",
    });
  }
}
