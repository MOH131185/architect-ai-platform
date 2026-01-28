/**
 * SVG Path Validator
 *
 * Validates and sanitizes SVG paths to prevent rendering errors.
 * Catches d="undefined" and other malformed path data.
 *
 * Based on SVG specification: https://www.w3.org/TR/SVG/paths.html
 * Path commands must start with M/m (moveto) command.
 */

import logger from "./logger.js";

/**
 * Valid SVG path command characters
 * M/m = moveto, L/l = lineto, H/h = horizontal, V/v = vertical
 * C/c = curveto, S/s = smooth curve, Q/q = quadratic, T/t = smooth quad
 * A/a = arc, Z/z = closepath
 */
const VALID_PATH_COMMANDS = /^[MmLlHhVvCcSsQqTtAaZz]/;

/**
 * Regex to validate path d attribute format
 * Must start with M or m (moveto command)
 */
const VALID_PATH_START = /^\s*[Mm]/;

/**
 * Regex to detect invalid/malformed paths
 */
const INVALID_PATH_PATTERNS = [
  /^undefined$/i,
  /^null$/i,
  /^NaN/i,
  /^\s*$/, // Empty or whitespace only
  /^[^Mm]/, // Doesn't start with M/m
];

/**
 * Validation result
 * @typedef {Object} PathValidationResult
 * @property {boolean} valid - Whether the path is valid
 * @property {string} d - The path data (original or sanitized)
 * @property {string[]} errors - List of validation errors
 * @property {boolean} wasSanitized - Whether the path was modified
 */

/**
 * Validate and sanitize an SVG path d attribute
 *
 * @param {string|undefined|null} d - Path data to validate
 * @param {Object} context - Context for error reporting
 * @param {string} context.panelType - Type of panel generating this path
 * @param {string} context.generator - Name of the generator function
 * @param {string} context.elementId - Optional element ID
 * @returns {PathValidationResult}
 */
export function validatePathD(d, context = {}) {
  const {
    panelType = "unknown",
    generator = "unknown",
    elementId = "",
  } = context;
  const errors = [];
  let wasSanitized = false;

  // Handle undefined/null
  if (d === undefined || d === null) {
    errors.push(`Path d attribute is ${d}`);
    logger.error("[SVG] Invalid path d attribute", {
      panelType,
      generator,
      elementId,
      issue: `d="${d}" (expected string starting with M/m)`,
    });

    return {
      valid: false,
      d: null,
      errors,
      wasSanitized: false,
      fallback: createFallbackRect(context),
    };
  }

  // Convert to string if needed
  const pathStr = String(d).trim();

  // Check against invalid patterns
  for (const pattern of INVALID_PATH_PATTERNS) {
    if (pattern.test(pathStr)) {
      errors.push(`Path matches invalid pattern: ${pattern.toString()}`);
    }
  }

  // Must start with M/m (moveto)
  if (!VALID_PATH_START.test(pathStr)) {
    errors.push(
      `Path must start with M or m command, got: "${pathStr.substring(0, 20)}..."`,
    );
    logger.error("[SVG] Path missing moveto command", {
      panelType,
      generator,
      elementId,
      pathPreview: pathStr.substring(0, 50),
    });
  }

  // Check for NaN values in coordinates
  if (/NaN/i.test(pathStr)) {
    errors.push("Path contains NaN values");
    logger.warn("[SVG] Path contains NaN values - sanitizing", {
      panelType,
      generator,
    });
  }

  // If errors found, return invalid result with fallback
  if (errors.length > 0) {
    return {
      valid: false,
      d: pathStr,
      errors,
      wasSanitized: false,
      fallback: createFallbackRect(context),
    };
  }

  return {
    valid: true,
    d: pathStr,
    errors: [],
    wasSanitized,
    fallback: null,
  };
}

/**
 * Create a fallback rectangle element when path is invalid
 * Better than rendering nothing or a broken path
 *
 * @param {Object} context - Context for fallback sizing
 * @returns {string} SVG rect element as fallback
 */
function createFallbackRect(context = {}) {
  const {
    width = 100,
    height = 100,
    x = 0,
    y = 0,
    fill = "#f0f0f0",
    stroke = "#ccc",
  } = context;

  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}" stroke="${stroke}" stroke-width="1" data-fallback="true" data-reason="invalid-path"/>`;
}

/**
 * Validate all paths in an SVG string
 * Returns the SVG with invalid paths either removed or replaced with fallbacks
 *
 * @param {string} svgString - Full SVG document string
 * @param {Object} options - Validation options
 * @param {string} options.panelType - Panel type for error context
 * @param {string} options.generator - Generator name for error context
 * @param {'remove'|'fallback'|'abort'} options.invalidPathAction - What to do with invalid paths
 * @returns {Object} Validation result with sanitized SVG
 */
export function validateSVG(svgString, options = {}) {
  const {
    panelType = "unknown",
    generator = "unknown",
    invalidPathAction = "fallback",
  } = options;

  const errors = [];
  const warnings = [];
  let sanitizedSVG = svgString;
  let invalidPathCount = 0;

  // Find all path elements with d attribute
  const pathRegex = /<path[^>]*\sd="([^"]*)"/g;
  let match;

  while ((match = pathRegex.exec(svgString)) !== null) {
    const fullMatch = match[0];
    const dValue = match[1];

    const validation = validatePathD(dValue, { panelType, generator });

    if (!validation.valid) {
      invalidPathCount++;
      errors.push({
        element: fullMatch.substring(0, 60),
        d: dValue?.substring(0, 30),
        issues: validation.errors,
      });

      switch (invalidPathAction) {
        case "remove":
          // Remove the invalid path element entirely
          sanitizedSVG = sanitizedSVG.replace(
            fullMatch,
            `<!-- REMOVED: Invalid path d="${dValue?.substring(0, 20)}..." -->`,
          );
          break;

        case "fallback":
          // Replace with a safe fallback rectangle
          sanitizedSVG = sanitizedSVG.replace(fullMatch, validation.fallback);
          break;

        case "abort":
          // Don't sanitize, will return error
          break;
      }
    }
  }

  // Check for empty d attributes (d="")
  const emptyDRegex = /<path[^>]*\sd=""\s*/g;
  while ((match = emptyDRegex.exec(svgString)) !== null) {
    invalidPathCount++;
    warnings.push(`Empty path d="" found`);

    if (invalidPathAction !== "abort") {
      sanitizedSVG = sanitizedSVG.replace(
        match[0],
        `<!-- REMOVED: Empty path -->`,
      );
    }
  }

  const result = {
    valid: invalidPathCount === 0,
    sanitizedSVG:
      invalidPathAction === "abort" && invalidPathCount > 0
        ? null
        : sanitizedSVG,
    originalSVG: svgString,
    invalidPathCount,
    errors,
    warnings,
    wasSanitized: sanitizedSVG !== svgString,
  };

  if (invalidPathCount > 0) {
    logger.error(
      `[SVG] Found ${invalidPathCount} invalid path(s) in ${panelType}`,
      {
        panelType,
        generator,
        action: invalidPathAction,
        errorCount: errors.length,
      },
    );
  }

  return result;
}

/**
 * Validate that an SVG string is well-formed and has required elements
 *
 * @param {string} svgString - SVG content to validate
 * @param {Object} requirements - Required elements/attributes
 * @returns {Object} Validation result
 */
export function validateSVGStructure(svgString, requirements = {}) {
  const errors = [];

  // Check for SVG root element
  if (!/<svg[^>]*>/i.test(svgString)) {
    errors.push("Missing <svg> root element");
  }

  // Check for closing tag
  if (!/<\/svg>/i.test(svgString)) {
    errors.push("Missing </svg> closing tag");
  }

  // Check for viewBox if required
  if (requirements.requireViewBox && !/viewBox=/i.test(svgString)) {
    errors.push("Missing viewBox attribute");
  }

  // Check for xmlns if required
  if (requirements.requireXmlns && !/xmlns=/i.test(svgString)) {
    errors.push("Missing xmlns attribute");
  }

  // Check for minimum content
  if (svgString.length < 50) {
    errors.push("SVG content too short - likely stub or empty");
  }

  // Check for stub content patterns
  const stubPatterns = [
    /<svg><\/svg>/i,
    /<svg[^>]*>\s*<\/svg>/i,
    /<svg[^>]*\/>/i,
  ];

  for (const pattern of stubPatterns) {
    if (pattern.test(svgString)) {
      errors.push("SVG appears to be a stub (empty content)");
      break;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    isStub: errors.some((e) => e.includes("stub")),
  };
}

/**
 * Sanitize coordinate values to prevent NaN and Infinity
 *
 * @param {number} value - Coordinate value
 * @param {number} fallback - Fallback value if invalid
 * @returns {number} Sanitized value
 */
export function sanitizeCoordinate(value, fallback = 0) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    logger.warn(
      `[SVG] Invalid coordinate ${value}, using fallback ${fallback}`,
    );
    return fallback;
  }
  return value;
}

/**
 * Build a safe SVG path string with validation
 * Use this instead of template strings to prevent d="undefined"
 *
 * @param {Array<{cmd: string, x?: number, y?: number, ...}>} commands - Path commands
 * @returns {string} Valid SVG path d attribute value
 */
export function buildSafePath(commands) {
  if (!Array.isArray(commands) || commands.length === 0) {
    logger.warn("[SVG] buildSafePath called with empty/invalid commands");
    return "M0,0";
  }

  const parts = [];
  let hasMoveto = false;

  for (const cmd of commands) {
    if (!cmd || typeof cmd.cmd !== "string") {
      continue;
    }

    const command = cmd.cmd.toUpperCase();

    switch (command) {
      case "M": // Moveto
        hasMoveto = true;
        parts.push(
          `M${sanitizeCoordinate(cmd.x)},${sanitizeCoordinate(cmd.y)}`,
        );
        break;

      case "L": // Lineto
        parts.push(
          `L${sanitizeCoordinate(cmd.x)},${sanitizeCoordinate(cmd.y)}`,
        );
        break;

      case "H": // Horizontal line
        parts.push(`H${sanitizeCoordinate(cmd.x)}`);
        break;

      case "V": // Vertical line
        parts.push(`V${sanitizeCoordinate(cmd.y)}`);
        break;

      case "C": // Cubic bezier
        parts.push(
          `C${sanitizeCoordinate(cmd.x1)},${sanitizeCoordinate(cmd.y1)} ${sanitizeCoordinate(cmd.x2)},${sanitizeCoordinate(cmd.y2)} ${sanitizeCoordinate(cmd.x)},${sanitizeCoordinate(cmd.y)}`,
        );
        break;

      case "Q": // Quadratic bezier
        parts.push(
          `Q${sanitizeCoordinate(cmd.x1)},${sanitizeCoordinate(cmd.y1)} ${sanitizeCoordinate(cmd.x)},${sanitizeCoordinate(cmd.y)}`,
        );
        break;

      case "A": // Arc
        parts.push(
          `A${sanitizeCoordinate(cmd.rx)},${sanitizeCoordinate(cmd.ry)} ${sanitizeCoordinate(cmd.rotation)} ${cmd.largeArc ? 1 : 0},${cmd.sweep ? 1 : 0} ${sanitizeCoordinate(cmd.x)},${sanitizeCoordinate(cmd.y)}`,
        );
        break;

      case "Z": // Closepath
        parts.push("Z");
        break;

      default:
        logger.warn(`[SVG] Unknown path command: ${command}`);
    }
  }

  // Ensure path starts with M
  if (!hasMoveto) {
    parts.unshift("M0,0");
    logger.warn("[SVG] Path missing M command, prepending M0,0");
  }

  return parts.join(" ");
}

export default {
  validatePathD,
  validateSVG,
  validateSVGStructure,
  sanitizeCoordinate,
  buildSafePath,
};
