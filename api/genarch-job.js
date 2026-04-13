/**
 * Genarch Pipeline Job API - Vercel Serverless Function
 *
 * NOTE: This is a simplified endpoint for Vercel deployment.
 * For production use with long-running jobs, use the Express server (server.cjs).
 *
 * In development mode, this proxies to the Express server.
 * In production (Vercel), this returns an error since genarch requires
 * Python and long-running processes that exceed serverless limits.
 *
 * For production deployment of genarch:
 * - Deploy genarch as a separate Python service (Cloud Run, EC2, etc.)
 * - Or use a queue-based architecture (SQS, Cloud Tasks)
 */

import { setCorsHeaders, handlePreflight } from "./_shared/cors.js";

export default async function handler(req, res) {
  if (handlePreflight(req, res, { methods: "GET, POST, DELETE, OPTIONS" }))
    return;
  setCorsHeaders(req, res, { methods: "GET, POST, DELETE, OPTIONS" });

  // Check if we're in development mode
  const isDev =
    process.env.NODE_ENV !== "production" && process.env.VERCEL !== "1";

  if (!isDev) {
    // Production (Vercel) - Cannot run genarch pipeline
    return res.status(501).json({
      success: false,
      error: "NOT_IMPLEMENTED_IN_SERVERLESS",
      message:
        "The genarch pipeline requires Python and cannot run in Vercel serverless functions.",
      hint: "For development, use npm run server to start the Express server. For production, deploy genarch as a separate Python service.",
      documentation: "See docs/GENARCH_SETUP.md for deployment options.",
    });
  }

  // Development mode - Proxy to Express server
  const EXPRESS_URL = process.env.EXPRESS_SERVER_URL || "http://localhost:3001";

  try {
    // Build the proxy URL
    const { jobId } = req.query;
    let url = `${EXPRESS_URL}/api/genarch/jobs`;

    if (jobId) {
      url = `${EXPRESS_URL}/api/genarch/jobs/${jobId}`;
    }

    // Forward the request
    const fetchOptions = {
      method: req.method,
      headers: {
        "Content-Type": "application/json",
      },
    };

    if (req.method === "POST" && req.body) {
      fetchOptions.body = JSON.stringify(req.body);
    }

    const response = await fetch(url, fetchOptions);
    const data = await response.json();

    return res.status(response.status).json(data);
  } catch (error) {
    console.error("[Genarch Proxy] Error:", error.message);

    return res.status(503).json({
      success: false,
      error: "EXPRESS_SERVER_UNAVAILABLE",
      message:
        "Could not connect to Express server. Run npm run server to start it.",
      details: error.message,
    });
  }
}
