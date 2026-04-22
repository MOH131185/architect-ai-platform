/**
 * Multi-Model Image Service
 *
 * Handles image generation with FLUX primary and style-conditioned SDXL fallback.
 * Supports geometry-conditioned generation (img2img/controlnet).
 *
 * STYLE GATE:
 * Elevations, sections, axonometrics, and interior views must not fall back to
 * an unstyled generator path. Style coherence is enforced by applying the hero
 * reference whenever available and by failing fast if FLUX cannot complete,
 * rather than silently degrading to an unstyled SDXL output.
 *
 * Phase 2 changes:
 *  - Generator routing by panelRegistry category (3d/site → flux-1-dev, technical/data → flux-1-schnell)
 *  - Style-conditioned SDXL fallback for elevation/section panels (passes hero styleReferenceUrl)
 *  - Persists generatorUsed / model metadata per panel result
 *  - Hero-first anchoring: hero_3d always uses FLUX (never falls back without style ref)
 */

import { generateArchitecturalImage as generateWithFLUX } from "./togetherAIService.js";
import {
  PANEL_REGISTRY,
  normalizeToCanonical,
} from "../config/panelRegistry.js";
import { getActiveModel, isModelReady } from "./modelRegistry.js";
import { extractCannyEdges } from "./cannyEdgeExtractor.js";
import { isFeatureEnabled } from "../config/featureFlags.js";
import { generateWithControlNet as generateWithReplicateControlNet } from "./controlnet/replicateControlNetClient.js";
import { getPassPolicy } from "./controlnet/ControlNetConditioningService.js";
import logger from "../utils/logger.js";

// ---------------------------------------------------------------------------
// Panel category helpers (derived from panelRegistry)
// ---------------------------------------------------------------------------

/**
 * Look up the category for a panel type.
 * @param {string} viewType
 * @returns {"3d"|"site"|"technical"|"data"|"unknown"}
 */
function getPanelCategory(viewType) {
  const canonical = normalizeToCanonical(viewType) || viewType;
  const entry = PANEL_REGISTRY[canonical];
  return entry?.category || "unknown";
}

/**
 * Determine whether a panel is an elevation or section (needs style lock).
 */
function isElevationOrSection(viewType) {
  const canonical = normalizeToCanonical(viewType) || viewType;
  return canonical.startsWith("elevation_") || canonical.startsWith("section_");
}

// ---------------------------------------------------------------------------
// Service class
// ---------------------------------------------------------------------------

class MultiModelImageService {
  constructor() {
    logger.info(
      "🎨 Multi-Model Image Service initialized (Phase 2 – category routing)",
    );
  }

  /**
   * Generate image with category-aware routing and style-conditioned SDXL fallback.
   *
   * @param {Object} params - Generation parameters
   * @param {string} params.viewType - View type (e.g., 'hero_3d', 'elevation_north')
   * @param {string} params.prompt - Text prompt
   * @param {string} params.negativePrompt - Negative prompt
   * @param {number} params.seed - Generation seed
   * @param {number} params.width - Image width
   * @param {number} params.height - Image height
   * @param {Object} params.designDNA - Design DNA
   * @param {Object|string} params.geometryRender - Optional geometry render (control image)
   * @param {number} params.geometryStrength - Geometry influence (0-1, default 0.7)
   * @param {string} params.styleReferenceUrl - Optional hero image URL for style consistency
   * @param {string} params.floorPlanMaskUrl - Optional floor plan URL for interior_3d window alignment
   * @returns {Promise<Object>} Generation result with generatorUsed metadata
   */
  async generateImage(params) {
    const {
      viewType,
      prompt,
      negativePrompt,
      seed,
      width,
      height,
      designDNA,
      geometryRender = null,
      geometryStrength = 0.7,
      styleReferenceUrl = null,
      styleReferenceStrength = null,
      floorPlanMaskUrl = null,
    } = params;

    const category = getPanelCategory(viewType);
    // Hero, axonometric, and interior views need the same material/style
    // anchor as the technical drawings, not just elevations and sections.
    const STYLE_LOCK_PANELS = ["hero_3d", "axonometric", "interior_3d"];
    const canonical = normalizeToCanonical(viewType) || viewType;
    const needsStyleLock =
      (isElevationOrSection(viewType) ||
        STYLE_LOCK_PANELS.includes(canonical)) &&
      !!styleReferenceUrl;
    const needsFloorPlanMask = viewType === "interior_3d" && !!floorPlanMaskUrl;

    if (needsStyleLock) {
      logger.info(
        `🎨 [STYLE LOCK] Style reference will be applied for ${viewType} (category: ${category})`,
      );
    }
    if (needsFloorPlanMask) {
      logger.info(
        `🏠 [FLOOR PLAN LOCK] Floor plan mask will be applied for ${viewType}`,
      );
    }

    logger.info(`🎯 [ROUTING] ${viewType} → category=${category}`);

    // ------------------------------------------------------------------
    // Try ControlNet first (when enabled).
    //
    // Two routing paths:
    //   PATH A: Blender multi-pass composite (preferred when blenderRendering)
    //           geometryRender.type === "blender_controlnet"
    //           → uses replicateControlNetClient with auto Canny/Depth selection
    //   PATH B: Canonical SVG (legacy)
    //           geometryRender?.svg present
    //           → extracts Canny edges from SVG, calls Canny endpoint
    // ------------------------------------------------------------------
    if (isFeatureEnabled("controlNetRendering")) {
      // PATH A: Blender composite control image (depth/lineart/AO/canny mix)
      // Note: we do NOT call isModelReady here because REPLICATE_API_TOKEN is
      // a server-only env var; the proxy endpoint enforces availability and
      // replicateControlNetClient returns null on failure for graceful fallback.
      if (
        geometryRender?.type === "blender_controlnet" &&
        geometryRender?.url
      ) {
        const policy = getPassPolicy(viewType) || {};
        const controlModel =
          geometryRender.controlnetModel ||
          policy.controlnetModel ||
          "controlnet-canny";

        try {
          logger.info(
            `🎯 [CONTROLNET] ${viewType} → ${controlModel} (Blender composite)`,
          );
          const cnResult = await generateWithReplicateControlNet({
            controlImage: geometryRender.url,
            prompt,
            negativePrompt,
            panelType: viewType,
            strength: geometryStrength ?? policy.strength,
            seed,
            width,
            height,
          });

          if (cnResult?.url) {
            logger.success(
              `✅ ControlNet (${controlModel}) successful for ${viewType}`,
            );
            return {
              ...cnResult,
              viewType,
              model: "controlnet",
              generatorUsed: cnResult.generatorUsed || controlModel,
              hadFallback: false,
              category,
            };
          }
          logger.warn(
            `⚠️ ControlNet (${controlModel}) returned null for ${viewType}, falling back to FLUX`,
          );
        } catch (controlnetError) {
          logger.warn(
            `⚠️ ControlNet (${controlModel}) failed for ${viewType}: ${controlnetError.message}`,
          );
          logger.info(`   Falling back to FLUX...`);
        }
      }

      // PATH B: Canonical SVG → Canny edges (legacy SVG-based pipeline)
      if (geometryRender?.svg && isModelReady("render", "controlnet-canny")) {
        const renderModel = getActiveModel("render");
        if (renderModel?.id === "controlnet-canny") {
          try {
            logger.info(
              `🎯 [CONTROLNET] Attempting ControlNet Canny for ${viewType} (SVG path)...`,
            );
            const controlnetResult = await this.generateWithControlNet({
              svgSource: geometryRender.svg,
              prompt,
              negativePrompt,
              seed,
              width,
              height,
              controlnetStrength: renderModel.controlnetStrength || 0.75,
              viewType,
            });

            logger.success(
              `✅ ControlNet generation successful for ${viewType}`,
            );
            return {
              ...controlnetResult,
              model: "controlnet",
              generatorUsed: "controlnet-canny",
              hadFallback: false,
              category,
            };
          } catch (controlnetError) {
            logger.warn(
              `⚠️ ControlNet failed for ${viewType}: ${controlnetError.message}`,
            );
            logger.info(`   Falling back to FLUX...`);
            // Fall through to FLUX
          }
        }
      }
    }

    // ------------------------------------------------------------------
    // Try FLUX (primary for all categories)
    // ------------------------------------------------------------------
    try {
      logger.info(`🎨 Attempting FLUX generation for ${viewType}...`);

      const fluxParams = {
        viewType,
        prompt,
        negativePrompt,
        seed,
        width,
        height,
        designDNA,
        geometryRender: geometryRender
          ? {
              url: geometryRender.url || geometryRender,
              type: geometryRender.type || null,
              model: geometryRender.model || null,
            }
          : null,
        geometryStrength,
        styleReferenceUrl: needsStyleLock ? styleReferenceUrl : null,
        styleReferenceStrength: needsStyleLock ? styleReferenceStrength : null,
        floorPlanMaskUrl: needsFloorPlanMask ? floorPlanMaskUrl : null,
      };

      const result = await generateWithFLUX(fluxParams);

      logger.success(`✅ FLUX generation successful for ${viewType}`);

      return {
        ...result,
        model: "flux",
        generatorUsed: "flux-1-schnell",
        hadFallback: false,
        category,
      };
    } catch (fluxError) {
      logger.warn(
        `⚠️  FLUX generation failed for ${viewType}: ${fluxError.message}`,
      );

      // SDXL/Replicate fallback removed — Together.ai FLUX is the only image provider.
      // If FLUX fails, surface the error directly so it can be retried.
      throw new Error(
        `FLUX generation failed for ${viewType}: ${fluxError.message}`,
      );
    }
  }

  /**
   * @deprecated ControlNet via Replicate removed. Not called in multi_panel workflow.
   * Generate image via ControlNet Canny conditioning.
   *
   * @param {Object} params
   * @param {string} params.svgSource - Canonical SVG from geometry pack
   * @param {string} params.prompt - Text prompt
   * @param {string} params.negativePrompt - Negative prompt
   * @param {number} params.seed - Generation seed
   * @param {number} params.width - Output width
   * @param {number} params.height - Output height
   * @param {number} params.controlnetStrength - 0-1, default 0.75
   * @param {string} params.viewType - Panel type for logging
   * @returns {Promise<Object>} Generation result
   */
  async generateWithControlNet(params) {
    const {
      svgSource,
      prompt,
      negativePrompt,
      seed,
      width,
      height,
      controlnetStrength = 0.75,
      viewType,
    } = params;

    if (!svgSource) {
      throw new Error("ControlNet requires SVG source from canonical pack");
    }

    // Extract Canny edges from canonical SVG
    const cannyImage = await extractCannyEdges(svgSource, { width, height });

    const API_BASE_URL =
      process.env.REACT_APP_API_PROXY_URL || "http://localhost:3001";

    const isDev =
      typeof window !== "undefined" &&
      (window.location?.hostname === "localhost" ||
        window.location?.hostname === "127.0.0.1");

    const endpoint = isDev
      ? `${API_BASE_URL}/api/controlnet/render`
      : "/api/controlnet-render";

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cannyImage,
        prompt,
        negative_prompt: negativePrompt,
        controlnet_strength: controlnetStrength,
        seed,
        width,
        height,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `ControlNet render failed: ${response.status} - ${errorText}`,
      );
    }

    const data = await response.json();
    return {
      url: data.url,
      seed,
      viewType,
      metadata: data.metadata,
    };
  }

  /**
   * @deprecated Replicate/SDXL removed. Together.ai FLUX is the only image provider.
   * Kept for reference only — not called in the multi_panel workflow.
   */
  async generateWithSDXL(params) {
    const {
      viewType,
      prompt,
      negativePrompt,
      seed,
      width,
      height,
      geometryRender,
      geometryStrength,
      styleReferenceUrl = null,
    } = params;

    const replicateKey =
      process.env.REPLICATE_API_TOKEN || process.env.REPLICATE_API_KEY;
    if (!replicateKey) {
      throw new Error("REPLICATE_API_KEY not found in environment");
    }

    // Select model based on available control images
    const hasStyleRef = !!styleReferenceUrl;
    const hasGeometry = !!geometryRender;
    const model =
      hasGeometry || hasStyleRef
        ? "stability-ai/sdxl:controlnet"
        : "stability-ai/sdxl:latest";

    logger.info(
      `   Using Replicate model: ${model} (styleRef: ${hasStyleRef}, geometry: ${hasGeometry})`,
    );

    const API_BASE_URL =
      process.env.REACT_APP_API_PROXY_URL || "http://localhost:3001";

    // Build request body; prefer styleReferenceUrl as img2img source for style conditioning
    const controlImage = hasStyleRef
      ? styleReferenceUrl
      : hasGeometry
        ? geometryRender.url || geometryRender
        : undefined;

    const controlStrength = hasStyleRef
      ? 0.35
      : hasGeometry
        ? geometryStrength
        : undefined;

    try {
      const response = await fetch(`${API_BASE_URL}/api/replicate/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          prompt,
          negative_prompt: negativePrompt,
          width,
          height,
          seed,
          num_inference_steps: 30,
          guidance_scale: 7.5,
          ...(controlImage && {
            image: controlImage,
            controlnet_conditioning_scale: controlStrength,
          }),
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Replicate API error: ${response.status} - ${errorText}`,
        );
      }

      const data = await response.json();

      return {
        url: data.url || data.output?.[0],
        seed,
        viewType,
        metadata: {
          model: "sdxl",
          generatorUsed: "sdxl-replicate",
          width,
          height,
          hadGeometryControl: hasGeometry,
          hadStyleCondition: hasStyleRef,
        },
      };
    } catch (error) {
      logger.error("SDXL generation error:", error.message);
      throw error;
    }
  }
}

// Export singleton instance
const multiModelImageService = new MultiModelImageService();
export default multiModelImageService;
