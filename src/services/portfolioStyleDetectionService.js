/**
 * Portfolio Style Detection Service
 *
 * Analyzes user-uploaded architectural portfolio images to extract:
 * - Dominant architectural style
 * - Material preferences
 * - Spatial characteristics
 * - Design patterns and proportions
 *
 * Integrates with ML endpoints for deep analysis or provides rule-based fallback.
 */

class PortfolioStyleDetectionService {
  constructor() {
    this.mlEndpoint = process.env.REACT_APP_ML_ENDPOINT || null;
  }

  /**
   * Analyze portfolio images to extract architectural style profile
   *
   * @param {Array} portfolioImages - Array of image objects: [{ url, name, type }]
   * @param {Object} options - Analysis options
   * @returns {Promise<Object>} Style profile with dominant style, materials, characteristics
   */
  async analyzePortfolioStyle(portfolioImages, options = {}) {
    if (!portfolioImages || portfolioImages.length === 0) {
      return this.getDefaultStyleProfile();
    }

    try {
      // Step 4.1: Extract style, materials, and spatial characteristics
      let mlAnalysis = null;

      if (this.mlEndpoint) {
        // Use ML endpoint for deep analysis
        mlAnalysis = await this.applyMLAnalysis(portfolioImages);
      }

      // Fallback to rule-based analysis if ML unavailable or as supplement
      const ruleBasedAnalysis = this.performRuleBasedAnalysis(portfolioImages, mlAnalysis);

      // Combine ML and rule-based insights
      const styleProfile = this.synthesizeStyleProfile(mlAnalysis, ruleBasedAnalysis);

      return {
        success: true,
        styleProfile,
        analysisMethod: this.mlEndpoint ? 'ml-enhanced' : 'rule-based',
        imagesAnalyzed: portfolioImages.length,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('Portfolio style analysis error:', error);
      return {
        success: false,
        styleProfile: this.getDefaultStyleProfile(),
        analysisMethod: 'fallback',
        error: error.message
      };
    }
  }

  /**
   * Apply ML models to extract style features from portfolio images
   *
   * Expected ML endpoint capabilities:
   * - Style classification (ResNet/EfficientNet trained on architectural images)
   * - Material detection (texture analysis)
   * - Spatial pattern recognition (form analysis, proportion systems)
   *
   * @param {Array} portfolioImages - Portfolio image URLs
   * @returns {Promise<Object>} ML analysis results
   */
  async applyMLAnalysis(portfolioImages) {
    try {
      const response = await fetch(`${this.mlEndpoint}/api/v1/analyze-portfolio`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          images: portfolioImages.map(img => ({
            url: img.url,
            name: img.name || 'Untitled',
            type: img.type || 'architectural'
          })),
          tasks: [
            'style_classification',
            'material_detection',
            'spatial_analysis',
            'proportion_analysis',
            'color_palette_extraction'
          ]
        })
      });

      if (!response.ok) {
        throw new Error(`ML endpoint returned ${response.status}`);
      }

      const result = await response.json();

      return {
        dominantStyle: result.style_classification?.dominant || null,
        styleConfidence: result.style_classification?.confidence || 0,
        secondaryStyles: result.style_classification?.secondary || [],
        materials: result.material_detection?.materials || [],
        spatialCharacteristics: {
          formLanguage: result.spatial_analysis?.form_language || 'rectilinear',
          proportionSystem: result.proportion_analysis?.system || 'modernist',
          geometricComplexity: result.spatial_analysis?.complexity || 'medium',
          openness: result.spatial_analysis?.openness || 'balanced'
        },
        colorPalette: result.color_palette_extraction?.palette || [],
        designPatterns: result.spatial_analysis?.patterns || []
      };

    } catch (error) {
      console.warn('ML analysis unavailable, using fallback:', error.message);
      return null;
    }
  }

  /**
   * Rule-based analysis using image metadata and heuristics
   *
   * @param {Array} portfolioImages - Portfolio images
   * @param {Object} mlAnalysis - Optional ML analysis to enhance
   * @returns {Object} Rule-based analysis results
   */
  performRuleBasedAnalysis(portfolioImages, mlAnalysis) {
    // Analyze image names and metadata for style clues
    const nameAnalysis = this.analyzeImageNames(portfolioImages);

    // If ML provided results, use them; otherwise infer from names
    const dominantStyle = mlAnalysis?.dominantStyle || nameAnalysis.inferredStyle || 'Contemporary';

    return {
      dominantStyle,
      confidence: mlAnalysis?.styleConfidence || 0.6,
      materials: mlAnalysis?.materials || this.inferMaterialsFromStyle(dominantStyle),
      spatialCharacteristics: mlAnalysis?.spatialCharacteristics || this.getDefaultSpatialCharacteristics(dominantStyle),
      colorPalette: mlAnalysis?.colorPalette || this.getDefaultColorPalette(dominantStyle),
      designPatterns: mlAnalysis?.designPatterns || []
    };
  }

  /**
   * Analyze image file names for style keywords
   *
   * @param {Array} portfolioImages - Portfolio images
   * @returns {Object} Inferred style from names
   */
  analyzeImageNames(portfolioImages) {
    const styleKeywords = {
      'Modern': ['modern', 'contemporary', 'minimalist', 'sleek'],
      'Traditional': ['traditional', 'classic', 'colonial', 'victorian'],
      'Industrial': ['industrial', 'loft', 'warehouse', 'brick'],
      'Mediterranean': ['mediterranean', 'spanish', 'tuscan', 'villa'],
      'Scandinavian': ['scandinavian', 'nordic', 'scandic', 'hygge'],
      'Mid-Century': ['mid-century', 'midcentury', 'retro', '60s'],
      'Brutalist': ['brutalist', 'concrete', 'raw', 'angular'],
      'Art Deco': ['deco', 'art-deco', 'geometric', 'ornate']
    };

    const styleCounts = {};

    portfolioImages.forEach(img => {
      const nameLower = (img.name || '').toLowerCase();

      Object.entries(styleKeywords).forEach(([style, keywords]) => {
        if (keywords.some(keyword => nameLower.includes(keyword))) {
          styleCounts[style] = (styleCounts[style] || 0) + 1;
        }
      });
    });

    // Find most frequent style
    const inferredStyle = Object.keys(styleCounts).length > 0
      ? Object.entries(styleCounts).sort((a, b) => b[1] - a[1])[0][0]
      : null;

    return { inferredStyle, styleCounts };
  }

  /**
   * Synthesize final style profile from ML and rule-based analyses
   *
   * @param {Object} mlAnalysis - ML analysis results
   * @param {Object} ruleBasedAnalysis - Rule-based analysis results
   * @returns {Object} Synthesized style profile
   */
  synthesizeStyleProfile(mlAnalysis, ruleBasedAnalysis) {
    return {
      dominantStyle: ruleBasedAnalysis.dominantStyle,
      confidence: ruleBasedAnalysis.confidence,
      secondaryStyles: mlAnalysis?.secondaryStyles || [],

      materials: {
        primary: ruleBasedAnalysis.materials.slice(0, 3),
        secondary: ruleBasedAnalysis.materials.slice(3, 6),
        finishes: this.getFinishesForStyle(ruleBasedAnalysis.dominantStyle)
      },

      spatialCharacteristics: {
        formLanguage: ruleBasedAnalysis.spatialCharacteristics.formLanguage,
        proportionSystem: ruleBasedAnalysis.spatialCharacteristics.proportionSystem,
        geometricComplexity: ruleBasedAnalysis.spatialCharacteristics.geometricComplexity,
        openness: ruleBasedAnalysis.spatialCharacteristics.openness,
        ceilingHeights: this.getCeilingHeightsForStyle(ruleBasedAnalysis.dominantStyle),
        windowToWallRatio: this.getWindowRatioForStyle(ruleBasedAnalysis.dominantStyle)
      },

      colorPalette: {
        primary: ruleBasedAnalysis.colorPalette.slice(0, 2),
        accent: ruleBasedAnalysis.colorPalette.slice(2, 4),
        description: this.getColorDescription(ruleBasedAnalysis.dominantStyle)
      },

      designPatterns: ruleBasedAnalysis.designPatterns.length > 0
        ? ruleBasedAnalysis.designPatterns
        : this.getDesignPatternsForStyle(ruleBasedAnalysis.dominantStyle)
    };
  }

  /**
   * Infer materials from architectural style
   *
   * @param {string} style - Architectural style
   * @returns {Array} Material recommendations
   */
  inferMaterialsFromStyle(style) {
    const styleMaterials = {
      'Contemporary': ['Glass', 'Steel', 'Concrete', 'Wood', 'Stone'],
      'Modern': ['Glass', 'Steel', 'Aluminum', 'Composite panels', 'Polished concrete'],
      'Traditional': ['Brick', 'Wood', 'Stone', 'Stucco', 'Clay tiles'],
      'Industrial': ['Exposed brick', 'Steel beams', 'Concrete', 'Metal', 'Reclaimed wood'],
      'Mediterranean': ['Stucco', 'Terracotta tiles', 'Stone', 'Wrought iron', 'Wood'],
      'Scandinavian': ['Light wood', 'White plaster', 'Glass', 'Natural textiles', 'Stone'],
      'Mid-Century': ['Wood', 'Glass', 'Brick', 'Stone', 'Steel'],
      'Brutalist': ['Concrete', 'Exposed aggregate', 'Steel', 'Glass', 'Raw finishes'],
      'Art Deco': ['Marble', 'Chrome', 'Glass', 'Geometric tiles', 'Brass']
    };

    return styleMaterials[style] || styleMaterials['Contemporary'];
  }

  /**
   * Get default spatial characteristics for a style
   *
   * @param {string} style - Architectural style
   * @returns {Object} Spatial characteristics
   */
  getDefaultSpatialCharacteristics(style) {
    const characteristics = {
      'Contemporary': {
        formLanguage: 'rectilinear with curved accents',
        proportionSystem: 'modernist (golden ratio)',
        geometricComplexity: 'medium',
        openness: 'open-plan'
      },
      'Modern': {
        formLanguage: 'pure geometric forms',
        proportionSystem: 'modernist',
        geometricComplexity: 'simple',
        openness: 'very open'
      },
      'Traditional': {
        formLanguage: 'symmetrical, hierarchical',
        proportionSystem: 'classical (1:1.618)',
        geometricComplexity: 'medium',
        openness: 'compartmentalized'
      },
      'Industrial': {
        formLanguage: 'rectilinear, utilitarian',
        proportionSystem: 'modular grid',
        geometricComplexity: 'simple',
        openness: 'very open'
      },
      'Scandinavian': {
        formLanguage: 'simple, organic',
        proportionSystem: 'harmonious proportions',
        geometricComplexity: 'simple',
        openness: 'balanced'
      }
    };

    return characteristics[style] || characteristics['Contemporary'];
  }

  /**
   * Get default color palette for a style
   *
   * @param {string} style - Architectural style
   * @returns {Array} Color palette
   */
  getDefaultColorPalette(style) {
    const palettes = {
      'Contemporary': ['#FFFFFF', '#2C3E50', '#95A5A6', '#E74C3C'],
      'Modern': ['#FFFFFF', '#000000', '#7F8C8D', '#3498DB'],
      'Traditional': ['#F5F5DC', '#8B4513', '#2F4F4F', '#CD853F'],
      'Industrial': ['#2C3E50', '#7F8C8D', '#C0392B', '#ECF0F1'],
      'Mediterranean': ['#FFF8DC', '#D2691E', '#4682B4', '#CD853F'],
      'Scandinavian': ['#FFFFFF', '#F5F5DC', '#8B7355', '#4682B4'],
      'Mid-Century': ['#F5DEB3', '#8B4513', '#FF8C00', '#2F4F4F'],
      'Brutalist': ['#696969', '#A9A9A9', '#2F4F4F', '#FFFFFF']
    };

    return palettes[style] || palettes['Contemporary'];
  }

  /**
   * Get finishes for architectural style
   *
   * @param {string} style - Architectural style
   * @returns {Array} Finish recommendations
   */
  getFinishesForStyle(style) {
    const finishes = {
      'Contemporary': ['Matte paint', 'Polished concrete', 'Natural wood', 'Brushed metal'],
      'Modern': ['High-gloss paint', 'Polished surfaces', 'Glass', 'Stainless steel'],
      'Traditional': ['Eggshell paint', 'Wood stain', 'Natural stone', 'Plaster'],
      'Industrial': ['Exposed finishes', 'Raw concrete', 'Weathered steel', 'Reclaimed wood'],
      'Mediterranean': ['Textured plaster', 'Terracotta', 'Natural stone', 'Wrought iron'],
      'Scandinavian': ['Matte white paint', 'Light wood stain', 'Natural textiles', 'Wool'],
      'Brutalist': ['Exposed concrete', 'Raw aggregate', 'Unfinished surfaces', 'Steel']
    };

    return finishes[style] || finishes['Contemporary'];
  }

  /**
   * Get ceiling heights for architectural style
   *
   * @param {string} style - Architectural style
   * @returns {Object} Ceiling height recommendations
   */
  getCeilingHeightsForStyle(style) {
    const heights = {
      'Contemporary': { min: 2.7, standard: 3.0, grand: 4.5 },
      'Modern': { min: 2.7, standard: 3.0, grand: 5.0 },
      'Traditional': { min: 2.5, standard: 2.7, grand: 3.5 },
      'Industrial': { min: 3.0, standard: 3.5, grand: 6.0 },
      'Mediterranean': { min: 2.5, standard: 2.7, grand: 3.2 },
      'Scandinavian': { min: 2.5, standard: 2.7, grand: 3.0 }
    };

    return heights[style] || heights['Contemporary'];
  }

  /**
   * Get window-to-wall ratio for architectural style
   *
   * @param {string} style - Architectural style
   * @returns {Object} Window ratio recommendations
   */
  getWindowRatioForStyle(style) {
    const ratios = {
      'Contemporary': { min: 0.25, optimal: 0.35, max: 0.60 },
      'Modern': { min: 0.30, optimal: 0.50, max: 0.80 },
      'Traditional': { min: 0.15, optimal: 0.25, max: 0.40 },
      'Industrial': { min: 0.20, optimal: 0.40, max: 0.70 },
      'Mediterranean': { min: 0.15, optimal: 0.25, max: 0.35 },
      'Scandinavian': { min: 0.30, optimal: 0.40, max: 0.60 }
    };

    return ratios[style] || ratios['Contemporary'];
  }

  /**
   * Get color description for architectural style
   *
   * @param {string} style - Architectural style
   * @returns {string} Color palette description
   */
  getColorDescription(style) {
    const descriptions = {
      'Contemporary': 'Neutral base with bold accent colors',
      'Modern': 'Monochromatic with high contrast',
      'Traditional': 'Warm earth tones and natural hues',
      'Industrial': 'Gray scale with metal accents',
      'Mediterranean': 'Warm terracotta and ocean blues',
      'Scandinavian': 'Light neutrals with natural wood tones',
      'Mid-Century': 'Warm woods with retro accent colors',
      'Brutalist': 'Concrete grays with minimal color'
    };

    return descriptions[style] || descriptions['Contemporary'];
  }

  /**
   * Get design patterns for architectural style
   *
   * @param {string} style - Architectural style
   * @returns {Array} Design pattern recommendations
   */
  getDesignPatternsForStyle(style) {
    const patterns = {
      'Contemporary': [
        'Large glazing with minimal frames',
        'Cantilevers and overhangs',
        'Mixed material facades',
        'Clean lines and sharp edges'
      ],
      'Modern': [
        'Floor-to-ceiling windows',
        'Flat or low-slope roofs',
        'Asymmetrical compositions',
        'Integration of indoor-outdoor spaces'
      ],
      'Traditional': [
        'Symmetrical facade composition',
        'Pitched roofs with dormers',
        'Classical proportions',
        'Hierarchical entrance'
      ],
      'Industrial': [
        'Exposed structural elements',
        'Large factory-style windows',
        'Open floor plans',
        'Raw material expression'
      ],
      'Mediterranean': [
        'Arched openings',
        'Terracotta roof tiles',
        'Stucco walls',
        'Courtyards and patios'
      ],
      'Scandinavian': [
        'Simple gabled roofs',
        'Large windows for natural light',
        'Natural material palette',
        'Connection to nature'
      ]
    };

    return patterns[style] || patterns['Contemporary'];
  }

  /**
   * Get default style profile when no portfolio provided
   *
   * @returns {Object} Default style profile
   */
  getDefaultStyleProfile() {
    return {
      dominantStyle: 'Contemporary',
      confidence: 0.5,
      secondaryStyles: [],
      materials: {
        primary: ['Glass', 'Steel', 'Concrete'],
        secondary: ['Wood', 'Stone'],
        finishes: ['Matte paint', 'Polished concrete', 'Natural wood']
      },
      spatialCharacteristics: {
        formLanguage: 'rectilinear with curved accents',
        proportionSystem: 'modernist',
        geometricComplexity: 'medium',
        openness: 'open-plan',
        ceilingHeights: { min: 2.7, standard: 3.0, grand: 4.5 },
        windowToWallRatio: { min: 0.25, optimal: 0.35, max: 0.60 }
      },
      colorPalette: {
        primary: ['#FFFFFF', '#2C3E50'],
        accent: ['#95A5A6', '#E74C3C'],
        description: 'Neutral base with bold accent colors'
      },
      designPatterns: [
        'Large glazing with minimal frames',
        'Cantilevers and overhangs',
        'Mixed material facades',
        'Clean lines and sharp edges'
      ]
    };
  }

  /**
   * Step 4.2: Blend portfolio style with local style
   *
   * @param {Object} portfolioStyle - Portfolio style profile
   * @param {Object} localStyle - Local style from styleDetectionService
   * @param {string} blendingMode - 'signature' (100% portfolio) or 'mix' (blend both)
   * @returns {Object} Blended style recommendations
   */
  blendStyles(portfolioStyle, localStyle, blendingMode = 'mix') {
    if (blendingMode === 'signature') {
      // Use only portfolio style
      return {
        blendingMode: 'signature',
        dominantStyle: portfolioStyle.dominantStyle,
        styleWeighting: { portfolio: 100, local: 0 },
        materials: portfolioStyle.materials,
        spatialCharacteristics: portfolioStyle.spatialCharacteristics,
        colorPalette: portfolioStyle.colorPalette,
        designPatterns: portfolioStyle.designPatterns,
        reasoning: 'Using signature portfolio style exclusively'
      };
    } else {
      // Mix portfolio and local styles (50-50 average)
      return {
        blendingMode: 'mix',
        dominantStyle: `${portfolioStyle.dominantStyle} + ${localStyle.primaryStyle}`,
        styleWeighting: { portfolio: 50, local: 50 },

        materials: {
          primary: this.blendMaterials(
            portfolioStyle.materials.primary,
            localStyle.materials.slice(0, 3)
          ),
          secondary: this.blendMaterials(
            portfolioStyle.materials.secondary,
            localStyle.materials.slice(3, 6)
          ),
          finishes: this.blendArrays(
            portfolioStyle.materials.finishes,
            this.getFinishesForStyle(localStyle.primaryStyle)
          )
        },

        spatialCharacteristics: {
          formLanguage: this.blendFormLanguage(
            portfolioStyle.spatialCharacteristics.formLanguage,
            localStyle.designElements
          ),
          proportionSystem: portfolioStyle.spatialCharacteristics.proportionSystem,
          geometricComplexity: portfolioStyle.spatialCharacteristics.geometricComplexity,
          openness: portfolioStyle.spatialCharacteristics.openness,
          ceilingHeights: portfolioStyle.spatialCharacteristics.ceilingHeights,
          windowToWallRatio: this.averageWindowRatio(
            portfolioStyle.spatialCharacteristics.windowToWallRatio,
            this.getWindowRatioForStyle(localStyle.primaryStyle)
          )
        },

        colorPalette: {
          primary: portfolioStyle.colorPalette.primary,
          accent: this.blendColors(
            portfolioStyle.colorPalette.accent,
            this.getDefaultColorPalette(localStyle.primaryStyle).slice(2, 4)
          ),
          description: `${portfolioStyle.colorPalette.description} with local influences`
        },

        designPatterns: this.blendArrays(
          portfolioStyle.designPatterns,
          localStyle.designElements
        ),

        reasoning: `Blending portfolio style (${portfolioStyle.dominantStyle}) with local style (${localStyle.primaryStyle}) using 50-50 weighting`
      };
    }
  }

  /**
   * Blend two material arrays by interleaving and removing duplicates
   *
   * @param {Array} materials1 - First material list
   * @param {Array} materials2 - Second material list
   * @returns {Array} Blended material list
   */
  blendMaterials(materials1, materials2) {
    const blended = [];
    const maxLength = Math.max(materials1.length, materials2.length);

    for (let i = 0; i < maxLength; i++) {
      if (i < materials1.length && !blended.includes(materials1[i])) {
        blended.push(materials1[i]);
      }
      if (i < materials2.length && !blended.includes(materials2[i])) {
        blended.push(materials2[i]);
      }
    }

    return blended.slice(0, 5); // Limit to 5 materials
  }

  /**
   * Blend two arrays by interleaving
   *
   * @param {Array} arr1 - First array
   * @param {Array} arr2 - Second array
   * @returns {Array} Blended array
   */
  blendArrays(arr1, arr2) {
    const blended = [];
    const maxLength = Math.max(arr1.length, arr2.length);

    for (let i = 0; i < maxLength; i++) {
      if (i < arr1.length && !blended.includes(arr1[i])) {
        blended.push(arr1[i]);
      }
      if (i < arr2.length && !blended.includes(arr2[i])) {
        blended.push(arr2[i]);
      }
    }

    return blended;
  }

  /**
   * Blend form language descriptions
   *
   * @param {string} portfolioForm - Portfolio form language
   * @param {Array} localElements - Local design elements
   * @returns {string} Blended form language
   */
  blendFormLanguage(portfolioForm, localElements) {
    const localInfluences = localElements.slice(0, 2).join(', ');
    return `${portfolioForm} with local influences (${localInfluences})`;
  }

  /**
   * Blend color palettes
   *
   * @param {Array} colors1 - First color palette
   * @param {Array} colors2 - Second color palette
   * @returns {Array} Blended color palette
   */
  blendColors(colors1, colors2) {
    // Take first color from portfolio, second from local
    return [colors1[0], colors2[0]];
  }

  /**
   * Average window-to-wall ratios
   *
   * @param {Object} ratio1 - First window ratio
   * @param {Object} ratio2 - Second window ratio
   * @returns {Object} Averaged window ratio
   */
  averageWindowRatio(ratio1, ratio2) {
    return {
      min: (ratio1.min + ratio2.min) / 2,
      optimal: (ratio1.optimal + ratio2.optimal) / 2,
      max: (ratio1.max + ratio2.max) / 2
    };
  }
}

// Export singleton instance
const portfolioStyleDetectionService = new PortfolioStyleDetectionService();
export default portfolioStyleDetectionService;
