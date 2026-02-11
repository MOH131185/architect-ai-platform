/**
 * AI Layout Validator
 *
 * Validates AI-generated floor plan layouts before feeding to BuildingModel.
 * Checks envelope bounds, room overlaps, minimum dimensions, and area tolerance.
 */

import logger from "../utils/logger.js";

/**
 * Check if two axis-aligned bounding boxes overlap
 * (with optional gap tolerance for partition walls)
 */
function boxesOverlap(a, b, tolerance = 0.05) {
  return (
    a.x + tolerance < b.x + b.width &&
    a.x + a.width > b.x + tolerance &&
    a.y + tolerance < b.y + b.depth &&
    a.y + a.depth > b.y + tolerance
  );
}

/**
 * Validate an AI-generated layout
 *
 * @param {Object} layout - The AI layout with levels[].rooms[]
 * @param {Object} constraints
 * @param {number} constraints.interiorWidth - Interior envelope width (m)
 * @param {number} constraints.interiorDepth - Interior envelope depth (m)
 * @param {number} constraints.levelCount - Expected number of levels
 * @param {Array} constraints.programSpaces - Original program spaces for area comparison
 * @returns {{ valid: boolean, errors: string[], warnings: string[], critical: boolean, fixedLayout: Object|null }}
 */
export function validateAILayout(layout, constraints) {
  const errors = [];
  const warnings = [];
  let critical = false;
  let needsFix = false;

  if (!layout || !layout.levels || !Array.isArray(layout.levels)) {
    return {
      valid: false,
      errors: ["Layout missing 'levels' array"],
      warnings: [],
      critical: true,
      fixedLayout: null,
    };
  }

  const { interiorWidth, interiorDepth, levelCount, programSpaces } =
    constraints;

  // Deep clone for potential auto-fix
  const fixedLayout = JSON.parse(JSON.stringify(layout));

  for (const level of fixedLayout.levels) {
    if (!level.rooms || !Array.isArray(level.rooms)) {
      errors.push(`Level ${level.index}: missing rooms array`);
      critical = true;
      continue;
    }

    for (const room of level.rooms) {
      // Check required fields
      if (
        typeof room.x !== "number" ||
        typeof room.y !== "number" ||
        typeof room.width !== "number" ||
        typeof room.depth !== "number"
      ) {
        errors.push(
          `Level ${level.index}, "${room.name}": missing coordinate fields`,
        );
        critical = true;
        continue;
      }

      // Check minimum dimensions
      const minDim = room.program === "wc" ? 0.9 : 1.5;
      if (room.width < minDim || room.depth < minDim) {
        warnings.push(
          `Level ${level.index}, "${room.name}": dimension ${room.width.toFixed(1)}×${room.depth.toFixed(1)}m below minimum ${minDim}m`,
        );
      }

      // Check envelope bounds — auto-clip if overflow < 0.2m
      const overflowX = room.x + room.width - interiorWidth;
      const overflowY = room.y + room.depth - interiorDepth;

      if (overflowX > 0) {
        if (overflowX <= 0.2) {
          room.width -= overflowX;
          needsFix = true;
          warnings.push(
            `Level ${level.index}, "${room.name}": auto-clipped ${overflowX.toFixed(2)}m X overflow`,
          );
        } else {
          errors.push(
            `Level ${level.index}, "${room.name}": exceeds envelope by ${overflowX.toFixed(2)}m in X`,
          );
        }
      }

      if (overflowY > 0) {
        if (overflowY <= 0.2) {
          room.depth -= overflowY;
          needsFix = true;
          warnings.push(
            `Level ${level.index}, "${room.name}": auto-clipped ${overflowY.toFixed(2)}m Y overflow`,
          );
        } else {
          errors.push(
            `Level ${level.index}, "${room.name}": exceeds envelope by ${overflowY.toFixed(2)}m in Y`,
          );
        }
      }

      if (room.x < -0.05) {
        errors.push(
          `Level ${level.index}, "${room.name}": negative X position (${room.x.toFixed(2)})`,
        );
      }
      if (room.y < -0.05) {
        errors.push(
          `Level ${level.index}, "${room.name}": negative Y position (${room.y.toFixed(2)})`,
        );
      }
    }

    // Check room overlaps within same level
    for (let i = 0; i < level.rooms.length; i++) {
      for (let j = i + 1; j < level.rooms.length; j++) {
        const a = level.rooms[i];
        const b = level.rooms[j];
        if (
          typeof a.x !== "number" ||
          typeof b.x !== "number" ||
          typeof a.width !== "number" ||
          typeof b.width !== "number"
        ) {
          continue;
        }
        if (boxesOverlap(a, b)) {
          errors.push(
            `Level ${level.index}: "${a.name}" overlaps with "${b.name}"`,
          );
        }
      }
    }
  }

  // Check area tolerance against program spaces
  if (programSpaces && programSpaces.length > 0) {
    for (const space of programSpaces) {
      const levelIdx = space.levelIndex || 0;
      const level = fixedLayout.levels.find((l) => l.index === levelIdx);
      if (!level) continue;

      const match = level.rooms?.find(
        (r) =>
          r.name?.toLowerCase() === space.name?.toLowerCase() ||
          r.program?.toLowerCase() === space.program?.toLowerCase(),
      );

      if (!match) {
        warnings.push(
          `"${space.name}" (level ${levelIdx}) not found in AI layout`,
        );
        continue;
      }

      if (typeof match.width === "number" && typeof match.depth === "number") {
        const actualArea = match.width * match.depth;
        const targetArea = space.targetAreaM2 || space.area || 15;
        const deviation = Math.abs(actualArea - targetArea) / targetArea;

        if (deviation > 0.3) {
          warnings.push(
            `"${space.name}": area ${actualArea.toFixed(1)}m² vs target ${targetArea.toFixed(1)}m² (${(deviation * 100).toFixed(0)}% deviation)`,
          );
        }
      }
    }
  }

  // Check staircase on multi-storey
  if ((levelCount || 2) > 1) {
    if (
      !layout.staircase &&
      !fixedLayout.levels.some((l) =>
        l.rooms?.some(
          (r) =>
            r.program === "staircase" ||
            r.name?.toLowerCase().includes("stair"),
        ),
      )
    ) {
      warnings.push("Multi-storey building has no staircase defined");
    }
  }

  const valid = errors.length === 0;

  if (errors.length > 0) {
    logger.warn(`AI Layout Validation: ${errors.length} error(s)`, errors);
  }
  if (warnings.length > 0) {
    logger.info(
      `AI Layout Validation: ${warnings.length} warning(s)`,
      warnings,
    );
  }

  return {
    valid,
    errors,
    warnings,
    critical,
    fixedLayout: needsFix ? fixedLayout : null,
  };
}

export default { validateAILayout };
