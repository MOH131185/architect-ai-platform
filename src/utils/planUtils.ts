/**
 * Utility functions for working with PlanJSON
 */

import type { PlanJSON, ValidationResult } from '../types/PlanJSON';
import CryptoJS from 'crypto-js';

/**
 * Generate a stable seed from project ID
 * Uses CRC32-like hash to ensure same project ID always gets same seed
 */
export function baseSeedFor(projectId: string): number {
  // Simple hash function that produces a 6-digit number
  let hash = 0;
  for (let i = 0; i < projectId.length; i++) {
    const char = projectId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash) % 1000000; // 6-digit number
}

/**
 * Generate per-view seed from base seed
 * @param baseSeed - Base project seed
 * @param viewIndex - View index (0-12 for 13 views)
 */
export function seedForView(baseSeed: number, viewIndex: number): number {
  return baseSeed + viewIndex;
}

/**
 * Compute SHA-256 hash of PlanJSON
 * Used for version tracking and change detection
 */
export function hashPlanJSON(plan: PlanJSON): string {
  // Create canonical JSON (sorted keys, no whitespace)
  const canonical = JSON.stringify(plan, Object.keys(plan).sort());
  return CryptoJS.SHA256(canonical).toString();
}

/**
 * Validate PlanJSON structure and constraints
 */
export function validatePlanJSON(plan: PlanJSON): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Site validation
  if (!plan.site) {
    errors.push('Missing site geometry');
  } else {
    if (!plan.site.polygon || plan.site.polygon.length < 3) {
      errors.push('Site polygon must have at least 3 points');
    }
    if (plan.site.width_m <= 0 || plan.site.depth_m <= 0) {
      errors.push('Site dimensions must be positive');
    }
    if (plan.site.area_m2 <= 0) {
      errors.push('Site area must be positive');
    }
    if (plan.site.north_deg < 0 || plan.site.north_deg >= 360) {
      errors.push('North direction must be 0-359 degrees');
    }
  }

  // 2. Levels validation
  if (!plan.levels || plan.levels.length === 0) {
    errors.push('At least one level required');
  } else {
    plan.levels.forEach((level, idx) => {
      if (level.index !== idx) {
        warnings.push(`Level ${level.name} index mismatch: expected ${idx}, got ${level.index}`);
      }
      if (level.height_m <= 0) {
        errors.push(`Level ${level.name} height must be positive`);
      }
      if (level.rooms.length === 0) {
        warnings.push(`Level ${level.name} has no rooms`);
      }

      // Room validation
      level.rooms.forEach(room => {
        if (!room.id) {
          errors.push(`Room ${room.name} missing ID`);
        }
        if (!room.poly || room.poly.length < 3) {
          errors.push(`Room ${room.name} polygon invalid`);
        }
        if (room.area_m2 <= 0) {
          errors.push(`Room ${room.name} area must be positive`);
        }

        // Door validation
        room.doors.forEach((door, dIdx) => {
          if (door.width_m <= 0 || door.width_m > 3) {
            warnings.push(`Room ${room.name} door ${dIdx} width unusual: ${door.width_m}m`);
          }
        });

        // Window validation
        room.windows.forEach((window, wIdx) => {
          if (window.sill_m < 0 || window.sill_m >= level.height_m) {
            errors.push(`Room ${room.name} window ${wIdx} sill height out of range`);
          }
          if (window.head_m <= window.sill_m || window.head_m > level.height_m) {
            errors.push(`Room ${room.name} window ${wIdx} head height invalid`);
          }
        });
      });
    });
  }

  // 3. Structure validation
  if (!plan.structure) {
    warnings.push('No structural system defined');
  }

  // 4. Materials validation
  if (!plan.materials) {
    errors.push('Material palette required');
  } else {
    if (!plan.materials.paletteId) {
      warnings.push('Material palette missing ID');
    }
    if (!plan.materials.roof.pitch_deg || plan.materials.roof.pitch_deg < 0 || plan.materials.roof.pitch_deg > 60) {
      warnings.push(`Roof pitch unusual: ${plan.materials.roof.pitch_deg}°`);
    }
  }

  // 5. Metadata validation
  if (!plan.metadata) {
    errors.push('Metadata required');
  } else {
    if (!plan.metadata.projectId) {
      errors.push('Project ID required');
    }
    if (!plan.metadata.seed || plan.metadata.seed < 0) {
      errors.push('Valid seed required');
    }
    if (!plan.metadata.hash) {
      warnings.push('Plan hash missing');
    }
    if (!plan.metadata.version) {
      warnings.push('Schema version missing');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Calculate area of polygon using shoelace formula
 */
export function calculatePolygonArea(polygon: [number, number][]): number {
  if (polygon.length < 3) return 0;

  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length;
    area += polygon[i][0] * polygon[j][1];
    area -= polygon[j][0] * polygon[i][1];
  }
  return Math.abs(area / 2);
}

/**
 * Calculate bounding box of polygon
 */
export function calculateBoundingBox(polygon: [number, number][]): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
} {
  if (polygon.length === 0) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 0, height: 0 };
  }

  let minX = polygon[0][0];
  let maxX = polygon[0][0];
  let minY = polygon[0][1];
  let maxY = polygon[0][1];

  for (const [x, y] of polygon) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }

  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY
  };
}

/**
 * Compute north direction from polygon orientation
 * Uses longest edge as presumed street frontage
 */
export function computeNorthFromPolygon(polygon: [number, number][]): number {
  if (polygon.length < 2) return 0;

  // Find longest edge
  let maxLength = 0;
  let longestEdgeAngle = 0;

  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length;
    const dx = polygon[j][0] - polygon[i][0];
    const dy = polygon[j][1] - polygon[i][1];
    const length = Math.sqrt(dx * dx + dy * dy);

    if (length > maxLength) {
      maxLength = length;
      // Calculate angle in degrees (0 = north, 90 = east)
      longestEdgeAngle = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
    }
  }

  return longestEdgeAngle;
}

/**
 * Snap coordinates to grid
 */
export function snapToGrid(value: number, gridSize: number = 0.1): number {
  return Math.round(value / gridSize) * gridSize;
}

/**
 * Generate room ID from name and level
 */
export function generateRoomId(levelIndex: number, roomName: string): string {
  const sanitized = roomName.toLowerCase().replace(/[^a-z0-9]/g, '_');
  return `L${levelIndex}_${sanitized}`;
}

/**
 * Count total windows and doors in plan
 */
export function countOpenings(plan: PlanJSON): {
  totalWindows: number;
  totalDoors: number;
  byLevel: Array<{ levelName: string; windows: number; doors: number }>;
} {
  const byLevel = plan.levels.map(level => ({
    levelName: level.name,
    windows: level.rooms.reduce((sum, room) => sum + room.windows.length, 0),
    doors: level.rooms.reduce((sum, room) => sum + room.doors.length, 0)
  }));

  return {
    totalWindows: byLevel.reduce((sum, l) => sum + l.windows, 0),
    totalDoors: byLevel.reduce((sum, l) => sum + l.doors, 0),
    byLevel
  };
}

/**
 * Create default material palette based on climate and style
 */
export function createDefaultPalette(
  climate: 'tropical' | 'temperate' | 'cold' | 'desert',
  style: string
): any {
  // Base palettes by climate
  const climatePalettes = {
    tropical: {
      walls: { exterior: 'White stucco #FFFFFF', interior: 'Light plaster #F5F5F5' },
      floor: { ground: 'Terracotta tiles #CD853F', upper: 'Bamboo #D2B48C' },
      roof: { material: 'Clay tiles', color: '#B22222', pitch_deg: 25 }
    },
    temperate: {
      walls: { exterior: 'Red brick #8B4513', interior: 'Painted drywall #F5F5F5' },
      floor: { ground: 'Oak hardwood #D2691E', upper: 'Oak hardwood #D2691E' },
      roof: { material: 'Slate tiles', color: '#2F4F4F', pitch_deg: 35 }
    },
    cold: {
      walls: { exterior: 'Insulated timber #8B7355', interior: 'Wood paneling #D2B48C' },
      floor: { ground: 'Concrete slab #C0C0C0', upper: 'Pine hardwood #DEB887' },
      roof: { material: 'Metal standing seam', color: '#2C3E50', pitch_deg: 45 }
    },
    desert: {
      walls: { exterior: 'Adobe #DEB887', interior: 'Earth plaster #F5DEB3' },
      floor: { ground: 'Polished concrete #C0C0C0', upper: 'Tile #CD853F' },
      roof: { material: 'Flat membrane', color: '#F5F5F5', pitch_deg: 5 }
    }
  };

  return {
    paletteId: `${climate}_${style.toLowerCase().replace(/\s+/g, '_')}`,
    name: `${style} for ${climate} climate`,
    ...climatePalettes[climate],
    openings: {
      frames: 'Aluminum #A9A9A9',
      glazing: 'Low-E double-pane'
    }
  };
}

export default {
  baseSeedFor,
  seedForView,
  hashPlanJSON,
  validatePlanJSON,
  calculatePolygonArea,
  calculateBoundingBox,
  computeNorthFromPolygon,
  snapToGrid,
  generateRoomId,
  countOpenings,
  createDefaultPalette
};
