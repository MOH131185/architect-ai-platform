/**
 * Vercel AI Gateway - Chat Completions Proxy
 *
 * Routes chat/reasoning requests through Vercel AI Gateway.
 * Uses OpenAI-compatible API endpoint.
 *
 * Environment Variables:
 * - AI_GATEWAY_API_KEY: Vercel AI Gateway API key
 *
 * Model Mapping:
 * - Qwen 2.5 72B → alibaba/qwen3-235b-a22b-instruct (or closest available)
 * - Defaults to high-capability model for architectural reasoning
 */

const AI_GATEWAY_BASE_URL = "https://ai-gateway.vercel.sh/v1";

// Model mapping from Together.ai to AI Gateway equivalents
const MODEL_MAPPING = {
  "meta-llama/Llama-3.3-70B-Instruct-Turbo": "alibaba/qwen3-235b-a22b-instruct",
  "Qwen/Qwen2.5-72B-Instruct": "alibaba/qwen3-235b-a22b-instruct",
  "meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo":
    "meta/llama-3.3-70b-instruct",
  // Fallback to a strong general model
  default: "anthropic/claude-sonnet-4.5",
};

export default async function handler(req, res) {
  // Handle OPTIONS for CORS preflight
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization",
    );
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

  const aiGatewayApiKey = process.env.AI_GATEWAY_API_KEY;

  if (!aiGatewayApiKey) {
    console.error(
      "AI_GATEWAY_API_KEY not configured in Vercel environment variables",
    );
    return res.status(500).json({
      error: {
        code: "API_KEY_MISSING",
        message: "Vercel AI Gateway API key not configured",
        details: null,
      },
    });
  }

  try {
    const {
      model,
      messages,
      max_tokens,
      temperature,
      top_p,
      deterministicMode = false,
    } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({
        error: {
          code: "INVALID_INPUT",
          message: "Messages array is required",
          details: { received: typeof messages },
        },
      });
    }

    // Map model to AI Gateway equivalent
    const requestedModel = model || "meta-llama/Llama-3.3-70B-Instruct-Turbo";
    const gatewayModel =
      MODEL_MAPPING[requestedModel] || MODEL_MAPPING["default"];

    // Deterministic defaults for DNA generation and reasoning
    const effectiveTemperature = deterministicMode
      ? 0.1
      : temperature !== undefined
        ? temperature
        : 0.7;
    const effectiveTopP = deterministicMode ? 0.9 : top_p || 0.7;
    const effectiveMaxTokens = max_tokens || 2000;

    console.log(
      `🌐 [AI Gateway] Chat: ${gatewayModel} (from: ${requestedModel}, deterministic: ${deterministicMode})`,
    );

    const startTime = Date.now();
    const traceId = `aigateway_${startTime}_${Math.random().toString(36).substring(2, 9)}`;

    // Use OpenAI-compatible endpoint
    const response = await fetch(`${AI_GATEWAY_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${aiGatewayApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: gatewayModel,
        messages,
        max_tokens: effectiveMaxTokens,
        temperature: effectiveTemperature,
        top_p: effectiveTopP,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("❌ AI Gateway chat error:", data);
      return res.status(response.status).json({
        error: {
          code: "AI_GATEWAY_ERROR",
          message: data.error?.message || "AI Gateway request failed",
          details: data,
        },
      });
    }

    const latencyMs = Date.now() - startTime;
    console.log(`✅ [AI Gateway] Chat successful (${latencyMs}ms)`);

    // Normalize response structure (same format as together-chat.js)
    const normalizedResponse = {
      content: data.choices?.[0]?.message?.content || "",
      model: gatewayModel,
      originalModel: requestedModel,
      provider: "vercel-ai-gateway",
      usage: data.usage || {},
      latencyMs,
      traceId,
      deterministicMode,
      settings: {
        temperature: effectiveTemperature,
        topP: effectiveTopP,
        maxTokens: effectiveMaxTokens,
      },
      raw: data,
    };

    // Set CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization",
    );

    res.status(200).json(normalizedResponse);
  } catch (error) {
    console.error("AI Gateway chat proxy error:", error);
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: error.message,
        details: null,
      },
    });
  }
}
