/**
 * AI Floor Plan Layout Engine
 *
 * Uses Claude Sonnet (primary) with Together.ai fallback to generate intelligent
 * room coordinates considering adjacency, circulation, daylight, and UK building regs.
 *
 * Claude uses tool_choice for guaranteed JSON schema compliance.
 * Together.ai models (Llama-3.3, Mixtral) serve as fallback chain.
 *
 * Replaces the zone-based strip-packing algorithm in BuildingModel._buildRooms()
 * with architecturally-aware placements.
 */

import togetherAIReasoningService from "./togetherAIReasoningService.js";
import { validateAILayout } from "./aiLayoutValidator.js";
import logger from "../utils/logger.js";
import runtimeEnv from "../utils/runtimeEnv.js";

// ─── API Configuration ───────────────────────────────────────────────
const ANTHROPIC_API_URL = runtimeEnv.isBrowser
  ? "/api/anthropic-messages"
  : "http://localhost:3001/api/anthropic/messages";

// Together.ai fallback chain — try each in order if Claude fails
const TOGETHER_FALLBACK_MODELS = [
  "meta-llama/Llama-3.3-70B-Instruct-Turbo",
  "mistralai/Mixtral-8x22B-Instruct-v0.1",
];

// ─── Claude Tool Schema ──────────────────────────────────────────────
// Guarantees structured JSON output via forced tool_choice
const LAYOUT_TOOL = {
  name: "submit_floor_plan_layout",
  description:
    "Submit a validated floor plan layout with precise room coordinates for a UK residential building",
  input_schema: {
    type: "object",
    properties: {
      levels: {
        type: "array",
        description: "Array of building levels, each with positioned rooms",
        items: {
          type: "object",
          properties: {
            index: {
              type: "integer",
              description: "Floor index (0 = ground)",
            },
            name: {
              type: "string",
              description: "Level name (e.g. Ground Floor, First Floor)",
            },
            rooms: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: {
                    type: "string",
                    description: "Room name (e.g. Living Room, Kitchen)",
                  },
                  program: {
                    type: "string",
                    description:
                      "Room program type (e.g. living, kitchen, bedroom, hallway)",
                  },
                  zoneType: {
                    type: "string",
                    enum: ["living", "sleeping", "service", "circulation"],
                    description: "Functional zone classification",
                  },
                  x: {
                    type: "number",
                    description:
                      "X position in metres from interior SW corner (East)",
                  },
                  y: {
                    type: "number",
                    description:
                      "Y position in metres from interior SW corner (North)",
                  },
                  width: {
                    type: "number",
                    description: "Room width in metres (E-W dimension)",
                  },
                  depth: {
                    type: "number",
                    description: "Room depth in metres (N-S dimension)",
                  },
                  hasExternalWall: {
                    type: "boolean",
                    description: "Whether the room touches an external wall",
                  },
                  adjacentTo: {
                    type: "array",
                    items: { type: "string" },
                    description: "Names of rooms this room is adjacent to",
                  },
                },
                required: ["name", "program", "x", "y", "width", "depth"],
              },
            },
          },
          required: ["index", "name", "rooms"],
        },
      },
      staircase: {
        type: "object",
        description:
          "Staircase position (same on every floor for multi-storey)",
        properties: {
          x: { type: "number" },
          y: { type: "number" },
          width: { type: "number" },
          depth: { type: "number" },
        },
      },
      designRationale: {
        type: "string",
        description: "Brief explanation of layout decisions",
      },
    },
    required: ["levels"],
  },
};

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
8. ZONE TYPES: Classify each room as "living", "sleeping", "service", or "circulation"`;

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

Return the layout with precise room coordinates.`;

  return prompt;
}

/**
 * Parse AI response and extract layout JSON (for Together.ai text responses)
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
 * Call Claude Sonnet with tool_choice for guaranteed structured JSON layout
 */
async function callClaudeForLayout(userPrompt) {
  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      temperature: 0.3,
      system: LAYOUT_SYSTEM_PROMPT,
      tools: [LAYOUT_TOOL],
      tool_choice: { type: "tool", name: "submit_floor_plan_layout" },
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    const errMsg =
      errData?.error?.message || errData?.error || `HTTP ${response.status}`;
    throw new Error(`Claude API error: ${errMsg}`);
  }

  const data = await response.json();

  // Extract tool_use block — guaranteed by tool_choice
  const toolBlock = data.content?.find((b) => b.type === "tool_use");
  if (!toolBlock || !toolBlock.input) {
    throw new Error(
      "Claude did not return tool_use block — unexpected response format",
    );
  }

  // toolBlock.input is already a parsed object matching LAYOUT_TOOL schema
  return toolBlock.input;
}

/**
 * Fall back to Together.ai model chain for layout generation
 */
async function callTogetherForLayout(userPrompt) {
  let response = null;
  let usedModel = null;

  for (const model of TOGETHER_FALLBACK_MODELS) {
    try {
      logger.info(`🧠 AI Layout fallback: trying ${model}...`);
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
      break;
    } catch (modelErr) {
      logger.warn(
        `⚠️ AI Layout fallback: ${model} failed: ${modelErr.message}`,
      );
      if (
        model === TOGETHER_FALLBACK_MODELS[TOGETHER_FALLBACK_MODELS.length - 1]
      ) {
        throw modelErr;
      }
    }
  }

  // Extract content from response
  const content =
    response?.choices?.[0]?.message?.content ||
    response?.content ||
    response?.text ||
    (typeof response === "string" ? response : null);

  if (!content) {
    throw new Error("Together.ai layout engine returned empty response");
  }

  return { layout: parseLayoutResponse(content), model: usedModel };
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

  // Try Claude Sonnet first (guaranteed JSON via tool_choice)
  let layout = null;
  let usedModel = null;

  try {
    logger.info("🧠 AI Layout: trying Claude Sonnet (tool_choice)...");
    layout = await callClaudeForLayout(userPrompt);
    usedModel = "claude-sonnet-4";
    logger.info("✅ AI Layout: response from Claude Sonnet");
  } catch (claudeErr) {
    logger.warn(
      `⚠️ Claude layout failed: ${claudeErr.message} — falling back to Together.ai`,
    );

    // Fall back to Together.ai model chain
    try {
      const result = await callTogetherForLayout(userPrompt);
      layout = result.layout;
      usedModel = result.model;
      logger.info(`✅ AI Layout: response from Together.ai ${usedModel}`);
    } catch (togetherErr) {
      throw new Error(
        `All AI layout models failed. Claude: ${claudeErr.message}. Together: ${togetherErr.message}`,
      );
    }
  }

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
