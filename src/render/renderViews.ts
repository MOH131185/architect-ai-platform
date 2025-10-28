/**
 * View Renderer - Renders architectural views to images
 *
 * Renders distinct files for axonometric, perspective, and interior views
 * with unique names using Three.js WebGL rendering.
 *
 * @module render/renderViews
 */

import * as THREE from 'three';
import { nanoid } from 'nanoid';
import type { DesignState, ViewType } from '../core/designSchema';
import type { GeometryResult } from '../geometry/buildGeometry';
import type { CameraResult } from '../geometry/cameras';
import { buildGeometry } from '../geometry/buildGeometry';
import {
  createAllCameras,
  createAxonometricCamera,
  createExterior3DCamera,
  createInteriorCamera,
  createFloorPlanCamera,
  createElevationCamera,
  createSectionCamera
} from '../geometry/cameras';

// ============================================================================
// TYPES
// ============================================================================

export interface RenderOptions {
  /** Image width in pixels */
  width?: number;
  /** Image height in pixels */
  height?: number;
  /** Image format: 'png' | 'jpg' | 'webp' */
  format?: 'png' | 'jpg' | 'webp';
  /** JPEG quality (0-1) */
  quality?: number;
  /** Enable anti-aliasing */
  antialias?: boolean;
  /** Pixel ratio for higher resolution */
  pixelRatio?: number;
  /** Generate unique filenames */
  uniqueFilenames?: boolean;
}

export interface RenderedView {
  /** View name */
  name: string;
  /** View type */
  type: ViewType;
  /** Unique filename */
  filename: string;
  /** Image data URL (base64) */
  dataURL: string;
  /** Image blob (if available) */
  blob?: Blob;
  /** Dimensions */
  dimensions: {
    width: number;
    height: number;
  };
  /** Render timestamp */
  timestamp: string;
  /** Unique ID */
  id: string;
}

export interface RenderResult {
  /** All rendered views */
  views: RenderedView[];
  /** Views organized by type */
  viewsByType: {
    plans: RenderedView[];
    elevations: RenderedView[];
    sections: RenderedView[];
    threeD: RenderedView[];
    interiors: RenderedView[];
  };
  /** Generation metadata */
  metadata: {
    totalViews: number;
    renderTime: number; // milliseconds
    timestamp: string;
  };
}

// ============================================================================
// RENDERER CLASS
// ============================================================================

/**
 * View Renderer - Manages Three.js rendering for architectural views
 */
export class ViewRenderer {
  private renderer: THREE.WebGLRenderer;
  private canvas: HTMLCanvasElement | OffscreenCanvas;

  constructor(options: RenderOptions = {}) {
    const { antialias = true, pixelRatio = 1 } = options;

    // Create canvas (browser or Node.js compatible)
    if (typeof document !== 'undefined') {
      // Browser environment
      this.canvas = document.createElement('canvas');
    } else if (typeof OffscreenCanvas !== 'undefined') {
      // Node.js with OffscreenCanvas support
      this.canvas = new OffscreenCanvas(1024, 1024);
    } else {
      // Fallback: throw error with helpful message
      throw new Error(
        'No canvas available. In Node.js, consider using @napi-rs/canvas or skia-canvas for server-side rendering.'
      );
    }

    // Create WebGL renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas as HTMLCanvasElement,
      antialias,
      preserveDrawingBuffer: true, // Required for toDataURL
      alpha: true
    });

    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
  }

  /**
   * Render a single view to image
   */
  async renderView(
    scene: THREE.Scene,
    camera: THREE.Camera,
    options: RenderOptions = {}
  ): Promise<{ dataURL: string; blob?: Blob }> {
    const {
      width = 2048,
      height = 1536,
      format = 'png',
      quality = 0.95
    } = options;

    // Set renderer size
    this.renderer.setSize(width, height, false);

    // Render scene
    this.renderer.render(scene, camera);

    // Get image data
    const mimeType = format === 'png' ? 'image/png' :
                     format === 'jpg' ? 'image/jpeg' :
                     'image/webp';

    let dataURL: string;
    let blob: Blob | undefined;

    if (this.canvas instanceof HTMLCanvasElement) {
      // Browser environment
      dataURL = this.canvas.toDataURL(mimeType, quality);

      // Also create blob for download
      blob = await new Promise<Blob>((resolve, reject) => {
        this.canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Failed to create blob'))),
          mimeType,
          quality
        );
      });
    } else {
      // OffscreenCanvas
      const offscreenCanvas = this.canvas as OffscreenCanvas;
      blob = await offscreenCanvas.convertToBlob({ type: mimeType, quality });

      // Convert blob to data URL
      const reader = new FileReader();
      dataURL = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob!);
      });
    }

    return { dataURL, blob };
  }

  /**
   * Dispose renderer resources
   */
  dispose(): void {
    this.renderer.dispose();
    if (this.canvas instanceof HTMLCanvasElement && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
  }
}

// ============================================================================
// RENDER FUNCTIONS
// ============================================================================

/**
 * Generate unique filename with nanoid
 */
function generateFilename(
  baseName: string,
  format: string,
  unique: boolean = true
): string {
  const id = unique ? `-${nanoid(8)}` : '';
  return `${baseName}${id}.${format}`;
}

/**
 * Render a single architectural view
 */
export async function renderSingleView(
  state: DesignState,
  geometry: GeometryResult,
  cameraResult: CameraResult,
  options: RenderOptions = {}
): Promise<RenderedView> {
  const {
    width = 2048,
    height = 1536,
    format = 'png',
    uniqueFilenames = true
  } = options;

  const renderer = new ViewRenderer(options);

  try {
    // Render view
    const { dataURL, blob } = await renderer.renderView(
      geometry.scene,
      cameraResult.camera,
      { ...options, width, height }
    );

    // Generate unique filename
    const baseFilename = cameraResult.filename.replace(/\.[^.]+$/, '');
    const filename = generateFilename(baseFilename, format, uniqueFilenames);

    const view: RenderedView = {
      name: cameraResult.viewName,
      type: cameraResult.config.viewType,
      filename,
      dataURL,
      blob,
      dimensions: { width, height },
      timestamp: new Date().toISOString(),
      id: nanoid(12)
    };

    return view;
  } finally {
    renderer.dispose();
  }
}

/**
 * Render all architectural views for a design
 */
export async function renderAllViews(
  state: DesignState,
  options: RenderOptions = {}
): Promise<RenderResult> {
  const startTime = Date.now();

  // Build geometry
  const geometry = buildGeometry(state, {
    includeRoof: true,
    includeFloors: true,
    includeOpenings: true
  });

  // Create all cameras
  const cameras = createAllCameras(state, geometry, {
    width: options.width,
    height: options.height
  });

  // Render all views
  const views: RenderedView[] = [];

  for (const cameraResult of cameras) {
    const view = await renderSingleView(state, geometry, cameraResult, options);
    views.push(view);
  }

  // Organize views by type
  const viewsByType = {
    plans: views.filter(v => v.type === 'floor_plan'),
    elevations: views.filter(v => v.type === 'elevation'),
    sections: views.filter(v => v.type === 'section'),
    threeD: views.filter(v =>
      v.type === 'exterior_3d' ||
      v.type === 'axonometric' ||
      v.type === 'perspective'
    ),
    interiors: views.filter(v => v.type === 'interior')
  };

  const renderTime = Date.now() - startTime;

  return {
    views,
    viewsByType,
    metadata: {
      totalViews: views.length,
      renderTime,
      timestamp: new Date().toISOString()
    }
  };
}

/**
 * Render specific view types
 */
export async function renderSpecificViews(
  state: DesignState,
  viewTypes: ViewType[],
  options: RenderOptions = {}
): Promise<RenderResult> {
  const startTime = Date.now();

  // Build geometry
  const geometry = buildGeometry(state);

  // Create only requested cameras
  const cameras: CameraResult[] = [];

  for (const viewType of viewTypes) {
    switch (viewType) {
      case 'floor_plan':
        // Add all floor plans
        state.levels.forEach((level, index) => {
          if (level.isHabitable) {
            cameras.push(createFloorPlanCamera(state, geometry, index, options));
          }
        });
        break;

      case 'elevation':
        // Add all elevations
        cameras.push(createElevationCamera(state, geometry, 'north', options));
        cameras.push(createElevationCamera(state, geometry, 'south', options));
        cameras.push(createElevationCamera(state, geometry, 'east', options));
        cameras.push(createElevationCamera(state, geometry, 'west', options));
        break;

      case 'section':
        cameras.push(createSectionCamera(state, geometry, 'longitudinal', options));
        cameras.push(createSectionCamera(state, geometry, 'cross', options));
        break;

      case 'exterior_3d':
        cameras.push(createExterior3DCamera(state, geometry, options));
        break;

      case 'axonometric':
        cameras.push(createAxonometricCamera(state, geometry, options));
        break;

      case 'interior':
        // Add main room interiors
        const mainRooms = state.rooms.filter(r =>
          ['living', 'dining', 'kitchen'].includes(r.type)
        );
        mainRooms.forEach(room => {
          cameras.push(createInteriorCamera(state, geometry, room.id, options));
        });
        break;
    }
  }

  // Render all views
  const views: RenderedView[] = [];
  for (const cameraResult of cameras) {
    const view = await renderSingleView(state, geometry, cameraResult, options);
    views.push(view);
  }

  // Organize views by type
  const viewsByType = {
    plans: views.filter(v => v.type === 'floor_plan'),
    elevations: views.filter(v => v.type === 'elevation'),
    sections: views.filter(v => v.type === 'section'),
    threeD: views.filter(v =>
      v.type === 'exterior_3d' ||
      v.type === 'axonometric' ||
      v.type === 'perspective'
    ),
    interiors: views.filter(v => v.type === 'interior')
  };

  const renderTime = Date.now() - startTime;

  return {
    views,
    viewsByType,
    metadata: {
      totalViews: views.length,
      renderTime,
      timestamp: new Date().toISOString()
    }
  };
}

/**
 * Render distinct axonometric, perspective, and interior views
 * (As specified in M4: returns distinct files with unique names)
 */
export async function renderDistinctViews(
  state: DesignState,
  options: RenderOptions = {}
): Promise<RenderResult> {
  const startTime = Date.now();

  // Build geometry
  const geometry = buildGeometry(state);

  // Create distinct cameras
  const cameras: CameraResult[] = [];

  // 1. Axonometric view
  cameras.push(createAxonometricCamera(state, geometry, options));

  // 2. Perspective (exterior 3D) view
  cameras.push(createExterior3DCamera(state, geometry, options));

  // 3. Interior views (one per main room)
  const mainRooms = state.rooms.filter(r =>
    ['living', 'dining', 'kitchen', 'bedroom'].includes(r.type)
  );
  mainRooms.forEach(room => {
    cameras.push(createInteriorCamera(state, geometry, room.id, options));
  });

  // Render all views with unique filenames
  const views: RenderedView[] = [];
  for (const cameraResult of cameras) {
    const view = await renderSingleView(state, geometry, cameraResult, {
      ...options,
      uniqueFilenames: true // Ensure unique names
    });
    views.push(view);
  }

  // Organize views by type
  const viewsByType = {
    plans: [],
    elevations: [],
    sections: [],
    threeD: views.filter(v =>
      v.type === 'exterior_3d' ||
      v.type === 'axonometric' ||
      v.type === 'perspective'
    ),
    interiors: views.filter(v => v.type === 'interior')
  };

  const renderTime = Date.now() - startTime;

  return {
    views,
    viewsByType,
    metadata: {
      totalViews: views.length,
      renderTime,
      timestamp: new Date().toISOString()
    }
  };
}

// ============================================================================
// EXPORT HELPERS
// ============================================================================

/**
 * Download a rendered view (browser only)
 */
export function downloadView(view: RenderedView): void {
  if (typeof document === 'undefined') {
    console.warn('Download only available in browser environment');
    return;
  }

  const link = document.createElement('a');
  link.href = view.dataURL;
  link.download = view.filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Download all views as a ZIP (requires JSZip library - not included)
 */
export async function downloadAllViews(result: RenderResult): Promise<void> {
  if (typeof document === 'undefined') {
    console.warn('Download only available in browser environment');
    return;
  }

  // Note: This would require JSZip library
  // For now, download views individually
  result.views.forEach(view => {
    downloadView(view);
  });
}

/**
 * Convert view to File object (browser only)
 */
export function viewToFile(view: RenderedView): File | null {
  if (!view.blob) {
    console.warn('No blob available for view');
    return null;
  }

  return new File([view.blob], view.filename, {
    type: view.blob.type,
    lastModified: Date.now()
  });
}

/**
 * Get view summary
 */
export function getViewSummary(result: RenderResult): {
  totalViews: number;
  viewsByType: Record<string, number>;
  totalSize: number; // bytes (if blobs available)
  renderTime: number; // milliseconds
} {
  const viewsByType = {
    'Floor Plans': result.viewsByType.plans.length,
    'Elevations': result.viewsByType.elevations.length,
    'Sections': result.viewsByType.sections.length,
    '3D Views': result.viewsByType.threeD.length,
    'Interior Views': result.viewsByType.interiors.length
  };

  const totalSize = result.views.reduce((sum, view) => {
    return sum + (view.blob?.size || 0);
  }, 0);

  return {
    totalViews: result.metadata.totalViews,
    viewsByType,
    totalSize,
    renderTime: result.metadata.renderTime
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  ViewRenderer,
  renderSingleView,
  renderAllViews,
  renderSpecificViews,
  renderDistinctViews,
  downloadView,
  downloadAllViews,
  viewToFile,
  getViewSummary
};
