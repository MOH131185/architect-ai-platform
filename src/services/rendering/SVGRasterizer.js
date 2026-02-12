/**
 * SVGRasterizer Service
 *
 * Handles SVG to PNG conversion with proper viewBox handling to prevent
 * collapsed elevations and floor plans.
 *
 * Key guarantees:
 * 1. viewBox matches actual geometry extents (not fixed 1024x1024)
 * 2. Aspect ratio preserved (no forced stretch)
 * 3. Padding margins prevent stroke clipping
 * 4. Deterministic output sizes per panel type
 *
 * @module services/rendering/SVGRasterizer
 */

import logger from "../core/logger.js";

// =============================================================================
// DETERMINISTIC PANEL SIZES
// =============================================================================

/**
 * Deterministic output sizes per panel type.
 * These ensure consistent rasterization regardless of geometry size.
 */
export const PANEL_OUTPUT_SIZES = {
  // Floor plans: square format for orthographic overhead
  floor_plan_ground: { width: 1024, height: 1024 },
  floor_plan_first: { width: 1024, height: 1024 },
  floor_plan_second: { width: 1024, height: 1024 },
  floor_plan: { width: 1024, height: 1024 }, // Generic fallback

  // Elevations: landscape format (building wider than tall typically)
  elevation_north: { width: 1200, height: 800 },
  elevation_south: { width: 1200, height: 800 },
  elevation_east: { width: 1200, height: 800 },
  elevation_west: { width: 1200, height: 800 },
  elevation: { width: 1200, height: 800 }, // Generic fallback

  // Sections: landscape format (similar to elevations)
  section_longitudinal: { width: 1200, height: 800 },
  section_transverse: { width: 1200, height: 800 },
  section: { width: 1200, height: 800 }, // Generic fallback

  // 3D views: square format for isometric/perspective
  exterior_3d: { width: 1024, height: 1024 },
  exterior_3d_corner: { width: 1024, height: 1024 },
  exterior_3d_front: { width: 1024, height: 1024 },
  interior_3d: { width: 1024, height: 1024 },
  axonometric: { width: 1024, height: 1024 },

  // Default fallback
  default: { width: 1024, height: 1024 },
};

/**
 * Minimum content dimensions to prevent collapsed outputs
 */
export const MIN_CONTENT_DIMENSIONS = {
  width: 100, // Minimum pixel width for content
  height: 100, // Minimum pixel height for content
};

/**
 * Padding margins for stroke clipping prevention
 */
export const PADDING_MARGINS = {
  floor_plan: 40, // Px padding around floor plans
  elevation: 50, // Px padding around elevations
  section: 50, // Px padding around sections
  exterior_3d: 30, // Px padding around 3D views
  interior_3d: 20, // Px padding around interior views
  axonometric: 30, // Px padding around axonometric
  default: 40, // Default padding
};

// =============================================================================
// SVG BOUNDS CALCULATION
// =============================================================================

/**
 * Calculate the actual bounding box of SVG content.
 * Parses SVG and finds the extents of all geometric elements.
 *
 * @param {string} svgString - Raw SVG string
 * @returns {Object} Bounding box { minX, minY, maxX, maxY, width, height }
 */
export function calculateSVGBounds(svgString) {
  const bounds = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  };

  // Parse rect elements
  const rectRegex =
    /<rect[^>]*x="([^"]*)"[^>]*y="([^"]*)"[^>]*width="([^"]*)"[^>]*height="([^"]*)"/gi;
  let match;
  while ((match = rectRegex.exec(svgString)) !== null) {
    const x = parseFloat(match[1]) || 0;
    const y = parseFloat(match[2]) || 0;
    const w = parseFloat(match[3]) || 0;
    const h = parseFloat(match[4]) || 0;

    // Skip full-size background rects
    if (match[0].includes("100%")) {
      continue;
    }

    bounds.minX = Math.min(bounds.minX, x);
    bounds.minY = Math.min(bounds.minY, y);
    bounds.maxX = Math.max(bounds.maxX, x + w);
    bounds.maxY = Math.max(bounds.maxY, y + h);
  }

  // Also try alternate attribute order (width/height before x/y)
  const rectRegex2 =
    /<rect[^>]*width="([^"]*)"[^>]*height="([^"]*)"[^>]*x="([^"]*)"[^>]*y="([^"]*)"/gi;
  while ((match = rectRegex2.exec(svgString)) !== null) {
    const w = parseFloat(match[1]) || 0;
    const h = parseFloat(match[2]) || 0;
    const x = parseFloat(match[3]) || 0;
    const y = parseFloat(match[4]) || 0;

    // Skip full-size background rects
    if (match[0].includes("100%")) {
      continue;
    }

    bounds.minX = Math.min(bounds.minX, x);
    bounds.minY = Math.min(bounds.minY, y);
    bounds.maxX = Math.max(bounds.maxX, x + w);
    bounds.maxY = Math.max(bounds.maxY, y + h);
  }

  // Parse line elements
  const lineRegex =
    /<line[^>]*x1="([^"]*)"[^>]*y1="([^"]*)"[^>]*x2="([^"]*)"[^>]*y2="([^"]*)"/gi;
  while ((match = lineRegex.exec(svgString)) !== null) {
    const x1 = parseFloat(match[1]) || 0;
    const y1 = parseFloat(match[2]) || 0;
    const x2 = parseFloat(match[3]) || 0;
    const y2 = parseFloat(match[4]) || 0;

    bounds.minX = Math.min(bounds.minX, x1, x2);
    bounds.minY = Math.min(bounds.minY, y1, y2);
    bounds.maxX = Math.max(bounds.maxX, x1, x2);
    bounds.maxY = Math.max(bounds.maxY, y1, y2);
  }

  // Parse polygon elements
  const polygonRegex = /<polygon[^>]*points="([^"]*)"/gi;
  while ((match = polygonRegex.exec(svgString)) !== null) {
    const points = match[1].trim().split(/[\s,]+/);
    for (let i = 0; i < points.length - 1; i += 2) {
      const x = parseFloat(points[i]) || 0;
      const y = parseFloat(points[i + 1]) || 0;
      bounds.minX = Math.min(bounds.minX, x);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxX = Math.max(bounds.maxX, x);
      bounds.maxY = Math.max(bounds.maxY, y);
    }
  }

  // Parse path elements (extract coordinates from M/L commands)
  const pathRegex = /<path[^>]*d="([^"]*)"/gi;
  while ((match = pathRegex.exec(svgString)) !== null) {
    const pathData = match[1];
    // Extract numbers from path commands (M, L, etc.)
    const coords = pathData.match(/[-+]?[0-9]*\.?[0-9]+/g);
    if (coords) {
      for (let i = 0; i < coords.length - 1; i += 2) {
        const x = parseFloat(coords[i]) || 0;
        const y = parseFloat(coords[i + 1]) || 0;
        bounds.minX = Math.min(bounds.minX, x);
        bounds.minY = Math.min(bounds.minY, y);
        bounds.maxX = Math.max(bounds.maxX, x);
        bounds.maxY = Math.max(bounds.maxY, y);
      }
    }
  }

  // Handle case where no bounds found
  if (bounds.minX === Infinity) {
    // Try to extract from existing viewBox
    const viewBoxMatch = svgString.match(/viewBox="([^"]*)"/i);
    if (viewBoxMatch) {
      const [vbMinX, vbMinY, vbWidth, vbHeight] = viewBoxMatch[1]
        .split(/\s+/)
        .map(Number);
      bounds.minX = vbMinX;
      bounds.minY = vbMinY;
      bounds.maxX = vbMinX + vbWidth;
      bounds.maxY = vbMinY + vbHeight;
    } else {
      // Fallback to default
      bounds.minX = 0;
      bounds.minY = 0;
      bounds.maxX = 1024;
      bounds.maxY = 1024;
    }
  }

  // Calculate dimensions
  bounds.width = bounds.maxX - bounds.minX;
  bounds.height = bounds.maxY - bounds.minY;

  return bounds;
}

/**
 * Get the padding for a panel type
 *
 * @param {string} panelType - Panel type identifier
 * @returns {number} Padding in pixels
 */
export function getPaddingForPanelType(panelType) {
  const type = panelType.toLowerCase();

  if (type.includes("floor_plan")) {
    return PADDING_MARGINS.floor_plan;
  }
  if (type.includes("elevation")) {
    return PADDING_MARGINS.elevation;
  }
  if (type.includes("section")) {
    return PADDING_MARGINS.section;
  }
  if (type.includes("exterior_3d")) {
    return PADDING_MARGINS.exterior_3d;
  }
  if (type.includes("interior_3d")) {
    return PADDING_MARGINS.interior_3d;
  }
  if (type.includes("axonometric")) {
    return PADDING_MARGINS.axonometric;
  }

  return PADDING_MARGINS.default;
}

/**
 * Get the output size for a panel type
 *
 * @param {string} panelType - Panel type identifier
 * @returns {Object} { width, height }
 */
export function getOutputSizeForPanelType(panelType) {
  const normalized = panelType.toLowerCase().replace(/\s+/g, "_");

  // Exact match first
  if (PANEL_OUTPUT_SIZES[normalized]) {
    return PANEL_OUTPUT_SIZES[normalized];
  }

  // Category match
  if (normalized.includes("floor_plan")) {
    return PANEL_OUTPUT_SIZES.floor_plan;
  }
  if (normalized.includes("elevation")) {
    return PANEL_OUTPUT_SIZES.elevation;
  }
  if (normalized.includes("section")) {
    return PANEL_OUTPUT_SIZES.section;
  }
  if (normalized.includes("exterior_3d")) {
    return PANEL_OUTPUT_SIZES.exterior_3d;
  }
  if (normalized.includes("interior_3d")) {
    return PANEL_OUTPUT_SIZES.interior_3d;
  }
  if (normalized.includes("axonometric")) {
    return PANEL_OUTPUT_SIZES.axonometric;
  }

  return PANEL_OUTPUT_SIZES.default;
}

// =============================================================================
// SVG NORMALIZATION
// =============================================================================

/**
 * Normalize SVG viewBox to match actual content extents with padding.
 * This prevents "thin tower" elevations and collapsed floor plans.
 *
 * @param {string} svgString - Raw SVG string
 * @param {string} panelType - Panel type for padding/size lookup
 * @param {Object} options - Additional options
 * @returns {string} Normalized SVG string with correct viewBox
 */
export function normalizeSVGViewBox(svgString, panelType, options = {}) {
  const {
    forceSquare = false,
    maintainAspectRatio = true,
    addPadding = true,
  } = options;

  // Calculate actual content bounds
  const bounds = calculateSVGBounds(svgString);

  // Get padding for this panel type
  const padding = addPadding ? getPaddingForPanelType(panelType) : 0;

  // Apply padding to bounds
  let viewMinX = bounds.minX - padding;
  let viewMinY = bounds.minY - padding;
  let viewWidth = bounds.width + padding * 2;
  let viewHeight = bounds.height + padding * 2;

  // Enforce minimum dimensions
  if (viewWidth < MIN_CONTENT_DIMENSIONS.width) {
    const diff = MIN_CONTENT_DIMENSIONS.width - viewWidth;
    viewMinX -= diff / 2;
    viewWidth = MIN_CONTENT_DIMENSIONS.width;
  }
  if (viewHeight < MIN_CONTENT_DIMENSIONS.height) {
    const diff = MIN_CONTENT_DIMENSIONS.height - viewHeight;
    viewMinY -= diff / 2;
    viewHeight = MIN_CONTENT_DIMENSIONS.height;
  }

  // Force square if requested (useful for 3D views)
  if (forceSquare) {
    const maxDim = Math.max(viewWidth, viewHeight);
    if (viewWidth < maxDim) {
      viewMinX -= (maxDim - viewWidth) / 2;
      viewWidth = maxDim;
    }
    if (viewHeight < maxDim) {
      viewMinY -= (maxDim - viewHeight) / 2;
      viewHeight = maxDim;
    }
  }

  // Get target output size
  const outputSize = getOutputSizeForPanelType(panelType);

  // Calculate aspect ratios
  const contentAspect = viewWidth / viewHeight;
  const outputAspect = outputSize.width / outputSize.height;

  // Adjust viewBox to maintain aspect ratio if needed
  if (maintainAspectRatio && Math.abs(contentAspect - outputAspect) > 0.01) {
    if (contentAspect > outputAspect) {
      // Content is wider - increase viewBox height
      const newHeight = viewWidth / outputAspect;
      viewMinY -= (newHeight - viewHeight) / 2;
      viewHeight = newHeight;
    } else {
      // Content is taller - increase viewBox width
      const newWidth = viewHeight * outputAspect;
      viewMinX -= (newWidth - viewWidth) / 2;
      viewWidth = newWidth;
    }
  }

  // Round values for clean SVG
  viewMinX = Math.round(viewMinX * 100) / 100;
  viewMinY = Math.round(viewMinY * 100) / 100;
  viewWidth = Math.round(viewWidth * 100) / 100;
  viewHeight = Math.round(viewHeight * 100) / 100;

  // Replace viewBox in SVG
  const newViewBox = `${viewMinX} ${viewMinY} ${viewWidth} ${viewHeight}`;

  let normalizedSVG = svgString;

  // Replace existing viewBox
  if (svgString.includes("viewBox=")) {
    normalizedSVG = svgString.replace(
      /viewBox="[^"]*"/i,
      `viewBox="${newViewBox}"`,
    );
  } else {
    // Add viewBox if missing
    normalizedSVG = svgString.replace(
      /<svg([^>]*)>/i,
      `<svg$1 viewBox="${newViewBox}">`,
    );
  }

  // Update width/height attributes to match output size
  normalizedSVG = normalizedSVG.replace(
    /width="[^"]*"/i,
    `width="${outputSize.width}"`,
  );
  normalizedSVG = normalizedSVG.replace(
    /height="[^"]*"/i,
    `height="${outputSize.height}"`,
  );

  logger.debug(`[SVGRasterizer] Normalized viewBox for ${panelType}:`, {
    originalBounds: bounds,
    newViewBox,
    outputSize,
    padding,
  });

  return normalizedSVG;
}

/**
 * Validate that an SVG will rasterize correctly.
 * Returns issues if the SVG is likely to produce bad output.
 *
 * @param {string} svgString - SVG to validate
 * @param {string} panelType - Panel type for context
 * @returns {Object} { valid, issues, warnings }
 */
export function validateSVGForRasterization(svgString, panelType) {
  const issues = [];
  const warnings = [];

  // Check for viewBox
  if (!svgString.includes("viewBox")) {
    issues.push("Missing viewBox attribute");
  }

  // Calculate bounds
  const bounds = calculateSVGBounds(svgString);

  // Check for collapsed dimensions
  if (bounds.width < MIN_CONTENT_DIMENSIONS.width) {
    issues.push(
      `Content width too small: ${bounds.width}px (min: ${MIN_CONTENT_DIMENSIONS.width}px)`,
    );
  }
  if (bounds.height < MIN_CONTENT_DIMENSIONS.height) {
    issues.push(
      `Content height too small: ${bounds.height}px (min: ${MIN_CONTENT_DIMENSIONS.height}px)`,
    );
  }

  // Check aspect ratio for panel type
  const outputSize = getOutputSizeForPanelType(panelType);
  const expectedAspect = outputSize.width / outputSize.height;
  const actualAspect = bounds.width / bounds.height;

  // Elevations should be wider than tall (aspect > 1)
  if (panelType.includes("elevation") && actualAspect < 0.5) {
    warnings.push(
      `Elevation aspect ratio suspicious: ${actualAspect.toFixed(2)} (expected >0.5)`,
    );
  }

  // Floor plans should be roughly square-ish
  if (
    panelType.includes("floor_plan") &&
    (actualAspect < 0.3 || actualAspect > 3)
  ) {
    warnings.push(
      `Floor plan aspect ratio extreme: ${actualAspect.toFixed(2)}`,
    );
  }

  return {
    valid: issues.length === 0,
    issues,
    warnings,
    bounds,
    aspectRatio: actualAspect,
  };
}

// =============================================================================
// RASTERIZATION (Node.js with Sharp)
// =============================================================================

/**
 * Rasterize SVG to PNG using Sharp with proper viewBox handling.
 * This is the main entry point for SVG→PNG conversion.
 *
 * @param {string|Buffer} svgInput - SVG string or buffer
 * @param {string} panelType - Panel type for size/padding lookup
 * @param {Object} options - Rasterization options
 * @returns {Promise<Buffer>} PNG buffer
 */
export async function rasterizeSVGToPNG(svgInput, panelType, options = {}) {
  const {
    normalize = true,
    validate = true,
    throwOnValidationFailure = true, // NEW: Enforce validation by default
    background = { r: 255, g: 255, b: 255, alpha: 1 },
  } = options;

  // Convert buffer to string if needed
  let svgString =
    typeof svgInput === "string" ? svgInput : svgInput.toString("utf-8");

  // Validate SVG
  if (validate) {
    const validation = validateSVGForRasterization(svgString, panelType);
    if (!validation.valid) {
      logger.warn(
        `[SVGRasterizer] SVG validation issues for ${panelType}:`,
        validation.issues,
      );
      // FIX: Throw error on validation failure to prevent thin/collapsed SVGs
      if (throwOnValidationFailure) {
        throw new Error(
          `SVG validation failed for ${panelType}: ${validation.issues.join(", ")}. ` +
            `Bounds: ${JSON.stringify(validation.bounds)}. ` +
            `This prevents thin/collapsed elevations from passing through the pipeline.`,
        );
      }
    }
    if (validation.warnings.length > 0) {
      logger.warn(
        `[SVGRasterizer] SVG warnings for ${panelType}:`,
        validation.warnings,
      );
    }
  }

  // Normalize viewBox to match content
  if (normalize) {
    svgString = normalizeSVGViewBox(svgString, panelType, {
      forceSquare:
        panelType.includes("3d") || panelType.includes("axonometric"),
      maintainAspectRatio: true,
      addPadding: true,
    });
  }

  // Get output size
  const outputSize = getOutputSizeForPanelType(panelType);

  try {
    // Dynamic import for Sharp (Node.js only)
    const { default: sharp } = await import(/* webpackIgnore: true */ "sharp");

    const svgBuffer = Buffer.from(svgString, "utf-8");

    const pngBuffer = await sharp(svgBuffer)
      .resize(outputSize.width, outputSize.height, {
        fit: "contain",
        background,
        withoutEnlargement: false, // Allow upscaling if content is small
      })
      .png()
      .toBuffer();

    logger.info(
      `[SVGRasterizer] Rasterized ${panelType} to ${outputSize.width}x${outputSize.height} PNG`,
    );

    return pngBuffer;
  } catch (error) {
    logger.error(
      `[SVGRasterizer] Rasterization failed for ${panelType}:`,
      error.message,
    );
    throw error;
  }
}

/**
 * Rasterize SVG to PNG and return as data URL.
 *
 * @param {string|Buffer} svgInput - SVG string or buffer
 * @param {string} panelType - Panel type for size/padding lookup
 * @param {Object} options - Rasterization options
 * @returns {Promise<string>} PNG data URL
 */
export async function rasterizeSVGToDataURL(svgInput, panelType, options = {}) {
  const pngBuffer = await rasterizeSVGToPNG(svgInput, panelType, options);
  return `data:image/png;base64,${pngBuffer.toString("base64")}`;
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  // Constants
  PANEL_OUTPUT_SIZES,
  MIN_CONTENT_DIMENSIONS,
  PADDING_MARGINS,

  // Bounds calculation
  calculateSVGBounds,
  getPaddingForPanelType,
  getOutputSizeForPanelType,

  // Normalization
  normalizeSVGViewBox,
  validateSVGForRasterization,

  // Rasterization
  rasterizeSVGToPNG,
  rasterizeSVGToDataURL,
};
