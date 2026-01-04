/**
 * Camera Configurations
 * 
 * Pre-configured cameras for all architectural views
 * - Floor plans (orthographic top-down)
 * - Elevations (orthographic front/side/rear)
 * - Sections (orthographic cuts)
 * - 3D views (perspective and axonometric)
 */

import * as THREE from 'three';

export interface CameraConfig {
  name: string;
  type: 'orthographic' | 'perspective';
  position: THREE.Vector3;
  target: THREE.Vector3;
  up: THREE.Vector3;
  fov?: number; // For perspective
  zoom?: number; // For orthographic
  width?: number; // Output width
  height?: number; // Output height
}

/**
 * Create camera from configuration
 */
export function createCamera(config: CameraConfig, aspect: number = 1): THREE.Camera {
  let camera: THREE.Camera;

  if (config.type === 'orthographic') {
    const frustumSize = 20;
    camera = new THREE.OrthographicCamera(
      -frustumSize * aspect / 2,
      frustumSize * aspect / 2,
      frustumSize / 2,
      -frustumSize / 2,
      0.1,
      1000
    );
    
    if (config.zoom) {
      (camera as THREE.OrthographicCamera).zoom = config.zoom;
    }
  } else {
    camera = new THREE.PerspectiveCamera(
      config.fov || 50,
      aspect,
      0.1,
      1000
    );
  }

  camera.position.copy(config.position);
  camera.up.copy(config.up);
  camera.lookAt(config.target);
  camera.updateProjectionMatrix();

  return camera;
}

/**
 * Get all standard camera configurations
 */
export function getStandardCameras(boundingBox: any): Record<string, CameraConfig> {
  const center = new THREE.Vector3(
    (boundingBox.min.x + boundingBox.max.x) / 2,
    (boundingBox.min.y + boundingBox.max.y) / 2,
    (boundingBox.min.z + boundingBox.max.z) / 2
  );

  const width = boundingBox.width;
  const depth = boundingBox.depth;
  const height = boundingBox.height;

  return {
    // Floor Plans
    groundFloorPlan: {
      name: 'Ground Floor Plan',
      type: 'orthographic',
      position: new THREE.Vector3(center.x, 50, center.z),
      target: new THREE.Vector3(center.x, 0, center.z),
      up: new THREE.Vector3(0, 0, -1),
      zoom: 1.0,
      width: 1024,
      height: 1024
    },

    upperFloorPlan: {
      name: 'Upper Floor Plan',
      type: 'orthographic',
      position: new THREE.Vector3(center.x, 50, center.z),
      target: new THREE.Vector3(center.x, height / 2, center.z),
      up: new THREE.Vector3(0, 0, -1),
      zoom: 1.0,
      width: 1024,
      height: 1024
    },

    // Elevations
    elevationNorth: {
      name: 'North Elevation',
      type: 'orthographic',
      position: new THREE.Vector3(center.x, center.y, -depth * 2),
      target: center,
      up: new THREE.Vector3(0, 1, 0),
      zoom: 1.0,
      width: 1024,
      height: 768
    },

    elevationSouth: {
      name: 'South Elevation',
      type: 'orthographic',
      position: new THREE.Vector3(center.x, center.y, depth * 3),
      target: center,
      up: new THREE.Vector3(0, 1, 0),
      zoom: 1.0,
      width: 1024,
      height: 768
    },

    elevationEast: {
      name: 'East Elevation',
      type: 'orthographic',
      position: new THREE.Vector3(width * 3, center.y, center.z),
      target: center,
      up: new THREE.Vector3(0, 1, 0),
      zoom: 1.0,
      width: 1024,
      height: 768
    },

    elevationWest: {
      name: 'West Elevation',
      type: 'orthographic',
      position: new THREE.Vector3(-width * 2, center.y, center.z),
      target: center,
      up: new THREE.Vector3(0, 1, 0),
      zoom: 1.0,
      width: 1024,
      height: 768
    },

    // Sections
    sectionLongitudinal: {
      name: 'Section A-A (Longitudinal)',
      type: 'orthographic',
      position: new THREE.Vector3(center.x, center.y, -depth * 2),
      target: center,
      up: new THREE.Vector3(0, 1, 0),
      zoom: 1.0,
      width: 1024,
      height: 768
    },

    sectionCross: {
      name: 'Section B-B (Cross)',
      type: 'orthographic',
      position: new THREE.Vector3(width * 3, center.y, center.z),
      target: center,
      up: new THREE.Vector3(0, 1, 0),
      zoom: 1.0,
      width: 1024,
      height: 768
    },

    // 3D Views
    axonometric: {
      name: 'Axonometric View',
      type: 'orthographic',
      position: new THREE.Vector3(
        center.x + width * 1.5,
        center.y + height * 1.5,
        center.z + depth * 1.5
      ),
      target: center,
      up: new THREE.Vector3(0, 1, 0),
      zoom: 0.8,
      width: 1024,
      height: 1024
    },

    perspective: {
      name: 'Perspective View',
      type: 'perspective',
      position: new THREE.Vector3(
        center.x - width * 1.2,
        center.y + height * 0.3,
        center.z - depth * 1.5
      ),
      target: center,
      up: new THREE.Vector3(0, 1, 0),
      fov: 50,
      width: 1536,
      height: 1024
    },

    interior: {
      name: 'Interior Perspective',
      type: 'perspective',
      position: new THREE.Vector3(
        center.x - width * 0.3,
        1.6, // Eye level
        center.z
      ),
      target: new THREE.Vector3(center.x + width * 0.3, 1.6, center.z),
      up: new THREE.Vector3(0, 1, 0),
      fov: 60,
      width: 1536,
      height: 1024
    }
  };
}

/**
 * Get camera for specific view type
 */
export function getCameraForView(viewType: string, boundingBox: any): CameraConfig | null {
  const cameras = getStandardCameras(boundingBox);
  return cameras[viewType] || null;
}

export default {
  createCamera,
  getStandardCameras,
  getCameraForView
};

