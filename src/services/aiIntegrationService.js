/**
 * AI Integration Service
 * Combines OpenAI reasoning with Replicate generation for complete AI-powered architectural workflow
 */

import openaiService from './openaiService';
import replicateService from './replicateService';
import portfolioStyleDetection from './portfolioStyleDetection';
import solarOrientationService from './solarOrientationService';
import buildingProgramService from './buildingProgramService';
import materialSelectionService from './materialSelectionService';

class AIIntegrationService {
  constructor() {
    this.openai = openaiService;
    this.replicate = replicateService;
    this.portfolioStyleDetection = portfolioStyleDetection;
    this.solarOrientation = solarOrientationService;
    this.buildingProgram = buildingProgramService;
    this.materialSelection = materialSelectionService;
  }

  /**
   * Enhanced AI-powered architectural design workflow with site analysis
   * @param {Object} projectContext - Complete project information
   * @returns {Promise<Object>} Combined reasoning and generation results
   */
  async generateCompleteDesign(projectContext) {
    try {
      console.log('Starting enhanced AI design workflow...');
      const startTime = Date.now();

      // Step 1: Site context gathering and analysis
      console.log('Step 1: Analyzing site context...');
      const siteAnalysis = await this.analyzeSiteContext(projectContext);

      // Step 2: Calculate solar orientation and passive design strategy
      console.log('Step 2: Calculating solar orientation...');
      const solarAnalysis = this.solarOrientation.calculateOptimalOrientation(
        projectContext.location?.coordinates?.lat || 0,
        projectContext.location?.coordinates?.lng || 0,
        projectContext.location?.climate,
        projectContext.entranceDirection
      );

      // Step 3: Determine building program and massing
      console.log('Step 3: Calculating building program...');
      const buildingProgram = this.buildingProgram.calculateBuildingProgram(
        projectContext.buildingType || projectContext.buildingProgram,
        projectContext.siteArea || 1000,
        projectContext.location?.zoning,
        projectContext.location
      );

      // Step 4: Material selection with thermal mass analysis
      console.log('Step 4: Selecting materials...');
      const materialAnalysis = this.materialSelection.recommendMaterials(
        projectContext.location?.climate,
        projectContext.location,
        projectContext.buildingType || projectContext.buildingProgram,
        solarAnalysis
      );

      // Step 5: Build enhanced project context with all analysis
      const enhancedContext = {
        ...projectContext,
        siteAnalysis,
        solarOrientation: solarAnalysis,
        buildingProgram: buildingProgram,
        materials: materialAnalysis.primaryMaterials,
        materialAnalysis,
        roomProgram: buildingProgram.roomProgram,
        stories: buildingProgram.massing?.stories?.recommended || 2,
        structuralSystem: buildingProgram.structuralConsiderations?.primarySystem
      };

      // Step 6: Generate comprehensive design reasoning
      console.log('Step 5: Generating AI design reasoning...');
      const reasoning = await this.generateEnhancedDesignReasoning(enhancedContext);

      // Step 7: Generate complete architectural outputs
      console.log('Step 6: Generating architectural visualizations...');
      const outputs = await this.generateComprehensiveOutputs(enhancedContext, reasoning);

      // Step 8: Generate design alternatives
      console.log('Step 7: Generating design alternatives...');
      const alternatives = await this.generateDesignAlternatives(enhancedContext, reasoning);

      // Step 9: Analyze feasibility with enhanced context
      console.log('Step 8: Analyzing project feasibility...');
      const feasibility = await this.analyzeFeasibility(enhancedContext);

      const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`Complete design workflow finished in ${elapsedTime}s`);

      return {
        success: true,
        siteAnalysis,
        solarOrientation: solarAnalysis,
        buildingProgram,
        materialAnalysis,
        reasoning,
        outputs,
        alternatives,
        feasibility,
        enhancedContext,
        elapsedTime: `${elapsedTime}s`,
        timestamp: new Date().toISOString(),
        workflow: 'enhanced-complete'
      };

    } catch (error) {
      console.error('Complete design workflow error:', error);
      return {
        success: false,
        error: error.message,
        fallback: this.getFallbackDesign(projectContext)
      };
    }
  }

  /**
   * Analyze site context (placeholder for future deep-learning integration)
   */
  async analyzeSiteContext(projectContext) {
    // Future: Integrate Street View imagery analysis and satellite image processing
    // For now, return basic context from location data
    return {
      location: projectContext.location?.address || 'Unknown location',
      coordinates: projectContext.location?.coordinates,
      climate: projectContext.location?.climate?.type || 'Temperate',
      zoning: projectContext.location?.zoning?.type || 'Mixed use',
      localStyles: projectContext.location?.localStyles || [],
      note: 'Site context from location intelligence service'
    };
  }

  /**
   * Generate enhanced design reasoning with all analysis integrated
   */
  async generateEnhancedDesignReasoning(enhancedContext) {
    try {
      console.log('Generating enhanced design reasoning with site analysis...');

      // Build comprehensive context for OpenAI
      const reasoningContext = {
        ...enhancedContext,
        siteContext: enhancedContext.siteAnalysis,
        passiveSolarStrategy: enhancedContext.solarOrientation?.recommendations || [],
        optimalOrientation: enhancedContext.solarOrientation?.optimalOrientation?.primaryOrientation?.direction,
        thermalMassStrategy: enhancedContext.materialAnalysis?.thermalMassAnalysis?.requirement,
        recommendedMaterials: this.extractMaterialSummary(enhancedContext.materialAnalysis),
        buildingMassing: {
          stories: enhancedContext.stories,
          floorArea: enhancedContext.buildingProgram?.massing?.floorAreas?.totalGrossArea,
          footprint: enhancedContext.buildingProgram?.massing?.footprint
        },
        roomProgram: enhancedContext.roomProgram
      };

      const reasoning = await this.openai.generateDesignReasoning(reasoningContext);

      return {
        ...reasoning,
        siteIntegration: this.generateSiteIntegrationNarrative(enhancedContext),
        passiveSolarDesign: this.generatePassiveSolarNarrative(enhancedContext.solarOrientation),
        materialStrategy: this.generateMaterialNarrative(enhancedContext.materialAnalysis),
        spatialProgram: this.generateSpatialProgramNarrative(enhancedContext.buildingProgram),
        source: 'enhanced-openai',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Enhanced design reasoning error:', error);
      return this.getFallbackReasoning(enhancedContext);
    }
  }

  /**
   * Generate comprehensive architectural outputs (2D and 3D)
   */
  async generateComprehensiveOutputs(enhancedContext, reasoning) {
    try {
      const outputs = {};

      // Generate 2D floor plans
      console.log('Generating 2D floor plans...');
      outputs.floorPlans = await this.replicate.generateFloorPlan(enhancedContext);

      // Generate 2D sections
      console.log('Generating 2D sections...');
      outputs.sections = await this.replicate.generateSection(enhancedContext);

      // Generate 4 elevations
      console.log('Generating 4 elevations...');
      outputs.elevations = await this.replicate.generateElevations(enhancedContext);

      // Generate 3D exterior views (4 views)
      console.log('Generating 3D exterior views...');
      outputs.exteriorViews = await this.replicate.generate3DExteriorViews(enhancedContext);

      // Generate 3D interior views (2 views)
      console.log('Generating 3D interior views...');
      outputs.interiorViews = await this.replicate.generate3DInteriorViews(enhancedContext);

      return {
        ...outputs,
        summary: {
          floorPlans: outputs.floorPlans?.success ? 'Generated' : 'Fallback',
          sections: outputs.sections?.success ? 'Generated' : 'Fallback',
          elevations: outputs.elevations?.success ? 'Generated' : 'Fallback',
          exteriorViews: outputs.exteriorViews?.success ? 'Generated' : 'Fallback',
          interiorViews: outputs.interiorViews?.success ? 'Generated' : 'Fallback'
        },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Comprehensive outputs generation error:', error);
      return {
        error: error.message,
        fallback: true
      };
    }
  }

  /**
   * Extract material summary for reasoning context
   */
  extractMaterialSummary(materialAnalysis) {
    if (!materialAnalysis) return 'Contemporary materials';

    const structural = materialAnalysis.primaryMaterials?.structural?.primary || '';
    const envelope = materialAnalysis.primaryMaterials?.envelope?.walls || '';
    const thermalMass = materialAnalysis.thermalMassAnalysis?.requirement || 'Medium';

    return `${structural}, ${envelope}, ${thermalMass} thermal mass`;
  }

  /**
   * Generate site integration narrative
   */
  generateSiteIntegrationNarrative(enhancedContext) {
    const { siteAnalysis, location } = enhancedContext;

    return `The design responds to the ${location?.climate?.type || 'local'} climate and ${location?.zoning?.type || 'mixed-use'} zoning context. Site analysis reveals ${siteAnalysis?.note || 'contextual opportunities'} that inform the architectural approach. The building integrates with local architectural character while introducing contemporary sustainable design principles.`;
  }

  /**
   * Generate passive solar design narrative
   */
  generatePassiveSolarNarrative(solarOrientation) {
    if (!solarOrientation) return 'Standard solar orientation principles applied.';

    const orientation = solarOrientation.optimalOrientation?.primaryOrientation?.direction || 'South';
    const savings = solarOrientation.energySavingsEstimate?.annualSavings || '15-20%';

    return `Building oriented with primary facade facing ${orientation} for optimal passive solar performance. This orientation, combined with calculated roof overhangs and strategic glazing placement, is projected to achieve ${savings} annual energy savings. ${solarOrientation.optimalOrientation?.reasoning || ''}`;
  }

  /**
   * Generate material strategy narrative
   */
  generateMaterialNarrative(materialAnalysis) {
    if (!materialAnalysis) return 'Contemporary sustainable materials specified.';

    const thermalMass = materialAnalysis.thermalMassAnalysis?.requirement || 'Medium';
    const benefit = materialAnalysis.thermalMassAnalysis?.performanceBenefit || 'Thermal comfort and energy efficiency';

    return `Material strategy employs ${thermalMass.toLowerCase()} thermal mass construction: ${benefit} Primary structural system uses ${materialAnalysis.primaryMaterials?.structural?.primary || 'contemporary materials'} with ${materialAnalysis.primaryMaterials?.envelope?.walls || 'high-performance envelope'}.`;
  }

  /**
   * Generate spatial program narrative
   */
  generateSpatialProgramNarrative(buildingProgram) {
    if (!buildingProgram) return 'Efficient spatial organization.';

    const stories = buildingProgram.massing?.stories?.recommended || 2;
    const area = buildingProgram.massing?.floorAreas?.totalGrossArea || 0;
    const efficiency = buildingProgram.efficiency?.netToGrossRatio || 80;

    return `${stories}-story configuration provides ${area}m² total gross area with ${efficiency}% net-to-gross efficiency. ${buildingProgram.massing?.stories?.reasoning || ''} Spatial organization balances functional requirements with circulation efficiency and code compliance.`;
  }

  /**
   * Generate design reasoning using OpenAI
   */
  async generateDesignReasoning(projectContext) {
    try {
      console.log('Generating design reasoning...');
      const reasoning = await this.openai.generateDesignReasoning(projectContext);
      
      return {
        ...reasoning,
        source: 'openai',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Design reasoning error:', error);
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
   */
  async generateVisualizations(projectContext, reasoning) {
    try {
      console.log('Generating architectural visualizations...');
      
      // Generate multiple views
      const views = await this.replicate.generateMultipleViews(
        projectContext, 
        ['exterior', 'interior', 'site_plan']
      );
      
      // Generate style variations
      const styleVariations = await this.replicate.generateStyleVariations(
        projectContext,
        ['modern', 'sustainable', 'contemporary']
      );
      
      // Generate from reasoning
      const reasoningBased = await this.replicate.generateFromReasoning(
        reasoning, 
        projectContext
      );

      return {
        views,
        styleVariations,
        reasoningBased,
        source: 'replicate',
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('Visualization generation error:', error);
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
      console.log('Generating design alternatives...');
      
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
          console.error(`Error generating ${approach} alternative:`, error);
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
      console.error('Design alternatives error:', error);
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
      console.log('Analyzing project feasibility...');
      return await this.openai.analyzeFeasibility(projectContext);
    } catch (error) {
      console.error('Feasibility analysis error:', error);
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
    const materialText = reasoning.materialRecommendations || '';
    const materials = ['glass', 'steel', 'concrete', 'wood', 'stone', 'brick'];
    const foundMaterials = materials.filter(material => 
      materialText.toLowerCase().includes(material)
    );
    
    return foundMaterials.length > 0 ? foundMaterials.join(' and ') : 'glass and steel';
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
   */
  async generateFloorPlanAnd3DPreview(projectContext, portfolioImages = []) {
    try {
      console.log('Starting floor plan and 3D preview generation...');
      
      // Step 1: Detect architectural style from portfolio if provided
      let styleDetection = null;
      if (portfolioImages && portfolioImages.length > 0) {
        styleDetection = await this.portfolioStyleDetection.detectArchitecturalStyle(
          portfolioImages, 
          projectContext.location
        );
      }

      // Step 2: Generate 2D floor plan
      const floorPlan = await this.replicate.generateFloorPlan(projectContext);
      
      // Step 3: Generate 3D preview
      const preview3D = await this.replicate.generate3DPreview(projectContext);
      
      // Step 4: Generate design reasoning with style context
      const reasoning = await this.generateDesignReasoningWithStyle(
        projectContext, 
        styleDetection
      );

      return {
        success: true,
        floorPlan,
        preview3D,
        styleDetection,
        reasoning,
        projectContext,
        timestamp: new Date().toISOString(),
        workflow: 'floor_plan_3d_preview'
      };

    } catch (error) {
      console.error('Floor plan and 3D preview generation error:', error);
      return {
        success: false,
        error: error.message,
        fallback: this.getFallbackFloorPlanAnd3D(projectContext)
      };
    }
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
      console.error('Style-enhanced reasoning error:', error);
      return this.getFallbackReasoning(projectContext);
    }
  }

  /**
   * Analyze portfolio and generate style-optimized design
   */
  async generateStyleOptimizedDesign(projectContext, portfolioImages) {
    try {
      console.log('Starting style-optimized design generation...');
      
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
      console.error('Style-optimized design error:', error);
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
      
      // Generate floor plan with style optimization
      const floorPlan = await this.replicate.generateFloorPlan({
        ...enhancedContext,
        architecturalStyle: style,
        materials
      });
      
      // Generate 3D preview with style optimization
      const preview3D = await this.replicate.generate3DPreview({
        ...enhancedContext,
        architecturalStyle: style,
        materials
      });

      // Generate additional style variations
      const styleVariations = await this.replicate.generateStyleVariations(
        enhancedContext,
        [style, 'sustainable', 'innovative']
      );

      return {
        floorPlan,
        preview3D,
        styleVariations,
        source: 'style_optimized',
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('Style-optimized visualization error:', error);
      return this.getFallbackVisualizations();
    }
  }

  /**
   * Quick design generation for MVP testing
   */
  async quickDesign(projectContext) {
    try {
      console.log('Starting quick design generation...');
      
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
      console.error('Quick design error:', error);
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
}

export default new AIIntegrationService();
