/**
 * Vercel Serverless Function - Replicate Status Proxy
 * Handles checking Replicate prediction status from the frontend
 */

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

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
    // Support both REPLICATE_API_TOKEN and REACT_APP_REPLICATE_API_KEY
    const apiKey = process.env.REPLICATE_API_TOKEN || process.env.REACT_APP_REPLICATE_API_KEY;
    const { id } = req.query;

    if (!apiKey) {
      return res.status(500).json({ error: 'Replicate API key not configured' });
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
