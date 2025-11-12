/**
 * A1 Layout Template
 * 
 * Defines the canonical A1 sheet layout zones for both portrait and landscape orientations
 * Portrait: 594×841mm (7016×9933 px @ 300 DPI)
 * Landscape: 841×594mm (9933×7016 px @ 300 DPI) - DEFAULT for Hybrid A1
 */

// Portrait dimensions
export const A1_MM_PORTRAIT = { width: 594, height: 841 };
export const A1_PX_PORTRAIT = { width: 7016, height: 9933 }; // 300 DPI portrait

// Landscape dimensions (DEFAULT for Hybrid A1)
export const A1_MM_LANDSCAPE = { width: 841, height: 594 };
export const A1_PX_LANDSCAPE = { width: 9933, height: 7016 }; // 300 DPI landscape

// Default to landscape
export const A1_MM = A1_MM_LANDSCAPE;
export const A1_PX = A1_PX_LANDSCAPE;

/**
 * Convert millimeters to pixels at 300 DPI
 */
export const mmToPx = (mm: number): number => Math.round((mm * 300) / 25.4);

/**
 * Canonical A1 layout zones for PORTRAIT orientation (mm measurements)
 * Portrait: 594mm × 841mm
 */
export const A1_LAYOUT_ZONES_PORTRAIT = {
  // Top-left: Site & Climate Context (🧱 1)
  siteClimate: {
    xMm: 15,
    yMm: 15,
    wMm: 190,
    hMm: 180,
    emoji: '🧱',
    title: 'Site & Climate Context'
  },
  
  // Top-center-right: 3D Visuals & Concept (🎨 5)
  top3DCluster: {
    xMm: 210,
    yMm: 15,
    wMm: 369,
    hMm: 200,
    emoji: '🎨',
    title: '3D Visuals & Concept'
  },
  
  // Middle-left: Architectural Plans (🏗️ 2)
  plansColumn: {
    xMm: 15,
    yMm: 205,
    wMm: 250,
    hMm: 360,
    emoji: '🏗️',
    title: 'Architectural Plans'
  },
  
  // Middle-right: Elevations (📐 3)
  elevationsColumn: {
    xMm: 270,
    yMm: 205,
    wMm: 309,
    hMm: 250,
    emoji: '📐',
    title: 'Elevations'
  },
  
  // Below elevations: Section (✂️ 4)
  sectionBand: {
    xMm: 270,
    yMm: 460,
    wMm: 309,
    hMm: 105,
    emoji: '✂️',
    title: 'Section'
  },
  
  // Bottom-left: Style & DNA (🧠 6)
  styleAndDNA: {
    xMm: 15,
    yMm: 570,
    wMm: 250,
    hMm: 110,
    emoji: '🧠',
    title: 'Architectural Style & DNA'
  },
  
  // Bottom-center-left: Environmental & Performance Data (🌤️ 7)
  environmental: {
    xMm: 270,
    yMm: 570,
    wMm: 150,
    hMm: 110,
    emoji: '🌤️',
    title: 'Environmental & Performance Data'
  },
  
  // Bottom-center-right: Project Summary Table (💰 8)
  projectSummary: {
    xMm: 425,
    yMm: 570,
    wMm: 154,
    hMm: 110,
    emoji: '💰',
    title: 'Project Summary Table'
  },
  
  // Bottom-left (below style): Legend & Symbols (🧾 9)
  legend: {
    xMm: 15,
    yMm: 685,
    wMm: 250,
    hMm: 70,
    emoji: '🧾',
    title: 'Legend & Symbols'
  },
  
  // Bottom-right (below project summary): Title Block (included in legend area)
  titleBlock: {
    xMm: 270,
    yMm: 685,
    wMm: 309,
    hMm: 70,
    emoji: '',
    title: 'Title Block'
  },
  
  // Bottom full-width: AI Metadata Footer (🧩 10)
  aiFooter: {
    xMm: 15,
    yMm: 760,
    wMm: 564,
    hMm: 66,
    emoji: '🧩',
    title: 'AI Metadata Footer'
  }
};

/**
 * Canonical A1 layout zones for LANDSCAPE orientation (mm measurements)
 * Landscape: 841mm × 594mm (DEFAULT for Hybrid A1)
 * Zones are rearranged to fit landscape aspect ratio
 */
export const A1_LAYOUT_ZONES_LANDSCAPE = {
  // Top-left: Site & Climate Context (🧱 1)
  siteClimate: {
    xMm: 15,
    yMm: 15,
    wMm: 250,
    hMm: 150,
    emoji: '🧱',
    title: 'Site & Climate Context'
  },
  
  // Top-center: 3D Visuals & Concept (🎨 5)
  top3DCluster: {
    xMm: 275,
    yMm: 15,
    wMm: 400,
    hMm: 150,
    emoji: '🎨',
    title: '3D Visuals & Concept'
  },
  
  // Top-right: Style & DNA (🧠 6)
  styleAndDNA: {
    xMm: 685,
    yMm: 15,
    wMm: 141,
    hMm: 150,
    emoji: '🧠',
    title: 'Architectural Style & DNA'
  },
  
  // Middle-left: Architectural Plans (🏗️ 2)
  plansColumn: {
    xMm: 15,
    yMm: 175,
    wMm: 300,
    hMm: 280,
    emoji: '🏗️',
    title: 'Architectural Plans'
  },
  
  // Middle-center: Elevations (📐 3)
  elevationsColumn: {
    xMm: 325,
    yMm: 175,
    wMm: 350,
    hMm: 280,
    emoji: '📐',
    title: 'Elevations'
  },
  
  // Middle-right: Section (✂️ 4)
  sectionBand: {
    xMm: 685,
    yMm: 175,
    wMm: 141,
    hMm: 280,
    emoji: '✂️',
    title: 'Section'
  },
  
  // Bottom-left: Environmental & Performance Data (🌤️ 7)
  environmental: {
    xMm: 15,
    yMm: 465,
    wMm: 200,
    hMm: 84,
    emoji: '🌤️',
    title: 'Environmental & Performance Data'
  },
  
  // Bottom-center-left: Project Summary Table (💰 8)
  projectSummary: {
    xMm: 225,
    yMm: 465,
    wMm: 200,
    hMm: 84,
    emoji: '💰',
    title: 'Project Summary Table'
  },
  
  // Bottom-center-right: Legend & Symbols (🧾 9)
  legend: {
    xMm: 435,
    yMm: 465,
    wMm: 200,
    hMm: 84,
    emoji: '🧾',
    title: 'Legend & Symbols'
  },
  
  // Bottom-right: Title Block
  titleBlock: {
    xMm: 645,
    yMm: 465,
    wMm: 181,
    hMm: 84,
    emoji: '',
    title: 'Title Block'
  },
  
  // Bottom full-width: AI Metadata Footer (🧩 10)
  aiFooter: {
    xMm: 15,
    yMm: 559,
    wMm: 811,
    hMm: 20,
    emoji: '🧩',
    title: 'AI Metadata Footer'
  }
};

// Default to landscape for Hybrid A1
export const A1_LAYOUT_ZONES = A1_LAYOUT_ZONES_LANDSCAPE;

/**
 * Convert zone coordinates from mm to px
 */
export function zoneToPx(zone: typeof A1_LAYOUT_ZONES_LANDSCAPE.siteClimate) {
  return {
    x: mmToPx(zone.xMm),
    y: mmToPx(zone.yMm),
    width: mmToPx(zone.wMm),
    height: mmToPx(zone.hMm)
  };
}

/**
 * Get all zones in pixel coordinates
 */
export function getAllZonesPx() {
  return Object.entries(A1_LAYOUT_ZONES).reduce((acc, [key, zone]) => {
    acc[key] = zoneToPx(zone);
    return acc;
  }, {} as Record<string, ReturnType<typeof zoneToPx>>);
}

/**
 * Typography scale (in px at 300 DPI)
 */
export const TYPOGRAPHY = {
  title: 36,      // Section titles
  heading: 24,    // Sub-headings
  body: 16,       // Body text
  small: 12,      // Small text
  tiny: 10        // Tiny text (labels, notes)
};

/**
 * Line weights (in px)
 */
export const LINE_WEIGHTS = {
  heavy: 2,       // Cut walls, major boundaries
  medium: 1,      // Regular walls, details
  light: 0.5,     // Grid lines, guides
  hairline: 0.25  // Very fine lines
};

/**
 * Colors
 */
export const COLORS = {
  background: '#FFFFFF',
  foreground: '#000000',
  grid: '#CCCCCC',
  accent: '#2C3E50',
  highlight: '#FF6B6B',
  text: '#000000',
  textSecondary: '#666666'
};

/**
 * Font family
 */
export const FONT_FAMILY = 'Arial, Helvetica, sans-serif';

