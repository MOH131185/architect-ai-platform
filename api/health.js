/**
 * Health Check API - Vercel Serverless Function
 *
 * Simple health check endpoint to verify the API is running.
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

  const runpodUrl = process.env.RUNPOD_GENARCH_URL;
  const hasGenarchKey = !!process.env.GENARCH_API_KEY;

  return res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    environment: process.env.VERCEL === "1" ? "vercel" : "development",
    services: {
      genarch: {
        configured: !!runpodUrl,
        hasApiKey: hasGenarchKey,
        endpoint: runpodUrl ? `${runpodUrl}/health` : null,
      },
      together: {
        configured: !!process.env.TOGETHER_API_KEY,
      },
      openai: {
        configured: !!process.env.OPENAI_API_KEY,
      },
    },
  });
}
