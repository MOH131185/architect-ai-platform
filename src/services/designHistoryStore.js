import logger from '../utils/logger.js';

/**
 * Design History Store
 * IndexedDB wrapper for storing design history with full project runs
 * Supports versioning, modification tracking, and AI context building
 */

const DB_NAME = 'architect_ai_history';
const DB_VERSION = 1;
const STORE_NAME = 'projects';

/**
 * ViewId type definitions matching the plan
 */
export const VIEW_IDS = {
  PLAN_GROUND: 'plan_ground',
  PLAN_UPPER: 'plan_upper',
  ELEV_N: 'elev_n',
  ELEV_S: 'elev_s',
  ELEV_E: 'elev_e',
  ELEV_W: 'elev_w',
  SECT_LONG: 'sect_long',
  SECT_TRANS: 'sect_trans',
  V_EXTERIOR: 'v_exterior',
  V_AXON: 'v_axon',
  V_SITE: 'v_site',
  V_INTERIOR: 'v_interior'
};

/**
 * Initialize IndexedDB database
 */
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'designId' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });
}

/**
 * Get project history by designId
 */
export async function getProject(designId) {
  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(designId);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    logger.error('❌ Failed to get project:', error);
    return null;
  }
}

/**
 * Save base project (initial generation)
 */
export async function saveBase(projectData) {
  try {
    const {
      designId,
      mainPrompt,
      masterDNA,
      seedsByView,
      projectType,
      programSpaces,
      createdAt = new Date().toISOString()
    } = projectData;

    if (!designId) {
      throw new Error('designId is required');
    }

    const project = {
      designId,
      createdAt,
      baseMainPrompt: mainPrompt,
      baseMasterDNA: masterDNA,
      baseSeedsByView: seedsByView || {},
      projectType: projectType || null,
      programSpaces: programSpaces || [],
      runs: []
    };

    const db = await openDB();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    // Check if project exists
    const existing = await new Promise((resolve, reject) => {
      const request = store.get(designId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    if (existing) {
      // Update base but keep runs
      project.runs = existing.runs || [];
      project.createdAt = existing.createdAt; // Preserve original creation date
    }

    await new Promise((resolve, reject) => {
      const request = store.put(project);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    logger.info(`✅ Saved base project: ${designId}`);
    return project;
  } catch (error) {
    logger.error('❌ Failed to save base project:', error);
    throw error;
  }
}

/**
 * Append a modification run to project history
 */
export async function appendRun(designId, runData) {
  try {
    const {
      changeRequest,
      impactedViews,
      masterDNA,
      promptsByView,
      seedsByView,
      resultsByView
    } = runData;

    const runId = `run_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const timestamp = new Date().toISOString();

    const run = {
      runId,
      timestamp,
      changeRequest,
      impactedViews,
      masterDNA,
      promptsByView,
      seedsByView,
      resultsByView
    };

    const project = await getProject(designId);
    if (!project) {
      throw new Error(`Project ${designId} not found`);
    }

    project.runs = project.runs || [];
    project.runs.push(run);

    const db = await openDB();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    await new Promise((resolve, reject) => {
      const request = store.put(project);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    logger.info(`✅ Appended run ${runId} to project ${designId}`);
    return run;
  } catch (error) {
    logger.error('❌ Failed to append run:', error);
    throw error;
  }
}

/**
 * Get latest stable DNA (base or latest run)
 */
export async function getLatestStable(designId) {
  try {
    const project = await getProject(designId);
    if (!project) {
      return null;
    }

    if (project.runs && project.runs.length > 0) {
      const latestRun = project.runs[project.runs.length - 1];
      return {
        masterDNA: latestRun.masterDNA,
        seedsByView: latestRun.seedsByView,
        promptsByView: latestRun.promptsByView,
        runId: latestRun.runId,
        timestamp: latestRun.timestamp
      };
    }

    return {
      masterDNA: project.baseMasterDNA,
      seedsByView: project.baseSeedsByView,
      promptsByView: {},
      runId: null,
      timestamp: project.createdAt
    };
  } catch (error) {
    logger.error('❌ Failed to get latest stable:', error);
    return null;
  }
}

/**
 * List all runs for a project
 */
export async function listRuns(designId) {
  try {
    const project = await getProject(designId);
    if (!project) {
      return [];
    }

    return project.runs || [];
  } catch (error) {
    logger.error('❌ Failed to list runs:', error);
    return [];
  }
}

/**
 * Build compact AI context from history for prompt inclusion
 */
export async function buildAIContext(designId) {
  try {
    const project = await getProject(designId);
    if (!project) {
      return null;
    }

    const latestStable = await getLatestStable(designId);
    const recentRuns = (project.runs || []).slice(-3); // Last 3 runs

    const context = {
      basePrompt: project.baseMainPrompt,
      baseDNA: project.baseMasterDNA,
      currentDNA: latestStable.masterDNA,
      currentSeeds: latestStable.seedsByView,
      recentChanges: recentRuns.map(run => ({
        timestamp: run.timestamp,
        changeRequest: run.changeRequest,
        impactedViews: run.impactedViews
      }))
    };

    return context;
  } catch (error) {
    logger.error('❌ Failed to build AI context:', error);
    return null;
  }
}

/**
 * Get all projects (for UI listing)
 */
export async function getAllProjects() {
  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    logger.error('❌ Failed to get all projects:', error);
    return [];
  }
}

/**
 * Delete a project
 */
export async function deleteProject(designId) {
  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    await new Promise((resolve, reject) => {
      const request = store.delete(designId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    logger.info(`🗑️ Deleted project: ${designId}`);
    return true;
  } catch (error) {
    logger.error('❌ Failed to delete project:', error);
    throw error;
  }
}

export default {
  getProject,
  saveBase,
  appendRun,
  getLatestStable,
  listRuns,
  buildAIContext,
  getAllProjects,
  deleteProject,
  VIEW_IDS
};

