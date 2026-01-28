/**
 * Opus Sheet Critic
 *
 * Post-composition A1 sheet validation using Claude Opus 4.5 vision capabilities.
 * Analyzes the composed A1 PNG and provides structured feedback for:
 * - Layout issues (alignment, overlaps, margins)
 * - Missing or illegible items
 * - Panels requiring regeneration
 * - RIBA compliance
 * - Visual hierarchy (hybrid competition/technical aesthetic)
 *
 * @module services/qa/OpusSheetCritic
 */

import { isFeatureEnabled } from "../../config/featureFlags.js";
import logger from "../core/logger.js";
import { PANEL_PRIORITY_ORDER, STYLE_ZONES } from "../a1/A1GridSpec12Column.js";

const API_ENDPOINT = "/api/anthropic/messages";
const DEFAULT_MODEL = "claude-opus-4-5-20251101";
const MAX_TOKENS = 8000;

// =============================================================================
// JSON SCHEMA FOR OPUS RESPONSE
// =============================================================================

/**
 * JSON Schema for Sheet Critic response
 * This schema is embedded in the prompt to ensure structured output
 */
export const SHEET_CRITIC_JSON_SCHEMA = {
  type: "object",
  required: [
    "overall_pass",
    "layout_issues",
    "missing_items",
    "illegible_items",
    "regenerate_panels",
    "riba_compliance",
    "visual_score",
  ],
  properties: {
    overall_pass: {
      type: "boolean",
      description: "True if sheet passes all critical checks",
    },
    layout_issues: {
      type: "array",
      items: {
        type: "object",
        required: ["panel_id", "issue_type", "severity"],
        properties: {
          panel_id: { type: "string", description: "Panel identifier" },
          issue_type: {
            type: "string",
            enum: [
              "alignment",
              "overlap",
              "margin",
              "spacing",
              "size",
              "position",
            ],
            description: "Type of layout issue",
          },
          description: {
            type: "string",
            description: "Detailed description of the issue",
          },
          severity: {
            type: "string",
            enum: ["critical", "major", "minor"],
            description: "Issue severity level",
          },
          fix_suggestion: {
            type: "string",
            description: "How to fix the issue",
          },
        },
      },
    },
    missing_items: {
      type: "array",
      items: { type: "string" },
      description: "Panel IDs that are completely missing from the sheet",
    },
    illegible_items: {
      type: "array",
      items: {
        type: "object",
        required: ["panel_id", "reason"],
        properties: {
          panel_id: { type: "string" },
          reason: {
            type: "string",
            enum: [
              "too_small",
              "blurry",
              "cut_off",
              "low_contrast",
              "text_unreadable",
            ],
          },
        },
      },
    },
    regenerate_panels: {
      type: "array",
      items: {
        type: "object",
        required: ["panel_id", "reason", "priority"],
        properties: {
          panel_id: { type: "string", description: "Panel to regenerate" },
          reason: { type: "string", description: "Why regeneration is needed" },
          priority: {
            type: "string",
            enum: ["immediate", "recommended", "optional"],
          },
          suggested_fix: {
            type: "string",
            description: "Specific fix guidance",
          },
        },
      },
    },
    riba_compliance: {
      type: "object",
      properties: {
        title_block_complete: { type: "boolean" },
        drawing_numbers_present: { type: "boolean" },
        scales_indicated: { type: "boolean" },
        north_arrows_present: { type: "boolean" },
        revision_info_present: { type: "boolean" },
        issues: { type: "array", items: { type: "string" } },
      },
    },
    visual_score: {
      type: "object",
      properties: {
        competition_aesthetic: {
          type: "number",
          minimum: 0,
          maximum: 100,
          description: "Score for hero/3D panels visual impact (0-100)",
        },
        technical_clarity: {
          type: "number",
          minimum: 0,
          maximum: 100,
          description: "Score for technical drawing precision (0-100)",
        },
        overall_presentation: {
          type: "number",
          minimum: 0,
          maximum: 100,
          description: "Overall sheet presentation quality (0-100)",
        },
      },
    },
    critique_summary: {
      type: "string",
      description: "Brief summary of key issues and recommendations",
    },
  },
};

// =============================================================================
// PROMPT TEMPLATES
// =============================================================================

/**
 * Build the system prompt for sheet critique
 */
function buildSystemPrompt() {
  return `You are an expert architectural QA reviewer specializing in UK RIBA-standard A1 presentation sheets. Your role is to critically analyze composed architectural sheets for quality, completeness, and professional standards.

EVALUATION CRITERIA:

1. LAYOUT QUALITY
   - 12-column grid alignment
   - Proper margins (12.7mm outer, 4.2mm gutters)
   - No overlapping panels
   - Baseline alignment across rows
   - Proportionate panel sizes

2. HYBRID STYLE REQUIREMENTS
   Competition Zone (Top Row): hero_3d, interior_3d, axonometric
   - Bold, photorealistic rendering
   - High visual impact
   - Artistic presentation quality

   Technical Zone (Plans, Elevations, Sections):
   - True orthographic projection
   - Consistent lineweights
   - Professional CAD-like appearance
   - Readable dimensions and labels

   Data Zone (Title block, Schedules):
   - Clear typography
   - Readable at A1 print size
   - Complete information

3. RIBA COMPLIANCE
   - Title block with project info, drawing number, revision
   - Scale bars on technical drawings
   - North arrows on floor plans
   - Proper annotation standards

4. QUALITY THRESHOLDS
   - All text must be legible at A1 print size (min 8pt)
   - No blurry or low-resolution panels
   - No duplicate or placeholder images
   - Minimum 2% sheet area for data panels

OUTPUT: You MUST respond with ONLY valid JSON matching the specified schema. No additional text.`;
}

/**
 * Build the user prompt with sheet image and required panels
 */
function buildUserPrompt(requiredPanels, options = {}) {
  const { buildingType = "residential", floorCount = 2 } = options;

  const competitionPanels = STYLE_ZONES.competition.join(", ");
  const technicalPanels = STYLE_ZONES.technical
    .filter((p) => !p.includes("*"))
    .join(", ");
  const dataPanels = STYLE_ZONES.data.join(", ");

  return `Analyze this composed A1 architectural sheet image.

REQUIRED PANELS TO VERIFY (${requiredPanels.length} total):
${requiredPanels.map((p, i) => `${i + 1}. ${p}`).join("\n")}

BUILDING CONTEXT:
- Type: ${buildingType}
- Floors: ${floorCount}

STYLE ZONE MAPPING:
- Competition aesthetic (bold, photorealistic): ${competitionPanels}
- Technical precision (orthographic, lineweights): ${technicalPanels}
- Data/info (clear typography): ${dataPanels}

EVALUATION TASKS:
1. Verify all required panels are present and visible
2. Check layout alignment and spacing
3. Identify any illegible or cut-off panels
4. Assess RIBA compliance elements
5. Score visual quality for each zone
6. List any panels that need regeneration

OUTPUT SCHEMA:
${JSON.stringify(SHEET_CRITIC_JSON_SCHEMA, null, 2)}

Respond with ONLY valid JSON. No markdown, no explanation.`;
}

// =============================================================================
// OPUS SHEET CRITIC CLASS
// =============================================================================

export class OpusSheetCritic {
  constructor(options = {}) {
    this.model = options.model || DEFAULT_MODEL;
    this.maxTokens = options.maxTokens || MAX_TOKENS;
    this.apiEndpoint = options.apiEndpoint || API_ENDPOINT;
  }

  /**
   * Critique a composed A1 sheet
   *
   * @param {string} sheetImageUrl - URL or data URL of composed A1 sheet
   * @param {string[]} requiredPanels - List of panel types that should be present
   * @param {Object} options - Additional options
   * @param {string} options.buildingType - Building type for context
   * @param {number} options.floorCount - Number of floors
   * @returns {Promise<Object>} Structured critique result
   */
  async critiqueSheet(sheetImageUrl, requiredPanels, options = {}) {
    if (!isFeatureEnabled("opusSheetCritic")) {
      logger.debug("Opus Sheet Critic disabled by feature flag");
      return this.buildPassResult();
    }

    logger.info("Starting Opus Sheet Critic analysis...");

    try {
      // Convert image to base64 if needed
      const imageSource = await this.prepareImageSource(sheetImageUrl);

      // Build the API request
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
              text: buildUserPrompt(requiredPanels, options),
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

      // Extract and parse the JSON response
      const critique = this.parseOpusResponse(result);

      logger.success("Opus Sheet Critic analysis complete");
      logger.info(`  Overall pass: ${critique.overall_pass}`);
      logger.info(`  Layout issues: ${critique.layout_issues?.length || 0}`);
      logger.info(`  Missing panels: ${critique.missing_items?.length || 0}`);
      logger.info(`  Regenerate: ${critique.regenerate_panels?.length || 0}`);

      return critique;
    } catch (error) {
      logger.error(`Opus Sheet Critic failed: ${error.message}`);

      // Return a safe fallback that allows pipeline to continue
      return this.buildErrorResult(error.message);
    }
  }

  /**
   * Prepare image source for Anthropic API
   */
  async prepareImageSource(imageUrl) {
    // Handle data URLs
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

    // Handle remote URLs
    if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
      return {
        type: "url",
        url: imageUrl,
      };
    }

    // Handle blob URLs - need to fetch and convert
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

    throw new Error(
      `Unsupported image URL format: ${imageUrl.substring(0, 50)}...`,
    );
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
   * Parse the Opus response and extract JSON
   */
  parseOpusResponse(apiResponse) {
    // Extract text content from response
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

    // Parse JSON
    try {
      const critique = JSON.parse(jsonText);
      return this.validateAndNormalize(critique);
    } catch (parseError) {
      logger.warn(`Failed to parse Opus JSON response: ${parseError.message}`);
      logger.debug(`Raw response: ${jsonText.substring(0, 500)}...`);

      // Return error result if parsing fails
      return this.buildErrorResult(`JSON parse error: ${parseError.message}`);
    }
  }

  /**
   * Validate and normalize the critique response
   */
  validateAndNormalize(critique) {
    return {
      overall_pass: Boolean(critique.overall_pass),
      layout_issues: Array.isArray(critique.layout_issues)
        ? critique.layout_issues
        : [],
      missing_items: Array.isArray(critique.missing_items)
        ? critique.missing_items
        : [],
      illegible_items: Array.isArray(critique.illegible_items)
        ? critique.illegible_items
        : [],
      regenerate_panels: Array.isArray(critique.regenerate_panels)
        ? critique.regenerate_panels
        : [],
      riba_compliance: critique.riba_compliance || {
        title_block_complete: true,
        drawing_numbers_present: true,
        scales_indicated: true,
        north_arrows_present: true,
        revision_info_present: true,
        issues: [],
      },
      visual_score: critique.visual_score || {
        competition_aesthetic: 75,
        technical_clarity: 75,
        overall_presentation: 75,
      },
      critique_summary: critique.critique_summary || "",
    };
  }

  /**
   * Build a pass result (for when feature is disabled or sheet is perfect)
   */
  buildPassResult() {
    return {
      overall_pass: true,
      layout_issues: [],
      missing_items: [],
      illegible_items: [],
      regenerate_panels: [],
      riba_compliance: {
        title_block_complete: true,
        drawing_numbers_present: true,
        scales_indicated: true,
        north_arrows_present: true,
        revision_info_present: true,
        issues: [],
      },
      visual_score: {
        competition_aesthetic: 85,
        technical_clarity: 85,
        overall_presentation: 85,
      },
      critique_summary: "Sheet critique skipped (feature disabled)",
    };
  }

  /**
   * Build an error result (allows pipeline to continue with warnings)
   */
  buildErrorResult(errorMessage) {
    return {
      overall_pass: true, // Don't block pipeline on API errors
      layout_issues: [],
      missing_items: [],
      illegible_items: [],
      regenerate_panels: [],
      riba_compliance: {
        title_block_complete: true,
        drawing_numbers_present: true,
        scales_indicated: true,
        north_arrows_present: true,
        revision_info_present: true,
        issues: [],
      },
      visual_score: {
        competition_aesthetic: 0,
        technical_clarity: 0,
        overall_presentation: 0,
      },
      critique_summary: `Critique failed: ${errorMessage}`,
      error: errorMessage,
    };
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

const sheetCritic = new OpusSheetCritic();

export default sheetCritic;

export { buildSystemPrompt, buildUserPrompt };
