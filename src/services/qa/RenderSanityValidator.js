/**
 * RenderSanityValidator
 *
 * Validates rendered panel images (PNG) to detect bad technical drawings:
 * - Thin strips (elevation or plan compressed to a narrow band)
 * - Tiny plans (content occupying only a small portion of canvas)
 * - Empty interiors (nearly blank technical drawings)
 *
 * Runs AFTER SVG rasterization, on the final PNG images.
 *
 * @module services/qa/RenderSanityValidator
 */

import sharp from "sharp";

// ============================================================================
// THRESHOLD CONSTANTS
// ============================================================================

/**
 * Minimum foreground occupancy ratio (non-white pixels / total pixels).
 * Below this threshold, the panel is considered "empty" or "too sparse".
 * Value: 0.08 = 8% of pixels must be non-white foreground content.
 */
export const MIN_OCCUPANCY_RATIO = 0.08;

/**
 * Minimum bounding box dimension ratio relative to canvas size.
 * Both width and height of the content bounding box must exceed this ratio.
 * Value: 0.20 = content must span at least 20% of canvas in each dimension.
 */
export const MIN_BBOX_RATIO = 0.2;

/**
 * Thin strip detection threshold for bbox width.
 * If bbox width < this ratio * canvas width, it's a "thin strip" (bad elevation).
 * Value: 0.05 = if content width is less than 5% of canvas, it's a thin strip.
 */
export const THIN_STRIP_WIDTH_THRESHOLD = 0.05;

/**
 * Thin strip detection threshold for bbox height.
 * If bbox height < this ratio * canvas height, it's a horizontal thin strip.
 * Value: 0.05 = if content height is less than 5% of canvas, it's a thin strip.
 */
export const THIN_STRIP_HEIGHT_THRESHOLD = 0.05;

/**
 * Pixel intensity threshold to distinguish foreground from background.
 * Pixels with ALL channels >= this value are considered "white" (background).
 * Value: 240 = near-white pixels (240-255) are treated as background.
 */
export const WHITE_PIXEL_THRESHOLD = 240;

/**
 * Analysis resolution - images are resized to this for faster processing.
 * Must be large enough to detect thin strips accurately.
 */
export const ANALYSIS_SIZE = 512;

/**
 * Panel types that should be validated by RenderSanityValidator.
 * These are technical drawings where thin strips / tiny content are problematic.
 */
export const SANITY_CHECK_PANEL_TYPES = [
  "floor_plan_ground",
  "floor_plan_first",
  "floor_plan_upper",
  "elevation_north",
  "elevation_south",
  "elevation_east",
  "elevation_west",
  "section_AA",
  "section_BB",
  "site_plan",
];

// ============================================================================
// VALIDATION RESULT TYPES
// ============================================================================

/**
 * @typedef {Object} BoundingBox
 * @property {number} minX - Leftmost x coordinate of foreground content
 * @property {number} maxX - Rightmost x coordinate of foreground content
 * @property {number} minY - Topmost y coordinate of foreground content
 * @property {number} maxY - Bottommost y coordinate of foreground content
 * @property {number} width - Width of bounding box in pixels
 * @property {number} height - Height of bounding box in pixels
 * @property {number} widthRatio - Width as ratio of canvas width (0-1)
 * @property {number} heightRatio - Height as ratio of canvas height (0-1)
 */

/**
 * @typedef {Object} SanityMetrics
 * @property {number} totalPixels - Total pixels analyzed
 * @property {number} foregroundPixels - Non-white (foreground) pixel count
 * @property {number} occupancyRatio - foregroundPixels / totalPixels
 * @property {BoundingBox} boundingBox - Bounding box of foreground content
 * @property {number} canvasWidth - Analysis canvas width
 * @property {number} canvasHeight - Analysis canvas height
 */

/**
 * @typedef {Object} SanityValidationResult
 * @property {boolean} isValid - Whether the panel passes sanity checks
 * @property {string} panelType - Type of panel validated
 * @property {SanityMetrics} metrics - Computed metrics
 * @property {string[]} failures - List of failed validation rules
 * @property {string[]} warnings - List of warnings (non-blocking)
 * @property {string} blockerMessage - Human-readable blocker message if invalid
 */

// ============================================================================
// CORE VALIDATION FUNCTIONS
// ============================================================================

/**
 * Analyzes an image buffer to compute foreground metrics.
 *
 * @param {Buffer} imageBuffer - PNG image buffer to analyze
 * @returns {Promise<SanityMetrics>} Computed metrics
 */
export async function computeSanityMetrics(imageBuffer) {
  // Resize to analysis size and get raw pixel data
  const { data, info } = await sharp(imageBuffer)
    .resize(ANALYSIS_SIZE, ANALYSIS_SIZE, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const totalPixels = width * height;

  // Initialize bounding box to invalid state
  let minX = width;
  let maxX = 0;
  let minY = height;
  let maxY = 0;
  let foregroundPixels = 0;

  // Scan all pixels
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      // Alpha channel at data[idx + 3] - we ignore fully transparent pixels

      // Check if pixel is foreground (not white/near-white)
      const isWhite =
        r >= WHITE_PIXEL_THRESHOLD &&
        g >= WHITE_PIXEL_THRESHOLD &&
        b >= WHITE_PIXEL_THRESHOLD;

      if (!isWhite) {
        foregroundPixels++;
        // Update bounding box
        if (x < minX) {
          minX = x;
        }
        if (x > maxX) {
          maxX = x;
        }
        if (y < minY) {
          minY = y;
        }
        if (y > maxY) {
          maxY = y;
        }
      }
    }
  }

  // Handle case where no foreground pixels found
  if (foregroundPixels === 0) {
    return {
      totalPixels,
      foregroundPixels: 0,
      occupancyRatio: 0,
      boundingBox: {
        minX: 0,
        maxX: 0,
        minY: 0,
        maxY: 0,
        width: 0,
        height: 0,
        widthRatio: 0,
        heightRatio: 0,
      },
      canvasWidth: width,
      canvasHeight: height,
    };
  }

  const bboxWidth = maxX - minX + 1;
  const bboxHeight = maxY - minY + 1;

  return {
    totalPixels,
    foregroundPixels,
    occupancyRatio: foregroundPixels / totalPixels,
    boundingBox: {
      minX,
      maxX,
      minY,
      maxY,
      width: bboxWidth,
      height: bboxHeight,
      widthRatio: bboxWidth / width,
      heightRatio: bboxHeight / height,
    },
    canvasWidth: width,
    canvasHeight: height,
  };
}

/**
 * Validates a rendered panel image against sanity thresholds.
 *
 * @param {Buffer} imageBuffer - PNG image buffer to validate
 * @param {string} panelType - Type of panel (e.g., 'floor_plan_ground', 'elevation_north')
 * @returns {Promise<SanityValidationResult>} Validation result
 */
export async function validateRenderSanity(imageBuffer, panelType) {
  const failures = [];
  const warnings = [];

  // Skip validation for non-technical panels
  if (!SANITY_CHECK_PANEL_TYPES.includes(panelType)) {
    return {
      isValid: true,
      panelType,
      metrics: null,
      failures: [],
      warnings: [
        `Panel type '${panelType}' is not subject to render sanity checks`,
      ],
      blockerMessage: null,
    };
  }

  // Compute metrics
  const metrics = await computeSanityMetrics(imageBuffer);

  // Rule 1: Minimum occupancy ratio
  if (metrics.occupancyRatio < MIN_OCCUPANCY_RATIO) {
    failures.push(
      `OCCUPANCY_TOO_LOW: occupancy=${(metrics.occupancyRatio * 100).toFixed(2)}% < ${MIN_OCCUPANCY_RATIO * 100}% threshold`,
    );
  }

  // Rule 2: Minimum bounding box width ratio
  if (metrics.boundingBox.widthRatio < MIN_BBOX_RATIO) {
    failures.push(
      `BBOX_WIDTH_TOO_SMALL: bboxWidth=${(metrics.boundingBox.widthRatio * 100).toFixed(2)}% < ${MIN_BBOX_RATIO * 100}% threshold`,
    );
  }

  // Rule 3: Minimum bounding box height ratio
  if (metrics.boundingBox.heightRatio < MIN_BBOX_RATIO) {
    failures.push(
      `BBOX_HEIGHT_TOO_SMALL: bboxHeight=${(metrics.boundingBox.heightRatio * 100).toFixed(2)}% < ${MIN_BBOX_RATIO * 100}% threshold`,
    );
  }

  // Rule 4: Thin strip detection (vertical)
  if (metrics.boundingBox.widthRatio < THIN_STRIP_WIDTH_THRESHOLD) {
    failures.push(
      `THIN_STRIP_VERTICAL: bboxWidth=${(metrics.boundingBox.widthRatio * 100).toFixed(2)}% < ${THIN_STRIP_WIDTH_THRESHOLD * 100}% (thin vertical strip detected)`,
    );
  }

  // Rule 5: Thin strip detection (horizontal)
  if (metrics.boundingBox.heightRatio < THIN_STRIP_HEIGHT_THRESHOLD) {
    failures.push(
      `THIN_STRIP_HORIZONTAL: bboxHeight=${(metrics.boundingBox.heightRatio * 100).toFixed(2)}% < ${THIN_STRIP_HEIGHT_THRESHOLD * 100}% (thin horizontal strip detected)`,
    );
  }

  // Rule 6: Aspect contract sanity – detect when a non-cover panel was
  // generated as a square but the slot is rectangular (or vice-versa).
  // Tolerance: warn if generated aspect deviates >30% from slot aspect.
  // Uses original image metadata (not the 512×512 analysis canvas).
  try {
    const { getSlotDimensions, getPanelFitMode } =
      await import("../a1/composeCore.js");
    const fitMode = getPanelFitMode(panelType);
    if (fitMode === "contain") {
      const { aspect: slotAspect } = getSlotDimensions(panelType);
      // Get original image dimensions from sharp metadata (before the analysis resize)
      const originalMeta = await sharp(imageBuffer).metadata();
      const origW = originalMeta.width || 1;
      const origH = originalMeta.height || 1;
      const imageAspect = origW / origH;
      const deviation =
        Math.abs(imageAspect - slotAspect) / Math.max(slotAspect, 0.01);
      if (deviation > 0.3) {
        warnings.push(
          `ASPECT_MISMATCH: image=${imageAspect.toFixed(2)} (${origW}×${origH}) vs slot=${slotAspect.toFixed(2)} (${(deviation * 100).toFixed(0)}% deviation)`,
        );
      }
    }
  } catch {
    // composeCore not available – skip aspect check
  }

  // Build blocker message
  let blockerMessage = null;
  if (failures.length > 0) {
    blockerMessage = buildBlockerMessage(panelType, metrics, failures);
  }

  return {
    isValid: failures.length === 0,
    panelType,
    metrics,
    failures,
    warnings,
    blockerMessage,
  };
}

/**
 * Builds a human-readable blocker message for failed validation.
 *
 * @param {string} panelType - Panel type that failed
 * @param {SanityMetrics} metrics - Computed metrics
 * @param {string[]} failures - List of failures
 * @returns {string} Formatted blocker message
 */
function buildBlockerMessage(panelType, metrics, failures) {
  const lines = [
    `[RenderSanityValidator] BLOCKED: ${panelType}`,
    ``,
    `Measured values:`,
    `  - Occupancy ratio: ${(metrics.occupancyRatio * 100).toFixed(2)}% (min: ${MIN_OCCUPANCY_RATIO * 100}%)`,
    `  - BBox width ratio: ${(metrics.boundingBox.widthRatio * 100).toFixed(2)}% (min: ${MIN_BBOX_RATIO * 100}%)`,
    `  - BBox height ratio: ${(metrics.boundingBox.heightRatio * 100).toFixed(2)}% (min: ${MIN_BBOX_RATIO * 100}%)`,
    `  - BBox dimensions: ${metrics.boundingBox.width}x${metrics.boundingBox.height} px`,
    `  - Canvas size: ${metrics.canvasWidth}x${metrics.canvasHeight} px`,
    ``,
    `Failed rules:`,
    ...failures.map((f) => `  - ${f}`),
    ``,
    `Action required: Regenerate ${panelType} with proper content coverage.`,
  ];

  return lines.join("\n");
}

// ============================================================================
// BATCH VALIDATION
// ============================================================================

/**
 * Validates multiple panel images in batch.
 *
 * @param {Array<{panelType: string, imageBuffer: Buffer}>} panels - Panels to validate
 * @returns {Promise<{allValid: boolean, results: SanityValidationResult[]}>}
 */
export async function validateBatch(panels) {
  const results = await Promise.all(
    panels.map(({ panelType, imageBuffer }) =>
      validateRenderSanity(imageBuffer, panelType),
    ),
  );

  const allValid = results.every((r) => r.isValid);

  return {
    allValid,
    results,
  };
}

/**
 * Validates panels from URLs (downloads and validates).
 *
 * @param {Array<{panelType: string, url: string}>} panels - Panels with URLs
 * @returns {Promise<{allValid: boolean, results: SanityValidationResult[]}>}
 */
export async function validatePanelsFromUrls(panels) {
  const panelsWithBuffers = await Promise.all(
    panels.map(async ({ panelType, url }) => {
      try {
        let imageBuffer;

        if (url.startsWith("data:")) {
          // Handle data URL
          const base64Data = url.split(",")[1];
          imageBuffer = Buffer.from(base64Data, "base64");
        } else {
          // Handle regular URL
          const response = await fetch(url);
          if (!response.ok) {
            throw new Error(`Failed to fetch ${url}: ${response.status}`);
          }
          const arrayBuffer = await response.arrayBuffer();
          imageBuffer = Buffer.from(arrayBuffer);
        }

        return { panelType, imageBuffer };
      } catch (error) {
        // Return a "failed to load" result
        return {
          panelType,
          imageBuffer: null,
          loadError: error.message,
        };
      }
    }),
  );

  // Filter out load errors and validate the rest
  const validPanels = panelsWithBuffers.filter((p) => p.imageBuffer !== null);
  const loadErrors = panelsWithBuffers.filter((p) => p.imageBuffer === null);

  const validationResults = await validateBatch(validPanels);

  // Add load error results
  const loadErrorResults = loadErrors.map((p) => ({
    isValid: false,
    panelType: p.panelType,
    metrics: null,
    failures: [`LOAD_ERROR: ${p.loadError}`],
    warnings: [],
    blockerMessage: `[RenderSanityValidator] BLOCKED: ${p.panelType}\n\nFailed to load image: ${p.loadError}`,
  }));

  return {
    allValid: validationResults.allValid && loadErrors.length === 0,
    results: [...validationResults.results, ...loadErrorResults],
  };
}

// ============================================================================
// EXPORT GATE INTEGRATION HELPER
// ============================================================================

/**
 * Integrates with A1ExportGate - validates panels and returns gate-compatible result.
 *
 * @param {Array<{panelType: string, imageBuffer: Buffer}>} panels - Panels to validate
 * @returns {Promise<{passed: boolean, blockReasons: string[], warnings: string[]}>}
 */
export async function runExportGateCheck(panels) {
  const { allValid, results } = await validateBatch(panels);

  const blockReasons = results
    .filter((r) => !r.isValid)
    .map((r) => r.blockerMessage || `${r.panelType}: ${r.failures.join(", ")}`);

  const warnings = results.flatMap((r) => r.warnings);

  return {
    passed: allValid,
    blockReasons,
    warnings,
  };
}

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

const RenderSanityValidator = {
  // Constants
  MIN_OCCUPANCY_RATIO,
  MIN_BBOX_RATIO,
  THIN_STRIP_WIDTH_THRESHOLD,
  THIN_STRIP_HEIGHT_THRESHOLD,
  WHITE_PIXEL_THRESHOLD,
  ANALYSIS_SIZE,
  SANITY_CHECK_PANEL_TYPES,

  // Core functions
  computeSanityMetrics,
  validateRenderSanity,
  validateBatch,
  validatePanelsFromUrls,
  runExportGateCheck,
};

export default RenderSanityValidator;
