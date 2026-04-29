/**
 * ProjectGraph Image Renderer
 *
 * Server-side helper that converts a deterministic 3D control SVG (from the
 * compiled ProjectGraph — hero_3d, exterior_render, axonometric, interior_3d)
 * into a photoreal PNG by:
 *
 *   1. Rasterising the deterministic SVG to a PNG silhouette / massing
 *      reference (preserves geometry: footprint, opening positions, roof
 *      shape, storey count).
 *   2. Calling OpenAI's `/v1/images/edits` endpoint with the PNG as the
 *      reference image plus a climate + style + programme aware prompt
 *      (built by `panelPromptBuilders.js`).
 *   3. Returning the rendered PNG bytes plus provenance.
 *
 * The reference-image approach is critical: text-only prompts cannot
 * guarantee that the rendered building matches the deterministic plans,
 * elevations, and sections on the same A1 sheet. By anchoring on the
 * compiled-geometry silhouette, the generated render shares the SAME
 * geometry hash as every other panel.
 *
 * Pipeline mode gating: only runs when `PIPELINE_MODE=project_graph` (or
 * unset → default project_graph) AND `PROJECT_GRAPH_IMAGE_GEN_ENABLED=true`.
 * Falls back to the deterministic SVG cleanly when disabled or on failure.
 *
 * @module services/render/projectGraphImageRenderer
 */

import logger from "../../utils/logger.js";
import openaiEnv from "../openaiProviderEnv.cjs";
import { rasteriseSvgToPng } from "./svgRasteriser.js";

const RENDERER_VERSION = "project-graph-image-renderer-v1";

const PANEL_TYPE_TO_SIZE = Object.freeze({
  hero_3d: "1536x1024",
  exterior_render: "1536x1024",
  axonometric: "1024x1024",
  interior_3d: "1280x1024",
});

const ALLOWED_OPENAI_SIZES = new Set([
  "256x256",
  "512x512",
  "1024x1024",
  "1024x1536",
  "1536x1024",
  "1024x1792",
  "1792x1024",
]);

function resolveImageGenEnabled(env = process.env) {
  return openaiEnv.isTruthy(
    openaiEnv.readEnv(env, "PROJECT_GRAPH_IMAGE_GEN_ENABLED"),
  );
}

function resolveStrictImageGen(env = process.env) {
  return openaiEnv.isTruthy(openaiEnv.readEnv(env, "OPENAI_STRICT_IMAGE_GEN"));
}

function resolveImageModel(env = process.env) {
  return (
    openaiEnv.readEnv(env, "STEP_10_IMAGE_MODEL") ||
    openaiEnv.readEnv(env, "OPENAI_IMAGE_MODEL") ||
    "gpt-image-2"
  ).trim();
}

function resolveSize(panelType) {
  const target = PANEL_TYPE_TO_SIZE[panelType] || "1024x1024";
  return ALLOWED_OPENAI_SIZES.has(target) ? target : "1024x1024";
}

export function getProjectGraphImageProviderConfig(env = process.env) {
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

function createStrictImageError({ panelType, reason, error }) {
  const message = error?.message || reason;
  const strictError = new Error(
    `[OpenAI] strict image generation failed panel=${panelType} reason=${reason}: ${message}`,
  );
  strictError.code = "OPENAI_STRICT_IMAGE_GEN_FAILED";
  strictError.panelType = panelType;
  strictError.fallbackReason = reason;
  strictError.strictImageGeneration = true;
  strictError.cause = error;
  return strictError;
}

function createFallbackResult({
  panelType,
  geometryHash,
  reason,
  config,
  error,
}) {
  return {
    pngBuffer: null,
    provider: "openai",
    providerUsed: "deterministic",
    imageProviderUsed: "deterministic",
    imageRenderFallback: true,
    imageRenderFallbackReason: reason,
    fallbackReason: reason,
    openaiConfigured: config.openaiConfigured,
    keySource: config.keySource,
    keyLast4: config.keyLast4,
    orgConfigured: config.orgConfigured,
    projectConfigured: config.projectConfigured,
    model: config.model,
    requestId: error?.requestId || null,
    usage: error?.usage || null,
    status: error?.status || null,
    error: error?.message || null,
    provenance: {
      renderer: RENDERER_VERSION,
      panelType,
      provider: "openai",
      providerUsed: "deterministic",
      imageProviderUsed: "deterministic",
      imageRenderFallback: true,
      imageRenderFallbackReason: reason,
      sourceGeometryHash: geometryHash,
      referenceSource: "compiled_3d_control_svg",
      openaiConfigured: config.openaiConfigured,
      keySource: config.keySource,
      keyLast4: config.keyLast4,
      orgConfigured: config.orgConfigured,
      projectConfigured: config.projectConfigured,
      model: config.model,
      requestId: error?.requestId || null,
      usage: error?.usage || null,
      error: error?.message || null,
    },
  };
}

function handleFallback({ panelType, geometryHash, reason, config, error }) {
  logger.warn(`[OpenAI] SKIP image edit panel=${panelType} reason=${reason}`, {
    panelType,
    reason,
    strictImageGen: config.strictImageGen,
    openaiConfigured: config.openaiConfigured,
    keySource: config.keySource,
    orgConfigured: config.orgConfigured,
    projectConfigured: config.projectConfigured,
    error: error?.message || null,
  });
  if (config.strictImageGen) {
    throw createStrictImageError({ panelType, reason, error });
  }
  return createFallbackResult({
    panelType,
    geometryHash,
    reason,
    config,
    error,
  });
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

  const response = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: openaiEnv.buildOpenAIRequestHeaders(keyInfo, env),
    body: form,
  });

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
    const fetchResp = await fetch(entry.url);
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
 * Render a single 3D panel (hero_3d / exterior_render / axonometric /
 * interior_3d) by anchoring an OpenAI image-edit call on the deterministic
 * ProjectGraph SVG silhouette.
 *
 * @param {object} args
 * @param {string} args.panelType                  - One of the 3D panel types.
 * @param {string} args.deterministicSvg           - Compiled-geometry control SVG.
 * @param {string} args.prompt                     - Climate+style+programme aware prompt.
 * @param {string} args.geometryHash               - For provenance.
 * @returns {Promise<{ pngBuffer: Buffer, provenance: object } | null>}
 *   Rendered PNG plus provenance, or null when image-gen is disabled / fails.
 */
export async function renderProjectGraphPanelImage({
  panelType,
  deterministicSvg,
  prompt,
  geometryHash,
  env = process.env,
} = {}) {
  const config = getProjectGraphImageProviderConfig(env);
  if (!config.imageGenEnabled) {
    logger.info(
      `[OpenAI] SKIP image edit panel=${panelType || "unknown"} reason=gate_disabled PROJECT_GRAPH_IMAGE_GEN_ENABLED=false`,
      {
        panelType,
        model: config.model,
        openaiConfigured: config.openaiConfigured,
        keySource: config.keySource,
      },
    );
    return createFallbackResult({
      panelType,
      geometryHash,
      reason: "gate_disabled",
      config,
    });
  }
  if (
    !panelType ||
    typeof deterministicSvg !== "string" ||
    !deterministicSvg.trim()
  ) {
    return handleFallback({
      panelType,
      geometryHash,
      reason: "missing_control_svg",
      config,
    });
  }
  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    return handleFallback({
      panelType,
      geometryHash,
      reason: "missing_prompt",
      config,
    });
  }
  if (!config.openaiConfigured) {
    return handleFallback({
      panelType,
      geometryHash,
      reason: "missing_api_key",
      config,
    });
  }

  try {
    const { pngBuffer: referencePng } = await rasteriseSvgToPng({
      svg: deterministicSvg,
      densityDpi: 144,
      background: "#ffffff",
      provenance: {
        source: "compiled_3d_control_svg_reference",
        panelType,
        geometryHash,
      },
    });

    const result = await callOpenAIImageEdit({
      imageBuffer: referencePng,
      prompt,
      panelType,
      env,
    });

    return {
      pngBuffer: result.pngBuffer,
      provider: "openai",
      providerUsed: "openai",
      imageProviderUsed: "openai",
      imageRenderFallback: false,
      imageRenderFallbackReason: null,
      fallbackReason: null,
      openaiConfigured: true,
      requestId: result.requestId,
      usage: result.usage,
      provenance: {
        renderer: RENDERER_VERSION,
        panelType,
        provider: "openai",
        providerUsed: "openai",
        imageProviderUsed: "openai",
        imageRenderFallback: false,
        imageRenderFallbackReason: null,
        model: result.model,
        size: result.size,
        revisedPrompt: result.revisedPrompt,
        requestId: result.requestId,
        usage: result.usage,
        keySource: result.keySource,
        keyLast4: result.keyLast4,
        orgConfigured: result.orgConfigured,
        projectConfigured: result.projectConfigured,
        sourceGeometryHash: geometryHash,
        referenceSource: "compiled_3d_control_svg",
      },
    };
  } catch (error) {
    return handleFallback({
      panelType,
      geometryHash,
      reason: error?.fallbackReason || "openai_error",
      config,
      error,
    });
  }
}

export const __test = {
  resolveImageGenEnabled,
  resolveStrictImageGen,
  resolveSize,
  resolveImageModel,
  getProjectGraphImageProviderConfig,
  PANEL_TYPE_TO_SIZE,
};
