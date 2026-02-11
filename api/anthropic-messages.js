/**
 * Vercel Serverless Function for Anthropic Claude API Messages
 *
 * Proxies requests to the Anthropic Messages API.
 * Used by the AI floor plan layout engine for structured JSON generation
 * via Claude Sonnet with tool_choice.
 */

export default async function handler(req, res) {
  // Handle OPTIONS for CORS preflight
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(200).end();
  }

  // Only allow POST requests
  if (req.method !== "POST") {
    return res.status(405).json({
      error: {
        code: "METHOD_NOT_ALLOWED",
        message: "Method not allowed. Use POST.",
        details: null,
      },
    });
  }

  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;

  if (!anthropicApiKey) {
    console.error(
      "ANTHROPIC_API_KEY not configured in Vercel environment variables",
    );
    return res.status(500).json({
      error: {
        code: "API_KEY_MISSING",
        message: "Anthropic API key not configured",
        details: null,
      },
    });
  }

  try {
    const startTime = Date.now();
    console.log(
      `🧠 [Anthropic] Messages request: ${req.body?.model || "unknown model"}`,
    );

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicApiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("❌ Anthropic API error:", data);
      const errorMsg =
        typeof data.error === "string"
          ? data.error
          : data.error?.message ||
            JSON.stringify(data.error) ||
            "Anthropic API request failed";
      return res.status(response.status).json({
        error: {
          code: "ANTHROPIC_API_ERROR",
          message: errorMsg,
          details: data,
        },
      });
    }

    const latencyMs = Date.now() - startTime;
    console.log(`✅ [Anthropic] Messages request successful (${latencyMs}ms)`);

    // Set CORS headers for browser requests
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    res.status(200).json(data);
  } catch (error) {
    console.error("Anthropic proxy error:", error);
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: error.message,
        details: null,
      },
    });
  }
}
