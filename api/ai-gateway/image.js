/**
 * Vercel AI Gateway - Image Generation Proxy
 *
 * Routes image generation requests through Vercel AI Gateway.
 * Uses Black Forest Labs FLUX models via AI Gateway.
 *
 * Environment Variables:
 * - AI_GATEWAY_API_KEY: Vercel AI Gateway API key
 *
 * Model Mapping:
 * - FLUX.1-dev → bfl/flux-pro-1.1 (closest equivalent)
 * - FLUX.1-schnell → bfl/flux-kontext-pro (for faster generation)
 */

const AI_GATEWAY_BASE_URL = "https://ai-gateway.vercel.sh/v1";

// Model mapping from Together.ai FLUX to AI Gateway BFL models
const MODEL_MAPPING = {
  "black-forest-labs/FLUX.1-dev": "bfl/flux-pro-1.1",
  "black-forest-labs/FLUX.1-schnell": "bfl/flux-kontext-pro",
  "black-forest-labs/FLUX.1-kontext-max": "bfl/flux-kontext-max",
  default: "bfl/flux-pro-1.1",
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
    console.error("AI_GATEWAY_API_KEY not configured");
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
      prompt,
      width = 1024,
      height = 1024,
      steps,
      n = 1,
      seed,
      negative_prompt,
      guidance_scale,
      // img2img parameters (if supported)
      init_image,
      strength,
    } = req.body;

    if (!prompt) {
      return res.status(400).json({
        error: {
          code: "INVALID_INPUT",
          message: "Prompt is required",
          details: null,
        },
      });
    }

    // Map model to AI Gateway equivalent
    const requestedModel = model || "black-forest-labs/FLUX.1-dev";
    const gatewayModel =
      MODEL_MAPPING[requestedModel] || MODEL_MAPPING["default"];

    console.log(
      `🎨 [AI Gateway] Image: ${gatewayModel} (from: ${requestedModel}) ${width}x${height}`,
    );

    const startTime = Date.now();
    const traceId = `aigateway_img_${startTime}_${Math.random().toString(36).substring(2, 9)}`;

    // Build request body for AI Gateway image generation
    // Note: AI Gateway uses OpenAI-compatible images/generations endpoint
    const requestBody = {
      model: gatewayModel,
      prompt,
      n,
      size: `${width}x${height}`,
    };

    // Add optional parameters if provided
    if (seed !== undefined) {
      requestBody.seed = seed;
    }
    if (negative_prompt) {
      requestBody.negative_prompt = negative_prompt;
    }
    if (guidance_scale !== undefined) {
      requestBody.guidance_scale = guidance_scale;
    }
    if (steps !== undefined) {
      requestBody.steps = steps;
    }

    // img2img support (if available in AI Gateway)
    if (init_image) {
      requestBody.init_image = init_image;
      if (strength !== undefined) {
        requestBody.strength = strength;
      }
    }

    const response = await fetch(`${AI_GATEWAY_BASE_URL}/images/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${aiGatewayApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("❌ AI Gateway image error:", data);
      return res.status(response.status).json({
        error: {
          code: "AI_GATEWAY_ERROR",
          message: data.error?.message || "AI Gateway image generation failed",
          details: data,
        },
      });
    }

    const latencyMs = Date.now() - startTime;
    console.log(`✅ [AI Gateway] Image generated (${latencyMs}ms)`);

    // Normalize response structure (compatible with together-image.js format)
    const imageUrl = data.data?.[0]?.url || data.data?.[0]?.b64_json;

    const normalizedResponse = {
      success: true,
      imageUrl,
      imageBase64: data.data?.[0]?.b64_json || null,
      model: gatewayModel,
      originalModel: requestedModel,
      provider: "vercel-ai-gateway",
      width,
      height,
      seed: data.data?.[0]?.seed || seed,
      latencyMs,
      traceId,
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
    console.error("AI Gateway image proxy error:", error);
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: error.message,
        details: null,
      },
    });
  }
}
