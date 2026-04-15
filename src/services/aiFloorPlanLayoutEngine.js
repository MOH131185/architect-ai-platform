/**
 * AI Floor Plan Layout Engine
 *
 * Produces a validated spatial graph first, then generates room positions from
 * that graph, then evaluates architectural quality and retries weak layouts.
 */

import {
  flattenSpatialGraphRooms,
  validateSpatialGraph,
} from "../schemas/spatialGraph.js";
import { isFeatureEnabled } from "../config/featureFlags.js";
import logger from "../utils/logger.js";
import { validateAILayout } from "./aiLayoutValidator.js";
import { buildHouseExpoReferenceBlock } from "./layoutReferenceService.js";
import { getFallbackChain, getModelConfig } from "./modelRegistry.js";
import { evaluateFloorPlan } from "./qualityEvaluator.js";
import togetherAIReasoningService from "./togetherAIReasoningService.js";

const LEGACY_LAYOUT_MODELS = [
  "meta-llama/Llama-3.3-70B-Instruct-Turbo",
  "Qwen/Qwen2.5-7B-Instruct-Turbo",
];

const MIN_ACCEPTABLE_LAYOUT_QUALITY = 60;

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

const SPATIAL_GRAPH_SYSTEM_PROMPT = `You are a UK residential architect AI.
Given a building program, site context, and climate constraints, output a VALID JSON spatial graph.

You MUST respond with ONLY valid JSON. No markdown, no prose, no explanation.

Required JSON structure:
{
  "building": {
    "floors": [
      {
        "level": 0,
        "height_m": 3.0,
        "rooms": [
          {
            "id": "living_room",
            "type": "living",
            "area_m2": 25,
            "min_width_m": 4,
            "min_length_m": 5,
            "adjacencies": ["kitchen", "hallway"],
            "orientation": "south",
            "natural_light": true,
            "requirements": ["open_plan_with_kitchen"]
          }
        ],
        "circulation": {
          "entry_from": "street",
          "vertical": ["staircase_01"],
          "corridors": true
        }
      }
    ],
    "envelope": {
      "width_m": 12,
      "depth_m": 10,
      "style": "modern",
      "roof_type": "flat"
    }
  }
}

Each room MUST have: id, type, area_m2, min_width_m, min_length_m, adjacencies, orientation, natural_light.
Room types: living, dining, kitchen, bedroom, bathroom, wc, hallway, staircase, garage, terrace, balcony, office, laundry, storage, utility.

Rules:
- Kitchen must be adjacent to dining or living
- Bathrooms do not require natural light
- Living rooms should face south when possible
- Total room areas must not exceed envelope width * depth per floor
- Include circulation connecting non-adjacent rooms
- Wet rooms (bathroom, WC, en-suite, utility, kitchen) must cluster near a shared plumbing stack — place them within 3m of each other
- Bedrooms must NOT directly adjoin public rooms (living, kitchen, dining) — always use a hallway or landing as buffer
- Kitchen should be adjacent to utility or laundry when present
- En-suite must be directly adjacent to its parent bedroom
- Ground floor WC/cloakroom must be accessible from the hallway`;

const LAYOUT_SYSTEM_PROMPT = `You are a UK residential architect specialising in spatial planning.
Given a validated spatial graph and an envelope, place every room as a non-overlapping rectangle.

COORDINATE SYSTEM:
- Origin (0,0) = interior SW corner
- X increases East, Y increases North
- All dimensions in metres
- Rooms must fit within the interior envelope
- Leave 0.1m gaps between adjacent rooms for partition walls

ARCHITECTURAL RULES:
1. Respect the provided room IDs exactly
2. Respect all required adjacencies whenever possible
3. Respect orientation preferences and natural-light needs
4. Hallway/landing must form a usable circulation spine
5. Staircase must align on every floor if more than one level exists
6. No room narrower than its minimum width or minimum length
7. Aim for room areas within +/-15% of target area_m2
8. Cluster wet rooms (bathroom, WC, en-suite, utility, kitchen) within a 3m radius — this represents plumbing stack alignment
9. Separate public zone (living, dining, kitchen) from private zone (bedrooms) with a circulation buffer (hallway/landing) — never place a bedroom directly adjacent to a living room or kitchen
10. Align room edges to a 0.6m grid where possible (standard UK masonry module)
11. Ensure at least 0.8m clearance around door positions — no room should be narrower than 1.2m at the door location

CRITICAL OUTPUT FORMAT:
You MUST respond with ONLY a valid JSON object. No prose, no explanation.
{
  "levels": [
    {
      "index": 0,
      "name": "Ground Floor",
      "rooms": [
        {
          "id": "living_room",
          "name": "Living Room",
          "program": "living",
          "zoneType": "living",
          "x": 0.0,
          "y": 4.0,
          "width": 5.5,
          "depth": 4.0,
          "hasExternalWall": true,
          "adjacentTo": ["hallway", "kitchen"]
        }
      ]
    }
  ],
  "staircase": { "x": 4.0, "y": 0.0, "width": 1.0, "depth": 2.5 },
  "designRationale": "Brief explanation of layout decisions"
}`;

function normalizeRoomId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function toTitleCase(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function buildClimatePromptBlock(climateContext) {
  if (!climateContext?.climate) {
    return "";
  }

  const recommendations =
    climateContext.design_recommendations ||
    climateContext.designRecommendations ||
    {};

  return `
SITE CLIMATE DATA:
- Climate zone: ${climateContext.climate.zone || "unknown"}
- Summer temp: ${climateContext.climate.avg_temp_c?.summer ?? "unknown"}C
- Winter temp: ${climateContext.climate.avg_temp_c?.winter ?? "unknown"}C
- Summer sun altitude: ${climateContext.climate.sun_path?.summer_altitude ?? "unknown"} degrees
- Prevailing wind: ${climateContext.climate.prevailing_wind?.direction || "unknown"}
- Annual rainfall: ${climateContext.climate.rainfall_mm_annual ?? "unknown"}mm

DESIGN RULES:
- ${recommendations.orientation || "Orient main living spaces for balanced daylight"}
- ${recommendations.shading || "Provide external shading where solar gain is strongest"}
- ${recommendations.ventilation || "Use cross-ventilation where possible"}
- ${recommendations.materials || "Choose materials appropriate to climate swing"}
- ${recommendations.glazing || "Balance solar gain against overheating risk"}`;
}

function buildSpatialGraphPrompt(
  programSpaces,
  envelope,
  siteContext,
  styleContext,
  climateContext,
  buildingType,
) {
  const interiorWidth = Number((envelope.widthM || 10) - 0.6).toFixed(1);
  const interiorDepth = Number((envelope.depthM || 8) - 0.6).toFixed(1);
  const levelCount = envelope.levelCount || 1;
  const entranceSide = siteContext?.entranceSide || "S";
  const groupedRooms = {};

  for (const room of programSpaces) {
    const levelIndex = room.levelIndex || 0;
    if (!groupedRooms[levelIndex]) {
      groupedRooms[levelIndex] = [];
    }

    const roomId = normalizeRoomId(room.id || room.name || room.program);
    const roomType = normalizeRoomId(
      room.program || room.category || room.name,
    );
    const targetArea = Number(room.targetAreaM2 || room.area || 15);
    const minDimension = roomType === "wc" ? 1.2 : 2.4;
    groupedRooms[levelIndex].push({
      id: roomId,
      label: room.name || toTitleCase(roomId),
      roomType,
      targetArea,
      minWidth: Number(room.minWidthM || minDimension).toFixed(1),
      minLength: Number(room.minLengthM || minDimension).toFixed(1),
    });
  }

  const referenceBlock = isFeatureEnabled("layoutReferenceCorpus")
    ? buildHouseExpoReferenceBlock({ programSpaces, buildingType })
    : "";

  let prompt = `Generate a spatial graph for a ${levelCount}-storey building.

ENVELOPE:
- Interior width: ${interiorWidth}m
- Interior depth: ${interiorDepth}m
- Levels: ${levelCount}
- Entrance side: ${entranceSide}
- Style: ${styleContext?.vernacular || "contemporary"}
- Roof type: ${styleContext?.roofType || "gable"}

PROGRAM:
`;

  for (let level = 0; level < levelCount; level += 1) {
    const floorRooms = groupedRooms[level] || [];
    prompt += `\nLEVEL ${level}:\n`;
    for (const room of floorRooms) {
      prompt += `- ${room.label} | id=${room.id} | type=${room.roomType} | area=${room.targetArea.toFixed(1)}m2 | min_width=${room.minWidth}m | min_length=${room.minLength}m\n`;
    }
  }

  prompt += `
${buildClimatePromptBlock(climateContext)}
${referenceBlock ? `\n${referenceBlock}\n` : ""}

Output the spatial graph JSON only.`;

  return prompt;
}

function buildLayoutPromptFromGraph(
  spatialGraph,
  siteContext,
  styleContext,
  climateContext,
) {
  const floors = spatialGraph?.building?.floors || [];
  const envelope = spatialGraph?.building?.envelope || {};
  const referenceProgramSpaces = flattenSpatialGraphRooms(spatialGraph).map(
    (room) => ({
      name: room.id,
      type: room.type,
      program: room.type,
    }),
  );
  const referenceBlock = isFeatureEnabled("layoutReferenceCorpus")
    ? buildHouseExpoReferenceBlock({
        programSpaces: referenceProgramSpaces,
        buildingType: spatialGraph?.building?.type,
      })
    : "";

  let prompt = `Lay out this validated spatial graph in a ${Number(envelope.width_m || 10).toFixed(1)}m x ${Number(envelope.depth_m || 8).toFixed(1)}m interior envelope.
- Entrance side: ${siteContext?.entranceSide || "S"}
- Style: ${styleContext?.vernacular || envelope.style || "contemporary"}
- Roof type: ${styleContext?.roofType || envelope.roof_type || "gable"}
${buildClimatePromptBlock(climateContext)}
${referenceBlock ? `${referenceBlock}\n` : ""}

SPATIAL GRAPH:
`;

  floors.forEach((floor) => {
    prompt += `\nLEVEL ${floor.level} (height ${floor.height_m}m):\n`;
    (floor.rooms || []).forEach((room) => {
      prompt += `- id=${room.id} | type=${room.type} | area=${room.area_m2}m2 | min_width=${room.min_width_m}m | min_length=${room.min_length_m}m | orientation=${room.orientation} | natural_light=${room.natural_light} | adj=${(room.adjacencies || []).join(",")}\n`;
    });
    if (floor.circulation) {
      prompt += `  circulation.entry_from=${floor.circulation.entry_from || "street"} | circulation.vertical=${(floor.circulation.vertical || []).join(",")} | corridors=${floor.circulation.corridors}\n`;
    }
  });

  prompt += `\nReturn only the layout JSON.`;
  return prompt;
}

function stripThinkingTags(text) {
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

function parseJsonResponse(responseText) {
  const cleaned = stripThinkingTags(responseText);

  try {
    return JSON.parse(cleaned);
  } catch {
    const jsonMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1].trim());
      } catch {
        // continue to brace extraction
      }
    }

    const braceMatch = cleaned.match(/\{[\s\S]*\}/);
    if (braceMatch) {
      const sanitized = braceMatch[0].replace(/,(\s*[}\]])/g, "$1");
      return JSON.parse(sanitized);
    }

    throw new Error("Could not parse AI response as JSON");
  }
}

async function callTogetherForJson(systemPrompt, userPrompt, purpose) {
  let lastError = null;
  const modelChain = getLayoutModelChain();

  for (const modelConfig of modelChain) {
    const model = modelConfig.togetherModel;
    try {
      logger.info(`🧠 ${purpose}: trying ${model}...`);

      const callOptions = {
        model,
        temperature: modelConfig.temperature,
        max_tokens: modelConfig.maxTokens,
      };

      if (modelConfig.supportsJsonMode) {
        callOptions.response_format = { type: "json_object" };
      }

      const response = await togetherAIReasoningService.chatCompletion(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        callOptions,
      );

      const content =
        response?.choices?.[0]?.message?.content ||
        response?.content ||
        response?.text ||
        (typeof response === "string" ? response : null);

      if (!content) {
        throw new Error(`${model} returned empty response`);
      }

      return {
        payload: parseJsonResponse(content),
        model,
      };
    } catch (error) {
      logger.warn(`⚠️ ${purpose}: ${model} failed: ${error.message}`);
      lastError = error;
    }
  }

  throw new Error(
    `All AI layout models failed. Last error: ${lastError?.message}`,
  );
}

async function generateSpatialGraph({
  programSpaces,
  buildingEnvelope,
  siteContext,
  styleContext,
  climateContext,
  buildingType,
}) {
  const prompt = buildSpatialGraphPrompt(
    programSpaces,
    buildingEnvelope,
    siteContext,
    styleContext,
    climateContext,
    buildingType,
  );

  let { payload, model } = await callTogetherForJson(
    SPATIAL_GRAPH_SYSTEM_PROMPT,
    prompt,
    "Spatial graph",
  );

  let validation = validateSpatialGraph(payload, { buildingType });
  if (validation.valid) {
    return { spatialGraph: payload, model };
  }

  logger.warn("Spatial graph validation failed, retrying once", validation);
  const retryPrompt = `${prompt}\n\nYour previous response was invalid for these reasons: ${validation.errors.join("; ")}.\nReturn corrected JSON only.`;
  const retried = await callTogetherForJson(
    SPATIAL_GRAPH_SYSTEM_PROMPT,
    retryPrompt,
    "Spatial graph retry",
  );
  payload = retried.payload;
  model = retried.model;
  validation = validateSpatialGraph(payload, { buildingType });

  if (!validation.valid) {
    throw new Error(
      `Spatial graph validation failed: ${validation.errors.join("; ")}`,
    );
  }

  return { spatialGraph: payload, model };
}

export async function generateFloorPlanLayout(params) {
  const {
    programSpaces,
    buildingEnvelope,
    siteContext,
    styleContext,
    climateContext,
  } = params;

  if (!programSpaces || programSpaces.length === 0) {
    throw new Error("No program spaces provided for AI layout");
  }

  logger.info("🧠 AI Floor Plan Layout Engine: generating layout...", {
    rooms: programSpaces.length,
    envelope: `${buildingEnvelope.widthM}m × ${buildingEnvelope.depthM}m`,
    levels: buildingEnvelope.levelCount,
  });

  const { spatialGraph, model: spatialGraphModel } = await generateSpatialGraph(
    {
      programSpaces,
      buildingEnvelope,
      siteContext,
      styleContext,
      climateContext,
      buildingType: params.buildingType || params.projectType || "residential",
    },
  );

  const interiorWidth = (buildingEnvelope.widthM || 10) - 0.6;
  const interiorDepth = (buildingEnvelope.depthM || 8) - 0.6;

  let bestResult = null;
  let lastError = null;
  let previousFeedback = "";

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      let prompt = buildLayoutPromptFromGraph(
        spatialGraph,
        siteContext,
        styleContext,
        climateContext,
      );

      if (previousFeedback) {
        prompt += previousFeedback;
      }

      const { payload: layout, model: layoutModel } = await callTogetherForJson(
        LAYOUT_SYSTEM_PROMPT,
        prompt,
        `AI layout attempt ${attempt}`,
      );

      const validation = validateAILayout(layout, {
        interiorWidth,
        interiorDepth,
        levelCount: buildingEnvelope.levelCount || 2,
        programSpaces,
      });

      let resolvedLayout = layout;
      if (!validation.valid) {
        logger.warn("⚠️ AI layout validation issues:", validation.errors);
        if (validation.fixedLayout) {
          resolvedLayout = validation.fixedLayout;
        } else if (validation.critical) {
          throw new Error(
            `AI layout failed validation: ${validation.errors.join("; ")}`,
          );
        }
      }

      const allowedMajorAreaMismatches = Math.max(
        1,
        Math.floor((programSpaces?.length || 0) * 0.15),
      );
      if (
        validation.severeAreaMismatchCount > 0 ||
        validation.majorAreaMismatchCount > allowedMajorAreaMismatches
      ) {
        throw new Error(
          `AI layout area fidelity too weak (${validation.majorAreaMismatchCount} major / ${validation.severeAreaMismatchCount} severe mismatches)`,
        );
      }

      const qualityEvaluation = evaluateFloorPlan(spatialGraph, resolvedLayout);
      const candidate = {
        layout: resolvedLayout,
        layoutModel,
        validation,
        qualityEvaluation: {
          ...qualityEvaluation,
          attempts: attempt,
        },
      };

      if (
        !bestResult ||
        candidate.qualityEvaluation.total > bestResult.qualityEvaluation.total
      ) {
        bestResult = candidate;
      }

      if (
        candidate.qualityEvaluation.total >= MIN_ACCEPTABLE_LAYOUT_QUALITY &&
        candidate.validation.majorAreaMismatchCount <=
          allowedMajorAreaMismatches
      ) {
        break;
      }

      logger.warn(
        `⚠️ AI layout quality below threshold on attempt ${attempt}: ${candidate.qualityEvaluation.total}/100`,
      );

      // Feed quality issues back into the next attempt
      const issues = candidate.qualityEvaluation.explanations || [];
      if (issues.length > 0) {
        previousFeedback =
          `\n\nPrevious attempt scored ${candidate.qualityEvaluation.total}/100. Issues to fix:\n` +
          issues.map((e) => `- ${e}`).join("\n") +
          "\nFix these issues in the next layout.";
      }
    } catch (error) {
      lastError = error;
      logger.warn(`⚠️ AI layout attempt ${attempt} failed`, error);
    }
  }

  if (!bestResult) {
    throw new Error(lastError?.message || "AI layout generation failed");
  }

  logger.success("✅ AI layout generated successfully", {
    model: bestResult.layoutModel,
    spatialGraphModel,
    levels: bestResult.layout.levels?.length,
    totalRooms: bestResult.layout.levels?.reduce(
      (sum, level) => sum + (level.rooms?.length || 0),
      0,
    ),
    qualityScore: bestResult.qualityEvaluation.total,
  });

  return {
    ...bestResult.layout,
    spatialGraph,
    qualityEvaluation: bestResult.qualityEvaluation,
    climateContext,
    _spatialGraphModel: spatialGraphModel,
    _layoutModel: bestResult.layoutModel,
    _flattenedSpatialRooms: flattenSpatialGraphRooms(spatialGraph),
  };
}

export default { generateFloorPlanLayout };
