/**
 * AI Integration Service
 * Combines OpenAI reasoning with Replicate generation for complete AI-powered architectural workflow
 */

import openaiService from './openaiService';
import replicateService from './replicateService';
import portfolioStyleDetection from './portfolioStyleDetection';
import { locationIntelligence } from './locationIntelligence';

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

      // STEP 1: Use projectSeed from context (generated once in frontend)
      const projectSeed = projectContext.projectSeed || Math.floor(Math.random() * 1000000);
      const enhancedContext = { ...projectContext, seed: projectSeed };

      console.log(`🎲 Using unified project seed: ${projectSeed} for ALL outputs (2D plans, elevations, sections, 3D views)`);

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

      // STEP 2: Capture ground floor plan image URL for use as ControlNet control
      let floorPlanControlImage = null;
      if (floorPlans?.floorPlans?.ground?.images && floorPlans.floorPlans.ground.images.length > 0) {
        floorPlanControlImage = floorPlans.floorPlans.ground.images[0];
        console.log('🎯 Captured ground floor plan for ControlNet:', floorPlanControlImage?.substring(0, 50) + '...');
      }

      // Step 3: Generate elevations and sections (all 4 elevations + 2 sections)
      console.log('🏗️ Generating all elevations (N,S,E,W) and sections (longitudinal, cross)...');
      const technicalDrawings = await this.replicate.generateElevationsAndSections(
        enhancedContext,
        true, // Generate all drawings (4 elevations + 2 sections)
        floorPlanControlImage // Use floor plan as ControlNet control
      );

      // Step 4: Generate 3D views (2 exterior + 1 interior + axonometric + perspective) - STEP 2: Pass floor plan as control image
      console.log('🏗️ Generating 3D views: exterior_front, exterior_side, interior, axonometric, perspective');
      const views = await this.replicate.generateMultipleViews(
        enhancedContext,
        ['exterior_front', 'exterior_side', 'interior', 'axonometric', 'perspective'],
        floorPlanControlImage // STEP 2: Pass floor plan as ControlNet control
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
   * STEP 3 & 4: Integrated design generation with location analysis and style blending
   * Orchestrates location analysis, portfolio detection, and coordinated 2D/3D generation
   * @param {Object} projectContext - Project context with all specifications
   * @param {Array} portfolioImages - Optional portfolio images for style detection
   * @param {Number} blendWeight - Style blend weight (0-1): 0=all local, 1=all portfolio, 0.5=balanced
   */
  async generateIntegratedDesign(projectContext, portfolioImages = [], blendWeight = 0.5) {
    try {
      console.log('🎯 Starting integrated design generation workflow...');
      console.log('⚖️  Blend weight:', blendWeight, `(${Math.round((1-blendWeight)*100)}% local / ${Math.round(blendWeight*100)}% portfolio)`);

      // STEP 3.1: Location analysis
      console.log('📍 Step 1: Analyzing location and architectural context...');
      const locationAnalysis = locationIntelligence.recommendArchitecturalStyle(
        projectContext.location,
        projectContext.climateData || { type: 'temperate' }
      );

      // Store location analysis in projectContext
      const enhancedContext = {
        ...projectContext,
        locationAnalysis: locationAnalysis
      };

      console.log('✅ Location analysis complete:', {
        primary: locationAnalysis.primary,
        materials: locationAnalysis.materials?.slice(0, 3),
        climateAdaptations: locationAnalysis.climateAdaptations?.features?.slice(0, 3)
      });

      // STEP 3.2: Optional portfolio style detection
      let portfolioStyle = null;
      if (portfolioImages && portfolioImages.length > 0) {
        console.log('🎨 Step 2: Detecting portfolio style from', portfolioImages.length, 'images...');
        portfolioStyle = await this.portfolioStyleDetection.detectArchitecturalStyle(
          portfolioImages,
          projectContext.location
        );
        enhancedContext.portfolioStyle = portfolioStyle;
        console.log('✅ Portfolio style detected:', portfolioStyle?.primaryStyle?.style);
      } else {
        console.log('⏭️  Step 2: Skipping portfolio analysis (no images provided)');
      }

      // STEP 4: Blended style creation with weighted merging
      console.log('🎨 Step 3: Creating blended style with weight', blendWeight);
      const blendedStyle = this.createBlendedStylePrompt(enhancedContext, locationAnalysis, portfolioStyle, blendWeight);
      enhancedContext.blendedStyle = blendedStyle;
      enhancedContext.blendedPrompt = blendedStyle.description; // Keep backward compatibility

      // STEP 4: Apply blended style to architectural context
      enhancedContext.architecturalStyle = blendedStyle.styleName;
      enhancedContext.materials = blendedStyle.materials.slice(0, 3).join(', ') || projectContext.materials;

      console.log('✅ Blended style created:', blendedStyle.styleName);

      // STEP 3.4: Use unified seed from projectContext
      const projectSeed = projectContext.projectSeed || Math.floor(Math.random() * 1000000);
      enhancedContext.seed = projectSeed;
      console.log('🎲 Using unified seed:', projectSeed);

      // STEP 3.5: Generate multi-level floor plans with unified seed and blended prompt
      console.log('🏗️ Step 4: Generating multi-level floor plans with blended style...');
      const floorPlans = await this.replicate.generateMultiLevelFloorPlans(enhancedContext);

      // Capture ground floor plan image for ControlNet
      let floorPlanImage = null;
      if (floorPlans?.floorPlans?.ground?.images && floorPlans.floorPlans.ground.images.length > 0) {
        floorPlanImage = floorPlans.floorPlans.ground.images[0];
        console.log('✅ Ground floor plan generated, captured for ControlNet control');
      }

      // STEP 3.6: Generate elevations and sections with floor plan as control (all 4 elevations + 2 sections)
      console.log('🏗️ Step 5: Generating all elevations (N,S,E,W) and sections (longitudinal, cross) with floor plan as control...');
      const technicalDrawings = await this.replicate.generateElevationsAndSections(
        enhancedContext,
        true, // generateAllDrawings - generate all 4 elevations + 2 sections
        floorPlanImage // Use floor plan as ControlNet control for consistency
      );
      console.log('✅ All technical drawings generated with ControlNet guidance');

      // STEP 3.7: Generate multiple 3D views WITHOUT ControlNet (photorealistic perspective views)
      console.log('🏗️ Step 6: Generating 3D photorealistic views (exterior front, side, interior, axonometric, perspective)...');
      const views = await this.replicate.generateMultipleViews(
        enhancedContext,
        ['exterior_front', 'exterior_side', 'interior', 'axonometric', 'perspective'],
        null // Do NOT use floor plan control for 3D views - they need perspective freedom
      );
      console.log('✅ 3D views generated as photorealistic perspectives');

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

      console.log('✅ Combined results:', {
        floorPlans: combinedResults.metadata.floorPlansSuccess ? 'Success' : 'Failed',
        technicalDrawings: combinedResults.metadata.technicalDrawingsSuccess ? 'Success' : 'Failed',
        views: combinedResults.metadata.viewsSuccess ? 'Success' : 'Failed',
        floorPlanCount: combinedResults.metadata.floorPlanCount,
        viewCount: combinedResults.metadata.viewCount
      });

      // Return integrated results with all visualizations and blended style
      return {
        success: true,
        locationAnalysis,
        portfolioStyle,
        blendedStyle, // STEP 4: Full blended style object
        blendedPrompt: blendedStyle.description, // Keep backward compatibility
        blendWeight, // STEP 4: Store the blend weight used
        results: combinedResults, // Combined floor plans + technical drawings + 3D views
        floorPlans: floorPlans, // Also keep individual results for compatibility
        technicalDrawings: technicalDrawings,
        visualizations: { views }, // For compatibility with existing extraction
        projectSeed,
        enhancedContext,
        timestamp: new Date().toISOString(),
        workflow: 'integrated_design_generation'
      };

    } catch (error) {
      console.error('❌ Integrated design generation error:', error);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * STEP 4: Blend local and portfolio styles with weighted merging
   * Merges style descriptors based on numeric weight (0-1)
   * @param {Object} localStyle - Location-based architectural style
   * @param {Object} portfolioStyle - Portfolio-detected style
   * @param {Number} weight - Blend weight (0 = all local, 1 = all portfolio, 0.5 = balanced)
   * @returns {Object} Blended style with merged characteristics
   */
  blendStyles(localStyle, portfolioStyle, weight = 0.5) {
    // Validate weight is between 0 and 1
    const blendWeight = Math.max(0, Math.min(1, weight));
    const localWeight = 1 - blendWeight;

    console.log(`🎨 Blending styles with ${Math.round(localWeight * 100)}% local / ${Math.round(blendWeight * 100)}% portfolio`);

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
        blendRatio: { local: 1.0, portfolio: 0.0 },
        description: `${localDescriptors.primary} style adapted for local context`
      };
    }

    // Blend materials (weighted selection)
    const materialCount = Math.max(3, Math.round(5 * (localWeight + blendWeight)));
    const localMaterialCount = Math.round(materialCount * localWeight);
    const portfolioMaterialCount = materialCount - localMaterialCount;

    const blendedMaterials = [
      ...localDescriptors.materials.slice(0, localMaterialCount),
      ...portfolioDescriptors.materials.slice(0, portfolioMaterialCount)
    ];

    // Blend characteristics (weighted selection)
    const charCount = Math.max(3, Math.round(6 * (localWeight + blendWeight)));
    const localCharCount = Math.round(charCount * localWeight);
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

    // Create blended style name
    let blendedStyleName;
    if (blendWeight < 0.3) {
      blendedStyleName = `${localDescriptors.primary} with ${portfolioDescriptors.primary} influences`;
    } else if (blendWeight < 0.7) {
      blendedStyleName = `Hybrid ${portfolioDescriptors.primary}-${localDescriptors.primary}`;
    } else {
      blendedStyleName = `${portfolioDescriptors.primary} adapted to ${localDescriptors.primary} context`;
    }

    // Create detailed description
    const description = this.createBlendedDescription(
      localDescriptors,
      portfolioDescriptors,
      blendedMaterials,
      blendedCharacteristics,
      blendWeight
    );

    return {
      styleName: blendedStyleName,
      materials: blendedMaterials,
      characteristics: blendedCharacteristics,
      climateAdaptations: localDescriptors.climateAdaptations, // Always preserve climate adaptations
      blendRatio: { local: localWeight, portfolio: blendWeight },
      localStyle: localDescriptors.primary,
      portfolioStyle: portfolioDescriptors.primary,
      description
    };
  }

  /**
   * STEP 4: Create detailed blended style description for prompts
   */
  createBlendedDescription(localDesc, portfolioDesc, materials, characteristics, weight) {
    const materialList = materials.slice(0, 3).join(', ') || 'contemporary materials';
    const charList = characteristics.slice(0, 4).join(', ') || 'modern features';

    if (weight < 0.3) {
      return `${localDesc.primary} architectural style with subtle ${portfolioDesc.primary} influences, featuring ${materialList}, incorporating ${charList}, while maintaining local architectural context`;
    } else if (weight < 0.7) {
      return `Balanced fusion of ${portfolioDesc.primary} and ${localDesc.primary} styles, utilizing ${materialList}, characterized by ${charList}, creating a contemporary hybrid design`;
    } else {
      return `${portfolioDesc.primary} architectural approach adapted for local context, expressed through ${materialList}, featuring ${charList}, respecting regional architectural traditions`;
    }
  }

  /**
   * STEP 4: Create blended style prompt for generation
   * Uses blendStyles function with weighted merging
   */
  createBlendedStylePrompt(projectContext, locationAnalysis, portfolioStyle, weight = 0.5) {
    // STEP 4: Use sophisticated style blending
    const blendedStyle = this.blendStyles(locationAnalysis, portfolioStyle, weight);

    console.log('🎨 Blended style created:', {
      name: blendedStyle.styleName,
      ratio: `${Math.round(blendedStyle.blendRatio.local * 100)}% local / ${Math.round(blendedStyle.blendRatio.portfolio * 100)}% portfolio`,
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
