/**
 * Genarch Job by ID API - Vercel Serverless Proxy
 *
 * Routes:
 * - GET /api/genarch/jobs/:jobId - Get job status
 * - DELETE /api/genarch/jobs/:jobId - Cancel job
 *
 * This proxies requests to the RunPod backend, adding the API key server-side.
 */

// Environment variables
const RUNPOD_GENARCH_URL = process.env.RUNPOD_GENARCH_URL;
const GENARCH_API_KEY = process.env.GENARCH_API_KEY;

/**
 * Build headers for RunPod request
 */
function buildHeaders() {
  const headers = {};

  if (GENARCH_API_KEY) {
    headers["Authorization"] = `Bearer ${GENARCH_API_KEY}`;
  }

  return headers;
}

/**
 * Proxy request to RunPod
 */
async function proxyToRunPod(method, path, res) {
  if (!RUNPOD_GENARCH_URL) {
    return res.status(503).json({
      success: false,
      error: "RUNPOD_NOT_CONFIGURED",
      message: "RUNPOD_GENARCH_URL environment variable is not set.",
    });
  }

  const url = `${RUNPOD_GENARCH_URL}${path}`;
  console.log(`[Genarch Proxy] ${method} ${url}`);

  try {
    const response = await fetch(url, {
      method,
      headers: buildHeaders(),
    });

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      const text = await response.text();
      return res.status(response.status).json({
        success: false,
        error: "UPSTREAM_ERROR",
        message: text || `HTTP ${response.status}`,
      });
    }

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (error) {
    console.error("[Genarch Proxy] Error:", error.message);

    return res.status(503).json({
      success: false,
      error: "RUNPOD_UNAVAILABLE",
      message: "Could not connect to RunPod genarch service.",
      details: error.message,
    });
  }
}

export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const { jobId } = req.query;

  if (!jobId) {
    return res.status(400).json({
      success: false,
      error: "MISSING_JOB_ID",
      message: "Job ID is required",
    });
  }

  // Route: GET /api/genarch/jobs/:jobId - Get job status
  if (req.method === "GET") {
    return proxyToRunPod("GET", `/api/genarch/jobs/${jobId}`, res);
  }

  // Route: DELETE /api/genarch/jobs/:jobId - Cancel job
  if (req.method === "DELETE") {
    return proxyToRunPod("DELETE", `/api/genarch/jobs/${jobId}`, res);
  }

  // Method not allowed
  return res.status(405).json({
    success: false,
    error: "METHOD_NOT_ALLOWED",
    message: `Method ${req.method} not allowed on /api/genarch/jobs/:jobId`,
  });
}
