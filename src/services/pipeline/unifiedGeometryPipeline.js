/**
 * Unified Geometry Pipeline
 *
 * Single source of truth for all architectural visualizations.
 * Uses Meshy 3D as the canonical geometry, then derives all views from it.
 *
 * PIPELINE ARCHITECTURE:
 * =====================
 *
 *   DNA → Meshy 3D Model (canonical geometry)
 *           ↓
 *     ┌─────┴─────┬─────────────┬──────────────┐
 *     ↓           ↓             ↓              ↓
 *   Ortho N    Ortho S       Ortho E        Ortho W
 *     ↓           ↓             ↓              ↓
 *   FLUX      FLUX          FLUX           FLUX
 *   (tech)    (tech)        (tech)         (tech)
 *     ↓           ↓             ↓              ↓
 *   Elev N    Elev S        Elev E         Elev W
 *
 *     ┌─────┴─────┬─────────────┐
 *     ↓           ↓             ↓
 *   Persp     Interior      Axonometric
 *     ↓           ↓             ↓
 *   FLUX      FLUX          FLUX
 *   (photo)   (photo)       (photo)
 *     ↓           ↓             ↓
 *   Hero 3D   Interior 3D   Axono 3D
 *
 * KEY BENEFITS:
 * - ALL views derive from SAME Meshy model (100% consistency)
 * - Elevations match 3D hero exactly
 * - FLUX stylization applied consistently with same style DNA
 * - No drift between panels
 *
 * @module services/pipeline/unifiedGeometryPipeline
 */

import { isFeatureEnabled } from '../../config/featureFlags.js';
import logger from '../core/logger.js';

// =====================================================
// CONFIGURATION
// =====================================================

const PIPELINE_CONFIG = {
  // Meshy generation settings
  meshy: {
    mode: 'refine', // 'preview' for fast, 'refine' for high quality
    artStyle: 'realistic',
    textureRichness: 'high',
    timeout: 300000, // 5 minutes
  },

  // FLUX stylization settings per view type
  flux: {
    elevation: {
      model: 'black-forest-labs/FLUX.1-dev',
      steps: 35,
      guidance: 7.5,
      strength: 0.7, // Keep 70% of Meshy geometry, 30% stylization
      style: 'technical_drawing',
    },
    hero3d: {
      model: 'black-forest-labs/FLUX.1-kontext-max',
      steps: 45,
      guidance: 7.8,
      strength: 0.5, // 50% Meshy geometry, 50% stylization for beauty
      style: 'photorealistic',
    },
    interior: {
      model: 'black-forest-labs/FLUX.1-kontext-max',
      steps: 45,
      guidance: 7.5,
      strength: 0.4, // More AI freedom for interior beauty
      style: 'photorealistic_interior',
    },
    axonometric: {
      model: 'black-forest-labs/FLUX.1-dev',
      steps: 40,
      guidance: 7.5,
      strength: 0.6, // Balance geometry and style
      style: 'architectural_render',
    },
  },

  // View camera configurations for Meshy
  cameras: {
    elevation_north: { azimuth: 0, elevation: 0, ortho: true },
    elevation_south: { azimuth: 180, elevation: 0, ortho: true },
    elevation_east: { azimuth: 90, elevation: 0, ortho: true },
    elevation_west: { azimuth: 270, elevation: 0, ortho: true },
    hero_3d: { azimuth: 135, elevation: 25, ortho: false },
    interior_3d: { azimuth: 45, elevation: 15, ortho: false, interior: true },
    axonometric: { azimuth: 45, elevation: 35, ortho: true },
  },
};

// =====================================================
// MESHY RENDER SERVICE
// =====================================================

/**
 * Request multiple camera renders from Meshy model
 * Uses the GLB model URL to generate orthographic and perspective views
 *
 * @param {string} modelUrl - Meshy GLB model URL
 * @param {Array<string>} views - View types to render
 * @returns {Promise<Object>} Rendered views with dataUrls
 */
async function requestMeshyRenders(modelUrl, views) {
  const renders = {};

  // For each view, request a render from the model
  for (const viewType of views) {
    const camera = PIPELINE_CONFIG.cameras[viewType];
    if (!camera) {
      logger.warn(`[UnifiedPipeline] Unknown view type: ${viewType}`);
      continue;
    }

    try {
      // Call Meshy render endpoint (or use Three.js to render GLB locally)
      const render = await renderMeshyView(modelUrl, camera, viewType);
      renders[viewType] = render;

      logger.info(`   Rendered ${viewType}: ${camera.ortho ? 'orthographic' : 'perspective'}`);
    } catch (err) {
      logger.warn(`   Failed to render ${viewType}: ${err.message}`);
      renders[viewType] = null;
    }
  }

  return renders;
}

/**
 * Render a single view from Meshy GLB model
 * Uses Three.js for local rendering or Meshy API for remote
 *
 * @param {string} modelUrl - GLB model URL
 * @param {Object} camera - Camera configuration
 * @param {string} viewType - View type name
 * @returns {Promise<Object>} Rendered view
 */
async function renderMeshyView(modelUrl, camera, viewType) {
  // Option 1: Use Three.js locally (faster, no API cost)
  if (typeof window !== 'undefined') {
    return renderWithThreeJS(modelUrl, camera, viewType);
  }

  // Option 2: Use server-side rendering
  return renderServerSide(modelUrl, camera, viewType);
}

/**
 * Render using Three.js in browser
 */
async function renderWithThreeJS(modelUrl, camera, viewType) {
  // Dynamic import Three.js
  const THREE = await import('three');
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');

  return new Promise((resolve, reject) => {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);

    // Setup camera based on config
    let cam;
    if (camera.ortho) {
      cam = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 1000);
    } else {
      cam = new THREE.PerspectiveCamera(45, 4 / 3, 0.1, 1000);
    }

    // Position camera based on azimuth/elevation
    const distance = 30;
    const azimuthRad = (camera.azimuth * Math.PI) / 180;
    const elevationRad = (camera.elevation * Math.PI) / 180;

    cam.position.x = distance * Math.cos(elevationRad) * Math.sin(azimuthRad);
    cam.position.y = distance * Math.sin(elevationRad);
    cam.position.z = distance * Math.cos(elevationRad) * Math.cos(azimuthRad);
    cam.lookAt(0, 3, 0); // Look at building center

    // Setup renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(2048, 1536);
    renderer.setClearColor(0xffffff, 1);

    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 10);
    scene.add(directionalLight);

    // Load GLB model
    const loader = new GLTFLoader();
    loader.load(
      modelUrl,
      (gltf) => {
        scene.add(gltf.scene);

        // Center model
        const box = new THREE.Box3().setFromObject(gltf.scene);
        const center = box.getCenter(new THREE.Vector3());
        gltf.scene.position.sub(center);

        // Render
        renderer.render(scene, cam);

        // Get data URL
        const dataUrl = renderer.domElement.toDataURL('image/png');

        // Cleanup
        renderer.dispose();

        resolve({
          dataUrl,
          viewType,
          camera,
          width: 2048,
          height: 1536,
        });
      },
      undefined,
      (error) => {
        reject(new Error(`Failed to load GLB: ${error.message}`));
      }
    );
  });
}

/**
 * Server-side rendering fallback
 */
async function renderServerSide(modelUrl, camera, viewType) {
  // Call server endpoint for rendering
  const response = await fetch('/api/render-glb', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      modelUrl,
      camera,
      viewType,
      width: 2048,
      height: 1536,
    }),
  });

  if (!response.ok) {
    throw new Error(`Server render failed: ${response.status}`);
  }

  return response.json();
}

// =====================================================
// FLUX STYLIZATION SERVICE
// =====================================================

/**
 * Stylize a Meshy render using FLUX img2img
 *
 * @param {Object} meshyRender - Meshy render with dataUrl
 * @param {Object} dna - Design DNA for style information
 * @param {string} viewType - Type of view (elevation, hero3d, etc.)
 * @returns {Promise<Object>} Stylized image
 */
async function stylizeWithFlux(meshyRender, dna, viewType) {
  const config = getFluxConfigForView(viewType);
  const prompt = buildStylizationPrompt(dna, viewType, config.style);
  const negativePrompt = buildNegativePrompt(viewType);

  logger.info(`   Stylizing ${viewType} with FLUX (strength: ${config.strength})`);

  try {
    // Call FLUX img2img endpoint
    const response = await fetch('/api/together/image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.model,
        prompt,
        negative_prompt: negativePrompt,
        width: meshyRender.width || 2048,
        height: meshyRender.height || 1536,
        steps: config.steps,
        guidance_scale: config.guidance,
        // img2img parameters
        init_image: meshyRender.dataUrl,
        strength: config.strength,
      }),
    });

    if (!response.ok) {
      throw new Error(`FLUX stylization failed: ${response.status}`);
    }

    const result = await response.json();

    return {
      viewType,
      dataUrl: result.data?.[0]?.url || result.url,
      prompt,
      config,
      source: 'flux_stylized',
      baseImage: 'meshy',
    };
  } catch (err) {
    logger.warn(`   FLUX stylization failed: ${err.message}`);
    // Return original Meshy render as fallback
    return {
      ...meshyRender,
      source: 'meshy_original',
      stylizationError: err.message,
    };
  }
}

/**
 * Get FLUX config for view type
 */
function getFluxConfigForView(viewType) {
  if (viewType.startsWith('elevation_')) {
    return PIPELINE_CONFIG.flux.elevation;
  }
  if (viewType === 'hero_3d') {
    return PIPELINE_CONFIG.flux.hero3d;
  }
  if (viewType === 'interior_3d') {
    return PIPELINE_CONFIG.flux.interior;
  }
  if (viewType === 'axonometric') {
    return PIPELINE_CONFIG.flux.axonometric;
  }
  return PIPELINE_CONFIG.flux.hero3d; // Default
}

/**
 * Build FLUX prompt for stylization
 */
function buildStylizationPrompt(dna, viewType, styleType) {
  const style = dna?.style || {};
  const materials = style.materials || [];
  const archStyle = style.architecture || 'contemporary British';

  // Base style elements
  const materialList =
    materials
      .slice(0, 3)
      .map((m) => m.name)
      .join(', ') || 'red brick, clay tiles, white trim';

  // View-specific prompts
  if (styleType === 'technical_drawing') {
    return [
      'professional architectural elevation drawing',
      'clean technical illustration',
      `${archStyle} building`,
      `materials: ${materialList}`,
      'crisp linework',
      'accurate proportions',
      'subtle shadows for depth',
      'white background',
      'RIBA compliant technical drawing',
      'dimension lines and annotations',
      'high detail facade',
      'window mullions visible',
      'brick coursing pattern',
    ].join(', ');
  }

  if (styleType === 'photorealistic') {
    return [
      'stunning photorealistic architectural visualization',
      `${archStyle} residential building`,
      `high-end materials: ${materialList}`,
      'golden hour lighting',
      'soft shadows',
      'landscaped garden setting',
      'blue sky with clouds',
      'professional real estate photography',
      'sharp focus',
      '8K quality',
      'HDR lighting',
    ].join(', ');
  }

  if (styleType === 'photorealistic_interior') {
    return [
      'beautiful interior design photograph',
      `${archStyle} living space`,
      'natural daylight streaming in',
      'high-end furniture and decor',
      'warm and inviting atmosphere',
      'professional interior photography',
      'depth of field',
      'architectural details visible',
    ].join(', ');
  }

  if (styleType === 'architectural_render') {
    return [
      'professional architectural axonometric render',
      `${archStyle} building`,
      `materials: ${materialList}`,
      'isometric view',
      'clean white background',
      'subtle ambient occlusion',
      'technical illustration quality',
      'all four facades visible',
    ].join(', ');
  }

  return `professional architectural visualization, ${archStyle} building, ${materialList}`;
}

/**
 * Build negative prompt for view type
 */
function buildNegativePrompt(viewType) {
  const common = 'low quality, blurry, distorted, text, watermark, logo, signature, ugly, deformed';

  if (viewType.startsWith('elevation_')) {
    return `${common}, perspective view, 3D rendering, angled, shadows on ground, people, cars, trees in front`;
  }

  if (viewType === 'hero_3d') {
    return `${common}, interior view, close up, partial building, construction site`;
  }

  if (viewType === 'interior_3d') {
    return `${common}, exterior view, facade, outside`;
  }

  return common;
}

// =====================================================
// MAIN PIPELINE ORCHESTRATOR
// =====================================================

/**
 * Run the complete unified geometry pipeline
 *
 * @param {Object} dna - Design DNA with style, program, geometry
 * @param {Object} options - Pipeline options
 * @returns {Promise<Object>} All generated views
 */
export async function runUnifiedPipeline(dna, options = {}) {
  const {
    views = [
      'elevation_north',
      'elevation_south',
      'elevation_east',
      'elevation_west',
      'hero_3d',
      'axonometric',
    ],
    skipStylization = false,
    meshyTaskId = null, // Reuse existing Meshy model
  } = options;

  logger.group('UNIFIED GEOMETRY PIPELINE');
  logger.info('Starting unified pipeline with Meshy as source of truth...');

  const results = {
    meshyModel: null,
    meshyRenders: {},
    stylizedViews: {},
    controlImages: {},
    metadata: {
      timestamp: new Date().toISOString(),
      pipeline: 'unified_meshy_first',
      views,
    },
  };

  try {
    // Step 1: Generate or retrieve Meshy 3D model
    logger.info('STEP 1: Generating Meshy 3D model...');
    const meshyResult = await generateMeshyModel(dna, meshyTaskId);

    if (!meshyResult.success) {
      logger.error('Meshy model generation failed');
      return { success: false, error: meshyResult.error, results };
    }

    results.meshyModel = meshyResult;
    logger.success(`   Model generated: ${meshyResult.modelUrl}`);

    // Step 2: Render all views from Meshy model
    logger.info('STEP 2: Rendering views from Meshy model...');
    results.meshyRenders = await requestMeshyRenders(meshyResult.modelUrl, views);

    const renderedCount = Object.values(results.meshyRenders).filter(Boolean).length;
    logger.info(`   Rendered ${renderedCount}/${views.length} views`);

    // Step 3: Stylize each view with FLUX
    if (!skipStylization) {
      logger.info('STEP 3: Stylizing views with FLUX...');

      for (const viewType of views) {
        const meshyRender = results.meshyRenders[viewType];
        if (!meshyRender) {
          logger.warn(`   Skipping ${viewType} - no Meshy render available`);
          continue;
        }

        const stylized = await stylizeWithFlux(meshyRender, dna, viewType);
        results.stylizedViews[viewType] = stylized;

        // Control images are the Meshy renders (for consistency validation)
        results.controlImages[viewType] = {
          dataUrl: meshyRender.dataUrl,
          source: 'meshy',
          viewType,
        };
      }

      logger.success(`   Stylized ${Object.keys(results.stylizedViews).length} views`);
    } else {
      // Use Meshy renders directly
      results.stylizedViews = results.meshyRenders;
    }

    logger.success('UNIFIED PIPELINE COMPLETE');
    logger.groupEnd();

    return {
      success: true,
      results,
    };
  } catch (err) {
    logger.error(`Pipeline failed: ${err.message}`);
    logger.groupEnd();
    return {
      success: false,
      error: err.message,
      results,
    };
  }
}

/**
 * Generate Meshy 3D model from DNA
 */
async function generateMeshyModel(dna, existingTaskId = null) {
  // Try to use existing Meshy service
  try {
    const meshy3DService = (await import('../geometry/meshy3DService.js')).default;

    if (!meshy3DService.isAvailable()) {
      logger.warn('Meshy service not available, using geometry fallback');
      return await generateGeometryFallback(dna);
    }

    // Use existing task if provided
    if (existingTaskId) {
      const status = await meshy3DService.getTaskStatus(existingTaskId);
      if (status.status === 'SUCCEEDED') {
        return {
          success: true,
          taskId: existingTaskId,
          modelUrl: status.model_urls?.glb,
          thumbnailUrl: status.thumbnail_url,
        };
      }
    }

    // Generate new model
    const volumeSpec = extractVolumeSpec(dna);
    const result = await meshy3DService.generate3DFromDNA(dna, volumeSpec);

    return result;
  } catch (err) {
    logger.warn(`Meshy service error: ${err.message}`);
    return await generateGeometryFallback(dna);
  }
}

/**
 * Extract volume specification from DNA
 */
function extractVolumeSpec(dna) {
  const geometry = dna?.geometry_rules || {};
  const program = dna?.program || {};

  return {
    dimensions: {
      length: geometry.footprint_length || 12,
      width: geometry.footprint_width || 10,
      height: (program.floors || 2) * 3,
    },
    floors: program.floors || 2,
    roof: {
      type: geometry.roof_type || 'gable',
      pitch: geometry.roof_pitch || 35,
    },
  };
}

/**
 * Geometry fallback when Meshy unavailable
 */
async function generateGeometryFallback(dna) {
  // [Migration] Skip legacy geometryRenderService when conditionedImagePipeline is active
  // The new pipeline uses GeometryPipeline + Projections2D + GeometryConditioner instead
  if (isFeatureEnabled('conditionedImagePipeline')) {
    logger.info(
      '[UnifiedPipeline] [Migration] Skipping legacy geometryRenderService fallback (conditionedImagePipeline=true)'
    );
    logger.info('   → Elevations will be generated via Projections2D in the main pipeline');
    return {
      success: false,
      error: 'Legacy geometry fallback disabled - using conditionedImagePipeline',
      source: 'conditioned_pipeline_migration',
    };
  }

  logger.info('Using geometry render fallback...');

  try {
    const geometryRenderService = (await import('../design/geometryRenderService.js')).default;

    const renders = {};
    const directions = ['north', 'south', 'east', 'west'];

    for (const dir of directions) {
      const render = await geometryRenderService.renderElevation(dna, dir);
      renders[`elevation_${dir}`] = render;
    }

    return {
      success: true,
      modelUrl: null,
      renders,
      source: 'geometry_fallback',
    };
  } catch (err) {
    logger.error(`Geometry fallback failed: ${err.message}`);
    return {
      success: false,
      error: err.message,
    };
  }
}

// =====================================================
// EXPORTS
// =====================================================

const unifiedGeometryPipeline = {
  runUnifiedPipeline,
  requestMeshyRenders,
  stylizeWithFlux,
  PIPELINE_CONFIG,
};

export default unifiedGeometryPipeline;

// Named exports for easier imports
export { requestMeshyRenders, stylizeWithFlux, PIPELINE_CONFIG };
