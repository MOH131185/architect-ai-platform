/**
 * Reasoning Service
 * Orchestrates OpenAI reasoning to build Master Design Specification (MDS)
 */

import logger from '../utils/productionLogger';
import openaiService from './openaiService';
import { locationIntelligence } from './locationIntelligence';
import { validateMDS, createDefaultMDS } from '../schemas/mds.schema';

// Helper for test-safe logging
const log = {
  info: (...args) => {
    if (process.env.NODE_ENV !== 'test') {
      logger.info(...args);
    }
  },
  warn: (...args) => {
    if (process.env.NODE_ENV !== 'test') {
      logger.warn(...args);
    } else {
      console.warn(...args);
    }
  },
  error: (...args) => {
    if (process.env.NODE_ENV !== 'test') {
      logger.error(...args);
    } else {
      console.error(...args);
    }
  },
  verbose: (...args) => {
    if (process.env.NODE_ENV !== 'test') {
      logger.verbose(...args);
    }
  }
};

class ReasoningService {
  constructor() {
    this.openai = openaiService;
    this.locationIntelligence = locationIntelligence;
  }

  /**
   * Create Master Design Specification from project inputs
   * @param {Object} params - Project parameters
   * @param {Object} params.address - Project address
   * @param {Object} params.sitePolygon - Site boundary polygon
   * @param {Object} params.climate - Climate data
   * @param {String} params.program - Building program type
   * @param {Number} params.area - Gross floor area in m²
   * @param {String} params.entryDirection - Preferred entry side
   * @param {Array} params.portfolioAssets - Portfolio images/PDFs
   * @returns {Promise<Object>} Master Design Specification
   */
  async createMasterDesignSpec(params) {
    try {
      log.info('🏗️ Creating Master Design Specification...');

      // Step 1: Geocode address and get site info
      const siteInfo = await this.getSiteInformation(params.address, params.sitePolygon);

      // Step 2: Analyze climate
      const climateInfo = await this.analyzeClimate(params.climate || siteInfo.climate);

      // Step 3: Determine building dimensions
      const dimensions = await this.calculateDimensions(params.area, params.program);

      // Step 4: Get local architectural style
      const localStyle = this.locationIntelligence.recommendArchitecturalStyle(
        siteInfo,
        climateInfo
      );

      // Step 5: Analyze portfolio if provided
      let portfolioAnalysis = null;
      if (params.portfolioAssets && params.portfolioAssets.length > 0) {
        portfolioAnalysis = await this.analyzePortfolio(params.portfolioAssets);
      }

      // Step 6: Create blended style
      const blendedStyle = await this.createBlendedStyle(
        localStyle,
        portfolioAnalysis,
        params.styleWeights || { material: 0.5, characteristic: 0.5 }
      );

      // Step 7: Generate building program
      const buildingProgram = await this.generateBuildingProgram(
        params.program,
        params.area,
        dimensions.floors
      );

      // Step 8: Generate design reasoning with OpenAI
      const reasoning = await this.generateDesignReasoning({
        site: siteInfo,
        climate: climateInfo,
        dimensions,
        program: buildingProgram,
        style: blendedStyle,
        entryDirection: params.entryDirection || 'north'
      });

      // Step 9: Extract materials and envelope from reasoning
      const materials = this.extractMaterials(reasoning, blendedStyle);
      const envelope = this.extractEnvelope(reasoning, climateInfo);

      // Step 10: Generate seeds for consistency
      const seeds = this.generateSeeds(params.projectId);

      // Step 11: Assemble MDS
      const mds = {
        site: {
          latitude: siteInfo.latitude,
          longitude: siteInfo.longitude,
          orientation: siteInfo.orientation || 0,
          polygon: params.sitePolygon || [],
          address: params.address,
          zoning: siteInfo.zoning || 'mixed-use',
          setbacks: siteInfo.setbacks || {}
        },
        climate: {
          type: climateInfo.type,
          summary: climateInfo.summary,
          avgTempSummer: climateInfo.avgTempSummer,
          avgTempWinter: climateInfo.avgTempWinter,
          avgRainfall: climateInfo.avgRainfall,
          primaryWindDirection: climateInfo.windDirection
        },
        dimensions: {
          floors: dimensions.floors,
          grossArea: params.area,
          footprint: dimensions.footprint,
          height: dimensions.height,
          floorHeight: dimensions.floorHeight,
          length: dimensions.length,
          width: dimensions.width
        },
        entry: {
          side: params.entryDirection || reasoning.entrySide || 'north',
          position: 'centered',
          width: 1.2,
          height: 2.4
        },
        style: {
          tags: blendedStyle.tags || ['contemporary'],
          primary: blendedStyle.primary,
          secondary: blendedStyle.secondary,
          influences: blendedStyle.influences || []
        },
        materials: {
          primary: materials.primary,
          secondary: materials.secondary,
          accent: materials.accent,
          facade: materials.facade,
          roof: materials.roof,
          structure: materials.structure
        },
        envelope: envelope,
        program: buildingProgram,
        rules: {
          stairs: {
            minWidth: 1.2,
            location: dimensions.floors > 1 ? 'central' : null
          },
          corridors: {
            minWidth: params.program === 'residential' ? 1.2 : 1.5,
            maxLength: 30
          },
          structure: {
            system: dimensions.floors > 3 ? 'frame' : 'load_bearing',
            gridSpacing: 6
          }
        },
        blendedStyle: {
          localPercentage: blendedStyle.localPercentage,
          portfolioPercentage: blendedStyle.portfolioPercentage,
          palette: blendedStyle.palette || [],
          facadeRules: blendedStyle.facadeRules || '',
          description: blendedStyle.description
        },
        seeds: seeds,
        metadata: {
          version: '1.0.0',
          timestamp: new Date().toISOString(),
          projectId: params.projectId || this.generateProjectId(),
          userId: params.userId
        }
      };

      // Validate MDS
      const validation = validateMDS(mds);
      if (!validation.valid) {
        log.warn('⚠️ MDS validation warnings:', validation.errors);
        // Continue anyway but log warnings
      }

      log.info('✅ Master Design Specification created successfully');
      return {
        success: true,
        mds,
        reasoning,
        validation
      };

    } catch (error) {
      log.error('❌ Failed to create MDS:', error);

      // Return fallback MDS
      const fallbackMDS = createDefaultMDS();
      fallbackMDS.metadata.error = error.message;

      return {
        success: false,
        mds: fallbackMDS,
        error: error.message,
        validation: { valid: true, errors: [] }
      };
    }
  }

  /**
   * Get site information from address and polygon
   */
  async getSiteInformation(address, polygon) {
    // For now, return mock data - will integrate with Google Maps API
    return {
      latitude: 37.7749,
      longitude: -122.4194,
      orientation: 0,
      zoning: 'mixed-use',
      climate: {
        type: 'temperate',
        summary: 'Mediterranean climate'
      },
      setbacks: {
        front: 5,
        rear: 3,
        left: 3,
        right: 3
      }
    };
  }

  /**
   * Analyze climate data
   */
  async analyzeClimate(climateData) {
    if (!climateData) {
      return {
        type: 'temperate',
        summary: 'Moderate climate conditions',
        avgTempSummer: 25,
        avgTempWinter: 10,
        avgRainfall: 800,
        windDirection: 'west'
      };
    }

    return {
      type: climateData.type || 'temperate',
      summary: climateData.summary || 'Climate analysis',
      avgTempSummer: climateData.avgTempSummer || 25,
      avgTempWinter: climateData.avgTempWinter || 10,
      avgRainfall: climateData.avgRainfall || 800,
      windDirection: climateData.windDirection || 'west'
    };
  }

  /**
   * Calculate building dimensions based on area and program
   */
  async calculateDimensions(area, program) {
    // Determine floor count based on area and program
    let floors = 1;
    if (area > 500) floors = 3;
    else if (area > 250) floors = 2;
    else if (area <= 150) floors = 1;  // Ensure 150 m² or less stays single floor

    if (program === 'commercial' && area > 1000) floors = Math.min(5, Math.ceil(area / 400));

    const footprint = area / floors;
    const aspectRatio = 1.2; // Slightly rectangular
    const width = Math.sqrt(footprint / aspectRatio);
    const length = footprint / width;
    const floorHeight = program === 'commercial' ? 3.5 : 3.0;
    const height = floors * floorHeight;

    return {
      floors,
      footprint,
      height,
      floorHeight,
      length: Math.round(length * 10) / 10,
      width: Math.round(width * 10) / 10
    };
  }

  /**
   * Analyze portfolio assets using OpenAI vision
   */
  async analyzePortfolio(portfolioAssets) {
    try {
      if (!portfolioAssets || portfolioAssets.length === 0) {
        return null;
      }

      log.verbose('🎨 Analyzing portfolio assets...');

      // For now, return mock portfolio analysis
      // TODO: Integrate with actual vision API or portfolio detection service
      // when OpenAI Vision API or image analysis service is available
      return {
        primaryStyle: 'contemporary',
        materials: ['glass', 'steel', 'concrete'],
        characteristics: ['clean lines', 'large windows', 'minimalist'],
        confidence: 0.8
      };
    } catch (error) {
      log.error('Portfolio analysis failed:', error);
      return null;
    }
  }

  /**
   * Create blended style from local and portfolio
   */
  async createBlendedStyle(localStyle, portfolioAnalysis, weights) {
    const materialWeight = weights.material || 0.5;
    const characteristicWeight = weights.characteristic || 0.5;

    // Handle missing localStyle
    if (!localStyle) {
      localStyle = {
        primary: 'contemporary',
        materials: ['concrete', 'glass', 'steel'],
        characteristics: ['modern', 'sustainable']
      };
    }

    if (!portfolioAnalysis) {
      // Pure local style
      return {
        tags: [localStyle.primary],
        primary: localStyle.primary,
        secondary: null,
        influences: localStyle.characteristics || [],
        localPercentage: 100,
        portfolioPercentage: 0,
        description: `${localStyle.primary} style adapted to local context`,
        materials: localStyle.materials || ['concrete', 'glass', 'steel'],
        palette: []
      };
    }

    // Blend styles
    const localMaterialCount = Math.round(3 * (1 - materialWeight));
    const portfolioMaterialCount = 3 - localMaterialCount;

    const blendedMaterials = [
      ...(localStyle.materials || []).slice(0, localMaterialCount),
      ...(portfolioAnalysis.materials || []).slice(0, portfolioMaterialCount)
    ];

    const localCharCount = Math.round(4 * (1 - characteristicWeight));
    const portfolioCharCount = 4 - localCharCount;

    const blendedCharacteristics = [
      ...(localStyle.characteristics || []).slice(0, localCharCount),
      ...(portfolioAnalysis.characteristics || []).slice(0, portfolioCharCount)
    ];

    const overallWeight = (materialWeight + characteristicWeight) / 2;
    const localPercentage = Math.round((1 - overallWeight) * 100);
    const portfolioPercentage = Math.round(overallWeight * 100);

    let styleName;
    if (overallWeight < 0.3) {
      styleName = `${localStyle.primary} with ${portfolioAnalysis.primaryStyle} influences`;
    } else if (overallWeight < 0.7) {
      styleName = `Hybrid ${localStyle.primary}-${portfolioAnalysis.primaryStyle}`;
    } else {
      styleName = `${portfolioAnalysis.primaryStyle} adapted to ${localStyle.primary} context`;
    }

    return {
      tags: [localStyle.primary, portfolioAnalysis.primaryStyle],
      primary: overallWeight > 0.5 ? portfolioAnalysis.primaryStyle : localStyle.primary,
      secondary: overallWeight > 0.5 ? localStyle.primary : portfolioAnalysis.primaryStyle,
      influences: blendedCharacteristics,
      localPercentage,
      portfolioPercentage,
      description: styleName,
      materials: blendedMaterials,
      palette: []
    };
  }

  /**
   * Generate building program based on type and area
   */
  async generateBuildingProgram(programType, totalArea, floors) {
    const programs = {
      residential: [
        { name: 'Living Room', area: totalArea * 0.15, floor: 0 },
        { name: 'Kitchen', area: totalArea * 0.12, floor: 0 },
        { name: 'Dining', area: totalArea * 0.10, floor: 0 },
        { name: 'Master Bedroom', area: totalArea * 0.15, floor: floors > 1 ? 1 : 0 },
        { name: 'Bedroom 2', area: totalArea * 0.10, floor: floors > 1 ? 1 : 0 },
        { name: 'Bathrooms', area: totalArea * 0.08, count: 2 },
        { name: 'Circulation', area: totalArea * 0.15 },
        { name: 'Storage', area: totalArea * 0.05 }
      ],
      commercial: [
        { name: 'Open Office', area: totalArea * 0.40, floor: 0 },
        { name: 'Meeting Rooms', area: totalArea * 0.15, count: 3 },
        { name: 'Reception', area: totalArea * 0.08, floor: 0 },
        { name: 'Break Room', area: totalArea * 0.08 },
        { name: 'Bathrooms', area: totalArea * 0.08, count: 2 },
        { name: 'Circulation', area: totalArea * 0.15 },
        { name: 'Storage', area: totalArea * 0.06 }
      ],
      mixed: [
        { name: 'Retail', area: totalArea * 0.30, floor: 0 },
        { name: 'Office', area: totalArea * 0.35, floor: floors > 1 ? 1 : 0 },
        { name: 'Common Areas', area: totalArea * 0.10 },
        { name: 'Services', area: totalArea * 0.10 },
        { name: 'Circulation', area: totalArea * 0.15 }
      ]
    };

    const program = programs[programType] || programs.residential;

    // Add adjacency relationships
    program.forEach((room, index) => {
      if (room.name === 'Kitchen') {
        room.adjacentTo = ['Dining', 'Living Room'];
      } else if (room.name === 'Master Bedroom') {
        room.adjacentTo = ['Bathrooms'];
      } else if (room.name === 'Reception') {
        room.adjacentTo = ['Open Office', 'Meeting Rooms'];
      }
    });

    return program;
  }

  /**
   * Generate design reasoning using OpenAI
   */
  async generateDesignReasoning(context) {
    try {
      const prompt = `
        Generate architectural design reasoning for:
        - Location: ${context.site.address}
        - Climate: ${context.climate.type}
        - Building: ${context.dimensions.floors} floors, ${context.dimensions.grossArea}m²
        - Style: ${context.style.description}
        - Entry: ${context.entryDirection} side

        Provide reasoning for:
        1. Design philosophy
        2. Material selection based on climate and style
        3. Spatial organization
        4. Environmental strategies
        5. Structural system
      `;

      const reasoning = await this.openai.generateDesignReasoning({
        ...context,
        prompt
      });

      return reasoning;
    } catch (error) {
      log.error('Design reasoning generation failed:', error);
      return {
        philosophy: 'Contemporary sustainable design',
        materials: 'Climate-responsive materials',
        spatialOrganization: 'Functional layout with natural flow',
        environmentalStrategies: 'Passive design strategies',
        structuralSystem: 'Efficient structural grid'
      };
    }
  }

  /**
   * Extract materials from reasoning and style
   */
  extractMaterials(reasoning, blendedStyle) {
    const materials = blendedStyle.materials || ['concrete', 'glass', 'steel'];

    return {
      primary: materials[0] || 'concrete',
      secondary: materials[1] || 'glass',
      accent: materials[2] || 'steel',
      facade: materials[1] || 'glass',
      roof: 'membrane',
      structure: materials[0] || 'concrete'
    };
  }

  /**
   * Extract envelope specifications from reasoning
   */
  extractEnvelope(reasoning, climate) {
    // Climate-based U-values (W/m²K)
    const uValues = {
      tropical: { walls: 2.0, roof: 1.5, floor: 2.5, windows: 3.0 },
      arid: { walls: 1.0, roof: 0.8, floor: 1.5, windows: 2.0 },
      temperate: { walls: 0.5, roof: 0.3, floor: 0.5, windows: 1.5 },
      continental: { walls: 0.3, roof: 0.2, floor: 0.3, windows: 1.0 },
      polar: { walls: 0.2, roof: 0.15, floor: 0.2, windows: 0.8 }
    };

    const climateType = climate.type || 'temperate';
    const values = uValues[climateType] || uValues.temperate;

    return {
      uValueWalls: values.walls,
      uValueRoof: values.roof,
      uValueFloor: values.floor,
      uValueWindows: values.windows,
      glazingRatio: climateType === 'tropical' ? 0.3 : 0.4
    };
  }

  /**
   * Generate consistent seeds for all views
   */
  generateSeeds(projectId) {
    const baseSeed = projectId ?
      parseInt(projectId.replace(/[^0-9]/g, '').slice(-6)) || Math.floor(Math.random() * 1000000) :
      Math.floor(Math.random() * 1000000);

    return {
      master: baseSeed,
      floorPlan: baseSeed + 1,
      elevation: baseSeed + 2,
      axonometric: baseSeed + 3
    };
  }

  /**
   * Generate unique project ID
   */
  generateProjectId() {
    return `proj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Update MDS with text modifications
   * @param {Object} currentMDS - Current MDS
   * @param {String} modificationText - User's modification request
   * @returns {Promise<Object>} Updated MDS with delta
   */
  async modifyMDSWithText(currentMDS, modificationText) {
    try {
      log.info('📝 Modifying MDS with text:', modificationText);

      // Use OpenAI to generate MDS delta
      const delta = await this.openai.generateMDSDelta(currentMDS, modificationText);

      // Apply delta to current MDS
      const updatedMDS = this.applyMDSDelta(currentMDS, delta);

      // Validate updated MDS
      const validation = validateMDS(updatedMDS);
      if (!validation.valid) {
        log.warn('⚠️ Updated MDS validation warnings:', validation.errors);
      }

      // Update timestamp and version
      updatedMDS.metadata.timestamp = new Date().toISOString();
      updatedMDS.metadata.version = this.incrementVersion(currentMDS.metadata.version);

      return {
        success: true,
        mds: updatedMDS,
        delta,
        validation
      };

    } catch (error) {
      log.error('❌ Failed to modify MDS:', error);
      return {
        success: false,
        error: error.message,
        mds: currentMDS
      };
    }
  }

  /**
   * Apply delta changes to MDS
   */
  applyMDSDelta(mds, delta) {
    const updated = JSON.parse(JSON.stringify(mds)); // Deep clone

    // Apply each delta change
    Object.keys(delta).forEach(key => {
      if (key === 'dimensions' && delta.dimensions) {
        Object.assign(updated.dimensions, delta.dimensions);
      } else if (key === 'materials' && delta.materials) {
        Object.assign(updated.materials, delta.materials);
      } else if (key === 'program' && delta.program) {
        // Handle program updates (room additions/modifications)
        if (delta.program.add) {
          updated.program.push(...delta.program.add);
        }
        if (delta.program.modify) {
          delta.program.modify.forEach(mod => {
            const room = updated.program.find(r => r.name === mod.name);
            if (room) {
              Object.assign(room, mod);
            }
          });
        }
      } else if (key === 'style' && delta.style) {
        Object.assign(updated.style, delta.style);
      } else if (key === 'entry' && delta.entry) {
        Object.assign(updated.entry, delta.entry);
      }
    });

    return updated;
  }

  /**
   * Increment semantic version
   */
  incrementVersion(version) {
    const parts = version.split('.');
    parts[2] = String(parseInt(parts[2]) + 1);
    return parts.join('.');
  }
}

const reasoningService = new ReasoningService();
export default reasoningService;