/**
 * AI Integration Service
 * Combines OpenAI reasoning with Replicate generation for complete AI-powered architectural workflow
 */

import openaiService from './openaiService';
import replicateService from './replicateService';
import portfolioStyleDetection from './portfolioStyleDetection';

class AIIntegrationService {
  constructor() {
    this.openai = openaiService;
    this.replicate = replicateService;
    this.portfolioStyleDetection = portfolioStyleDetection;
  }

  /**
   * Complete AI-powered architectural design workflow
   * @param {Object} projectContext - Complete project information
   * @returns {Promise<Object>} Combined reasoning and generation results
   */
  async generateCompleteDesign(projectContext) {
    try {
      console.log('Starting complete AI design workflow...');
      
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
      console.error('Complete design workflow error:', error);
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

      // Generate multiple views: 2 exterior + 1 interior
      const views = await this.replicate.generateMultipleViews(
        projectContext,
        ['exterior_front', 'exterior_side', 'interior']
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
      console.log('Starting comprehensive architectural generation...');

      // Generate consistent seed for the entire project
      const projectSeed = Math.floor(Math.random() * 1000000);
      const enhancedContext = { ...projectContext, seed: projectSeed };

      console.log(`🎲 Using project seed: ${projectSeed} for consistent 2D/3D generation`);

      // Step 1: Detect architectural style from portfolio if provided
      let styleDetection = null;
      if (portfolioImages && portfolioImages.length > 0) {
        styleDetection = await this.portfolioStyleDetection.detectArchitecturalStyle(
          portfolioImages,
          projectContext.location
        );
      }

      // Step 2: Generate multi-level floor plans (ground, upper if needed, roof)
      console.log('🏗️ Generating multi-level floor plans...');
      const floorPlans = await this.replicate.generateMultiLevelFloorPlans(enhancedContext);

      // Step 3: Generate elevations and sections
      console.log('🏗️ Generating elevations (N,S,E,W) and sections (longitudinal, cross)...');
      const technicalDrawings = await this.replicate.generateElevationsAndSections(enhancedContext);

      // Step 4: Generate 3D views (2 exterior + 1 interior) - with same seed
      console.log('🏗️ Generating 3D views: exterior_front, exterior_side, interior');
      const views = await this.replicate.generateMultipleViews(
        enhancedContext,
        ['exterior_front', 'exterior_side', 'interior']
      );

      // Step 5: Generate design reasoning with style context
      const reasoning = await this.generateDesignReasoningWithStyle(
        projectContext,
        styleDetection
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

      const styledContext = {
        ...enhancedContext,
        architecturalStyle: style,
        materials
      };

      // Generate multi-level floor plans with style optimization
      console.log('🏗️ Generating style-optimized multi-level floor plans...');
      const floorPlans = await this.replicate.generateMultiLevelFloorPlans(styledContext);

      // Generate elevations and sections with style optimization
      console.log('🏗️ Generating style-optimized elevations and sections...');
      const technicalDrawings = await this.replicate.generateElevationsAndSections(styledContext);

      // Generate 3D views (2 exterior + 1 interior) with style optimization
      console.log('🏗️ Generating style-optimized 3D views: exterior_front, exterior_side, interior');
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
