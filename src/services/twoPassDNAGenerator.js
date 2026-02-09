/**
 * Two-Pass DNA Generator
 *
 * Implements strict two-pass DNA generation using Qwen2.5-72B:
 * - Pass A (Author): Generate structured JSON DNA
 * - Pass B (Reviewer): Validate and repair DNA
 *
 * NO FALLBACK DNA - errors are surfaced to the user.
 */

import togetherAIReasoningService from "./togetherAIReasoningService.js";
import {
  buildDNARequestPayload,
  normalizeRawDNA,
  validateDNASchema,
  convertToLegacyDNA,
  freezeDNA,
} from "./dnaSchema.js";
import { repairDNA } from "./dnaRepair.js";
import geometryVolumeReasoning from "./geometryVolumeReasoning.js";
import { isFeatureEnabled } from "../config/featureFlags.js";
import logger from "../utils/logger.js";

class TwoPassDNAGenerator {
  constructor() {
    logger.info("🧬 Two-Pass DNA Generator initialized");
  }

  /**
   * Sanitize JSON string to fix common LLM output issues
   * - Removes control characters inside string literals
   * - Fixes unescaped newlines/tabs in strings
   * - Handles trailing commas
   */
  sanitizeJsonString(jsonStr) {
    if (!jsonStr) return jsonStr;

    // Remove any BOM or zero-width characters
    let sanitized = jsonStr
      .replace(/^\uFEFF/, "")
      .replace(/[\u200B-\u200D\uFEFF]/g, "");

    // Fix control characters inside JSON strings
    // This regex finds string literals and escapes control chars within them
    sanitized = sanitized.replace(/"([^"\\]*(\\.[^"\\]*)*)"/g, (match) => {
      // Inside the string, escape unescaped control characters
      return match
        .replace(/\r\n/g, "\\n") // Windows newlines
        .replace(/\r/g, "\\n") // Old Mac newlines
        .replace(/\n/g, "\\n") // Unix newlines (unescaped)
        .replace(/\t/g, "\\t") // Tabs
        .replace(/[\x00-\x1F\x7F]/g, (char) => {
          // Escape other control characters
          const hex = char.charCodeAt(0).toString(16).padStart(4, "0");
          return `\\u${hex}`;
        });
    });

    // Remove trailing commas before } or ]
    sanitized = sanitized.replace(/,(\s*[}\]])/g, "$1");

    return sanitized;
  }

  normaliseProgramFloor(rawFloor) {
    if (typeof rawFloor === "number" && Number.isFinite(rawFloor)) {
      if (rawFloor <= -1) return "basement";
      if (rawFloor === 0) return "ground";
      if (rawFloor === 1) return "first";
      if (rawFloor === 2) return "second";
      if (rawFloor === 3) return "third";
      return `${rawFloor}th`;
    }

    const normalized = String(rawFloor || "")
      .trim()
      .toLowerCase();

    if (!normalized) return "ground";
    if (normalized === "g" || normalized.startsWith("ground")) return "ground";
    if (
      normalized === "b" ||
      normalized.includes("basement") ||
      normalized.includes("lower")
    )
      return "basement";
    if (
      normalized === "1" ||
      normalized === "1st" ||
      normalized.startsWith("first")
    )
      return "first";
    if (
      normalized === "2" ||
      normalized === "2nd" ||
      normalized.startsWith("second")
    )
      return "second";
    if (
      normalized === "3" ||
      normalized === "3rd" ||
      normalized.startsWith("third")
    )
      return "third";

    return normalized;
  }

  floorToIndex(floorName) {
    const normalized = this.normaliseProgramFloor(floorName);
    if (normalized === "basement") return -1;
    if (normalized === "ground") return 0;
    if (normalized === "first") return 1;
    if (normalized === "second") return 2;
    if (normalized === "third") return 3;
    const parsed = parseInt(normalized, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  normalizeAreaM2(value, fallback = 20) {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  expandLockedProgramRooms(programSpaces = []) {
    if (!Array.isArray(programSpaces) || programSpaces.length === 0) {
      return [];
    }

    const expanded = [];

    for (const raw of programSpaces) {
      const baseName =
        String(raw?.name || raw?.type || "Room").trim() || "Room";
      const parsedCount = parseInt(raw?.count, 10);
      const count =
        Number.isFinite(parsedCount) && parsedCount > 0 ? parsedCount : 1;
      const area_m2 = this.normalizeAreaM2(
        raw?.area ?? raw?.area_m2 ?? raw?.targetAreaM2,
        20,
      );
      const floor = this.normaliseProgramFloor(
        raw?.floor ?? raw?.level ?? raw?.lockedLevel ?? raw?.levelName,
      );
      const orientation = String(
        raw?.preferredOrientation || raw?.orientation || "any",
      );
      const hasNumericSuffix = /\d+$/.test(baseName);

      for (let i = 0; i < count; i++) {
        const name =
          count > 1 && !hasNumericSuffix ? `${baseName} ${i + 1}` : baseName;
        expanded.push({ name, area_m2, floor, orientation });
      }
    }

    return expanded;
  }

  buildProgramScheduleText(programRooms = []) {
    if (!Array.isArray(programRooms) || programRooms.length === 0) {
      return "- No explicit room schedule was provided";
    }

    return programRooms
      .map(
        (room, idx) =>
          `${idx + 1}. ${room.name} | ${room.area_m2}m² | floor=${room.floor} | orientation=${room.orientation || "any"}`,
      )
      .join("\n");
  }

  enforceProgramScheduleLock(dna, requestPayload, projectContext) {
    if (!dna || typeof dna !== "object") return dna;

    const requestedRooms = Array.isArray(requestPayload?.program?.rooms)
      ? requestPayload.program.rooms
      : this.expandLockedProgramRooms(projectContext?.programSpaces || []);

    if (requestedRooms.length === 0) {
      return dna;
    }

    if (!dna.program || typeof dna.program !== "object") {
      dna.program = {};
    }

    // Hard lock: program rooms are sourced from user input and cannot drift.
    dna.program.rooms = requestedRooms.map((room) => ({
      name: String(room.name || "Room"),
      area_m2: this.normalizeAreaM2(room.area_m2 ?? room.area, 20),
      floor: this.normaliseProgramFloor(room.floor),
      orientation: String(room.orientation || "any"),
    }));

    const requestedFloorCount = parseInt(
      requestPayload?.program?.floors ??
        projectContext?.floorCount ??
        projectContext?.floors ??
        projectContext?.programSpaces?._calculatedFloorCount,
      10,
    );

    if (Number.isFinite(requestedFloorCount) && requestedFloorCount > 0) {
      dna.program.floors = requestedFloorCount;
    } else {
      const maxLevel = Math.max(
        0,
        ...dna.program.rooms.map((room) => this.floorToIndex(room.floor)),
      );
      dna.program.floors = maxLevel + 1;
    }

    logger.info(
      `   Program schedule lock enforced: ${dna.program.rooms.length} rooms across ${dna.program.floors} floor(s)`,
    );

    try {
      return normalizeRawDNA(dna);
    } catch (error) {
      logger.warn(
        "Program schedule lock re-normalization failed; using locked DNA without refreshed hashes",
        error?.message || error,
      );
      return dna;
    }
  }

  /**
   * Generate Master Design DNA using two-pass approach
   * Pass A: Author - generate structured JSON
   * Pass B: Reviewer - validate and repair
   */
  async generateMasterDesignDNA(
    projectContext,
    portfolioAnalysis = null,
    locationData = null,
  ) {
    logger.info("🧬 Starting Two-Pass DNA Generation...");

    const effectiveLocation =
      locationData || projectContext.location || projectContext.locationData;
    const siteMetrics =
      projectContext.siteMetrics || projectContext.siteAnalysis;
    const programSpec = {
      floors:
        projectContext.floorCount ||
        projectContext.floors ||
        projectContext.programSpaces?._calculatedFloorCount ||
        1,
      programSpaces: projectContext.programSpaces || [],
      area: projectContext.area || 150,
    };
    const portfolioSummary = portfolioAnalysis || projectContext.blendedStyle;

    // Build structured request payload
    const requestPayload = buildDNARequestPayload(
      effectiveLocation,
      siteMetrics,
      programSpec,
      portfolioSummary,
    );

    logger.info("📋 Request payload prepared", {
      site: !!requestPayload.site,
      program: !!requestPayload.program,
      style: !!requestPayload.style,
      geometry_rules: !!requestPayload.geometry_rules,
    });

    // PASS A: Author - Generate structured DNA
    logger.info("🔹 PASS A: Generating structured DNA (Author)...");
    const rawDNA = await this.passA_generateStructuredDNA(
      requestPayload,
      projectContext,
    );

    if (!rawDNA) {
      throw new Error(
        "Pass A failed: Unable to generate DNA. Please check AI service availability.",
      );
    }

    // PASS B: Reviewer - Validate and repair
    logger.info("🔹 PASS B: Validating and repairing DNA (Reviewer)...");
    const validatedDNA = await this.passB_validateAndRepair(
      rawDNA,
      requestPayload,
      projectContext,
    );

    if (!validatedDNA) {
      throw new Error(
        "Pass B failed: DNA validation failed. Please retry generation.",
      );
    }

    // PASS C (Optional): Generate 3D volume specification
    // Only run if geometryVolumeFirst feature flag is enabled
    let volumeSpec = null;

    if (isFeatureEnabled("geometryVolumeFirst")) {
      logger.info("🔹 PASS C: Generating 3D volume specification...");

      try {
        const volumeResult =
          await geometryVolumeReasoning.generateVolumeSpecification(
            validatedDNA,
            projectContext,
            locationData || projectContext.location,
          );

        // Only use volumeSpec if generation was successful
        if (volumeResult && volumeResult.success === true) {
          volumeSpec = volumeResult.volumeSpec;
          logger.success(
            "✅ Pass C: Volume specification generated successfully",
          );
        } else {
          logger.warn(
            "⚠️  Pass C: Volume generation failed, continuing without volume spec",
          );
          // Don't attach invalid volumeSpec to DNA
        }
      } catch (volumeError) {
        logger.warn(
          "⚠️  Pass C error, continuing without volume spec:",
          volumeError.message,
        );
        // Don't attach volumeSpec on error
      }
    } else {
      logger.debug("⏭️  PASS C: Skipped (geometryVolumeFirst flag disabled)");
    }

    // Freeze DNA — it is now the immutable authority for all downstream gates
    freezeDNA(validatedDNA);
    logger.info("   DNA frozen (immutable authority)");

    // Convert to legacy format for compatibility
    const legacyDNA = convertToLegacyDNA(validatedDNA);

    // Attach volume spec to legacy DNA only if successfully generated
    if (volumeSpec) {
      legacyDNA.volumeSpec = volumeSpec;
    }

    logger.success("✅ Two-Pass DNA Generation complete");
    logger.info("   Site: " + (validatedDNA.site?.area_m2 || 0) + "m²");
    logger.info(
      "   Program: " +
        (validatedDNA.program?.floors || 0) +
        " floors, " +
        (validatedDNA.program?.rooms?.length || 0) +
        " rooms",
    );
    logger.info("   Style: " + (validatedDNA.style?.architecture || "N/A"));
    logger.info(
      "   Roof: " + (validatedDNA.geometry_rules?.roof_type || "N/A"),
    );
    if (volumeSpec) {
      logger.info(
        "   Volume: " +
          (volumeSpec.massing?.type || "N/A") +
          ", " +
          (volumeSpec.roof?.type || "N/A") +
          " roof",
      );
    }

    return {
      success: true,
      masterDNA: legacyDNA,
      structuredDNA: validatedDNA,
      volumeSpec,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Pass A: Generate structured DNA JSON
   * Uses Qwen2.5-72B to create initial DNA
   */
  async passA_generateStructuredDNA(requestPayload, projectContext) {
    const lockedProgramRooms = Array.isArray(requestPayload?.program?.rooms)
      ? requestPayload.program.rooms
      : [];
    const hasLockedProgram = lockedProgramRooms.length > 0;
    const lockedProgramSchedule =
      this.buildProgramScheduleText(lockedProgramRooms);

    const prompt = `You are an expert architect. Generate a complete Master Design DNA in STRICT JSON format.

OUTPUT REQUIREMENTS:
- Return ONLY valid JSON (no markdown, no prose, no explanations)
- Follow this EXACT schema with all four top-level keys:

{
  "site": {
    "polygon": [...],
    "area_m2": number,
    "orientation": number,
    "climate_zone": "string",
    "sun_path": "string",
    "wind_profile": "string"
  },
  "program": {
    "floors": number,
    "rooms": [
      {
        "name": "string",
        "area_m2": number,
        "floor": "ground|first|second|...",
        "orientation": "north|south|east|west|any"
      }
    ]
  },
  "style": {
    "architecture": "string",
    "materials": ["string", ...],
    "windows": {
      "pattern": "string",
      "proportion": "string"
    }
  },
  "geometry_rules": {
    "grid": "string",
    "max_span": "string",
    "roof_type": "gable|hip|flat|..."
  }
}

PROJECT REQUIREMENTS:
- Building Type: ${projectContext.buildingProgram || "residential"}
- Total Area: ${projectContext.area || 150}m²
- Floors: EXACTLY ${requestPayload.program.floors} (this is MANDATORY - do NOT change)
- Site Area: ${requestPayload.site.area_m2}m²
- Climate: ${requestPayload.site.climate_zone}
- Location: ${projectContext.location?.address || "Not specified"}

MANDATORY PROGRAM SCHEDULE (LOCKED - DO NOT ALTER):
${lockedProgramSchedule}

CRITICAL RULES:
1. ALL rooms must fit within the total area (${projectContext.area}m²)
2. ${hasLockedProgram ? "program.rooms must include ALL and ONLY the locked schedule entries above" : "Room areas must be realistic (bedrooms 12-20m², living 20-30m², kitchen 12-18m²)"}
3. Include circulation space (~15% of total area)
4. Respect site constraints (building must fit within ${requestPayload.site.area_m2}m² with setbacks)
5. Use materials appropriate for ${requestPayload.site.climate_zone} climate
6. The building MUST have EXACTLY ${requestPayload.program.floors} floor(s) - set "floors": ${requestPayload.program.floors} in the program section
7. ${requestPayload.program.floors === 1 ? "This is a SINGLE STOREY building. ALL rooms MUST be on the ground floor. Do NOT add an upper floor." : `Distribute rooms across ${requestPayload.program.floors} floors.`}
8. ${hasLockedProgram ? "Do NOT rename any room from the locked schedule" : "Use clear and architecturally standard room names"}
9. ${hasLockedProgram ? "Do NOT change area_m2 values from the locked schedule" : "Ensure area_m2 values are realistic and internally consistent"}
10. ${hasLockedProgram ? "Do NOT change room floor assignments from the locked schedule" : "Assign rooms to sensible floors for the selected building type"}
11. ${hasLockedProgram ? `program.rooms length MUST be exactly ${lockedProgramRooms.length}` : "Ensure program.rooms is non-empty and coherent"}

Generate the DNA now (JSON only):`;

    try {
      const response = await togetherAIReasoningService.chatCompletion(
        [{ role: "user", content: prompt }],
        {
          model: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
          temperature: 0.3,
          max_tokens: 4000,
        },
      );

      const content = response.choices?.[0]?.message?.content || "";

      // Extract JSON from response (handle markdown code blocks)
      let jsonStr = content.trim();
      if (jsonStr.startsWith("```")) {
        const match = jsonStr.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
        if (match) {
          jsonStr = match[1];
        }
      }

      // Sanitize JSON string - fix common LLM JSON issues
      jsonStr = this.sanitizeJsonString(jsonStr);

      const rawDNA = JSON.parse(jsonStr);
      logger.success("✅ Pass A: Raw DNA generated");

      return rawDNA;
    } catch (error) {
      logger.error("❌ Pass A failed:", error.message);

      // Try to extract partial JSON if parsing failed
      if (error.message.includes("JSON")) {
        logger.warn("   Attempting to extract JSON from response...");
      }

      return null;
    }
  }

  /**
   * Pass B: Validate and repair DNA
   * Uses Qwen2.5-72B to review and fix DNA
   */
  async passB_validateAndRepair(rawDNA, requestPayload, projectContext) {
    const lockedProgramRooms = Array.isArray(requestPayload?.program?.rooms)
      ? requestPayload.program.rooms
      : [];
    const hasLockedProgram = lockedProgramRooms.length > 0;
    const lockedProgramSchedule =
      this.buildProgramScheduleText(lockedProgramRooms);

    // First, normalize the raw DNA
    let dna;
    try {
      dna = normalizeRawDNA(rawDNA);
      dna = this.enforceProgramScheduleLock(
        dna,
        requestPayload,
        projectContext,
      );
      logger.info("   DNA normalized");
    } catch (error) {
      logger.error("❌ DNA normalization failed:", error.message);
      return null;
    }

    // Validate schema
    const validation = validateDNASchema(dna);

    if (validation.valid) {
      logger.success("✅ Pass B: DNA schema valid (no repair needed)");
      return dna;
    }

    // Schema invalid - use AI to repair
    logger.warn("⚠️  DNA schema validation failed:", {
      missing: validation.missing,
      errors: validation.errors,
    });
    logger.info("   Attempting AI-assisted repair...");

    const repairPrompt = `You are a DNA validator. The following DNA has validation issues. Fix them and return ONLY the corrected JSON.

VALIDATION ISSUES:
${validation.missing.length > 0 ? `Missing sections: ${validation.missing.join(", ")}` : ""}
${validation.errors.length > 0 ? `Errors: ${validation.errors.join("; ")}` : ""}

ORIGINAL DNA:
${JSON.stringify(dna, null, 2)}

LOCKED PROGRAM SCHEDULE (DO NOT ALTER):
${lockedProgramSchedule}

REQUIREMENTS:
1. Fix all validation issues
2. Ensure all four top-level keys exist: site, program, style, geometry_rules
3. Ensure all required fields are present and correctly typed
4. Keep the building realistic and consistent
5. ${hasLockedProgram ? "Preserve ALL locked program rooms exactly: same names, same area_m2, same floor assignments, no additions/removals" : "Preserve coherent program room schedule"}
6. Return ONLY valid JSON (no markdown, no explanations)

Generate the corrected DNA now (JSON only):`;

    try {
      const response = await togetherAIReasoningService.chatCompletion(
        [{ role: "user", content: repairPrompt }],
        {
          model: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
          temperature: 0.1, // Lower temperature for more deterministic repairs
          max_tokens: 4000,
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

      const repairedDNA = JSON.parse(jsonStr);
      const normalizedRepaired = this.enforceProgramScheduleLock(
        normalizeRawDNA(repairedDNA),
        requestPayload,
        projectContext,
      );

      // Validate again
      const revalidation = validateDNASchema(normalizedRepaired);

      if (revalidation.valid) {
        logger.success("✅ Pass B: DNA repaired successfully");
        return normalizedRepaired;
      } else {
        logger.warn(
          "⚠️  AI repair incomplete, applying deterministic repair...",
        );
        // Fall through to deterministic repair
      }
    } catch (error) {
      logger.warn(
        "⚠️  AI repair failed, applying deterministic repair...",
        error.message,
      );
      // Fall through to deterministic repair
    }

    // Deterministic repair as last resort
    const context = {
      locationData: projectContext.location || projectContext.locationData,
      projectSpec: {
        floors: projectContext.floorCount || projectContext.floors || 1,
        programSpaces: projectContext.programSpaces || [],
      },
      portfolioSummary: projectContext.blendedStyle,
    };

    const repairedDNA = this.enforceProgramScheduleLock(
      repairDNA(dna, context),
      requestPayload,
      projectContext,
    );

    // Final validation
    const finalValidation = validateDNASchema(repairedDNA);

    if (finalValidation.valid) {
      logger.success("✅ Pass B: DNA repaired deterministically");
      return repairedDNA;
    } else {
      logger.error("❌ Pass B: Unable to repair DNA", {
        missing: finalValidation.missing,
        errors: finalValidation.errors,
      });
      return null;
    }
  }
}

// Export singleton instance
const twoPassDNAGenerator = new TwoPassDNAGenerator();
export default twoPassDNAGenerator;
