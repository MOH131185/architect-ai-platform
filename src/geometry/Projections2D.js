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

import logger from "../services/core/logger.js";

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

/** Escape XML special characters for safe SVG text content */
function escXml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

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
    showFurniture = true,
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
  const marginPx = 40;
  const contentWidth = dims.width * scale;
  const contentHeight = dims.depth * scale;

  // Adjust SVG size if needed
  const finalWidth = Math.max(svgWidth, contentWidth + 2 * marginPx);
  const finalHeight = Math.max(svgHeight, contentHeight + 2 * marginPx);

  // Center offset
  const offsetX = finalWidth / 2;
  const offsetY = finalHeight / 2;

  let svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${finalWidth} ${finalHeight}" width="${finalWidth}" height="${finalHeight}">`;

  // SVG Styles
  svg += `<style><![CDATA[${generateSVGStyles(style)}]]></style>`;

  // Defs for patterns
  svg += generateHatchPattern("wall-hatch", style, 45, 3);
  svg += generateHatchPattern("slab-hatch", style, 45, 6);

  // Title
  svg += `<text class="title" x="${finalWidth / 2}" y="30">${escXml(floor.name)}</text>`;

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

      svg += `<text class="room-label" x="${cx}" y="${cy - 6}">${escXml(room.name)}</text>`;
      svg += `<text class="area-label" x="${cx}" y="${cy + 10}">${Math.round(room.areaM2)} m\u00B2</text>`;

      // Room width x depth dimensions
      const rw =
        room.width ||
        room.widthMM ||
        (room.polygon ? getBoundsWidth(room.polygon) : 0);
      const rd =
        room.depth ||
        room.depthMM ||
        (room.polygon ? getBoundsHeight(room.polygon) : 0);
      if (rw > 0 && rd > 0) {
        const rwM = rw > 100 ? (rw / MM_PER_M).toFixed(1) : rw.toFixed(1); // Handle mm vs m
        const rdM = rd > 100 ? (rd / MM_PER_M).toFixed(1) : rd.toFixed(1);
        svg += `<text class="area-label" x="${cx}" y="${cy + 22}" font-size="7" fill="#94a3b8">${rwM}m \u00D7 ${rdM}m</text>`;
      }
    }
    svg += "</g>";
  }

  // Furniture symbols (detailed architectural plan convention)
  if (showFurniture) {
    svg += '<g id="furniture">';
    for (const room of floor.rooms) {
      const cx = offsetX + room.center.x * pxPerMM;
      const cy = offsetY - room.center.y * pxPerMM;
      // Calculate room pixel dimensions for scaling furniture
      // Prefer polygon bounds (always in mm); room.width/depth are in meters
      const roomWidthMM = room.polygon
        ? getBoundsWidth(room.polygon)
        : room.widthMM || (room.width || 0) * MM_PER_M;
      const roomDepthMM = room.polygon
        ? getBoundsHeight(room.polygon)
        : room.depthMM || (room.depth || 0) * MM_PER_M;
      const roomWPx = roomWidthMM * pxPerMM;
      const roomHPx = roomDepthMM * pxPerMM;
      if (roomWPx > 20 && roomHPx > 20) {
        svg += drawFurnitureSymbol(room.name, cx, cy, roomWPx, roomHPx);
      }
    }
    svg += "</g>";
  }

  // Dimensions
  if (showDimensions) {
    svg += '<g id="dimensions">';
    svg += drawPlanDimensions(model, dims, offsetX, offsetY, scale);
    svg += "</g>";
  }

  // Section cut lines (A-A, B-B)
  svg += drawSectionCutLines(dims, offsetX, offsetY, scale);

  // North arrow
  svg += drawNorthArrow(finalWidth - 50, 60);

  // Scale bar
  svg += drawScaleBar(finalWidth - 150, finalHeight - 40, scale);

  // Title block
  const floorLabel =
    floorIndex === 0
      ? "Ground Floor Plan"
      : floorIndex === 1
        ? "First Floor Plan"
        : `Level ${floorIndex} Plan`;
  const dwgNum =
    floorIndex === 0
      ? "A-100"
      : floorIndex === 1
        ? "A-101"
        : `A-10${floorIndex}`;
  svg += drawTitleBlock(finalWidth, finalHeight, floorLabel, dwgNum, scale);

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

  // Draw wall thickness as a ring (outer - inner) so interior stays white
  const inset = CONVENTIONS.wallThickness.external;
  const innerFootprint = insetPolygon(footprint, inset);

  // Compound path: outer polygon CW + inner polygon CCW = ring fill (wall zone only)
  const outerPath = polygonToPath(footprint, pxPerMM);
  const innerReversed = polygonToPath([...innerFootprint].reverse(), pxPerMM);
  svg += `<path class="wall-external-cut" d="${outerPath} ${innerReversed}" fill-rule="evenodd"/>`;

  // Inner wall line (stroke only)
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

  if (internalWalls.length === 0) {
    logger.warn(
      "[Projections2D] WARNING: No internal walls found — all rooms will appear open-plan",
      {
        totalWalls: floor.walls.length,
        wallTypes: floor.walls.map((w) => w.type),
      },
    );
  } else {
    logger.debug("[Projections2D] Drawing internal walls", {
      count: internalWalls.length,
      walls: internalWalls.map((w) => w.connectsRooms || "unknown"),
    });
  }

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

    // Handle both position formats:
    // - object format: { x: normalized 0-1, z: normalized 0-1 } (external walls)
    // - number format: distance in mm along wall (internal doors)
    let ratio;
    if (
      typeof opening.position === "object" &&
      opening.position?.x !== undefined
    ) {
      ratio = opening.position.x;
    } else if (typeof opening.positionMM === "number") {
      ratio = opening.positionMM / wallLen;
    } else if (typeof opening.position === "number") {
      ratio =
        opening.position > 1 ? opening.position / wallLen : opening.position;
    } else {
      ratio = 0.5;
    }
    ratio = Math.max(0.05, Math.min(0.95, ratio));

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

/**
 * Draw section cutting plane lines (A-A longitudinal, B-B transverse)
 * Standard UK convention: dash-dot-dash line with circled section markers
 */
function drawSectionCutLines(dims, offsetX, offsetY, scale) {
  let svg = '<g id="section-cut-lines">';
  const extendPx = 30;
  const halfW = (dims.width * scale) / 2;
  const halfD = (dims.depth * scale) / 2;
  const markerR = 9;
  const dashPattern = "12 3 3 3";

  // Section A-A: horizontal line through center (longitudinal section)
  const aaY = offsetY;
  const aaX1 = offsetX - halfW - extendPx;
  const aaX2 = offsetX + halfW + extendPx;
  svg += `<line x1="${aaX1}" y1="${aaY}" x2="${aaX2}" y2="${aaY}" stroke="#555" stroke-width="0.8" stroke-dasharray="${dashPattern}"/>`;
  // Left marker
  svg += `<circle cx="${aaX1 - markerR - 2}" cy="${aaY}" r="${markerR}" fill="white" stroke="#333" stroke-width="1"/>`;
  svg += `<text x="${aaX1 - markerR - 2}" y="${aaY + 3.5}" text-anchor="middle" font-family="Arial" font-size="10" font-weight="bold" fill="#333">A</text>`;
  // Right marker
  svg += `<circle cx="${aaX2 + markerR + 2}" cy="${aaY}" r="${markerR}" fill="white" stroke="#333" stroke-width="1"/>`;
  svg += `<text x="${aaX2 + markerR + 2}" y="${aaY + 3.5}" text-anchor="middle" font-family="Arial" font-size="10" font-weight="bold" fill="#333">A</text>`;
  // Direction arrows (pointing down — looking direction)
  svg += `<polygon fill="#333" points="${aaX1 - markerR - 2},${aaY + markerR + 4} ${aaX1 - markerR - 6},${aaY + markerR + 1} ${aaX1 - markerR + 2},${aaY + markerR + 1}"/>`;
  svg += `<polygon fill="#333" points="${aaX2 + markerR + 2},${aaY + markerR + 4} ${aaX2 + markerR - 2},${aaY + markerR + 1} ${aaX2 + markerR + 6},${aaY + markerR + 1}"/>`;

  // Section B-B: vertical line through center (transverse section)
  const bbX = offsetX;
  const bbY1 = offsetY - halfD - extendPx;
  const bbY2 = offsetY + halfD + extendPx;
  svg += `<line x1="${bbX}" y1="${bbY1}" x2="${bbX}" y2="${bbY2}" stroke="#555" stroke-width="0.8" stroke-dasharray="${dashPattern}"/>`;
  // Top marker
  svg += `<circle cx="${bbX}" cy="${bbY1 - markerR - 2}" r="${markerR}" fill="white" stroke="#333" stroke-width="1"/>`;
  svg += `<text x="${bbX}" y="${bbY1 - markerR + 1.5}" text-anchor="middle" font-family="Arial" font-size="10" font-weight="bold" fill="#333">B</text>`;
  // Bottom marker
  svg += `<circle cx="${bbX}" cy="${bbY2 + markerR + 2}" r="${markerR}" fill="white" stroke="#333" stroke-width="1"/>`;
  svg += `<text x="${bbX}" y="${bbY2 + markerR + 5.5}" text-anchor="middle" font-family="Arial" font-size="10" font-weight="bold" fill="#333">B</text>`;
  // Direction arrows (pointing left — looking direction)
  svg += `<polygon fill="#333" points="${bbX - markerR - 4},${bbY1 - markerR - 2} ${bbX - markerR - 1},${bbY1 - markerR - 6} ${bbX - markerR - 1},${bbY1 - markerR + 2}"/>`;
  svg += `<polygon fill="#333" points="${bbX - markerR - 4},${bbY2 + markerR + 2} ${bbX - markerR - 1},${bbY2 + markerR - 2} ${bbX - markerR - 1},${bbY2 + markerR + 6}"/>`;

  svg += "</g>";
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
  const marginPx = 40;
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

  let svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${finalWidth} ${finalHeight}" width="${finalWidth}" height="${finalHeight}">`;
  svg += `<style><![CDATA[${generateSVGStyles(style)}]]></style>`;

  // Sky background
  svg += `<rect class="sky" x="0" y="0" width="${finalWidth}" height="${groundY}"/>`;

  // Ground with grass indication
  if (showGround) {
    // Grass-green fill below ground line
    svg += `<rect fill="${style.colors.groundFill}" x="0" y="${groundY}" width="${finalWidth}" height="${groundPx + marginPx}"/>`;
    // Subtle grass hatching
    for (let gx = 0; gx < finalWidth; gx += 12) {
      const h = 3 + Math.random() * 4;
      svg += `<line stroke="#8BAA84" stroke-width="0.5" x1="${gx}" y1="${groundY}" x2="${gx + 2}" y2="${groundY - h}"/>`;
    }
    svg += `<line class="ground-line" x1="0" y1="${groundY}" x2="${finalWidth}" y2="${groundY}" stroke="#333" stroke-width="1.5"/>`;

    // Low shrub landscaping at building base
    const shrubLeft = marginPx + 10;
    const shrubRight = finalWidth - marginPx - 10;
    const shrubStep = 35;
    for (let sx = shrubLeft; sx < shrubRight; sx += shrubStep) {
      const sr = 5 + ((sx * 7) % 4); // deterministic pseudo-random size
      svg += `<ellipse cx="${sx}" cy="${groundY - sr * 0.35}" rx="${sr}" ry="${sr * 0.55}" fill="#7BA07B" fill-opacity="0.45" stroke="#5A8A5A" stroke-width="0.4"/>`;
    }
  }

  // Title
  const orientationNames = { N: "North", S: "South", E: "East", W: "West" };
  svg += `<text class="title" x="${finalWidth / 2}" y="30">${escXml(orientationNames[orientation])} Elevation</text>`;

  // Building wall — with material fill from DNA style
  const wallLeft = offsetX - (elevationWidthMM / 2) * pxPerMM;
  const wallRight = offsetX + (elevationWidthMM / 2) * pxPerMM;
  const wallTop = groundY - model.envelope.height * pxPerMM;

  // Material fill: use first exterior material from style
  const exteriorMat =
    (model.style?.materials || []).find(
      (m) =>
        m &&
        typeof m === "object" &&
        ((m.application || "").toLowerCase().includes("wall") ||
          (m.application || "").toLowerCase().includes("exterior") ||
          (m.application || "").toLowerCase().includes("facade")),
    ) || (model.style?.materials || [])[0];

  const matName =
    typeof exteriorMat === "string" ? exteriorMat : exteriorMat?.name || "";
  const matHex = exteriorMat?.hexColor || null;
  const matFill = getMaterialFill(matName, matHex);

  if (matFill.defs) {
    svg += `<defs>${matFill.defs}</defs>`;
  }

  // Wall rectangle with material fill
  svg += `<rect fill="${matFill.fill}" stroke="#333" stroke-width="1.5" x="${wallLeft}" y="${wallTop}" width="${elevationWidthMM * pxPerMM}" height="${model.envelope.height * pxPerMM}"/>`;

  // Foundation shadow/depth line at base
  svg += `<line stroke="#555" stroke-width="2.5" x1="${wallLeft}" y1="${groundY}" x2="${wallRight}" y2="${groundY}"/>`;
  svg += `<line stroke="rgba(0,0,0,0.08)" stroke-width="6" x1="${wallLeft + 3}" y1="${groundY + 3}" x2="${wallRight + 3}" y2="${groundY + 3}"/>`;

  // DPC (damp-proof course) line at 150mm above ground
  const dpcY = groundY - 150 * pxPerMM;
  svg += `<line stroke="#666" stroke-width="0.8" stroke-dasharray="6 3" x1="${wallLeft}" y1="${dpcY}" x2="${wallRight}" y2="${dpcY}"/>`;
  svg += `<text x="${wallLeft - 5}" y="${dpcY + 3}" text-anchor="end" font-family="Arial" font-size="7" fill="#888">DPC</text>`;

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

  // Title block
  const elevDwgNum = { N: "A-200", S: "A-201", E: "A-202", W: "A-203" };
  svg += drawTitleBlock(
    finalWidth,
    finalHeight,
    `${orientationNames[orientation]} Elevation`,
    elevDwgNum[orientation] || "A-200",
    scale,
  );

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

  const eavesOverhang = model.roof?.overhangs?.eaves || 300; // mm
  let svg = "";

  // Extend first and last profile points by eaves overhang
  const extendedProfile = roofProfile.map((pt, i) => {
    if (i === 0) return { x: pt.x - eavesOverhang, z: pt.z };
    if (i === roofProfile.length - 1)
      return { x: pt.x + eavesOverhang, z: pt.z };
    return pt;
  });

  let roofPath = "M ";
  for (let i = 0; i < extendedProfile.length; i++) {
    const pt = extendedProfile[i];
    const x = offsetX + pt.x * pxPerMM;
    const y = groundY - pt.z * pxPerMM;
    roofPath += `${x} ${y}`;
    if (i < extendedProfile.length - 1) roofPath += " L ";
  }
  roofPath += " Z";

  svg += `<path class="roof" d="${roofPath}"/>`;

  // Fascia board at eaves (thin strip at wall-top height under overhang)
  const wallTopZ = model.envelope.height;
  const eaveY = groundY - wallTopZ * pxPerMM;
  const leftEaveX = offsetX + extendedProfile[0].x * pxPerMM;
  const rightEaveX =
    offsetX + extendedProfile[extendedProfile.length - 1].x * pxPerMM;
  const fasciaDepthPx = 150 * pxPerMM; // 150mm fascia board

  svg += `<rect fill="#8B7D6B" stroke="#555" stroke-width="0.8" x="${leftEaveX}" y="${eaveY}" width="${rightEaveX - leftEaveX}" height="${fasciaDepthPx}"/>`;

  // Soffit line (underside of overhang)
  svg += `<line stroke="#666" stroke-width="0.5" x1="${leftEaveX}" y1="${eaveY + fasciaDepthPx}" x2="${rightEaveX}" y2="${eaveY + fasciaDepthPx}"/>`;

  return svg;
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

  // Glazing bars — multi-pane grid proportional to window width
  const paneCountH = Math.max(2, Math.round(width / 30));
  for (let p = 1; p < paneCountH; p++) {
    const barX = x + (p / paneCountH) * width;
    svg += `<line class="window-glazing-bar" x1="${barX}" y1="${y}" x2="${barX}" y2="${y + height}"/>`;
  }
  const paneCountV = Math.max(2, Math.round(height / 30));
  for (let p = 1; p < paneCountV; p++) {
    const barY = y + (p / paneCountV) * height;
    svg += `<line class="window-glazing-bar" x1="${x}" y1="${barY}" x2="${x + width}" y2="${barY}"/>`;
  }

  // Window sill
  svg += `<line stroke="#333" stroke-width="2" x1="${x - 5}" y1="${bottomY}" x2="${x + width + 5}" y2="${bottomY}"/>`;

  // Lintel (head detail above window)
  svg += `<line stroke="#555" stroke-width="1.5" x1="${x - 3}" y1="${y}" x2="${x + width + 3}" y2="${y}"/>`;
  svg += `<line stroke="#888" stroke-width="0.5" x1="${x - 3}" y1="${y - 3}" x2="${x + width + 3}" y2="${y - 3}"/>`;

  // Reveal shadow (depth indication)
  svg += `<line stroke="rgba(0,0,0,0.2)" stroke-width="1.5" x1="${x + 2}" y1="${y + height}" x2="${x + width + 2}" y2="${y + height}"/>`;
  svg += `<line stroke="rgba(0,0,0,0.15)" stroke-width="1" x1="${x + width}" y1="${y + 2}" x2="${x + width}" y2="${y + height + 2}"/>`;

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
  svg += `<circle cx="${handleX}" cy="${handleY}" r="4" fill="#C0A060" stroke="#333" stroke-width="0.5"/>`;

  // Door panel detail
  svg += `<rect fill="none" stroke="#4A2F1A" stroke-width="0.8" x="${x + width * 0.1}" y="${y + height * 0.1}" width="${width * 0.3}" height="${height * 0.35}"/>`;
  svg += `<rect fill="none" stroke="#4A2F1A" stroke-width="0.8" x="${x + width * 0.1}" y="${y + height * 0.55}" width="${width * 0.3}" height="${height * 0.35}"/>`;

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
  const marginPx = 50;
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

  let svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${finalWidth} ${finalHeight}" width="${finalWidth}" height="${finalHeight}">`;
  svg += `<style><![CDATA[${generateSVGStyles(style)}]]></style>`;
  svg += generateHatchPattern("wall-hatch", style, 45, 3);
  svg += generateHatchPattern("slab-hatch", style, 45, 6);

  // Ground line and fill
  svg += `<rect class="ground" x="0" y="${groundY}" width="${finalWidth}" height="${groundPx + foundationPx + marginPx}"/>`;
  svg += `<line class="ground-line" x1="0" y1="${groundY}" x2="${finalWidth}" y2="${groundY}"/>`;

  // Title
  const sectionLabel =
    sectionType === "longitudinal" ? "Section A-A" : "Section B-B";
  svg += `<text class="title" x="${finalWidth / 2}" y="30">${escXml(sectionLabel)}</text>`;

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

    // Floor-to-floor chain dimensions (closer to building)
    for (const floor of model.floors) {
      const floorBaseY = groundY - floor.zBase * pxPerMM;
      const floorTopY = groundY - floor.zTop * pxPerMM;
      const floorHeightM = (floor.floorHeight / MM_PER_M).toFixed(2);
      svg += drawDimension(
        buildingRight + 30,
        floorBaseY,
        buildingRight + 30,
        floorTopY,
        `${floorHeightM} m`,
        true,
        `section-dim-floor-${floor.index}`,
      );
    }

    svg += "</g>";
  }

  // Title block
  const secDwg = sectionType === "longitudinal" ? "A-300" : "A-301";
  svg += drawTitleBlock(finalWidth, finalHeight, sectionLabel, secDwg, scale);

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

  // Foundation depth label
  const fdMetres = (CONVENTIONS.foundationDepth / 1000).toFixed(2);
  const fdLabelX = (buildingLeft + buildingRight) / 2;
  const fdLabelY = groundY + foundationH - 4;
  svg += `<text font-family="Arial, sans-serif" font-size="7" fill="#666" text-anchor="middle" x="${fdLabelX}" y="${fdLabelY}">${fdMetres}m foundation</text>`;

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

        svg += `<text class="room-label" x="${roomX}" y="${roomY}">${escXml(room.name)}</text>`;
      }
    }
  }

  // Floor-to-ceiling clear height label (right side of section)
  const clearHeightMM = floor.floorHeight - (floor.slab?.thickness || 200);
  const clearHeightM = (clearHeightMM / 1000).toFixed(2);
  const heightLabelX = buildingRight + 8;
  const heightLabelY = floorY - (floor.floorHeight * pxPerMM) / 2;
  svg += `<text font-family="Arial, sans-serif" font-size="7" fill="#888" text-anchor="start" x="${heightLabelX}" y="${heightLabelY}">${clearHeightM}m clr</text>`;

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

  let svg = `<path class="roof" d="${roofPath}"/>`;

  // Insulation zigzag indication inside roof zone
  // Draw a zigzag line just below the roof path to indicate insulation
  const topFloor = model.floors[model.floors.length - 1];
  if (topFloor) {
    const ceilingY = groundY - topFloor.zTop * pxPerMM;
    const roofLeft = offsetX + roofProfile[0].x * pxPerMM;
    const roofRight = offsetX + roofProfile[roofProfile.length - 1].x * pxPerMM;
    const zigzagStep = 6;
    const zigzagH = 5;

    svg += '<g id="insulation-zone" opacity="0.6">';
    for (let ix = roofLeft; ix < roofRight - zigzagStep; ix += zigzagStep) {
      const isUp = Math.round((ix - roofLeft) / zigzagStep) % 2 === 0;
      const y1 = ceilingY - (isUp ? 0 : zigzagH);
      const y2 = ceilingY - (isUp ? zigzagH : 0);
      svg += `<line stroke="#C080D0" stroke-width="0.8" x1="${ix}" y1="${y1}" x2="${ix + zigzagStep}" y2="${y2}"/>`;
    }
    svg += "</g>";
  }

  return svg;
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
 * Get the width of a polygon's bounding box (X extent)
 */
function getBoundsWidth(polygon) {
  if (!polygon || polygon.length < 2) return 0;
  const xs = polygon.map((p) => p.x);
  return Math.max(...xs) - Math.min(...xs);
}

/**
 * Get the height of a polygon's bounding box (Y extent)
 */
function getBoundsHeight(polygon) {
  if (!polygon || polygon.length < 2) return 0;
  const ys = polygon.map((p) => p.y);
  return Math.max(...ys) - Math.min(...ys);
}

/**
 * Draw wall hatch pattern (poché)
 */
function drawWallHatch(outerPolygon, innerPolygon, pxPerMM) {
  // Draw diagonal hatch lines ONLY in the wall thickness zone (between outer and inner polygon)
  // Uses SVG clipPath with evenodd fill-rule to clip to wall zone only

  const clipId = `wall-clip-${Math.random().toString(36).slice(2, 8)}`;

  // Build clip path: outer polygon CCW + inner polygon CW = wall zone only (evenodd)
  const outerPath =
    outerPolygon
      .map(
        (p, i) =>
          `${i === 0 ? "M" : "L"} ${(p.x * pxPerMM).toFixed(2)},${(p.y * pxPerMM).toFixed(2)}`,
      )
      .join(" ") + " Z";
  const innerPath =
    [...innerPolygon]
      .reverse()
      .map(
        (p, i) =>
          `${i === 0 ? "M" : "L"} ${(p.x * pxPerMM).toFixed(2)},${(p.y * pxPerMM).toFixed(2)}`,
      )
      .join(" ") + " Z";

  let svg = `<defs><clipPath id="${clipId}"><path d="${outerPath} ${innerPath}" fill-rule="evenodd"/></clipPath></defs>`;
  svg += `<g class="wall-poche" clip-path="url(#${clipId})">`;

  // Bounding box for hatch lines
  const minX = Math.min(...outerPolygon.map((p) => p.x));
  const maxX = Math.max(...outerPolygon.map((p) => p.x));
  const minY = Math.min(...outerPolygon.map((p) => p.y));
  const maxY = Math.max(...outerPolygon.map((p) => p.y));

  const spacing = (3 / pxPerMM) * MM_PER_M; // 3mm spacing at scale

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
  const arrowLen = 6;
  const arrowHalf = 3;
  const arrowFill = "#444";
  let svg = `<g class="dimension" ${id ? `id="${id}"` : ""}>`;

  if (vertical) {
    // Extension lines
    svg += `<line stroke="#999" stroke-width="0.3" x1="${x1 - 12}" y1="${y1}" x2="${x1 - 2}" y2="${y1}"/>`;
    svg += `<line stroke="#999" stroke-width="0.3" x1="${x1 - 12}" y1="${y2}" x2="${x1 - 2}" y2="${y2}"/>`;
    // Dimension line
    svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
    // Arrowheads (pointing up and down)
    svg += `<polygon fill="${arrowFill}" points="${x1},${y1} ${x1 - arrowHalf},${y1 + arrowLen} ${x1 + arrowHalf},${y1 + arrowLen}"/>`;
    svg += `<polygon fill="${arrowFill}" points="${x1},${y2} ${x1 - arrowHalf},${y2 - arrowLen} ${x1 + arrowHalf},${y2 - arrowLen}"/>`;
    const midY = (y1 + y2) / 2;
    svg += `<text class="dimension-text" x="${x1 + 15}" y="${midY}" transform="rotate(-90, ${x1 + 15}, ${midY})">${escXml(text)}</text>`;
  } else {
    // Extension lines
    svg += `<line stroke="#999" stroke-width="0.3" x1="${x1}" y1="${y1 + 12}" x2="${x1}" y2="${y1 + 2}"/>`;
    svg += `<line stroke="#999" stroke-width="0.3" x1="${x2}" y1="${y1 + 12}" x2="${x2}" y2="${y1 + 2}"/>`;
    // Dimension line
    svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
    // Arrowheads (pointing left and right)
    svg += `<polygon fill="${arrowFill}" points="${x1},${y1} ${x1 + arrowLen},${y1 - arrowHalf} ${x1 + arrowLen},${y1 + arrowHalf}"/>`;
    svg += `<polygon fill="${arrowFill}" points="${x2},${y1} ${x2 - arrowLen},${y1 - arrowHalf} ${x2 - arrowLen},${y1 + arrowHalf}"/>`;
    const midX = (x1 + x2) / 2;
    svg += `<text class="dimension-text" x="${midX}" y="${y1 - 8}">${escXml(text)}</text>`;
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
  svg += `<text class="level-text" x="${x - triangleSize - lineLength - textOffset}" y="${y + 4}" text-anchor="end">${escXml(text)}</text>`;

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

// =============================================================================
// FURNITURE SYMBOLS (Detailed architectural plan convention)
// =============================================================================

/**
 * Draw furniture symbols for a room based on its type.
 * Uses full architectural drawing conventions.
 */
function drawFurnitureSymbol(roomType, cx, cy, widthPx, heightPx) {
  const type = (roomType || "").toLowerCase();
  let svg = "";

  if (type.includes("bed") || type.includes("master")) {
    // Bed with pillow indication
    const bw = Math.min(widthPx * 0.5, 60);
    const bh = Math.min(heightPx * 0.6, 80);
    const pillowH = bh * 0.15;
    svg += `<rect fill="none" stroke="#777" stroke-width="0.7" x="${cx - bw / 2}" y="${cy - bh / 2}" width="${bw}" height="${bh}" rx="2"/>`;
    // Pillow at head
    svg += `<rect fill="#e0e0e0" stroke="#777" stroke-width="0.5" x="${cx - bw / 2 + 4}" y="${cy - bh / 2 + 3}" width="${bw - 8}" height="${pillowH}" rx="2"/>`;
  } else if (
    type.includes("living") ||
    type.includes("lounge") ||
    type.includes("sitting")
  ) {
    // Sofa L-shape with cushion lines
    const sw = Math.min(widthPx * 0.45, 55);
    const sh = Math.min(heightPx * 0.3, 30);
    // Seat
    svg += `<rect fill="none" stroke="#777" stroke-width="0.7" x="${cx - sw / 2}" y="${cy - sh / 2}" width="${sw}" height="${sh}" rx="2"/>`;
    // Back
    svg += `<rect fill="#e8e8e8" stroke="#777" stroke-width="0.5" x="${cx - sw / 2}" y="${cy - sh / 2}" width="${sw}" height="${sh * 0.3}" rx="1"/>`;
    // Cushion divider lines
    const third = sw / 3;
    svg += `<line stroke="#aaa" stroke-width="0.4" x1="${cx - sw / 2 + third}" y1="${cy - sh / 2 + sh * 0.3}" x2="${cx - sw / 2 + third}" y2="${cy + sh / 2}"/>`;
    svg += `<line stroke="#aaa" stroke-width="0.4" x1="${cx - sw / 2 + third * 2}" y1="${cy - sh / 2 + sh * 0.3}" x2="${cx - sw / 2 + third * 2}" y2="${cy + sh / 2}"/>`;
  } else if (type.includes("kitchen") && type.includes("dining")) {
    // Combined kitchen-dining: worktop in upper portion, dining table in lower
    const kw = Math.min(widthPx * 0.6, 70);
    const kh = Math.min(heightPx * 0.12, 14);
    const ky = cy - heightPx * 0.35;
    // Kitchen worktop
    svg += `<rect fill="#efefef" stroke="#777" stroke-width="0.7" x="${cx - kw / 2}" y="${ky}" width="${kw}" height="${kh}" rx="1"/>`;
    // Sink
    svg += `<circle fill="#e0e8f0" stroke="#777" stroke-width="0.5" cx="${cx - kw * 0.15}" cy="${ky + kh / 2}" r="${kh * 0.35}"/>`;
    // Cooker (4 circles)
    const cr = kh * 0.2;
    const cookX = cx + kw * 0.2;
    svg += `<circle fill="none" stroke="#777" stroke-width="0.4" cx="${cookX - cr * 1.3}" cy="${ky + kh * 0.35}" r="${cr}"/>`;
    svg += `<circle fill="none" stroke="#777" stroke-width="0.4" cx="${cookX + cr * 1.3}" cy="${ky + kh * 0.35}" r="${cr}"/>`;
    svg += `<circle fill="none" stroke="#777" stroke-width="0.4" cx="${cookX - cr * 1.3}" cy="${ky + kh * 0.65}" r="${cr}"/>`;
    svg += `<circle fill="none" stroke="#777" stroke-width="0.4" cx="${cookX + cr * 1.3}" cy="${ky + kh * 0.65}" r="${cr}"/>`;
    // Dining table below
    const tw = Math.min(widthPx * 0.3, 40);
    const th = Math.min(heightPx * 0.2, 25);
    const dy = cy + heightPx * 0.1;
    svg += `<rect fill="none" stroke="#777" stroke-width="0.7" x="${cx - tw / 2}" y="${dy}" width="${tw}" height="${th}" rx="1"/>`;
    // 4 chairs
    const chW = tw * 0.2;
    const chH = th * 0.25;
    svg += `<rect fill="#e0e0e0" stroke="#777" stroke-width="0.4" x="${cx - chW / 2}" y="${dy - chH - 2}" width="${chW}" height="${chH}"/>`;
    svg += `<rect fill="#e0e0e0" stroke="#777" stroke-width="0.4" x="${cx - chW / 2}" y="${dy + th + 2}" width="${chW}" height="${chH}"/>`;
    svg += `<rect fill="#e0e0e0" stroke="#777" stroke-width="0.4" x="${cx - tw / 2 - chH - 2}" y="${dy + th / 2 - chW / 2}" width="${chH}" height="${chW}"/>`;
    svg += `<rect fill="#e0e0e0" stroke="#777" stroke-width="0.4" x="${cx + tw / 2 + 2}" y="${dy + th / 2 - chW / 2}" width="${chH}" height="${chW}"/>`;
  } else if (type.includes("kitchen")) {
    // Worktop line with sink circle and cooker (4 circles)
    const kw = Math.min(widthPx * 0.6, 70);
    const kh = Math.min(heightPx * 0.15, 16);
    const ky = cy - heightPx * 0.25;
    // Worktop
    svg += `<rect fill="#efefef" stroke="#777" stroke-width="0.7" x="${cx - kw / 2}" y="${ky}" width="${kw}" height="${kh}" rx="1"/>`;
    // Sink (circle cutout)
    svg += `<circle fill="#e0e8f0" stroke="#777" stroke-width="0.5" cx="${cx - kw * 0.15}" cy="${ky + kh / 2}" r="${kh * 0.35}"/>`;
    // Cooker (4 circles)
    const cr = kh * 0.2;
    const cookX = cx + kw * 0.2;
    svg += `<circle fill="none" stroke="#777" stroke-width="0.4" cx="${cookX - cr * 1.3}" cy="${ky + kh * 0.35}" r="${cr}"/>`;
    svg += `<circle fill="none" stroke="#777" stroke-width="0.4" cx="${cookX + cr * 1.3}" cy="${ky + kh * 0.35}" r="${cr}"/>`;
    svg += `<circle fill="none" stroke="#777" stroke-width="0.4" cx="${cookX - cr * 1.3}" cy="${ky + kh * 0.65}" r="${cr}"/>`;
    svg += `<circle fill="none" stroke="#777" stroke-width="0.4" cx="${cookX + cr * 1.3}" cy="${ky + kh * 0.65}" r="${cr}"/>`;
    // Fridge rectangle
    const fw = kh * 0.8;
    svg += `<rect fill="none" stroke="#777" stroke-width="0.5" x="${cx + kw / 2 - fw - 2}" y="${ky}" width="${fw}" height="${kh}" rx="1"/>`;
  } else if (
    type.includes("bath") ||
    type.includes("shower") ||
    type.includes("wc") ||
    type.includes("en-suite") ||
    type.includes("ensuite")
  ) {
    // Bath rectangle with taps, WC with cistern + bowl arc, basin circle
    const scale = Math.min(widthPx, heightPx) / 120;
    const bathW = 25 * scale;
    const bathH = 55 * scale;
    // Bath
    svg += `<rect fill="#e8f0f8" stroke="#777" stroke-width="0.6" x="${cx - widthPx * 0.25}" y="${cy - bathH / 2}" width="${bathW}" height="${bathH}" rx="3"/>`;
    // Taps
    svg += `<circle fill="#777" cx="${cx - widthPx * 0.25 + bathW / 2}" cy="${cy - bathH / 2 + 4 * scale}" r="${2 * scale}"/>`;
    // WC: cistern rectangle + bowl arc
    const wcX = cx + widthPx * 0.1;
    const wcW = 14 * scale;
    const wcH = 10 * scale;
    svg += `<rect fill="#e8e8e8" stroke="#777" stroke-width="0.5" x="${wcX - wcW / 2}" y="${cy - wcH}" width="${wcW}" height="${wcH}" rx="1"/>`;
    svg += `<ellipse fill="#e8e8e8" stroke="#777" stroke-width="0.5" cx="${wcX}" cy="${cy + wcH * 0.3}" rx="${wcW * 0.45}" ry="${wcH * 0.7}"/>`;
    // Basin circle
    svg += `<circle fill="#e8f0f8" stroke="#777" stroke-width="0.5" cx="${cx + widthPx * 0.25}" cy="${cy - heightPx * 0.15}" r="${6 * scale}"/>`;
  } else if (type.includes("dining")) {
    // Table rectangle with chair rectangles around it
    const tw = Math.min(widthPx * 0.35, 45);
    const th = Math.min(heightPx * 0.25, 30);
    const chairW = tw * 0.2;
    const chairH = th * 0.25;
    // Table
    svg += `<rect fill="none" stroke="#777" stroke-width="0.7" x="${cx - tw / 2}" y="${cy - th / 2}" width="${tw}" height="${th}" rx="1"/>`;
    // Chairs (4, one on each side)
    svg += `<rect fill="#e0e0e0" stroke="#777" stroke-width="0.4" x="${cx - chairW / 2}" y="${cy - th / 2 - chairH - 2}" width="${chairW}" height="${chairH}"/>`;
    svg += `<rect fill="#e0e0e0" stroke="#777" stroke-width="0.4" x="${cx - chairW / 2}" y="${cy + th / 2 + 2}" width="${chairW}" height="${chairH}"/>`;
    svg += `<rect fill="#e0e0e0" stroke="#777" stroke-width="0.4" x="${cx - tw / 2 - chairH - 2}" y="${cy - chairW / 2}" width="${chairH}" height="${chairW}"/>`;
    svg += `<rect fill="#e0e0e0" stroke="#777" stroke-width="0.4" x="${cx + tw / 2 + 2}" y="${cy - chairW / 2}" width="${chairH}" height="${chairW}"/>`;
  }

  return svg;
}

// =============================================================================
// TITLE BLOCK
// =============================================================================

/**
 * Draw a compact title block at the bottom-right of a drawing.
 */
function drawTitleBlock(svgWidth, svgHeight, title, drawingNumber, scaleValue) {
  const blockW = 180;
  const blockH = 40;
  const x = svgWidth - blockW - 10;
  const y = svgHeight - blockH - 10;

  let svg = `<g id="title-block">`;
  svg += `<rect x="${x}" y="${y}" width="${blockW}" height="${blockH}" fill="#ffffff" stroke="#333" stroke-width="1"/>`;
  svg += `<line x1="${x}" y1="${y + 20}" x2="${x + blockW}" y2="${y + 20}" stroke="#333" stroke-width="0.5"/>`;
  svg += `<text x="${x + 5}" y="${y + 14}" font-family="Arial, sans-serif" font-size="9" font-weight="700" fill="#333">${escXml(title)}</text>`;
  svg += `<text x="${x + 5}" y="${y + 33}" font-family="Arial, sans-serif" font-size="7" fill="#666">Dwg: ${escXml(drawingNumber)}</text>`;
  svg += `<text x="${x + blockW - 5}" y="${y + 33}" font-family="Arial, sans-serif" font-size="7" fill="#666" text-anchor="end">Scale 1:${Math.round((1000 / scaleValue) * 10) / 10}</text>`;
  svg += `</g>`;
  return svg;
}

// =============================================================================
// MATERIAL PATTERN HELPERS
// =============================================================================

/**
 * Get a material fill pattern definition and URL reference for elevations.
 * Returns SVG <defs> content and the fill attribute value.
 */
function getMaterialFill(materialName, hexColor) {
  const name = (materialName || "").toLowerCase();

  if (name.includes("brick")) {
    // Brick coursing with stretcher bond pattern — more visible mortar lines
    return {
      defs: `<pattern id="mat-brick" patternUnits="userSpaceOnUse" width="20" height="8">
        <rect width="20" height="8" fill="${hexColor || "#C4956A"}"/>
        <line x1="0" y1="4" x2="20" y2="4" stroke="rgba(0,0,0,0.35)" stroke-width="0.8"/>
        <line x1="0" y1="8" x2="20" y2="8" stroke="rgba(0,0,0,0.35)" stroke-width="0.8"/>
        <line x1="10" y1="0" x2="10" y2="4" stroke="rgba(0,0,0,0.25)" stroke-width="0.6"/>
        <line x1="0" y1="4" x2="0" y2="8" stroke="rgba(0,0,0,0.25)" stroke-width="0.6"/>
        <line x1="20" y1="4" x2="20" y2="8" stroke="rgba(0,0,0,0.25)" stroke-width="0.6"/>
      </pattern>`,
      fill: "url(#mat-brick)",
    };
  }
  if (
    name.includes("timber") ||
    name.includes("clad") ||
    name.includes("wood")
  ) {
    // Vertical line pattern over timber color
    return {
      defs: `<pattern id="mat-timber" patternUnits="userSpaceOnUse" width="6" height="10">
        <rect width="6" height="10" fill="${hexColor || "#A0785A"}"/>
        <line x1="3" y1="0" x2="3" y2="10" stroke="rgba(0,0,0,0.12)" stroke-width="0.5"/>
      </pattern>`,
      fill: "url(#mat-timber)",
    };
  }
  if (
    name.includes("zinc") ||
    name.includes("metal") ||
    name.includes("steel")
  ) {
    // Standing seam pattern
    return {
      defs: `<pattern id="mat-metal" patternUnits="userSpaceOnUse" width="16" height="10">
        <rect width="16" height="10" fill="${hexColor || "#6B7280"}"/>
        <line x1="8" y1="0" x2="8" y2="10" stroke="rgba(255,255,255,0.15)" stroke-width="0.8"/>
      </pattern>`,
      fill: "url(#mat-metal)",
    };
  }
  if (name.includes("stone") || name.includes("ashlar")) {
    // Coursed stone pattern — irregular horizontal courses with vertical joints
    return {
      defs: `<pattern id="mat-stone" patternUnits="userSpaceOnUse" width="25" height="15">
        <rect width="25" height="15" fill="${hexColor || "#D0C8B8"}"/>
        <line x1="0" y1="8" x2="25" y2="8" stroke="rgba(0,0,0,0.22)" stroke-width="0.6"/>
        <line x1="0" y1="15" x2="25" y2="15" stroke="rgba(0,0,0,0.22)" stroke-width="0.6"/>
        <line x1="12" y1="0" x2="12" y2="8" stroke="rgba(0,0,0,0.15)" stroke-width="0.4"/>
        <line x1="6" y1="8" x2="6" y2="15" stroke="rgba(0,0,0,0.15)" stroke-width="0.4"/>
        <line x1="19" y1="8" x2="19" y2="15" stroke="rgba(0,0,0,0.15)" stroke-width="0.4"/>
      </pattern>`,
      fill: "url(#mat-stone)",
    };
  }
  // Default: solid fill with material color (render/stucco/plaster)
  return {
    defs: "",
    fill: hexColor || "#E5E7EB",
  };
}

/**
 * Create empty SVG with error message
 */
function createEmptySVG(width, height, message) {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
      <rect width="${width}" height="${height}" fill="#f0f0f0"/>
      <text x="${width / 2}" y="${height / 2}" text-anchor="middle" font-family="Arial" font-size="14" fill="#999">${escXml(message)}</text>
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
