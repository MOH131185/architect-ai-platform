/**
 * Enhanced DNA Generator Service — TRANSITIONAL (LEGACY FALLBACK)
 *
 * @deprecated The canonical DNA generator is twoPassDNAGenerator.js.
 * This module is retained because togetherAIService.js still imports it
 * for legacy DNA-generation methods. No new code should call this directly.
 *
 * Generates ultra-detailed Design DNA for 95%+ consistency across ALL architectural views.
 * Uses ModelRouter for env-driven model selection.
 */

import modelRouter from "./modelRouter.js";
import promptLibrary from "./promptLibrary.js";
import locationAwareDNAModifier from "./locationAwareDNAModifier.js";
import climateResponsiveDesignService from "./climateResponsiveDesignService.js";
import { validateDesignAgainstSite } from "./siteValidationService.js";
import { generateDesignReasoning } from "./reasoningOrchestrator.js";
import logger from "../utils/logger.js";

function formatSunPathDetails(sunPath) {
  if (!sunPath) {
    return {
      orientationText: "south",
      detailText: "No solar data available",
    };
  }
  const orientation = `${Math.round(sunPath.optimalOrientation ?? 180)}°`;
  const winter = sunPath.winterSolstice || sunPath.winter || {};
  const summer = sunPath.summerSolstice || sunPath.summer || {};
  const winterAz = Math.round(winter.azimuth ?? 180);
  const winterAlt = Math.round(winter.altitude ?? 15);
  const summerAz = Math.round(summer.azimuth ?? 180);
  const summerAlt = Math.round(summer.altitude ?? 65);

  return {
    orientationText: orientation,
    detailText: `Winter ${winterAz}°/${winterAlt}° • Summer ${summerAz}°/${summerAlt}°`,
  };
}

class EnhancedDNAGenerator {
  constructor() {
    logger.info("🧬 Enhanced DNA Generator initialized");
  }

  /**
   * Generate Master Design DNA with view-specific instructions
   * This ensures each view is UNIQUE but CONSISTENT
   * NOW ENHANCED with location and climate awareness
   */
  async generateMasterDesignDNA(
    projectContext,
    portfolioAnalysis = null,
    locationData = null,
  ) {
    logger.info("🧬 Generating Location-Aware Master Design DNA...");

    const {
      buildingProgram,
      projectType,
      buildingCategory,
      buildingSubType,
      buildingNotes,
      entranceOrientation,
      programSpaces,
      area,
      floorCount,
      location,
      blendedStyle,
      buildingDNA,
      ukLocationData,
      siteAnalysis,
      sitePolygon,
      siteMetrics,
    } = projectContext;

    // Use location data from either direct pass or context
    const effectiveLocation =
      locationData || location || projectContext.locationData;
    const effectiveClimate =
      effectiveLocation?.climate || ukLocationData?.climateData;
    const effectiveSiteAnalysis = siteAnalysis || projectContext.siteAnalysis;
    const sunPathDetails = formatSunPathDetails(effectiveLocation?.sunPath);

    // 🆕 ENFORCE PROJECT TYPE: Use building taxonomy if provided
    const enforcedProjectType =
      buildingSubType || projectType || buildingProgram || "mixed-use building";
    const fullBuildingType =
      buildingCategory && buildingSubType
        ? `${buildingCategory} - ${buildingSubType}`
        : enforcedProjectType;

    // 🆕 BUILD PROGRAM SCHEDULE STRING
    let programScheduleStr = "";
    if (programSpaces && programSpaces.length > 0) {
      const programTotal = programSpaces.reduce(
        (sum, space) => sum + parseFloat(space.area || 0) * (space.count || 1),
        0,
      );
      programScheduleStr = `
PROGRAM SCHEDULE (REQUIRED - MUST BE ACCURATELY REFLECTED):
${programSpaces
  .map(
    (space, idx) =>
      `- ${space.name || `Space ${idx + 1}`}: ${space.area || "TBD"}m² × ${space.count || 1} = ${(parseFloat(space.area || 0) * (space.count || 1)).toFixed(0)}m²${space.level ? ` (Level: ${space.level})` : ""}`,
  )
  .join("\n")}
TOTAL PROGRAM AREA: ${programTotal.toFixed(0)}m² (must match total floor area of ${area}m² within ±5%)
CRITICAL: Floor plans MUST include these exact spaces with these exact areas.`;
    }

    // 🆕 NEGATIVE PROMPTS: Prevent defaulting to houses when not specified
    const negativeTypePrompts = [];
    if (
      enforcedProjectType &&
      ![
        "residential-house",
        "detached-house",
        "semi-detached-house",
        "terraced-house",
        "villa",
        "cottage",
        "apartment",
        "apartment-building",
      ].includes(enforcedProjectType.toLowerCase())
    ) {
      negativeTypePrompts.push(
        "NO single-family house",
        "NO residential house",
        "NO pitched roof unless specified",
        "NO front yard/garden",
      );
    }
    if (
      enforcedProjectType &&
      ["office", "retail", "school", "hospital"].includes(
        enforcedProjectType.toLowerCase(),
      )
    ) {
      negativeTypePrompts.push(
        "NO residential features",
        "NO bedrooms unless specified",
        "NO kitchen unless specified",
      );
    }

    // 🆕 Extract and structure site constraints for validation
    const siteData = {
      buildableArea: siteMetrics?.areaM2 ? siteMetrics.areaM2 * 0.7 : Infinity, // 70% buildable after setbacks
      siteArea: siteMetrics?.areaM2 || Infinity,
      constraints: {
        frontSetback: effectiveSiteAnalysis?.constraints?.frontSetback || 3,
        rearSetback: effectiveSiteAnalysis?.constraints?.rearSetback || 3,
        sideSetbacks: effectiveSiteAnalysis?.constraints?.sideSetbacks || [
          3, 3,
        ],
      },
      maxHeight: effectiveLocation?.zoning?.maxHeight
        ? parseFloat(effectiveLocation.zoning.maxHeight)
        : Infinity,
      maxFloors: effectiveLocation?.zoning?.maxFloors || 10,
      shapeType: siteMetrics?.shapeType || "rectangle",
      polygon: sitePolygon || null,
      optimalOrientation:
        effectiveLocation?.sunPath?.optimalOrientation ||
        effectiveSiteAnalysis?.optimalOrientation ||
        0,
    };

    // 🆕 Calculate optimal floor count based on site area constraints
    // PRIORITY: Use AI-calculated floor count from auto-level assignment if available
    let calculatedFloorCount =
      programSpaces?._calculatedFloorCount ||
      floorCount ||
      projectContext.floorCount ||
      2;
    let siteCoverageRatio = 0.6; // Default 60% site coverage
    let maxFootprintArea = null;

    // Log floor count source
    if (programSpaces?._calculatedFloorCount) {
      logger.info(
        `🏢 Using AI-calculated floor count: ${calculatedFloorCount} floors`,
      );
      logger.info(
        `   Site area: ${programSpaces._floorMetrics?.actualFootprint?.toFixed(0) || "N/A"}m² footprint`,
      );
      logger.info(
        `   Coverage: ${programSpaces._floorMetrics?.siteCoveragePercent?.toFixed(1) || "N/A"}%`,
      );
      logger.info(
        `   Reasoning: ${programSpaces._floorMetrics?.reasoning || "N/A"}`,
      );
    } else if (floorCount) {
      logger.info(
        `🏢 Using user-provided floor count: ${calculatedFloorCount} floors`,
      );
    } else {
      logger.info(
        `🏢 Using default floor count: ${calculatedFloorCount} floors`,
      );
    }

    if (siteMetrics && siteMetrics.areaM2 && area) {
      const requiredArea = parseFloat(area);
      const siteArea = parseFloat(siteMetrics.areaM2);

      // Apply zoning restrictions if available
      if (effectiveLocation?.zoning?.density) {
        if (effectiveLocation.zoning.density.toLowerCase().includes("low")) {
          siteCoverageRatio = 0.4; // 40% for low density
        } else if (
          effectiveLocation.zoning.density.toLowerCase().includes("high")
        ) {
          siteCoverageRatio = 0.75; // 75% for high density
        }
      }

      // Account for setbacks when calculating buildable area
      const setbackReduction = 0.85; // Assume ~15% area lost to setbacks
      maxFootprintArea = siteArea * siteCoverageRatio * setbackReduction;

      // Calculate minimum floors needed to fit required area within site
      const minFloorsNeeded = Math.ceil(requiredArea / maxFootprintArea);

      // Apply zoning height restrictions
      let maxFloorsAllowed = 10; // Default maximum
      if (effectiveLocation?.zoning?.maxHeight) {
        const maxHeight = parseFloat(effectiveLocation.zoning.maxHeight);
        maxFloorsAllowed = Math.floor(maxHeight / 3.0); // Assuming 3m per floor
      }

      // Set calculated floor count within constraints
      calculatedFloorCount = Math.min(
        Math.max(minFloorsNeeded, 1),
        maxFloorsAllowed,
      );

      logger.info("📊 Floor calculation:");
      logger.info(`   Site area: ${siteArea.toFixed(0)}m²`);
      logger.info(`   Required area: ${requiredArea.toFixed(0)}m²`);
      logger.info(
        `   Max footprint (${(siteCoverageRatio * 100).toFixed(0)}% coverage): ${maxFootprintArea.toFixed(0)}m²`,
      );
      logger.info(`   Calculated floors: ${calculatedFloorCount}`);
      if (effectiveLocation?.zoning?.maxHeight) {
        logger.info(
          `   Max floors allowed: ${maxFloorsAllowed} (height limit: ${effectiveLocation.zoning.maxHeight})`,
        );
      }
    }

    // 🆕 Site polygon context with calculated floor info + street context
    let siteContextStr = "Rectangular plot, standard setbacks";

    if (siteMetrics && siteMetrics.areaM2) {
      siteContextStr = `
Site Area: ${siteMetrics.areaM2.toFixed(0)}m² (user-drawn boundary)
Site Orientation: ${(siteMetrics.orientationDeg || 0).toFixed(0)}° from North
Building Envelope: Must fit within site with 3m setbacks on all sides
Max Footprint: ${maxFootprintArea ? maxFootprintArea.toFixed(0) : (siteMetrics.areaM2 * 0.6).toFixed(0)}m² (${(siteCoverageRatio * 100).toFixed(0)}% site coverage)
Calculated Floor Count: ${calculatedFloorCount} floors (to fit ${area}m² within ${siteMetrics.areaM2.toFixed(0)}m² site)`;
    }

    // 🆕 Add street context for principal facade orientation
    let streetContextStr = "";
    if (effectiveSiteAnalysis?.streetContext) {
      const street = effectiveSiteAnalysis.streetContext;
      streetContextStr = `
Street Access: ${street.primaryRoad || "Main road"} (${street.roadOrientation || "unknown orientation"})
Principal Facade: Should face ${street.principalFacadeDirection || "street"} (main entrance on this side)
Site Access Point: ${street.accessPoint || "From primary road"}`;
    } else if (effectiveLocation?.sunPath?.optimalOrientation) {
      // Fallback: use sun orientation if no street context
      streetContextStr = `
Principal Facade: Recommended ${effectiveLocation.sunPath.optimalOrientation}-facing for optimal solar orientation`;
    }

    siteContextStr += streetContextStr;

    // 🧠 ARCHITECTURAL REASONING: Generate design philosophy and strategy
    logger.ai(
      " Generating architectural reasoning for optimal design decisions...",
    );
    let designReasoning = null;
    try {
      designReasoning = await generateDesignReasoning({
        buildingProgram: enforcedProjectType,
        area,
        location: effectiveLocation,
        locationData: effectiveLocation,
        climate: effectiveClimate,
        blendedStyle,
        programSpaces,
        siteMetrics,
        siteAnalysis: effectiveSiteAnalysis,
      });

      logger.info("   ✅ Design reasoning generated:", {
        source: designReasoning.source || "unknown",
        model: designReasoning.model || "unknown",
        hasPhilosophy: !!designReasoning.designPhilosophy,
      });
    } catch (reasoningError) {
      logger.warn(
        "   ⚠️ Reasoning generation failed, using fallback:",
        reasoningError.message,
      );
      designReasoning = {
        designPhilosophy: "Contemporary design responding to site and climate",
        spatialOrganization: {
          strategy: "Functional layout optimized for program",
        },
        materialRecommendations: { primary: "Context-appropriate materials" },
        environmentalConsiderations: {
          passiveStrategies: ["Natural ventilation", "Daylighting"],
        },
        isFallback: true,
      };
    }

    // 🎨 INTEGRATE REASONING INTO DNA PROMPT
    const reasoningSection =
      designReasoning && !designReasoning.isFallback
        ? `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧠 ARCHITECTURAL REASONING (Integrate into DNA):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DESIGN PHILOSOPHY:
${designReasoning.designPhilosophy || "Not provided"}

SPATIAL ORGANIZATION:
${designReasoning.spatialOrganization?.strategy || "Functional layout"}
${designReasoning.spatialOrganization?.circulation ? `Circulation: ${designReasoning.spatialOrganization.circulation}` : ""}

MATERIAL STRATEGY:
${designReasoning.materialRecommendations?.primary || "Context-appropriate materials"}
${designReasoning.materialRecommendations?.alternatives ? `Alternatives: ${designReasoning.materialRecommendations.alternatives.join(", ")}` : ""}

ENVIRONMENTAL APPROACH:
${designReasoning.environmentalConsiderations?.passiveStrategies?.join(", ") || "Standard environmental considerations"}
${designReasoning.environmentalConsiderations?.activeStrategies?.join(", ") || ""}

ARCHITECTURAL FEATURES (Integrate these into design):
${designReasoning.architecturalFeatures?.map((f) => `- ${f.name}: ${f.rationale}`).join("\n") || "Standard features based on building type"}

STRUCTURAL APPROACH:
${designReasoning.structuralApproach?.system || "Appropriate for building type and scale"}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`
        : "";

    const prompt = `You are an expert architect creating a LOCATION-AWARE MASTER DESIGN DNA for PERFECT CONSISTENCY across ALL architectural views.

🚨 CRITICAL: This DNA will be used to generate a COMPLETE A1 architectural sheet with ALL required sections:
- Location Plan (site context)
- Ground Floor Plan (MANDATORY - must show all program spaces)
- Upper Floor Plan(s) (if multiple floors)
- ALL FOUR ELEVATIONS: North, South, East, West (MANDATORY - NO MISSING ELEVATIONS)
- TWO SECTIONS: Section A-A (Longitudinal) AND Section B-B (Transverse) (BOTH REQUIRED)
- 3D EXTERIOR VIEW (MANDATORY)
- 3D AXONOMETRIC VIEW (MANDATORY)
- INTERIOR PERSPECTIVE (if applicable)
- MATERIAL PALETTE PANEL (MANDATORY)
- ENVIRONMENTAL PERFORMANCE PANEL (MANDATORY)
- UK RIBA TITLE BLOCK (MANDATORY)

CRITICAL MISSION: Generate specifications so DETAILED and PRECISE that:
1. All 13 views will show the EXACT SAME building
2. Every dimension, material, and feature is IDENTICAL across all views
3. Zero ambiguity - every specification is measurable and exact
4. Building is PERFECTLY ADAPTED to its location and climate
5. ALL required sections can be generated from this DNA (no missing views)

Project Requirements:
- Building Type: ${enforcedProjectType}${projectType !== buildingProgram ? ` (ENFORCED - previously: ${buildingProgram})` : ""}
- Total Floor Area: ${area}m²
${programScheduleStr}
- Location: ${effectiveLocation?.address || "Not specified"}
- Climate: ${effectiveClimate?.type || "Temperate"} (${effectiveClimate?.description || "moderate conditions"})
- Zoning: ${effectiveLocation?.zoning?.type || "commercial"} (max height: ${effectiveLocation?.zoning?.maxHeight || "unrestricted"})
${negativeTypePrompts.length > 0 ? `- CRITICAL RESTRICTIONS: ${negativeTypePrompts.join(", ")}` : ""}
- Site: ${siteContextStr}
- Sun Path: ${sunPathDetails.orientationText} facing optimal (${sunPathDetails.detailText})
- Wind: ${effectiveLocation?.wind?.direction || "Unknown direction"} at ${effectiveLocation?.wind?.speed || "Unknown speed"} (Impact: ${effectiveLocation?.wind?.impact || "Unknown"})
- Wind Orientation: ${effectiveLocation?.wind?.facadeRecommendation || "Standard orientation"}
- Architectural Style: ${blendedStyle?.styleName || effectiveLocation?.recommendedStyle || "Contemporary"}
- Local Materials: ${effectiveLocation?.localMaterials?.join(", ") || blendedStyle?.materials?.join(", ") || "Brick, glass, timber"}

${reasoningSection}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🤖 AI REASONING REQUIRED: BUILDING LEVELS & FLOORS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

You MUST intelligently determine the optimal number of floors/levels based on:

1. BUILDING PROGRAM ANALYSIS:
   - Required area: ${area}m²
   - Building type: ${enforcedProjectType}${programSpaces?.length > 0 ? ` (with ${programSpaces.length} program spaces)` : ""}
   ${programSpaces?.length > 0 ? `- Program spaces: ${programSpaces.map((s) => `${s.name}: ${s.area}m² × ${s.count}`).join(", ")}` : ""}
   - Consider typical room sizes and spatial requirements for this program type
   - Account for circulation (hallways, stairs) ~15-20% of total area
   ${programSpaces?.length > 0 ? `- CRITICAL: Include ALL program spaces in floor plans with EXACT areas specified` : ""}

2. SITE CONSTRAINTS:
   - Site area: ${siteMetrics?.areaM2?.toFixed(0) || "TBD"}m²
   - Max footprint: ${maxFootprintArea ? maxFootprintArea.toFixed(0) : "TBD"}m² (${(siteCoverageRatio * 100).toFixed(0)}% coverage)
   - Calculate minimum floors needed: Math.ceil(${area}m² ÷ ${maxFootprintArea ? maxFootprintArea.toFixed(0) : "footprint"}m²)

3. ZONING & HEIGHT RESTRICTIONS:
   - Max height: ${effectiveLocation?.zoning?.maxHeight || "unrestricted"}
   - If max height specified, calculate max floors: floor(maxHeight ÷ 3.0m per floor)
   - Density: ${effectiveLocation?.zoning?.density || "standard"}

4. CLIMATE CONSIDERATIONS:
   - Climate type: ${effectiveClimate?.type || "Temperate"}
   - Consider basement for thermal mass in cold climates (${effectiveClimate?.type === "Cold" || effectiveClimate?.type === "Continental" ? "YES - basement recommended" : "NO - not necessary"})
   - Consider ground floor elevation for flood-prone areas

5. BUILDING CODE & BEST PRACTICES:
   - Minimum floor height: ${["office", "retail", "school", "hospital"].includes(enforcedProjectType?.toLowerCase()) ? "2.7m commercial" : "2.4m residential"}
   - Typical floor height: ${["office", "retail", "school", "hospital"].includes(enforcedProjectType?.toLowerCase()) ? "3.0m-3.5m commercial" : "2.7m-3.0m residential"}
   - Stair clearance: minimum 2.0m headroom
   - Consider accessibility: ground floor should be accessible
   ${programSpaces?.length > 0 ? `- CRITICAL: Program spaces must be accurately sized and positioned according to the program schedule` : ""}

REASONING OUTPUT REQUIRED:
You MUST include a "levelReasoning" object explaining your decision:
- Why this number of floors? (e.g., "3 floors optimal to fit 200m² within 75m² footprint")
- Why basement included/excluded? (e.g., "Basement excluded - temperate climate, no thermal mass benefit")
- Which facade is principal? (e.g., "North facade principal - main entrance, street-facing")

CONSISTENCY PRINCIPLE: Every specification must be EXACT and MEASURABLE (no "approximately", no ranges, no ambiguity).

Generate ULTRA-DETAILED specifications in JSON format:

{
  "projectID": "unique identifier",
  "seed": ${projectContext.seed || Math.floor(Math.random() * 1000000)},

  "dimensions": {
    "length": "number in meters (e.g., 15)",
    "width": "number in meters (e.g., 10)",
    "totalHeight": "number in meters (calculated from floorCount × average floor height)",
    "floorCount": "number (AI-determined optimal count based on area, site, zoning)",
    "numLevels": "number (floors above ground, excluding basement)",
    "hasBasement": "boolean (true if basement included for thermal mass/climate/storage)",
    "groundFloorHeight": "${["office", "retail", "school", "hospital"].includes(enforcedProjectType?.toLowerCase()) ? "3.0m (typical for commercial)" : "3.0m (typical for residential)"}",
    "upperFloorHeight": "${["office", "retail", "school", "hospital"].includes(enforcedProjectType?.toLowerCase()) ? "3.0m (typical for commercial)" : "2.7m (typical for residential)"}",
    "basementHeight": "2.4m (if hasBasement is true, otherwise omit)",
    "wallThickness": "0.3m exterior, 0.15m interior",
    "totalArea": "${area}m²",
    "footprintArea": "${maxFootprintArea ? maxFootprintArea.toFixed(0) : "TBD"}m² (must fit within ${siteMetrics?.areaM2?.toFixed(0) || "site"} m² with ${(siteCoverageRatio * 100).toFixed(0)}% coverage)",
    "groundFloorArea": "number in m²",
    "upperFloorArea": "number in m² (if numLevels > 1)",
    "basementArea": "number in m² (if hasBasement is true, otherwise omit)"
  },

  "levelReasoning": {
    "numLevels": "number (your AI-determined optimal number)",
    "hasBasement": "boolean (your AI reasoning)",
    "reasoning": "string explaining why this floor count is optimal (e.g., '3 floors optimal to fit 200m² within 75m² footprint')",
    "basementReasoning": "string explaining basement decision (e.g., 'Basement excluded - temperate climate, no thermal mass benefit')",
    "zoningConstraints": "string describing how zoning affected decision",
    "siteConstraints": "string describing how site size affected decision"
  },

  "levels": [
    {
      "level": "basement",
      "levelNumber": 0,
      "name": "Basement",
      "height": "2.4m",
      "area": "number in m²",
      "function": "Storage/Utility/Mechanical (if basement included)",
      "aboveGround": false
    },
    {
      "level": "ground",
      "levelNumber": 1,
      "name": "Ground Floor",
      "height": "3.0m",
      "area": "number in m²",
      "function": "Living spaces, entrance, public areas",
      "aboveGround": true
    },
    {
      "level": "first",
      "levelNumber": 2,
      "name": "First Floor",
      "height": "2.7m",
      "area": "number in m²",
      "function": "Bedrooms, private spaces",
      "aboveGround": true
    }
    // Add more levels as needed (second, third, etc.) based on numLevels
  ],

  "principalFacadeOrientation": "N/S/E/W (AI-determined: which facade faces main street/entrance)",
  "recommendedElevations": ["north", "south"],

  "materials": {
    "exterior": {
      "primary": "EXACT material name (e.g., 'Red clay brick' NOT just 'brick')",
      "color": "EXACT hex code (e.g., #8B4513)",
      "texture": "EXACT texture (smooth/rough/textured/weathered)",
      "bond": "EXACT bond pattern for brick (Flemish/English/Stretcher bond)",
      "finish": "EXACT finish (matte/semi-gloss/textured)",
      "brickSize": "Standard UK: 215mm × 102.5mm × 65mm"
    },
    "roof": {
      "type": "EXACT type (gable/hip/flat)",
      "material": "EXACT material (Clay tiles/Slate/Standing seam metal/Concrete tiles)",
      "color": "EXACT hex code",
      "pitch": "EXACT degrees (e.g., 35 NOT '35-40')",
      "overhang": "EXACT overhang dimension (e.g., 0.4m)",
      "ridgeHeight": "EXACT ridge height from ground (e.g., 7.5m)"
    },
    "windows": {
      "type": "EXACT type (Casement/Sash/Fixed/Awning)",
      "frame": "EXACT frame material (UPVC/Timber/Aluminum)",
      "color": "EXACT hex code (e.g., #FFFFFF)",
      "glazing": "EXACT glazing (Double/Triple)",
      "mullions": "EXACT (Yes/No) - if Yes, specify spacing",
      "sillHeight": "EXACT height from floor (e.g., 0.9m)",
      "standardSize": "EXACT size for all windows (e.g., 1.5m × 1.2m width × height)"
    },
    "doors": {
      "main": {
        "type": "EXACT type (Panel/Glazed/Modern/Traditional)",
        "material": "EXACT material (Solid timber/Composite/Aluminum)",
        "color": "EXACT hex code",
        "width": "EXACT width (0.9m/1.0m)",
        "height": "EXACT height (2.1m standard)",
        "panelConfig": "EXACT configuration (e.g., '4-panel', '6-panel', 'glazed top half')"
      }
    },
    "trim": {
      "color": "EXACT hex code (MUST contrast with exterior color)",
      "material": "EXACT material (UPVC/Timber/Stone)",
      "width": "EXACT width (e.g., 150mm)"
    }
  },

  "floorPlans": {
    "basement": {
      "rooms": [
        // ONLY include if hasBasement is true
        // Add utility rooms, storage, mechanical spaces
      ],
      "circulation": "Central corridor if applicable",
      "access": "Internal staircase from ground floor"
    },
    "ground": {
      "rooms": [
        ${
          programSpaces && programSpaces.length > 0
            ? programSpaces
                .filter((s) => {
                  const level = (s.level || "").toString().toLowerCase();
                  return !level || level.includes("ground");
                })
                .map(
                  (space, idx) => `{
          "name": "${space.label || space.name || `Space ${idx + 1}`}",
          "dimensions": "Calculate from ${space.area}m² area",
          "area": "${space.area}m²",
          "position": "To be determined by AI based on layout",
          "windows": ["As needed for ${enforcedProjectType}"],
          "doors": ["As needed for circulation"]
        }`,
                )
                .join(",\n        ")
            : `{
          "name": "${enforcedProjectType === "office" ? "Open Office" : enforcedProjectType === "retail" ? "Sales Floor" : enforcedProjectType === "school" ? "Classroom" : "Living Room"}",
          "dimensions": "Calculate from total area",
          "area": "To be calculated",
          "position": "To be determined",
          "windows": ["As needed"],
          "doors": ["As needed"]
        }`
        }
        // Continue for all ground floor rooms based on building program
      ],
      "circulation": "Central hallway/corridor as needed for ${enforcedProjectType}",
      "entrance": {
        "location": "Center of [principalFacadeOrientation] facade",
        "type": "${enforcedProjectType === "office" || enforcedProjectType === "retail" ? "Modern glass entrance" : "Covered porch"}",
        "width": "${enforcedProjectType === "office" || enforcedProjectType === "retail" ? "2.0m" : "1.2m"}"
      }
    },
    "first": {
      "rooms": [
        ${
          programSpaces && programSpaces.length > 0
            ? programSpaces
                .filter((s) => {
                  const level = (s.level || "").toString().toLowerCase();
                  return level.includes("first") || level === "1";
                })
                .map(
                  (space, idx) => `{
          "name": "${space.label || space.name || `Space ${idx + 1}`}",
          "dimensions": "Calculate from ${space.area}m² area",
          "area": "${space.area}m²",
          "position": "To be determined by AI based on layout",
          "windows": ["As needed for ${enforcedProjectType}"],
          "doors": ["As needed for circulation"]
        }`,
                )
                .join(",\n        ")
            : `{
          "name": "${enforcedProjectType === "office" ? "Office Space" : enforcedProjectType === "school" ? "Classroom" : "Bedroom"}",
          "dimensions": "Calculate from total area",
          "area": "To be calculated",
          "position": "To be determined",
          "windows": ["As needed"],
          "doors": ["As needed"]
        }`
        }
        // Continue for all first floor rooms
      ],
      "circulation": "Landing/corridor as needed for ${enforcedProjectType}"
    }
    // Add more floor plans (second, third, etc.) based on numLevels
  },

  "elevations": {
    "north": {
      "description": "FRONT FACADE - Main entrance elevation",
      "features": [
        "Main entrance door centered",
        "4 windows on ground floor (2 either side of door)",
        "4 windows on upper floor (matching ground floor)",
        "Gable roof visible with ridge at center"
      ],
      "symmetry": "Symmetrical about center axis",
      "distinctiveFeatures": "Front door with porch canopy"
    },
    "south": {
      "description": "REAR FACADE - Garden elevation",
      "features": [
        "Large patio doors to living room",
        "Kitchen window to left",
        "3 bedroom windows on upper floor",
        "Gable end with small vent"
      ],
      "symmetry": "Asymmetrical",
      "distinctiveFeatures": "Large patio doors on ground floor"
    },
    "east": {
      "description": "RIGHT SIDE ELEVATION",
      "features": [
        "2 windows on ground floor (living room, dining)",
        "2 windows on upper floor (bedrooms)",
        "Roof slope visible",
        "Rainwater downpipe"
      ],
      "symmetry": "Vertical alignment of windows",
      "distinctiveFeatures": "Windows aligned vertically"
    },
    "west": {
      "description": "LEFT SIDE ELEVATION",
      "features": [
        "Kitchen window on ground floor",
        "Bathroom window on upper floor (frosted)",
        "Roof slope visible",
        "Soil pipe visible"
      ],
      "symmetry": "Asymmetrical",
      "distinctiveFeatures": "Small frosted bathroom window"
    }
  },

  "sections": {
    "longitudinal": {
      "description": "SECTION A-A - Long axis through building",
      "cutLocation": "Through center hallway and staircase",
      "visible": [
        "Staircase with 14 treads",
        "Ground floor ceiling height 3.0m",
        "Upper floor ceiling height 2.7m",
        "Roof structure with rafters at ${projectContext.roofPitch || 35}° pitch",
        "Foundation depth 1.2m below ground"
      ],
      "annotations": [
        "Floor levels",
        "Ceiling heights",
        "Roof pitch angle",
        "Foundation depth"
      ]
    },
    "cross": {
      "description": "SECTION B-B - Short axis perpendicular to Section A-A",
      "cutLocation": "Through living room and master bedroom",
      "visible": [
        "Living room with window visible",
        "Master bedroom above with window",
        "Floor joists between floors",
        "Roof structure",
        "Wall construction layers"
      ],
      "annotations": [
        "Room widths",
        "Wall thicknesses",
        "Joist sizes",
        "Insulation layers"
      ]
    }
  },

  "3dViews": {
    "exterior_front": {
      "description": "3D view from FRONT (North side)",
      "camera": "Eye level, 10m from building, facing south",
      "visible": ["North facade", "partial east facade", "roof"],
      "mustShow": "Main entrance clearly visible"
    },
    "exterior_side": {
      "description": "3D view from SIDE (East side)",
      "camera": "Eye level, 10m from building, facing west",
      "visible": ["East facade", "partial north facade", "partial south facade", "roof slope"],
      "mustShow": "Depth of building clear"
    },
    "axonometric": {
      "description": "45° AXONOMETRIC from NORTHEAST corner",
      "camera": "45° angle, looking down 30°, from northeast",
      "visible": ["North facade", "East facade", "full roof geometry"],
      "mustShow": "All three dimensions visible, NO perspective distortion"
    },
    "perspective": {
      "description": "2-POINT PERSPECTIVE from NORTHWEST corner",
      "camera": "Eye level, from northwest corner, looking southeast",
      "visible": ["North facade", "West facade", "roof with perspective"],
      "mustShow": "Realistic perspective, human eye level"
    },
    "interior": {
      "description": "INTERIOR of living room looking toward windows",
      "camera": "Standing in living room, looking at south-facing windows",
      "visible": ["Living room space", "windows", "ceiling", "flooring"],
      "mustShow": "Natural light from windows, furniture for scale"
    }
  },

  "colorPalette": {
    "primary": "hex code - main wall color",
    "secondary": "hex code - trim/accents",
    "facade": "hex code - facade color (MUST match exterior.color above)",
    "trim": "hex code - trim color (MUST be DIFFERENT from facade for contrast)",
    "roof": "hex code - roof material color",
    "windows": "hex code - window frames",
    "door": "hex code - main door"
  },

  "roof": {
    "type": "EXACT roof type (gable/hip/flat) - MUST match materials.roof.type",
    "material": "EXACT material - MUST match materials.roof.material",
    "pitch": "EXACT pitch in degrees (e.g., 35) - MUST match materials.roof.pitch"
  },

  "entrance": {
    "facade": "[principalFacadeOrientation] (AI-determined principal facade)",
    "position": "Position on facade (center/left/right)",
    "width": "Door width (0.9m or 1.0m)"
  },

  "windows": {
    "pattern": "Window pattern (grid/ribbon/punched/symmetric)",
    "type": "Window type - MUST match materials.windows.type"
  },

  "designReasoning": {
    "adjacencyDiagram": "Describe spatial relationships: which rooms are adjacent, which are separated, and why (e.g., 'Kitchen adjacent to dining for serving, bedrooms away from living areas for privacy')",
    "circulationLogic": "Describe circulation paths: main corridor layout, stair location, entrance to rooms flow (e.g., 'Central corridor from entrance, stair at midpoint, all rooms accessible from corridor')",
    "daylightingStrategy": "Describe natural light approach: which rooms get most light, window orientation, light wells if any (e.g., 'Living room south-facing for maximum daylight, bedrooms east for morning light, bathrooms internal')",
    "structuralGrid": "Describe structural logic: column spacing, load-bearing walls, spans (e.g., '5m × 5m structural grid, load-bearing perimeter walls, internal columns at grid intersections')",
    "climateResponse": "Describe climate-responsive features: shading, ventilation, thermal mass (e.g., 'Deep overhangs on south facade for summer shading, cross-ventilation through north-south windows, thermal mass in ground floor slab')",
    "programOrganization": "Describe how program spaces are organized: public vs private, service vs served, vertical zoning (e.g., 'Public spaces (living, dining, kitchen) on ground floor, private spaces (bedrooms) on upper floor, service spaces (utility, storage) in basement')"
  },

  "consistencyRules": {
    "CRITICAL": [
      "FLOOR COUNT: ALL views must show EXACTLY [floorCount] floors (AI-determined: [levelReasoning.reasoning]), NOT [floorCount + 1], NOT [floorCount - 1]",
      "LEVELS: Building has [numLevels] above-ground levels + [hasBasement ? 'basement' : 'no basement'] - ALL views must match",
      "SITE CONSTRAINTS: Building footprint MUST NOT exceed ${maxFootprintArea ? maxFootprintArea.toFixed(0) : "TBD"}m² (${(siteCoverageRatio * 100).toFixed(0)}% of ${siteMetrics?.areaM2?.toFixed(0) || "site"}m² site)",
      "HEIGHTS: Floor heights MUST match: Ground [groundFloorHeight], Upper [upperFloorHeight], Basement [basementHeight if hasBasement] - total height MUST match in ALL views",
      "WINDOWS: Every window position in floor plan MUST appear in corresponding elevation",
      "WINDOWS: Same window on floor plan and elevation MUST have SAME dimensions",
      "ENTRANCE: Main entrance MUST be on [principalFacadeOrientation] facade, centered, visible in [principalFacadeOrientation] elevation and front 3D view",
      "ROOF: Roof type, pitch, and material MUST be IDENTICAL in elevations, sections, and 3D views",
      "MATERIALS: Exact hex color codes MUST be used consistently (no color variations)",
      "DIMENSIONS: Building length × width × height MUST be EXACT same numbers in ALL views",
      "WALLS: Wall thickness MUST be same in plans, sections, and elevations (0.3m exterior, 0.15m interior)",
      "ALIGNMENT: Windows on different floors MUST align vertically in elevations",
      "ELEVATIONS: Show [recommendedElevations[0]] and [recommendedElevations[1]] elevations (principal facade + opposite)",
      "ADJACENCY: Room adjacencies must follow designReasoning.adjacencyDiagram logic",
      "CIRCULATION: Circulation paths must follow designReasoning.circulationLogic",
      "DAYLIGHTING: Window placement must follow designReasoning.daylightingStrategy"
    ],
    "floorPlanRule": "ABSOLUTE 2D overhead CAD drawing, BLACK LINES ON WHITE BACKGROUND, ZERO 3D elements, ZERO perspective, ZERO isometric, ZERO shadows, pure orthographic top view like AutoCAD output",
    "elevationRule": "ABSOLUTE FLAT 2D facade view, BLACK LINES ON WHITE, ZERO depth, ZERO perspective, ZERO 3D, straight-on orthographic projection, like looking at a completely flat wall",
    "sectionRule": "2D cut through building, BLACK LINES ON WHITE, interior visible, dimension annotations, material hatching, ZERO perspective, pure orthographic section",
    "3dRule": "Photorealistic 3D renders that EXACTLY match floor plans and elevations - same dimensions, same window positions, same materials, same floor count, ZERO deviations",
    "differentiation": "Each view MUST be UNIQUE: ground floor ≠ upper floor, north elevation ≠ south elevation, front 3D ≠ side 3D, axonometric ≠ perspective"
  },

  "viewChecklist": {
    "floor_plan_ground": "Ground floor only, 2D overhead, black lines on white",
    "floor_plan_upper": "Upper floor only, 2D overhead, black lines on white, DIFFERENT from ground floor",
    "elevation_north": "North facade, flat 2D, main entrance visible",
    "elevation_south": "South facade, flat 2D, rear facade DIFFERENT from north",
    "elevation_east": "East facade, flat 2D, side view DIFFERENT from north/south",
    "elevation_west": "West facade, flat 2D, opposite side DIFFERENT from east",
    "section_longitudinal": "Long axis cut, interior visible, DIFFERENT from cross section",
    "section_cross": "Short axis cut, perpendicular to longitudinal",
    "exterior_front_3d": "3D from north, photorealistic",
    "exterior_side_3d": "3D from east, DIFFERENT angle from front",
    "axonometric_3d": "45° isometric, NO perspective, DIFFERENT from perspective",
    "perspective_3d": "Eye level perspective, DIFFERENT from axonometric",
    "interior_3d": "Inside living room, DIFFERENT from all exteriors"
  }
}

CRITICAL REQUIREMENTS FOR YOUR RESPONSE:
1. EXACTNESS: Every number must be EXACT (use "15m" not "approximately 15m")
2. MEASURABILITY: Every dimension, color, material must be precisely specified
3. UNIQUENESS: Each view type must have UNIQUE specifications (north elevation must differ from south)
4. COMPLETENESS: Fill in ALL fields with detailed information (no placeholders, no missing objects)
5. CONSISTENCY: Same dimensions and materials must be referenced with EXACT same values
6. NO AMBIGUITY: Use precise terms (not "large windows" but "1.5m × 1.2m casement windows")
7. COLOR CONTRAST: Ensure facade color and trim color are DIFFERENT for visual distinction
8. FLOOR SPECIFICITY: Ground floor rooms must be DIFFERENT from upper floor rooms
9. TOP-LEVEL OBJECTS: MUST include roof, entrance, windows, and colorPalette at top level (not just nested)
10. COLOR VALIDATION: colorPalette.facade MUST match materials.exterior.color, but colorPalette.trim MUST be different

VALIDATION CHECKLIST before responding:
✓ All dimensions are exact numbers (not ranges)
✓ All colors are exact hex codes (not names)
✓ Each elevation has unique features
✓ Floor plans for ground and upper are different
✓ Materials have exact specifications (not just "brick" but "Red clay brick")
✓ Window and door sizes are precisely defined
✓ Roof pitch is exact number (35° not "30-40°")
✓ Top-level "roof" object is filled (type, material, pitch)
✓ Top-level "entrance" object is filled (facade, position, width)
✓ Top-level "windows" object is filled (pattern, type)
✓ colorPalette.facade and colorPalette.trim are DIFFERENT colors for contrast
✓ colorPalette.facade matches materials.exterior.color (same hex code)
✓ colorPalette.trim is different from facade (provides visual contrast)

Respond with ONLY the JSON object, no markdown formatting.`;

    try {
      // 🆕 REFACTORED: Use ModelRouter for env-driven model selection
      // ModelRouter will choose GPT-5-high > GPT-5 > Qwen > Llama based on availability
      logger.info("🧭 Using ModelRouter for DNA generation...");

      const dnaPrompt = promptLibrary.buildDNAGenerationPrompt({
        projectBrief:
          projectContext.projectBrief || `${enforcedProjectType} project`,
        projectType: enforcedProjectType,
        area,
        locationProfile: effectiveLocation,
        blendedStyle,
        siteMetrics,
        programSpaces,
        zoningConstraints: effectiveLocation?.zoning,
      });

      const routerResult = await modelRouter.callLLM("DNA_GENERATION", {
        systemPrompt: dnaPrompt.systemPrompt,
        userPrompt: dnaPrompt.userPrompt,
        schema: true,
        temperature: 0.2,
        maxTokens: 4000,
        context: { priority: "quality", budget: "medium" },
      });

      if (!routerResult.success) {
        throw new Error(`DNA generation failed: ${routerResult.error}`);
      }

      // ModelRouter returns parsed JSON in data field
      let masterDNA = routerResult.data;

      logger.success(
        ` DNA generated via ${routerResult.metadata.model} in ${routerResult.metadata.latencyMs}ms`,
      );

      // 🔧 ENRICH DNA: Ensure all required fields are present with sensible defaults
      masterDNA = this._enrichDNAWithDefaults(
        masterDNA,
        projectContext,
        effectiveLocation,
      );

      logger.success(" Master Design DNA generated successfully");
      logger.info("   Project ID:", masterDNA.projectID);
      logger.info("   Seed:", masterDNA.seed);
      logger.info(
        "   Dimensions:",
        masterDNA.dimensions?.length,
        "×",
        masterDNA.dimensions?.width,
      );
      logger.info("   Floors:", masterDNA.dimensions?.floorCount);

      // 🚨 SITE VALIDATION: Pre-validate and enforce constraints
      if (siteData && siteData.siteArea !== Infinity) {
        logger.info("🔍 Validating design against site constraints...");

        const validationResult = validateDesignAgainstSite(masterDNA, siteData);

        if (!validationResult.valid) {
          logger.warn(
            "⚠️ Site validation errors detected:",
            validationResult.errors.length,
            "errors",
          );

          // Auto-correct critical violations
          for (const error of validationResult.errors) {
            if (error.type === "FOOTPRINT_EXCEEDS_BUILDABLE") {
              // Reduce footprint dimensions to fit
              const currentArea =
                masterDNA.dimensions.length * masterDNA.dimensions.width;
              const scaleFactor =
                Math.sqrt(siteData.buildableArea / currentArea) * 0.95; // 95% to ensure fit

              masterDNA.dimensions.length = Math.floor(
                masterDNA.dimensions.length * scaleFactor,
              );
              masterDNA.dimensions.width = Math.floor(
                masterDNA.dimensions.width * scaleFactor,
              );

              logger.info(
                `   📐 Adjusted footprint: ${masterDNA.dimensions.length}m × ${masterDNA.dimensions.width}m`,
              );
            }

            if (error.type === "HEIGHT_EXCEEDS_LIMIT") {
              // Reduce height to comply
              masterDNA.dimensions.totalHeight = siteData.maxHeight;
              masterDNA.dimensions.height = siteData.maxHeight;
              logger.info(`   📏 Adjusted height: ${siteData.maxHeight}m`);
            }

            if (error.type === "FLOOR_COUNT_EXCEEDS_LIMIT") {
              // Reduce floor count
              masterDNA.dimensions.floorCount = siteData.maxFloors;
              masterDNA.dimensions.numLevels = siteData.maxFloors;
              logger.info(`   🏢 Adjusted floors: ${siteData.maxFloors}`);
            }
          }

          // Re-validate after corrections
          const revalidation = validateDesignAgainstSite(masterDNA, siteData);
          if (!revalidation.valid) {
            logger.error(
              "❌ Critical: Design still violates site constraints after auto-correction",
            );

            // HARD CONSTRAINT ENFORCEMENT: Throw error if corrections fail
            const errorMessages = revalidation.errors
              .map((e) => e.message)
              .join("; ");
            throw new Error(
              `SITE CONSTRAINT VIOLATION: Cannot fit ${area}m² building on ${siteData.siteArea.toFixed(0)}m² site. ` +
                `Violations: ${errorMessages}. ` +
                `Suggestions: ${revalidation.errors.map((e) => e.suggestion).join(", ")}`,
            );
          } else {
            logger.success(" Design adjusted to meet site constraints");
          }
        } else {
          logger.success(" Design validated against site constraints");
        }

        // Add site constraints to DNA for downstream services
        masterDNA.siteConstraints = {
          polygon: siteData.polygon,
          buildableArea: siteData.buildableArea,
          siteArea: siteData.siteArea,
          constraints: siteData.constraints,
          maxHeight: siteData.maxHeight,
          maxFloors: siteData.maxFloors,
          shapeType: siteData.shapeType,
          orientation: siteData.optimalOrientation,
          validated: validationResult.valid,
          adjustmentsApplied: !validationResult.valid,
        };

        // Add boundary validation results for A1 prompt generation
        masterDNA.boundaryValidation = {
          validated: true,
          compliant: validationResult.valid,
          compliancePercentage: validationResult.valid ? 100 : 85,
          wasCorrected: !validationResult.valid,
          setbacks: siteData.constraints || {
            front: 3,
            rear: 3,
            sideLeft: 3,
            sideRight: 3,
          },
          buildableBoundary: siteData.polygon || null,
          correctedFootprint: siteData.polygon
            ? [
                { x: 0, y: 0 },
                { x: masterDNA.dimensions.length, y: 0 },
                {
                  x: masterDNA.dimensions.length,
                  y: masterDNA.dimensions.width,
                },
                { x: 0, y: masterDNA.dimensions.width },
              ]
            : null,
        };

        // Add building orientation to DNA
        if (!masterDNA.buildingOrientation && siteData.optimalOrientation) {
          masterDNA.buildingOrientation = siteData.optimalOrientation;
          logger.info(
            `   🧭 Building orientation set to: ${siteData.optimalOrientation}°`,
          );
        }
      }

      // 🌍 ENHANCEMENT: Apply location and climate modifications
      if (effectiveLocation || effectiveClimate) {
        logger.info("🌍 Applying location and climate modifications...");

        // Apply location-aware modifications
        masterDNA = locationAwareDNAModifier.applyLocationContext(
          masterDNA,
          effectiveLocation,
          effectiveSiteAnalysis,
        );

        // Generate and apply climate-responsive parameters
        if (effectiveClimate) {
          const climateParams =
            climateResponsiveDesignService.generateClimateParameters(
              effectiveClimate,
              effectiveLocation?.coordinates?.lat || 40,
            );
          masterDNA.climateDesign = climateParams;
          logger.info("   Climate strategy:", climateParams.thermal?.strategy);
        }

        // 🆕 Add environmental performance data
        masterDNA.environmental = {
          uValues: {
            wall: 0.18, // W/m²K - UK Building Regs Part L compliant
            roof: 0.13,
            glazing: 1.4,
            floor: 0.15,
          },
          epcRating: "B", // Target B rating (81-91)
          epcScore: 85,
          ventilation: "Natural cross-ventilation",
          sunOrientation: effectiveLocation?.sunPath?.optimalOrientation || 180,
          airTightness: 5.0, // m³/h/m² @ 50Pa
          renewableEnergy: area > 100 ? "Solar PV 4kWp" : null,
        };
        logger.info("   Environmental: EPC Rating B, U-values compliant");

        // 🆕 Add site context to DNA
        if (siteMetrics && siteMetrics.areaM2) {
          masterDNA.siteContext = siteContextStr;
          masterDNA.siteMetrics = siteMetrics;
          logger.info("   Site area:", siteMetrics.areaM2.toFixed(0), "m²");
          logger.info(
            "   Site orientation:",
            (siteMetrics.orientationDeg || 0).toFixed(0),
            "°",
          );
        }

        // 🆕 EXPLICIT FOOTPRINT/MASSING ENCODING
        masterDNA.massing = {
          footprintShape: siteMetrics?.shapeType || "rectangular",
          buildingForm: this._determineBuildingForm(masterDNA, siteMetrics),
          wings: this._determineWingConfiguration(masterDNA, siteMetrics),
          courtyardPresence: siteMetrics?.areaM2 > 400,
          verticalArticulation:
            masterDNA.dimensions?.floorCount > 2 ? "stepped" : "uniform",
          roofForm: masterDNA.roof?.type || "gable",
        };

        // 🆕 EXPLICIT STYLE WEIGHTING (local vs portfolio)
        // Extract portfolio blend percentage from context or use default
        const portfolioBlendPercent =
          projectContext.portfolioBlendPercent ||
          projectContext.portfolioWeight ||
          (blendedStyle?.blendRatio?.portfolio
            ? blendedStyle.blendRatio.portfolio * 100
            : 70);
        const portfolioWeight = portfolioBlendPercent / 100;
        const localWeight = 1 - portfolioWeight;

        masterDNA.styleWeights = {
          local: localWeight,
          portfolio: portfolioWeight,
          localStyle:
            effectiveLocation?.recommendedStyle ||
            blendedStyle?.styleName ||
            "Contemporary",
          portfolioStyle:
            portfolioAnalysis?.dominantStyle ||
            blendedStyle?.styleName ||
            "Contemporary",
          dominantInfluence:
            localWeight > portfolioWeight ? "local" : "portfolio",
        };

        // 🆕 EXPLICIT MATERIAL PRIORITY (emphasize local materials)
        masterDNA.materialPriority = {
          primary:
            effectiveLocation?.localMaterials?.[0] ||
            blendedStyle?.materials?.[0] ||
            "Brick",
          secondary:
            effectiveLocation?.localMaterials?.[1] ||
            blendedStyle?.materials?.[1] ||
            "Glass",
          accent: blendedStyle?.materials?.[2] || "Timber",
          localMaterialsUsed: effectiveLocation?.localMaterials || [],
          portfolioMaterialsUsed: portfolioAnalysis?.materials || [],
          weightedSelection: `${Math.round(localWeight * 100)}% local, ${Math.round(portfolioWeight * 100)}% portfolio`,
        };

        // 🆕 ADD BUILDING TAXONOMY METADATA
        if (buildingCategory || buildingSubType) {
          masterDNA.metadata = masterDNA.metadata || {};
          masterDNA.metadata.buildingTaxonomy = {
            category: buildingCategory,
            subType: buildingSubType,
            fullType: fullBuildingType,
            notes: buildingNotes,
          };
        }

        // 🆕 ADD ENTRANCE ORIENTATION
        if (entranceOrientation) {
          masterDNA.entrance = masterDNA.entrance || {};
          masterDNA.entrance.facade = entranceOrientation;
          masterDNA.entrance.direction = entranceOrientation;
        }

        // 🆕 ADD PROGRAM SPACES TO DNA
        if (programSpaces && programSpaces.length > 0) {
          masterDNA.programSpaces = programSpaces;
        }

        logger.success(" Location, climate, and site enhancements applied");
        logger.info(
          `   Massing: ${masterDNA.massing.buildingForm} form with ${masterDNA.massing.wings} wings`,
        );
        logger.info(
          `   Style weighting: ${Math.round(localWeight * 100)}% local (${masterDNA.styleWeights.localStyle}), ${Math.round(portfolioWeight * 100)}% portfolio`,
        );
        logger.info(
          `   Material priority: ${masterDNA.materialPriority.primary} (local) > ${masterDNA.materialPriority.secondary}`,
        );
        if (buildingCategory && buildingSubType) {
          logger.info(`   Building type: ${fullBuildingType}`);
        }
        if (entranceOrientation) {
          logger.info(`   Main entrance: ${entranceOrientation} facade`);
        }
      }

      logger.info(
        "   Consistency Rules:",
        masterDNA.consistencyRules?.CRITICAL?.length || 0,
      );

      return {
        success: true,
        masterDNA,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error("❌ Master DNA generation failed:", error);

      // Create fallback DNA
      let fallbackDNA = this.createFallbackMasterDNA(projectContext);

      // 🌍 Apply location enhancements to fallback too
      if (effectiveLocation || effectiveClimate) {
        logger.info("🌍 Applying location modifications to fallback DNA...");
        fallbackDNA = locationAwareDNAModifier.applyLocationContext(
          fallbackDNA,
          effectiveLocation,
          effectiveSiteAnalysis,
        );

        if (effectiveClimate) {
          const climateParams =
            climateResponsiveDesignService.generateClimateParameters(
              effectiveClimate,
              effectiveLocation?.coordinates?.lat || 40,
            );
          fallbackDNA.climateDesign = climateParams;
        }
      }

      // Return comprehensive fallback DNA
      return {
        success: false,
        error: error.message,
        masterDNA: fallbackDNA,
      };
    }
  }

  /**
   * Create fallback Master DNA if Together.ai fails
   */
  createFallbackMasterDNA(projectContext) {
    const seed = projectContext.seed || Math.floor(Math.random() * 1000000);
    const floorCount = projectContext.floorCount || 2;
    const length = 15;
    const width = 10;
    const totalHeight = floorCount * 3.0;

    return {
      projectID: `FALLBACK_${seed}`,
      seed: seed,
      isFallback: true,

      dimensions: {
        length: length,
        width: width,
        totalHeight: totalHeight,
        floorCount: floorCount,
        groundFloorHeight: "3.0m",
        upperFloorHeight: "2.7m",
        wallThickness: "0.3m exterior, 0.15m interior",
        totalArea: `${length * width * floorCount}m²`,
        groundFloorArea: `${length * width}m²`,
        upperFloorArea: `${length * width}m²`,
      },

      materials: {
        exterior: {
          primary: "Red clay brick",
          color: "#8B4513",
          texture: "textured",
          bond: "Flemish bond",
        },
        roof: {
          type: "gable",
          material: "Clay tiles",
          color: "#654321",
          pitch: "35°",
        },
        windows: {
          type: "Casement",
          frame: "UPVC",
          color: "#FFFFFF",
          glazing: "Double",
          mullions: "Yes",
        },
        doors: {
          main: {
            type: "Panel",
            material: "Composite",
            color: "#2C3E50",
            width: "1.0m",
          },
        },
        trim: {
          color: "#FFFFFF",
          material: "UPVC",
        },
      },

      floorPlans: {
        ground: {
          rooms: [
            {
              name: "Living Room",
              dimensions: "5.5m × 4.0m",
              area: "22m²",
              position: "Front left",
            },
            {
              name: "Kitchen",
              dimensions: "4.0m × 3.5m",
              area: "14m²",
              position: "Rear left",
            },
            {
              name: "Dining",
              dimensions: "4.0m × 3.5m",
              area: "14m²",
              position: "Rear right",
            },
            {
              name: "Hallway",
              dimensions: "6.0m × 1.2m",
              area: "7m²",
              position: "Center",
            },
          ],
          entrance: {
            location: "Center of north facade",
            type: "Covered porch",
            width: "1.2m",
          },
        },
        upper: {
          rooms: [
            {
              name: "Master Bedroom",
              dimensions: "5.5m × 4.0m",
              area: "22m²",
              position: "Front left",
            },
            {
              name: "Bedroom 2",
              dimensions: "4.0m × 3.5m",
              area: "14m²",
              position: "Front right",
            },
            {
              name: "Bathroom",
              dimensions: "3.0m × 2.5m",
              area: "7.5m²",
              position: "Rear",
            },
          ],
        },
      },

      environmental: {
        uValues: {
          wall: 0.18,
          roof: 0.13,
          glazing: 1.4,
          floor: 0.15,
        },
        epcRating: "B",
        epcScore: 85,
        ventilation: "Natural cross-ventilation",
        sunOrientation: 180,
        airTightness: 5.0,
        renewableEnergy: null,
      },

      elevations: {
        north: {
          description: "FRONT FACADE - Main entrance elevation",
          features: [
            "Main entrance centered",
            "4 ground floor windows",
            "3 upper floor windows",
            "Gable roof",
          ],
          symmetry: "Symmetrical",
          distinctiveFeatures: "Front door with porch",
        },
        south: {
          description: "REAR FACADE - Garden elevation",
          features: [
            "Patio doors",
            "Kitchen window",
            "2 bedroom windows",
            "Gable end",
          ],
          symmetry: "Asymmetrical",
          distinctiveFeatures: "Large patio doors",
        },
        east: {
          description: "RIGHT SIDE ELEVATION",
          features: [
            "2 ground floor windows",
            "2 upper floor windows",
            "Roof slope",
            "Downpipe",
          ],
          symmetry: "Vertical alignment",
          distinctiveFeatures: "Vertically aligned windows",
        },
        west: {
          description: "LEFT SIDE ELEVATION",
          features: [
            "Kitchen window",
            "Bathroom window",
            "Roof slope",
            "Soil pipe",
          ],
          symmetry: "Asymmetrical",
          distinctiveFeatures: "Small bathroom window",
        },
      },

      sections: {
        longitudinal: {
          description: "SECTION A-A - Through staircase",
          cutLocation: "Through center hallway",
          visible: [
            "Staircase",
            "Floor levels",
            "Roof structure",
            "Foundation",
          ],
        },
        cross: {
          description: "SECTION B-B - Perpendicular",
          cutLocation: "Through living room and bedroom",
          visible: ["Rooms", "Floor joists", "Wall layers", "Roof"],
        },
      },

      "3dViews": {
        exterior_front: {
          description: "3D from FRONT",
          camera: "Eye level from north",
          visible: ["North facade", "partial east", "roof"],
        },
        exterior_side: {
          description: "3D from SIDE",
          camera: "Eye level from east",
          visible: ["East facade", "partial north and south", "roof slope"],
        },
        axonometric: {
          description: "45° AXONOMETRIC",
          camera: "45° from northeast",
          visible: ["North and east facades", "full roof"],
        },
        perspective: {
          description: "2-POINT PERSPECTIVE",
          camera: "Eye level from northwest",
          visible: ["North and west facades", "roof with perspective"],
        },
        interior: {
          description: "INTERIOR living room",
          camera: "Inside looking at windows",
          visible: ["Living room", "windows", "ceiling"],
        },
      },

      colorPalette: {
        primary: "#8B4513",
        secondary: "#FFFFFF",
        facade: "#8B4513",
        trim: "#FFFFFF",
        roof: "#654321",
        windows: "#FFFFFF",
        door: "#2C3E50",
      },

      roof: {
        type: "gable",
        material: "Clay tiles",
        pitch: "35",
      },

      entrance: {
        facade: "N",
        position: "center",
        width: "1.0m",
      },

      windows: {
        pattern: "grid",
        type: "Casement",
      },

      consistencyRules: {
        CRITICAL: [
          `ALL views must show ${floorCount} floors`,
          "Window positions MUST be IDENTICAL in all views",
          "Main entrance MUST be on north facade, centered",
          "Roof type MUST be gable at 35° in ALL views",
          "Building dimensions MUST be exactly " +
            length +
            "m × " +
            width +
            "m × " +
            totalHeight +
            "m",
        ],
      },

      viewChecklist: {
        floor_plan_ground: "Ground floor 2D, black on white",
        floor_plan_upper: "Upper floor 2D, DIFFERENT from ground",
        elevation_north: "North facade flat 2D",
        elevation_south: "South facade DIFFERENT",
        elevation_east: "East facade DIFFERENT",
        elevation_west: "West facade DIFFERENT",
        section_longitudinal: "Long cut DIFFERENT",
        section_cross: "Short cut DIFFERENT",
        exterior_front_3d: "3D from north",
        exterior_side_3d: "3D from east DIFFERENT",
        axonometric_3d: "45° iso DIFFERENT",
        perspective_3d: "Perspective DIFFERENT",
        interior_3d: "Interior DIFFERENT",
      },
    };
  }

  /**
   * Enrich DNA with defaults for missing fields
   * Ensures all required fields are present for A1 sheet generation
   * @private
   */
  _enrichDNAWithDefaults(masterDNA, projectContext, location) {
    // Ensure dimensions object exists before accessing nested props
    const defaultFloorCount =
      projectContext.floorCount ||
      projectContext.programSpaces?._calculatedFloorCount ||
      2;
    if (!masterDNA.dimensions || typeof masterDNA.dimensions !== "object") {
      masterDNA.dimensions = {};
    }
    if (!masterDNA.dimensions.length || !masterDNA.dimensions.width) {
      const fallbackArea =
        parseFloat(projectContext.floorArea || projectContext.area) || 180;
      const floors = defaultFloorCount || 2;
      const footprint = Math.max(60, fallbackArea / floors);
      const ratio = 1.4;
      const estimatedLength = Math.sqrt(footprint * ratio);
      const estimatedWidth = estimatedLength / ratio;
      masterDNA.dimensions.length =
        masterDNA.dimensions.length || Math.round(estimatedLength * 10) / 10;
      masterDNA.dimensions.width =
        masterDNA.dimensions.width || Math.round(estimatedWidth * 10) / 10;
    }
    if (!masterDNA.dimensions.floorCount) {
      masterDNA.dimensions.floorCount = defaultFloorCount || 2;
    }
    if (!masterDNA.dimensions.height) {
      masterDNA.dimensions.height =
        (masterDNA.dimensions.floorCount || 2) * 3.2;
    }
    if (!masterDNA.dimensions.totalHeight) {
      masterDNA.dimensions.totalHeight = masterDNA.dimensions.height;
    }

    // Ensure materials array exists
    if (
      !masterDNA.materials ||
      !Array.isArray(masterDNA.materials) ||
      masterDNA.materials.length === 0
    ) {
      masterDNA.materials = [
        {
          name: "Red brick",
          hexColor: "#B8604E",
          application: "exterior walls",
          texture: "stretcher bond",
          finish: "matte",
        },
        {
          name: "Aluminum frames",
          hexColor: "#333333",
          application: "windows and doors",
          finish: "powder coated",
        },
      ];
    }

    // Ensure roof configuration exists
    if (!masterDNA.roof || typeof masterDNA.roof !== "object") {
      masterDNA.roof = {
        type: "gable",
        pitch: 35,
        material: "Clay tiles",
        color: "#8B4513",
        overhang: "0.5m",
        gutters: "Cast aluminum",
      };
    }

    // Ensure color palette exists
    if (!masterDNA.colorPalette || typeof masterDNA.colorPalette !== "object") {
      masterDNA.colorPalette = {
        facade: masterDNA.materials?.[0]?.hexColor || "#B8604E",
        trim: "#FFFFFF",
        roof: masterDNA.roof?.color || "#8B4513",
        accent: "#2C3E50",
      };
    }

    // Ensure entrance configuration exists
    if (!masterDNA.entrance || typeof masterDNA.entrance !== "object") {
      const entranceDir =
        projectContext.entranceDirection ||
        projectContext.entranceOrientation ||
        "N";
      masterDNA.entrance = {
        facade: entranceDir,
        direction: entranceDir,
        position: "centered",
        type: "main entrance",
        width: "1.2m",
        canopy: true,
      };
    }

    // Ensure doors configuration exists
    if (!masterDNA.doors || typeof masterDNA.doors !== "object") {
      const entranceDir = masterDNA.entrance?.facade || "N";
      masterDNA.doors = {
        location:
          entranceDir === "N"
            ? "north"
            : entranceDir === "S"
              ? "south"
              : entranceDir === "E"
                ? "east"
                : "west",
        position: "centered",
        width: 1.2,
        color: "#2C3E50",
        type: "Panel door",
      };
    }

    // Ensure window configuration exists
    if (!masterDNA.windows || typeof masterDNA.windows !== "object") {
      const floorCount = masterDNA.dimensions?.floorCount || 2;
      const baseWindowCount =
        floorCount === 1 ? 8 : floorCount === 2 ? 12 : floorCount * 6;

      masterDNA.windows = {
        type: "Casement",
        frame: "Aluminum",
        color: "#333333",
        glazing: "Double glazed",
        standardSize: "1.5m × 1.2m",
        counts: {
          north: Math.ceil(baseWindowCount * 0.35),
          south: Math.ceil(baseWindowCount * 0.3),
          east: Math.ceil(baseWindowCount * 0.2),
          west: Math.ceil(baseWindowCount * 0.15),
        },
      };
    }

    // Ensure dimensions has totalArea
    if (!masterDNA.dimensions.totalArea) {
      const length = masterDNA.dimensions.length || 15;
      const width = masterDNA.dimensions.width || 10;
      const floors = masterDNA.dimensions.floorCount || 2;
      masterDNA.dimensions.totalArea = length * width * floors;
    }

    return masterDNA;
  }

  /**
   * Determine building form based on DNA and site metrics
   * @private
   */
  _determineBuildingForm(masterDNA, siteMetrics) {
    const floorCount = masterDNA.dimensions?.floorCount || 2;
    const footprintArea =
      (masterDNA.dimensions?.length || 15) *
      (masterDNA.dimensions?.width || 10);
    const siteArea = siteMetrics?.areaM2 || footprintArea * 2;
    const coverage = footprintArea / siteArea;

    // Determine form based on site coverage and floor count
    if (coverage > 0.7) {
      return "compact"; // High coverage - compact form
    } else if (floorCount > 3) {
      return "tower"; // Tall building - tower form
    } else if (
      siteMetrics?.shapeType === "L-shaped" ||
      siteMetrics?.shapeType === "corner"
    ) {
      return "L-shaped"; // L-shaped site - L-shaped building
    } else if (siteArea > 500 && coverage < 0.4) {
      return "courtyard"; // Large site, low coverage - courtyard form
    } else {
      return "linear"; // Default - linear form
    }
  }

  /**
   * Determine wing configuration based on DNA and site metrics
   * @private
   */
  _determineWingConfiguration(masterDNA, siteMetrics) {
    const buildingForm = this._determineBuildingForm(masterDNA, siteMetrics);

    switch (buildingForm) {
      case "L-shaped":
        return "two-wing";
      case "courtyard":
        return "four-wing";
      case "tower":
        return "single-core";
      case "compact":
        return "single-volume";
      case "linear":
      default:
        return "single-bar";
    }
  }
}

export default new EnhancedDNAGenerator();
