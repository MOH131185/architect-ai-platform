/**
 * Health Check API Endpoint
 *
 * Returns the health status of the API and configured services.
 */

export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const health = {
    status: "ok",
    timestamp: new Date().toISOString(),
    services: {
      together: !!process.env.TOGETHER_API_KEY,
      openai: !!process.env.OPENAI_REASONING_API_KEY,
      genarch:
        !!process.env.RUNPOD_GENARCH_URL && !!process.env.GENARCH_API_KEY,
    },
    env: {
      RUNPOD_GENARCH_URL: process.env.RUNPOD_GENARCH_URL
        ? "configured"
        : "missing",
      GENARCH_API_KEY: process.env.GENARCH_API_KEY ? "configured" : "missing",
    },
  };

  return res.status(200).json(health);
}
