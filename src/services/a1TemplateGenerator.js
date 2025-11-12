/**
 * A1 Template Generator System
 *
 * Creates a structured grid template for professional A1 architectural sheets
 * with 15+ distinct panels for comprehensive project presentation.
 *
 * Template Layout (5 columns × 3-4 rows):
 * ┌──────────┬──────────────────────┬──────────┬──────────┬──────────┐
 * │ SITE MAP │    3D HERO VIEW      │ MATERIAL │ INTERIOR │  CLIMATE │
 * ├──────────┼──────────┬───────────┼──────────┼──────────┼──────────┤
 * │  GROUND  │   FIRST  │  SECOND   │   AXON   │  DETAIL  │  SPECS   │
 * │  FLOOR   │  FLOOR   │  FLOOR    │    3D    │  VIEWS   │          │
 * ├──────────┼──────────┼───────────┼──────────┼──────────┼──────────┤
 * │  NORTH   │  SOUTH   │   EAST    │   WEST   │ SECTION  │ SECTION  │
 * │   ELEV   │   ELEV   │   ELEV    │   ELEV   │   A-A    │   B-B    │
 * ├──────────┴──────────┴───────────┴──────────┴──────────┴──────────┤
 * │                        UK RIBA TITLE BLOCK                         │
 * └─────────────────────────────────────────────────────────────────────┘
 */

// A1 Sheet dimensions at different resolutions
const A1_DIMENSIONS = {
  // Standard A1: 594×841mm (portrait)
  print: { width: 7016, height: 9933 },  // 300 DPI for print (portrait)
  high: { width: 3508, height: 4967 },   // 150 DPI for digital (portrait)
  medium: { width: 2339, height: 3311 }, // 100 DPI for preview (portrait)
  low: { width: 1280, height: 1792 },    // Together.ai max (portrait, multiples of 16)

  // Landscape versions (for Hybrid A1 mode)
  print_landscape: { width: 9933, height: 7016 },  // 300 DPI landscape
  high_landscape: { width: 4967, height: 3508 },   // 150 DPI landscape
  medium_landscape: { width: 3311, height: 2339 }, // 100 DPI landscape
  low_landscape: { width: 1792, height: 1280 },    // Together.ai max landscape

  // Aspect ratio: 0.707 (portrait width/height), 1.414 (landscape width/height)
  aspectRatio: 0.707,
  aspectRatioLandscape: 1.414,

  // Working resolution for generation (Together.ai compatible)
  // Default to landscape for Hybrid A1 mode
  working: { width: 1792, height: 1280 },  // Landscape (Hybrid A1 default)
  working_portrait: { width: 1280, height: 1792 }  // Portrait (One-Shot fallback)
};

// Panel configuration with optimal sizes and prompts
const PANEL_DEFINITIONS = [
  // Row 1 - Overview and Context
  {
    id: 'site-map',
    name: 'Site Map',
    row: 0,
    col: 0,
    width: 1,
    height: 1,
    type: 'map',
    priority: 'high',
    promptType: 'site_context',
    description: 'Site plan showing building footprint and context'
  },
  {
    id: '3d-hero',
    name: 'Main 3D View',
    row: 0,
    col: 1,
    width: 2,  // Spans 2 columns for hero view
    height: 1,
    type: '3d',
    priority: 'critical',
    promptType: 'hero_3d',
    description: 'Photorealistic exterior perspective'
  },
  {
    id: 'material-palette',
    name: 'Materials',
    row: 0,
    col: 3,
    width: 1,
    height: 1,
    type: 'palette',
    priority: 'medium',
    promptType: 'material_swatches',
    description: 'Material and color palette'
  },
  {
    id: 'interior-3d',
    name: 'Interior View',
    row: 0,
    col: 4,
    width: 1,
    height: 1,
    type: '3d',
    priority: 'high',
    promptType: 'interior_3d',
    description: 'Interior perspective view'
  },

  // Row 2 - Floor Plans
  {
    id: 'ground-floor',
    name: 'Ground Floor Plan',
    row: 1,
    col: 0,
    width: 1,
    height: 1,
    type: 'plan',
    priority: 'critical',
    promptType: 'floor_plan',
    floorLevel: 0,
    description: 'Ground floor plan 1:100'
  },
  {
    id: 'first-floor',
    name: 'First Floor Plan',
    row: 1,
    col: 1,
    width: 1,
    height: 1,
    type: 'plan',
    priority: 'critical',
    promptType: 'floor_plan',
    floorLevel: 1,
    description: 'First floor plan 1:100'
  },
  {
    id: 'second-floor',
    name: 'Second Floor Plan',
    row: 1,
    col: 2,
    width: 1,
    height: 1,
    type: 'plan',
    priority: 'high',
    promptType: 'floor_plan',
    floorLevel: 2,
    description: 'Second floor plan 1:100 (if applicable)'
  },
  {
    id: 'axonometric',
    name: 'Axonometric 3D',
    row: 1,
    col: 3,
    width: 1,
    height: 1,
    type: '3d',
    priority: 'high',
    promptType: 'axonometric',
    description: 'Exploded axonometric view'
  },
  {
    id: 'detail-views',
    name: 'Detail Views',
    row: 1,
    col: 4,
    width: 1,
    height: 1,
    type: 'detail',
    priority: 'medium',
    promptType: 'construction_details',
    description: 'Construction details 1:20'
  },

  // Row 3 - Elevations
  {
    id: 'north-elevation',
    name: 'North Elevation',
    row: 2,
    col: 0,
    width: 1,
    height: 1,
    type: 'elevation',
    priority: 'critical',
    promptType: 'elevation',
    orientation: 'north',
    description: 'North elevation 1:100'
  },
  {
    id: 'south-elevation',
    name: 'South Elevation',
    row: 2,
    col: 1,
    width: 1,
    height: 1,
    type: 'elevation',
    priority: 'critical',
    promptType: 'elevation',
    orientation: 'south',
    description: 'South elevation 1:100'
  },
  {
    id: 'east-elevation',
    name: 'East Elevation',
    row: 2,
    col: 2,
    width: 1,
    height: 1,
    type: 'elevation',
    priority: 'critical',
    promptType: 'elevation',
    orientation: 'east',
    description: 'East elevation 1:100'
  },
  {
    id: 'west-elevation',
    name: 'West Elevation',
    row: 2,
    col: 3,
    width: 1,
    height: 1,
    type: 'elevation',
    priority: 'critical',
    promptType: 'elevation',
    orientation: 'west',
    description: 'West elevation 1:100'
  },

  // Row 3 - Sections
  {
    id: 'section-aa',
    name: 'Section A-A',
    row: 2,
    col: 4,
    width: 1,
    height: 1,
    type: 'section',
    priority: 'critical',
    promptType: 'section',
    sectionType: 'longitudinal',
    description: 'Longitudinal section A-A 1:100'
  },

  // Row 4 - Additional Views and Data
  {
    id: 'section-bb',
    name: 'Section B-B',
    row: 3,
    col: 0,
    width: 1,
    height: 1,
    type: 'section',
    priority: 'critical',
    promptType: 'section',
    sectionType: 'transverse',
    description: 'Transverse section B-B 1:100'
  },
  {
    id: 'project-data',
    name: 'Project Data',
    row: 3,
    col: 1,
    width: 1,
    height: 1,
    type: 'data',
    priority: 'medium',
    promptType: 'data_table',
    description: 'Area schedule and specifications'
  },
  {
    id: 'environmental',
    name: 'Environmental',
    row: 3,
    col: 2,
    width: 1,
    height: 1,
    type: 'data',
    priority: 'medium',
    promptType: 'environmental_data',
    description: 'Climate and sustainability data'
  },
  {
    id: 'structural',
    name: 'Structural',
    row: 3,
    col: 3,
    width: 1,
    height: 1,
    type: 'technical',
    priority: 'low',
    promptType: 'structural_diagram',
    description: 'Structural system diagram'
  },
  {
    id: 'roof-plan',
    name: 'Roof Plan',
    row: 3,
    col: 4,
    width: 1,
    height: 1,
    type: 'plan',
    priority: 'medium',
    promptType: 'roof_plan',
    description: 'Roof plan 1:200'
  },

  // Row 5 - Title Block (spans full width)
  {
    id: 'title-block',
    name: 'UK RIBA Title Block',
    row: 4,
    col: 0,
    width: 5,  // Spans all 5 columns
    height: 0.5, // Half height for title block
    type: 'title',
    priority: 'critical',
    promptType: 'title_block',
    description: 'Professional UK RIBA standard title block'
  }
];

/**
 * Calculate panel dimensions based on A1 sheet size
 */
function calculatePanelDimensions(sheetWidth, sheetHeight, gridCols = 5, gridRows = 4.5) {
  const margin = Math.floor(sheetWidth * 0.02); // 2% margin
  const padding = Math.floor(sheetWidth * 0.005); // 0.5% padding between panels

  const usableWidth = sheetWidth - (2 * margin);
  const usableHeight = sheetHeight - (2 * margin);

  const cellWidth = Math.floor((usableWidth - (padding * (gridCols - 1))) / gridCols);
  const cellHeight = Math.floor((usableHeight - (padding * (gridRows - 1))) / gridRows);

  return {
    margin,
    padding,
    cellWidth,
    cellHeight,
    usableWidth,
    usableHeight
  };
}

/**
 * Generate panel layout with exact pixel positions
 */
function generatePanelLayout(resolution = 'working') {
  const sheet = A1_DIMENSIONS[resolution];
  const dimensions = calculatePanelDimensions(sheet.width, sheet.height);

  const panels = PANEL_DEFINITIONS.map(panel => {
    const x = dimensions.margin + (panel.col * (dimensions.cellWidth + dimensions.padding));
    const y = dimensions.margin + (panel.row * (dimensions.cellHeight + dimensions.padding));
    const width = (dimensions.cellWidth * panel.width) + (dimensions.padding * (panel.width - 1));
    const height = (dimensions.cellHeight * panel.height) + (dimensions.padding * (panel.height - 1));

    return {
      ...panel,
      x,
      y,
      width,
      height,
      // Individual panel generation size (for FLUX)
      generationWidth: Math.min(768, width),  // Cap at 768 for quality
      generationHeight: Math.min(768, height),
      // Make generation dimensions multiples of 16 for FLUX
      fluxWidth: Math.floor(Math.min(768, width) / 16) * 16,
      fluxHeight: Math.floor(Math.min(768, height) / 16) * 16
    };
  });

  return {
    sheet,
    dimensions,
    panels,
    gridCols: 5,
    gridRows: 4.5
  };
}

/**
 * Create SVG template for visual reference
 */
function createSVGTemplate(layout) {
  const { sheet, panels } = layout;

  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${sheet.width}" height="${sheet.height}"
     viewBox="0 0 ${sheet.width} ${sheet.height}"
     xmlns="http://www.w3.org/2000/svg">

  <!-- Background -->
  <rect width="${sheet.width}" height="${sheet.height}" fill="#f5f5f0"/>

  <!-- Grid lines -->
  <g stroke="#e0e0e0" stroke-width="1" fill="none">`;

  // Add panel rectangles
  panels.forEach(panel => {
    svg += `
    <!-- Panel: ${panel.name} -->
    <rect x="${panel.x}" y="${panel.y}"
          width="${panel.width}" height="${panel.height}"
          stroke="#333" stroke-width="2" fill="white" opacity="0.9"/>
    <text x="${panel.x + panel.width/2}" y="${panel.y + 20}"
          text-anchor="middle" font-family="Arial" font-size="14" fill="#333">
      ${panel.name}
    </text>
    <text x="${panel.x + panel.width/2}" y="${panel.y + 40}"
          text-anchor="middle" font-family="Arial" font-size="10" fill="#666">
      ${panel.description}
    </text>`;
  });

  svg += `
  </g>
</svg>`;

  return svg;
}

/**
 * Create HTML canvas template for compositing
 */
function createCanvasTemplate(layout) {
  // Returns a configuration object for canvas compositing
  return {
    width: layout.sheet.width,
    height: layout.sheet.height,
    backgroundColor: '#f5f5f0',
    panels: layout.panels.map(panel => ({
      id: panel.id,
      x: panel.x,
      y: panel.y,
      width: panel.width,
      height: panel.height,
      borderColor: '#333',
      borderWidth: 2,
      labelText: panel.name,
      labelFont: '14px Arial',
      labelColor: '#333'
    }))
  };
}

/**
 * Get panels by priority for generation ordering
 */
function getPanelsByPriority(layout) {
  const priorityOrder = ['critical', 'high', 'medium', 'low'];
  const panelsByPriority = {};

  priorityOrder.forEach(priority => {
    panelsByPriority[priority] = layout.panels.filter(p => p.priority === priority);
  });

  return panelsByPriority;
}

/**
 * Group panels for batch generation (respecting rate limits)
 */
function createGenerationBatches(layout, batchSize = 3) {
  const panelsByPriority = getPanelsByPriority(layout);
  const batches = [];

  // Process critical panels first
  ['critical', 'high', 'medium', 'low'].forEach(priority => {
    const panels = panelsByPriority[priority];
    for (let i = 0; i < panels.length; i += batchSize) {
      batches.push({
        priority,
        panels: panels.slice(i, i + batchSize)
      });
    }
  });

  return batches;
}

/**
 * Generate template configuration for A1 sheet
 */
export function generateA1Template(options = {}) {
  const {
    resolution = 'working',  // 'print', 'high', 'medium', 'low', 'working'
    format = 'svg',          // 'svg', 'canvas', 'json'
    includePlaceholders = true
  } = options;

  // Generate layout
  const layout = generatePanelLayout(resolution);

  // Create generation batches
  const batches = createGenerationBatches(layout);

  // Generate appropriate format
  let template;
  switch (format) {
    case 'svg':
      template = createSVGTemplate(layout);
      break;
    case 'canvas':
      template = createCanvasTemplate(layout);
      break;
    case 'json':
    default:
      template = layout;
  }

  return {
    template,
    layout,
    batches,
    metadata: {
      resolution,
      format,
      totalPanels: layout.panels.length,
      sheetDimensions: layout.sheet,
      generatedAt: new Date().toISOString()
    }
  };
}

/**
 * Get panel-specific configuration for prompt generation
 */
export function getPanelConfig(panelId) {
  return PANEL_DEFINITIONS.find(p => p.id === panelId);
}

/**
 * Get all panels of a specific type
 */
export function getPanelsByType(type) {
  return PANEL_DEFINITIONS.filter(p => p.type === type);
}

/**
 * Validate panel generation result
 */
export function validatePanel(panelId, imageData) {
  const panel = getPanelConfig(panelId);
  if (!panel) {
    return { valid: false, error: 'Panel configuration not found' };
  }

  // Basic validation
  if (!imageData || !imageData.url) {
    return { valid: false, error: 'No image data provided' };
  }

  // Type-specific validation rules
  const validationRules = {
    plan: () => {
      // Floor plans should be 2D overhead views
      return imageData.metadata?.view === 'overhead' ||
             imageData.prompt?.includes('2D') ||
             imageData.prompt?.includes('floor plan');
    },
    elevation: () => {
      // Elevations should be flat facade views
      return imageData.metadata?.view === 'orthographic' ||
             imageData.prompt?.includes('elevation') ||
             imageData.prompt?.includes('facade');
    },
    section: () => {
      // Sections should show cut-through views
      return imageData.prompt?.includes('section') ||
             imageData.prompt?.includes('cut');
    },
    '3d': () => {
      // 3D views should be perspective or axonometric
      return imageData.metadata?.view === 'perspective' ||
             imageData.metadata?.view === 'axonometric' ||
             imageData.prompt?.includes('3D') ||
             imageData.prompt?.includes('perspective');
    }
  };

  const validator = validationRules[panel.type];
  if (validator && !validator()) {
    return {
      valid: false,
      error: `Panel type mismatch: expected ${panel.type} view characteristics`
    };
  }

  return { valid: true };
}

/**
 * Export panel dimensions for individual generation
 */
export function getOptimalGenerationSize(panelId, maxDimension = 768) {
  const panel = getPanelConfig(panelId);
  if (!panel) return null;

  const layout = generatePanelLayout('working');
  const panelLayout = layout.panels.find(p => p.id === panelId);

  if (!panelLayout) return null;

  // Calculate optimal size maintaining aspect ratio
  const aspectRatio = panelLayout.width / panelLayout.height;
  let width, height;

  if (aspectRatio > 1) {
    // Landscape
    width = Math.min(maxDimension, panelLayout.width);
    height = Math.floor(width / aspectRatio);
  } else {
    // Portrait
    height = Math.min(maxDimension, panelLayout.height);
    width = Math.floor(height * aspectRatio);
  }

  // Ensure multiples of 16 for FLUX
  width = Math.floor(width / 16) * 16;
  height = Math.floor(height / 16) * 16;

  // Minimum size for quality
  width = Math.max(512, width);
  height = Math.max(512, height);

  return { width, height, aspectRatio };
}

// Export constants for external use
export { A1_DIMENSIONS, PANEL_DEFINITIONS };