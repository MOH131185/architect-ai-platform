/**
 * AI Integration Service
 * Combines OpenAI reasoning with Replicate generation for complete AI-powered architectural workflow
 */

import logger from '../utils/productionLogger';
import openaiService from './openaiService';
import replicateService from './replicateService';
import portfolioStyleDetection from './portfolioStyleDetection';
import { locationIntelligence } from './locationIntelligence';
import bimService from './bimService';
import dimensioningService from './dimensioningService';

class AIIntegrationService {
  constructor() {
    this.openai = openaiService;
    this.replicate = replicateService;
    this.portfolioStyleDetection = portfolioStyleDetection;
    this.bim = bimService;
    this.dimensioning = dimensioningService;
  }

  /**
   * Complete AI-powered architectural design workflow
   * @param {Object} projectContext - Complete project information
   * @returns {Promise<Object>} Combined reasoning and generation results
   */
  async generateCompleteDesign(projectContext) {
    try {
      logger.info('Starting complete AI design workflow...');

      // Step 1: Generate design reasoning
      const reasoning = await this.generateDesignReasoning(projectContext);

      // Step 2: Generate architectural visualizations
      const visualizations = await this.generateVisualizations(projectContext, reasoning);

      // Step 3: Generate design alternatives
      const alternatives = await this.generateDesignAlternatives(projectContext, reasoning);

      // Step 4: Analyze feasibility
      const feasibility = await this.analyzeFeasibility(projectContext);

      return {
        success: true,
        reasoning,
        visualizations,
        alternatives,
        feasibility,
        projectContext,
        timestamp: new Date().toISOString(),
        workflow: 'complete'
      };

    } catch (error) {
      logger.error('Complete design workflow error:', error);
      return {
        success: false,
        error: error.message,
        fallback: this.getFallbackDesign(projectContext)
      };
    }
  }

  /**
   * Generate design reasoning using OpenAI
   */
  async generateDesignReasoning(projectContext) {
    try {
      logger.info('Generating design reasoning...');
      const reasoning = await this.openai.generateDesignReasoning(projectContext);

      return {
        ...reasoning,
        source: 'openai',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Design reasoning error:', error);
      return {
        designPhilosophy: 'Contextual and sustainable design approach',
        spatialOrganization: 'Functional and flexible spatial arrangement',
        materialRecommendations: 'Locally sourced, sustainable materials',
        environmentalConsiderations: 'Passive design and renewable energy integration',
        technicalSolutions: 'Efficient structural and MEP systems',
        codeCompliance: 'Full compliance with local regulations',
        costStrategies: 'Value engineering and lifecycle cost optimization',
        futureProofing: 'Adaptable design for future needs',
        source: 'fallback',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Generate architectural visualizations using Replicate
   * ENHANCED: Pass OpenAI reasoning to ALL Replicate calls for consistency
   */
  async generateVisualizations(projectContext, reasoning) {
    try {
      logger.verbose('Generating architectural visualizations with unified design framework...');

      // CRITICAL FIX: Create enhanced context with OpenAI reasoning embedded
      const reasoningEnhancedContext = this.createReasoningEnhancedContext(projectContext, reasoning);

      // Generate multiple views with reasoning-enhanced context
      logger.verbose('🎨 Generating views with OpenAI-guided design parameters...');
      const views = await this.replicate.generateMultipleViews(
        reasoningEnhancedContext,
        ['exterior_front', 'exterior_side', 'interior']
      );

      // Generate style variations with reasoning-enhanced context
      const styleVariations = await this.replicate.generateStyleVariations(
        reasoningEnhancedContext,
        ['modern', 'sustainable', 'contemporary']
      );

      // Generate from reasoning with enhanced context
      const reasoningBased = await this.replicate.generateFromReasoning(
        reasoning,
        reasoningEnhancedContext
      );

      return {
        views,
        styleVariations,
        reasoningBased,
        source: 'replicate',
        reasoning: reasoning, // Include reasoning in results for reference
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error('Visualization generation error:', error);
      return {
        views: this.getFallbackViews(),
        styleVariations: this.getFallbackStyleVariations(),
        reasoningBased: this.getFallbackReasoningBased(),
        source: 'fallback',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Generate design alternatives
   */
  async generateDesignAlternatives(projectContext, reasoning) {
    try {
      logger.verbose('Generating design alternatives...');
      
      const approaches = ['sustainable', 'cost_effective', 'innovative', 'traditional'];
      const alternatives = {};

      for (const approach of approaches) {
        try {
          const alternativeReasoning = await this.openai.generateDesignAlternatives(
            projectContext, 
            approach
          );
          
          const alternativeVisualization = await this.replicate.generateArchitecturalImage({
            ...this.buildAlternativeParams(projectContext, approach),
            prompt: this.buildAlternativePrompt(alternativeReasoning, approach)
          });

          alternatives[approach] = {
            reasoning: alternativeReasoning,
            visualization: alternativeVisualization,
            approach
          };
        } catch (error) {
          logger.error(`Error generating ${approach} alternative:`, error);
          alternatives[approach] = {
            error: error.message,
            approach
          };
        }
      }

      return {
        alternatives,
        source: 'ai_integration',
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error('Design alternatives error:', error);
      return {
        alternatives: this.getFallbackAlternatives(),
        source: 'fallback',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Analyze project feasibility
   */
  async analyzeFeasibility(projectContext) {
    try {
      logger.verbose('Analyzing project feasibility...');
      return await this.openai.analyzeFeasibility(projectContext);
    } catch (error) {
      logger.error('Feasibility analysis error:', error);
      return {
        feasibility: 'Medium',
        constraints: ['Detailed analysis unavailable'],
        recommendations: ['Manual feasibility review recommended'],
        source: 'fallback',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Build parameters for alternative approaches
   */
  buildAlternativeParams(projectContext, approach) {
    const baseParams = {
      buildingType: projectContext.buildingProgram || 'building',
      location: projectContext.location?.address || 'urban setting',
      width: 1024,
      height: 768
    };

    switch (approach) {
      case 'sustainable':
        return {
          ...baseParams,
          architecturalStyle: 'sustainable',
          materials: 'recycled and renewable materials',
          prompt: 'Sustainable architectural design, green building, eco-friendly materials, energy efficient, LEED certified, environmental consciousness'
        };

      case 'cost_effective':
        return {
          ...baseParams,
          architecturalStyle: 'cost-effective',
          materials: 'standard construction materials',
          prompt: 'Cost-effective architectural design, value engineering, budget-conscious, efficient construction, practical solutions'
        };

      case 'innovative':
        return {
          ...baseParams,
          architecturalStyle: 'futuristic',
          materials: 'advanced materials and technology',
          prompt: 'Innovative architectural design, cutting-edge technology, smart building, futuristic, advanced materials, digital integration'
        };

      case 'traditional':
        return {
          ...baseParams,
          architecturalStyle: 'traditional',
          materials: 'traditional local materials',
          prompt: 'Traditional architectural design, cultural context, local materials, heritage-inspired, timeless design'
        };

      default:
        return baseParams;
    }
  }

  /**
   * Build prompt for alternative approaches
   */
  buildAlternativePrompt(reasoning, approach) {
    const philosophy = reasoning.designPhilosophy || `${approach} design approach`;
    const materials = this.extractMaterialsFromReasoning(reasoning);
    
    return `Professional architectural visualization, ${approach} design approach: "${philosophy}", using ${materials}, photorealistic rendering, professional architectural photography, high quality, detailed`;
  }

  /**
   * Extract materials from reasoning
   */
  extractMaterialsFromReasoning(reasoning) {
    // Handle both string and object formats for materialRecommendations
    if (typeof reasoning.materialRecommendations === 'object' && reasoning.materialRecommendations.primary) {
      // If we have structured material recommendations, use them
      const primaryMaterials = reasoning.materialRecommendations.primary || [];
      const secondaryMaterials = reasoning.materialRecommendations.secondary || [];
      const allMaterials = [...primaryMaterials, ...secondaryMaterials];

      if (allMaterials.length > 0) {
        // Extract just the material names from detailed descriptions
        const materialNames = allMaterials.map(m => {
          // Extract material name from descriptions like "Concrete - for structural durability"
          const match = m.match(/^([^-,]+)/);
          return match ? match[1].trim().toLowerCase() : m.toLowerCase();
        });
        return materialNames.slice(0, 3).join(' and ');
      }
    }

    // Fallback to string parsing
    const materialText = typeof reasoning.materialRecommendations === 'string'
      ? reasoning.materialRecommendations
      : JSON.stringify(reasoning.materialRecommendations || '');
    const materials = ['glass', 'steel', 'concrete', 'wood', 'stone', 'brick', 'timber', 'metal', 'aluminum'];
    const foundMaterials = materials.filter(material =>
      materialText.toLowerCase().includes(material)
    );

    return foundMaterials.length > 0 ? foundMaterials.slice(0, 3).join(' and ') : 'glass and steel';
  }

  /**
   * Create Master Design Specification (Design DNA)
   * Extracts exact building parameters to ensure consistency across all views
   * @param {Object} projectContext - Project context with location and requirements
   * @param {Object} reasoning - OpenAI design reasoning
   * @param {Object} blendedStyle - Blended style from portfolio + local analysis
   * @returns {Object} Master design specification with exact parameters
   */
  createMasterDesignSpecification(projectContext, reasoning, blendedStyle) {
    logger.verbose('🏗️ Creating Master Design Specification (Design DNA)...');

    // Extract dimensions from project context
    const floorArea = projectContext.floorArea || projectContext.area || 200;
    const floorCount = this.calculateFloorCount(projectContext);
    const buildingProgram = projectContext.buildingProgram || 'residential';
    
    // Calculate building footprint (assume rectangular)
    const aspectRatio = 1.2; // Slightly rectangular
    const length = Math.sqrt(floorArea * aspectRatio);
    const width = floorArea / length;
    const floorHeight = buildingProgram.includes('commercial') ? 3.5 : 3.0;
    const totalHeight = floorCount * floorHeight;

    // Determine entrance position from reasoning or default to north
    const entranceFacade = this.extractEntranceFacade(reasoning) || 'north';
    const entrancePosition = 'centered';
    const entranceWidth = 2.4; // Standard door width

    // Extract materials from blended style (priority over reasoning)
    const materials = this.extractBlendedMaterials(blendedStyle, reasoning);
    
    // Determine roof type from reasoning and building program
    const roofType = this.extractRoofType(reasoning, buildingProgram);
    
    // Extract window pattern from architectural style
    const windowPattern = this.extractWindowPattern(reasoning, blendedStyle);
    
    // Determine structural system based on building type and height
    const structuralSystem = this.determineStructuralSystem(buildingProgram, floorCount);
    
    // Define color scheme based on materials
    const colorScheme = this.defineColorScheme(materials);

    const masterSpec = {
      dimensions: {
        length: Math.round(length * 10) / 10,
        width: Math.round(width * 10) / 10,
        height: Math.round(totalHeight * 10) / 10,
        floors: floorCount,
        floorHeight: floorHeight
      },
      entrance: {
        facade: entranceFacade,
        position: entrancePosition,
        width: entranceWidth
      },
      materials: {
        primary: materials.primary,
        secondary: materials.secondary,
        accent: materials.accent
      },
      roof: {
        type: roofType.type,
        material: roofType.material
      },
      windows: {
        pattern: windowPattern.pattern,
        frameColor: windowPattern.frameColor
      },
      structure: {
        system: structuralSystem.system,
        gridSpacing: structuralSystem.gridSpacing
      },
      colors: {
        facade: colorScheme.facade,
        roof: colorScheme.roof,
        trim: colorScheme.trim
      }
    };

    logger.verbose('✅ Master Design Specification created:', {
      dimensions: `${masterSpec.dimensions.length}m × ${masterSpec.dimensions.width}m × ${masterSpec.dimensions.height}m`,
      entrance: `${masterSpec.entrance.facade} facade`,
      materials: `${masterSpec.materials.primary}, ${masterSpec.materials.secondary}`,
      floors: masterSpec.dimensions.floors
    });

    return masterSpec;
  }

  /**
   * Calculate floor count based on area and building type
   */
  calculateFloorCount(projectContext) {
    const area = projectContext.floorArea || projectContext.area || 200;
    const buildingType = projectContext.buildingProgram || 'house';

    if (buildingType.includes('cottage') || buildingType.includes('bungalow')) {
      return 1;
    }

    if (area < 150) return 1;
    if (area < 300) return 2;
    if (area < 500) return 3;
    return Math.min(Math.ceil(area / 200), 5);
  }

  /**
   * Extract entrance facade from reasoning
   */
  extractEntranceFacade(reasoning) {
    if (reasoning.spatialOrganization && typeof reasoning.spatialOrganization === 'string') {
      const spatial = reasoning.spatialOrganization.toLowerCase();
      if (spatial.includes('north')) return 'north';
      if (spatial.includes('south')) return 'south';
      if (spatial.includes('east')) return 'east';
      if (spatial.includes('west')) return 'west';
    }
    return 'north'; // Default
  }

  /**
   * Extract materials from blended style with fallback to reasoning
   */
  extractBlendedMaterials(blendedStyle, reasoning) {
    if (blendedStyle?.materials && blendedStyle.materials.length >= 3) {
      return {
        primary: blendedStyle.materials[0],
        secondary: blendedStyle.materials[1],
        accent: blendedStyle.materials[2]
      };
    }

    // Fallback to reasoning materials
    const materialText = reasoning.materialRecommendations || '';
    const materials = ['brick', 'glass', 'steel', 'concrete', 'wood', 'stone'];
    const foundMaterials = materials.filter(material => 
      materialText.toLowerCase().includes(material)
    );

    return {
      primary: foundMaterials[0] || 'brick',
      secondary: foundMaterials[1] || 'glass',
      accent: foundMaterials[2] || 'steel'
    };
  }

  /**
   * Extract roof type from reasoning and building program
   */
  extractRoofType(reasoning, buildingProgram) {
    const reasoningText = JSON.stringify(reasoning).toLowerCase();
    
    if (reasoningText.includes('flat roof') || buildingProgram.includes('commercial')) {
      return { type: 'flat', material: 'membrane' };
    }
    if (reasoningText.includes('pitched') || reasoningText.includes('gable')) {
      return { type: 'gable', material: 'slate' };
    }
    if (reasoningText.includes('hip')) {
      return { type: 'hip', material: 'tile' };
    }
    
    return { type: 'flat', material: 'membrane' }; // Default
  }

  /**
   * Extract window pattern from reasoning and style
   */
  extractWindowPattern(reasoning, blendedStyle) {
    const styleName = blendedStyle?.styleName?.toLowerCase() || '';
    
    if (styleName.includes('modern') || styleName.includes('contemporary')) {
      return { pattern: 'ribbon', frameColor: 'black' };
    }
    if (styleName.includes('traditional')) {
      return { pattern: 'punched', frameColor: 'white' };
    }
    
    return { pattern: 'ribbon', frameColor: 'black' }; // Default
  }

  /**
   * Determine structural system based on building type and height
   */
  determineStructuralSystem(buildingProgram, floorCount) {
    if (floorCount <= 2) {
      return { system: 'load_bearing_masonry', gridSpacing: 4 };
    }
    if (floorCount <= 5) {
      return { system: 'concrete_frame', gridSpacing: 6 };
    }
    return { system: 'steel_frame', gridSpacing: 8 };
  }

  /**
   * Define color scheme based on materials
   */
  defineColorScheme(materials) {
    const colorMap = {
      brick: '#B8735C',
      stone: '#8B7355',
      glass: '#87CEEB',
      steel: '#708090',
      concrete: '#A9A9A9',
      wood: '#8B4513'
    };

    return {
      facade: colorMap[materials.primary] || '#B8735C',
      roof: '#2C3E50',
      trim: '#1C1C1C'
    };
  }

  /**
   * CRITICAL FIX: Create reasoning-enhanced context for consistent image generation
   * Extracts specific design parameters from OpenAI reasoning and embeds them into context
   * This ensures ALL Replicate calls use the same architectural framework
   */
  createReasoningEnhancedContext(projectContext, reasoning) {
    logger.verbose('🔧 Creating unified design framework from OpenAI reasoning...');

    // Extract key design parameters from reasoning
    const extractedParams = {
      // Extract design philosophy
      designPhilosophy: reasoning.designPhilosophy || 'contemporary sustainable design',

      // Extract materials from structured or text format
      materials: this.extractMaterialsFromReasoning(reasoning),

      // Extract spatial organization
      spatialOrganization: typeof reasoning.spatialOrganization === 'object'
        ? reasoning.spatialOrganization.strategy || reasoning.spatialOrganization
        : reasoning.spatialOrganization || 'functional open-plan layout',

      // Extract environmental features
      environmentalFeatures: this.extractEnvironmentalFeatures(reasoning),

      // Extract technical solutions
      technicalFeatures: this.extractTechnicalFeatures(reasoning),

      // Extract style rationale if available
      styleApproach: reasoning.styleRationale?.overview || '',

      // Create unified architectural description
      unifiedArchitecturalPrompt: this.createUnifiedArchitecturalPrompt(reasoning, projectContext)
    };

    // Log extracted parameters for debugging
    logger.verbose('📋 Extracted design parameters:', {
      philosophy: extractedParams.designPhilosophy.substring(0, 50) + '...',
      materials: extractedParams.materials,
      spatial: extractedParams.spatialOrganization.substring(0, 50) + '...',
      environmental: extractedParams.environmentalFeatures.substring(0, 50) + '...'
    });

    // Return enhanced context with reasoning embedded
    return {
      ...projectContext,
      // Override basic parameters with reasoning-derived ones
      // CRITICAL FIX: Prioritize blended materials over reasoning-extracted materials
      materials: projectContext.blendedStyle?.materials?.slice(0, 3).join(', ') || extractedParams.materials,
      architecturalStyle: this.extractArchitecturalStyle(reasoning, projectContext),

      // Add new reasoning-derived parameters
      reasoningParams: extractedParams,
      designPhilosophy: extractedParams.designPhilosophy,
      spatialOrganization: extractedParams.spatialOrganization,
      environmentalFeatures: extractedParams.environmentalFeatures,
      technicalFeatures: extractedParams.technicalFeatures,

      // Add unified architectural prompt for ALL image generations
      unifiedArchitecturalPrompt: extractedParams.unifiedArchitecturalPrompt,

      // Flag to indicate reasoning-enhanced context
      isReasoningEnhanced: true,

      // Include full reasoning for reference
      fullReasoning: reasoning
    };
  }

  /**
   * Extract environmental features from reasoning
   */
  extractEnvironmentalFeatures(reasoning) {
    const features = [];

    if (reasoning.environmentalConsiderations) {
      const env = reasoning.environmentalConsiderations;

      // Handle object format
      if (typeof env === 'object') {
        if (env.passiveStrategies) features.push('passive solar design');
        if (env.renewableEnergy) features.push('solar panels');
        if (env.waterManagement) features.push('rainwater harvesting');
      }
      // Handle string format
      else if (typeof env === 'string') {
        if (env.toLowerCase().includes('passive')) features.push('passive cooling');
        if (env.toLowerCase().includes('solar')) features.push('solar orientation');
        if (env.toLowerCase().includes('natural')) features.push('natural ventilation');
      }
    }

    return features.length > 0 ? features.join(', ') : 'sustainable design features';
  }

  /**
   * Extract technical features from reasoning
   */
  extractTechnicalFeatures(reasoning) {
    const features = [];

    if (reasoning.technicalSolutions) {
      const tech = reasoning.technicalSolutions;

      // Handle object format
      if (typeof tech === 'object') {
        if (tech.structural) features.push('efficient structural system');
        if (tech.envelope) features.push('high-performance envelope');
        if (tech.smart) features.push('smart building systems');
      }
      // Handle string format
      else if (typeof tech === 'string') {
        if (tech.toLowerCase().includes('structural')) features.push('optimized structure');
        if (tech.toLowerCase().includes('insulation')) features.push('thermal insulation');
      }
    }

    return features.length > 0 ? features.join(', ') : 'advanced building systems';
  }

  /**
   * Extract architectural style from reasoning and context
   */
  extractArchitecturalStyle(reasoning, projectContext) {
    // Try to extract from style rationale
    if (reasoning.styleRationale?.overview) {
      const styleText = reasoning.styleRationale.overview.toLowerCase();
      if (styleText.includes('modern')) return 'modern';
      if (styleText.includes('contemporary')) return 'contemporary';
      if (styleText.includes('traditional')) return 'traditional';
      if (styleText.includes('sustainable')) return 'sustainable';
    }

    // Try to extract from design philosophy
    if (reasoning.designPhilosophy) {
      const philosophy = reasoning.designPhilosophy.toLowerCase();
      if (philosophy.includes('modern')) return 'modern';
      if (philosophy.includes('contemporary')) return 'contemporary';
      if (philosophy.includes('traditional')) return 'traditional';
    }

    // Fallback to project context or default
    return projectContext.architecturalStyle || 'contemporary';
  }

  /**
   * Create unified architectural prompt that will be injected into ALL image generations
   * This is the KEY to ensuring consistency across all views
   */
  createUnifiedArchitecturalPrompt(reasoning, projectContext = {}) {
    const materials = this.extractMaterialsFromReasoning(reasoning);
    const philosophy = reasoning.designPhilosophy || 'contemporary design';
    const spatial = typeof reasoning.spatialOrganization === 'object'
      ? reasoning.spatialOrganization.strategy || ''
      : reasoning.spatialOrganization || '';
    const environmental = this.extractEnvironmentalFeatures(reasoning);

    // Create a comprehensive architectural description that will guide ALL images
    const unifiedPromptBase = `
      Architectural design following this EXACT specification:
      PHILOSOPHY: ${philosophy}
      MATERIALS: ${materials} facade and construction
      SPATIAL: ${spatial}
      ENVIRONMENTAL: ${environmental}
      STYLE: Contemporary design with clean lines, large windows, flat or low-pitched roof
      CONSISTENCY: All views must show the SAME building with identical materials, colors, and architectural features
    `.trim().replace(/\s+/g, ' ');
    const override = projectContext && projectContext.promptOverride ? ` OVERRIDE: ${projectContext.promptOverride}` : '';
    const unifiedPrompt = `${unifiedPromptBase}${override}`.trim();

    logger.verbose('🏛️ Unified architectural prompt created:', unifiedPrompt.substring(0, 100) + '...');

    return unifiedPrompt;
  }

  /**
   * Get fallback design when services are unavailable
   */
  getFallbackDesign(projectContext) {
    return {
      reasoning: {
        designPhilosophy: 'Contextual and sustainable design approach',
        spatialOrganization: 'Functional and flexible spatial arrangement',
        materialRecommendations: 'Locally sourced, sustainable materials',
        environmentalConsiderations: 'Passive design and renewable energy integration',
        technicalSolutions: 'Efficient structural and MEP systems',
        codeCompliance: 'Full compliance with local regulations',
        costStrategies: 'Value engineering and lifecycle cost optimization',
        futureProofing: 'Adaptable design for future needs',
        isFallback: true
      },
      visualizations: this.getFallbackViews(),
      alternatives: this.getFallbackAlternatives(),
      feasibility: {
        feasibility: 'Medium',
        constraints: ['AI services unavailable'],
        recommendations: ['Manual design review recommended']
      },
      isFallback: true,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get fallback views
   */
  getFallbackViews() {
    return {
      exterior: {
        success: false,
        isFallback: true,
        images: ['https://via.placeholder.com/1024x768/4A90E2/FFFFFF?text=Exterior+View+Placeholder']
      },
      interior: {
        success: false,
        isFallback: true,
        images: ['https://via.placeholder.com/1024x768/7ED321/FFFFFF?text=Interior+View+Placeholder']
      },
      site_plan: {
        success: false,
        isFallback: true,
        images: ['https://via.placeholder.com/1024x1024/9013FE/FFFFFF?text=Site+Plan+Placeholder']
      }
    };
  }

  /**
   * Get fallback style variations
   */
  getFallbackStyleVariations() {
    return {
      modern: {
        success: false,
        isFallback: true,
        images: ['https://via.placeholder.com/1024x768/4A90E2/FFFFFF?text=Modern+Style+Placeholder']
      },
      sustainable: {
        success: false,
        isFallback: true,
        images: ['https://via.placeholder.com/1024x768/7ED321/FFFFFF?text=Sustainable+Style+Placeholder']
      },
      contemporary: {
        success: false,
        isFallback: true,
        images: ['https://via.placeholder.com/1024x768/9013FE/FFFFFF?text=Contemporary+Style+Placeholder']
      }
    };
  }

  /**
   * Get fallback reasoning-based visualization
   */
  getFallbackReasoningBased() {
    return {
      success: false,
      isFallback: true,
      images: ['https://via.placeholder.com/1024x768/F5A623/FFFFFF?text=AI+Reasoning+Based+Placeholder']
    };
  }

  /**
   * Get fallback alternatives
   */
  getFallbackAlternatives() {
    return {
      sustainable: {
        reasoning: { designPhilosophy: 'Sustainable design approach', isFallback: true },
        visualization: { success: false, isFallback: true },
        approach: 'sustainable'
      },
      cost_effective: {
        reasoning: { designPhilosophy: 'Cost-effective design approach', isFallback: true },
        visualization: { success: false, isFallback: true },
        approach: 'cost_effective'
      },
      innovative: {
        reasoning: { designPhilosophy: 'Innovative design approach', isFallback: true },
        visualization: { success: false, isFallback: true },
        approach: 'innovative'
      },
      traditional: {
        reasoning: { designPhilosophy: 'Traditional design approach', isFallback: true },
        visualization: { success: false, isFallback: true },
        approach: 'traditional'
      }
    };
  }

  /**
   * Get fallback floor plan and 3D preview
   */
  getFallbackFloorPlanAnd3D(projectContext) {
    return {
      floorPlan: {
        success: false,
        isFallback: true,
        floorPlan: {
          images: ['https://via.placeholder.com/1024x1024/2C3E50/FFFFFF?text=2D+Floor+Plan+Placeholder'],
          message: 'Using placeholder floor plan - API unavailable'
        },
        type: '2d_floor_plan'
      },
      preview3D: {
        success: false,
        isFallback: true,
        preview3D: {
          images: ['https://via.placeholder.com/1024x768/3498DB/FFFFFF?text=3D+Preview+Placeholder'],
          message: 'Using placeholder 3D preview - API unavailable'
        },
        type: '3d_preview'
      },
      styleDetection: null,
      reasoning: this.getFallbackReasoning(projectContext),
      isFallback: true,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get fallback style-optimized design
   */
  getFallbackStyleOptimized(projectContext) {
    return {
      styleDetection: {
        primaryStyle: { style: 'Contemporary', confidence: 'Medium' },
        designElements: { materials: 'Glass, steel, concrete' },
        isFallback: true
      },
      compatibilityAnalysis: {
        compatibilityScore: '7/10',
        isFallback: true
      },
      reasoning: this.getFallbackReasoning(projectContext),
      visualizations: this.getFallbackVisualizations(),
      isFallback: true,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get fallback reasoning
   */
  getFallbackReasoning(projectContext) {
    return {
      designPhilosophy: 'Contextual and sustainable design approach',
      spatialOrganization: 'Functional and flexible spatial arrangement',
      materialRecommendations: 'Locally sourced, sustainable materials',
      environmentalConsiderations: 'Passive design and renewable energy integration',
      technicalSolutions: 'Efficient structural and MEP systems',
      codeCompliance: 'Full compliance with local regulations',
      costStrategies: 'Value engineering and lifecycle cost optimization',
      futureProofing: 'Adaptable design for future needs',
      isFallback: true,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get fallback visualizations
   */
  getFallbackVisualizations() {
    return {
      floorPlan: {
        success: false,
        isFallback: true,
        images: ['https://via.placeholder.com/1024x1024/2C3E50/FFFFFF?text=Floor+Plan+Placeholder']
      },
      preview3D: {
        success: false,
        isFallback: true,
        images: ['https://via.placeholder.com/1024x768/3498DB/FFFFFF?text=3D+Preview+Placeholder']
      },
      styleVariations: {
        contemporary: {
          success: false,
          isFallback: true,
          images: ['https://via.placeholder.com/1024x768/4A90E2/FFFFFF?text=Contemporary+Style+Placeholder']
        },
        sustainable: {
          success: false,
          isFallback: true,
          images: ['https://via.placeholder.com/1024x768/7ED321/FFFFFF?text=Sustainable+Style+Placeholder']
        },
        innovative: {
          success: false,
          isFallback: true,
          images: ['https://via.placeholder.com/1024x768/9013FE/FFFFFF?text=Innovative+Style+Placeholder']
        }
      },
      isFallback: true,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Generate 2D floor plan and 3D preview with style detection
   * ENHANCED: Generate reasoning FIRST to guide all image generation
   */
  async generateFloorPlanAnd3DPreview(projectContext, portfolioImages = []) {
    try {
      logger.verbose('Starting comprehensive architectural generation with OpenAI reasoning guidance...');

      // STEP 1: Use projectSeed from context (generated once in frontend)
      const projectSeed = projectContext.projectSeed || Math.floor(Math.random() * 1000000);
      const enhancedContext = { ...projectContext, seed: projectSeed };

      logger.verbose(`🎲 Using unified project seed: ${projectSeed} for ALL outputs (2D plans, elevations, sections, 3D views)`);

      // Step 1: Detect architectural style from portfolio if provided
      let styleDetection = null;
      if (portfolioImages && portfolioImages.length > 0) {
        styleDetection = await this.portfolioStyleDetection.detectArchitecturalStyle(
          portfolioImages,
          projectContext.location
        );
      }

      // CRITICAL FIX: Generate design reasoning FIRST to guide all subsequent generation
      logger.verbose('🧠 Generating OpenAI design reasoning to create unified architectural framework...');
      const reasoning = await this.generateDesignReasoningWithStyle(
        enhancedContext,
        styleDetection
      );

      // Create reasoning-enhanced context for ALL subsequent generations
      const reasoningEnhancedContext = this.createReasoningEnhancedContext(enhancedContext, reasoning);

      // Step 2: Generate multi-level floor plans with reasoning guidance
      logger.verbose('🏗️ Generating multi-level floor plans guided by OpenAI reasoning...');
      const floorPlans = await this.replicate.generateMultiLevelFloorPlans(reasoningEnhancedContext);

      // STEP 2: Capture ground floor plan image URL for use as ControlNet control
      let floorPlanControlImage = null;
      if (floorPlans?.floorPlans?.ground?.images && floorPlans.floorPlans.ground.images.length > 0) {
        floorPlanControlImage = floorPlans.floorPlans.ground.images[0];
        logger.verbose('🎯 Captured ground floor plan for ControlNet:', floorPlanControlImage?.substring(0, 50) + '...');
      }

      // Step 3: Generate elevations and sections with reasoning guidance
      logger.verbose('🏗️ Generating all elevations (N,S,E,W) and sections with OpenAI reasoning guidance...');
      const technicalDrawings = await this.replicate.generateElevationsAndSections(
        reasoningEnhancedContext,  // Use reasoning-enhanced context
        true, // Generate all drawings (4 elevations + 2 sections)
        null // No ControlNet - elevations/sections must be independent 2D orthographic projections
      );

      // Step 4: Generate 3D views with reasoning guidance for consistency
      logger.verbose('🏗️ Generating 3D photorealistic views with OpenAI reasoning guidance for consistency...');
      const views = await this.replicate.generateMultipleViews(
        reasoningEnhancedContext,  // Use reasoning-enhanced context
        ['exterior_front', 'exterior_side', 'interior', 'axonometric', 'perspective'],
        null // Removed ControlNet - 3D views need photorealistic perspective freedom, not constrained by 2D floor plan
      );

      return {
        success: true,
        floorPlans,
        technicalDrawings,
        visualizations: { views }, // Wrap views in visualizations object
        styleDetection,
        reasoning,
        projectContext: enhancedContext,
        projectSeed,
        timestamp: new Date().toISOString(),
        workflow: 'comprehensive_architectural_generation'
      };

    } catch (error) {
      logger.error('Floor plan and 3D preview generation error:', error);
      return {
        success: false,
        error: error.message,
        fallback: this.getFallbackFloorPlanAnd3D(projectContext)
      };
    }
  }

  /**
   * STEP 3 & 4: Integrated design generation with location analysis and style blending
   * Orchestrates location analysis, portfolio detection, and coordinated 2D/3D generation
   * ENHANCED: Generate reasoning FIRST to guide all image generation
   * @param {Object} projectContext - Project context with all specifications
   * @param {Array} portfolioImages - Optional portfolio images for style detection
   * @param {Number} materialWeight - Material blend weight (0-1): 0=all local, 1=all portfolio, 0.5=balanced
   * @param {Number} characteristicWeight - Characteristic blend weight (0-1): 0=all local, 1=all portfolio, 0.5=balanced
   */
  async generateIntegratedDesign(projectContext, portfolioImages = [], materialWeight = 0.5, characteristicWeight = 0.5) {
    try {
      logger.verbose('🎯 Starting integrated design generation workflow with OpenAI reasoning guidance...');
      logger.verbose('⚖️  Material weight:', materialWeight, `(${Math.round((1-materialWeight)*100)}% local / ${Math.round(materialWeight*100)}% portfolio)`);
      logger.verbose('⚖️  Characteristic weight:', characteristicWeight, `(${Math.round((1-characteristicWeight)*100)}% local / ${Math.round(characteristicWeight*100)}% portfolio)`);

      // STEP 3.1: Location analysis
      logger.verbose('📍 Step 1: Analyzing location and architectural context...');
      const locationAnalysis = locationIntelligence.recommendArchitecturalStyle(
        projectContext.location,
        projectContext.climateData || { type: 'temperate' }
      );

      // Store location analysis in projectContext
      const enhancedContext = {
        ...projectContext,
        locationAnalysis: locationAnalysis
      };

      logger.verbose('✅ Location analysis complete:', {
        primary: locationAnalysis.primary,
        materials: locationAnalysis.materials?.slice(0, 3),
        climateAdaptations: locationAnalysis.climateAdaptations?.features?.slice(0, 3)
      });

      // STEP 3.2: Optional portfolio style detection
      let portfolioStyle = null;
      if (portfolioImages && portfolioImages.length > 0) {
        logger.verbose('🎨 Step 2: Detecting portfolio style from', portfolioImages.length, 'images...');
        portfolioStyle = await this.portfolioStyleDetection.detectArchitecturalStyle(
          portfolioImages,
          projectContext.location
        );
        enhancedContext.portfolioStyle = portfolioStyle;
        logger.verbose('✅ Portfolio style detected:', portfolioStyle?.primaryStyle?.style);
      } else {
        logger.verbose('⏭️  Step 2: Skipping portfolio analysis (no images provided)');
      }

      // STEP 4: Blended style creation with granular weighted merging
      logger.verbose('🎨 Step 3: Creating blended style with separate material and characteristic weights');
      const blendedStyle = this.createBlendedStylePrompt(enhancedContext, locationAnalysis, portfolioStyle, materialWeight, characteristicWeight);
      enhancedContext.blendedStyle = blendedStyle;
      enhancedContext.blendedPrompt = blendedStyle.description; // Keep backward compatibility

      // STEP 4: Apply blended style to architectural context
      enhancedContext.architecturalStyle = blendedStyle.styleName;
      enhancedContext.materials = blendedStyle.materials.slice(0, 3).join(', ') || projectContext.materials;

      logger.verbose('✅ Blended style created:', blendedStyle.styleName);

      // STEP 3.4: Use unified seed from projectContext
      const projectSeed = projectContext.projectSeed || Math.floor(Math.random() * 1000000);
      enhancedContext.seed = projectSeed;
      logger.verbose('🎲 Using unified seed:', projectSeed);

      // CRITICAL FIX: Generate design reasoning FIRST with blended style context
      logger.verbose('🧠 Step 4: Generating OpenAI design reasoning to create unified architectural framework...');
      const reasoning = await this.openai.generateDesignReasoning(enhancedContext);

      // STEP 4.1: Create Master Design Specification (Design DNA) for consistency
      logger.verbose('🏗️ Step 4.1: Creating Master Design Specification (Design DNA)...');
      const masterDesignSpec = this.createMasterDesignSpecification(enhancedContext, reasoning, blendedStyle);
      enhancedContext.masterDesignSpec = masterDesignSpec;

      // Create reasoning-enhanced context that will be used for ALL image generation
      const reasoningEnhancedContext = this.createReasoningEnhancedContext(enhancedContext, reasoning);
      logger.verbose('✅ Unified design framework created from OpenAI reasoning with Master Design Spec');

      // STEP 3.5: Generate multi-level floor plans with reasoning guidance
      logger.verbose('🏗️ Step 5: Generating multi-level floor plans with OpenAI reasoning guidance...');
      const floorPlans = await this.replicate.generateMultiLevelFloorPlans(reasoningEnhancedContext);

      // Capture ground floor plan image for ControlNet
      let floorPlanImage = null;
      if (floorPlans?.floorPlans?.ground?.images && floorPlans.floorPlans.ground.images.length > 0) {
        floorPlanImage = floorPlans.floorPlans.ground.images[0];
        logger.verbose('✅ Ground floor plan generated, captured for ControlNet control');
      }

      // STEP 3.6: Generate elevations and sections with reasoning guidance
      logger.verbose('🏗️ Step 6: Generating all elevations and sections with OpenAI reasoning guidance...');
      const technicalDrawings = await this.replicate.generateElevationsAndSections(
        reasoningEnhancedContext,  // Use reasoning-enhanced context for consistency
        true, // generateAllDrawings - generate all 4 elevations + 2 sections
        null // No ControlNet - elevations/sections must be independent 2D orthographic projections
      );
      logger.verbose('✅ All technical drawings generated with unified design framework');

      // STEP 3.6.5: Skip dimensioning annotation (causing errors with undefined BIM model)
      // TODO: Fix dimensioning service to work with image URLs instead of BIM models
      logger.verbose('⏭️  Skipping dimension annotation (not yet compatible with image-based workflow)');
      // The generated elevations and sections will be displayed without additional annotations

      // STEP 3.7: Generate multiple 3D views with reasoning guidance for consistency
      logger.verbose('🏗️ Step 7: Generating 3D photorealistic views with OpenAI reasoning guidance...');
      // Generate photorealistic views with reasoning guidance for consistency
      // CRITICAL FIX: Include axonometric in main generation to ensure it's always created
      const views = await this.replicate.generateMultipleViews(
        reasoningEnhancedContext,  // Use reasoning-enhanced context for consistency
        ['exterior_front', 'exterior_side', 'interior', 'axonometric', 'perspective'],
        null // NO ControlNet - prevents 2D floor plan from overriding 3D perspective prompts
      );
      logger.verbose('✅ Photorealistic 3D views generated with unified design framework (including axonometric)');

      // STEP 3: Combine all results in single object
      const combinedResults = {
        floorPlans: floorPlans,
        technicalDrawings: technicalDrawings,
        views: views,
        metadata: {
          floorPlansSuccess: floorPlans?.success !== false,
          technicalDrawingsSuccess: technicalDrawings?.success !== false,
          viewsSuccess: Object.keys(views || {}).length > 0,
          floorPlanCount: floorPlans?.floorCount || 1,
          viewCount: Object.keys(views || {}).length
        }
      };

      logger.verbose('✅ Combined results:', {
        floorPlans: combinedResults.metadata.floorPlansSuccess ? 'Success' : 'Failed',
        technicalDrawings: combinedResults.metadata.technicalDrawingsSuccess ? 'Success' : 'Failed',
        views: combinedResults.metadata.viewsSuccess ? 'Success' : 'Failed',
        floorPlanCount: combinedResults.metadata.floorPlanCount,
        viewCount: combinedResults.metadata.viewCount
      });

      // STEP 3.8: Generate parametric BIM model with reasoning guidance
      logger.verbose('🏗️ Step 8: Generating parametric BIM model with OpenAI reasoning guidance...');
      let bimModel = null;
      let bimAxonometric = null;
      let axonometricSource = 'none';

      try {
        // Extract floor plan geometry to synchronize BIM with AI-generated plans
        const floorPlanGeometry = this.extractFloorPlanGeometry(floorPlans);

        // Use reasoning-enhanced context for BIM generation
        bimModel = await this.bim.generateParametricModel({
          ...reasoningEnhancedContext,  // Use reasoning-enhanced context
          style: blendedStyle.styleName,
          materials: blendedStyle.materials,
          characteristics: blendedStyle.characteristics,
          floorPlan: floorPlans,
          floorPlanGeometry: floorPlanGeometry, // NEW: Pass AI-generated geometry to BIM
          elevations: technicalDrawings
        });
        logger.verbose('✅ BIM model generated with unified design framework');

        // STEP 3.9: Derive geometrically accurate axonometric view from BIM
        logger.verbose('🏗️ Deriving axonometric view from BIM model...');
        try {
          bimAxonometric = this.bim.deriveAxonometric(bimModel, {
            angle: 30,
            scale: 1.0,
            showGrid: true,
            showDimensions: true
          });
          axonometricSource = 'bim';
          logger.verbose('✅ Axonometric view derived from BIM (geometrically consistent)');
        } catch (axonometricError) {
          logger.error('⚠️ BIM axonometric derivation failed:', axonometricError.message);
          logger.verbose('↩️  Falling back to Replicate for axonometric view WITH ControlNet...');
          // Fallback: Generate axonometric using Replicate WITH floor plan ControlNet if BIM fails
          try {
            const fallbackAxonometric = await this.replicate.generateMultipleViews(
              enhancedContext,
              ['axonometric'],
              floorPlanImage // Enforce geometric consistency with floor plan
            );
            if (fallbackAxonometric?.axonometric?.images?.[0]) {
              bimAxonometric = fallbackAxonometric.axonometric.images[0];
              axonometricSource = 'replicate_fallback';
              logger.verbose('✅ Axonometric generated from Replicate fallback with ControlNet guidance');
              logger.warn('⚠️ Using Replicate fallback axonometric - may not be fully consistent with BIM geometry');
            }
          } catch (fallbackError) {
            logger.error('⚠️ Replicate axonometric fallback also failed:', fallbackError.message);
            axonometricSource = 'failed';
          }
        }
      } catch (bimError) {
        logger.error('⚠️ BIM generation failed:', bimError.message);
        logger.verbose('↩️  Falling back to Replicate for axonometric view WITH ControlNet...');
        // Fallback: Generate axonometric using Replicate WITH floor plan ControlNet if entire BIM generation fails
        try {
          const fallbackAxonometric = await this.replicate.generateMultipleViews(
            enhancedContext,
            ['axonometric'],
            floorPlanImage // Enforce geometric consistency with floor plan
          );
          if (fallbackAxonometric?.axonometric?.images?.[0]) {
            bimAxonometric = fallbackAxonometric.axonometric.images[0];
            axonometricSource = 'replicate_fallback';
            logger.verbose('✅ Axonometric generated from Replicate fallback (BIM unavailable) with ControlNet guidance');
            logger.warn('⚠️ Using Replicate fallback axonometric - may not be fully consistent with BIM geometry');
          }
        } catch (fallbackError) {
          logger.error('⚠️ All axonometric generation methods failed:', fallbackError.message);
          axonometricSource = 'failed';
        }
      }

      // STEP 3.10: Generate construction documentation (always enabled)
      logger.verbose('🏗️ Step 9: Generating construction documentation (structural + MEP)...');
      let constructionDocumentation = null;
      try {
        constructionDocumentation = await this.generateConstructionDocumentation(
          reasoningEnhancedContext,  // Use reasoning-enhanced context for consistency
          floorPlanImage
        );
        logger.verbose('✅ Construction documentation generated');
      } catch (constructionError) {
        logger.error('⚠️ Construction documentation generation failed:', constructionError.message);
        constructionDocumentation = {
          success: false,
          error: constructionError.message,
          note: 'Construction documentation unavailable - continuing with base design'
        };
      }

      // Calculate overall blend weight for backward compatibility
      const overallBlendWeight = (materialWeight + characteristicWeight) / 2;

      // Return integrated results with all visualizations and blended style
      return {
        success: true,
        reasoning,  // CRITICAL: Include OpenAI reasoning that guided all generation
        locationAnalysis,
        portfolioStyle,
        blendedStyle, // STEP 4: Full blended style object
        blendedPrompt: blendedStyle.description, // Keep backward compatibility
        blendWeight: overallBlendWeight, // STEP 4: Store the overall blend weight (average of material and characteristic weights)
        materialWeight, // NEW: Store individual material weight
        characteristicWeight, // NEW: Store individual characteristic weight
        results: combinedResults, // Combined floor plans + technical drawings + 3D views
        floorPlans: floorPlans, // Also keep individual results for compatibility
        technicalDrawings: technicalDrawings,
        visualizations: {
          views, // Photorealistic 3D views
          axonometric: bimAxonometric, // BIM-derived geometrically accurate axonometric or Replicate fallback
          axonometricSource // NEW: Track source ('bim', 'replicate_fallback', 'failed', 'none')
        },
        bimModel, // NEW: Include parametric BIM model in results
        bimAxonometric, // NEW: Geometrically consistent axonometric from BIM or fallback
        axonometricSource, // NEW: Source metadata for axonometric generation
        constructionDocumentation, // NEW: Construction drawings and engineering notes (if requested)
        projectSeed,
        enhancedContext: reasoningEnhancedContext,  // Return the reasoning-enhanced context
        timestamp: new Date().toISOString(),
        workflow: 'integrated_design_generation'
      };

    } catch (error) {
      logger.error('❌ Integrated design generation error:', error);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * STEP 4: Blend local and portfolio styles with weighted merging
   * Merges style descriptors based on separate material and characteristic weights
   * @param {Object} localStyle - Location-based architectural style
   * @param {Object} portfolioStyle - Portfolio-detected style
   * @param {Number} materialWeight - Material blend weight (0 = all local, 1 = all portfolio, 0.5 = balanced)
   * @param {Number} characteristicWeight - Characteristic blend weight (0 = all local, 1 = all portfolio, 0.5 = balanced)
   * @returns {Object} Blended style with merged characteristics
   */
  blendStyles(localStyle, portfolioStyle, materialWeight = 0.5, characteristicWeight = 0.5) {
    // Validate weights are between 0 and 1
    const matWeight = Math.max(0, Math.min(1, materialWeight));
    const charWeight = Math.max(0, Math.min(1, characteristicWeight));
    const localMatWeight = 1 - matWeight;
    const localCharWeight = 1 - charWeight;

    logger.verbose(`🎨 Blending styles with:`);
    logger.verbose(`   Materials: ${Math.round(localMatWeight * 100)}% local / ${Math.round(matWeight * 100)}% portfolio`);
    logger.verbose(`   Characteristics: ${Math.round(localCharWeight * 100)}% local / ${Math.round(charWeight * 100)}% portfolio`);

    // Extract local style descriptors
    const localDescriptors = {
      primary: localStyle?.primary || 'contemporary',
      materials: localStyle?.materials || [],
      characteristics: localStyle?.characteristics || [],
      climateAdaptations: localStyle?.climateAdaptations?.features || []
    };

    // Extract portfolio style descriptors
    const portfolioDescriptors = {
      primary: portfolioStyle?.primaryStyle?.style || null,
      materials: portfolioStyle?.materials || [],
      characteristics: portfolioStyle?.designElements || [],
      features: portfolioStyle?.keyFeatures || []
    };

    // If no portfolio style, return local style
    if (!portfolioDescriptors.primary) {
      return {
        styleName: localDescriptors.primary,
        materials: localDescriptors.materials,
        characteristics: localDescriptors.characteristics,
        climateAdaptations: localDescriptors.climateAdaptations,
        blendRatio: {
          local: 1.0,
          portfolio: 0.0,
          materials: { local: 1.0, portfolio: 0.0 },
          characteristics: { local: 1.0, portfolio: 0.0 }
        },
        description: `${localDescriptors.primary} style adapted for local context`
      };
    }

    // FIX 1: Short circuit when both weights are zero (100% local)
    if (matWeight === 0 && charWeight === 0) {
      logger.verbose('🏛️ Pure local design requested (0% portfolio influence)');
      const materialList = localDescriptors.materials.slice(0, 3).join(', ') || 'local materials';
      const charList = localDescriptors.characteristics.slice(0, 4).join(', ') || 'traditional characteristics';
      return {
        styleName: localDescriptors.primary,
        materials: localDescriptors.materials,
        characteristics: localDescriptors.characteristics,
        climateAdaptations: localDescriptors.climateAdaptations,
        blendRatio: {
          local: 1.0,
          portfolio: 0.0,
          materials: { local: 1.0, portfolio: 0.0 },
          characteristics: { local: 1.0, portfolio: 0.0 }
        },
        localStyle: localDescriptors.primary,
        portfolioStyle: null,
        description: `${localDescriptors.primary} architectural style using local materials (${materialList}) and traditional characteristics (${charList}), fully rooted in regional context`
      };
    }

    // Blend materials (weighted selection based on materialWeight)
    const materialCount = Math.max(3, Math.round(5 * (localMatWeight + matWeight)));
    const localMaterialCount = Math.round(materialCount * localMatWeight);
    const portfolioMaterialCount = materialCount - localMaterialCount;

    const blendedMaterials = [
      ...localDescriptors.materials.slice(0, localMaterialCount),
      ...portfolioDescriptors.materials.slice(0, portfolioMaterialCount)
    ];

    // Blend characteristics (weighted selection based on characteristicWeight)
    const charCount = Math.max(3, Math.round(6 * (localCharWeight + charWeight)));
    const localCharCount = Math.round(charCount * localCharWeight);
    const portfolioCharCount = charCount - localCharCount;

    const blendedCharacteristics = [
      ...localDescriptors.characteristics.slice(0, localCharCount),
      ...(portfolioDescriptors.characteristics.slice
        ? portfolioDescriptors.characteristics.slice(0, portfolioCharCount)
        : []),
      ...(portfolioDescriptors.features.slice
        ? portfolioDescriptors.features.slice(0, Math.max(0, portfolioCharCount - 1))
        : [])
    ];

    // Calculate overall blend weight (average of material and characteristic weights)
    const overallWeight = (matWeight + charWeight) / 2;

    // FIX 2: Create blended style name based on overall dominance with threshold for pure local
    let blendedStyleName;
    if (overallWeight <= 0.05) {
      // Pure local (threshold for rounding errors and very small weights)
      blendedStyleName = localDescriptors.primary;
      logger.verbose('🏛️ Style name: Pure local (no portfolio influences)');
    } else if (overallWeight < 0.3) {
      // Local dominant
      blendedStyleName = `${localDescriptors.primary} with subtle ${portfolioDescriptors.primary} influences`;
    } else if (overallWeight < 0.7) {
      // Balanced
      blendedStyleName = `Hybrid ${portfolioDescriptors.primary}–${localDescriptors.primary}`;
    } else {
      // Portfolio dominant
      blendedStyleName = `${portfolioDescriptors.primary} adapted to ${localDescriptors.primary} context`;
    }

    // Create detailed description
    const description = this.createBlendedDescription(
      localDescriptors,
      portfolioDescriptors,
      blendedMaterials,
      blendedCharacteristics,
      overallWeight,
      { material: matWeight, characteristic: charWeight }
    );

    return {
      styleName: blendedStyleName,
      materials: blendedMaterials,
      characteristics: blendedCharacteristics,
      climateAdaptations: localDescriptors.climateAdaptations, // Always preserve climate adaptations
      blendRatio: {
        local: 1 - overallWeight,
        portfolio: overallWeight,
        materials: { local: localMatWeight, portfolio: matWeight },
        characteristics: { local: localCharWeight, portfolio: charWeight }
      },
      localStyle: localDescriptors.primary,
      portfolioStyle: portfolioDescriptors.primary,
      description
    };
  }

  /**
   * STEP 4: Create detailed blended style description for prompts
   * Enhanced to reflect granular material and characteristic weights
   */
  createBlendedDescription(localDesc, portfolioDesc, materials, characteristics, weight, weights) {
    const materialList = materials.slice(0, 3).join(', ') || 'contemporary materials';
    const charList = characteristics.slice(0, 4).join(', ') || 'modern features';

    // Create nuanced description based on material and characteristic weights
    const matWeightPct = Math.round((weights?.material || 0.5) * 100);
    const charWeightPct = Math.round((weights?.characteristic || 0.5) * 100);

    // FIX 3: Handle pure local case (0% portfolio)
    if (matWeightPct === 0 && charWeightPct === 0) {
      logger.verbose('🏛️ Description: Pure local (no portfolio references)');
      return `${localDesc.primary} architectural style using local materials (${materialList}) and traditional characteristics (${charList}), fully rooted in regional context`;
    }

    if (weight <= 0.05) {
      // Near-zero portfolio influence (handles small rounding errors)
      logger.verbose('🏛️ Description: Essentially pure local (minimal portfolio influence)');
      return `${localDesc.primary} architectural style using local materials (${materialList}) and traditional characteristics (${charList}), fully rooted in regional context`;
    }

    if (weight < 0.3) {
      // Local dominant
      const materialNote = matWeightPct < 30 ? 'local' : matWeightPct > 70 ? 'contemporary' : 'mixed';
      const charNote = charWeightPct < 30 ? 'traditional' : charWeightPct > 70 ? 'modern' : 'hybrid';
      return `${localDesc.primary} architectural style with subtle ${portfolioDesc.primary} influences, featuring ${materialNote} materials (${materialList}), incorporating ${charNote} characteristics (${charList}), while maintaining strong local architectural context`;
    } else if (weight < 0.7) {
      // Balanced
      return `Balanced fusion of ${portfolioDesc.primary} and ${localDesc.primary} styles, utilizing ${materialList} (${100-matWeightPct}% local/${matWeightPct}% portfolio materials), characterized by ${charList} (${100-charWeightPct}% local/${charWeightPct}% portfolio spatial features), creating a contemporary hybrid design that respects both traditions`;
    } else {
      // Portfolio dominant
      const materialNote = matWeightPct > 70 ? 'signature' : matWeightPct < 30 ? 'locally-sourced' : 'blended';
      const charNote = charWeightPct > 70 ? 'distinctive' : charWeightPct < 30 ? 'contextual' : 'integrated';
      return `${portfolioDesc.primary} architectural approach adapted for local context, expressed through ${materialNote} materials (${materialList}), featuring ${charNote} spatial characteristics (${charList}), thoughtfully respecting regional architectural traditions`;
    }
  }

  /**
   * STEP 4: Create blended style prompt for generation
   * Uses blendStyles function with granular weighted merging
   */
  createBlendedStylePrompt(projectContext, locationAnalysis, portfolioStyle, materialWeight = 0.5, characteristicWeight = 0.5) {
    // STEP 4: Use sophisticated style blending with separate weights
    const blendedStyle = this.blendStyles(locationAnalysis, portfolioStyle, materialWeight, characteristicWeight);

    logger.verbose('🎨 Blended style created:', {
      name: blendedStyle.styleName,
      overallRatio: `${Math.round(blendedStyle.blendRatio.local * 100)}% local / ${Math.round(blendedStyle.blendRatio.portfolio * 100)}% portfolio`,
      materialRatio: `${Math.round(blendedStyle.blendRatio.materials.local * 100)}% local / ${Math.round(blendedStyle.blendRatio.materials.portfolio * 100)}% portfolio`,
      characteristicRatio: `${Math.round(blendedStyle.blendRatio.characteristics.local * 100)}% local / ${Math.round(blendedStyle.blendRatio.characteristics.portfolio * 100)}% portfolio`,
      materials: blendedStyle.materials.slice(0, 3).join(', '),
      characteristics: blendedStyle.characteristics.slice(0, 3).join(', ')
    });

    // Return comprehensive blended style object
    return blendedStyle;
  }

  /**
   * Generate design reasoning with style detection context
   */
  async generateDesignReasoningWithStyle(projectContext, styleDetection) {
    try {
      // Enhance project context with style detection
      const enhancedContext = {
        ...projectContext,
        detectedStyle: styleDetection?.primaryStyle?.style || 'contemporary',
        styleCharacteristics: styleDetection?.designElements || {},
        styleRecommendations: styleDetection?.recommendations || {}
      };

      return await this.openai.generateDesignReasoning(enhancedContext);
    } catch (error) {
      logger.error('Style-enhanced reasoning error:', error);
      return this.getFallbackReasoning(projectContext);
    }
  }

  /**
   * Analyze portfolio and generate style-optimized design
   */
  async generateStyleOptimizedDesign(projectContext, portfolioImages) {
    try {
      logger.verbose('Starting style-optimized design generation...');
      
      // Step 1: Analyze portfolio for style detection
      const styleDetection = await this.portfolioStyleDetection.detectArchitecturalStyle(
        portfolioImages, 
        projectContext.location
      );

      // Step 2: Analyze style-location compatibility
      const compatibilityAnalysis = await this.portfolioStyleDetection.analyzeLocationStyleCompatibility(
        styleDetection,
        projectContext.location
      );

      // Step 3: Generate enhanced project context with style information
      const enhancedContext = this.buildEnhancedProjectContext(
        projectContext, 
        styleDetection, 
        compatibilityAnalysis
      );

      // Step 4: Generate design reasoning with style optimization
      const reasoning = await this.generateDesignReasoningWithStyle(enhancedContext, styleDetection);
      
      // Step 5: Generate visualizations optimized for detected style
      const visualizations = await this.generateStyleOptimizedVisualizations(
        enhancedContext, 
        styleDetection
      );

      return {
        success: true,
        styleDetection,
        compatibilityAnalysis,
        reasoning,
        visualizations,
        enhancedContext,
        timestamp: new Date().toISOString(),
        workflow: 'style_optimized'
      };

    } catch (error) {
      logger.error('Style-optimized design error:', error);
      return {
        success: false,
        error: error.message,
        fallback: this.getFallbackStyleOptimized(projectContext)
      };
    }
  }

  /**
   * Build enhanced project context with style information
   */
  buildEnhancedProjectContext(projectContext, styleDetection, compatibilityAnalysis) {
    return {
      ...projectContext,
      architecturalStyle: styleDetection?.primaryStyle?.style || 'contemporary',
      styleCharacteristics: styleDetection?.designElements || {},
      styleRecommendations: styleDetection?.recommendations || {},
      compatibilityScore: compatibilityAnalysis?.compatibilityScore || '7/10',
      recommendedAdaptations: compatibilityAnalysis?.recommendedAdaptations || [],
      materials: this.extractMaterialsFromStyle(styleDetection),
      designApproach: this.buildDesignApproachFromStyle(styleDetection)
    };
  }

  /**
   * Extract materials from style detection
   */
  extractMaterialsFromStyle(styleDetection) {
    if (!styleDetection?.designElements?.materials) {
      return 'glass and steel';
    }
    
    const materials = styleDetection.designElements.materials;
    const materialList = materials.split(',').map(m => m.trim());
    return materialList.slice(0, 3).join(' and '); // Take first 3 materials
  }

  /**
   * Build design approach from style detection
   */
  buildDesignApproachFromStyle(styleDetection) {
    const style = styleDetection?.primaryStyle?.style || 'contemporary';
    const characteristics = styleDetection?.designElements?.spatialOrganization || '';
    
    return `${style} design approach with ${characteristics}`;
  }

  /**
   * Generate style-optimized visualizations
   */
  async generateStyleOptimizedVisualizations(enhancedContext, styleDetection) {
    try {
      const style = styleDetection?.primaryStyle?.style || 'contemporary';
      const materials = this.extractMaterialsFromStyle(styleDetection);

      const styledContext = {
        ...enhancedContext,
        architecturalStyle: style,
        materials
      };

      // Generate multi-level floor plans with style optimization
      logger.verbose('🏗️ Generating style-optimized multi-level floor plans...');
      const floorPlans = await this.replicate.generateMultiLevelFloorPlans(styledContext);

      // Generate elevations and sections with style optimization
      logger.verbose('🏗️ Generating style-optimized elevations and sections...');
      const technicalDrawings = await this.replicate.generateElevationsAndSections(styledContext);

      // Generate 3D views (2 exterior + 1 interior) with style optimization
      logger.verbose('🏗️ Generating style-optimized 3D views: exterior_front, exterior_side, interior');
      const views = await this.replicate.generateMultipleViews(
        styledContext,
        ['exterior_front', 'exterior_side', 'interior']
      );

      // Generate additional style variations
      const styleVariations = await this.replicate.generateStyleVariations(
        styledContext,
        [style, 'sustainable', 'innovative']
      );

      return {
        floorPlans,
        technicalDrawings,
        views, // Changed from preview3D to views
        styleVariations,
        source: 'style_optimized',
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error('Style-optimized visualization error:', error);
      return this.getFallbackVisualizations();
    }
  }

  /**
   * Quick design generation for MVP testing
   */
  async quickDesign(projectContext) {
    try {
      logger.verbose('Starting quick design generation...');
      
      // Generate basic reasoning
      const reasoning = await this.openai.generateDesignReasoning(projectContext);
      
      // Generate single exterior view
      const visualization = await this.replicate.generateArchitecturalImage({
        ...this.buildViewParameters(projectContext, 'exterior'),
        prompt: this.buildQuickPrompt(reasoning, projectContext)
      });

      return {
        success: true,
        reasoning,
        visualization,
        projectContext,
        timestamp: new Date().toISOString(),
        workflow: 'quick'
      };

    } catch (error) {
      logger.error('Quick design error:', error);
      return {
        success: false,
        error: error.message,
        fallback: this.getFallbackDesign(projectContext)
      };
    }
  }

  /**
   * Build view parameters for quick generation
   */
  buildViewParameters(projectContext, viewType) {
    return {
      buildingType: projectContext.buildingProgram || 'commercial building',
      architecturalStyle: projectContext.architecturalStyle || 'contemporary',
      location: projectContext.location?.address || 'urban setting',
      materials: projectContext.materials || 'glass and steel',
      viewType,
      width: 1024,
      height: 768
    };
  }

  /**
   * Build quick prompt for MVP
   */
  buildQuickPrompt(reasoning, projectContext) {
    const philosophy = reasoning.designPhilosophy || 'contemporary design';
    const materials = this.extractMaterialsFromReasoning(reasoning);

    return `Professional architectural visualization, ${philosophy}, ${projectContext.buildingProgram || 'building'} with ${materials}, photorealistic rendering, professional architectural photography, high quality, detailed`;
  }

  /**
   * Extract floor plan geometry from AI-generated floor plans
   * This allows BIM to synchronize with AI-generated layouts
   * @param {Object} floorPlans - AI-generated floor plans from Replicate
   * @returns {Object} Extracted geometry information
   */
  extractFloorPlanGeometry(floorPlans) {
    try {
      // Extract geometry metadata from AI-generated floor plans
      const geometry = {
        extracted: true,
        source: 'ai_generated_floor_plans',
        floorCount: floorPlans?.floorCount || 1,
        // Note: AI-generated floor plans are images, not parametric geometry
        // BIM will use the area and program to generate matching dimensions
        note: 'BIM will derive dimensions from project context to match AI floor plan scale'
      };

      logger.verbose('📐 Extracted floor plan geometry:', geometry);

      return geometry;
    } catch (error) {
      logger.error('⚠️ Floor plan geometry extraction failed:', error.message);
      return { extracted: false, source: 'fallback' };
    }
  }

  /**
   * Generate comprehensive construction documentation
   * Includes detail drawings, structural plans, MEP plans, and engineering notes
   * @param {Object} projectContext - Enhanced project context with blended style
   * @param {String} controlImage - Optional control image for ControlNet (floor plan)
   * @returns {Promise<Object>} Construction documentation with drawings and notes
   */
  async generateConstructionDocumentation(projectContext, controlImage = null) {
    try {
      logger.verbose('📋 Starting comprehensive construction documentation generation...');

      const results = {
        success: true,
        detailDrawings: null,
        structuralPlans: null,
        mepPlans: null,
        structuralNotes: [],
        mepNotes: [],
        timestamp: new Date().toISOString()
      };

      // Determine scale from project context (default to 1:20)
      const detailScale = projectContext.detailScale || 20;
      const floorCount = projectContext.floors || 1;

      // STEP 1: Generate construction detail drawings at specified scale
      logger.verbose(`🔍 Generating construction detail drawings at 1:${detailScale} scale...`);
      try {
        results.detailDrawings = await this.replicate.generateConstructionDetails(
          projectContext,
          detailScale
        );
        logger.verbose(`✅ Detail drawings generated (${results.detailDrawings?.details?.length || 0} floors)`);
      } catch (detailError) {
        logger.error('⚠️ Detail drawing generation failed:', detailError.message);
        results.detailDrawings = { success: false, error: detailError.message };
      }

      // STEP 2: Generate structural plans (foundation + all floors)
      logger.verbose('🏗️ Generating structural plans for foundation and all floors...');
      try {
        results.structuralPlans = await this.replicate.generateStructuralPlans(
          projectContext,
          controlImage
        );
        logger.verbose(`✅ Structural plans generated (${results.structuralPlans?.plans?.length || 0} levels)`);
      } catch (structuralError) {
        logger.error('⚠️ Structural plan generation failed:', structuralError.message);
        results.structuralPlans = { success: false, error: structuralError.message };
      }

      // STEP 3: Generate MEP plans (all systems: HVAC, electrical, plumbing, combined)
      logger.verbose('⚡ Generating MEP plans (HVAC, electrical, plumbing, combined)...');
      try {
        // Generate combined MEP plans for all floors
        results.mepPlans = await this.replicate.generateMEPPlans(
          projectContext,
          'combined', // Generate combined MEP system layout
          controlImage
        );
        logger.verbose(`✅ MEP plans generated (${results.mepPlans?.plans?.length || 0} floors)`);
      } catch (mepError) {
        logger.error('⚠️ MEP plan generation failed:', mepError.message);
        results.mepPlans = { success: false, error: mepError.message };
      }

      // STEP 4: Generate structural engineering notes for all floors
      logger.verbose('📝 Generating structural engineering notes with code compliance and calculations...');
      try {
        for (let floorIndex = 0; floorIndex < floorCount; floorIndex++) {
          const structuralNotes = await this.openai.generateStructuralNotes(
            projectContext,
            floorIndex
          );
          results.structuralNotes.push({
            floor: floorIndex,
            floorName: floorIndex === 0 ? 'Foundation' : `Floor ${floorIndex}`,
            notes: structuralNotes
          });
        }
        logger.verbose(`✅ Structural notes generated for ${results.structuralNotes.length} levels`);
      } catch (structuralNotesError) {
        logger.error('⚠️ Structural notes generation failed:', structuralNotesError.message);
        results.structuralNotes = [{ error: structuralNotesError.message, isFallback: true }];
      }

      // STEP 5: Generate MEP engineering notes for all floors
      logger.verbose('📝 Generating MEP engineering notes with equipment specs and code compliance...');
      try {
        for (let floorIndex = 0; floorIndex < floorCount; floorIndex++) {
          const mepNotes = await this.openai.generateMEPNotes(
            projectContext,
            floorIndex,
            'combined' // Generate notes for combined MEP systems
          );
          results.mepNotes.push({
            floor: floorIndex,
            floorName: floorIndex === 0 ? 'Ground Floor' : `Floor ${floorIndex}`,
            notes: mepNotes
          });
        }
        logger.verbose(`✅ MEP notes generated for ${results.mepNotes.length} floors`);
      } catch (mepNotesError) {
        logger.error('⚠️ MEP notes generation failed:', mepNotesError.message);
        results.mepNotes = [{ error: mepNotesError.message, isFallback: true }];
      }

      // Determine overall success
      results.success =
        (results.detailDrawings?.success !== false) ||
        (results.structuralPlans?.success !== false) ||
        (results.mepPlans?.success !== false) ||
        (results.structuralNotes.length > 0 && !results.structuralNotes[0]?.isFallback) ||
        (results.mepNotes.length > 0 && !results.mepNotes[0]?.isFallback);

      logger.verbose('✅ Construction documentation generation complete:', {
        detailDrawings: results.detailDrawings?.success !== false ? 'Success' : 'Failed',
        structuralPlans: results.structuralPlans?.success !== false ? 'Success' : 'Failed',
        mepPlans: results.mepPlans?.success !== false ? 'Success' : 'Failed',
        structuralNotes: results.structuralNotes.length > 0 && !results.structuralNotes[0]?.isFallback ? 'Success' : 'Failed',
        mepNotes: results.mepNotes.length > 0 && !results.mepNotes[0]?.isFallback ? 'Success' : 'Failed'
      });

      return results;

    } catch (error) {
      logger.error('❌ Construction documentation generation failed:', error);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

const aiIntegrationService = new AIIntegrationService();
export default aiIntegrationService;
