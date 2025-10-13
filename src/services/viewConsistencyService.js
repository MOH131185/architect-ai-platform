/**
 * View Consistency Service
 * Ensures all architectural views are consistent with the same project design
 */

import logger from '../utils/productionLogger';

class ViewConsistencyService {
  constructor() {
    this.projectSeed = null;
    this.masterDesignSpec = null;
    this.unifiedBuildingDescription = null;
  }

  /**
   * Initialize project consistency for all views
   * @param {Object} projectContext - Complete project information
   */
  initializeProjectConsistency(projectContext) {
    // Set consistent seed for all views
    this.projectSeed = projectContext.seed || projectContext.projectSeed || Math.floor(Math.random() * 1000000);
    
    // Store master design specification
    this.masterDesignSpec = projectContext.masterDesignSpec;
    
    // Create unified building description
    this.unifiedBuildingDescription = this.createUnifiedBuildingDescription(projectContext);
    
    logger.info('🎯 Project consistency initialized:', {
      seed: this.projectSeed,
      buildingType: this.unifiedBuildingDescription.buildingType,
      architecturalStyle: this.unifiedBuildingDescription.architecturalStyle
    });
  }

  /**
   * Create unified building description for consistency across all views
   */
  createUnifiedBuildingDescription(projectContext) {
    const location = projectContext.location || {};
    const program = projectContext.buildingProgram || 'residential building';
    const area = projectContext.totalArea || '100 m²';
    const floors = projectContext.floorCount || 1;
    
    // Get architectural style from location intelligence or portfolio
    const architecturalStyle = location.recommendedStyle || 
                             projectContext.portfolioStyle || 
                             'contemporary';
    
    // Get materials from location context
    const materials = location.materials || 
                     this.getMaterialsForStyle(architecturalStyle);
    
    // Get entrance direction
    const entranceDirection = projectContext.entranceDirection || 'N';
    
    return {
      buildingType: program,
      architecturalStyle: architecturalStyle,
      materials: materials,
      entranceDirection: entranceDirection,
      floorCount: floors,
      totalArea: area,
      fullDescription: `${architecturalStyle} ${program} with ${materials} construction, ${floors} floor${floors > 1 ? 's' : ''}, ${area} total area`,
      features: this.getBuildingFeatures(program, architecturalStyle),
      roomList: this.getRoomList(program, floors)
    };
  }

  /**
   * Get materials appropriate for architectural style
   */
  getMaterialsForStyle(style) {
    const materialMap = {
      'modern': 'glass and steel',
      'contemporary': 'glass, steel, and concrete',
      'traditional': 'brick and wood',
      'minimalist': 'concrete and glass',
      'industrial': 'steel and concrete',
      'mediterranean': 'stone and stucco',
      'colonial': 'brick and wood',
      'victorian': 'brick and wood',
      'art deco': 'concrete and steel',
      'brutalist': 'concrete and steel'
    };
    
    return materialMap[style.toLowerCase()] || 'glass and steel';
  }

  /**
   * Get building features based on program and style
   */
  getBuildingFeatures(program, style) {
    const baseFeatures = ['large windows', 'natural lighting', 'efficient layout'];
    
    if (program.toLowerCase().includes('residential')) {
      baseFeatures.push('private outdoor space', 'storage areas');
    }
    
    if (program.toLowerCase().includes('commercial')) {
      baseFeatures.push('flexible spaces', 'accessibility features');
    }
    
    if (style.toLowerCase().includes('modern')) {
      baseFeatures.push('clean lines', 'open plan');
    }
    
    return baseFeatures.join(', ');
  }

  /**
   * Get room list based on program and floors
   */
  getRoomList(program, floors) {
    if (program.toLowerCase().includes('residential')) {
      const baseRooms = ['living room', 'kitchen', 'bathroom', 'bedroom'];
      if (floors > 1) {
        baseRooms.push('master bedroom', 'additional bathroom');
      }
      return baseRooms;
    }
    
    if (program.toLowerCase().includes('commercial')) {
      return ['reception', 'office spaces', 'meeting room', 'break room', 'storage'];
    }
    
    return ['main space', 'supporting spaces'];
  }

  /**
   * Format master design specification for consistency
   */
  formatMasterDesignSpec(masterSpec) {
    if (!masterSpec) return '';
    
    return `MASTER DESIGN SPECIFICATION:
Building Type: ${masterSpec.buildingType || 'Residential'}
Architectural Style: ${masterSpec.architecturalStyle || 'Contemporary'}
Materials: ${masterSpec.materials || 'Glass and Steel'}
Floor Count: ${masterSpec.floorCount || 1}
Total Area: ${masterSpec.totalArea || '100 m²'}
Entrance Direction: ${masterSpec.entranceDirection || 'North'}
Key Features: ${masterSpec.features || 'Modern design elements'}

DESIGN CONSISTENCY REQUIREMENTS:
- All views must show the SAME building design
- All views must use the SAME architectural style
- All views must use the SAME materials and construction
- All views must show the SAME floor count and layout
- All views must maintain the SAME entrance direction
- All views must be consistent with the SAME project specifications

`;
  }

  /**
   * Get consistent project seed for all views
   */
  getProjectSeed() {
    return this.projectSeed;
  }

  /**
   * Get unified building description
   */
  getUnifiedDescription() {
    return this.unifiedBuildingDescription;
  }

  /**
   * Validate view consistency
   */
  validateViewConsistency(viewType, generatedImage) {
    const issues = [];
    
    // Check if image matches project specifications
    if (!generatedImage || !generatedImage.success) {
      issues.push(`${viewType}: Generation failed`);
    }
    
    // Add more validation logic as needed
    return {
      isValid: issues.length === 0,
      issues: issues
    };
  }

  /**
   * Get consistent negative prompts for different view types
   */
  getNegativePrompt(viewType) {
    const baseNegative = "blurry, low quality, distorted, inconsistent, wrong building, different project, unrelated architecture";
    
    const viewSpecificNegative = {
      'floor_plan': "3D, perspective, elevation, section, exterior, rendered, photorealistic, color",
      'elevation': "3D, perspective, floor plan, section, interior, rendered, photorealistic, color",
      'section': "3D, perspective, floor plan, elevation, exterior, rendered, photorealistic, color",
      'axonometric': "perspective, rendered, photorealistic, color, sketch, hand-drawn",
      'perspective': "floor plan, elevation, section, technical drawing, line drawing, black and white",
      'interior': "exterior, facade, building from outside, aerial view, floor plan, technical drawing",
      'structural_plan': "3D, perspective, color, rendered, photorealistic, architectural floor plan, room layouts, furniture, doors, windows, interior finishes",
      'mep_plan': "3D, perspective, color rendering, photorealistic, architectural details, furniture, decorative elements, landscaping"
    };
    
    return `${baseNegative}, ${viewSpecificNegative[viewType] || ''}`;
  }

  /**
   * Get consistent positive prompts for different view types
   */
  getPositivePrompt(viewType, projectContext) {
    const unified = this.getUnifiedDescription();
    const specPrefix = this.formatMasterDesignSpec(this.masterDesignSpec);
    
    const viewPrompts = {
      'floor_plan': `2D architectural floor plan, top-down view, orthographic projection, technical drawing, black and white, CAD-style, dimensioned, room labels`,
      'elevation': `2D architectural elevation, facade view, orthographic projection, technical drawing, black and white, CAD-style, dimensioned`,
      'section': `2D architectural section, cut-through view, orthographic projection, technical drawing, black and white, CAD-style, dimensioned`,
      'axonometric': `3D axonometric view, isometric projection, technical illustration, clean lines, architectural drawing`,
      'perspective': `3D perspective view, photorealistic rendering, architectural visualization, professional photography`,
      'interior': `3D interior view, photorealistic rendering, architectural visualization, professional photography`
    };
    
    return `${specPrefix}${viewPrompts[viewType] || ''} of ${unified.fullDescription}`;
  }
}

const viewConsistencyService = new ViewConsistencyService();
export default viewConsistencyService;
