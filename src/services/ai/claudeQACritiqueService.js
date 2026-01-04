/**
 * Claude QA Critique Service
 *
 * QA/critique layer using Claude Sonnet 4.5 for the hybrid architecture.
 * This is the "reviews" side of the Claude+OpenAI duo.
 *
 * Responsibilities:
 * - Cross-view consistency validation
 * - Vision analysis of generated panels
 * - Regeneration prompt suggestions when panels fail
 * - Design narrative and climate reasoning
 * - RIBA compliance checking
 *
 * Part of Hybrid AI Architecture:
 * - OpenAI GPT-4o = Primary DNA + geometry reasoner (see openaiDNAGenerator.js)
 * - Claude Sonnet 4.5 = QA/critique layer
 */

import { isFeatureEnabled } from '../../config/featureFlags.js';
import { getProxiedUrl } from '../../utils/imageUrlUtils.js';
import logger from '../core/logger.js';

const API_ENDPOINT = '/api/anthropic/messages';

// Claude API only accepts these image types
const CLAUDE_SUPPORTED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

/**
 * Rasterize an SVG image to PNG using canvas
 * @param {Blob} svgBlob - SVG blob to convert
 * @returns {Promise<{base64: string, mediaType: string}>} Rasterized PNG as base64
 */
async function rasterizeSvgToPng(svgBlob) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const svgUrl = URL.createObjectURL(svgBlob);

    img.onload = () => {
      try {
        // Create canvas with image dimensions (with reasonable limits)
        const canvas = document.createElement('canvas');
        const maxDim = 2048; // Max dimension to prevent memory issues
        let width = img.width || 1024;
        let height = img.height || 768;

        // Scale down if too large
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        // White background for transparent SVGs
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to PNG base64
        const dataUrl = canvas.toDataURL('image/png');
        const base64Data = dataUrl.split(',')[1];

        URL.revokeObjectURL(svgUrl);
        resolve({
          base64: base64Data,
          mediaType: 'image/png',
        });
      } catch (err) {
        URL.revokeObjectURL(svgUrl);
        reject(new Error(`SVG rasterization failed: ${err.message}`));
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(svgUrl);
      reject(new Error('Failed to load SVG for rasterization'));
    };

    img.src = svgUrl;
  });
}

/**
 * Convert an image URL to base64 format for Anthropic API
 * Anthropic only accepts JPEG, PNG, GIF, or WebP - NOT SVG
 * This function will rasterize SVG images to PNG before sending
 *
 * @param {string} url - Image URL (can be https, http, blob, or data URL)
 * @returns {Promise<Object>} Image source object for Anthropic API
 */
async function convertImageToBase64Source(url) {
  // If it's a data URL, check if it's SVG and rasterize if needed
  if (url.startsWith('data:')) {
    const matches = url.match(/^data:([^;]+);base64,(.+)$/);
    if (matches) {
      const mediaType = matches[1];
      const base64Data = matches[2];

      // Check if it's SVG - needs rasterization
      if (mediaType === 'image/svg+xml') {
        logger.warn('[ClaudeQACritiqueService] SVG data URL detected - rasterizing to PNG');
        // Convert base64 SVG to blob, then rasterize
        const svgBlob = new Blob([Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0))], {
          type: 'image/svg+xml',
        });
        const rasterized = await rasterizeSvgToPng(svgBlob);
        return {
          type: 'base64',
          media_type: rasterized.mediaType,
          data: rasterized.base64,
        };
      }

      // Check if it's a supported type
      if (!CLAUDE_SUPPORTED_TYPES.includes(mediaType)) {
        throw new Error(
          `Unsupported image type for Claude API: ${mediaType}. Supported: ${CLAUDE_SUPPORTED_TYPES.join(', ')}`
        );
      }

      return {
        type: 'base64',
        media_type: mediaType,
        data: base64Data,
      };
    }
    throw new Error('Invalid data URL format');
  }

  // For any URL (https, http, blob), fetch and check content type
  // Use proxy for CORS bypass on remote URLs
  try {
    const proxiedUrl = getProxiedUrl(url);
    const response = await fetch(proxiedUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }

    const blob = await response.blob();
    let mediaType = blob.type || 'image/png';

    // Check URL extension as fallback for content type detection
    const urlLower = url.toLowerCase();
    if (urlLower.endsWith('.svg') || mediaType === 'image/svg+xml') {
      logger.warn(
        '[ClaudeQACritiqueService] SVG image detected - rasterizing to PNG for Claude API compatibility'
      );
      const rasterized = await rasterizeSvgToPng(blob);
      return {
        type: 'base64',
        media_type: rasterized.mediaType,
        data: rasterized.base64,
      };
    }

    // Check if it's a supported type
    if (!CLAUDE_SUPPORTED_TYPES.includes(mediaType)) {
      // Try to infer from URL extension
      if (urlLower.endsWith('.jpg') || urlLower.endsWith('.jpeg')) {
        mediaType = 'image/jpeg';
      } else if (urlLower.endsWith('.png')) {
        mediaType = 'image/png';
      } else if (urlLower.endsWith('.gif')) {
        mediaType = 'image/gif';
      } else if (urlLower.endsWith('.webp')) {
        mediaType = 'image/webp';
      } else {
        // Default to PNG and hope for the best
        logger.warn(
          `[ClaudeQACritiqueService] Unknown image type '${mediaType}' - treating as PNG`
        );
        mediaType = 'image/png';
      }
    }

    // Convert blob to base64
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64Data = reader.result.split(',')[1]; // Remove data:...;base64, prefix
        resolve({
          type: 'base64',
          media_type: mediaType,
          data: base64Data,
        });
      };
      reader.onerror = () => reject(new Error('Failed to convert image to base64'));
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    logger.error('[ClaudeQACritiqueService] Failed to convert image URL:', error.message);
    throw new Error(`Cannot convert image URL to base64: ${error.message}`);
  }
}

/**
 * Claude QA Critique Service Class
 */
class ClaudeQACritiqueService {
  constructor() {
    this.serviceName = 'ClaudeQACritiqueService';
    this.model = 'claude-sonnet-4-5-20250929';
    this.temperature = 0.3; // Balanced for critique
  }

  /**
   * Make API request to Claude
   */
  async callClaude(messages, taskType = 'general', options = {}) {
    const body = {
      model: this.model,
      max_tokens: options.maxTokens || 4000,
      temperature: options.temperature || this.temperature,
      messages,
      task_type: taskType,
    };

    // Add system prompt if provided
    if (options.system) {
      body.system = options.system;
    }

    logger.debug(`[${this.serviceName}] Calling Claude for ${taskType}`);

    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch {
        errorData = { error: `HTTP ${response.status}: ${response.statusText}` };
      }
      const errorMsg =
        errorData.error?.message ||
        errorData.error ||
        `Claude API request failed (${response.status})`;
      logger.error(`[${this.serviceName}] API Error:`, response.status, errorData);
      throw new Error(errorMsg);
    }

    const result = await response.json();

    // Extract content from Claude response format
    if (result.content && Array.isArray(result.content)) {
      return result.content.map((c) => c.text || c).join('');
    }

    return result.content || result;
  }

  /**
   * Parse JSON from Claude response
   */
  parseJSONResponse(text) {
    // Try direct parse
    try {
      return JSON.parse(text);
    } catch {
      // Try to extract JSON from markdown code block
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[1]);
        } catch {
          // Fall through
        }
      }

      // Try to find JSON object in text
      const objectMatch = text.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        try {
          return JSON.parse(objectMatch[0]);
        } catch {
          // Fall through
        }
      }
    }

    logger.warn(`[${this.serviceName}] Failed to parse JSON response, returning raw text`);
    return { raw: text };
  }

  /**
   * Analyze a panel image for architectural accuracy
   *
   * @param {string} panelUrl - URL of the panel image
   * @param {Object} context - Context for analysis
   * @param {string} context.panelType - Type of panel (e.g., 'north_elevation', 'ground_floor')
   * @param {Object} context.masterDNA - Master DNA for reference
   * @param {Object} context.expectedFeatures - Expected features for this panel
   * @returns {Object} Analysis result with issues and scores
   */
  async analyzePanel(panelUrl, context = {}) {
    const startTime = Date.now();
    logger.info(`[${this.serviceName}] Analyzing panel: ${context.panelType || 'unknown'}`);

    const systemPrompt = `You are an expert architectural QA reviewer analyzing AI-generated building images.

Your task is to analyze the provided architectural panel/view and check for:
1. VISUAL CONSISTENCY: Does it match the specified materials, colors, and style?
2. DIMENSIONAL ACCURACY: Do proportions look correct for the specified dimensions?
3. FEATURE PRESENCE: Are all expected features visible (windows, doors, roof type)?
4. TECHNICAL QUALITY: Is the image clear, properly composed, free of artifacts?
5. STYLE COHERENCE: Does it match the specified architectural period/style?

OUTPUT FORMAT (JSON):
{
  "passed": true|false,
  "confidence": 0.0-1.0,
  "scores": {
    "visual_consistency": 0.0-1.0,
    "dimensional_accuracy": 0.0-1.0,
    "feature_presence": 0.0-1.0,
    "technical_quality": 0.0-1.0,
    "style_coherence": 0.0-1.0
  },
  "issues": [
    {
      "severity": "critical|major|minor",
      "category": "consistency|dimension|feature|quality|style",
      "description": "Description of issue",
      "location": "Where in the image (if applicable)"
    }
  ],
  "observed_features": ["list", "of", "features", "seen"],
  "missing_features": ["expected", "but", "not", "seen"],
  "recommendations": ["Specific improvements"]
}`;

    // Build user message with image
    const userContent = [];

    // Add context text
    let contextText = `Analyze this ${context.panelType || 'architectural panel'}.\n\n`;

    if (context.masterDNA) {
      contextText += `EXPECTED SPECIFICATIONS:\n`;
      contextText += `- Building Type: ${context.masterDNA.buildingType}\n`;
      contextText += `- Style: ${context.masterDNA.style?.period || 'contemporary'}\n`;

      if (context.masterDNA.materials) {
        contextText += `- Exterior Material: ${context.masterDNA.materials.exterior_walls?.name || 'brick'} (${context.masterDNA.materials.exterior_walls?.hex || '#B8604E'})\n`;
        contextText += `- Roof: ${context.masterDNA.materials.roof?.name || 'tile'} (${context.masterDNA.materials.roof?.hex || '#8B4513'})\n`;
        contextText += `- Windows: ${context.masterDNA.materials.windows?.name || 'uPVC'} (${context.masterDNA.materials.windows?.hex || '#FFFFFF'})\n`;
      }

      if (context.masterDNA.dimensions) {
        contextText += `- Dimensions: ${context.masterDNA.dimensions.length_m}m x ${context.masterDNA.dimensions.width_m}m x ${context.masterDNA.dimensions.height_m}m\n`;
        contextText += `- Floors: ${context.masterDNA.dimensions.floors}\n`;
      }
    }

    if (context.expectedFeatures && Array.isArray(context.expectedFeatures)) {
      contextText += `\nEXPECTED FEATURES FOR THIS VIEW:\n`;
      context.expectedFeatures.forEach((f) => {
        contextText += `- ${f}\n`;
      });
    }

    contextText += `\nAnalyze the image and return your assessment as JSON.`;

    userContent.push({ type: 'text', text: contextText });

    // Add image - convert to base64 if not HTTPS
    try {
      const imageSource = await convertImageToBase64Source(panelUrl);
      userContent.push({
        type: 'image',
        source: imageSource,
      });
    } catch (imageError) {
      logger.error(
        `[${this.serviceName}] Failed to process image for analysis:`,
        imageError.message
      );
      throw new Error(`Cannot analyze panel - image conversion failed: ${imageError.message}`);
    }

    const response = await this.callClaude(
      [{ role: 'user', content: userContent }],
      'panel_analysis',
      { system: systemPrompt }
    );

    const analysis = this.parseJSONResponse(response);

    const duration = Date.now() - startTime;
    logger.info(
      `[${this.serviceName}] Panel analysis complete in ${duration}ms - passed: ${analysis.passed}`
    );

    return analysis;
  }

  /**
   * Generate a regeneration prompt for failed panels
   *
   * @param {Object} issues - Issues found during QA
   * @param {Object} masterDNA - Master DNA for reference
   * @param {string} panelType - Type of panel to regenerate
   * @returns {Object} Regeneration prompt and parameters
   */
  async generateRegenerationPrompt(issues, masterDNA, panelType) {
    const startTime = Date.now();
    logger.info(`[${this.serviceName}] Generating regeneration prompt for ${panelType}`);

    const systemPrompt = `You are an expert at improving AI image generation prompts for architectural visualization.

Given QA issues from a failed panel generation, create an improved prompt that:
1. Addresses each specific issue identified
2. Reinforces correct specifications from the DNA
3. Adds stronger constraints to prevent the issues
4. Uses effective negative prompts to block unwanted elements

OUTPUT FORMAT (JSON):
{
  "improved_prompt": "Full improved generation prompt",
  "negative_prompt": "Elements to avoid",
  "emphasis_points": ["Key points to emphasize"],
  "generation_params": {
    "guidance_scale": 7.5,
    "steps": 40,
    "strength": 0.75
  },
  "confidence": 0.0-1.0,
  "notes": "Any additional notes for the regeneration"
}`;

    // Build issue summary
    let issuesSummary = 'ISSUES TO FIX:\n';
    if (Array.isArray(issues)) {
      issues.forEach((issue, i) => {
        issuesSummary += `${i + 1}. [${issue.severity || 'unknown'}] ${issue.description || issue}\n`;
        if (issue.location) {
          issuesSummary += `   Location: ${issue.location}\n`;
        }
      });
    } else if (typeof issues === 'object') {
      Object.entries(issues).forEach(([key, value]) => {
        issuesSummary += `- ${key}: ${value}\n`;
      });
    }

    const userPrompt = `Generate an improved prompt to fix these issues in a ${panelType} panel.

${issuesSummary}

MASTER DNA SPECIFICATIONS:
- Building Type: ${masterDNA?.buildingType || 'residential'}
- Style: ${masterDNA?.style?.period || 'contemporary'}
- Exterior: ${masterDNA?.materials?.exterior_walls?.name || 'brick'} (${masterDNA?.materials?.exterior_walls?.hex || '#B8604E'})
- Roof: ${masterDNA?.materials?.roof?.name || 'tile'} (${masterDNA?.materials?.roof?.hex || '#8B4513'})
- Dimensions: ${masterDNA?.dimensions?.length_m || 15}m x ${masterDNA?.dimensions?.width_m || 10}m
- Floors: ${masterDNA?.dimensions?.floors || 2}

Create an improved prompt that will generate a correct ${panelType} that fixes all the issues.`;

    const response = await this.callClaude(
      [{ role: 'user', content: userPrompt }],
      'regeneration_prompt',
      { system: systemPrompt }
    );

    const result = this.parseJSONResponse(response);

    const duration = Date.now() - startTime;
    logger.info(`[${this.serviceName}] Regeneration prompt generated in ${duration}ms`);

    return result;
  }

  /**
   * Generate design narrative and philosophy text
   *
   * @param {Object} masterDNA - Master DNA
   * @param {Object} location - Location data with climate info
   * @returns {Object} Narrative texts for different purposes
   */
  async generateDesignNarrative(masterDNA, location = {}) {
    const startTime = Date.now();
    logger.info(`[${this.serviceName}] Generating design narrative`);

    const systemPrompt = `You are an expert architectural writer creating compelling design narratives.

Generate professional architectural narrative texts that:
1. Explain the design philosophy and reasoning
2. Connect the design to its context (site, climate, culture)
3. Highlight sustainable and climate-responsive features
4. Use appropriate architectural terminology
5. Are suitable for client presentations and planning applications

OUTPUT FORMAT (JSON):
{
  "design_philosophy": "2-3 paragraph design statement",
  "climate_response": "How the design responds to local climate",
  "spatial_organization": "Description of internal layout and flow",
  "material_rationale": "Why these materials were chosen",
  "sustainability_features": ["List of sustainable design elements"],
  "executive_summary": "1 paragraph summary for clients",
  "planning_statement": "Paragraph suitable for planning application"
}`;

    let contextText = `Generate architectural narratives for this building:\n\n`;
    contextText += `BUILDING TYPE: ${masterDNA?.buildingType || 'residential'}\n`;
    contextText += `STYLE: ${masterDNA?.style?.period || 'contemporary'}\n`;
    contextText += `FLOORS: ${masterDNA?.dimensions?.floors || 2}\n`;
    contextText += `TOTAL AREA: ~${Math.round((masterDNA?.dimensions?.length_m || 15) * (masterDNA?.dimensions?.width_m || 10))}m2 per floor\n\n`;

    // Add materials
    contextText += `MATERIALS:\n`;
    contextText += `- Exterior: ${masterDNA?.materials?.exterior_walls?.name || 'brick'}\n`;
    contextText += `- Roof: ${masterDNA?.materials?.roof?.name || 'tile'}\n`;
    contextText += `- Windows: ${masterDNA?.materials?.windows?.name || 'uPVC'}\n\n`;

    // Add style features
    if (masterDNA?.style?.features?.length) {
      contextText += `ARCHITECTURAL FEATURES:\n`;
      masterDNA.style.features.forEach((f) => {
        contextText += `- ${f}\n`;
      });
      contextText += '\n';
    }

    // Add location context
    if (location.address) {
      contextText += `LOCATION: ${location.address}\n`;
    }
    if (location.climate) {
      contextText += `CLIMATE: ${location.climate}\n`;
    }
    if (location.optimalOrientation) {
      contextText += `OPTIMAL ORIENTATION: ${location.optimalOrientation}\n`;
    }

    // Add room summary
    if (masterDNA?.floors?.length) {
      contextText += `\nROOM PROGRAM:\n`;
      masterDNA.floors.forEach((floor) => {
        contextText += `${floor.name}:\n`;
        floor.rooms?.forEach((room) => {
          contextText += `  - ${room.name} (${room.area_m2}m2)\n`;
        });
      });
    }

    const response = await this.callClaude(
      [{ role: 'user', content: contextText }],
      'narrative_generation',
      { system: systemPrompt }
    );

    const narrative = this.parseJSONResponse(response);

    const duration = Date.now() - startTime;
    logger.info(`[${this.serviceName}] Narrative generated in ${duration}ms`);

    return narrative;
  }

  /**
   * Validate cross-view consistency across multiple panels
   *
   * @param {Object} panels - Map of panel URLs by type
   * @param {Object} masterDNA - Master DNA for reference
   * @returns {Object} Consistency validation result
   */
  async validateConsistency(panels, masterDNA) {
    const startTime = Date.now();
    logger.info(`[${this.serviceName}] Validating cross-view consistency`);

    const systemPrompt = `You are an expert architectural QA reviewer validating consistency across multiple views of a building.

Your task is to check that ALL views show the SAME building with consistent:
1. MATERIALS: Same brick color, roof material, window frames across all views
2. DIMENSIONS: Proportions match (floor heights, roof pitch, window sizes)
3. FEATURES: Windows, doors, roof type consistent between views
4. STYLE: Same architectural period/style throughout

OUTPUT FORMAT (JSON):
{
  "consistent": true|false,
  "overall_score": 0.0-1.0,
  "checks": {
    "material_consistency": { "score": 0.0-1.0, "issues": [] },
    "dimensional_consistency": { "score": 0.0-1.0, "issues": [] },
    "feature_consistency": { "score": 0.0-1.0, "issues": [] },
    "style_consistency": { "score": 0.0-1.0, "issues": [] }
  },
  "cross_view_issues": [
    {
      "panels": ["panel1", "panel2"],
      "issue": "Description of inconsistency",
      "severity": "critical|major|minor"
    }
  ],
  "recommendations": ["How to improve consistency"],
  "summary": "Brief summary of consistency assessment"
}`;

    // Build multi-image message
    const userContent = [];

    let contextText = `Validate consistency across these architectural views:\n\n`;
    contextText += `EXPECTED SPECIFICATIONS (from Master DNA):\n`;
    contextText += `- Building Type: ${masterDNA?.buildingType || 'residential'}\n`;
    contextText += `- Style: ${masterDNA?.style?.period || 'contemporary'}\n`;
    contextText += `- Exterior: ${masterDNA?.materials?.exterior_walls?.name || 'brick'} (${masterDNA?.materials?.exterior_walls?.hex || '#B8604E'})\n`;
    contextText += `- Roof: ${masterDNA?.materials?.roof?.name || 'tile'} (${masterDNA?.materials?.roof?.hex || '#8B4513'})\n`;
    contextText += `- Floors: ${masterDNA?.dimensions?.floors || 2}\n\n`;
    contextText += `Check that all views show the SAME building with consistent materials, proportions, and features.\n\n`;
    contextText += `PANELS TO COMPARE:\n`;

    userContent.push({ type: 'text', text: contextText });

    // Add each panel image (limit to 6 for API constraints)
    const panelEntries = Object.entries(panels).slice(0, 6);
    for (const [panelType, panelData] of panelEntries) {
      const url = typeof panelData === 'string' ? panelData : panelData?.url;
      if (url) {
        try {
          const imageSource = await convertImageToBase64Source(url);
          userContent.push({
            type: 'text',
            text: `\n--- ${panelType.toUpperCase()} ---`,
          });
          userContent.push({
            type: 'image',
            source: imageSource,
          });
        } catch (imageError) {
          logger.warn(
            `[${this.serviceName}] Skipping panel ${panelType} - image conversion failed:`,
            imageError.message
          );
          // Continue with other panels rather than failing completely
        }
      }
    }

    userContent.push({
      type: 'text',
      text: '\nAnalyze all images and return consistency assessment as JSON.',
    });

    const response = await this.callClaude(
      [{ role: 'user', content: userContent }],
      'consistency_validation',
      { system: systemPrompt, maxTokens: 6000 }
    );

    const result = this.parseJSONResponse(response);

    const duration = Date.now() - startTime;
    logger.info(
      `[${this.serviceName}] Consistency validation complete in ${duration}ms - score: ${result.overall_score}`
    );

    return result;
  }

  /**
   * Run full QA critique on generated panels
   *
   * @param {Object} params - QA parameters
   * @returns {Object} Complete QA results
   */
  async runFullCritique(params) {
    const { panelResults, masterDNA, locationData, options = {} } = params;

    logger.info(`[${this.serviceName}] Running full QA critique`);

    const results = {
      timestamp: new Date().toISOString(),
      overall_passed: true,
      overall_score: 0,
      panel_analyses: {},
      consistency: null,
      narrative: null,
      regeneration_prompts: {},
    };

    // Convert panel results to URL map
    const panelUrls = {};
    if (Array.isArray(panelResults)) {
      panelResults.forEach((panel) => {
        const key = panel.id || panel.type;
        panelUrls[key] = panel.imageUrl || panel.url;
      });
    } else if (typeof panelResults === 'object') {
      Object.entries(panelResults).forEach(([key, panel]) => {
        panelUrls[key] = typeof panel === 'string' ? panel : panel?.url;
      });
    }

    // Step 1: Cross-view consistency check
    if (options.checkConsistency !== false && Object.keys(panelUrls).length > 1) {
      try {
        results.consistency = await this.validateConsistency(panelUrls, masterDNA);
        if (!results.consistency.consistent) {
          results.overall_passed = false;
        }
      } catch (error) {
        logger.error(`[${this.serviceName}] Consistency check failed:`, error.message);
        results.consistency = { error: error.message };
      }
    }

    // Step 2: Analyze critical panels (hero, elevations)
    const criticalPanels = [
      'hero_3d',
      'north_elevation',
      'south_elevation',
      'ground_floor',
      'first_floor',
    ];
    for (const panelType of criticalPanels) {
      if (panelUrls[panelType] && options.analyzePanels !== false) {
        try {
          const analysis = await this.analyzePanel(panelUrls[panelType], {
            panelType,
            masterDNA,
          });
          results.panel_analyses[panelType] = analysis;

          // Generate regeneration prompt if panel failed
          if (!analysis.passed && options.generateRegenerationPrompts !== false) {
            results.regeneration_prompts[panelType] = await this.generateRegenerationPrompt(
              analysis.issues,
              masterDNA,
              panelType
            );
            results.overall_passed = false;
          }
        } catch (error) {
          logger.error(
            `[${this.serviceName}] Panel analysis failed for ${panelType}:`,
            error.message
          );
          results.panel_analyses[panelType] = { error: error.message };
        }
      }
    }

    // Step 3: Generate narrative
    if (options.generateNarrative !== false) {
      try {
        results.narrative = await this.generateDesignNarrative(masterDNA, locationData);
      } catch (error) {
        logger.error(`[${this.serviceName}] Narrative generation failed:`, error.message);
        results.narrative = { error: error.message };
      }
    }

    // Calculate overall score
    const scores = [];
    if (results.consistency?.overall_score) {
      scores.push(results.consistency.overall_score);
    }
    Object.values(results.panel_analyses).forEach((analysis) => {
      if (analysis.confidence) {
        scores.push(analysis.confidence);
      }
    });
    results.overall_score =
      scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

    logger.info(
      `[${this.serviceName}] Full critique complete - passed: ${results.overall_passed}, score: ${results.overall_score.toFixed(2)}`
    );

    return results;
  }
}

// Export singleton instance
export const claudeQACritiqueService = new ClaudeQACritiqueService();

// Export class for testing
export { ClaudeQACritiqueService };

// Default export
export default claudeQACritiqueService;
