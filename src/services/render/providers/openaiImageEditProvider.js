/**
 * OpenAI image-edit provider — CL-1 of the ControlNet/Redux render-stack plan.
 *
 * Extracted verbatim from `projectGraphImageRenderer.js` so the existing
 * production behaviour (gated by `PROJECT_GRAPH_IMAGE_GEN_ENABLED=true`)
 * remains byte-identical when this provider is selected — either explicitly
 * via `PROJECT_GRAPH_RENDER_PROVIDER=openai` or implicitly via the legacy
 * gate when no explicit provider is set.
 *
 * @module services/render/providers/openaiImageEditProvider
 */

import logger from "../../../utils/logger.js";
import openaiEnv from "../../openaiProviderEnv.cjs";

export const OPENAI_IMAGE_EDIT_PROVIDER_VERSION =
  "openai-image-edit-provider-v1";

export const PANEL_TYPE_TO_SIZE = Object.freeze({
  hero_3d: "1536x1024",
  exterior_render: "1536x1024",
  axonometric: "1024x1024",
  interior_3d: "1280x1024",
});

export const ALLOWED_OPENAI_SIZES = new Set([
  "256x256",
  "512x512",
  "1024x1024",
  "1024x1536",
  "1536x1024",
  "1024x1792",
  "1792x1024",
]);

function parsePositiveInt(value, fallback, { min = 1 } = {}) {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed) || parsed < min) {
    return fallback;
  }
  return parsed;
}

function createOpenAIRequestTimeoutSignal(timeoutMs, externalSignal) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return {
      signal: externalSignal,
      dispose: () => {},
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(
      Object.assign(
        new Error(`OpenAI request timed out after ${timeoutMs}ms`),
        {
          name: "AbortError",
          code: "OPENAI_REQUEST_TIMEOUT",
        },
      ),
    );
  }, timeoutMs);

  if (externalSignal) {
    if (externalSignal.aborted) {
      clearTimeout(timeoutId);
      controller.abort(externalSignal.reason);
    } else {
      externalSignal.addEventListener(
        "abort",
        () => {
          clearTimeout(timeoutId);
          controller.abort(externalSignal.reason);
        },
        { once: true },
      );
    }
  }

  return {
    signal: controller.signal,
    dispose: () => clearTimeout(timeoutId),
  };
}

async function fetchWithTimeout(
  url,
  options = {},
  timeoutMs = 120_000,
  { fetchImpl = global.fetch } = {},
) {
  const { signal: externalSignal, ...restOptions } = options;
  const requestTimeout = createOpenAIRequestTimeoutSignal(
    timeoutMs,
    externalSignal,
  );
  try {
    return await fetchImpl(url, {
      ...restOptions,
      signal: requestTimeout.signal,
    });
  } finally {
    requestTimeout.dispose();
  }
}

export function resolveImageGenEnabled(env = process.env) {
  return openaiEnv.isTruthy(
    openaiEnv.readEnv(env, "PROJECT_GRAPH_IMAGE_GEN_ENABLED"),
  );
}

export function resolveStrictImageGen(env = process.env) {
  return openaiEnv.isTruthy(openaiEnv.readEnv(env, "OPENAI_STRICT_IMAGE_GEN"));
}

export function resolveImageModel(env = process.env) {
  return (
    openaiEnv.readEnv(env, "STEP_10_IMAGE_MODEL") ||
    openaiEnv.readEnv(env, "OPENAI_IMAGE_MODEL") ||
    "gpt-image-2"
  ).trim();
}

export function resolveSize(panelType) {
  const target = PANEL_TYPE_TO_SIZE[panelType] || "1024x1024";
  return ALLOWED_OPENAI_SIZES.has(target) ? target : "1024x1024";
}

export function resolveOpenAIImageTimeoutMs(env = process.env) {
  return parsePositiveInt(
    openaiEnv.readEnv(env, "OPENAI_IMAGE_FETCH_TIMEOUT_MS"),
    parsePositiveInt(
      openaiEnv.readEnv(env, "OPENAI_REASONING_FETCH_TIMEOUT_MS"),
      120_000,
    ),
    { min: 1000 },
  );
}

export function resolveOpenAIImageDownloadTimeoutMs(env = process.env) {
  return parsePositiveInt(
    openaiEnv.readEnv(env, "OPENAI_IMAGE_DOWNLOAD_TIMEOUT_MS"),
    resolveOpenAIImageTimeoutMs(env),
    { min: 1000 },
  );
}

/**
 * Diagnostics snapshot for the OpenAI provider. Drives the legacy
 * `getProjectGraphImageProviderConfig` export so existing tests/callers do
 * not see a behaviour change.
 */
export function getConfig(env = process.env) {
  const keyInfo = openaiEnv.resolveOpenAIImageApiKeyInfo(env);
  const orgProject = openaiEnv.getOpenAIOrgProjectDiagnostics(env);
  return {
    imageGenEnabled: resolveImageGenEnabled(env),
    strictImageGen: resolveStrictImageGen(env),
    openaiConfigured: keyInfo.hasKey,
    keySource: keyInfo.keySource,
    keyLast4: keyInfo.keyLast4,
    warning: keyInfo.warning,
    model: resolveImageModel(env),
    ...orgProject,
  };
}

/**
 * Provider availability gate consulted before the renderer rasterises the
 * reference SVG. Returns structured source gaps when the provider cannot
 * run, so the renderer can fall back deterministically.
 */
export function validateAvailable(env = process.env) {
  if (!resolveImageGenEnabled(env)) {
    return {
      available: false,
      fallbackReason: "gate_disabled",
      sourceGaps: ["PROJECT_GRAPH_IMAGE_GEN_ENABLED_FALSE"],
    };
  }
  const keyInfo = openaiEnv.resolveOpenAIImageApiKeyInfo(env);
  if (!keyInfo.hasKey) {
    return {
      available: false,
      fallbackReason: "missing_api_key",
      sourceGaps: ["MISSING_OPENAI_IMAGES_API_KEY"],
    };
  }
  return { available: true };
}

/**
 * Build a multipart/form-data body for the OpenAI images edit endpoint.
 * Uses the global FormData / Blob (Node 18+ supports both natively).
 */
function buildImageEditFormData({ imageBuffer, prompt, model, size }) {
  if (typeof FormData === "undefined" || typeof Blob === "undefined") {
    throw new Error(
      "FormData/Blob unavailable in this runtime; OpenAI images.edit requires Node 18+ or fetch polyfill.",
    );
  }
  const form = new FormData();
  form.set("model", model);
  form.set("prompt", prompt);
  form.set("size", size);
  form.set("n", "1");
  form.set(
    "image",
    new Blob([imageBuffer], { type: "image/png" }),
    "reference.png",
  );
  return form;
}

/**
 * Call OpenAI `/v1/images/edits` with the reference image + prompt and
 * return the rendered PNG bytes. Throws on non-200 or empty response so the
 * caller can fall back to the deterministic SVG.
 */
async function callOpenAIImageEdit({ imageBuffer, prompt, panelType, env }) {
  const keyInfo = openaiEnv.resolveOpenAIImageApiKeyInfo(env);
  if (!keyInfo.hasKey) {
    const error = new Error(
      "OPENAI_IMAGES_API_KEY, OPENAI_API_KEY, or OPENAI_REASONING_API_KEY is not set.",
    );
    error.fallbackReason = "missing_api_key";
    throw error;
  }
  const model = resolveImageModel(env);
  const size = resolveSize(panelType);
  const form = buildImageEditFormData({ imageBuffer, prompt, model, size });

  logger.info(`[OpenAI] START image edit panel=${panelType} model=${model}`, {
    panelType,
    model,
    size,
    keySource: keyInfo.keySource,
    keyLast4: keyInfo.keyLast4,
    ...openaiEnv.getOpenAIOrgProjectDiagnostics(env),
  });

  const response = await fetchWithTimeout(
    "https://api.openai.com/v1/images/edits",
    {
      method: "POST",
      headers: openaiEnv.buildOpenAIRequestHeaders(keyInfo, env),
      body: form,
    },
    resolveOpenAIImageTimeoutMs(env),
    { fetchImpl: global.fetch },
  );

  const requestId =
    response.headers?.get?.("x-request-id") ||
    response.headers?.get?.("openai-request-id") ||
    null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      `OpenAI images.edit failed (${response.status}): ${data?.error?.message || "unknown"}`,
    );
    error.status = response.status;
    error.requestId = requestId;
    error.usage = data?.usage || null;
    error.fallbackReason = "openai_error";
    logger.warn(`[OpenAI] FAIL image edit panel=${panelType}`, {
      panelType,
      model,
      status: response.status,
      requestId,
      reason: data?.error?.message || "unknown",
    });
    throw error;
  }

  const entry = (data.data || [])[0];
  if (!entry?.b64_json && !entry?.url) {
    const error = new Error("OpenAI images.edit returned no image payload.");
    error.requestId = requestId;
    error.usage = data?.usage || null;
    error.fallbackReason = "empty_response";
    throw error;
  }

  let pngBuffer;
  if (entry.b64_json) {
    pngBuffer = Buffer.from(entry.b64_json, "base64");
  } else {
    const fetchResp = await fetchWithTimeout(
      entry.url,
      { method: "GET" },
      resolveOpenAIImageDownloadTimeoutMs(env),
      { fetchImpl: global.fetch },
    );
    if (!fetchResp.ok) {
      throw new Error(
        `Failed to download generated image: ${fetchResp.status}`,
      );
    }
    const arrayBuffer = await fetchResp.arrayBuffer();
    pngBuffer = Buffer.from(arrayBuffer);
  }

  logger.info(`[OpenAI] OK image edit panel=${panelType}`, {
    panelType,
    model,
    requestId,
    bytes: pngBuffer.length,
    usage: data?.usage || null,
  });

  return {
    pngBuffer,
    model,
    size,
    revisedPrompt: entry.revised_prompt || null,
    requestId,
    usage: data?.usage || null,
    keySource: keyInfo.keySource,
    keyLast4: keyInfo.keyLast4,
    ...openaiEnv.getOpenAIOrgProjectDiagnostics(env),
  };
}

/**
 * Provider-contract `render` entrypoint. Returns the OpenAI-rendered PNG
 * plus a normalised provenance block. Caller is responsible for assembling
 * the final `ProjectGraphRenderResult`.
 */
export async function render({
  panelType,
  referencePng,
  prompt,
  env = process.env,
}) {
  const result = await callOpenAIImageEdit({
    imageBuffer: referencePng,
    prompt,
    panelType,
    env,
  });
  return {
    pngBuffer: result.pngBuffer,
    model: result.model,
    size: result.size,
    revisedPrompt: result.revisedPrompt,
    requestId: result.requestId,
    usage: result.usage,
    providerMetadata: {
      provider: "openai",
      providerUsed: "openai",
      imageProviderUsed: "openai",
      imageRenderFallback: false,
      imageRenderFallbackReason: null,
      keySource: result.keySource,
      keyLast4: result.keyLast4,
      orgConfigured: result.orgConfigured,
      projectConfigured: result.projectConfigured,
      referenceSource: "compiled_3d_control_svg",
    },
    sourceGaps: [],
  };
}

const openaiImageEditProvider = Object.freeze({
  name: "openai",
  version: OPENAI_IMAGE_EDIT_PROVIDER_VERSION,
  getConfig,
  validateAvailable,
  render,
});

export default openaiImageEditProvider;

export const __test = {
  callOpenAIImageEdit,
  buildImageEditFormData,
  fetchWithTimeout,
  parsePositiveInt,
};
