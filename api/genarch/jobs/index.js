/**
 * Genarch Jobs API - Vercel Serverless Proxy
 *
 * Routes:
 * - POST /api/genarch/jobs - Create a new job
 * - GET /api/genarch/jobs - List all jobs
 *
 * This proxies requests to the RunPod backend, adding the API key server-side.
 * The GENARCH_API_KEY is never exposed to the browser.
 */

// Environment variables
const RUNPOD_GENARCH_URL = process.env.RUNPOD_GENARCH_URL; // e.g., https://genarch.yourdomain.com
const GENARCH_API_KEY = process.env.GENARCH_API_KEY;

/**
 * Build headers for RunPod request
 */
function buildHeaders(contentType = null) {
  const headers = {};

  if (contentType) {
    headers["Content-Type"] = contentType;
  }

  if (GENARCH_API_KEY) {
    headers["Authorization"] = `Bearer ${GENARCH_API_KEY}`;
  }

  return headers;
}

/**
 * Proxy request to RunPod
 */
async function proxyToRunPod(method, path, body = null, res) {
  if (!RUNPOD_GENARCH_URL) {
    return res.status(503).json({
      success: false,
      error: "RUNPOD_NOT_CONFIGURED",
      message: "RUNPOD_GENARCH_URL environment variable is not set.",
      hint: "Set RUNPOD_GENARCH_URL in Vercel environment variables.",
    });
  }

  const url = `${RUNPOD_GENARCH_URL}${path}`;
  console.log(`[Genarch Proxy] ${method} ${url}`);

  try {
    const fetchOptions = {
      method,
      headers: buildHeaders(body ? "application/json" : null),
    };

    if (body) {
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(url, fetchOptions);

    // Handle non-JSON responses (e.g., errors)
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
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Route: POST /api/genarch/jobs - Create job
  if (req.method === "POST") {
    return proxyToRunPod("POST", "/api/genarch/jobs", req.body, res);
  }

  // Route: GET /api/genarch/jobs - List jobs
  if (req.method === "GET") {
    const { status } = req.query;
    const path = status
      ? `/api/genarch/jobs?status=${status}`
      : "/api/genarch/jobs";
    return proxyToRunPod("GET", path, null, res);
  }

  // Method not allowed
  return res.status(405).json({
    success: false,
    error: "METHOD_NOT_ALLOWED",
    message: `Method ${req.method} not allowed on /api/genarch/jobs`,
  });
}
