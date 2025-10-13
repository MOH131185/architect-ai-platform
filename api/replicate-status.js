/**
 * Vercel Serverless Function - Replicate Status Proxy
 * Handles checking Replicate prediction status from the frontend
 */

export default async function handler(req, res) {
  // Permissive CORS for API routes
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Try multiple possible environment variable names
    const apiKey = process.env.REACT_APP_REPLICATE_API_KEY ||
                   process.env.REPLICATE_API_TOKEN ||
                   process.env.REPLICATE_API_KEY ||
                   process.env.REPLICATE_KEY;
    const { id } = req.query;

    if (!apiKey) {
      console.error('Replicate API key not found in environment variables');
      return res.status(500).json({
        error: 'Replicate API key not configured',
        details: 'Please set REACT_APP_REPLICATE_API_KEY in Vercel environment variables'
      });
    }

    if (!id) {
      return res.status(400).json({ error: 'Prediction ID required' });
    }

    const response = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: {
        'Authorization': `Token ${apiKey}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    res.status(200).json(data);
  } catch (error) {
    console.error('Replicate status proxy error:', error);
    res.status(500).json({ error: error.message });
  }
}
