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
 * Based on TOGETHER_AI_PROMPT_LIBRARY.md - Prompt 1
 */
const SYSTEM_PROMPT = `You are an architectural design planner that outputs STRICT JSON only.
Your job: synthesize a Project DNA spec for a small residential project from site, climate, program, portfolio style, and surface polygon.

Rules:
- Snap all geometry to module_mm grid.
- Enforce UK residential heuristics:
  • Min door width ≥ 800mm
  • Corridor ≥ 900mm
  • Stairs 42° max pitch
  • Bathroom not opening directly to living
  • WWR (window-to-wall ratio) between 0.25 and 0.45
  • Head height ≥ 2.0m (2000mm)
- Recommend envelope and window sizing informed by HDD/CDD and prevailing wind.
- Style = blend of location and portfolio vectors (weights provided).
- Output JSON ONLY following the schema. No prose. No markdown.

SCHEMA:
{
  "design_id": "proj_<timestamp>",
  "site": {"lat": null, "lon": null, "north": <deg>},
  "dna": {
    "style": "UK_brick_georgian | modern_brick | contemporary_render | ...",
    "module_mm": 300,
    "wwr": 0.32,
    "roof": "gable_30deg | hip_25deg | flat_5deg",
    "materials": ["local_brick", "stone_lintels", "slate_roof"],
    "climate": {"hdd": 2800, "cdd": 120, "prevailing_wind": "SW"}
  },
  "levels": [{"z": 0, "height_mm": 2700}, {"z": 2700, "height_mm": 2600}],
  "rooms_plan_targets": [
    {"id": "rm_living", "level": 0, "min_area_m2": 20, "near": ["kitchen"], "away_from": ["bathroom"]}
  ],
  "layout": {
    "grid_mm": 300,
    "entry_side": "S",
    "stairs": {"min_clear_width_mm": 900, "max_pitch_deg": 42},
    "corridor_min_width_mm": 900,
    "setbacks_mm": {"N": 0, "S": 0, "E": 0, "W": 0}
  },
  "openings_rules": {
    "door_width_mm": 900,
    "window_sill_mm": 900,
    "window_head_mm": 2100,
    "wwr_target": 0.32,
    "orientation_bias": {"S": 1.0, "E": 0.8, "W": 0.8, "N": 0.6}
  },
  "roof_rules": {"type": "gable", "slope_deg": 30},
  "cameras": {
    "axon": {"type": "ortho", "az": 45, "el": 35, "dist": 22, "fov": 20},
    "persp": {"type": "persp", "az": 60, "el": 20, "dist": 26, "fov": 60},
    "interior_main": {"type": "persp", "target": "rm_living", "fov": 70}
  },
  "seed": 14721
}

Return ONLY valid JSON. No comments. No markdown.`;

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
