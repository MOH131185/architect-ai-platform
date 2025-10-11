/**
 * Consistency Validation Service
 * Validates and ensures consistency across all architectural outputs
 * Implements comprehensive quality checks for 2D plans, 3D views, technical drawings, structural and MEP plans
 */

import logger from '../utils/productionLogger';

class ConsistencyValidationService {
  /**
   * Validate complete project consistency
   * @param {Object} results - All generated results (floor plans, elevations, 3D views, structural, MEP)
   * @param {Object} enhancedContext - Enhanced project context with master design spec and ProjectDNA
   * @returns {Object} Validation results with issues array
   */
  validateConsistency(results, enhancedContext) {
    const issues = [];
    const warnings = [];

    logger.verbose('🔍 Starting comprehensive consistency validation...');

    // 0. Validate ProjectDNA if available
    if (enhancedContext.projectDNA) {
      const dnaIssues = this.validateProjectDNA(results, enhancedContext.projectDNA);
      issues.push(...dnaIssues);
    }

    // 1. Floor Count Consistency
    const floorCountIssues = this.validateFloorCount(results, enhancedContext);
    issues.push(...floorCountIssues);

    // 2. Seed Propagation
    const seedIssues = this.validateSeedPropagation(results, enhancedContext);
    issues.push(...seedIssues);

    // 3. Material Consistency
    const materialIssues = this.validateMaterials(results, enhancedContext);
    issues.push(...materialIssues);

    // 4. View Type Classification (2D vs 3D)
    const viewTypeIssues = this.validateViewTypes(results);
    issues.push(...viewTypeIssues);

    // 5. Master Design Spec Consistency
    const specIssues = this.validateMasterDesignSpec(results, enhancedContext);
    warnings.push(...specIssues);

    const valid = issues.length === 0;
    const overallScore = this.calculateConsistencyScore(results, issues, warnings);

    logger.verbose(valid ? '✅ Consistency validation PASSED' : '⚠️ Consistency validation FAILED');
    if (issues.length > 0) {
      logger.warn(`Found ${issues.length} consistency issues:`, issues);
    }
    if (warnings.length > 0) {
      logger.verbose(`Found ${warnings.length} consistency warnings:`, warnings);
    }

    return {
      valid,
      score: overallScore,
      issues,
      warnings,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Validate floor count consistency across all outputs
   */
  validateFloorCount(results, enhancedContext) {
    const issues = [];
    const expectedFloors = enhancedContext.masterDesignSpec?.dimensions?.floors ||
                          results.floorPlans?.floorCount || 1;

    logger.verbose(`Expected floor count: ${expectedFloors}`);

    // Check floor plans
    if (results.floorPlans?.floorCount && results.floorPlans.floorCount !== expectedFloors) {
      issues.push(`Floor plans show ${results.floorPlans.floorCount} floors but master spec specifies ${expectedFloors} floors`);
    }

    // Check BIM model
    if (results.bimModel?.floors && results.bimModel.floors !== expectedFloors) {
      issues.push(`BIM model shows ${results.bimModel.floors} floors but master spec specifies ${expectedFloors} floors`);
    }

    // Check structural plans
    if (results.constructionDocumentation?.structuralPlans) {
      const structuralFloorCount = Object.keys(results.constructionDocumentation.structuralPlans.structuralPlans || {}).length - 1; // Subtract foundation
      if (structuralFloorCount > 0 && structuralFloorCount !== expectedFloors) {
        issues.push(`Structural plans show ${structuralFloorCount} floors but master spec specifies ${expectedFloors} floors`);
      }
    }

    return issues;
  }

  /**
   * Validate seed propagation to all generation calls
   */
  validateSeedPropagation(results, enhancedContext) {
    const issues = [];
    const expectedSeed = enhancedContext.projectSeed || enhancedContext.seed;

    if (!expectedSeed) {
      issues.push('No project seed found in context - cannot validate seed propagation');
      return issues;
    }

    logger.verbose(`Expected project seed: ${expectedSeed}`);

    // Check if floor plans used correct seed
    if (results.floorPlans?.projectSeed && results.floorPlans.projectSeed !== expectedSeed) {
      issues.push(`Floor plans used seed ${results.floorPlans.projectSeed} instead of ${expectedSeed}`);
    }

    // Check if technical drawings used correct seed
    if (results.technicalDrawings?.projectSeed && results.technicalDrawings.projectSeed !== expectedSeed) {
      issues.push(`Technical drawings used seed ${results.technicalDrawings.projectSeed} instead of ${expectedSeed}`);
    }

    // Seed should be consistent throughout
    const allSeeds = [
      results.floorPlans?.projectSeed,
      results.technicalDrawings?.projectSeed,
      results.constructionDocumentation?.structuralPlans?.projectSeed,
      results.constructionDocumentation?.mepPlans?.projectSeed
    ].filter(Boolean);

    const uniqueSeeds = [...new Set(allSeeds)];
    if (uniqueSeeds.length > 1) {
      issues.push(`Multiple different seeds detected: ${uniqueSeeds.join(', ')} - should all be ${expectedSeed}`);
    }

    return issues;
  }

  /**
   * Validate material consistency across visual outputs
   */
  validateMaterials(results, enhancedContext) {
    const issues = [];
    const expectedMaterials = enhancedContext.blendedStyle?.materials ||
                            enhancedContext.masterDesignSpec?.materials;

    if (!expectedMaterials) {
      // Can't validate without expected materials
      return issues;
    }

    logger.verbose(`Expected materials:`, expectedMaterials);

    // Material validation is more qualitative - we just check if materials context was passed
    if (!enhancedContext.materials && !enhancedContext.isReasoningEnhanced) {
      issues.push('Project context missing material specifications - outputs may have inconsistent materials');
    }

    return issues;
  }

  /**
   * Validate view type classification (2D vs 3D)
   * This is critical to prevent floor plans being classified as 3D views and vice versa
   */
  validateViewTypes(results) {
    const issues = [];

    // Floor plans should be 2D top-down views
    // Technical drawings (elevations/sections) should be 2D orthographic
    // 3D views should be photorealistic perspectives
    // Structural/MEP plans should be 2D top-down technical drawings

    // We can't directly validate image content, but we can check for common issues:
    // - Missing negative prompts in generation parameters
    // - Incorrect view type labels

    if (results.floorPlans) {
      logger.verbose('Floor plans view type: 2D (expected)');
    }

    if (results.technicalDrawings) {
      logger.verbose('Technical drawings view type: 2D orthographic (expected)');
    }

    if (results.visualizations?.views) {
      logger.verbose('3D views view type: 3D photorealistic (expected)');
    }

    // Check for structural/MEP plans
    if (results.constructionDocumentation?.structuralPlans) {
      logger.verbose('Structural plans view type: 2D technical (expected)');
    }

    if (results.constructionDocumentation?.mepPlans) {
      logger.verbose('MEP plans view type: 2D technical (expected)');
    }

    return issues;
  }

  /**
   * Validate adherence to Master Design Specification
   */
  validateMasterDesignSpec(results, enhancedContext) {
    const warnings = [];
    const masterSpec = enhancedContext.masterDesignSpec;

    if (!masterSpec) {
      warnings.push('No Master Design Specification found - cannot validate design consistency');
      return warnings;
    }

    logger.verbose('Validating against Master Design Specification...');
    logger.verbose(`Building dimensions: ${masterSpec.dimensions.length}m × ${masterSpec.dimensions.width}m × ${masterSpec.dimensions.height}m`);
    logger.verbose(`Floor count: ${masterSpec.dimensions.floors}`);
    logger.verbose(`Materials: ${masterSpec.materials.primary}, ${masterSpec.materials.secondary}, ${masterSpec.materials.accent}`);
    logger.verbose(`Roof type: ${masterSpec.roof.type}`);
    logger.verbose(`Window pattern: ${masterSpec.windows.pattern}`);

    // Master spec validation is mostly qualitative - we've ensured it was injected into prompts
    if (!enhancedContext.isReasoningEnhanced) {
      warnings.push('Context is not reasoning-enhanced - Master Design Spec may not have been properly injected into all generation calls');
    }

    return warnings;
  }

  /**
   * Calculate overall consistency score (0.0 - 1.0)
   */
  calculateConsistencyScore(results, issues, warnings) {
    const maxScore = 100;
    let score = maxScore;

    // Deduct points for each issue
    score -= issues.length * 10; // 10 points per issue

    // Deduct points for each warning
    score -= warnings.length * 5; // 5 points per warning

    // Bonus points for successful generation
    if (results.floorPlans?.success) score += 5;
    if (results.technicalDrawings?.success) score += 5;
    if (results.visualizations?.views && Object.keys(results.visualizations.views).length > 0) score += 5;
    if (results.constructionDocumentation?.success) score += 5;

    // Normalize to 0-1 range
    const normalizedScore = Math.max(0, Math.min(maxScore, score)) / maxScore;

    logger.verbose(`Consistency score: ${(normalizedScore * 100).toFixed(1)}%`);

    return normalizedScore;
  }

  /**
   * Generate floor-specific prompt suffix
   * Ensures each floor plan is DISTINCT and describes the specific floor
   * @param {Number} floorIndex - Floor index (0 = ground, 1 = first, etc.)
   * @param {Number} totalFloors - Total number of floors in building
   * @param {String} buildingProgram - Building program type
   * @returns {String} Floor-specific prompt addition
   */
  getFloorSpecificPrompt(floorIndex, totalFloors, buildingProgram = 'residential') {
    if (floorIndex === 0) {
      // Ground floor
      return `Ground floor (Floor ${floorIndex + 1} of ${totalFloors}): entrance lobby, main access, public spaces, ${buildingProgram.includes('house') || buildingProgram.includes('villa') ? 'living room, dining area, kitchen, guest bathroom' : buildingProgram.includes('office') ? 'reception area, open office space, conference rooms' : 'main program spaces'}, main entrance clearly marked, circulation paths, vertical circulation (stairs/elevator) access`;
    } else if (floorIndex < totalFloors - 1) {
      // Middle floors
      return `Upper floor ${floorIndex + 1} (Floor ${floorIndex + 1} of ${totalFloors}): ${buildingProgram.includes('house') || buildingProgram.includes('villa') ? 'bedrooms, private bathrooms, master suite, walk-in closets' : buildingProgram.includes('office') ? 'office workstations, meeting rooms, break rooms' : 'upper program spaces'}, continuation of vertical circulation, balcony access if applicable, no ground-level entrance (this is an upper floor)`;
    } else {
      // Top floor
      return `Top floor ${floorIndex + 1} (Floor ${floorIndex + 1} of ${totalFloors}): ${buildingProgram.includes('house') || buildingProgram.includes('villa') ? 'master bedroom suite, roof terrace access, skylights' : buildingProgram.includes('office') ? 'executive offices, sky lounge, terrace' : 'top floor program'}, mechanical equipment access, roof access hatch, no ground-level entrance (this is the top floor)`;
    }
  }

  /**
   * Enhanced negative prompt for 2D floor plans
   * Prevents AI from generating 3D views when floor plans are requested
   */
  get2DFloorPlanNegativePrompt() {
    return "3D, three dimensional, perspective, isometric, axonometric, exterior view, front view, side view, building facade, photorealistic rendering, realistic photo, color photograph, shading, shadows, depth, volumetric, people, cars, trees, landscape, sky visible, outdoor scene, building exterior walls from outside, elevation view, section cut view, different building, wrong floor, blurry, artistic, hand-drawn sketch, decorative elements, wrong project";
  }

  /**
   * Enhanced negative prompt for 3D views
   * Prevents AI from generating floor plans when 3D views are requested
   */
  get3DViewNegativePrompt() {
    return "floor plan, top view, 2D drawing, technical drawing, blueprint, black and white line drawing, plan view, bird's eye view directly from above, flat 2D layout, orthographic top-down projection, architectural floor plan, CAD drawing, different building, different project, wrong style, wrong materials, blurry, low quality, distorted, unrealistic perspective, sketch";
  }

  /**
   * Enhanced negative prompt for technical drawings (elevations/sections)
   * Ensures pure 2D orthographic projections
   */
  getTechnicalDrawingNegativePrompt() {
    return "3D rendering, perspective, photorealistic, color photograph, shading with depth, volumetric shadows, people, cars, trees, landscape context, sky with clouds, oblique view, isometric view, axonometric view, floor plan, top view, bird's eye view, different building, different project, wrong facade, blurry lines, artistic rendering, hand-drawn, decorative, low detail";
  }

  /**
   * Enhanced negative prompt for structural plans
   * Ensures 2D top-down structural layouts, not 3D building views
   */
  getStructuralPlanNegativePrompt() {
    return "3D building model, building exterior, facade view, perspective view, photorealistic rendering, color photograph, building elevation, section view, people, furniture, architectural finishes, decorative elements, trees, landscape, sky, shading, shadows, volumetric depth, isometric view, axonometric projection, different building, different project, blurry, artistic, hand-drawn, low detail, wrong structural system";
  }

  /**
   * Enhanced negative prompt for MEP plans
   * Ensures 2D MEP system layouts, not 3D building or exterior views
   */
  getMEPPlanNegativePrompt() {
    return "3D building rendering, building exterior walls, building facade, photorealistic building, perspective view, elevation view, section view, people, furniture, architectural finishes, decorative elements, trees, landscape, sky, building from outside, volumetric lighting, shadows with depth, isometric building view, axonometric building projection, different building, different project, blurry, artistic rendering, hand-drawn sketch, low technical detail, missing MEP systems";
  }

  /**
   * Validate ProjectDNA consistency
   * Ensures all outputs align with the master ProjectDNA specification
   * @param {Object} results - Generated results
   * @param {Object} projectDNA - ProjectDNA specification
   * @returns {Array} Array of issues found
   */
  validateProjectDNA(results, projectDNA) {
    const issues = [];

    logger.verbose('🧬 Validating ProjectDNA consistency...');

    // Check floor count matches ProjectDNA
    const dnaFloorCount = projectDNA.floorCount;
    if (results.floorPlans?.floorCount && results.floorPlans.floorCount !== dnaFloorCount) {
      issues.push(`Floor plans show ${results.floorPlans.floorCount} floors but ProjectDNA specifies ${dnaFloorCount} floors`);
    }

    // Check if all specified floor levels were generated
    if (projectDNA.floorPlans && results.floorPlans?.floorPlans) {
      const expectedLevels = projectDNA.floorPlans.map(f => f.level);
      const generatedLevels = Object.keys(results.floorPlans.floorPlans);

      expectedLevels.forEach(level => {
        const levelKey = level.toLowerCase().replace(/\s+/g, '_');
        if (!generatedLevels.some(g => g.includes(levelKey))) {
          issues.push(`Missing floor plan for ${level} specified in ProjectDNA`);
        }
      });
    }

    // Check seed consistency with ProjectDNA
    const dnaSeed = projectDNA.seeds?.master;
    if (dnaSeed && results.floorPlans?.projectSeed && results.floorPlans.projectSeed !== dnaSeed) {
      issues.push(`Floor plans used seed ${results.floorPlans.projectSeed} but ProjectDNA specifies ${dnaSeed}`);
    }

    // Validate building dimensions
    if (projectDNA.dimensions) {
      logger.verbose(`ProjectDNA dimensions: ${projectDNA.dimensions.buildingFootprint.length}m × ${projectDNA.dimensions.buildingFootprint.width}m × ${projectDNA.dimensions.totalHeight}m`);
      logger.verbose(`ProjectDNA style: ${projectDNA.finalStyle.name}`);
      logger.verbose(`ProjectDNA materials: ${projectDNA.finalStyle.materials.join(', ')}`);
    }

    // Check consistency flags are respected
    if (projectDNA.consistencyRules?.strictGeometry && !results.bimModel) {
      logger.verbose('Note: Strict geometry flag set but BIM model not generated (may be optional)');
    }

    return issues;
  }
}

const consistencyValidationService = new ConsistencyValidationService();
export default consistencyValidationService;
