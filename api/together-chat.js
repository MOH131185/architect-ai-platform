/**
 * Vercel Serverless Function for Together AI Chat Completions
 * Proxies requests to Together AI API to keep API keys secure
 * Uses Meta Llama 3.1 405B Instruct Turbo for best reasoning performance
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

  const togetherApiKey = process.env.TOGETHER_API_KEY;

  if (!togetherApiKey) {
    console.error('TOGETHER_API_KEY not configured in Vercel environment variables');
    return res.status(500).json({ error: 'Together AI API key not configured' });
  }

  try {
    const { model, messages, max_tokens, temperature, top_p, top_k, repetition_penalty } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    console.log(`🧠 [Together AI] Chat completion: ${model || 'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo'}`);

    const response = await fetch('https://api.together.xyz/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${togetherApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model || 'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo',
        messages,
        max_tokens: max_tokens || 2000,
        temperature: temperature !== undefined ? temperature : 0.7,
        top_p: top_p || 0.7,
        top_k: top_k || 50,
        repetition_penalty: repetition_penalty || 1.0,
        stop: ['<|eot_id|>', '<|eom_id|>']
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ Together AI chat error:', data);
      return res.status(response.status).json(data);
    }

    console.log('✅ [Together AI] Chat completion successful');

    // Set CORS headers for browser requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    res.status(200).json(data);
  } catch (error) {
    console.error('Together AI chat proxy error:', error);
    res.status(500).json({ error: error.message });
  }
}
