/**
 * Projections2D - SVG Generation from BuildingModel
 *
 * Generates consistent 2D architectural drawings following UK conventions:
 * - Floor plans (one per level) with proper cut conventions
 * - Elevations (N, S, E, W)
 * - Sections (longitudinal, transverse) with level markers
 *
 * All drawings derive from the SAME BuildingModel for consistency.
 *
 * @module geometry/Projections2D
 */

import logger from "../utils/logger.js";

import {
  getStylePreset,
  generateSVGStyles,
  SYMBOL_SIZES,
  CONVENTIONS,
} from "./drawingStyles.js";

// =============================================================================
// CONSTANTS
// =============================================================================

/** Millimeters per meter */
const MM_PER_M = 1000;

/** Default SVG scale (pixels per meter) */
const DEFAULT_SCALE = 50;

// =============================================================================
// FLOOR PLAN PROJECTION
// =============================================================================

/**
 * Generate floor plan SVG from BuildingModel
 *
 * @param {BuildingModel} model - Building model
 * @param {number} floorIndex - Floor index (0 = ground)
 * @param {Object} options - Rendering options
 * @returns {string} SVG string
 */
export function projectFloorPlan(model, floorIndex = 0, options = {}) {
  const {
    scale = DEFAULT_SCALE,
    showDimensions = true,
    showRoomLabels = true,
    showFurniture = false,
    showWallHatch = true,
    width: svgWidth = 800,
    height: svgHeight = 600,
    theme = "technical",
  } = options;

  const floor = model.getFloor(floorIndex);
  if (!floor) {
    logger.warn(`[Projections2D] Floor ${floorIndex} not found`);
    return createEmptySVG(svgWidth, svgHeight, "Floor not found");
  }

  const style = getStylePreset(theme);
  const dims = model.getDimensionsMeters();
  const pxPerMM = scale / MM_PER_M;

  // Calculate view bounds
  const marginPx = 80;
  const contentWidth = dims.width * scale;
  const contentHeight = dims.depth * scale;

  // Adjust SVG size if needed
  const finalWidth = Math.max(svgWidth, contentWidth + 2 * marginPx);
  const finalHeight = Math.max(svgHeight, contentHeight + 2 * marginPx);

  // Center offset
  const offsetX = finalWidth / 2;
  const offsetY = finalHeight / 2;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${finalWidth} ${finalHeight}" width="${finalWidth}" height="${finalHeight}">`;

  // SVG Styles
  svg += `<style>${generateSVGStyles(style)}</style>`;

  // Defs for patterns
  svg += generateHatchPattern("wall-hatch", style, 45, 3);
  svg += generateHatchPattern("slab-hatch", style, 45, 6);

  // Title
  svg += `<text class="title" x="${finalWidth / 2}" y="30">${floor.name}</text>`;

  // Transform group for building coordinates (Y-flip for architectural convention)
  svg += `<g id="plan-content" transform="translate(${offsetX}, ${offsetY}) scale(1, -1)">`;

  // Draw room fills first (background)
  for (const room of floor.rooms) {
    const isCirculation =
      room.isCirculation ||
      room.name?.toLowerCase().includes("hall") ||
      room.name?.toLowerCase().includes("landing") ||
      room.name?.toLowerCase().includes("stair");

    const path = polygonToPath(room.polygon, pxPerMM);
    svg += `<path class="${isCirculation ? "circulation-fill" : "room-fill"}" d="${path}"/>`;
  }

  // Draw external walls (cut - heavy weight with poché)
  svg += drawExternalWalls(model, floor, pxPerMM, showWallHatch);

  // Draw internal walls (cut - medium weight)
  svg += drawInternalWalls(floor, pxPerMM);

  // Draw openings (windows and doors)
  svg += drawPlanOpenings(floor, pxPerMM, style);

  // Draw stairs if present
  if (model.stairs && model.stairs.length > 0) {
    svg += drawPlanStairs(model, floor, pxPerMM, style);
  }

  svg += "</g>"; // End transform group

  // Room labels (drawn right-side up, outside transform)
  if (showRoomLabels) {
    svg += '<g id="room-labels">';
    for (const room of floor.rooms) {
      const cx = offsetX + room.center.x * pxPerMM;
      const cy = offsetY - room.center.y * pxPerMM; // Flip Y

      svg += `<text class="room-label" x="${cx}" y="${cy - 6}">${room.name}</text>`;
      svg += `<text class="area-label" x="${cx}" y="${cy + 10}">${Math.round(room.areaM2)} m\u00B2</text>`;
    }
    svg += "</g>";
  }

  // Dimensions
  if (showDimensions) {
    svg += '<g id="dimensions">';
    svg += drawPlanDimensions(model, dims, offsetX, offsetY, scale);
    svg += "</g>";
  }

  // North arrow
  svg += drawNorthArrow(finalWidth - 50, 60);

  // Scale bar
  svg += drawScaleBar(finalWidth - 150, finalHeight - 40, scale);

  svg += "</svg>";

  logger.info(`[Projections2D] Floor plan generated`, {
    floor: floor.name,
    rooms: floor.rooms.length,
    svgSize: `${finalWidth}x${finalHeight}`,
  });

  return svg;
}

/**
 * Draw external walls with proper cut convention and poché
 */
function drawExternalWalls(model, floor, pxPerMM, showHatch) {
  let svg = '<g id="external-walls">';

  const footprint = model.envelope.footprint;
  const wallThickness = CONVENTIONS.wallThickness.external * pxPerMM;

  // Draw outer wall line (cut - heavy)
  const outerPath = polygonToPath(footprint, pxPerMM);
  svg += `<path class="wall-external-cut" d="${outerPath}" fill-rule="evenodd"/>`;

  // Draw inner wall line (create inset polygon)
  const inset = CONVENTIONS.wallThickness.external;
  const innerFootprint = insetPolygon(footprint, inset);
  const innerPath = polygonToPath(innerFootprint, pxPerMM);
  svg += `<path fill="none" stroke="${getStylePreset("technical").colors.stroke}" stroke-width="0.8" d="${innerPath}"/>`;

  // Add wall hatching (poché) if enabled
  if (showHatch) {
    svg += drawWallHatch(footprint, innerFootprint, pxPerMM);
  }

  svg += "</g>";
  return svg;
}

/**
 * Draw internal walls between all rooms with proper fill and stroke
 */
function drawInternalWalls(floor, pxPerMM) {
  let svg = '<g id="internal-walls">';

  const internalWalls = floor.walls.filter((w) => w.type === "internal");

  logger.debug("[Projections2D] Drawing internal walls", {
    count: internalWalls.length,
    walls: internalWalls.map((w) => w.connectsRooms || "unknown"),
  });

  for (const wall of internalWalls) {
    const x1 = wall.start.x * pxPerMM;
    const y1 = wall.start.y * pxPerMM;
    const x2 = wall.end.x * pxPerMM;
    const y2 = wall.end.y * pxPerMM;

    // Draw wall with proper thickness representation
    const thickness =
      (wall.thickness || CONVENTIONS.wallThickness.internal) * pxPerMM;

    // Calculate perpendicular offset for wall thickness
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);

    if (len < 1) {
      continue;
    } // Skip degenerate walls

    const nx = ((-dy / len) * thickness) / 2;
    const ny = ((dx / len) * thickness) / 2;

    // Draw filled wall polygon with stroke
    svg += `<path class="wall-internal-fill" d="M ${x1 + nx} ${y1 + ny} L ${x2 + nx} ${y2 + ny} L ${x2 - nx} ${y2 - ny} L ${x1 - nx} ${y1 - ny} Z"/>`;
  }

  svg += "</g>";
  return svg;
}

/**
 * Draw plan openings (windows and doors) with proper architectural symbols
 */
function drawPlanOpenings(floor, pxPerMM, style) {
  let svg = '<g id="openings">';

  for (const opening of floor.openings) {
    const wall = floor.walls.find((w) => w.id === opening.wallId);
    if (!wall) {
      continue;
    }

    // Calculate opening position on wall
    const wallDx = wall.end.x - wall.start.x;
    const wallDy = wall.end.y - wall.start.y;
    const wallLen = Math.sqrt(wallDx * wallDx + wallDy * wallDy);
    const ratio = opening.position / wallLen;

    const cx = (wall.start.x + wallDx * ratio) * pxPerMM;
    const cy = (wall.start.y + wallDy * ratio) * pxPerMM;
    const openingWidthPx = opening.width * pxPerMM;

    // Wall angle
    const wallAngle = (Math.atan2(wallDy, wallDx) * 180) / Math.PI;

    if (opening.type === "window") {
      // Draw window symbol (parallel lines with glazing bars)
      svg += drawWindowSymbol(
        cx,
        cy,
        openingWidthPx,
        wallAngle,
        wall.type === "external",
      );
    } else if (opening.type === "door") {
      // Draw door symbol (opening arc + door leaf)
      svg += drawDoorSymbol(
        cx,
        cy,
        openingWidthPx,
        wallAngle,
        opening.isEntrance,
        wall.type === "external",
      );
    }
  }

  svg += "</g>";
  return svg;
}

/**
 * Draw proper window symbol in plan
 */
function drawWindowSymbol(cx, cy, widthPx, angleDeg, isExternal) {
  const hw = widthPx / 2;
  const frameWidth = SYMBOL_SIZES.window.frameWidth * (widthPx / 1200); // Scale relative to typical window
  const sillDepth = SYMBOL_SIZES.window.sillDepth * (widthPx / 1200);

  let svg = `<g transform="translate(${cx}, ${cy}) rotate(${angleDeg})">`;

  // Window opening (break in wall)
  svg += `<rect class="door-opening" x="${-hw}" y="${-sillDepth / 2}" width="${widthPx}" height="${sillDepth}"/>`;

  // Window frame (outer rectangle)
  svg += `<rect class="window-frame" x="${-hw}" y="${-frameWidth}" width="${widthPx}" height="${frameWidth * 2}"/>`;

  // Glass pane
  svg += `<rect class="window" x="${-hw + frameWidth / 2}" y="${-frameWidth / 2}" width="${widthPx - frameWidth}" height="${frameWidth}"/>`;

  // Glazing bars (vertical center line)
  if (SYMBOL_SIZES.window.glazingBars) {
    svg += `<line class="window-glazing-bar" x1="0" y1="${-frameWidth}" x2="0" y2="${frameWidth}"/>`;
  }

  svg += "</g>";
  return svg;
}

/**
 * Draw proper door symbol in plan
 */
function drawDoorSymbol(cx, cy, widthPx, angleDeg, isEntrance, isExternal) {
  const hw = widthPx / 2;
  const doorThickness = SYMBOL_SIZES.door.leafThickness * (widthPx / 900); // Scale
  const swingRadius = widthPx * SYMBOL_SIZES.door.swingRadius;

  let svg = `<g transform="translate(${cx}, ${cy}) rotate(${angleDeg})">`;

  // Door opening (break in wall) - lighter fill
  const openingDepth = isExternal ? 15 : 8;
  svg += `<rect class="door-opening" x="${-hw}" y="${-openingDepth / 2}" width="${widthPx}" height="${openingDepth}"/>`;

  // Door frame (vertical lines at jambs)
  const frameWidth = SYMBOL_SIZES.door.frameWidth * (widthPx / 900);
  svg += `<line stroke="#333" stroke-width="1.5" x1="${-hw}" y1="${-openingDepth / 2}" x2="${-hw}" y2="${openingDepth / 2}"/>`;
  svg += `<line stroke="#333" stroke-width="1.5" x1="${hw}" y1="${-openingDepth / 2}" x2="${hw}" y2="${openingDepth / 2}"/>`;

  // Door leaf (rectangle showing door thickness)
  svg += `<rect class="door" x="${-hw}" y="0" width="${widthPx}" height="${doorThickness}"/>`;

  // Door swing arc (quarter circle)
  svg += `<path class="door-swing" d="M ${-hw} 0 A ${swingRadius} ${swingRadius} 0 0 1 ${-hw + swingRadius} ${swingRadius}"/>`;

  svg += "</g>";
  return svg;
}

/**
 * Draw stairs in plan view
 */
function drawPlanStairs(model, floor, pxPerMM, style) {
  if (!model.stairs || model.stairs.length === 0) {
    return "";
  }

  let svg = '<g id="stairs">';
  const stair = model.stairs[0];

  const stairWidthPx = (stair.width || 1000) * pxPerMM;
  const stairLengthPx = (stair.length || 3000) * pxPerMM;
  const stairX = stair.position ? stair.position.x * pxPerMM : 0;
  const stairY = stair.position ? stair.position.y * pxPerMM : 0;

  // Stair outline
  svg += `<rect class="stair-cut" x="${stairX - stairWidthPx / 2}" y="${stairY - stairLengthPx / 2}" width="${stairWidthPx}" height="${stairLengthPx}"/>`;

  // Draw treads
  const numTreads = 14; // Typical for ~2.8m floor height
  const treadDepth = stairLengthPx / numTreads;

  for (let t = 0; t <= numTreads; t++) {
    const treadY = stairY - stairLengthPx / 2 + t * treadDepth;
    svg += `<line stroke="#666" stroke-width="0.5" x1="${stairX - stairWidthPx / 2}" y1="${treadY}" x2="${stairX + stairWidthPx / 2}" y2="${treadY}"/>`;
  }

  // Direction arrow
  svg += `<path fill="#333" d="M ${stairX} ${stairY - stairLengthPx / 2 + 20} l -8 15 l 16 0 Z"/>`;

  // UP text
  svg += `<text transform="scale(1,-1)" x="${stairX}" y="${-stairY}" text-anchor="middle" font-family="Arial" font-size="8" fill="#333">UP</text>`;

  svg += "</g>";
  return svg;
}

/**
 * Draw plan dimensions
 */
function drawPlanDimensions(model, dims, offsetX, offsetY, scale) {
  let svg = "";

  // Overall width dimension (bottom)
  const dimY = offsetY + (dims.depth * scale) / 2 + 40;
  svg += drawDimension(
    offsetX - (dims.width * scale) / 2,
    dimY,
    offsetX + (dims.width * scale) / 2,
    dimY,
    `${dims.width.toFixed(2)} m`,
    false,
    "plan-dim-width",
  );

  // Overall depth dimension (left side)
  const dimX = offsetX - (dims.width * scale) / 2 - 40;
  svg += drawDimension(
    dimX,
    offsetY - (dims.depth * scale) / 2,
    dimX,
    offsetY + (dims.depth * scale) / 2,
    `${dims.depth.toFixed(2)} m`,
    true,
    "plan-dim-depth",
  );

  return svg;
}

// =============================================================================
// ELEVATION PROJECTION
// =============================================================================

/**
 * Generate elevation SVG from BuildingModel
 *
 * @param {BuildingModel} model - Building model
 * @param {string} orientation - 'N', 'S', 'E', 'W'
 * @param {Object} options - Rendering options
 * @returns {string} SVG string
 */
export function projectElevation(model, orientation = "S", options = {}) {
  const {
    scale = DEFAULT_SCALE,
    showDimensions = true,
    showGround = true,
    showRoof = true,
    showLevelMarkers = true,
    width: svgWidth = 800,
    height: svgHeight = 500,
    theme = "technical",
  } = options;

  const style = getStylePreset(theme);
  const dims = model.getDimensionsMeters();
  const pxPerMM = scale / MM_PER_M;

  // Determine elevation width based on orientation
  const isNS = orientation === "N" || orientation === "S";
  const elevationWidth = isNS ? dims.width : dims.depth;
  const elevationWidthMM = elevationWidth * MM_PER_M;

  // Calculate content size
  const marginPx = 80;
  const groundPx = 40;
  const contentWidth = elevationWidth * scale;
  const contentHeight = dims.ridgeHeight * scale;

  const finalWidth = Math.max(svgWidth, contentWidth + 2 * marginPx);
  const finalHeight = Math.max(
    svgHeight,
    contentHeight + groundPx + 2 * marginPx,
  );

  // Ground level Y position in SVG
  const groundY = finalHeight - marginPx - groundPx;
  const offsetX = finalWidth / 2;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${finalWidth} ${finalHeight}" width="${finalWidth}" height="${finalHeight}">`;
  svg += `<style>${generateSVGStyles(style)}</style>`;

  // Sky background
  svg += `<rect class="sky" x="0" y="0" width="${finalWidth}" height="${groundY}"/>`;

  // Ground
  if (showGround) {
    svg += `<rect class="ground" x="0" y="${groundY}" width="${finalWidth}" height="${groundPx + marginPx}"/>`;
    svg += `<line class="ground-line" x1="0" y1="${groundY}" x2="${finalWidth}" y2="${groundY}"/>`;
  }

  // Title
  const orientationNames = { N: "North", S: "South", E: "East", W: "West" };
  svg += `<text class="title" x="${finalWidth / 2}" y="30">${orientationNames[orientation]} Elevation</text>`;

  // Building wall
  const wallLeft = offsetX - (elevationWidthMM / 2) * pxPerMM;
  const wallRight = offsetX + (elevationWidthMM / 2) * pxPerMM;
  const wallTop = groundY - model.envelope.height * pxPerMM;

  svg += `<rect class="wall-external-cut" x="${wallLeft}" y="${wallTop}" width="${elevationWidthMM * pxPerMM}" height="${model.envelope.height * pxPerMM}"/>`;

  // Roof
  if (showRoof) {
    svg += drawElevationRoof(model, orientation, offsetX, groundY, pxPerMM);
  }

  // Openings
  svg += drawElevationOpenings(
    model,
    orientation,
    offsetX,
    groundY,
    pxPerMM,
    isNS,
  );

  // Level markers
  if (showLevelMarkers) {
    svg += '<g id="level-markers">';
    svg += drawLevelMarkers(model, wallLeft, wallRight, groundY, pxPerMM);
    svg += "</g>";
  }

  // Dimensions
  if (showDimensions) {
    svg += '<g id="elevation-dimensions">';

    // Total height
    svg += drawDimension(
      wallRight + 40,
      groundY,
      wallRight + 40,
      wallTop,
      `${(model.envelope.height / MM_PER_M).toFixed(2)} m`,
      true,
      "elev-dim-height",
    );

    // Width
    svg += drawDimension(
      wallLeft,
      groundY + 30,
      wallRight,
      groundY + 30,
      `${elevationWidth.toFixed(2)} m`,
      false,
      "elev-dim-width",
    );

    svg += "</g>";
  }

  svg += "</svg>";

  logger.info(`[Projections2D] Elevation generated`, {
    orientation,
    openings: model.getOpeningsForFacade(orientation).length,
    svgSize: `${finalWidth}x${finalHeight}`,
  });

  return svg;
}

/**
 * Draw elevation roof
 */
function drawElevationRoof(model, orientation, offsetX, groundY, pxPerMM) {
  const roofProfile = model.getRoofProfile(orientation);
  if (!roofProfile || roofProfile.length === 0) {
    return "";
  }

  let roofPath = "M ";
  for (let i = 0; i < roofProfile.length; i++) {
    const pt = roofProfile[i];
    const x = offsetX + pt.x * pxPerMM;
    const y = groundY - pt.z * pxPerMM;
    roofPath += `${x} ${y}`;
    if (i < roofProfile.length - 1) {
      roofPath += " L ";
    }
  }
  roofPath += " Z";

  return `<path class="roof" d="${roofPath}"/>`;
}

/**
 * Draw elevation openings
 * TASK 2: Fixed position handling - supports both object {x, z} and number formats
 */
function drawElevationOpenings(
  model,
  orientation,
  offsetX,
  groundY,
  pxPerMM,
  isNS,
) {
  let svg = '<g id="elevation-openings">';

  const facadeOpenings = model.getOpeningsForFacade(orientation);

  // DEBUG: Log facade openings count
  if (facadeOpenings.length === 0) {
    logger.debug(`[Projections2D] No openings found for facade ${orientation}`);
  }

  for (const opening of facadeOpenings) {
    const floor = model.getFloor(opening.floorIndex);
    const wall = floor?.walls.find((w) => w.id === opening.wallId);

    // TASK 2: Enhanced wall lookup - try by facade if wallId doesn't match
    let targetWall = wall;
    if (!targetWall && floor) {
      // Fallback: find any external wall on this facade
      targetWall = floor.walls.find(
        (w) => w.facade === orientation && w.type === "external",
      );
    }

    // Calculate position along the facade
    let posAlongFacade;

    if (targetWall) {
      const wallDx = targetWall.end.x - targetWall.start.x;
      const wallDy = targetWall.end.y - targetWall.start.y;
      const wallLen = Math.sqrt(wallDx * wallDx + wallDy * wallDy);

      // TASK 2: Handle both position formats
      // - object format: { x: normalized 0-1, z: normalized 0-1 }
      // - number format: distance in mm along wall
      // - positionMM: raw position in mm
      let ratio;
      if (
        typeof opening.position === "object" &&
        opening.position?.x !== undefined
      ) {
        // Object format with normalized x (0-1)
        ratio = opening.position.x;
      } else if (typeof opening.positionMM === "number") {
        // Raw position in mm
        ratio = opening.positionMM / wallLen;
      } else if (typeof opening.position === "number") {
        // Direct position (could be mm or normalized)
        ratio =
          opening.position > 1 ? opening.position / wallLen : opening.position;
      } else {
        // Default to center
        ratio = 0.5;
      }

      // Clamp ratio to valid range
      ratio = Math.max(0.05, Math.min(0.95, ratio));

      // For elevation, X position is along the facade
      posAlongFacade = isNS
        ? targetWall.start.x + wallDx * ratio
        : targetWall.start.y + wallDy * ratio;
    } else {
      // No wall found - use opening's direct x coordinate as fallback
      posAlongFacade = opening.x || opening.position?.x || 0;
    }

    const cx = offsetX + posAlongFacade * pxPerMM;

    // TASK 2: Handle both width/height formats (mm vs meters)
    const openingWidth = opening.widthMM || opening.width || 1200;
    const openingHeight = opening.heightMM || opening.height || 1400;
    const openingWidthPx = openingWidth * pxPerMM;
    const openingHeightPx = openingHeight * pxPerMM;

    const sillHeight = opening.sillHeight || 0;
    const baseY =
      groundY - (opening.zBase || 0) * pxPerMM - sillHeight * pxPerMM;

    if (opening.type === "window") {
      svg += drawElevationWindow(cx, baseY, openingWidthPx, openingHeightPx);
    } else if (opening.type === "door") {
      const doorY = groundY - opening.zBase * pxPerMM;
      svg += drawElevationDoor(
        cx,
        doorY,
        openingWidthPx,
        opening.height * pxPerMM,
        opening.isEntrance,
      );
    }
  }

  svg += "</g>";
  return svg;
}

/**
 * Draw window in elevation
 */
function drawElevationWindow(cx, bottomY, width, height) {
  const x = cx - width / 2;
  const y = bottomY - height;
  const hw = width / 2;
  const hh = height / 2;

  let svg = `<rect class="window" x="${x}" y="${y}" width="${width}" height="${height}"/>`;

  // Glazing bars (cross pattern)
  svg += `<line class="window-glazing-bar" x1="${cx}" y1="${y}" x2="${cx}" y2="${y + height}"/>`;
  svg += `<line class="window-glazing-bar" x1="${x}" y1="${y + hh}" x2="${x + width}" y2="${y + hh}"/>`;

  // Window sill
  svg += `<line stroke="#333" stroke-width="2" x1="${x - 5}" y1="${bottomY}" x2="${x + width + 5}" y2="${bottomY}"/>`;

  return svg;
}

/**
 * Draw door in elevation
 */
function drawElevationDoor(cx, bottomY, width, height, isEntrance) {
  const x = cx - width / 2;
  const y = bottomY - height;

  let svg = `<rect class="door" x="${x}" y="${y}" width="${width}" height="${height}"/>`;

  // Door handle (small circle)
  const handleX = x + width * 0.85;
  const handleY = y + height * 0.55;
  svg += `<circle cx="${handleX}" cy="${handleY}" r="4" fill="#5D3A1A"/>`;

  // Door panel detail
  svg += `<rect fill="none" stroke="#5D3A1A" stroke-width="1" x="${x + width * 0.1}" y="${y + height * 0.1}" width="${width * 0.3}" height="${height * 0.35}"/>`;
  svg += `<rect fill="none" stroke="#5D3A1A" stroke-width="1" x="${x + width * 0.1}" y="${y + height * 0.55}" width="${width * 0.3}" height="${height * 0.35}"/>`;

  return svg;
}

/**
 * Draw level markers on elevation
 */
function drawLevelMarkers(model, wallLeft, wallRight, groundY, pxPerMM) {
  let svg = "";
  const markerX = wallLeft - 50;

  // Ground level marker
  svg += drawLevelMarker(markerX, groundY, "\u00B10.00", "ground-level");

  // Floor level markers
  for (const floor of model.floors) {
    const y = groundY - floor.zTop * pxPerMM;
    const heightM = (floor.zTop / MM_PER_M).toFixed(2);
    svg += drawLevelMarker(
      markerX,
      y,
      `+${heightM}`,
      `floor-${floor.index}-level`,
    );

    // Dashed line across elevation
    svg += `<line class="level-marker-dashed" x1="${wallLeft}" y1="${y}" x2="${wallRight}" y2="${y}"/>`;
  }

  // Ridge height marker
  if (model.roof) {
    const ridgeY = groundY - model.roof.ridgeHeight * pxPerMM;
    const ridgeHeightM = (model.roof.ridgeHeight / MM_PER_M).toFixed(2);
    svg += drawLevelMarker(
      markerX,
      ridgeY,
      `+${ridgeHeightM}`,
      "ridge-level",
      true,
    );
  }

  return svg;
}

// =============================================================================
// SECTION PROJECTION
// =============================================================================

/**
 * Generate section SVG from BuildingModel
 *
 * @param {BuildingModel} model - Building model
 * @param {string} sectionType - 'longitudinal' or 'transverse'
 * @param {Object} options - Rendering options
 * @returns {string} SVG string
 */
export function projectSection(
  model,
  sectionType = "longitudinal",
  options = {},
) {
  const {
    scale = DEFAULT_SCALE,
    showDimensions = true,
    showRoomLabels = true,
    showFoundation = true,
    showLevelMarkers = true,
    width: svgWidth = 800,
    height: svgHeight = 500,
    theme = "technical",
  } = options;

  const style = getStylePreset(theme);
  const dims = model.getDimensionsMeters();
  const pxPerMM = scale / MM_PER_M;

  // Section direction
  const isLongitudinal = sectionType === "longitudinal";
  const sectionWidth = isLongitudinal ? dims.width : dims.depth;
  const sectionWidthMM = sectionWidth * MM_PER_M;

  // Calculate content size
  const marginPx = 100;
  const groundPx = 40;
  const foundationPx = showFoundation ? 50 : 0;
  const contentWidth = sectionWidth * scale;
  const contentHeight = dims.ridgeHeight * scale;

  const finalWidth = Math.max(svgWidth, contentWidth + 2 * marginPx);
  const finalHeight = Math.max(
    svgHeight,
    contentHeight + groundPx + foundationPx + 2 * marginPx,
  );

  const groundY = finalHeight - marginPx - groundPx - foundationPx;
  const offsetX = finalWidth / 2;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${finalWidth} ${finalHeight}" width="${finalWidth}" height="${finalHeight}">`;
  svg += `<style>${generateSVGStyles(style)}</style>`;
  svg += generateHatchPattern("wall-hatch", style, 45, 3);
  svg += generateHatchPattern("slab-hatch", style, 45, 6);

  // Ground line and fill
  svg += `<rect class="ground" x="0" y="${groundY}" width="${finalWidth}" height="${groundPx + foundationPx + marginPx}"/>`;
  svg += `<line class="ground-line" x1="0" y1="${groundY}" x2="${finalWidth}" y2="${groundY}"/>`;

  // Title
  const sectionLabel =
    sectionType === "longitudinal" ? "Section A-A" : "Section B-B";
  svg += `<text class="title" x="${finalWidth / 2}" y="30">${sectionLabel}</text>`;

  const buildingLeft = offsetX - (sectionWidthMM / 2) * pxPerMM;
  const buildingRight = offsetX + (sectionWidthMM / 2) * pxPerMM;

  // Foundation
  if (showFoundation) {
    svg += drawSectionFoundation(
      buildingLeft,
      buildingRight,
      groundY,
      sectionWidthMM,
      pxPerMM,
      style,
    );
  }

  // Floor slabs and room spaces
  svg += '<g id="section-floors">';
  for (const floor of model.floors) {
    svg += drawSectionFloor(
      model,
      floor,
      buildingLeft,
      buildingRight,
      groundY,
      sectionWidthMM,
      pxPerMM,
      isLongitudinal,
      showRoomLabels,
      offsetX,
    );
  }
  svg += "</g>";

  // Cut walls (at section line) with poché
  svg += drawSectionCutWalls(
    buildingLeft,
    buildingRight,
    groundY,
    model.envelope.height,
    pxPerMM,
    style,
  );

  // Stairs
  if (model.stairs && model.stairs.length > 0 && model.floors.length > 1) {
    svg += drawSectionStairs(model, groundY, offsetX, pxPerMM, isLongitudinal);
  }

  // Level markers
  if (showLevelMarkers) {
    svg += '<g id="section-level-markers">';
    svg += drawSectionLevelMarkers(model, buildingLeft, groundY, pxPerMM);
    svg += "</g>";
  }

  // Roof
  svg += drawSectionRoof(model, offsetX, groundY, pxPerMM, isLongitudinal);

  // Dimensions
  if (showDimensions) {
    svg += '<g id="section-dimensions">';
    // Total height to ridge
    const topOfBuilding = groundY - model.roof.ridgeHeight * pxPerMM;
    svg += drawDimension(
      buildingRight + 60,
      groundY,
      buildingRight + 60,
      topOfBuilding,
      `${(model.roof.ridgeHeight / MM_PER_M).toFixed(2)} m`,
      true,
      "section-dim-total-height",
    );
    svg += "</g>";
  }

  svg += "</svg>";

  logger.info(`[Projections2D] Section generated`, {
    type: sectionType,
    floors: model.floors.length,
    hasLevelMarkers: showLevelMarkers,
    svgSize: `${finalWidth}x${finalHeight}`,
  });

  return svg;
}

/**
 * Draw section foundation
 */
function drawSectionFoundation(
  buildingLeft,
  buildingRight,
  groundY,
  sectionWidthMM,
  pxPerMM,
  style,
) {
  const foundationDepth = CONVENTIONS.foundationDepth * pxPerMM;
  const foundationH = foundationDepth;

  let svg = '<g id="foundation">';
  svg += `<rect class="foundation" x="${buildingLeft - 10}" y="${groundY}" width="${sectionWidthMM * pxPerMM + 20}" height="${foundationH}"/>`;

  // Foundation hatch
  const hatchSpacing = 8;
  for (let i = 0; i < sectionWidthMM * pxPerMM; i += hatchSpacing) {
    svg += `<line class="hatch" x1="${buildingLeft + i}" y1="${groundY}" x2="${buildingLeft + i + 12}" y2="${groundY + foundationH}"/>`;
  }

  svg += "</g>";
  return svg;
}

/**
 * Draw section floor with slab
 */
function drawSectionFloor(
  model,
  floor,
  buildingLeft,
  buildingRight,
  groundY,
  sectionWidthMM,
  pxPerMM,
  isLongitudinal,
  showRoomLabels,
  offsetX,
) {
  let svg = "";

  const floorY = groundY - floor.zBase * pxPerMM;
  const floorTop = groundY - floor.zTop * pxPerMM;
  const slabThickness = floor.slab.thickness * pxPerMM;

  // Room space (light fill)
  svg += `<rect class="room-fill" x="${buildingLeft}" y="${floorTop}" width="${sectionWidthMM * pxPerMM}" height="${floor.floorHeight * pxPerMM - slabThickness}"/>`;

  // Floor slab
  svg += `<rect class="slab-cut" x="${buildingLeft}" y="${floorY - slabThickness}" width="${sectionWidthMM * pxPerMM}" height="${slabThickness}"/>`;

  // Slab hatch
  const hatchSpacing = 6;
  for (let i = 0; i < sectionWidthMM * pxPerMM; i += hatchSpacing) {
    svg += `<line class="hatch-slab" x1="${buildingLeft + i}" y1="${floorY - slabThickness}" x2="${buildingLeft + i + 8}" y2="${floorY}"/>`;
  }

  // Room labels
  if (showRoomLabels) {
    for (const room of floor.rooms) {
      const cutPos = isLongitudinal ? room.center.y : room.center.x;
      const halfRoomSize =
        Math.min(
          room.boundingBox.maxX - room.boundingBox.minX,
          room.boundingBox.maxY - room.boundingBox.minY,
        ) / 2;

      if (Math.abs(cutPos) < halfRoomSize * 2) {
        const roomX = isLongitudinal
          ? offsetX + room.center.x * pxPerMM
          : offsetX + room.center.y * pxPerMM;
        const roomY = floorY - (floor.floorHeight * pxPerMM) / 2;

        svg += `<text class="room-label" x="${roomX}" y="${roomY}">${room.name}</text>`;
      }
    }
  }

  return svg;
}

/**
 * Draw section cut walls with poché hatching
 */
function drawSectionCutWalls(
  buildingLeft,
  buildingRight,
  groundY,
  buildingHeight,
  pxPerMM,
  style,
) {
  let svg = '<g id="cut-walls">';

  const wallThicknessPx = CONVENTIONS.wallThickness.external * pxPerMM;
  const wallTop = groundY - buildingHeight * pxPerMM;

  // Left cut wall
  svg += `<rect class="wall-external-cut" x="${buildingLeft - wallThicknessPx}" y="${wallTop}" width="${wallThicknessPx}" height="${buildingHeight * pxPerMM}"/>`;

  // Right cut wall
  svg += `<rect class="wall-external-cut" x="${buildingRight}" y="${wallTop}" width="${wallThicknessPx}" height="${buildingHeight * pxPerMM}"/>`;

  // Poché hatching
  const hatchSpacing = 4;
  for (let i = 0; i < buildingHeight * pxPerMM; i += hatchSpacing) {
    // Left wall
    svg += `<line class="hatch" x1="${buildingLeft - wallThicknessPx}" y1="${groundY - i}" x2="${buildingLeft}" y2="${groundY - i - 6}"/>`;
    // Right wall
    svg += `<line class="hatch" x1="${buildingRight}" y1="${groundY - i}" x2="${buildingRight + wallThicknessPx}" y2="${groundY - i - 6}"/>`;
  }

  svg += "</g>";
  return svg;
}

/**
 * Draw section stairs
 */
function drawSectionStairs(model, groundY, offsetX, pxPerMM, isLongitudinal) {
  let svg = '<g id="section-stairs">';

  const stair = model.stairs[0];
  const stairWidthPx = (stair.width || 1000) * pxPerMM;
  const stairLengthPx = (stair.length || 3000) * pxPerMM;

  const stairX = stair.position
    ? offsetX +
      (isLongitudinal ? stair.position.x : stair.position.y) * pxPerMM -
      stairWidthPx / 2
    : offsetX - stairWidthPx / 2;

  // Draw stair treads connecting floors
  for (let floorIdx = 0; floorIdx < model.floors.length - 1; floorIdx++) {
    const lowerFloor = model.floors[floorIdx];
    const upperFloor = model.floors[floorIdx + 1];

    const stairBottomY = groundY - lowerFloor.zTop * pxPerMM;
    const stairTopY = groundY - upperFloor.zBase * pxPerMM;
    const stairRisePx = stairBottomY - stairTopY;
    const numTreads = Math.round(stairRisePx / (200 * pxPerMM));

    // Draw individual treads
    for (let t = 0; t <= numTreads; t++) {
      const treadY = stairBottomY - (t / numTreads) * stairRisePx;
      const treadX1 = stairX + (t / numTreads) * stairLengthPx;
      const treadX2 = stairX + ((t + 1) / numTreads) * stairLengthPx;

      // Horizontal tread
      svg += `<line stroke="#666" stroke-width="1" x1="${treadX1}" y1="${treadY}" x2="${Math.min(treadX2, stairX + stairLengthPx)}" y2="${treadY}"/>`;

      // Vertical riser
      if (t < numTreads) {
        const nextTreadY = stairBottomY - ((t + 1) / numTreads) * stairRisePx;
        svg += `<line stroke="#666" stroke-width="1" x1="${treadX2}" y1="${treadY}" x2="${treadX2}" y2="${nextTreadY}"/>`;
      }
    }

    // Stair outline
    svg += `<path stroke="#333" stroke-width="1.5" fill="none" d="M ${stairX} ${stairBottomY} L ${stairX + stairLengthPx} ${stairTopY} L ${stairX + stairLengthPx} ${stairBottomY} Z"/>`;
  }

  // Stair label
  const stairLabelY = groundY - (model.floors[0].floorHeight * pxPerMM) / 2;
  svg += `<text class="room-label" x="${stairX + stairLengthPx / 2}" y="${stairLabelY}">STAIR</text>`;

  svg += "</g>";
  return svg;
}

/**
 * Draw section level markers
 */
function drawSectionLevelMarkers(model, buildingLeft, groundY, pxPerMM) {
  let svg = "";
  const markerX = buildingLeft - 80;

  // Vertical datum line
  svg += `<line stroke="#333" stroke-width="1" x1="${markerX}" y1="${groundY + 20}" x2="${markerX}" y2="${groundY - model.envelope.height * pxPerMM - 50}"/>`;

  // Ground level marker
  svg += drawLevelMarker(
    markerX,
    groundY,
    "\u00B10.00",
    "section-ground-level",
  );

  // Floor level markers
  for (let i = 0; i < model.floors.length; i++) {
    const floor = model.floors[i];

    // Floor top level
    const topY = groundY - floor.zTop * pxPerMM;
    const topHeightM = (floor.zTop / MM_PER_M).toFixed(2);
    svg += drawLevelMarker(
      markerX,
      topY,
      `+${topHeightM}`,
      `section-floor-${i}-level`,
    );
  }

  // Ridge height marker
  if (model.roof) {
    const ridgeY = groundY - model.roof.ridgeHeight * pxPerMM;
    const ridgeHeightM = (model.roof.ridgeHeight / MM_PER_M).toFixed(2);
    svg += drawLevelMarker(
      markerX,
      ridgeY,
      `+${ridgeHeightM}`,
      "section-ridge-level",
      true,
    );
  }

  return svg;
}

/**
 * Draw section roof
 */
function drawSectionRoof(model, offsetX, groundY, pxPerMM, isLongitudinal) {
  const roofProfile = model.getRoofProfile(isLongitudinal ? "N" : "E");
  if (!roofProfile || roofProfile.length === 0) {
    return "";
  }

  let roofPath = "M ";
  for (let i = 0; i < roofProfile.length; i++) {
    const pt = roofProfile[i];
    const x = offsetX + pt.x * pxPerMM;
    const y = groundY - pt.z * pxPerMM;
    roofPath += `${x} ${y}`;
    if (i < roofProfile.length - 1) {
      roofPath += " L ";
    }
  }
  roofPath += " Z";

  return `<path class="roof" d="${roofPath}"/>`;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Convert polygon to SVG path
 */
function polygonToPath(polygon, pxPerMM) {
  if (!polygon || polygon.length === 0) {
    return "";
  }
  const points = polygon.map(
    (p) => `${(p.x * pxPerMM).toFixed(2)},${(p.y * pxPerMM).toFixed(2)}`,
  );
  return `M ${points.join(" L ")} Z`;
}

/**
 * Create inset polygon (for wall thickness)
 */
function insetPolygon(polygon, insetMM) {
  if (!polygon || polygon.length < 3) {
    return polygon;
  }

  // Simple inset - shrink each point towards center
  const centerX = polygon.reduce((sum, p) => sum + p.x, 0) / polygon.length;
  const centerY = polygon.reduce((sum, p) => sum + p.y, 0) / polygon.length;

  return polygon.map((p) => {
    const dx = p.x - centerX;
    const dy = p.y - centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const scale = Math.max(0, (dist - insetMM) / dist);
    return {
      x: centerX + dx * scale,
      y: centerY + dy * scale,
    };
  });
}

/**
 * Draw wall hatch pattern (poché)
 */
function drawWallHatch(outerPolygon, innerPolygon, pxPerMM) {
  // For simplicity, draw diagonal lines in the wall thickness zone
  // This is a basic implementation - could be enhanced with proper clipping

  let svg = '<g class="wall-poche">';

  // Get bounding box
  const minX = Math.min(...outerPolygon.map((p) => p.x));
  const maxX = Math.max(...outerPolygon.map((p) => p.x));
  const minY = Math.min(...outerPolygon.map((p) => p.y));
  const maxY = Math.max(...outerPolygon.map((p) => p.y));

  const spacing = (3 / pxPerMM) * MM_PER_M; // 3mm spacing at scale

  // Draw diagonal lines
  for (let x = minX; x < maxX; x += spacing) {
    svg += `<line class="hatch" x1="${x * pxPerMM}" y1="${minY * pxPerMM}" x2="${(x + spacing * 2) * pxPerMM}" y2="${maxY * pxPerMM}"/>`;
  }

  svg += "</g>";
  return svg;
}

/**
 * Generate SVG hatch pattern definition
 */
function generateHatchPattern(id, style, angle, spacing) {
  return `
  <defs>
    <pattern id="${id}" patternUnits="userSpaceOnUse" width="${spacing * 2}" height="${spacing * 2}" patternTransform="rotate(${angle})">
      <line x1="0" y1="0" x2="0" y2="${spacing * 2}" stroke="${style.colors.wallHatch}" stroke-width="0.5"/>
    </pattern>
  </defs>
  `;
}

/**
 * Draw dimension line with text
 */
function drawDimension(x1, y1, x2, y2, text, vertical = false, id = "") {
  const tickSize = SYMBOL_SIZES.dimension.tickLength;
  let svg = `<g class="dimension" ${id ? `id="${id}"` : ""}>`;

  if (vertical) {
    svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
    svg += `<line x1="${x1 - tickSize}" y1="${y1}" x2="${x1 + tickSize}" y2="${y1}"/>`;
    svg += `<line x1="${x1 - tickSize}" y1="${y2}" x2="${x1 + tickSize}" y2="${y2}"/>`;
    const midY = (y1 + y2) / 2;
    svg += `<text class="dimension-text" x="${x1 + 15}" y="${midY}" transform="rotate(-90, ${x1 + 15}, ${midY})">${text}</text>`;
  } else {
    svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
    svg += `<line x1="${x1}" y1="${y1 - tickSize}" x2="${x1}" y2="${y1 + tickSize}"/>`;
    svg += `<line x1="${x2}" y1="${y1 - tickSize}" x2="${x2}" y2="${y1 + tickSize}"/>`;
    const midX = (x1 + x2) / 2;
    svg += `<text class="dimension-text" x="${midX}" y="${y1 - 8}">${text}</text>`;
  }

  svg += "</g>";
  return svg;
}

/**
 * Draw level marker with triangle and text
 */
function drawLevelMarker(x, y, text, id = "", isDashed = false) {
  const { triangleSize, lineLength, textOffset } = SYMBOL_SIZES.levelMarker;

  let svg = `<g ${id ? `id="${id}"` : ""}>`;

  // Triangle marker
  svg += `<polygon fill="#333" points="${x},${y} ${x - triangleSize},${y + triangleSize / 2} ${x - triangleSize},${y - triangleSize / 2}"/>`;

  // Horizontal line
  svg += `<line class="${isDashed ? "level-marker-dashed" : "level-marker"}" x1="${x - triangleSize}" y1="${y}" x2="${x - triangleSize - lineLength}" y2="${y}"/>`;

  // Text
  svg += `<text class="level-text" x="${x - triangleSize - lineLength - textOffset}" y="${y + 4}" text-anchor="end">${text}</text>`;

  svg += "</g>";
  return svg;
}

/**
 * Draw north arrow
 */
function drawNorthArrow(x, y) {
  const { radius, arrowSize } = SYMBOL_SIZES.northArrow;
  return `
    <g transform="translate(${x}, ${y})">
      <circle cx="0" cy="0" r="${radius}" fill="none" stroke="#333" stroke-width="1"/>
      <polygon points="0,-${arrowSize} -4,4 0,0 4,4" fill="#333"/>
      <text x="0" y="-${radius + 5}" text-anchor="middle" font-family="Arial" font-size="10" fill="#333">N</text>
    </g>
  `;
}

/**
 * Draw scale bar
 */
function drawScaleBar(x, y, scale) {
  const meterPx = scale;
  const { height, tickHeight } = SYMBOL_SIZES.scaleBar;

  return `
    <g transform="translate(${x}, ${y})">
      <rect x="0" y="-${height / 2}" width="${meterPx}" height="${height}" fill="#333"/>
      <line x1="0" y1="${-tickHeight}" x2="0" y2="${tickHeight}" stroke="#333" stroke-width="1"/>
      <line x1="${meterPx}" y1="${-tickHeight}" x2="${meterPx}" y2="${tickHeight}" stroke="#333" stroke-width="1"/>
      <text x="0" y="${tickHeight + 12}" text-anchor="start" font-family="Arial" font-size="9" fill="#333">0</text>
      <text x="${meterPx}" y="${tickHeight + 12}" text-anchor="end" font-family="Arial" font-size="9" fill="#333">1 m</text>
    </g>
  `;
}

/**
 * Create empty SVG with error message
 */
function createEmptySVG(width, height, message) {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
      <rect width="${width}" height="${height}" fill="#f0f0f0"/>
      <text x="${width / 2}" y="${height / 2}" text-anchor="middle" font-family="Arial" font-size="14" fill="#999">${message}</text>
    </svg>
  `;
}

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Generate all floor plans
 */
export function projectAllFloorPlans(model, options = {}) {
  const plans = {};
  for (let i = 0; i < model.floors.length; i++) {
    const floor = model.floors[i];
    // Use A1-compatible naming: floor_plan_ground, floor_plan_first, floor_plan_level2
    let key;
    let legacyKey;
    if (i === 0) {
      key = "floor_plan_ground";
      legacyKey = "ground_floor";
    } else if (i === 1) {
      key = "floor_plan_first";
      legacyKey = "first_floor";
    } else if (i === 2) {
      key = "floor_plan_level2";
      legacyKey = "second_floor";
    } else if (i === 3) {
      key = "floor_plan_level3";
      legacyKey = "third_floor";
    } else {
      key = `floor_plan_level${i}`;
      legacyKey = `floor_${i}`;
    }

    const svg = projectFloorPlan(model, i, options);
    plans[key] = svg;
    if (legacyKey) {
      plans[legacyKey] = svg;
    }
    logger.debug(`[Projections2D] Generated ${key}`, {
      floorIndex: i,
      roomCount: floor.rooms?.length || 0,
    });
  }
  return plans;
}

/**
 * Generate all elevations
 */
export function projectAllElevations(model, options = {}) {
  return {
    north: projectElevation(model, "N", options),
    south: projectElevation(model, "S", options),
    east: projectElevation(model, "E", options),
    west: projectElevation(model, "W", options),
  };
}

/**
 * Generate all sections
 */
export function projectAllSections(model, options = {}) {
  return {
    section_a_a: projectSection(model, "longitudinal", options),
    section_b_b: projectSection(model, "transverse", options),
  };
}

/**
 * Generate complete 2D package
 */
export function projectAll2D(model, options = {}) {
  return {
    floorPlans: projectAllFloorPlans(model, options),
    elevations: projectAllElevations(model, options),
    sections: projectAllSections(model, options),
    metadata: {
      designId: model.designId,
      generatedAt: new Date().toISOString(),
      floors: model.floors.length,
      facadeSummary: model.facadeSummary,
    },
  };
}

export default {
  projectFloorPlan,
  projectElevation,
  projectSection,
  projectAllFloorPlans,
  projectAllElevations,
  projectAllSections,
  projectAll2D,
};
