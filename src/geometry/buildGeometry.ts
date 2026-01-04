/**
 * Geometry Builder
 * 
 * Constructs 3D geometry from Design DNA
 * Generates walls, floors, roofs, and openings as Three.js meshes
 */

import * as THREE from 'three';
import { DesignDNA, GeometryModel, Wall, Floor, Roof, Opening, Room } from '../core/designSchema.js';

/**
 * Build complete 3D geometry from DNA
 */
export function buildGeometryFromDNA(dna: DesignDNA): GeometryModel {
  console.log('🏗️  Building 3D geometry from DNA...');

  const walls: Wall[] = [];
  const floors: Floor[] = [];
  const openings: Opening[] = [];
  const rooms: Room[] = [];

  // Extract dimensions
  const { length, width, totalHeight, floorCount, floorHeights } = dna.dimensions;

  // Build floors
  for (let level = 0; level < floorCount; level++) {
    const elevation = floorHeights.slice(0, level).reduce((sum, h) => sum + h, 0);
    const floorHeight = floorHeights[level] || 3.0;

    const floor: Floor = {
      id: `floor-${level}`,
      level,
      elevation,
      polygon: {
        vertices: [
          { x: 0, y: 0 },
          { x: length, y: 0 },
          { x: length, y: width },
          { x: 0, y: width }
        ],
        closed: true
      },
      thickness: 0.3,
      material: 'concrete'
    };

    floors.push(floor);

    // Build exterior walls for this level
    const wallSegments = [
      { start: { x: 0, y: 0, z: elevation }, end: { x: length, y: 0, z: elevation }, dir: 'north' },
      { start: { x: length, y: 0, z: elevation }, end: { x: length, y: width, z: elevation }, dir: 'east' },
      { start: { x: length, y: width, z: elevation }, end: { x: 0, y: width, z: elevation }, dir: 'south' },
      { start: { x: 0, y: width, z: elevation }, end: { x: 0, y: 0, z: elevation }, dir: 'west' }
    ];

    wallSegments.forEach((segment, idx) => {
      const wall: Wall = {
        id: `wall-${level}-${idx}`,
        vertices: [
          segment.start,
          segment.end,
          { ...segment.end, z: elevation + floorHeight },
          { ...segment.start, z: elevation + floorHeight }
        ],
        thickness: dna.dimensions.wallThickness || 0.3,
        height: floorHeight,
        material: dna.materials?.exterior?.id || 'brick',
        isExterior: true,
        openings: []
      };

      walls.push(wall);

      // Add windows from DNA elevations
      const elevationData = dna.elevations?.[segment.dir];
      if (elevationData) {
        const windowCount = extractWindowCount(elevationData.features);
        const wallLength = Math.sqrt(
          Math.pow(segment.end.x - segment.start.x, 2) +
          Math.pow(segment.end.y - segment.start.y, 2)
        );

        // Distribute windows evenly
        for (let w = 0; w < windowCount; w++) {
          const spacing = wallLength / (windowCount + 1);
          const position = spacing * (w + 1);

          const opening: Opening = {
            id: `window-${level}-${segment.dir}-${w}`,
            type: 'window',
            position: {
              x: segment.start.x + (segment.end.x - segment.start.x) * (position / wallLength),
              y: segment.start.y + (segment.end.y - segment.start.y) * (position / wallLength),
              z: elevation + 0.9 // Standard sill height
            },
            width: 1.2,
            height: 1.5,
            sillHeight: 0.9,
            material: dna.materials?.windows?.id || 'glass'
          };

          openings.push(opening);
          wall.openings.push(opening);
        }
      }
    });
  }

  // Build roof
  const roofElevation = floorHeights.reduce((sum, h) => sum + h, 0);
  const roof: Roof = {
    id: 'roof-main',
    type: dna.materials?.roof?.type || 'gable',
    pitch: dna.materials?.roof?.pitch || 35,
    ridgeHeight: roofElevation + (width / 2) * Math.tan((dna.materials?.roof?.pitch || 35) * Math.PI / 180),
    overhang: 0.6,
    material: dna.materials?.roof?.id || 'tiles'
  };

  // Calculate bounding box
  const boundingBox = {
    min: { x: 0, y: 0, z: 0 },
    max: { x: length, y: width, z: roof.ridgeHeight },
    width: length,
    height: roof.ridgeHeight,
    depth: width
  };

  console.log(`✅ Geometry built: ${walls.length} walls, ${floors.length} floors, ${openings.length} openings`);

  return {
    walls,
    floors,
    roof,
    openings,
    rooms,
    circulation: [],
    boundingBox,
    metadata: {
      generatedFrom: 'dna',
      timestamp: new Date().toISOString(),
      validated: false
    }
  };
}

/**
 * Extract window count from elevation features
 */
function extractWindowCount(features: string[]): number {
  if (!features) return 2; // Default

  for (const feature of features) {
    const match = feature.match(/(\d+)\s+windows?/i);
    if (match) {
      return parseInt(match[1]);
    }
  }

  return 2; // Default
}

/**
 * Create Three.js scene from geometry model
 */
export function createThreeJSScene(geometry: GeometryModel): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf0f0f0);

  // Add walls
  geometry.walls.forEach(wall => {
    const wallMesh = createWallMesh(wall);
    scene.add(wallMesh);
  });

  // Add floors
  geometry.floors.forEach(floor => {
    const floorMesh = createFloorMesh(floor);
    scene.add(floorMesh);
  });

  // Add roof
  const roofMesh = createRoofMesh(geometry.roof, geometry.boundingBox);
  scene.add(roofMesh);

  // Add lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(10, 20, 10);
  scene.add(directionalLight);

  return scene;
}

/**
 * Create wall mesh
 */
function createWallMesh(wall: Wall): THREE.Mesh {
  // Simplified: create box for wall
  const length = Math.sqrt(
    Math.pow(wall.vertices[1].x - wall.vertices[0].x, 2) +
    Math.pow(wall.vertices[1].y - wall.vertices[0].y, 2)
  );

  const geometry = new THREE.BoxGeometry(length, wall.height, wall.thickness);
  const material = new THREE.MeshStandardMaterial({
    color: 0xcccccc,
    roughness: 0.8
  });

  const mesh = new THREE.Mesh(geometry, material);
  
  // Position at wall start
  mesh.position.set(
    (wall.vertices[0].x + wall.vertices[1].x) / 2,
    wall.vertices[0].z + wall.height / 2,
    (wall.vertices[0].y + wall.vertices[1].y) / 2
  );

  return mesh;
}

/**
 * Create floor mesh
 */
function createFloorMesh(floor: Floor): THREE.Mesh {
  // Create floor plane from polygon
  const shape = new THREE.Shape();
  
  floor.polygon.vertices.forEach((vertex, i) => {
    if (i === 0) {
      shape.moveTo(vertex.x, vertex.y);
    } else {
      shape.lineTo(vertex.x, vertex.y);
    }
  });

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: floor.thickness,
    bevelEnabled: false
  });

  const material = new THREE.MeshStandardMaterial({
    color: 0x888888,
    roughness: 0.6
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.z = floor.elevation;
  mesh.rotation.x = -Math.PI / 2; // Rotate to horizontal

  return mesh;
}

/**
 * Create roof mesh
 */
function createRoofMesh(roof: Roof, boundingBox: any): THREE.Mesh {
  // Simplified gable roof
  const length = boundingBox.width;
  const width = boundingBox.depth;
  const ridgeHeight = roof.ridgeHeight - boundingBox.max.z + roof.ridgeHeight;

  const geometry = new THREE.BoxGeometry(length, 0.2, width);
  const material = new THREE.MeshStandardMaterial({
    color: 0x8B4513,
    roughness: 0.9
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(length / 2, roof.ridgeHeight, width / 2);

  return mesh;
}

export default {
  buildGeometryFromDNA,
  createThreeJSScene
};

