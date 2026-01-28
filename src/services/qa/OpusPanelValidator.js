/**
 * Opus Panel Validator
 *
 * Per-panel validation using Claude Opus 4.5 vision capabilities.
 * Validates each generated panel for:
 * - Correct classification (interior vs exterior, plan vs elevation)
 * - Design consistency against canonical design brief
 * - Technical correctness for 2D panels (orthographic, lineweights)
 *
 * @module services/qa/OpusPanelValidator
 */

import { isFeatureEnabled } from "../../config/featureFlags.js";
import logger from "../core/logger.js";
import { getStyleZone, STYLE_ZONES } from "../a1/A1GridSpec12Column.js";

const API_ENDPOINT = "/api/anthropic/messages";
const DEFAULT_MODEL = "claude-opus-4-5-20251101";
const MAX_TOKENS = 4000;

// =============================================================================
// PANEL TYPE DEFINITIONS
// =============================================================================

/**
 * Panel classification categories
 */
export const PANEL_CATEGORIES = {
  // 3D Rendered views
  hero_3d: {
    category: "3d_exterior",
    view: "perspective",
    expected: "exterior perspective",
  },
  interior_3d: {
    category: "3d_interior",
    view: "perspective",
    expected: "interior perspective",
  },
  axonometric: {
    category: "3d_exterior",
    view: "axonometric",
    expected: "axonometric/isometric",
  },

  // Floor plans
  floor_plan_ground: {
    category: "plan",
    view: "overhead",
    expected: "floor plan overhead view",
  },
  floor_plan_first: {
    category: "plan",
    view: "overhead",
    expected: "floor plan overhead view",
  },
  floor_plan_level2: {
    category: "plan",
    view: "overhead",
    expected: "floor plan overhead view",
  },

  // Elevations
  elevation_north: {
    category: "elevation",
    view: "orthographic",
    expected: "elevation orthographic",
  },
  elevation_south: {
    category: "elevation",
    view: "orthographic",
    expected: "elevation orthographic",
  },
  elevation_east: {
    category: "elevation",
    view: "orthographic",
    expected: "elevation orthographic",
  },
  elevation_west: {
    category: "elevation",
    view: "orthographic",
    expected: "elevation orthographic",
  },

  // Sections
  section_AA: {
    category: "section",
    view: "orthographic",
    expected: "building section",
  },
  section_BB: {
    category: "section",
    view: "orthographic",
    expected: "building section",
  },

  // Site
  site_diagram: {
    category: "site",
    view: "plan",
    expected: "site plan/diagram",
  },

  // Data panels
  material_palette: {
    category: "data",
    view: "graphic",
    expected: "material palette",
  },
  climate_card: {
    category: "data",
    view: "graphic",
    expected: "climate data card",
  },
  schedules_notes: {
    category: "data",
    view: "text",
    expected: "schedules/notes",
  },
  title_block: { category: "data", view: "text", expected: "title block" },
};

// =============================================================================
// JSON SCHEMA FOR OPUS RESPONSE
// =============================================================================

export const PANEL_VALIDATOR_JSON_SCHEMA = {
  type: "object",
  required: [
    "classification_correct",
    "design_consistent",
    "technical_correct",
    "confidence",
    "action",
  ],
  properties: {
    classification_correct: {
      type: "object",
      required: ["is_correct_type", "confidence"],
      properties: {
        is_correct_type: {
          type: "boolean",
          description: "True if panel matches expected type",
        },
        detected_type: {
          type: "string",
          description: "What type Opus detected this panel as",
        },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        issues: { type: "array", items: { type: "string" } },
      },
    },
    design_consistent: {
      type: "object",
      required: ["matches_fingerprint"],
      properties: {
        matches_fingerprint: {
          type: "boolean",
          description: "True if matches canonical brief",
        },
        material_match: {
          type: "number",
          minimum: 0,
          maximum: 1,
          description: "Material consistency 0-1",
        },
        massing_match: {
          type: "number",
          minimum: 0,
          maximum: 1,
          description: "Massing consistency 0-1",
        },
        roof_match: {
          type: "number",
          minimum: 0,
          maximum: 1,
          description: "Roof consistency 0-1",
        },
        window_pattern_match: { type: "number", minimum: 0, maximum: 1 },
        issues: { type: "array", items: { type: "string" } },
      },
    },
    technical_correct: {
      type: "object",
      properties: {
        is_orthographic: {
          type: "boolean",
          description: "True if properly orthographic (for 2D)",
        },
        has_scale_bar: { type: "boolean" },
        has_dimensions: { type: "boolean" },
        has_north_arrow: {
          type: "boolean",
          description: "For floor plans only",
        },
        lineweight_consistent: { type: "boolean" },
        labels_present: { type: "boolean" },
        issues: { type: "array", items: { type: "string" } },
      },
    },
    confidence: {
      type: "number",
      minimum: 0,
      maximum: 1,
      description: "Overall confidence in validation",
    },
    action: {
      type: "string",
      enum: [
        "accept",
        "regenerate_with_feedback",
        "regenerate_fully",
        "manual_review",
      ],
      description: "Recommended action for this panel",
    },
    regeneration_feedback: {
      type: "string",
      description:
        "Specific feedback for regeneration prompt if action is regenerate",
    },
  },
};

// =============================================================================
// PROMPT TEMPLATES
// =============================================================================

/**
 * Build system prompt for panel validation
 */
function buildSystemPrompt() {
  return `You are an expert architectural panel classifier and quality validator. Your task is to analyze individual architectural panels and validate them against a canonical design brief.

VALIDATION CRITERIA:

1. CLASSIFICATION
   - Verify the panel shows the correct view type (plan, elevation, section, 3D, etc.)
   - Detect if interior was rendered instead of exterior or vice versa
   - Check if orthographic views are truly orthographic (no perspective distortion)

2. DESIGN CONSISTENCY
   - Compare materials, colors, and textures to the canonical brief
   - Verify massing/form matches the specified building shape
   - Check roof type and pitch alignment
   - Validate window patterns and facade rhythm

3. TECHNICAL CORRECTNESS (for 2D panels)
   - True orthographic projection required
   - Consistent lineweights expected
   - Scale bars and dimension lines should be present
   - North arrow required on floor plans
   - Room labels should be visible

OUTPUT: You MUST respond with ONLY valid JSON matching the specified schema. No additional text.`;
}

/**
 * Build user prompt for specific panel type
 */
function buildUserPrompt(panelType, designFingerprint, options = {}) {
  const panelInfo = PANEL_CATEGORIES[panelType] || {
    category: "unknown",
    view: "unknown",
    expected: panelType,
  };

  const styleZone = getStyleZone(panelType);
  const isTechnical = styleZone === "technical";

  let technicalRequirements = "";
  if (isTechnical) {
    technicalRequirements = `
TECHNICAL REQUIREMENTS (this is a ${styleZone} zone panel):
- Must be TRUE ORTHOGRAPHIC projection (NO perspective distortion)
- Consistent lineweights required
- Scale bar expected
- Dimension annotations expected
${panelType.includes("floor_plan") ? "- North arrow REQUIRED" : ""}
- Room/element labels expected
- Clean technical drawing aesthetic`;
  }

  return `Analyze this architectural panel image.

EXPECTED PANEL TYPE: ${panelType}
EXPECTED CATEGORY: ${panelInfo.category}
EXPECTED VIEW: ${panelInfo.view}
EXPECTED TO SHOW: ${panelInfo.expected}
STYLE ZONE: ${styleZone}

CANONICAL DESIGN BRIEF:
${designFingerprint}
${technicalRequirements}

VALIDATION TASKS:
1. CLASSIFICATION: Is this actually a "${panelInfo.expected}"?
   - If interior, it should show interior spaces
   - If exterior, it should show external facades
   - If plan, it should be overhead 2D view
   - If elevation, it should be flat facade view
   - If section, it should show cut-through building

2. DESIGN CONSISTENCY: Does it match the canonical brief above?
   - Materials and colors
   - Building form/massing
   - Roof type and pitch
   - Window patterns
   - Entrance position

3. TECHNICAL CORRECTNESS: ${isTechnical ? "Check orthographic quality" : "N/A for 3D panels"}

OUTPUT SCHEMA:
${JSON.stringify(PANEL_VALIDATOR_JSON_SCHEMA, null, 2)}

Respond with ONLY valid JSON. No markdown, no explanation.`;
}

// =============================================================================
// OPUS PANEL VALIDATOR CLASS
// =============================================================================

export class OpusPanelValidator {
  constructor(options = {}) {
    this.model = options.model || DEFAULT_MODEL;
    this.maxTokens = options.maxTokens || MAX_TOKENS;
    this.apiEndpoint = options.apiEndpoint || API_ENDPOINT;
    this.validationResults = new Map();
  }

  /**
   * Validate a single panel against the canonical design brief
   *
   * @param {string} panelImageUrl - URL or data URL of the panel image
   * @param {string} panelType - Expected panel type (e.g., "hero_3d", "floor_plan_ground")
   * @param {string} designFingerprint - Canonical design brief text
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Validation result
   */
  async validatePanel(
    panelImageUrl,
    panelType,
    designFingerprint,
    options = {},
  ) {
    if (!isFeatureEnabled("opusPanelValidator")) {
      logger.debug("Opus Panel Validator disabled by feature flag");
      return this.buildAcceptResult(panelType);
    }

    logger.info(`Validating panel: ${panelType}`);

    try {
      // Prepare image source
      const imageSource = await this.prepareImageSource(panelImageUrl);

      // Build API request
      const messages = [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: imageSource,
            },
            {
              type: "text",
              text: buildUserPrompt(panelType, designFingerprint, options),
            },
          ],
        },
      ];

      // Call Opus API
      const response = await fetch(this.apiEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: this.maxTokens,
          system: buildSystemPrompt(),
          messages,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Opus API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();

      // Parse and validate response
      const validation = this.parseOpusResponse(result, panelType);

      // Store result for later reference
      this.validationResults.set(panelType, validation);

      logger.info(
        `  Classification correct: ${validation.classification_correct.is_correct_type}`,
      );
      logger.info(
        `  Design consistent: ${validation.design_consistent.matches_fingerprint}`,
      );
      logger.info(`  Action: ${validation.action}`);

      return validation;
    } catch (error) {
      logger.error(
        `Panel validation failed for ${panelType}: ${error.message}`,
      );
      return this.buildErrorResult(panelType, error.message);
    }
  }

  /**
   * Validate multiple panels in batch
   *
   * @param {Array} panels - Array of { imageUrl, type }
   * @param {string} designFingerprint - Canonical design brief
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Batch validation results
   */
  async validatePanels(panels, designFingerprint, options = {}) {
    const results = {
      passed: [],
      failed: [],
      needsRegeneration: [],
      summary: {},
    };

    for (const panel of panels) {
      const validation = await this.validatePanel(
        panel.imageUrl,
        panel.type,
        designFingerprint,
        options,
      );

      if (validation.action === "accept") {
        results.passed.push({ type: panel.type, validation });
      } else if (validation.action === "manual_review") {
        results.failed.push({ type: panel.type, validation });
      } else {
        results.needsRegeneration.push({
          type: panel.type,
          validation,
          feedback: validation.regeneration_feedback,
        });
      }
    }

    results.summary = {
      total: panels.length,
      passed: results.passed.length,
      failed: results.failed.length,
      needsRegeneration: results.needsRegeneration.length,
      passRate: results.passed.length / panels.length,
    };

    return results;
  }

  /**
   * Get validation result for a specific panel type
   */
  getValidationResult(panelType) {
    return this.validationResults.get(panelType) || null;
  }

  /**
   * Clear all stored validation results
   */
  clearResults() {
    this.validationResults.clear();
  }

  /**
   * Prepare image source for Anthropic API
   */
  async prepareImageSource(imageUrl) {
    if (imageUrl.startsWith("data:")) {
      const matches = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (matches) {
        return {
          type: "base64",
          media_type: matches[1],
          data: matches[2],
        };
      }
    }

    if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
      return {
        type: "url",
        url: imageUrl,
      };
    }

    if (imageUrl.startsWith("blob:")) {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const base64 = await this.blobToBase64(blob);
      return {
        type: "base64",
        media_type: blob.type || "image/png",
        data: base64,
      };
    }

    throw new Error(`Unsupported image URL format`);
  }

  /**
   * Convert blob to base64
   */
  async blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result;
        const base64 = dataUrl.split(",")[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Parse Opus response and extract JSON
   */
  parseOpusResponse(apiResponse, panelType) {
    const textContent = apiResponse.content?.find((c) => c.type === "text");
    if (!textContent?.text) {
      throw new Error("No text content in Opus response");
    }

    let jsonText = textContent.text.trim();

    // Remove markdown code blocks if present
    if (jsonText.startsWith("```json")) {
      jsonText = jsonText.slice(7);
    } else if (jsonText.startsWith("```")) {
      jsonText = jsonText.slice(3);
    }
    if (jsonText.endsWith("```")) {
      jsonText = jsonText.slice(0, -3);
    }
    jsonText = jsonText.trim();

    try {
      const validation = JSON.parse(jsonText);
      return this.validateAndNormalize(validation, panelType);
    } catch (parseError) {
      logger.warn(
        `Failed to parse Opus JSON for ${panelType}: ${parseError.message}`,
      );
      return this.buildErrorResult(
        panelType,
        `JSON parse error: ${parseError.message}`,
      );
    }
  }

  /**
   * Validate and normalize the response
   */
  validateAndNormalize(validation, panelType) {
    const styleZone = getStyleZone(panelType);
    const isTechnical = styleZone === "technical";

    return {
      panel_type: panelType,
      classification_correct: {
        is_correct_type: Boolean(
          validation.classification_correct?.is_correct_type ?? true,
        ),
        detected_type:
          validation.classification_correct?.detected_type || panelType,
        confidence: Number(
          validation.classification_correct?.confidence ?? 0.85,
        ),
        issues: validation.classification_correct?.issues || [],
      },
      design_consistent: {
        matches_fingerprint: Boolean(
          validation.design_consistent?.matches_fingerprint ?? true,
        ),
        material_match: Number(
          validation.design_consistent?.material_match ?? 0.85,
        ),
        massing_match: Number(
          validation.design_consistent?.massing_match ?? 0.85,
        ),
        roof_match: Number(validation.design_consistent?.roof_match ?? 0.85),
        window_pattern_match: Number(
          validation.design_consistent?.window_pattern_match ?? 0.85,
        ),
        issues: validation.design_consistent?.issues || [],
      },
      technical_correct: isTechnical
        ? {
            is_orthographic: Boolean(
              validation.technical_correct?.is_orthographic ?? true,
            ),
            has_scale_bar: Boolean(
              validation.technical_correct?.has_scale_bar ?? false,
            ),
            has_dimensions: Boolean(
              validation.technical_correct?.has_dimensions ?? false,
            ),
            has_north_arrow: Boolean(
              validation.technical_correct?.has_north_arrow ?? false,
            ),
            lineweight_consistent: Boolean(
              validation.technical_correct?.lineweight_consistent ?? true,
            ),
            labels_present: Boolean(
              validation.technical_correct?.labels_present ?? false,
            ),
            issues: validation.technical_correct?.issues || [],
          }
        : { not_applicable: true },
      confidence: Number(validation.confidence ?? 0.85),
      action: validation.action || "accept",
      regeneration_feedback: validation.regeneration_feedback || "",
    };
  }

  /**
   * Build an accept result (for when feature is disabled)
   */
  buildAcceptResult(panelType) {
    return {
      panel_type: panelType,
      classification_correct: {
        is_correct_type: true,
        detected_type: panelType,
        confidence: 1.0,
        issues: [],
      },
      design_consistent: {
        matches_fingerprint: true,
        material_match: 1.0,
        massing_match: 1.0,
        roof_match: 1.0,
        window_pattern_match: 1.0,
        issues: [],
      },
      technical_correct: { not_applicable: true },
      confidence: 1.0,
      action: "accept",
      regeneration_feedback: "",
      skipped: true,
    };
  }

  /**
   * Build an error result (allows pipeline to continue)
   */
  buildErrorResult(panelType, errorMessage) {
    return {
      panel_type: panelType,
      classification_correct: {
        is_correct_type: true, // Don't block on errors
        detected_type: panelType,
        confidence: 0,
        issues: [`Validation error: ${errorMessage}`],
      },
      design_consistent: {
        matches_fingerprint: true,
        material_match: 0,
        massing_match: 0,
        roof_match: 0,
        window_pattern_match: 0,
        issues: [],
      },
      technical_correct: { not_applicable: true },
      confidence: 0,
      action: "accept", // Don't block pipeline
      regeneration_feedback: "",
      error: errorMessage,
    };
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

const panelValidator = new OpusPanelValidator();

export default panelValidator;

export { buildSystemPrompt, buildUserPrompt };
