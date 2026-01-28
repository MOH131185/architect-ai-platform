/**
 * Geometry Render Job Manager
 * 
 * Manages geometry rendering jobs for the dev server
 * Stub implementation - can be expanded later
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_RUNS_ROOT = path.join(process.cwd(), 'geometry_renders');

// In-memory job store
const jobs = new Map();

/**
 * Create a new geometry render job
 * 
 * @param {Object} designState - Design state for rendering
 * @param {Object} options - Rendering options
 * @returns {Object} Job object
 */
function createJob(designState, options = {}) {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const job = {
        id: jobId,
        designState,
        options,
        status: 'pending',
        createdAt: new Date(),
        paths: {
            outputDir: path.join(DEFAULT_RUNS_ROOT, jobId),
        },
    };

    jobs.set(jobId, job);
    return job;
}

/**
 * Get a job by ID
 * 
 * @param {string} jobId - Job ID
 * @returns {Object|null} Job object or null
 */
function getJob(jobId) {
    return jobs.get(jobId) || null;
}

/**
 * Run a geometry render job
 * 
 * @param {Object} job - Job object
 * @param {Object} options - Run options
 * @returns {Promise<Object>} Job result
 */
async function runJob(job, options = {}) {
    // Stub implementation - mark as completed
    job.status = 'completed';
    job.completedAt = new Date();

    // Create output directory
    if (!fs.existsSync(job.paths.outputDir)) {
        fs.mkdirSync(job.paths.outputDir, { recursive: true });
    }

    return job;
}

/**
 * Clean up expired jobs
 * 
 * @param {number} maxAgeHours - Max age in hours
 */
function cleanupExpiredJobs(maxAgeHours) {
    const now = Date.now();
    const maxAgeMs = maxAgeHours * 60 * 60 * 1000;

    for (const [jobId, job] of jobs.entries()) {
        const age = now - job.createdAt.getTime();
        if (age > maxAgeMs) {
            // Remove from memory
            jobs.delete(jobId);

            // Remove output directory if exists
            try {
                if (fs.existsSync(job.paths.outputDir)) {
                    fs.rmSync(job.paths.outputDir, { recursive: true, force: true });
                }
            } catch (error) {
                console.warn(`Failed to clean up job ${jobId}:`, error.message);
            }
        }
    }
}

module.exports = {
    DEFAULT_RUNS_ROOT,
    createJob,
    getJob,
    runJob,
    cleanupExpiredJobs,
};
