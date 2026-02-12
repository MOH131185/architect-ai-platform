/**
 * AI Floor Plan Layout Engine
 *
 * Uses Model Registry to select layout model (default: Qwen3-235B-A22B).
 * Fallback chain: Qwen3-235B → Llama-3.3-70B → Qwen2.5-7B.
 *
 * Models that support response_format: json_object use it for reliable output.
 * Models that don't (e.g., Qwen3) rely on stripThinkingTags + parseLayoutResponse()
 * for robust JSON extraction from <think> tag-wrapped output.
 *
 * Replaces the zone-based strip-packing algorithm in BuildingModel._buildRooms()
 * with architecturally-aware placements.
 */

import togetherAIReasoningService from "./togetherAIReasoningService.js";
import { validateAILayout } from "./aiLayoutValidator.js";
import { getFallbackChain, getModelConfig } from "./modelRegistry.js";
import { isFeatureEnabled } from "../config/featureFlags.js";
import logger from "../utils/logger.js";

// ─── Model Configuration ────────────────────────────────────────────
// Legacy hardcoded models (used when modelRegistry flag is disabled)
const LEGACY_LAYOUT_MODELS = [
  "meta-llama/Llama-3.3-70B-Instruct-Turbo",
  "Qwen/Qwen2.5-7B-Instruct-Turbo",
];

/**
 * Get layout models from registry (with legacy fallback).
 * Returns array of { togetherModel, supportsJsonMode, temperature, maxTokens }
 */
function getLayoutModelChain() {
  if (!isFeatureEnabled("modelRegistry")) {
    return LEGACY_LAYOUT_MODELS.map((model) => ({
      togetherModel: model,
      supportsJsonMode: true,
      temperature: 0.3,
      maxTokens: 4000,
    }));
  }

  const chain = getFallbackChain("layout");
  return chain
    .map((id) => {
      const config = getModelConfig("layout", id);
      if (!config?.togetherModel) return null;
      return {
        togetherModel: config.togetherModel,
        supportsJsonMode: config.supportsJsonMode !== false,
        stripThinkingTags: config.stripThinkingTags || false,
        temperature: config.temperature || 0.3,
        maxTokens: config.maxTokens || 4000,
      };
    })
    .filter(Boolean);
}

// ─── System Prompt ──────────────────────────────────────────────────

const LAYOUT_SYSTEM_PROMPT = `You are a UK residential architect specialising in spatial planning.
Given a building program (rooms with target areas) and an envelope, produce a floor plan layout.

COORDINATE SYSTEM:
- Origin (0,0) = interior SW corner (inside external walls)
- X increases East, Y increases North
- All dimensions in METRES
- Rooms must fit within the interior envelope
- Leave 0.1m gaps between adjacent rooms for internal partition walls

ARCHITECTURAL RULES:
1. CIRCULATION SPINE: Place hallway/landing as a central corridor connecting all rooms on that floor
2. ADJACENCY: Kitchen adjacent to dining, en-suite adjacent to master bedroom, WC near entrance
3. DAYLIGHT: Living rooms and bedrooms on S/E/W facades. Bathrooms and utility can be internal or N
4. ENTRANCE: Ground floor hallway must touch the entrance facade
5. STAIRCASE: Place staircase in same X,Y position on every floor, adjacent to hallway/landing
6. MINIMUM DIMENSIONS: No room narrower than 1.5m (except WC which can be 0.9m wide)
7. ROOM PROPORTIONS: Aspect ratio between 1:1 and 1:2.5 for livable rooms
8. ZONE TYPES: Classify each room as "living", "sleeping", "service", or "circulation"

CRITICAL OUTPUT FORMAT:
You MUST respond with ONLY a valid JSON object. No prose, no explanation, no markdown.
The JSON must match this exact schema:
{
  "levels": [
    {
      "index": 0,
      "name": "Ground Floor",
      "rooms": [
        {
          "name": "Living Room",
          "program": "living",
          "zoneType": "living",
          "x": 0.0,
          "y": 4.0,
          "width": 5.5,
          "depth": 4.0,
          "hasExternalWall": true,
          "adjacentTo": ["Hallway", "Kitchen"]
        }
      ]
    }
  ],
  "staircase": { "x": 4.0, "y": 0.0, "width": 1.0, "depth": 2.5 },
  "designRationale": "Brief explanation of layout decisions"
}

RULES FOR VALUES:
- x and y are the SW corner of each room in metres
- width is the E-W dimension, depth is the N-S dimension
- Every room from the program MUST appear in the output
- Room areas (width × depth) should closely match target areas
- No two rooms may overlap (check x,y,width,depth for collisions)
- Include hallway/landing on every floor as circulation spine`;

/**
 * Build a user prompt for the AI layout engine
 */
function buildLayoutPrompt(programSpaces, envelope, site, style) {
  const interiorWidth = (envelope.widthM || 10) - 0.6; // 300mm external walls each side
  const interiorDepth = (envelope.depthM || 8) - 0.6;
  const levelCount = envelope.levelCount || 2;
  const entranceSide = site?.entranceSide || "S";

  // Group rooms by level
  const roomsByLevel = {};
  for (const room of programSpaces) {
    const level = room.levelIndex || 0;
    if (!roomsByLevel[level]) roomsByLevel[level] = [];
    roomsByLevel[level].push({
      name: room.name,
      program: room.program || room.category || "generic",
      targetAreaM2: room.targetAreaM2 || room.area || 15,
    });
  }

  let prompt = `Design a floor plan layout for a ${levelCount}-storey UK residential building.

INTERIOR ENVELOPE (inside external walls):
- Width (E-W): ${interiorWidth.toFixed(1)}m
- Depth (N-S): ${interiorDepth.toFixed(1)}m
- Levels: ${levelCount}
- Entrance side: ${entranceSide}
- Style: ${style?.vernacular || "contemporary"}

ROOM PROGRAM:
`;

  for (let level = 0; level < levelCount; level++) {
    const levelName =
      level === 0
        ? "Ground Floor"
        : level === 1
          ? "First Floor"
          : `Floor ${level}`;
    const rooms = roomsByLevel[level] || [];
    prompt += `\n${levelName}:\n`;
    for (const room of rooms) {
      prompt += `  - ${room.name} (${room.program}): ${room.targetAreaM2.toFixed(1)}m²\n`;
    }
  }

  prompt += `
CONSTRAINTS:
- All rooms must fit within ${interiorWidth.toFixed(1)}m × ${interiorDepth.toFixed(1)}m per floor
- Leave 0.1m gap between adjacent rooms for partition walls
- Hallway/landing must form continuous circulation connecting all rooms
- ${levelCount > 1 ? "Staircase must be in the same position on every floor" : "No staircase needed (single storey)"}
- Entrance must face ${entranceSide} side

Respond with ONLY the JSON layout object. No other text.`;

  return prompt;
}

/**
 * Strip Qwen3 thinking tags from response content.
 * Qwen3 models wrap internal reasoning in <think>...</think> blocks.
 */
function stripThinkingTags(text) {
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

/**
 * Parse AI response and extract layout JSON.
 * Handles: direct JSON, markdown code blocks, JSON embedded in text,
 * and Qwen3 thinking tags.
 */
function parseLayoutResponse(responseText) {
  // Strip thinking tags first
  const cleaned = stripThinkingTags(responseText);

  // Try direct parse
  try {
    return JSON.parse(cleaned);
  } catch {
    // Try to extract JSON from markdown code blocks
    const jsonMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1].trim());
      } catch {
        // Fall through
      }
    }

    // Try to find JSON object in response
    const braceMatch = cleaned.match(/\{[\s\S]*\}/);
    if (braceMatch) {
      // Clean trailing commas before closing braces/brackets
      const sanitized = braceMatch[0].replace(/,(\s*[}\]])/g, "$1");
      return JSON.parse(sanitized);
    }

    throw new Error("Could not parse AI layout response as JSON");
  }
}

/**
 * Call Together.ai for layout generation using the model chain.
 * Uses response_format: { type: 'json_object' } for reliable output.
 */
async function callTogetherForLayout(userPrompt) {
  let lastError = null;
  const modelChain = getLayoutModelChain();

  for (const modelConfig of modelChain) {
    const model = modelConfig.togetherModel;
    try {
      logger.info(`🧠 AI Layout: trying ${model}...`);

      const callOptions = {
        model,
        temperature: modelConfig.temperature,
        max_tokens: modelConfig.maxTokens,
      };

      // Only use response_format: json_object for models that support it
      // Qwen3-235B uses <think> tags instead — parseLayoutResponse() handles this
      if (modelConfig.supportsJsonMode) {
        callOptions.response_format = { type: "json_object" };
      }

      const response = await togetherAIReasoningService.chatCompletion(
        [
          { role: "system", content: LAYOUT_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        callOptions,
      );

      // Extract content from response
      const content =
        response?.choices?.[0]?.message?.content ||
        response?.content ||
        response?.text ||
        (typeof response === "string" ? response : null);

      if (!content) {
        throw new Error(`${model} returned empty response`);
      }

      const layout = parseLayoutResponse(content);

      // Basic structural validation
      if (!layout.levels || !Array.isArray(layout.levels)) {
        throw new Error(`${model} response missing levels array`);
      }

      logger.info(`✅ AI Layout: response from ${model}`, {
        levels: layout.levels.length,
        rooms: layout.levels.reduce(
          (sum, l) => sum + (l.rooms?.length || 0),
          0,
        ),
      });

      return { layout, model };
    } catch (err) {
      logger.warn(`⚠️ AI Layout: ${model} failed: ${err.message}`);
      lastError = err;
    }
  }

  throw new Error(
    `All AI layout models failed. Last error: ${lastError?.message}`,
  );
}

/**
 * Generate an AI-powered floor plan layout
 *
 * @param {Object} params
 * @param {Array} params.programSpaces - Room definitions with name, program, targetAreaM2, levelIndex
 * @param {Object} params.buildingEnvelope - { widthM, depthM, levelCount }
 * @param {Object} params.siteContext - { entranceSide, orientation, latitude }
 * @param {Object} params.styleContext - { vernacular, roofType }
 * @returns {Promise<Object>} Layout with levels[].rooms[].{x,y,width,depth}
 */
export async function generateFloorPlanLayout(params) {
  const { programSpaces, buildingEnvelope, siteContext, styleContext } = params;

  if (!programSpaces || programSpaces.length === 0) {
    throw new Error("No program spaces provided for AI layout");
  }

  logger.info("🧠 AI Floor Plan Layout Engine: generating layout...", {
    rooms: programSpaces.length,
    envelope: `${buildingEnvelope.widthM}m × ${buildingEnvelope.depthM}m`,
    levels: buildingEnvelope.levelCount,
  });

  const userPrompt = buildLayoutPrompt(
    programSpaces,
    buildingEnvelope,
    siteContext,
    styleContext,
  );

  // Call Together.ai model chain via registry (Qwen3 primary, Llama fallback)
  const { layout, model: usedModel } = await callTogetherForLayout(userPrompt);

  // Validate the layout
  const interiorWidth = (buildingEnvelope.widthM || 10) - 0.6;
  const interiorDepth = (buildingEnvelope.depthM || 8) - 0.6;

  const validation = validateAILayout(layout, {
    interiorWidth,
    interiorDepth,
    levelCount: buildingEnvelope.levelCount || 2,
    programSpaces,
  });

  if (!validation.valid) {
    logger.warn("⚠️ AI layout validation issues:", validation.errors);

    // If there are auto-fixed rooms, use the corrected layout
    if (validation.fixedLayout) {
      logger.info("🔧 AI layout auto-fixed, using corrected version");
      return validation.fixedLayout;
    }

    // If errors are critical, throw
    if (validation.critical) {
      throw new Error(
        `AI layout failed validation: ${validation.errors.join("; ")}`,
      );
    }
  }

  logger.success("✅ AI layout generated successfully", {
    model: usedModel,
    levels: layout.levels?.length,
    totalRooms: layout.levels?.reduce(
      (sum, l) => sum + (l.rooms?.length || 0),
      0,
    ),
    rationale: layout.designRationale?.substring(0, 100),
  });

  return layout;
}

export default { generateFloorPlanLayout };
