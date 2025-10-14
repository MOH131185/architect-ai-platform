/**
 * Design DNA Generator with OpenAI
 * Creates ultra-detailed building specifications for 80%+ consistency
 */

const OPENAI_API_URL = process.env.NODE_ENV === 'production'
  ? '/api/openai-chat'
  : 'http://localhost:3001/api/openai/chat';

class DesignDNAGenerator {
  /**
   * Generate comprehensive Design DNA using OpenAI GPT-4
   * This creates EXACT specifications for perfect consistency across all outputs
   */
  async generateComprehensiveDesignDNA(projectContext) {
    console.log('🧬 Generating comprehensive Design DNA with OpenAI...');

    try {
      // Prepare context for OpenAI
      const prompt = this.buildDesignDNAPrompt(projectContext);

      // Call OpenAI to generate detailed specifications
      const response = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [
            {
              role: 'system',
              content: 'You are an expert architectural specification generator. Generate extremely detailed, consistent building specifications in JSON format. Be precise, specific, and consistent across all elements.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.3, // Low temperature for consistency
          max_tokens: 2000
        })
      });

      if (!response.ok) {
        console.warn('OpenAI API error, using enhanced fallback');
        return this.generateEnhancedFallbackDNA(projectContext);
      }

      const data = await response.json();
      const dnaText = data.choices[0].message.content;

      // Parse JSON response
      let designDNA;
      try {
        // Try to extract JSON from response
        const jsonMatch = dnaText.match(/\{[\s\S]*\}/);
        designDNA = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(dnaText);
      } catch (e) {
        console.warn('Failed to parse OpenAI JSON, using enhanced fallback');
        return this.generateEnhancedFallbackDNA(projectContext);
      }

      console.log('✅ Comprehensive Design DNA generated with OpenAI');
      return designDNA;

    } catch (error) {
      console.error('Design DNA generation error:', error);
      return this.generateEnhancedFallbackDNA(projectContext);
    }
  }

  /**
   * Build detailed prompt for OpenAI
   */
  buildDesignDNAPrompt(projectContext) {
    const {
      buildingProgram = 'residential building',
      location,
      architecturalStyle = 'contemporary',
      area = 200,
      blendedStyle,
      ukLocationData,
      portfolioStyle
    } = projectContext;

    // Extract UK-specific details
    const ukDetails = ukLocationData ? `
Region: ${ukLocationData.region}
Climate: ${ukLocationData.climateData?.type}
Traditional Style: ${ukLocationData.architecturalData?.traditionalStyles?.[0]?.name}
Local Materials: ${ukLocationData.materials?.walls?.slice(0, 3).join(', ')}
Building Regulations: ${ukLocationData.regulations?.nation}
` : '';

    // Extract blended style details
    const styleDetails = blendedStyle ? `
Blended Style: ${blendedStyle.styleName}
Materials: ${blendedStyle.materials?.slice(0, 5).join(', ')}
Characteristics: ${blendedStyle.characteristics?.slice(0, 5).join(', ')}
` : '';

    return `Generate ultra-detailed architectural specifications for PERFECT CONSISTENCY across all views (floor plans, elevations, sections, 3D visualizations).

PROJECT REQUIREMENTS:
Building Type: ${buildingProgram}
Total Area: ${area}m²
Location: ${location?.address || 'Urban'}
Architectural Style: ${architecturalStyle}
${ukDetails}
${styleDetails}

Generate a JSON object with these EXACT specifications (be extremely specific):

{
  "buildingName": "descriptive name",
  "dimensions": {
    "length": number (in meters, 10-20m),
    "width": number (in meters, 8-15m),
    "height": number (in meters, 6-12m),
    "floorCount": number (1-3 floors),
    "floorHeight": number (2.7-3.5m per floor),
    "totalFootprint": number (calculated)
  },
  "materials": {
    "exterior": {
      "primary": "EXACT material name (e.g., 'red clay brick', 'London stock brick', 'white render')",
      "secondary": "EXACT secondary material",
      "accent": "EXACT accent material",
      "color": "EXACT color description (e.g., 'warm red-brown', 'pale cream', 'charcoal grey')",
      "texture": "EXACT texture (e.g., 'smooth render', 'textured brick', 'rough stone')",
      "finish": "EXACT finish (e.g., 'matte', 'satin', 'polished')"
    },
    "roof": {
      "material": "EXACT roofing material",
      "color": "EXACT roof color",
      "finish": "EXACT finish"
    },
    "windows": {
      "frame": "EXACT frame material and color",
      "glass": "EXACT glass type"
    },
    "doors": {
      "material": "EXACT door material and color"
    }
  },
  "roof": {
    "type": "gable|hip|flat|mansard",
    "pitch": "steep|medium|shallow (EXACT angle if possible)",
    "eaves": "EXACT overhang measurement",
    "features": ["dormers", "chimneys", etc],
    "chimneyCount": number,
    "chimneyMaterial": "EXACT material and color"
  },
  "windows": {
    "type": "sash|casement|modern|picture",
    "pattern": "EXACT grid pattern (e.g., '2x3 grid per floor', 'rhythmic spacing')",
    "height": number (in meters),
    "width": number (in meters),
    "color": "EXACT window frame color",
    "style": "traditional|modern|contemporary",
    "details": ["mullions", "transoms", "shutters", etc]
  },
  "doors": {
    "main": {
      "type": "single|double|grand",
      "height": number,
      "width": number,
      "color": "EXACT color",
      "hardware": "EXACT hardware finish (e.g., 'polished brass', 'black iron')"
    }
  },
  "facade": {
    "composition": "symmetrical|asymmetrical",
    "rhythm": "EXACT description of element spacing",
    "detailing": ["cornices", "quoins", "pilasters", etc],
    "baseColor": "EXACT base color",
    "accentColor": "EXACT accent color"
  },
  "entrance": {
    "position": "center|offset-left|offset-right",
    "direction": "N|S|E|W",
    "features": ["porch", "steps", "canopy", etc],
    "prominence": "grand|modest|recessed"
  },
  "architecturalFeatures": {
    "cornices": "EXACT description",
    "quoins": "EXACT description",
    "stringCourses": "EXACT description",
    "parapets": "EXACT description",
    "otherDetails": []
  },
  "colorPalette": {
    "primary": "EXACT primary color with hex if possible",
    "secondary": "EXACT secondary color",
    "accent": "EXACT accent color",
    "trim": "EXACT trim color",
    "mood": "warm|cool|neutral"
  },
  "styleCharacteristics": [
    "specific characteristic 1",
    "specific characteristic 2",
    "specific characteristic 3"
  ],
  "consistencyNotes": {
    "criticalForAllViews": "What MUST be identical in every view",
    "floorPlanEmphasis": "What to emphasize in floor plans",
    "elevationEmphasis": "What to emphasize in elevations",
    "3dViewEmphasis": "What to emphasize in 3D views"
  }
}

Be EXTREMELY SPECIFIC with colors, materials, and measurements. Use precise architectural terminology. This specification will be used to generate all architectural drawings and must ensure 80%+ visual consistency.`;
  }

  /**
   * Enhanced fallback DNA when OpenAI is unavailable
   */
  generateEnhancedFallbackDNA(projectContext) {
    const {
      buildingProgram = 'house',
      area = 200,
      blendedStyle,
      ukLocationData,
      architecturalStyle = 'contemporary'
    } = projectContext;

    // Calculate dimensions from area
    const floorCount = area < 150 ? 1 : area < 300 ? 2 : 3;
    const footprintArea = area / floorCount;
    const length = Math.sqrt(footprintArea * 1.5);
    const width = Math.sqrt(footprintArea / 1.5);

    // Extract materials from blended style or UK data
    const primaryMaterial = blendedStyle?.materials?.[0] ||
                           ukLocationData?.materials?.walls?.[0] ||
                           'red clay brick';

    const materialColor = this.getMaterialColor(primaryMaterial);

    return {
      buildingName: `${architecturalStyle} ${buildingProgram}`.trim(),
      dimensions: {
        length: Math.round(length * 10) / 10,
        width: Math.round(width * 10) / 10,
        height: floorCount * 3.2,
        floorCount: floorCount,
        floorHeight: 3.2,
        totalFootprint: Math.round(footprintArea)
      },
      materials: {
        exterior: {
          primary: primaryMaterial,
          secondary: blendedStyle?.materials?.[1] || 'white render',
          accent: blendedStyle?.materials?.[2] || 'natural stone',
          color: materialColor,
          texture: this.getMaterialTexture(primaryMaterial),
          finish: 'matte natural'
        },
        roof: {
          material: ukLocationData?.materials?.roofing?.[0] || 'slate tiles',
          color: 'dark grey',
          finish: 'natural matte'
        },
        windows: {
          frame: architecturalStyle.includes('traditional') ? 'white painted timber' : 'anthracite grey aluminium',
          glass: 'clear double-glazed'
        },
        doors: {
          material: 'solid timber painted ' + (architecturalStyle.includes('traditional') ? 'black' : 'charcoal grey')
        }
      },
      roof: {
        type: floorCount > 2 ? 'hip' : 'gable',
        pitch: 'medium 40-45 degrees',
        eaves: '0.4m overhang',
        features: ['chimneys'],
        chimneyCount: Math.min(floorCount, 2),
        chimneyMaterial: primaryMaterial + ' matching walls'
      },
      windows: {
        type: architecturalStyle.includes('traditional') ? 'sash' : 'casement',
        pattern: `regular ${floorCount === 1 ? '4' : floorCount === 2 ? '3x2' : '3x3'} grid per floor`,
        height: 1.5,
        width: 1.2,
        color: architecturalStyle.includes('traditional') ? 'white' : 'anthracite grey',
        style: architecturalStyle.includes('traditional') ? 'traditional' : 'modern',
        details: architecturalStyle.includes('traditional') ? ['glazing bars', 'sills'] : ['minimal frames']
      },
      doors: {
        main: {
          type: 'single',
          height: 2.1,
          width: 1.0,
          color: architecturalStyle.includes('traditional') ? 'black' : 'charcoal grey',
          hardware: architecturalStyle.includes('traditional') ? 'polished brass' : 'brushed stainless steel'
        }
      },
      facade: {
        composition: 'symmetrical',
        rhythm: 'regular window spacing with vertical alignment',
        detailing: architecturalStyle.includes('traditional') ?
                   ['cornices', 'string courses', 'brick headers'] :
                   ['clean lines', 'minimal detailing'],
        baseColor: materialColor,
        accentColor: 'white trim'
      },
      entrance: {
        position: 'center',
        direction: projectContext.entranceDirection || 'S',
        features: architecturalStyle.includes('traditional') ?
                  ['classical porch', 'steps', 'pilasters'] :
                  ['modern canopy', 'level threshold'],
        prominence: 'modest'
      },
      architecturalFeatures: {
        cornices: architecturalStyle.includes('traditional') ? 'painted timber eaves detail' : 'minimal eaves',
        quoins: architecturalStyle.includes('traditional') ? primaryMaterial + ' corner detailing' : 'none',
        stringCourses: architecturalStyle.includes('traditional') ? 'brick band at floor levels' : 'none',
        parapets: floorCount > 2 ? 'brick parapet with stone coping' : 'none',
        otherDetails: blendedStyle?.characteristics?.slice(0, 3) || []
      },
      colorPalette: {
        primary: materialColor,
        secondary: 'white',
        accent: architecturalStyle.includes('traditional') ? 'black' : 'charcoal grey',
        trim: 'white',
        mood: 'warm'
      },
      styleCharacteristics: blendedStyle?.characteristics?.slice(0, 5) || [
        'Clean proportions',
        'Quality materials',
        'Contextual design',
        'Functional layout',
        'Timeless appeal'
      ],
      consistencyNotes: {
        criticalForAllViews: `MUST USE: ${primaryMaterial} (${materialColor}) for ALL exterior walls in EVERY view. ${ukLocationData?.materials?.roofing?.[0] || 'slate'} roof in EVERY view. ${architecturalStyle.includes('traditional') ? 'White' : 'Anthracite grey'} windows in EVERY view.`,
        floorPlanEmphasis: `${Math.round(length)}m × ${Math.round(width)}m footprint, ${floorCount} floors, ${projectContext.entranceDirection || 'S'}-facing entrance`,
        elevationEmphasis: `${primaryMaterial} (${materialColor}) walls, ${ukLocationData?.materials?.roofing?.[0] || 'slate'} roof, symmetrical window pattern, ${floorCount} floor levels`,
        viewEmphasis3d: `Photorealistic ${primaryMaterial} (${materialColor}) texture, accurate proportions ${Math.round(length)}×${Math.round(width)}×${Math.round(floorCount * 3.2)}m, ${ukLocationData?.materials?.roofing?.[0] || 'slate'} roof visible`
      }
    };
  }

  /**
   * Helper: Get color from material name
   */
  getMaterialColor(material) {
    const m = material.toLowerCase();
    if (m.includes('red') && m.includes('brick')) return 'warm red-brown';
    if (m.includes('london stock')) return 'pale yellow-cream';
    if (m.includes('engineering brick')) return 'deep blue-grey';
    if (m.includes('sandstone')) return 'honey gold';
    if (m.includes('limestone')) return 'pale cream';
    if (m.includes('render') && m.includes('white')) return 'pure white';
    if (m.includes('render')) return 'off-white cream';
    if (m.includes('brick')) return 'traditional red-brown';
    if (m.includes('stone')) return 'natural grey';
    return 'natural brick red';
  }

  /**
   * Helper: Get texture from material name
   */
  getMaterialTexture(material) {
    const m = material.toLowerCase();
    if (m.includes('render')) return 'smooth rendered finish';
    if (m.includes('brick')) return 'textured brick with mortar joints';
    if (m.includes('stone')) return 'natural stone texture';
    if (m.includes('timber')) return 'smooth painted timber';
    return 'natural textured surface';
  }
}

export default new DesignDNAGenerator();
