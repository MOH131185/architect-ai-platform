/**
 * Together.ai DNA Generator
 *
 * Uses Together.ai Qwen 2.5 72B to generate Project DNA
 * strictly matching designSchema structure.
 *
 * Temperature: 0.2 (deterministic, consistent)
 * Response Format: JSON (structured output)
 */

/**
 * Generate Project DNA using Together.ai
 */
export async function generateProjectDNA(params) {
  const {
    address,
    program,
    climate,
    styleWeights = {
      material: 0.5,
      characteristic: 0.5
    },
    seed
  } = params;

  console.log('[Together DNA] Generating Project DNA...');
  console.log('  Address:', address);
  console.log('  Program:', program);
  console.log('  Climate:', climate?.type);
  console.log('  Seed:', seed);

  const prompt = createDNAPrompt({
    address,
    program,
    climate,
    styleWeights,
    seed
  });

  try {
    // Call Together.ai API via proxy
    const response = await fetch('/api/together-chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
        messages: [
          {
            role: 'system',
            content: SYSTEM_PROMPT
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.2, // Low temperature for consistency
        max_tokens: 4000,
        response_format: { type: 'json_object' } // Structured JSON output
      })
    });

    if (!response.ok) {
      throw new Error(`Together.ai API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.choices || !data.choices[0]) {
      throw new Error('Invalid response from Together.ai');
    }

    const content = data.choices[0].message.content;
    const dnaJSON = JSON.parse(content);

    // Validate DNA structure
    validateDNA(dnaJSON);

    // Add metadata
    dnaJSON.seed = seed || Math.floor(Math.random() * 1000000);
    dnaJSON.generatedBy = 'ai';
    dnaJSON.timestamp = new Date().toISOString();

    console.log('[Together DNA] Generation successful');
    console.log('  Floor count:', dnaJSON.dimensions.floorCount);
    console.log('  Building size:', `${dnaJSON.dimensions.length}m × ${dnaJSON.dimensions.width}m`);
    console.log('  Style:', dnaJSON.architecturalStyle);

    return {
      success: true,
      dna: dnaJSON,
      reasoning: data.choices[0].message.reasoning || 'DNA generated successfully'
    };

  } catch (error) {
    console.error('[Together DNA] Generation failed:', error);
    return {
      success: false,
      error: error.message,
      fallback: createFallbackDNA(params)
    };
  }
}

/**
 * System prompt for DNA generation
 */
const SYSTEM_PROMPT = `You are an expert architectural AI assistant that generates Project DNA specifications.

Your task is to produce a JSON object that STRICTLY matches the DesignDNA schema:

{
  "dimensions": {
    "length": number (meters, e.g., 12.5),
    "width": number (meters, e.g., 8.0),
    "totalHeight": number (meters, e.g., 6.5),
    "floorCount": number (integer, e.g., 2),
    "floorHeights": number[] (array of heights in meters, e.g., [3.0, 3.0])
  },
  "materials": [
    {
      "name": string (e.g., "Red Brick"),
      "hexColor": string (hex code, e.g., "#B8604E"),
      "application": string (e.g., "exterior walls")
    }
  ],
  "colorPalette": {
    "facade": string (hex color),
    "trim": string (hex color),
    "roof": string (hex color),
    "windows": string (hex color),
    "door": string (hex color)
  },
  "roof": {
    "type": string (one of: "gable", "hip", "flat", "shed", "gambrel", "mansard"),
    "pitch": number (degrees, 0-45),
    "material": string,
    "color": string (hex),
    "overhang": number (meters, typically 0.3-0.8)
  },
  "architecturalStyle": string (e.g., "Modern Residential"),
  "styleKeywords": string[] (e.g., ["clean lines", "functional", "efficient"]),
  "viewSpecificFeatures": {
    "north": {
      "mainEntrance": boolean,
      "windows": number,
      "features": string[]
    },
    "south": {
      "windows": number,
      "features": string[]
    },
    "east": {
      "windows": number,
      "features": string[]
    },
    "west": {
      "windows": number,
      "features": string[]
    }
  },
  "consistencyRules": string[] (e.g., ["Floor count must match across all views"])
}

CRITICAL RULES:
1. Use realistic dimensions (length 8-20m, width 6-15m, height 2.5-3.5m per floor)
2. floorCount must equal floorHeights.length
3. All hex colors must be valid 6-digit hex codes with #
4. Roof pitch for "flat" is 0-5°, "gable"/"hip" is 25-45°
5. Window counts must be reasonable (2-6 per facade)
6. Output ONLY valid JSON, no markdown code blocks
7. Be specific and realistic with materials and colors`;

/**
 * Create DNA generation prompt
 */
function createDNAPrompt(params) {
  const { address, program, climate, styleWeights, seed } = params;

  return `Generate a complete architectural Project DNA for the following requirements:

**Location**: ${address}
**Climate**: ${climate?.type || 'temperate'} (${climate?.seasonal?.summer || 'warm summers'}, ${climate?.seasonal?.winter || 'cool winters'})
**Building Program**: ${program || 'Residential house'}
**Style Weights**:
- Material emphasis: ${Math.round(styleWeights.material * 100)}% (${styleWeights.material > 0.5 ? 'local materials prioritized' : 'custom materials allowed'})
- Characteristic emphasis: ${Math.round(styleWeights.characteristic * 100)}% (${styleWeights.characteristic > 0.5 ? 'regional style' : 'modern interpretation'})
**Seed**: ${seed} (use for deterministic decisions)

Generate a complete DesignDNA JSON object with:
1. Realistic dimensions suitable for the program
2. Climate-appropriate materials and colors
3. Style-appropriate features (entrance placement, window counts, roof type)
4. Consistency rules for cross-view validation

Consider:
- Climate: ${climate?.type} requires appropriate materials and overhangs
- Location context: Use locally-appropriate architectural style
- Program requirements: Ensure adequate floor count and area
- View-specific features: Distribute windows logically across facades

Output ONLY the JSON object, no other text.`;
}

/**
 * Validate DNA structure
 */
function validateDNA(dna) {
  // Check required fields
  if (!dna.dimensions) throw new Error('Missing dimensions');
  if (!dna.materials || !Array.isArray(dna.materials)) throw new Error('Missing or invalid materials');
  if (!dna.colorPalette) throw new Error('Missing colorPalette');
  if (!dna.roof) throw new Error('Missing roof');
  if (!dna.viewSpecificFeatures) throw new Error('Missing viewSpecificFeatures');

  // Validate dimensions
  const dim = dna.dimensions;
  if (!dim.length || !dim.width || !dim.totalHeight) throw new Error('Invalid dimensions');
  if (dim.floorCount !== dim.floorHeights?.length) {
    throw new Error(`Floor count mismatch: ${dim.floorCount} vs ${dim.floorHeights?.length}`);
  }

  // Validate colors
  const hexColorPattern = /^#[0-9A-Fa-f]{6}$/;
  if (!hexColorPattern.test(dna.colorPalette.facade)) throw new Error('Invalid facade color');
  if (!hexColorPattern.test(dna.colorPalette.roof)) throw new Error('Invalid roof color');

  // Validate roof type
  const validRoofTypes = ['gable', 'hip', 'flat', 'shed', 'gambrel', 'mansard'];
  if (!validRoofTypes.includes(dna.roof.type)) {
    throw new Error(`Invalid roof type: ${dna.roof.type}`);
  }

  console.log('[Together DNA] Validation passed');
}

/**
 * Create fallback DNA if generation fails
 */
function createFallbackDNA(params) {
  const { seed, program } = params;

  console.warn('[Together DNA] Using fallback DNA');

  return {
    dimensions: {
      length: 12.0,
      width: 8.0,
      totalHeight: 6.0,
      floorCount: 2,
      floorHeights: [3.0, 3.0]
    },
    materials: [
      {
        name: 'Brick',
        hexColor: '#B8604E',
        application: 'exterior walls'
      },
      {
        name: 'Asphalt Shingles',
        hexColor: '#3C3C3C',
        application: 'roof'
      }
    ],
    colorPalette: {
      facade: '#B8604E',
      trim: '#FFFFFF',
      roof: '#3C3C3C',
      windows: '#2C3E50',
      door: '#8B4513'
    },
    roof: {
      type: 'gable',
      pitch: 35,
      material: 'Asphalt Shingles',
      color: '#3C3C3C',
      overhang: 0.5
    },
    architecturalStyle: 'Modern Residential',
    styleKeywords: ['clean lines', 'functional', 'efficient'],
    viewSpecificFeatures: {
      north: {
        mainEntrance: true,
        windows: 4,
        features: ['main entrance centered']
      },
      south: {
        windows: 3,
        features: ['patio doors']
      },
      east: {
        windows: 2,
        features: []
      },
      west: {
        windows: 2,
        features: []
      }
    },
    consistencyRules: [
      'Floor count must match across all views',
      'Materials and colors must be consistent',
      'Window counts must match between floor plans and elevations'
    ],
    seed: seed || Math.floor(Math.random() * 1000000),
    generatedBy: 'fallback',
    timestamp: new Date().toISOString()
  };
}

export default {
  generateProjectDNA
};
