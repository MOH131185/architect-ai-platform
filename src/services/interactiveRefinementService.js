/**
 * Interactive Refinement Service (Step 8)
 *
 * Provides natural-language interface for design modifications and iterative refinement.
 * Analyzes user modification requests, determines affected components, and regenerates
 * only the necessary outputs.
 */

import openaiService from './openaiService';
import replicateService from './replicateService';

class InteractiveRefinementService {
  /**
   * Step 8.1-8.2: Process user modification request and regenerate affected outputs
   *
   * @param {string} modificationPrompt - Natural language modification request
   * @param {Object} currentDesign - Current complete design state
   * @param {Object} projectContext - Current project context
   * @returns {Promise<Object>} Refined design with updated outputs
   */
  async processModification(modificationPrompt, currentDesign, projectContext) {
    try {
      console.log('Processing modification:', modificationPrompt);

      // Step 8.1: Parse modification prompt to understand intent
      const modification = await this.parseModificationPrompt(modificationPrompt, currentDesign);

      if (!modification.success) {
        return {
          success: false,
          error: 'Could not understand modification request',
          suggestion: modification.suggestion,
          originalPrompt: modificationPrompt
        };
      }

      // Step 8.2: Update project context based on modification
      const updatedContext = this.applyModificationToContext(
        modification,
        projectContext,
        currentDesign
      );

      // Determine which outputs need regeneration
      const affectedOutputs = this.determineAffectedOutputs(modification);

      // Regenerate only affected outputs
      console.log('Regenerating affected outputs:', affectedOutputs);
      const regeneratedOutputs = await this.regenerateAffectedOutputs(
        affectedOutputs,
        updatedContext,
        currentDesign
      );

      return {
        success: true,
        modification: {
          prompt: modificationPrompt,
          type: modification.type,
          scope: modification.scope,
          changes: modification.changes
        },
        updatedContext,
        regeneratedOutputs,
        affectedOutputs,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('Modification processing error:', error);
      return {
        success: false,
        error: error.message,
        originalPrompt: modificationPrompt
      };
    }
  }

  /**
   * Parse natural-language modification prompt to extract intent and parameters
   *
   * @param {string} prompt - User modification request
   * @param {Object} currentDesign - Current design state for context
   * @returns {Promise<Object>} Parsed modification intent
   */
  async parseModificationPrompt(prompt, currentDesign) {
    try {
      const parsingPrompt = `
You are an AI assistant that interprets architectural design modification requests.
Analyze the following user modification request and extract structured information.

USER REQUEST: "${prompt}"

CURRENT DESIGN CONTEXT:
- Building Type: ${currentDesign.buildingProgram?.buildingType || 'Not specified'}
- Stories: ${currentDesign.buildingProgram?.massing?.stories?.recommended || 'Not specified'}
- Total Area: ${currentDesign.buildingProgram?.massing?.floorAreas?.totalGrossArea || 'Not specified'}m²
- Style: ${currentDesign.portfolioAnalysis?.blendedStyle?.dominantStyle || 'Contemporary'}

Determine:
1. Modification Type: spatial, aesthetic, structural, mep, material, program
2. Scope: Which parts of the design are affected (floor_plans, elevations, sections, exterior_views, interior_views, structural, mep)
3. Specific Changes: What exactly needs to change
4. Affected Levels: Which floors are affected (if applicable)
5. Parameters: Extract any numerical values (areas, dimensions, percentages)

Return ONLY valid JSON in this exact format:
{
  "success": true,
  "type": "spatial|aesthetic|structural|mep|material|program",
  "scope": ["floor_plans", "elevations", "sections", "exterior_views", "interior_views", "structural", "mep"],
  "changes": {
    "description": "Brief description of the change",
    "affectedSpaces": ["living room", "bedroom"],
    "affectedLevels": ["Ground Floor", "Second Floor"],
    "parameters": {
      "areaIncrease": 20,
      "newFeature": "skylight",
      "dimension": "3m x 4m"
    }
  },
  "reasoning": "Why this interpretation is correct"
}
      `.trim();

      const response = await openaiService.generateDesignReasoning({
        customPrompt: parsingPrompt
      });

      // Extract JSON from response
      let parsed;
      if (response.rawResponse) {
        const jsonMatch = response.rawResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        }
      }

      if (!parsed || !parsed.success) {
        // Fallback to rule-based parsing
        return this.ruleBasedParsing(prompt, currentDesign);
      }

      return parsed;

    } catch (error) {
      console.warn('AI parsing failed, using rule-based parsing:', error.message);
      return this.ruleBasedParsing(prompt, currentDesign);
    }
  }

  /**
   * Rule-based parsing fallback when AI parsing fails
   */
  ruleBasedParsing(prompt, currentDesign) {
    const promptLower = prompt.toLowerCase();

    // Determine modification type
    let type = 'spatial';
    if (promptLower.includes('color') || promptLower.includes('material') || promptLower.includes('style')) {
      type = 'aesthetic';
    } else if (promptLower.includes('column') || promptLower.includes('beam') || promptLower.includes('foundation')) {
      type = 'structural';
    } else if (promptLower.includes('hvac') || promptLower.includes('electrical') || promptLower.includes('plumbing')) {
      type = 'mep';
    } else if (promptLower.includes('area') || promptLower.includes('room') || promptLower.includes('space')) {
      type = 'program';
    }

    // Determine scope
    const scope = [];
    if (promptLower.includes('floor plan') || promptLower.includes('layout') || promptLower.includes('room')) {
      scope.push('floor_plans');
    }
    if (promptLower.includes('facade') || promptLower.includes('exterior') || promptLower.includes('elevation')) {
      scope.push('elevations', 'exterior_views');
    }
    if (promptLower.includes('interior') || promptLower.includes('inside')) {
      scope.push('interior_views');
    }
    if (promptLower.includes('section') || promptLower.includes('height')) {
      scope.push('sections');
    }
    if (promptLower.includes('structural') || promptLower.includes('structure')) {
      scope.push('structural');
    }
    if (promptLower.includes('mep') || promptLower.includes('mechanical') || promptLower.includes('electrical')) {
      scope.push('mep');
    }

    // Default scope if none detected
    if (scope.length === 0) {
      scope.push('floor_plans');
    }

    // Extract affected spaces
    const spaces = [];
    const spaceKeywords = ['living room', 'bedroom', 'kitchen', 'bathroom', 'dining', 'office',
                           'waiting room', 'exam room', 'reception', 'lobby', 'entrance'];
    spaceKeywords.forEach(space => {
      if (promptLower.includes(space)) {
        spaces.push(space);
      }
    });

    // Extract affected levels
    const levels = [];
    const levelKeywords = ['ground floor', 'first floor', 'second floor', 'third floor',
                           'basement', 'rooftop', 'upper floor'];
    levelKeywords.forEach(level => {
      if (promptLower.includes(level)) {
        levels.push(level.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '));
      }
    });

    // Extract parameters
    const parameters = {};

    // Area increase/decrease
    const areaMatch = prompt.match(/(\d+)\s*(?:m²|square meters?|sqm)/i);
    if (areaMatch) {
      parameters.areaChange = parseInt(areaMatch[1]);
    }

    // Percentage increase/decrease
    const percentMatch = prompt.match(/(\d+)\s*%/);
    if (percentMatch) {
      parameters.percentageChange = parseInt(percentMatch[1]);
    }

    // New features
    const featureKeywords = ['skylight', 'window', 'door', 'balcony', 'terrace', 'fireplace',
                            'closet', 'storage', 'pantry', 'island'];
    featureKeywords.forEach(feature => {
      if (promptLower.includes(feature)) {
        parameters.newFeature = feature;
      }
    });

    return {
      success: true,
      type,
      scope,
      changes: {
        description: prompt,
        affectedSpaces: spaces,
        affectedLevels: levels.length > 0 ? levels : ['All levels'],
        parameters
      },
      reasoning: 'Rule-based parsing (AI parsing unavailable)',
      method: 'rule-based'
    };
  }

  /**
   * Apply modification to project context
   *
   * @param {Object} modification - Parsed modification
   * @param {Object} projectContext - Current project context
   * @param {Object} currentDesign - Current design state
   * @returns {Object} Updated project context
   */
  applyModificationToContext(modification, projectContext, currentDesign) {
    const updatedContext = JSON.parse(JSON.stringify(projectContext)); // Deep clone

    const { type, changes } = modification;

    // Apply changes based on modification type
    switch (type) {
      case 'spatial':
      case 'program':
        this.applyProgramChanges(updatedContext, changes);
        break;

      case 'aesthetic':
      case 'material':
        this.applyAestheticChanges(updatedContext, changes);
        break;

      case 'structural':
        this.applyStructuralChanges(updatedContext, changes);
        break;

      case 'mep':
        this.applyMEPChanges(updatedContext, changes);
        break;
    }

    // Add modification history
    if (!updatedContext.modificationHistory) {
      updatedContext.modificationHistory = [];
    }
    updatedContext.modificationHistory.push({
      type,
      changes,
      timestamp: new Date().toISOString()
    });

    return updatedContext;
  }

  /**
   * Apply program/spatial changes to context
   */
  applyProgramChanges(context, changes) {
    const { affectedSpaces, affectedLevels, parameters } = changes;

    // Update building program if area changes
    if (parameters.areaChange) {
      const currentArea = context.buildingProgram?.massing?.floorAreas?.totalGrossArea || 200;
      const newArea = currentArea + parameters.areaChange;

      if (context.buildingProgram?.massing?.floorAreas) {
        context.buildingProgram.massing.floorAreas.totalGrossArea = newArea;
      }
    }

    // Add new features to per-level allocation
    if (parameters.newFeature && context.buildingProgram?.perLevelAllocation) {
      affectedLevels.forEach(levelName => {
        const level = context.buildingProgram.perLevelAllocation.find(
          l => l.level === levelName
        );
        if (level) {
          level.modifications = level.modifications || [];
          level.modifications.push({
            feature: parameters.newFeature,
            spaces: affectedSpaces
          });
        }
      });
    }

    // Store modification notes
    context.modificationNotes = context.modificationNotes || [];
    context.modificationNotes.push(changes.description);
  }

  /**
   * Apply aesthetic/material changes to context
   */
  applyAestheticChanges(context, changes) {
    const { parameters } = changes;

    // Update style preferences
    if (parameters.style) {
      context.stylePreferences = context.stylePreferences || {};
      context.stylePreferences.override = parameters.style;
    }

    // Update material preferences
    if (parameters.material) {
      context.materialPreferences = context.materialPreferences || [];
      context.materialPreferences.push(parameters.material);
    }

    // Update color preferences
    if (parameters.color) {
      context.colorPreferences = context.colorPreferences || [];
      context.colorPreferences.push(parameters.color);
    }

    // Store modification notes
    context.modificationNotes = context.modificationNotes || [];
    context.modificationNotes.push(changes.description);
  }

  /**
   * Apply structural changes to context
   */
  applyStructuralChanges(context, changes) {
    const { parameters } = changes;

    // Update structural system preferences
    if (parameters.structuralSystem) {
      context.structuralPreferences = context.structuralPreferences || {};
      context.structuralPreferences.primarySystem = parameters.structuralSystem;
    }

    // Store modification notes
    context.modificationNotes = context.modificationNotes || [];
    context.modificationNotes.push(changes.description);
  }

  /**
   * Apply MEP changes to context
   */
  applyMEPChanges(context, changes) {
    const { parameters } = changes;

    // Update MEP system preferences
    context.mepPreferences = context.mepPreferences || {};

    if (parameters.hvacSystem) {
      context.mepPreferences.hvac = parameters.hvacSystem;
    }

    // Store modification notes
    context.modificationNotes = context.modificationNotes || [];
    context.modificationNotes.push(changes.description);
  }

  /**
   * Determine which outputs are affected by the modification
   *
   * @param {Object} modification - Parsed modification
   * @returns {Array} List of affected output types
   */
  determineAffectedOutputs(modification) {
    const { type, scope } = modification;
    const affected = new Set();

    // Add explicitly mentioned scopes
    scope.forEach(s => affected.add(s));

    // Add implicitly affected outputs based on modification type
    switch (type) {
      case 'spatial':
      case 'program':
        affected.add('floor_plans');
        affected.add('sections');
        affected.add('interior_views');
        break;

      case 'aesthetic':
      case 'material':
        affected.add('exterior_views');
        affected.add('interior_views');
        affected.add('elevations');
        break;

      case 'structural':
        affected.add('structural');
        affected.add('sections');
        break;

      case 'mep':
        affected.add('mep');
        affected.add('sections');
        break;
    }

    return Array.from(affected);
  }

  /**
   * Regenerate only the affected outputs
   *
   * @param {Array} affectedOutputs - List of output types to regenerate
   * @param {Object} updatedContext - Updated project context
   * @param {Object} currentDesign - Current design state
   * @returns {Promise<Object>} Regenerated outputs
   */
  async regenerateAffectedOutputs(affectedOutputs, updatedContext, currentDesign) {
    const regenerated = {};

    // Regenerate design reasoning if context changed significantly
    const needsReasoningUpdate = affectedOutputs.includes('floor_plans') ||
                                  affectedOutputs.includes('structural') ||
                                  affectedOutputs.includes('mep');

    if (needsReasoningUpdate) {
      console.log('Regenerating design reasoning...');
      regenerated.reasoning = await openaiService.generateDesignReasoning(updatedContext);
    } else {
      regenerated.reasoning = currentDesign.reasoning;
    }

    // Regenerate floor plans if affected
    if (affectedOutputs.includes('floor_plans')) {
      console.log('Regenerating floor plans...');
      regenerated.floorPlans = await replicateService.generatePerLevelFloorPlans(
        updatedContext.buildingProgram,
        updatedContext
      );
    }

    // Regenerate sections if affected
    if (affectedOutputs.includes('sections')) {
      console.log('Regenerating sections...');
      const technicalDrawings = await replicateService.generateTechnicalDrawings(
        updatedContext.buildingProgram,
        updatedContext
      );
      regenerated.sections = technicalDrawings.drawings?.section;
    }

    // Regenerate elevations if affected
    if (affectedOutputs.includes('elevations')) {
      console.log('Regenerating elevations...');
      const technicalDrawings = await replicateService.generateTechnicalDrawings(
        updatedContext.buildingProgram,
        updatedContext
      );
      regenerated.elevations = {
        north: technicalDrawings.drawings?.elevation_north,
        south: technicalDrawings.drawings?.elevation_south,
        east: technicalDrawings.drawings?.elevation_east,
        west: technicalDrawings.drawings?.elevation_west
      };
    }

    // Regenerate exterior views if affected
    if (affectedOutputs.includes('exterior_views')) {
      console.log('Regenerating exterior views...');
      const views = await replicateService.generateComprehensiveViews(updatedContext);
      regenerated.exteriorViews = {
        north: views.views?.exterior_north,
        south: views.views?.exterior_south,
        east: views.views?.exterior_east,
        west: views.views?.exterior_west
      };
    }

    // Regenerate interior views if affected
    if (affectedOutputs.includes('interior_views')) {
      console.log('Regenerating interior views...');
      const views = await replicateService.generateComprehensiveViews(updatedContext);
      const interiorKeys = Object.keys(views.views || {}).filter(k => k.startsWith('interior_'));
      regenerated.interiorViews = {};
      interiorKeys.forEach(key => {
        regenerated.interiorViews[key] = views.views[key];
      });
    }

    // Regenerate structural diagram if affected
    if (affectedOutputs.includes('structural')) {
      console.log('Regenerating structural diagram...');
      const engineeringDiagrams = await replicateService.generateEngineeringDiagrams(
        updatedContext.buildingProgram,
        regenerated.reasoning,
        updatedContext
      );
      regenerated.structural = engineeringDiagrams.diagrams?.structural;
    }

    // Regenerate MEP diagram if affected
    if (affectedOutputs.includes('mep')) {
      console.log('Regenerating MEP diagram...');
      const engineeringDiagrams = await replicateService.generateEngineeringDiagrams(
        updatedContext.buildingProgram,
        regenerated.reasoning,
        updatedContext
      );
      regenerated.mep = engineeringDiagrams.diagrams?.mep;
    }

    return regenerated;
  }

  /**
   * Step 8.3: Generate refinement suggestions based on current design
   *
   * @param {Object} currentDesign - Current design state
   * @returns {Promise<Array>} List of suggested refinements
   */
  async generateRefinementSuggestions(currentDesign) {
    try {
      const suggestionPrompt = `
Based on this architectural design, suggest 5 potential refinements the user might want to make:

CURRENT DESIGN:
- Building Type: ${currentDesign.buildingProgram?.buildingType || 'Not specified'}
- Style: ${currentDesign.portfolioAnalysis?.blendedStyle?.dominantStyle || 'Contemporary'}
- Stories: ${currentDesign.buildingProgram?.massing?.stories?.recommended || 'Not specified'}
- Climate: ${currentDesign.siteAnalysis?.climate?.description || 'Not specified'}

Suggest natural-language modifications like:
- "Add a skylight to the living room for more natural light"
- "Increase the waiting room area by 20%"
- "Change the facade material to brick"

Return ONLY a JSON array of suggestion objects:
[
  {
    "suggestion": "Add a skylight to the living room for more natural light",
    "category": "spatial",
    "impact": "Regenerates floor plans and interior views",
    "benefit": "Improves natural lighting and reduces energy consumption"
  }
]
      `.trim();

      const response = await openaiService.generateDesignReasoning({
        customPrompt: suggestionPrompt
      });

      // Extract JSON array from response
      if (response.rawResponse) {
        const jsonMatch = response.rawResponse.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
      }

      // Fallback suggestions
      return this.getDefaultSuggestions(currentDesign);

    } catch (error) {
      console.warn('Suggestion generation failed, using defaults:', error.message);
      return this.getDefaultSuggestions(currentDesign);
    }
  }

  /**
   * Get default refinement suggestions
   */
  getDefaultSuggestions(currentDesign) {
    const buildingType = currentDesign.buildingProgram?.buildingType || '';

    if (buildingType.includes('residential')) {
      return [
        {
          suggestion: 'Add a skylight to the living room for more natural light',
          category: 'spatial',
          impact: 'Regenerates floor plans and interior views',
          benefit: 'Improves natural lighting and reduces energy consumption'
        },
        {
          suggestion: 'Increase the master bedroom area by 15%',
          category: 'program',
          impact: 'Regenerates floor plans and sections',
          benefit: 'More spacious primary bedroom suite'
        },
        {
          suggestion: 'Add a balcony to the second floor',
          category: 'spatial',
          impact: 'Regenerates elevations and exterior views',
          benefit: 'Provides outdoor space and enhances facade'
        },
        {
          suggestion: 'Change the exterior material to natural brick',
          category: 'aesthetic',
          impact: 'Regenerates elevations and exterior views',
          benefit: 'Improves aesthetic appeal and thermal mass'
        },
        {
          suggestion: 'Add solar panels to the roof',
          category: 'mep',
          impact: 'Regenerates MEP diagram and sections',
          benefit: 'Reduces energy costs and carbon footprint'
        }
      ];
    } else if (buildingType.includes('medical') || buildingType.includes('clinic')) {
      return [
        {
          suggestion: 'Increase the waiting room area by 25%',
          category: 'program',
          impact: 'Regenerates floor plans',
          benefit: 'Accommodates more patients comfortably'
        },
        {
          suggestion: 'Add two additional examination rooms',
          category: 'program',
          impact: 'Regenerates floor plans and sections',
          benefit: 'Increases patient capacity'
        },
        {
          suggestion: 'Add a dedicated staff break room',
          category: 'spatial',
          impact: 'Regenerates floor plans',
          benefit: 'Improves staff well-being and productivity'
        },
        {
          suggestion: 'Install medical-grade HVAC with HEPA filtration',
          category: 'mep',
          impact: 'Regenerates MEP diagram',
          benefit: 'Ensures air quality and infection control'
        },
        {
          suggestion: 'Add accessible ramp at main entrance',
          category: 'spatial',
          impact: 'Regenerates elevations and sections',
          benefit: 'Improves accessibility and code compliance'
        }
      ];
    } else {
      return [
        {
          suggestion: 'Add more natural lighting to interior spaces',
          category: 'spatial',
          impact: 'Regenerates floor plans and interior views',
          benefit: 'Reduces energy consumption and improves ambiance'
        },
        {
          suggestion: 'Modify the facade for better solar orientation',
          category: 'aesthetic',
          impact: 'Regenerates elevations and exterior views',
          benefit: 'Optimizes passive solar gain'
        },
        {
          suggestion: 'Increase ceiling height in main spaces',
          category: 'spatial',
          impact: 'Regenerates sections and interior views',
          benefit: 'Creates more spacious feel and improves air circulation'
        },
        {
          suggestion: 'Add green roof for sustainability',
          category: 'mep',
          impact: 'Regenerates sections and MEP diagram',
          benefit: 'Improves insulation and stormwater management'
        },
        {
          suggestion: 'Optimize structural grid for open floor plan',
          category: 'structural',
          impact: 'Regenerates structural diagram and floor plans',
          benefit: 'Provides more flexible interior layout'
        }
      ];
    }
  }

  /**
   * Validate modification compatibility with current design
   *
   * @param {string} modificationPrompt - User modification request
   * @param {Object} currentDesign - Current design state
   * @returns {Object} Validation result
   */
  validateModification(modificationPrompt, currentDesign) {
    const promptLower = modificationPrompt.toLowerCase();

    // Check for structural feasibility
    if (promptLower.includes('remove column') || promptLower.includes('remove wall')) {
      return {
        valid: false,
        warning: 'Removing structural elements may compromise building stability. Please consult a structural engineer.',
        severity: 'high'
      };
    }

    // Check for zoning violations
    const stories = currentDesign.buildingProgram?.massing?.stories?.recommended || 2;
    if (promptLower.includes('add floor') || promptLower.includes('add story')) {
      const maxHeight = currentDesign.siteAnalysis?.zoning?.maxHeight;
      if (maxHeight && stories >= parseInt(maxHeight)) {
        return {
          valid: false,
          warning: `Adding floors may exceed zoning height limit (${maxHeight}).`,
          severity: 'high'
        };
      }
    }

    // Check for area constraints
    if (promptLower.includes('increase') && promptLower.includes('area')) {
      const siteArea = currentDesign.buildingProgram?.siteAnalysis?.siteArea;
      const buildableArea = currentDesign.buildingProgram?.siteAnalysis?.buildableArea;
      if (siteArea && buildableArea) {
        return {
          valid: true,
          warning: 'Area increase may affect building footprint or require additional stories.',
          severity: 'medium'
        };
      }
    }

    return {
      valid: true,
      severity: 'none'
    };
  }
}

// Export singleton instance
const interactiveRefinementService = new InteractiveRefinementService();
export default interactiveRefinementService;
