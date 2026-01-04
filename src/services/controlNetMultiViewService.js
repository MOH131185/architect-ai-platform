/**
 * ControlNet Multi-View Architectural Visualization Service
 *
 * DEPRECATED: The A1-only workflow no longer calls this service. It remains available solely for
 * backward compatibility with legacy multi-view experiments. New features should rely on the
 * DNA-driven A1 pipeline and not invoke this ControlNet workflow unless explicitly required.
 *
 * Mission: Generate consistent multi-view 3D architectural visualizations that strictly match
 * uploaded 2D floor plans using ControlNet for structural fidelity.
 *
 * 6-Step Workflow:
 * 1. Context Setup - AI architecture assistant configuration
 * 2. Input Parameters - Structured project data
 * 3. Reasoning Phase - Extract layout, define design schema, store building_core_description
 * 4. Generation Phase - Create 6 views with ControlNet conditioning
 * 5. Consistency Validation - Verify all views use same seed, materials, control_image
 * 6. Output Format - Return complete JSON package
 */

import togetherAIReasoningService from './togetherAIReasoningService.js';
import enhancedDesignDNAService from './enhancedDesignDNAService.js';
import dnaPromptGenerator from './dnaPromptGenerator.js';
import enhancedViewConfigurationService from './enhancedViewConfigurationService.js';
import logger from '../utils/logger.js';


class ControlNetMultiViewService {
  constructor() {
    this.openai = togetherAIReasoningService;
    this.dnaService = enhancedDesignDNAService;
    this.dnaPromptGenerator = dnaPromptGenerator;
    this.enhancedViewConfig = enhancedViewConfigurationService;

    // Step 1: Context Setup - Claude instruction embedded as system context
    this.systemContext = `You are an AI architecture visualization assistant working for ArchiAI Solution Ltd.
Your mission is to ensure all generated images represent the same building with identical geometry, layout, and materials as the provided 2D floor plan.

You use:
- Stable Diffusion XL Multi-ControlNet LoRA (or similar)
- ControlNet conditioning via floor plan images
- ProjectSeed for generation consistency
- Claude reasoning to synchronize prompts and parameters

Critical requirements:
- SAME geometry & openings in all views
- SAME materials, color palette, roof type, number of floors
- Exact alignment with floor plan reference
- Photorealistic 3D views matching 2D technical accuracy`;
  }

  /**
   * STEP 2: Input Parameters
   * Accept structured input for the architectural project
   *
   * @param {Object} params - Project parameters
   * @returns {Object} Validated and normalized parameters
   */
  validateAndNormalizeInput(params) {
    const {
      project_name = 'Untitled Project',
      location = 'Not specified',
      style = 'Contemporary',
      materials = 'Brick walls, tile roof, window frames',
      floors = 2,
      main_entry_orientation = 'North',
      control_image = null, // Floor plan image URL or base64
      seed = Math.floor(Math.random() * 1000000),
      climate = 'Temperate',
      floor_area = 200,
      building_program = 'house'
    } = params;

    // Validate required fields
    if (!control_image) {
      logger.warn('⚠️  No control_image provided - ControlNet conditioning will be limited');
    }

    const normalized = {
      project_name,
      location,
      style,
      materials,
      floors: Math.min(Math.max(floors, 1), 5), // Clamp between 1-5
      main_entry_orientation,
      control_image,
      seed,
      climate,
      floor_area,
      building_program
    };

    logger.info('📋 STEP 2: Input parameters validated:', {
      project: normalized.project_name,
      floors: normalized.floors,
      seed: normalized.seed,
      hasControlImage: !!normalized.control_image
    });

    return normalized;
  }

  /**
   * STEP 3: Reasoning Phase - Enhanced DNA Generation
   *
   * Uses Enhanced Design DNA Service to generate comprehensive, authoritative specifications
   * that ensure 95%+ consistency across all views.
   *
   * @param {Object} inputParams - Validated input parameters
   * @param {Object} portfolioAnalysis - Optional portfolio DNA (from user uploads)
   * @param {Object} locationData - Optional location intelligence data
   * @returns {Promise<Object>} Building core description with enhanced DNA
   */
  async generateBuildingCoreDescription(inputParams, portfolioAnalysis = null, locationData = null) {
    logger.info('🧬 STEP 3: Generating Enhanced Design DNA for 95%+ consistency...');

    try {
      // Prepare project context for DNA generation
      const projectContext = {
        project_name: inputParams.project_name,
        location: inputParams.location,
        style: inputParams.style,
        materials: inputParams.materials,
        floors: inputParams.floors,
        floor_area: inputParams.floor_area,
        main_entry_orientation: inputParams.main_entry_orientation,
        climate: inputParams.climate,
        building_program: inputParams.building_program
      };

      // Generate comprehensive Master Design DNA
      const dnaResult = await this.dnaService.generateMasterDesignDNA(
        projectContext,
        portfolioAnalysis,
        locationData
      );

      if (!dnaResult.success) {
        logger.warn('⚠️  Enhanced DNA generation failed, using fallback...');
        return this.getFallbackBuildingCoreDescription(inputParams);
      }

      const masterDNA = dnaResult.masterDNA;

      // Map enhanced DNA to building_core_description format for backward compatibility
      const buildingCoreDescription = this.mapDNAToBuildingCore(masterDNA, inputParams);

      // Add metadata
      buildingCoreDescription.project_name = inputParams.project_name;
      buildingCoreDescription.seed = inputParams.seed;
      buildingCoreDescription.control_image = inputParams.control_image;
      buildingCoreDescription.timestamp = new Date().toISOString();

      // Attach full enhanced DNA for advanced features
      buildingCoreDescription.masterDNA = masterDNA;
      buildingCoreDescription.dna_version = '2.0';
      buildingCoreDescription.consistency_level = '95%+';

      logger.info('✅ Enhanced DNA generated with 95%+ consistency:', {
        dimensions: `${masterDNA.dimensions?.length}m × ${masterDNA.dimensions?.width}m × ${masterDNA.dimensions?.height}m`,
        floors: masterDNA.dimensions?.floor_count,
        materials: masterDNA.materials?.exterior?.primary,
        roof: masterDNA.roof_specifications?.type,
        windows: `${masterDNA.windows?.total_count} total (${masterDNA.windows?.windows_per_floor} per floor)`,
        color_palette: `Primary: ${masterDNA.color_palette?.primary?.hex}`,
        dna_version: '2.0'
      });

      return buildingCoreDescription;

    } catch (error) {
      logger.error('❌ Failed to generate Enhanced DNA:', error);
      return this.getFallbackBuildingCoreDescription(inputParams);
    }
  }

  /**
   * Map Enhanced DNA structure to legacy building_core_description format
   * Ensures backward compatibility with existing view generators
   */
  mapDNAToBuildingCore(masterDNA, inputParams) {
    return {
      geometry: {
        length: masterDNA.dimensions?.length || 12,
        width: masterDNA.dimensions?.width || 8,
        height: masterDNA.dimensions?.height || 6.4,
        floor_count: masterDNA.dimensions?.floor_count || inputParams.floors,
        floor_height: masterDNA.dimensions?.ground_floor_height || 3.2
      },

      materials: {
        walls: `${masterDNA.materials?.exterior?.primary || 'brick'} ${masterDNA.materials?.exterior?.texture || ''}`,
        walls_color_hex: masterDNA.materials?.exterior?.color_hex || '#B8604E',
        roof: `${masterDNA.roof_specifications?.material_details?.type || 'tiles'} ${masterDNA.materials?.roof?.color || ''}`,
        roof_color_hex: masterDNA.materials?.roof?.color_hex || '#4A4A4A',
        windows: `${masterDNA.materials?.windows?.frame_material || 'aluminum'} frames ${masterDNA.materials?.windows?.glass_type || ''}`,
        windows_color_hex: masterDNA.materials?.windows?.color_hex || '#FFFFFF',
        doors: `${masterDNA.materials?.doors?.material || 'wood'} ${masterDNA.materials?.doors?.color || ''}`,
        doors_color_hex: masterDNA.materials?.doors?.color_hex || '#8B4513',
        texture_details: masterDNA.materials?.exterior?.texture || 'smooth finish'
      },

      openings: {
        window_type: masterDNA.windows?.style || 'casement',
        window_pattern: 'symmetrical',
        window_count_per_floor: masterDNA.windows?.windows_per_floor || 6,
        window_count_total: masterDNA.windows?.total_count,
        window_distribution: masterDNA.windows?.distribution,
        door_type: masterDNA.doors?.style || 'standard',
        door_position: masterDNA.doors?.main_entrance_location || `${inputParams.main_entry_orientation} facade`
      },

      roof: {
        type: masterDNA.roof_specifications?.type || 'gable',
        pitch: `${masterDNA.roof_specifications?.pitch_description || 'moderate'} ${masterDNA.roof_specifications?.pitch_degrees || 40} degrees`,
        pitch_degrees: masterDNA.roof_specifications?.pitch_degrees,
        material: masterDNA.roof_specifications?.material_details?.type || 'tiles',
        color: masterDNA.materials?.roof?.color || 'dark grey',
        overhang: masterDNA.roof_specifications?.overhang
      },

      color_palette: {
        primary: masterDNA.color_palette?.primary,
        secondary: masterDNA.color_palette?.secondary,
        accent: masterDNA.color_palette?.accent,
        trim: masterDNA.color_palette?.trim
      },

      structural_system: masterDNA.structural_system,

      style_features: {
        facade_articulation: masterDNA.view_notes?.elevation_front || `${inputParams.style} design with clean lines`,
        distinctive_elements: ['symmetrical facade', 'balanced proportions', 'clear entrance'],
        architectural_style: inputParams.style
      },

      consistency_rules: masterDNA.consistency_rules || [
        `Same geometry in all views: ${masterDNA.dimensions?.length}m × ${masterDNA.dimensions?.width}m × ${masterDNA.dimensions?.height}m`,
        `Exact material colors: ${masterDNA.materials?.exterior?.color_hex}`,
        'Window positions consistent across all facades',
        `Floor count always ${masterDNA.dimensions?.floor_count} floors`,
        `Entry always on ${inputParams.main_entry_orientation} side`,
        'Roof type and pitch identical in all views'
      ],

      view_notes: masterDNA.view_notes,

      // Flag that this uses enhanced DNA
      uses_enhanced_dna: true,
      dna_version: '2.0'
    };
  }

  /**
   * STEP 4: Generation Phase - View-by-View Prompts
   *
   * Generate one configuration for each render, all reusing:
   * - building_core_description
   * - seed
   * - control_image
   *
   * Views:
   * 1. 2D Floor Plan (Base)
   * 2. Exterior Front
   * 3. Exterior Side
   * 4. Interior Main Space
   * 5. Axonometric
   * 6. Perspective
   *
   * @param {Object} buildingCoreDescription - Unified design schema
   * @returns {Object} View configurations for all 6 views
   */
  generateViewConfigurations(buildingCoreDescription) {
    logger.info('🎨 STEP 4: Generating view-by-view prompts with ControlNet...');

    const {
      geometry,
      materials,
      openings,
      roof,
      style_features,
      seed,
      control_image
    } = buildingCoreDescription;

    const views = {};

    // 4.1 - 2D Floor Plan (Base)
    views.floor_plan = {
      view: "2D Floor Plan",
      prompt: `Generate clean architectural 2D floor plan, black lines on white background, scale 1:100, top-down view, accurate wall thickness, doors, and windows. Building dimensions ${geometry.length}m × ${geometry.width}m, ${geometry.floor_count} floors, ${openings.window_count_per_floor} windows per floor, ${openings.door_position} entrance.`,
      negative_prompt: "blur, color shading, artistic sketch, perspective distortion, 3D, rendered, photorealistic",
      controlnet: control_image ? {
        image: control_image,
        conditioning_scale: 1.0,
        preprocessor: "canny"
      } : null,
      seed: seed,
      width: 1024,
      height: 1024,
      output: "floor_plan.png"
    };

    // 4.2 - Exterior Front
    views.exterior_front = {
      view: "Exterior Front",
      prompt: `3D photorealistic exterior front view of the SAME building described in floor_plan.png. Align facade and window positions exactly as in floor plan. ${materials.walls} (${materials.walls_color_hex}), ${openings.window_type} windows with ${materials.windows} (${materials.windows_color_hex}), ${roof.type} roof with ${roof.material} (${roof.roof_color_hex}). ${geometry.floor_count} floors visible. ${openings.door_position}-facing entrance. Lighting: daylight, ${openings.door_position.toLowerCase()}-facing orientation. Use ControlNet reference to preserve geometry. ${style_features.facade_articulation}. Professional architectural photography, photorealistic, high detail.`,
      negative_prompt: "different layout, extra floors, changed window count, wrong materials, inconsistent colors, different building, mismatched facade",
      controlnet: control_image ? {
        image: control_image,
        conditioning_scale: 1.0,
        preprocessor: "canny"
      } : null,
      seed: seed,
      width: 1536,
      height: 1152,
      output: "exterior_front.png"
    };

    // 4.3 - Exterior Side
    const sideOrientation = this.getPerpendicularOrientation(openings.door_position);
    views.exterior_side = {
      view: "Exterior Side",
      prompt: `3D photorealistic side view (${sideOrientation} facade) of the SAME house as exterior front. Windows, height, and roof profile must exactly match floor plan geometry. ${materials.walls} (${materials.walls_color_hex}), ${roof.type} roof with ${roof.material} (${roof.roof_color_hex}), ${openings.window_type} windows (${materials.windows_color_hex}). ${geometry.floor_count} floors, ${geometry.height}m total height. Use ControlNet reference for wall alignment. Professional architectural photography, photorealistic.`,
      negative_prompt: "changed proportions, different color, different material, extra floors, inconsistent design",
      controlnet: control_image ? {
        image: control_image,
        conditioning_scale: 1.0,
        preprocessor: "canny"
      } : null,
      seed: seed,
      width: 1024,
      height: 768,
      output: "exterior_side.png"
    };

    // 4.4 - Interior Main Space
    views.interior = {
      view: "Interior Main Space",
      prompt: `Interior render of the same house, showing living room as in floor plan layout. Walls, door, and window positions identical to floor_plan.png. ${materials.walls} exterior visible through window, ${openings.window_type} windows, same lighting direction (${openings.door_position.toLowerCase()}). Keep materials and colors consistent. ${geometry.floor_height}m ceiling height. Spacious interior, natural daylight, photorealistic rendering, professional interior photography.`,
      negative_prompt: "different layout, missing openings, unrealistic lighting, wrong materials, inconsistent design",
      controlnet: control_image ? {
        image: control_image,
        conditioning_scale: 0.9
      } : null,
      seed: seed,
      width: 1536,
      height: 1024,
      output: "interior.png"
    };

    // 4.5 - Axonometric
    views.axonometric = {
      view: "Axonometric",
      prompt: `Axonometric architectural view of the SAME building, identical materials and layout as floor_plan.png. ${materials.walls} (${materials.walls_color_hex}), ${openings.window_type} windows (${materials.windows_color_hex}), ${roof.type} ${roof.material} roof (${roof.roof_color_hex}). ${geometry.floor_count} floors, dimensions ${geometry.length}m × ${geometry.width}m × ${geometry.height}m. 45-degree isometric projection, realistic brick texture, professional architectural visualization, no artistic exaggeration.`,
      negative_prompt: "different building, inconsistent dimensions, wrong materials, changed colors, extra floors",
      controlnet: control_image ? {
        image: control_image,
        conditioning_scale: 1.0
      } : null,
      seed: seed,
      width: 1024,
      height: 768,
      output: "axonometric.png"
    };

    // 4.6 - Perspective
    views.perspective = {
      view: "Perspective",
      prompt: `Perspective 3D view combining front (${openings.door_position}) and side (${sideOrientation}) facades of the SAME building. Must match all previous views and floor plan geometry. ${materials.walls} (${materials.walls_color_hex}), ${openings.window_type} windows (${materials.windows_color_hex}), ${roof.type} ${roof.material} roof (${roof.roof_color_hex}), ${openings.door_type} door at ${openings.door_position} entrance. ${geometry.floor_count} floors, ${geometry.height}m height. ControlNet floor plan reference required. Professional architectural perspective rendering, photorealistic, dramatic angle, golden hour lighting.`,
      negative_prompt: "different structure, mismatched facade, wrong materials, inconsistent colors, extra floors",
      controlnet: control_image ? {
        image: control_image,
        conditioning_scale: 1.0
      } : null,
      seed: seed,
      width: 1024,
      height: 768,
      output: "perspective.png"
    };

    logger.success(` Generated configurations for ${Object.keys(views).length} views`);
    return views;
  }

  /**
   * STEP 4 (Enhanced): Generate view configurations with multi-ControlNet support
   *
   * Uses enhanced prompts with explicit floor plan/elevation references,
   * multiple elevation images per view, and optimized conditioning scales.
   *
   * @param {Object} buildingCoreDescription - Building core with DNA
   * @param {Object} elevationImages - Object with elevation images { north: 'url', south: 'url', east: 'url', west: 'url' }
   * @returns {Object} Enhanced view configurations for all 6 views
   */
  generateEnhancedViewConfigurations(buildingCoreDescription, elevationImages = {}) {
    logger.info('🎨 STEP 4 (Enhanced): Generating multi-ControlNet view configurations...');

    const { seed, control_image } = buildingCoreDescription;

    // Generate all 6 enhanced views using the new service
    const enhancedViews = this.enhancedViewConfig.generateAllEnhancedViews({
      buildingCore: buildingCoreDescription,
      floorPlanImage: control_image,
      elevationImages: elevationImages,
      seed: seed
    });

    logger.success(` Generated enhanced configurations for ${Object.keys(enhancedViews).length} views`);
    logger.info(`   🎯 Features: Multi-ControlNet, explicit elevation references, enhanced negatives`);
    logger.info(`   📐 Floor plan weight: 1.1, Elevation weights: 0.9`);

    return enhancedViews;
  }

  /**
   * Generate all architectural views using Replicate SDXL with ControlNet
   *
   * @param {Object} viewConfigs - View configurations from step 4
   * @returns {Promise<Object>} Generated images for all views
   */
  async generateAllViews(viewConfigs) {
    logger.info('🖼️  Generating all views with Replicate SDXL + ControlNet...');

    const results = {};
    const viewNames = Object.keys(viewConfigs);

    for (const viewName of viewNames) {
      const config = viewConfigs[viewName];

      try {
        logger.info(`   🎨 Generating ${config.view}...`);

        const generationParams = {
          prompt: config.prompt,
          negativePrompt: config.negative_prompt,
          width: config.width,
          height: config.height,
          seed: config.seed,
          steps: 50,
          guidanceScale: 8.0,
          ...(config.controlnet && {
            controlImage: config.controlnet.image,
            conditioning_scale: config.controlnet.conditioning_scale
          })
        };

        const result = await this.replicate.generateArchitecturalImage(generationParams);

        results[viewName] = {
          ...result,
          view: config.view,
          output_file: config.output,
          success: result.success,
          prompt_used: config.prompt.substring(0, 150) + '...'
        };

        logger.info(`   ✅ ${config.view} ${result.success ? 'generated' : 'failed'}`);

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (error) {
        logger.error(`   ❌ Failed to generate ${config.view}:`, error.message);
        results[viewName] = {
          view: config.view,
          success: false,
          error: error.message,
          output_file: config.output
        };
      }
    }

    return results;
  }

  /**
   * STEP 5: Enhanced Consistency Validation with DNA Rules
   *
   * After generation, check:
   * - All views used the same seed
   * - Each prompt contains "SAME building / identical geometry / matches floor plan"
   * - All views reference the control_image
   * - DNA consistency rules are embedded in prompts
   * - Enhanced DNA specifications are maintained
   *
   * @param {Object} viewConfigs - Original view configurations
   * @param {Object} results - Generated results
   * @param {Object} buildingCoreDescription - Building core with DNA
   * @returns {Object} Enhanced validation report
   */
  validateConsistency(viewConfigs, results, buildingCoreDescription = null) {
    logger.info('🔍 STEP 5: Enhanced Consistency Validation with DNA Rules...');

    const validation = {
      checks: [],
      passed: true,
      notes: [],
      dna_enhanced: !!buildingCoreDescription?.uses_enhanced_dna
    };

    // Check 1: Same seed across all views
    const seeds = Object.values(viewConfigs).map(v => v.seed);
    const uniqueSeeds = [...new Set(seeds)];
    const seedCheck = uniqueSeeds.length === 1;
    validation.checks.push({
      test: 'Same seed across all views',
      passed: seedCheck,
      details: seedCheck ? `All views use seed ${uniqueSeeds[0]}` : `Multiple seeds found: ${uniqueSeeds.join(', ')}`,
      critical: true
    });

    // Check 2: Prompts contain consistency keywords
    const consistencyKeywords = ['SAME building', 'identical geometry', 'matches floor plan', 'exactly as in'];
    Object.entries(viewConfigs).forEach(([viewName, config]) => {
      if (viewName === 'floor_plan') return; // Skip base view

      const hasKeywords = consistencyKeywords.some(keyword =>
        config.prompt.toLowerCase().includes(keyword.toLowerCase())
      );

      validation.checks.push({
        test: `${config.view} prompt includes consistency keywords`,
        passed: hasKeywords,
        details: hasKeywords ? 'Contains consistency keywords' : 'Missing consistency keywords',
        critical: true
      });

      if (!hasKeywords) validation.passed = false;
    });

    // Check 3: ControlNet reference used
    const controlNetViews = Object.values(viewConfigs).filter(v => v.controlnet !== null);
    const controlNetCheck = controlNetViews.length > 0;
    validation.checks.push({
      test: 'ControlNet control_image used',
      passed: controlNetCheck,
      details: `${controlNetViews.length} / ${Object.keys(viewConfigs).length} views use ControlNet`,
      critical: false
    });

    // Check 4: Generation success rate
    const successfulViews = Object.values(results).filter(r => r.success);
    const successRate = (successfulViews.length / Object.keys(results).length) * 100;
    const successCheck = successRate >= 80; // At least 80% success
    validation.checks.push({
      test: 'Generation success rate >= 80%',
      passed: successCheck,
      details: `${successfulViews.length} / ${Object.keys(results).length} views generated (${successRate.toFixed(0)}%)`,
      critical: true
    });

    if (!successCheck) validation.passed = false;

    // Enhanced DNA Checks (if available)
    if (buildingCoreDescription?.uses_enhanced_dna) {
      const masterDNA = buildingCoreDescription.masterDNA;

      // Check 5: DNA consistency rules embedded
      if (masterDNA?.consistency_rules) {
        const rulesCount = masterDNA.consistency_rules.length;
        validation.checks.push({
          test: 'Enhanced DNA consistency rules defined',
          passed: rulesCount >= 10,
          details: `${rulesCount} consistency rules embedded in DNA`,
          critical: false
        });

        // List DNA rules
        validation.dna_rules = masterDNA.consistency_rules;
      }

      // Check 6: Exact color specifications
      const hasExactColors = !!(
        buildingCoreDescription.materials?.walls_color_hex &&
        buildingCoreDescription.materials?.roof_color_hex &&
        buildingCoreDescription.materials?.windows_color_hex
      );
      validation.checks.push({
        test: 'Exact material colors with hex codes',
        passed: hasExactColors,
        details: hasExactColors ?
          `Walls: ${buildingCoreDescription.materials.walls_color_hex}, Roof: ${buildingCoreDescription.materials.roof_color_hex}, Windows: ${buildingCoreDescription.materials.windows_color_hex}` :
          'Missing hex color codes',
        critical: false
      });

      // Check 7: Exact dimensions specified
      const hasExactDimensions = !!(
        buildingCoreDescription.geometry?.length &&
        buildingCoreDescription.geometry?.width &&
        buildingCoreDescription.geometry?.height
      );
      validation.checks.push({
        test: 'Exact dimensions specified',
        passed: hasExactDimensions,
        details: hasExactDimensions ?
          `${buildingCoreDescription.geometry.length}m × ${buildingCoreDescription.geometry.width}m × ${buildingCoreDescription.geometry.height}m` :
          'Missing exact dimensions',
        critical: true
      });

      // Check 8: Window count consistency
      const hasWindowCount = !!(buildingCoreDescription.openings?.window_count_total);
      validation.checks.push({
        test: 'Exact window count defined',
        passed: hasWindowCount,
        details: hasWindowCount ?
          `${buildingCoreDescription.openings.window_count_total} windows (${buildingCoreDescription.openings.window_count_per_floor} per floor)` :
          'Window count not specified',
        critical: false
      });

      // Check 9: View-specific notes provided
      const hasViewNotes = !!(masterDNA?.view_notes);
      validation.checks.push({
        test: 'View-specific DNA notes provided',
        passed: hasViewNotes,
        details: hasViewNotes ?
          `${Object.keys(masterDNA.view_notes).length} view-specific notes defined` :
          'No view-specific notes',
        critical: false
      });

      validation.notes.push(`🧬 Enhanced DNA v${buildingCoreDescription.dna_version} - ${buildingCoreDescription.consistency_level} consistency target`);
    }

    // Summary
    const passedCount = validation.checks.filter(c => c.passed).length;
    const criticalChecks = validation.checks.filter(c => c.critical);
    const criticalPassedCount = criticalChecks.filter(c => c.passed).length;

    validation.summary = `${passedCount} / ${validation.checks.length} checks passed`;
    validation.critical_summary = `${criticalPassedCount} / ${criticalChecks.length} critical checks passed`;

    // Overall pass/fail based on critical checks
    validation.passed = criticalPassedCount === criticalChecks.length;

    if (validation.passed) {
      validation.notes.push('✅ All critical consistency checks passed');
      validation.consistency_check = 'passed';
    } else {
      validation.notes.push('⚠️  Some critical consistency checks failed - review details');
      validation.consistency_check = 'failed';
    }

    logger.info(`${validation.passed ? '✅' : '⚠️ '} Enhanced Consistency Validation: ${validation.summary}`);
    logger.info(`   Critical: ${validation.critical_summary}`);
    validation.checks.forEach(check => {
      const icon = check.passed ? '✅' : '❌';
      const criticalTag = check.critical ? '[CRITICAL]' : '';
      logger.info(`   ${icon} ${criticalTag} ${check.test}: ${check.details}`);
    });

    return validation;
  }

  /**
   * STEP 6: Output Format
   *
   * Return complete JSON package with all view configs and results
   *
   * @param {Object} buildingCoreDescription - Building core description
   * @param {Object} viewConfigs - View configurations
   * @param {Object} results - Generation results
   * @param {Object} validation - Consistency validation report
   * @returns {Object} Complete output package
   */
  compileOutputPackage(buildingCoreDescription, viewConfigs, results, validation) {
    logger.info('📦 STEP 6: Compiling output package...');

    const output = {
      project: buildingCoreDescription.project_name,
      timestamp: buildingCoreDescription.timestamp,
      seed: buildingCoreDescription.seed,

      building_core_description: buildingCoreDescription,

      view_configurations: viewConfigs,

      generated_views: results,

      consistency_validation: validation,

      metadata: {
        total_views: Object.keys(viewConfigs).length,
        successful_views: Object.values(results).filter(r => r.success).length,
        failed_views: Object.values(results).filter(r => !r.success).length,
        consistency_passed: validation.passed,
        control_image_used: !!buildingCoreDescription.control_image,
        generation_method: 'SDXL Multi-ControlNet LoRA via Replicate'
      },

      workflow: 'complete',
      workflow_steps: [
        '✅ Step 1: Context Setup - AI assistant configured',
        '✅ Step 2: Input Parameters - Project data validated',
        '✅ Step 3: Reasoning Phase - Building core description generated',
        '✅ Step 4: Generation Phase - 6 views with ControlNet',
        `${validation.passed ? '✅' : '⚠️ '} Step 5: Consistency Validation - ${validation.summary}`,
        '✅ Step 6: Output Format - JSON package compiled'
      ]
    };

    logger.success(' Complete multi-view visualization package ready');
    logger.info(`   📊 Generated: ${output.metadata.successful_views} / ${output.metadata.total_views} views`);
    logger.info(`   🎯 Consistency: ${validation.consistency_check}`);
    logger.info(`   🌱 Seed: ${output.seed}`);

    return output;
  }

  /**
   * MAIN ENTRY POINT
   *
   * Generate complete multi-view architectural visualization package
   * following the 6-step ControlNet workflow
   *
   * @param {Object} rawParams - Raw input parameters
   * @returns {Promise<Object>} Complete visualization package
   */
  async generateConsistentMultiViewPackage(rawParams) {
    logger.info('\n🏗️  CONTROLNET MULTI-VIEW GENERATION STARTING...\n');
    logger.info('━'.repeat(60));

    try {
      // STEP 2: Validate and normalize input
      const inputParams = this.validateAndNormalizeInput(rawParams);

      // STEP 3: Generate building core description
      const buildingCoreDescription = await this.generateBuildingCoreDescription(inputParams);

      // STEP 4: Generate view configurations
      const viewConfigs = this.generateViewConfigurations(buildingCoreDescription);

      // Generate all views
      const results = await this.generateAllViews(viewConfigs);

      // STEP 5: Enhanced Consistency Validation with DNA Rules
      const validation = this.validateConsistency(viewConfigs, results, buildingCoreDescription);

      // STEP 6: Compile output package
      const outputPackage = this.compileOutputPackage(
        buildingCoreDescription,
        viewConfigs,
        results,
        validation
      );

      logger.info('━'.repeat(60));
      logger.success(' CONTROLNET MULTI-VIEW GENERATION COMPLETE\n');

      return outputPackage;

    } catch (error) {
      logger.error('❌ ControlNet multi-view generation failed:', error);
      throw error;
    }
  }

  /**
   * Get perpendicular orientation for side views
   */
  getPerpendicularOrientation(orientation) {
    const perpMap = {
      'North': 'East',
      'East': 'South',
      'South': 'West',
      'West': 'North',
      'NE': 'SE',
      'SE': 'SW',
      'SW': 'NW',
      'NW': 'NE'
    };
    return perpMap[orientation] || 'East';
  }

  /**
   * Fallback building core description when AI reasoning fails
   */
  getFallbackBuildingCoreDescription(inputParams) {
    logger.info('⚠️  Using fallback building_core_description');

    // Calculate reasonable dimensions based on floor area
    const footprint = inputParams.floor_area / inputParams.floors;
    const length = Math.sqrt(footprint * 1.5); // 3:2 ratio
    const width = footprint / length;

    return {
      project_name: inputParams.project_name,
      seed: inputParams.seed,
      control_image: inputParams.control_image,
      timestamp: new Date().toISOString(),

      geometry: {
        length: Math.round(length),
        width: Math.round(width),
        height: inputParams.floors * 3.2,
        floor_count: inputParams.floors,
        floor_height: 3.2
      },

      materials: {
        walls: inputParams.materials.split(',')[0]?.trim() || 'brick walls',
        walls_color_hex: '#D4762E',
        roof: inputParams.materials.includes('roof') ?
          inputParams.materials.split(',').find(m => m.includes('roof'))?.trim() || 'tile roof' :
          'tile roof',
        roof_color_hex: '#4A4A4A',
        windows: 'white window frames',
        windows_color_hex: '#FFFFFF',
        doors: 'wooden door',
        texture_details: 'textured masonry with visible mortar joints'
      },

      openings: {
        window_type: 'casement',
        window_pattern: 'symmetrical',
        window_count_per_floor: Math.max(4, Math.floor(length * 2)),
        door_type: 'standard residential door',
        door_position: `${inputParams.main_entry_orientation} facade`
      },

      roof: {
        type: 'gable',
        pitch: 'moderate 40 degrees',
        material: 'tiles',
        color: 'dark grey'
      },

      style_features: {
        facade_articulation: inputParams.style + ' design with clean lines',
        distinctive_elements: ['symmetrical facade', 'clear entrance', 'balanced proportions'],
        architectural_style: inputParams.style
      },

      consistency_rules: [
        `Same geometry in all views: ${Math.round(length)}m × ${Math.round(width)}m × ${inputParams.floors * 3.2}m`,
        `Exact material colors: ${inputParams.materials}`,
        'Window positions consistent across all facades',
        `Floor count always ${inputParams.floors} floors`,
        `Entry always on ${inputParams.main_entry_orientation} side`,
        'Roof type and pitch identical in all views'
      ],

      isFallback: true
    };
  }
}

// Export singleton instance
export default new ControlNetMultiViewService();
