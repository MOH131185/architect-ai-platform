/**
 * BlenderBridgeService (Server-Side Only)
 *
 * Bridges between Meshy 3D models and Blender rendering.
 * Downloads GLB models and invokes Blender for deterministic technical drawings.
 *
 * NOTE: This is a Node.js-only service that must NOT be imported in frontend code.
 * It uses Node.js built-in modules (fs, path, child_process, crypto) that are not
 * available in browser environments.
 *
 * MANDATORY CORRECTION C:
 * - Do NOT run Blender in serverless routes
 * - Local runner for dev (spawn blender process)
 * - Production worker via BLENDER_WORKER_URL
 *
 * DELIVERABLE #4:
 * - Deterministic panel filenames (runId_panelType_timestamp.png)
 * - Run manifest JSON (panel key → file path → bytes → width/height → hash)
 *
 * Part of Phase 3: Meshy + Blender + OpenAI Pipeline Refactor
 *
 * Usage:
 *   const { blenderBridgeService } = require('./blender/BlenderBridgeService.cjs');
 *   const result = await blenderBridgeService.generateTechnicalDrawings(meshyResult, dna);
 *   // result.panels contains { floor_plan_ground, elevation_north, section_AA, ... }
 *   // result.manifest contains run manifest with file hashes
 *
 * @module server/blender/BlenderBridgeService
 */

const { spawn } = require('child_process');
const { createHash } = require('crypto');
const { existsSync, mkdirSync } = require('fs');
const fs = require('fs/promises');
const path = require('path');

/**
 * Environment detection
 */
const isServerless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const workerUrl = process.env.BLENDER_WORKER_URL;

/**
 * Default configuration
 */
const DEFAULT_CONFIG = {
  blenderPath: process.env.BLENDER_PATH || 'blender',
  scriptsDir: path.join(process.cwd(), 'blender_scripts'),
  tempDir: path.join(process.cwd(), 'temp', 'blender'),
  timeout: 300000, // 5 minutes
  cleanupOnSuccess: false, // Keep files for debugging
  cleanupOnError: false,
  workerUrl: workerUrl || null,
  workerToken: process.env.BLENDER_WORKER_TOKEN || '',
};

/**
 * Panel type to deterministic filename mapping
 * Ensures consistent file names across runs
 */
const PANEL_FILENAME_MAP = {
  floor_plan_ground: 'plan_ground',
  floor_plan_first: 'plan_first',
  floor_plan_level2: 'plan_level2',
  floor_plan_upper: 'plan_upper',
  elevation_north: 'elev_north',
  elevation_south: 'elev_south',
  elevation_east: 'elev_east',
  elevation_west: 'elev_west',
  section_AA: 'section_aa',
  section_BB: 'section_bb',
  axonometric: 'axon',
  hero_3d: 'hero_3d',
  interior_3d: 'interior_3d',
};

/**
 * Simple logger for server-side use
 */
const logger = {
  info: (...args) => console.log('[BlenderBridge]', ...args),
  warn: (...args) => console.warn('[BlenderBridge]', ...args),
  error: (...args) => console.error('[BlenderBridge]', ...args),
  debug: (...args) => {
    if (process.env.DEBUG) console.log('[BlenderBridge:DEBUG]', ...args);
  },
};

/**
 * BlenderBridgeService class
 * Manages the Meshy GLB -> Blender render pipeline
 */
class BlenderBridgeService {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.isAvailable = null; // Cached availability check
    this.mode = this.determineMode();
  }

  /**
   * Determine operating mode based on environment
   * @returns {'local'|'worker'|'disabled'}
   */
  determineMode() {
    if (isServerless && !this.config.workerUrl) {
      logger.warn('Serverless environment without worker URL - DISABLED');
      return 'disabled';
    }
    if (this.config.workerUrl) {
      logger.info(`Worker mode: ${this.config.workerUrl}`);
      return 'worker';
    }
    logger.info('Local mode: using local Blender installation');
    return 'local';
  }

  /**
   * Check if Blender is available (local mode only)
   * @returns {Promise<boolean>}
   */
  async checkAvailability() {
    if (this.mode === 'disabled') {
      return false;
    }

    if (this.mode === 'worker') {
      return this.checkWorkerHealth();
    }

    if (this.isAvailable !== null) {
      return this.isAvailable;
    }

    try {
      const result = await this.runBlenderCommand(['--version'], 5000);
      this.isAvailable = result.success && result.stdout.includes('Blender');
      logger.info(`Local availability: ${this.isAvailable ? 'AVAILABLE' : 'NOT AVAILABLE'}`);
      return this.isAvailable;
    } catch (err) {
      this.isAvailable = false;
      logger.warn('Local Blender not available:', err.message);
      return false;
    }
  }

  /**
   * Check worker health (worker mode)
   * @returns {Promise<boolean>}
   */
  async checkWorkerHealth() {
    try {
      const fetch = (await import('node-fetch')).default;
      const response = await fetch(`${this.config.workerUrl}/health`, {
        method: 'GET',
        headers: this.getWorkerHeaders(),
        timeout: 5000,
      });
      return response.ok;
    } catch (err) {
      logger.warn('Worker health check failed:', err.message);
      return false;
    }
  }

  /**
   * Get headers for worker requests
   * @returns {Object}
   */
  getWorkerHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (this.config.workerToken) {
      headers['Authorization'] = `Bearer ${this.config.workerToken}`;
    }
    return headers;
  }

  /**
   * Run a Blender command with timeout (local mode only)
   * @param {string[]} args - Command line arguments
   * @param {number} timeout - Timeout in ms
   * @returns {Promise<{success: boolean, stdout: string, stderr: string, code: number}>}
   */
  runBlenderCommand(args, timeout = this.config.timeout) {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.config.blenderPath, args, {
        timeout,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        resolve({ success: code === 0, stdout, stderr, code });
      });

      proc.on('error', (err) => {
        reject(err);
      });

      // Handle timeout
      const timeoutId = setTimeout(() => {
        proc.kill('SIGTERM');
        reject(new Error(`Blender process timed out after ${timeout}ms`));
      }, timeout);

      proc.on('close', () => clearTimeout(timeoutId));
    });
  }

  /**
   * Compute SHA256 hash of a buffer
   * @param {Buffer} buffer
   * @returns {string}
   */
  computeHash(buffer) {
    return createHash('sha256').update(buffer).digest('hex').substring(0, 16);
  }

  /**
   * Generate deterministic panel filename
   * @param {string} runId - Run identifier
   * @param {string} panelType - Panel type (e.g., 'floor_plan_ground')
   * @returns {string}
   */
  generatePanelFilename(runId, panelType) {
    const shortName = PANEL_FILENAME_MAP[panelType] || panelType.replace(/_/g, '-');
    return `${runId}_${shortName}.png`;
  }

  /**
   * Download GLB model from Meshy URL
   * @param {string} modelUrl - Meshy GLB URL
   * @param {string} outputPath - Local file path
   * @returns {Promise<string>} - Path to downloaded file
   */
  async downloadGLB(modelUrl, outputPath) {
    logger.info(`Downloading GLB from ${modelUrl}`);

    const fetch = (await import('node-fetch')).default;

    const response = await fetch(modelUrl);
    if (!response.ok) {
      throw new Error(`Failed to download GLB: ${response.status} ${response.statusText}`);
    }

    const buffer = await response.buffer();

    // Ensure directory exists
    const dir = path.dirname(outputPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    await fs.writeFile(outputPath, buffer);
    logger.info(`GLB saved: ${outputPath} (${(buffer.length / 1024).toFixed(1)} KB)`);

    return outputPath;
  }

  /**
   * Build DesignState JSON from DNA for Blender
   * @param {Object} dna - Master Design DNA
   * @param {Object} meshyResult - Meshy generation result
   * @returns {Object} - DesignState for Blender
   */
  buildDesignStateFromDNA(dna, meshyResult) {
    const program = dna?.program || {};
    const geometry = dna?.geometry_rules || {};
    const dimensions = dna?.dimensions || {};
    const style = dna?.style || {};

    const floorCount = program.floors || dimensions.floors || 2;
    const floorHeight = dimensions.floor_height || 3.0;
    const length = dimensions.length || 12;
    const width = dimensions.width || 10;

    // Build levels array
    const levels = [];
    const levelNames = ['ground', 'first', 'second', 'third', 'fourth'];
    for (let i = 0; i < floorCount; i++) {
      levels.push({
        id: levelNames[i] || `level_${i}`,
        index: i,
        elevation: i * floorHeight,
        height: floorHeight,
        name: i === 0 ? 'Ground Floor' : `Floor ${i}`,
      });
    }

    // Build rooms array
    const rooms = (program.rooms || []).map((room, idx) => {
      const floorIdx = this.normalizeFloorToIndex(room.floor);
      return {
        id: room.name?.toLowerCase().replace(/\s+/g, '_') || `room_${idx}`,
        name: room.name || 'Room',
        function: room.function || room.name,
        area: room.area_m2 || room.area || 20,
        levelId: levelNames[floorIdx] || 'ground',
        width: room.width || Math.sqrt(room.area_m2 || 20),
        length: room.length || Math.sqrt(room.area_m2 || 20),
        polygon: null,
      };
    });

    // Build slabs
    const slabs = levels.map((level) => ({
      id: `slab_${level.id}`,
      levelId: level.id,
      thickness: 0.3,
      polygon: {
        vertices: [
          { x: 0, y: 0 },
          { x: length, y: 0 },
          { x: length, y: width },
          { x: 0, y: width },
        ],
      },
    }));

    // Build roof
    const roofType = geometry.roof_type || style.roof_type || 'gable';
    const roof = {
      id: 'roof_main',
      type: roofType,
      pitch: geometry.roof_pitch || 35,
      ridgeHeight: dimensions.height || floorCount * floorHeight + 2,
      materialId: 'roof_tile',
      footprint: {
        vertices: [
          { x: -0.3, y: -0.3 },
          { x: length + 0.3, y: -0.3 },
          { x: length + 0.3, y: width + 0.3 },
          { x: -0.3, y: width + 0.3 },
        ],
      },
    };

    // Build materials
    const materials = (style.materials || []).map((mat) => ({
      id: mat.name?.toLowerCase().replace(/\s+/g, '_') || 'material',
      name: mat.name || 'Material',
      color: mat.hexColor || mat.color || '#CCCCCC',
      roughness: 0.7,
      metallic: 0.0,
    }));

    return {
      version: '1.0.0',
      source: 'meshy',
      modelPath: meshyResult?.localGLBPath || null,
      meshyModelUrl: meshyResult?.modelUrl || null,
      dimensions: { length, width, height: dimensions.height || floorCount * floorHeight + 2 },
      levels,
      rooms,
      slabs,
      roof,
      materials,
      walls: [],
      openings: [],
      metadata: {
        buildingType: program.buildingType || 'residential',
        floorCount,
        totalArea: rooms.reduce((sum, r) => sum + r.area, 0),
        generatedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Normalize floor identifier to index
   * @param {string|number} floor
   * @returns {number}
   */
  normalizeFloorToIndex(floor) {
    if (typeof floor === 'number') return floor;
    if (!floor) return 0;

    const floorStr = String(floor).toLowerCase();
    if (floorStr.includes('ground') || floorStr === '0' || floorStr === 'g') return 0;
    if (floorStr.includes('first') || floorStr === '1') return 1;
    if (floorStr.includes('second') || floorStr === '2') return 2;
    if (floorStr.includes('third') || floorStr === '3') return 3;

    const match = floorStr.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  /**
   * Render views using local Blender
   * @param {string} designStatePath - Path to design_state.json
   * @param {string} outputDir - Output directory for renders
   * @param {string} runId - Run identifier for deterministic filenames
   * @returns {Promise<Object>} - Manifest with rendered views
   */
  async renderViewsLocal(designStatePath, outputDir, runId) {
    logger.info('Starting LOCAL Blender render...');

    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    const scriptPath = path.join(this.config.scriptsDir, 'generate_views.py');
    const manifestPath = path.join(outputDir, 'manifest.json');

    if (!existsSync(scriptPath)) {
      throw new Error(`Blender script not found: ${scriptPath}`);
    }

    const args = [
      '-b',
      '-P',
      scriptPath,
      '--',
      designStatePath,
      outputDir,
      '--manifest',
      manifestPath,
      '--run-id',
      runId,
    ];

    logger.debug('Running:', this.config.blenderPath, args.join(' '));

    const result = await this.runBlenderCommand(args);

    if (!result.success) {
      logger.error('Render failed:', result.stderr);
      throw new Error(
        `Blender render failed (exit code ${result.code}): ${result.stderr.slice(-500)}`
      );
    }

    if (!existsSync(manifestPath)) {
      throw new Error('Blender did not produce a manifest file');
    }

    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));
    logger.info(`Local render complete: ${manifest.views?.length || 0} views`);

    return manifest;
  }

  /**
   * Render views using production worker
   * @param {Object} designState - Design state object
   * @param {string} runId - Run identifier
   * @returns {Promise<Object>} - Manifest with rendered views
   */
  async renderViewsWorker(designState, runId) {
    logger.info(`Starting WORKER render via ${this.config.workerUrl}...`);

    const fetch = (await import('node-fetch')).default;

    const response = await fetch(`${this.config.workerUrl}/render`, {
      method: 'POST',
      headers: this.getWorkerHeaders(),
      body: JSON.stringify({
        designState,
        runId,
        outputFormats: ['all'],
      }),
      timeout: this.config.timeout,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(`Worker render failed: ${error.message || response.status}`);
    }

    const result = await response.json();

    // Worker returns panels directly or task ID for async
    if (result.taskId) {
      return this.pollWorkerTask(result.taskId);
    }

    return result;
  }

  /**
   * Poll worker task for async completion
   * @param {string} taskId
   * @returns {Promise<Object>}
   */
  async pollWorkerTask(taskId) {
    const fetch = (await import('node-fetch')).default;
    const maxPolls = 60; // 5 minutes with 5s interval
    const pollInterval = 5000;

    for (let i = 0; i < maxPolls; i++) {
      await new Promise((r) => setTimeout(r, pollInterval));

      const response = await fetch(`${this.config.workerUrl}/status/${taskId}`, {
        headers: this.getWorkerHeaders(),
      });

      if (!response.ok) continue;

      const status = await response.json();

      if (status.status === 'completed') {
        return status;
      }

      if (status.status === 'failed') {
        throw new Error(`Worker task failed: ${status.error}`);
      }

      logger.debug(`Worker task ${taskId}: ${status.status}`);
    }

    throw new Error('Worker task timed out');
  }

  /**
   * Build run manifest with panel metadata
   * DELIVERABLE #4: Run manifest JSON
   *
   * @param {Object} panels - Panel buffers with metadata
   * @param {string} runId - Run identifier
   * @param {Object} designState - Design state for context
   * @returns {Object} - Run manifest
   */
  buildRunManifest(panels, runId, designState) {
    const now = new Date().toISOString();
    const manifest = {
      version: '1.0.0',
      runId,
      generatedAt: now,
      source: this.mode,
      designState: {
        dimensions: designState?.dimensions || {},
        floorCount: designState?.levels?.length || 0,
        buildingType: designState?.metadata?.buildingType || 'unknown',
      },
      panels: {},
      stats: {
        totalPanels: 0,
        totalBytes: 0,
        panelTypes: [],
      },
    };

    for (const [panelType, panelData] of Object.entries(panels)) {
      const buffer = panelData.buffer;
      if (!buffer) continue;

      const filename = this.generatePanelFilename(runId, panelType);
      const hash = this.computeHash(buffer);
      const bytes = buffer.length;

      manifest.panels[panelType] = {
        filename,
        path: panelData.path || `renders/${filename}`,
        bytes,
        width: panelData.width || 0,
        height: panelData.height || 0,
        hash,
        source: panelData.source || 'blender',
        generatedAt: now,
      };

      manifest.stats.totalPanels++;
      manifest.stats.totalBytes += bytes;
      manifest.stats.panelTypes.push(panelType);
    }

    return manifest;
  }

  /**
   * Full pipeline: Meshy GLB -> Blender renders -> Panel buffers
   *
   * @param {Object} meshyResult - Result from Meshy 3D service
   * @param {Object} dna - Master Design DNA
   * @param {Object} options - Generation options
   * @returns {Promise<Object>} - { success, panels, manifest, tempDir }
   */
  async generateTechnicalDrawings(meshyResult, dna, options = {}) {
    // Check mode
    if (this.mode === 'disabled') {
      logger.warn('Blender disabled in serverless environment without worker');
      return { success: false, reason: 'serverless_no_worker', panels: {}, manifest: null };
    }

    // Check availability
    const available = await this.checkAvailability();
    if (!available) {
      logger.warn('Blender not available');
      return { success: false, reason: 'blender_unavailable', panels: {}, manifest: null };
    }

    const runId = options.runId || `blender_${Date.now()}`;
    const tempRunDir = path.join(this.config.tempDir, runId);

    try {
      // 1. Download GLB if URL provided
      let localGLBPath = null;
      if (meshyResult?.modelUrl && this.mode === 'local') {
        const glbPath = path.join(tempRunDir, 'model.glb');
        localGLBPath = await this.downloadGLB(meshyResult.modelUrl, glbPath);
      }

      // 2. Build DesignState JSON
      const designState = this.buildDesignStateFromDNA(dna, {
        ...meshyResult,
        localGLBPath,
      });

      let blenderManifest;
      const panels = {};

      // 3. Render based on mode
      if (this.mode === 'local') {
        const designStatePath = path.join(tempRunDir, 'design_state.json');
        await fs.writeFile(designStatePath, JSON.stringify(designState, null, 2));
        logger.debug('DesignState saved:', designStatePath);

        const outputDir = path.join(tempRunDir, 'renders');
        blenderManifest = await this.renderViewsLocal(designStatePath, outputDir, runId);

        // Read rendered images into buffers
        for (const view of blenderManifest.views || []) {
          try {
            const buffer = await fs.readFile(view.path);
            panels[view.id] = {
              buffer,
              type: view.type,
              path: view.path,
              width: view.width,
              height: view.height,
              metadata: view.metadata,
              source: 'blender-local',
            };
          } catch (readErr) {
            logger.warn(`Failed to read ${view.id}:`, readErr.message);
          }
        }
      } else {
        // Worker mode
        const workerResult = await this.renderViewsWorker(designState, runId);
        blenderManifest = workerResult.manifest || workerResult;

        // Download renders from worker
        if (workerResult.renders) {
          const fetch = (await import('node-fetch')).default;
          for (const [viewId, renderInfo] of Object.entries(workerResult.renders)) {
            try {
              const response = await fetch(renderInfo.url);
              if (response.ok) {
                const buffer = Buffer.from(await response.arrayBuffer());
                panels[viewId] = {
                  buffer,
                  type: renderInfo.type,
                  path: renderInfo.url,
                  width: renderInfo.width,
                  height: renderInfo.height,
                  source: 'blender-worker',
                };
              }
            } catch (err) {
              logger.warn(`Failed to download ${viewId}:`, err.message);
            }
          }
        }
      }

      // 4. Map to A1 panel types
      const mappedPanels = this.mapToA1PanelTypes(panels);

      // 5. Build run manifest (Deliverable #4)
      const runManifest = this.buildRunManifest(mappedPanels, runId, designState);

      // 6. Save manifest to disk
      const manifestPath = path.join(tempRunDir, 'run_manifest.json');
      if (!existsSync(tempRunDir)) {
        mkdirSync(tempRunDir, { recursive: true });
      }
      await fs.writeFile(manifestPath, JSON.stringify(runManifest, null, 2));

      logger.info(`Generated ${Object.keys(mappedPanels).length} technical panels`);
      logger.info(`Run manifest: ${manifestPath}`);

      return {
        success: true,
        panels: mappedPanels,
        manifest: runManifest,
        blenderManifest,
        tempDir: tempRunDir,
        designState,
        mode: this.mode,
      };
    } catch (error) {
      logger.error('Pipeline failed:', error.message);

      if (this.config.cleanupOnError) {
        await this.cleanup(tempRunDir);
      }

      return {
        success: false,
        error: error.message,
        tempDir: tempRunDir,
        panels: {},
        manifest: null,
        mode: this.mode,
      };
    }
  }

  /**
   * Cleanup temporary directory
   * @param {string} tempDir
   */
  async cleanup(tempDir) {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
      logger.debug(`Cleaned up: ${tempDir}`);
    } catch (err) {
      logger.warn(`Cleanup failed: ${err.message}`);
    }
  }

  /**
   * Map Blender view IDs to A1 panel types
   * @param {Object} blenderPanels - Panels from Blender
   * @returns {Object} - Mapped to A1 panel types
   */
  mapToA1PanelTypes(blenderPanels) {
    const mapping = {
      plan_ground: 'floor_plan_ground',
      plan_first: 'floor_plan_first',
      plan_level2: 'floor_plan_level2',
      elevation_north: 'elevation_north',
      elevation_south: 'elevation_south',
      elevation_east: 'elevation_east',
      elevation_west: 'elevation_west',
      section_a: 'section_AA',
      section_b: 'section_BB',
      axonometric: 'axonometric',
      perspective: 'hero_3d',
      interior: 'interior_3d',
    };

    const mapped = {};
    for (const [blenderId, panelData] of Object.entries(blenderPanels)) {
      const a1Type = mapping[blenderId] || blenderId;
      mapped[a1Type] = panelData;
    }

    return mapped;
  }
}

// Export singleton instance
const blenderBridgeService = new BlenderBridgeService();

module.exports = {
  BlenderBridgeService,
  blenderBridgeService,
};
