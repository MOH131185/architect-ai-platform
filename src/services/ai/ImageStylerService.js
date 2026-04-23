/**
 * ImageStylerService
 *
 * Handles geometry-locked image-edit stylization for 3D presentation panels.
 * Technical drawings must never route through image models.
 *
 * @module services/ai/ImageStylerService
 */

import { isFeatureEnabled } from "../../config/featureFlags.js";
import logger from "../../utils/logger.js";

const MODEL_CONFIGS = {
  "gpt-image-1.5": {
    provider: "openai",
    apiModelId: "gpt-image-1.5",
    endpoint: "/api/openai-image-stylize",
    supportsEdit: true,
    maxWidth: 1024,
    maxHeight: 1024,
    supportedSizes: ["1024x1024", "512x512", "256x256"],
    supportedFormats: ["png"],
    defaultStyle: "vivid",
    deprecated: false,
    notes: "Recommended geometry-locked image-edit model.",
  },
  "dall-e-2": {
    provider: "openai",
    apiModelId: "dall-e-2",
    endpoint: "/api/openai-image-stylize",
    supportsEdit: true,
    maxWidth: 1024,
    maxHeight: 1024,
    supportedSizes: ["1024x1024", "512x512", "256x256"],
    supportedFormats: ["png"],
    defaultStyle: "natural",
    deprecated: true,
    deprecationDate: "2025-12-01",
    notes: "Legacy edit-capable fallback.",
  },
  "flux.1-dev": {
    provider: "together",
    apiModelId: "black-forest-labs/FLUX.1-schnell",
    endpoint: "/api/together-image",
    supportsEdit: false,
    maxWidth: 1792,
    maxHeight: 1792,
    supportedFormats: ["png"],
    stepsMapping: { low: 4, medium: 30, high: 50 },
    deprecated: false,
    notes: "Generation-only fallback. Not allowed for geometry-locked styling.",
  },
};

const STYLED_PANEL_TYPES = ["hero_3d", "interior_3d", "axonometric"];

const GEOMETRY_LOCK = Object.freeze({
  silhouette: true,
  roofLines: true,
  openings: true,
  massing: true,
});

function normalizeHashValue(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeSourceMetadata(sourceMetadata = {}, panelType, geometryHash) {
  const normalizedGeometryHash =
    normalizeHashValue(geometryHash) ||
    normalizeHashValue(sourceMetadata.geometryHash) ||
    null;

  return {
    authority: sourceMetadata.authority || "compiled_geometry",
    authorityType: sourceMetadata.authorityType || null,
    sourceType: sourceMetadata.sourceType || null,
    panelType: sourceMetadata.panelType || panelType,
    geometryHash: normalizedGeometryHash,
    cdsHash: normalizeHashValue(sourceMetadata.cdsHash) || null,
    designFingerprint: sourceMetadata.designFingerprint || null,
    projectId: sourceMetadata.projectId || null,
    compiledProjectId:
      sourceMetadata.compiledProjectId || sourceMetadata.projectId || null,
    deterministic: sourceMetadata.deterministic !== false,
    canonicalGeometry: sourceMetadata.canonicalGeometry !== false,
  };
}

function assertGeometryLockedInput({
  panelType,
  controlImage,
  sourceMetadata,
}) {
  if (!STYLED_PANEL_TYPES.includes(panelType)) {
    throw new Error(
      `ImageStylerService only supports ${STYLED_PANEL_TYPES.join(", ")}, got: ${panelType}`,
    );
  }
  if (!controlImage) {
    throw new Error(
      `ImageStylerService requires a fixed geometry render for ${panelType}; generation-only stylization is not allowed`,
    );
  }
  if (!sourceMetadata?.geometryHash) {
    throw new Error(
      `ImageStylerService requires geometryHash metadata for ${panelType}`,
    );
  }
  if (!sourceMetadata?.authorityType) {
    throw new Error(
      `ImageStylerService requires authorityType metadata for ${panelType}`,
    );
  }
  if (!sourceMetadata?.sourceType) {
    throw new Error(
      `ImageStylerService requires sourceType metadata for ${panelType}`,
    );
  }
}

export class ImageStylerService {
  constructor(options = {}) {
    this.defaultModel = options.model || "gpt-image-1.5";
    this.fallbackModel = options.fallback || "dall-e-2";
    this.apiBaseUrl = options.apiBaseUrl || "";
  }

  getModelConfig(modelName) {
    const cleanName = modelName.includes("/")
      ? modelName.split("/").pop()
      : modelName;
    return MODEL_CONFIGS[cleanName] || null;
  }

  listModels() {
    return Object.entries(MODEL_CONFIGS).map(([name, config]) => ({
      name,
      provider: config.provider,
      supportsEdit: config.supportsEdit,
      deprecated: config.deprecated,
      notes: config.notes,
    }));
  }

  isValidPanelType(panelType) {
    return STYLED_PANEL_TYPES.includes(panelType);
  }

  async generateStyledRender(params) {
    const {
      panelType,
      controlImage,
      stylePrompt,
      dna,
      sourceMetadata: rawSourceMetadata = {},
      geometryHash = null,
      options = {},
    } = params;

    if (!isFeatureEnabled("openaiStyler")) {
      logger.info("[ImageStyler] OpenAI styler disabled");
      return {
        success: false,
        reason: "feature_disabled",
        message:
          "OpenAI styling is disabled. Enable openaiStyler feature flag.",
      };
    }

    const sourceMetadata = normalizeSourceMetadata(
      rawSourceMetadata,
      panelType,
      geometryHash,
    );
    assertGeometryLockedInput({
      panelType,
      controlImage,
      sourceMetadata,
    });

    const model = options.model || this.defaultModel;
    const config = this.getModelConfig(model);
    if (!config) {
      throw new Error(`Unknown model: ${model}`);
    }
    if (!config.supportsEdit) {
      throw new Error(
        `${model} does not support image edit and cannot preserve authoritative geometry`,
      );
    }

    if (config.deprecated) {
      logger.warn(
        `[ImageStyler] Using deprecated model ${model}; prefer ${this.defaultModel}`,
      );
    }

    const fullPrompt = this.buildStyledPrompt(panelType, stylePrompt, dna);
    logger.info(
      `[ImageStyler] Geometry-locked image edit for ${panelType} with ${model}`,
    );

    try {
      const result = await this.callModel(model, config, {
        prompt: fullPrompt,
        controlImage,
        panelType,
        width: options.width || this.getDefaultWidth(panelType, config),
        height: options.height || this.getDefaultHeight(panelType, config),
        strength: options.strength || "medium",
        style: options.style || config.defaultStyle,
        geometryLock: GEOMETRY_LOCK,
      });

      return {
        success: true,
        imageUrl: result.url,
        buffer: result.buffer,
        model,
        panelType,
        geometryHash: sourceMetadata.geometryHash,
        sourceMetadata,
        geometryPreserved: result.geometryPreserved === true,
        metadata: {
          prompt: fullPrompt,
          revisedPrompt: result.revisedPrompt,
          timestamp: new Date().toISOString(),
          config: { width: result.width, height: result.height },
          mode: result.mode || "edit",
          sourceMetadata,
          geometryHash: sourceMetadata.geometryHash,
          geometryLock: GEOMETRY_LOCK,
          pipeline: "image_edit_locked",
        },
      };
    } catch (error) {
      logger.error(`[ImageStyler] ${model} failed: ${error.message}`);

      const fallbackConfig =
        model !== this.fallbackModel
          ? this.getModelConfig(this.fallbackModel)
          : null;
      if (fallbackConfig?.supportsEdit) {
        logger.warn(
          `[ImageStyler] Retrying with edit-capable fallback ${this.fallbackModel}`,
        );
        return this.generateStyledRender({
          ...params,
          sourceMetadata,
          geometryHash: sourceMetadata.geometryHash,
          options: { ...options, model: this.fallbackModel },
        });
      }

      return {
        success: false,
        error: error.message,
        model,
        panelType,
        geometryHash: sourceMetadata.geometryHash,
        sourceMetadata,
      };
    }
  }

  getDefaultWidth(panelType, config) {
    if (config.supportsEdit) {
      return Math.min(1024, config.maxWidth);
    }
    return panelType === "hero_3d" || panelType === "interior_3d"
      ? Math.min(1792, config.maxWidth)
      : 1024;
  }

  getDefaultHeight(panelType, config) {
    if (config.supportsEdit) {
      return Math.min(1024, config.maxHeight);
    }
    return panelType === "hero_3d" || panelType === "interior_3d"
      ? Math.min(1024, config.maxHeight)
      : 1024;
  }

  buildStyledPrompt(panelType, basePrompt, dna) {
    const style = dna?.style || {};
    const materials = style.materials || [];
    const architecture = style.architecture || style.style || "contemporary";
    const dimensions = dna?.dimensions || {};

    const materialDesc = materials
      .slice(0, 3)
      .map((material) => material.name || material.material)
      .filter(Boolean)
      .join(", ");

    const colorDesc = materials
      .slice(0, 2)
      .map((material) => material.hexColor || material.color)
      .filter(Boolean)
      .join(" and ");

    const floors = dna?.program?.floors || dimensions.floors || 2;
    const buildingType = dna?.program?.buildingType || "residential";
    const geometryLockInstruction =
      "Image-edit only on the supplied geometry render. Do not alter silhouette, roof lines, openings, massing, floor count, or framing.";

    if (panelType === "hero_3d") {
      return [
        basePrompt || "Photorealistic architectural exterior visualization",
        `${architecture} style ${buildingType} building`,
        `${floors}-story structure`,
        materialDesc ? `materials: ${materialDesc}` : "",
        colorDesc ? `palette: ${colorDesc}` : "",
        "professional architectural photography",
        "natural daylight",
        geometryLockInstruction,
      ]
        .filter(Boolean)
        .join(", ");
    }

    if (panelType === "interior_3d") {
      return [
        basePrompt || "Photorealistic architectural interior visualization",
        `${architecture} style interior`,
        materialDesc ? `finishes: ${materialDesc}` : "",
        colorDesc ? `accent palette: ${colorDesc}` : "",
        "editorial interior photography",
        geometryLockInstruction,
      ]
        .filter(Boolean)
        .join(", ");
    }

    return [
      basePrompt || "Architectural axonometric presentation render",
      `${architecture} style ${buildingType} building`,
      materialDesc ? `materials: ${materialDesc}` : "",
      geometryLockInstruction,
    ]
      .filter(Boolean)
      .join(", ");
  }

  async callModel(model, config, params) {
    if (config.provider === "openai") {
      return this.callOpenAI(config, params);
    }

    if (config.provider === "together") {
      return this.callTogether(config, params);
    }

    throw new Error(`Unknown provider: ${config.provider}`);
  }

  async callOpenAI(config, params) {
    const { prompt, controlImage, width, height, style, panelType } = params;

    let size = "1024x1024";
    if (!config.supportsEdit) {
      if (width > height * 1.2) {
        size = "1792x1024";
      } else if (height > width * 1.2) {
        size = "1024x1792";
      }
    }

    const requestBody = {
      prompt,
      size,
      style: style || "vivid",
      model: config.apiModelId,
      response_format: "url",
      panelType,
      mode: "edit",
    };

    if (Buffer.isBuffer(controlImage)) {
      requestBody.image = controlImage.toString("base64");
    } else if (typeof controlImage === "string") {
      requestBody.image = controlImage.startsWith("data:")
        ? controlImage.split(",")[1]
        : controlImage;
    } else {
      throw new Error(
        "controlImage is required for geometry-locked image edit",
      );
    }

    const response = await fetch(`${this.apiBaseUrl}${config.endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ message: response.statusText }));
      throw new Error(error.message || `OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const imageData = data.images?.[0] || data.data?.[0] || {};

    return {
      url: imageData.url,
      revisedPrompt: imageData.revised_prompt,
      width: parseInt(size.split("x")[0], 10),
      height: parseInt(size.split("x")[1], 10),
      buffer: imageData.b64_json
        ? Buffer.from(imageData.b64_json, "base64")
        : null,
      mode: data.mode || "edit",
      geometryPreserved: data.geometryPreserved !== false,
    };
  }

  async callTogether(config, params) {
    if (params.geometryLock) {
      throw new Error(
        `${config.apiModelId} is generation-only and cannot be used for geometry-locked edits`,
      );
    }

    const { prompt, width, height, strength } = params;
    const steps = config.stepsMapping?.[strength] || 30;

    const response = await fetch(`${this.apiBaseUrl}${config.endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        width: Math.min(width, config.maxWidth),
        height: Math.min(height, config.maxHeight),
        steps,
        model: config.apiModelId,
      }),
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ message: response.statusText }));
      throw new Error(
        error.message || `Together API error: ${response.status}`,
      );
    }

    const data = await response.json();
    return {
      url: data.data?.[0]?.url || data.output?.[0] || null,
      width: Math.min(width, config.maxWidth),
      height: Math.min(height, config.maxHeight),
      buffer: null,
      mode: "generation",
      geometryPreserved: false,
    };
  }
}

export const imageStylerService = new ImageStylerService();

export default ImageStylerService;
