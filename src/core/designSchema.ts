/**
 * Design Schema - Single Source of Truth
 *
 * Unified data structure for geometry-first architecture generation.
 * Contains all design data: geometry, DNA, cameras, levels, rooms, openings.
 *
 * @module core/designSchema
 */

// ============================================================================
// COORDINATE SYSTEMS
// ============================================================================

/**
 * Geographic coordinates (Google Maps, site location)
 */
export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Local 2D coordinates (meters from site origin)
 */
export interface Point2D {
  x: number;
  y: number;
}

/**
 * 3D coordinates (meters in local space)
 */
export interface Point3D {
  x: number;
  y: number;
  z: number;
}

/**
 * Dimensions (width, height, depth in meters)
 */
export interface Dimensions {
  width: number;
  height: number;
  depth?: number;
}

// ============================================================================
// CAMERAS (for 3D rendering and view generation)
// ============================================================================

export type CameraType = 'orthographic' | 'perspective';
export type ViewType = 'floor_plan' | 'elevation' | 'section' | 'exterior_3d' | 'axonometric' | 'perspective' | 'interior';

/**
 * Camera configuration for rendering specific architectural views
 */
export interface Camera {
  id: string;
  name: string;
  type: CameraType;
  viewType: ViewType;

  // Position
  position: Point3D;
  target: Point3D;
  up?: Point3D;

  // Orthographic settings
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
  near?: number;
  far?: number;

  // Perspective settings
  fov?: number;
  aspect?: number;

  // Rendering settings
  resolution: {
    width: number;
    height: number;
  };

  // Associated floor level (for floor plans)
  floorLevel?: number;

  // Orientation (for elevations/sections)
  orientation?: 'north' | 'south' | 'east' | 'west' | 'longitudinal' | 'cross';
}

// ============================================================================
// DNA (Design DNA - AI-generated specifications)
// ============================================================================

/**
 * Material specification with hex color
 */
export interface Material {
  name: string;
  hexColor: string;
  application: string;
  texture?: string;
  finish?: string;
}

/**
 * Color palette for the design
 */
export interface ColorPalette {
  facade: string;
  trim: string;
  roof: string;
  windows: string;
  door: string;
  accent?: string;
}

/**
 * Roof specification
 */
export interface RoofSpec {
  type: 'gable' | 'hip' | 'flat' | 'shed' | 'gambrel' | 'mansard';
  pitch: number; // degrees
  material: string;
  color: string;
  overhang: number; // meters
}

/**
 * View-specific features for each facade
 */
export interface ViewFeatures {
  north?: {
    mainEntrance?: boolean;
    windows?: number;
    features?: string[];
  };
  south?: {
    patioDoors?: boolean;
    windows?: number;
    features?: string[];
  };
  east?: {
    windows?: number;
    features?: string[];
  };
  west?: {
    windows?: number;
    features?: string[];
  };
}

/**
 * Complete Design DNA specification
 */
export interface DesignDNA {
  // Basic dimensions
  dimensions: {
    length: number;
    width: number;
    totalHeight: number;
    floorCount: number;
    floorHeights: number[];
  };

  // Materials
  materials: Material[];

  // Color palette
  colorPalette: ColorPalette;

  // Roof
  roof: RoofSpec;

  // Style
  architecturalStyle: string;
  styleKeywords: string[];

  // View-specific features
  viewSpecificFeatures: ViewFeatures;

  // Consistency rules
  consistencyRules: string[];

  // Generation metadata
  seed?: number;
  generatedBy?: 'ai' | 'geometry' | 'hybrid';
  timestamp?: string;
}

// ============================================================================
// LEVELS (Floors/Stories)
// ============================================================================

export type LevelType = 'basement' | 'ground' | 'upper' | 'attic' | 'roof';

/**
 * Building level (floor/story)
 */
export interface Level {
  id: string;
  index: number; // 0 = ground, 1 = first upper, etc.
  name: string;
  type: LevelType;

  // Elevation
  elevation: number; // meters above ground
  floorToFloorHeight: number; // meters
  ceilingHeight: number; // meters

  // Geometry
  footprint: Point2D[];
  area: number; // square meters

  // Contents
  rooms: string[]; // Room IDs
  walls: string[]; // Wall IDs
  doors: string[]; // Door IDs
  windows: string[]; // Window IDs

  // Properties
  isHabitable: boolean;
  hasEntranceDoor: boolean;
}

// ============================================================================
// ROOMS
// ============================================================================

export type RoomType =
  | 'living' | 'dining' | 'kitchen' | 'bedroom' | 'bathroom'
  | 'office' | 'utility' | 'hallway' | 'closet' | 'garage'
  | 'entry' | 'mudroom' | 'laundry' | 'pantry';

/**
 * Room specification
 */
export interface Room {
  id: string;
  name: string;
  type: RoomType;

  // Location
  levelId: string;
  levelIndex: number;

  // Geometry
  polygon: Point2D[]; // Room boundary in local coordinates
  area: number; // square meters
  dimensions: {
    length: number;
    width: number;
  };

  // Position on level
  position: Point2D; // Bottom-left corner

  // Adjacency
  adjacentRooms: string[]; // Room IDs
  adjacentTo?: {
    north?: string;
    south?: string;
    east?: string;
    west?: string;
  };

  // Openings
  doors: string[]; // Door IDs
  windows: string[]; // Window IDs

  // Requirements
  hasExteriorWall: boolean;
  requiresNaturalLight: boolean;
  requiresPrivacy: boolean;

  // Fixtures (optional)
  fixtures?: Array<{
    type: string;
    position: Point2D;
    rotation?: number;
  }>;
}

// ============================================================================
// DOORS
// ============================================================================

export type DoorType =
  | 'entrance' | 'interior' | 'sliding' | 'french' | 'pocket'
  | 'bifold' | 'garage' | 'patio';

export type DoorSwing = 'left' | 'right' | 'double' | 'none';

/**
 * Door specification
 */
export interface Door {
  id: string;
  name: string;
  type: DoorType;

  // Location
  levelId: string;
  levelIndex: number;

  // Position on wall
  position: Point2D; // Center of door
  wallId?: string; // Wall it's placed on

  // Orientation
  rotation: number; // degrees from east (0° = facing east)
  normal: Point2D; // Unit vector perpendicular to door

  // Dimensions
  width: number; // meters
  height: number; // meters
  thickness: number; // meters

  // Properties
  swing: DoorSwing;
  isExterior: boolean;
  isMain: boolean; // Main entrance

  // Connects
  connectsRooms: string[]; // Room IDs (typically 2)
  connectsToExterior: boolean;

  // Material
  material?: string;
  color?: string;
}

// ============================================================================
// WINDOWS
// ============================================================================

export type WindowType =
  | 'casement' | 'double_hung' | 'sliding' | 'fixed'
  | 'bay' | 'bow' | 'picture' | 'awning' | 'hopper';

/**
 * Window specification
 */
export interface Window {
  id: string;
  name: string;
  type: WindowType;

  // Location
  levelId: string;
  levelIndex: number;
  roomId: string; // Room it belongs to

  // Position on wall
  position: Point2D; // Center of window
  wallId?: string; // Wall it's placed on

  // Orientation
  rotation: number; // degrees from east
  normal: Point2D; // Unit vector perpendicular to window (outward)
  orientation: 'north' | 'south' | 'east' | 'west';

  // Dimensions
  width: number; // meters
  height: number; // meters
  sillHeight: number; // meters above floor

  // Properties
  isOperable: boolean;

  // Glazing
  glazingLayers: number;
  frameColor?: string;
}

// ============================================================================
// WALLS
// ============================================================================

export type WallType = 'exterior' | 'interior' | 'partition' | 'structural';

/**
 * Wall specification
 */
export interface Wall {
  id: string;
  type: WallType;

  // Location
  levelId: string;
  levelIndex: number;

  // Geometry
  start: Point2D;
  end: Point2D;
  length: number;
  thickness: number; // meters
  height: number; // meters

  // Orientation
  angle: number; // degrees from east
  normal: Point2D; // Unit vector perpendicular to wall

  // Openings
  doors: string[]; // Door IDs
  windows: string[]; // Window IDs

  // Properties
  isLoadBearing: boolean;

  // Adjacent spaces
  roomA?: string; // Room ID on one side
  roomB?: string; // Room ID on other side
}

// ============================================================================
// SITE
// ============================================================================

/**
 * Site context and constraints
 */
export interface SiteContext {
  // Geographic
  address: string;
  coordinates: LatLng;

  // Polygon
  boundary: LatLng[]; // Site boundary in geographic coords
  boundaryLocal: Point2D[]; // Site boundary in local coords

  // Metrics
  area: number; // square meters
  perimeter: number; // meters
  orientation: number; // degrees from north

  // Constraints
  setbacks?: {
    front: number;
    rear: number;
    left: number;
    right: number;
  };

  // Building envelope
  buildingEnvelope?: Point2D[]; // After applying setbacks
  maxCoverage?: number; // percentage
  maxHeight?: number; // meters
  maxFloors?: number;

  // Context
  zoning?: string;
  climate?: string;
}

// ============================================================================
// MAIN DESIGN STATE
// ============================================================================

/**
 * Complete design state - Single Source of Truth
 */
export interface DesignState {
  // Metadata
  id: string;
  version: string;
  timestamp: string;

  // Generation seed for consistency
  seed: number;

  // Site
  site: SiteContext;

  // Design DNA (AI-enhanced specifications)
  dna: DesignDNA;

  // Cameras (for rendering)
  cameras: Camera[];

  // Building structure
  levels: Level[];
  rooms: Room[];
  walls: Wall[];
  doors: Door[];
  windows: Window[];

  // Generation metadata
  metadata: {
    generatedBy: 'geometry' | 'ai' | 'hybrid';
    geometryFirst: boolean;
    consistencyScore?: number;
    generationTime?: number; // seconds
    aiModel?: string;
  };
}

// ============================================================================
// DEFAULT VALUES
// ============================================================================

export const DEFAULT_CAMERA: Partial<Camera> = {
  type: 'orthographic',
  up: { x: 0, y: 0, z: 1 },
  near: 0.1,
  far: 1000,
  resolution: { width: 1024, height: 1024 }
};

export const DEFAULT_MATERIAL: Material = {
  name: 'Default Material',
  hexColor: '#CCCCCC',
  application: 'general'
};

export const DEFAULT_ROOM_HEIGHT = 2.7; // meters
export const DEFAULT_DOOR_WIDTH = 0.9; // meters
export const DEFAULT_DOOR_HEIGHT = 2.1; // meters
export const DEFAULT_WINDOW_WIDTH = 1.2; // meters
export const DEFAULT_WINDOW_HEIGHT = 1.4; // meters
export const DEFAULT_WINDOW_SILL_HEIGHT = 0.9; // meters
export const DEFAULT_WALL_THICKNESS_EXTERIOR = 0.3; // meters
export const DEFAULT_WALL_THICKNESS_INTERIOR = 0.15; // meters

// ============================================================================
// HELPER TYPES
// ============================================================================

export type DesignStateUpdate = Partial<DesignState>;
export type LevelUpdate = Partial<Level>;
export type RoomUpdate = Partial<Room>;
export type DoorUpdate = Partial<Door>;
export type WindowUpdate = Partial<Window>;
