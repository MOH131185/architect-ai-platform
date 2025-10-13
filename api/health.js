/**
 * Health Check Endpoint
 * Simple endpoint to verify API routes are working
 */

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Return health check information
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'unknown',
    apiKeysConfigured: {
      openai: !!(process.env.OPENAI_API_KEY || process.env.REACT_APP_OPENAI_API_KEY),
      replicate: !!(process.env.REPLICATE_API_TOKEN || process.env.REACT_APP_REPLICATE_API_KEY)
    },
    endpoints: {
      health: '/api/health',
      openaiChat: '/api/openai-chat',
      replicatePredictions: '/api/replicate-predictions',
      replicateStatus: '/api/replicate-status'
    }
  });
}
