/**
 * ProjectGraph Image Renderer
 *
 * Server-side helper that converts a deterministic 3D control SVG (from the
 * compiled ProjectGraph — hero_3d, exterior_render, axonometric, interior_3d)
 * into a photoreal PNG by:
 *
 *   1. Rasterising the deterministic SVG to a PNG silhouette / massing
 *      reference (preserves geometry: footprint, opening positions, roof
 *      shape, storey count).
 *   2. Calling OpenAI's `/v1/images/edits` endpoint with the PNG as the
 *      reference image plus a climate + style + programme aware prompt
 *      (built by `panelPromptBuilders.js`).
 *   3. Returning the rendered PNG bytes plus provenance.
 *
 * The reference-image approach is critical: text-only prompts cannot
 * guarantee that the rendered building matches the deterministic plans,
 * elevations, and sections on the same A1 sheet. By anchoring on the
 * compiled-geometry silhouette, the generated render shares the SAME
 * geometry hash as every other panel.
 *
 * Pipeline mode gating: only runs when `PIPELINE_MODE=project_graph` (or
 * unset → default project_graph) AND `PROJECT_GRAPH_IMAGE_GEN_ENABLED=true`.
 * Falls back to the deterministic SVG cleanly when disabled or on failure.
 *
 * @module services/render/projectGraphImageRenderer
 */

import logger from "../../utils/logger.js";
import { rasteriseSvgToPng } from "./svgRasteriser.js";

const RENDERER_VERSION = "project-graph-image-renderer-v1";

const PANEL_TYPE_TO_SIZE = Object.freeze({
  hero_3d: "1536x1024",
  exterior_render: "1536x1024",
  axonometric: "1024x1024",
  interior_3d: "1280x1024",
});

const ALLOWED_OPENAI_SIZES = new Set([
  "256x256",
  "512x512",
  "1024x1024",
  "1024x1536",
  "1536x1024",
  "1024x1792",
  "1792x1024",
]);

function resolveImageGenEnabled() {
  const flag = String(process.env.PROJECT_GRAPH_IMAGE_GEN_ENABLED || "")
    .trim()
    .toLowerCase();
  return flag === "true" || flag === "1" || flag === "yes";
}

function resolveOpenAIApiKey() {
  return (
    process.env.OPENAI_IMAGES_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.OPENAI_REASONING_API_KEY ||
    ""
  ).trim();
}

function resolveImageModel() {
  return (
    process.env.STEP_10_IMAGE_MODEL ||
    process.env.OPENAI_IMAGE_MODEL ||
    "gpt-image-2"
  ).trim();
}

function resolveSize(panelType) {
  const target = PANEL_TYPE_TO_SIZE[panelType] || "1024x1024";
  return ALLOWED_OPENAI_SIZES.has(target) ? target : "1024x1024";
}

/**
 * Build a multipart/form-data body for the OpenAI images edit endpoint.
 * Uses the global FormData / Blob (Node 18+ supports both natively).
 */
function buildImageEditFormData({ imageBuffer, prompt, model, size }) {
  if (typeof FormData === "undefined" || typeof Blob === "undefined") {
    throw new Error(
      "FormData/Blob unavailable in this runtime; OpenAI images.edit requires Node 18+ or fetch polyfill.",
    );
  }
  const form = new FormData();
  form.set("model", model);
  form.set("prompt", prompt);
  form.set("size", size);
  form.set("n", "1");
  form.set(
    "image",
    new Blob([imageBuffer], { type: "image/png" }),
    "reference.png",
  );
  return form;
}

/**
 * Call OpenAI `/v1/images/edits` with the reference image + prompt and
 * return the rendered PNG bytes. Throws on non-200 or empty response so the
 * caller can fall back to the deterministic SVG.
 */
async function callOpenAIImageEdit({ imageBuffer, prompt, panelType }) {
  const apiKey = resolveOpenAIApiKey();
  if (!apiKey) {
    throw new Error("OPENAI_IMAGES_API_KEY (or OPENAI_API_KEY) is not set.");
  }
  const model = resolveImageModel();
  const size = resolveSize(panelType);
  const form = buildImageEditFormData({ imageBuffer, prompt, model, size });

  const response = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `OpenAI images.edit failed (${response.status}): ${data?.error?.message || "unknown"}`,
    );
  }

  const entry = (data.data || [])[0];
  if (!entry?.b64_json && !entry?.url) {
    throw new Error("OpenAI images.edit returned no image payload.");
  }

  let pngBuffer;
  if (entry.b64_json) {
    pngBuffer = Buffer.from(entry.b64_json, "base64");
  } else {
    const fetchResp = await fetch(entry.url);
    if (!fetchResp.ok) {
      throw new Error(
        `Failed to download generated image: ${fetchResp.status}`,
      );
    }
    const arrayBuffer = await fetchResp.arrayBuffer();
    pngBuffer = Buffer.from(arrayBuffer);
  }

  return {
    pngBuffer,
    model,
    size,
    revisedPrompt: entry.revised_prompt || null,
  };
}

/**
 * Render a single 3D panel (hero_3d / exterior_render / axonometric /
 * interior_3d) by anchoring an OpenAI image-edit call on the deterministic
 * ProjectGraph SVG silhouette.
 *
 * @param {object} args
 * @param {string} args.panelType                  - One of the 3D panel types.
 * @param {string} args.deterministicSvg           - Compiled-geometry control SVG.
 * @param {string} args.prompt                     - Climate+style+programme aware prompt.
 * @param {string} args.geometryHash               - For provenance.
 * @returns {Promise<{ pngBuffer: Buffer, provenance: object } | null>}
 *   Rendered PNG plus provenance, or null when image-gen is disabled / fails.
 */
export async function renderProjectGraphPanelImage({
  panelType,
  deterministicSvg,
  prompt,
  geometryHash,
} = {}) {
  if (!resolveImageGenEnabled()) {
    return null;
  }
  if (
    !panelType ||
    typeof deterministicSvg !== "string" ||
    !deterministicSvg.trim()
  ) {
    return null;
  }
  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    return null;
  }

  try {
    const { pngBuffer: referencePng } = await rasteriseSvgToPng({
      svg: deterministicSvg,
      densityDpi: 144,
      background: "#ffffff",
      provenance: {
        source: "compiled_3d_control_svg_reference",
        panelType,
        geometryHash,
      },
    });

    const result = await callOpenAIImageEdit({
      imageBuffer: referencePng,
      prompt,
      panelType,
    });

    return {
      pngBuffer: result.pngBuffer,
      provenance: {
        renderer: RENDERER_VERSION,
        panelType,
        model: result.model,
        size: result.size,
        revisedPrompt: result.revisedPrompt,
        sourceGeometryHash: geometryHash,
        referenceSource: "compiled_3d_control_svg",
      },
    };
  } catch (error) {
    logger.warn(
      `[projectGraphImageRenderer] ${panelType} render failed; falling back to deterministic SVG`,
      { error: error?.message || String(error) },
    );
    return null;
  }
}

export const __test = {
  resolveImageGenEnabled,
  resolveSize,
  resolveImageModel,
  PANEL_TYPE_TO_SIZE,
};
