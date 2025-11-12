/**
 * Vercel Serverless Function for Together AI Image Generation (FLUX.1)
 * Proxies requests to Together AI API to keep API keys secure
 * Handles rate limiting with Retry-After header forwarding
 */

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
    const {
      model = 'black-forest-labs/FLUX.1-schnell',
      prompt,
      negativePrompt = '',
      width = 1024,
      height = 1024,
      seed,
      num_inference_steps = 4,
      guidanceScale = 7.8,
      initImage = null,
      imageStrength = 0.55
    } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    // Validate and cap parameters for FLUX.1
    const validatedWidth = Math.min(Math.max(width, 64), 1792);
    const validatedHeight = Math.min(Math.max(height, 64), 1792);
    const maxSteps = model.includes('schnell') ? 12 : 50;
    const validatedSteps = Math.min(Math.max(num_inference_steps, 1), maxSteps);

    const generationMode = initImage ? 'image-to-image' : 'text-to-image';
    console.log(`🎨 [FLUX.1] Generating image (${generationMode}) with model ${model}...`);

    const requestBody = {
      model,
      prompt,
      width: validatedWidth,
      height: validatedHeight,
      seed,
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
      requestBody.init_image = initImage;
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
      console.log(`✅ FLUX.1 image generated successfully (${generationMode})`);
      res.status(200).json({
        url: imageUrl,
        model: model.includes('flux') ? 'flux' : model,
        seed
      });
    } else {
      console.error('❌ No image URL in FLUX.1 response');
      res.status(500).json({ error: 'No image generated' });
    }

  } catch (error) {
    console.error('FLUX.1 generation error:', error);
    res.status(500).json({ error: error.message });
  }
}

