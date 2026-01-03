/**
 * Genarch Pipeline Job Manager
 *
 * Manages async execution of the genarch pipeline.
 * Creates jobs, tracks progress, and provides artifact access.
 *
 * API:
 * - createJob(prompt, options) -> job
 * - runJob(job, options) -> Promise<result>
 * - getJob(jobId) -> job
 * - cancelJob(jobId) -> boolean
 * - cleanupExpiredJobs(maxAgeHours) -> void
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const JOBS = new Map();

// Default work directory for genarch runs
const DEFAULT_RUNS_ROOT = process.env.GENARCH_RUNS_DIR
  ? path.resolve(process.env.GENARCH_RUNS_DIR)
  : path.join(process.cwd(), 'genarch_runs');

// Python executable (can be overridden with GENARCH_PYTHON)
const PYTHON_EXECUTABLE = process.env.GENARCH_PYTHON || 'python';

// genarch package location
const GENARCH_PACKAGE = process.env.GENARCH_PACKAGE_DIR
  ? path.resolve(process.env.GENARCH_PACKAGE_DIR)
  : path.join(process.cwd(), 'genarch');

// Public route for serving artifacts
const GENARCH_PUBLIC_ROUTE = process.env.GENARCH_PUBLIC_ROUTE || '/api/genarch/runs';

// Job statuses
const STATUS = {
  QUEUED: 'queued',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
};

// Phase labels for progress tracking
const PHASES = {
  1: { label: 'Floor Plan Generation', percent: 25 },
  2: { label: 'Blender Rendering', percent: 50 },
  3: { label: 'AI Perspective', percent: 75 },
  4: { label: 'A1 PDF Assembly', percent: 100 },
};

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

/**
 * Generate a unique job ID
 */
function generateJobId() {
  return `gen-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Create a new genarch pipeline job
 *
 * @param {Object} options - Job options
 * @param {string} options.prompt - Natural language prompt (e.g., "modern villa 200sqm")
 * @param {string} [options.constraintsPath] - Path to constraints JSON (alternative to prompt)
 * @param {number} [options.seed] - Random seed for reproducibility
 * @param {boolean} [options.skipPhase2] - Skip Blender rendering
 * @param {boolean} [options.skipPhase3] - Skip AI perspective (default: true)
 * @param {boolean} [options.skipPhase4] - Skip A1 PDF assembly
 * @param {number} [options.driftThreshold] - Max allowed drift score (0.0-1.0)
 * @param {boolean} [options.strict] - Fail on validation errors
 * @param {string} [options.blenderPath] - Path to Blender executable
 * @returns {Object} Job object
 */
function createJob(options = {}) {
  const jobId = options.jobId || generateJobId();
  const runPath = path.join(DEFAULT_RUNS_ROOT, jobId);

  ensureDir(runPath);

  // Default options
  const jobOptions = {
    prompt: options.prompt || null,
    constraintsPath: options.constraintsPath || null,
    seed: options.seed || Math.floor(Math.random() * 1000000),
    skipPhase2: options.skipPhase2 ?? true, // Skip Blender by default (not always available)
    skipPhase3: options.skipPhase3 ?? true, // Phase 3 not implemented yet
    skipPhase4: options.skipPhase4 ?? false,
    driftThreshold: options.driftThreshold ?? 0.15,
    strict: options.strict ?? false,
    blenderPath: options.blenderPath || process.env.BLENDER_PATH || null,
    verbose: options.verbose ?? true,
  };

  const job = {
    id: jobId,
    status: STATUS.QUEUED,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    options: jobOptions,
    paths: {
      run: runPath,
      planJson: path.join(runPath, 'plan.json'),
      planDxf: path.join(runPath, 'plan.dxf'),
      modelGlb: path.join(runPath, 'model.glb'),
      phase4: path.join(runPath, 'phase4'),
      a1Sheet: path.join(runPath, 'phase4', 'A1_sheet.pdf'),
      manifest: path.join(runPath, 'pipeline_manifest.json'),
    },
    progress: {
      phase: 0,
      phaseName: 'Queued',
      percent: 0,
      message: 'Waiting to start...',
    },
    logs: {
      stdout: '',
      stderr: '',
    },
    result: null,
    error: null,
    process: null,
    promise: null,
  };

  JOBS.set(jobId, job);
  return job;
}

/**
 * Parse progress from genarch stdout
 */
function parseProgress(job, line) {
  // Detect phase start
  const phaseMatch = line.match(/\[Phase (\d)\]/);
  if (phaseMatch) {
    const phase = parseInt(phaseMatch[1], 10);
    if (PHASES[phase]) {
      job.progress.phase = phase;
      job.progress.phaseName = PHASES[phase].label;
      // Set percent to start of phase range
      const prevPercent = phase > 1 ? PHASES[phase - 1].percent : 0;
      job.progress.percent = prevPercent + 5; // 5% into this phase
    }
  }

  // Detect phase completion
  if (line.includes('complete') || line.includes('success')) {
    const phase = job.progress.phase;
    if (phase && PHASES[phase]) {
      job.progress.percent = PHASES[phase].percent;
      job.progress.message = `${PHASES[phase].label} complete`;
    }
  }

  // Detect Phase 1 specific messages
  if (line.includes('Generating constraints')) {
    job.progress.message = 'Generating constraints from prompt...';
    job.progress.percent = 5;
  } else if (line.includes('Floor plan generation')) {
    job.progress.message = 'Generating floor plan...';
    job.progress.percent = 10;
  } else if (line.includes('Exporting')) {
    job.progress.message = 'Exporting files...';
    job.progress.percent = 20;
  }

  // Detect Phase 4 specific messages
  if (line.includes('Assembling A1')) {
    job.progress.message = 'Assembling A1 sheet...';
    job.progress.percent = 85;
  } else if (line.includes('PDF saved')) {
    job.progress.message = 'PDF saved successfully';
    job.progress.percent = 100;
  }

  job.updatedAt = Date.now();
}

/**
 * Run a genarch pipeline job
 *
 * @param {Object} job - Job object from createJob
 * @param {Object} options - Run options
 * @param {boolean} [options.waitForResult] - Wait for completion (default: true)
 * @returns {Promise<Object>|Object} - Result or job object
 */
function runJob(job, { waitForResult = true } = {}) {
  if (!job) {
    throw new Error('Job is required');
  }

  if (job.status === STATUS.RUNNING) {
    return waitForResult ? job.promise : job;
  }

  job.status = STATUS.RUNNING;
  job.startedAt = Date.now();
  job.updatedAt = Date.now();
  job.progress.message = 'Starting pipeline...';

  // Build command args
  const args = ['-m', 'genarch.pipeline'];

  // Input source
  if (job.options.prompt) {
    args.push('--prompt', job.options.prompt);
  } else if (job.options.constraintsPath) {
    args.push('--constraints', job.options.constraintsPath);
  } else {
    job.status = STATUS.FAILED;
    job.error = 'Either prompt or constraintsPath is required';
    return Promise.reject(new Error(job.error));
  }

  // Output path
  args.push('--out', job.paths.run);

  // Options
  args.push('--seed', String(job.options.seed));

  if (job.options.skipPhase2) args.push('--skip-phase2');
  if (job.options.skipPhase3) args.push('--skip-phase3');
  if (job.options.skipPhase4) args.push('--skip-phase4');
  if (job.options.strict) args.push('--strict');
  if (job.options.verbose) args.push('-v');

  if (job.options.driftThreshold) {
    args.push('--drift-threshold', String(job.options.driftThreshold));
  }

  if (job.options.blenderPath) {
    args.push('--blender-path', job.options.blenderPath);
  }

  // Spawn Python process
  const env = { ...process.env };
  if (GENARCH_PACKAGE && fs.existsSync(GENARCH_PACKAGE)) {
    // Add genarch package to PYTHONPATH
    env.PYTHONPATH = GENARCH_PACKAGE + (env.PYTHONPATH ? `:${env.PYTHONPATH}` : '');
  }

  console.log(`[Genarch] Starting job ${job.id}: ${PYTHON_EXECUTABLE} ${args.join(' ')}`);

  job.process = spawn(PYTHON_EXECUTABLE, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: GENARCH_PACKAGE,
    env,
  });

  job.process.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    job.logs.stdout += text;

    // Parse progress from each line
    text.split('\n').forEach((line) => {
      if (line.trim()) {
        parseProgress(job, line);
      }
    });
  });

  job.process.stderr.on('data', (chunk) => {
    job.logs.stderr += chunk.toString();
  });

  job.promise = new Promise((resolve, reject) => {
    job.process.on('error', (error) => {
      job.status = STATUS.FAILED;
      job.error = error.message;
      job.updatedAt = Date.now();
      job.completedAt = Date.now();
      reject(error);
    });

    job.process.on('close', (code) => {
      job.completedAt = Date.now();
      job.updatedAt = Date.now();

      if (code !== 0) {
        job.status = STATUS.FAILED;
        job.error = `Pipeline exited with code ${code}`;
        job.progress.message = 'Pipeline failed';
        return reject(new Error(job.error));
      }

      // Read pipeline manifest
      try {
        if (fs.existsSync(job.paths.manifest)) {
          const manifest = JSON.parse(fs.readFileSync(job.paths.manifest, 'utf-8'));
          job.result = manifest;
          job.status = STATUS.COMPLETED;
          job.progress.percent = 100;
          job.progress.message = 'Pipeline complete';

          // Add artifact URLs
          job.result.artifacts = buildArtifactUrls(job);
        } else {
          // No manifest but success
          job.status = STATUS.COMPLETED;
          job.result = { success: true };
          job.result.artifacts = buildArtifactUrls(job);
        }

        resolve(job.result);
      } catch (error) {
        job.status = STATUS.FAILED;
        job.error = `Failed to read manifest: ${error.message}`;
        reject(error);
      }
    });
  });

  return waitForResult ? job.promise : job;
}

/**
 * Build public URLs for job artifacts
 */
function buildArtifactUrls(job) {
  const artifacts = {};
  const runPath = job.paths.run;

  // Check each potential output
  const files = [
    { key: 'planJson', path: 'plan.json', type: 'application/json' },
    { key: 'planDxf', path: 'plan.dxf', type: 'application/dxf' },
    { key: 'modelGlb', path: 'model.glb', type: 'model/gltf-binary' },
    { key: 'modelObj', path: 'model.obj', type: 'text/plain' },
    { key: 'runJson', path: 'run.json', type: 'application/json' },
    { key: 'constraintsJson', path: 'constraints.json', type: 'application/json' },
    { key: 'pipelineManifest', path: 'pipeline_manifest.json', type: 'application/json' },
    { key: 'a1Sheet', path: 'phase4/A1_sheet.pdf', type: 'application/pdf' },
    { key: 'sheetManifest', path: 'phase4/sheet_manifest.json', type: 'application/json' },
    { key: 'assetReport', path: 'asset_report.json', type: 'application/json' },
    { key: 'driftReport', path: 'drift_report.json', type: 'application/json' },
  ];

  for (const { key, path: filePath, type } of files) {
    const fullPath = path.join(runPath, filePath);
    if (fs.existsSync(fullPath)) {
      artifacts[key] = {
        url: `${GENARCH_PUBLIC_ROUTE}/${job.id}/${filePath}`,
        filename: path.basename(filePath),
        type,
        size: fs.statSync(fullPath).size,
      };
    }
  }

  return artifacts;
}

/**
 * Get a job by ID
 */
function getJob(jobId) {
  return JOBS.get(jobId);
}

/**
 * Cancel a running job
 */
function cancelJob(jobId) {
  const job = JOBS.get(jobId);
  if (!job) return false;

  if (job.status === STATUS.RUNNING && job.process) {
    job.process.kill('SIGTERM');
    job.status = STATUS.CANCELLED;
    job.updatedAt = Date.now();
    job.completedAt = Date.now();
    job.error = 'Job was cancelled';
    return true;
  }

  return false;
}

/**
 * List all jobs (optionally filtered by status)
 */
function listJobs(status = null) {
  const jobs = [];
  JOBS.forEach((job) => {
    if (!status || job.status === status) {
      jobs.push({
        id: job.id,
        status: job.status,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        completedAt: job.completedAt || null,
        progress: job.progress,
        error: job.error,
      });
    }
  });
  return jobs.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Clean up old jobs
 */
function cleanupExpiredJobs(maxAgeHours = 24) {
  const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;
  JOBS.forEach((job, jobId) => {
    if ((job.updatedAt || job.createdAt) < cutoff) {
      try {
        fs.rmSync(job.paths.run, { recursive: true, force: true });
      } catch (error) {
        console.warn(`[Genarch] Failed to cleanup job ${jobId}:`, error.message);
      }
      JOBS.delete(jobId);
    }
  });
}

/**
 * Get the run directory for a job (for serving files)
 */
function getJobRunPath(jobId) {
  const job = JOBS.get(jobId);
  if (job) {
    return job.paths.run;
  }
  // Fallback: check if directory exists even if job not in memory
  const runPath = path.join(DEFAULT_RUNS_ROOT, jobId);
  if (fs.existsSync(runPath)) {
    return runPath;
  }
  return null;
}

/**
 * Serialize job for API response (omits process and promise)
 */
function serializeJob(job) {
  if (!job) return null;

  return {
    id: job.id,
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    startedAt: job.startedAt || null,
    completedAt: job.completedAt || null,
    options: {
      prompt: job.options.prompt,
      seed: job.options.seed,
      skipPhase2: job.options.skipPhase2,
      skipPhase4: job.options.skipPhase4,
    },
    progress: job.progress,
    result: job.result,
    artifacts: job.result?.artifacts || null,
    error: job.error,
    logs: job.status === STATUS.FAILED ? {
      stdout: job.logs.stdout.slice(-5000), // Last 5KB
      stderr: job.logs.stderr.slice(-2000), // Last 2KB
    } : undefined,
  };
}

module.exports = {
  createJob,
  runJob,
  getJob,
  cancelJob,
  listJobs,
  cleanupExpiredJobs,
  getJobRunPath,
  serializeJob,
  DEFAULT_RUNS_ROOT,
  GENARCH_PUBLIC_ROUTE,
  STATUS,
};
