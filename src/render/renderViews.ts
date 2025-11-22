/**
 * View Renderer
 * 
 * Renders 2D and 3D views from geometry
 * - Technical 2D: SVG line drawings (plans, elevations, sections)
 * - 3D Views: WebGL raster images (perspective, axonometric, interior)
 */

import * as THREE from 'three';
import { GeometryModel } from '../core/designSchema.js';
import { createThreeJSScene } from '../geometry/buildGeometry.js';
import { createCamera, getCameraForView } from '../geometry/cameras.js';

/**
 * Render view from geometry
 * 
 * @param geometry - Geometry model
 * @param viewType - Type of view to render
 * @param options - Rendering options
 * @returns Rendered view as data URL or SVG string
 */
export async function renderView(
  geometry: GeometryModel,
  viewType: string,
  options: any = {}
): Promise<{ url?: string; svg?: string; width: number; height: number }> {
  console.log(`🎨 Rendering ${viewType}...`);

  const is2D = viewType.includes('plan') || viewType.includes('elevation') || viewType.includes('section');

  if (is2D) {
    // Render as SVG for technical drawings
    return renderTechnical2D(geometry, viewType, options);
  } else {
    // Render as raster for 3D views
    return renderPhotoreal3D(geometry, viewType, options);
  }
}

/**
 * Render technical 2D view as SVG
 */
function renderTechnical2D(
  geometry: GeometryModel,
  viewType: string,
  options: any
): { svg: string; width: number; height: number } {
  const width = options.width || 1024;
  const height = options.height || 1024;

  // Get camera configuration
  const cameraConfig = getCameraForView(viewType, geometry.boundingBox);
  if (!cameraConfig) {
    throw new Error(`Unknown view type: ${viewType}`);
  }

  // Build SVG content
  let svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${height}" fill="white"/>
  <g stroke="black" stroke-width="2" fill="none">
`;

  // Project geometry to 2D based on view type
  if (viewType.includes('plan')) {
    // Top-down view
    geometry.walls.forEach(wall => {
      const x1 = (wall.vertices[0].x / geometry.boundingBox.width) * width;
      const y1 = (wall.vertices[0].y / geometry.boundingBox.depth) * height;
      const x2 = (wall.vertices[1].x / geometry.boundingBox.width) * width;
      const y2 = (wall.vertices[1].y / geometry.boundingBox.depth) * height;
      
      svg += `    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>\n`;
    });
  } else if (viewType.includes('elevation')) {
    // Front view
    geometry.walls.filter(w => w.isExterior).forEach(wall => {
      const x1 = (wall.vertices[0].x / geometry.boundingBox.width) * width;
      const y1 = height - (wall.vertices[0].z / geometry.boundingBox.height) * height;
      const x2 = (wall.vertices[1].x / geometry.boundingBox.width) * width;
      const y2 = height - (wall.vertices[2].z / geometry.boundingBox.height) * height;
      
      svg += `    <rect x="${Math.min(x1, x2)}" y="${Math.min(y1, y2)}" width="${Math.abs(x2 - x1)}" height="${Math.abs(y2 - y1)}"/>\n`;
    });
  }

  svg += `  </g>
  <text x="${width / 2}" y="20" text-anchor="middle" font-family="Arial" font-size="14" font-weight="bold">${cameraConfig.name}</text>
</svg>`;

  return { svg, width, height };
}

/**
 * Render photorealistic 3D view as raster
 */
function renderPhotoreal3D(
  geometry: GeometryModel,
  viewType: string,
  options: any
): { url: string; width: number; height: number } {
  const width = options.width || 1536;
  const height = options.height || 1024;

  // Get camera configuration
  const cameraConfig = getCameraForView(viewType, geometry.boundingBox);
  if (!cameraConfig) {
    throw new Error(`Unknown view type: ${viewType}`);
  }

  // Create Three.js scene
  const scene = createThreeJSScene(geometry);
  
  // Create camera
  const camera = createCamera(cameraConfig, width / height);

  // Create renderer (off-screen)
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false
  });

  renderer.setSize(width, height);
  renderer.render(scene, camera);

  // Get data URL
  const dataUrl = canvas.toDataURL('image/png');

  // Cleanup
  renderer.dispose();

  return { url: dataUrl, width, height };
}

/**
 * Render all standard views
 */
export async function renderAllViews(geometry: GeometryModel): Promise<Record<string, any>> {
  console.log('🎨 Rendering all views from geometry...');

  const viewTypes = [
    'groundFloorPlan',
    'upperFloorPlan',
    'elevationNorth',
    'elevationSouth',
    'elevationEast',
    'elevationWest',
    'sectionLongitudinal',
    'sectionCross',
    'axonometric',
    'perspective',
    'interior'
  ];

  const views: Record<string, any> = {};

  for (const viewType of viewTypes) {
    try {
      const view = await renderView(geometry, viewType);
      views[viewType] = view;
      console.log(`   ✅ ${viewType} rendered`);
    } catch (error) {
      console.error(`   ❌ ${viewType} failed:`, error);
      views[viewType] = null;
    }
  }

  console.log(`✅ Rendered ${Object.keys(views).filter(k => views[k]).length}/${viewTypes.length} views`);

  return views;
}

export default {
  createCamera,
  getCameraForView,
  renderView,
  renderAllViews
};

