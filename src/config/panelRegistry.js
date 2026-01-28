/**
 * Panel Registry Configuration
 * Defines all panel types and their metadata
 *
 * SINGLE SOURCE OF TRUTH for panel types, validation, and metadata
 */

// =============================================================================
// CANONICAL PANEL TYPES (14-panel A1 set)
// =============================================================================

export const PANEL_TYPE = {
  // 3D Views (Priority 1-3)
  HERO_3D: "hero_3d",
  INTERIOR_3D: "interior_3d",
  AXONOMETRIC: "axonometric",

  // Site Context (Priority 4)
  SITE_DIAGRAM: "site_diagram",

  // Floor Plans (Priority 5-7)
  FLOOR_PLAN_GROUND: "floor_plan_ground",
  FLOOR_PLAN_FIRST: "floor_plan_first",
  FLOOR_PLAN_LEVEL2: "floor_plan_level2",

  // Elevations (Priority 8-11)
  ELEVATION_NORTH: "elevation_north",
  ELEVATION_SOUTH: "elevation_south",
  ELEVATION_EAST: "elevation_east",
  ELEVATION_WEST: "elevation_west",

  // Sections (Priority 12-13)
  SECTION_AA: "section_AA",
  SECTION_BB: "section_BB",

  // Schedules & Notes (Priority 14)
  SCHEDULES_NOTES: "schedules_notes",

  // Diagrams (Priority 15-16)
  MATERIAL_PALETTE: "material_palette",
  CLIMATE_CARD: "climate_card",

  // Legacy compatibility
  FLOOR_PLAN: "floor_plan",
  ELEVATION: "elevation",
  SECTION: "section",
  PERSPECTIVE: "perspective",
  SITE_PLAN: "site_plan",
};

// Alias for backwards compatibility
export const PANEL_TYPES = PANEL_TYPE;

// Array of all panel types
export const ALL_PANEL_TYPES = Object.values(PANEL_TYPE);

// =============================================================================
// PANEL REGISTRY - Metadata for each panel type
// =============================================================================

export const PANEL_REGISTRY = {
  // 3D Views
  [PANEL_TYPE.HERO_3D]: {
    id: PANEL_TYPE.HERO_3D,
    name: "Hero 3D View",
    description: "Main exterior 3D visualization",
    category: "3d",
    generator: "flux",
    priority: 1,
  },
  [PANEL_TYPE.INTERIOR_3D]: {
    id: PANEL_TYPE.INTERIOR_3D,
    name: "Interior 3D View",
    description: "Interior 3D visualization",
    category: "3d",
    generator: "flux",
    priority: 2,
  },
  [PANEL_TYPE.AXONOMETRIC]: {
    id: PANEL_TYPE.AXONOMETRIC,
    name: "Axonometric View",
    description: "Exploded axonometric diagram",
    category: "3d",
    generator: "flux",
    priority: 3,
  },

  // Site Context
  [PANEL_TYPE.SITE_DIAGRAM]: {
    id: PANEL_TYPE.SITE_DIAGRAM,
    name: "Site Diagram",
    description: "Site context and location",
    category: "site",
    generator: "flux",
    priority: 4,
  },

  // Floor Plans
  [PANEL_TYPE.FLOOR_PLAN_GROUND]: {
    id: PANEL_TYPE.FLOOR_PLAN_GROUND,
    name: "Ground Floor Plan",
    description: "Ground floor layout",
    category: "technical",
    generator: "svg",
    priority: 5,
  },
  [PANEL_TYPE.FLOOR_PLAN_FIRST]: {
    id: PANEL_TYPE.FLOOR_PLAN_FIRST,
    name: "First Floor Plan",
    description: "First floor layout",
    category: "technical",
    generator: "svg",
    priority: 6,
  },
  [PANEL_TYPE.FLOOR_PLAN_LEVEL2]: {
    id: PANEL_TYPE.FLOOR_PLAN_LEVEL2,
    name: "Second Floor Plan",
    description: "Second floor layout",
    category: "technical",
    generator: "svg",
    priority: 7,
  },

  // Elevations
  [PANEL_TYPE.ELEVATION_NORTH]: {
    id: PANEL_TYPE.ELEVATION_NORTH,
    name: "North Elevation",
    description: "North facade view",
    category: "technical",
    generator: "svg",
    priority: 8,
  },
  [PANEL_TYPE.ELEVATION_SOUTH]: {
    id: PANEL_TYPE.ELEVATION_SOUTH,
    name: "South Elevation",
    description: "South facade view",
    category: "technical",
    generator: "svg",
    priority: 9,
  },
  [PANEL_TYPE.ELEVATION_EAST]: {
    id: PANEL_TYPE.ELEVATION_EAST,
    name: "East Elevation",
    description: "East facade view",
    category: "technical",
    generator: "svg",
    priority: 10,
  },
  [PANEL_TYPE.ELEVATION_WEST]: {
    id: PANEL_TYPE.ELEVATION_WEST,
    name: "West Elevation",
    description: "West facade view",
    category: "technical",
    generator: "svg",
    priority: 11,
  },

  // Sections
  [PANEL_TYPE.SECTION_AA]: {
    id: PANEL_TYPE.SECTION_AA,
    name: "Section A-A",
    description: "Longitudinal section",
    category: "technical",
    generator: "svg",
    priority: 12,
  },
  [PANEL_TYPE.SECTION_BB]: {
    id: PANEL_TYPE.SECTION_BB,
    name: "Section B-B",
    description: "Cross section",
    category: "technical",
    generator: "svg",
    priority: 13,
  },

  // Schedules & Notes
  [PANEL_TYPE.SCHEDULES_NOTES]: {
    id: PANEL_TYPE.SCHEDULES_NOTES,
    name: "Schedules & Notes",
    description: "Room schedules and project notes",
    category: "data",
    generator: "data",
    priority: 14,
  },

  // Diagrams
  [PANEL_TYPE.MATERIAL_PALETTE]: {
    id: PANEL_TYPE.MATERIAL_PALETTE,
    name: "Material Palette",
    description: "Material specifications",
    category: "data",
    generator: "data",
    priority: 15,
  },
  [PANEL_TYPE.CLIMATE_CARD]: {
    id: PANEL_TYPE.CLIMATE_CARD,
    name: "Climate Analysis",
    description: "Climate and environmental data",
    category: "data",
    generator: "data",
    priority: 16,
  },

  // Legacy compatibility entries
  [PANEL_TYPE.FLOOR_PLAN]: {
    id: PANEL_TYPE.FLOOR_PLAN,
    name: "Floor Plan",
    description: "Architectural floor plan view",
    category: "technical",
    generator: "svg",
  },
  [PANEL_TYPE.ELEVATION]: {
    id: PANEL_TYPE.ELEVATION,
    name: "Elevation",
    description: "Building elevation view",
    category: "technical",
    generator: "svg",
  },
  [PANEL_TYPE.SECTION]: {
    id: PANEL_TYPE.SECTION,
    name: "Section",
    description: "Building section view",
    category: "technical",
    generator: "svg",
  },
  [PANEL_TYPE.PERSPECTIVE]: {
    id: PANEL_TYPE.PERSPECTIVE,
    name: "Perspective",
    description: "3D perspective rendering",
    category: "3d",
    generator: "flux",
  },
  [PANEL_TYPE.SITE_PLAN]: {
    id: PANEL_TYPE.SITE_PLAN,
    name: "Site Plan",
    description: "Site context and layout",
    category: "site",
    generator: "flux",
  },
};

// =============================================================================
// REQUIRED PANELS BY FLOOR COUNT
// =============================================================================

const REQUIRED_PANELS_BY_FLOOR = {
  1: [
    PANEL_TYPE.HERO_3D,
    PANEL_TYPE.INTERIOR_3D,
    PANEL_TYPE.SITE_DIAGRAM,
    PANEL_TYPE.FLOOR_PLAN_GROUND,
    PANEL_TYPE.ELEVATION_NORTH,
    PANEL_TYPE.ELEVATION_SOUTH,
    PANEL_TYPE.ELEVATION_EAST,
    PANEL_TYPE.ELEVATION_WEST,
    PANEL_TYPE.SECTION_AA,
    PANEL_TYPE.MATERIAL_PALETTE,
    PANEL_TYPE.CLIMATE_CARD,
  ],
  2: [
    PANEL_TYPE.HERO_3D,
    PANEL_TYPE.INTERIOR_3D,
    PANEL_TYPE.AXONOMETRIC,
    PANEL_TYPE.SITE_DIAGRAM,
    PANEL_TYPE.FLOOR_PLAN_GROUND,
    PANEL_TYPE.FLOOR_PLAN_FIRST,
    PANEL_TYPE.ELEVATION_NORTH,
    PANEL_TYPE.ELEVATION_SOUTH,
    PANEL_TYPE.ELEVATION_EAST,
    PANEL_TYPE.ELEVATION_WEST,
    PANEL_TYPE.SECTION_AA,
    PANEL_TYPE.SECTION_BB,
    PANEL_TYPE.MATERIAL_PALETTE,
    PANEL_TYPE.CLIMATE_CARD,
  ],
  3: [
    PANEL_TYPE.HERO_3D,
    PANEL_TYPE.INTERIOR_3D,
    PANEL_TYPE.AXONOMETRIC,
    PANEL_TYPE.SITE_DIAGRAM,
    PANEL_TYPE.FLOOR_PLAN_GROUND,
    PANEL_TYPE.FLOOR_PLAN_FIRST,
    PANEL_TYPE.FLOOR_PLAN_LEVEL2,
    PANEL_TYPE.ELEVATION_NORTH,
    PANEL_TYPE.ELEVATION_SOUTH,
    PANEL_TYPE.ELEVATION_EAST,
    PANEL_TYPE.ELEVATION_WEST,
    PANEL_TYPE.SECTION_AA,
    PANEL_TYPE.SECTION_BB,
    PANEL_TYPE.MATERIAL_PALETTE,
    PANEL_TYPE.CLIMATE_CARD,
  ],
};

// =============================================================================
// VALIDATION & HELPER FUNCTIONS
// =============================================================================

/**
 * Get registry entry for a panel type
 */
export function getRegistryEntry(panelType) {
  return PANEL_REGISTRY[panelType] || null;
}

/**
 * Assert that a panel type is valid (throws if not)
 * @param {string} panelType - Panel type to validate
 * @throws {Error} If panel type is invalid
 */
export function assertValidPanelType(panelType) {
  if (!panelType) {
    throw new Error("Panel type is required");
  }
  if (!PANEL_REGISTRY[panelType]) {
    throw new Error(
      `Invalid panel type: ${panelType}. Valid types: ${ALL_PANEL_TYPES.join(", ")}`,
    );
  }
}

/**
 * Get required panels for a given floor count
 * @param {number} floorCount - Number of floors (1, 2, or 3)
 * @returns {string[]} Array of required panel types
 */
export function getRequiredPanels(floorCount = 2) {
  const floors = Math.min(Math.max(floorCount, 1), 3);
  return REQUIRED_PANELS_BY_FLOOR[floors] || REQUIRED_PANELS_BY_FLOOR[2];
}

/**
 * Get all AI-generated panels (FLUX-based)
 * @param {number} [floorCount] - Optional floor count to filter by required panels
 * @returns {string[]} Array of AI-generated panel types
 */
export function getAIGeneratedPanels(floorCount) {
  // Get all FLUX-generated panel types
  const allFluxPanels = Object.entries(PANEL_REGISTRY)
    .filter(([, entry]) => entry.generator === "flux")
    .map(([type]) => type);

  // If floorCount is provided, filter to only return required panels for that floor count
  if (typeof floorCount === "number" && floorCount >= 1) {
    const required = getRequiredPanels(floorCount);
    return allFluxPanels.filter((type) => required.includes(type));
  }

  return allFluxPanels;
}

/**
 * Get all floor plan panels
 * @returns {string[]} Array of floor plan panel types
 */
export function getFloorPlanPanels() {
  return [
    PANEL_TYPE.FLOOR_PLAN_GROUND,
    PANEL_TYPE.FLOOR_PLAN_FIRST,
    PANEL_TYPE.FLOOR_PLAN_LEVEL2,
  ];
}

/**
 * Validate a panel set against requirements
 * @param {string[]} panels - Array of panel types to validate
 * @param {Object} options - Validation options
 * @param {number} options.floorCount - Number of floors
 * @returns {Object} Validation result
 */
export function validatePanelSet(panels, options = {}) {
  const { floorCount = 2 } = options;
  const required = getRequiredPanels(floorCount);
  const provided = new Set(panels);

  const missing = required.filter((p) => !provided.has(p));
  const extra = panels.filter((p) => !required.includes(p));

  return {
    valid: missing.length === 0,
    missing,
    extra,
    required,
    provided: panels,
  };
}

/**
 * Normalize panel type to canonical format
 */
export function normalizeToCanonical(panelType) {
  if (!panelType) {
    return null;
  }

  // Already canonical
  if (PANEL_TYPE[panelType]) {
    return panelType;
  }
  if (Object.values(PANEL_TYPE).includes(panelType)) {
    return panelType;
  }

  // Normalize common variations
  const normalized = panelType.toLowerCase().replace(/[-\s]/g, "_");

  const mapping = {
    // Floor plans
    floor_plan: PANEL_TYPE.FLOOR_PLAN,
    floorplan: PANEL_TYPE.FLOOR_PLAN,
    plan: PANEL_TYPE.FLOOR_PLAN,
    floor_plan_ground: PANEL_TYPE.FLOOR_PLAN_GROUND,
    plan_ground: PANEL_TYPE.FLOOR_PLAN_GROUND,
    ground_floor: PANEL_TYPE.FLOOR_PLAN_GROUND,
    floor_plan_first: PANEL_TYPE.FLOOR_PLAN_FIRST,
    plan_first: PANEL_TYPE.FLOOR_PLAN_FIRST,
    first_floor: PANEL_TYPE.FLOOR_PLAN_FIRST,
    floor_plan_level2: PANEL_TYPE.FLOOR_PLAN_LEVEL2,
    plan_level2: PANEL_TYPE.FLOOR_PLAN_LEVEL2,
    second_floor: PANEL_TYPE.FLOOR_PLAN_LEVEL2,

    // Elevations
    elevation: PANEL_TYPE.ELEVATION,
    elev: PANEL_TYPE.ELEVATION,
    elevation_north: PANEL_TYPE.ELEVATION_NORTH,
    north_elevation: PANEL_TYPE.ELEVATION_NORTH,
    elevation_south: PANEL_TYPE.ELEVATION_SOUTH,
    south_elevation: PANEL_TYPE.ELEVATION_SOUTH,
    elevation_east: PANEL_TYPE.ELEVATION_EAST,
    east_elevation: PANEL_TYPE.ELEVATION_EAST,
    elevation_west: PANEL_TYPE.ELEVATION_WEST,
    west_elevation: PANEL_TYPE.ELEVATION_WEST,

    // Sections
    section: PANEL_TYPE.SECTION,
    sect: PANEL_TYPE.SECTION,
    section_aa: PANEL_TYPE.SECTION_AA,
    section_a: PANEL_TYPE.SECTION_AA,
    section_bb: PANEL_TYPE.SECTION_BB,
    section_b: PANEL_TYPE.SECTION_BB,

    // 3D Views
    perspective: PANEL_TYPE.PERSPECTIVE,
    "3d": PANEL_TYPE.PERSPECTIVE,
    render: PANEL_TYPE.PERSPECTIVE,
    hero_3d: PANEL_TYPE.HERO_3D,
    hero: PANEL_TYPE.HERO_3D,
    interior_3d: PANEL_TYPE.INTERIOR_3D,
    interior: PANEL_TYPE.INTERIOR_3D,
    axonometric: PANEL_TYPE.AXONOMETRIC,
    axon: PANEL_TYPE.AXONOMETRIC,

    // Site
    site_plan: PANEL_TYPE.SITE_PLAN,
    siteplan: PANEL_TYPE.SITE_PLAN,
    site: PANEL_TYPE.SITE_PLAN,
    site_diagram: PANEL_TYPE.SITE_DIAGRAM,

    // Data panels
    schedules_notes: PANEL_TYPE.SCHEDULES_NOTES,
    schedules: PANEL_TYPE.SCHEDULES_NOTES,
    notes: PANEL_TYPE.SCHEDULES_NOTES,
    material_palette: PANEL_TYPE.MATERIAL_PALETTE,
    materials: PANEL_TYPE.MATERIAL_PALETTE,
    climate_card: PANEL_TYPE.CLIMATE_CARD,
    climate: PANEL_TYPE.CLIMATE_CARD,
  };

  return mapping[normalized] || panelType;
}

export default PANEL_REGISTRY;
