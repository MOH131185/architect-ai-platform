/**
 * Genarch Pipeline Service
 *
 * Frontend service for interacting with the genarch floor plan generation API.
 * Provides job creation, status polling, cancellation, and artifact download.
 *
 * Architecture:
 * - Development: Browser → localhost:3001 (direct, with API key)
 * - Production: Browser → Vercel proxy → RunPod (API key added server-side)
 *
 * API Endpoints:
 * - POST /api/genarch/jobs - Create job
 * - GET /api/genarch/jobs/:jobId - Get job status
 * - DELETE /api/genarch/jobs/:jobId - Cancel job
 * - GET /api/genarch/runs/:jobId/* - Download artifacts
 */

import logger from "../core/logger.js";

// Check if we're in development mode
const isDevelopment = () => {
  return (
    process.env.NODE_ENV === "development" ||
    process.env.REACT_APP_DEV_MODE === "true"
  );
};

// Base URL for API calls
const getBaseUrl = () => {
  // In development, use Express server directly
  if (isDevelopment()) {
    return process.env.REACT_APP_API_PROXY_URL || "http://localhost:3001";
  }
  // In production, use relative paths (Vercel proxy handles the rest)
  return "";
};

// Get API key for authentication (only used in development)
const getApiKey = () => {
  // Only return API key in development mode
  // In production, Vercel proxy adds the API key server-side
  if (!isDevelopment()) {
    return "";
  }
  return process.env.REACT_APP_GENARCH_API_KEY || "";
};

// Build headers with optional auth
const buildHeaders = (contentType = null) => {
  const headers = {};

  if (contentType) {
    headers["Content-Type"] = contentType;
  }

  // Only add API key in development (production uses server-side proxy)
  const apiKey = getApiKey();
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  return headers;
};

/**
 * Job status enum
 */
export const GenarchJobStatus = {
  QUEUED: "queued",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
};

/**
 * Create a new genarch pipeline job
 *
 * @param {Object} options - Job options
 * @param {string} options.prompt - Natural language description (e.g., "modern villa 200sqm")
 * @param {number} [options.seed] - Random seed for reproducibility
 * @param {boolean} [options.skipPhase2=true] - Skip Blender rendering
 * @param {boolean} [options.skipPhase3=true] - Skip AI perspective
 * @param {boolean} [options.skipPhase4=false] - Skip A1 PDF assembly
 * @param {boolean} [options.strict=false] - Fail on validation errors
 * @param {number} [options.driftThreshold=0.15] - Drift validation threshold
 * @param {boolean} [options.waitForResult=false] - Wait for completion
 * @returns {Promise<{ success: boolean, job: Object, error?: string }>}
 */
export async function createJob(options = {}) {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/api/genarch/jobs`;

  logger.info("[GenarchService] Creating job", { prompt: options.prompt });

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: buildHeaders("application/json"),
      body: JSON.stringify({
        prompt: options.prompt,
        seed: options.seed,
        skipPhase2: options.skipPhase2 ?? true,
        skipPhase3: options.skipPhase3 ?? true,
        skipPhase4: options.skipPhase4 ?? false,
        strict: options.strict ?? false,
        driftThreshold: options.driftThreshold ?? 0.15,
        waitForResult: options.waitForResult ?? false,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      logger.error("[GenarchService] Create job failed", {
        status: response.status,
        data,
      });
      return {
        success: false,
        job: null,
        error: data.message || data.error || `HTTP ${response.status}`,
      };
    }

    logger.info("[GenarchService] Job created", { jobId: data.job?.id });
    return data;
  } catch (error) {
    logger.error("[GenarchService] Create job error", { error: error.message });
    return {
      success: false,
      job: null,
      error: error.message,
    };
  }
}

/**
 * Get job status and progress
 *
 * @param {string} jobId - Job ID
 * @returns {Promise<{ success: boolean, job: Object, error?: string }>}
 */
export async function getJob(jobId) {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/api/genarch/jobs/${jobId}`;

  try {
    const response = await fetch(url, {
      headers: buildHeaders(),
    });
    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        job: null,
        error: data.message || data.error || `HTTP ${response.status}`,
      };
    }

    return data;
  } catch (error) {
    logger.error("[GenarchService] Get job error", {
      jobId,
      error: error.message,
    });
    return {
      success: false,
      job: null,
      error: error.message,
    };
  }
}

/**
 * Cancel a running job
 *
 * @param {string} jobId - Job ID
 * @returns {Promise<{ success: boolean, message?: string, error?: string }>}
 */
export async function cancelJob(jobId) {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/api/genarch/jobs/${jobId}`;

  logger.info("[GenarchService] Cancelling job", { jobId });

  try {
    const response = await fetch(url, {
      method: "DELETE",
      headers: buildHeaders(),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.message || data.error || `HTTP ${response.status}`,
      };
    }

    logger.info("[GenarchService] Job cancelled", { jobId });
    return data;
  } catch (error) {
    logger.error("[GenarchService] Cancel job error", {
      jobId,
      error: error.message,
    });
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Build artifact URL
 *
 * @param {string} jobId - Job ID
 * @param {string} relativePath - Path relative to job run folder (e.g., "phase4/A1_sheet.pdf")
 * @returns {string} Full URL to artifact
 */
export function artifactUrl(jobId, relativePath) {
  const baseUrl = getBaseUrl();
  return `${baseUrl}/api/genarch/runs/${jobId}/${relativePath}`;
}

/**
 * Download artifact as Blob
 *
 * @param {string} jobId - Job ID
 * @param {string} relativePath - Path relative to job run folder
 * @returns {Promise<{ success: boolean, blob?: Blob, contentType?: string, error?: string }>}
 */
export async function downloadArtifactBlob(jobId, relativePath) {
  const url = artifactUrl(jobId, relativePath);

  try {
    const response = await fetch(url, {
      headers: buildHeaders(),
    });

    if (!response.ok) {
      const text = await response.text();
      return {
        success: false,
        error: `HTTP ${response.status}: ${text}`,
      };
    }

    const blob = await response.blob();
    const contentType =
      response.headers.get("content-type") || "application/octet-stream";

    return {
      success: true,
      blob,
      contentType,
    };
  } catch (error) {
    logger.error("[GenarchService] Download artifact error", {
      jobId,
      relativePath,
      error: error.message,
    });
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Poll job until completion or timeout
 *
 * @param {string} jobId - Job ID
 * @param {Object} options - Polling options
 * @param {number} [options.intervalMs=2000] - Polling interval in ms
 * @param {number} [options.timeoutMs=300000] - Timeout in ms (5 min default)
 * @param {Function} [options.onProgress] - Callback for progress updates: (job) => void
 * @returns {Promise<{ success: boolean, job: Object, error?: string }>}
 */
export async function pollUntilComplete(jobId, options = {}) {
  const { intervalMs = 2000, timeoutMs = 300000, onProgress } = options;
  const startTime = Date.now();

  logger.info("[GenarchService] Starting poll", {
    jobId,
    intervalMs,
    timeoutMs,
  });

  while (true) {
    // Check timeout
    if (Date.now() - startTime > timeoutMs) {
      logger.warn("[GenarchService] Poll timeout", { jobId });
      return {
        success: false,
        job: null,
        error: "Polling timeout exceeded",
      };
    }

    // Get job status
    const result = await getJob(jobId);

    if (!result.success) {
      return result;
    }

    const { job } = result;

    // Call progress callback
    if (onProgress && typeof onProgress === "function") {
      try {
        onProgress(job);
      } catch (e) {
        logger.warn("[GenarchService] Progress callback error", {
          error: e.message,
        });
      }
    }

    // Check for terminal states
    if (job.status === GenarchJobStatus.COMPLETED) {
      logger.info("[GenarchService] Job completed", { jobId });
      return { success: true, job };
    }

    if (job.status === GenarchJobStatus.FAILED) {
      logger.error("[GenarchService] Job failed", { jobId, error: job.error });
      return {
        success: false,
        job,
        error: job.error || "Job failed",
      };
    }

    if (job.status === GenarchJobStatus.CANCELLED) {
      logger.info("[GenarchService] Job cancelled", { jobId });
      return {
        success: false,
        job,
        error: "Job was cancelled",
      };
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/**
 * Check if genarch pipeline is available
 *
 * @returns {Promise<boolean>}
 */
export async function isAvailable() {
  const baseUrl = getBaseUrl();

  try {
    const response = await fetch(`${baseUrl}/api/health`);
    if (!response.ok) {
      return false;
    }

    const data = await response.json();
    return data.services?.genarch === true;
  } catch (error) {
    logger.debug("[GenarchService] Health check failed", {
      error: error.message,
    });
    return false;
  }
}

/**
 * Service singleton
 */
const genarchPipelineService = {
  createJob,
  getJob,
  cancelJob,
  artifactUrl,
  downloadArtifactBlob,
  pollUntilComplete,
  isAvailable,
  GenarchJobStatus,
};

export default genarchPipelineService;
