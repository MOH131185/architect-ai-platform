/**
 * Design State Manager - Single Source of Truth Controller
 *
 * Manages the unified design state with CRUD operations,
 * validation, and synchronization between geometry and DNA.
 *
 * @module core/designState
 */

import type {
  DesignState,
  DesignStateUpdate,
  Camera,
  DesignDNA,
  Level,
  Room,
  Door,
  Window,
  Wall,
  SiteContext,
  Point2D,
  LatLng
} from './designSchema';

// ============================================================================
// STATE MANAGER CLASS
// ============================================================================

/**
 * Design State Manager
 *
 * Central controller for all design data.
 * Ensures consistency between geometry and DNA.
 */
export class DesignStateManager {
  private state: DesignState;
  private listeners: Array<(state: DesignState) => void> = [];

  constructor(initialState: DesignState) {
    this.state = initialState;
  }

  // ==========================================================================
  // GETTERS
  // ==========================================================================

  /**
   * Get complete design state (immutable copy)
   */
  getState(): Readonly<DesignState> {
    return JSON.parse(JSON.stringify(this.state));
  }

  /**
   * Get design seed
   */
  getSeed(): number {
    return this.state.seed;
  }

  /**
   * Get site context
   */
  getSite(): SiteContext {
    return this.state.site;
  }

  /**
   * Get Design DNA
   */
  getDNA(): DesignDNA {
    return this.state.dna;
  }

  /**
   * Get all cameras
   */
  getCameras(): Camera[] {
    return this.state.cameras;
  }

  /**
   * Get camera by ID
   */
  getCamera(id: string): Camera | undefined {
    return this.state.cameras.find(c => c.id === id);
  }

  /**
   * Get all levels
   */
  getLevels(): Level[] {
    return this.state.levels;
  }

  /**
   * Get level by index
   */
  getLevel(index: number): Level | undefined {
    return this.state.levels.find(l => l.index === index);
  }

  /**
   * Get all rooms
   */
  getRooms(): Room[] {
    return this.state.rooms;
  }

  /**
   * Get room by ID
   */
  getRoom(id: string): Room | undefined {
    return this.state.rooms.find(r => r.id === id);
  }

  /**
   * Get rooms on specific level
   */
  getRoomsByLevel(levelIndex: number): Room[] {
    return this.state.rooms.filter(r => r.levelIndex === levelIndex);
  }

  /**
   * Get all doors
   */
  getDoors(): Door[] {
    return this.state.doors;
  }

  /**
   * Get door by ID
   */
  getDoor(id: string): Door | undefined {
    return this.state.doors.find(d => d.id === id);
  }

  /**
   * Get all windows
   */
  getWindows(): Window[] {
    return this.state.windows;
  }

  /**
   * Get window by ID
   */
  getWindow(id: string): Window | undefined {
    return this.state.windows.find(w => w.id === id);
  }

  /**
   * Get all walls
   */
  getWalls(): Wall[] {
    return this.state.walls;
  }

  /**
   * Get wall by ID
   */
  getWall(id: string): Wall | undefined {
    return this.state.walls.find(w => w.id === id);
  }

  // ==========================================================================
  // SETTERS (Immutable Updates)
  // ==========================================================================

  /**
   * Update entire state (replace)
   */
  setState(newState: DesignState): void {
    this.state = newState;
    this.notifyListeners();
  }

  /**
   * Partial update
   */
  updateState(update: DesignStateUpdate): void {
    this.state = {
      ...this.state,
      ...update,
      timestamp: new Date().toISOString()
    };
    this.notifyListeners();
  }

  /**
   * Update seed
   */
  setSeed(seed: number): void {
    this.state.seed = seed;
    this.notifyListeners();
  }

  /**
   * Update site context
   */
  setSite(site: SiteContext): void {
    this.state.site = site;
    this.notifyListeners();
  }

  /**
   * Update Design DNA
   */
  setDNA(dna: DesignDNA): void {
    this.state.dna = dna;
    this.notifyListeners();
  }

  /**
   * Add camera
   */
  addCamera(camera: Camera): void {
    this.state.cameras.push(camera);
    this.notifyListeners();
  }

  /**
   * Update camera
   */
  updateCamera(id: string, update: Partial<Camera>): void {
    const index = this.state.cameras.findIndex(c => c.id === id);
    if (index !== -1) {
      this.state.cameras[index] = {
        ...this.state.cameras[index],
        ...update
      };
      this.notifyListeners();
    }
  }

  /**
   * Remove camera
   */
  removeCamera(id: string): void {
    this.state.cameras = this.state.cameras.filter(c => c.id !== id);
    this.notifyListeners();
  }

  /**
   * Add level
   */
  addLevel(level: Level): void {
    this.state.levels.push(level);
    this.notifyListeners();
  }

  /**
   * Add room
   */
  addRoom(room: Room): void {
    this.state.rooms.push(room);
    this.notifyListeners();
  }

  /**
   * Add door
   */
  addDoor(door: Door): void {
    this.state.doors.push(door);
    this.notifyListeners();
  }

  /**
   * Add window
   */
  addWindow(window: Window): void {
    this.state.windows.push(window);
    this.notifyListeners();
  }

  /**
   * Add wall
   */
  addWall(wall: Wall): void {
    this.state.walls.push(wall);
    this.notifyListeners();
  }

  // ==========================================================================
  // VALIDATION
  // ==========================================================================

  /**
   * Validate design state integrity
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check required fields
    if (!this.state.id) errors.push('Missing design ID');
    if (!this.state.seed) errors.push('Missing seed');
    if (!this.state.site) errors.push('Missing site context');
    if (!this.state.dna) errors.push('Missing Design DNA');

    // Validate levels
    if (this.state.levels.length === 0) {
      errors.push('No levels defined');
    }

    // Validate DNA dimensions match levels
    if (this.state.dna && this.state.levels.length > 0) {
      const dnaFloors = this.state.dna.dimensions.floorCount;
      const actualFloors = this.state.levels.filter(l => l.isHabitable).length;

      if (dnaFloors !== actualFloors) {
        errors.push(`DNA floor count (${dnaFloors}) doesn't match levels (${actualFloors})`);
      }
    }

    // Validate room references
    this.state.rooms.forEach(room => {
      const level = this.getLevel(room.levelIndex);
      if (!level) {
        errors.push(`Room ${room.id} references non-existent level ${room.levelIndex}`);
      }
    });

    // Validate door references
    this.state.doors.forEach(door => {
      door.connectsRooms.forEach(roomId => {
        const room = this.getRoom(roomId);
        if (!room) {
          errors.push(`Door ${door.id} references non-existent room ${roomId}`);
        }
      });
    });

    // Validate window references
    this.state.windows.forEach(window => {
      const room = this.getRoom(window.roomId);
      if (!room) {
        errors.push(`Window ${window.id} references non-existent room ${window.roomId}`);
      }
    });

    return {
      valid: errors.length === 0,
      errors
    };
  }

  // ==========================================================================
  // OBSERVERS
  // ==========================================================================

  /**
   * Subscribe to state changes
   */
  subscribe(listener: (state: DesignState) => void): () => void {
    this.listeners.push(listener);

    // Return unsubscribe function
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  /**
   * Notify all listeners of state change
   */
  private notifyListeners(): void {
    const state = this.getState();
    this.listeners.forEach(listener => listener(state));
  }

  // ==========================================================================
  // SERIALIZATION
  // ==========================================================================

  /**
   * Export state as JSON
   */
  toJSON(): string {
    return JSON.stringify(this.state, null, 2);
  }

  /**
   * Export state for file download
   */
  exportToFile(): { filename: string; content: string } {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `design-${this.state.id}-${timestamp}.json`;
    const content = this.toJSON();

    return { filename, content };
  }

  /**
   * Import state from JSON
   */
  static fromJSON(json: string): DesignStateManager {
    const state = JSON.parse(json) as DesignState;
    return new DesignStateManager(state);
  }

  // ==========================================================================
  // UTILITIES
  // ==========================================================================

  /**
   * Calculate total building area (all habitable floors)
   */
  getTotalArea(): number {
    return this.state.levels
      .filter(l => l.isHabitable)
      .reduce((sum, level) => sum + level.area, 0);
  }

  /**
   * Calculate total number of rooms
   */
  getTotalRooms(): number {
    return this.state.rooms.length;
  }

  /**
   * Calculate total number of windows
   */
  getTotalWindows(): number {
    return this.state.windows.length;
  }

  /**
   * Calculate total number of doors
   */
  getTotalDoors(): number {
    return this.state.doors.length;
  }

  /**
   * Get design summary
   */
  getSummary(): {
    levels: number;
    rooms: number;
    doors: number;
    windows: number;
    totalArea: number;
    seed: number;
  } {
    return {
      levels: this.state.levels.filter(l => l.isHabitable).length,
      rooms: this.getTotalRooms(),
      doors: this.getTotalDoors(),
      windows: this.getTotalWindows(),
      totalArea: this.getTotalArea(),
      seed: this.state.seed
    };
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create default design state
 */
export function createDefaultDesignState(seed: number = Math.floor(Math.random() * 1000000)): DesignState {
  return {
    id: `design-${Date.now()}`,
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    seed,
    site: createDefaultSite(),
    dna: createDefaultDNA(seed),
    cameras: [],
    levels: [],
    rooms: [],
    walls: [],
    doors: [],
    windows: [],
    metadata: {
      generatedBy: 'geometry',
      geometryFirst: true,
      consistencyScore: 100,
      generationTime: 0
    }
  };
}

/**
 * Create default site context
 */
function createDefaultSite(): SiteContext {
  return {
    address: '',
    coordinates: { lat: 0, lng: 0 },
    boundary: [],
    boundaryLocal: [],
    area: 0,
    perimeter: 0,
    orientation: 0
  };
}

/**
 * Create default Design DNA
 */
function createDefaultDNA(seed: number): DesignDNA {
  return {
    dimensions: {
      length: 12.0,
      width: 8.0,
      totalHeight: 6.0,
      floorCount: 2,
      floorHeights: [3.0, 3.0]
    },
    materials: [
      {
        name: 'Brick',
        hexColor: '#B8604E',
        application: 'exterior walls'
      },
      {
        name: 'Asphalt Shingles',
        hexColor: '#3C3C3C',
        application: 'roof'
      }
    ],
    colorPalette: {
      facade: '#B8604E',
      trim: '#FFFFFF',
      roof: '#3C3C3C',
      windows: '#2C3E50',
      door: '#8B4513'
    },
    roof: {
      type: 'gable',
      pitch: 35,
      material: 'Asphalt Shingles',
      color: '#3C3C3C',
      overhang: 0.5
    },
    architecturalStyle: 'Modern Residential',
    styleKeywords: ['clean lines', 'functional', 'efficient'],
    viewSpecificFeatures: {
      north: {
        mainEntrance: true,
        windows: 4,
        features: ['main entrance centered']
      },
      south: {
        windows: 3,
        features: ['patio doors']
      },
      east: {
        windows: 2,
        features: []
      },
      west: {
        windows: 2,
        features: []
      }
    },
    consistencyRules: [
      'Floor count must match across all views',
      'Materials and colors must be consistent',
      'Window counts must match between floor plans and elevations',
      'Entrance must be on north facade only'
    ],
    seed,
    generatedBy: 'geometry',
    timestamp: new Date().toISOString()
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default DesignStateManager;

// Re-export types for convenience
export type {
  DesignState,
  Camera,
  DesignDNA,
  Level,
  Room,
  Door,
  Window,
  Wall,
  SiteContext,
  Point2D,
  LatLng
};
