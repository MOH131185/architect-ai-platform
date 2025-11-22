/**
 * Sheet Layout Configuration
 * 
 * Defines standard layouts for A1 architectural presentation sheets
 * Supports both portrait and landscape orientations
 * All dimensions in millimeters (mm) per ISO A1 standard
 */

// ISO A1 Standard Dimensions
export const A1_DIMENSIONS = {
  WIDTH_MM: 594,
  HEIGHT_MM: 841,
  ASPECT_RATIO: 841 / 594, // 1.416 (portrait)
  
  // Landscape (rotated)
  LANDSCAPE_WIDTH_MM: 841,
  LANDSCAPE_HEIGHT_MM: 594,
  LANDSCAPE_ASPECT_RATIO: 841 / 594, // 1.416
  
  // High-resolution pixels @ 300 DPI
  WIDTH_PX_300DPI: 7016,
  HEIGHT_PX_300DPI: 9933,
  LANDSCAPE_WIDTH_PX_300DPI: 9933,
  LANDSCAPE_HEIGHT_PX_300DPI: 7016,
  
  // Standard resolution for generation (Together API limits)
  GENERATION_WIDTH_PX: 1792,
  GENERATION_HEIGHT_PX: 1269, // Landscape for A1
  PORTRAIT_GENERATION_WIDTH_PX: 1280,
  PORTRAIT_GENERATION_HEIGHT_PX: 1792
};

// Standard margins and spacing
export const LAYOUT_CONSTANTS = {
  MARGIN_MM: 10,
  GUTTER_MM: 5,
  TITLE_BLOCK_HEIGHT_MM: 60,
  LEGEND_WIDTH_MM: 120,
  PANEL_BORDER_WIDTH_MM: 0.5,
  TEXT_MARGIN_MM: 3
};

/**
 * A1 Landscape Layout (841mm × 594mm)
 * Standard for architectural presentation boards
 */
export const A1_LANDSCAPE_LAYOUT = {
  orientation: 'landscape' as const,
  width: A1_DIMENSIONS.LANDSCAPE_WIDTH_MM,
  height: A1_DIMENSIONS.LANDSCAPE_HEIGHT_MM,
  
  panels: {
    // Site/Location Plan (top-left)
    sitePlan: {
      x: 15,
      y: 20,
      width: 200,
      height: 140,
      label: 'SITE PLAN',
      scale: '1:1250'
    },
    
    // Ground Floor Plan (top-center)
    groundFloorPlan: {
      x: 225,
      y: 20,
      width: 200,
      height: 140,
      label: 'GROUND FLOOR PLAN',
      scale: '1:100'
    },
    
    // Upper Floor Plan (top-right)
    upperFloorPlan: {
      x: 435,
      y: 20,
      width: 200,
      height: 140,
      label: 'FIRST FLOOR PLAN',
      scale: '1:100'
    },
    
    // Roof Plan (if needed)
    roofPlan: {
      x: 645,
      y: 20,
      width: 180,
      height: 140,
      label: 'ROOF PLAN',
      scale: '1:200'
    },
    
    // Four Elevations (middle row)
    elevationNorth: {
      x: 15,
      y: 170,
      width: 200,
      height: 120,
      label: 'NORTH ELEVATION',
      scale: '1:100'
    },
    
    elevationSouth: {
      x: 225,
      y: 170,
      width: 200,
      height: 120,
      label: 'SOUTH ELEVATION',
      scale: '1:100'
    },
    
    elevationEast: {
      x: 435,
      y: 170,
      width: 200,
      height: 120,
      label: 'EAST ELEVATION',
      scale: '1:100'
    },
    
    elevationWest: {
      x: 645,
      y: 170,
      width: 180,
      height: 120,
      label: 'WEST ELEVATION',
      scale: '1:100'
    },
    
    // Sections (lower-middle)
    sectionLongitudinal: {
      x: 15,
      y: 300,
      width: 305,
      height: 110,
      label: 'SECTION A-A',
      scale: '1:100'
    },
    
    sectionCross: {
      x: 330,
      y: 300,
      width: 250,
      height: 110,
      label: 'SECTION B-B',
      scale: '1:100'
    },
    
    // 3D Views (bottom row)
    exterior3D: {
      x: 15,
      y: 420,
      width: 250,
      height: 140,
      label: '3D EXTERIOR VIEW',
      scale: null
    },
    
    axonometric3D: {
      x: 275,
      y: 420,
      width: 200,
      height: 140,
      label: 'AXONOMETRIC VIEW',
      scale: null
    },
    
    interior3D: {
      x: 485,
      y: 420,
      width: 200,
      height: 140,
      label: 'INTERIOR PERSPECTIVE',
      scale: null
    },
    
    // Materials Legend (right side)
    materialsLegend: {
      x: 695,
      y: 300,
      width: 130,
      height: 120,
      label: 'MATERIALS'
    },
    
    // Environmental/Climate Panel (right side)
    environmentalPanel: {
      x: 695,
      y: 430,
      width: 130,
      height: 90,
      label: 'ENVIRONMENTAL'
    },
    
    // Cost Summary (optional, right side)
    costSummary: {
      x: 695,
      y: 530,
      width: 130,
      height: 60,
      label: 'COST SUMMARY'
    }
  },
  
  // Title Block (bottom)
  titleBlock: {
    x: 15,
    y: 534,
    width: 811,
    height: 50
  }
};

/**
 * A1 Portrait Layout (594mm × 841mm)
 * Alternative layout for vertical presentation
 */
export const A1_PORTRAIT_LAYOUT = {
  orientation: 'portrait' as const,
  width: A1_DIMENSIONS.WIDTH_MM,
  height: A1_DIMENSIONS.HEIGHT_MM,
  
  panels: {
    // Site Plan (top)
    sitePlan: {
      x: 15,
      y: 20,
      width: 564,
      height: 100,
      label: 'SITE PLAN',
      scale: '1:1250'
    },
    
    // Floor Plans (stacked)
    groundFloorPlan: {
      x: 15,
      y: 130,
      width: 280,
      height: 180,
      label: 'GROUND FLOOR PLAN',
      scale: '1:100'
    },
    
    upperFloorPlan: {
      x: 304,
      y: 130,
      width: 275,
      height: 180,
      label: 'FIRST FLOOR PLAN',
      scale: '1:100'
    },
    
    // Elevations (2x2 grid)
    elevationNorth: {
      x: 15,
      y: 320,
      width: 280,
      height: 130,
      label: 'NORTH ELEVATION',
      scale: '1:100'
    },
    
    elevationSouth: {
      x: 304,
      y: 320,
      width: 275,
      height: 130,
      label: 'SOUTH ELEVATION',
      scale: '1:100'
    },
    
    elevationEast: {
      x: 15,
      y: 460,
      width: 280,
      height: 130,
      label: 'EAST ELEVATION',
      scale: '1:100'
    },
    
    elevationWest: {
      x: 304,
      y: 460,
      width: 275,
      height: 130,
      label: 'WEST ELEVATION',
      scale: '1:100'
    },
    
    // Sections (stacked)
    sectionLongitudinal: {
      x: 15,
      y: 600,
      width: 280,
      height: 100,
      label: 'SECTION A-A',
      scale: '1:100'
    },
    
    sectionCross: {
      x: 304,
      y: 600,
      width: 275,
      height: 100,
      label: 'SECTION B-B',
      scale: '1:100'
    },
    
    // 3D Views (bottom row)
    exterior3D: {
      x: 15,
      y: 710,
      width: 180,
      height: 120,
      label: '3D EXTERIOR',
      scale: null
    },
    
    axonometric3D: {
      x: 205,
      y: 710,
      width: 180,
      height: 120,
      label: 'AXONOMETRIC',
      scale: null
    },
    
    interior3D: {
      x: 395,
      y: 710,
      width: 180,
      height: 120,
      label: 'INTERIOR',
      scale: null
    }
  },
  
  // Title Block (bottom)
  titleBlock: {
    x: 15,
    y: 781,
    width: 564,
    height: 50
  },
  
  // Legends (right column)
  materialsLegend: {
    x: 15,
    y: 710,
    width: 180,
    height: 60
  },
  
  environmentalPanel: {
    x: 205,
    y: 710,
    width: 180,
    height: 60
  }
};

/**
 * Get layout configuration for specified orientation
 */
export function getLayout(orientation: 'landscape' | 'portrait' = 'landscape') {
  return orientation === 'portrait' ? A1_PORTRAIT_LAYOUT : A1_LANDSCAPE_LAYOUT;
}

/**
 * Panel types for type safety
 */
export type PanelType = 
  | 'sitePlan'
  | 'groundFloorPlan'
  | 'upperFloorPlan'
  | 'roofPlan'
  | 'elevationNorth'
  | 'elevationSouth'
  | 'elevationEast'
  | 'elevationWest'
  | 'sectionLongitudinal'
  | 'sectionCross'
  | 'exterior3D'
  | 'axonometric3D'
  | 'interior3D'
  | 'materialsLegend'
  | 'environmentalPanel'
  | 'costSummary';

/**
 * Panel configuration interface
 */
export interface PanelConfig {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  scale?: string | null;
}

/**
 * Sheet artifact metadata
 */
export interface SheetArtifact {
  type: 'svg' | 'png';
  url?: string;
  svgContent?: string;
  metadata: {
    designId: string;
    seed: number;
    sha256?: string;
    orientation: 'landscape' | 'portrait';
    width: number;
    height: number;
    dpi?: number;
    geometryFirst: boolean;
    insetSources?: {
      hasRealSiteMap: boolean;
      siteMapProvider?: string;
      siteMapAttribution?: string;
    };
    generatedAt: string;
    version: string;
  };
  sources?: {
    dna: any;
    views?: Record<PanelType, { url?: string; svg?: string }>;
    metrics?: any;
    cost?: any;
  };
}

export default {
  A1_DIMENSIONS,
  LAYOUT_CONSTANTS,
  A1_LANDSCAPE_LAYOUT,
  A1_PORTRAIT_LAYOUT,
  getLayout
};

