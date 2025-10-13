/**
 * Vercel Serverless Function - Replicate Predictions Proxy
 * Handles Replicate API prediction creation from the frontend
 */

export default async function handler(req, res) {
  // Permissive CORS for API routes
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Try multiple possible environment variable names
    const apiKey = process.env.REACT_APP_REPLICATE_API_KEY ||
                   process.env.REPLICATE_API_TOKEN ||
                   process.env.REPLICATE_API_KEY ||
                   process.env.REPLICATE_KEY;

    if (!apiKey) {
      console.error('Replicate API key not found in environment variables');
      console.error('Checked: REACT_APP_REPLICATE_API_KEY, REPLICATE_API_TOKEN, REPLICATE_API_KEY');
      return res.status(500).json({
        error: 'Replicate API key not configured',
        details: 'Please set REACT_APP_REPLICATE_API_KEY in Vercel environment variables',
        checked: ['REACT_APP_REPLICATE_API_KEY', 'REPLICATE_API_TOKEN', 'REPLICATE_API_KEY']
      });
    }

    // Log key presence (not the key itself) for debugging
    console.log('Replicate API key found, length:', apiKey.length);

    const response = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${apiKey}`
      },
      body: JSON.stringify(req.body)
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    res.status(200).json(data);
  } catch (error) {
    console.error('Replicate proxy error:', error);
    res.status(500).json({ error: error.message });
  }
}
