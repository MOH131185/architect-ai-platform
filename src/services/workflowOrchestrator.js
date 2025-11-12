/**
 * Workflow Orchestrator
 *
 * Manages the complete design workflow as a state machine.
 * Handles step transitions, loading states, errors, and progress events.
 *
 * Version: 1.0.0
 * Last Updated: 2025-10-25
 *
 * @module services/workflowOrchestrator
 */

import { createError } from '../domain/dna.js';

/**
 * Workflow states
 */
export const WorkflowState = {
  IDLE: 'idle',
  LOCATION_INPUT: 'location_input',
  LOCATION_ANALYZING: 'location_analyzing',
  LOCATION_COMPLETE: 'location_complete',
  PORTFOLIO_INPUT: 'portfolio_input',
  PORTFOLIO_ANALYZING: 'portfolio_analyzing',
  PORTFOLIO_COMPLETE: 'portfolio_complete',
  SPECS_INPUT: 'specs_input',
  SPECS_COMPLETE: 'specs_complete',
  GENERATING: 'generating',
  GENERATION_COMPLETE: 'generation_complete',
  ERROR: 'error'
};

/**
 * Workflow events
 */
export const WorkflowEvent = {
  // State transitions
  STATE_CHANGED: 'state_changed',

  // Progress events
  LOCATION_STARTED: 'location_started',
  LOCATION_SUCCESS: 'location_success',
  LOCATION_ERROR: 'location_error',

  PORTFOLIO_STARTED: 'portfolio_started',
  PORTFOLIO_SUCCESS: 'portfolio_success',
  PORTFOLIO_ERROR: 'portfolio_error',

  SPECS_SUBMITTED: 'specs_submitted',

  GENERATION_STARTED: 'generation_started',
  GENERATION_PROGRESS: 'generation_progress', // For sub-steps
  GENERATION_SUCCESS: 'generation_success',
  GENERATION_ERROR: 'generation_error',

  // Error events
  ERROR_OCCURRED: 'error_occurred',
  ERROR_CLEARED: 'error_cleared'
};

/**
 * Generation sub-steps for progress tracking
 */
export const GenerationStep = {
  REASONING: 'reasoning',
  VISUALIZATIONS: 'visualizations',
  ALTERNATIVES: 'alternatives',
  FEASIBILITY: 'feasibility'
};

/**
 * Event listener callback
 * @callback EventListener
 * @param {Object} event - Event object
 * @param {string} event.type - Event type from WorkflowEvent
 * @param {*} event.data - Event data
 * @param {string} event.timestamp - ISO timestamp
 */

/**
 * Workflow Orchestrator Class
 * Manages state machine and event emission
 */
class WorkflowOrchestrator {
  constructor() {
    this.state = WorkflowState.IDLE;
    this.listeners = new Map(); // Map<event type, Set<callback>>
    this.history = []; // Event history for debugging
    this.data = {
      location: null,
      portfolio: null,
      specifications: null,
      designResult: null
    };
    this.error = null;
    this.progress = {
      current: null,
      total: null,
      percentage: 0,
      message: ''
    };
  }

  /**
   * Get current state
   * @returns {string} Current state
   */
  getState() {
    return this.state;
  }

  /**
   * Get workflow data
   * @returns {Object} Current workflow data
   */
  getData() {
    return { ...this.data };
  }

  /**
   * Get current error (if any)
   * @returns {Object | null} Error object or null
   */
  getError() {
    return this.error;
  }

  /**
   * Get current progress
   * @returns {Object} Progress object
   */
  getProgress() {
    return { ...this.progress };
  }

  /**
   * Subscribe to workflow events
   *
   * @param {string} eventType - Event type from WorkflowEvent (or '*' for all events)
   * @param {EventListener} callback - Callback function
   * @returns {Function} Unsubscribe function
   */
  subscribe(eventType, callback) {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }

    this.listeners.get(eventType).add(callback);

    // Return unsubscribe function
    return () => {
      const listeners = this.listeners.get(eventType);
      if (listeners) {
        listeners.delete(callback);
      }
    };
  }

  /**
   * Emit an event to all subscribers
   *
   * @param {string} eventType - Event type
   * @param {*} data - Event data
   * @private
   */
  emit(eventType, data = null) {
    const event = {
      type: eventType,
      data,
      timestamp: new Date().toISOString()
    };

    // Add to history
    this.history.push(event);

    // Limit history size
    if (this.history.length > 100) {
      this.history.shift();
    }

    // Call specific event listeners
    const specificListeners = this.listeners.get(eventType);
    if (specificListeners) {
      specificListeners.forEach((callback) => {
        try {
          callback(event);
        } catch (error) {
          console.error(`Error in event listener for ${eventType}:`, error);
        }
      });
    }

    // Call wildcard listeners
    const wildcardListeners = this.listeners.get('*');
    if (wildcardListeners) {
      wildcardListeners.forEach((callback) => {
        try {
          callback(event);
        } catch (error) {
          console.error('Error in wildcard event listener:', error);
        }
      });
    }
  }

  /**
   * Transition to a new state
   *
   * @param {string} newState - New state from WorkflowState
   * @private
   */
  transitionTo(newState) {
    const previousState = this.state;
    this.state = newState;

    console.log(`🔄 Workflow state: ${previousState} → ${newState}`);

    this.emit(WorkflowEvent.STATE_CHANGED, {
      previousState,
      newState
    });
  }

  /**
   * Set progress information
   *
   * @param {number} current - Current step number
   * @param {number} total - Total number of steps
   * @param {string} message - Progress message
   * @private
   */
  setProgress(current, total, message) {
    this.progress = {
      current,
      total,
      percentage: total > 0 ? Math.round((current / total) * 100) : 0,
      message
    };

    this.emit(WorkflowEvent.GENERATION_PROGRESS, this.progress);
  }

  /**
   * Clear error state
   */
  clearError() {
    this.error = null;
    this.emit(WorkflowEvent.ERROR_CLEARED, null);
  }

  /**
   * Set error state
   *
   * @param {string} code - Error code
   * @param {string} message - Error message
   * @param {*} [details] - Additional error details
   * @private
   */
  setError(code, message, details = null) {
    this.error = createError(code, message, 'workflow', false, details);
    this.transitionTo(WorkflowState.ERROR);
    this.emit(WorkflowEvent.ERROR_OCCURRED, this.error);
  }

  /* ========================================================================
   * WORKFLOW STEP METHODS
   * ======================================================================== */

  /**
   * Start location analysis
   *
   * @param {string} address - Address to analyze
   * @param {Object} [options] - Analysis options
   * @returns {Promise<void>}
   */
  async startLocationAnalysis(address, options = {}) {
    this.clearError();
    this.transitionTo(WorkflowState.LOCATION_ANALYZING);
    this.emit(WorkflowEvent.LOCATION_STARTED, { address, options });

    // Note: Actual implementation would call location intelligence service
    // This is a placeholder showing the pattern
    console.log(`📍 Starting location analysis for: ${address}`);
  }

  /**
   * Complete location analysis with results
   *
   * @param {import('../domain/dna.js').LocationProfile} locationProfile
   */
  completeLocationAnalysis(locationProfile) {
    this.data.location = locationProfile;
    this.transitionTo(WorkflowState.LOCATION_COMPLETE);
    this.emit(WorkflowEvent.LOCATION_SUCCESS, locationProfile);

    console.log('✅ Location analysis complete');
  }

  /**
   * Handle location analysis error
   *
   * @param {Error} error - Error object
   */
  failLocationAnalysis(error) {
    this.setError('LOCATION_ANALYSIS_FAILED', error.message, { originalError: error });
    this.emit(WorkflowEvent.LOCATION_ERROR, error);

    console.error('❌ Location analysis failed:', error);
  }

  /**
   * Start portfolio analysis
   *
   * @param {File[]} files - Portfolio image files
   * @returns {Promise<void>}
   */
  async startPortfolioAnalysis(files) {
    if (!this.data.location) {
      this.setError('INVALID_STATE', 'Location analysis must be completed before portfolio analysis');
      return;
    }

    this.clearError();
    this.transitionTo(WorkflowState.PORTFOLIO_ANALYZING);
    this.emit(WorkflowEvent.PORTFOLIO_STARTED, { fileCount: files.length });

    console.log(`🎨 Starting portfolio analysis (${files.length} files)`);
  }

  /**
   * Complete portfolio analysis with results
   *
   * @param {Object} portfolioAnalysis - Portfolio analysis results
   */
  completePortfolioAnalysis(portfolioAnalysis) {
    this.data.portfolio = portfolioAnalysis;
    this.transitionTo(WorkflowState.PORTFOLIO_COMPLETE);
    this.emit(WorkflowEvent.PORTFOLIO_SUCCESS, portfolioAnalysis);

    console.log('✅ Portfolio analysis complete');
  }

  /**
   * Handle portfolio analysis error
   *
   * @param {Error} error - Error object
   */
  failPortfolioAnalysis(error) {
    this.setError('PORTFOLIO_ANALYSIS_FAILED', error.message, { originalError: error });
    this.emit(WorkflowEvent.PORTFOLIO_ERROR, error);

    console.error('❌ Portfolio analysis failed:', error);
  }

  /**
   * Submit project specifications
   *
   * @param {Object} specifications - Project specifications
   */
  submitSpecifications(specifications) {
    if (!this.data.location) {
      this.setError('INVALID_STATE', 'Location analysis must be completed before submitting specifications');
      return;
    }

    this.data.specifications = specifications;
    this.transitionTo(WorkflowState.SPECS_COMPLETE);
    this.emit(WorkflowEvent.SPECS_SUBMITTED, specifications);

    console.log('✅ Specifications submitted');
  }

  /**
   * Start design generation
   *
   * @param {import('../domain/dna.js').ProjectContext} projectContext
   * @returns {Promise<void>}
   */
  async startGeneration(projectContext) {
    if (!this.data.location || !this.data.specifications) {
      this.setError('INVALID_STATE', 'Location and specifications must be completed before generation');
      return;
    }

    this.clearError();
    this.transitionTo(WorkflowState.GENERATING);
    this.emit(WorkflowEvent.GENERATION_STARTED, projectContext);

    console.log('🎨 Starting design generation...');

    // Set initial progress
    this.setProgress(0, 4, 'Initializing generation...');
  }

  /**
   * Update generation progress (called by AI services)
   *
   * @param {string} step - Current step from GenerationStep
   * @param {number} stepNumber - Step number (1-4)
   * @param {string} message - Progress message
   */
  updateGenerationProgress(step, stepNumber, message) {
    this.setProgress(stepNumber, 4, message);

    console.log(`   ${stepNumber}/4: ${message}`);
  }

  /**
   * Complete generation with results
   *
   * @param {import('../domain/dna.js').DesignResult} designResult
   */
  completeGeneration(designResult) {
    this.data.designResult = designResult;
    this.transitionTo(WorkflowState.GENERATION_COMPLETE);
    this.emit(WorkflowEvent.GENERATION_SUCCESS, designResult);

    console.log('✅ Design generation complete');
  }

  /**
   * Handle generation error
   *
   * @param {Error} error - Error object
   */
  failGeneration(error) {
    this.setError('GENERATION_FAILED', error.message, { originalError: error });
    this.emit(WorkflowEvent.GENERATION_ERROR, error);

    console.error('❌ Design generation failed:', error);
  }

  /**
   * Reset workflow to initial state
   */
  reset() {
    this.state = WorkflowState.IDLE;
    this.data = {
      location: null,
      portfolio: null,
      specifications: null,
      designResult: null
    };
    this.error = null;
    this.progress = {
      current: null,
      total: null,
      percentage: 0,
      message: ''
    };

    console.log('🔄 Workflow reset to idle');

    this.emit(WorkflowEvent.STATE_CHANGED, {
      previousState: this.state,
      newState: WorkflowState.IDLE
    });
  }

  /**
   * Get event history (for debugging)
   *
   * @param {number} [limit] - Maximum number of events to return
   * @returns {Array} Event history
   */
  getHistory(limit = 50) {
    return this.history.slice(-limit);
  }
}

/* ============================================================================
 * SINGLETON INSTANCE
 * ========================================================================== */

/**
 * Global workflow orchestrator instance
 */
const orchestrator = new WorkflowOrchestrator();

/**
 * Subscribe to workflow events
 *
 * @param {string} eventType - Event type from WorkflowEvent
 * @param {EventListener} callback - Callback function
 * @returns {Function} Unsubscribe function
 */
export function subscribeToWorkflow(eventType, callback) {
  return orchestrator.subscribe(eventType, callback);
}

/**
 * Get current workflow state
 *
 * @returns {string} Current state from WorkflowState
 */
export function getCurrentState() {
  return orchestrator.getState();
}

/**
 * Get workflow data
 *
 * @returns {Object} Current workflow data
 */
export function getWorkflowData() {
  return orchestrator.getData();
}

/**
 * Get current error
 *
 * @returns {Object | null} Error object or null
 */
export function getWorkflowError() {
  return orchestrator.getError();
}

/**
 * Get current progress
 *
 * @returns {Object} Progress object
 */
export function getWorkflowProgress() {
  return orchestrator.getProgress();
}

/**
 * Reset workflow
 */
export function resetWorkflow() {
  orchestrator.reset();
}

/* ============================================================================
 * EXPORTS
 * ========================================================================== */

export default orchestrator;
