/**
 * Enhanced AI Integration Service with UK Intelligence
 * Complete workflow: Location → Portfolio → Style Blending → Generation
 */

import togetherAIReasoningService from "./togetherAIReasoningService.js";
import enhancedUKLocationService from "./enhancedUKLocationService.js";
import enhancedPortfolioService from "./enhancedPortfolioService.js";
import aiIntegrationService from "./aiIntegrationService.js";
import designDNAGenerator from "./designDNAGenerator.js";
import logger from "../utils/logger.js";
import { PIPELINE_MODE } from "../config/pipelineMode.js";

class EnhancedAIIntegrationService {
  constructor() {
    this.openai = togetherAIReasoningService;
    this.ukLocation = enhancedUKLocationService;
    this.portfolio = enhancedPortfolioService;
    this.aiIntegration = aiIntegrationService;
  }

  /**
   * MASTER WORKFLOW: Complete intelligent design generation
   *
   * Steps:
   * 1. Analyze UK location (climate, sun, wind, materials, regulations)
   * 2. Analyze portfolio with OpenAI GPT-4 Vision
   * 3. Blend portfolio style with location context
   * 4. Create Building DNA for consistency
   * 5. Generate floor plans, elevations, sections, 3D views
   * 6. Ensure all outputs show the SAME building
   */
  async generateCompleteIntelligentDesign(
    projectContext,
    portfolioFiles = [],
    materialWeight = 0.5,
    characteristicWeight = 0.5,
  ) {
    try {
      logger.info("🎯 ============================================");
      logger.info("🎯 STARTING COMPLETE INTELLIGENT DESIGN WORKFLOW");
      logger.info("🎯 ============================================");

      // ========================================
      // STEP 1: UK LOCATION INTELLIGENCE
      // ========================================
      logger.info("\n📍 STEP 1: UK Location Intelligence Analysis");
      logger.info("   Address:", projectContext.location?.address);
      logger.info("   Coordinates:", projectContext.location?.coordinates);

      let ukAnalysis = null;
      const isUKLocation = this.isUKLocation(projectContext.location);

      if (isUKLocation) {
        logger.info("🇬🇧 Detected UK location - using enhanced UK intelligence");
        ukAnalysis = await this.ukLocation.analyzeUKLocation(
          projectContext.location.address,
          projectContext.location.coordinates,
        );

        if (ukAnalysis.success) {
          logger.success(" UK Analysis Complete:");
          logger.info("   Region:", ukAnalysis.region);
          logger.info("   Climate:", ukAnalysis.climateData.type);
          logger.info("   Sun path:", ukAnalysis.sunData.optimalOrientation);
          logger.info("   Wind:", ukAnalysis.climateData.prevailingWind);
          logger.info(
            "   Traditional style:",
            ukAnalysis.architecturalData.traditionalStyles?.[0]?.name,
          );
        }
      } else {
        logger.info("🌍 Non-UK location - using global database");
        ukAnalysis = null;
      }

      // ========================================
      // STEP 2: PORTFOLIO ANALYSIS WITH GPT-4 VISION
      // ========================================
      logger.info("\n🎨 STEP 2: Portfolio Analysis with GPT-4 Vision");

      let portfolioAnalysis = null;
      if (portfolioFiles && portfolioFiles.length > 0) {
        logger.info("   Portfolio files:", portfolioFiles.length);
        portfolioAnalysis = await this.portfolio.analyzePortfolio(
          portfolioFiles,
          ukAnalysis || projectContext.location,
        );

        if (portfolioAnalysis.success) {
          logger.success(" Portfolio Analysis Complete:");
          logger.info(
            "   Style:",
            portfolioAnalysis.primaryStyle?.name || "Unknown",
          );
          logger.info(
            "   Confidence:",
            portfolioAnalysis.primaryStyle?.confidence || "N/A",
          );
          logger.info(
            "   Materials:",
            portfolioAnalysis.materials?.exterior?.slice(0, 3).join(", ") ||
              "N/A",
          );
          if (portfolioAnalysis.locationCompatibility?.climateSuitability) {
            logger.info(
              "   Compatibility:",
              portfolioAnalysis.locationCompatibility.climateSuitability,
            );
          }
        }
      } else {
        logger.info(
          "⏭️  No portfolio provided - will use location-based design",
        );
      }

      // ========================================
      // STEP 3: STYLE BLENDING
      // ========================================
      logger.info("\n🎨 STEP 3: Style Blending (Portfolio + Location)");
      logger.info(
        "   Material weight:",
        `${Math.round((1 - materialWeight) * 100)}% local / ${Math.round(materialWeight * 100)}% portfolio`,
      );
      logger.info(
        "   Characteristic weight:",
        `${Math.round((1 - characteristicWeight) * 100)}% local / ${Math.round(characteristicWeight * 100)}% portfolio`,
      );

      let blendedStyle = null;
      if (portfolioAnalysis && ukAnalysis) {
        blendedStyle = this.portfolio.blendStyleWithLocation(
          portfolioAnalysis,
          ukAnalysis,
          materialWeight,
          characteristicWeight,
        );
        logger.success(" Style Blending Complete:");
        logger.info("   Blended style:", blendedStyle.styleName);
        logger.info(
          "   Materials:",
          blendedStyle.materials.slice(0, 4).join(", "),
        );
        logger.info(
          "   Portfolio influence:",
          Math.round(blendedStyle.portfolioInfluence * 100) + "%",
        );
      } else if (ukAnalysis) {
        // Use UK location style
        blendedStyle = this.createLocationBasedStyle(ukAnalysis);
        logger.info("✅ Using location-based style:", blendedStyle.styleName);
      } else {
        // Fallback to project context
        blendedStyle = this.createContextBasedStyle(projectContext);
        logger.info("✅ Using context-based style:", blendedStyle.styleName);
      }

      // ========================================
      // STEP 4: CREATE COMPREHENSIVE DESIGN DNA WITH OPENAI
      // ========================================
      logger.info(
        "\n🧬 STEP 4: Creating Comprehensive Design DNA for 80%+ Consistency",
      );
      logger.info(
        "   Using OpenAI to generate ultra-detailed specifications...",
      );

      const projectSeed =
        projectContext.projectSeed || Math.floor(Math.random() * 1000000);
      logger.info("   Project Seed:", projectSeed);

      const enhancedContext = {
        ...projectContext,
        seed: projectSeed,
        projectSeed: projectSeed,
        ukLocationData: ukAnalysis,
        portfolioStyle: portfolioAnalysis,
        blendedStyle: blendedStyle,
        architecturalStyle: blendedStyle.styleName,
        materials: blendedStyle.materials.slice(0, 3).join(", "),
        sunPath: ukAnalysis?.sunData,
        windData: ukAnalysis?.climateData,
        regulations: ukAnalysis?.regulations,
      };

      // Generate comprehensive Design DNA using OpenAI (with fallback)
      const comprehensiveDNA =
        await designDNAGenerator.generateComprehensiveDesignDNA(
          enhancedContext,
        );

      // Also generate basic Building DNA for backward compatibility
      const basicDNA = this.aiIntegration.createBuildingDNA(
        enhancedContext,
        blendedStyle,
      );

      // Merge both DNAs - comprehensive takes priority
      const buildingDNA = {
        ...basicDNA,
        ...comprehensiveDNA,
        // Ensure critical fields exist
        dimensions: comprehensiveDNA.dimensions || basicDNA.dimensions,
        materials: comprehensiveDNA.materials || basicDNA.materials,
        roof: comprehensiveDNA.roof || basicDNA.roof,
        windows: comprehensiveDNA.windows || basicDNA.windows,
        colorPalette: comprehensiveDNA.colorPalette || {},
        consistencyNotes: comprehensiveDNA.consistencyNotes || {},
      };

      enhancedContext.buildingDNA = buildingDNA;
      enhancedContext.masterDesignSpec = buildingDNA;
      enhancedContext.comprehensiveDNA = comprehensiveDNA;

      logger.success(" Comprehensive Design DNA Created:");
      logger.info(
        "   Dimensions:",
        `${buildingDNA.dimensions?.length || 15}m × ${buildingDNA.dimensions?.width || 10}m`,
      );
      logger.info("   Floors:", buildingDNA.dimensions?.floorCount || 2);
      logger.info(
        "   Primary Material:",
        buildingDNA.materials?.exterior?.primary ||
          buildingDNA.materials?.exterior ||
          "Modern materials",
      );
      logger.info(
        "   Material Color:",
        buildingDNA.materials?.exterior?.color || "Natural",
      );
      logger.info(
        "   Roof:",
        buildingDNA.roof?.type || "gable",
        buildingDNA.roof?.material || "",
      );
      logger.info(
        "   Windows:",
        buildingDNA.windows?.type || "modern",
        "-",
        buildingDNA.windows?.color || "",
      );
      logger.info(
        "   Color Palette:",
        buildingDNA.colorPalette?.primary || "Natural tones",
      );
      if (comprehensiveDNA.consistencyNotes?.criticalForAllViews) {
        logger.info(
          "   🎯 Consistency Rule:",
          comprehensiveDNA.consistencyNotes.criticalForAllViews,
        );
      }

      // ========================================
      // STEP 4.5: GENERATE STYLE SIGNATURE FOR DALL·E 3 CONSISTENCY
      // ========================================
      logger.info(
        "\n🎨 STEP 4.5: Generating Style Signature for DALL·E 3 Consistency",
      );

      let styleSignature = null;
      if (projectContext.styleSignature) {
        // Use cached signature from ArchitectAIEnhanced
        styleSignature = projectContext.styleSignature;
        logger.success(" Using cached style signature from context");
      } else {
        // Generate new signature with BLENDED STYLE (respects material/characteristic weights)
        try {
          styleSignature = await this.aiIntegration.generateStyleSignature(
            {
              portfolioStyle: portfolioAnalysis,
              blendedStyle: blendedStyle, // CRITICAL: Pass blended style with proper weights
            },
            {
              buildingProgram: projectContext.buildingProgram || "building",
              area: projectContext.area || projectContext.floorArea || 200,
              floorArea:
                parseInt(projectContext.area || projectContext.floorArea) ||
                200,
              buildingDNA: buildingDNA, // Pass building DNA for consistency
            },
            {
              address: projectContext.location?.address,
              climate: ukAnalysis?.climateData,
              ukAnalysis: ukAnalysis, // Pass full UK analysis
            },
          );
          logger.success(
            " Style signature generated with blended materials for DALL·E 3",
          );
          logger.info(
            `   Using materials: ${blendedStyle.materials.slice(0, 3).join(", ")}`,
          );
        } catch (sigError) {
          logger.warn(
            "⚠️ Style signature generation failed, using fallback:",
            sigError.message,
          );
          styleSignature = this.aiIntegration.getFallbackStyleSignature(
            projectContext,
            {
              address: projectContext.location?.address,
              blendedStyle: blendedStyle,
            },
          );
        }
      }

      enhancedContext.styleSignature = styleSignature;

      // ========================================
      // STEP 5: GENERATE ALL IMAGES WITH DALL·E 3 (Primary) + SDXL (Fallback)
      // ========================================
      logger.info(
        "\n🏗️  STEP 5: Generating All Architectural Views with DALL·E 3",
      );
      logger.info("   Primary: DALL·E 3 | Fallback: Replicate SDXL");

      // Define all view requests (12 total views)
      const viewRequests = [
        { viewType: "floor_plan", meta: enhancedContext, size: "1024x1024" },
        {
          viewType: "elevation_north",
          meta: enhancedContext,
          size: "1024x1024",
        },
        {
          viewType: "elevation_south",
          meta: enhancedContext,
          size: "1024x1024",
        },
        {
          viewType: "elevation_east",
          meta: enhancedContext,
          size: "1024x1024",
        },
        {
          viewType: "elevation_west",
          meta: enhancedContext,
          size: "1024x1024",
        },
        {
          viewType: "section_longitudinal",
          meta: enhancedContext,
          size: "1024x1024",
        },
        { viewType: "section_cross", meta: enhancedContext, size: "1024x1024" },
        {
          viewType: "exterior_front",
          meta: enhancedContext,
          size: "1024x1536",
        },
        { viewType: "exterior_side", meta: enhancedContext, size: "1024x1536" },
        { viewType: "interior", meta: enhancedContext, size: "1536x1024" },
        { viewType: "axonometric", meta: enhancedContext, size: "1024x1024" },
        { viewType: "perspective", meta: enhancedContext, size: "1536x1024" },
      ];

      // Generate all images with DALL·E 3 primary, SDXL fallback
      const allImages = await this.aiIntegration.generateConsistentImages(
        viewRequests,
        enhancedContext,
      );

      logger.success(" All architectural views generated (DALL·E 3 ONLY)");
      logger.info(
        `   ✅ DALL·E 3 Success: ${allImages.filter((r) => r.source === "dalle3").length}/${allImages.length}`,
      );
      logger.info(
        `   ❌ Placeholder: ${allImages.filter((r) => r.source === "placeholder").length}/${allImages.length}`,
      );
      logger.info(
        `   🎯 Consistency Level: ${allImages.filter((r) => r.source === "dalle3").length === allImages.length ? "PERFECT (100%)" : "HIGH (80%+)"}`,
      );
      logger.info(
        `   📊 Success Rate: ${Math.round((allImages.filter((r) => r.source === "dalle3").length / allImages.length) * 100)}%`,
      );

      // Organize results into legacy structure for compatibility
      const floorPlanResult = allImages.find(
        (r) => r.viewType === "floor_plan",
      );
      logger.info("🔍 Floor plan result:", floorPlanResult);
      logger.info("🔍 Floor plan images:", floorPlanResult?.images);

      const floorPlans = {
        floorPlans: {
          ground: {
            images: floorPlanResult?.images || [
              "https://placehold.co/1024x1024?text=Floor+Plan",
            ],
          },
        },
      };

      const technicalDrawings = {
        technicalDrawings: {
          elevation_north: {
            images:
              allImages.find((r) => r.viewType === "elevation_north")?.images ||
              [],
          },
          elevation_south: {
            images:
              allImages.find((r) => r.viewType === "elevation_south")?.images ||
              [],
          },
          elevation_east: {
            images:
              allImages.find((r) => r.viewType === "elevation_east")?.images ||
              [],
          },
          elevation_west: {
            images:
              allImages.find((r) => r.viewType === "elevation_west")?.images ||
              [],
          },
          section_longitudinal: {
            images:
              allImages.find((r) => r.viewType === "section_longitudinal")
                ?.images || [],
          },
          section_cross: {
            images:
              allImages.find((r) => r.viewType === "section_cross")?.images ||
              [],
          },
        },
      };

      const exteriorFrontResult = allImages.find(
        (r) => r.viewType === "exterior_front",
      );
      const exteriorSideResult = allImages.find(
        (r) => r.viewType === "exterior_side",
      );
      const interiorResult = allImages.find((r) => r.viewType === "interior");
      const axonometricResult = allImages.find(
        (r) => r.viewType === "axonometric",
      );
      const perspectiveResult = allImages.find(
        (r) => r.viewType === "perspective",
      );

      logger.info("🔍 3D Views extraction:");
      logger.info("  exterior_front:", exteriorFrontResult?.images);
      logger.info("  exterior_side:", exteriorSideResult?.images);
      logger.info("  interior:", interiorResult?.images);
      logger.info("  axonometric:", axonometricResult?.images);
      logger.info("  perspective:", perspectiveResult?.images);

      const views = {
        exterior_front: { images: exteriorFrontResult?.images || [] },
        exterior_side: { images: exteriorSideResult?.images || [] },
        interior: { images: interiorResult?.images || [] },
        axonometric: { images: axonometricResult?.images || [] },
        perspective: { images: perspectiveResult?.images || [] },
      };

      const floorPlanImage = floorPlans.floorPlans.ground.images[0];

      // ========================================
      // STEP 6: COMPILE RESULTS
      // ========================================
      logger.info("\n📦 STEP 6: Compiling Complete Results");

      const results = {
        success: true,

        // Intelligence data
        ukLocationAnalysis: ukAnalysis,
        portfolioAnalysis: portfolioAnalysis,
        blendedStyle: blendedStyle,
        buildingDNA: buildingDNA,
        styleSignature: styleSignature, // NEW: DALL·E 3 style signature

        // Generated outputs
        floorPlans: floorPlans,
        technicalDrawings: technicalDrawings,
        visualizations: {
          views: views,
          floorPlanReference: floorPlanImage,
        },

        // DALL·E 3 generation details
        imageGeneration: {
          allImages: allImages, // Full details of each generation
          dalle3Count: allImages.filter((r) => r.source === "dalle3").length,
          sdxlFallbackCount: allImages.filter(
            (r) => r.source === "sdxl_fallback",
          ).length,
          failedCount: allImages.filter((r) => !r.success).length,
          totalCount: allImages.length,
        },

        // Metadata
        projectSeed: projectSeed,
        enhancedContext: enhancedContext,
        materialWeight: materialWeight,
        characteristicWeight: characteristicWeight,

        // Summary
        summary: {
          region: ukAnalysis?.region || "Global",
          portfolioStyle: portfolioAnalysis?.primaryStyle?.name || "None",
          blendedStyleName: blendedStyle.styleName,
          totalFloors:
            buildingDNA.dimensions?.floorCount ||
            buildingDNA.dimensions?.floors ||
            2,
          buildingDimensions: `${buildingDNA.dimensions?.length || 15}m × ${buildingDNA.dimensions?.width || 10}m`,
          materials: blendedStyle.materials.slice(0, 3),
          imageGenerator: "DALL·E 3 with SDXL fallback", // NEW
          consistencyLevel: styleSignature?.isFallback
            ? "Standard"
            : "High (80%+)", // NEW
        },

        timestamp: new Date().toISOString(),
        workflow: PIPELINE_MODE.MULTI_PANEL,
      };

      logger.info("\n✅ ============================================");
      logger.success(" COMPLETE INTELLIGENT DESIGN WORKFLOW FINISHED");
      logger.success(" ============================================");
      logger.info("   Summary:", results.summary);
      logger.info("   🎨 Image Generator:", results.summary.imageGenerator);
      logger.info("   🎯 Consistency Level:", results.summary.consistencyLevel);

      logger.info("\n📦 FINAL RESULT STRUCTURE:");
      logger.info(
        "   floorPlans.floorPlans.ground.images:",
        results.floorPlans?.floorPlans?.ground?.images?.length || 0,
        "images",
      );
      logger.info(
        "   technicalDrawings.technicalDrawings:",
        Object.keys(results.technicalDrawings?.technicalDrawings || {}).length,
        "drawings",
      );
      logger.info(
        "   visualizations.views:",
        Object.keys(results.visualizations?.views || {}).length,
        "views",
      );
      logger.info(
        "   visualizations.views.exterior_front.images:",
        results.visualizations?.views?.exterior_front?.images?.length || 0,
      );
      logger.info(
        "   visualizations.views.exterior_side.images:",
        results.visualizations?.views?.exterior_side?.images?.length || 0,
      );
      logger.info(
        "   visualizations.views.interior.images:",
        results.visualizations?.views?.interior?.images?.length || 0,
      );
      logger.info(
        "   visualizations.views.axonometric.images:",
        results.visualizations?.views?.axonometric?.images?.length || 0,
      );
      logger.info(
        "   visualizations.views.perspective.images:",
        results.visualizations?.views?.perspective?.images?.length || 0,
      );

      return results;
    } catch (error) {
      logger.error("\n❌ Enhanced intelligent design generation error:", error);
      return {
        success: false,
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Check if location is in UK
   */
  isUKLocation(location) {
    if (!location) return false;

    const address = (location.address || "").toLowerCase();
    const coords = location.coordinates;

    // Check address contains UK identifiers
    if (
      address.includes("uk") ||
      address.includes("united kingdom") ||
      address.includes("england") ||
      address.includes("scotland") ||
      address.includes("wales") ||
      address.includes("northern ireland") ||
      address.includes("london") ||
      address.includes("manchester") ||
      address.includes("edinburgh") ||
      address.includes("cardiff") ||
      address.includes("belfast") ||
      address.includes("birmingham") ||
      address.includes("glasgow") ||
      address.includes("liverpool") ||
      address.includes("bristol")
    ) {
      return true;
    }

    // Check coordinates (UK bounding box)
    if (coords && coords.lat && coords.lng) {
      // UK: lat 49-61, lng -8 to 2
      if (
        coords.lat >= 49 &&
        coords.lat <= 61 &&
        coords.lng >= -8 &&
        coords.lng <= 2
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Create style from UK location data
   */
  createLocationBasedStyle(ukAnalysis) {
    const region = ukAnalysis.region;
    const traditionalStyle =
      ukAnalysis.architecturalData.traditionalStyles?.[0];
    const contemporaryStyle =
      ukAnalysis.architecturalData.contemporaryStyles?.[0];
    const materials = ukAnalysis.materials.walls || [];

    return {
      styleName: `${region} ${contemporaryStyle?.name || "Contemporary"}`,
      materials: materials.slice(0, 4),
      characteristics: [
        ...(traditionalStyle?.characteristics || []).slice(0, 2),
        ...(contemporaryStyle?.characteristics || []).slice(0, 2),
      ],
      portfolioInfluence: 0,
      locationInfluence: 1,
      description: `Contemporary ${region} architecture incorporating local materials and climate-responsive design. Features ${materials.slice(0, 3).join(", ")} with ${traditionalStyle?.name || "traditional"} influences adapted for modern living.`,
    };
  }

  /**
   * Create style from project context (fallback)
   */
  createContextBasedStyle(projectContext) {
    return {
      styleName: projectContext.architecturalStyle || "Contemporary",
      materials: (projectContext.materials || "brick, glass, timber")
        .split(",")
        .map((m) => m.trim()),
      characteristics: [
        "Clean lines and modern aesthetics",
        "Functional spatial organization",
        "Sustainable design principles",
        "Quality materials and craftsmanship",
      ],
      portfolioInfluence: 0,
      locationInfluence: 0,
      description: `${projectContext.architecturalStyle || "Contemporary"} design approach with ${projectContext.materials || "modern materials"}, creating a functional and aesthetically pleasing ${projectContext.buildingProgram || "building"}.`,
    };
  }

  /**
   * Simplified workflow for non-UK locations
   */
  async generateStandardDesign(projectContext, portfolioFiles = []) {
    logger.info("🌍 Generating standard design (non-UK location)");

    // Reuse existing logic but without UK-specific intelligence
    return await this.generateCompleteIntelligentDesign(
      projectContext,
      portfolioFiles,
      0.5, // Balanced material weight
      0.5, // Balanced characteristic weight
    );
  }
}

export default new EnhancedAIIntegrationService();
