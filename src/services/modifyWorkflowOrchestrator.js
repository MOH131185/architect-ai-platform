/**
 * Modify Workflow Orchestrator
 * Handles design modifications with selective regeneration
 * Maintains consistency by preserving seeds and DNA context
 */

import designHistoryStore, { VIEW_IDS } from './designHistoryStore.js';
import enhancedDNAGenerator from './enhancedDNAGenerator.js';
import dnaPromptGenerator from './dnaPromptGenerator.js';
import { generateSingleView } from './togetherAIService.js';
import togetherAIReasoningService from './togetherAIReasoningService.js';

/**
 * View type to ViewId mapping
 */
const VIEW_TYPE_TO_ID = {
  'floor_plan_ground': VIEW_IDS.PLAN_GROUND,
  'floor_plan_upper': VIEW_IDS.PLAN_UPPER,
  'elevation_north': VIEW_IDS.ELEV_N,
  'elevation_south': VIEW_IDS.ELEV_S,
  'elevation_east': VIEW_IDS.ELEV_E,
  'elevation_west': VIEW_IDS.ELEV_W,
  'section_longitudinal': VIEW_IDS.SECT_LONG,
  'section_cross': VIEW_IDS.SECT_TRANS,
  'exterior_front_3d': VIEW_IDS.V_EXTERIOR,
  'axonometric_3d': VIEW_IDS.V_AXON,
  'site_3d': VIEW_IDS.V_SITE,
  'interior_3d': VIEW_IDS.V_INTERIOR
};

/**
 * View dimensions mapping
 */
const VIEW_CONFIGS = {
  [VIEW_IDS.PLAN_GROUND]: { width: 1024, height: 1024, type: 'floor_plan_ground' },
  [VIEW_IDS.PLAN_UPPER]: { width: 1024, height: 1024, type: 'floor_plan_upper' },
  [VIEW_IDS.ELEV_N]: { width: 1024, height: 1024, type: 'elevation_north' },
  [VIEW_IDS.ELEV_S]: { width: 1024, height: 1024, type: 'elevation_south' },
  [VIEW_IDS.ELEV_E]: { width: 1024, height: 1024, type: 'elevation_east' },
  [VIEW_IDS.ELEV_W]: { width: 1024, height: 1024, type: 'elevation_west' },
  [VIEW_IDS.SECT_LONG]: { width: 1024, height: 1024, type: 'section_longitudinal' },
  [VIEW_IDS.SECT_TRANS]: { width: 1024, height: 1024, type: 'section_cross' },
  [VIEW_IDS.V_EXTERIOR]: { width: 1024, height: 1024, type: 'exterior_front_3d' },
  [VIEW_IDS.V_AXON]: { width: 1024, height: 1024, type: 'axonometric_3d' },
  [VIEW_IDS.V_SITE]: { width: 1024, height: 1024, type: 'site_3d' },
  [VIEW_IDS.V_INTERIOR]: { width: 1536, height: 1024, type: 'interior_3d' }
};

/**
 * Compute impacted views from change request
 */
function computeImpactedViews(changeRequest, currentDNA) {
  const impactedViews = new Set();

  // Analyze change request for keywords
  const changeLower = changeRequest.toLowerCase();

  // Dimension changes affect plans, elevations, and sections
  if (changeLower.includes('dimension') || changeLower.includes('size') || 
      changeLower.includes('length') || changeLower.includes('width') || 
      changeLower.includes('height') || changeLower.includes('floor')) {
    impactedViews.add(VIEW_IDS.PLAN_GROUND);
    impactedViews.add(VIEW_IDS.PLAN_UPPER);
    impactedViews.add(VIEW_IDS.ELEV_N);
    impactedViews.add(VIEW_IDS.ELEV_S);
    impactedViews.add(VIEW_IDS.ELEV_E);
    impactedViews.add(VIEW_IDS.ELEV_W);
    impactedViews.add(VIEW_IDS.SECT_LONG);
    impactedViews.add(VIEW_IDS.SECT_TRANS);
  }

  // Material/palette changes affect elevations and 3D views
  if (changeLower.includes('material') || changeLower.includes('color') || 
      changeLower.includes('palette') || changeLower.includes('facade')) {
    impactedViews.add(VIEW_IDS.ELEV_N);
    impactedViews.add(VIEW_IDS.ELEV_S);
    impactedViews.add(VIEW_IDS.ELEV_E);
    impactedViews.add(VIEW_IDS.ELEV_W);
    impactedViews.add(VIEW_IDS.V_EXTERIOR);
    impactedViews.add(VIEW_IDS.V_AXON);
  }

  // Layout/room changes affect plans
  if (changeLower.includes('room') || changeLower.includes('layout') || 
      changeLower.includes('plan') || changeLower.includes('space')) {
    impactedViews.add(VIEW_IDS.PLAN_GROUND);
    impactedViews.add(VIEW_IDS.PLAN_UPPER);
  }

  // Interior changes affect interior view and plans
  if (changeLower.includes('interior') || changeLower.includes('furniture') || 
      changeLower.includes('decoration')) {
    impactedViews.add(VIEW_IDS.V_INTERIOR);
    impactedViews.add(VIEW_IDS.PLAN_GROUND);
    impactedViews.add(VIEW_IDS.PLAN_UPPER);
  }

  // Window/door changes affect elevations and sections
  if (changeLower.includes('window') || changeLower.includes('door') || 
      changeLower.includes('opening')) {
    impactedViews.add(VIEW_IDS.ELEV_N);
    impactedViews.add(VIEW_IDS.ELEV_S);
    impactedViews.add(VIEW_IDS.ELEV_E);
    impactedViews.add(VIEW_IDS.ELEV_W);
    impactedViews.add(VIEW_IDS.SECT_LONG);
    impactedViews.add(VIEW_IDS.SECT_TRANS);
  }

  // Roof changes affect elevations, sections, and exterior views
  if (changeLower.includes('roof') || changeLower.includes('gable') || 
      changeLower.includes('pitch')) {
    impactedViews.add(VIEW_IDS.ELEV_N);
    impactedViews.add(VIEW_IDS.ELEV_S);
    impactedViews.add(VIEW_IDS.ELEV_E);
    impactedViews.add(VIEW_IDS.ELEV_W);
    impactedViews.add(VIEW_IDS.SECT_LONG);
    impactedViews.add(VIEW_IDS.SECT_TRANS);
    impactedViews.add(VIEW_IDS.V_EXTERIOR);
    impactedViews.add(VIEW_IDS.V_AXON);
  }

  // Site changes affect site view
  if (changeLower.includes('site') || changeLower.includes('location') || 
      changeLower.includes('boundary')) {
    impactedViews.add(VIEW_IDS.V_SITE);
  }

  return Array.from(impactedViews);
}

/**
 * Update DNA based on change request
 */
async function updateDNAAndPrompts(designId, changeRequest, projectContext) {
  console.log('🧬 Updating DNA based on change request...');

  // Get latest stable DNA
  const latestStable = await designHistoryStore.getLatestStable(designId);
  if (!latestStable) {
    throw new Error(`Project ${designId} not found in history`);
  }

  // Build AI context from history
  const aiContext = await designHistoryStore.buildAIContext(designId);

  // Generate updated DNA using Qwen with delta prompt
  const deltaPrompt = `Based on the following design history and current specifications, apply these modifications:

CURRENT DESIGN DNA:
${JSON.stringify(latestStable.masterDNA, null, 2)}

RECENT CHANGES:
${aiContext.recentChanges.map(c => `- ${c.changeRequest} (${c.timestamp})`).join('\n')}

REQUESTED MODIFICATION:
${changeRequest}

REQUIREMENTS:
- Maintain consistency with existing design DNA
- Preserve dimensions, materials, and style unless explicitly changed
- Ensure all modifications are architecturally feasible
- Return updated DNA in the same format as current DNA`;

  // Use Together.ai Qwen to update DNA
  try {
    const updatedDNA = await togetherAIReasoningService.generateUpdatedDNA({
      currentDNA: latestStable.masterDNA,
      changeRequest,
      projectContext
    });

    console.log('✅ DNA updated successfully');
    return updatedDNA || latestStable.masterDNA; // Fallback to current if update fails
  } catch (error) {
    console.warn('⚠️ DNA update failed, using current DNA:', error);
    return latestStable.masterDNA; // Fallback to current DNA
  }
}

/**
 * Generate impacted views sequentially with 6000ms delay
 */
async function generateImpactedViewsSequentially(
  promptsByView,
  masterDNA,
  seedsByView,
  selectedViews,
  projectContext
) {
  console.log(`🎨 Generating ${selectedViews.length} impacted views sequentially...`);

  const results = {};
  const delayMs = 6000; // Enforced delay between requests

  for (let i = 0; i < selectedViews.length; i++) {
    const viewId = selectedViews[i];
    const viewConfig = VIEW_CONFIGS[viewId];

    if (!viewConfig) {
      console.warn(`⚠️ Unknown view ID: ${viewId}`);
      continue;
    }

    // Get prompt for this view
    const promptKey = Object.keys(promptsByView).find(key => 
      VIEW_TYPE_TO_ID[key] === viewId
    );

    if (!promptKey) {
      console.warn(`⚠️ No prompt found for view: ${viewId}`);
      continue;
    }

    const prompt = promptsByView[promptKey];
    const seed = seedsByView[viewId] || masterDNA.seed || Math.floor(Math.random() * 1e6);

    try {
      console.log(`\n🎨 [${i + 1}/${selectedViews.length}] Generating ${viewId}...`);

      const result = await generateSingleView(
        {
          viewType: viewConfig.type,
          prompt,
          masterDNA
        },
        seed,
        i === 0 ? 0 : delayMs // No delay before first view
      );

      results[viewId] = result.url;

      console.log(`✅ [${i + 1}/${selectedViews.length}] ${viewId} generated successfully`);

    } catch (error) {
      console.error(`❌ Failed to generate ${viewId}:`, error);
      results[viewId] = null; // Mark as failed
    }
  }

  return results;
}

/**
 * Apply modification to design
 */
export async function applyModification({ designId, changeRequest, selectedViews, projectContext }) {
  console.log('🔧 Applying modification to design...');
  console.log(`   Design ID: ${designId}`);
  console.log(`   Change request: ${changeRequest.substring(0, 100)}...`);
  console.log(`   Selected views: ${selectedViews.length}`);

  try {
    // Step 1: Compute impacted views if not explicitly selected
    let viewsToRegenerate = selectedViews || [];
    if (viewsToRegenerate.length === 0) {
      const latestStable = await designHistoryStore.getLatestStable(designId);
      viewsToRegenerate = computeImpactedViews(changeRequest, latestStable.masterDNA);
      console.log(`   Auto-detected ${viewsToRegenerate.length} impacted views`);
    }

    // Step 2: Update DNA based on change request
    const updatedDNA = await updateDNAAndPrompts(designId, changeRequest, projectContext);

    // Step 3: Generate prompts for impacted views
    const promptsByView = dnaPromptGenerator.generatePromptsForViews(
      updatedDNA,
      viewsToRegenerate,
      projectContext
    );

    // Step 4: Get seeds for views (preserve existing seeds)
    const latestStable = await designHistoryStore.getLatestStable(designId);
    const seedsByView = {};
    viewsToRegenerate.forEach(viewId => {
      seedsByView[viewId] = latestStable.seedsByView?.[viewId] || 
                            updatedDNA.seed || 
                            Math.floor(Math.random() * 1e6);
    });

    // Step 5: Generate impacted views sequentially
    const resultsByView = await generateImpactedViewsSequentially(
      promptsByView,
      updatedDNA,
      seedsByView,
      viewsToRegenerate,
      projectContext
    );

    // Step 6: Save run to history
    const run = await designHistoryStore.appendRun(designId, {
      changeRequest,
      impactedViews: viewsToRegenerate,
      masterDNA: updatedDNA,
      promptsByView,
      seedsByView,
      resultsByView
    });

    console.log('✅ Modification applied successfully');
    console.log(`   Run ID: ${run.runId}`);
    console.log(`   Generated: ${Object.values(resultsByView).filter(r => r).length}/${viewsToRegenerate.length} views`);

    return {
      dna: updatedDNA,
      promptsByView,
      seedsByView,
      resultsByView,
      runId: run.runId,
      impactedViews: viewsToRegenerate
    };

  } catch (error) {
    console.error('❌ Failed to apply modification:', error);
    throw error;
  }
}

export default {
  applyModification,
  computeImpactedViews,
  VIEW_CONFIGS
};

