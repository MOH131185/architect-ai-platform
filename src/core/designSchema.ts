/**
 * Design Schema - TypeScript Type Definitions
 * 
 * Complete type system for geometry-first architectural design
 * Single source of truth for all design data structures
 */

// ============================================================================
// GEOMETRY PRIMITIVES
// ============================================================================

export interface Point2D {
  x: number;
  y: number;
}

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface Polygon2D {
  vertices: Point2D[];
  closed: boolean;
}

export interface BoundingBox {
  min: Point3D;
  max: Point3D;
  width: number;
  height: number;
  depth: number;
}

// ============================================================================
// SITE & LOCATION
// ============================================================================

export interface SiteData {
  address: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  polygon?: Array<{ lat: number; lng: number }>;
  area: number; // m²
  orientation: number; // degrees from North
  setbacks: {
    front: number;
    rear: number;
    sideLeft: number;
    sideRight: number;
  };
  buildableArea: number; // m²
  zoning?: {
    type: string;
    maxHeight?: number;
    maxFloors?: number;
    density?: string;
  };
}

// ============================================================================
// MATERIALS
// ============================================================================

export interface Material {
  id: string;
  name: string;
  type: 'wall' | 'roof' | 'floor' | 'window' | 'door' | 'trim';
  color: string; // hex code
  texture?: string;
  properties?: {
    thermal?: number; // R-value
    acoustic?: number; // STC rating
    durability?: string;
    sustainability?: string;
  };
}

export interface MaterialPalette {
  exterior: Material;
  roof: Material;
  windows: Material;
  doors: Material;
  interior?: Material[];
}

// ============================================================================
// BUILDING ELEMENTS
// ============================================================================

export interface Wall {
  id: string;
  vertices: Point3D[];
  thickness: number;
  height: number;
  material: string; // Material ID
  isExterior: boolean;
  openings: Opening[];
}

export interface Opening {
  id: string;
  type: 'window' | 'door';
  position: Point3D; // Bottom-left corner
  width: number;
  height: number;
  sillHeight?: number; // For windows
  material?: string;
}

export interface Floor {
  id: string;
  level: number;
  elevation: number; // Height above ground
  polygon: Polygon2D;
  thickness: number;
  material: string;
}

export interface Roof {
  id: string;
  type: 'flat' | 'gable' | 'hip' | 'shed' | 'mansard';
  pitch: number; // degrees
  ridgeHeight: number;
  overhang: number;
  material: string;
  geometry?: any; // Three.js geometry
}

// ============================================================================
// ROOMS & SPACES
// ============================================================================

export interface Room {
  id: string;
  name: string;
  level: number;
  polygon: Polygon2D;
  area: number; // m²
  height: number;
  function: string; // 'living', 'bedroom', 'kitchen', etc.
  windows: Opening[];
  doors: Opening[];
  adjacentRooms: string[]; // Room IDs
}

export interface Circulation {
  id: string;
  type: 'corridor' | 'stair' | 'elevator' | 'ramp';
  path: Point3D[];
  width: number;
  connectsLevels?: number[]; // For stairs/elevators
}

// ============================================================================
// DESIGN DNA (from AI)
// ============================================================================

export interface DesignDNA {
  projectID: string;
  seed: number;
  
  dimensions: {
    length: number;
    width: number;
    totalHeight: number;
    floorCount: number;
    floorHeights: number[];
    wallThickness: number;
  };
  
  materials: MaterialPalette;
  
  levels: Array<{
    level: number;
    name: string;
    height: number;
    area: number;
    function: string;
    rooms: Room[];
  }>;
  
  floorPlans: Record<string, {
    rooms: Array<{
      name: string;
      dimensions: string;
      area: string;
      position?: string;
      windows?: string[];
      doors?: string[];
    }>;
    circulation?: string;
    entrance?: any;
  }>;
  
  elevations: Record<string, {
    description: string;
    features: string[];
  }>;
  
  viewSpecificFeatures?: Record<string, any>;
  consistencyRules?: string[];
  boundaryValidation?: any;
  architecturalStyle?: string;
}

// ============================================================================
// GEOMETRY MODEL (3D)
// ============================================================================

export interface GeometryModel {
  walls: Wall[];
  floors: Floor[];
  roof: Roof;
  openings: Opening[];
  rooms: Room[];
  circulation: Circulation[];
  boundingBox: BoundingBox;
  metadata: {
    generatedFrom: 'dna' | 'manual';
    timestamp: string;
    validated: boolean;
  };
}

// ============================================================================
// DESIGN PROJECT (Complete State)
// ============================================================================

export interface DesignProject {
  // Identity
  id: string;
  name: string;
  version: string;
  createdAt: string;
  updatedAt: string;
  
  // Inputs
  site: SiteData;
  program: {
    type: string;
    area: number;
    spaces: Array<{
      name: string;
      area: number;
      count: number;
      level?: string;
    }>;
  };
  brief?: string; // Optional text brief
  
  // Derived Data
  dna: DesignDNA;
  geometry?: GeometryModel;
  metrics?: any; // From metricsCalculator
  cost?: any; // From costEstimationService
  
  // Visual Assets
  views?: Record<string, { url?: string; svg?: string }>;
  a1Sheet?: {
    url?: string;
    svgContent?: string;
    metadata: any;
  };
  
  // History
  seed: number;
  parentVersion?: string;
  changes?: Array<{
    field: string;
    oldValue: any;
    newValue: any;
    reason?: string;
  }>;
  
  // Metadata
  generatedBy?: {
    models: Record<string, string>; // task -> model name
    latencies: Record<string, number>; // task -> ms
  };
}

// ============================================================================
// VALIDATION RESULTS
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  errors: Array<{
    type: string;
    message: string;
    severity: 'error' | 'warning';
    field?: string;
  }>;
  warnings: Array<{
    type: string;
    message: string;
    field?: string;
  }>;
}

export interface ConsistencyReport {
  score: number; // 0-1
  passed: boolean;
  checks: Array<{
    name: string;
    passed: boolean;
    message?: string;
  }>;
  issues: string[];
  timestamp: string;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Re-export all interfaces for convenience
};

