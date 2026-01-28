/**
 * Sheet Layout Configuration
 * 
 * Externalized layout constants for A1 sheets:
 * - Panel positions and sizes
 * - Section titles and ordering
 * - Negative prompts
 * - Layout variants for different sheet types (ARCH, STRUCTURE, MEP)
 */

/**
 * A1 Sheet Layouts
 */
export const SHEET_LAYOUTS = {
  // UK RIBA Standard A1 Layout
  'uk-riba-standard': {
    name: 'UK RIBA Standard',
    sheetType: 'ARCH',
    aspectRatio: 1.414, // Landscape: 841mm × 594mm
    orientation: 'landscape',
    panels: [
      // Row 1
      { id: 'site-plan', name: 'Site Plan', row: 1, col: 1, width: 0.33, height: 0.20, type: 'overlay' },
      { id: '3d-hero', name: '3D Hero View', row: 1, col: 2, width: 0.33, height: 0.20, type: 'render' },
      { id: 'material-palette', name: 'Material Palette', row: 1, col: 3, width: 0.33, height: 0.20, type: 'data' },
      
      // Row 2
      { id: 'ground-floor', name: 'Ground Floor Plan', row: 2, col: 1, width: 0.33, height: 0.20, type: 'plan' },
      { id: 'first-floor', name: 'First Floor Plan', row: 2, col: 2, width: 0.33, height: 0.20, type: 'plan' },
      { id: 'axonometric', name: 'Axonometric', row: 2, col: 3, width: 0.33, height: 0.20, type: 'render' },
      
      // Row 3
      { id: 'north-elev', name: 'North Elevation', row: 3, col: 1, width: 0.33, height: 0.20, type: 'elevation' },
      { id: 'south-elev', name: 'South Elevation', row: 3, col: 2, width: 0.33, height: 0.20, type: 'elevation' },
      { id: 'project-data', name: 'Project Data', row: 3, col: 3, width: 0.33, height: 0.20, type: 'data' },
      
      // Row 4
      { id: 'east-elev', name: 'East Elevation', row: 4, col: 1, width: 0.33, height: 0.20, type: 'elevation' },
      { id: 'west-elev', name: 'West Elevation', row: 4, col: 2, width: 0.33, height: 0.20, type: 'elevation' },
      { id: 'environmental', name: 'Environmental', row: 4, col: 3, width: 0.33, height: 0.20, type: 'data' },
      
      // Row 5
      { id: 'section-a', name: 'Section A-A', row: 5, col: 1, width: 0.33, height: 0.20, type: 'section' },
      { id: 'section-b', name: 'Section B-B', row: 5, col: 2, width: 0.33, height: 0.20, type: 'section' },
      { id: 'title-block', name: 'Title Block', row: 5, col: 3, width: 0.33, height: 0.20, type: 'title' }
    ]
  },
  
  // Structural A1 Layout
  'uk-riba-structural': {
    name: 'UK RIBA Structural',
    sheetType: 'STRUCTURE',
    aspectRatio: 1.414,
    orientation: 'landscape',
    panels: [
      // Row 1
      { id: 'foundation-ga', name: 'Foundation GA', row: 1, col: 1, width: 0.33, height: 0.25, type: 'plan' },
      { id: 'frame-3d', name: 'Frame 3D View', row: 1, col: 2, width: 0.33, height: 0.25, type: 'render' },
      { id: 'legend-notes', name: 'Legend & Notes', row: 1, col: 3, width: 0.33, height: 0.25, type: 'data' },
      
      // Row 2
      { id: 'ground-struct', name: 'Ground Struct Plan', row: 2, col: 1, width: 0.33, height: 0.25, type: 'plan' },
      { id: 'first-struct', name: 'First Struct Plan', row: 2, col: 2, width: 0.33, height: 0.25, type: 'plan' },
      { id: 'roof-struct', name: 'Roof Struct Plan', row: 2, col: 3, width: 0.33, height: 0.25, type: 'plan' },
      
      // Row 3
      { id: 'long-section-struct', name: 'Longitudinal Section', row: 3, col: 1, width: 0.5, height: 0.25, type: 'section' },
      { id: 'trans-section-struct', name: 'Transverse Section', row: 3, col: 2, width: 0.5, height: 0.25, type: 'section' },
      
      // Row 4
      { id: 'detail-blowups', name: 'Detail Blow-ups', row: 4, col: 1, width: 0.33, height: 0.25, type: 'detail' },
      { id: 'schedule', name: 'Steel/RC Schedule', row: 4, col: 2, width: 0.33, height: 0.25, type: 'data' },
      { id: 'title-block-struct', name: 'Title Block', row: 4, col: 3, width: 0.33, height: 0.25, type: 'title' }
    ]
  },
  
  // MEP A1 Layout
  'uk-riba-mep': {
    name: 'UK RIBA MEP',
    sheetType: 'MEP',
    aspectRatio: 1.414,
    orientation: 'landscape',
    panels: [
      // Row 1
      { id: 'mep-key-plan', name: 'MEP Key Plan', row: 1, col: 1, width: 0.33, height: 0.25, type: 'plan' },
      { id: 'services-3d', name: '3D Services Coord', row: 1, col: 2, width: 0.33, height: 0.25, type: 'render' },
      { id: 'mep-legend', name: 'MEP Legend', row: 1, col: 3, width: 0.33, height: 0.25, type: 'data' },
      
      // Row 2
      { id: 'ground-mep', name: 'Ground MEP Plan', row: 2, col: 1, width: 0.33, height: 0.25, type: 'plan' },
      { id: 'first-mep', name: 'First MEP Plan', row: 2, col: 2, width: 0.33, height: 0.25, type: 'plan' },
      { id: 'roof-plant', name: 'Roof Plant / PV', row: 2, col: 3, width: 0.33, height: 0.25, type: 'plan' },
      
      // Row 3
      { id: 'ventilation', name: 'Ventilation Zones', row: 3, col: 1, width: 0.33, height: 0.25, type: 'diagram' },
      { id: 'heating-cooling', name: 'Heating/Cooling', row: 3, col: 2, width: 0.33, height: 0.25, type: 'diagram' },
      { id: 'electrical', name: 'Electrical Zones', row: 3, col: 3, width: 0.33, height: 0.25, type: 'diagram' },
      
      // Row 4
      { id: 'riser-diagrams', name: 'Riser Diagrams', row: 4, col: 1, width: 0.33, height: 0.25, type: 'diagram' },
      { id: 'schematics', name: 'Schematics', row: 4, col: 2, width: 0.33, height: 0.25, type: 'diagram' },
      { id: 'title-block-mep', name: 'Title Block', row: 4, col: 3, width: 0.33, height: 0.25, type: 'title' }
    ]
  }
};

/**
 * Base negative prompts by sheet type
 */
export const BASE_NEGATIVE_PROMPTS = {
  ARCH: `(multiple buildings:4.0), (house catalog:4.0), (sketch board:4.0), (perspective floor plan:4.0), (perspective elevation:4.0), (missing panel:4.0), (random site plan:4.0), (grid paper background:3.5), (placeholder boxes:3.5), (empty a1 sheet:4.0), (low quality:3.5), (blurry:3.5), (watermark:3.5), (text too small:3.5)`,
  
  STRUCTURE: `(interior furniture focus:3.5), (architectural rendering only:3.5), (missing structural grid:4.0), (soft sketch:3.0), (lighting-only render:3.0), (no columns:4.0), (no beams:4.0)`,
  
  MEP: `(no services shown:4.0), (pure architecture board:4.0), (furniture heavy:3.5), (loose sketch:3.0), (missing ducts:3.5), (no pipes:3.5), (no electrical:3.5)`
};

/**
 * Layout drift prevention negative prompts
 */
export const LAYOUT_DRIFT_NEGATIVES = `(replace entire sheet:4.0), (only floor plans:4.0), (grid of floor plans:4.0), (remove existing views:3.5), (complete redesign:3.0), (new layout:3.0), (rearranged sections:3.0), (moved views:2.5), (different grid:2.5), (changed spacing:2.5), (altered margins:2.5), (resized panels:2.5), (color palette changes:2.5), (font substitutions:2.5), (lineweight variations:2.5), (title block modifications:2.5), (different style:2.5), (material changes:2.5), (no AI-generated site plan:4.0), (no fake map:4.0), (no hallucinated context:4.0), (missing elevations:3.0), (missing sections:3.0), (missing 3D views:2.5)`;

/**
 * Section ordering by sheet type
 */
export const SECTION_ORDERING = {
  ARCH: [
    'site-plan',
    '3d-hero',
    'material-palette',
    'ground-floor',
    'first-floor',
    'axonometric',
    'north-elev',
    'south-elev',
    'project-data',
    'east-elev',
    'west-elev',
    'environmental',
    'section-a',
    'section-b',
    'title-block'
  ],
  
  STRUCTURE: [
    'foundation-ga',
    'frame-3d',
    'legend-notes',
    'ground-struct',
    'first-struct',
    'roof-struct',
    'long-section-struct',
    'trans-section-struct',
    'detail-blowups',
    'schedule',
    'title-block-struct'
  ],
  
  MEP: [
    'mep-key-plan',
    'services-3d',
    'mep-legend',
    'ground-mep',
    'first-mep',
    'roof-plant',
    'ventilation',
    'heating-cooling',
    'electrical',
    'riser-diagrams',
    'schematics',
    'title-block-mep'
  ]
};

/**
 * Get layout for sheet type
 * @param {string} sheetType - Sheet type (ARCH, STRUCTURE, MEP)
 * @param {string} layoutKey - Layout key (optional, defaults to uk-riba-standard)
 * @returns {Object} Layout configuration
 */
export function getLayoutForSheetType(sheetType = 'ARCH', layoutKey = null) {
  const upperType = sheetType.toUpperCase();
  
  // If specific layout key provided, use it
  if (layoutKey && SHEET_LAYOUTS[layoutKey]) {
    return SHEET_LAYOUTS[layoutKey];
  }
  
  // Otherwise, map sheet type to default layout
  const layoutMap = {
    ARCH: 'uk-riba-standard',
    STRUCTURE: 'uk-riba-structural',
    STRUCT: 'uk-riba-structural',
    MEP: 'uk-riba-mep'
  };
  
  const defaultLayoutKey = layoutMap[upperType] || 'uk-riba-standard';
  return SHEET_LAYOUTS[defaultLayoutKey];
}

/**
 * Get negative prompt for sheet type
 * @param {string} sheetType - Sheet type
 * @returns {string} Negative prompt
 */
export function getNegativePromptForSheetType(sheetType = 'ARCH') {
  const upperType = sheetType.toUpperCase();
  return BASE_NEGATIVE_PROMPTS[upperType] || BASE_NEGATIVE_PROMPTS.ARCH;
}

/**
 * Get section ordering for sheet type
 * @param {string} sheetType - Sheet type
 * @returns {Array<string>} Section IDs in order
 */
export function getSectionOrderingForSheetType(sheetType = 'ARCH') {
  const upperType = sheetType.toUpperCase();
  return SECTION_ORDERING[upperType] || SECTION_ORDERING.ARCH;
}

/**
 * Validate panel configuration
 * @param {Array} panels - Panel array
 * @returns {Object} Validation result
 */
export function validatePanelConfiguration(panels) {
  const errors = [];
  const warnings = [];
  
  if (!Array.isArray(panels) || panels.length === 0) {
    errors.push('No panels defined');
    return { valid: false, errors, warnings };
  }
  
  // Check for overlaps
  for (let i = 0; i < panels.length; i++) {
    for (let j = i + 1; j < panels.length; j++) {
      const p1 = panels[i];
      const p2 = panels[j];
      
      // Simple overlap check (row/col based)
      if (p1.row === p2.row && p1.col === p2.col) {
        errors.push(`Panels ${p1.id} and ${p2.id} overlap at row ${p1.row}, col ${p1.col}`);
      }
    }
  }
  
  // Check for required panel types
  const types = new Set(panels.map(p => p.type));
  const requiredTypes = ['plan', 'elevation', 'section', 'render', 'title'];
  
  for (const reqType of requiredTypes) {
    if (!types.has(reqType)) {
      warnings.push(`Missing required panel type: ${reqType}`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Compute panel pixel coordinates from normalized layout
 * @param {Object} layout - Layout configuration
 * @param {number} sheetWidth - Sheet width in pixels
 * @param {number} sheetHeight - Sheet height in pixels
 * @returns {Array} Panel coordinates in pixels
 */
export function computePanelCoordinates(layout, sheetWidth, sheetHeight) {
  if (!layout || !layout.panels) {
    return [];
  }
  
  return layout.panels.map(panel => {
    // Convert normalized positions to pixels
    const x = Math.round((panel.col - 1) * (sheetWidth / 3));
    const y = Math.round((panel.row - 1) * (sheetHeight / 5));
    const width = Math.round(panel.width * sheetWidth);
    const height = Math.round(panel.height * sheetHeight);
    
    return {
      id: panel.id,
      name: panel.name,
      type: panel.type,
      x,
      y,
      width,
      height,
      row: panel.row,
      col: panel.col,
      zOrder: panel.row * 10 + panel.col
    };
  });
}

const sheetLayoutConfig = {
  SHEET_LAYOUTS,
  BASE_NEGATIVE_PROMPTS,
  LAYOUT_DRIFT_NEGATIVES,
  SECTION_ORDERING,
  getLayoutForSheetType,
  getNegativePromptForSheetType,
  getSectionOrderingForSheetType,
  validatePanelConfiguration,
  computePanelCoordinates
};

export default sheetLayoutConfig;

