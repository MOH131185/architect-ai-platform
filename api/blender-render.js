/**
 * Blender Render API Endpoint
 *
 * Handles Blender rendering requests for technical drawings.
 * In development: Uses local Blender installation
 * In production: Forwards to external render worker (BLENDER_WORKER_URL)
 *
 * Phase 1 (default): Technical drawing generation
 * POST /api/blender-render
 * Body: {
 *   meshyResult: { modelUrl, ... },
 *   dna: { ... },
 *   runId?: string,
 *   views?: string[],
 * }
 *
 * Phase 2: ControlNet snapshot generation
 * POST /api/blender-render?phase=2
 * Body: {
 *   modelPath: string,  // Path to GLB/OBJ model
 *   config?: string,    // Path to phase2_config.json (optional)
 *   outputDir?: string, // Output directory (optional)
 * }
 *
 * Part of genarch Pipeline: Floor Plan + 3D Mesh + ControlNet Rendering
 */

// Force Node.js runtime for file system and child process operations
import { exec } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';

export const runtime = 'nodejs';
export const config = {
  runtime: 'nodejs',
  maxDuration: 300, // 5 minutes (requires Vercel Pro for >10s)
};

const execPromise = promisify(exec);

/**
 * Handle Phase 2: ControlNet snapshot generation
 *
 * Runs Blender headless to generate clay, normal, depth, mask passes
 * then runs postprocess.py for canny edge detection.
 */
async function handlePhase2Render(req, res) {
  const { modelPath, config: configPath, outputDir } = req.body;

  // Validate model path
  if (!modelPath) {
    return res.status(400).json({
      error: 'MISSING_MODEL_PATH',
      message: 'modelPath is required for Phase 2 rendering',
    });
  }

  if (!fs.existsSync(modelPath)) {
    return res.status(400).json({
      error: 'MODEL_NOT_FOUND',
      message: `Model file not found: ${modelPath}`,
    });
  }

  // Use default config if not specified
  const defaultConfigPath = path.join(process.cwd(), 'blender_scripts', 'phase2_config.json');
  const finalConfigPath = configPath || defaultConfigPath;

  if (!fs.existsSync(finalConfigPath)) {
    return res.status(400).json({
      error: 'CONFIG_NOT_FOUND',
      message: `Config file not found: ${finalConfigPath}`,
    });
  }

  // Create output directory
  const finalOutputDir = outputDir || path.join(os.tmpdir(), `phase2_${Date.now()}`);
  fs.mkdirSync(finalOutputDir, { recursive: true });

  // Find Blender executable
  const blenderPath = process.env.BLENDER_PATH || 'blender';
  const controlnetScript = path.join(process.cwd(), 'blender_scripts', 'controlnet_rendering.py');
  const postprocessScript = path.join(process.cwd(), 'blender_scripts', 'postprocess.py');

  if (!fs.existsSync(controlnetScript)) {
    return res.status(500).json({
      error: 'SCRIPT_NOT_FOUND',
      message: `ControlNet rendering script not found: ${controlnetScript}`,
    });
  }

  console.log('[Phase 2] Starting ControlNet rendering...');
  console.log(`  Model: ${modelPath}`);
  console.log(`  Config: ${finalConfigPath}`);
  console.log(`  Output: ${finalOutputDir}`);

  try {
    // Step 1: Run Blender headless
    const blenderCmd = `"${blenderPath}" -b -P "${controlnetScript}" -- --in "${modelPath}" --config "${finalConfigPath}" --out "${finalOutputDir}"`;
    console.log(`[Phase 2] Running: ${blenderCmd}`);

    const { stdout: blenderStdout, stderr: blenderStderr } = await execPromise(blenderCmd, {
      timeout: 120000, // 2 minutes
      maxBuffer: 10 * 1024 * 1024, // 10MB
    });

    if (blenderStderr && !blenderStderr.includes('Blender')) {
      console.warn('[Phase 2] Blender stderr:', blenderStderr);
    }
    console.log('[Phase 2] Blender rendering complete');

    // Step 2: Run postprocess.py (if opencv is available)
    if (fs.existsSync(postprocessScript)) {
      try {
        const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
        const postprocessCmd = `"${pythonCmd}" "${postprocessScript}" --input "${finalOutputDir}" --output "${finalOutputDir}"`;
        console.log(`[Phase 2] Running: ${postprocessCmd}`);

        const { stdout: postStdout } = await execPromise(postprocessCmd, {
          timeout: 30000, // 30 seconds
        });
        console.log('[Phase 2] Postprocessing complete');
      } catch (postErr) {
        console.warn('[Phase 2] Postprocessing failed (optional):', postErr.message);
        // Continue without postprocessing - Blender renders are still valid
      }
    }

    // Step 3: Read and return manifest
    const manifestPath = path.join(finalOutputDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      return res.status(500).json({
        error: 'MANIFEST_NOT_FOUND',
        message: 'Blender rendering did not produce a manifest',
        outputDir: finalOutputDir,
      });
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    // List output files
    const outputFiles = fs.readdirSync(finalOutputDir).filter((f) => f.endsWith('.png'));

    return res.status(200).json({
      success: true,
      phase: 2,
      manifest,
      outputDir: finalOutputDir,
      camerasJson: path.join(finalOutputDir, 'cameras.json'),
      outputFiles,
      message: `Phase 2 complete: ${outputFiles.length} images generated`,
    });
  } catch (err) {
    console.error('[Phase 2] Error:', err);

    // Check if Blender is available
    if (err.message.includes('not recognized') || err.message.includes('not found')) {
      return res.status(503).json({
        error: 'BLENDER_NOT_INSTALLED',
        message: 'Blender is not available. Install Blender or set BLENDER_PATH.',
        details: err.message,
      });
    }

    return res.status(500).json({
      error: 'PHASE2_FAILED',
      message: err.message,
      outputDir: finalOutputDir,
    });
  }
}

/**
 * BlenderRenderWorker Interface
 *
 * For production at scale, implement an external render worker:
 *
 * POST /render
 * Body: { designState, outputFormats, webhook? }
 * Response: { taskId }
 *
 * GET /status/:taskId
 * Response: { status, renders?, error? }
 *
 * @typedef {Object} BlenderRenderWorkerRequest
 * @property {Object} designState - Design state JSON
 * @property {string[]} outputFormats - Requested view types
 * @property {string} [webhook] - Callback URL for async completion
 *
 * @typedef {Object} BlenderRenderWorkerResponse
 * @property {string} taskId
 * @property {'pending'|'processing'|'completed'|'failed'} status
 * @property {Object} [renders] - Map of view type to { url, width, height }
 * @property {string} [error]
 */

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'METHOD_NOT_ALLOWED',
      message: 'Only POST requests are supported',
    });
  }

  // Check for Phase 2 mode (ControlNet snapshot generation)
  const phase = req.query?.phase || req.body?.phase;
  if (phase === '2' || phase === 2) {
    return handlePhase2Render(req, res);
  }

  const { meshyResult, dna, runId, views } = req.body;

  // Validate input
  if (!dna) {
    return res.status(400).json({
      error: 'MISSING_DNA',
      message: 'Design DNA is required for rendering',
    });
  }

  // Check environment
  const isVercel = !!process.env.VERCEL;
  const workerUrl = process.env.BLENDER_WORKER_URL;

  // In serverless environment without worker, return not available
  if (isVercel && !workerUrl) {
    return res.status(501).json({
      error: 'BLENDER_NOT_AVAILABLE',
      message: 'Blender rendering requires external worker in serverless environment',
      recommendation: 'Set BLENDER_WORKER_URL environment variable to your render worker endpoint',
      fallback: 'Use Meshy renders or geometry projections instead',
    });
  }

  // If worker URL is configured, forward to external worker
  if (workerUrl) {
    try {
      console.log(`[Blender API] Forwarding to external worker: ${workerUrl}`);

      const response = await fetch(`${workerUrl}/render`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.BLENDER_WORKER_TOKEN || ''}`,
        },
        body: JSON.stringify({
          meshyResult,
          dna,
          runId: runId || `blender_${Date.now()}`,
          views: views || ['all'],
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: response.statusText }));
        return res.status(response.status).json({
          error: 'WORKER_ERROR',
          message: error.message || 'Render worker returned an error',
          details: error,
        });
      }

      const result = await response.json();
      return res.status(200).json(result);
    } catch (err) {
      console.error('[Blender API] Worker request failed:', err.message);
      return res.status(503).json({
        error: 'WORKER_UNAVAILABLE',
        message: 'Failed to connect to render worker',
        details: err.message,
      });
    }
  }

  // Local development - use BlenderBridgeService directly
  try {
    console.log('[Blender API] Using local Blender installation');

    // Dynamic import to avoid loading in serverless
    const { BlenderBridgeService } = await import(
      '../src/services/blender/BlenderBridgeService.js'
    );
    const bridge = new BlenderBridgeService();

    // Check if Blender is available
    const available = await bridge.checkAvailability();
    if (!available) {
      return res.status(503).json({
        error: 'BLENDER_NOT_INSTALLED',
        message: 'Blender is not available on this system',
        recommendation: 'Install Blender or set BLENDER_PATH environment variable',
      });
    }

    // Generate technical drawings
    const result = await bridge.generateTechnicalDrawings(meshyResult, dna, {
      runId: runId || `blender_${Date.now()}`,
    });

    if (!result.success) {
      return res.status(500).json({
        error: 'RENDER_FAILED',
        message: result.error || 'Blender rendering failed',
        reason: result.reason,
      });
    }

    // Convert buffers to base64 for JSON response
    const panels = {};
    for (const [type, panel] of Object.entries(result.panels || {})) {
      panels[type] = {
        ...panel,
        buffer: undefined, // Don't send buffer
        base64: panel.buffer ? panel.buffer.toString('base64') : null,
        dataUrl: panel.buffer ? `data:image/png;base64,${panel.buffer.toString('base64')}` : null,
      };
    }

    return res.status(200).json({
      success: true,
      panels,
      manifest: result.manifest,
      tempDir: result.tempDir,
      message: `Generated ${Object.keys(panels).length} technical drawings`,
    });
  } catch (err) {
    console.error('[Blender API] Error:', err);
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: err.message,
    });
  }
}
