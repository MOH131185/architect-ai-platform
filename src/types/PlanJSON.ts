/**
 * PlanJSON - Single Source of Truth for Building Geometry
 *
 * This is the canonical representation of the building design.
 * All services read from this. No ad-hoc geometry in prompts.
 *
 * Philosophy: GEOMETRY IS DATA, not AI-generated prose.
 */

/**
 * Site boundary and orientation
 */
export type SiteGeometry = {
  /** Site boundary polygon in local coordinates (meters) */
  polygon: [number, number][];
  /** Site width in meters (bounding box) */
  width_m: number;
  /** Site depth in meters (bounding box) */
  depth_m: number;
  /** Total site area in square meters */
  area_m2: number;
  /** North direction in degrees (0 = north, 90 = east, 180 = south, 270 = west) */
  north_deg: number;
  /** Optional: Street frontage side */
  street_side?: 'north' | 'south' | 'east' | 'west';
  /** Optional: Setback constraints */
  setbacks?: {
    front_m: number;
    rear_m: number;
    side_m: number;
  };
};

/**
 * Door specification
 */
export type Door = {
  /** Position along wall [x, y] in local room coordinates */
  at: [number, number];
  /** Door width in meters */
  width_m: number;
  /** Swing direction */
  swing: 'L' | 'R' | 'double' | 'sliding';
  /** Door type */
  type?: 'entry' | 'interior' | 'patio' | 'garage';
};

/**
 * Window specification
 */
export type Window = {
  /** Position along wall [x, y] in local room coordinates */
  at: [number, number];
  /** Window width in meters */
  width_m: number;
  /** Sill height from floor in meters */
  sill_m: number;
  /** Head height from floor in meters */
  head_m: number;
  /** Window type */
  type?: 'fixed' | 'casement' | 'sliding' | 'awning' | 'picture';
};

/**
 * Room specification
 */
export type Room = {
  /** Unique room identifier */
  id: string;
  /** Room name */
  name: string;
  /** Room usage type */
  usage: 'living' | 'dining' | 'kitchen' | 'bedroom' | 'bathroom' | 'utility' | 'circulation' | 'storage' | 'garage' | 'other';
  /** Room boundary polygon in local level coordinates (meters) */
  poly: [number, number][];
  /** Area in square meters (computed from poly) */
  area_m2: number;
  /** Doors in this room */
  doors: Door[];
  /** Windows in this room */
  windows: Window[];
  /** Optional: Ceiling height override (if different from level default) */
  ceiling_height_m?: number;
};

/**
 * Stair specification
 */
export type Stair = {
  /** Stair location [x, y] in level coordinates */
  location: [number, number];
  /** Stair footprint polygon */
  poly: [number, number][];
  /** Number of risers */
  risers: number;
  /** Riser height in meters */
  riser_height_m: number;
  /** Tread depth in meters */
  tread_depth_m: number;
  /** Stair type */
  type: 'straight' | 'L-shaped' | 'U-shaped' | 'spiral';
  /** Direction of ascent */
  direction: 'north' | 'south' | 'east' | 'west';
};

/**
 * Building level (floor)
 */
export type Level = {
  /** Level name */
  name: string;
  /** Level index (0 = ground, 1 = first floor, etc.) */
  index: number;
  /** Elevation from site datum in meters */
  elevation_m: number;
  /** Floor-to-floor height in meters */
  height_m: number;
  /** Rooms on this level */
  rooms: Room[];
  /** Stairs connecting to other levels */
  stairs?: Stair[];
  /** Optional: Cores (elevator/utility shafts) */
  cores?: Array<{
    id: string;
    type: 'elevator' | 'utility' | 'vent';
    poly: [number, number][];
  }>;
};

/**
 * Structural system
 */
export type Structure = {
  /** Structural grid identifier */
  grid?: string;
  /** Column locations and dimensions */
  columns?: Array<{
    x: number;
    y: number;
    dx: number; // column width
    dy: number; // column depth
    type?: 'steel' | 'concrete' | 'timber';
  }>;
  /** Wall types */
  walls?: {
    exterior: { thickness_m: number; material: string };
    interior: { thickness_m: number; material: string };
  };
  /** Foundation type */
  foundation?: 'slab' | 'crawlspace' | 'basement' | 'piles';
};

/**
 * Material palette
 */
export type MaterialPalette = {
  /** Palette identifier (for consistency across projects) */
  paletteId: string;
  /** Palette name */
  name: string;
  /** Wall materials */
  walls: {
    exterior: string; // e.g., "Red brick #8B4513"
    interior: string; // e.g., "Painted drywall #F5F5F5"
  };
  /** Floor materials */
  floor: {
    ground: string; // e.g., "Polished concrete #C0C0C0"
    upper: string; // e.g., "Oak hardwood #D2691E"
  };
  /** Roof materials */
  roof: {
    material: string; // e.g., "Clay tiles #A0522D"
    color: string; // hex code
    pitch_deg: number;
  };
  /** Window/door materials */
  openings?: {
    frames: string; // e.g., "Aluminum #A9A9A9"
    glazing: string; // e.g., "Low-E double-pane"
  };
};

/**
 * Project metadata
 */
export type Metadata = {
  /** Unique project identifier */
  projectId: string;
  /** Base seed for deterministic generation */
  seed: number;
  /** PlanJSON schema version */
  version: string;
  /** Content hash (SHA-256 of canonical JSON) */
  hash: string;
  /** Creation timestamp */
  created: string;
  /** Last modified timestamp */
  modified: string;
  /** Generator version */
  generatorVersion?: string;
};

/**
 * Complete PlanJSON - Single Source of Truth
 */
export type PlanJSON = {
  /** Site geometry and boundary */
  site: SiteGeometry;
  /** Building levels (floors) */
  levels: Level[];
  /** Structural system */
  structure: Structure;
  /** Material palette */
  materials: MaterialPalette;
  /** Project metadata */
  metadata: Metadata;
  /** Optional: Design DNA reference */
  dnaRef?: string;
};

/**
 * Validation result
 */
export type ValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};

/**
 * Design package - Complete output from geometry-first pipeline
 */
export type DesignPackage = {
  /** The canonical plan */
  plan: PlanJSON;
  /** 3D scene snapshots (PNG data URLs) */
  scenePreview: {
    front: string;
    side: string;
    axonometric: string;
    perspective: string;
    interior: string;
  };
  /** Floor plan images */
  floorPlans: {
    ground: string;
    upper?: string;
  };
  /** Elevation images */
  elevations: {
    north: string;
    south: string;
    east: string;
    west: string;
  };
  /** Section images */
  sections: {
    longitudinal: string;
    cross: string;
  };
  /** Styled 3D views (AI-enhanced) */
  views3D: {
    exterior_front: string;
    exterior_side: string;
    axonometric: string;
    perspective: string;
    interior: string;
  };
  /** Base seed used */
  seedBase: number;
  /** Design DNA */
  dna: any; // TODO: Define DesignDNA type
  /** Consistency metrics */
  consistency: {
    score: number;
    edgeIoU: number;
    paletteMatch: number;
    windowCountMatch: boolean;
  };
};

export default PlanJSON;
