/**
 * Geometry Builder - Creates 3D geometry from design state
 *
 * Extrudes walls from rooms, adds doors/windows, creates roof geometry.
 * Returns Three.js meshes for rendering.
 *
 * @module geometry/buildGeometry
 */

import * as THREE from 'three';
import type {
  DesignState,
  Level,
  Room,
  Door,
  Window,
  Wall,
  Point2D,
  Point3D
} from '../core/designSchema';

// ============================================================================
// TYPES
// ============================================================================

export interface BuildGeometryOptions {
  /** Include roof geometry */
  includeRoof?: boolean;
  /** Include floor slabs */
  includeFloors?: boolean;
  /** Include openings (doors/windows) */
  includeOpenings?: boolean;
  /** Level of detail: 'low' | 'medium' | 'high' */
  lod?: 'low' | 'medium' | 'high';
}

export interface GeometryResult {
  /** Scene containing all geometry */
  scene: THREE.Scene;
  /** Building meshes organized by type */
  meshes: {
    walls: THREE.Mesh[];
    floors: THREE.Mesh[];
    roof: THREE.Mesh[];
    doors: THREE.Mesh[];
    windows: THREE.Mesh[];
  };
  /** Bounding box of entire building */
  boundingBox: THREE.Box3;
  /** Building dimensions */
  dimensions: {
    length: number;
    width: number;
    height: number;
  };
}

// ============================================================================
// MATERIALS
// ============================================================================

/**
 * Create standard architectural materials
 */
export function createMaterials(state: DesignState) {
  const materials = {
    // Exterior walls
    exteriorWall: new THREE.MeshStandardMaterial({
      color: state.dna.colorPalette.facade || '#B8604E',
      roughness: 0.8,
      metalness: 0.1,
      side: THREE.DoubleSide
    }),

    // Interior walls
    interiorWall: new THREE.MeshStandardMaterial({
      color: '#F5F5F5',
      roughness: 0.9,
      metalness: 0.0,
      side: THREE.DoubleSide
    }),

    // Floors
    floor: new THREE.MeshStandardMaterial({
      color: '#D3D3D3',
      roughness: 0.7,
      metalness: 0.1
    }),

    // Roof
    roof: new THREE.MeshStandardMaterial({
      color: state.dna.colorPalette.roof || '#3C3C3C',
      roughness: 0.6,
      metalness: 0.2
    }),

    // Windows (glass)
    window: new THREE.MeshStandardMaterial({
      color: state.dna.colorPalette.windows || '#87CEEB',
      transparent: true,
      opacity: 0.4,
      roughness: 0.1,
      metalness: 0.5,
      side: THREE.DoubleSide
    }),

    // Window frames
    windowFrame: new THREE.MeshStandardMaterial({
      color: state.dna.colorPalette.trim || '#FFFFFF',
      roughness: 0.4,
      metalness: 0.6
    }),

    // Doors
    door: new THREE.MeshStandardMaterial({
      color: state.dna.colorPalette.door || '#8B4513',
      roughness: 0.6,
      metalness: 0.2,
      side: THREE.DoubleSide
    })
  };

  return materials;
}

// ============================================================================
// COORDINATE CONVERSION
// ============================================================================

/**
 * Convert 2D point to Three.js Vector2
 */
function toVector2(point: Point2D): THREE.Vector2 {
  return new THREE.Vector2(point.x, point.y);
}

/**
 * Convert 3D point to Three.js Vector3
 */
function toVector3(point: Point3D): THREE.Vector3 {
  return new THREE.Vector3(point.x, point.y, point.z);
}

/**
 * Convert 2D polygon to Three.js Shape
 */
function polygonToShape(polygon: Point2D[]): THREE.Shape {
  const shape = new THREE.Shape();

  if (polygon.length < 3) {
    console.warn('Polygon has fewer than 3 vertices');
    return shape;
  }

  // Start at first point
  shape.moveTo(polygon[0].x, polygon[0].y);

  // Draw to remaining points
  for (let i = 1; i < polygon.length; i++) {
    shape.lineTo(polygon[i].x, polygon[i].y);
  }

  // Close path if not already closed
  const first = polygon[0];
  const last = polygon[polygon.length - 1];
  if (Math.abs(first.x - last.x) > 0.001 || Math.abs(first.y - last.y) > 0.001) {
    shape.lineTo(first.x, first.y);
  }

  return shape;
}

// ============================================================================
// WALL EXTRUSION
// ============================================================================

/**
 * Extrude walls from room polygon
 */
export function extrudeWallsFromRoom(
  room: Room,
  level: Level,
  materials: ReturnType<typeof createMaterials>,
  options: BuildGeometryOptions = {}
): THREE.Mesh {
  const { includeOpenings = true } = options;

  // Create room outline shape
  const shape = polygonToShape(room.polygon);

  // Calculate wall height
  const wallHeight = level.ceilingHeight;

  // Create holes for doors and windows if requested
  if (includeOpenings && room.hasExteriorWall) {
    // Note: Full opening geometry requires intersection with wall segments
    // This is a simplified version - full implementation would create
    // proper door/window openings in the wall geometry
  }

  // Extrude shape to create walls
  const extrudeSettings: THREE.ExtrudeGeometryOptions = {
    depth: 0.2, // Wall thickness (200mm)
    bevelEnabled: false
  };

  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);

  // Rotate to vertical (extrusion is along Z, we want Y-up)
  geometry.rotateX(Math.PI / 2);

  // Scale Z to wall height
  geometry.scale(1, wallHeight / 0.2, 1);

  // Position at level elevation
  geometry.translate(0, level.elevation, 0);

  // Choose material based on room type
  const material = room.hasExteriorWall
    ? materials.exteriorWall
    : materials.interiorWall;

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData = {
    type: 'walls',
    roomId: room.id,
    levelIndex: room.levelIndex
  };

  return mesh;
}

/**
 * Create wall segment between two points
 */
export function createWallSegment(
  wall: Wall,
  materials: ReturnType<typeof createMaterials>,
  levelElevation: number
): THREE.Mesh {
  const start = new THREE.Vector3(wall.start.x, levelElevation, wall.start.y);
  const end = new THREE.Vector3(wall.end.x, levelElevation, wall.end.y);

  // Calculate wall direction and length
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();
  direction.normalize();

  // Create box geometry for wall
  const geometry = new THREE.BoxGeometry(
    length,
    wall.height,
    wall.thickness
  );

  // Position at wall center
  const center = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
  center.y += wall.height / 2; // Elevate to half height

  // Choose material
  const material = wall.type === 'exterior'
    ? materials.exteriorWall
    : materials.interiorWall;

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(center);

  // Rotate to align with wall direction
  const angle = Math.atan2(direction.z, direction.x);
  mesh.rotation.y = angle;

  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData = {
    type: 'wall',
    wallId: wall.id,
    levelIndex: wall.levelIndex
  };

  return mesh;
}

// ============================================================================
// FLOOR SLABS
// ============================================================================

/**
 * Create floor slab for a level
 */
export function createFloorSlab(
  level: Level,
  materials: ReturnType<typeof createMaterials>
): THREE.Mesh {
  // Create shape from footprint
  const shape = polygonToShape(level.footprint);

  // Extrude to create slab thickness (200mm)
  const extrudeSettings: THREE.ExtrudeGeometryOptions = {
    depth: 0.2,
    bevelEnabled: false
  };

  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);

  // Rotate to horizontal
  geometry.rotateX(Math.PI / 2);

  // Position at level elevation
  geometry.translate(0, level.elevation, 0);

  const mesh = new THREE.Mesh(geometry, materials.floor);
  mesh.receiveShadow = true;
  mesh.userData = {
    type: 'floor',
    levelId: level.id,
    levelIndex: level.index
  };

  return mesh;
}

// ============================================================================
// OPENINGS (DOORS & WINDOWS)
// ============================================================================

/**
 * Create door geometry
 */
export function createDoor(
  door: Door,
  materials: ReturnType<typeof createMaterials>,
  levelElevation: number
): THREE.Mesh {
  // Create door panel
  const geometry = new THREE.BoxGeometry(
    door.width,
    door.height,
    door.thickness
  );

  const mesh = new THREE.Mesh(geometry, materials.door);

  // Position door
  mesh.position.set(
    door.position.x,
    levelElevation + door.height / 2,
    door.position.y
  );

  // Rotate door to correct orientation
  mesh.rotation.y = (door.rotation * Math.PI) / 180;

  mesh.castShadow = true;
  mesh.userData = {
    type: 'door',
    doorId: door.id,
    isMain: door.isMain
  };

  return mesh;
}

/**
 * Create window geometry with frame
 */
export function createWindow(
  window: Window,
  materials: ReturnType<typeof createMaterials>,
  levelElevation: number
): THREE.Group {
  const group = new THREE.Group();

  // Window glass
  const glassGeometry = new THREE.PlaneGeometry(window.width, window.height);
  const glassMesh = new THREE.Mesh(glassGeometry, materials.window);
  glassMesh.castShadow = true;
  glassMesh.receiveShadow = true;

  // Window frame
  const frameThickness = 0.05; // 50mm
  const frameDepth = 0.1; // 100mm

  // Top frame
  const topFrame = new THREE.Mesh(
    new THREE.BoxGeometry(window.width + frameThickness * 2, frameThickness, frameDepth),
    materials.windowFrame
  );
  topFrame.position.y = window.height / 2 + frameThickness / 2;

  // Bottom frame
  const bottomFrame = new THREE.Mesh(
    new THREE.BoxGeometry(window.width + frameThickness * 2, frameThickness, frameDepth),
    materials.windowFrame
  );
  bottomFrame.position.y = -window.height / 2 - frameThickness / 2;

  // Left frame
  const leftFrame = new THREE.Mesh(
    new THREE.BoxGeometry(frameThickness, window.height, frameDepth),
    materials.windowFrame
  );
  leftFrame.position.x = -window.width / 2 - frameThickness / 2;

  // Right frame
  const rightFrame = new THREE.Mesh(
    new THREE.BoxGeometry(frameThickness, window.height, frameDepth),
    materials.windowFrame
  );
  rightFrame.position.x = window.width / 2 + frameThickness / 2;

  group.add(glassMesh, topFrame, bottomFrame, leftFrame, rightFrame);

  // Position window at sill height
  group.position.set(
    window.position.x,
    levelElevation + window.sillHeight + window.height / 2,
    window.position.y
  );

  // Rotate to correct orientation
  group.rotation.y = (window.rotation * Math.PI) / 180;

  group.userData = {
    type: 'window',
    windowId: window.id,
    roomId: window.roomId
  };

  return group;
}

// ============================================================================
// ROOF
// ============================================================================

/**
 * Create roof geometry based on roof type
 */
export function createRoof(
  state: DesignState,
  materials: ReturnType<typeof createMaterials>
): THREE.Mesh {
  const roofSpec = state.dna.roof;
  const topLevel = state.levels[state.levels.length - 1];
  const footprint = topLevel.footprint;

  // Calculate roof height from pitch
  const pitchRadians = (roofSpec.pitch * Math.PI) / 180;

  // Get building dimensions
  const minX = Math.min(...footprint.map(p => p.x));
  const maxX = Math.max(...footprint.map(p => p.x));
  const minY = Math.min(...footprint.map(p => p.y));
  const maxY = Math.max(...footprint.map(p => p.y));

  const buildingWidth = maxX - minX;
  const buildingDepth = maxY - minY;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  let roofGeometry: THREE.BufferGeometry;

  if (roofSpec.type === 'flat') {
    // Flat roof - simple slab
    const shape = polygonToShape(footprint);
    roofGeometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.15, // 150mm thick slab
      bevelEnabled: false
    });
    roofGeometry.rotateX(Math.PI / 2);

  } else if (roofSpec.type === 'gable') {
    // Gable roof - two sloped planes
    const roofHeight = (buildingDepth / 2) * Math.tan(pitchRadians);
    const ridgeY = topLevel.elevation + topLevel.floorToFloorHeight;

    // Create gable shape
    const vertices = new Float32Array([
      // South slope
      minX - roofSpec.overhang, ridgeY, minY - roofSpec.overhang,
      maxX + roofSpec.overhang, ridgeY, minY - roofSpec.overhang,
      maxX + roofSpec.overhang, ridgeY + roofHeight, centerY,
      minX - roofSpec.overhang, ridgeY + roofHeight, centerY,

      // North slope
      minX - roofSpec.overhang, ridgeY + roofHeight, centerY,
      maxX + roofSpec.overhang, ridgeY + roofHeight, centerY,
      maxX + roofSpec.overhang, ridgeY, maxY + roofSpec.overhang,
      minX - roofSpec.overhang, ridgeY, maxY + roofSpec.overhang
    ]);

    const indices = new Uint16Array([
      // South face
      0, 1, 2, 0, 2, 3,
      // North face
      4, 5, 6, 4, 6, 7
    ]);

    roofGeometry = new THREE.BufferGeometry();
    roofGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    roofGeometry.setIndex(new THREE.BufferAttribute(indices, 1));
    roofGeometry.computeVertexNormals();

  } else if (roofSpec.type === 'hip') {
    // Hip roof - four sloped planes
    const roofHeight = Math.min(buildingWidth, buildingDepth) / 2 * Math.tan(pitchRadians);
    const ridgeY = topLevel.elevation + topLevel.floorToFloorHeight + roofHeight;

    // Simplified hip roof as pyramid
    const vertices = new Float32Array([
      // Base corners
      minX - roofSpec.overhang, topLevel.elevation + topLevel.floorToFloorHeight, minY - roofSpec.overhang,
      maxX + roofSpec.overhang, topLevel.elevation + topLevel.floorToFloorHeight, minY - roofSpec.overhang,
      maxX + roofSpec.overhang, topLevel.elevation + topLevel.floorToFloorHeight, maxY + roofSpec.overhang,
      minX - roofSpec.overhang, topLevel.elevation + topLevel.floorToFloorHeight, maxY + roofSpec.overhang,
      // Apex
      centerX, ridgeY, centerY
    ]);

    const indices = new Uint16Array([
      0, 1, 4,  // South
      1, 2, 4,  // East
      2, 3, 4,  // North
      3, 0, 4   // West
    ]);

    roofGeometry = new THREE.BufferGeometry();
    roofGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    roofGeometry.setIndex(new THREE.BufferAttribute(indices, 1));
    roofGeometry.computeVertexNormals();

  } else {
    // Default: flat roof
    const shape = polygonToShape(footprint);
    roofGeometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.15,
      bevelEnabled: false
    });
    roofGeometry.rotateX(Math.PI / 2);
  }

  const mesh = new THREE.Mesh(roofGeometry, materials.roof);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData = {
    type: 'roof',
    roofType: roofSpec.type
  };

  return mesh;
}

// ============================================================================
// MAIN BUILD FUNCTION
// ============================================================================

/**
 * Build complete 3D geometry from design state
 */
export function buildGeometry(
  state: DesignState,
  options: BuildGeometryOptions = {}
): GeometryResult {
  const {
    includeRoof = true,
    includeFloors = true,
    includeOpenings = true
  } = options;

  // Create scene
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87CEEB); // Sky blue

  // Add lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(50, 100, 50);
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.width = 2048;
  directionalLight.shadow.mapSize.height = 2048;
  scene.add(directionalLight);

  // Create materials
  const materials = createMaterials(state);

  // Result containers
  const meshes = {
    walls: [] as THREE.Mesh[],
    floors: [] as THREE.Mesh[],
    roof: [] as THREE.Mesh[],
    doors: [] as THREE.Mesh[],
    windows: [] as THREE.Mesh[]
  };

  // Build geometry level by level
  for (const level of state.levels) {
    // Create floor slab
    if (includeFloors) {
      const floorMesh = createFloorSlab(level, materials);
      meshes.floors.push(floorMesh);
      scene.add(floorMesh);
    }

    // Create walls from rooms
    for (const room of state.rooms.filter(r => r.levelIndex === level.index)) {
      const wallMesh = extrudeWallsFromRoom(room, level, materials, options);
      meshes.walls.push(wallMesh);
      scene.add(wallMesh);
    }

    // Alternative: Create walls from wall segments
    for (const wall of state.walls.filter(w => w.levelIndex === level.index)) {
      const wallMesh = createWallSegment(wall, materials, level.elevation);
      meshes.walls.push(wallMesh);
      scene.add(wallMesh);
    }

    // Create doors
    if (includeOpenings) {
      for (const door of state.doors.filter(d => d.levelIndex === level.index)) {
        const doorMesh = createDoor(door, materials, level.elevation);
        meshes.doors.push(doorMesh);
        scene.add(doorMesh);
      }

      // Create windows
      for (const window of state.windows.filter(w => w.levelIndex === level.index)) {
        const windowGroup = createWindow(window, materials, level.elevation);
        meshes.windows.push(windowGroup as any);
        scene.add(windowGroup);
      }
    }
  }

  // Create roof
  if (includeRoof) {
    const roofMesh = createRoof(state, materials);
    meshes.roof.push(roofMesh);
    scene.add(roofMesh);
  }

  // Calculate bounding box
  const boundingBox = new THREE.Box3();
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      const box = new THREE.Box3().setFromObject(object);
      boundingBox.union(box);
    }
  });

  const dimensions = {
    length: state.dna.dimensions.length,
    width: state.dna.dimensions.width,
    height: state.dna.dimensions.totalHeight
  };

  return {
    scene,
    meshes,
    boundingBox,
    dimensions
  };
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get scene center point
 */
export function getSceneCenter(result: GeometryResult): THREE.Vector3 {
  const center = new THREE.Vector3();
  result.boundingBox.getCenter(center);
  return center;
}

/**
 * Get scene size
 */
export function getSceneSize(result: GeometryResult): THREE.Vector3 {
  const size = new THREE.Vector3();
  result.boundingBox.getSize(size);
  return size;
}

/**
 * Dispose geometry and materials
 */
export function disposeGeometry(result: GeometryResult): void {
  result.scene.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      if (object.geometry) {
        object.geometry.dispose();
      }
      if (object.material) {
        if (Array.isArray(object.material)) {
          object.material.forEach(material => material.dispose());
        } else {
          object.material.dispose();
        }
      }
    }
  });
}
