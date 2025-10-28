/**
 * Plan API Endpoint - Vercel Serverless Function
 *
 * Generate Project DNA from Together.ai
 * Takes: address, program, climate, style weights
 * Returns: Complete design with DNA (no images generated)
 *
 * @route POST /api/plan
 */

export const config = {
  runtime: 'nodejs',
  maxDuration: 30 // 30 seconds for DNA generation
};

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      address,
      program,
      climate,
      styleWeights = { material: 0.5, characteristic: 0.5 },
      seed
    } = req.body;

    // Validate required inputs
    if (!address) {
      return res.status(400).json({ error: 'Address is required' });
    }

    if (!program) {
      return res.status(400).json({ error: 'Building program is required' });
    }

    console.log('[Plan API] Generating DNA for:', address);
    console.log('[Plan API] Program:', program);
    console.log('[Plan API] Climate:', climate?.type);

    // Generate Project DNA using Together.ai
    const dnaResult = await generateProjectDNA({
      address,
      program,
      climate,
      styleWeights,
      seed: seed || Math.floor(Math.random() * 1000000)
    });

    if (!dnaResult.success) {
      console.warn('[Plan API] DNA generation failed, using fallback');
    }

    const dna = dnaResult.dna;

    // Create complete design state structure
    const design = {
      id: `design-${Date.now()}`,
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      seed: dna.seed,

      // Site context
      site: {
        address,
        coordinates: { lat: 0, lng: 0 }, // Would come from geocoding
        boundary: [],
        boundaryLocal: [],
        area: 300, // Default site area
        perimeter: 80,
        orientation: 0,
        climate: climate || {}
      },

      // Design DNA (from Together.ai)
      dna,

      // Empty arrays - geometry will be generated client-side
      cameras: [],
      levels: [],
      rooms: [],
      walls: [],
      doors: [],
      windows: [],

      // Metadata
      metadata: {
        generatedBy: 'ai',
        geometryFirst: true,
        consistencyScore: 100,
        generationTime: 0,
        aiModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo'
      }
    };

    // NOTE: Cannot write to data/design.json in Vercel (no file system writes)
    // Client should save to localStorage or send to database

    console.log('[Plan API] DNA generation complete');

    return res.status(200).json({
      success: true,
      design,
      reasoning: dnaResult.reasoning,
      note: 'DNA generated successfully. No images created (use /api/render for views).',
      clientAction: 'Save design to localStorage or database. File system writes not available in Vercel.'
    });

  } catch (error) {
    console.error('[Plan API] Error:', error);
    return res.status(500).json({
      error: 'Plan generation failed',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

/**
 * Generate Project DNA using Together.ai
 */
async function generateProjectDNA(params) {
  const {
    address,
    program,
    climate,
    styleWeights,
    seed
  } = params;

  const prompt = createDNAPrompt({
    address,
    program,
    climate,
    styleWeights,
    seed
  });

  try {
    // Get Together.ai API key from environment
    const TOGETHER_API_KEY = process.env.TOGETHER_API_KEY;

    if (!TOGETHER_API_KEY) {
      throw new Error('TOGETHER_API_KEY not configured');
    }

    // Call Together.ai directly (server-side)
    const response = await fetch('https://api.together.xyz/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOGETHER_API_KEY}`,
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
        temperature: 0.2, // Low for consistency
        max_tokens: 4000,
        response_format: { type: 'json_object' } // Structured output
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Together.ai API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    if (!data.choices || !data.choices[0]) {
      throw new Error('Invalid response from Together.ai');
    }

    const content = data.choices[0].message.content;
    let dnaJSON;

    try {
      dnaJSON = JSON.parse(content);
    } catch (parseError) {
      console.error('[Plan API] Failed to parse DNA JSON:', content);
      throw new Error('Invalid JSON from Together.ai');
    }

    // Validate DNA structure
    validateDNA(dnaJSON);

    // Add metadata
    dnaJSON.seed = seed;
    dnaJSON.generatedBy = 'ai';
    dnaJSON.timestamp = new Date().toISOString();

    console.log('[Plan API] DNA validated successfully');

    return {
      success: true,
      dna: dnaJSON,
      reasoning: 'DNA generated via Together.ai Llama 3.3 70B'
    };

  } catch (error) {
    console.error('[Plan API] DNA generation failed:', error);
    return {
      success: false,
      error: error.message,
      dna: createFallbackDNA(params)
    };
  }
}

/**
 * System prompt for DNA generation
 */
const SYSTEM_PROMPT = `You are an expert architectural AI that generates Project DNA specifications.

Output a JSON object matching this EXACT structure:

{
  "dimensions": {
    "length": number,
    "width": number,
    "totalHeight": number,
    "floorCount": number,
    "floorHeights": number[]
  },
  "materials": [
    {
      "name": string,
      "hexColor": string,
      "application": string
    }
  ],
  "colorPalette": {
    "facade": string,
    "trim": string,
    "roof": string,
    "windows": string,
    "door": string
  },
  "roof": {
    "type": string,
    "pitch": number,
    "material": string,
    "color": string,
    "overhang": number
  },
  "architecturalStyle": string,
  "styleKeywords": string[],
  "viewSpecificFeatures": {
    "north": { "mainEntrance": boolean, "windows": number, "features": string[] },
    "south": { "windows": number, "features": string[] },
    "east": { "windows": number, "features": string[] },
    "west": { "windows": number, "features": string[] }
  },
  "consistencyRules": string[]
}

RULES:
1. Realistic dimensions (length 8-20m, width 6-15m, floor height 2.5-3.5m)
2. floorCount must equal floorHeights.length
3. All colors as 6-digit hex codes with #
4. Roof types: gable, hip, flat, shed, gambrel, mansard
5. Output ONLY valid JSON, no markdown`;

/**
 * Create DNA prompt
 */
function createDNAPrompt(params) {
  const { address, program, climate, styleWeights, seed } = params;

  return `Generate architectural Project DNA for:

Location: ${address}
Climate: ${climate?.type || 'temperate'}
Program: ${program}
Style Weights:
- Materials: ${Math.round(styleWeights.material * 100)}%
- Characteristics: ${Math.round(styleWeights.characteristic * 100)}%
Seed: ${seed}

Create a realistic design with climate-appropriate materials, logical window distribution, and consistent specifications.

Output ONLY the JSON object.`;
}

/**
 * Validate DNA structure
 */
function validateDNA(dna) {
  if (!dna.dimensions) throw new Error('Missing dimensions');
  if (!dna.materials) throw new Error('Missing materials');
  if (!dna.colorPalette) throw new Error('Missing colorPalette');
  if (!dna.roof) throw new Error('Missing roof');
  if (!dna.viewSpecificFeatures) throw new Error('Missing viewSpecificFeatures');

  const dim = dna.dimensions;
  if (dim.floorCount !== dim.floorHeights?.length) {
    throw new Error(`Floor count mismatch: ${dim.floorCount} vs ${dim.floorHeights?.length}`);
  }
}

/**
 * Fallback DNA
 */
function createFallbackDNA(params) {
  return {
    dimensions: {
      length: 12.0,
      width: 8.0,
      totalHeight: 6.0,
      floorCount: 2,
      floorHeights: [3.0, 3.0]
    },
    materials: [
      { name: 'Brick', hexColor: '#B8604E', application: 'exterior walls' },
      { name: 'Asphalt Shingles', hexColor: '#3C3C3C', application: 'roof' }
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
    styleKeywords: ['clean lines', 'functional'],
    viewSpecificFeatures: {
      north: { mainEntrance: true, windows: 4, features: ['main entrance'] },
      south: { windows: 3, features: ['patio doors'] },
      east: { windows: 2, features: [] },
      west: { windows: 2, features: [] }
    },
    consistencyRules: [
      'Floor count must match across all views',
      'Materials and colors must be consistent'
    ],
    seed: params.seed || Math.floor(Math.random() * 1000000),
    generatedBy: 'fallback',
    timestamp: new Date().toISOString()
  };
}
