/**
 * Geometry Volume Reasoning Service
 *
 * Uses Qwen2.5-72B to reason about 3D building massing based on:
 * - Site constraints (polygon, area, orientation)
 * - Climate requirements (sun path, wind, thermal)
 * - Style preferences (architecture type, materials)
 * - Program needs (rooms, circulation, access)
 *
 * Outputs a structured 3D volume specification that resolves ambiguities
 * (e.g. "triangle roof + flat roof" → single coherent massing strategy)
 */

import togetherAIReasoningService from "./togetherAIReasoningService.js";
import logger from "../utils/logger.js";

class GeometryVolumeReasoning {
  constructor() {
    logger.info("🏗️  Geometry Volume Reasoning Service initialized");
  }

  /**
   * Generate 3D volume specification from DNA
   * Resolves ambiguities and creates a single coherent massing strategy
   */
  async generateVolumeSpecification(
    structuredDNA,
    projectContext,
    locationData,
  ) {
    logger.info("🏗️  Generating 3D volume specification...");

    const prompt = `You are an expert architect specializing in building massing and 3D volume design.

Given this project DNA, generate a SINGLE COHERENT 3D BUILDING VOLUME specification.

PROJECT DNA:
${JSON.stringify(structuredDNA, null, 2)}

PROJECT CONTEXT:
- Building Type: ${projectContext.buildingProgram || "residential"}
- Total Area: ${projectContext.area || 150}m²
- Site Area: ${structuredDNA.site.area_m2}m²
- Climate: ${structuredDNA.site.climate_zone}
- Location: ${locationData?.address || "Not specified"}

YOUR TASK:
1. Analyze the site, climate, and program requirements
2. Resolve any ambiguities (e.g., if roof type is unclear, choose ONE type)
3. Design a coherent 3D building volume that:
   - Fits within the site with proper setbacks
   - Responds to climate (sun path, wind, thermal)
   - Accommodates all program spaces
   - Follows the architectural style
   - Has a SINGLE, CLEAR massing strategy

OUTPUT REQUIREMENTS:
Return ONLY valid JSON (no markdown, no prose) with this structure:

{
  "massing": {
    "type": "single_volume|multi_wing|courtyard|L_shape|U_shape",
    "footprint_shape": "rectangular|L_shape|U_shape|custom",
    "floor_stacking": "uniform|setback|cantilever|stepped",
    "wings": [
      {
        "name": "main_volume",
        "length_m": number,
        "width_m": number,
        "floors": number,
        "orientation_deg": number
      }
    ]
  },
  "roof": {
    "type": "gable|hip|flat|shed|mansard|butterfly",
    "pitch_degrees": number,
    "overhang_m": number,
    "ridge_orientation": "north_south|east_west",
    "reasoning": "Why this roof type for this climate and style"
  },
  "facades": {
    "north": {
      "type": "primary|secondary|side|rear",
      "features": ["entrance", "windows", "balcony", ...],
      "window_count": number,
      "major_openings": ["entrance_door", "garage", ...],
      "character": "formal|informal|utilitarian"
    },
    "south": { ... },
    "east": { ... },
    "west": { ... }
  },
  "heights": {
    "ground_floor_m": number,
    "upper_floors_m": number,
    "parapet_m": number,
    "total_height_m": number
  },
  "volumes": [
    {
      "id": "main_block",
      "position": {"x": 0, "y": 0, "z": 0},
      "dimensions": {"length": number, "width": number, "height": number},
      "floors": number,
      "roof_type": "string"
    }
  ],
  "reasoning": {
    "massing_strategy": "Why this massing approach",
    "roof_choice": "Why this roof type",
    "facade_hierarchy": "Why these facade priorities",
    "climate_response": "How design responds to climate"
  }
}

CRITICAL RULES:
1. Choose ONE roof type (not multiple)
2. Ensure total building height fits within site constraints
3. All facades must have clear hierarchy (primary/secondary/side)
4. Window counts must be realistic for room count
5. Massing must fit within site area with 3m setbacks
6. Design must be buildable and structurally sound

Generate the volume specification now (JSON only):`;

    try {
      const response = await togetherAIReasoningService.chatCompletion(
        [{ role: "user", content: prompt }],
        {
          model: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
          temperature: 0.2, // Low temperature for deterministic massing
          max_tokens: 3000,
        },
      );

      const content = response.choices?.[0]?.message?.content || "";

      // Extract JSON
      let jsonStr = content.trim();
      if (jsonStr.startsWith("```")) {
        const match = jsonStr.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
        if (match) {
          jsonStr = match[1];
        }
      }

      const volumeSpec = JSON.parse(jsonStr);

      logger.success("✅ Volume specification generated");
      logger.info("   Massing: " + (volumeSpec.massing?.type || "N/A"));
      logger.info(
        "   Roof: " +
          (volumeSpec.roof?.type || "N/A") +
          " @ " +
          (volumeSpec.roof?.pitch_degrees || 0) +
          "°",
      );
      logger.info(
        "   Primary facade: " + this.findPrimaryFacade(volumeSpec.facades),
      );

      return {
        success: true,
        volumeSpec,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error("❌ Volume specification generation failed:", error.message);

      // Return deterministic fallback based on DNA
      const fallbackSpec = this.createFallbackVolumeSpec(
        structuredDNA,
        projectContext,
      );

      return {
        success: false,
        error: error.message,
        volumeSpec: fallbackSpec,
        isFallback: true,
      };
    }
  }

  /**
   * Find primary facade from volume spec
   */
  findPrimaryFacade(facades) {
    if (!facades) return "unknown";

    for (const [direction, spec] of Object.entries(facades)) {
      if (spec.type === "primary") {
        return direction;
      }
    }

    return "north"; // Default
  }

  /**
   * Create fallback volume specification
   * Deterministic fallback when AI reasoning fails
   */
  createFallbackVolumeSpec(structuredDNA, projectContext) {
    logger.warn("Creating fallback volume specification");

    const floors = structuredDNA.program.floors || 2;
    const roofType = structuredDNA.geometry_rules?.roof_type || "gable";

    return {
      massing: {
        type: "single_volume",
        footprint_shape: "rectangular",
        floor_stacking: "uniform",
        wings: [
          {
            name: "main_volume",
            length_m: 15,
            width_m: 10,
            floors: floors,
            orientation_deg: 0,
          },
        ],
      },
      roof: {
        type: roofType,
        pitch_degrees: roofType === "flat" ? 0 : 35,
        overhang_m: 0.5,
        ridge_orientation: "north_south",
        reasoning: "Fallback roof specification",
      },
      facades: {
        north: {
          type: "primary",
          features: ["entrance", "windows"],
          window_count: 4,
          major_openings: ["entrance_door"],
          character: "formal",
        },
        south: {
          type: "secondary",
          features: ["windows"],
          window_count: 3,
          major_openings: [],
          character: "informal",
        },
        east: {
          type: "side",
          features: ["windows"],
          window_count: 2,
          major_openings: [],
          character: "utilitarian",
        },
        west: {
          type: "side",
          features: ["windows"],
          window_count: 2,
          major_openings: [],
          character: "utilitarian",
        },
      },
      heights: {
        ground_floor_m: 3.0,
        upper_floors_m: 2.7,
        parapet_m: 0.3,
        total_height_m: floors * 2.85,
      },
      volumes: [
        {
          id: "main_block",
          position: { x: 0, y: 0, z: 0 },
          dimensions: { length: 15, width: 10, height: floors * 2.85 },
          floors: floors,
          roof_type: roofType,
        },
      ],
      reasoning: {
        massing_strategy: "Simple rectangular volume for efficient space use",
        roof_choice: `${roofType} roof based on geometry_rules`,
        facade_hierarchy:
          "North primary (entrance), south secondary (garden), sides utilitarian",
        climate_response: "Standard climate response",
      },
      isFallback: true,
    };
  }
}

// Export singleton instance
const geometryVolumeReasoning = new GeometryVolumeReasoning();
export default geometryVolumeReasoning;
