/**
 * Modification Validator Service
 *
 * Pre-validates A1 sheet modification requests before generation
 * Ensures modifications are feasible and won't violate site constraints
 * Provides suggestions for infeasible modifications
 */

import { preValidateModification } from './siteValidationService.js';
import logger from '../utils/logger.js';


class ModificationValidator {
  constructor() {
    logger.info('✓ Modification Validator initialized');
  }

  /**
   * Validate a modification request before applying
   * @param {Object} modificationRequest - The modification request
   * @param {string} modificationRequest.deltaPrompt - User's modification request
   * @param {Object} modificationRequest.quickToggles - Quick toggle selections
   * @param {Object} designData - Current design data
   * @param {Object} designData.masterDNA - Master design DNA
   * @param {Object} designData.siteConstraints - Site constraints
   * @param {Object} designData.history - Design history
   * @returns {Object} Validation result with feasibility and suggestions
   */
  validateModification(modificationRequest, designData) {
    logger.info('🔍 Pre-validating modification request...');

    const { deltaPrompt = '', quickToggles = {} } = modificationRequest;
    const { masterDNA, siteConstraints, history } = designData;

    const result = {
      valid: true,
      feasible: true,
      warnings: [],
      errors: [],
      suggestions: [],
      estimatedChanges: {},
      requiresRegeneration: false
    };

    // 1. Check if modification is substantial enough to warrant regeneration
    if (!deltaPrompt && Object.keys(quickToggles).length === 0) {
      result.valid = false;
      result.errors.push({
        type: 'EMPTY_MODIFICATION',
        message: 'No modification specified',
        suggestion: 'Please describe what changes you want or select a quick toggle'
      });
      return result;
    }

    // 2. Parse modification intent
    const intent = this.parseModificationIntent(deltaPrompt, quickToggles);
    result.intent = intent;

    // 3. Check for conflicting modifications
    if (intent.conflicting) {
      result.warnings.push({
        type: 'CONFLICTING_INTENT',
        message: 'Modification contains conflicting requests',
        detail: intent.conflicts.join('; '),
        suggestion: 'Please clarify which change is preferred'
      });
    }

    // 4. Validate against site constraints if available
    if (siteConstraints && masterDNA) {
      const siteValidation = preValidateModification(deltaPrompt, masterDNA, siteConstraints);

      if (!siteValidation.valid) {
        result.feasible = false;
        result.errors.push(...siteValidation.errors);
      }

      if (siteValidation.warnings.length > 0) {
        result.warnings.push(...siteValidation.warnings);
      }

      if (siteValidation.suggestions.length > 0) {
        result.suggestions.push(...siteValidation.suggestions);
      }

      result.estimatedChanges = siteValidation.estimatedMetrics || {};
    }

    // 5. Check modification history to avoid repeated failures
    if (history && history.modifications) {
      const similarMods = this.findSimilarModifications(deltaPrompt, history.modifications);

      if (similarMods.failed > 0) {
        result.warnings.push({
          type: 'PREVIOUS_FAILURE',
          message: `Similar modification failed ${similarMods.failed} time(s) before`,
          suggestion: 'Consider rephrasing or trying a different approach'
        });
      }

      if (similarMods.successful > 0) {
        logger.info(`   ✓ Similar modification succeeded ${similarMods.successful} time(s) before`);
      }
    }

    // 6. Estimate generation requirements
    result.requiresRegeneration = this.requiresFullRegeneration(intent);
    result.estimatedTime = result.requiresRegeneration ? '60-90 seconds' : '30-45 seconds';

    // 7. Provide optimization suggestions
    if (intent.addingMultipleFeatures) {
      result.suggestions.push('Consider adding features incrementally for better control');
    }

    if (intent.majorStructuralChange && !result.requiresRegeneration) {
      result.warnings.push({
        type: 'STRUCTURAL_CHANGE',
        message: 'Major structural changes may require full regeneration',
        suggestion: 'Enable "Full Regeneration" for best results'
      });
    }

    // 8. Check for common issues
    const commonIssues = this.checkCommonIssues(deltaPrompt, masterDNA);
    if (commonIssues.length > 0) {
      result.warnings.push(...commonIssues);
    }

    // 9. Suggest better prompting if needed
    const promptingSuggestions = this.getPromptingSuggestions(deltaPrompt, intent);
    if (promptingSuggestions.length > 0) {
      result.suggestions.push(...promptingSuggestions);
    }

    // Summary
    logger.info(`✅ Validation complete:`);
    logger.info(`   Valid: ${result.valid}`);
    logger.info(`   Feasible: ${result.feasible}`);
    logger.info(`   Warnings: ${result.warnings.length}`);
    logger.info(`   Suggestions: ${result.suggestions.length}`);

    return result;
  }

  /**
   * Parse the intent of a modification request
   */
  parseModificationIntent(deltaPrompt, quickToggles) {
    const promptLower = deltaPrompt.toLowerCase();
    const intent = {
      addingSpace: false,
      removingSpace: false,
      changingMaterials: false,
      changingStyle: false,
      addingFloors: false,
      removingFloors: false,
      addingWindows: false,
      changingRoof: false,
      addingFeatures: [],
      removingFeatures: [],
      majorStructuralChange: false,
      minorAestheticChange: false,
      conflicting: false,
      conflicts: []
    };

    // Parse quick toggles
    if (quickToggles.addSections) intent.addingFeatures.push('sections');
    if (quickToggles.add3DViews) intent.addingFeatures.push('3D views');
    if (quickToggles.addDetails) intent.addingFeatures.push('construction details');
    if (quickToggles.addInterior) intent.addingFeatures.push('interior views');

    // Parse text prompt
    if (promptLower.includes('add') && (promptLower.includes('room') || promptLower.includes('space'))) {
      intent.addingSpace = true;
    }

    if (promptLower.includes('remove') && (promptLower.includes('room') || promptLower.includes('space'))) {
      intent.removingSpace = true;
    }

    if (promptLower.includes('change') && (promptLower.includes('material') || promptLower.includes('facade'))) {
      intent.changingMaterials = true;
    }

    if (promptLower.includes('style') || promptLower.includes('modern') || promptLower.includes('traditional')) {
      intent.changingStyle = true;
    }

    if (promptLower.includes('add') && (promptLower.includes('floor') || promptLower.includes('story'))) {
      intent.addingFloors = true;
    }

    if (promptLower.includes('window') || promptLower.includes('glazing')) {
      intent.addingWindows = true;
    }

    if (promptLower.includes('roof')) {
      intent.changingRoof = true;
    }

    // Check for conflicts
    if (intent.addingSpace && intent.removingSpace) {
      intent.conflicting = true;
      intent.conflicts.push('Adding and removing spaces simultaneously');
    }

    if (intent.addingFloors && intent.removingFloors) {
      intent.conflicting = true;
      intent.conflicts.push('Adding and removing floors simultaneously');
    }

    // Determine change magnitude
    intent.majorStructuralChange = intent.addingFloors || intent.removingFloors ||
                                   intent.addingSpace || intent.removingSpace ||
                                   intent.changingRoof;

    intent.minorAestheticChange = intent.changingMaterials || intent.addingWindows ||
                                  intent.addingFeatures.length > 0;

    intent.addingMultipleFeatures = intent.addingFeatures.length > 2;

    return intent;
  }

  /**
   * Find similar modifications in history
   */
  findSimilarModifications(deltaPrompt, modifications) {
    const result = { similar: 0, successful: 0, failed: 0 };

    if (!modifications || !Array.isArray(modifications)) {
      return result;
    }

    const promptWords = new Set(deltaPrompt.toLowerCase().split(/\s+/));

    for (const mod of modifications) {
      if (!mod.deltaPrompt) continue;

      const modWords = new Set(mod.deltaPrompt.toLowerCase().split(/\s+/));
      const intersection = [...promptWords].filter(w => modWords.has(w));

      // Consider similar if >50% word overlap
      if (intersection.length / promptWords.size > 0.5) {
        result.similar++;

        if (mod.consistencyScore >= 0.92) {
          result.successful++;
        } else {
          result.failed++;
        }
      }
    }

    return result;
  }

  /**
   * Check if modification requires full regeneration
   */
  requiresFullRegeneration(intent) {
    return intent.majorStructuralChange ||
           intent.changingStyle ||
           intent.addingFeatures.length > 3;
  }

  /**
   * Check for common issues
   */
  checkCommonIssues(deltaPrompt, masterDNA) {
    const issues = [];
    const promptLower = deltaPrompt.toLowerCase();

    // Check for vague requests
    if (promptLower.includes('make it better') || promptLower.includes('improve')) {
      issues.push({
        type: 'VAGUE_REQUEST',
        message: 'Request is too vague',
        suggestion: 'Be specific about what aspects to improve'
      });
    }

    // Check for impossible requests
    if (promptLower.includes('10 floors') && masterDNA?.dimensions?.floorCount === 2) {
      issues.push({
        type: 'EXCESSIVE_CHANGE',
        message: 'Changing from 2 to 10 floors is a complete redesign',
        suggestion: 'Consider generating a new design instead'
      });
    }

    // Check for style conflicts
    if (promptLower.includes('modern') && masterDNA?.architecturalStyle?.includes('Victorian')) {
      issues.push({
        type: 'STYLE_CONFLICT',
        message: 'Changing from Victorian to Modern is a major style shift',
        suggestion: 'This may significantly alter the entire design'
      });
    }

    return issues;
  }

  /**
   * Get prompting suggestions
   */
  getPromptingSuggestions(deltaPrompt, intent) {
    const suggestions = [];

    // Suggest specificity
    if (deltaPrompt.length < 20) {
      suggestions.push('Consider providing more specific details about the desired changes');
    }

    // Suggest breaking down complex requests
    if (intent.addingMultipleFeatures) {
      suggestions.push('Consider applying changes one at a time for better control');
    }

    // Suggest using quick toggles
    if (deltaPrompt.includes('section') && !intent.addingFeatures.includes('sections')) {
      suggestions.push('Use the "Add Sections" quick toggle for standard section additions');
    }

    return suggestions;
  }

  /**
   * Validate quick toggle selections
   */
  validateQuickToggles(quickToggles, masterDNA) {
    const warnings = [];

    if (quickToggles.addSections && masterDNA?.sections?.length >= 2) {
      warnings.push('Design already has sections A-A and B-B');
    }

    if (quickToggles.add3DViews && masterDNA?.threeD?.length >= 4) {
      warnings.push('Design already has comprehensive 3D views');
    }

    return warnings;
  }
}

export default new ModificationValidator();