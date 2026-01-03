/**
 * Genarch Artifacts API - Vercel Serverless Proxy
 *
 * Routes:
 * - GET /api/genarch/runs/:jobId/* - Download artifacts
 *
 * This proxies artifact requests to the RunPod backend.
 * Binary files (PDF, DXF, GLB) are streamed through.
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

export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "METHOD_NOT_ALLOWED",
      message: "Only GET requests are allowed for artifacts",
    });
  }

  if (!RUNPOD_GENARCH_URL) {
    return res.status(503).json({
      success: false,
      error: "RUNPOD_NOT_CONFIGURED",
      message: "RUNPOD_GENARCH_URL environment variable is not set.",
    });
  }

  // Extract path from catch-all params
  // params will be ['jobId', 'path', 'to', 'file.pdf']
  const { params } = req.query;

  if (!params || params.length < 2) {
    return res.status(400).json({
      success: false,
      error: "INVALID_PATH",
      message: "Path must include job ID and file path",
    });
  }

  const jobId = params[0];
  const filePath = params.slice(1).join("/");

  const url = `${RUNPOD_GENARCH_URL}/api/genarch/runs/${jobId}/${filePath}`;
  console.log(`[Genarch Proxy] GET ${url}`);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: buildHeaders(),
    });

    if (!response.ok) {
      // Try to parse as JSON error
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const data = await response.json();
        return res.status(response.status).json(data);
      }

      return res.status(response.status).json({
        success: false,
        error: "ARTIFACT_NOT_FOUND",
        message: `Could not fetch artifact: HTTP ${response.status}`,
      });
    }

    // Forward content-type and other relevant headers
    const contentType = response.headers.get("content-type");
    const contentDisposition = response.headers.get("content-disposition");
    const contentLength = response.headers.get("content-length");

    if (contentType) {
      res.setHeader("Content-Type", contentType);
    }
    if (contentDisposition) {
      res.setHeader("Content-Disposition", contentDisposition);
    }
    if (contentLength) {
      res.setHeader("Content-Length", contentLength);
    }

    // Cache artifacts for 1 hour
    res.setHeader("Cache-Control", "public, max-age=3600");

    // Stream the response body
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    return res.status(200).send(buffer);
  } catch (error) {
    console.error("[Genarch Proxy] Artifact error:", error.message);

    return res.status(503).json({
      success: false,
      error: "RUNPOD_UNAVAILABLE",
      message: "Could not fetch artifact from RunPod.",
      details: error.message,
    });
  }
}

// Vercel config: increase body size limit for artifact responses
export const config = {
  api: {
    responseLimit: "50mb",
  },
};
