/**
 * Enhanced Image Generation Service
 * Uses multiple specialized models for consistent architectural visualization
 * Combines GPT-4o reasoning with specialized image models
 */

import togetherAIReasoningService from './togetherAIReasoningService';

const API_BASE_URL = process.env.REACT_APP_API_PROXY_URL || 'http://localhost:3001';

class EnhancedImageGenerationService {
  constructor() {
    this.consistencyToken = null;
    this.masterSeed = null;
    this.architecturalDNA = null;
  }

  /**
   * Initialize consistency parameters for all generations
   */
  async initializeConsistency(location, specifications, portfolio) {
    // Generate a unique seed for this project
    this.masterSeed = Math.floor(Math.random() * 1000000);

    // Create architectural DNA from inputs
    this.architecturalDNA = await this.generateArchitecturalDNA(location, specifications, portfolio);

    // Create style token for consistency
    this.consistencyToken = `${this.architecturalDNA.style}_${this.architecturalDNA.materials.join('-')}_seed${this.masterSeed}`;

    console.log('🧬 Architectural DNA initialized:', this.architecturalDNA);
    return this.architecturalDNA;
  }

  /**
   * Generate architectural DNA using GPT-4o reasoning
   */
  async generateArchitecturalDNA(location, specifications, portfolio) {
    const prompt = `As an architectural AI, analyze this project and generate consistent design DNA:

Location: ${JSON.stringify(location)}
Specifications: ${JSON.stringify(specifications)}
Portfolio Style: ${portfolio?.analysis?.dominantStyle || 'modern'}

Generate a JSON response with:
{
  "style": "exact architectural style name",
  "materials": ["primary_material", "secondary_material", "accent_material"],
  "color_palette": {
    "primary": "hex_color",
    "secondary": "hex_color",
    "accent": "hex_color",
    "roof": "hex_color"
  },
  "geometry": {
    "roof_type": "gable/hip/flat/shed",
    "roof_angle": "degrees",
    "building_shape": "rectangular/L-shaped/T-shaped",
    "symmetry": "symmetrical/asymmetrical"
  },
  "technical_specs": {
    "wall_thickness": "mm",
    "floor_height": "meters",
    "window_ratio": "percentage",
    "structure_type": "type"
  },
  "consistency_prompt": "detailed description for image generation consistency"
}`;

    try {
      const response = await togetherAIReasoningService.chatCompletion([
        { role: 'system', content: 'You are an architectural design expert. Generate precise technical specifications.' },
        { role: 'user', content: prompt }
      ], {
        model: 'gpt-4',
        temperature: 0.3,
        response_format: { type: "json_object" }
      });

      return JSON.parse(response);
    } catch (error) {
      console.error('Error generating architectural DNA:', error);
      return this.getDefaultArchitecturalDNA();
    }
  }

  /**
   * Generate 2D technical blueprint using specialized model
   */
  async generate2DBlueprint(floorNumber = 0) {
    const blueprintPrompt = this.buildBlueprintPrompt(floorNumber);

    const request = {
      model: 'stable-diffusion-xl',
      prompt: blueprintPrompt,
      negative_prompt: this.getNegativePromptForBlueprints(),
      width: 1024,
      height: 1024,
      seed: this.masterSeed,
      guidance_scale: 12,
      num_inference_steps: 50,
      style_preset: 'architectural-blueprint',
      controlnet_model: 'canny',
      controlnet_strength: 0.8
    };

    try {
      const response = await this.callImageAPI(request);
      return {
        url: response.url,
        type: 'blueprint',
        floor: floorNumber,
        metadata: {
          seed: this.masterSeed,
          consistency_token: this.consistencyToken,
          architectural_dna: this.architecturalDNA
        }
      };
    } catch (error) {
      console.error('Error generating 2D blueprint:', error);
      return this.getFallbackBlueprint(floorNumber);
    }
  }

  /**
   * Generate consistent 3D views using reference image
   */
  async generate3DView(viewType, referenceImage = null) {
    const view3DPrompt = this.build3DPrompt(viewType);

    const request = {
      model: 'flux-kontext-max',
      prompt: view3DPrompt,
      negative_prompt: this.getNegativePromptFor3D(),
      width: 1024,
      height: 1024,
      seed: this.masterSeed,
      guidance_scale: 9,
      num_inference_steps: 30,
      reference_image: referenceImage,
      reference_strength: referenceImage ? 0.7 : 0,
      style_token: this.consistencyToken
    };

    try {
      const response = await this.callImageAPI(request);
      return {
        url: response.url,
        type: '3d_view',
        viewType: viewType,
        metadata: {
          seed: this.masterSeed,
          consistency_token: this.consistencyToken,
          architectural_dna: this.architecturalDNA
        }
      };
    } catch (error) {
      console.error(`Error generating 3D ${viewType}:`, error);
      return this.getFallback3DView(viewType);
    }
  }

  /**
   * Generate technical drawings (elevations and sections)
   */
  async generateTechnicalDrawing(drawingType, direction) {
    const technicalPrompt = this.buildTechnicalPrompt(drawingType, direction);

    const request = {
      model: 'stable-diffusion-xl',
      prompt: technicalPrompt,
      negative_prompt: this.getNegativePromptForTechnical(),
      width: 1792,
      height: 1024,
      seed: this.masterSeed,
      guidance_scale: 15,
      num_inference_steps: 50,
      style_preset: 'line-art',
      controlnet_model: 'lineart',
      controlnet_strength: 0.9
    };

    try {
      const response = await this.callImageAPI(request);
      return {
        url: response.url,
        type: 'technical_drawing',
        drawingType: drawingType,
        direction: direction,
        metadata: {
          seed: this.masterSeed,
          consistency_token: this.consistencyToken,
          architectural_dna: this.architecturalDNA
        }
      };
    } catch (error) {
      console.error(`Error generating ${drawingType} ${direction}:`, error);
      return this.getFallbackTechnicalDrawing(drawingType, direction);
    }
  }

  /**
   * Build blueprint prompt with architectural DNA
   */
  buildBlueprintPrompt(floorNumber) {
    const dna = this.architecturalDNA;
    return `Professional architectural blueprint, floor plan ${floorNumber},
      ${dna.style} style building,
      ${dna.geometry.building_shape} shape,
      wall thickness ${dna.technical_specs.wall_thickness},
      detailed room labels, dimension lines, grid lines,
      scale 1:100, technical drawing, CAD style,
      white background, black lines only,
      ${dna.consistency_prompt},
      architectural blueprint, construction document`;
  }

  /**
   * Build 3D view prompt with architectural DNA
   */
  build3DPrompt(viewType) {
    const dna = this.architecturalDNA;
    const viewDescriptions = {
      'exterior': 'exterior perspective view, front facade',
      'interior': 'interior view, main living space',
      'axonometric': 'axonometric projection, 30-60 degree angle',
      'birds_eye': 'aerial birds eye view, 45 degree angle'
    };

    return `${viewDescriptions[viewType]},
      ${dna.style} architectural style,
      ${dna.materials.join(', ')} materials,
      ${dna.geometry.roof_type} roof at ${dna.geometry.roof_angle} degrees,
      color palette: ${Object.values(dna.color_palette).join(', ')},
      ${dna.consistency_prompt},
      photorealistic architectural visualization,
      professional architectural rendering`;
  }

  /**
   * Build technical drawing prompt
   */
  buildTechnicalPrompt(drawingType, direction) {
    const dna = this.architecturalDNA;
    return `Technical architectural ${drawingType} drawing,
      ${direction} ${drawingType},
      ${dna.style} style building,
      ${dna.geometry.building_shape} shape,
      ${dna.geometry.roof_type} roof,
      floor height ${dna.technical_specs.floor_height}m,
      precise line weights, dimension annotations,
      black and white line drawing,
      technical construction drawing,
      scale 1:100, no shading, clean lines only`;
  }

  /**
   * Negative prompts for quality control
   */
  getNegativePromptForBlueprints() {
    return 'perspective, 3d, isometric, colored, shaded, furniture, people, trees, landscape, photo, realistic, gradient, texture';
  }

  getNegativePromptFor3D() {
    return 'blueprint, technical drawing, line art, sketch, cartoon, anime, low quality, blurry, distorted, text, watermark';
  }

  getNegativePromptForTechnical() {
    return 'perspective, photo, realistic, colored, gradient, shading, shadows, furniture, people, trees, texture, materials';
  }

  /**
   * Call the appropriate image generation API
   */
  async callImageAPI(request) {
    // This will be routed through our proxy server
    const endpoint = `${API_BASE_URL}/api/enhanced-image/generate`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      throw new Error(`Image generation failed: ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Generate complete architectural package
   */
  async generateCompletePackage(location, specifications, portfolio) {
    console.log('🏗️ Starting enhanced architectural generation...');

    // Initialize consistency
    await this.initializeConsistency(location, specifications, portfolio);

    const results = {
      blueprints: [],
      views3D: [],
      technicalDrawings: [],
      metadata: {
        architectural_dna: this.architecturalDNA,
        consistency_token: this.consistencyToken,
        seed: this.masterSeed
      }
    };

    try {
      // 1. Generate 2D Blueprints
      console.log('📐 Generating 2D blueprints...');
      const floors = specifications.floors || 2;
      for (let i = 0; i < floors; i++) {
        const blueprint = await this.generate2DBlueprint(i);
        results.blueprints.push(blueprint);
        await this.delay(2000); // Rate limiting
      }

      // Use first blueprint as reference for 3D consistency
      const referenceBlueprint = results.blueprints[0]?.url;

      // 2. Generate 3D Views
      console.log('🏠 Generating 3D views...');
      const viewTypes = ['exterior', 'interior', 'axonometric', 'birds_eye'];
      for (const viewType of viewTypes) {
        const view3D = await this.generate3DView(viewType, referenceBlueprint);
        results.views3D.push(view3D);
        await this.delay(2000);
      }

      // 3. Generate Technical Drawings
      console.log('📏 Generating technical drawings...');
      const elevations = ['north', 'south', 'east', 'west'];
      for (const direction of elevations) {
        const elevation = await this.generateTechnicalDrawing('elevation', direction);
        results.technicalDrawings.push(elevation);
        await this.delay(2000);
      }

      // Generate sections
      const sections = ['longitudinal', 'transverse'];
      for (const section of sections) {
        const sectionDrawing = await this.generateTechnicalDrawing('section', section);
        results.technicalDrawings.push(sectionDrawing);
        await this.delay(2000);
      }

      console.log('✅ Enhanced generation complete!');
      return results;

    } catch (error) {
      console.error('Error in complete package generation:', error);
      return this.getFallbackPackage();
    }
  }

  /**
   * Utility delay function for rate limiting
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Default architectural DNA fallback
   */
  getDefaultArchitecturalDNA() {
    return {
      style: 'modern',
      materials: ['concrete', 'glass', 'steel'],
      color_palette: {
        primary: '#F5F5F5',
        secondary: '#333333',
        accent: '#0066CC',
        roof: '#555555'
      },
      geometry: {
        roof_type: 'flat',
        roof_angle: '5',
        building_shape: 'rectangular',
        symmetry: 'symmetrical'
      },
      technical_specs: {
        wall_thickness: '300',
        floor_height: '3.0',
        window_ratio: '40',
        structure_type: 'reinforced_concrete'
      },
      consistency_prompt: 'modern minimalist architecture with clean lines'
    };
  }

  /**
   * Fallback methods for error handling
   */
  getFallbackBlueprint(floor) {
    return {
      url: `https://placehold.co/1024x1024/ffffff/000000?text=Floor+Plan+${floor}`,
      type: 'blueprint',
      floor: floor,
      isFallback: true
    };
  }

  getFallback3DView(viewType) {
    return {
      url: `https://placehold.co/1024x1024/e0e0e0/333333?text=${viewType}+View`,
      type: '3d_view',
      viewType: viewType,
      isFallback: true
    };
  }

  getFallbackTechnicalDrawing(drawingType, direction) {
    return {
      url: `https://placehold.co/1792x1024/ffffff/000000?text=${drawingType}+${direction}`,
      type: 'technical_drawing',
      drawingType: drawingType,
      direction: direction,
      isFallback: true
    };
  }

  getFallbackPackage() {
    return {
      blueprints: [this.getFallbackBlueprint(0)],
      views3D: [this.getFallback3DView('exterior')],
      technicalDrawings: [this.getFallbackTechnicalDrawing('elevation', 'front')],
      metadata: {
        error: 'Generation failed - using fallbacks',
        architectural_dna: this.getDefaultArchitecturalDNA()
      }
    };
  }
}

export default new EnhancedImageGenerationService();