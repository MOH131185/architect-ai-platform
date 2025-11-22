/**
 * Vercel Serverless Function for Together AI Chat Completions (REFACTORED)
 * 
 * REFACTORED: Now enforces deterministic reasoning settings and returns normalized structure.
 * Uses Qwen 2.5 72B for architectural reasoning (DNA generation).
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
    return res.status(405).json({ 
      error: { 
        code: 'METHOD_NOT_ALLOWED',
        message: 'Method not allowed. Use POST.',
        details: null
      }
    });
  }

  const togetherApiKey = process.env.TOGETHER_API_KEY;

  if (!togetherApiKey) {
    console.error('TOGETHER_API_KEY not configured in Vercel environment variables');
    return res.status(500).json({ 
      error: {
        code: 'API_KEY_MISSING',
        message: 'Together AI API key not configured',
        details: null
      }
    });
  }

  try {
    const { 
      model, 
      messages, 
      max_tokens, 
      temperature, 
      top_p, 
      top_k, 
      repetition_penalty,
      deterministicMode = false // New: Enable deterministic defaults
    } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ 
        error: {
          code: 'INVALID_INPUT',
          message: 'Messages array is required',
          details: { received: typeof messages }
        }
      });
    }

    // Deterministic defaults for DNA generation and reasoning
    const effectiveModel = model || 'Qwen/Qwen2.5-72B-Instruct-Turbo';
    const effectiveTemperature = deterministicMode 
      ? 0.1  // Low temperature for deterministic reasoning
      : (temperature !== undefined ? temperature : 0.7);
    const effectiveTopP = deterministicMode ? 0.9 : (top_p || 0.7);
    const effectiveMaxTokens = max_tokens || 2000;

    console.log(`🧠 [Together AI] Chat completion: ${effectiveModel} (deterministic: ${deterministicMode})`);

    const startTime = Date.now();
    const traceId = `trace_${startTime}_${Math.random().toString(36).substring(2, 9)}`;

    const response = await fetch('https://api.together.xyz/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${togetherApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: effectiveModel,
        messages,
        max_tokens: effectiveMaxTokens,
        temperature: effectiveTemperature,
        top_p: effectiveTopP,
        top_k: top_k || 50,
        repetition_penalty: repetition_penalty || 1.0,
        stop: ['<|eot_id|>', '<|eom_id|>']
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ Together AI chat error:', data);
      return res.status(response.status).json({
        error: {
          code: 'TOGETHER_API_ERROR',
          message: data.error || 'Together AI API request failed',
          details: data
        }
      });
    }

    const latencyMs = Date.now() - startTime;
    console.log(`✅ [Together AI] Chat completion successful (${latencyMs}ms)`);

    // Normalize response structure
    const normalizedResponse = {
      content: data.choices?.[0]?.message?.content || '',
      model: effectiveModel,
      usage: data.usage || {},
      latencyMs,
      traceId,
      deterministicMode,
      settings: {
        temperature: effectiveTemperature,
        topP: effectiveTopP,
        maxTokens: effectiveMaxTokens
      },
      // Include raw data for backward compatibility
      raw: data
    };

    // Set CORS headers for browser requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    res.status(200).json(normalizedResponse);
  } catch (error) {
    console.error('Together AI chat proxy error:', error);
    res.status(500).json({ 
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message,
        details: null
      }
    });
  }
}
