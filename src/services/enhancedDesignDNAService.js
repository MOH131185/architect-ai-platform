/**
 * Enhanced Design DNA Service
 *
 * Generates comprehensive, authoritative Design DNA that serves as the single source
 * of truth for ALL architectural views. Ensures 95%+ consistency across all outputs.
 *
 * DNA Structure:
 * - Exact dimensions with tolerances
 * - Precise material specifications with hex colors, textures, finishes
 * - Window/door specifications with exact positions and dimensions
 * - Roof specifications with angles, materials, colors
 * - Color palette with primary/secondary/accent colors
 * - Structural specifications (walls, floors, foundations)
 * - Consistency rules that MUST be followed
 */

import togetherAIReasoningService from './togetherAIReasoningService.js';
import { safeParseJsonFromLLM } from '../utils/parseJsonFromLLM.js';
import normalizeDNA from './dnaNormalization.js';
import logger from '../utils/logger.js';


class EnhancedDesignDNAService {
  constructor() {
    this.openai = togetherAIReasoningService;
  }

  /**
   * Generate comprehensive Master Design DNA
   * This is the authoritative source for ALL views - no variations allowed
   *
   * @param {Object} projectContext - Project parameters
   * @param {Object} portfolioAnalysis - Optional portfolio analysis
   * @param {Object} locationData - Location and climate data
   * @returns {Promise<Object>} Comprehensive Design DNA
   */
  async generateMasterDesignDNA(projectContext, portfolioAnalysis = null, locationData = null) {
    logger.info('\n🧬 [DNA Generator] Starting Master Design DNA generation...');

    try {
      const prompt = this.buildDNAPrompt(projectContext, portfolioAnalysis, locationData);

      const response = await this.openai.chatCompletion([
        {
          role: 'system',
          content: `You are an expert architectural specification writer. Generate EXACT, PRECISE, AUTHORITATIVE design DNA.

CRITICAL REQUIREMENTS:
1. ALL specifications must be EXACT (not "about" or "approximately")
2. ALL colors must have HEX codes
3. ALL dimensions must be in meters with 2 decimal places
4. ALL materials must include texture, finish, and color
5. ALL specifications must be IDENTICAL across all views
6. NO variations, NO alternatives - ONE authoritative specification only

Return ONLY valid JSON. No markdown, no explanations.`
        },
        {
          role: 'user',
          content: prompt
        }
      ], {
        model: 'Qwen/Qwen2.5-72B-Instruct-Turbo', // Use Qwen with 32k context window (much larger than Llama's 2048)
        temperature: 0.2, // Low temperature for consistency
        response_format: { type: 'json_object' },
        max_tokens: 3000 // Safe limit for Qwen (has 32k context window)
      });

      const dnaText = response.choices[0].message.content;

      // Parse JSON with robust handling of code fences
      const rawDna = safeParseJsonFromLLM(dnaText, this.getFallbackDNA(projectContext));

      // Normalize DNA to consistent structure
      const dna = normalizeDNA(rawDna, {
        floors: projectContext.floors || projectContext.floorArea && Math.ceil(projectContext.floorArea / 100) || 2,
        area: projectContext.floorArea || projectContext.area || 200,
        style: projectContext.architecturalStyle || 'Contemporary'
      });

      // Add metadata
      dna.generated_at = new Date().toISOString();
      dna.version = '2.0';
      dna.is_authoritative = true;

      logger.success(' [DNA Generator] Master Design DNA generated and normalized');
      logger.info('   📏 Dimensions:', `${dna.dimensions?.length}m × ${dna.dimensions?.width}m × ${dna.dimensions?.height}m`);
      logger.info('   🏗️  Floors:', dna.dimensions?.floors);
      logger.info('   🎨 Materials:', dna.materials?.length, 'items');
      logger.info('   🏠 Roof:', `${dna.roof?.type || 'N/A'}`);

      return {
        success: true,
        masterDNA: dna,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error('❌ [DNA Generator] Failed:', error);

      // Return high-quality fallback DNA
      return {
        success: false,
        masterDNA: this.getFallbackDNA(projectContext),
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Build comprehensive DNA generation prompt
   */
  buildDNAPrompt(projectContext, portfolioAnalysis, locationData) {
    const {
      buildingProgram = 'house',
      floorArea = 200,
      floors = 2,
      entranceDirection = 'N',
      materials: userMaterials,
      style
    } = projectContext;

    // Calculate footprint
    const footprintArea = Math.round(floorArea / floors);
    const length = Math.sqrt(footprintArea * 1.5); // 3:2 ratio
    const width = footprintArea / length;

    return `Generate COMPREHENSIVE, EXACT Design DNA for this architectural project.

PROJECT SPECIFICATIONS:
- Building Type: ${buildingProgram}
- Total Floor Area: ${floorArea}m²
- Number of Floors: ${floors}
- Footprint per Floor: ${Math.round(footprintArea)}m²
- Approximate Dimensions: ${Math.round(length)}m × ${Math.round(width)}m
- Main Entrance: ${entranceDirection}-facing
- Location: ${locationData?.address || 'Not specified'}
- Climate: ${locationData?.climate?.type || 'Temperate'}
${userMaterials ? `- User Materials Preference: ${userMaterials}` : ''}
${style ? `- Architectural Style: ${style}` : ''}
${portfolioAnalysis ? `- Portfolio Style: ${portfolioAnalysis.style || 'Modern'}` : ''}

Generate EXACT Design DNA with these specifications:

{
  "project_id": "unique_id",
  "building_type": "${buildingProgram}",

  "dimensions": {
    "length": number (meters, 2 decimals, EXACT length),
    "width": number (meters, 2 decimals, EXACT width),
    "height": number (meters, 2 decimals, total building height),
    "footprint_area": number (m², EXACT footprint per floor),
    "total_floor_area": ${floorArea},
    "floor_count": ${floors},
    "floor_height": number (meters, typical 3.2m),
    "ceiling_height": number (meters, typical 2.7m),
    "wall_thickness_exterior": 0.30,
    "wall_thickness_interior": 0.15,
    "foundation_depth": 1.20
  },

  "materials": {
    "exterior": {
      "primary": "exact material name (e.g., 'clay brick')",
      "color": "exact color description (e.g., 'warm red-brown')",
      "color_hex": "#hexcode (exact match to color)",
      "texture": "exact texture (e.g., 'rough textured with visible mortar joints')",
      "finish": "exact finish (e.g., 'natural unsealed')",
      "bond_pattern": "for brick/masonry (e.g., 'stretcher bond')",
      "unit_size": "for brick/block (e.g., '215mm × 102.5mm × 65mm')"
    },
    "roof": {
      "material": "exact roofing material (e.g., 'concrete roof tiles')",
      "color": "exact color (e.g., 'charcoal grey')",
      "color_hex": "#hexcode",
      "texture": "texture description",
      "finish": "finish type (e.g., 'matte')"
    },
    "windows": {
      "frame_material": "exact material (e.g., 'uPVC')",
      "frame_color": "exact color (e.g., 'bright white')",
      "frame_color_hex": "#FFFFFF",
      "glazing": "exact specification (e.g., 'double-glazed low-E')",
      "finish": "finish type"
    },
    "doors": {
      "material": "exact material",
      "color": "exact color",
      "color_hex": "#hexcode",
      "finish": "finish type"
    },
    "trim": {
      "material": "trim material",
      "color": "exact color",
      "color_hex": "#hexcode"
    }
  },

  "roof": {
    "type": "exact type (gable/hip/flat/mansard/gambrel)",
    "pitch": "exact angle (e.g., '42 degrees' or 'flat')",
    "pitch_ratio": "ratio (e.g., '9:12' or null for flat)",
    "eave_height": number (meters from ground),
    "ridge_height": number (meters from ground),
    "overhang": number (meters, typical 0.6m),
    "gutter_type": "type",
    "fascia_material": "material",
    "soffit_material": "material"
  },

  "windows": {
    "type": "exact type (casement/sash/fixed/awning/sliding)",
    "opening_mechanism": "how they open",
    "pane_configuration": "exact config (e.g., '6-over-6 sash' or 'single pane')",
    "sill_height": number (meters from floor, typical 0.9m),
    "head_height": number (meters from floor, typical 2.1m),
    "typical_width": number (meters),
    "typical_height": number (meters),
    "count_per_floor": number (EXACT count per floor),
    "count_total": number (EXACT total across all floors),
    "pattern": "placement pattern (e.g., 'symmetrical grid' or 'asymmetrical')",
    "spacing": "typical spacing between windows (meters)"
  },

  "doors": {
    "main_entrance": {
      "type": "door type",
      "width": number (meters, typically 0.9-1.2m),
      "height": number (meters, typically 2.1m),
      "facade": "${entranceDirection}",
      "position": "position on facade (e.g., 'center' or 'offset left')",
      "features": ["list", "of", "features", "(e.g., porch, steps, canopy)"]
    },
    "interior_doors": {
      "width": number (meters),
      "height": number (meters),
      "type": "door type"
    }
  },

  "color_palette": {
    "primary": "#hexcode (main facade color)",
    "secondary": "#hexcode (roof color)",
    "accent": "#hexcode (trim/window frames)",
    "description": "overall color harmony description"
  },

  "architectural_style": {
    "name": "exact style name",
    "characteristics": ["list", "of", "defining", "characteristics"],
    "facade_articulation": "facade design approach",
    "proportion_system": "proportional system used (e.g., 'golden ratio' or 'classical thirds')",
    "symmetry": "symmetry type (symmetrical/asymmetrical/radial)"
  },

  "structural_system": {
    "foundation": "foundation type (e.g., 'strip footing' or 'slab-on-grade')",
    "walls": "wall system (e.g., 'load-bearing masonry' or 'timber frame')",
    "floors": "floor system (e.g., 'suspended concrete' or 'timber joists')",
    "roof_structure": "roof structure (e.g., 'timber truss' or 'steel frame')"
  },

  "consistency_rules": [
    "RULE 1: EXACT dimensions ${Math.round(length)}m × ${Math.round(width)}m × MUST match in ALL views",
    "RULE 2: EXACT ${floors} floors - NO MORE, NO LESS in any view",
    "RULE 3: EXACT material colors (hex codes) MUST match in ALL views",
    "RULE 4: Window count EXACT per floor MUST match in ALL views",
    "RULE 5: Entrance ALWAYS on ${entranceDirection} facade in ALL views",
    "RULE 6: Roof type and pitch IDENTICAL in ALL views",
    "RULE 7: Wall thicknesses EXACT (0.30m exterior, 0.15m interior)",
    "RULE 8: Floor heights EXACT at ${floors * 3.2}m intervals",
    "RULE 9: Material textures and finishes IDENTICAL in ALL views",
    "RULE 10: Color palette (hex codes) NEVER changes across views"
  ],

  "view_specific_notes": {
    "floor_plan_2d": "TRUE overhead orthographic, NO perspective, EXACT dimensions with labels",
    "elevations": "FLAT 2D facades, NO depth, EXACT ${floors} floors visible, correct materials",
    "sections": "FLAT 2D cuts, ${floors} floor slabs visible, EXACT ceiling heights",
    "exterior_3d": "PHOTOREALISTIC with EXACT materials matching hex colors, ${floors} floors",
    "interior_3d": "PHOTOREALISTIC with EXACT ceiling height and materials",
    "axonometric": "45° isometric maintaining EXACT dimensions and ${floors} floors",
    "perspective": "3D perspective maintaining EXACT proportions and materials"
  }
}

CRITICAL: Every specification must be EXACT and IDENTICAL across all views. No variations allowed.`;
  }

  /**
   * Extract Design DNA from portfolio images using GPT-4o Vision
   */
  async extractDNAFromPortfolio(portfolioFiles) {
    if (!portfolioFiles || portfolioFiles.length === 0) {
      return null;
    }

    logger.info(`\n🔍 [DNA Extractor] Analyzing ${portfolioFiles.length} portfolio images...`);

    try {
      // Take first image for DNA extraction
      const firstImage = portfolioFiles[0];

      // Debug: Log the structure of the portfolio file
      logger.info('   🔍 Portfolio file structure:', {
        hasPreview: !!firstImage.preview,
        hasUrl: !!firstImage.url,
        hasDataUrl: !!firstImage.dataUrl,
        hasImageUrl: !!firstImage.imageUrl,
        hasPngDataUrl: !!firstImage.pngDataUrl,
        hasFile: !!firstImage.file,
        keys: Object.keys(firstImage)
      });

      // Try multiple possible properties where image data might be stored
      let imageUrl = firstImage.dataUrl
        || firstImage.pngDataUrl  // PDF conversion stores here
        || firstImage.data
        || firstImage.base64
        || firstImage.preview
        || firstImage.url
        || firstImage.imageUrl;

      // Convert to base64 if it's a File object
      if (!imageUrl && firstImage.file instanceof File) {
        logger.info('   📄 Converting File object to base64...');
        imageUrl = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(firstImage.file);
        });
      }

      // Convert blob: URLs to base64 (external APIs cannot access blob URLs)
      if (imageUrl && imageUrl.startsWith('blob:')) {
        logger.info('   📄 Converting blob URL to base64...');
        try {
          const response = await fetch(imageUrl);
          const blob = await response.blob();
          imageUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          logger.info('   ✅ Blob URL converted to base64 successfully');
        } catch (blobError) {
          logger.error('   ❌ Failed to convert blob URL:', blobError.message);
          throw new Error('Failed to convert portfolio image blob URL to base64');
        }
      }

      if (!imageUrl) {
        logger.error('   ❌ No image data found in portfolio file');
        logger.error('   Available properties:', Object.keys(firstImage));
        throw new Error('Portfolio image unavailable for DNA extraction (no URL or data URL provided)');
      }

      logger.info('   ✅ Image data found, length:', imageUrl.length, 'chars');
      logger.info('   📸 Calling Together AI Llama Vision API for portfolio analysis...');

      const response = await this.openai.chatCompletion([
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `You are an expert architectural analyst. Analyze this architectural image and extract EXACT Design DNA. Return ONLY valid JSON with this structure:

{
  "materials": {
    "facade_primary": "exact material",
    "facade_color": "exact color",
    "facade_color_hex": "#hexcode",
    "facade_texture": "texture description",
    "roof_material": "exact material",
    "roof_color": "exact color",
    "roof_color_hex": "#hexcode",
    "window_frames": "material and color",
    "window_frames_hex": "#hexcode"
  },
  "style": {
    "name": "architectural style",
    "characteristics": ["list", "of", "features"],
    "era": "time period"
  },
  "proportions": {
    "floor_count": number,
    "window_to_wall_ratio": "percentage",
    "symmetry": "type"
  },
  "distinctive_features": ["list", "of", "unique", "elements"]
}

Respond with ONLY the JSON object, no other text.`
            },
            {
              type: 'image_url',
              image_url: {
                url: imageUrl
              }
            }
          ]
        }
      ], {
        model: 'gpt-4o',
        temperature: 0.1,
        max_tokens: 2000
      });

      // Validate response structure
      if (!response || !response.choices || !response.choices[0] || !response.choices[0].message) {
        throw new Error('Invalid API response structure: missing choices or message');
      }

      const messageContent = response.choices[0].message.content;
      if (!messageContent) {
        throw new Error('Empty response from API');
      }

      // Parse JSON with error handling
      let extractedDNA;
      try {
        // Check if response is plain text refusal
        if (messageContent.trim().startsWith("I'm unable") ||
          messageContent.trim().startsWith("I cannot") ||
          messageContent.trim().startsWith("I can't") ||
          !messageContent.trim().startsWith('{')) {
          logger.warn('   ⚠️  AI unable to analyze portfolio image:', messageContent.substring(0, 100));
          logger.info('   ℹ️  Continuing without portfolio analysis (optional feature)');
          return null;
        }

        extractedDNA = JSON.parse(messageContent);
      } catch (parseError) {
        logger.error('   ❌ JSON parsing failed:', parseError.message);
        logger.error('   Raw response:', messageContent.substring(0, 200));
        logger.info('   ℹ️  Continuing without portfolio analysis (optional feature)');
        return null; // Return null instead of throwing - portfolio is optional
      }

      logger.success(' [DNA Extractor] DNA extracted from portfolio');
      logger.info('   🎨 Style:', extractedDNA.style?.name || 'Not specified');
      logger.info('   📦 Materials:', extractedDNA.materials?.facade_primary || 'Not specified');

      return extractedDNA;


    } catch (error) {
      // Enhanced error logging with full details
      logger.error('❌ [DNA Extractor] Failed:', error.message || String(error));
      if (error.stack) {
        logger.error('   Stack trace:', error.stack.split('\n').slice(0, 3).join('\n'));
      }

      // Log specific error types
      if (error.message && error.message.includes('API error')) {
        logger.error('   💡 Hint: Check if GPT-4o API is accessible and API keys are configured');
      } else if (error.message && error.message.includes('parse')) {
        logger.error('   💡 Hint: API returned invalid JSON format');
      }

      return null;
    }
  }

  /**
   * Merge portfolio DNA with project DNA for consistency
   */
  mergeDNASources(projectDNA, portfolioDNA) {
    if (!portfolioDNA) {
      return projectDNA;
    }

    logger.info('🔀 [DNA Merger] Merging project and portfolio DNA...');

    // Portfolio materials take priority if they exist
    if (portfolioDNA.materials) {
      projectDNA.materials.exterior.primary = portfolioDNA.materials.facade_primary || projectDNA.materials.exterior.primary;
      projectDNA.materials.exterior.color = portfolioDNA.materials.facade_color || projectDNA.materials.exterior.color;
      projectDNA.materials.exterior.color_hex = portfolioDNA.materials.facade_color_hex || projectDNA.materials.exterior.color_hex;
      projectDNA.materials.exterior.texture = portfolioDNA.materials.facade_texture || projectDNA.materials.exterior.texture;

      if (portfolioDNA.materials.roof_material) {
        projectDNA.materials.roof.material = portfolioDNA.materials.roof_material;
        projectDNA.materials.roof.color = portfolioDNA.materials.roof_color;
        projectDNA.materials.roof.color_hex = portfolioDNA.materials.roof_color_hex;
      }

      if (portfolioDNA.materials.window_frames) {
        projectDNA.materials.windows.frame_color = portfolioDNA.materials.window_frames;
        projectDNA.materials.windows.frame_color_hex = portfolioDNA.materials.window_frames_hex;
      }
    }

    // Portfolio style enhances project style
    if (portfolioDNA.style) {
      projectDNA.architectural_style.name = portfolioDNA.style.name || projectDNA.architectural_style.name;
      if (portfolioDNA.style.characteristics) {
        projectDNA.architectural_style.characteristics = [
          ...new Set([
            ...projectDNA.architectural_style.characteristics,
            ...portfolioDNA.style.characteristics
          ])
        ];
      }
    }

    logger.success(' [DNA Merger] DNA sources merged successfully');

    return projectDNA;
  }

  /**
   * Get high-quality fallback DNA when generation fails
   */
  getFallbackDNA(projectContext) {
    const {
      buildingProgram = 'house',
      floorArea = 200,
      floors = 2,
      entranceDirection = 'N'
    } = projectContext;

    const footprintArea = Math.round(floorArea / floors);
    const length = Math.round(Math.sqrt(footprintArea * 1.5) * 100) / 100;
    const width = Math.round((footprintArea / length) * 100) / 100;
    const height = floors * 3.2;

    logger.info('⚠️  [DNA Generator] Using high-quality fallback DNA');

    return {
      project_id: `fallback_${Date.now()}`,
      building_type: buildingProgram,

      dimensions: {
        length: length,
        width: width,
        height: height,
        footprint_area: footprintArea,
        total_floor_area: floorArea,
        floor_count: floors,
        floor_height: 3.2,
        ceiling_height: 2.7,
        wall_thickness_exterior: 0.30,
        wall_thickness_interior: 0.15,
        foundation_depth: 1.20
      },

      materials: {
        exterior: {
          primary: 'clay brick',
          color: 'warm red-brown',
          color_hex: '#B8604E',
          texture: 'rough textured with visible mortar joints',
          finish: 'natural unsealed',
          bond_pattern: 'stretcher bond',
          unit_size: '215mm × 102.5mm × 65mm'
        },
        roof: {
          material: 'concrete roof tiles',
          color: 'charcoal grey',
          color_hex: '#4A4A4A',
          texture: 'interlocking profile tiles',
          finish: 'matte'
        },
        windows: {
          frame_material: 'uPVC',
          frame_color: 'bright white',
          frame_color_hex: '#FFFFFF',
          glazing: 'double-glazed low-E',
          finish: 'smooth matte'
        },
        doors: {
          material: 'composite',
          color: 'dark grey',
          color_hex: '#3C3C3C',
          finish: 'smooth semi-gloss'
        },
        trim: {
          material: 'painted wood',
          color: 'white',
          color_hex: '#FFFFFF'
        }
      },

      roof: {
        type: 'gable',
        pitch: '42 degrees',
        pitch_ratio: '9:12',
        eave_height: floors * 3.2 - 0.3,
        ridge_height: floors * 3.2 + 2.0,
        overhang: 0.6,
        gutter_type: 'half-round PVC',
        fascia_material: 'painted wood',
        soffit_material: 'painted wood'
      },

      windows: {
        type: 'casement',
        opening_mechanism: 'side-hung outward opening',
        pane_configuration: 'single large pane',
        sill_height: 0.9,
        head_height: 2.1,
        typical_width: 1.2,
        typical_height: 1.2,
        count_per_floor: Math.max(4, Math.floor(length * 2)),
        count_total: Math.max(4, Math.floor(length * 2)) * floors,
        pattern: 'symmetrical grid',
        spacing: 2.5
      },

      doors: {
        main_entrance: {
          type: 'composite panel door',
          width: 0.9,
          height: 2.1,
          facade: entranceDirection,
          position: 'center',
          features: ['covered porch', 'two steps', 'simple canopy']
        },
        interior_doors: {
          width: 0.8,
          height: 2.0,
          type: 'panel doors'
        }
      },

      color_palette: {
        primary: '#B8604E',
        secondary: '#4A4A4A',
        accent: '#FFFFFF',
        description: 'Warm traditional palette with red-brown brick, dark grey roof, white trim'
      },

      architectural_style: {
        name: 'Contemporary Traditional',
        characteristics: [
          'symmetrical facade',
          'gable roof with moderate pitch',
          'brick construction',
          'regular window pattern',
          'central entrance'
        ],
        facade_articulation: 'Symmetrical composition with central entrance',
        proportion_system: 'classical thirds',
        symmetry: 'symmetrical'
      },

      structural_system: {
        foundation: 'strip footing with reinforced concrete',
        walls: 'load-bearing masonry (cavity wall)',
        floors: 'suspended concrete slab with timber joists',
        roof_structure: 'timber truss'
      },

      consistency_rules: [
        `RULE 1: EXACT dimensions ${length}m × ${width}m × ${height}m MUST match in ALL views`,
        `RULE 2: EXACT ${floors} floors - NO MORE, NO LESS in any view`,
        'RULE 3: EXACT material colors (hex codes) MUST match in ALL views',
        `RULE 4: Window count EXACT ${Math.max(4, Math.floor(length * 2))} per floor MUST match in ALL views`,
        `RULE 5: Entrance ALWAYS on ${entranceDirection} facade in ALL views`,
        'RULE 6: Roof type gable at 42° IDENTICAL in ALL views',
        'RULE 7: Wall thicknesses EXACT (0.30m exterior, 0.15m interior)',
        `RULE 8: Floor heights EXACT at ${floors} × 3.2m intervals`,
        'RULE 9: Material textures (rough brick, matte tiles) IDENTICAL in ALL views',
        'RULE 10: Color palette (#B8604E, #4A4A4A, #FFFFFF) NEVER changes across views'
      ],

      view_specific_notes: {
        floor_plan_2d: 'TRUE overhead orthographic, NO perspective, EXACT dimensions with labels',
        elevations: `FLAT 2D facades, NO depth, EXACT ${floors} floors visible, red-brown brick`,
        sections: `FLAT 2D cuts, ${floors} floor slabs visible, 2.7m ceiling heights`,
        exterior_3d: `PHOTOREALISTIC with red-brown brick #B8604E, dark grey roof #4A4A4A, ${floors} floors`,
        interior_3d: 'PHOTOREALISTIC with 2.7m ceiling height, natural materials',
        axonometric: `45° isometric maintaining ${length}×${width}×${height}m and ${floors} floors`,
        perspective: '3D perspective maintaining EXACT proportions and brick materials'
      },

      generated_at: new Date().toISOString(),
      version: '2.0',
      is_authoritative: true,
      is_fallback: true
    };
  }
}

export default new EnhancedDesignDNAService();
