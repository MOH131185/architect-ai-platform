/* global globalThis */
/**
 * Provider health / preflight service.
 *
 * Composes a single snapshot of "are we ready to serve requests" suitable
 * for an admin dashboard. Each check returns one of four canonical statuses:
 *
 *   ok              — configured and reachable
 *   degraded        — configured but a non-fatal issue (e.g. signed URLs
 *                     unavailable but storage adapter responds)
 *   missing_config  — env vars missing; user action required to enable
 *   unavailable     — configured but upstream rejected access (401/403/etc)
 *
 * Each check carries a safe `detail` field — provider request id where
 * available, error code, last4 of api key — but NEVER the raw key, env, or
 * authorization header. Callers (api/admin/provider-health.js) can echo the
 * full snapshot back to an authenticated admin without leaking secrets.
 *
 * Dependency injection (`fetchImpl`, env override, adapter override) keeps
 * the service unit-testable without touching real upstreams.
 */

import { getDefaultArtifactStorageAdapter } from "../export/artifactStorageService.js";

export const HEALTH_STATUS = Object.freeze({
  OK: "ok",
  DEGRADED: "degraded",
  MISSING_CONFIG: "missing_config",
  UNAVAILABLE: "unavailable",
});

const SAFE_KEY_LAST4 = (key) => {
  if (typeof key !== "string" || key.length < 4) return null;
  return key.slice(-4);
};

function resolveOpenAIReasoningKey(env) {
  return (
    env.OPENAI_REASONING_API_KEY ||
    env.OPENAI_API_KEY ||
    env.STEP_00_ORCHESTRATOR_API_KEY ||
    null
  );
}

function resolveOpenAIImagesKey(env) {
  return env.OPENAI_IMAGES_API_KEY || env.OPENAI_API_KEY || null;
}

function describeFetchError(err) {
  if (!err) return { code: "UNKNOWN", message: "unknown error" };
  if (err.name === "AbortError") {
    return { code: "TIMEOUT", message: "Provider request timed out" };
  }
  if (err instanceof TypeError) {
    return { code: "NETWORK_ERROR", message: err.message || "network error" };
  }
  return {
    code: err.code || "FETCH_ERROR",
    message: err.message || String(err),
  };
}

/**
 * GET https://api.openai.com/v1/models — cheapest way to verify a key works.
 * Returns ok if 200, unavailable if 401/403, degraded on 5xx (transient).
 */
async function checkOpenAIKey({ key, fetchImpl, timeoutMs = 5000 }) {
  if (!key) {
    return {
      status: HEALTH_STATUS.MISSING_CONFIG,
      reason: "Key not configured",
      detail: null,
    };
  }
  let controller;
  try {
    controller =
      typeof globalThis.AbortController === "function"
        ? new globalThis.AbortController()
        : null;
    const timer = controller
      ? setTimeout(() => controller.abort(), timeoutMs)
      : null;
    const res = await fetchImpl("https://api.openai.com/v1/models", {
      method: "GET",
      headers: { Authorization: `Bearer ${key}` },
      signal: controller?.signal,
    });
    if (timer) clearTimeout(timer);
    const requestId =
      res.headers?.get?.("x-request-id") ||
      res.headers?.get?.("openai-request-id") ||
      null;

    if (res.status === 200) {
      return {
        status: HEALTH_STATUS.OK,
        keyLast4: SAFE_KEY_LAST4(key),
        requestId,
      };
    }
    if (res.status === 401 || res.status === 403) {
      return {
        status: HEALTH_STATUS.UNAVAILABLE,
        reason: `Provider rejected key (${res.status})`,
        keyLast4: SAFE_KEY_LAST4(key),
        requestId,
        upstreamStatus: res.status,
      };
    }
    return {
      status: HEALTH_STATUS.DEGRADED,
      reason: `Provider returned ${res.status}`,
      keyLast4: SAFE_KEY_LAST4(key),
      requestId,
      upstreamStatus: res.status,
    };
  } catch (err) {
    return {
      status: HEALTH_STATUS.DEGRADED,
      reason: "Could not reach provider",
      keyLast4: SAFE_KEY_LAST4(key),
      error: describeFetchError(err),
    };
  }
}

/**
 * gpt-image edit access requires the image-edit endpoint to accept a
 * multipart request without a 401/403/404. We do a lightweight HEAD-style
 * probe by checking model existence for the configured image model.
 */
async function checkOpenAIImageEditAccess({
  key,
  model,
  fetchImpl,
  timeoutMs = 5000,
}) {
  if (!key) {
    return {
      status: HEALTH_STATUS.MISSING_CONFIG,
      reason: "OPENAI_IMAGES_API_KEY (or OPENAI_API_KEY) not configured",
    };
  }
  if (!model) {
    return {
      status: HEALTH_STATUS.MISSING_CONFIG,
      reason: "OPENAI_IMAGE_MODEL not configured",
    };
  }
  let controller;
  try {
    controller =
      typeof globalThis.AbortController === "function"
        ? new globalThis.AbortController()
        : null;
    const timer = controller
      ? setTimeout(() => controller.abort(), timeoutMs)
      : null;
    const res = await fetchImpl(
      `https://api.openai.com/v1/models/${encodeURIComponent(model)}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${key}` },
        signal: controller?.signal,
      },
    );
    if (timer) clearTimeout(timer);
    const requestId =
      res.headers?.get?.("x-request-id") ||
      res.headers?.get?.("openai-request-id") ||
      null;

    if (res.status === 200) {
      return {
        status: HEALTH_STATUS.OK,
        model,
        keyLast4: SAFE_KEY_LAST4(key),
        requestId,
      };
    }
    if (res.status === 404) {
      return {
        status: HEALTH_STATUS.UNAVAILABLE,
        reason: `Image model "${model}" not accessible to this account`,
        model,
        keyLast4: SAFE_KEY_LAST4(key),
        requestId,
        upstreamStatus: 404,
      };
    }
    if (res.status === 401 || res.status === 403) {
      return {
        status: HEALTH_STATUS.UNAVAILABLE,
        reason: `Provider rejected key for image model (${res.status})`,
        model,
        keyLast4: SAFE_KEY_LAST4(key),
        requestId,
        upstreamStatus: res.status,
      };
    }
    return {
      status: HEALTH_STATUS.DEGRADED,
      reason: `Provider returned ${res.status} for image model probe`,
      model,
      keyLast4: SAFE_KEY_LAST4(key),
      requestId,
      upstreamStatus: res.status,
    };
  } catch (err) {
    return {
      status: HEALTH_STATUS.DEGRADED,
      reason: "Could not reach provider for image model probe",
      model,
      keyLast4: SAFE_KEY_LAST4(key),
      error: describeFetchError(err),
    };
  }
}

/**
 * Storage adapter health: capability snapshot + (where possible) a tiny
 * round-trip that doesn't write anything. We rely on adapterCapabilities
 * since memory/filesystem/S3 all expose it; signed-URL absence is
 * `degraded`, not `unavailable`.
 */
function checkArtifactStorageHealth({ adapter }) {
  if (!adapter) {
    return {
      status: HEALTH_STATUS.MISSING_CONFIG,
      reason: "Storage adapter not initialised",
    };
  }
  const caps = adapter.adapterCapabilities || {};
  const status = caps.signedUrls ? HEALTH_STATUS.OK : HEALTH_STATUS.DEGRADED;
  return {
    status,
    adapter: caps.adapter || "unknown",
    persistent: Boolean(caps.persistent),
    signedUrls: Boolean(caps.signedUrls),
    retention: Boolean(caps.retention),
    list: Boolean(caps.list),
    delete: Boolean(caps.delete),
    reason:
      status === HEALTH_STATUS.DEGRADED
        ? "Adapter does not support signed URLs (set ARTIFACT_PACKAGE_SIGNING_SECRET to enable)"
        : null,
  };
}

/**
 * DWG converter: env presence only; actual round-trip is too expensive for
 * a health check. The artifact ZIP path emits a sourceGap when the
 * converter is unreachable.
 */
function checkDwgConverter({ env }) {
  const configured =
    Boolean(env.DWG_CONVERTER_URL) ||
    Boolean(env.DWG_CONVERTER_API_KEY) ||
    Boolean(env.LIBREDWG_PATH);
  if (!configured) {
    return {
      status: HEALTH_STATUS.MISSING_CONFIG,
      reason:
        "No DWG converter configured (set DWG_CONVERTER_URL or LIBREDWG_PATH)",
    };
  }
  return {
    status: HEALTH_STATUS.OK,
    transport: env.DWG_CONVERTER_URL ? "remote" : "local",
  };
}

/**
 * IFC engine: env presence only. Optional — absent is missing_config (not
 * unavailable) so dashboards don't false-alarm.
 */
function checkIfcEngine({ env }) {
  const configured =
    Boolean(env.IFC_ENGINE_URL) || Boolean(env.IFC_OPENBIM_PATH);
  if (!configured) {
    return {
      status: HEALTH_STATUS.MISSING_CONFIG,
      reason: "No IFC engine configured (optional)",
    };
  }
  return { status: HEALTH_STATUS.OK };
}

function rollupOverall(checks) {
  const statuses = Object.values(checks).map((c) => c?.status);
  if (statuses.includes(HEALTH_STATUS.UNAVAILABLE)) {
    return HEALTH_STATUS.UNAVAILABLE;
  }
  if (statuses.includes(HEALTH_STATUS.DEGRADED)) {
    return HEALTH_STATUS.DEGRADED;
  }
  if (statuses.every((s) => s === HEALTH_STATUS.OK)) {
    return HEALTH_STATUS.OK;
  }
  return HEALTH_STATUS.MISSING_CONFIG;
}

export async function buildProviderHealthSnapshot({
  env = globalThis.process?.env || {},
  fetchImpl = globalThis.fetch?.bind(globalThis),
  adapter = null,
  timeoutMs = 5000,
} = {}) {
  const reasoningKey = resolveOpenAIReasoningKey(env);
  const imagesKey = resolveOpenAIImagesKey(env);
  const imageModel =
    env.OPENAI_IMAGE_MODEL || env.STEP_07_PROJECT_GRAPH_MODEL || null;
  const resolvedAdapter = adapter || tryGetAdapter();

  const [openaiReasoning, openaiImages] = await Promise.all([
    checkOpenAIKey({ key: reasoningKey, fetchImpl, timeoutMs }),
    checkOpenAIImageEditAccess({
      key: imagesKey,
      model: imageModel,
      fetchImpl,
      timeoutMs,
    }),
  ]);

  const checks = {
    openaiReasoning,
    openaiImages,
    artifactStorage: checkArtifactStorageHealth({ adapter: resolvedAdapter }),
    dwgConverter: checkDwgConverter({ env }),
    ifcEngine: checkIfcEngine({ env }),
  };

  return {
    status: rollupOverall(checks),
    checkedAt: new Date().toISOString(),
    pipelineMode:
      env.PIPELINE_MODE || env.REACT_APP_PIPELINE_MODE || "project_graph",
    checks,
  };
}

function tryGetAdapter() {
  try {
    return getDefaultArtifactStorageAdapter();
  } catch (_err) {
    return null;
  }
}

export const __providerHealthInternals = {
  checkOpenAIKey,
  checkOpenAIImageEditAccess,
  checkArtifactStorageHealth,
  checkDwgConverter,
  checkIfcEngine,
  rollupOverall,
};
