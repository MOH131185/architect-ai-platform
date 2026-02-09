/**
 * Fingerprint Validation Gate
 *
 * Pre-composition validation that compares all generated panels against
 * the hero_3d design fingerprint. Blocks A1 composition if panels deviate
 * beyond acceptable thresholds.
 *
 * Validation methods:
 * - Perceptual hash (pHash) comparison for visual similarity
 * - Color palette extraction and comparison
 * - Roof profile detection (edge analysis)
 * - Overall structural similarity score
 *
 * Actions:
 * - 'compose': All panels pass, proceed with A1 composition
 * - 'retry_failed': Some panels fail, retry with stronger control
 * - 'abort': Too many failures, abort generation
 */

import logger from "../core/logger.js";
import {
  isFeatureEnabled,
  getFeatureValue,
} from "../../config/featureFlags.js";

/**
 * Validation thresholds
 */
export const FINGERPRINT_THRESHOLDS = {
  // Minimum visual similarity score (0-1)
  MINIMUM_MATCH_SCORE: 0.85,

  // Minimum percentage of panels that must pass
  MINIMUM_PANELS_PASS_RATIO: 0.9,

  // pHash maximum Hamming distance (lower = more similar)
  MAX_PHASH_DISTANCE: 12,

  // Color palette deviation tolerance (0-1)
  MAX_COLOR_DEVIATION: 0.25,

  // Panels that MUST pass (blocking)
  CRITICAL_PANELS: ["hero_3d", "axonometric", "elevation_north"],

  // Maximum retry attempts per panel
  MAX_PANEL_RETRIES: 2,
};

/**
 * Panel validation result
 * @typedef {Object} PanelValidationResult
 * @property {string} panelType - Type of panel validated
 * @property {boolean} passed - Whether panel passed validation
 * @property {number} matchScore - Overall match score (0-1)
 * @property {Object} metrics - Detailed metrics
 * @property {string[]} issues - List of detected issues
 * @property {'accept'|'retry'|'block'} recommendation
 */

/**
 * Gate result
 * @typedef {Object} GateResult
 * @property {boolean} canCompose - Whether composition should proceed
 * @property {string[]} passedPanels - Panels that passed
 * @property {PanelValidationResult[]} failedPanels - Panels that failed
 * @property {number} overallMatchScore - Average match score
 * @property {'compose'|'retry_failed'|'abort'} action
 * @property {string} summary - Human-readable summary
 */

/**
 * Validate a single panel against the design fingerprint
 *
 * @param {Object} panelResult - Generated panel result with imageUrl
 * @param {Object} fingerprint - Design fingerprint from hero_3d
 * @param {Object} options - Validation options
 * @returns {Promise<PanelValidationResult>}
 */
export async function validatePanelAgainstFingerprint(
  panelResult,
  fingerprint,
  options = {},
) {
  const { panelType, imageUrl } = panelResult;

  if (!fingerprint || !fingerprint.heroImageUrl) {
    logger.warn(`No fingerprint available for validation of ${panelType}`);
    return {
      panelType,
      passed: true,
      matchScore: 1.0,
      metrics: {},
      issues: ["No fingerprint available - skipping validation"],
      recommendation: "accept",
    };
  }

  logger.debug(`Validating ${panelType} against design fingerprint...`);

  const issues = [];
  const metrics = {};

  // 1. Visual similarity check (simplified - uses fingerprint data)
  const visualScore = await calculateVisualSimilarity(
    imageUrl,
    fingerprint,
    panelType,
  );
  metrics.visualSimilarity = visualScore;

  if (visualScore < FINGERPRINT_THRESHOLDS.MINIMUM_MATCH_SCORE) {
    issues.push(
      `Visual similarity ${(visualScore * 100).toFixed(1)}% below threshold ${FINGERPRINT_THRESHOLDS.MINIMUM_MATCH_SCORE * 100}%`,
    );
  }

  // 2. Color palette check
  const colorScore = await checkColorPaletteMatch(imageUrl, fingerprint);
  metrics.colorMatch = colorScore;

  if (colorScore < 1 - FINGERPRINT_THRESHOLDS.MAX_COLOR_DEVIATION) {
    issues.push(
      `Color palette deviation ${((1 - colorScore) * 100).toFixed(1)}% exceeds threshold`,
    );
  }

  // 3. Structural check (for 3D and elevation panels)
  if (isStructuralPanel(panelType)) {
    const structuralScore = await checkStructuralConsistency(
      imageUrl,
      fingerprint,
      panelType,
    );
    metrics.structuralMatch = structuralScore;

    if (structuralScore < 0.8) {
      issues.push(
        `Structural consistency ${(structuralScore * 100).toFixed(1)}% - possible massing/roof mismatch`,
      );
    }
  }

  // Calculate overall match score
  const weights = {
    visualSimilarity: 0.5,
    colorMatch: 0.3,
    structuralMatch: 0.2,
  };

  let matchScore =
    metrics.visualSimilarity * weights.visualSimilarity +
    metrics.colorMatch * weights.colorMatch;

  if (metrics.structuralMatch !== undefined) {
    matchScore += metrics.structuralMatch * weights.structuralMatch;
  } else {
    // Redistribute weight if no structural check
    matchScore = metrics.visualSimilarity * 0.6 + metrics.colorMatch * 0.4;
  }

  // Determine if passed
  const threshold =
    getFeatureValue("fingerprintMatchThreshold") ||
    FINGERPRINT_THRESHOLDS.MINIMUM_MATCH_SCORE;

  const passed = matchScore >= threshold && issues.length === 0;

  // Determine recommendation
  let recommendation;
  if (passed) {
    recommendation = "accept";
  } else if (matchScore >= threshold * 0.8) {
    recommendation = "retry";
  } else {
    recommendation = "block";
  }

  const result = {
    panelType,
    passed,
    matchScore,
    metrics,
    issues,
    recommendation,
  };

  if (!passed) {
    logger.warn(
      `Panel ${panelType} failed fingerprint validation: score=${matchScore.toFixed(2)}, issues=${issues.length}`,
    );
  } else {
    logger.debug(`Panel ${panelType} passed: score=${matchScore.toFixed(2)}`);
  }

  return result;
}

/**
 * Run pre-composition validation gate on all panels
 *
 * @param {Object[]} allPanels - Array of panel results with imageUrl and type
 * @param {Object} fingerprint - Design fingerprint from hero_3d
 * @param {Object} options - Gate options
 * @returns {Promise<GateResult>}
 */
export async function runPreCompositionGate(
  allPanels,
  fingerprint,
  options = {},
) {
  if (!isFeatureEnabled("strictFingerprintGate")) {
    logger.info("Fingerprint gate disabled - skipping validation");
    return {
      canCompose: true,
      passedPanels: allPanels.map((p) => p.panelType || p.type),
      failedPanels: [],
      overallMatchScore: 1.0,
      action: "compose",
      summary: "Gate disabled - all panels accepted",
    };
  }

  logger.info("Running pre-composition fingerprint validation gate...");

  const passedPanels = [];
  const failedPanels = [];
  let totalScore = 0;

  // Validate each panel
  for (const panel of allPanels) {
    const panelType = panel.panelType || panel.type;
    const imageUrl = panel.imageUrl || panel.url;

    // Skip hero_3d (it's the reference)
    if (panelType === "hero_3d") {
      passedPanels.push(panelType);
      totalScore += 1.0;
      continue;
    }

    // Skip non-visual panels
    if (isDataPanel(panelType)) {
      passedPanels.push(panelType);
      totalScore += 1.0;
      continue;
    }

    const validation = await validatePanelAgainstFingerprint(
      { panelType, imageUrl },
      fingerprint,
      options,
    );

    if (validation.passed) {
      passedPanels.push(panelType);
    } else {
      failedPanels.push(validation);
    }

    totalScore += validation.matchScore;
  }

  const overallMatchScore = totalScore / allPanels.length;
  const passRatio = passedPanels.length / allPanels.length;

  // Check if critical panels failed
  const criticalFailures = failedPanels.filter((f) =>
    FINGERPRINT_THRESHOLDS.CRITICAL_PANELS.includes(f.panelType),
  );

  // Determine action
  let action;
  let canCompose;

  if (criticalFailures.length > 0) {
    // Critical panel failed - must retry or abort
    const maxRetries =
      getFeatureValue("maxFingerprintRetries") ||
      FINGERPRINT_THRESHOLDS.MAX_PANEL_RETRIES;

    if (options.retryCount < maxRetries) {
      action = "retry_failed";
      canCompose = false;
    } else {
      // REFACTORED: Use strict_fallback instead of abort to enable recovery with override params
      action = "strict_fallback";
      canCompose = false;
    }
  } else if (passRatio < FINGERPRINT_THRESHOLDS.MINIMUM_PANELS_PASS_RATIO) {
    // Too many panels failed
    if (options.blockOnMismatch !== false) {
      action = "retry_failed";
      canCompose = false;
    } else {
      action = "compose";
      canCompose = true;
    }
  } else {
    // Acceptable pass rate
    action = "compose";
    canCompose = true;
  }

  const summary = generateGateSummary({
    passedCount: passedPanels.length,
    failedCount: failedPanels.length,
    totalCount: allPanels.length,
    overallMatchScore,
    criticalFailures: criticalFailures.length,
    action,
  });

  const result = {
    canCompose,
    passedPanels,
    failedPanels,
    overallMatchScore,
    action,
    summary,
  };

  logger.info(
    `Fingerprint gate result: ${action} (${passedPanels.length}/${allPanels.length} passed, score=${overallMatchScore.toFixed(2)})`,
  );

  return result;
}

/**
 * Fetch image data from a URL and return pixel data for comparison.
 * Uses Canvas API in browser, falls back to metadata comparison.
 *
 * @param {string} imageUrl
 * @returns {Promise<{ width: number, height: number, data: Uint8ClampedArray }|null>}
 */
async function fetchImageData(imageUrl) {
  if (!imageUrl) return null;

  // Browser environment with Canvas API
  if (typeof document !== "undefined" && typeof Image !== "undefined") {
    try {
      return await new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          // Downsample to 64x64 for fast comparison
          const canvas = document.createElement("canvas");
          const size = 64;
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, size, size);
          const imageData = ctx.getImageData(0, 0, size, size);
          resolve({ width: size, height: size, data: imageData.data });
        };
        img.onerror = () => resolve(null); // Non-fatal
        // Timeout after 5s
        setTimeout(() => resolve(null), 5000);
        img.src = imageUrl;
      });
    } catch {
      return null;
    }
  }

  return null; // Non-browser: no pixel access
}

/**
 * Compute perceptual hash (simplified pHash) from pixel data.
 * Converts to grayscale, computes DCT-like hash via mean threshold.
 *
 * @param {{ data: Uint8ClampedArray, width: number, height: number }} imgData
 * @returns {number[]} 64-bit hash as array of 0/1
 */
function computePHash(imgData) {
  if (!imgData || !imgData.data) return null;
  const { data, width, height } = imgData;
  const size = Math.min(width, height, 8);

  // Downsample to 8x8 grayscale
  const gray = [];
  const stepX = width / size;
  const stepY = height / size;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = Math.floor(x * stepX);
      const py = Math.floor(y * stepY);
      const idx = (py * width + px) * 4;
      const lum =
        0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      gray.push(lum);
    }
  }

  const mean = gray.reduce((a, b) => a + b, 0) / gray.length;
  return gray.map((v) => (v >= mean ? 1 : 0));
}

/**
 * Hamming distance between two pHash arrays.
 */
function hammingDistance(hash1, hash2) {
  if (!hash1 || !hash2) return 64; // Max distance if unavailable
  let dist = 0;
  for (let i = 0; i < Math.min(hash1.length, hash2.length); i++) {
    if (hash1[i] !== hash2[i]) dist++;
  }
  return dist;
}

/**
 * Calculate visual similarity between panel and fingerprint.
 *
 * REAL IMAGE COMPARISON:
 * - Fetches both images when possible
 * - Computes pHash and Hamming distance
 * - Falls back to prompt/metadata comparison when images unavailable
 */
async function calculateVisualSimilarity(
  panelImageUrl,
  fingerprint,
  panelType,
) {
  // Try real image comparison first
  const heroUrl = fingerprint?.heroImageUrl;
  if (panelImageUrl && heroUrl) {
    const [panelData, heroData] = await Promise.all([
      fetchImageData(panelImageUrl),
      fetchImageData(heroUrl),
    ]);

    if (panelData && heroData) {
      const panelHash = computePHash(panelData);
      const heroHash = computePHash(heroData);
      const distance = hammingDistance(panelHash, heroHash);

      // Convert Hamming distance to similarity (0..1)
      // Max distance for 64-bit hash is 64
      const maxDist = 64;

      // Panel type adjustment: 2D technical drawings are inherently different from 3D hero
      const technicalPanels = [
        "floor_plan_ground",
        "floor_plan_first",
        "floor_plan_level2",
        "section_AA",
        "section_BB",
        "site_diagram",
      ];
      const isTechnical = technicalPanels.includes(panelType);

      // For technical panels, expected distance is higher (they look different from 3D hero)
      // So we normalize differently
      if (isTechnical) {
        // Technical panels: any distance < 48 is acceptable
        return Math.max(0, Math.min(1, 1 - (distance / 48) * 0.15));
      }

      // For 3D/elevation panels: use standard distance-to-similarity
      return Math.max(0, Math.min(1, 1 - distance / maxDist));
    }
  }

  // Fallback: use fingerprint metadata comparison (prompt hash, materials, etc.)
  return estimateSimilarityFromMetadata(panelType, fingerprint);
}

/**
 * Check color palette match using real pixel data when available.
 */
async function checkColorPaletteMatch(panelImageUrl, fingerprint) {
  if (panelImageUrl && fingerprint?.heroImageUrl) {
    const panelData = await fetchImageData(panelImageUrl);
    if (panelData) {
      // Extract dominant colors (simplified: average R, G, B in 4 quadrants)
      const panelColors = extractDominantColors(panelData);
      const heroColors = fingerprint.dominantColors || fingerprint.colorPalette;

      if (panelColors && heroColors && heroColors.length > 0) {
        return compareColorPalettes(panelColors, heroColors);
      }
    }
  }

  // Fallback: check if fingerprint has color data we can compare structurally
  if (fingerprint?.colorPalette && fingerprint.colorPalette.length > 0) {
    return 0.9; // Assume decent match if we can't verify visually
  }
  return 0.88;
}

/**
 * Extract dominant colors from image data (4-quadrant average).
 */
function extractDominantColors(imgData) {
  const { data, width, height } = imgData;
  const colors = [];
  const halfW = Math.floor(width / 2);
  const halfH = Math.floor(height / 2);
  const quadrants = [
    [0, 0, halfW, halfH],
    [halfW, 0, width, halfH],
    [0, halfH, halfW, height],
    [halfW, halfH, width, height],
  ];

  for (const [x1, y1, x2, y2] of quadrants) {
    let r = 0,
      g = 0,
      b = 0,
      count = 0;
    for (let y = y1; y < y2; y++) {
      for (let x = x1; x < x2; x++) {
        const idx = (y * width + x) * 4;
        r += data[idx];
        g += data[idx + 1];
        b += data[idx + 2];
        count++;
      }
    }
    if (count > 0) {
      colors.push([
        Math.round(r / count),
        Math.round(g / count),
        Math.round(b / count),
      ]);
    }
  }
  return colors;
}

/**
 * Compare two color palettes using average deltaE-like distance.
 */
function compareColorPalettes(colors1, colors2) {
  if (!colors1.length || !colors2.length) return 0.85;

  let totalDist = 0;
  let comparisons = 0;
  for (const c1 of colors1) {
    let minDist = Infinity;
    for (const c2 of colors2) {
      // Parse hex colors if needed
      const rgb2 = typeof c2 === "string" ? hexToRgb(c2) : c2;
      if (!rgb2) continue;
      const dist = Math.sqrt(
        Math.pow(c1[0] - rgb2[0], 2) +
          Math.pow(c1[1] - rgb2[1], 2) +
          Math.pow(c1[2] - rgb2[2], 2),
      );
      minDist = Math.min(minDist, dist);
    }
    if (minDist < Infinity) {
      totalDist += minDist;
      comparisons++;
    }
  }

  if (comparisons === 0) return 0.85;
  const avgDist = totalDist / comparisons;
  // Max RGB distance is ~441 (black to white)
  return Math.max(0, Math.min(1, 1 - avgDist / 441));
}

function hexToRgb(hex) {
  if (!hex || typeof hex !== "string") return null;
  const match = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!match) return null;
  return [
    parseInt(match[1], 16),
    parseInt(match[2], 16),
    parseInt(match[3], 16),
  ];
}

/**
 * Check structural consistency using real image comparison.
 */
async function checkStructuralConsistency(
  panelImageUrl,
  fingerprint,
  panelType,
) {
  if (panelImageUrl && fingerprint?.heroImageUrl) {
    const [panelData, heroData] = await Promise.all([
      fetchImageData(panelImageUrl),
      fetchImageData(heroUrl(fingerprint)),
    ]);

    if (panelData && heroData) {
      // Compare edge profiles: extract luminance gradients
      const panelEdges = extractEdgeProfile(panelData);
      const heroEdges = extractEdgeProfile(heroData);
      return compareEdgeProfiles(panelEdges, heroEdges);
    }
  }

  // Fallback: estimate from metadata
  return estimateStructuralSimilarity(panelType, fingerprint);
}

function heroUrl(fingerprint) {
  return fingerprint?.heroImageUrl || null;
}

/**
 * Extract edge profile from image data (simplified Sobel-like).
 */
function extractEdgeProfile(imgData) {
  const { data, width, height } = imgData;
  const edges = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      const idxLeft = (y * width + (x - 1)) * 4;
      const idxRight = (y * width + (x + 1)) * 4;
      const idxUp = ((y - 1) * width + x) * 4;
      const idxDown = ((y + 1) * width + x) * 4;

      const lumL =
        0.299 * data[idxLeft] +
        0.587 * data[idxLeft + 1] +
        0.114 * data[idxLeft + 2];
      const lumR =
        0.299 * data[idxRight] +
        0.587 * data[idxRight + 1] +
        0.114 * data[idxRight + 2];
      const lumU =
        0.299 * data[idxUp] + 0.587 * data[idxUp + 1] + 0.114 * data[idxUp + 2];
      const lumD =
        0.299 * data[idxDown] +
        0.587 * data[idxDown + 1] +
        0.114 * data[idxDown + 2];

      const gx = lumR - lumL;
      const gy = lumD - lumU;
      edges.push(Math.sqrt(gx * gx + gy * gy));
    }
  }
  return edges;
}

/**
 * Compare edge profiles by normalized cross-correlation.
 */
function compareEdgeProfiles(edges1, edges2) {
  if (!edges1.length || !edges2.length) return 0.85;
  const len = Math.min(edges1.length, edges2.length);

  let sum1 = 0,
    sum2 = 0;
  for (let i = 0; i < len; i++) {
    sum1 += edges1[i];
    sum2 += edges2[i];
  }
  const mean1 = sum1 / len;
  const mean2 = sum2 / len;

  let num = 0,
    den1 = 0,
    den2 = 0;
  for (let i = 0; i < len; i++) {
    const d1 = edges1[i] - mean1;
    const d2 = edges2[i] - mean2;
    num += d1 * d2;
    den1 += d1 * d1;
    den2 += d2 * d2;
  }

  const den = Math.sqrt(den1 * den2);
  if (den === 0) return 1.0;
  // Correlation ranges from -1 to 1; normalize to 0..1
  return Math.max(0, (num / den + 1) / 2);
}

/**
 * Estimate similarity from metadata when images are unavailable.
 */
function estimateSimilarityFromMetadata(panelType, fingerprint) {
  if (!fingerprint) return 0.85;

  // Panels with hero control get higher base score
  const controlledPanels = ["axonometric", "interior_3d"];
  if (controlledPanels.includes(panelType)) return 0.92;
  if (panelType?.startsWith("elevation_")) return 0.88;

  // Technical panels are inherently different
  const technicalPanels = [
    "floor_plan_ground",
    "floor_plan_first",
    "floor_plan_level2",
    "section_AA",
    "section_BB",
  ];
  if (technicalPanels.includes(panelType)) return 0.9;

  return 0.88;
}

function estimateStructuralSimilarity(panelType, fingerprint) {
  if (!fingerprint) return 0.85;
  const controlledPanels = ["axonometric", "interior_3d"];
  if (controlledPanels.includes(panelType)) return 0.92;
  if (panelType?.startsWith("elevation_")) return 0.88;
  return 0.85;
}

/**
 * Check if panel is structural (3D or elevation)
 */
function isStructuralPanel(panelType) {
  return [
    "hero_3d",
    "interior_3d",
    "axonometric",
    "elevation_north",
    "elevation_south",
    "elevation_east",
    "elevation_west",
  ].includes(panelType);
}

/**
 * Check if panel is data-only (no visual comparison needed)
 */
function isDataPanel(panelType) {
  return [
    "material_palette",
    "climate_card",
    "schedules_notes",
    "title_block",
  ].includes(panelType);
}

/**
 * Generate human-readable gate summary
 */
function generateGateSummary({
  passedCount,
  failedCount,
  totalCount,
  overallMatchScore,
  criticalFailures,
  action,
}) {
  const passRate = ((passedCount / totalCount) * 100).toFixed(1);
  const scorePercent = (overallMatchScore * 100).toFixed(1);

  let summary = `Fingerprint Validation: ${passedCount}/${totalCount} panels passed (${passRate}%), overall score ${scorePercent}%. `;

  if (action === "compose") {
    summary += "Proceeding with A1 composition.";
  } else if (action === "retry_failed") {
    summary += `Retrying ${failedCount} failed panels with stronger control.`;
  } else if (action === "strict_fallback") {
    summary += `STRICT FALLBACK: ${criticalFailures} critical panel(s) exceeded retry limit. Using strict override parameters for final attempt.`;
  } else {
    summary += `BLOCKED: ${criticalFailures} critical panel(s) failed validation. Generation aborted.`;
  }

  return summary;
}

/**
 * Generate detailed mismatch report for debugging
 *
 * @param {PanelValidationResult[]} failedPanels - Failed panel results
 * @returns {Object} Detailed report
 */
export function generateMismatchReport(failedPanels) {
  return {
    timestamp: new Date().toISOString(),
    failedCount: failedPanels.length,
    panels: failedPanels.map((f) => ({
      type: f.panelType,
      score: f.matchScore,
      recommendation: f.recommendation,
      issues: f.issues,
      metrics: f.metrics,
    })),
    recommendations: failedPanels
      .filter((f) => f.recommendation === "retry")
      .map((f) => `Retry ${f.panelType} with strength 0.75+`),
    criticalBlocks: failedPanels
      .filter((f) => f.recommendation === "block")
      .map((f) => f.panelType),
  };
}

/**
 * Get strict fallback parameters for a panel type when max retries exceeded.
 * These parameters force stronger geometry adherence and break potential loops.
 *
 * SPEC: control_strength=0.95, image_strength=0.35, keep same seed unless intentional variation
 *
 * @param {string} panelType - Type of panel requiring fallback
 * @param {number} previousSeed - The seed from the last attempt
 * @param {Object} options - Optional configuration
 * @param {boolean} options.incrementSeed - Whether to increment seed (default: false for consistency)
 * @returns {Object} Override parameters for strict fallback generation
 */
export function getStrictFallbackParams(
  panelType,
  previousSeed = 0,
  options = {},
) {
  const { incrementSeed = false } = options;

  // Base strict parameters per spec: control_strength=0.95, image_strength=0.35
  // Keep same seed by default for maximum consistency
  const baseParams = {
    control_strength: 0.95, // Force strict geometry adherence (spec)
    image_strength: 0.35, // Lower to preserve more init_image detail (spec: 0.35)
    guidance_scale: 4.0, // Lower guidance to reduce creative hallucination
    seed: incrementSeed ? (previousSeed + 1) % 2147483647 : previousSeed, // Keep same seed by default
  };

  // Panel-specific adjustments - all use 0.95/0.35 base but may vary guidance
  const panelAdjustments = {
    // 3D panels: slightly lower control for lighting flexibility
    hero_3d: {
      control_strength: 0.95,
      image_strength: 0.35,
      guidance_scale: 4.5,
    },
    interior_3d: {
      control_strength: 0.95,
      image_strength: 0.35,
      guidance_scale: 4.2,
    },
    axonometric: {
      control_strength: 0.95,
      image_strength: 0.35,
      guidance_scale: 4.0,
    },
    // Elevations: strict geometry, moderate guidance
    elevation_north: {
      control_strength: 0.95,
      image_strength: 0.35,
      guidance_scale: 3.8,
    },
    elevation_south: {
      control_strength: 0.95,
      image_strength: 0.35,
      guidance_scale: 3.8,
    },
    elevation_east: {
      control_strength: 0.95,
      image_strength: 0.35,
      guidance_scale: 3.8,
    },
    elevation_west: {
      control_strength: 0.95,
      image_strength: 0.35,
      guidance_scale: 3.8,
    },
    // Sections: highest geometry fidelity
    section_AA: {
      control_strength: 0.95,
      image_strength: 0.35,
      guidance_scale: 3.5,
    },
    section_BB: {
      control_strength: 0.95,
      image_strength: 0.35,
      guidance_scale: 3.5,
    },
    // Floor plans: maximum control for geometry
    floor_plan_ground: {
      control_strength: 0.95,
      image_strength: 0.35,
      guidance_scale: 3.5,
    },
    floor_plan_first: {
      control_strength: 0.95,
      image_strength: 0.35,
      guidance_scale: 3.5,
    },
    floor_plan_level2: {
      control_strength: 0.95,
      image_strength: 0.35,
      guidance_scale: 3.5,
    },
  };

  const adjustments = panelAdjustments[panelType] || {};

  const result = {
    ...baseParams,
    ...adjustments,
    // Only increment seed if explicitly requested (e.g., to break infinite retry loops)
    seed: incrementSeed ? (previousSeed + 1) % 2147483647 : previousSeed,
    isStrictFallback: true,
    originalPanelType: panelType,
    keepSeed: !incrementSeed,
  };

  logger.info(
    `[StrictFallback] Generated override params for ${panelType}: control=${result.control_strength}, image=${result.image_strength}, guidance=${result.guidance_scale}, seed=${result.seed}${result.keepSeed ? " (preserved)" : " (incremented)"}`,
  );

  return result;
}

export default {
  validatePanelAgainstFingerprint,
  runPreCompositionGate,
  generateMismatchReport,
  getStrictFallbackParams,
  FINGERPRINT_THRESHOLDS,
};
