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
 *   2. Dispatching the rasterised reference + prompt to a selected render
 *      provider (openai / mock / replicate-stub) via the provider registry
 *      in `./providers/renderProviderRegistry.js`.
 *   3. Returning the rendered PNG bytes plus provenance.
 *
 * The reference-image approach is critical: text-only prompts cannot
 * guarantee that the rendered building matches the deterministic plans,
 * elevations, and sections on the same A1 sheet. By anchoring on the
 * compiled-geometry silhouette, the generated render shares the SAME
 * geometry hash as every other panel.
 *
 * Provider selection — CL-1:
 *   - `PROJECT_GRAPH_RENDER_PROVIDER` explicit values: `openai|mock|replicate`.
 *   - When unset and `PROJECT_GRAPH_IMAGE_GEN_ENABLED=true`, legacy implicit
 *     `openai` (byte-identical to pre-CL-1 production behaviour).
 *   - When unset and `PROJECT_GRAPH_IMAGE_GEN_ENABLED=false`, deterministic
 *     fallback with `imageRenderFallbackReason: "gate_disabled"`.
 *   - `replicate` is a stub returning `PROVIDER_NOT_IMPLEMENTED` until CL-4.
 *
 * Hard invariants (per the approved plan):
 *   - ProjectGraph / compiledProject is the only geometry authority.
 *     Image-model output never feeds back into deterministic SVG / DXF /
 *     IFC / JSON / XLSX. Enforced by `drawingConsistencyChecks.js`.
 *   - `geometryHash` is the cross-artifact identity key; CL-2 will add
 *     `controlSvgHash`, `footprintMaskHash`, `depthHash`, `lineartHash`
 *     and CL-3 `reduxReferenceSetHash`, all carried through the request /
 *     result shape defined in `renderProviderRegistry.js`. None of those
 *     enter `geometryHash`.
 *
 * @module services/render/projectGraphImageRenderer
 */

import logger from "../../utils/logger.js";
import { rasteriseSvgToPng } from "./svgRasteriser.js";
import openaiImageEditProvider, {
  getConfig as getOpenAIProviderConfig,
  resolveImageGenEnabled,
  resolveStrictImageGen,
  resolveSize,
  resolveImageModel,
  PANEL_TYPE_TO_SIZE,
} from "./providers/openaiImageEditProvider.js";
import { selectProvider } from "./providers/renderProviderRegistry.js";

const RENDERER_VERSION = "project-graph-image-renderer-v2";

/**
 * Legacy diagnostics export — returns the OpenAI provider snapshot so
 * pre-CL-1 callers (tests, status endpoints) see the same shape.
 */
export function getProjectGraphImageProviderConfig(env = process.env) {
  return getOpenAIProviderConfig(env);
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
  providerName = "openai",
  sourceGaps = [],
}) {
  return {
    pngBuffer: null,
    provider: providerName,
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
    sourceGaps,
    provenance: {
      renderer: RENDERER_VERSION,
      panelType,
      provider: providerName,
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
      sourceGaps,
    },
  };
}

/**
 * Strict-mode promotion applies ONLY when the intended provider was OpenAI
 * (explicit `PROJECT_GRAPH_RENDER_PROVIDER=openai` or the legacy implicit
 * gate). Selecting `mock` or `replicate` explicitly never escalates a
 * fallback into a thrown error.
 */
function handleFallback({
  panelType,
  geometryHash,
  reason,
  config,
  error,
  providerName = "openai",
  sourceGaps = [],
}) {
  logger.warn(
    `[${providerName}] SKIP render panel=${panelType} reason=${reason}`,
    {
      panelType,
      reason,
      providerName,
      strictImageGen: config.strictImageGen,
      openaiConfigured: config.openaiConfigured,
      keySource: config.keySource,
      orgConfigured: config.orgConfigured,
      projectConfigured: config.projectConfigured,
      error: error?.message || null,
      sourceGaps,
    },
  );
  if (config.strictImageGen && providerName === "openai") {
    throw createStrictImageError({ panelType, reason, error });
  }
  return createFallbackResult({
    panelType,
    geometryHash,
    reason,
    config,
    error,
    providerName,
    sourceGaps,
  });
}

function assembleSuccessResult({
  panelType,
  geometryHash,
  providerResult,
  qaAttemptLog,
}) {
  const meta = providerResult.providerMetadata || {};
  const providerName = meta.provider || "openai";
  return {
    pngBuffer: providerResult.pngBuffer,
    provider: providerName,
    providerUsed: meta.providerUsed || providerName,
    imageProviderUsed: meta.imageProviderUsed || providerName,
    imageRenderFallback: Boolean(meta.imageRenderFallback),
    imageRenderFallbackReason: meta.imageRenderFallbackReason || null,
    fallbackReason: meta.imageRenderFallbackReason || null,
    openaiConfigured: providerName === "openai" ? true : null,
    requestId: providerResult.requestId || null,
    usage: providerResult.usage || null,
    sourceGaps: providerResult.sourceGaps || [],
    provenance: {
      renderer: RENDERER_VERSION,
      panelType,
      provider: providerName,
      providerUsed: meta.providerUsed || providerName,
      imageProviderUsed: meta.imageProviderUsed || providerName,
      imageRenderFallback: Boolean(meta.imageRenderFallback),
      imageRenderFallbackReason: meta.imageRenderFallbackReason || null,
      model: providerResult.model || null,
      size: providerResult.size || null,
      revisedPrompt: providerResult.revisedPrompt || null,
      requestId: providerResult.requestId || null,
      usage: providerResult.usage || null,
      keySource: meta.keySource || null,
      keyLast4: meta.keyLast4 || null,
      orgConfigured: meta.orgConfigured ?? null,
      projectConfigured: meta.projectConfigured ?? null,
      sourceGeometryHash: geometryHash,
      referenceSource: meta.referenceSource || "compiled_3d_control_svg",
      sourceGaps: providerResult.sourceGaps || [],
      qaAttempts: qaAttemptLog.length > 0 ? qaAttemptLog : null,
    },
  };
}

/**
 * Render a single 3D panel (hero_3d / exterior_render / axonometric /
 * interior_3d) by anchoring the active provider on the deterministic
 * ProjectGraph SVG silhouette.
 *
 * Public API is unchanged from pre-CL-1.
 *
 * @param {object} args
 * @param {string} args.panelType                  - One of the 3D panel types.
 * @param {string} args.deterministicSvg           - Compiled-geometry control SVG.
 * @param {string} args.prompt                     - Climate+style+programme aware prompt.
 * @param {string} args.geometryHash               - For provenance.
 * @param {object} [args.env]                      - Defaults to process.env.
 * @param {object} [args.projectGeometry]          - PR5 vision-QA input.
 * @param {number} [args.maxQARetries]             - PR5 opt-in retry count.
 * @param {Function} [args.qaVerifier]             - PR5 verifier injection.
 * @returns {Promise<object|null>}                 - Render result + provenance.
 */
export async function renderProjectGraphPanelImage({
  panelType,
  deterministicSvg,
  prompt,
  geometryHash,
  env = process.env,
  // PR5 inputs preserved unchanged.
  projectGeometry = null,
  maxQARetries = 0,
  qaVerifier = null,
} = {}) {
  const config = getOpenAIProviderConfig(env);
  const selection = selectProvider({ env });

  // ─── Selection outcomes that short-circuit before rasterisation ──────
  if (selection.reason === "gate_disabled") {
    logger.info(
      `[render] SKIP panel=${panelType || "unknown"} reason=gate_disabled PROJECT_GRAPH_IMAGE_GEN_ENABLED=false`,
      {
        panelType,
        model: config.model,
        openaiConfigured: config.openaiConfigured,
        keySource: config.keySource,
      },
    );
    return handleFallback({
      panelType,
      geometryHash,
      reason: "gate_disabled",
      config,
      providerName: "openai",
      sourceGaps: ["IMAGE_GEN_DISABLED"],
    });
  }

  if (selection.reason === "unknown_provider") {
    return handleFallback({
      panelType,
      geometryHash,
      reason: "unknown_provider",
      config,
      providerName: selection.explicitRequest || "openai",
      sourceGaps: [`UNKNOWN_PROVIDER:${selection.explicitRequest}`],
    });
  }

  const provider = selection.provider;
  const providerName = provider.name;

  // ─── Input validation (same ordering as pre-CL-1) ────────────────────
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
      providerName,
    });
  }
  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    return handleFallback({
      panelType,
      geometryHash,
      reason: "missing_prompt",
      config,
      providerName,
    });
  }

  // ─── Provider availability gate ──────────────────────────────────────
  const availability = provider.validateAvailable(env);
  if (!availability.available) {
    return handleFallback({
      panelType,
      geometryHash,
      reason: availability.fallbackReason || "provider_unavailable",
      config,
      providerName,
      sourceGaps: availability.sourceGaps || [],
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

    // ─── Render-then-verify-then-retry loop (provider-agnostic) ──────
    const clampedRetries = Math.max(0, Math.min(2, Number(maxQARetries) || 0));
    let activePrompt = prompt;
    let lastResult = null;
    let lastQa = null;
    let attempts = 0;
    const qaAttemptLog = [];

    while (attempts <= clampedRetries) {
      attempts += 1;
      lastResult = await provider.render({
        panelType,
        referencePng,
        prompt: activePrompt,
        geometryHash,
        env,
      });

      if (clampedRetries === 0) {
        break;
      }

      const { verifyRenderAgainstGeometry, amendPromptForRetry } =
        await import("./renderGeometryQA.js");
      lastQa = await verifyRenderAgainstGeometry({
        pngBytes: lastResult.pngBuffer,
        projectGeometry,
        panelType,
        env,
        verifier: qaVerifier,
      });
      qaAttemptLog.push({
        attempt: attempts,
        score: lastQa.score,
        ok: lastQa.ok,
        skipped: lastQa.skipped,
        reason: lastQa.reason,
        mismatches: lastQa.mismatches,
      });
      if (lastQa.ok || lastQa.skipped) break;
      if (attempts > clampedRetries) break;
      const expected = lastQa.expected || null;
      activePrompt = amendPromptForRetry(prompt, lastQa.mismatches, expected);
    }

    if (lastQa && !lastQa.ok && !lastQa.skipped) {
      logger.warn(
        `[${providerName}] FALLBACK panel=${panelType} reason=geometry_drift score=${lastQa.score}`,
        {
          panelType,
          attempts,
          score: lastQa.score,
          mismatches: lastQa.mismatches,
        },
      );
      return handleFallback({
        panelType,
        geometryHash,
        reason: "geometry_drift",
        config,
        providerName,
        error: new Error(
          `Render QA failed after ${attempts} attempts; mismatches: ${(lastQa.mismatches || []).join("; ") || "(none)"}`,
        ),
      });
    }

    return assembleSuccessResult({
      panelType,
      geometryHash,
      providerResult: lastResult,
      qaAttemptLog,
    });
  } catch (error) {
    return handleFallback({
      panelType,
      geometryHash,
      reason: error?.fallbackReason || `${providerName}_error`,
      config,
      error,
      providerName,
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
  RENDERER_VERSION,
};
