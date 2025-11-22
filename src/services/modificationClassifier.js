/**
 * Modification Classifier Service
 * 
 * Classifies user modification requests into categories:
 * - Appearance-only: colors, materials, fenestration, details
 * - Minor elevation: add balcony, change window pattern (keep massing)
 * - Volume change: add floor, extend wing, change roof type
 * - New project: complete redesign
 * 
 * Uses Qwen2.5-72B for intelligent classification.
 */

import togetherAIReasoningService from './togetherAIReasoningService.js';
import logger from '../utils/logger.js';

class ModificationClassifier {
  constructor() {
    logger.info('🔍 Modification Classifier Service initialized');
  }

  /**
   * Classify modification request
   * 
   * @param {string} modificationRequest - User's modification request
   * @param {Object} currentDNA - Current design DNA
   * @param {Object} volumeSpec - Current volume specification
   * @returns {Promise<Object>} Classification result
   */
  async classifyModification(modificationRequest, currentDNA, volumeSpec) {
    logger.info('🔍 Classifying modification request...');

    const prompt = `You are an architectural modification analyst. Classify this modification request.

CURRENT DESIGN:
- Building: ${currentDNA.dimensions?.floors || 2} floors, ${currentDNA.dimensions?.length || 15}m × ${currentDNA.dimensions?.width || 10}m
- Roof: ${volumeSpec?.roof?.type || currentDNA.roof?.type || 'gable'}
- Materials: ${Array.isArray(currentDNA.materials) ? currentDNA.materials.map(m => m.name || m).join(', ') : 'N/A'}
- Style: ${currentDNA.architecturalStyle || 'contemporary'}

MODIFICATION REQUEST:
"${modificationRequest}"

CLASSIFICATION CATEGORIES:
1. "appearance_only" - Changes to colors, materials, finishes, or minor details that don't affect building shape
   Examples: "change brick color to white", "use wood instead of concrete", "add shutters to windows"

2. "minor_elevation" - Changes to facade features that don't affect overall massing
   Examples: "add a balcony on south facade", "change window pattern", "add entrance canopy"

3. "volume_change" - Changes to building shape, size, or massing
   Examples: "add a third floor", "extend the building 5m", "change roof from gable to flat"

4. "new_project" - Complete redesign or fundamental change
   Examples: "make it a completely different style", "redesign from scratch"

OUTPUT REQUIREMENTS:
Return ONLY valid JSON (no markdown, no prose):

{
  "classification": "appearance_only|minor_elevation|volume_change|new_project",
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation of classification",
  "affected_elements": ["list", "of", "affected", "elements"],
  "requires_geometry_regeneration": boolean,
  "requires_new_baseline": boolean
}

Classify now (JSON only):`;

    try {
      const response = await togetherAIReasoningService.chatCompletion(
        [{ role: 'user', content: prompt }],
        {
          model: 'Qwen/Qwen2.5-72B-Instruct-Turbo',
          temperature: 0.1, // Low temperature for consistent classification
          max_tokens: 500
        }
      );

      const content = response.choices?.[0]?.message?.content || '';
      
      // Extract JSON
      let jsonStr = content.trim();
      if (jsonStr.startsWith('```')) {
        const match = jsonStr.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
        if (match) {
          jsonStr = match[1];
        }
      }

      const classification = JSON.parse(jsonStr);
      
      logger.success('✅ Modification classified');
      logger.info('   Category: ' + classification.classification);
      logger.info('   Confidence: ' + (classification.confidence * 100).toFixed(0) + '%');
      logger.info('   Requires geometry regen: ' + classification.requires_geometry_regeneration);

      return {
        success: true,
        ...classification
      };

    } catch (error) {
      logger.warn('⚠️  Classification failed, using heuristic fallback:', error.message);
      
      // Heuristic fallback
      return this.heuristicClassification(modificationRequest);
    }
  }

  /**
   * Heuristic classification (fallback when AI fails)
   */
  heuristicClassification(modificationRequest) {
    const request = modificationRequest.toLowerCase();

    // Volume change keywords
    const volumeKeywords = ['floor', 'story', 'extend', 'wing', 'add space', 'bigger', 'smaller', 'roof type', 'height'];
    const hasVolumeKeyword = volumeKeywords.some(kw => request.includes(kw));

    // Appearance keywords
    const appearanceKeywords = ['color', 'material', 'finish', 'texture', 'paint', 'brick', 'wood', 'concrete'];
    const hasAppearanceKeyword = appearanceKeywords.some(kw => request.includes(kw));

    // Elevation keywords
    const elevationKeywords = ['balcony', 'window', 'door', 'entrance', 'facade', 'opening'];
    const hasElevationKeyword = elevationKeywords.some(kw => request.includes(kw));

    let classification = 'appearance_only';
    let requiresGeometryRegen = false;
    let requiresNewBaseline = false;

    if (hasVolumeKeyword) {
      classification = 'volume_change';
      requiresGeometryRegen = true;
      requiresNewBaseline = true;
    } else if (hasElevationKeyword) {
      classification = 'minor_elevation';
      requiresGeometryRegen = false;
      requiresNewBaseline = false;
    } else if (hasAppearanceKeyword) {
      classification = 'appearance_only';
      requiresGeometryRegen = false;
      requiresNewBaseline = false;
    }

    logger.info('   Using heuristic classification: ' + classification);

    return {
      success: true,
      classification,
      confidence: 0.7,
      reasoning: 'Heuristic classification based on keywords',
      affected_elements: [],
      requires_geometry_regeneration: requiresGeometryRegen,
      requires_new_baseline: requiresNewBaseline,
      isHeuristic: true
    };
  }
}

// Export singleton instance
const modificationClassifier = new ModificationClassifier();
export default modificationClassifier;

