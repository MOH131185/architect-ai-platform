/**
 * Genarch Pipeline Job API - Vercel Serverless Function
 *
 * Proxies requests to the genarch service running on RunPod.
 * Configuration:
 *   - RUNPOD_GENARCH_URL: Base URL of the RunPod genarch service
 *   - GENARCH_API_KEY: API key for authenticating with genarch service
 */

export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const RUNPOD_URL = process.env.RUNPOD_GENARCH_URL;
  const GENARCH_KEY = process.env.GENARCH_API_KEY;

  // Check if RunPod is configured
  if (!RUNPOD_URL) {
    return res.status(503).json({
      success: false,
      error: "GENARCH_NOT_CONFIGURED",
      message:
        "The genarch service is not configured. Set RUNPOD_GENARCH_URL environment variable.",
      hint: "Deploy genarch to RunPod and configure the URL in Vercel environment variables.",
    });
  }

  try {
    // Build the proxy URL
    const { jobId } = req.query;
    let url = `${RUNPOD_URL}/api/genarch/jobs`;

    if (jobId) {
      url = `${RUNPOD_URL}/api/genarch/jobs/${jobId}`;
    }

    // Forward the request with authentication
    const headers = {
      "Content-Type": "application/json",
    };

    if (GENARCH_KEY) {
      headers["Authorization"] = `Bearer ${GENARCH_KEY}`;
    }

    const fetchOptions = {
      method: req.method,
      headers,
    };

    if (req.method === "POST" && req.body) {
      fetchOptions.body = JSON.stringify(req.body);
    }

    console.log(`[Genarch Proxy] ${req.method} ${url}`);
    const response = await fetch(url, fetchOptions);

    // Handle non-JSON responses
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      const data = await response.json();
      return res.status(response.status).json(data);
    } else {
      const text = await response.text();
      return res.status(response.status).send(text);
    }
  } catch (error) {
    console.error("[Genarch Proxy] Error:", error.message);

    return res.status(503).json({
      success: false,
      error: "GENARCH_SERVICE_UNAVAILABLE",
      message: "Could not connect to the genarch service on RunPod.",
      details: error.message,
      hint: "Check that the RunPod pod is running and the URL is correct.",
    });
  }
}
