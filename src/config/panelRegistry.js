/**
 * Panel Registry - Central registry for A1 panel types
 *
 * Defines all panel types, their properties, and validation rules.
 */

/**
 * Canonical panel type constants
 */
export const PANEL_TYPE = {
  // 3D Views
  HERO_3D: "hero_3d",
  INTERIOR_3D: "interior_3d",
  AERIAL_3D: "aerial_3d",

  // Site
  SITE_PLAN: "site_plan",

  // Floor Plans
  FLOOR_PLAN_GF: "floor_plan_gf",
  FLOOR_PLAN_FF: "floor_plan_ff",
  FLOOR_PLAN_SF: "floor_plan_sf",
  FLOOR_PLAN_TF: "floor_plan_tf",

  // Elevations
  ELEVATION_N: "elevation_n",
  ELEVATION_S: "elevation_s",
  ELEVATION_E: "elevation_e",
  ELEVATION_W: "elevation_w",

  // Sections
  SECTION_AA: "section_aa",
  SECTION_BB: "section_bb",

  // Diagrams
  SUSTAINABILITY: "sustainability",
  MATERIALS: "materials",
};

/**
 * Panel registry with metadata
 */
export const PANEL_REGISTRY = {
  [PANEL_TYPE.HERO_3D]: {
    id: PANEL_TYPE.HERO_3D,
    name: "Hero Perspective",
    category: "3d",
    required: true,
    aiGenerated: true,
    order: 1,
  },
  [PANEL_TYPE.INTERIOR_3D]: {
    id: PANEL_TYPE.INTERIOR_3D,
    name: "Interior View",
    category: "3d",
    required: false,
    aiGenerated: true,
    order: 2,
  },
  [PANEL_TYPE.AERIAL_3D]: {
    id: PANEL_TYPE.AERIAL_3D,
    name: "Aerial View",
    category: "3d",
    required: false,
    aiGenerated: true,
    order: 3,
  },
  [PANEL_TYPE.SITE_PLAN]: {
    id: PANEL_TYPE.SITE_PLAN,
    name: "Site Plan",
    category: "site",
    required: true,
    aiGenerated: false,
    order: 4,
  },
  [PANEL_TYPE.FLOOR_PLAN_GF]: {
    id: PANEL_TYPE.FLOOR_PLAN_GF,
    name: "Ground Floor Plan",
    category: "floor_plan",
    required: true,
    aiGenerated: false,
    order: 5,
  },
  [PANEL_TYPE.FLOOR_PLAN_FF]: {
    id: PANEL_TYPE.FLOOR_PLAN_FF,
    name: "First Floor Plan",
    category: "floor_plan",
    required: false,
    aiGenerated: false,
    order: 6,
  },
  [PANEL_TYPE.FLOOR_PLAN_SF]: {
    id: PANEL_TYPE.FLOOR_PLAN_SF,
    name: "Second Floor Plan",
    category: "floor_plan",
    required: false,
    aiGenerated: false,
    order: 7,
  },
  [PANEL_TYPE.FLOOR_PLAN_TF]: {
    id: PANEL_TYPE.FLOOR_PLAN_TF,
    name: "Third Floor Plan",
    category: "floor_plan",
    required: false,
    aiGenerated: false,
    order: 8,
  },
  [PANEL_TYPE.ELEVATION_N]: {
    id: PANEL_TYPE.ELEVATION_N,
    name: "North Elevation",
    category: "elevation",
    required: true,
    aiGenerated: false,
    order: 9,
  },
  [PANEL_TYPE.ELEVATION_S]: {
    id: PANEL_TYPE.ELEVATION_S,
    name: "South Elevation",
    category: "elevation",
    required: true,
    aiGenerated: false,
    order: 10,
  },
  [PANEL_TYPE.ELEVATION_E]: {
    id: PANEL_TYPE.ELEVATION_E,
    name: "East Elevation",
    category: "elevation",
    required: true,
    aiGenerated: false,
    order: 11,
  },
  [PANEL_TYPE.ELEVATION_W]: {
    id: PANEL_TYPE.ELEVATION_W,
    name: "West Elevation",
    category: "elevation",
    required: true,
    aiGenerated: false,
    order: 12,
  },
  [PANEL_TYPE.SECTION_AA]: {
    id: PANEL_TYPE.SECTION_AA,
    name: "Section A-A",
    category: "section",
    required: true,
    aiGenerated: false,
    order: 13,
  },
  [PANEL_TYPE.SECTION_BB]: {
    id: PANEL_TYPE.SECTION_BB,
    name: "Section B-B",
    category: "section",
    required: false,
    aiGenerated: false,
    order: 14,
  },
  [PANEL_TYPE.SUSTAINABILITY]: {
    id: PANEL_TYPE.SUSTAINABILITY,
    name: "Sustainability Diagram",
    category: "diagram",
    required: false,
    aiGenerated: false,
    order: 15,
  },
  [PANEL_TYPE.MATERIALS]: {
    id: PANEL_TYPE.MATERIALS,
    name: "Materials Palette",
    category: "diagram",
    required: false,
    aiGenerated: false,
    order: 16,
  },
};

/**
 * All panel types array
 */
export const ALL_PANEL_TYPES = Object.values(PANEL_TYPE);

/**
 * Alias map for normalizing panel type strings
 */
const ALIAS_MAP = {
  hero: PANEL_TYPE.HERO_3D,
  hero3d: PANEL_TYPE.HERO_3D,
  "hero-3d": PANEL_TYPE.HERO_3D,
  perspective: PANEL_TYPE.HERO_3D,
  interior: PANEL_TYPE.INTERIOR_3D,
  interior3d: PANEL_TYPE.INTERIOR_3D,
  "interior-3d": PANEL_TYPE.INTERIOR_3D,
  aerial: PANEL_TYPE.AERIAL_3D,
  aerial3d: PANEL_TYPE.AERIAL_3D,
  "aerial-3d": PANEL_TYPE.AERIAL_3D,
  site: PANEL_TYPE.SITE_PLAN,
  siteplan: PANEL_TYPE.SITE_PLAN,
  "site-plan": PANEL_TYPE.SITE_PLAN,
  groundfloor: PANEL_TYPE.FLOOR_PLAN_GF,
  ground_floor: PANEL_TYPE.FLOOR_PLAN_GF,
  gf: PANEL_TYPE.FLOOR_PLAN_GF,
  firstfloor: PANEL_TYPE.FLOOR_PLAN_FF,
  first_floor: PANEL_TYPE.FLOOR_PLAN_FF,
  ff: PANEL_TYPE.FLOOR_PLAN_FF,
  secondfloor: PANEL_TYPE.FLOOR_PLAN_SF,
  second_floor: PANEL_TYPE.FLOOR_PLAN_SF,
  sf: PANEL_TYPE.FLOOR_PLAN_SF,
  thirdfloor: PANEL_TYPE.FLOOR_PLAN_TF,
  third_floor: PANEL_TYPE.FLOOR_PLAN_TF,
  tf: PANEL_TYPE.FLOOR_PLAN_TF,
  north: PANEL_TYPE.ELEVATION_N,
  north_elevation: PANEL_TYPE.ELEVATION_N,
  "elevation-n": PANEL_TYPE.ELEVATION_N,
  south: PANEL_TYPE.ELEVATION_S,
  south_elevation: PANEL_TYPE.ELEVATION_S,
  "elevation-s": PANEL_TYPE.ELEVATION_S,
  east: PANEL_TYPE.ELEVATION_E,
  east_elevation: PANEL_TYPE.ELEVATION_E,
  "elevation-e": PANEL_TYPE.ELEVATION_E,
  west: PANEL_TYPE.ELEVATION_W,
  west_elevation: PANEL_TYPE.ELEVATION_W,
  "elevation-w": PANEL_TYPE.ELEVATION_W,
  section_a: PANEL_TYPE.SECTION_AA,
  "section-aa": PANEL_TYPE.SECTION_AA,
  section_b: PANEL_TYPE.SECTION_BB,
  "section-bb": PANEL_TYPE.SECTION_BB,
};

/**
 * Normalize a panel type string to canonical form
 * @param {string} type - Panel type string (case-insensitive)
 * @returns {string|null} Canonical panel type or null if invalid
 */
export function normalizeToCanonical(type) {
  if (!type) return null;

  const normalized = type.toLowerCase().replace(/[-_\s]/g, "");

  // Check if already canonical
  if (ALL_PANEL_TYPES.includes(type)) {
    return type;
  }

  // Check alias map
  if (ALIAS_MAP[normalized]) {
    return ALIAS_MAP[normalized];
  }

  // Try matching with underscores removed
  const withoutUnderscores = normalized.replace(/_/g, "");
  for (const panelType of ALL_PANEL_TYPES) {
    if (panelType.replace(/_/g, "") === withoutUnderscores) {
      return panelType;
    }
  }

  return null;
}

/**
 * Assert that a panel type is valid
 * @param {string} type - Panel type to validate
 * @throws {Error} If panel type is invalid
 */
export function assertValidPanelType(type) {
  const canonical = normalizeToCanonical(type);
  if (!canonical) {
    throw new Error(
      `Invalid panel type: ${type}. Valid types: ${ALL_PANEL_TYPES.join(", ")}`,
    );
  }
  return canonical;
}

/**
 * Get registry entry for a panel type
 * @param {string} type - Panel type
 * @returns {Object|null} Registry entry or null
 */
export function getRegistryEntry(type) {
  const canonical = normalizeToCanonical(type);
  return canonical ? PANEL_REGISTRY[canonical] : null;
}

/**
 * Get list of required panels
 * @returns {string[]} Array of required panel types
 */
export function getRequiredPanels() {
  return Object.values(PANEL_REGISTRY)
    .filter((entry) => entry.required)
    .map((entry) => entry.id);
}

/**
 * Get list of AI-generated panels
 * @returns {string[]} Array of AI-generated panel types
 */
export function getAIGeneratedPanels() {
  return Object.values(PANEL_REGISTRY)
    .filter((entry) => entry.aiGenerated)
    .map((entry) => entry.id);
}

/**
 * Get list of floor plan panels
 * @returns {string[]} Array of floor plan panel types
 */
export function getFloorPlanPanels() {
  return Object.values(PANEL_REGISTRY)
    .filter((entry) => entry.category === "floor_plan")
    .map((entry) => entry.id);
}

/**
 * Validate a set of panels
 * @param {string[]} panels - Array of panel types
 * @returns {{valid: boolean, missing: string[], invalid: string[]}}
 */
export function validatePanelSet(panels) {
  const required = getRequiredPanels();
  const normalized = panels.map((p) => normalizeToCanonical(p)).filter(Boolean);
  const invalid = panels.filter((p) => !normalizeToCanonical(p));
  const missing = required.filter((r) => !normalized.includes(r));

  return {
    valid: missing.length === 0 && invalid.length === 0,
    missing,
    invalid,
  };
}
