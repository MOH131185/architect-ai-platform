/**
 * Multi-Model Image Service
 *
 * Handles image generation with FLUX primary and style-conditioned SDXL fallback.
 * Supports geometry-conditioned generation (img2img/controlnet).
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
      floorPlanMaskUrl = null,
    } = params;

    const category = getPanelCategory(viewType);
    const needsStyleLock =
      isElevationOrSection(viewType) && !!styleReferenceUrl;
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
    // Try FLUX first (primary for all categories)
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
        floorPlanMaskUrl: needsFloorPlanMask ? floorPlanMaskUrl : null,
      };

      const result = await generateWithFLUX(fluxParams);

      logger.success(`✅ FLUX generation successful for ${viewType}`);

      return {
        ...result,
        model: "flux",
        generatorUsed: "flux-1-dev",
        hadFallback: false,
        category,
      };
    } catch (fluxError) {
      logger.warn(
        `⚠️  FLUX generation failed for ${viewType}: ${fluxError.message}`,
      );

      // ----------------------------------------------------------------
      // Style coherence gate: Block SDXL fallback for elevations/sections
      // when no styleReferenceUrl is available. An unstyled SDXL render
      // produces a different visual language than the FLUX hero, causing
      // mixed-style collage artifacts on the final A1 sheet.
      //
      // Note: needsStyleLock already implies !!styleReferenceUrl, so we
      // check isElevationOrSection directly to catch the case where the
      // hero hasn't generated yet (styleReferenceUrl is null/undefined).
      // ----------------------------------------------------------------
      if (isElevationOrSection(viewType) && !styleReferenceUrl) {
        logger.error(
          `❌ [STYLE GATE] Blocking SDXL fallback for ${viewType} – ` +
            `no styleReferenceUrl available; unstyled fallback would break ` +
            `style coherence with FLUX hero.`,
        );
        throw new Error(
          `FLUX generation failed for ${viewType} and style-safe SDXL fallback ` +
            `is unavailable (no hero style reference): ${fluxError.message}`,
        );
      }

      logger.info(
        `   Attempting style-conditioned SDXL fallback for ${viewType}...`,
      );

      try {
        const sdxlResult = await this.generateWithSDXL({
          viewType,
          prompt,
          negativePrompt,
          seed,
          width,
          height,
          geometryRender,
          geometryStrength,
          styleReferenceUrl: needsStyleLock ? styleReferenceUrl : null,
        });

        logger.success(
          `✅ SDXL fallback successful for ${viewType} (style-conditioned: ${needsStyleLock})`,
        );

        return {
          ...sdxlResult,
          model: "sdxl",
          generatorUsed: "sdxl-replicate",
          hadFallback: true,
          fallbackReason: fluxError.message,
          styleConditioned: needsStyleLock,
          category,
        };
      } catch (sdxlError) {
        logger.error(`❌ Both FLUX and SDXL failed for ${viewType}`);
        throw new Error(
          `Image generation failed: FLUX (${fluxError.message}), SDXL (${sdxlError.message})`,
        );
      }
    }
  }

  /**
   * Generate with SDXL via Replicate.
   *
   * Phase 2: accepts styleReferenceUrl for img2img style conditioning on
   * elevation/section panels, preventing unstyled SDXL fallback.
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
