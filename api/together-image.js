/**
 * Vercel Serverless Function for Together AI Image Generation (REFACTORED)
 * 
 * REFACTORED: Enforces deterministic seed handling, rate limiting, and normalized responses.
 * Uses FLUX.1-dev for A1 sheet generation with explicit seed propagation.
 */

// Simple in-memory rate limiter for serverless
let lastRequestTime = 0;
const MIN_INTERVAL_MS = 6000; // 6 seconds between requests

async function enforceRateLimit() {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  
  if (timeSinceLastRequest < MIN_INTERVAL_MS) {
    const waitTime = MIN_INTERVAL_MS - timeSinceLastRequest;
    console.log(`⏱️ Rate limiting: waiting ${waitTime}ms`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  
  lastRequestTime = Date.now();
}

export default async function handler(req, res) {
  // Handle OPTIONS for CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Expose-Headers', 'retry-after, x-ratelimit-remaining, x-ratelimit-reset');
    return res.status(200).end();
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const togetherApiKey = process.env.TOGETHER_API_KEY;

  if (!togetherApiKey) {
    console.error('TOGETHER_API_KEY not configured in Vercel environment variables');
    return res.status(500).json({ error: 'Together AI API key not configured' });
  }

  try {
    // Enforce rate limiting
    await enforceRateLimit();

    const {
      model = 'black-forest-labs/FLUX.1-dev',
      prompt,
      negativePrompt = '',
      width = 1792,
      height = 1269,
      seed,
      num_inference_steps = 48,
      guidanceScale = 7.8,
      initImage = null,
      imageStrength = 0.18
    } = req.body;

    if (!prompt) {
      return res.status(400).json({ 
        error: {
          code: 'INVALID_INPUT',
          message: 'Prompt is required',
          details: null
        }
      });
    }

    // Ensure seed is provided (deterministic requirement)
    const effectiveSeed = seed || Date.now();
    if (!seed) {
      console.warn('⚠️ No seed provided, using timestamp. For deterministic behavior, always provide a seed.');
    }

    // Validate and cap parameters for FLUX.1
    const validatedWidth = Math.min(Math.max(width, 64), 1792);
    const validatedHeight = Math.min(Math.max(height, 64), 1792);
    const maxSteps = model.includes('schnell') ? 12 : 50;
    const validatedSteps = Math.min(Math.max(num_inference_steps, 1), maxSteps);

    const generationMode = initImage ? 'image-to-image' : 'text-to-image';
    console.log(`🎨 [FLUX.1] Generating image (${generationMode}) with model ${model}, seed ${effectiveSeed}...`);

    const startTime = Date.now();
    const traceId = `trace_${startTime}_${Math.random().toString(36).substring(2, 9)}`;

    const requestBody = {
      model,
      prompt,
      width: validatedWidth,
      height: validatedHeight,
      seed: effectiveSeed,
      steps: validatedSteps,
      n: 1
    };

    // Add negative prompt if provided
    if (negativePrompt && negativePrompt.length > 0) {
      requestBody.negative_prompt = negativePrompt;
    }

    // Add guidance scale if provided
    if (guidanceScale) {
      requestBody.guidance_scale = guidanceScale;
    }

    // Add image-to-image parameters if initImage provided
    if (initImage) {
      let normalizedInitImage = initImage;

      if (typeof initImage === 'string' && initImage.startsWith('data:')) {
        try {
          const base64Data = initImage.split(',')[1];
          if (base64Data) {
            normalizedInitImage = base64Data;
            console.log('🔧 Normalized init_image: stripped data URL prefix');
          }
        } catch (e) {
          console.warn('⚠️  Failed to normalize init_image, using as-is:', e.message);
        }
      }

      requestBody.init_image = normalizedInitImage;
      requestBody.image_strength = imageStrength;
    }

    const response = await fetch('https://api.together.xyz/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${togetherApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    // Extract rate limit headers
    const retryAfter = response.headers.get('retry-after');
    const rateLimitRemaining = response.headers.get('x-ratelimit-remaining');
    const rateLimitReset = response.headers.get('x-ratelimit-reset');

    // Expose rate limit headers to client
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Expose-Headers', 'retry-after, x-ratelimit-remaining, x-ratelimit-reset');
    
    if (retryAfter) {
      res.setHeader('retry-after', retryAfter);
    }
    if (rateLimitRemaining) {
      res.setHeader('x-ratelimit-remaining', rateLimitRemaining);
    }
    if (rateLimitReset) {
      res.setHeader('x-ratelimit-reset', rateLimitReset);
    }

    // Handle non-JSON responses (e.g., text error messages)
    const contentType = response.headers.get('content-type') || '';
    let data;
    
    try {
      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        // Handle text responses (normalize to JSON structure)
        const text = await response.text();
        data = { error: text, rawText: text };
      }
    } catch (parseError) {
      // If parsing fails, create structured error
      const text = await response.text().catch(() => 'Unknown error');
      data = { error: text, rawText: text, parseError: parseError.message };
    }

    if (!response.ok) {
      // Only log full error details for non-transient errors
      if (response.status === 500 || response.status === 503) {
        console.warn(`⚠️  [FLUX.1] Together AI server error (${response.status}) - this is temporary`);
      } else {
        console.error('❌ FLUX.1 generation error:', data);
      }
      return res.status(response.status).json(data);
    }

    const imageUrl = data.data?.[0]?.url || data.output?.[0];

    if (imageUrl) {
      const latencyMs = Date.now() - startTime;
      console.log(`✅ FLUX.1 image generated successfully (${generationMode}, ${latencyMs}ms)`);
      
      // Normalized response structure
      const normalizedResponse = {
        url: imageUrl,
        seedUsed: effectiveSeed,
        model,
        latencyMs,
        traceId,
        metadata: {
          width: validatedWidth,
          height: validatedHeight,
          steps: validatedSteps,
          guidanceScale,
          generationMode,
          hasInitImage: !!initImage,
          imageStrength: initImage ? imageStrength : null
        },
        // Include raw data for backward compatibility
        raw: data
      };
      
      res.status(200).json(normalizedResponse);
    } else {
      console.error('❌ No image URL in FLUX.1 response');
      res.status(500).json({ 
        error: {
          code: 'NO_IMAGE_GENERATED',
          message: 'No image URL in response',
          details: data
        }
      });
    }

  } catch (error) {
    console.error('FLUX.1 generation error:', error);
    res.status(500).json({ 
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message,
        details: null
      }
    });
  }
}

