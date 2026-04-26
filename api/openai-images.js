/**
 * OpenAI image generation endpoint.
 *
 * This endpoint intentionally uses the OpenAI image model configured in
 * `.env` / Vercel environment variables. It does not redirect to FLUX or any
 * unrelated provider; technical drawings remain deterministic ProjectGraph
 * projections, and image generation is presentation support only.
 */

import { setCorsHeaders, handlePreflight } from "./_shared/cors.js";

function getOpenAIImageApiKey() {
  return (
    process.env.OPENAI_IMAGES_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.OPENAI_REASONING_API_KEY ||
    ""
  ).trim();
}

function getOpenAIImageModel(requestModel) {
  return (
    requestModel ||
    process.env.STEP_10_IMAGE_MODEL ||
    process.env.OPENAI_IMAGE_MODEL ||
    "gpt-image-2"
  );
}

function normalizeSize(size) {
  const allowed = new Set([
    "256x256",
    "512x512",
    "1024x1024",
    "1536x1024",
    "1024x1536",
    "1792x1024",
    "1024x1792",
  ]);
  return allowed.has(size) ? size : "1024x1024";
}

export default async function handler(req, res) {
  if (handlePreflight(req, res, { methods: "POST, OPTIONS" })) return;
  setCorsHeaders(req, res, { methods: "POST, OPTIONS" });

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  const apiKey = getOpenAIImageApiKey();
  if (!apiKey) {
    return res.status(500).json({
      error: "OPENAI_IMAGE_API_KEY_MISSING",
      message:
        "Set OPENAI_IMAGES_API_KEY or OPENAI_API_KEY in the production environment.",
    });
  }

  const { prompt, size = "1024x1024", model, n = 1 } = req.body || {};
  if (!prompt || !String(prompt).trim()) {
    return res.status(400).json({ error: "Prompt is required" });
  }

  const resolvedModel = getOpenAIImageModel(model);
  const resolvedSize = normalizeSize(size);

  try {
    const response = await fetch(
      "https://api.openai.com/v1/images/generations",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: resolvedModel,
          prompt,
          size: resolvedSize,
          n: Math.max(1, Math.min(Number(n) || 1, 4)),
        }),
      },
    );

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return res.status(response.status).json({
        error: "OPENAI_IMAGE_GENERATION_FAILED",
        message:
          data.error?.message ||
          `OpenAI image generation failed: ${response.status}`,
      });
    }

    const images = (data.data || []).map((entry) => ({
      url: entry.url,
      b64_json: entry.b64_json,
      revised_prompt: entry.revised_prompt || prompt,
    }));

    if (!images.length) {
      return res.status(502).json({
        error: "OPENAI_IMAGE_EMPTY_RESPONSE",
        message: "OpenAI did not return any image data.",
      });
    }

    return res.status(200).json({
      images,
      model: resolvedModel,
      size: resolvedSize,
      provider: "openai",
    });
  } catch (error) {
    return res.status(500).json({
      error: "OPENAI_IMAGE_INTERNAL_ERROR",
      message: error.message || "OpenAI image generation failed.",
    });
  }
}
