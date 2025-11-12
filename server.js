/**
 * Express server to proxy API calls to Together.ai
 * This avoids CORS issues when calling from the browser
 * Together-Only Mode: All image generation and reasoning via Together.ai
 */

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Use global fetch (Node 18+) instead of node-fetch
if (typeof fetch === 'undefined') {
  console.warn('⚠️  Global fetch not available - using node-fetch fallback');
  global.fetch = require('node-fetch');
}

const app = express();
const PORT = process.env.PORT || 3001;

// CORS Configuration - Security hardening
const corsOptions = {
  origin: function (origin, callback) {
    // Allowed origins (add your production domain here)
    const allowedOrigins = process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',')
      : [
          'http://localhost:3000',  // React dev server
          'http://localhost:3001',  // Local API server
          'https://www.archiaisolution.pro',  // Production domain
          'https://archiaisolution.pro',
          // Tightened regex: only match architect-ai-platform-* Vercel previews
          /^https:\/\/architect-ai-platform-[a-z0-9]+-[a-z0-9]+\.vercel\.app$/
        ];

    // Allow requests with no origin (like Postman or server-side requests)
    if (!origin) return callback(null, true);

    // Check if origin is allowed
    const isAllowed = allowedOrigins.some(allowed => {
      if (allowed instanceof RegExp) {
        return allowed.test(origin);
      }
      return allowed === origin;
    });

    if (isAllowed) {
      console.log(`✅ CORS allowed: ${origin}`);
      callback(null, true);
    } else {
      console.warn(`❌ CORS blocked: ${origin}`);
      callback(new Error('CORS policy violation: Origin not allowed'));
    }
  },
  credentials: true,  // Allow cookies and auth headers
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400  // Cache preflight for 24 hours
};

// Rate Limiting Configuration - Security hardening
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 100,  // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,  // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false,  // Disable `X-RateLimit-*` headers
});

// Stricter rate limiting for AI API endpoints (expensive operations)
const aiApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 20,  // Limit each IP to 20 AI requests per 15 minutes
  message: 'Too many AI API requests. Please wait before trying again.',
  skipSuccessfulRequests: false,
  standardHeaders: true,
  legacyHeaders: false,
});

// Very strict rate limiting for image generation (most expensive)
const imageGenerationLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,  // 5 minutes
  max: 5,  // Limit each IP to 5 image generations per 5 minutes
  message: 'Image generation rate limit exceeded. Please wait 5 minutes.',
  skipSuccessfulRequests: false,
});

// Security headers with helmet
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // Required for React dev
      styleSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'", "https://api.together.xyz", "https://api.openai.com"],
      fontSrc: ["'self'", "data:", "https:"],
    },
  },
  crossOriginEmbedderPolicy: false, // Allow image loading from external sources
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Middleware
app.use(cors(corsOptions));

// Apply general rate limiting to all routes
app.use(generalLimiter);

// Body size limits - Security hardening (prevent DOS attacks)
app.use(express.json({
  limit: '10mb'  // Reduced from 50mb - sufficient for JSON data
}));
app.use(express.urlencoded({
  limit: '20mb',  // Allow larger for image uploads
  extended: true
}));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    openai: !!process.env.REACT_APP_OPENAI_API_KEY,
    openaiReasoning: !!process.env.OPENAI_REASONING_API_KEY,
    openaiImages: !!process.env.OPENAI_IMAGES_API_KEY,
    replicate: !!process.env.REACT_APP_REPLICATE_API_KEY
  });
});

// OpenAI proxy endpoint for chat completions (reasoning)
app.post('/api/openai/chat', aiApiLimiter, async (req, res) => {
  try {
    // Prefer dedicated reasoning key, fallback to legacy key
    const apiKey = process.env.OPENAI_REASONING_API_KEY || process.env.REACT_APP_OPENAI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }

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
      return res.status(response.status).json(data);
    }

    res.json(data);
  } catch (error) {
    console.error('OpenAI proxy error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Image proxy endpoint - bypass CORS for canvas processing
// Supports both /api/proxy/image (dev) and /api/proxy-image (prod alias)
const handleImageProxy = async (req, res) => {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({ error: 'URL parameter is required' });
    }

    // Validate URL is from trusted image sources
    const isTrustedSource =
      url.includes('api.together.ai') || // Together.ai short URLs and API
      url.includes('api.together.xyz') || // Together.ai API images
      url.includes('cdn.together.xyz') || // Together.ai CDN
      url.includes('together-cdn.com') || // Together.ai CDN alternative
      url.includes('oaidalleapiprodscus.blob.core.windows.net') || // DALL-E 3 (legacy fallback)
      url.includes('s.maginary.ai') || // Maginary/Midjourney (legacy fallback)
      url.includes('cdn.midjourney.com') || // Midjourney CDN (legacy fallback)
      url.includes('cdn.discordapp.com'); // Discord CDN (legacy fallback)

    if (!isTrustedSource) {
      return res.status(403).json({ error: 'URL not from a trusted image source' });
    }

    // Logging: Redact sensitive data in production
    const isProduction = process.env.NODE_ENV === 'production';
    const logLevel = process.env.LOG_LEVEL || (isProduction ? 'error' : 'debug');

    if (logLevel === 'debug' && !isProduction) {
      console.log(`🖼️  Proxying image: ${url.substring(0, 80)}...`);
    } else {
      // Production: Only log domain, not full URL
      const urlObj = new URL(url);
      console.log(`🖼️  Proxying image from: ${urlObj.hostname}`);
    }

    // Prepare fetch headers (include Together.ai auth if needed)
    const fetchHeaders = {
      'User-Agent': 'Mozilla/5.0 (compatible; ArchitectAI/1.0)'
    };

    // Add Together.ai authorization for Together.ai URLs
    const isTogetherAI = url.includes('api.together.ai') || url.includes('api.together.xyz');
    if (isTogetherAI) {
      const togetherApiKey = process.env.TOGETHER_API_KEY;
      if (togetherApiKey) {
        fetchHeaders['Authorization'] = `Bearer ${togetherApiKey}`;
        console.log('   🔑 Adding Together.ai authorization header');
      } else {
        console.warn('   ⚠️  Together.ai URL detected but API key not available');
      }
    }

    console.log(`   📡 Fetching image with ${Object.keys(fetchHeaders).length} headers`);

    // Fetch the image
    const response = await fetch(url, { headers: fetchHeaders });

    if (!response.ok) {
      console.error(`❌ Failed to fetch image: ${response.status} ${response.statusText}`);

      // Try to get error body from Together.ai
      try {
        const errorText = await response.text();
        console.error(`   Error body: ${errorText.substring(0, 200)}`);
      } catch (e) {
        // Ignore if can't read body
      }

      return res.status(response.status).json({ error: 'Failed to fetch image' });
    }

    // Get image buffer (use arrayBuffer for global fetch compatibility)
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Set CORS headers to allow canvas access
    res.set({
      'Content-Type': response.headers.get('content-type') || 'image/png',
      'Content-Length': buffer.length,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
      'Cache-Control': 'public, max-age=3600' // Cache for 1 hour
    });

    console.log(`✅ Image proxied successfully (${(buffer.length / 1024).toFixed(2)} KB)`);
    res.send(buffer);

  } catch (error) {
    console.error('Image proxy error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Register both routes for compatibility
app.get('/api/proxy/image', handleImageProxy);
app.get('/api/proxy-image', handleImageProxy);

// Together AI endpoints for GPT-4o reasoning and FLUX.1 image generation
app.post('/api/together/chat', aiApiLimiter, async (req, res) => {
  const togetherApiKey = process.env.TOGETHER_API_KEY;

  if (!togetherApiKey) {
    console.error('❌ Together API key not configured');
    return res.status(500).json({ error: 'Together API key not configured' });
  }

  try {
    console.log('🧠 [Together AI] Processing chat completion request...');

    // Filter out parameters not supported by Together.ai
    const { response_format, ...supportedParams } = req.body;

    // Together.ai doesn't support response_format parameter
    // JSON output must be requested via system prompt instead
    if (response_format) {
      console.log('⚠️  response_format parameter removed (not supported by Together.ai)');
    }

    const response = await fetch('https://api.together.xyz/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${togetherApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(supportedParams)
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ Together AI chat error:', data);
      return res.status(response.status).json(data);
    }

    console.log('✅ Together AI chat completion successful');
    res.json(data);

  } catch (error) {
    console.error('Together AI chat error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Together AI image generation endpoint (FLUX.1)
app.post('/api/together/image', imageGenerationLimiter, async (req, res) => {
  const togetherApiKey = process.env.TOGETHER_API_KEY;

  if (!togetherApiKey) {
    console.error('❌ Together API key not configured');
    return res.status(500).json({ error: 'Together API key not configured' });
  }

  try {
    const {
      model = 'black-forest-labs/FLUX.1-schnell',
      prompt,
      negativePrompt = '', // Separate negative prompt parameter
      width = 1024,
      height = 1024,
      seed,
      num_inference_steps = 4,
      guidanceScale = 7.8, // Guidance scale for prompt adherence
      initImage = null,
      imageStrength = 0.55
    } = req.body;

    // Validate and cap parameters for FLUX.1
    // Clamp to valid range, then round down to nearest multiple of 16 (Together.ai requirement)
    const clamp = (v) => Math.min(Math.max(Math.floor(v), 64), 1792);
    let validatedWidth = clamp(width);
    let validatedHeight = clamp(height);
    // Round down to nearest multiple of 16
    validatedWidth -= validatedWidth % 16;
    validatedHeight -= validatedHeight % 16;

    // Cap steps based on model (schnell: 12, dev: 50)
    const maxSteps = model.includes('schnell') ? 12 : 50;
    const validatedSteps = Math.min(Math.max(num_inference_steps, 1), maxSteps);

    if (validatedWidth !== width || validatedHeight !== height) {
      console.log(`⚠️  Adjusted dimensions from ${width}x${height} to ${validatedWidth}x${validatedHeight} (FLUX.1: multiples of 16, max 1792)`);
    }
    if (validatedSteps !== num_inference_steps) {
      console.log(`⚠️  Capped steps from ${num_inference_steps} to ${validatedSteps} (${model} max: ${maxSteps})`);
    }

    const generationMode = initImage ? 'image-to-image' : 'text-to-image';
    const isProduction = process.env.NODE_ENV === 'production';
    const logLevel = process.env.LOG_LEVEL || (isProduction ? 'error' : 'debug');
    
    if (logLevel === 'debug' && !isProduction) {
      console.log(`🎨 [FLUX.1] Generating image (${generationMode}) with seed ${seed}...`);
      if (negativePrompt) {
        console.log(`   🚫 Negative prompt length: ${negativePrompt.length} chars`);
      }
      if (guidanceScale !== 7.8) {
        console.log(`   🎚️  Custom guidance scale: ${guidanceScale}`);
      }
      if (prompt && prompt.length > 0) {
        console.log(`   📝 Prompt: ${prompt.substring(0, 100)}...`);
      }
    } else {
      // Production: Only log mode, not seed or prompt
      console.log(`🎨 [FLUX.1] Generating image (${generationMode})...`);
    }

    const requestBody = {
      model,
      prompt,
      width: validatedWidth,
      height: validatedHeight,
      seed,
      steps: validatedSteps,
      n: 1
    };

    // Add negative prompt if provided (Together.ai API parameter)
    if (negativePrompt && negativePrompt.length > 0) {
      requestBody.negative_prompt = negativePrompt;
    }

    // Add guidance scale if provided (Together.ai API parameter for prompt adherence)
    if (guidanceScale) {
      requestBody.guidance_scale = guidanceScale;
    }

    // Add image-to-image parameters if initImage provided
    if (initImage) {
      // 🔧 NORMALIZE INIT_IMAGE: Strip data URL prefix if present (Together.ai may prefer raw base64)
      let normalizedInitImage = initImage;
      if (typeof initImage === 'string' && initImage.startsWith('data:')) {
        try {
          // Extract base64 data after comma (e.g., "data:image/jpeg;base64,<data>")
          const base64Data = initImage.split(',')[1];
          if (base64Data) {
            normalizedInitImage = base64Data;
            console.log(`   🔧 Normalized init_image: stripped data URL prefix (${(initImage.length / 1024).toFixed(1)}KB → ${(normalizedInitImage.length / 1024).toFixed(1)}KB)`);
          }
        } catch (e) {
          // If parsing fails, use original
          console.warn(`   ⚠️  Failed to normalize init_image, using as-is:`, e.message);
        }
      }

      requestBody.init_image = normalizedInitImage; // Together.ai uses init_image field
      requestBody.image_strength = imageStrength; // Controls how much to preserve from init image
      console.log(`   🔄 Image-to-image mode: strength ${imageStrength} (preserves init image while synthesizing)`);
    }

    // Create AbortController for 3-minute timeout (FLUX.1-kontext-max can take 60-120s)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 180000); // 3 minutes

    try {
      const response = await fetch('https://api.together.xyz/v1/images/generations', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${togetherApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // Extract rate limit headers
      const retryAfter = response.headers.get('retry-after');
      const rateLimitRemaining = response.headers.get('x-ratelimit-remaining');
      const rateLimitReset = response.headers.get('x-ratelimit-reset');

      // Expose rate limit headers to client
      if (retryAfter) {
        res.setHeader('retry-after', retryAfter);
      }
      if (rateLimitRemaining) {
        res.setHeader('x-ratelimit-remaining', rateLimitRemaining);
      }
      if (rateLimitReset) {
        res.setHeader('x-ratelimit-reset', rateLimitReset);
      }
      res.setHeader('Access-Control-Expose-Headers', 'retry-after, x-ratelimit-remaining, x-ratelimit-reset');

      // Handle non-JSON responses (e.g., text error messages)
      const contentType = response.headers.get('content-type') || '';
      let data;

      try {
        if (contentType.includes('application/json')) {
          data = await response.json();
        } else {
          // Handle text responses (normalize to JSON structure)
          const text = await response.text();
          data = { error: text, rawText: text };
        }
      } catch (parseError) {
        // If parsing fails, create structured error
        const text = await response.text().catch(() => 'Unknown error');
        data = { error: text, rawText: text, parseError: parseError.message };
      }

      if (!response.ok) {
        // Only log full error details for non-transient errors
        if (response.status === 500 || response.status === 503) {
          console.warn(`⚠️  [FLUX.1] Together AI server error (${response.status}) - this is temporary`);
        } else {
          console.error('❌ FLUX.1 generation error:', data);
        }
        return res.status(response.status).json(data);
      }

      const imageUrl = data.data?.[0]?.url || data.output?.[0];

      if (imageUrl) {
        console.log(`✅ FLUX.1 image generated successfully (${generationMode})`);
        res.json({
          url: imageUrl,
          model: model.includes('flux') ? 'flux' : model,
          seed
        });
      } else {
        console.error('❌ No image URL in FLUX.1 response');
        res.status(500).json({ error: 'No image generated' });
      }

    } catch (fetchError) {
      clearTimeout(timeoutId);

      // Handle timeout specifically
      if (fetchError.name === 'AbortError') {
        console.error('❌ FLUX.1 generation timeout (180s exceeded) - FLUX.1-kontext-max takes 60-120s normally');
        return res.status(408).json({
          error: 'Image generation timed out',
          message: 'FLUX.1-kontext-max generation took longer than 3 minutes. Please try again.',
          timeout: true
        });
      }

      console.error('FLUX.1 generation error:', fetchError);
      res.status(500).json({ error: fetchError.message });
    }

  } catch (error) {
    console.error('FLUX.1 generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// DESIGN HISTORY ENDPOINTS - Store design context for consistency across views
// ============================================================================

const fsPromises = require('fs').promises;
// path is already declared above

// Design history directory
const HISTORY_DIR = path.join(__dirname, 'design_history');

// Ensure directory exists on startup
fsPromises.mkdir(HISTORY_DIR, { recursive: true }).catch(err => {
  console.error('Failed to create design_history directory:', err);
});

// Save design history endpoint
app.post('/api/design-history/save', async (req, res) => {
  try {
    const { projectId, context } = req.body;

    if (!projectId || !context) {
      return res.status(400).json({ error: 'projectId and context required' });
    }

    // Validate projectId (prevent directory traversal)
    // Use path.basename to strip any directory components
    const safeProjectId = path.basename(projectId.replace(/[^a-zA-Z0-9_-]/g, ''));
    if (!safeProjectId || safeProjectId !== projectId) {
      return res.status(400).json({ error: 'Invalid projectId format' });
    }

    const filePath = path.resolve(HISTORY_DIR, `${safeProjectId}.json`);

    // CRITICAL: Ensure the final path is within HISTORY_DIR
    if (!filePath.startsWith(path.resolve(HISTORY_DIR))) {
      console.error('⚠️ Path traversal attempt detected:', projectId);
      return res.status(403).json({ error: 'Access denied' });
    }
    await fsPromises.writeFile(filePath, JSON.stringify(context, null, 2));

    console.log(`✅ [Design History] Saved: ${safeProjectId}`);
    res.json({ success: true, projectId: safeProjectId });

  } catch (error) {
    console.error('❌ [Design History] Save failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Retrieve design history endpoint
app.get('/api/design-history/:projectId', async (req, res) => {
  try {
    const projectId = req.params.projectId;

    // Validate projectId (prevent directory traversal)
    // Use path.basename to strip any directory components
    const safeProjectId = path.basename(projectId.replace(/[^a-zA-Z0-9_-]/g, ''));
    if (!safeProjectId || safeProjectId !== projectId) {
      return res.status(400).json({ error: 'Invalid projectId format' });
    }

    const filePath = path.resolve(HISTORY_DIR, `${safeProjectId}.json`);

    // CRITICAL: Ensure the final path is within HISTORY_DIR
    if (!filePath.startsWith(path.resolve(HISTORY_DIR))) {
      console.error('⚠️ Path traversal attempt detected:', projectId);
      return res.status(403).json({ error: 'Access denied' });
    }

    try {
      const data = await fsPromises.readFile(filePath, 'utf8');
      const context = JSON.parse(data);

      console.log(`📖 [Design History] Retrieved: ${safeProjectId}`);
      res.json(context);

    } catch (readError) {
      if (readError.code === 'ENOENT') {
        return res.status(404).json({ error: 'Project not found' });
      }
      throw readError;
    }

  } catch (error) {
    console.error('❌ [Design History] Retrieve failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// List all projects endpoint
app.get('/api/design-history', async (req, res) => {
  try {
    const files = await fsPromises.readdir(HISTORY_DIR);
    const projects = [];

    // Read metadata from each project file
    for (const file of files) {
      if (file.endsWith('.json')) {
        const filePath = path.join(HISTORY_DIR, file);
        try {
          const data = await fsPromises.readFile(filePath, 'utf8');
          const context = JSON.parse(data);
          projects.push({
            projectId: file.replace('.json', ''),
            timestamp: context.timestamp,
            buildingProgram: context.metadata?.buildingProgram,
            location: context.location?.address,
            floors: context.metadata?.floors
          });
        } catch (err) {
          console.error(`Failed to read project file ${file}:`, err);
        }
      }
    }

    // Sort by timestamp (newest first)
    projects.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    console.log(`📋 [Design History] Listed ${projects.length} projects`);
    res.json({ projects });

  } catch (error) {
    console.error('❌ [Design History] List failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete project endpoint
app.delete('/api/design-history/:projectId', async (req, res) => {
  try {
    const projectId = req.params.projectId;

    // Validate projectId (prevent directory traversal)
    // Use path.basename to strip any directory components
    const safeProjectId = path.basename(projectId.replace(/[^a-zA-Z0-9_-]/g, ''));
    if (!safeProjectId || safeProjectId !== projectId) {
      return res.status(400).json({ error: 'Invalid projectId format' });
    }

    const filePath = path.resolve(HISTORY_DIR, `${safeProjectId}.json`);

    // CRITICAL: Ensure the final path is within HISTORY_DIR
    if (!filePath.startsWith(path.resolve(HISTORY_DIR))) {
      console.error('⚠️ Path traversal attempt detected:', projectId);
      return res.status(403).json({ error: 'Access denied' });
    }

    try {
      await fsPromises.unlink(filePath);
      console.log(`🗑️  [Design History] Deleted: ${safeProjectId}`);
      res.json({ success: true, projectId: safeProjectId });

    } catch (deleteError) {
      if (deleteError.code === 'ENOENT') {
        return res.status(404).json({ error: 'Project not found' });
      }
      throw deleteError;
    }

  } catch (error) {
    console.error('❌ [Design History] Delete failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Google Places API proxy endpoints - avoid CORS issues
app.get('/api/google/places/details', async (req, res) => {
  try {
    const apiKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: 'Google Maps API key not configured' });
    }

    const { place_id, fields = 'geometry' } = req.query;

    if (!place_id) {
      return res.status(400).json({ error: 'place_id is required' });
    }

    console.log(`🗺️  [Google Places] Details for place_id: ${place_id}`);

    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place_id}&fields=${fields}&key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    res.json(data);
  } catch (error) {
    console.error('Google Places Details proxy error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/google/places/nearby', async (req, res) => {
  try {
    const apiKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: 'Google Maps API key not configured' });
    }

    const { location, radius = 10, type } = req.query;

    if (!location) {
      return res.status(400).json({ error: 'location is required' });
    }

    console.log(`🗺️  [Google Places] Nearby search at ${location}`);

    let url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${location}&radius=${radius}&key=${apiKey}`;
    if (type) {
      url += `&type=${type}`;
    }

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    res.json(data);
  } catch (error) {
    console.error('Google Places Nearby proxy error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========================================
// Upscale Endpoint (Development)
// ========================================
// Upscales A1 sheet images to true 300 DPI resolution (9933×7016px landscape)
app.post('/api/upscale', async (req, res) => {
  try {
    const { imageUrl, targetWidth = 9933, targetHeight = 7016 } = req.body;

    if (!imageUrl) {
      return res.status(400).json({ error: 'imageUrl is required' });
    }

    // Try to use sharp if available (better quality)
    try {
      const sharp = require('sharp');
      
      console.log(`🔄 Upscaling image to ${targetWidth}×${targetHeight}px...`);
      
      // Fetch the image
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) {
        throw new Error(`Failed to fetch image: ${imageResponse.status}`);
      }
      
      const imageBuffer = await imageResponse.arrayBuffer();
      
      // Upscale using sharp with Lanczos3 algorithm (best quality)
      const upscaledBuffer = await sharp(Buffer.from(imageBuffer))
        .resize(targetWidth, targetHeight, {
          kernel: sharp.kernel.lanczos3,
          fit: 'fill',
          withoutEnlargement: false
        })
        .png({ quality: 100, compressionLevel: 6 })
        .toBuffer();
      
      // Convert to data URL
      const base64 = upscaledBuffer.toString('base64');
      const dataUrl = `data:image/png;base64,${base64}`;
      
      console.log(`✅ Upscaled successfully: ${targetWidth}×${targetHeight}px`);
      
      return res.json({
        success: true,
        dataUrl,
        width: targetWidth,
        height: targetHeight,
        dpi: 300
      });
    } catch (sharpError) {
      // Fallback: Return error suggesting client-side upscaling
      console.warn('Sharp not available, suggesting client-side upscaling:', sharpError.message);
      return res.status(503).json({
        error: 'Server-side upscaling not available (sharp not installed)',
        suggestion: 'Use client-side upscaling via imageUpscalingService',
        fallback: true
      });
    }
  } catch (error) {
    console.error('Upscale endpoint error:', error);
    return res.status(500).json({
      error: 'Upscaling failed',
      message: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 API Proxy Server running on http://localhost:${PORT}`);
  console.log(`🧠 Together AI (Reasoning + Images): ${process.env.TOGETHER_API_KEY ? 'Configured ✅' : 'Missing ❌'}`);
  console.log('\n🎯 Architecture Engine: FLUX.1 + Qwen via Together AI (Together-Only Mode)');
  console.log('💡 100% Together AI Exclusive - Legacy providers removed');
});
