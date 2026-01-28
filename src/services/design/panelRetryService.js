/**
 * Panel Retry Service
 *
 * Intelligent retry logic for failed panel generations.
 * Handles validation failures from Opus Panel Validator with enhanced prompts.
 *
 * Features:
 * - Exponential backoff between retries
 * - Retry prompt enhancement based on validation feedback
 * - Per-panel retry tracking and statistics
 * - Configurable retry policies per panel type
 *
 * @module services/design/panelRetryService
 */

import { isFeatureEnabled } from "../../config/featureFlags.js";
import logger from "../core/logger.js";
import { getStyleZone } from "../a1/A1GridSpec12Column.js";

// =============================================================================
// CONFIGURATION
// =============================================================================

export const RETRY_CONFIG = {
  maxRetries: 3,
  backoffMs: [2000, 5000, 10000], // Exponential backoff delays
  retryableErrors: [
    "blank_panel",
    "degenerate_render",
    "design_inconsistent",
    "classification_incorrect",
    "technical_incorrect",
    "low_quality",
    "timeout",
    "api_error",
  ],
  // Panel-specific retry policies
  panelPolicies: {
    hero_3d: { maxRetries: 4, critical: true }, // Hero is critical - extra retry
    floor_plan_ground: { maxRetries: 3, critical: true },
    elevation_north: { maxRetries: 3, critical: true },
    default: { maxRetries: 3, critical: false },
  },
};

// =============================================================================
// PANEL RETRY SERVICE CLASS
// =============================================================================

export class PanelRetryService {
  constructor() {
    this.retryStats = new Map(); // panelType -> { attempts, successes, failures }
    this.retryHistory = []; // Full history of retry attempts
    this.currentRunId = null;
  }

  /**
   * Start a new retry session for a generation run
   */
  startSession(runId) {
    this.currentRunId = runId;
    this.retryStats.clear();
    this.retryHistory = [];
    logger.debug(`Panel retry session started: ${runId}`);
  }

  /**
   * Retry a failed panel with enhanced prompt
   *
   * @param {Object} panel - Failed panel { type, imageUrl, prompt, ... }
   * @param {Object} validationResult - Opus validation result
   * @param {Object} context - Generation context { masterDNA, fingerprint, generateFn }
   * @returns {Promise<Object>} Retry result
   */
  async retryFailedPanel(panel, validationResult, context) {
    const { type: panelType } = panel;
    const policy = this.getPanelPolicy(panelType);

    // Get current attempt count
    const stats = this.getOrCreateStats(panelType);
    const attemptNumber = stats.attempts + 1;

    // Check if we've exceeded max retries
    if (attemptNumber > policy.maxRetries) {
      logger.warn(
        `Max retries (${policy.maxRetries}) exceeded for ${panelType}`,
      );
      stats.failures++;

      return {
        success: false,
        panel,
        reason: `Max retries exceeded after ${policy.maxRetries} attempts`,
        attemptNumber,
        validationResult,
      };
    }

    // Wait with exponential backoff
    const backoffMs =
      RETRY_CONFIG.backoffMs[attemptNumber - 1] || RETRY_CONFIG.backoffMs[2];
    logger.info(
      `Retrying ${panelType} (attempt ${attemptNumber}/${policy.maxRetries}) after ${backoffMs}ms...`,
    );
    await this.wait(backoffMs);

    // Build enhanced prompt with validation feedback
    const enhancedPrompt = this.buildRetryPrompt(
      panel,
      validationResult,
      context,
      attemptNumber,
    );

    try {
      // Record attempt
      stats.attempts++;
      this.recordRetryAttempt(panelType, attemptNumber, validationResult);

      // Call the generate function with enhanced prompt
      if (context.generateFn) {
        const newPanel = await context.generateFn({
          type: panelType,
          prompt: enhancedPrompt.prompt,
          negativePrompt: enhancedPrompt.negativePrompt,
          seed: enhancedPrompt.seed,
          retryAttempt: attemptNumber,
        });

        stats.successes++;

        return {
          success: true,
          panel: newPanel,
          attemptNumber,
          enhancedPrompt: enhancedPrompt.prompt,
        };
      }

      // If no generate function, return the enhanced prompt for caller to use
      return {
        success: true,
        panel: { ...panel, prompt: enhancedPrompt.prompt },
        attemptNumber,
        enhancedPrompt: enhancedPrompt.prompt,
        requiresRegeneration: true,
      };
    } catch (error) {
      logger.error(
        `Retry attempt ${attemptNumber} failed for ${panelType}: ${error.message}`,
      );
      stats.failures++;

      // Recursive retry if under limit
      if (attemptNumber < policy.maxRetries) {
        return this.retryFailedPanel(panel, validationResult, context);
      }

      return {
        success: false,
        panel,
        reason: error.message,
        attemptNumber,
        error,
      };
    }
  }

  /**
   * Build enhanced prompt based on validation feedback
   */
  buildRetryPrompt(panel, validationResult, context, attemptNumber) {
    const { masterDNA, fingerprint } = context;
    let enhancedPrompt = panel.prompt || "";
    let negativePrompt = panel.negativePrompt || "";

    // Determine what went wrong from validation
    const issues = [];

    // Classification issues
    if (!validationResult.classification_correct?.is_correct_type) {
      const expected = panel.type;
      const detected = validationResult.classification_correct?.detected_type;
      issues.push(
        `CLASSIFICATION FIX: This should be a ${expected}, not ${detected}`,
      );

      if (panel.type.includes("floor_plan") && detected?.includes("3d")) {
        enhancedPrompt += `\n\nCRITICAL: Generate a TRUE 2D OVERHEAD FLOOR PLAN view.
DO NOT generate a 3D perspective or isometric view.
The view should be from DIRECTLY ABOVE looking DOWN.`;
        negativePrompt += ", perspective, 3D view, isometric, axonometric";
      }

      if (panel.type.includes("interior") && detected?.includes("exterior")) {
        enhancedPrompt += `\n\nCRITICAL: This must show INTERIOR spaces.
Show rooms, furniture, interior materials, windows from INSIDE.
DO NOT show exterior facades or outdoor views.`;
      }
    }

    // Design consistency issues
    if (!validationResult.design_consistent?.matches_fingerprint) {
      const consistencyIssues =
        validationResult.design_consistent?.issues || [];
      issues.push(...consistencyIssues);

      enhancedPrompt += `\n\nDESIGN CONSISTENCY FIX: Previous render did not match the canonical design.
Issues found: ${consistencyIssues.join("; ")}

ENSURE you match these specifications EXACTLY:
- Materials and colors from the design brief
- Building massing and form
- Roof type and pitch
- Window patterns and sizes`;

      // Add specific fixes based on match scores
      if (validationResult.design_consistent?.material_match < 0.7) {
        enhancedPrompt += `\n- MATERIALS: Use EXACTLY the materials and colors specified`;
      }
      if (validationResult.design_consistent?.massing_match < 0.7) {
        enhancedPrompt += `\n- MASSING: Building shape must match the specified form`;
      }
      if (validationResult.design_consistent?.roof_match < 0.7) {
        enhancedPrompt += `\n- ROOF: Roof type and pitch must match exactly`;
      }
    }

    // Technical correctness issues (for 2D panels)
    if (
      validationResult.technical_correct &&
      !validationResult.technical_correct.not_applicable
    ) {
      if (!validationResult.technical_correct.is_orthographic) {
        enhancedPrompt += `\n\nTECHNICAL FIX: Previous render was NOT orthographic.
This MUST be a TRUE ORTHOGRAPHIC projection:
- No perspective distortion whatsoever
- Parallel lines must remain parallel
- No vanishing points`;
        negativePrompt += ", perspective, vanishing point, 3D perspective";
      }

      if (!validationResult.technical_correct.lineweight_consistent) {
        enhancedPrompt += `\n- Ensure CONSISTENT lineweights throughout`;
      }
    }

    // Add Opus-provided regeneration feedback if available
    if (validationResult.regeneration_feedback) {
      enhancedPrompt += `\n\nSPECIFIC QA FEEDBACK:\n${validationResult.regeneration_feedback}`;
    }

    // Add retry-specific instructions
    enhancedPrompt += `\n\n[RETRY ATTEMPT ${attemptNumber}/${RETRY_CONFIG.maxRetries}]
Previous generation failed validation. Pay extra attention to the fixes above.`;

    // Optionally modify seed for variation
    let seed = panel.seed;
    if (attemptNumber > 1) {
      // Slightly vary seed to get different result
      seed = seed ? (seed + attemptNumber * 137) % 1000000 : undefined;
    }

    return {
      prompt: enhancedPrompt,
      negativePrompt,
      seed,
      issues,
    };
  }

  /**
   * Get retry policy for a panel type
   */
  getPanelPolicy(panelType) {
    return (
      RETRY_CONFIG.panelPolicies[panelType] ||
      RETRY_CONFIG.panelPolicies.default
    );
  }

  /**
   * Check if an error is retryable
   */
  isRetryableError(errorType) {
    return RETRY_CONFIG.retryableErrors.includes(errorType);
  }

  /**
   * Check if a panel should be retried based on validation
   */
  shouldRetry(validationResult) {
    if (!validationResult) return false;

    const action = validationResult.action;
    return (
      action === "regenerate_with_feedback" || action === "regenerate_fully"
    );
  }

  /**
   * Get or create stats for a panel type
   */
  getOrCreateStats(panelType) {
    if (!this.retryStats.has(panelType)) {
      this.retryStats.set(panelType, {
        attempts: 0,
        successes: 0,
        failures: 0,
      });
    }
    return this.retryStats.get(panelType);
  }

  /**
   * Record a retry attempt in history
   */
  recordRetryAttempt(panelType, attemptNumber, validationResult) {
    this.retryHistory.push({
      timestamp: Date.now(),
      runId: this.currentRunId,
      panelType,
      attemptNumber,
      action: validationResult?.action,
      issues: validationResult?.classification_correct?.issues || [],
    });
  }

  /**
   * Get retry statistics
   */
  getRetryStatistics() {
    const stats = {
      totalAttempts: 0,
      totalSuccesses: 0,
      totalFailures: 0,
      byPanel: {},
      retryRate: 0,
      successRate: 0,
    };

    for (const [panelType, panelStats] of this.retryStats) {
      stats.byPanel[panelType] = { ...panelStats };
      stats.totalAttempts += panelStats.attempts;
      stats.totalSuccesses += panelStats.successes;
      stats.totalFailures += panelStats.failures;
    }

    if (stats.totalAttempts > 0) {
      stats.successRate = stats.totalSuccesses / stats.totalAttempts;
    }

    return stats;
  }

  /**
   * Get retry history
   */
  getRetryHistory() {
    return [...this.retryHistory];
  }

  /**
   * Reset all retry state
   */
  resetRetryState() {
    this.retryStats.clear();
    this.retryHistory = [];
    this.currentRunId = null;
    logger.debug("Panel retry state reset");
  }

  /**
   * Wait for specified milliseconds
   */
  async wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// =============================================================================
// SINGLETON INSTANCE & EXPORTS
// =============================================================================

const panelRetryService = new PanelRetryService();

// Legacy exports for backwards compatibility
export const MAX_RETRIES = RETRY_CONFIG.maxRetries;

export function retryFailedPanel(panel, attempt) {
  // Legacy function signature - delegates to new service
  return panelRetryService.retryFailedPanel(panel, null, {});
}

export function getRetryStatistics() {
  return panelRetryService.getRetryStatistics();
}

export function resetRetryState() {
  panelRetryService.resetRetryState();
}

export default panelRetryService;
