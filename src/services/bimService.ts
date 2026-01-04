/**
 * BIM Service - Build 3D Scene from PlanJSON
 *
 * This is the GEOMETRY ENGINE of the geometry-first architecture.
 * Takes deterministic PlanJSON and creates a three.js 3D scene.
 * NO AI, NO HALLUCINATION - pure geometric extrusion.
 *
 * Philosophy: Geometry is data, not interpretation.
 */

import * as THREE from 'three';
import type { PlanJSON, Room, Level } from '../types/PlanJSON.js';

/**
 * Scene generation options
 */
export type SceneOptions = {
  /** Show site boundary */
  showSite?: boolean;
  /** Show structural grid */
  showGrid?: boolean;
  /** Lighting quality */
  lightingQuality?: 'low' | 'medium' | 'high';
  /** Enable shadows */
  shadows?: boolean;
};

/**
 * Scene metadata
 */
export type SceneMetadata = {
  polygonCount: number;
  vertexCount: number;
  roomCount: number;
  windowCount: number;
  doorCount: number;
};

class BimService {
  constructor() {
    console.log('🏗️  BIM Service initialized');
  }

  /**
   * Main method: Build complete 3D scene from PlanJSON
   * Returns THREE.Scene ready for rendering
   */
  async buildSceneFromPlan(
    plan: PlanJSON,
    options: SceneOptions = {}
  ): Promise<{ scene: THREE.Scene; metadata: SceneMetadata }> {
    console.log('🏗️  Building 3D scene from PlanJSON...');
    console.log('   Levels:', plan.levels.length);
    console.log('   Rooms:', plan.levels.reduce((sum, l) => sum + l.rooms.length, 0));

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB); // Sky blue

    // Metadata tracking
    const metadata: SceneMetadata = {
      polygonCount: 0,
      vertexCount: 0,
      roomCount: 0,
      windowCount: 0,
      doorCount: 0
    };

    // Add lighting
    this.addLighting(scene, options);

    // Add site boundary
    if (options.showSite !== false) {
      const siteMesh = this.createSiteGround(plan);
      scene.add(siteMesh);
      metadata.polygonCount += siteMesh.geometry ? 1 : 0;
    }

    // Add building levels (walls, floors, ceilings)
    for (const level of plan.levels) {
      const levelGroup = await this.buildLevel(level, plan, options);
      scene.add(levelGroup);

      // Update metadata
      metadata.roomCount += level.rooms.length;
      metadata.windowCount += level.rooms.reduce((sum, r) => sum + r.windows.length, 0);
      metadata.doorCount += level.rooms.reduce((sum, r) => sum + r.doors.length, 0);
    }

    // Add roof
    const roofMesh = this.createRoof(plan);
    scene.add(roofMesh);

    // Count polygons
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        const geo = obj.geometry as THREE.BufferGeometry;
        if (geo.index) {
          metadata.polygonCount += geo.index.count / 3;
        }
        if (geo.attributes.position) {
          metadata.vertexCount += geo.attributes.position.count;
        }
      }
    });

    console.log('✅ 3D scene built:', metadata);
    return { scene, metadata };
  }

  /**
   * Add lighting to scene
   */
  private addLighting(scene: THREE.Scene, options: SceneOptions): void {
    // Ambient light (soft overall illumination)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    // Directional light (sun) - from northeast to mimic morning sun
    const sunLight = new THREE.DirectionalLight(0xffffff, 0.8);
    sunLight.position.set(50, 100, 50);
    sunLight.castShadow = options.shadows !== false;
    if (options.shadows) {
      sunLight.shadow.mapSize.width = 2048;
      sunLight.shadow.mapSize.height = 2048;
      sunLight.shadow.camera.near = 0.5;
      sunLight.shadow.camera.far = 500;
    }
    scene.add(sunLight);

    // Hemisphere light (sky and ground ambient)
    const hemiLight = new THREE.HemisphereLight(0x87CEEB, 0x8B7355, 0.3);
    scene.add(hemiLight);
  }

  /**
   * Create site ground plane from polygon
   */
  private createSiteGround(plan: PlanJSON): THREE.Mesh {
    const polygon = plan.site.polygon;

    // Create shape from polygon
    const shape = new THREE.Shape();
    shape.moveTo(polygon[0][0], polygon[0][1]);
    for (let i = 1; i < polygon.length; i++) {
      shape.lineTo(polygon[i][0], polygon[i][1]);
    }
    shape.closePath();

    // Extrude slightly to give ground thickness
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.1,
      bevelEnabled: false
    });

    // Rotate to horizontal (three.js uses Y-up)
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, -0.05, 0); // Slightly below grade

    const material = new THREE.MeshStandardMaterial({
      color: 0x90EE90, // Light green (grass)
      roughness: 0.8,
      metalness: 0.0
    });

    return new THREE.Mesh(geometry, material);
  }

  /**
   * Build a complete level with walls, floors, and openings
   */
  private async buildLevel(
    level: Level,
    plan: PlanJSON,
    options: SceneOptions
  ): Promise<THREE.Group> {
    const levelGroup = new THREE.Group();
    levelGroup.name = `Level_${level.name}`;

    // Material for walls based on plan palette
    const wallColor = this.parseColorHex(plan.materials.walls?.exterior || '#8B4513');
    const wallMaterial = new THREE.MeshStandardMaterial({
      color: wallColor,
      roughness: 0.7,
      metalness: 0.1
    });

    const floorMaterial = new THREE.MeshStandardMaterial({
      color: 0xC0C0C0,
      roughness: 0.3,
      metalness: 0.2
    });

    // Build each room
    for (const room of level.rooms) {
      const roomGroup = await this.buildRoom(room, level, wallMaterial, floorMaterial);
      levelGroup.add(roomGroup);
    }

    return levelGroup;
  }

  /**
   * Build a single room with walls, floor, and openings
   */
  private async buildRoom(
    room: Room,
    level: Level,
    wallMaterial: THREE.Material,
    floorMaterial: THREE.Material
  ): Promise<THREE.Group> {
    const roomGroup = new THREE.Group();
    roomGroup.name = `Room_${room.id}`;

    // Create floor
    const floorShape = new THREE.Shape();
    floorShape.moveTo(room.poly[0][0], room.poly[0][1]);
    for (let i = 1; i < room.poly.length; i++) {
      floorShape.lineTo(room.poly[i][0], room.poly[i][1]);
    }
    floorShape.closePath();

    const floorGeometry = new THREE.ShapeGeometry(floorShape);
    floorGeometry.rotateX(-Math.PI / 2);
    floorGeometry.translate(0, level.elevation_m, 0);
    const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
    floorMesh.receiveShadow = true;
    roomGroup.add(floorMesh);

    // Create walls by extruding room perimeter
    const wallHeight = room.ceiling_height_m || level.height_m;
    const wallGeometry = this.createWallsFromPolygon(
      room.poly,
      wallHeight,
      level.elevation_m,
      room.doors,
      room.windows
    );

    const wallMesh = new THREE.Mesh(wallGeometry, wallMaterial);
    wallMesh.castShadow = true;
    wallMesh.receiveShadow = true;
    roomGroup.add(wallMesh);

    // Add windows as glass planes
    for (const window of room.windows) {
      const windowMesh = this.createWindow(window, room.poly, level.elevation_m);
      roomGroup.add(windowMesh);
    }

    // Add doors as openings (for now, just omit geometry)
    // TODO: Add door models

    return roomGroup;
  }

  /**
   * Create wall geometry from room polygon with door/window openings
   * This is complex - for now, simple extrusion without openings
   */
  private createWallsFromPolygon(
    poly: [number, number][],
    height: number,
    elevation: number,
    doors: any[],
    windows: any[]
  ): THREE.BufferGeometry {
    // Create wall outline
    const shape = new THREE.Shape();
    shape.moveTo(poly[0][0], poly[0][1]);
    for (let i = 1; i < poly.length; i++) {
      shape.lineTo(poly[i][0], poly[i][1]);
    }
    shape.closePath();

    // TODO: Subtract door/window openings using Shape.holes
    // For now, just extrude the outline

    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: height,
      bevelEnabled: false
    });

    // Rotate to vertical (extrude upward)
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, elevation, 0);

    return geometry;
  }

  /**
   * Create window as transparent plane
   */
  private createWindow(
    window: any,
    roomPoly: [number, number][],
    elevation: number
  ): THREE.Mesh {
    const width = window.width_m;
    const height = window.head_m - window.sill_m;
    const sillHeight = window.sill_m;

    const geometry = new THREE.PlaneGeometry(width, height);

    // Position window at specified location
    // For simplicity, place at average of window.at position
    const [x, y] = window.at;
    geometry.translate(x, elevation + sillHeight + height / 2, y);

    const material = new THREE.MeshStandardMaterial({
      color: 0x87CEEB,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'Window';
    return mesh;
  }

  /**
   * Create roof geometry
   */
  private createRoof(plan: PlanJSON): THREE.Mesh {
    const topLevel = plan.levels[plan.levels.length - 1];
    const roofElevation = topLevel.elevation_m + topLevel.height_m;

    // Get building footprint from ground level rooms
    const groundLevel = plan.levels[0];
    const allPoints: [number, number][] = [];
    for (const room of groundLevel.rooms) {
      allPoints.push(...room.poly);
    }

    // Find bounding box
    const minX = Math.min(...allPoints.map(p => p[0]));
    const maxX = Math.max(...allPoints.map(p => p[0]));
    const minY = Math.min(...allPoints.map(p => p[1]));
    const maxY = Math.max(...allPoints.map(p => p[1]));

    const width = maxX - minX;
    const depth = maxY - minY;

    // Create simple gable roof
    const roofPitch = (plan.materials.roof?.pitch_deg || 30) * Math.PI / 180;
    const roofHeight = (width / 2) * Math.tan(roofPitch);

    const roofGeometry = new THREE.BufferGeometry();
    const vertices = new Float32Array([
      // Front triangle
      minX, roofElevation, minY,
      maxX, roofElevation, minY,
      (minX + maxX) / 2, roofElevation + roofHeight, minY,
      // Back triangle
      minX, roofElevation, maxY,
      maxX, roofElevation, maxY,
      (minX + maxX) / 2, roofElevation + roofHeight, maxY,
      // Left slope
      minX, roofElevation, minY,
      (minX + maxX) / 2, roofElevation + roofHeight, minY,
      (minX + maxX) / 2, roofElevation + roofHeight, maxY,
      minX, roofElevation, maxY,
      // Right slope
      maxX, roofElevation, minY,
      (minX + maxX) / 2, roofElevation + roofHeight, minY,
      (minX + maxX) / 2, roofElevation + roofHeight, maxY,
      maxX, roofElevation, maxY
    ]);

    const indices = new Uint16Array([
      0, 1, 2,  // Front
      3, 5, 4,  // Back
      6, 7, 8,  6, 8, 9,  // Left slope
      10, 11, 12,  10, 12, 13  // Right slope
    ]);

    roofGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    roofGeometry.setIndex(new THREE.BufferAttribute(indices, 1));
    roofGeometry.computeVertexNormals();

    const roofColor = this.parseColorHex(plan.materials.roof?.color || '#A0522D');
    const roofMaterial = new THREE.MeshStandardMaterial({
      color: roofColor,
      roughness: 0.8,
      metalness: 0.0
    });

    return new THREE.Mesh(roofGeometry, roofMaterial);
  }

  /**
   * Parse color hex string to THREE.Color
   */
  private parseColorHex(colorString: string): THREE.Color {
    // Extract hex code from string like "Red brick #8B4513"
    const hexMatch = colorString.match(/#([0-9A-Fa-f]{6})/);
    if (hexMatch) {
      return new THREE.Color(`#${hexMatch[1]}`);
    }
    // Fallback to gray
    return new THREE.Color(0x808080);
  }
}

export default new BimService();
