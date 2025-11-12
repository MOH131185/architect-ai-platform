/**
 * Vercel Serverless Function for Image Generation
 * FLUX.1 Redirect - All image generation now uses FLUX.1 via Together AI
 * (matches server.js behavior for dev/prod consistency)
 */

export default async function handler(req, res) {
  // Handle OPTIONS for CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  console.log('🔄 [Redirect] DALL-E 3 endpoint called - using FLUX.1 instead...');

  const togetherApiKey = process.env.TOGETHER_API_KEY;

  if (!togetherApiKey) {
    return res.status(500).json({ error: 'Together AI API key not configured' });
  }

  try {
    const { prompt, size = '1024x1024' } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    // Parse size to width and height
    const [width, height] = size.split('x').map(Number);

    // Validate and cap parameters for FLUX.1
    const validatedWidth = Math.min(Math.max(width || 1024, 64), 1792);
    const validatedHeight = Math.min(Math.max(height || 1024, 64), 1792);

    if (validatedWidth !== (width || 1024) || validatedHeight !== (height || 1024)) {
      console.log(`⚠️  [DALL-E Redirect] Capped dimensions from ${width || 1024}x${height || 1024} to ${validatedWidth}x${validatedHeight}`);
    }

    console.log(`🎨 [FLUX.1] Generating image: ${prompt.substring(0, 100)}...`);

    // Use FLUX.1 via Together AI
    const response = await fetch('https://api.together.xyz/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${togetherApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'black-forest-labs/FLUX.1-schnell',
        prompt,
        width: validatedWidth,
        height: validatedHeight,
        seed: Math.floor(Math.random() * 1000000),
        steps: 4,
        n: 1
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ FLUX.1 generation error:', data);
      return res.status(response.status).json(data);
    }

    // Extract URL from response
    const imageUrl = data.data?.[0]?.url || data.output?.[0];

    if (imageUrl) {
      console.log('✅ [FLUX.1] Image generated successfully (via redirect)');

      // Set CORS headers for browser requests
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      // Transform to match DALL-E 3 response format for compatibility
      res.status(200).json({
        images: [{
          url: imageUrl,
          revised_prompt: prompt
        }]
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
