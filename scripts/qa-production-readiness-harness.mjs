#!/usr/bin/env node
/**
 * Production Readiness QA Harness
 *
 * Runs N generations and validates each meets production-ready criteria:
 * 1. All panels generate successfully
 * 2. Metrics are COMPUTED (never N/A) - SSIM, pHash, edgeOverlap
 * 3. A1 composition succeeds
 * 4. Cross-view consistency passes thresholds
 *
 * Modes:
 * - SYNTHETIC (default): Fast synthetic panel generation for harness testing
 * - REAL (--real-generation): Calls actual AI APIs for end-to-end testing
 *
 * Outputs:
 * - Panel PNGs saved to qa_results/run_N/panels/
 * - Composed A1 PNG saved to qa_results/run_N/a1_composed.png
 * - metrics.json with SSIM/pHash/edgeOverlap per panel pair
 * - DEBUG_REPORT.json with all generation metadata (real mode only)
 * - Summary table and worst 5 failures
 *
 * Acceptance Criteria:
 * - ≥90% success rate across 50 runs
 * - 0 unfixable failures
 *
 * Usage:
 *   node scripts/qa-production-readiness-harness.mjs [--runs=50] [--building-type=random]
 *   node scripts/qa-production-readiness-harness.mjs --real-generation --runs=6 --fail-fast
 *
 * @module scripts/qa-production-readiness-harness
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

// =============================================================================
// CONFIGURATION
// =============================================================================

const BUILDING_TYPES = [
  'detached',
  'semi_detached',
  'terrace_mid',
  'apartment_block',
  'bungalow',
  'townhouse',
];

const PANEL_TYPES = [
  'hero_3d',
  'interior_3d',
  'floor_plan_ground',
  'floor_plan_first',
  'elevation_north',
  'elevation_south',
  'elevation_east',
  'elevation_west',
  'section_AA',
  'section_BB',
  'site_plan',
];

const ACCEPTANCE_CRITERIA = {
  minSuccessRate: 0.90,  // 90%
  maxUnfixableFailures: 0,
  minRuns: 50,
};

// Real generation thresholds (stricter than synthetic)
const REAL_THRESHOLDS = {
  minSSIM: 0.6,      // Cross-panel structural similarity
  minPHash: 0.55,    // Perceptual hash similarity
  minEdgeOverlap: 0.15,  // Edge structure consistency
};

// Synthetic generation thresholds (for harness testing)
const SYNTHETIC_THRESHOLDS = {
  minSSIM: 0.3,
  minPHash: 0.5,
  minEdgeOverlap: 0,  // Synthetic images may have 0 edges
};

const DEFAULT_CONFIG = {
  runs: 50,
  maxRuns: 100,
  buildingType: 'random',
  outputDir: path.join(PROJECT_ROOT, 'qa_results'),
  failFast: false,
  verbose: false,
  dryRun: false,
  retryLimit: 2,
  timeoutMs: 600000,  // 10 minutes for real generation
  realGeneration: false,  // NEW: Flag for real API generation
};

// =============================================================================
// ENVIRONMENT LOADING
// =============================================================================

/**
 * Load environment variables from .env and .env.local
 */
function loadEnv() {
  const envFiles = [
    path.join(PROJECT_ROOT, '.env'),
    path.join(PROJECT_ROOT, '.env.local'),
  ];

  for (const envFile of envFiles) {
    if (fs.existsSync(envFile)) {
      const content = fs.readFileSync(envFile, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const [key, ...valueParts] = trimmed.split('=');
          if (key && valueParts.length > 0) {
            const value = valueParts.join('=').replace(/^["']|["']$/g, '');
            if (!process.env[key]) {
              process.env[key] = value;
            }
          }
        }
      }
    }
  }
}

/**
 * Validate required API keys for real generation
 */
function validateApiKeys() {
  const required = ['TOGETHER_API_KEY'];
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required API keys for real generation: ${missing.join(', ')}\nSet them in .env or .env.local`);
  }

  return {
    togetherApiKey: process.env.TOGETHER_API_KEY,
    openaiApiKey: process.env.OPENAI_REASONING_API_KEY || null,
    meshyApiKey: process.env.MESHY_API_KEY || null,
  };
}

// =============================================================================
// ARGUMENT PARSING
// =============================================================================

function parseArgs() {
  const config = { ...DEFAULT_CONFIG };
  const args = process.argv.slice(2);

  for (const arg of args) {
    if (arg.startsWith('--runs=')) {
      config.runs = Math.min(parseInt(arg.split('=')[1], 10), config.maxRuns);
    } else if (arg.startsWith('--building-type=')) {
      config.buildingType = arg.split('=')[1];
    } else if (arg.startsWith('--output=')) {
      config.outputDir = arg.split('=')[1];
    } else if (arg === '--fail-fast') {
      config.failFast = true;
    } else if (arg === '--verbose') {
      config.verbose = true;
    } else if (arg === '--dry-run') {
      config.dryRun = true;
    } else if (arg === '--real-generation') {
      config.realGeneration = true;
    }
  }

  return config;
}

// =============================================================================
// IMAGE METRICS COMPUTATION (REAL - NOT MOCKED)
// =============================================================================

/**
 * SSIM Constants (Wang et al.)
 */
const SSIM_K1 = 0.01;
const SSIM_K2 = 0.03;
const SSIM_L = 255;
const COMPARE_SIZE = 256;

/**
 * Compute SSIM between two image buffers
 */
async function computeSSIM(bufferA, bufferB) {
  const width = COMPARE_SIZE;
  const height = COMPARE_SIZE;

  const [grayA, grayB] = await Promise.all([
    sharp(bufferA)
      .resize(width, height, { fit: 'fill', kernel: 'lanczos3' })
      .grayscale()
      .raw()
      .toBuffer(),
    sharp(bufferB)
      .resize(width, height, { fit: 'fill', kernel: 'lanczos3' })
      .grayscale()
      .raw()
      .toBuffer(),
  ]);

  const N = width * height;

  // Compute means
  let muX = 0, muY = 0;
  for (let i = 0; i < N; i++) {
    muX += grayA[i];
    muY += grayB[i];
  }
  muX /= N;
  muY /= N;

  // Compute variances and covariance
  let sigmaX2 = 0, sigmaY2 = 0, sigmaXY = 0;
  for (let i = 0; i < N; i++) {
    const dx = grayA[i] - muX;
    const dy = grayB[i] - muY;
    sigmaX2 += dx * dx;
    sigmaY2 += dy * dy;
    sigmaXY += dx * dy;
  }
  sigmaX2 /= (N - 1);
  sigmaY2 /= (N - 1);
  sigmaXY /= (N - 1);

  // Stability constants
  const C1 = (SSIM_K1 * SSIM_L) ** 2;
  const C2 = (SSIM_K2 * SSIM_L) ** 2;

  // SSIM formula
  const ssim = ((2 * muX * muY + C1) * (2 * sigmaXY + C2)) /
    ((muX ** 2 + muY ** 2 + C1) * (sigmaX2 + sigmaY2 + C2));

  return Math.max(0, Math.min(1, ssim));
}

/**
 * Compute pHash (perceptual hash) using DCT
 */
async function computePHash(buffer) {
  const HASH_SIZE = 32;

  const { data } = await sharp(buffer)
    .resize(HASH_SIZE, HASH_SIZE, { fit: 'fill', kernel: 'lanczos3' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Convert to 2D matrix
  const matrix = [];
  for (let y = 0; y < HASH_SIZE; y++) {
    const row = [];
    for (let x = 0; x < HASH_SIZE; x++) {
      row.push(data[y * HASH_SIZE + x]);
    }
    matrix.push(row);
  }

  // Compute 2D DCT
  const dct = computeDCT2D(matrix);

  // Extract 8x8 low-frequency coefficients
  const coefficients = [];
  for (let u = 0; u < 8; u++) {
    for (let v = 0; v < 8; v++) {
      if (u === 0 && v === 0) continue; // Skip DC
      coefficients.push(dct[u][v]);
    }
  }

  // Compute median
  const sorted = [...coefficients].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];

  // Generate hash bits
  const bits = [];
  for (let u = 0; u < 8; u++) {
    for (let v = 0; v < 8; v++) {
      bits.push(dct[u][v] > median ? 1 : 0);
    }
  }

  // Convert to hex
  let hash = '';
  for (let i = 0; i < 64; i += 4) {
    const nibble = (bits[i] << 3) | (bits[i + 1] << 2) | (bits[i + 2] << 1) | bits[i + 3];
    hash += nibble.toString(16);
  }

  return { hash, bits };
}

/**
 * 2D Discrete Cosine Transform
 */
function computeDCT2D(matrix) {
  const N = matrix.length;
  const result = Array(N).fill(null).map(() => Array(N).fill(0));

  for (let u = 0; u < N; u++) {
    for (let v = 0; v < N; v++) {
      let sum = 0;
      for (let x = 0; x < N; x++) {
        for (let y = 0; y < N; y++) {
          sum += matrix[x][y] *
            Math.cos((Math.PI * u * (2 * x + 1)) / (2 * N)) *
            Math.cos((Math.PI * v * (2 * y + 1)) / (2 * N));
        }
      }
      const cu = u === 0 ? 1 / Math.sqrt(2) : 1;
      const cv = v === 0 ? 1 / Math.sqrt(2) : 1;
      result[u][v] = (2 / N) * cu * cv * sum;
    }
  }

  return result;
}

/**
 * Compute Hamming distance and similarity between two pHash values
 */
function pHashSimilarity(bitsA, bitsB) {
  let distance = 0;
  for (let i = 0; i < 64; i++) {
    if (bitsA[i] !== bitsB[i]) distance++;
  }
  return {
    distance,
    similarity: 1 - (distance / 64),
  };
}

/**
 * Apply Sobel edge detection to get edge map
 */
async function getEdgeMap(buffer) {
  const width = COMPARE_SIZE;
  const height = COMPARE_SIZE;

  const gray = await sharp(buffer)
    .resize(width, height, { fit: 'fill', kernel: 'lanczos3' })
    .grayscale()
    .raw()
    .toBuffer();

  // Sobel kernels
  const sobelX = [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]];
  const sobelY = [[-1, -2, -1], [0, 0, 0], [1, 2, 1]];

  const edgeMap = Buffer.alloc(width * height);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let gx = 0, gy = 0;

      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const pixel = gray[(y + ky) * width + (x + kx)];
          gx += pixel * sobelX[ky + 1][kx + 1];
          gy += pixel * sobelY[ky + 1][kx + 1];
        }
      }

      const magnitude = Math.min(255, Math.sqrt(gx * gx + gy * gy));
      edgeMap[y * width + x] = magnitude;
    }
  }

  return edgeMap;
}

/**
 * Compute edge overlap between two images
 */
async function computeEdgeOverlap(bufferA, bufferB) {
  const edgeA = await getEdgeMap(bufferA);
  const edgeB = await getEdgeMap(bufferB);

  const THRESHOLD = 30; // Edge threshold
  let bothEdges = 0;
  let anyEdges = 0;

  for (let i = 0; i < edgeA.length; i++) {
    const isEdgeA = edgeA[i] > THRESHOLD;
    const isEdgeB = edgeB[i] > THRESHOLD;

    if (isEdgeA || isEdgeB) anyEdges++;
    if (isEdgeA && isEdgeB) bothEdges++;
  }

  return anyEdges > 0 ? bothEdges / anyEdges : 0;
}

/**
 * Compute all metrics between two image buffers
 */
async function computeAllMetrics(bufferA, bufferB) {
  const [ssim, pHashA, pHashB, edgeOverlap] = await Promise.all([
    computeSSIM(bufferA, bufferB),
    computePHash(bufferA),
    computePHash(bufferB),
    computeEdgeOverlap(bufferA, bufferB),
  ]);

  const pHash = pHashSimilarity(pHashA.bits, pHashB.bits);

  return {
    ssim,
    pHash: {
      hashA: pHashA.hash,
      hashB: pHashB.hash,
      distance: pHash.distance,
      similarity: pHash.similarity,
    },
    edgeOverlap,
    computed: new Date().toISOString(),
  };
}

// =============================================================================
// SYNTHETIC PANEL GENERATION (for testing harness without API)
// =============================================================================

/**
 * Generate a synthetic test image
 * Creates a simple colored rectangle with some variation
 */
async function generateSyntheticPanel(panelType, buildingType, seed) {
  const width = 1024;
  const height = 1024;

  // Seed-based color generation for consistency
  const rng = seedRandom(seed);
  const baseHue = Math.floor(rng() * 360);
  const variation = Math.floor(rng() * 30) - 15;

  // Different base colors for different panel types
  const panelColors = {
    hero_3d: { r: 100 + variation, g: 150 + variation, b: 200 + variation },
    interior_3d: { r: 200 + variation, g: 180 + variation, b: 150 + variation },
    floor_plan_ground: { r: 240, g: 240, b: 240 },
    floor_plan_first: { r: 235, g: 235, b: 235 },
    elevation_north: { r: 180 + variation, g: 160 + variation, b: 140 + variation },
    elevation_south: { r: 175 + variation, g: 155 + variation, b: 135 + variation },
    elevation_east: { r: 185 + variation, g: 165 + variation, b: 145 + variation },
    elevation_west: { r: 170 + variation, g: 150 + variation, b: 130 + variation },
    section_AA: { r: 220, g: 220, b: 220 },
    section_BB: { r: 215, g: 215, b: 215 },
    site_plan: { r: 200, g: 220, b: 200 },
  };

  const color = panelColors[panelType] || { r: 128, g: 128, b: 128 };

  // Create base image
  const channels = 3;
  const pixels = Buffer.alloc(width * height * channels);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;

      // Add some structure/variation to make edges
      const edgeFactor = Math.sin(x / 50) * 20 + Math.cos(y / 40) * 15;

      pixels[idx] = Math.max(0, Math.min(255, color.r + edgeFactor));
      pixels[idx + 1] = Math.max(0, Math.min(255, color.g + edgeFactor * 0.8));
      pixels[idx + 2] = Math.max(0, Math.min(255, color.b + edgeFactor * 0.6));
    }
  }

  // Convert to PNG buffer
  const buffer = await sharp(pixels, {
    raw: { width, height, channels },
  }).png().toBuffer();

  return buffer;
}

/**
 * Simple seeded random number generator
 */
function seedRandom(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return function () {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * Generate all panels for a run (SYNTHETIC)
 */
async function generateSyntheticPanels(buildingType, runIndex) {
  const panels = [];
  const baseSeed = runIndex * 1000 + buildingType.length * 137;

  for (let i = 0; i < PANEL_TYPES.length; i++) {
    const panelType = PANEL_TYPES[i];
    const seed = baseSeed + i * 17;

    const buffer = await generateSyntheticPanel(panelType, buildingType, seed);

    panels.push({
      type: panelType,
      buffer,
      seed,
    });
  }

  return panels;
}

// =============================================================================
// REAL GENERATION (API CALLS)
// =============================================================================

/**
 * Download image from URL to buffer
 */
async function downloadImage(url) {
  if (url.startsWith('data:')) {
    // Handle data URLs
    const matches = url.match(/^data:image\/\w+;base64,(.+)$/);
    if (matches) {
      return Buffer.from(matches[1], 'base64');
    }
    throw new Error('Invalid data URL');
  }

  // Download from URL
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Convert Windows path to file:// URL for ESM dynamic imports
 */
function pathToFileURL(filePath) {
  // On Windows, we need to convert the path to a file:// URL
  if (process.platform === 'win32') {
    // Convert backslashes to forward slashes and add file:///
    const urlPath = filePath.replace(/\\/g, '/');
    return `file:///${urlPath}`;
  }
  return `file://${filePath}`;
}

/**
 * Generate panels using real API (calls dnaWorkflowOrchestrator)
 */
async function generateRealPanels(buildingType, runIndex, runDir, verbose) {
  // Dynamically import the orchestrator
  const orchestratorPath = path.join(PROJECT_ROOT, 'src', 'services', 'dnaWorkflowOrchestrator.js');
  const orchestratorUrl = pathToFileURL(orchestratorPath);

  // Check if we can import ES modules
  // Note: default export is already an instance, not a class
  let orchestrator;
  try {
    const module = await import(orchestratorUrl);
    orchestrator = module.default;
  } catch (importError) {
    console.error('Failed to import orchestrator:', importError.message);
    throw new Error(`Cannot import dnaWorkflowOrchestrator: ${importError.message}`);
  }

  // Build project context
  const baseSeed = runIndex * 1000 + buildingType.length * 137;
  const isSingleStorey = buildingType === 'bungalow';
  const floors = isSingleStorey ? 1 : 2;
  const floorArea = 150 + (runIndex % 100); // 150-250 m²
  const sitePolygon = [
    { lat: 51.5074, lng: -0.1278 },
    { lat: 51.5074, lng: -0.1272 },
    { lat: 51.5070, lng: -0.1272 },
    { lat: 51.5070, lng: -0.1278 },
  ];
  const projectContext = {
    buildingType,
    buildingProgram: buildingType,
    area: floorArea,
    floorArea,
    floors,
    floorCount: floors,
    designId: `qa_run_${runIndex}_${Date.now()}`,
    programSpaces: getDefaultProgramSpaces(buildingType),
    siteMetrics: {
      areaM2: Math.max(360, Math.round(floorArea * 1.8)),
      orientationDeg: 180,
      sitePolygon,
    },
  };

  const locationData = {
    address: '123 Test Street, London, UK',
    coordinates: { lat: 51.5074, lng: -0.1278 },
    sitePolygon,
    siteAnalysis: {
      areaM2: Math.max(360, Math.round(floorArea * 1.8)),
      orientationDeg: 180,
    },
    climate: { type: 'temperate' },
    zoning: { type: 'residential' },
    recommendedStyle: 'contemporary',
  };

  if (verbose) {
    console.log(`    Building context: ${buildingType}, ${projectContext.floorArea}m², ${projectContext.floors} floors`);
  }

  const progressHandler = (progress) => {
    if (verbose) {
      console.log(`    [${progress.stage}] ${progress.message} (${progress.percent}%)`);
    }
  };

  // Run the active workflow API (runMultiPanelA1Workflow is current primary path)
  let result;
  if (typeof orchestrator.runA1SheetWorkflow === 'function') {
    result = await orchestrator.runA1SheetWorkflow({
      projectContext,
      locationData,
      portfolioAnalysis: null,
      portfolioBlendPercent: 70,
      seed: baseSeed,
      onProgress: progressHandler,
    });
  } else if (typeof orchestrator.runMultiPanelA1Workflow === 'function') {
    result = await orchestrator.runMultiPanelA1Workflow(
      {
        projectContext,
        locationData,
        portfolioFiles: [],
        siteSnapshot: null,
        baseSeed,
      },
      {
        onProgress: progressHandler,
      },
    );
  } else {
    throw new Error(
      'No supported workflow method found (expected runA1SheetWorkflow or runMultiPanelA1Workflow)',
    );
  }

  if (!result.success) {
    throw new Error(result.error || 'Generation failed');
  }

  // Extract panels from result
  const panels = [];
  const panelMetadata = Array.isArray(result.a1Sheet?.metadata?.panels)
    ? result.a1Sheet.metadata.panels
    : Array.isArray(result.panels)
      ? result.panels.map((panel) => ({
          type: panel.type || panel.panelType,
          imageUrl: panel.imageUrl || panel.url,
          url: panel.imageUrl || panel.url,
          seed: panel.seed,
          prompt: panel.prompt,
        }))
      : [];
  const a1SheetUrl =
    result.a1Sheet?.url || result.composedSheetUrl || result.sheetUrl || null;

  // Save DEBUG_REPORT.json
  const debugReport = {
    designId: projectContext.designId,
    buildingType,
    seed: baseSeed,
    timestamp: new Date().toISOString(),
    masterDNA: result.masterDNA,
    blendedStyle: result.blendedStyle,
    prompts: {},
    seeds: {},
    controlImages: {},
    generationMetadata: result.generationMetadata,
    validation: result.validation,
    qaResults: result.qaResults,
    qaSummary: result.qaSummary,
  };

  // Download and save each panel
  for (const panelInfo of panelMetadata) {
    const panelType = panelInfo.type || panelInfo.id;
    const panelUrl = panelInfo.url || panelInfo.imageUrl;

    if (!panelUrl) {
      console.warn(`    Panel ${panelType} has no URL, skipping`);
      continue;
    }

    try {
      const buffer = await downloadImage(panelUrl);
      panels.push({
        type: panelType,
        buffer,
        seed: panelInfo.seed || baseSeed,
        prompt: panelInfo.prompt,
        url: panelUrl,
      });

      // Record prompt and seed for debug report
      debugReport.prompts[panelType] = panelInfo.prompt;
      debugReport.seeds[panelType] = panelInfo.seed;
    } catch (downloadError) {
      console.warn(`    Failed to download panel ${panelType}: ${downloadError.message}`);
    }
  }

  // Also save the A1 composed sheet
  let a1Buffer = null;
  if (a1SheetUrl) {
    try {
      a1Buffer = await downloadImage(a1SheetUrl);
      debugReport.a1SheetUrl = a1SheetUrl;
    } catch (downloadError) {
      console.warn(`    Failed to download A1 sheet: ${downloadError.message}`);
    }
  }

  // Save DEBUG_REPORT.json
  const debugPath = path.join(runDir, 'DEBUG_REPORT.json');
  fs.writeFileSync(debugPath, JSON.stringify(debugReport, null, 2));

  return { panels, a1Buffer, debugReport };
}

/**
 * Get default program spaces for a building type
 */
function getDefaultProgramSpaces(buildingType) {
  // Keep program constraints aligned to the current two-pass DNA output profile:
  // compact core set with stable naming and floor distribution.
  if (buildingType === 'bungalow') {
    return [
      {
        name: 'Living Room',
        area: 25,
        area_m2: 25,
        level: 'Ground',
        preferredOrientation: 'south',
      },
      {
        name: 'Kitchen',
        area: 15,
        area_m2: 15,
        level: 'Ground',
        preferredOrientation: 'east',
      },
      {
        name: 'Bedroom 1',
        area: 14,
        area_m2: 14,
        level: 'Ground',
        preferredOrientation: 'south',
      },
      {
        name: 'Bathroom',
        area: 8,
        area_m2: 8,
        level: 'Ground',
        preferredOrientation: 'any',
      },
    ];
  }

  return [
    {
      name: 'Living Room',
      area: 25,
      area_m2: 25,
      level: 'Ground',
      preferredOrientation: 'south',
    },
    {
      name: 'Kitchen',
      area: 15,
      area_m2: 15,
      level: 'Ground',
      preferredOrientation: 'east',
    },
    {
      name: 'Bedroom 1',
      area: 15,
      area_m2: 15,
      level: 'First',
      preferredOrientation: 'south',
    },
    {
      name: 'Bedroom 2',
      area: 15,
      area_m2: 15,
      level: 'First',
      preferredOrientation: 'south',
    },
    {
      name: 'Bathroom',
      area: 8,
      area_m2: 8,
      level: 'First',
      preferredOrientation: 'any',
    },
  ];
}

/**
 * Compose A1 sheet from panels
 */
async function composeA1Sheet(panels) {
  // A1 dimensions (landscape): 841mm x 594mm at 150 DPI = 4970 x 3508 pixels
  // For testing, use smaller: 2485 x 1754
  const A1_WIDTH = 2485;
  const A1_HEIGHT = 1754;

  // Create white background
  const channels = 3;
  const background = Buffer.alloc(A1_WIDTH * A1_HEIGHT * channels, 255);

  let composition = sharp(background, {
    raw: { width: A1_WIDTH, height: A1_HEIGHT, channels },
  });

  // Place panels in a grid layout
  const composites = [];
  const panelWidth = Math.floor(A1_WIDTH / 4);
  const panelHeight = Math.floor(A1_HEIGHT / 3);

  for (let i = 0; i < Math.min(panels.length, 12); i++) {
    const col = i % 4;
    const row = Math.floor(i / 4);

    const resized = await sharp(panels[i].buffer)
      .resize(panelWidth - 20, panelHeight - 20, { fit: 'inside' })
      .toBuffer();

    composites.push({
      input: resized,
      left: col * panelWidth + 10,
      top: row * panelHeight + 10,
    });
  }

  const composedBuffer = await composition
    .composite(composites)
    .png()
    .toBuffer();

  return composedBuffer;
}

// =============================================================================
// RUN EXECUTION & VALIDATION
// =============================================================================

/**
 * Execute a single QA run
 */
async function executeRun(runIndex, buildingType, outputDir, verbose, realGeneration) {
  const runDir = path.join(outputDir, `run_${String(runIndex).padStart(3, '0')}`);
  const panelsDir = path.join(runDir, 'panels');

  // Create directories
  fs.mkdirSync(panelsDir, { recursive: true });

  const thresholds = realGeneration ? REAL_THRESHOLDS : SYNTHETIC_THRESHOLDS;

  const result = {
    runIndex,
    buildingType,
    startTime: Date.now(),
    panels: [],
    metrics: {},
    pairMetrics: [],
    a1Path: null,
    errors: [],
    warnings: [],
    isProductionReady: false,
    mode: realGeneration ? 'REAL' : 'SYNTHETIC',
    debugReportPath: null,
  };

  try {
    let panels;
    let preComposedA1 = null;

    if (realGeneration) {
      // REAL GENERATION MODE
      if (verbose) console.log(`    [REAL] Calling AI APIs for ${buildingType}...`);

      const realResult = await generateRealPanels(buildingType, runIndex, runDir, verbose);
      panels = realResult.panels;
      preComposedA1 = realResult.a1Buffer;
      result.debugReportPath = path.join(runDir, 'DEBUG_REPORT.json');

      if (verbose) console.log(`    [REAL] Generated ${panels.length} panels`);
    } else {
      // SYNTHETIC MODE
      if (verbose) console.log(`    Generating ${PANEL_TYPES.length} synthetic panels...`);
      panels = await generateSyntheticPanels(buildingType, runIndex);
    }

    // 2. Save panel PNGs
    for (const panel of panels) {
      const panelPath = path.join(panelsDir, `${panel.type}.png`);
      fs.writeFileSync(panelPath, panel.buffer);
      result.panels.push({
        type: panel.type,
        path: panelPath,
        size: panel.buffer.length,
        seed: panel.seed,
        prompt: panel.prompt,
      });
    }

    // 3. Compute metrics between panel pairs (e.g., elevations should be similar)
    if (verbose) console.log(`    Computing cross-panel metrics...`);

    // Define pairs to compare (panels that should be consistent)
    const pairsToCompare = [
      ['elevation_north', 'elevation_south'],
      ['elevation_east', 'elevation_west'],
      ['floor_plan_ground', 'floor_plan_first'],
      ['section_AA', 'section_BB'],
      ['hero_3d', 'interior_3d'],
    ];

    for (const [typeA, typeB] of pairsToCompare) {
      const panelA = panels.find(p => p.type === typeA);
      const panelB = panels.find(p => p.type === typeB);

      if (panelA && panelB) {
        try {
          const metrics = await computeAllMetrics(panelA.buffer, panelB.buffer);
          result.pairMetrics.push({
            panelA: typeA,
            panelB: typeB,
            ssim: parseFloat(metrics.ssim.toFixed(4)),
            pHashSimilarity: parseFloat(metrics.pHash.similarity.toFixed(4)),
            pHashDistance: metrics.pHash.distance,
            edgeOverlap: parseFloat(metrics.edgeOverlap.toFixed(4)),
            hashA: metrics.pHash.hashA,
            hashB: metrics.pHash.hashB,
          });
        } catch (err) {
          result.errors.push(`Metrics computation failed for ${typeA}/${typeB}: ${err.message}`);
        }
      }
    }

    // 4. Use pre-composed A1 if available (real mode), otherwise compose
    let a1Buffer;
    if (preComposedA1) {
      a1Buffer = preComposedA1;
    } else {
      if (verbose) console.log(`    Composing A1 sheet...`);
      a1Buffer = await composeA1Sheet(panels);
    }

    const a1Path = path.join(runDir, 'a1_composed.png');
    fs.writeFileSync(a1Path, a1Buffer);
    result.a1Path = a1Path;
    result.a1Size = a1Buffer.length;

    // 5. Calculate aggregate metrics
    const allSSIM = result.pairMetrics.map(m => m.ssim);
    const allPHash = result.pairMetrics.map(m => m.pHashSimilarity);
    const allEdge = result.pairMetrics.map(m => m.edgeOverlap);

    result.metrics = {
      avgSSIM: allSSIM.length > 0 ? parseFloat((allSSIM.reduce((a, b) => a + b, 0) / allSSIM.length).toFixed(4)) : null,
      minSSIM: allSSIM.length > 0 ? Math.min(...allSSIM) : null,
      avgPHash: allPHash.length > 0 ? parseFloat((allPHash.reduce((a, b) => a + b, 0) / allPHash.length).toFixed(4)) : null,
      minPHash: allPHash.length > 0 ? Math.min(...allPHash) : null,
      avgEdgeOverlap: allEdge.length > 0 ? parseFloat((allEdge.reduce((a, b) => a + b, 0) / allEdge.length).toFixed(4)) : null,
      minEdgeOverlap: allEdge.length > 0 ? Math.min(...allEdge) : null,
      panelCount: panels.length,
      pairCount: result.pairMetrics.length,
    };

    // 6. Check production readiness criteria
    const expectedPanelCount = realGeneration ? 5 : PANEL_TYPES.length;  // Real may have fewer
    const hasMinPanels = result.panels.length >= expectedPanelCount;
    const hasA1 = result.a1Path !== null;
    const hasMetrics = result.pairMetrics.length > 0 && result.pairMetrics.every(m =>
      m.ssim !== null && m.pHashSimilarity !== null && m.edgeOverlap !== null
    );

    const metricsAboveThreshold =
      result.metrics.minSSIM >= thresholds.minSSIM &&
      result.metrics.minPHash >= thresholds.minPHash &&
      result.metrics.minEdgeOverlap >= thresholds.minEdgeOverlap;

    result.checks = {
      hasMinPanels,
      hasA1,
      hasMetrics,
      metricsAboveThreshold,
      noErrors: result.errors.length === 0,
      thresholds,
    };

    result.isProductionReady = hasMinPanels && hasA1 && hasMetrics &&
      metricsAboveThreshold && result.errors.length === 0;

    result.status = result.isProductionReady ? 'READY' : 'NOT_READY';
    result.fixableByRegeneration = !result.isProductionReady && result.errors.length <= 2;

  } catch (error) {
    result.errors.push(`Run failed: ${error.message}`);
    result.status = 'FAIL';  // Explicit FAIL for real mode errors
    result.isProductionReady = false;
    result.fixableByRegeneration = false;  // Don't mark as fixable - it's a real failure
  }

  result.endTime = Date.now();
  result.durationMs = result.endTime - result.startTime;

  // 7. Save metrics.json
  const metricsPath = path.join(runDir, 'metrics.json');
  fs.writeFileSync(metricsPath, JSON.stringify({
    runIndex,
    buildingType,
    mode: result.mode,
    timestamp: new Date().toISOString(),
    duration: result.durationMs,
    status: result.status,
    isProductionReady: result.isProductionReady,
    panels: result.panels.map(p => ({ type: p.type, path: p.path, seed: p.seed })),
    a1Path: result.a1Path,
    debugReportPath: result.debugReportPath,
    aggregateMetrics: result.metrics,
    pairMetrics: result.pairMetrics,
    checks: result.checks,
    errors: result.errors,
    warnings: result.warnings,
  }, null, 2));

  return result;
}

// =============================================================================
// RESULTS TRACKING & REPORTING
// =============================================================================

class ResultsTracker {
  constructor() {
    this.runs = [];
    this.startTime = Date.now();
  }

  addRun(result) {
    this.runs.push(result);
  }

  getSummary() {
    const total = this.runs.length;
    const successful = this.runs.filter(r => r.isProductionReady).length;
    const failed = this.runs.filter(r => !r.isProductionReady);
    const fixable = failed.filter(r => r.fixableByRegeneration).length;
    const unfixable = failed.filter(r => !r.fixableByRegeneration).length;

    // Aggregate metrics
    const allAvgSSIM = this.runs.map(r => r.metrics?.avgSSIM).filter(v => v !== null && v !== undefined);
    const allAvgPHash = this.runs.map(r => r.metrics?.avgPHash).filter(v => v !== null && v !== undefined);
    const allAvgEdge = this.runs.map(r => r.metrics?.avgEdgeOverlap).filter(v => v !== null && v !== undefined);

    return {
      totalRuns: total,
      successfulRuns: successful,
      failedRuns: failed.length,
      successRate: total > 0 ? (successful / total) : 0,
      successRatePercent: total > 0 ? ((successful / total) * 100).toFixed(1) + '%' : '0%',
      fixableFailures: fixable,
      unfixableFailures: unfixable,
      avgSSIM: allAvgSSIM.length > 0 ? (allAvgSSIM.reduce((a, b) => a + b, 0) / allAvgSSIM.length).toFixed(4) : 'N/A',
      avgPHash: allAvgPHash.length > 0 ? (allAvgPHash.reduce((a, b) => a + b, 0) / allAvgPHash.length).toFixed(4) : 'N/A',
      avgEdgeOverlap: allAvgEdge.length > 0 ? (allAvgEdge.reduce((a, b) => a + b, 0) / allAvgEdge.length).toFixed(4) : 'N/A',
      elapsedMs: Date.now() - this.startTime,
    };
  }

  getWorstFailures(count = 5) {
    const failures = this.runs
      .filter(r => !r.isProductionReady)
      .map(r => ({
        runIndex: r.runIndex,
        buildingType: r.buildingType,
        status: r.status,
        mode: r.mode,
        errors: r.errors,
        metrics: r.metrics,
        panelsDir: r.panels?.[0]?.path ? path.dirname(r.panels[0].path) : null,
        a1Path: r.a1Path,
        debugReportPath: r.debugReportPath,
        minSSIM: r.metrics?.minSSIM,
        minPHash: r.metrics?.minPHash,
        minEdge: r.metrics?.minEdgeOverlap,
      }))
      .sort((a, b) => {
        // Sort by worst metrics first
        const scoreA = (a.minSSIM || 0) + (a.minPHash || 0) + (a.minEdge || 0);
        const scoreB = (b.minSSIM || 0) + (b.minPHash || 0) + (b.minEdge || 0);
        return scoreA - scoreB;
      })
      .slice(0, count);

    return failures;
  }
}

// =============================================================================
// OUTPUT FORMATTING
// =============================================================================

function printSummaryTable(results) {
  console.log('\n┌─────────────────────────────────────────────────────────────────────┐');
  console.log('│                        SUMMARY TABLE                                │');
  console.log('├──────────────────────┬──────────┬──────────┬──────────┬─────────────┤');
  console.log('│ Building Type        │ Runs     │ Pass     │ Fail     │ Pass Rate   │');
  console.log('├──────────────────────┼──────────┼──────────┼──────────┼─────────────┤');

  // Group by building type
  const byType = {};
  for (const run of results.runs) {
    if (!byType[run.buildingType]) {
      byType[run.buildingType] = { total: 0, pass: 0, fail: 0 };
    }
    byType[run.buildingType].total++;
    if (run.isProductionReady) {
      byType[run.buildingType].pass++;
    } else {
      byType[run.buildingType].fail++;
    }
  }

  for (const [type, stats] of Object.entries(byType)) {
    const rate = stats.total > 0 ? ((stats.pass / stats.total) * 100).toFixed(1) + '%' : '0%';
    console.log(`│ ${type.padEnd(20)} │ ${String(stats.total).padStart(8)} │ ${String(stats.pass).padStart(8)} │ ${String(stats.fail).padStart(8)} │ ${rate.padStart(11)} │`);
  }

  console.log('├──────────────────────┴──────────┴──────────┴──────────┴─────────────┤');

  const summary = results.getSummary();
  console.log(`│ TOTAL: ${summary.totalRuns} runs, ${summary.successfulRuns} passed, ${summary.failedRuns} failed (${summary.successRatePercent})`.padEnd(70) + '│');
  console.log('└─────────────────────────────────────────────────────────────────────┘');
}

function printMetricsTable(results) {
  const summary = results.getSummary();

  console.log('\n┌─────────────────────────────────────────────────────────────────────┐');
  console.log('│                        METRICS SUMMARY                              │');
  console.log('├────────────────────────────────┬────────────────────────────────────┤');
  console.log(`│ Average SSIM                   │ ${String(summary.avgSSIM).padStart(34)} │`);
  console.log(`│ Average pHash Similarity       │ ${String(summary.avgPHash).padStart(34)} │`);
  console.log(`│ Average Edge Overlap           │ ${String(summary.avgEdgeOverlap).padStart(34)} │`);
  console.log('├────────────────────────────────┼────────────────────────────────────┤');
  console.log(`│ Fixable Failures               │ ${String(summary.fixableFailures).padStart(34)} │`);
  console.log(`│ Unfixable Failures             │ ${String(summary.unfixableFailures).padStart(34)} │`);
  console.log(`│ Total Time                     │ ${String((summary.elapsedMs / 1000).toFixed(1) + 's').padStart(34)} │`);
  console.log('└────────────────────────────────┴────────────────────────────────────┘');
}

function printWorstFailures(failures, realGeneration) {
  if (failures.length === 0) {
    console.log('\n✅ No failures to report!');
    return;
  }

  console.log('\n┌─────────────────────────────────────────────────────────────────────┐');
  console.log('│                      WORST 5 FAILURES                               │');
  console.log('└─────────────────────────────────────────────────────────────────────┘');

  for (let i = 0; i < failures.length; i++) {
    const f = failures[i];
    console.log(`\n[${i + 1}] Run #${f.runIndex} - ${f.buildingType} [${f.mode}]`);
    console.log(`    Status: ${f.status}`);
    console.log(`    Metrics: SSIM=${f.minSSIM?.toFixed(3) || 'N/A'}, pHash=${f.minPHash?.toFixed(3) || 'N/A'}, Edge=${f.minEdge?.toFixed(3) || 'N/A'}`);
    if (f.errors.length > 0) {
      console.log(`    Errors: ${f.errors.slice(0, 2).join('; ')}`);
    }
    if (f.panelsDir) {
      console.log(`    Panels: ${f.panelsDir}`);
    }
    if (f.a1Path) {
      console.log(`    A1 Sheet: ${f.a1Path}`);
    }
    if (realGeneration && f.debugReportPath) {
      console.log(`    Debug Report: ${f.debugReportPath}`);
    }
  }
}

// =============================================================================
// MAIN HARNESS
// =============================================================================

async function runProductionReadinessHarness(config) {
  const mode = config.realGeneration ? 'REAL' : 'SYNTHETIC';

  console.log('\n╔═══════════════════════════════════════════════════════════════════════╗');
  console.log(`║         PRODUCTION READINESS QA HARNESS v3.0 [${mode.padEnd(9)}]             ║`);
  console.log('║         Real Metrics • Real Panels • Real A1 Composition              ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════╝\n');

  // Load environment and validate API keys if real generation
  if (config.realGeneration) {
    console.log('Loading environment variables...');
    loadEnv();

    console.log('Validating API keys...');
    const keys = validateApiKeys();
    console.log(`  ✓ TOGETHER_API_KEY: ${keys.togetherApiKey ? 'set' : 'MISSING'}`);
    console.log(`  ○ OPENAI_REASONING_API_KEY: ${keys.openaiApiKey ? 'set' : 'not set (optional)'}`);
    console.log(`  ○ MESHY_API_KEY: ${keys.meshyApiKey ? 'set' : 'not set (optional)'}`);
    console.log('');
  }

  console.log('Configuration:');
  console.log(`  - Mode: ${mode}`);
  console.log(`  - Runs: ${config.runs}`);
  console.log(`  - Building Type: ${config.buildingType}`);
  console.log(`  - Output: ${config.outputDir}`);
  console.log(`  - Fail Fast: ${config.failFast}`);
  console.log(`  - Dry Run: ${config.dryRun}`);
  console.log('');
  console.log('Acceptance Criteria:');
  console.log(`  - Success Rate: ≥${ACCEPTANCE_CRITERIA.minSuccessRate * 100}%`);
  console.log(`  - Unfixable Failures: ≤${ACCEPTANCE_CRITERIA.maxUnfixableFailures}`);

  if (config.realGeneration) {
    console.log('');
    console.log('Real Generation Thresholds:');
    console.log(`  - Min SSIM: ${REAL_THRESHOLDS.minSSIM}`);
    console.log(`  - Min pHash: ${REAL_THRESHOLDS.minPHash}`);
    console.log(`  - Min Edge Overlap: ${REAL_THRESHOLDS.minEdgeOverlap}`);
  }
  console.log('');

  // Ensure output directory
  if (!fs.existsSync(config.outputDir)) {
    fs.mkdirSync(config.outputDir, { recursive: true });
  }

  const tracker = new ResultsTracker();

  // Run generations
  for (let i = 0; i < config.runs; i++) {
    const runNumber = i + 1;
    const buildingType = config.buildingType === 'random'
      ? BUILDING_TYPES[Math.floor(Math.random() * BUILDING_TYPES.length)]
      : config.buildingType;

    console.log(`\n[Run ${runNumber}/${config.runs}] Building type: ${buildingType} [${mode}]`);

    if (config.dryRun) {
      console.log(`  [DRY RUN] Would generate panels and compute metrics`);
      tracker.addRun({
        runIndex: runNumber,
        buildingType,
        isProductionReady: true,
        status: 'DRY_RUN',
        mode,
        metrics: {},
        panels: [],
        errors: [],
      });
      continue;
    }

    try {
      const result = await executeRun(runNumber, buildingType, config.outputDir, config.verbose, config.realGeneration);
      tracker.addRun(result);

      if (result.isProductionReady) {
        console.log(`  ✅ READY (SSIM=${result.metrics.avgSSIM}, pHash=${result.metrics.avgPHash}, Edge=${result.metrics.avgEdgeOverlap})`);
      } else {
        console.log(`  ❌ ${result.status}: ${result.errors.length > 0 ? result.errors[0] : 'Metrics below threshold'}`);
        if (result.fixableByRegeneration) {
          console.log(`     → Fixable by regeneration`);
        } else if (config.realGeneration) {
          console.log(`     → UNFIXABLE - check ${result.debugReportPath || 'debug report'}`);
        }

        if (config.failFast) {
          console.log('\n[FAIL FAST] Stopping after first failure');
          break;
        }
      }

      // Progress
      if (runNumber % 10 === 0 || config.realGeneration) {
        const interim = tracker.getSummary();
        console.log(`\n--- Progress: ${runNumber}/${config.runs} (${interim.successRatePercent} success) ---\n`);
      }

    } catch (error) {
      console.error(`  ❌ FAIL: ${error.message}`);
      tracker.addRun({
        runIndex: runNumber,
        buildingType,
        isProductionReady: false,
        status: 'FAIL',
        mode,
        errors: [error.message],
        fixableByRegeneration: false,  // Real failures are not auto-fixable
        metrics: {},
        panels: [],
      });

      if (config.failFast) break;
    }
  }

  // Print results
  console.log('\n');
  printSummaryTable(tracker);
  printMetricsTable(tracker);
  printWorstFailures(tracker.getWorstFailures(5), config.realGeneration);

  // Save final report
  const summary = tracker.getSummary();
  const report = {
    summary,
    mode,
    runs: tracker.runs.map(r => ({
      runIndex: r.runIndex,
      buildingType: r.buildingType,
      status: r.status,
      mode: r.mode,
      isProductionReady: r.isProductionReady,
      metrics: r.metrics,
      errors: r.errors,
      duration: r.durationMs,
      debugReportPath: r.debugReportPath,
    })),
    worstFailures: tracker.getWorstFailures(5),
    acceptanceCriteria: ACCEPTANCE_CRITERIA,
    thresholds: config.realGeneration ? REAL_THRESHOLDS : SYNTHETIC_THRESHOLDS,
    generatedAt: new Date().toISOString(),
  };

  const reportPath = path.join(config.outputDir, `qa-report-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  const latestPath = path.join(config.outputDir, 'qa-report-latest.json');
  fs.writeFileSync(latestPath, JSON.stringify(report, null, 2));

  // Write index.json aggregating all runs
  const indexPath = path.join(config.outputDir, 'index.json');
  fs.writeFileSync(indexPath, JSON.stringify({
    mode,
    totalRuns: summary.totalRuns,
    successRate: summary.successRatePercent,
    unfixableFailures: summary.unfixableFailures,
    avgSSIM: summary.avgSSIM,
    avgPHash: summary.avgPHash,
    avgEdgeOverlap: summary.avgEdgeOverlap,
    generatedAt: new Date().toISOString(),
    reportPath,
  }, null, 2));

  console.log(`\nReport saved to: ${reportPath}`);
  console.log(`Index saved to: ${indexPath}`);

  // Determine pass/fail
  const meetsAcceptance =
    summary.successRate >= ACCEPTANCE_CRITERIA.minSuccessRate &&
    summary.unfixableFailures <= ACCEPTANCE_CRITERIA.maxUnfixableFailures;

  console.log('\n╔═══════════════════════════════════════════════════════════════════════╗');
  if (meetsAcceptance) {
    console.log(`║  ✅ PRODUCTION READINESS: ACCEPTABLE [${mode}]`.padEnd(72) + '║');
    console.log(`║     Success Rate: ${summary.successRatePercent} (≥${ACCEPTANCE_CRITERIA.minSuccessRate * 100}% required)`.padEnd(72) + '║');
    console.log(`║     Unfixable Failures: ${summary.unfixableFailures} (≤${ACCEPTANCE_CRITERIA.maxUnfixableFailures} required)`.padEnd(72) + '║');
  } else {
    console.log(`║  ❌ PRODUCTION READINESS: NOT ACCEPTABLE [${mode}]`.padEnd(72) + '║');
    if (summary.successRate < ACCEPTANCE_CRITERIA.minSuccessRate) {
      console.log(`║     ⚠ Success Rate: ${summary.successRatePercent} (needs ≥${ACCEPTANCE_CRITERIA.minSuccessRate * 100}%)`.padEnd(72) + '║');
    }
    if (summary.unfixableFailures > ACCEPTANCE_CRITERIA.maxUnfixableFailures) {
      console.log(`║     ⚠ Unfixable Failures: ${summary.unfixableFailures} (max ${ACCEPTANCE_CRITERIA.maxUnfixableFailures} allowed)`.padEnd(72) + '║');
    }
  }
  console.log('╚═══════════════════════════════════════════════════════════════════════╝\n');

  return meetsAcceptance ? 0 : 1;
}

// =============================================================================
// ENTRY POINT
// =============================================================================

const config = parseArgs();
runProductionReadinessHarness(config)
  .then((exitCode) => {
    process.exit(exitCode);
  })
  .catch((error) => {
    console.error('\n❌ HARNESS ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  });
