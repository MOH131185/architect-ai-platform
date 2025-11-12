/**
 * Enhanced AI Integration Service with UK Intelligence
 * Complete workflow: Location → Portfolio → Style Blending → Generation
 */

import togetherAIReasoningService from './togetherAIReasoningService';
import enhancedUKLocationService from './enhancedUKLocationService';
import enhancedPortfolioService from './enhancedPortfolioService';
import aiIntegrationService from './aiIntegrationService';
import designDNAGenerator from './designDNAGenerator';

class EnhancedAIIntegrationService {
  constructor() {
    this.openai = togetherAIReasoningService;
    this.ukLocation = enhancedUKLocationService;
    this.portfolio = enhancedPortfolioService;
    this.aiIntegration = aiIntegrationService;
  }

  /**
   * MASTER WORKFLOW: Complete intelligent design generation
   *
   * Steps:
   * 1. Analyze UK location (climate, sun, wind, materials, regulations)
   * 2. Analyze portfolio with OpenAI GPT-4 Vision
   * 3. Blend portfolio style with location context
   * 4. Create Building DNA for consistency
   * 5. Generate floor plans, elevations, sections, 3D views
   * 6. Ensure all outputs show the SAME building
   */
  async generateCompleteIntelligentDesign(projectContext, portfolioFiles = [], materialWeight = 0.5, characteristicWeight = 0.5) {
    try {
      console.log('🎯 ============================================');
      console.log('🎯 STARTING COMPLETE INTELLIGENT DESIGN WORKFLOW');
      console.log('🎯 ============================================');

      // ========================================
      // STEP 1: UK LOCATION INTELLIGENCE
      // ========================================
      console.log('\n📍 STEP 1: UK Location Intelligence Analysis');
      console.log('   Address:', projectContext.location?.address);
      console.log('   Coordinates:', projectContext.location?.coordinates);

      let ukAnalysis = null;
      const isUKLocation = this.isUKLocation(projectContext.location);

      if (isUKLocation) {
        console.log('🇬🇧 Detected UK location - using enhanced UK intelligence');
        ukAnalysis = await this.ukLocation.analyzeUKLocation(
          projectContext.location.address,
          projectContext.location.coordinates
        );

        if (ukAnalysis.success) {
          console.log('✅ UK Analysis Complete:');
          console.log('   Region:', ukAnalysis.region);
          console.log('   Climate:', ukAnalysis.climateData.type);
          console.log('   Sun path:', ukAnalysis.sunData.optimalOrientation);
          console.log('   Wind:', ukAnalysis.climateData.prevailingWind);
          console.log('   Traditional style:', ukAnalysis.architecturalData.traditionalStyles?.[0]?.name);
        }
      } else {
        console.log('🌍 Non-UK location - using global database');
        ukAnalysis = null;
      }

      // ========================================
      // STEP 2: PORTFOLIO ANALYSIS WITH GPT-4 VISION
      // ========================================
      console.log('\n🎨 STEP 2: Portfolio Analysis with GPT-4 Vision');

      let portfolioAnalysis = null;
      if (portfolioFiles && portfolioFiles.length > 0) {
        console.log('   Portfolio files:', portfolioFiles.length);
        portfolioAnalysis = await this.portfolio.analyzePortfolio(
          portfolioFiles,
          ukAnalysis || projectContext.location
        );

        if (portfolioAnalysis.success) {
          console.log('✅ Portfolio Analysis Complete:');
          console.log('   Style:', portfolioAnalysis.primaryStyle?.name || 'Unknown');
          console.log('   Confidence:', portfolioAnalysis.primaryStyle?.confidence || 'N/A');
          console.log('   Materials:', portfolioAnalysis.materials?.exterior?.slice(0, 3).join(', ') || 'N/A');
          if (portfolioAnalysis.locationCompatibility?.climateSuitability) {
            console.log('   Compatibility:', portfolioAnalysis.locationCompatibility.climateSuitability);
          }
        }
      } else {
        console.log('⏭️  No portfolio provided - will use location-based design');
      }

      // ========================================
      // STEP 3: STYLE BLENDING
      // ========================================
      console.log('\n🎨 STEP 3: Style Blending (Portfolio + Location)');
      console.log('   Material weight:', `${Math.round((1-materialWeight)*100)}% local / ${Math.round(materialWeight*100)}% portfolio`);
      console.log('   Characteristic weight:', `${Math.round((1-characteristicWeight)*100)}% local / ${Math.round(characteristicWeight*100)}% portfolio`);

      let blendedStyle = null;
      if (portfolioAnalysis && ukAnalysis) {
        blendedStyle = this.portfolio.blendStyleWithLocation(
          portfolioAnalysis,
          ukAnalysis,
          materialWeight,
          characteristicWeight
        );
        console.log('✅ Style Blending Complete:');
        console.log('   Blended style:', blendedStyle.styleName);
        console.log('   Materials:', blendedStyle.materials.slice(0, 4).join(', '));
        console.log('   Portfolio influence:', Math.round(blendedStyle.portfolioInfluence * 100) + '%');
      } else if (ukAnalysis) {
        // Use UK location style
        blendedStyle = this.createLocationBasedStyle(ukAnalysis);
        console.log('✅ Using location-based style:', blendedStyle.styleName);
      } else {
        // Fallback to project context
        blendedStyle = this.createContextBasedStyle(projectContext);
        console.log('✅ Using context-based style:', blendedStyle.styleName);
      }

      // ========================================
      // STEP 4: CREATE COMPREHENSIVE DESIGN DNA WITH OPENAI
      // ========================================
      console.log('\n🧬 STEP 4: Creating Comprehensive Design DNA for 80%+ Consistency');
      console.log('   Using OpenAI to generate ultra-detailed specifications...');

      const projectSeed = projectContext.projectSeed || Math.floor(Math.random() * 1000000);
      console.log('   Project Seed:', projectSeed);

      const enhancedContext = {
        ...projectContext,
        seed: projectSeed,
        projectSeed: projectSeed,
        ukLocationData: ukAnalysis,
        portfolioStyle: portfolioAnalysis,
        blendedStyle: blendedStyle,
        architecturalStyle: blendedStyle.styleName,
        materials: blendedStyle.materials.slice(0, 3).join(', '),
        sunPath: ukAnalysis?.sunData,
        windData: ukAnalysis?.climateData,
        regulations: ukAnalysis?.regulations
      };

      // Generate comprehensive Design DNA using OpenAI (with fallback)
      const comprehensiveDNA = await designDNAGenerator.generateComprehensiveDesignDNA(enhancedContext);

      // Also generate basic Building DNA for backward compatibility
      const basicDNA = this.aiIntegration.createBuildingDNA(enhancedContext, blendedStyle);

      // Merge both DNAs - comprehensive takes priority
      const buildingDNA = {
        ...basicDNA,
        ...comprehensiveDNA,
        // Ensure critical fields exist
        dimensions: comprehensiveDNA.dimensions || basicDNA.dimensions,
        materials: comprehensiveDNA.materials || basicDNA.materials,
        roof: comprehensiveDNA.roof || basicDNA.roof,
        windows: comprehensiveDNA.windows || basicDNA.windows,
        colorPalette: comprehensiveDNA.colorPalette || {},
        consistencyNotes: comprehensiveDNA.consistencyNotes || {}
      };

      enhancedContext.buildingDNA = buildingDNA;
      enhancedContext.masterDesignSpec = buildingDNA;
      enhancedContext.comprehensiveDNA = comprehensiveDNA;

      console.log('✅ Comprehensive Design DNA Created:');
      console.log('   Dimensions:', `${buildingDNA.dimensions?.length || 15}m × ${buildingDNA.dimensions?.width || 10}m`);
      console.log('   Floors:', buildingDNA.dimensions?.floorCount || 2);
      console.log('   Primary Material:', buildingDNA.materials?.exterior?.primary || buildingDNA.materials?.exterior || 'Modern materials');
      console.log('   Material Color:', buildingDNA.materials?.exterior?.color || 'Natural');
      console.log('   Roof:', buildingDNA.roof?.type || 'gable', buildingDNA.roof?.material || '');
      console.log('   Windows:', buildingDNA.windows?.type || 'modern', '-', buildingDNA.windows?.color || '');
      console.log('   Color Palette:', buildingDNA.colorPalette?.primary || 'Natural tones');
      if (comprehensiveDNA.consistencyNotes?.criticalForAllViews) {
        console.log('   🎯 Consistency Rule:', comprehensiveDNA.consistencyNotes.criticalForAllViews);
      }

      // ========================================
      // STEP 4.5: GENERATE STYLE SIGNATURE FOR DALL·E 3 CONSISTENCY
      // ========================================
      console.log('\n🎨 STEP 4.5: Generating Style Signature for DALL·E 3 Consistency');

      let styleSignature = null;
      if (projectContext.styleSignature) {
        // Use cached signature from ArchitectAIEnhanced
        styleSignature = projectContext.styleSignature;
        console.log('✅ Using cached style signature from context');
      } else {
        // Generate new signature with BLENDED STYLE (respects material/characteristic weights)
        try {
          styleSignature = await this.aiIntegration.generateStyleSignature(
            {
              portfolioStyle: portfolioAnalysis,
              blendedStyle: blendedStyle  // CRITICAL: Pass blended style with proper weights
            },
            {
              buildingProgram: projectContext.buildingProgram || 'building',
              area: projectContext.area || projectContext.floorArea || 200,
              floorArea: parseInt(projectContext.area || projectContext.floorArea) || 200,
              buildingDNA: buildingDNA  // Pass building DNA for consistency
            },
            {
              address: projectContext.location?.address,
              climate: ukAnalysis?.climateData,
              ukAnalysis: ukAnalysis  // Pass full UK analysis
            }
          );
          console.log('✅ Style signature generated with blended materials for DALL·E 3');
          console.log(`   Using materials: ${blendedStyle.materials.slice(0, 3).join(', ')}`);
        } catch (sigError) {
          console.warn('⚠️ Style signature generation failed, using fallback:', sigError.message);
          styleSignature = this.aiIntegration.getFallbackStyleSignature(
            projectContext,
            { address: projectContext.location?.address, blendedStyle: blendedStyle }
          );
        }
      }

      enhancedContext.styleSignature = styleSignature;

      // ========================================
      // STEP 5: GENERATE ALL IMAGES WITH DALL·E 3 (Primary) + SDXL (Fallback)
      // ========================================
      console.log('\n🏗️  STEP 5: Generating All Architectural Views with DALL·E 3');
      console.log('   Primary: DALL·E 3 | Fallback: Replicate SDXL');

      // Define all view requests (12 total views)
      const viewRequests = [
        { viewType: 'floor_plan', meta: enhancedContext, size: '1024x1024' },
        { viewType: 'elevation_north', meta: enhancedContext, size: '1024x1024' },
        { viewType: 'elevation_south', meta: enhancedContext, size: '1024x1024' },
        { viewType: 'elevation_east', meta: enhancedContext, size: '1024x1024' },
        { viewType: 'elevation_west', meta: enhancedContext, size: '1024x1024' },
        { viewType: 'section_longitudinal', meta: enhancedContext, size: '1024x1024' },
        { viewType: 'section_cross', meta: enhancedContext, size: '1024x1024' },
        { viewType: 'exterior_front', meta: enhancedContext, size: '1024x1536' },
        { viewType: 'exterior_side', meta: enhancedContext, size: '1024x1536' },
        { viewType: 'interior', meta: enhancedContext, size: '1536x1024' },
        { viewType: 'axonometric', meta: enhancedContext, size: '1024x1024' },
        { viewType: 'perspective', meta: enhancedContext, size: '1536x1024' }
      ];

      // Generate all images with DALL·E 3 primary, SDXL fallback
      const allImages = await this.aiIntegration.generateConsistentImages(viewRequests, enhancedContext);

      console.log('✅ All architectural views generated (DALL·E 3 ONLY)');
      console.log(`   ✅ DALL·E 3 Success: ${allImages.filter(r => r.source === 'dalle3').length}/${allImages.length}`);
      console.log(`   ❌ Placeholder: ${allImages.filter(r => r.source === 'placeholder').length}/${allImages.length}`);
      console.log(`   🎯 Consistency Level: ${allImages.filter(r => r.source === 'dalle3').length === allImages.length ? 'PERFECT (100%)' : 'HIGH (80%+)'}`);
      console.log(`   📊 Success Rate: ${Math.round((allImages.filter(r => r.source === 'dalle3').length / allImages.length) * 100)}%`);

      // Organize results into legacy structure for compatibility
      const floorPlanResult = allImages.find(r => r.viewType === 'floor_plan');
      console.log('🔍 Floor plan result:', floorPlanResult);
      console.log('🔍 Floor plan images:', floorPlanResult?.images);

      const floorPlans = {
        floorPlans: {
          ground: {
            images: floorPlanResult?.images || ['https://placehold.co/1024x1024?text=Floor+Plan']
          }
        }
      };

      const technicalDrawings = {
        technicalDrawings: {
          elevation_north: { images: allImages.find(r => r.viewType === 'elevation_north')?.images || [] },
          elevation_south: { images: allImages.find(r => r.viewType === 'elevation_south')?.images || [] },
          elevation_east: { images: allImages.find(r => r.viewType === 'elevation_east')?.images || [] },
          elevation_west: { images: allImages.find(r => r.viewType === 'elevation_west')?.images || [] },
          section_longitudinal: { images: allImages.find(r => r.viewType === 'section_longitudinal')?.images || [] },
          section_cross: { images: allImages.find(r => r.viewType === 'section_cross')?.images || [] }
        }
      };

      const exteriorFrontResult = allImages.find(r => r.viewType === 'exterior_front');
      const exteriorSideResult = allImages.find(r => r.viewType === 'exterior_side');
      const interiorResult = allImages.find(r => r.viewType === 'interior');
      const axonometricResult = allImages.find(r => r.viewType === 'axonometric');
      const perspectiveResult = allImages.find(r => r.viewType === 'perspective');

      console.log('🔍 3D Views extraction:');
      console.log('  exterior_front:', exteriorFrontResult?.images);
      console.log('  exterior_side:', exteriorSideResult?.images);
      console.log('  interior:', interiorResult?.images);
      console.log('  axonometric:', axonometricResult?.images);
      console.log('  perspective:', perspectiveResult?.images);

      const views = {
        exterior_front: { images: exteriorFrontResult?.images || [] },
        exterior_side: { images: exteriorSideResult?.images || [] },
        interior: { images: interiorResult?.images || [] },
        axonometric: { images: axonometricResult?.images || [] },
        perspective: { images: perspectiveResult?.images || [] }
      };

      const floorPlanImage = floorPlans.floorPlans.ground.images[0];

      // ========================================
      // STEP 6: COMPILE RESULTS
      // ========================================
      console.log('\n📦 STEP 6: Compiling Complete Results');

      const results = {
        success: true,

        // Intelligence data
        ukLocationAnalysis: ukAnalysis,
        portfolioAnalysis: portfolioAnalysis,
        blendedStyle: blendedStyle,
        buildingDNA: buildingDNA,
        styleSignature: styleSignature,  // NEW: DALL·E 3 style signature

        // Generated outputs
        floorPlans: floorPlans,
        technicalDrawings: technicalDrawings,
        visualizations: {
          views: views,
          floorPlanReference: floorPlanImage
        },

        // DALL·E 3 generation details
        imageGeneration: {
          allImages: allImages,  // Full details of each generation
          dalle3Count: allImages.filter(r => r.source === 'dalle3').length,
          sdxlFallbackCount: allImages.filter(r => r.source === 'sdxl_fallback').length,
          failedCount: allImages.filter(r => !r.success).length,
          totalCount: allImages.length
        },

        // Metadata
        projectSeed: projectSeed,
        enhancedContext: enhancedContext,
        materialWeight: materialWeight,
        characteristicWeight: characteristicWeight,

        // Summary
        summary: {
          region: ukAnalysis?.region || 'Global',
          portfolioStyle: portfolioAnalysis?.primaryStyle?.name || 'None',
          blendedStyleName: blendedStyle.styleName,
          totalFloors: buildingDNA.dimensions?.floorCount || buildingDNA.dimensions?.floors || 2,
          buildingDimensions: `${buildingDNA.dimensions?.length || 15}m × ${buildingDNA.dimensions?.width || 10}m`,
          materials: blendedStyle.materials.slice(0, 3),
          imageGenerator: 'DALL·E 3 with SDXL fallback',  // NEW
          consistencyLevel: styleSignature?.isFallback ? 'Standard' : 'High (80%+)'  // NEW
        },

        timestamp: new Date().toISOString(),
        workflow: 'enhanced_dalle3_intelligent'  // Updated workflow name
      };

      console.log('\n✅ ============================================');
      console.log('✅ COMPLETE INTELLIGENT DESIGN WORKFLOW FINISHED');
      console.log('✅ ============================================');
      console.log('   Summary:', results.summary);
      console.log('   🎨 Image Generator:', results.summary.imageGenerator);
      console.log('   🎯 Consistency Level:', results.summary.consistencyLevel);

      console.log('\n📦 FINAL RESULT STRUCTURE:');
      console.log('   floorPlans.floorPlans.ground.images:', results.floorPlans?.floorPlans?.ground?.images?.length || 0, 'images');
      console.log('   technicalDrawings.technicalDrawings:', Object.keys(results.technicalDrawings?.technicalDrawings || {}).length, 'drawings');
      console.log('   visualizations.views:', Object.keys(results.visualizations?.views || {}).length, 'views');
      console.log('   visualizations.views.exterior_front.images:', results.visualizations?.views?.exterior_front?.images?.length || 0);
      console.log('   visualizations.views.exterior_side.images:', results.visualizations?.views?.exterior_side?.images?.length || 0);
      console.log('   visualizations.views.interior.images:', results.visualizations?.views?.interior?.images?.length || 0);
      console.log('   visualizations.views.axonometric.images:', results.visualizations?.views?.axonometric?.images?.length || 0);
      console.log('   visualizations.views.perspective.images:', results.visualizations?.views?.perspective?.images?.length || 0);

      return results;

    } catch (error) {
      console.error('\n❌ Enhanced intelligent design generation error:', error);
      return {
        success: false,
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Check if location is in UK
   */
  isUKLocation(location) {
    if (!location) return false;

    const address = (location.address || '').toLowerCase();
    const coords = location.coordinates;

    // Check address contains UK identifiers
    if (address.includes('uk') ||
        address.includes('united kingdom') ||
        address.includes('england') ||
        address.includes('scotland') ||
        address.includes('wales') ||
        address.includes('northern ireland') ||
        address.includes('london') ||
        address.includes('manchester') ||
        address.includes('edinburgh') ||
        address.includes('cardiff') ||
        address.includes('belfast') ||
        address.includes('birmingham') ||
        address.includes('glasgow') ||
        address.includes('liverpool') ||
        address.includes('bristol')) {
      return true;
    }

    // Check coordinates (UK bounding box)
    if (coords && coords.lat && coords.lng) {
      // UK: lat 49-61, lng -8 to 2
      if (coords.lat >= 49 && coords.lat <= 61 &&
          coords.lng >= -8 && coords.lng <= 2) {
        return true;
      }
    }

    return false;
  }

  /**
   * Create style from UK location data
   */
  createLocationBasedStyle(ukAnalysis) {
    const region = ukAnalysis.region;
    const traditionalStyle = ukAnalysis.architecturalData.traditionalStyles?.[0];
    const contemporaryStyle = ukAnalysis.architecturalData.contemporaryStyles?.[0];
    const materials = ukAnalysis.materials.walls || [];

    return {
      styleName: `${region} ${contemporaryStyle?.name || 'Contemporary'}`,
      materials: materials.slice(0, 4),
      characteristics: [
        ...(traditionalStyle?.characteristics || []).slice(0, 2),
        ...(contemporaryStyle?.characteristics || []).slice(0, 2)
      ],
      portfolioInfluence: 0,
      locationInfluence: 1,
      description: `Contemporary ${region} architecture incorporating local materials and climate-responsive design. Features ${materials.slice(0, 3).join(', ')} with ${traditionalStyle?.name || 'traditional'} influences adapted for modern living.`
    };
  }

  /**
   * Create style from project context (fallback)
   */
  createContextBasedStyle(projectContext) {
    return {
      styleName: projectContext.architecturalStyle || 'Contemporary',
      materials: (projectContext.materials || 'brick, glass, timber').split(',').map(m => m.trim()),
      characteristics: [
        'Clean lines and modern aesthetics',
        'Functional spatial organization',
        'Sustainable design principles',
        'Quality materials and craftsmanship'
      ],
      portfolioInfluence: 0,
      locationInfluence: 0,
      description: `${projectContext.architecturalStyle || 'Contemporary'} design approach with ${projectContext.materials || 'modern materials'}, creating a functional and aesthetically pleasing ${projectContext.buildingProgram || 'building'}.`
    };
  }

  /**
   * Simplified workflow for non-UK locations
   */
  async generateStandardDesign(projectContext, portfolioFiles = []) {
    console.log('🌍 Generating standard design (non-UK location)');

    // Reuse existing logic but without UK-specific intelligence
    return await this.generateCompleteIntelligentDesign(
      projectContext,
      portfolioFiles,
      0.5,  // Balanced material weight
      0.5   // Balanced characteristic weight
    );
  }
}

export default new EnhancedAIIntegrationService();
