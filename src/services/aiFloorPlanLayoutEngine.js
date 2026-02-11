/**
 * AI Floor Plan Layout Engine
 *
 * Uses LLM (Qwen3 / Llama 3.3 fallback) to generate intelligent room
 * coordinates considering adjacency, circulation, daylight, and UK building regs.
 *
 * Replaces the zone-based strip-packing algorithm in BuildingModel._buildRooms()
 * with architecturally-aware placements.
 */

import togetherAIReasoningService from "./togetherAIReasoningService.js";
import { validateAILayout } from "./aiLayoutValidator.js";
import logger from "../utils/logger.js";

// Model fallback chain — try each in order until one succeeds
const LAYOUT_MODELS = [
  "Qwen/Qwen3-235B-A22B",
  "meta-llama/Llama-3.3-70B-Instruct-Turbo",
  "mistralai/Mixtral-8x22B-Instruct-v0.1",
];

const LAYOUT_SYSTEM_PROMPT = `You are a UK residential architect specialising in spatial planning.
Given a building program (rooms with target areas) and an envelope, produce a JSON floor plan layout.

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

OUTPUT FORMAT — strict JSON, no prose:
{
  "levels": [
    {
      "index": 0,
      "name": "Ground Floor",
      "rooms": [
        {
          "name": "Hallway",
          "program": "hallway",
          "x": 0.0,
          "y": 0.0,
          "width": 1.2,
          "depth": 6.0,
          "hasExternalWall": true,
          "adjacentTo": ["Living Room", "Kitchen", "WC"]
        }
      ]
    }
  ],
  "staircase": { "x": 0.0, "y": 2.5, "width": 1.0, "depth": 2.5 },
  "designRationale": "Brief explanation of layout decisions"
}`;

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

Return ONLY the JSON layout, no commentary.`;

  return prompt;
}

/**
 * Parse AI response and extract layout JSON
 */
function parseLayoutResponse(responseText) {
  // Try direct parse first
  try {
    return JSON.parse(responseText);
  } catch {
    // Try to extract JSON from markdown code blocks
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1].trim());
      } catch {
        // Fall through
      }
    }

    // Try to find JSON object in response
    const braceMatch = responseText.match(/\{[\s\S]*\}/);
    if (braceMatch) {
      // Clean trailing commas
      const cleaned = braceMatch[0].replace(/,(\s*[}\]])/g, "$1");
      return JSON.parse(cleaned);
    }

    throw new Error("Could not parse AI layout response as JSON");
  }
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

  // Try each model in the fallback chain until one succeeds
  let response = null;
  let usedModel = null;

  for (const model of LAYOUT_MODELS) {
    try {
      logger.info(`🧠 AI Layout: trying model ${model}...`);
      response = await togetherAIReasoningService.chatCompletion(
        [
          { role: "system", content: LAYOUT_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        {
          model,
          temperature: 0.3,
          max_tokens: 4000,
        },
      );
      usedModel = model;
      break; // Success — stop trying
    } catch (modelErr) {
      logger.warn(`⚠️ AI Layout: model ${model} failed: ${modelErr.message}`);
      if (model === LAYOUT_MODELS[LAYOUT_MODELS.length - 1]) {
        throw modelErr; // Last model — propagate error
      }
      // Continue to next model
    }
  }

  logger.info(`✅ AI Layout: response from ${usedModel}`);

  // Extract content from response
  const content =
    response?.choices?.[0]?.message?.content ||
    response?.content ||
    response?.text ||
    (typeof response === "string" ? response : null);

  if (!content) {
    throw new Error("AI layout engine returned empty response");
  }

  const layout = parseLayoutResponse(content);

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
