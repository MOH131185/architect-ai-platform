/**
 * Vercel Serverless Function - Debug Information
 * Shows environment and configuration status
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

  // Collect debug information
  const debugInfo = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'unknown',
    vercelEnv: process.env.VERCEL_ENV || 'unknown',

    // Check API keys (show only existence, not values)
    apiKeys: {
      openai: {
        exists: !!(process.env.OPENAI_API_KEY || process.env.REACT_APP_OPENAI_API_KEY),
        length: (process.env.OPENAI_API_KEY || process.env.REACT_APP_OPENAI_API_KEY)?.length || 0,
        prefix: (process.env.OPENAI_API_KEY || process.env.REACT_APP_OPENAI_API_KEY)?.substring(0, 10) || 'NOT_SET',
        alternativeExists: !!process.env.OPENAI_API_KEY,
        alternativeLength: process.env.OPENAI_API_KEY?.length || 0
      },
      replicate: {
        exists: !!process.env.REACT_APP_REPLICATE_API_KEY,
        length: process.env.REACT_APP_REPLICATE_API_KEY?.length || 0,
        prefix: process.env.REACT_APP_REPLICATE_API_KEY?.substring(0, 10) || 'NOT_SET',
        alternativeExists: !!process.env.REPLICATE_API_TOKEN,
        alternativeLength: process.env.REPLICATE_API_TOKEN?.length || 0
      },
      googleMaps: {
        exists: !!process.env.REACT_APP_GOOGLE_MAPS_API_KEY,
        length: process.env.REACT_APP_GOOGLE_MAPS_API_KEY?.length || 0
      },
      openWeather: {
        exists: !!process.env.REACT_APP_OPENWEATHER_API_KEY,
        length: process.env.REACT_APP_OPENWEATHER_API_KEY?.length || 0
      }
    },

    // Test Replicate API
    replicateTest: null
  };

  // Test Replicate API if key exists
  const apiKey = process.env.REPLICATE_API_TOKEN || process.env.REACT_APP_REPLICATE_API_KEY;

  if (apiKey) {
    try {
      const testResponse = await fetch('https://api.replicate.com/v1/models/stability-ai/sdxl', {
        headers: {
          'Authorization': `Token ${apiKey}`
        }
      });

      debugInfo.replicateTest = {
        success: testResponse.ok,
        status: testResponse.status,
        statusText: testResponse.statusText
      };

      if (testResponse.ok) {
        const data = await testResponse.json();
        debugInfo.replicateTest.modelInfo = {
          name: data.name,
          owner: data.owner,
          latestVersion: data.latest_version?.id?.substring(0, 20) || 'unknown'
        };
      }
    } catch (error) {
      debugInfo.replicateTest = {
        success: false,
        error: error.message
      };
    }
  } else {
    debugInfo.replicateTest = {
      success: false,
      error: 'No API key found'
    };
  }

  // Return debug information
  res.status(200).json(debugInfo);
}
