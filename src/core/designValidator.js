/**
 * Design Validator
 * Validates topology, dimensions, materials, and adjacency before rendering
 */

/**
 * Main validation function
 */
export function validateDesign(design) {
  const errors = [];
  const warnings = [];

  // 1. Topology validation
  const topoErrors = validateTopology(design);
  errors.push(...topoErrors);

  // 2. Dimension validation
  const dimErrors = validateDimensions(design);
  errors.push(...dimErrors);

  // 3. Material compatibility
  const matWarnings = validateMaterials(design);
  warnings.push(...matWarnings);

  // 4. Room adjacency (if rooms defined)
  const adjWarnings = validateAdjacency(design);
  warnings.push(...adjWarnings);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    autoFixes: generateAutoFixes(errors, design)
  };
}

/**
 * Validate topology (rooms fit within building, no overlaps)
 */
function validateTopology(design) {
  const errors = [];

  if (design.rooms.length === 0) {
    // Not an error, rooms can be added later
    return errors;
  }

  const footprint = design.dimensions.length * design.dimensions.width;

  // Check ground floor rooms fit within footprint
  const groundRooms = design.rooms.filter(r => r.level === 0);
  const groundArea = sumRoomAreas(groundRooms);

  if (groundArea > footprint * 1.1) {
    errors.push({
      type: 'TOPOLOGY',
      severity: 'ERROR',
      message: `Ground floor rooms (${groundArea.toFixed(1)}m²) exceed building footprint (${footprint.toFixed(1)}m²)`,
      fix: 'Reduce room sizes or increase building dimensions'
    });
  }

  // Check circulation space (minimum 15% for hallways/stairs)
  if (groundArea > footprint * 0.85) {
    errors.push({
      type: 'TOPOLOGY',
      severity: 'WARNING',
      message: `Insufficient circulation space (${((footprint - groundArea) / footprint * 100).toFixed(1)}% vs 15% minimum)`,
      fix: 'Reduce room sizes to allow for hallways and stairs'
    });
  }

  // Check each room has valid polygon
  design.rooms.forEach(room => {
    if (!room.poly || !Array.isArray(room.poly)) {
      errors.push({
        type: 'TOPOLOGY',
        severity: 'ERROR',
        message: `Room "${room.name}" missing polygon definition`,
        fix: 'Add polygon coordinates to room'
      });
    } else if (room.poly.length < 3) {
      errors.push({
        type: 'TOPOLOGY',
        severity: 'ERROR',
        message: `Room "${room.name}" polygon has fewer than 3 points`,
        fix: 'Room polygons must have at least 3 vertices'
      });
    }
  });

  return errors;
}

/**
 * Validate dimensions (room sizes, floor heights, clearances)
 */
function validateDimensions(design) {
  const errors = [];

  // Check building dimensions are reasonable
  if (design.dimensions.length < 3 || design.dimensions.length > 50) {
    errors.push({
      type: 'DIMENSIONS',
      severity: 'ERROR',
      message: `Building length ${design.dimensions.length}m outside reasonable range (3-50m)`,
      fix: 'Adjust building length to 3-50m'
    });
  }

  if (design.dimensions.width < 3 || design.dimensions.width > 50) {
    errors.push({
      type: 'DIMENSIONS',
      severity: 'ERROR',
      message: `Building width ${design.dimensions.width}m outside reasonable range (3-50m)`,
      fix: 'Adjust building width to 3-50m'
    });
  }

  // Check floor heights
  design.levels.forEach((level, idx) => {
    const heightM = level.height_mm / 1000;
    if (heightM < 2.3) {
      errors.push({
        type: 'DIMENSIONS',
        severity: 'ERROR',
        message: `Floor ${idx} height ${heightM.toFixed(2)}m < 2.3m minimum`,
        fix: `Increase floor ${idx} height to 2.3m minimum`
      });
    }
    if (heightM > 5.0) {
      errors.push({
        type: 'DIMENSIONS',
        severity: 'WARNING',
        message: `Floor ${idx} height ${heightM.toFixed(2)}m > 5.0m (unusually tall)`,
        fix: 'Verify floor height is intentional'
      });
    }
  });

  // Check room dimensions
  design.rooms.forEach(room => {
    if (!room.poly || room.poly.length === 0) return;

    // Calculate room bounding box
    const xs = room.poly.map(p => p[0] / 1000); // Convert mm to m
    const ys = room.poly.map(p => p[1] / 1000);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const lengthM = maxX - minX;
    const widthM = maxY - minY;

    // Minimum room size: 2.4m × 2.4m for habitable rooms
    if (room.name.toLowerCase().includes('bedroom') || room.name.toLowerCase().includes('living')) {
      if (lengthM < 2.4 || widthM < 2.4) {
        errors.push({
          type: 'DIMENSIONS',
          severity: 'ERROR',
          message: `Room "${room.name}" too small (${lengthM.toFixed(1)}m × ${widthM.toFixed(1)}m). Minimum 2.4m × 2.4m for habitable rooms`,
          fix: `Increase ${room.name} to at least 2.4m × 2.4m`
        });
      }
    }

    // Bathroom minimum: 1.8m × 1.5m
    if (room.name.toLowerCase().includes('bathroom') || room.name.toLowerCase().includes('wc')) {
      if (lengthM < 1.8 || widthM < 1.5) {
        errors.push({
          type: 'DIMENSIONS',
          severity: 'ERROR',
          message: `Bathroom "${room.name}" too small (${lengthM.toFixed(1)}m × ${widthM.toFixed(1)}m). Minimum 1.8m × 1.5m`,
          fix: 'Increase bathroom size'
        });
      }
    }
  });

  // Check door widths
  design.doors.forEach((door, idx) => {
    if (door.width_mm < 800) {
      errors.push({
        type: 'DIMENSIONS',
        severity: 'ERROR',
        message: `Door ${idx} width ${door.width_mm}mm < 800mm minimum`,
        fix: 'Increase door width to 800mm minimum'
      });
    }
  });

  return errors;
}

/**
 * Validate material compatibility
 */
function validateMaterials(design) {
  const warnings = [];

  if (!design.dna?.materials) return warnings;

  const materials = design.dna.materials;

  // Check window-to-wall ratio
  if (design.dna.wwr < 0.15) {
    warnings.push({
      type: 'MATERIALS',
      severity: 'WARNING',
      message: `Window-to-wall ratio ${(design.dna.wwr * 100).toFixed(0)}% is low (< 15%) - rooms may be dark`,
      fix: 'Increase window area or reduce wall area'
    });
  }

  if (design.dna.wwr > 0.55) {
    warnings.push({
      type: 'MATERIALS',
      severity: 'WARNING',
      message: `Window-to-wall ratio ${(design.dna.wwr * 100).toFixed(0)}% is high (> 55%) - thermal performance may suffer`,
      fix: 'Reduce window area or increase wall area'
    });
  }

  // Check material compatibility (example rules)
  const exteriorPrimary = materials.exterior?.primary?.toLowerCase() || '';
  const roofMaterial = design.dna.roof?.material?.toLowerCase() || '';

  const incompatible = {
    'glass': ['clay tiles', 'slate'],
    'timber': ['concrete tiles']
  };

  Object.keys(incompatible).forEach(ext => {
    if (exteriorPrimary.includes(ext)) {
      incompatible[ext].forEach(roof => {
        if (roofMaterial.includes(roof.toLowerCase())) {
          warnings.push({
            type: 'MATERIALS',
            severity: 'WARNING',
            message: `Unusual combination: ${materials.exterior.primary} walls with ${design.dna.roof.material} roof`,
            fix: 'Consider alternative material pairing for better aesthetic'
          });
        }
      });
    }
  });

  return warnings;
}

/**
 * Validate room adjacency and relationships
 */
function validateAdjacency(design) {
  const warnings = [];

  if (design.rooms.length === 0) return warnings;

  // Group rooms by floor
  const roomsByFloor = {};
  design.rooms.forEach(room => {
    if (!roomsByFloor[room.level]) roomsByFloor[room.level] = [];
    roomsByFloor[room.level].push(room);
  });

  // Check ground floor has main entrance
  const groundRooms = roomsByFloor[0] || [];
  const hasEntrance = design.doors.some(door => !door.room_b); // room_b undefined = exterior door

  if (groundRooms.length > 0 && !hasEntrance) {
    warnings.push({
      type: 'ADJACENCY',
      severity: 'WARNING',
      message: 'No main entrance door defined on ground floor',
      fix: 'Add entrance door from exterior to main room'
    });
  }

  // Check bathrooms and kitchens aren't adjacent (sanitation)
  const groundRoomNames = groundRooms.map(r => r.name.toLowerCase());
  const hasBathroom = groundRoomNames.some(n => n.includes('bathroom') || n.includes('wc'));
  const hasKitchen = groundRoomNames.some(n => n.includes('kitchen'));

  if (hasBathroom && hasKitchen) {
    warnings.push({
      type: 'ADJACENCY',
      severity: 'WARNING',
      message: 'Bathroom and kitchen on same floor - ensure proper separation and no direct connection',
      fix: 'Verify bathroom does not open directly to kitchen'
    });
  }

  // Check upper floors have bedrooms
  const upperRooms = roomsByFloor[1] || [];
  if (upperRooms.length > 0) {
    const hasBedroom = upperRooms.some(r => r.name.toLowerCase().includes('bedroom'));
    if (!hasBedroom) {
      warnings.push({
        type: 'ADJACENCY',
        severity: 'WARNING',
        message: 'Upper floor has no bedrooms - typical residential layout has bedrooms on upper floor',
        fix: 'Consider adding bedrooms to upper floor'
      });
    }
  }

  return warnings;
}

/**
 * Generate auto-fixes for common errors
 */
function generateAutoFixes(errors, design) {
  const fixes = [];

  errors.forEach(error => {
    if (error.type === 'DIMENSIONS') {
      // Could auto-adjust dimensions
      fixes.push({
        type: 'AUTO_FIX',
        error: error.message,
        action: error.fix,
        canAutoApply: false // Manual review needed
      });
    }

    if (error.type === 'TOPOLOGY' && error.message.includes('exceed building footprint')) {
      // Could auto-scale rooms proportionally
      fixes.push({
        type: 'AUTO_FIX',
        error: error.message,
        action: 'Scale all room dimensions by 0.85 to fit within footprint',
        canAutoApply: true
      });
    }
  });

  return fixes;
}

/**
 * Apply auto-fixes to design
 */
export function applyAutoFixes(design, fixes) {
  const fixedDesign = JSON.parse(JSON.stringify(design)); // Deep clone

  fixes.forEach(fix => {
    if (!fix.canAutoApply) return;

    if (fix.action.includes('Scale all room')) {
      // Scale room polygons
      fixedDesign.rooms.forEach(room => {
        if (room.poly) {
          room.poly = room.poly.map(([x, y]) => [x * 0.85, y * 0.85]);
          room.area = room.area * 0.85 * 0.85;
        }
      });
      console.log('🔧 Auto-fix: Scaled rooms to fit within building footprint');
    }
  });

  return fixedDesign;
}

/**
 * Helper: Sum room areas
 */
function sumRoomAreas(rooms) {
  return rooms.reduce((sum, room) => sum + (room.area || 0), 0);
}
