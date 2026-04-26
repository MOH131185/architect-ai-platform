/**
 * OpenAI image stylization endpoint.
 *
 * Presentation-only image support for geometry-derived renders. The endpoint
 * uses OpenAI keys/models from `.env` / Vercel variables and fails closed if
 * they are missing. It must not silently redirect to FLUX/Together because
 * the production plan makes ProjectGraph the geometry authority and uses image
 * models only for optional visual enhancement.
 */

export const runtime = "nodejs";
export const config = {
  runtime: "nodejs",
  maxDuration: 120,
};

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
  const allowed = new Set(["1024x1024", "512x512", "256x256"]);
  return allowed.has(size) ? size : "1024x1024";
}

function base64ToBlob(value) {
  const clean = String(value || "").replace(
    /^data:image\/[a-zA-Z+.-]+;base64,/,
    "",
  );
  const bytes = Buffer.from(clean, "base64");
  return new Blob([bytes], { type: "image/png" });
}

function createEditFormData({ image, mask, prompt, size, model }) {
  const form = new FormData();
  form.append("image", base64ToBlob(image), "input.png");
  if (mask) {
    form.append("mask", base64ToBlob(mask), "mask.png");
  }
  form.append("prompt", prompt);
  form.append("n", "1");
  form.append("size", size);
  form.append("model", model);
  return form;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "METHOD_NOT_ALLOWED",
      message: "Only POST requests are supported",
    });
  }

  const {
    prompt,
    image,
    mask,
    size = "1024x1024",
    model,
    panelType,
  } = req.body || {};

  if (!prompt || !String(prompt).trim()) {
    return res.status(400).json({
      error: "MISSING_PROMPT",
      message: "Prompt is required for image stylization",
    });
  }

  const validPanelTypes = ["hero_3d", "interior_3d", "axonometric"];
  if (panelType && !validPanelTypes.includes(panelType)) {
    return res.status(400).json({
      error: "INVALID_PANEL_TYPE",
      message: `Panel type must be one of: ${validPanelTypes.join(", ")}`,
      provided: panelType,
    });
  }

  const apiKey = getOpenAIImageApiKey();
  if (!apiKey) {
    return res.status(503).json({
      error: "OPENAI_IMAGE_API_KEY_MISSING",
      message:
        "Set OPENAI_IMAGES_API_KEY or OPENAI_API_KEY. This endpoint does not fall back to FLUX.",
    });
  }

  const resolvedModel = getOpenAIImageModel(model);
  const resolvedSize = normalizeSize(size);
  const useEdit = Boolean(image);

  try {
    const response = useEdit
      ? await fetch("https://api.openai.com/v1/images/edits", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: createEditFormData({
            image,
            mask,
            prompt,
            size: resolvedSize,
            model: resolvedModel,
          }),
        })
      : await fetch("https://api.openai.com/v1/images/generations", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: resolvedModel,
            prompt,
            n: 1,
            size: resolvedSize,
          }),
        });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return res.status(response.status).json({
        error: "OPENAI_IMAGE_API_ERROR",
        message:
          data.error?.message ||
          `OpenAI image endpoint failed: ${response.status}`,
      });
    }

    const imageData = data.data?.[0];
    if (!imageData) {
      return res.status(502).json({
        error: "OPENAI_IMAGE_EMPTY_RESPONSE",
        message: "OpenAI did not return an image.",
      });
    }

    return res.status(200).json({
      images: [
        {
          url: imageData.url,
          b64_json: imageData.b64_json,
          revised_prompt: imageData.revised_prompt || prompt,
        },
      ],
      provider: "openai",
      model: resolvedModel,
      size: resolvedSize,
      mode: useEdit ? "edit" : "generation",
      geometryPreserved: useEdit,
      panelType,
    });
  } catch (error) {
    return res.status(500).json({
      error: "OPENAI_IMAGE_INTERNAL_ERROR",
      message: error.message || "OpenAI image stylization failed.",
    });
  }
}
