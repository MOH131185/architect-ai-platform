/**
 * Vercel Serverless Function - OpenAI Chat Proxy
 * Handles OpenAI API requests securely from the frontend
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
    const apiKey = process.env.REACT_APP_OPENAI_API_KEY ||
                   process.env.OPENAI_API_KEY ||
                   process.env.OPENAI_KEY;

    if (!apiKey) {
      console.error('OpenAI API key not found in environment variables');
      console.error('Checked: REACT_APP_OPENAI_API_KEY, OPENAI_API_KEY, OPENAI_KEY');
      return res.status(500).json({
        error: 'OpenAI API key not configured',
        details: 'Please set REACT_APP_OPENAI_API_KEY in Vercel environment variables',
        checked: ['REACT_APP_OPENAI_API_KEY', 'OPENAI_API_KEY', 'OPENAI_KEY']
      });
    }

    // Log key presence (not the key itself) for debugging
    console.log('OpenAI API key found, length:', apiKey.length);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(req.body)
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('OpenAI API error:', response.status, data);

      // Special handling for 401 - likely invalid API key
      if (response.status === 401) {
        return res.status(401).json({
          ...data,
          error: 'Invalid OpenAI API key',
          details: 'The API key provided is not valid. Please check your API key in Vercel environment variables.',
          suggestion: 'Ensure you copied the complete key starting with "sk-"'
        });
      }

      return res.status(response.status).json(data);
    }

    res.status(200).json(data);
  } catch (error) {
    console.error('OpenAI proxy error:', error);
    res.status(500).json({ error: error.message });
  }
}
