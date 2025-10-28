/**
 * Camera Configurations for Architectural Views
 *
 * Creates cameras for floor plans, elevations, sections, axonometric,
 * perspective, and interior views.
 *
 * @module geometry/cameras
 */

import * as THREE from 'three';
import type { DesignState, Camera as CameraConfig, ViewType } from '../core/designSchema';
import type { GeometryResult } from './buildGeometry';

// ============================================================================
// CAMERA CONFIGURATION
// ============================================================================

export interface CameraSetupOptions {
  /** Image resolution width */
  width?: number;
  /** Image resolution height */
  height?: number;
  /** Camera distance multiplier */
  distanceMultiplier?: number;
}

export interface CameraResult {
  /** Three.js camera instance */
  camera: THREE.Camera;
  /** Camera configuration */
  config: CameraConfig;
  /** View name */
  viewName: string;
  /** Suggested filename for this view */
  filename: string;
}

// ============================================================================
// ORTHOGRAPHIC CAMERAS (Plans, Elevations, Sections)
// ============================================================================

/**
 * Create orthographic camera for floor plan view
 */
export function createFloorPlanCamera(
  state: DesignState,
  geometry: GeometryResult,
  levelIndex: number,
  options: CameraSetupOptions = {}
): CameraResult {
  const { width = 2048, height = 2048, distanceMultiplier = 1.5 } = options;

  const level = state.levels[levelIndex];
  if (!level) {
    throw new Error(`Level ${levelIndex} not found`);
  }

  // Calculate view bounds from level footprint
  const footprint = level.footprint;
  const minX = Math.min(...footprint.map(p => p.x));
  const maxX = Math.max(...footprint.map(p => p.x));
  const minZ = Math.min(...footprint.map(p => p.y));
  const maxZ = Math.max(...footprint.map(p => p.y));

  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const sizeX = (maxX - minX) * distanceMultiplier;
  const sizeZ = (maxZ - minZ) * distanceMultiplier;

  // Create orthographic camera looking down
  const camera = new THREE.OrthographicCamera(
    -sizeX / 2, // left
    sizeX / 2,  // right
    sizeZ / 2,  // top
    -sizeZ / 2, // bottom
    0.1,        // near
    1000        // far
  );

  // Position camera above the level at cut height (1.5m above floor)
  const cutHeight = level.elevation + 1.5;
  camera.position.set(centerX, cutHeight + 10, centerZ);
  camera.lookAt(centerX, cutHeight, centerZ);
  camera.up.set(0, 0, -1); // North is up in floor plans

  const config: CameraConfig = {
    id: `camera-plan-${levelIndex}`,
    name: `Floor Plan ${level.name}`,
    type: 'orthographic',
    viewType: 'floor_plan',
    position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
    target: { x: centerX, y: cutHeight, z: centerZ },
    left: -sizeX / 2,
    right: sizeX / 2,
    top: sizeZ / 2,
    bottom: -sizeZ / 2,
    near: 0.1,
    far: 1000,
    resolution: { width, height },
    floorLevel: levelIndex
  };

  return {
    camera,
    config,
    viewName: `Floor Plan - ${level.name}`,
    filename: `floor-plan-${levelIndex}-${level.name.toLowerCase().replace(/\s+/g, '-')}.png`
  };
}

/**
 * Create orthographic camera for elevation view
 */
export function createElevationCamera(
  state: DesignState,
  geometry: GeometryResult,
  orientation: 'north' | 'south' | 'east' | 'west',
  options: CameraSetupOptions = {}
): CameraResult {
  const { width = 2048, height = 1536, distanceMultiplier = 1.5 } = options;

  const center = geometry.boundingBox.getCenter(new THREE.Vector3());
  const size = geometry.boundingBox.getSize(new THREE.Vector3());

  let cameraPos: THREE.Vector3;
  let lookAtPos: THREE.Vector3;
  let viewWidth: number;
  let viewHeight: number;

  // Calculate viewing dimensions
  const buildingHeight = geometry.dimensions.height * distanceMultiplier;

  switch (orientation) {
    case 'north': // Looking from north (negative Z)
      cameraPos = new THREE.Vector3(center.x, center.y, center.z - size.z * 2);
      lookAtPos = new THREE.Vector3(center.x, center.y, center.z);
      viewWidth = geometry.dimensions.length * distanceMultiplier;
      viewHeight = buildingHeight;
      break;

    case 'south': // Looking from south (positive Z)
      cameraPos = new THREE.Vector3(center.x, center.y, center.z + size.z * 2);
      lookAtPos = new THREE.Vector3(center.x, center.y, center.z);
      viewWidth = geometry.dimensions.length * distanceMultiplier;
      viewHeight = buildingHeight;
      break;

    case 'east': // Looking from east (positive X)
      cameraPos = new THREE.Vector3(center.x + size.x * 2, center.y, center.z);
      lookAtPos = new THREE.Vector3(center.x, center.y, center.z);
      viewWidth = geometry.dimensions.width * distanceMultiplier;
      viewHeight = buildingHeight;
      break;

    case 'west': // Looking from west (negative X)
      cameraPos = new THREE.Vector3(center.x - size.x * 2, center.y, center.z);
      lookAtPos = new THREE.Vector3(center.x, center.y, center.z);
      viewWidth = geometry.dimensions.width * distanceMultiplier;
      viewHeight = buildingHeight;
      break;
  }

  const camera = new THREE.OrthographicCamera(
    -viewWidth / 2,
    viewWidth / 2,
    viewHeight / 2,
    -viewHeight / 2,
    0.1,
    1000
  );

  camera.position.copy(cameraPos);
  camera.lookAt(lookAtPos);
  camera.up.set(0, 1, 0);

  const config: CameraConfig = {
    id: `camera-elevation-${orientation}`,
    name: `${orientation.charAt(0).toUpperCase() + orientation.slice(1)} Elevation`,
    type: 'orthographic',
    viewType: 'elevation',
    position: { x: cameraPos.x, y: cameraPos.y, z: cameraPos.z },
    target: { x: lookAtPos.x, y: lookAtPos.y, z: lookAtPos.z },
    left: -viewWidth / 2,
    right: viewWidth / 2,
    top: viewHeight / 2,
    bottom: -viewHeight / 2,
    near: 0.1,
    far: 1000,
    resolution: { width, height },
    orientation
  };

  return {
    camera,
    config,
    viewName: `${orientation.charAt(0).toUpperCase() + orientation.slice(1)} Elevation`,
    filename: `elevation-${orientation}.png`
  };
}

/**
 * Create orthographic camera for section view
 */
export function createSectionCamera(
  state: DesignState,
  geometry: GeometryResult,
  orientation: 'longitudinal' | 'cross',
  options: CameraSetupOptions = {}
): CameraResult {
  const { width = 2048, height = 1536, distanceMultiplier = 1.5 } = options;

  const center = geometry.boundingBox.getCenter(new THREE.Vector3());
  const size = geometry.boundingBox.getSize(new THREE.Vector3());

  let cameraPos: THREE.Vector3;
  let lookAtPos: THREE.Vector3;
  let viewWidth: number;
  let viewHeight: number;

  const buildingHeight = geometry.dimensions.height * distanceMultiplier;

  if (orientation === 'longitudinal') {
    // Section along length (looking from side)
    cameraPos = new THREE.Vector3(center.x + size.x * 2, center.y, center.z);
    lookAtPos = new THREE.Vector3(center.x, center.y, center.z);
    viewWidth = geometry.dimensions.width * distanceMultiplier;
    viewHeight = buildingHeight;
  } else {
    // Cross section (looking from front/back)
    cameraPos = new THREE.Vector3(center.x, center.y, center.z - size.z * 2);
    lookAtPos = new THREE.Vector3(center.x, center.y, center.z);
    viewWidth = geometry.dimensions.length * distanceMultiplier;
    viewHeight = buildingHeight;
  }

  const camera = new THREE.OrthographicCamera(
    -viewWidth / 2,
    viewWidth / 2,
    viewHeight / 2,
    -viewHeight / 2,
    0.1,
    1000
  );

  camera.position.copy(cameraPos);
  camera.lookAt(lookAtPos);
  camera.up.set(0, 1, 0);

  const config: CameraConfig = {
    id: `camera-section-${orientation}`,
    name: `${orientation.charAt(0).toUpperCase() + orientation.slice(1)} Section`,
    type: 'orthographic',
    viewType: 'section',
    position: { x: cameraPos.x, y: cameraPos.y, z: cameraPos.z },
    target: { x: lookAtPos.x, y: lookAtPos.y, z: lookAtPos.z },
    left: -viewWidth / 2,
    right: viewWidth / 2,
    top: viewHeight / 2,
    bottom: -viewHeight / 2,
    near: 0.1,
    far: 1000,
    resolution: { width, height },
    orientation
  };

  return {
    camera,
    config,
    viewName: `${orientation.charAt(0).toUpperCase() + orientation.slice(1)} Section`,
    filename: `section-${orientation}.png`
  };
}

// ============================================================================
// PERSPECTIVE CAMERAS (3D Views)
// ============================================================================

/**
 * Create perspective camera for exterior 3D view
 */
export function createExterior3DCamera(
  state: DesignState,
  geometry: GeometryResult,
  options: CameraSetupOptions = {}
): CameraResult {
  const { width = 2048, height = 1536, distanceMultiplier = 2.0 } = options;

  const center = geometry.boundingBox.getCenter(new THREE.Vector3());
  const size = geometry.boundingBox.getSize(new THREE.Vector3());

  // Position camera at 45-degree angle from corner
  const distance = Math.max(size.x, size.z) * distanceMultiplier;
  const cameraPos = new THREE.Vector3(
    center.x + distance * 0.7,
    center.y + distance * 0.5,
    center.z + distance * 0.7
  );

  const camera = new THREE.PerspectiveCamera(
    50, // fov
    width / height, // aspect
    0.1, // near
    10000 // far
  );

  camera.position.copy(cameraPos);
  camera.lookAt(center);
  camera.up.set(0, 1, 0);

  const config: CameraConfig = {
    id: 'camera-exterior-3d',
    name: 'Exterior 3D View',
    type: 'perspective',
    viewType: 'exterior_3d',
    position: { x: cameraPos.x, y: cameraPos.y, z: cameraPos.z },
    target: { x: center.x, y: center.y, z: center.z },
    fov: 50,
    aspect: width / height,
    near: 0.1,
    far: 10000,
    resolution: { width, height }
  };

  return {
    camera,
    config,
    viewName: 'Exterior 3D View',
    filename: 'exterior-3d.png'
  };
}

/**
 * Create perspective camera for axonometric view
 */
export function createAxonometricCamera(
  state: DesignState,
  geometry: GeometryResult,
  options: CameraSetupOptions = {}
): CameraResult {
  const { width = 2048, height = 2048, distanceMultiplier = 2.5 } = options;

  const center = geometry.boundingBox.getCenter(new THREE.Vector3());
  const size = geometry.boundingBox.getSize(new THREE.Vector3());

  // Axonometric: 45-45 angle, looking down from corner
  const distance = Math.max(size.x, size.y, size.z) * distanceMultiplier;
  const cameraPos = new THREE.Vector3(
    center.x + distance * 0.7071, // cos(45°)
    center.y + distance * 0.7071,
    center.z + distance * 0.7071
  );

  // Use orthographic for true axonometric
  const viewSize = Math.max(size.x, size.z) * 1.2;
  const camera = new THREE.OrthographicCamera(
    -viewSize / 2,
    viewSize / 2,
    viewSize / 2,
    -viewSize / 2,
    0.1,
    10000
  );

  camera.position.copy(cameraPos);
  camera.lookAt(center);
  camera.up.set(0, 1, 0);

  const config: CameraConfig = {
    id: 'camera-axonometric',
    name: 'Axonometric View',
    type: 'orthographic',
    viewType: 'axonometric',
    position: { x: cameraPos.x, y: cameraPos.y, z: cameraPos.z },
    target: { x: center.x, y: center.y, z: center.z },
    left: -viewSize / 2,
    right: viewSize / 2,
    top: viewSize / 2,
    bottom: -viewSize / 2,
    near: 0.1,
    far: 10000,
    resolution: { width, height }
  };

  return {
    camera,
    config,
    viewName: 'Axonometric View',
    filename: 'axonometric.png'
  };
}

/**
 * Create perspective camera for interior view
 */
export function createInteriorCamera(
  state: DesignState,
  geometry: GeometryResult,
  roomId: string,
  options: CameraSetupOptions = {}
): CameraResult {
  const { width = 2048, height = 1536 } = options;

  const room = state.rooms.find(r => r.id === roomId);
  if (!room) {
    throw new Error(`Room ${roomId} not found`);
  }

  const level = state.levels.find(l => l.index === room.levelIndex);
  if (!level) {
    throw new Error(`Level ${room.levelIndex} not found`);
  }

  // Position camera at eye height (1.6m) in room center
  const roomCenterX = room.polygon.reduce((sum, p) => sum + p.x, 0) / room.polygon.length;
  const roomCenterZ = room.polygon.reduce((sum, p) => sum + p.y, 0) / room.polygon.length;
  const eyeHeight = level.elevation + 1.6;

  const cameraPos = new THREE.Vector3(roomCenterX, eyeHeight, roomCenterZ);

  // Look toward longest wall (typically exterior)
  const lookAtPos = new THREE.Vector3(roomCenterX + 1, eyeHeight, roomCenterZ);

  const camera = new THREE.PerspectiveCamera(
    70, // Wide FOV for interior
    width / height,
    0.1,
    100
  );

  camera.position.copy(cameraPos);
  camera.lookAt(lookAtPos);
  camera.up.set(0, 1, 0);

  const config: CameraConfig = {
    id: `camera-interior-${roomId}`,
    name: `Interior - ${room.name}`,
    type: 'perspective',
    viewType: 'interior',
    position: { x: cameraPos.x, y: cameraPos.y, z: cameraPos.z },
    target: { x: lookAtPos.x, y: lookAtPos.y, z: lookAtPos.z },
    fov: 70,
    aspect: width / height,
    near: 0.1,
    far: 100,
    resolution: { width, height }
  };

  return {
    camera,
    config,
    viewName: `Interior - ${room.name}`,
    filename: `interior-${room.name.toLowerCase().replace(/\s+/g, '-')}.png`
  };
}

// ============================================================================
// CAMERA SETUP HELPERS
// ============================================================================

/**
 * Create all standard architectural cameras for a design
 */
export function createAllCameras(
  state: DesignState,
  geometry: GeometryResult,
  options: CameraSetupOptions = {}
): CameraResult[] {
  const cameras: CameraResult[] = [];

  // Floor plans (one per level)
  state.levels.forEach((level, index) => {
    if (level.isHabitable) {
      cameras.push(createFloorPlanCamera(state, geometry, index, options));
    }
  });

  // Elevations (4 directions)
  cameras.push(createElevationCamera(state, geometry, 'north', options));
  cameras.push(createElevationCamera(state, geometry, 'south', options));
  cameras.push(createElevationCamera(state, geometry, 'east', options));
  cameras.push(createElevationCamera(state, geometry, 'west', options));

  // Sections (2 directions)
  cameras.push(createSectionCamera(state, geometry, 'longitudinal', options));
  cameras.push(createSectionCamera(state, geometry, 'cross', options));

  // 3D Views
  cameras.push(createExterior3DCamera(state, geometry, options));
  cameras.push(createAxonometricCamera(state, geometry, options));

  // Interior views (one per main room)
  const mainRooms = state.rooms.filter(r =>
    ['living', 'dining', 'kitchen'].includes(r.type)
  );
  mainRooms.forEach(room => {
    cameras.push(createInteriorCamera(state, geometry, room.id, options));
  });

  return cameras;
}

/**
 * Find camera by view type
 */
export function findCameraByViewType(
  cameras: CameraResult[],
  viewType: ViewType
): CameraResult | undefined {
  return cameras.find(c => c.config.viewType === viewType);
}

/**
 * Get cameras by category
 */
export function getCamerasByCategory(cameras: CameraResult[]): {
  plans: CameraResult[];
  elevations: CameraResult[];
  sections: CameraResult[];
  threeD: CameraResult[];
  interiors: CameraResult[];
} {
  return {
    plans: cameras.filter(c => c.config.viewType === 'floor_plan'),
    elevations: cameras.filter(c => c.config.viewType === 'elevation'),
    sections: cameras.filter(c => c.config.viewType === 'section'),
    threeD: cameras.filter(c =>
      c.config.viewType === 'exterior_3d' ||
      c.config.viewType === 'axonometric' ||
      c.config.viewType === 'perspective'
    ),
    interiors: cameras.filter(c => c.config.viewType === 'interior')
  };
}

/**
 * Update camera aspect ratio
 */
export function updateCameraAspect(
  camera: THREE.Camera,
  width: number,
  height: number
): void {
  if (camera instanceof THREE.PerspectiveCamera) {
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
}
