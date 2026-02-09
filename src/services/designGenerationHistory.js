/**
 * Design Generation History Service
 *
 * Manages the complete history of AI design generations including:
 * - Original DNA and prompts
 * - Generated results (A1 sheets, views, drawings)
 * - Modification requests and results
 * - Consistency tracking across generations
 */

import runtimeEnv from "../utils/runtimeEnv.js";
import logger from "../utils/logger.js";
import { PIPELINE_MODE } from "../config/pipelineMode.js";

class DesignGenerationHistory {
  constructor() {
    this.history = [];
    this.currentSessionId = null;
    logger.info("📚 Design Generation History Service initialized");
  }

  /**
   * Start a new generation session
   * @param {Object} params - Session parameters
   * @returns {string} Session ID
   */
  startSession(params) {
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const session = {
      id: sessionId,
      timestamp: new Date().toISOString(),
      projectDetails: params.projectDetails,
      locationData: params.locationData,
      portfolioAnalysis: params.portfolioAnalysis,

      // Original generation
      original: {
        dna: null,
        seed: params.seed,
        prompt: null,
        result: null,
        workflow: params.workflow || PIPELINE_MODE.MULTI_PANEL,
        timestamp: new Date().toISOString(),
      },

      // Modifications history
      modifications: [],

      // Current state (aggregated)
      currentState: {
        a1Sheet: null,
        individualViews: {
          floorPlans: {},
          technicalDrawings: {},
          threeD: {},
        },
        missingViews: [],
      },

      // Metadata
      metadata: {
        totalGenerations: 0,
        totalModifications: 0,
        lastModified: new Date().toISOString(),
      },
    };

    this.history.push(session);
    this.currentSessionId = sessionId;

    logger.info(`📚 New generation session started: ${sessionId}`);
    logger.info(`   Project: ${params.projectDetails?.program || "Unknown"}`);
    logger.info(`   Seed: ${params.seed}`);

    return sessionId;
  }

  /**
   * Record the original generation result
   * @param {string} sessionId - Session ID
   * @param {Object} data - Generation data
   */
  recordOriginalGeneration(sessionId, data) {
    const session = this.getSession(sessionId);
    if (!session) {
      logger.error(`❌ Session not found: ${sessionId}`);
      return;
    }

    session.original.dna = data.masterDNA || data.designDNA;
    session.original.prompt = data.prompt;
    session.original.result = data.result;
    session.original.reasoning = data.reasoning;

    // Update current state
    if (data.result?.a1Sheet) {
      session.currentState.a1Sheet = data.result.a1Sheet;
    }

    if (data.result?.individualViews) {
      session.currentState.individualViews = data.result.individualViews;
    }

    session.metadata.totalGenerations = 1;
    session.metadata.lastModified = new Date().toISOString();

    logger.success(` Original generation recorded for session ${sessionId}`);
    logger.info(
      `   DNA: ${session.original.dna?.dimensions?.length}m × ${session.original.dna?.dimensions?.width}m`,
    );
    logger.info(`   Workflow: ${session.original.workflow}`);

    this.saveToLocalStorage();
  }

  /**
   * Add a modification request
   * @param {string} sessionId - Session ID
   * @param {Object} request - Modification request
   * @returns {Object} Modification record
   */
  addModificationRequest(sessionId, request) {
    const session = this.getSession(sessionId);
    if (!session) {
      logger.error(`❌ Session not found: ${sessionId}`);
      return null;
    }

    const modificationId = `mod-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const modification = {
      id: modificationId,
      timestamp: new Date().toISOString(),
      type: request.type, // 'add-view', 'modify-a1', 'regenerate-element'
      description: request.description,

      // Original DNA reference (for consistency)
      useOriginalDNA: request.useOriginalDNA !== false,
      dnaReference: session.original.dna,
      seedReference: session.original.seed,

      // Request details
      request: {
        targetView: request.targetView, // 'ground-floor-plan', 'north-elevation', etc.
        modifications: request.modifications,
        keepElements: request.keepElements,
        userPrompt: request.userPrompt,
      },

      // Response
      response: null,
      status: "pending", // 'pending', 'processing', 'completed', 'failed'
      error: null,
    };

    session.modifications.push(modification);
    session.metadata.totalModifications += 1;
    session.metadata.lastModified = new Date().toISOString();

    logger.info(`📝 Modification request added: ${modificationId}`);
    logger.info(`   Type: ${request.type}`);
    logger.info(`   Description: ${request.description}`);

    this.saveToLocalStorage();

    return modification;
  }

  /**
   * Record modification result
   * @param {string} sessionId - Session ID
   * @param {string} modificationId - Modification ID
   * @param {Object} result - Generation result
   */
  recordModificationResult(sessionId, modificationId, result) {
    const session = this.getSession(sessionId);
    if (!session) {
      logger.error(`❌ Session not found: ${sessionId}`);
      return;
    }

    const modification = session.modifications.find(
      (m) => m.id === modificationId,
    );
    if (!modification) {
      logger.error(`❌ Modification not found: ${modificationId}`);
      return;
    }

    modification.response = result;
    modification.status = result.success ? "completed" : "failed";
    modification.error = result.error || null;

    // Update current state
    if (result.success) {
      if (result.type === "a1-sheet") {
        session.currentState.a1Sheet = result.data;
      } else if (result.type === "individual-view") {
        const category = this.categorizeView(result.viewType);
        if (category) {
          session.currentState.individualViews[category.category][
            category.key
          ] = result.data;
        }
      }
    }

    session.metadata.lastModified = new Date().toISOString();

    logger.success(` Modification result recorded: ${modificationId}`);
    logger.info(`   Status: ${modification.status}`);

    this.saveToLocalStorage();
  }

  /**
   * Get missing views based on standard architectural drawing set
   * @param {string} sessionId - Session ID
   * @returns {Array} List of missing views
   */
  getMissingViews(sessionId) {
    const session = this.getSession(sessionId);
    if (!session) return [];

    const standardViews = [
      { category: "floorPlans", key: "ground", label: "Ground Floor Plan" },
      { category: "floorPlans", key: "upper", label: "Upper Floor Plan" },
      { category: "technicalDrawings", key: "north", label: "North Elevation" },
      { category: "technicalDrawings", key: "south", label: "South Elevation" },
      { category: "technicalDrawings", key: "east", label: "East Elevation" },
      { category: "technicalDrawings", key: "west", label: "West Elevation" },
      {
        category: "technicalDrawings",
        key: "longitudinal",
        label: "Longitudinal Section",
      },
      {
        category: "technicalDrawings",
        key: "transverse",
        label: "Transverse Section",
      },
      { category: "threeD", key: "exterior", label: "3D Exterior View" },
      { category: "threeD", key: "axonometric", label: "3D Axonometric View" },
      { category: "threeD", key: "site", label: "3D Site Context" },
      { category: "threeD", key: "interior", label: "3D Interior View" },
    ];

    const missing = [];
    const current = session.currentState.individualViews;

    for (const view of standardViews) {
      if (!current[view.category]?.[view.key]) {
        missing.push({
          category: view.category,
          key: view.key,
          label: view.label,
          type: this.getViewType(view.category, view.key),
        });
      }
    }

    session.currentState.missingViews = missing;

    return missing;
  }

  /**
   * Get session by ID
   * @param {string} sessionId - Session ID
   * @returns {Object|null} Session data
   */
  getSession(sessionId) {
    return this.history.find((s) => s.id === sessionId) || null;
  }

  /**
   * Get current session
   * @returns {Object|null} Current session data
   */
  getCurrentSession() {
    if (!this.currentSessionId) return null;
    return this.getSession(this.currentSessionId);
  }

  /**
   * Get all sessions
   * @returns {Array} All sessions
   */
  getAllSessions() {
    return this.history;
  }

  /**
   * Get original DNA for consistency
   * @param {string} sessionId - Session ID
   * @returns {Object|null} Original DNA
   */
  getOriginalDNA(sessionId) {
    const session = this.getSession(sessionId);
    return session?.original?.dna || null;
  }

  /**
   * Get original seed for consistency
   * @param {string} sessionId - Session ID
   * @returns {number|null} Original seed
   */
  getOriginalSeed(sessionId) {
    const session = this.getSession(sessionId);
    return session?.original?.seed || null;
  }

  /**
   * Categorize a view type
   * @param {string} viewType - View type identifier
   * @returns {Object} Category and key
   */
  categorizeView(viewType) {
    const mapping = {
      "ground-floor-plan": { category: "floorPlans", key: "ground" },
      "upper-floor-plan": { category: "floorPlans", key: "upper" },
      "north-elevation": { category: "technicalDrawings", key: "north" },
      "south-elevation": { category: "technicalDrawings", key: "south" },
      "east-elevation": { category: "technicalDrawings", key: "east" },
      "west-elevation": { category: "technicalDrawings", key: "west" },
      "longitudinal-section": {
        category: "technicalDrawings",
        key: "longitudinal",
      },
      "transverse-section": {
        category: "technicalDrawings",
        key: "transverse",
      },
      "exterior-3d": { category: "threeD", key: "exterior" },
      "axonometric-3d": { category: "threeD", key: "axonometric" },
      "site-3d": { category: "threeD", key: "site" },
      "interior-3d": { category: "threeD", key: "interior" },
    };

    return mapping[viewType] || null;
  }

  /**
   * Get view type from category and key
   * @param {string} category - View category
   * @param {string} key - View key
   * @returns {string} View type
   */
  getViewType(category, key) {
    if (category === "floorPlans") {
      return key === "ground" ? "ground-floor-plan" : "upper-floor-plan";
    } else if (category === "technicalDrawings") {
      if (["north", "south", "east", "west"].includes(key)) {
        return `${key}-elevation`;
      }
      return `${key}-section`;
    } else if (category === "threeD") {
      return `${key}-3d`;
    }
    return "unknown";
  }

  /**
   * Save history to localStorage
   */
  saveToLocalStorage() {
    try {
      const local = runtimeEnv.getLocal();
      if (!local) {
        return;
      }

      const data = {
        history: this.history,
        currentSessionId: this.currentSessionId,
      };
      local.setItem("architectAI_generationHistory", JSON.stringify(data));
      logger.info("💾 Generation history saved to localStorage");
    } catch (error) {
      logger.error("❌ Failed to save generation history:", error);
    }
  }

  /**
   * Load history from localStorage
   */
  loadFromLocalStorage() {
    try {
      const local = runtimeEnv.getLocal();
      if (!local) {
        return;
      }

      const data = local.getItem("architectAI_generationHistory");
      if (data) {
        const parsed = JSON.parse(data);
        this.history = parsed.history || [];
        this.currentSessionId = parsed.currentSessionId || null;
        logger.success(
          ` Loaded ${this.history.length} session(s) from localStorage`,
        );
      }
    } catch (error) {
      logger.error("❌ Failed to load generation history:", error);
    }
  }

  /**
   * Clear all history
   */
  clearHistory() {
    this.history = [];
    this.currentSessionId = null;
    const local = runtimeEnv.getLocal();
    if (local) {
      local.removeItem("architectAI_generationHistory");
    }
    logger.info("🗑️  Generation history cleared");
  }

  /**
   * Export session as JSON
   * @param {string} sessionId - Session ID
   * @returns {string} JSON string
   */
  exportSession(sessionId) {
    const session = this.getSession(sessionId);
    if (!session) return null;

    return JSON.stringify(session, null, 2);
  }
}

// Create singleton instance
const designGenerationHistory = new DesignGenerationHistory();

// Load existing history on initialization
designGenerationHistory.loadFromLocalStorage();

export default designGenerationHistory;
