/**
 * Replicate ControlNet Client
 *
 * Client-side wrapper that dispatches panel renders to the appropriate
 * Replicate ControlNet endpoint (Canny or Depth) based on panel type policy.
 *
 * Auto-selects model from CONTROLNET_PASS_POLICY:
 *   - controlnet-canny → /api/controlnet/render
 *   - controlnet-depth → /api/controlnet/depth-render
 *
 * Returns the same shape as FLUX img2img results so callers can substitute
 * directly without branching downstream.
 *
 * @module services/controlnet/replicateControlNetClient
 */

import logger from "../../utils/logger.js";
import { getPassPolicy } from "./ControlNetConditioningService.js";

const DEFAULT_TIMEOUT_MS = 150000; // 2.5 min — Replicate poll loop is 2 min

/**
 * Determine the proxy URL base. Local dev uses Express on port 3001;
 * production uses relative paths to Vercel serverless functions.
 */
function getApiBase() {
  if (typeof window !== "undefined" && window.location) {
    const { hostname, protocol } = window.location;
    const isLocal = hostname === "localhost" || hostname === "127.0.0.1";
    if (isLocal) {
      return `${protocol}//${hostname}:3001`;
    }
  }
  return "";
}

/**
 * POST helper with timeout + JSON handling.
 */
async function postJson(url, body, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      const errText = await response.text().catch(() => response.statusText);
      throw new Error(`${url} → ${response.status}: ${errText}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Generate a render via the Canny ControlNet endpoint.
 *
 * @param {Object} params
 * @param {string} params.controlImage - PNG data URL (Canny edge map)
 * @param {string} params.prompt
 * @param {string} [params.negativePrompt]
 * @param {number} [params.strength=0.75]
 * @param {number} [params.seed]
 * @param {number} [params.width=1024]
 * @param {number} [params.height=1024]
 * @returns {Promise<Object>} { url, seed, metadata }
 */
async function generateCanny({
  controlImage,
  prompt,
  negativePrompt = "",
  strength = 0.75,
  seed,
  width = 1024,
  height = 1024,
}) {
  const base = getApiBase();
  return postJson(`${base}/api/controlnet/render`, {
    cannyImage: controlImage,
    prompt,
    negative_prompt: negativePrompt,
    controlnet_strength: strength,
    seed,
    width,
    height,
  });
}

/**
 * Generate a render via the Depth ControlNet endpoint.
 *
 * @param {Object} params
 * @param {string} params.controlImage - PNG data URL (depth map)
 * @param {string} params.prompt
 * @param {string} [params.negativePrompt]
 * @param {number} [params.strength=0.65]
 * @param {number} [params.seed]
 * @param {number} [params.width=1024]
 * @param {number} [params.height=1024]
 * @returns {Promise<Object>} { url, seed, metadata }
 */
async function generateDepth({
  controlImage,
  prompt,
  negativePrompt = "",
  strength = 0.65,
  seed,
  width = 1024,
  height = 1024,
}) {
  const base = getApiBase();
  return postJson(`${base}/api/controlnet/depth-render`, {
    depthImage: controlImage,
    prompt,
    negative_prompt: negativePrompt,
    controlnet_strength: strength,
    seed,
    width,
    height,
  });
}

/**
 * Generate a render with auto-selected ControlNet model based on panel type.
 *
 * Picks Canny vs Depth from CONTROLNET_PASS_POLICY[panelType].controlnetModel.
 * If `strength` is omitted, uses the policy's recommended strength.
 *
 * @param {Object} params
 * @param {string} params.controlImage - Composite PNG data URL
 * @param {string} params.prompt
 * @param {string} params.panelType - e.g. 'hero_3d', 'elevation_north'
 * @param {string} [params.negativePrompt]
 * @param {number} [params.strength] - Override policy strength
 * @param {number} [params.seed]
 * @param {number} [params.width=1024]
 * @param {number} [params.height=1024]
 * @returns {Promise<{url:string, seed:number, metadata:Object, generatorUsed:string}|null>}
 *   FLUX-shaped result, or null on failure (caller falls back to FLUX img2img).
 */
export async function generateWithControlNet({
  controlImage,
  prompt,
  panelType,
  negativePrompt = "",
  strength,
  seed,
  width = 1024,
  height = 1024,
}) {
  if (!controlImage || !prompt || !panelType) {
    logger.warn(
      `[ReplicateControlNet] Missing required params (controlImage=${!!controlImage}, prompt=${!!prompt}, panelType=${panelType})`,
    );
    return null;
  }

  const policy = getPassPolicy(panelType);
  if (!policy) {
    logger.warn(`[ReplicateControlNet] No policy for panel type: ${panelType}`);
    return null;
  }

  const effectiveStrength = strength != null ? strength : policy.strength;
  const model = policy.controlnetModel;

  try {
    logger.info(
      `[ReplicateControlNet] ${panelType} → ${model} (strength=${effectiveStrength})`,
    );

    const result =
      model === "controlnet-depth"
        ? await generateDepth({
            controlImage,
            prompt,
            negativePrompt,
            strength: effectiveStrength,
            seed,
            width,
            height,
          })
        : await generateCanny({
            controlImage,
            prompt,
            negativePrompt,
            strength: effectiveStrength,
            seed,
            width,
            height,
          });

    if (!result?.url) {
      logger.warn(`[ReplicateControlNet] ${panelType} returned no URL`);
      return null;
    }

    // Normalize to FLUX-result shape so multiModelImageService can use it as-is
    return {
      url: result.url,
      imageUrl: result.url,
      seed: result.seed ?? seed,
      generatorUsed: model,
      metadata: {
        ...(result.metadata || {}),
        controlnetModel: model,
        controlnetStrength: effectiveStrength,
        panelType,
      },
    };
  } catch (err) {
    logger.warn(
      `[ReplicateControlNet] ${panelType} failed: ${err.message} — caller should fall back`,
    );
    return null;
  }
}

/**
 * Quick capability probe — returns true if Replicate ControlNet appears
 * usable from this environment (relies on the proxy endpoint existing).
 * This is a soft check; the real test is the actual call.
 */
export function isControlNetAvailable() {
  // We can't easily probe REPLICATE_API_TOKEN from the client; defer to the
  // server response. Callers should rely on the null fallback from
  // generateWithControlNet() instead of pre-checking.
  return true;
}

export default {
  generateWithControlNet,
  isControlNetAvailable,
};
