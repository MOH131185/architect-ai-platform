/**
 * Design Validators - Topology & Architectural Rules
 *
 * Validates design state for:
 * - Topology: closed polygons, minimum vertices, self-intersections
 * - Dimensional rules: door widths, corridor widths, room minimums
 * - Window-to-Wall Ratio (WWR): 0.25-0.45
 * - Circulation: accessibility, egress
 * - Code compliance: building codes and best practices
 *
 * @module core/validators
 */

import type {
  DesignState,
  Point2D,
  Room,
  Door,
  Window,
  Level,
  Wall
} from './designSchema';

// ============================================================================
// VALIDATION RESULT TYPES
// ============================================================================

export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
  severity: ValidationSeverity;
  category: string;
  message: string;
  entityId?: string;
  entityType?: string;
  suggestedFix?: string;
}

export interface ValidationResult {
  valid: boolean;
  score: number; // 0-100
  issues: ValidationIssue[];
  summary: {
    errors: number;
    warnings: number;
    info: number;
  };
  details: {
    topology: { valid: boolean; issues: ValidationIssue[] };
    dimensions: { valid: boolean; issues: ValidationIssue[] };
    wwr: { valid: boolean; issues: ValidationIssue[]; ratio?: number };
    circulation: { valid: boolean; issues: ValidationIssue[] };
    compliance: { valid: boolean; issues: ValidationIssue[] };
  };
}

// ============================================================================
// CONSTANTS - Architectural Rules
// ============================================================================

// Minimum dimensions (in meters)
export const MIN_DOOR_WIDTH = 0.8; // 800mm - minimum accessible door
export const MIN_DOOR_WIDTH_MAIN = 0.9; // 900mm - main entrance
export const MIN_DOOR_HEIGHT = 2.0; // 2000mm
export const MIN_CORRIDOR_WIDTH = 0.9; // 900mm - minimum corridor
export const MIN_CORRIDOR_WIDTH_ACCESSIBLE = 1.2; // 1200mm - wheelchair accessible
export const MIN_ROOM_WIDTH = 2.4; // 2400mm - minimum habitable room dimension
export const MIN_ROOM_AREA_BEDROOM = 7.0; // 7m² - minimum bedroom
export const MIN_ROOM_AREA_LIVING = 11.0; // 11m² - minimum living room
export const MIN_ROOM_AREA_KITCHEN = 6.5; // 6.5m² - minimum kitchen
export const MIN_ROOM_AREA_BATHROOM = 2.5; // 2.5m² - minimum bathroom
export const MIN_CEILING_HEIGHT = 2.3; // 2300mm - minimum habitable ceiling
export const MIN_CEILING_HEIGHT_HABITABLE = 2.4; // 2400mm - recommended habitable

// Window-to-Wall Ratio (WWR)
export const MIN_WWR = 0.25; // 25% - minimum for natural light
export const MAX_WWR = 0.45; // 45% - maximum for energy efficiency
export const OPTIMAL_WWR = 0.35; // 35% - optimal balance

// Polygon topology
export const MIN_POLYGON_VERTICES = 3; // Minimum for a closed shape
export const MIN_EDGE_LENGTH = 0.3; // 300mm - minimum edge length
export const MAX_POLYGON_VERTICES = 100; // Sanity check

// ============================================================================
// TOPOLOGY VALIDATION
// ============================================================================

/**
 * Check if polygon is closed (first and last points are equal)
 */
function isPolygonClosed(polygon: Point2D[]): boolean {
  if (polygon.length < 2) return false;

  const first = polygon[0];
  const last = polygon[polygon.length - 1];
  const epsilon = 0.001; // 1mm tolerance

  return (
    Math.abs(first.x - last.x) < epsilon &&
    Math.abs(first.y - last.y) < epsilon
  );
}

/**
 * Check if polygon has minimum vertices
 */
function hasMinimumVertices(polygon: Point2D[], min: number = MIN_POLYGON_VERTICES): boolean {
  // If closed, last vertex is duplicate of first
  const uniqueVertices = isPolygonClosed(polygon) ? polygon.length - 1 : polygon.length;
  return uniqueVertices >= min;
}

/**
 * Check for degenerate edges (too short)
 */
function hasDegenerateEdges(polygon: Point2D[]): boolean {
  for (let i = 0; i < polygon.length - 1; i++) {
    const p1 = polygon[i];
    const p2 = polygon[i + 1];
    const length = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);

    if (length < MIN_EDGE_LENGTH) {
      return true;
    }
  }
  return false;
}

/**
 * Check for self-intersecting polygon
 * Uses line segment intersection algorithm
 */
function isSelfIntersecting(polygon: Point2D[]): boolean {
  // Check all edge pairs for intersection
  for (let i = 0; i < polygon.length - 1; i++) {
    for (let j = i + 2; j < polygon.length - 1; j++) {
      // Skip adjacent edges
      if (j === i + 1) continue;

      const p1 = polygon[i];
      const p2 = polygon[i + 1];
      const p3 = polygon[j];
      const p4 = polygon[j + 1];

      if (doLineSegmentsIntersect(p1, p2, p3, p4)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Check if two line segments intersect
 */
function doLineSegmentsIntersect(
  p1: Point2D,
  p2: Point2D,
  p3: Point2D,
  p4: Point2D
): boolean {
  const d1 = direction(p3, p4, p1);
  const d2 = direction(p3, p4, p2);
  const d3 = direction(p1, p2, p3);
  const d4 = direction(p1, p2, p4);

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }

  return false;
}

/**
 * Calculate direction for intersection test
 */
function direction(p1: Point2D, p2: Point2D, p3: Point2D): number {
  return (p3.x - p1.x) * (p2.y - p1.y) - (p2.x - p1.x) * (p3.y - p1.y);
}

/**
 * Validate polygon topology
 */
function validatePolygonTopology(
  polygon: Point2D[],
  name: string,
  entityId?: string
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Check minimum vertices
  if (!hasMinimumVertices(polygon)) {
    issues.push({
      severity: 'error',
      category: 'topology',
      message: `${name} has insufficient vertices (minimum ${MIN_POLYGON_VERTICES})`,
      entityId,
      suggestedFix: 'Add more vertices to define the shape'
    });
  }

  // Check if closed
  if (!isPolygonClosed(polygon)) {
    issues.push({
      severity: 'error',
      category: 'topology',
      message: `${name} is not closed (first and last points don't match)`,
      entityId,
      suggestedFix: 'Ensure polygon is closed by matching first and last vertices'
    });
  }

  // Check for degenerate edges
  if (hasDegenerateEdges(polygon)) {
    issues.push({
      severity: 'warning',
      category: 'topology',
      message: `${name} has edges shorter than ${MIN_EDGE_LENGTH}m`,
      entityId,
      suggestedFix: 'Remove or extend short edges'
    });
  }

  // Check for self-intersection
  if (isSelfIntersecting(polygon)) {
    issues.push({
      severity: 'error',
      category: 'topology',
      message: `${name} is self-intersecting`,
      entityId,
      suggestedFix: 'Remove overlapping edges'
    });
  }

  // Check vertex count sanity
  if (polygon.length > MAX_POLYGON_VERTICES) {
    issues.push({
      severity: 'warning',
      category: 'topology',
      message: `${name} has unusually high vertex count (${polygon.length})`,
      entityId,
      suggestedFix: 'Consider simplifying the polygon'
    });
  }

  return issues;
}

// ============================================================================
// DIMENSIONAL VALIDATION
// ============================================================================

/**
 * Validate door dimensions
 */
function validateDoorDimensions(door: Door): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Check minimum width
  const minWidth = door.isMain ? MIN_DOOR_WIDTH_MAIN : MIN_DOOR_WIDTH;
  if (door.width < minWidth) {
    issues.push({
      severity: 'error',
      category: 'dimensions',
      message: `Door "${door.name}" width (${door.width.toFixed(2)}m) is below minimum ${minWidth}m`,
      entityId: door.id,
      entityType: 'door',
      suggestedFix: `Increase width to at least ${minWidth}m`
    });
  }

  // Check minimum height
  if (door.height < MIN_DOOR_HEIGHT) {
    issues.push({
      severity: 'error',
      category: 'dimensions',
      message: `Door "${door.name}" height (${door.height.toFixed(2)}m) is below minimum ${MIN_DOOR_HEIGHT}m`,
      entityId: door.id,
      entityType: 'door',
      suggestedFix: `Increase height to at least ${MIN_DOOR_HEIGHT}m`
    });
  }

  // Warning for narrow main entrance
  if (door.isMain && door.width < 1.0) {
    issues.push({
      severity: 'warning',
      category: 'dimensions',
      message: `Main entrance "${door.name}" is narrower than recommended 1.0m`,
      entityId: door.id,
      entityType: 'door',
      suggestedFix: 'Consider widening to 1.0m for better accessibility'
    });
  }

  return issues;
}

/**
 * Validate room dimensions
 */
function validateRoomDimensions(room: Room): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Check minimum dimension (width or length)
  const minDimension = Math.min(room.dimensions.length, room.dimensions.width);
  if (minDimension < MIN_ROOM_WIDTH) {
    issues.push({
      severity: 'error',
      category: 'dimensions',
      message: `Room "${room.name}" has dimension ${minDimension.toFixed(2)}m below minimum ${MIN_ROOM_WIDTH}m`,
      entityId: room.id,
      entityType: 'room',
      suggestedFix: `Increase minimum dimension to at least ${MIN_ROOM_WIDTH}m`
    });
  }

  // Check minimum area by room type
  let minArea: number | undefined;
  let roomTypeName: string;

  switch (room.type) {
    case 'bedroom':
      minArea = MIN_ROOM_AREA_BEDROOM;
      roomTypeName = 'bedroom';
      break;
    case 'living':
      minArea = MIN_ROOM_AREA_LIVING;
      roomTypeName = 'living room';
      break;
    case 'kitchen':
      minArea = MIN_ROOM_AREA_KITCHEN;
      roomTypeName = 'kitchen';
      break;
    case 'bathroom':
      minArea = MIN_ROOM_AREA_BATHROOM;
      roomTypeName = 'bathroom';
      break;
  }

  if (minArea && room.area < minArea) {
    issues.push({
      severity: 'error',
      category: 'dimensions',
      message: `${roomTypeName.charAt(0).toUpperCase() + roomTypeName.slice(1)} "${room.name}" area (${room.area.toFixed(2)}m²) is below minimum ${minArea}m²`,
      entityId: room.id,
      entityType: 'room',
      suggestedFix: `Increase area to at least ${minArea}m²`
    });
  }

  // Check aspect ratio (warn if too extreme)
  const aspectRatio = Math.max(room.dimensions.length, room.dimensions.width) /
                       Math.min(room.dimensions.length, room.dimensions.width);

  if (aspectRatio > 3.0) {
    issues.push({
      severity: 'warning',
      category: 'dimensions',
      message: `Room "${room.name}" has extreme aspect ratio ${aspectRatio.toFixed(1)}:1`,
      entityId: room.id,
      entityType: 'room',
      suggestedFix: 'Consider making room proportions more balanced'
    });
  }

  return issues;
}

/**
 * Validate corridor widths (hallways)
 */
function validateCorridorDimensions(room: Room): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (room.type !== 'hallway') return issues;

  const minDimension = Math.min(room.dimensions.length, room.dimensions.width);

  // Check minimum corridor width
  if (minDimension < MIN_CORRIDOR_WIDTH) {
    issues.push({
      severity: 'error',
      category: 'dimensions',
      message: `Corridor "${room.name}" width (${minDimension.toFixed(2)}m) is below minimum ${MIN_CORRIDOR_WIDTH}m`,
      entityId: room.id,
      entityType: 'room',
      suggestedFix: `Increase width to at least ${MIN_CORRIDOR_WIDTH}m`
    });
  }

  // Warning for accessible corridors
  if (minDimension < MIN_CORRIDOR_WIDTH_ACCESSIBLE) {
    issues.push({
      severity: 'warning',
      category: 'dimensions',
      message: `Corridor "${room.name}" width (${minDimension.toFixed(2)}m) is below accessible width ${MIN_CORRIDOR_WIDTH_ACCESSIBLE}m`,
      entityId: room.id,
      entityType: 'room',
      suggestedFix: 'Consider widening for wheelchair accessibility'
    });
  }

  return issues;
}

/**
 * Validate ceiling heights
 */
function validateCeilingHeight(level: Level): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!level.isHabitable) return issues;

  // Check minimum ceiling height
  if (level.ceilingHeight < MIN_CEILING_HEIGHT) {
    issues.push({
      severity: 'error',
      category: 'dimensions',
      message: `Level "${level.name}" ceiling height (${level.ceilingHeight.toFixed(2)}m) is below minimum ${MIN_CEILING_HEIGHT}m`,
      entityId: level.id,
      entityType: 'level',
      suggestedFix: `Increase ceiling height to at least ${MIN_CEILING_HEIGHT}m`
    });
  }

  // Warning for low ceilings
  if (level.ceilingHeight < MIN_CEILING_HEIGHT_HABITABLE) {
    issues.push({
      severity: 'warning',
      category: 'dimensions',
      message: `Level "${level.name}" ceiling height (${level.ceilingHeight.toFixed(2)}m) is below recommended ${MIN_CEILING_HEIGHT_HABITABLE}m`,
      entityId: level.id,
      entityType: 'level',
      suggestedFix: 'Consider increasing for better comfort'
    });
  }

  return issues;
}

// ============================================================================
// WINDOW-TO-WALL RATIO (WWR) VALIDATION
// ============================================================================

/**
 * Calculate exterior wall area for a level
 */
function calculateExteriorWallArea(level: Level, walls: Wall[]): number {
  const levelWalls = walls.filter(w => w.levelId === level.id && w.type === 'exterior');

  let totalArea = 0;
  for (const wall of levelWalls) {
    totalArea += wall.length * wall.height;
  }

  return totalArea;
}

/**
 * Calculate total window area for a level
 */
function calculateWindowArea(level: Level, windows: Window[]): number {
  const levelWindows = windows.filter(w => w.levelId === level.id);

  let totalArea = 0;
  for (const window of levelWindows) {
    totalArea += window.width * window.height;
  }

  return totalArea;
}

/**
 * Validate Window-to-Wall Ratio (WWR)
 */
function validateWWR(state: DesignState): {
  valid: boolean;
  issues: ValidationIssue[];
  ratio?: number;
} {
  const issues: ValidationIssue[] = [];

  // Calculate overall WWR
  let totalWallArea = 0;
  let totalWindowArea = 0;

  for (const level of state.levels) {
    if (!level.isHabitable) continue;

    const wallArea = calculateExteriorWallArea(level, state.walls);
    const windowArea = calculateWindowArea(level, state.windows);

    totalWallArea += wallArea;
    totalWindowArea += windowArea;
  }

  if (totalWallArea === 0) {
    issues.push({
      severity: 'error',
      category: 'wwr',
      message: 'No exterior walls found for WWR calculation',
      suggestedFix: 'Add exterior walls to the design'
    });
    return { valid: false, issues };
  }

  const wwr = totalWindowArea / totalWallArea;

  // Check WWR range
  if (wwr < MIN_WWR) {
    issues.push({
      severity: 'error',
      category: 'wwr',
      message: `Window-to-Wall Ratio (${(wwr * 100).toFixed(1)}%) is below minimum ${(MIN_WWR * 100)}%`,
      suggestedFix: 'Add more windows or increase window sizes'
    });
  } else if (wwr > MAX_WWR) {
    issues.push({
      severity: 'error',
      category: 'wwr',
      message: `Window-to-Wall Ratio (${(wwr * 100).toFixed(1)}%) exceeds maximum ${(MAX_WWR * 100)}%`,
      suggestedFix: 'Reduce window sizes or add more solid wall area'
    });
  } else if (wwr < OPTIMAL_WWR - 0.05 || wwr > OPTIMAL_WWR + 0.05) {
    issues.push({
      severity: 'info',
      category: 'wwr',
      message: `Window-to-Wall Ratio (${(wwr * 100).toFixed(1)}%) is acceptable but not optimal (${(OPTIMAL_WWR * 100)}%)`,
      suggestedFix: `Adjust windows to approach ${(OPTIMAL_WWR * 100)}% for optimal balance`
    });
  }

  return {
    valid: wwr >= MIN_WWR && wwr <= MAX_WWR,
    issues,
    ratio: wwr
  };
}

// ============================================================================
// CIRCULATION VALIDATION
// ============================================================================

/**
 * Validate entrance door exists
 */
function validateEntranceDoor(doors: Door[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const entranceDoors = doors.filter(d => d.isMain);

  if (entranceDoors.length === 0) {
    issues.push({
      severity: 'error',
      category: 'circulation',
      message: 'No main entrance door found',
      suggestedFix: 'Add a main entrance door on ground floor'
    });
  } else if (entranceDoors.length > 1) {
    issues.push({
      severity: 'warning',
      category: 'circulation',
      message: `Multiple main entrance doors found (${entranceDoors.length})`,
      suggestedFix: 'Typically only one main entrance should be marked'
    });
  }

  return issues;
}

/**
 * Validate room has required natural light (window)
 */
function validateNaturalLight(state: DesignState): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const room of state.rooms) {
    if (!room.requiresNaturalLight) continue;

    const roomWindows = state.windows.filter(w => w.roomId === room.id);

    if (roomWindows.length === 0) {
      issues.push({
        severity: 'error',
        category: 'circulation',
        message: `Room "${room.name}" requires natural light but has no windows`,
        entityId: room.id,
        entityType: 'room',
        suggestedFix: 'Add at least one window to this room'
      });
    }
  }

  return issues;
}

/**
 * Validate egress (all rooms accessible)
 */
function validateEgress(state: DesignState): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Check that all rooms have doors
  for (const room of state.rooms) {
    if (room.type === 'hallway' || room.type === 'entry') continue;

    if (room.doors.length === 0) {
      issues.push({
        severity: 'error',
        category: 'circulation',
        message: `Room "${room.name}" has no doors (no egress)`,
        entityId: room.id,
        entityType: 'room',
        suggestedFix: 'Add at least one door for access'
      });
    }
  }

  return issues;
}

// ============================================================================
// COMPLIANCE VALIDATION
// ============================================================================

/**
 * Validate ground floor has entrance
 */
function validateGroundFloorEntrance(state: DesignState): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const groundLevel = state.levels.find(l => l.index === 0);
  if (!groundLevel) return issues;

  if (!groundLevel.hasEntranceDoor) {
    issues.push({
      severity: 'error',
      category: 'compliance',
      message: 'Ground floor does not have an entrance door',
      entityId: groundLevel.id,
      suggestedFix: 'Add main entrance door to ground floor'
    });
  }

  return issues;
}

/**
 * Validate bedroom privacy (not adjacent to public spaces)
 */
function validateBedroomPrivacy(state: DesignState): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const bedrooms = state.rooms.filter(r => r.type === 'bedroom');

  for (const bedroom of bedrooms) {
    for (const adjRoomId of bedroom.adjacentRooms) {
      const adjRoom = state.rooms.find(r => r.id === adjRoomId);
      if (!adjRoom) continue;

      if (adjRoom.type === 'living' || adjRoom.type === 'kitchen') {
        issues.push({
          severity: 'warning',
          category: 'compliance',
          message: `Bedroom "${bedroom.name}" is directly adjacent to ${adjRoom.type} (privacy concern)`,
          entityId: bedroom.id,
          entityType: 'room',
          suggestedFix: 'Consider adding buffer space (hallway) between bedroom and public areas'
        });
      }
    }
  }

  return issues;
}

// ============================================================================
// MAIN VALIDATION FUNCTION
// ============================================================================

/**
 * Validate complete design state
 *
 * @param state - The design state to validate
 * @returns Validation result with issues categorized by type
 */
export function validateDesign(state: DesignState): ValidationResult {
  const issues: ValidationIssue[] = [];

  // ========================================================================
  // TOPOLOGY VALIDATION
  // ========================================================================

  const topologyIssues: ValidationIssue[] = [];

  // Validate site boundary
  if (state.site.boundaryLocal.length > 0) {
    topologyIssues.push(...validatePolygonTopology(
      state.site.boundaryLocal,
      'Site boundary'
    ));
  }

  // Validate level footprints
  for (const level of state.levels) {
    topologyIssues.push(...validatePolygonTopology(
      level.footprint,
      `Level "${level.name}" footprint`,
      level.id
    ));
  }

  // Validate room polygons
  for (const room of state.rooms) {
    topologyIssues.push(...validatePolygonTopology(
      room.polygon,
      `Room "${room.name}"`,
      room.id
    ));
  }

  issues.push(...topologyIssues);

  // ========================================================================
  // DIMENSIONAL VALIDATION
  // ========================================================================

  const dimensionIssues: ValidationIssue[] = [];

  // Validate doors
  for (const door of state.doors) {
    dimensionIssues.push(...validateDoorDimensions(door));
  }

  // Validate rooms
  for (const room of state.rooms) {
    dimensionIssues.push(...validateRoomDimensions(room));
    dimensionIssues.push(...validateCorridorDimensions(room));
  }

  // Validate ceiling heights
  for (const level of state.levels) {
    dimensionIssues.push(...validateCeilingHeight(level));
  }

  issues.push(...dimensionIssues);

  // ========================================================================
  // WWR VALIDATION
  // ========================================================================

  const wwrValidation = validateWWR(state);
  issues.push(...wwrValidation.issues);

  // ========================================================================
  // CIRCULATION VALIDATION
  // ========================================================================

  const circulationIssues: ValidationIssue[] = [];

  circulationIssues.push(...validateEntranceDoor(state.doors));
  circulationIssues.push(...validateNaturalLight(state));
  circulationIssues.push(...validateEgress(state));

  issues.push(...circulationIssues);

  // ========================================================================
  // COMPLIANCE VALIDATION
  // ========================================================================

  const complianceIssues: ValidationIssue[] = [];

  complianceIssues.push(...validateGroundFloorEntrance(state));
  complianceIssues.push(...validateBedroomPrivacy(state));

  issues.push(...complianceIssues);

  // ========================================================================
  // CALCULATE SUMMARY
  // ========================================================================

  const errors = issues.filter(i => i.severity === 'error').length;
  const warnings = issues.filter(i => i.severity === 'warning').length;
  const info = issues.filter(i => i.severity === 'info').length;

  const valid = errors === 0;

  // Calculate score (100 - deductions)
  let score = 100;
  score -= errors * 10; // -10 per error
  score -= warnings * 2; // -2 per warning
  score -= info * 0.5; // -0.5 per info
  score = Math.max(0, Math.min(100, score)); // Clamp 0-100

  // ========================================================================
  // RETURN RESULT
  // ========================================================================

  return {
    valid,
    score,
    issues,
    summary: {
      errors,
      warnings,
      info
    },
    details: {
      topology: {
        valid: topologyIssues.filter(i => i.severity === 'error').length === 0,
        issues: topologyIssues
      },
      dimensions: {
        valid: dimensionIssues.filter(i => i.severity === 'error').length === 0,
        issues: dimensionIssues
      },
      wwr: {
        valid: wwrValidation.valid,
        issues: wwrValidation.issues,
        ratio: wwrValidation.ratio
      },
      circulation: {
        valid: circulationIssues.filter(i => i.severity === 'error').length === 0,
        issues: circulationIssues
      },
      compliance: {
        valid: complianceIssues.filter(i => i.severity === 'error').length === 0,
        issues: complianceIssues
      }
    }
  };
}

// ============================================================================
// HELPER EXPORTS
// ============================================================================

/**
 * Check if design is valid (no errors)
 */
export function isDesignValid(state: DesignState): boolean {
  const result = validateDesign(state);
  return result.valid;
}

/**
 * Get validation score (0-100)
 */
export function getValidationScore(state: DesignState): number {
  const result = validateDesign(state);
  return result.score;
}

/**
 * Get only errors (filter out warnings and info)
 */
export function getValidationErrors(state: DesignState): ValidationIssue[] {
  const result = validateDesign(state);
  return result.issues.filter(i => i.severity === 'error');
}

/**
 * Get summary statistics
 */
export function getValidationSummary(state: DesignState): {
  valid: boolean;
  score: number;
  errors: number;
  warnings: number;
  info: number;
} {
  const result = validateDesign(state);
  return {
    valid: result.valid,
    score: result.score,
    ...result.summary
  };
}

// Re-export types
export type {
  ValidationResult,
  ValidationIssue,
  ValidationSeverity
};
