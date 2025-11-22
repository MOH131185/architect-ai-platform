/**
 * Replicate SDXL Generation API
 * 
 * Proxies requests to Replicate API for SDXL image generation.
 * Used as fallback when Together.ai FLUX fails.
 */

const fetch = require('node-fetch');

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const {
      model = 'stability-ai/sdxl:latest',
      prompt,
      negative_prompt,
      width = 1024,
      height = 1024,
      seed,
      num_inference_steps = 30,
      guidance_scale = 7.5,
      image = null,
      controlnet_conditioning_scale = 0.7
    } = req.body;

    const replicateKey = process.env.REPLICATE_API_TOKEN || process.env.REPLICATE_API_KEY;

    if (!replicateKey) {
      res.status(500).json({ error: 'REPLICATE_API_KEY not configured' });
      return;
    }

    console.log(`[Replicate] Generating with ${model}...`);

    // Create prediction
    const input = {
      prompt,
      negative_prompt,
      width,
      height,
      seed,
      num_inference_steps,
      guidance_scale
    };

    // Add control image if provided
    if (image) {
      input.image = image;
      input.controlnet_conditioning_scale = controlnet_conditioning_scale;
    }

    const createResponse = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${replicateKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        version: model.includes('controlnet') 
          ? 'controlnet-1.1-x-realistic-vision-v2.0'
          : 'stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b',
        input
      })
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      throw new Error(`Replicate create failed: ${createResponse.status} - ${errorText}`);
    }

    const prediction = await createResponse.json();
    console.log(`[Replicate] Prediction created: ${prediction.id}`);

    // Poll for completion
    let result = prediction;
    const maxAttempts = 60; // 60 attempts × 2s = 2 minutes max
    
    for (let i = 0; i < maxAttempts; i++) {
      if (result.status === 'succeeded') {
        console.log(`[Replicate] Generation complete`);
        
        res.status(200).json({
          url: result.output?.[0] || result.output,
          seed,
          metadata: {
            model: 'sdxl',
            width,
            height,
            prediction_id: result.id
          }
        });
        return;
      }

      if (result.status === 'failed' || result.status === 'canceled') {
        throw new Error(`Replicate generation failed: ${result.error || result.status}`);
      }

      // Wait 2 seconds before polling again
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Poll status
      const statusResponse = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
        headers: {
          'Authorization': `Token ${replicateKey}`
        }
      });

      if (!statusResponse.ok) {
        throw new Error(`Replicate status check failed: ${statusResponse.status}`);
      }

      result = await statusResponse.json();
    }

    throw new Error('Replicate generation timed out after 2 minutes');

  } catch (error) {
    console.error('[Replicate] Error:', error.message);
    res.status(500).json({
      error: error.message,
      details: 'SDXL generation via Replicate failed'
    });
  }
};

