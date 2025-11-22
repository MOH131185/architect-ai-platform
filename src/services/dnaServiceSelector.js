/**
 * DNA Service Selector - Intelligently selects the best DNA generation service
 * Based on project requirements and complexity
 */

import dnaCache from '../utils/dnaCache.js';
import logger from '../utils/logger.js';


class DNAServiceSelector {
  /**
   * Select the appropriate DNA service based on requirements
   */
  selectService(requirements) {
    // Dynamic import will be handled in generateDNA
    if (requirements.consistency === 'maximum') {
      logger.info('📊 Selected: Enhanced Design DNA Service (Maximum Consistency)');
      return 'enhancedDesignDNAService';
    }
    // Use enhancedDNAGenerator for detailed specifications
    else if (requirements.detail === 'ultra') {
      logger.info('🔬 Selected: Enhanced DNA Generator (Ultra Detail)');
      return 'enhancedDNAGenerator';
    }
    // Default to basic for speed
    else {
      logger.info('⚡ Selected: Design DNA Generator (Fast Generation)');
      return 'designDNAGenerator';
    }
  }

  /**
   * Generate DNA using the most appropriate service
   */
  async generateDNA(projectContext) {
    // Check cache first
    const cachedDNA = dnaCache.get(projectContext);
    if (cachedDNA) {
      logger.info('🚀 Using cached DNA - skipping regeneration');
      return cachedDNA;
    }

    const requirements = this.analyzeRequirements(projectContext);
    const serviceName = this.selectService(requirements);

    try {
      // Dynamic import based on selected service
      let service;
      switch(serviceName) {
        case 'enhancedDesignDNAService':
          service = (await import('./enhancedDesignDNAService')).default;
          break;
        case 'enhancedDNAGenerator':
          service = (await import('./enhancedDNAGenerator')).default;
          break;
        default:
          service = (await import('./designDNAGenerator')).default;
      }

      logger.info(`🧬 Using ${serviceName} for DNA generation`);

      // Call the appropriate method based on service
      let generatedDNA;
      if (service.generateMasterDNA) {
        generatedDNA = await service.generateMasterDNA(projectContext);
      } else if (service.generateEnhancedDNA) {
        generatedDNA = await service.generateEnhancedDNA(projectContext);
      } else if (service.generateDesignDNA) {
        generatedDNA = await service.generateDesignDNA(projectContext);
      } else {
        // Fallback to generic DNA structure
        console.warn('⚠️ Service missing DNA generation method, using fallback');
        generatedDNA = this.generateFallbackDNA(projectContext);
      }

      // Cache the generated DNA for future use
      if (generatedDNA && !generatedDNA.isFallback) {
        dnaCache.set(projectContext, generatedDNA);
      }

      return generatedDNA;
    } catch (error) {
      logger.error('❌ DNA generation failed:', error);
      logger.info('🔄 Using fallback DNA generation');
      return this.generateFallbackDNA(projectContext);
    }
  }

  /**
   * Analyze project requirements to determine service needs
   */
  analyzeRequirements(projectContext) {
    const requirements = {
      // Maximum consistency for multi-story buildings
      consistency: projectContext.floors > 2 ? 'maximum' : 'standard',

      // Ultra detail for houses and complex programs
      detail: projectContext.building_program === 'house' ||
              projectContext.building_program === 'mixed-use' ? 'ultra' : 'standard',

      // Speed preference
      speed: projectContext.quick || projectContext.fast ? 'fast' : 'normal',

      // Control image availability
      hasControlImages: !!(projectContext.controlImage || projectContext.elevationImages),

      // Portfolio availability
      hasPortfolio: !!(projectContext.portfolio || projectContext.portfolioFiles)
    };

    // Override for ControlNet workflow - always use maximum consistency
    if (requirements.hasControlImages) {
      requirements.consistency = 'maximum';
      requirements.detail = 'ultra';
    }

    logger.info('📋 Project Requirements Analysis:', requirements);
    return requirements;
  }

  /**
   * Generate fallback DNA when services fail
   */
  generateFallbackDNA(projectContext) {
    const seed = projectContext.projectSeed || Math.floor(Math.random() * 1000000);

    return {
      version: '1.0-fallback',
      timestamp: new Date().toISOString(),
      seed: seed,

      // Basic project info
      project: {
        name: projectContext.project_name || 'Architectural Project',
        type: projectContext.building_program || 'mixed-use',
        location: projectContext.location?.address || 'Not specified'
      },

      // Dimensions
      dimensions: {
        floor_count: projectContext.floors || 2,
        total_area: projectContext.floor_area || 200,
        building_footprint: Math.sqrt(projectContext.floor_area || 200),
        ceiling_height: 3.0,
        total_height: (projectContext.floors || 2) * 3.5
      },

      // Basic style
      style_definition: {
        name: projectContext.style || 'Contemporary',
        characteristics: ['modern', 'functional', 'sustainable']
      },

      // Basic materials
      materials: {
        exterior: projectContext.materials?.exterior || 'brick',
        roof: projectContext.materials?.roof || 'clay_tiles',
        windows: projectContext.materials?.windows || 'double_glazed',
        doors: projectContext.materials?.doors || 'timber'
      },

      // Basic consistency rules
      consistency_rules: [
        'All windows must be same style',
        'Door placement on ground floor only',
        'Materials consistent across all views',
        'Roof line continuous'
      ],

      // Fallback indicator
      isFallback: true,
      fallbackReason: 'DNA service unavailable - using basic structure'
    };
  }

  /**
   * Clear any cached DNA data
   */
  clearCache() {
    dnaCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return dnaCache.getStats();
  }
}

// Export singleton instance
export default new DNAServiceSelector();