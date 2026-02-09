/**
 * useArchitectAIWorkflow Hook
 *
 * React hook for orchestrating A1 sheet generation and modification workflows.
 * Delegates to pure services (pureOrchestrator, pureModificationService, exportService).
 * Manages loading states, errors, and results.
 *
 * No direct service calls in components - all go through this hook.
 */

import { useState, useCallback, useRef } from "react";
import { createEnvironmentAdapter } from "../services/environmentAdapter.js";
// runModifyWorkflow available from '../services/pureOrchestrator.js' if needed
import { modifySheet } from "../services/pureModificationService.js";
import exportService from "../services/exportService.js";
import designHistoryRepository from "../services/designHistoryRepository.js";
import dnaWorkflowOrchestrator from "../services/dnaWorkflowOrchestrator.js";
import logger from "../utils/logger.js";
import { normalizeMultiPanelResult } from "../types/schemas.js";
import { isFeatureEnabled } from "../config/featureFlags.js";
import {
  resolveWorkflowByMode,
  executeWorkflow,
  UnsupportedPipelineModeError,
} from "../services/workflowRouter.js";

/**
 * useArchitectAIWorkflow Hook
 * @returns {Object} Workflow state and functions
 */
export function useArchitectAIWorkflow() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  // Progress format includes both step/total AND stage/percentage for component compatibility
  const [progress, setProgress] = useState({
    step: 0,
    total: 5,
    message: "",
    stage: "analysis",
    percentage: 0,
  });

  const envRef = useRef(null);

  // Initialize environment adapter once
  if (!envRef.current) {
    envRef.current = createEnvironmentAdapter();
  }

  const defaultFeatureFlags = {
    geometryVolumeFirst: isFeatureEnabled("geometryVolumeFirst"),
  };

  const STAGES = ["analysis", "dna", "layout", "rendering", "finalizing"];

  const getStageForStep = (step) =>
    STAGES[Math.max(0, Math.min(STAGES.length - 1, Number(step || 0) - 1))] ||
    "analysis";

  const getStepForStage = (stage) => {
    const index = STAGES.indexOf(stage);
    return index >= 0 ? index + 1 : 0;
  };

  /**
   * Generate A1 sheet
   * @param {Object} params - Generation parameters
   * @param {Object} params.designSpec - Design specifications
   * @param {Object} params.siteSnapshot - Site snapshot
   * @param {Object} params.featureFlags - Feature flags
   * @param {number} params.seed - Generation seed
   * @param {string} params.sheetType - Sheet type (ARCH, STRUCTURE, MEP)
   * @param {Array} params.overlays - Overlays
   * @returns {Promise<SheetResult>} Sheet result
   */
  const generateSheet = useCallback(async (params) => {
    setLoading(true);
    setError(null);
    setProgress({
      step: 0,
      total: 5,
      message: "Starting generation...",
      stage: "analysis",
      percentage: 0,
    });

    try {
      // Resolve pipeline mode (fails explicitly on unsupported modes)
      const { mode: resolvedMode } = resolveWorkflowByMode();
      logger.info(`Using ${resolvedMode} pipeline workflow`, null, "🎨");

      const onProgress = (updateOrStep, legacyMessage) => {
        const total = 5;

        if (updateOrStep && typeof updateOrStep === "object") {
          const rawStage = updateOrStep.stage;
          const stage = STAGES.includes(rawStage) ? rawStage : "rendering";
          const rawPercent = updateOrStep.percentage ?? updateOrStep.percent;
          const percentage =
            typeof rawPercent === "number" && Number.isFinite(rawPercent)
              ? Math.max(0, Math.min(100, Math.round(rawPercent)))
              : Math.round((getStepForStage(stage) / total) * 100);

          setProgress({
            step: getStepForStage(stage),
            total,
            message: updateOrStep.message || legacyMessage || "",
            stage,
            percentage,
          });
          return;
        }

        const step = Number(updateOrStep || 0);
        const stage = getStageForStep(step);
        const percentage = Math.round((step / total) * 100);
        setProgress({
          step,
          total,
          message: legacyMessage || "",
          stage,
          percentage,
        });
      };

      const workflowLocationData =
        params.designSpec?.location ||
        params.locationData ||
        params.siteSnapshot ||
        null;

      const rawMultiPanelResult = await executeWorkflow(
        dnaWorkflowOrchestrator,
        {
          locationData: workflowLocationData,
          projectContext: params.designSpec,
          portfolioFiles:
            params.designSpec?.portfolioBlend?.portfolioFiles || [],
          siteSnapshot: params.siteSnapshot,
          baseSeed: params.seed || Date.now(),
        },
        { onProgress },
      );

      const multiPanelResult = normalizeMultiPanelResult(rawMultiPanelResult);

      if (!multiPanelResult?.success || !multiPanelResult?.composedSheetUrl) {
        throw new Error(
          multiPanelResult?.error || "Multi-panel generation failed",
        );
      }

      const sheetResult = {
        ...multiPanelResult,
        url: multiPanelResult.composedSheetUrl,
        composedSheetUrl: multiPanelResult.composedSheetUrl,
        workflow: resolvedMode,
        panelCoordinates:
          multiPanelResult.panelCoordinates || multiPanelResult.coordinates,
        metadata: {
          ...multiPanelResult.metadata,
          workflow: resolvedMode,
          panelCount:
            multiPanelResult.metadata?.panelCount ||
            (multiPanelResult.panelMap
              ? Object.keys(multiPanelResult.panelMap).length
              : 0),
        },
      };

      // Save to design history
      const designId = await designHistoryRepository.saveDesign({
        dna: sheetResult.dna,
        basePrompt: sheetResult.prompt,
        seed: sheetResult.seed,
        sheetType: params.sheetType || "ARCH",
        sheetMetadata: sheetResult.metadata,
        overlays: params.overlays || [],
        projectContext: params.designSpec,
        locationData: workflowLocationData,
        siteSnapshot: params.siteSnapshot,
        resultUrl: sheetResult.composedSheetUrl,
        composedSheetUrl: sheetResult.composedSheetUrl,
        panels: sheetResult.panelMap || sheetResult.panels,
        panelMap: sheetResult.panelMap || sheetResult.panels,
        panelCoordinates: sheetResult.panelCoordinates,
        a1Sheet: {
          url: sheetResult.composedSheetUrl,
          composedSheetUrl: sheetResult.composedSheetUrl,
          metadata: sheetResult.metadata,
          panels: sheetResult.panelMap || sheetResult.panels,
          panelMap: sheetResult.panelMap || sheetResult.panels,
          coordinates: sheetResult.panelCoordinates,
        },
      });

      sheetResult.designId = designId;

      setResult(sheetResult);
      setProgress({
        step: 5,
        total: 5,
        message: "Complete!",
        stage: "finalizing",
        percentage: 100,
      });

      logger.success("Sheet generation complete", { designId });

      return sheetResult;
    } catch (err) {
      // Unsupported pipeline mode — fail fast, do not retry
      if (err instanceof UnsupportedPipelineModeError) {
        const msg = `Configuration error: ${err.message}. Set PIPELINE_MODE to "multi_panel".`;
        logger.error(msg);
        setError(msg);
        return null;
      }
      logger.error(`Sheet generation failed: ${err.message}`);
      if (err.stack) {
        logger.error(
          `   Stack: ${err.stack.split("\n").slice(0, 3).join("\n")}`,
        );
      }
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Modify A1 sheet
   * @param {Object} params - Modification parameters
   * @param {string} params.designId - Design ID
   * @param {string} params.sheetId - Sheet ID
   * @param {Object} params.modifyRequest - Modification request
   * @returns {Promise<ModifyResult>} Modification result
   */
  const modifySheetWorkflow = useCallback(async (params) => {
    setLoading(true);
    setError(null);
    setProgress({
      step: 0,
      total: 6,
      message: "Starting modification...",
      stage: "analysis",
      percentage: 0,
    });

    try {
      setProgress({
        step: 1,
        total: 6,
        message: "Loading baseline...",
        stage: "analysis",
        percentage: 17,
      });

      const modifyResult = await modifySheet({
        designRef: {
          id: params.designId,
          sheetId: params.sheetId || "default",
        },
        baseSheet: null, // Will be loaded from baseline
        dna: null, // Will be loaded from baseline
        modifyRequest: params.modifyRequest,
        env: envRef.current,
        featureFlags: {
          ...defaultFeatureFlags,
          ...(params.featureFlags || {}),
        },
        seed: null, // Will use baseline seed
      });

      const normalizedModifyResult = {
        ...modifyResult,
        url: modifyResult.sheet?.composedSheetUrl || modifyResult.sheet?.url,
        composedSheetUrl:
          modifyResult.sheet?.composedSheetUrl || modifyResult.sheet?.url,
        geometryDNA:
          modifyResult.geometryDNA ||
          modifyResult.sheet?.geometryDNA ||
          result?.geometryDNA ||
          null,
        geometryRenders:
          modifyResult.geometryRenders ||
          modifyResult.sheet?.geometryRenders ||
          result?.geometryRenders ||
          null,
        a1Sheet: modifyResult.sheet
          ? {
              ...modifyResult.sheet,
              url: modifyResult.sheet.url,
              composedSheetUrl:
                modifyResult.sheet.composedSheetUrl || modifyResult.sheet.url,
            }
          : modifyResult.a1Sheet,
      };

      // Save version to design history
      await designHistoryRepository.updateDesignVersion(params.designId, {
        resultUrl:
          normalizedModifyResult.sheet.url ||
          normalizedModifyResult.sheet.composedSheetUrl,
        composedSheetUrl:
          normalizedModifyResult.sheet.composedSheetUrl ||
          normalizedModifyResult.sheet.url,
        deltaPrompt: params.modifyRequest.customPrompt,
        quickToggles: params.modifyRequest.quickToggles,
        seed: normalizedModifyResult.sheet.seed,
        driftScore: normalizedModifyResult.driftScore,
        consistencyScore: 1 - normalizedModifyResult.driftScore,
        panelMap:
          normalizedModifyResult.sheet.panelMap ||
          normalizedModifyResult.sheet.panels ||
          null,
        panels:
          normalizedModifyResult.sheet.panelMap ||
          normalizedModifyResult.sheet.panels ||
          null,
        panelCoordinates:
          normalizedModifyResult.sheet.panelCoordinates ||
          normalizedModifyResult.sheet.coordinates ||
          normalizedModifyResult.sheet.metadata?.coordinates ||
          null,
        geometryDNA:
          normalizedModifyResult.geometryDNA ||
          normalizedModifyResult.sheet.geometryDNA ||
          result?.geometryDNA ||
          null,
        geometryRenders:
          normalizedModifyResult.geometryRenders ||
          normalizedModifyResult.sheet.geometryRenders ||
          result?.geometryRenders ||
          null,
        metadata: {
          ...(normalizedModifyResult.versionMetadata || {}),
          panelMap:
            normalizedModifyResult.sheet.panelMap ||
            normalizedModifyResult.sheet.panels ||
            null,
          coordinates:
            normalizedModifyResult.sheet.panelCoordinates ||
            normalizedModifyResult.sheet.coordinates ||
            normalizedModifyResult.sheet.metadata?.coordinates ||
            null,
        },
      });

      setResult(normalizedModifyResult);
      setProgress({
        step: 6,
        total: 6,
        message: "Complete!",
        stage: "finalizing",
        percentage: 100,
      });

      logger.success("Sheet modification complete", {
        versionId: normalizedModifyResult.versionId,
        driftScore: normalizedModifyResult.driftScore,
      });

      return normalizedModifyResult;
    } catch (err) {
      logger.error("Sheet modification failed", err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Export sheet
   * @param {Object} params - Export parameters
   * @param {SheetResult} params.sheet - Sheet to export
   * @param {string} params.format - Format (PNG, PDF, SVG)
   * @returns {Promise<Object>} Export result
   */
  const exportSheetWorkflow = useCallback(async (params) => {
    setLoading(true);
    setError(null);

    try {
      const exportResult = await exportService.exportSheet({
        sheet: params.sheet,
        format: params.format || "PNG",
        env: envRef.current,
      });

      logger.success("Sheet export complete", { format: params.format });

      return exportResult;
    } catch (err) {
      logger.error("Sheet export failed", err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Load design from history
   * @param {string} designId - Design ID
   * @returns {Promise<Object>} Design
   */
  const loadDesign = useCallback(async (designId) => {
    try {
      const design = await designHistoryRepository.getDesignById(designId);

      if (!design) {
        throw new Error(`Design ${designId} not found`);
      }

      return design;
    } catch (err) {
      logger.error("Failed to load design", err);
      setError(err.message);
      throw err;
    }
  }, []);

  /**
   * List all designs
   * @returns {Promise<Array>} Design list
   */
  const listDesigns = useCallback(async () => {
    try {
      return await designHistoryRepository.listDesigns();
    } catch (err) {
      logger.error("Failed to list designs", err);
      return [];
    }
  }, []);

  /**
   * Clear error
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /**
   * Reset workflow
   */
  const reset = useCallback(() => {
    setLoading(false);
    setError(null);
    setResult(null);
    setProgress({
      step: 0,
      total: 5,
      message: "",
      stage: "analysis",
      percentage: 0,
    });
  }, []);

  return {
    // State
    loading,
    error,
    result,
    progress,

    // Functions
    generateSheet,
    modifySheetWorkflow,
    exportSheetWorkflow,
    loadDesign,
    listDesigns,
    clearError,
    reset,

    // Environment
    env: envRef.current,
  };
}

export default useArchitectAIWorkflow;
