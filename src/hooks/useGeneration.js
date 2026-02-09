import { useCallback } from "react";
import { useDesignContext } from "../context/DesignContext.jsx";
import dnaWorkflowOrchestrator from "../services/dnaWorkflowOrchestrator.js";
import designGenerationHistory from "../services/designGenerationHistory.js";
import logger from "../utils/logger.js";
import { normalizeMultiPanelResult } from "../types/schemas.js";
import {
  resolveWorkflowByMode,
  executeWorkflow,
  UnsupportedPipelineModeError,
} from "../services/workflowRouter.js";

/**
 * useGeneration - AI Generation Workflow Hook
 *
 * Handles the complete AI design generation process:
 * - Pre-generation validation
 * - Project seed generation
 * - Portfolio analysis
 * - DNA generation
 * - A1 sheet generation (standard or hybrid mode)
 * - Design history storage
 * - Progress tracking
 *
 * @returns {Object} Generation functions and state
 */
export const useGeneration = () => {
  const {
    projectDetails,
    programSpaces,
    locationData,
    portfolioFiles,
    sitePolygon,
    siteMetrics,
    materialWeight,
    characteristicWeight,
    projectStyleSignature,
    setProjectStyleSignature,
    generatedDesigns,
    setGeneratedDesigns,
    currentDesignId,
    setCurrentDesignId,
    isLoading,
    setIsLoading,
    generationProgress,
    setGenerationProgress,
    generationStartTime,
    setGenerationStartTime,
    elapsedTime,
    setElapsedTime,
    isGenerationComplete,
    setIsGenerationComplete,
    showToast,
    goToStep,
  } = useDesignContext();

  /**
   * Update generation progress
   */
  const updateProgress = useCallback(
    (phase, step, message) => {
      const totalSteps = 7;
      setGenerationProgress({
        phase,
        step,
        totalSteps,
        message,
        percentage: Math.round((step / totalSteps) * 100),
      });
      logger.info(
        `Progress: Step ${step}/${totalSteps} - ${message}`,
        null,
        "📊",
      );
    },
    [setGenerationProgress],
  );

  /**
   * Validate project parameters before generation
   */
  const validateBeforeGeneration = useCallback(
    (projectContext) => {
      const errors = [];
      const warnings = [];

      logger.info(
        "Validating project context",
        {
          buildingProgram: projectContext.buildingProgram,
          area: projectContext.area,
          hasLocation: !!projectContext.location?.address,
        },
        "🔍",
      );

      // Critical validations
      if (!projectContext.buildingProgram) {
        errors.push("Building program is required");
      }

      const floors =
        projectContext.specifications?.floors || projectContext.floors;
      if (floors && (floors < 1 || floors > 5)) {
        errors.push("Floors must be between 1 and 5");
      }

      if (!projectContext.area || parseInt(projectContext.area) < 50) {
        errors.push("Floor area must be at least 50m²");
      }

      // Warnings
      if (!projectContext.location || !projectContext.location.address) {
        warnings.push(
          "Location not specified - using generic design parameters",
        );
      }

      if (!portfolioFiles || portfolioFiles.length === 0) {
        warnings.push(
          "No portfolio provided - using location-based style only",
        );
      }

      if (!projectContext.specifications?.entranceDirection) {
        warnings.push("Entrance direction not specified - defaulting to South");
      }

      // Display validation results
      if (errors.length > 0) {
        logger.error("Validation failed", { errors });
        errors.forEach((err, idx) => {
          logger.error(`  ${idx + 1}. ${err}`);
        });
        showToast(`Validation failed: ${errors.join(", ")}`);
        return { valid: false, errors, warnings };
      }

      if (warnings.length > 0) {
        logger.warn("Generation warnings", { warnings });
        warnings.forEach((w) => {
          logger.info(`  • ${w}`);
        });
      }

      logger.info("Pre-generation validation passed", null, "✅");
      return { valid: true, errors: [], warnings };
    },
    [portfolioFiles, showToast],
  );

  /**
   * Generate style signature for portfolio consistency (DALL·E 3)
   */
  const generateStyleSignature = useCallback(async () => {
    if (projectStyleSignature || portfolioFiles.length === 0) {
      logger.info("Using existing style signature or no portfolio");
      return projectStyleSignature;
    }

    logger.info(
      "Generating project style signature for DALL·E 3 consistency",
      null,
      "🎨",
    );

    try {
      const aiIntegrationService = (
        await import("../services/aiIntegrationService")
      ).default;

      const styleSignature = await aiIntegrationService.generateStyleSignature(
        { portfolioFiles },
        {
          buildingProgram: projectDetails?.program,
          area: projectDetails?.area,
          floorArea: parseInt(projectDetails?.area) || 200,
        },
        locationData || {},
      );

      setProjectStyleSignature(styleSignature);

      // Persist to localStorage for this session
      try {
        localStorage.setItem(
          "projectStyleSignature",
          JSON.stringify(styleSignature),
        );
      } catch (storageError) {
        logger.warn("Failed to persist style signature", storageError);
      }

      logger.info("Style signature generated and cached", null, "✅");
      return styleSignature;
    } catch (error) {
      logger.error("Style signature generation failed", error);
      // Continue without style signature - services will use fallback
      return null;
    }
  }, [
    projectStyleSignature,
    portfolioFiles,
    projectDetails,
    locationData,
    setProjectStyleSignature,
  ]);

  /**
   * Analyze portfolio for style extraction
   */
  const analyzePortfolio = useCallback(async () => {
    const portfolioFilesForAnalysis = (portfolioFiles || [])
      .map((item) => item.file)
      .filter(Boolean);

    if (!portfolioFilesForAnalysis || portfolioFilesForAnalysis.length === 0) {
      return null;
    }

    logger.info(
      "Analyzing uploaded portfolio",
      { count: portfolioFilesForAnalysis.length },
      "🎨",
    );

    try {
      const { default: enhancedPortfolioService } =
        await import("../services/enhancedPortfolioService");
      const analysis = await enhancedPortfolioService.analyzePortfolio(
        portfolioFilesForAnalysis,
        locationData,
      );

      logger.info(
        "Portfolio analysis complete",
        {
          style: analysis?.style,
          materials: analysis?.materials?.length || 0,
          features: analysis?.features?.length || 0,
          colorPalette: analysis?.colorPalette?.length || 0,
        },
        "✅",
      );

      return analysis;
    } catch (error) {
      logger.warn("Portfolio analysis failed, using fallback", error);

      return {
        style: locationData?.recommendedStyle || "Contemporary",
        materials: [],
        features: [],
        colorPalette: [],
      };
    }
  }, [portfolioFiles, locationData]);

  /**
   * Main generation function
   */
  const generateDesigns = useCallback(async () => {
    // Reset generation state and start timer
    setIsGenerationComplete(false);
    setGenerationStartTime(Date.now());
    setElapsedTime(0);
    setIsLoading(true);
    updateProgress("Initialization", 0, "Starting AI generation...");

    try {
      // Generate unified project seed
      const projectSeed = Math.floor(Math.random() * 1000000);
      updateProgress("Setup", 1, "Initializing design parameters...");

      // Resolve pipeline mode early so session label is authoritative
      let resolvedMode;
      try {
        const resolved = resolveWorkflowByMode();
        resolvedMode = resolved.mode;
      } catch (routeErr) {
        if (routeErr instanceof UnsupportedPipelineModeError) {
          logger.error(`Unsupported pipeline mode: ${routeErr.requestedMode}`);
          showToast(`Unsupported pipeline mode: ${routeErr.requestedMode}`);
          setIsLoading(false);
          return;
        }
        throw routeErr;
      }

      // Start generation session for modification tracking
      const sessionId = designGenerationHistory.startSession({
        projectDetails,
        locationData,
        portfolioAnalysis: null, // Will be updated after portfolio processing
        seed: projectSeed,
        workflow: resolvedMode,
      });

      logger.info("Started generation session", { sessionId }, "📝");

      // Generate style signature
      const styleSignature = await generateStyleSignature();

      // Prepare comprehensive project context
      const projectContext = {
        buildingProgram: projectDetails?.program || "mixed-use building",
        projectType: projectDetails?.program || null,
        programSpaces: programSpaces || [],
        location: locationData || { address: "Unknown location" },
        locationData: locationData,
        climate: locationData?.climate,
        sunPath: locationData?.sunPath,
        zoning: locationData?.zoning,
        recommendedStyle: locationData?.recommendedStyle,
        localMaterials: locationData?.localMaterials,
        siteAnalysis: locationData?.siteAnalysis,
        siteDNA: locationData?.siteDNA,
        sitePolygon: sitePolygon,
        siteMetrics: siteMetrics,
        architecturalStyle: "Contemporary with local influences",
        materials: "sustainable, local materials",
        siteConstraints: locationData?.zoning?.type || "urban development",
        userPreferences: `${projectDetails?.area || "200"}m² total area`,
        specifications: projectDetails,
        climateData: locationData?.climate,
        area: projectDetails?.area || "200",
        entranceDirection: projectDetails?.entranceDirection || "S",
        floorArea: parseInt(projectDetails?.area) || 200,
        projectSeed: projectSeed,
        styleSignature: styleSignature,
        materialWeight,
        characteristicWeight,
      };

      // Validate before generation
      updateProgress("Validation", 2, "Validating project parameters...");
      const validation = validateBeforeGeneration(projectContext);
      if (!validation.valid) {
        setIsLoading(false);
        updateProgress("", 0, "");
        return;
      }

      logger.info(
        "Starting integrated AI design generation",
        {
          buildingProgram: projectContext.buildingProgram,
          area: projectContext.area,
          seed: projectSeed,
        },
        "🎨",
      );

      // Analyze portfolio
      updateProgress("Analysis", 3, "Analyzing portfolio and location data...");
      const portfolioAnalysis = await analyzePortfolio();

      // resolvedMode already resolved above (before startSession)
      updateProgress("Workflow", 4, `Using ${resolvedMode} pipeline...`);
      logger.info(`Pipeline mode resolved: ${resolvedMode}`, null, "🎯");

      // Execute generation via resolved pipeline mode
      updateProgress("Generation", 5, "Generating architectural designs...");

      let aiResult;
      let rawResult;

      rawResult = await executeWorkflow(dnaWorkflowOrchestrator, {
        projectContext,
        locationData,
        portfolioFiles: portfolioFiles || [],
        siteSnapshot: locationData?.siteSnapshot || null,
        baseSeed: projectSeed,
        portfolioAnalysis,
      });

      aiResult = normalizeMultiPanelResult(rawResult);

      logger.info(
        "AI design generation complete",
        { success: aiResult?.success },
        "✅",
      );

      // Validate A1 sheet result
      if (!aiResult?.success || !aiResult?.a1Sheet) {
        const errorDetails =
          typeof aiResult.error === "object"
            ? JSON.stringify(aiResult.error, null, 2)
            : aiResult.error;

        logger.error("A1 Sheet generation failed", { error: errorDetails });

        const errorMessage =
          aiResult.error?.message || aiResult.error || "Unknown error";
        showToast(`A1 Sheet generation failed: ${errorMessage}`);

        setIsLoading(false);
        setIsGenerationComplete(false);
        setGenerationStartTime(null);
        return;
      }

      logger.info(
        "A1 Sheet available",
        { urlPreview: aiResult.a1Sheet.url?.substring(0, 80) + "..." },
        "✅",
      );

      // Calculate project economics
      const dimensions = aiResult.masterDNA?.dimensions || {};
      const floorArea =
        (dimensions.length || 12) *
        (dimensions.width || 8) *
        (dimensions.floors || 2);
      const constructionCost = Math.round(floorArea * 1400);
      const timeline = dimensions.floors > 3 ? "18-24 months" : "12-18 months";

      const designData = {
        workflow: resolvedMode,
        a1Sheet: aiResult.a1Sheet,
        masterDNA: aiResult.masterDNA,
        panels: aiResult.panelMap || aiResult.panels,
        panelMap: aiResult.panelMap || aiResult.panels,
        panelCoordinates: aiResult.panelCoordinates || aiResult.coordinates,
        reasoning: aiResult.reasoning || {},
        projectContext: aiResult.projectContext || projectContext,
        locationData: aiResult.locationData || locationData,
        validation: aiResult.validation,
        timestamp: new Date().toISOString(),
        cost: {
          construction: `£${constructionCost.toLocaleString()}`,
          timeline: timeline,
          energySavings: "£3,200/year",
        },
      };

      setGeneratedDesigns(designData);

      // Save to design history
      try {
        const designId =
          designData?.masterDNA?.projectID ||
          aiResult?.masterDNA?.projectID ||
          `design_${Date.now()}`;

        setCurrentDesignId(designId);

        const { buildA1SheetPrompt } =
          await import("../services/a1SheetPromptGenerator");
        const promptResult = buildA1SheetPrompt({
          masterDNA: aiResult.masterDNA,
          location: locationData,
          climate: locationData?.climate,
          portfolioBlendPercent: 70,
          projectMeta: projectDetails,
          projectContext: projectContext,
          blendedStyle: aiResult.blendedStyle || portfolioAnalysis,
        });

        designGenerationHistory.recordOriginalGeneration(sessionId, {
          masterDNA: aiResult.masterDNA,
          designDNA: aiResult.masterDNA,
          prompt: promptResult.prompt,
          result: {
            a1Sheet: aiResult.a1Sheet,
            panels: aiResult.panelMap || aiResult.panels,
            panelMap: aiResult.panelMap || aiResult.panels,
            individualViews: aiResult.visualizations || {},
            designId: designId,
          },
          reasoning: aiResult.reasoning || {},
          seed: projectSeed,
          negativePrompt: promptResult.negativePrompt,
          timestamp: Date.now(),
        });

        // Also save to designHistoryService for AIModifyPanel compatibility
        const designHistoryService = (
          await import("../services/designHistoryService")
        ).default;
        await designHistoryService.createDesign({
          designId,
          mainPrompt: promptResult.prompt,
          basePrompt: promptResult.prompt,
          masterDNA: aiResult.masterDNA || {},
          seed: projectSeed,
          seedsByView: { a1Sheet: projectSeed },
          resultUrl: aiResult.a1Sheet.url,
          composedSheetUrl:
            aiResult.a1Sheet.composedSheetUrl || aiResult.a1Sheet.url,
          a1SheetUrl: aiResult.a1Sheet.url,
          projectContext: projectContext || {},
          styleBlendPercent: 70,
          width: 1792,
          height: 1269,
          model: "black-forest-labs/FLUX.1-dev",
          a1LayoutKey: "uk-riba-standard",
          siteSnapshot: aiResult.sitePlanAttachment || null,
          panelMap: aiResult.panelMap || aiResult.panels,
          panels: aiResult.panelMap || aiResult.panels,
          panelCoordinates: aiResult.panelCoordinates || aiResult.coordinates,
          a1Sheet: {
            ...aiResult.a1Sheet,
            composedSheetUrl:
              aiResult.a1Sheet.composedSheetUrl || aiResult.a1Sheet.url,
            panels: aiResult.panelMap || aiResult.panels,
            panelMap: aiResult.panelMap || aiResult.panels,
            coordinates: aiResult.panelCoordinates || aiResult.coordinates,
          },
        });

        logger.info("Design saved to history", { designId }, "💾");
      } catch (historyError) {
        logger.error("Failed to save design history", historyError);
      }

      // Mark generation complete
      updateProgress("Complete", 7, "Generation complete!");
      setIsGenerationComplete(true);

      // Navigate to results step
      setTimeout(() => {
        goToStep(6);
      }, 1000);
    } catch (error) {
      logger.error(`Generation failed: ${error.message}`);
      if (error.stack) {
        logger.error(
          `   Stack: ${error.stack.split("\n").slice(0, 3).join("\n")}`,
        );
      }
      showToast(`Generation failed: ${error.message}`);

      setIsLoading(false);
      setIsGenerationComplete(false);
      setGenerationStartTime(null);
    } finally {
      setIsLoading(false);
    }
  }, [
    projectDetails,
    programSpaces,
    locationData,
    portfolioFiles,
    sitePolygon,
    siteMetrics,
    materialWeight,
    characteristicWeight,
    setGeneratedDesigns,
    setCurrentDesignId,
    setIsLoading,
    setGenerationStartTime,
    setElapsedTime,
    setIsGenerationComplete,
    updateProgress,
    validateBeforeGeneration,
    generateStyleSignature,
    analyzePortfolio,
    showToast,
    goToStep,
  ]);

  return {
    // State
    generatedDesigns,
    currentDesignId,
    isLoading,
    generationProgress,
    generationStartTime,
    elapsedTime,
    isGenerationComplete,

    // Actions
    generateDesigns,
    updateProgress,
    validateBeforeGeneration,

    // Convenience flags
    hasResults: generatedDesigns !== null,
    hasA1Sheet: generatedDesigns?.a1Sheet !== null,
  };
};

export default useGeneration;
