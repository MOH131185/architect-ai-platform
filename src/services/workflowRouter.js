/**
 * Workflow Router - Centralised pipeline mode → workflow resolution
 *
 * Maps PIPELINE_MODE values to concrete orchestrator functions.
 * Unsupported modes fail explicitly with a clear error.
 */

import {
  getCurrentPipelineMode,
  PIPELINE_MODE,
} from "../config/pipelineMode.js";

/**
 * Error thrown when an unsupported pipeline mode is requested.
 */
export class UnsupportedPipelineModeError extends Error {
  constructor(mode) {
    super(
      `Unsupported pipeline mode "${mode}". ` +
        `Supported modes: ${Object.values(PIPELINE_MODE).join(", ")}`,
    );
    this.name = "UnsupportedPipelineModeError";
    this.requestedMode = mode;
  }
}

/**
 * Supported modes and their workflow keys.
 *
 * multi_panel   → runs runMultiPanelA1Workflow (default)
 * single_shot   → runs runMultiPanelA1Workflow (same orchestrator, A1-only)
 * geometry_first → NOT YET IMPLEMENTED → explicit error
 * hybrid_openai  → NOT YET IMPLEMENTED → explicit error
 */
const IMPLEMENTED_MODES = new Set([
  PIPELINE_MODE.MULTI_PANEL,
  PIPELINE_MODE.SINGLE_SHOT,
]);

/**
 * Resolve the current pipeline mode and return the workflow key.
 *
 * @param {string} [overrideMode] - Optional mode override (for testing)
 * @returns {{ mode: string, workflowKey: string }}
 * @throws {UnsupportedPipelineModeError} if mode is not implemented
 */
export function resolveWorkflowByMode(overrideMode) {
  const mode = overrideMode || getCurrentPipelineMode();

  if (!IMPLEMENTED_MODES.has(mode)) {
    throw new UnsupportedPipelineModeError(mode);
  }

  // Both single_shot and multi_panel use the same orchestrator today.
  // When single_shot gets a dedicated implementation, this will branch.
  return {
    mode,
    workflowKey: "multi_panel_a1",
  };
}

/**
 * Execute the resolved workflow via the orchestrator.
 *
 * @param {Object} orchestrator - dnaWorkflowOrchestrator (or compatible)
 * @param {Object} params - Workflow parameters (projectContext, locationData, etc.)
 * @param {Object} [options] - { onProgress }
 * @param {string} [overrideMode] - Optional mode override
 * @returns {Promise<Object>} Raw orchestrator result
 * @throws {UnsupportedPipelineModeError} if mode is not implemented
 */
export async function executeWorkflow(
  orchestrator,
  params,
  options = {},
  overrideMode,
) {
  const { mode, workflowKey } = resolveWorkflowByMode(overrideMode);

  // All implemented modes currently route to the same orchestrator call.
  return orchestrator.runMultiPanelA1Workflow(params, options);
}

export default {
  resolveWorkflowByMode,
  executeWorkflow,
  UnsupportedPipelineModeError,
};
