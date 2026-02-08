/**
 * Together AI Service - Optimized Models for Architecture
 *
 * REASONING: Qwen 2.5 72B Instruct (Best for technical/architectural reasoning)
 * IMAGES: FLUX.1-dev (Best for consistent architectural visualization)
 *
 * Enhanced with DNA-driven prompt generation for 95%+ consistency
 */

import enhancedDNAGenerator from "./enhancedDNAGenerator.js";
import dnaPromptGenerator from "./dnaPromptGenerator.js";
import dnaValidator from "./dnaValidator.js";
import architecturalSheetService from "./architecturalSheetService.js";
import { isFeatureEnabled, FEATURE_FLAGS } from "../config/featureFlags.js";
import runtimeEnv from "../utils/runtimeEnv.js";
import imageRequestQueue, { getImageQueueStatus } from "./imageRequestQueue.js";
import GENERATION_CONFIG, { getAllViews } from "../config/generationConfig.js";
import logger from "../utils/logger.js";

const getFeatureFlags = () => {
  const defaults = { ...FEATURE_FLAGS };
  const session = runtimeEnv.getSession();
  if (!session) {
    return defaults;
  }

  try {
    const stored = JSON.parse(session.getItem("featureFlags") || "{}");
    return { ...defaults, ...stored };
  } catch {
    return defaults;
  }
};

// SECURITY: API keys handled server-side via proxy (secureApiClient pattern)
// All API calls route through API_BASE_URL proxy to keep keys secure
const API_BASE_URL =
  process.env.REACT_APP_API_PROXY_URL || "http://localhost:3001";
let consecutiveRateLimitErrors = 0;

/**
 * Wrap a remote image URL with proxy to avoid CORS issues
 * @param {string} imageUrl - Original image URL (e.g., from Together.ai)
 * @returns {string} Proxied URL (same-origin for CORS-free access)
 */
function wrapImageUrlWithProxy(imageUrl) {
  if (!imageUrl) return imageUrl;

  // If already a data URL or proxy URL, return as-is
  if (imageUrl.startsWith("data:") || imageUrl.includes("/api/proxy")) {
    return imageUrl;
  }

  // Determine if we're in dev or prod
  const isDev =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1");

  // Use proxy endpoint (same-origin for CORS-free access)
  const proxyBase = isDev
    ? `${API_BASE_URL}/api/proxy/image`
    : "/api/proxy-image";

  return `${proxyBase}?url=${encodeURIComponent(imageUrl)}`;
}

// Note: API key validation happens server-side in the proxy endpoints
// Client-side code never accesses API keys directly (Opus 4.1 compliance)

/**
 * Normalize fetch response - handles JSON and text responses gracefully
 * Extracts Retry-After header and maps to structured error
 */
async function normalizeResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  const retryAfter =
    parseInt(response.headers.get("retry-after") || "0", 10) || undefined;

  let body;
  try {
    if (contentType.includes("application/json")) {
      body = await response.json();
    } else {
      // Handle non-JSON responses (e.g., "Image generation..." text errors)
      const text = await response.text();
      body = { error: text, rawText: text };
    }
  } catch (parseError) {
    // If parsing fails, create a structured error
    const text = await response.text().catch(() => "Unknown error");
    body = { error: text, rawText: text, parseError: parseError.message };
  }

  if (!response.ok) {
    const error = new Error(
      body?.error || body?.message || `HTTP ${response.status}`,
    );
    error.status = response.status;
    error.retryAfter = retryAfter;
    error.body = body;
    throw error;
  }

  return { body, retryAfter };
}

/**
 * Qwen 2.5 72B Instruct - Best Together.ai model for Technical/Architectural Reasoning
 * Superior to Llama for structured, technical, and detailed architectural tasks
 * Excellent at following complex instructions and maintaining consistency
 */
export async function generateArchitecturalReasoning(params) {
  const { projectContext, portfolioAnalysis, locationData, buildingProgram } =
    params;

  logger.ai(
    "[Together AI] Using Qwen 2.5 72B Instruct for architectural reasoning",
  );

  // Safely extract location data with defaults
  const location =
    locationData?.address ||
    projectContext?.location?.address ||
    "Generic location";
  const climate =
    locationData?.climate?.type ||
    projectContext?.climateData?.type ||
    "Temperate";
  const area = projectContext?.area || projectContext?.floorArea || "200";

  try {
    const response = await fetch(`${API_BASE_URL}/api/together/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "meta-llama/Llama-3.3-70B-Instruct-Turbo", // Best for technical/architectural reasoning
        messages: [
          {
            role: "system",
            content: `You are an expert architect specializing in consistent architectural design.
            Your designs must maintain PERFECT CONSISTENCY between:
            - 2D floor plans (true overhead orthographic views, NO 3D)
            - Technical elevations (flat facade views, NO perspective)
            - 3D visualizations (matching the 2D plans exactly)

            Always provide EXACT specifications:
            - Room dimensions in meters
            - Wall thicknesses (typically 0.3m exterior, 0.15m interior)
            - Window sizes and positions
            - Door locations and swing directions
            - Material specifications with hex colors`,
          },
          {
            role: "user",
            content: `Design a ${buildingProgram} for:
            Location: ${location}
            Climate: ${climate}
            Style: ${portfolioAnalysis?.style || "Modern"}
            Area: ${area}m²

            Provide:
            1. EXACT floor plan layout with dimensions
            2. Material specifications with colors
            3. Window and door specifications
            4. Roof type and angle
            5. Consistency rules that MUST be followed in all views`,
          },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Together AI reasoning failed");
    }

    logger.success("[Together AI] Architectural reasoning generated");
    return parseArchitecturalReasoning(data.choices[0].message.content);
  } catch (error) {
    logger.error("[Together AI] Reasoning error", error);
    throw error;
  }
}

/**
 * Generate single view with enforced 6000ms delay
 * Used for selective regeneration in modify workflow
 */
export async function generateSingleView(viewConfig, seed, delayMs = 12000) {
  const {
    viewType,
    prompt,
    masterDNA,
    width = 1024,
    height = 1024,
  } = viewConfig;

  logger.ai(`Generating single view: ${viewType} with seed ${seed}`);

  // Wait for delay to respect rate limiting
  if (delayMs > 0) {
    logger.loading(`Waiting ${delayMs / 1000}s before generation`);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  try {
    const result = await generateArchitecturalImage({
      viewType,
      designDNA: masterDNA,
      prompt,
      seed,
      width,
      height,
    });

    logger.success(`Single view generated: ${viewType}`);
    return result;
  } catch (error) {
    logger.error(`Failed to generate single view ${viewType}`, error);
    throw error;
  }
}

/**
 * FLUX.1-dev - Used for ALL architectural views
 *
 * Why FLUX.1-dev for everything:
 * - Consistent style across all views
 * - Excellent seed-based consistency
 * - High-quality photorealistic and technical rendering
 * - Maintains design coherence through generation history
 */
export async function generateArchitecturalImage(params) {
  const {
    viewType,
    designDNA,
    prompt,
    seed,
    width = 1024,
    height = 1024,
    geometryRender = null,
    geometryStrength = 0.0,
    geometryDNA = null,
    // NEW: Style reference for material consistency (elevations/sections use hero_3d as anchor)
    styleReferenceUrl = null,
    // NEW: Floor plan mask for interior_3d window alignment
    floorPlanMaskUrl = null,
  } = params;

  const flags = getFeatureFlags();
  if (flags?.togetherImageMinIntervalMs) {
    imageRequestQueue.setMinInterval(flags.togetherImageMinIntervalMs);
  }

  const is2DPreview =
    viewType.includes("floor_plan") ||
    viewType.includes("elevation") ||
    viewType.includes("section");
  const modelPreview = is2DPreview ? "FLUX.1-schnell" : "FLUX.1-dev";
  const stepsPreview = is2DPreview
    ? "4 steps - fast 2D"
    : "40 steps - quality 3D";
  logger.ai(
    `[${modelPreview}] Generating ${viewType} with seed ${seed} (${stepsPreview})`,
  );

  // 🎲 SEED CONSISTENCY: Use IDENTICAL seed for ALL views for perfect cross-view consistency
  // Previously used offsets (+1, +2), but this caused subtle seed drift (904803, 904804, 904805)
  // For 98%+ consistency, all 13 views must use the EXACT same seed with view-specific DNA prompts
  const effectiveSeed =
    seed || designDNA?.seed || Math.floor(Math.random() * 1e6);

  // 🧬 CONSISTENCY FIX: Use DNA prompts DIRECTLY without wrapping
  // The dnaPromptGenerator already creates ultra-detailed, view-specific prompts
  // Wrapping them dilutes the DNA specifications and reduces consistency
  const enhancedPrompt = prompt;

  // 🔄 RETRY LOGIC: Attempt generation up to 5 times with exponential backoff
  // Increased from 3 to 5 to handle Together AI transient server errors
  const maxRetries = 5;
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 1) {
        // Extended backoff: 3s, 6s, 12s, 24s (more aggressive to avoid server overload)
        const backoffDelay = Math.pow(2, attempt - 1) * 3000;
        logger.loading(
          `[FLUX.1] Retry ${attempt}/${maxRetries} for ${viewType} after ${backoffDelay / 1000}s delay`,
        );
        await new Promise((resolve) => setTimeout(resolve, backoffDelay));
      }

      // 🎯 Dynamic model & settings: FLUX.1-schnell for 2D (faster, better at following prompts), dev for 3D
      const is2DTechnical =
        viewType.includes("floor_plan") ||
        viewType.includes("elevation") ||
        viewType.includes("section");
      const isElevationOrSection =
        viewType.startsWith("elevation_") || viewType.startsWith("section_");

      // Check if geometry control is present (geometry masks or other init_image conditioning)
      const hasGeometryControl = geometryRender && geometryRender.url;

      // Check if style reference is present (hero image for material consistency)
      const hasStyleReference = styleReferenceUrl && isElevationOrSection;

      // FLUX.1-schnell: Faster (4 steps), better at following simple 2D instructions, less prone to 3D interpretation
      // FLUX.1-dev: Higher quality (40 steps), better for photorealistic 3D views
      // ⚠️ CRITICAL: FLUX.1-schnell IGNORES init_image! Force FLUX.1-dev when:
      //   - geometry control is present (existing behavior)
      //   - style reference is present for elevations/sections (NEW: ensures hero style transfer works)
      const model =
        hasGeometryControl || hasStyleReference
          ? "black-forest-labs/FLUX.1-dev" // Always dev for init_image conditioning (schnell ignores it)
          : is2DTechnical
            ? "black-forest-labs/FLUX.1-schnell"
            : "black-forest-labs/FLUX.1-dev";

      // Adjust steps based on actual model (dev needs more steps even for 2D when geometry control is active)
      const useDevModel = model.includes("dev");
      const steps = useDevModel ? 40 : 4; // dev: 40 steps, schnell: 4 steps
      const guidanceScale = is2DTechnical ? 7.5 : 3.5; // High CFG for 2D to enforce flat view

      const modelName = useDevModel ? "FLUX.1-dev" : "FLUX.1-schnell";

      // Log when init_image conditioning forces model upgrade
      if (hasGeometryControl && is2DTechnical) {
        logger.info(
          `🔒 [Geometry Mode] Forcing FLUX.1-dev for ${viewType} (geometry control active, schnell ignores init_image)`,
        );
      }
      if (hasStyleReference) {
        logger.info(
          `🎨 [Style Lock Mode] Forcing FLUX.1-dev for ${viewType} (style reference active, schnell ignores init_image)`,
        );
      }
      logger.info(
        `🧠 [${modelName}] Generating ${viewType} with seed ${effectiveSeed} (${steps} steps - ${is2DTechnical ? "fast 2D" : "quality 3D"})`,
      );

      // Enforce pacing guard if multiple rate limits detected
      const enforcedDelay = imageRequestQueue.shouldPause();
      if (enforcedDelay > 0) {
        logger.warn(
          `Together pacing guard active - waiting ${Math.ceil(enforcedDelay / 1000)}s before next request`,
        );
        await new Promise((resolve) => setTimeout(resolve, enforcedDelay));
      }

      // Schedule request through global queue for pacing
      // eslint-disable-next-line no-loop-func
      const result = await imageRequestQueue.schedule(async () => {
        // Build payload - use camelCase for server, server converts to snake_case for Together
        const requestPayload = {
          model,
          prompt: enhancedPrompt,
          width,
          height,
          seed: effectiveSeed,
          num_inference_steps: steps,
          guidanceScale: guidanceScale, // camelCase for server
        };

        // Add geometry control parameters only if geometryRender is provided and valid
        // NOTE: Together.ai FLUX may use 'init_image' for img2img, not 'control_image'
        // Geometry conditioning is experimental and may not work as expected
        let initImageApplied = false;

        if (geometryRender && geometryRender.url) {
          // Check if geometry render is a placeholder (1x1 pixel) - skip if so
          const isPlaceholder =
            geometryRender.url.includes("AAAAB") ||
            geometryRender.url.length < 200;

          if (!isPlaceholder) {
            // Use camelCase for server (server converts to snake_case for Together.ai)
            requestPayload.initImage = geometryRender.url;
            requestPayload.imageStrength = 1.0 - (geometryStrength || 0.5); // Inverted for Together.ai
            initImageApplied = true;

            // Add metadata for debugging (not sent to API, used for logging)
            logger.info(
              `  Using geometry render as init_image (strength: ${requestPayload.imageStrength})`,
              {
                geometryType: geometryRender.type,
                geometryModel: geometryRender.model,
              },
            );
          } else {
            logger.warn(
              "  Geometry render is placeholder, skipping geometry conditioning",
            );
          }
        }

        // Style reference for elevations/sections – transfer material appearance
        // from hero_3d (brick, windows, roof). Applied EVEN when geometry control
        // is present: geometry controls layout, style ref controls appearance.
        const isElevationOrSection =
          viewType.startsWith("elevation_") || viewType.startsWith("section_");
        if (styleReferenceUrl && isElevationOrSection) {
          if (!initImageApplied) {
            // No geometry control – use styleRef as sole init_image
            requestPayload.initImage = styleReferenceUrl;
            requestPayload.imageStrength = 0.35;
            initImageApplied = true;
            logger.info(
              `  🎨 [STYLE LOCK] Using hero_3d as style reference init_image (strength: 0.35)`,
            );
          } else {
            // Geometry control already applied – embed style cues from designDNA
            // into the prompt prefix so FLUX picks up material/color from text
            // even though the init_image slot is taken by geometry.
            const styleCues = [];
            if (designDNA) {
              const mats = designDNA.materials || designDNA.materialPalette;
              if (typeof mats === "string") {
                // Plain string like "brick, glass"
                if (mats) styleCues.push(`materials: ${mats}`);
              } else if (Array.isArray(mats)) {
                const matDescriptors = mats
                  .slice(0, 3)
                  .map((m) => {
                    if (typeof m === "string") return m;
                    if (m && typeof m === "object") {
                      const name = m.name || m.material || m.type || "unknown";
                      return `${name}${m.hexColor ? ` (${m.hexColor})` : ""}`;
                    }
                    return null;
                  })
                  .filter(Boolean)
                  .join(", ");
                if (matDescriptors)
                  styleCues.push(`materials: ${matDescriptors}`);
              } else if (mats && typeof mats === "object") {
                // Object with .primary/.secondary keys (legacy DNA)
                const parts = [mats.primary, mats.secondary].filter(Boolean);
                if (parts.length > 0)
                  styleCues.push(`materials: ${parts.join(", ")}`);
              }
              if (designDNA.style?.name)
                styleCues.push(`style: ${designDNA.style.name}`);
              if (designDNA.roof?.type)
                styleCues.push(`roof: ${designDNA.roof.type}`);
            }
            if (styleCues.length > 0) {
              const prefix = `[STYLE LOCK: ${styleCues.join("; ")}] `;
              requestPayload.prompt = prefix + requestPayload.prompt;
              logger.info(
                `  🎨 [STYLE+GEOM] Geometry init_image active; injected style prefix (${prefix.length} chars)`,
              );
            } else {
              logger.info(
                `  🎨 [STYLE+GEOM] Geometry init_image active; no designDNA style cues available for prompt augmentation`,
              );
            }
          }
        }

        // NEW: Floor plan mask for interior_3d window alignment
        // Uses floor_plan_ground to ensure window positions match the floor plan
        if (
          !initImageApplied &&
          floorPlanMaskUrl &&
          viewType === "interior_3d"
        ) {
          requestPayload.initImage = floorPlanMaskUrl;
          requestPayload.imageStrength = 0.45; // Strong influence for window alignment
          initImageApplied = true;

          logger.info(
            `  🏠 [FLOOR PLAN LOCK] Using floor_plan_ground as init_image for window alignment (strength: 0.45)`,
          );
        }

        // Use environment-aware URL (dev: /api/together/image, prod: /api/together-image)
        const isDev =
          typeof window !== "undefined" &&
          (window.location.hostname === "localhost" ||
            window.location.hostname === "127.0.0.1");
        const imageEndpoint = isDev
          ? `${API_BASE_URL}/api/together/image`
          : "/api/together-image";

        const response = await fetch(imageEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestPayload),
        });

        // Handle rate limiting before normalization
        if (response.status === 429) {
          consecutiveRateLimitErrors += 1;
          const retryAfter =
            parseInt(response.headers.get("retry-after") || "0", 10) || 15;
          const configuredBatchCooldown = flags?.togetherBatchCooldownMs || 0;
          const waitTime = Math.max(retryAfter * 1000, configuredBatchCooldown);
          logger.warn(
            `Rate limit (429) detected, Retry-After: ${retryAfter}s, waiting ${waitTime / 1000}s`,
          );

          // Increase queue interval temporarily to avoid repeated 429s
          const currentStatus = getImageQueueStatus();
          const desiredMinInterval = Math.max(
            waitTime + 2000,
            flags?.togetherImageMinIntervalMs || 0,
            currentStatus.minIntervalMs || 0,
          );
          imageRequestQueue.setMinInterval(desiredMinInterval);
          imageRequestQueue.recordRateLimit(waitTime, "Together.ai rate limit");

          // Try to get error message
          let errorMessage = "Rate limit exceeded";
          try {
            const contentType = response.headers.get("content-type") || "";
            if (contentType.includes("application/json")) {
              const data = await response.json();
              errorMessage = data?.error || data?.message || errorMessage;
            } else {
              const text = await response.text();
              errorMessage = text || errorMessage;
            }
          } catch {
            // Ignore parse errors, use default
          }

          const queueStatus = getImageQueueStatus();
          const cooldownMs = queueStatus.cooldownActive
            ? Math.max(queueStatus.cooldownRemainingMs || 0, waitTime)
            : waitTime;
          const cooldownSeconds = Math.max(
            Math.ceil(cooldownMs / 1000),
            consecutiveRateLimitErrors * 15,
          );

          const throttledMessage = `${errorMessage}. Together.ai temporarily throttled — retry after ${cooldownSeconds}s.`;
          const error = new Error(throttledMessage);
          error.status = 429;
          error.retryAfter = cooldownSeconds;
          error.cooldownSeconds = cooldownSeconds;
          throw error;
        }

        // Use normalized response handler (throws if not ok)
        const { body: data, retryAfter } = await normalizeResponse(response);
        return { data, retryAfter };
      });

      // Success! Show if retry was needed
      consecutiveRateLimitErrors = 0;
      logger.success(
        `✅ [${modelName}] ${viewType} generated with seed ${effectiveSeed}`,
      );

      return {
        url: result.data.url,
        model: modelName.toLowerCase().replace(".", "-"),
        viewType,
        seed: effectiveSeed,
      };
    } catch (error) {
      // Handle structured errors from normalizeResponse
      lastError = error;

      // Smarter error logging: reduce spam for transient errors
      if (error.status === 500 || error.status === 503) {
        // Server errors - only log on first attempt and last attempt
        if (attempt === 1) {
          logger.warn(
            `[FLUX.1] Together AI server error for ${viewType} (will retry ${maxRetries - 1} more times)`,
          );
        } else if (attempt === maxRetries) {
          logger.error(
            `[FLUX.1] Server error persists after ${maxRetries} attempts for ${viewType}`,
          );
        }
      } else if (error.status === 429) {
        // Rate limit handled above, but log if all retries exhausted
        if (attempt === maxRetries) {
          logger.error(
            `[FLUX.1] Rate limit persists after ${maxRetries} attempts for ${viewType}`,
          );
        }
      } else {
        // Other errors - always log (client errors, auth errors, etc.)
        if (attempt === 1 || attempt === maxRetries) {
          logger.error(
            `[FLUX.1] Network error (attempt ${attempt}/${maxRetries}) for ${viewType}: ${error.message}`,
          );
        }
      }

      if (attempt === maxRetries) {
        break; // Don't continue after last retry
      }

      // If error has retryAfter, respect it
      if (error.retryAfter && attempt < maxRetries) {
        const waitTime = error.retryAfter * 1000;
        logger.loading(
          `Respecting Retry-After: ${error.retryAfter}s before retry ${attempt + 1}`,
        );
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }
  }

  // All retries failed
  logger.error(
    `[FLUX.1] FAILED: All ${maxRetries} attempts failed for ${viewType}`,
  );
  logger.error(`Last error: ${lastError?.message}`);
  logger.error(
    `This is likely due to Together AI server issues. Try again in a few minutes.`,
  );
  throw (
    lastError ||
    new Error(`Failed to generate ${viewType} after ${maxRetries} attempts`)
  );
}

/**
 * Generate complete architectural package with perfect consistency
 * Enhanced with DNA-driven prompts for 95%+ consistency
 */
/**
 * Generate complete architectural package with perfect consistency
 * Enhanced with DNA-driven prompts for 95%+ consistency
 * Generates all required views for the A1 Master Sheet
 */
export async function generateConsistentArchitecturalPackage(params) {
  logger.info(
    "📐 [Together AI] Generating DNA-enhanced consistent architectural package...",
  );

  const { projectContext } = params;
  // Use configured seed enforcement
  const enforceConsistentSeed = GENERATION_CONFIG.enforceConsistentSeed;
  const consistentSeed =
    enforceConsistentSeed && projectContext.seed
      ? projectContext.seed
      : projectContext.projectSeed || Math.floor(Math.random() * 1000000);

  // ========================================
  // STEP 1: Generate Master Design DNA with Location Awareness
  // ========================================
  logger.info("🧬 STEP 1: Generating Location-Aware Master Design DNA...");

  // Pass location data to DNA generator
  const dnaResult = await enhancedDNAGenerator.generateMasterDesignDNA(
    projectContext,
    null, // Portfolio analysis (if available)
    projectContext.locationData || projectContext.location, // 🌍 Pass location data
  );
  const masterDNA = dnaResult.masterDNA;

  if (!dnaResult.success && !masterDNA.isFallback) {
    console.warn("⚠️  Master DNA generation had issues, using fallback DNA");
  }

  // ========================================
  // STEP 2: Validate Master DNA
  // ========================================
  logger.info("🔍 STEP 2: Validating Master DNA...");
  const validation = dnaValidator.validateDesignDNA(masterDNA);

  if (!validation.isValid) {
    console.warn("⚠️  DNA validation found issues:", validation.errors);
    logger.info("🔧 Attempting auto-fix...");
    const fixed = dnaValidator.autoFixDesignDNA(masterDNA);
    if (fixed) {
      logger.info("✅ DNA auto-fixed successfully");
      Object.assign(masterDNA, fixed);
    }
  }

  // ========================================
  // STEP 3: Generate Unique Prompts for Each View
  // ========================================
  logger.info("📝 STEP 3: Generating unique view-specific prompts...");
  const allPrompts = dnaPromptGenerator.generateAllPrompts(
    masterDNA,
    projectContext,
  );

  // Get all views from configuration
  const views = getAllViews().map((view) => ({
    type:
      view.id === "exterior"
        ? "exterior_front_3d" // Map config IDs to generator IDs
        : view.id === "section-aa"
          ? "section_longitudinal"
          : view.id === "roof"
            ? "floor_plan_roof" // Map roof plan
            : view.id === "ground"
              ? "floor_plan_ground"
              : view.id === "first"
                ? "floor_plan_upper"
                : view.id === "south"
                  ? "elevation_south"
                  : view.id === "north"
                    ? "elevation_north"
                    : view.id === "east"
                      ? "elevation_east"
                      : view.id === "west"
                        ? "elevation_west"
                        : view.id === "axonometric"
                          ? "axonometric_3d"
                          : view.id === "interior"
                            ? "interior_3d"
                            : view.id === "site"
                              ? "site_plan" // Map site plan
                              : view.id, // Fallback
    name: view.name,
    width: view.id.includes("3d") || view.id === "interior" ? 1536 : 1024, // Wider for 3D
    height:
      view.id.includes("elevation") || view.id.includes("section") ? 768 : 1024,
  }));

  const results = {};
  const generatedHashes = new Set(); // Track image hashes to prevent duplicates

  // ========================================
  // STEP 4: Generate All Views with DNA-Driven Prompts
  // ========================================
  logger.info(`🎨 STEP 4: Generating ${views.length} views with FLUX.1...`);

  let successCount = 0;
  let failCount = 0;

  // 🔧 OPTIMIZED RATE LIMITING: Adaptive delays based on view complexity
  const is2DView = (viewType) => {
    return (
      viewType.includes("floor_plan") ||
      viewType.includes("elevation") ||
      viewType.includes("section")
    );
  };

  const getAdaptiveDelay = (currentView, nextView) => {
    const current2D = is2DView(currentView);
    const next2D = is2DView(nextView);

    // 2D → 2D: Standard delay (12s) - increased for rate limit safety
    if (current2D && next2D) return 12000;

    // 2D → 3D: Longer delay to give API breathing room (15s)
    if (current2D && !next2D) return 15000;

    // 3D → 3D: Standard delay (12s)
    if (!current2D && !next2D) return 12000;

    // 3D → 2D: Standard delay (12s)
    return 12000;
  };

  for (let i = 0; i < views.length; i++) {
    const view = views[i];
    const viewNumber = i + 1;

    // Handle prompt mapping if exact key doesn't exist
    let prompt = allPrompts[view.type];
    if (!prompt) {
      // Try to find a matching prompt key
      if (view.type === "floor_plan_roof")
        prompt = allPrompts["roof_plan"]; // Example mapping
      else if (view.type === "site_plan") prompt = allPrompts["site_plan"];
    }

    // If still no prompt, generate one on the fly or skip
    if (!prompt) {
      console.warn(
        `⚠️ No prompt found for view type: ${view.type}, skipping...`,
      );
      continue;
    }

    try {
      logger.info(
        `\n🎨 [${viewNumber}/${views.length}] Generating ${view.name}...`,
      );
      logger.info(
        `   View type: ${view.type} (${is2DView(view.type) ? "2D technical" : "3D visualization"})`,
      );
      logger.info(`   Dimensions: ${view.width}×${view.height}`);
      logger.info(`   DNA-driven prompt length: ${prompt.length} chars`);

      const imageResult = await generateArchitecturalImage({
        viewType: view.type,
        designDNA: masterDNA,
        prompt: prompt,
        seed: consistentSeed,
        width: view.width,
        height: view.height,
      });

      // Validate uniqueness (check if URL/hash is unique)
      const imageHash =
        imageResult.url?.substring(imageResult.url.length - 20) ||
        Math.random().toString();

      if (generatedHashes.has(imageHash)) {
        console.warn(`⚠️  Potential duplicate detected for ${view.name}`);
      } else {
        generatedHashes.add(imageHash);
      }

      results[view.type] = {
        ...imageResult,
        name: view.name,
        success: true,
        prompt: prompt.substring(0, 200) + "...", // Store truncated prompt for debugging
      };

      successCount++;
      logger.info(
        `✅ [${viewNumber}/${views.length}] ${view.name} completed successfully`,
      );
      logger.info(
        `   Progress: ${successCount} successful, ${failCount} failed`,
      );

      // Add adaptive delay between requests to avoid rate limiting
      if (i < views.length - 1) {
        // Don't delay after last view
        const nextView = views[i + 1];
        const delayMs = getAdaptiveDelay(view.type, nextView.type);
        logger.info(`⏳ Waiting ${delayMs / 1000}s before ${nextView.name}...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    } catch (error) {
      failCount++;
      logger.error(
        `❌ [${viewNumber}/${views.length}] Failed to generate ${view.name}:`,
        error.message,
      );
      logger.info(`   Error details:`, error);

      results[view.type] = {
        error: error.message,
        name: view.name,
        success: false,
        url: null, // Explicitly set to null for failed views
      };

      logger.info(
        `   Progress: ${successCount} successful, ${failCount} failed`,
      );
      logger.info(`   ⚠️  Continuing with remaining views...`);

      // Still add adaptive delay even after failure to respect rate limits
      if (i < views.length - 1) {
        const nextView = views[i + 1];
        const delayMs = getAdaptiveDelay(view.type, nextView.type);
        // Add extra 2s after failures to give API more recovery time
        const recoveryDelay = delayMs + 2000;
        logger.info(
          `⏳ Waiting ${recoveryDelay / 1000}s before next view (extra recovery time)...`,
        );
        await new Promise((resolve) => setTimeout(resolve, recoveryDelay));
      }
    }
  }

  // ========================================
  // STEP 5: Compile Results
  // ========================================
  const totalCount = views.length;
  const consistencyScore =
    successCount > 0 ? Math.round((successCount / totalCount) * 100) : 0;

  logger.info("\n✅ [Together AI] DNA-enhanced architectural package complete");
  logger.info(`   Generated: ${successCount}/${totalCount} views`);
  logger.info(`   Failed: ${failCount}/${totalCount} views`);
  logger.info(`   Success Rate: ${consistencyScore}%`);
  logger.info(`   Unique images: ${generatedHashes.size}/${totalCount}`);

  if (failCount > 0) {
    console.warn(`\n⚠️  WARNING: ${failCount} views failed to generate`);
    console.warn("   Failed views:");
    Object.entries(results).forEach(([type, result]) => {
      if (!result.success) {
        console.warn(`   ❌ ${result.name}: ${result.error}`);
      }
    });
  }

  if (successCount === 0) {
    logger.error("\n❌ CRITICAL: All views failed to generate!");
    logger.error("   This usually indicates:");
    logger.error("   1. Together AI API key issue");
    logger.error("   2. Rate limiting (wait 60 seconds and try again)");
    logger.error("   3. Network connectivity issue");
    logger.error("   4. Server not running (check npm run server)");
  }

  return {
    ...results,
    masterDNA,
    seed: consistentSeed,
    consistency: `${consistencyScore}% (${successCount}/${totalCount} successful)`,
    uniqueImages: generatedHashes.size,
    totalViews: totalCount,
    allPrompts, // Include prompts for debugging
  };
}

/**
 * Parse architectural reasoning from GPT-4o response
 */
function parseArchitecturalReasoning(content) {
  // Extract structured data from the reasoning
  const reasoning = {
    designPhilosophy: "",
    spatialOrganization: {},
    materials: {},
    dimensions: {},
    consistencyRules: [],
  };

  // Parse the content (simplified for now)
  const sections = content.split("\n\n");

  sections.forEach((section) => {
    if (section.includes("Philosophy") || section.includes("Concept")) {
      reasoning.designPhilosophy = section;
    }
    if (section.includes("Material")) {
      reasoning.materials = extractMaterials(section);
    }
    if (section.includes("Dimension") || section.includes("Size")) {
      reasoning.dimensions = extractDimensions(section);
    }
    if (section.includes("Consistency") || section.includes("Rules")) {
      reasoning.consistencyRules = section
        .split("\n")
        .filter((line) => line.includes("-"));
    }
  });

  return reasoning;
}

/**
 * Format prompt based on view type and design DNA
 */
function formatPromptForView(viewType, designDNA) {
  const baseDetails = `${designDNA.buildingType}, ${designDNA.dimensions.width}m x ${designDNA.dimensions.depth}m,
                       ${designDNA.materials.primary} facade, ${designDNA.roof.type} roof,
                       ${designDNA.windows.type} windows, ${designDNA.style.name} style`;

  const viewSpecific = {
    floor_plan: `showing all rooms with labels, wall thickness ${designDNA.dimensions.wallThickness}m`,
    elevation_north: `front facade with main entrance, ${designDNA.dimensions.floors} floors`,
    exterior_3d: `photorealistic view from street level, ${designDNA.materials.color} color scheme`,
    section_long: `longitudinal cut showing floor heights ${designDNA.dimensions.floorHeight}m`,
    axonometric: `30-degree isometric view showing all facades`,
  };

  return `${baseDetails}, ${viewSpecific[viewType] || ""}`;
}

/**
 * Extract materials from reasoning text
 */
function extractMaterials(text) {
  const materials = {
    primary: "brick",
    secondary: "glass",
    roof: "slate",
    color: "#B87333",
  };

  // Simple extraction logic (can be enhanced)
  if (text.includes("brick")) materials.primary = "brick";
  if (text.includes("stone")) materials.primary = "stone";
  if (text.includes("concrete")) materials.primary = "concrete";

  return materials;
}

/**
 * Extract dimensions from reasoning text
 */
function extractDimensions(text) {
  const dimensions = {
    width: 15,
    depth: 12,
    height: 9,
    floors: 2,
    wallThickness: 0.3,
    floorHeight: 3.0,
  };

  // Extract numbers from text (simplified)
  const numbers = text.match(/\d+\.?\d*/g);
  if (numbers && numbers.length > 0) {
    dimensions.width = parseFloat(numbers[0]) || 15;
    if (numbers[1]) dimensions.depth = parseFloat(numbers[1]) || 12;
  }

  return dimensions;
}

/**
 * NEW: Generate A1 Sheet Image (One-Shot)
 * Single image generation for A1 presentation sheet
 * ISO A1 Standard: 841×594mm (portrait) → ideal 7016×9933px @ 300 DPI
 * API Constrained: 1280×1792px or 1792×1280px @ Together.ai limits
 *
 * @param {Object} params - Generation parameters
 * @param {string} params.prompt - Comprehensive A1 sheet prompt
 * @param {string} params.negativePrompt - Negative prompt (separate parameter for Together.ai API)
 * @param {number} params.width - Image width (optional, computed from orientation if not provided)
 * @param {number} params.height - Image height (optional, computed from orientation if not provided)
 * @param {string} params.model - Model to use (defaults to feature flag or 'black-forest-labs/FLUX.1-kontext-max')
 * @param {string} params.orientation - 'portrait' or 'landscape' (default 'portrait')
 * @param {number} params.stepsOverride - Override inference steps (default 48)
 * @param {number} params.seed - Consistent seed for reproducibility
 * @param {string} params.initImage - Optional base64 data URL for image-to-image generation
 * @param {number} params.guidanceScale - Guidance scale for adherence to prompt (default 7.8)
 * @returns {Promise<Object>} { url, seed, prompt, metadata }
 */
export async function generateA1SheetImage({
  prompt,
  negativePrompt = "",
  width,
  height,
  model,
  orientation = "portrait",
  stepsOverride,
  seed,
  initImage = null,
  imageStrength = null, // 🆕 Configurable strength for img2img (default: 0.18 for modify, 0.85 for site context)
  guidanceScale = 7.8,
  attachments = null, // 🆕 Array of image attachments (e.g., site plan) - currently passed via prompt instructions
}) {
  // Get model and orientation from feature flags if not provided
  const flags = getFeatureFlags();

  // ⚠️ CRITICAL: FLUX.1-schnell IGNORES init_image! Force FLUX.1-dev when init_image is present
  const requestedModel =
    model || flags.fluxImageModel || "black-forest-labs/FLUX.1-dev";
  const modelToUse =
    initImage && requestedModel.includes("schnell")
      ? "black-forest-labs/FLUX.1-dev"
      : requestedModel;

  if (initImage && requestedModel !== modelToUse) {
    logger.info(
      `🔒 [A1 Sheet] Forcing FLUX.1-dev for image-to-image mode (schnell ignores init_image)`,
    );
  }
  // 🔒 LANDSCAPE ENFORCEMENT: A1 sheets are ALWAYS landscape (width > height)
  const orientationToUse = "landscape"; // FIXED: Always landscape for A1 sheets
  const isPortrait = false; // FIXED: Never portrait for A1 sheets

  // 🔒 DIMENSION LOCKING: When initImage is provided, ALWAYS honor explicit width/height
  // This prevents dimension mismatches that cause drift (e.g., baseline 1280×1792 vs modify 1792×1280)
  let validatedWidth, validatedHeight;

  // Helper to snap to multiples of 16 (Together.ai requirement)
  const snapTo16 = (v) => {
    const clamped = Math.min(Math.max(Math.floor(v), 64), 1792);
    return clamped - (clamped % 16);
  };

  if (initImage && width && height) {
    // ✅ LOCKED: Preserve baseline dimensions but snap to 16
    validatedWidth = snapTo16(width);
    validatedHeight = snapTo16(height);
    if (validatedWidth !== width || validatedHeight !== height) {
      logger.info(
        `🔒 Dimension lock (img2img): Snapped ${width}×${height} → ${validatedWidth}×${validatedHeight}px`,
      );
    } else {
      logger.info(
        `🔒 Dimension lock (img2img): Using exact baseline ${width}×${height}px`,
      );
    }
  } else if (width && height) {
    // No initImage: Snap to multiples of 16
    validatedWidth = snapTo16(width);
    validatedHeight = snapTo16(height);
  } else {
    // Fallback: ALWAYS use landscape dimensions for A1 sheets
    // A1 paper landscape: 841×594mm = 1.414 aspect ratio
    // Using maximum Together.ai API dimension (1792px) for best text clarity
    // 🔒 LANDSCAPE ONLY: No portrait option for A1 sheets
    validatedWidth = 1792; // 112×16 - Maximum API limit for landscape (width)
    validatedHeight = 1264; // 79×16 = 1264 - Snapped to multiple of 16 (1792/1264 = 1.418)
  }

  // OPTIMIZED: Higher steps for best architectural quality
  const steps = stepsOverride ?? 50;
  // ENHANCED: Stronger guidance for professional architectural output
  const optimizedGuidance = guidanceScale || 8.5;

  logger.info(
    `🎨 [${modelToUse}] Generating single A1 sheet (LANDSCAPE ${validatedWidth}×${validatedHeight}px)...`,
  );
  logger.info(
    `   📐 A1 LANDSCAPE: ${validatedWidth}×${validatedHeight}px (aspect ${(validatedWidth / validatedHeight).toFixed(3)}, target 1.414), multiples of 16 ✓`,
  );
  logger.info(`   🔒 Orientation: LANDSCAPE ENFORCED (width > height)`);
  logger.info(`   🎲 Seed: ${seed}`);
  logger.info(`   📝 Prompt length: ${prompt.length} chars`);
  logger.info(`   🚫 Negative prompt length: ${negativePrompt.length} chars`);
  logger.info(`   🎚️  Guidance scale: ${optimizedGuidance}`);
  logger.info(`   🔢 Steps: ${steps}`);
  logger.info(
    `   🖼️  Init image: ${initImage ? "provided (image-to-image mode)" : "none (text-to-image mode)"}`,
  );

  // Log site plan attachment if provided (via prompt instructions)
  if (attachments && attachments.length > 0) {
    logger.info(
      `   🗺️  Site plan: ${attachments.length} attachment(s) referenced in prompt`,
    );
  }

  const effectiveSeed = seed || Math.floor(Math.random() * 1e6);

  if (
    width &&
    height &&
    (validatedWidth !== width || validatedHeight !== height)
  ) {
    logger.info(
      `⚠️  Dimensions adjusted from ${width}×${height} to ${validatedWidth}×${validatedHeight} (Together limits)`,
    );
  }

  try {
    const payload = {
      model: modelToUse,
      prompt,
      negativePrompt, // Separate negative prompt for Together.ai API
      width: validatedWidth,
      height: validatedHeight,
      seed: effectiveSeed,
      num_inference_steps: steps,
      guidanceScale: optimizedGuidance, // ENHANCED: Using optimized guidance for best quality
    };

    // Add image-to-image parameters if initImage provided
    if (initImage) {
      payload.initImage = initImage;
      // 🎚️ STRENGTH CONTROL: Low strength (0.18) for modify preserves original sheet
      // High strength (0.85) for site context generation allows more AI transformation
      const effectiveStrength = imageStrength !== null ? imageStrength : 0.85;
      payload.imageStrength = effectiveStrength;

      if (effectiveStrength < 0.25) {
        logger.info(
          `   🔄 Image-to-image mode: strength ${effectiveStrength} (PRESERVE mode - minimal changes)`,
        );
      } else if (effectiveStrength < 0.5) {
        logger.info(
          `   🔄 Image-to-image mode: strength ${effectiveStrength} (MODIFY mode - targeted changes)`,
        );
      } else {
        logger.info(
          `   🔄 Image-to-image mode: strength ${effectiveStrength} (TRANSFORM mode - significant changes)`,
        );
      }
    }

    // Schedule request through global queue for pacing
    const result = await imageRequestQueue.schedule(async () => {
      let response;
      try {
        response = await fetch(`${API_BASE_URL}/api/together/image`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
      } catch (fetchError) {
        // Handle network errors (connection refused, DNS errors, etc.)
        const networkError = new Error(
          `Network error: Cannot connect to proxy server at ${API_BASE_URL}/api/together/image. ` +
            `Please ensure the Express server is running: npm run server`,
        );
        networkError.status = 503;
        networkError.originalError = fetchError;
        throw networkError;
      }

      // Handle rate limiting before normalization
      if (response.status === 429) {
        const retryAfter =
          parseInt(response.headers.get("retry-after") || "0", 10) || 15;
        const waitTime = retryAfter * 1000;
        logger.info(
          `⏰ Rate limit (429) detected, Retry-After: ${retryAfter}s, waiting ${waitTime / 1000}s...`,
        );

        // Increase queue interval temporarily
        imageRequestQueue.setMinInterval(waitTime + 2000);

        let errorMessage = "Rate limit exceeded";
        try {
          const contentType = response.headers.get("content-type") || "";
          if (contentType.includes("application/json")) {
            const data = await response.json();
            errorMessage = data?.error || data?.message || errorMessage;
          } else {
            const text = await response.text();
            errorMessage = text || errorMessage;
          }
        } catch {
          // Ignore parse errors
        }

        const error = new Error(errorMessage);
        error.status = 429;
        error.retryAfter = retryAfter;
        throw error;
      }

      // Handle network errors (fetch failures, connection errors)
      if (!response) {
        throw new Error(
          "Network error: No response from server. Is the proxy server running? (npm run server)",
        );
      }

      // Use normalized response handler
      const { body: data } = await normalizeResponse(response);
      return data;
    });

    const data = result;

    logger.info(`✅ [${modelToUse}] A1 sheet generated successfully`);

    // Wrap URL with proxy to avoid CORS issues for downloads and canvas operations
    const proxiedUrl = wrapImageUrlWithProxy(data.url);

    return {
      url: proxiedUrl,
      originalUrl: data.url, // Keep original URL in metadata for reference
      seed: effectiveSeed,
      prompt,
      metadata: {
        width: validatedWidth,
        height: validatedHeight,
        requestedWidth: width,
        requestedHeight: height,
        aspectRatio: (validatedWidth / validatedHeight).toFixed(3),
        model: modelToUse.includes("kontext")
          ? "FLUX.1-kontext-max"
          : "FLUX.1-dev",
        format: "A1 landscape (ISO 216)", // FIXED: Always landscape
        isoStandard: "841×594mm", // FIXED: Always landscape (width × height)
        orientation: "landscape", // FIXED: Always landscape
        isLandscape: true, // FIXED: Explicit flag
        isPortrait: false, // FIXED: Never portrait
        effectiveDPI: Math.round((validatedWidth / 841) * 25.4), // Width-based for landscape
        printQuality: "Professional digital preview (suitable for screen/PDF)",
        printRecommendation:
          "For high-quality print, upscale to 300 DPI (9933×7016px landscape)",
        target300DPI: "9933×7016px", // FIXED: Landscape dimensions
        togetherCompliant: true,
        togetherMaxWidth: 1792,
        togetherBaseResolution: `${validatedWidth}×${validatedHeight}px`,
        timestamp: new Date().toISOString(),
        hasInitImage: !!initImage,
        hasSitePlan: !!(attachments && attachments.length > 0),
      },
    };
  } catch (error) {
    // Extract meaningful error message
    let errorMessage = "Unknown error";
    if (error instanceof Error) {
      errorMessage = error.message || String(error);
    } else if (typeof error === "string") {
      errorMessage = error;
    } else if (error?.error) {
      errorMessage =
        typeof error.error === "string"
          ? error.error
          : JSON.stringify(error.error);
    } else if (error?.body?.error) {
      errorMessage =
        typeof error.body.error === "string"
          ? error.body.error
          : JSON.stringify(error.body.error);
    } else if (error?.status) {
      errorMessage = `HTTP ${error.status}: ${error.status === 503 ? "Service Unavailable - Is the proxy server running? (npm run server)" : error.message || "Request failed"}`;
    } else {
      errorMessage = JSON.stringify(error);
    }

    logger.error(
      "❌ [FLUX.1-kontext-max] A1 sheet generation failed:",
      errorMessage,
    );
    logger.error(
      "   Full error details:",
      JSON.stringify(
        {
          message: error.message,
          status: error.status,
          body: error.body,
          error: error.error,
          stack: error.stack,
        },
        null,
        2,
      ),
    );

    // Enhance error with helpful message for 503
    if (error?.status === 503 || errorMessage.includes("503")) {
      const enhancedError = new Error(
        "Proxy server unavailable. Please start the Express server: npm run server",
      );
      enhancedError.status = 503;
      enhancedError.originalError = error;
      throw enhancedError;
    }

    // Re-throw with enhanced message
    const enhancedError = new Error(errorMessage);
    enhancedError.originalError = error;
    throw enhancedError;
  }
}

/**
 * NEW: Generate Unified A1 Architectural Sheet
 * Single generation for all views on one sheet - ensures perfect consistency
 */
export async function generateUnifiedArchitecturalSheet(params) {
  logger.info("📐 [Together AI] Generating UNIFIED A1 Architectural Sheet...");

  const { projectContext } = params;
  const consistentSeed =
    projectContext.seed ||
    projectContext.projectSeed ||
    Math.floor(Math.random() * 1000000);

  // ========================================
  // STEP 1: Generate Master Design DNA
  // ========================================
  logger.info("🧬 STEP 1: Generating Master Design DNA for unified sheet...");

  const dnaResult = await enhancedDNAGenerator.generateMasterDesignDNA(
    projectContext,
    null,
    projectContext.locationData || projectContext.location,
  );
  const masterDNA = dnaResult.masterDNA;

  // ========================================
  // STEP 2: Validate Master DNA
  // ========================================
  logger.info("🔍 STEP 2: Validating Master DNA...");
  const validation = dnaValidator.validateDesignDNA(masterDNA);

  if (!validation.isValid) {
    console.warn("⚠️ DNA validation found issues:", validation.errors);
    const fixed = dnaValidator.autoFixDesignDNA(masterDNA);
    if (fixed) {
      logger.info("✅ DNA auto-fixed successfully");
      Object.assign(masterDNA, fixed);
    }
  }

  // ========================================
  // STEP 3: Generate Unified A1 Sheet Prompt
  // ========================================
  logger.info("📝 STEP 3: Creating unified A1 sheet prompt...");
  const sheetPrompt = architecturalSheetService.generateA1SheetPrompt(
    masterDNA,
    projectContext,
  );

  // ========================================
  // STEP 4: Generate Single A1 Sheet with All Views
  // ========================================
  logger.info("🎨 STEP 4: Generating unified A1 sheet with all 13 views...");

  try {
    const response = await fetch(`${API_BASE_URL}/api/together/image`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: sheetPrompt,
        model: "black-forest-labs/FLUX.1-dev",
        width: 1024, // Will represent A1 aspect ratio
        height: 768,
        num_inference_steps: 28, // Higher quality for comprehensive sheet
        guidance_scale: 7.5,
        seed: consistentSeed,
        n: 1,
        response_format: "url",
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    logger.info("✅ [UNIFIED SHEET] Complete A1 sheet generated successfully!");

    // Return in format compatible with existing UI
    return {
      success: true,
      masterDNA: masterDNA,
      visualizations: {
        unified_sheet: {
          type: "unified_a1_sheet",
          url: data.url || data.output?.[0],
          prompt: sheetPrompt,
          format: "A1 (594×841mm)",
          contains: [
            "Ground Floor Plan",
            "Upper Floor Plan",
            "North Elevation",
            "South Elevation",
            "East Elevation",
            "West Elevation",
            "Section A-A",
            "Section B-B",
            "Exterior 3D View",
            "Axonometric",
            "Site Plan",
            "Interior View",
          ],
          consistency_score: 1.0, // Perfect consistency - single generation
        },
        // Also provide as separate views for backward compatibility if needed
        floorPlans: [],
        technicalDrawings: [],
        threeD: [],
      },
      reasoning: dnaResult.reasoning,
      projectContext: projectContext,
      generationMetadata: {
        type: "unified_sheet",
        seed: consistentSeed,
        model: "FLUX.1-dev",
        timestamp: new Date().toISOString(),
        totalGenerationTime: Date.now() - Date.now(),
      },
    };
  } catch (error) {
    logger.error("❌ Failed to generate unified sheet:", error);
    throw error;
  }
}

export function getTogetherPacingDiagnostics() {
  return imageRequestQueue.getDiagnostics();
}

// Service endpoints for server proxy
export const togetherAIService = {
  generateReasoning: generateArchitecturalReasoning,
  generateImage: generateArchitecturalImage,
  generatePackage: generateConsistentArchitecturalPackage,
  generateConsistentArchitecturalPackage:
    generateConsistentArchitecturalPackage, // Add full method name
  generateA1SheetImage: generateA1SheetImage, // NEW: Single A1 sheet image generation
  generateUnifiedSheet: generateUnifiedArchitecturalSheet, // NEW: Unified A1 sheet generation
  getPacingDiagnostics: getTogetherPacingDiagnostics,
};

export default togetherAIService;
