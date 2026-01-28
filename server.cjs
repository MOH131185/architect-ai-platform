/**
 * Express server to proxy API calls to Claude, OpenAI, and Together.ai
 * This avoids CORS issues when calling from the browser
 * Claude + OpenAI for reasoning, Together.ai for FLUX image generation
 */

const fs = require('fs');
const path = require('path');

const cors = require('cors');
const express = require('express');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const geometryJobManager = require('./server/geometry/renderJobManager.cjs');
const genarchJobManager = require('./server/genarch/genarchJobManager.cjs');
const { buildComposeSheetUrl } = require('./server/utils/a1ComposePayload.cjs');
const { resolveAiApiLimiterMax, resolveImageGenerationLimiterMax } = require('./server/utils/rateLimitConfig.cjs');
const { genarchAuth, geometryAuth } = require('./server/middleware/apiKeyAuth.cjs');
const { mountImageProxy } = require('./server/utils/imageProxy.cjs');

// Load env vars from the project root regardless of where the server is started from.
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

// Use global fetch (Node 18+) instead of node-fetch
if (typeof fetch === 'undefined') {
  console.warn('âš ï¸  Global fetch not available - using node-fetch fallback');
  global.fetch = require('node-fetch');
}

const app = express();
const PORT = process.env.PORT || 3001;
const GEOMETRY_PUBLIC_ROUTE = process.env.GEOMETRY_PUBLIC_ROUTE || '/geometry-renders';
const GEOMETRY_MAX_JOB_AGE_HOURS = parseInt(process.env.GEOMETRY_MAX_JOB_AGE_HOURS || '12', 10);

// Genarch pipeline configuration
const GENARCH_MAX_JOB_AGE_HOURS = parseInt(process.env.GENARCH_MAX_JOB_AGE_HOURS || '24', 10);

// A1 compose output (used to avoid returning huge base64 payloads)
const A1_COMPOSE_OUTPUT_DIR =
  process.env.A1_COMPOSE_OUTPUT_DIR || path.join(process.cwd(), 'qa_results', 'a1_compose_outputs');
const A1_COMPOSE_MAX_DATAURL_BYTES = parseInt(process.env.A1_COMPOSE_MAX_DATAURL_BYTES || '', 10) || 4.5 * 1024 * 1024;
try {
  fs.mkdirSync(A1_COMPOSE_OUTPUT_DIR, { recursive: true });
} catch (e) {
  // best-effort only
}

// CORS Configuration - Security hardening
const corsOptions = {
  origin: function (origin, callback) {
    // Allowed origins (add your production domain here)
    const allowedOrigins = process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',')
      : [
        'http://localhost:3000', // React dev server
        'http://localhost:3000/', // React dev server (with trailing slash)
        'http://localhost:3001', // Local API server
        'http://localhost:3001/', // Local API server (with trailing slash)
        'https://www.archiaisolution.pro', // Production domain
        'https://www.archiaisolution.pro/', // Production domain (with trailing slash)
        'https://archiaisolution.pro',
        'https://archiaisolution.pro/',
        // Tightened regex: only match architect-ai-platform-* Vercel previews
        /^https:\/\/architect-ai-platform-[a-z0-9]+-[a-z0-9]+\.vercel\.app\/?$/,
      ];

    // Allow requests with no origin (like Postman or server-side requests)
    if (!origin) { return callback(null, true); }

    // Normalize origin (remove trailing slash for comparison)
    const normalizedOrigin = origin.replace(/\/$/, '');

    // Check if origin is allowed
    const isAllowed = allowedOrigins.some((allowed) => {
      if (allowed instanceof RegExp) {
        return allowed.test(normalizedOrigin) || allowed.test(origin);
      }
      return allowed === normalizedOrigin || allowed === origin;
    });

    if (isAllowed) {
      console.log(`âœ… CORS allowed: ${origin}`);
      callback(null, true);
    } else {
      console.warn(`âŒ CORS blocked: ${origin}`);
      callback(new Error('CORS policy violation: Origin not allowed'));
    }
  },
  credentials: true, // Allow cookies and auth headers
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400, // Cache preflight for 24 hours
};

// Rate Limiting Configuration - Security hardening
const EFFECTIVE_NODE_ENV = process.env.NODE_ENV || 'development';
const AI_API_RATE_LIMIT_MAX = resolveAiApiLimiterMax({ nodeEnv: EFFECTIVE_NODE_ENV, env: process.env });
const IMAGE_GEN_RATE_LIMIT_MAX = resolveImageGenerationLimiterMax({ nodeEnv: EFFECTIVE_NODE_ENV, env: process.env });
console.log(
  `[RateLimit] NODE_ENV=${EFFECTIVE_NODE_ENV} aiApiLimiter.max=${AI_API_RATE_LIMIT_MAX} imageGenLimiter.max=${IMAGE_GEN_RATE_LIMIT_MAX}`
);
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
});

// Stricter rate limiting for AI API endpoints (expensive operations)
const aiApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: AI_API_RATE_LIMIT_MAX, // Configurable; defaults to much higher in dev/test to avoid false 429s during QA
  message: 'Too many AI API requests. Please wait before trying again.',
  skipSuccessfulRequests: false,
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict rate limiting for image generation (expensive operations)
// Increased limit for development - adjust for production
const imageGenerationLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: IMAGE_GEN_RATE_LIMIT_MAX, // Configurable; higher default in dev/test to support matrix runs
  message: 'Image generation rate limit exceeded. Please wait 5 minutes.',
  skipSuccessfulRequests: false,
});

// Security headers with helmet
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // Required for React dev
        styleSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'", 'https://api.together.xyz', 'https://api.openai.com'],
        fontSrc: ["'self'", 'data:', 'https:'],
      },
    },
    crossOriginEmbedderPolicy: false, // Allow image loading from external sources
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// Middleware
app.use(cors(corsOptions));

// Increase header size limit to handle edge cases (though data URLs shouldn't be proxied)
// Default is 8KB, increase to 16KB as a safety measure
app.use((req, res, next) => {
  try {
    // Check for proxied data URLs early and reject them with helpful error
    if (req.url && (req.url.includes('/api/proxy-image') || req.url.includes('/api/proxy/image'))) {
      // Safely access query parameters (may not be parsed yet)
      const urlParam = (req.query && req.query.url) || '';
      // Check if URL parameter contains a data URL (even if URL-encoded)
      if (urlParam && urlParam.length > 1000 && (urlParam.includes('data%3A') || urlParam.includes('data:') || urlParam.includes('%2Fpng'))) {
        console.warn('âš ï¸  Blocked proxied data URL request (too long) - returning error');
        return res.status(400).json({
          error: 'Data URLs should not be proxied',
          message: 'The provided URL appears to be a data URL. Data URLs work directly in browsers and should not be proxied.',
          suggestion: 'Use the data URL directly in your image src attribute without proxying',
        });
      }
    }
    next();
  } catch (middlewareError) {
    // If middleware fails, log but don't block the request
    console.error('âš ï¸  Middleware error (non-blocking):', middlewareError.message);
    next();
  }
});

// Apply general rate limiting to all routes
app.use(generalLimiter);

// Body size limits - Security hardening (prevent DOS attacks)
app.use(
  express.json({
    limit: '10mb', // Reduced from 50mb - sufficient for JSON data
  })
);
app.use(
  express.urlencoded({
    limit: '20mb', // Allow larger for image uploads
    extended: true,
  })
);

// Serve composed A1 PNGs from disk (dev/proxy runtime) to avoid huge JSON payloads
app.use(
  '/api/a1/compose-output',
  express.static(A1_COMPOSE_OUTPUT_DIR, {
    fallthrough: false,
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'no-store');
    },
  })
);

setInterval(() => {
  try {
    geometryJobManager.cleanupExpiredJobs(GEOMETRY_MAX_JOB_AGE_HOURS);
  } catch (error) {
    console.warn('âš ï¸ Geometry job cleanup failed', error.message);
  }
}, 60 * 60 * 1000);

// Genarch job cleanup (every 2 hours)
setInterval(() => {
  try {
    genarchJobManager.cleanupExpiredJobs(GENARCH_MAX_JOB_AGE_HOURS);
  } catch (error) {
    console.warn('[Genarch] Job cleanup failed:', error.message);
  }
}, 2 * 60 * 60 * 1000);

// Health check endpoint
app.get('/api/health', (req, res) => {
  // Check if genarch package is available
  let genarchAvailable = false;
  try {
    if (fs.existsSync(genarchJobManager.DEFAULT_RUNS_ROOT.replace(/genarch_runs$/, 'genarch'))) {
      genarchAvailable = true;
    }
  } catch (e) {
    // ignore
  }

  res.json({
    status: 'ok',
    // Primary providers
    together: !!process.env.TOGETHER_API_KEY,
    claude: !!process.env.ANTHROPIC_API_KEY,
    meshy: !!process.env.MESHY_API_KEY,
    // Fallback providers
    openaiReasoning: !!process.env.OPENAI_REASONING_API_KEY,
    openaiImages: !!process.env.OPENAI_IMAGES_API_KEY,
    // Genarch pipeline
    genarch: genarchAvailable,
    blender: !!process.env.BLENDER_PATH,
    // Legacy (deprecated)
    openai: !!process.env.REACT_APP_OPENAI_API_KEY,
    replicate: !!process.env.REACT_APP_REPLICATE_API_KEY,
  });
});

// OpenAI proxy handler for chat completions (reasoning)
const handleOpenAIChat = async (req, res) => {
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
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(req.body),
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
};

// OpenAI proxy endpoint - supports both path formats
// /api/openai/chat - legacy format (server.cjs naming)
// /api/openai-chat - Vercel format (matches api/openai-chat.js)
app.post('/api/openai/chat', aiApiLimiter, handleOpenAIChat);
app.post('/api/openai-chat', aiApiLimiter, handleOpenAIChat);

// Image proxy endpoint - bypass CORS for canvas processing
// Supports both /api/proxy/image (dev) and /api/proxy-image (prod alias)
const handleImageProxy = async (req, res) => {
  try {
    const FETCH_TIMEOUT_MS = 15000; // 15s
    const MAX_IMAGE_SIZE_BYTES = 25 * 1024 * 1024; // 25MB
    const MAX_REDIRECTS = 5;

    // Safely extract URL from query parameters
    const url = req.query?.url || null;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'URL parameter is required' });
    }

    // Reject overly long URLs to prevent 431 errors (max ~8KB for query params)
    if (url.length > 8000) {
      console.warn('âš ï¸  URL too long for proxy (likely a data URL) - rejecting to prevent 431 error');
      return res.status(400).json({
        error: 'URL too long for proxy endpoint',
        message: 'Data URLs should be used directly without proxying. Please use the image URL directly in your code.',
        suggestion: 'Check if the URL starts with "data:" and use it directly instead of proxying',
      });
    }

    // Check for URL-encoded data URLs first (common when data URLs are passed through query params)
    let decodedUrl = url;
    try {
      // Try decoding - if it's a data URL, it will start with "data:" after decoding
      if (url.includes('%3A') || url.includes('%2F')) {
        decodedUrl = decodeURIComponent(url);
      }
    } catch (decodeError) {
      // If decoding fails, use original URL
      decodedUrl = url;
    }

    // Handle data URLs directly - decode and return the image
    // Check both original and decoded URL
    if (url.startsWith('data:image/') || decodedUrl.startsWith('data:image/')) {
      const urlToProcess = decodedUrl.startsWith('data:image/') ? decodedUrl : url;
      try {
        // Extract base64 data from data URL
        const base64Match = urlToProcess.match(/^data:image\/([^;]+);base64,(.+)$/);
        if (base64Match) {
          const mimeType = base64Match[1];
          const base64Data = base64Match[2];

          // Validate base64 data before creating buffer
          if (!base64Data || base64Data.length === 0) {
            throw new Error('Empty base64 data in data URL');
          }

          let buffer;
          try {
            buffer = Buffer.from(base64Data, 'base64');
            if (buffer.length === 0) {
              throw new Error('Failed to decode base64 data');
            }
          } catch (bufferError) {
            console.error('Failed to decode base64 data:', bufferError.message);
            throw new Error(`Invalid base64 data: ${bufferError.message}`);
          }

          // Set appropriate headers
          res.set({
            'Content-Type': `image/${mimeType}`,
            'Content-Length': buffer.length,
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET',
            'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
          });

          console.log(`âœ… Data URL proxied successfully (${(buffer.length / 1024).toFixed(2)} KB)`);
          return res.send(buffer);
        } else {
          // Invalid data URL format
          console.warn('âš ï¸  Invalid data URL format received');
          return res.status(400).json({
            error: 'Invalid data URL format',
            message: 'Data URLs should be used directly without proxying. Please use the image URL directly in your code.',
          });
        }
      } catch (dataUrlError) {
        console.error('Failed to process data URL:', dataUrlError.message);
        return res.status(400).json({
          error: 'Invalid data URL format',
          message: 'Data URLs should be used directly without proxying. Please use the image URL directly in your code.',
        });
      }
    }

    // Parse and validate URL (https-only) to prevent SSRF via substring tricks
    const urlToValidate = decodedUrl !== url ? decodedUrl : url;
    let parsedUrl;
    try {
      parsedUrl = new URL(urlToValidate);
    } catch (urlValidationError) {
      console.error('Invalid URL format:', urlValidationError.message);
      return res.status(400).json({
        error: 'Invalid URL format',
        message: 'The provided URL is not a valid HTTP/HTTPS URL',
      });
    }

    if (parsedUrl.protocol !== 'https:') {
      return res.status(400).json({ error: 'Only HTTPS URLs are allowed' });
    }

    const trustedDomains = [
      'api.together.ai',
      'api.together.xyz',
      'cdn.together.xyz',
      'together-cdn.com',
      'together.ai',
      'together.xyz',
      'replicate.delivery',
      'replicate.com',
      'pbxt.replicate.delivery',
      'oaidalleapiprodscus.blob.core.windows.net',
      'imgur.com',
      'i.imgur.com',
      'cloudflare-ipfs.com',
      'ipfs.io',
      'arweave.net',
      's.maginary.ai',
      'cdn.midjourney.com',
      'cdn.discordapp.com',
    ];

    const hostIsTrusted = trustedDomains.some(
      (domain) =>
        parsedUrl.hostname === domain || parsedUrl.hostname.endsWith(`.${domain}`)
    );

    if (!hostIsTrusted) {
      return res.status(403).json({ error: 'URL not from a trusted image source' });
    }

    // Logging: Redact sensitive data in production
    const isProduction = process.env.NODE_ENV === 'production';
    const logLevel = process.env.LOG_LEVEL || (isProduction ? 'error' : 'debug');

    if (logLevel === 'debug' && !isProduction) {
      console.log(`ðŸ–¼ï¸  Proxying image: ${url.substring(0, 80)}...`);
    } else {
      // Production: Only log domain, not full URL
      try {
        const urlObj = new URL(url);
        console.log(`ðŸ–¼ï¸  Proxying image from: ${urlObj.hostname}`);
      } catch (urlError) {
        // If URL parsing fails (e.g., malformed URL), just log a generic message
        console.log(`ðŸ–¼ï¸  Proxying image (URL parsing failed)`);
      }
    }

    // Prepare fetch headers (include Together.ai auth if needed)
    const fetchHeaders = {
      'User-Agent': 'Mozilla/5.0 (compatible; ArchitectAI/1.0)',
    };

    // Add Together.ai authorization for Together.ai URLs
    const isTogetherAI =
      parsedUrl.hostname === 'api.together.ai' ||
      parsedUrl.hostname === 'api.together.xyz';
    if (isTogetherAI) {
      const togetherApiKey = process.env.TOGETHER_API_KEY;
      if (togetherApiKey) {
        fetchHeaders['Authorization'] = `Bearer ${togetherApiKey}`;
        console.log('   ðŸ”‘ Adding Together.ai authorization header');
      } else {
        console.warn('   âš ï¸  Together.ai URL detected but API key not available');
      }
    }

    console.log(`   ðŸ“¡ Fetching image with ${Object.keys(fetchHeaders).length} headers`);

    // Validate URL format before fetching (use decoded URL if available)
    const urlToFetch = decodedUrl !== url ? decodedUrl : url;
    try {
      // Try to create URL object to validate format (will throw if invalid)
      // Skip validation for data URLs (should have been caught earlier, but double-check)
      if (!urlToFetch.startsWith('data:') && !urlToFetch.startsWith('blob:')) {
        new URL(urlToFetch);
      }
    } catch (urlValidationError) {
      console.error('âŒ Invalid URL format:', urlValidationError.message);
      return res.status(400).json({
        error: 'Invalid URL format',
        message: 'The provided URL is not a valid HTTP/HTTPS URL',
      });
    }

    // Fetch the image with timeout and validated redirects (Together short URLs)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let response;
    let currentUrl = urlToFetch;
    try {
      for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
        const currentParsed = new URL(currentUrl);
        const requestHeaders = { ...fetchHeaders };

        // Only attach Together auth to Together API hosts (never to CDN redirect targets)
        const isTogetherHost =
          currentParsed.hostname === 'api.together.ai' ||
          currentParsed.hostname === 'api.together.xyz';
        const togetherApiKey = process.env.TOGETHER_API_KEY;
        if (isTogetherHost && togetherApiKey) {
          requestHeaders.Authorization = `Bearer ${togetherApiKey}`;
        } else {
          delete requestHeaders.Authorization;
        }

        response = await fetch(currentUrl, {
          headers: requestHeaders,
          redirect: 'manual',
          signal: controller.signal,
        });

        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get('location');
          if (!location) {
            break;
          }

          if (redirectCount === MAX_REDIRECTS) {
            return res.status(400).json({ error: 'Too many redirects' });
          }

          const nextUrl = new URL(location, currentUrl);
          if (nextUrl.protocol !== 'https:') {
            return res.status(400).json({ error: 'Redirected URL must use HTTPS' });
          }

          const redirectedHostTrusted = trustedDomains.some(
            (domain) =>
              nextUrl.hostname === domain || nextUrl.hostname.endsWith(`.${domain}`)
          );

          if (!redirectedHostTrusted) {
            return res.status(403).json({
              error: 'Redirected URL not from a trusted image source',
              hostname: nextUrl.hostname,
            });
          }

          currentUrl = nextUrl.toString();
          continue;
        }

        break;
      }
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      console.error(`âŒ Failed to fetch image: ${response.status} ${response.statusText}`);

      // Try to get error body from Together.ai
      try {
        const errorText = await response.text();
        console.error(`   Error body: ${errorText.substring(0, 200)}`);
      } catch (e) {
        // Ignore if can't read body
      }

      return res.status(response.status).json({ error: 'Failed to fetch image' });
    }

    // Enforce max size (best-effort via content-length + actual bytes)
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_IMAGE_SIZE_BYTES) {
      return res.status(413).json({
        error: 'Image exceeds max size',
        maxBytes: MAX_IMAGE_SIZE_BYTES,
        contentLength: parseInt(contentLength, 10),
      });
    }

    // Get image buffer (use arrayBuffer for global fetch compatibility)        
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length > MAX_IMAGE_SIZE_BYTES) {
      return res.status(413).json({
        error: 'Image exceeds max size',
        maxBytes: MAX_IMAGE_SIZE_BYTES,
        actualBytes: buffer.length,
      });
    }

    // Set CORS headers to allow canvas access
    res.set({
      'Content-Type': response.headers.get('content-type') || 'image/png',
      'Content-Length': buffer.length,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
      'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
    });

    console.log(`âœ… Image proxied successfully (${(buffer.length / 1024).toFixed(2)} KB)`);
    res.send(buffer);
  } catch (error) {
    console.error('Image proxy error:', error);
    console.error('Error stack:', error.stack);
    console.error('Request URL:', req.url);
    console.error('Query params:', JSON.stringify(req.query));

    // Provide more detailed error information in development
    const isProduction = process.env.NODE_ENV === 'production';
    res.status(500).json({
      error: error.message || 'Internal Server Error',
      ...(isProduction ? {} : { stack: error.stack, details: error.toString() }),
    });
  }
};

// Register both routes for compatibility
app.get('/api/proxy/image', handleImageProxy);
app.get('/api/proxy-image', handleImageProxy);

// Geometry-first rendering endpoints
app.post('/api/render-geometry', aiApiLimiter, geometryAuth, async (req, res) => {
  try {
    const { designState, options = {}, waitForResult = true } = req.body || {};
    if (!designState) {
      return res.status(400).json({ error: 'designState payload is required' });
    }

    const job = geometryJobManager.createJob(designState, options);
    const shouldWait = options.waitForResult ?? waitForResult;

    if (shouldWait) {
      try {
        await geometryJobManager.runJob(job, { waitForResult: true });
      } catch (error) {
        return res.status(500).json({
          error: error.message,
          job: serializeGeometryJob(job),
        });
      }
      return res.json(serializeGeometryJob(job));
    }

    geometryJobManager.runJob(job, { waitForResult: false });
    res.json(serializeGeometryJob(job));
  } catch (error) {
    console.error('render-geometry error', error);
    res.status(500).json({ error: error.message || 'Render job failed' });
  }
});

app.get('/api/render-geometry/:jobId', geometryAuth, (req, res) => {
  const job = geometryJobManager.getJob(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.json(serializeGeometryJob(job));
});

app.get(`${GEOMETRY_PUBLIC_ROUTE}/:jobId/:asset`, (req, res) => {
  const job = geometryJobManager.getJob(req.params.jobId);
  if (!job || !job.paths || !job.paths.outputDir) {
    return res.status(404).json({ error: 'Job not found' });
  }
  const filePath = path.join(job.paths.outputDir, req.params.asset);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Asset not found' });
  }
  res.sendFile(filePath);
});

// Together AI endpoints for GPT-4o reasoning and FLUX.1 image generation
app.post('/api/together/chat', aiApiLimiter, async (req, res) => {
  const togetherApiKey = process.env.TOGETHER_API_KEY;

  if (!togetherApiKey) {
    console.error('âŒ Together API key not configured');
    return res.status(500).json({ error: 'Together API key not configured' });
  }

  try {
    console.log('ðŸ§  [Together AI] Processing chat completion request...');

    // Filter out parameters not supported by Together.ai
    const { response_format, ...supportedParams } = req.body;

    // Together.ai doesn't support response_format parameter
    // JSON output must be requested via system prompt instead
    if (response_format) {
      console.log('âš ï¸  response_format parameter removed (not supported by Together.ai)');
    }

    const response = await fetch('https://api.together.xyz/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${togetherApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(supportedParams),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('âŒ Together AI chat error:', data);
      return res.status(response.status).json(data);
    }

    console.log('âœ… Together AI chat completion successful');
    res.json(data);
  } catch (error) {
    console.error('Together AI chat error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// OPENAI GPT-4o REASONING ENDPOINT
// Primary LLM for DNA generation and architectural reasoning (GPT-4o)
// ============================================================================

app.post('/api/openai-reasoning', aiApiLimiter, async (req, res) => {
  console.log('📥 [GPT-4o] Received request to /api/openai-reasoning');

  const openaiApiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_REASONING_API_KEY;

  if (!openaiApiKey) {
    console.error('❌ [GPT-4o] OpenAI API key not configured');
    console.error('   Available env vars:', Object.keys(process.env).filter(k => k.includes('OPENAI')).join(', '));
    return res.status(500).json({
      ok: false,
      error: 'API_KEY_MISSING',
      details: 'Set OPENAI_API_KEY or OPENAI_REASONING_API_KEY in environment variables',
    });
  }

  console.log('[GPT-4o] API key present');

  try {
    const {
      messages,
      model = 'gpt-4o',
      max_tokens = 4000,
      temperature = 0.3,
      response_format,
      task_type = 'general',
    } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({
        ok: false,
        error: 'INVALID_INPUT',
        details: 'Messages array is required',
      });
    }

    const startTime = Date.now();
    const traceId = `gpt4o_${startTime}_${Math.random().toString(36).substring(2, 9)}`;

    console.log(`Brain [GPT-4o] Starting ${task_type} (model: ${model})`);

    // Build request body
    const requestBody = {
      model,
      messages,
      max_tokens,
      temperature,
    };

    // Add structured output format if requested
    if (response_format) {
      requestBody.response_format = response_format;
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[GPT-4o] API error:', data);
      return res.status(response.status).json({
        ok: false,
        error: 'OPENAI_API_ERROR',
        details: data.error?.message || 'OpenAI API request failed',
        raw: data.error,
      });
    }

    const latencyMs = Date.now() - startTime;
    const content = data.choices?.[0]?.message?.content || '';

    console.log(`Check [GPT-4o] ${task_type} completed (${latencyMs}ms, ${content.length} chars)`);

    // Parse JSON if response_format was json_object
    let parsedContent = content;
    if (response_format?.type === 'json_object') {
      try {
        parsedContent = JSON.parse(content);
      } catch (parseError) {
        console.warn('[GPT-4o] Failed to parse JSON response:', parseError.message);
      }
    }

    res.status(200).json({
      ok: true,
      content: parsedContent,
      raw: content,
      model: data.model,
      usage: data.usage || {},
      latencyMs,
      traceId,
      task_type,
    });
  } catch (error) {
    console.error('[GPT-4o] Proxy error:', error);
    res.status(500).json({
      ok: false,
      error: 'INTERNAL_ERROR',
      details: error.message,
    });
  }
});

// ============================================================================
// ANTHROPIC CLAUDE API ENDPOINT
// Fallback LLM for architectural reasoning (Claude 4 Sonnet/Opus)
// Supports both /api/anthropic/messages (dev) and /api/anthropic-messages (prod alias)
// ============================================================================

async function handleAnthropicMessages(req, res) {
  console.log('\nðŸ” [DIAGNOSTIC] Anthropic endpoint called');
  console.log('   Request received at:', new Date().toISOString());

  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;

  // Diagnostic: Show key status (first 10 chars only for security)
  if (anthropicApiKey) {
    console.log('   ANTHROPIC_API_KEY present');
  } else {
    console.log('   âŒ ANTHROPIC_API_KEY is NOT SET in environment');
    console.log('   Available env keys:', Object.keys(process.env).filter(k => k.includes('API') || k.includes('KEY')).join(', '));
  }

  if (!anthropicApiKey) {
    console.error('âŒ Anthropic API key not configured');
    return res.status(500).json({ error: 'Anthropic API key not configured' });
  }

  try {
    const {
      model = 'claude-sonnet-4-20250514',
      max_tokens = 4096,
      temperature = 0.3,
      messages = [],
      system = '',
    } = req.body;

    console.log(`ðŸ§  [Claude] Processing ${model} request...`);
    console.log(`   Messages: ${messages.length}, Max tokens: ${max_tokens}`);
    console.log(`   ðŸ” [DIAGNOSTIC] About to call Anthropic API...`);

    // Build request body for Anthropic API
    const requestBody = {
      model,
      max_tokens,
      temperature,
      messages,
    };

    // Add system prompt if provided
    if (system && system.length > 0) {
      requestBody.system = system;
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('âŒ Claude API error:', data);
      return res.status(response.status).json(data);
    }

    console.log(`âœ… [Claude] Response received (${data.usage?.output_tokens || 0} tokens)`);
    res.json(data);
  } catch (error) {
    console.error('âŒ Claude API error:', error);
    res.status(500).json({ error: error.message });
  }
}

// Register both route paths for Anthropic Claude API
app.post('/api/anthropic/messages', aiApiLimiter, handleAnthropicMessages);
app.post('/api/anthropic-messages', aiApiLimiter, handleAnthropicMessages);

// OpenAI image stylization endpoint (A1 3D panels, control-image edits)
app.post('/api/openai-image-stylize', imageGenerationLimiter, async (req, res) => {
  try {
    const { default: handler } = await import('./api/openai-image-stylize.js');
    return handler(req, res);
  } catch (error) {
    console.error('❌ OpenAI image stylize error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Together AI image generation endpoint (FLUX.1)
app.post('/api/together/image', imageGenerationLimiter, async (req, res) => {
  const togetherApiKey = process.env.TOGETHER_API_KEY;

  if (!togetherApiKey) {
    console.error('âŒ Together API key not configured');
    return res.status(500).json({ error: 'Together API key not configured' });
  }

  try {
    const body = req.body || {};

    const model = body.model || 'black-forest-labs/FLUX.1-schnell';
    const prompt = body.prompt;
    const negativePrompt = body.negativePrompt ?? body.negative_prompt ?? ''; // Separate negative prompt parameter
    const width = body.width ?? 1024;
    const height = body.height ?? 1024;
    const seed = body.seed;
    const num_inference_steps = body.num_inference_steps ?? body.numInferenceSteps ?? body.steps ?? 4;
    const guidanceScale = body.guidanceScale ?? body.guidance_scale ?? 7.8; // Guidance scale for prompt adherence
    const initImage = body.initImage ?? body.init_image ?? null;
    const imageStrength = body.imageStrength ?? body.image_strength ?? body.strength ?? 0.55;

    // Detect model type for different API parameter handling
    const isFlux2Pro = model.includes('FLUX.2-pro');
    const isSchnell = model.includes('schnell');

    // Validate and cap parameters
    // Clamp to valid range, then round down to nearest multiple of 16 (Together.ai requirement)
    const clamp = (v) => Math.min(Math.max(Math.floor(v), 64), 1792);
    let validatedWidth = clamp(width);
    let validatedHeight = clamp(height);
    // Round down to nearest multiple of 16
    validatedWidth -= validatedWidth % 16;
    validatedHeight -= validatedHeight % 16;

    // Cap steps based on model (schnell: 12, dev: 50, FLUX.2-pro: 10 optimal)
    const maxSteps = isSchnell ? 12 : isFlux2Pro ? 20 : 50;
    const validatedSteps = Math.min(Math.max(num_inference_steps, 1), maxSteps);

    if (validatedWidth !== width || validatedHeight !== height) {
      console.log(
        `âš ï¸  Adjusted dimensions from ${width}x${height} to ${validatedWidth}x${validatedHeight} (FLUX.1: multiples of 16, max 1792)`
      );
    }
    if (validatedSteps !== num_inference_steps) {
      console.log(
        `âš ï¸  Capped steps from ${num_inference_steps} to ${validatedSteps} (${model} max: ${maxSteps})`
      );
    }

    const generationMode = initImage ? 'image-to-image' : 'text-to-image';
    const isProduction = process.env.NODE_ENV === 'production';
    const logLevel = process.env.LOG_LEVEL || (isProduction ? 'error' : 'debug');
    const modelLabel = isFlux2Pro ? 'FLUX.2-pro' : isSchnell ? 'FLUX.1-schnell' : 'FLUX.1-dev';

    if (logLevel === 'debug' && !isProduction) {
      console.log(`ðŸŽ¨ [${modelLabel}] Generating image (${generationMode}) with seed ${seed}...`);
      console.log(`   ðŸ“ Dimensions: ${validatedWidth}x${validatedHeight}, Steps: ${validatedSteps}`);
      if (negativePrompt && !isFlux2Pro) {
        console.log(`   ðŸš« Negative prompt length: ${negativePrompt.length} chars`);
      }
      if (guidanceScale !== 7.8 && !isFlux2Pro) {
        console.log(`   ðŸŽšï¸  Custom guidance scale: ${guidanceScale}`);
      }
      if (prompt && prompt.length > 0) {
        console.log(`   ðŸ“ Prompt: ${prompt.substring(0, 100)}...`);
      }
    } else {
      // Production: Only log mode, not seed or prompt
      console.log(`ðŸŽ¨ [${modelLabel}] Generating image (${generationMode})...`);
    }

    // Build request body - FLUX.2-pro has MUCH simpler API
    // FLUX.2-pro only supports: model, prompt, steps, n (NOT width, height, seed, guidance_scale, negative_prompt)
    let requestBody;

    if (isFlux2Pro) {
      // FLUX.2-pro: Only documented parameters
      requestBody = {
        model,
        prompt,
        steps: validatedSteps,
        n: 1,
      };
      console.log(`   ðŸ†• FLUX.2-pro mode: Minimal API (only model, prompt, steps, n)`);
      console.log(`   âš ï¸  FLUX.2-pro ignores: width, height, seed, guidance_scale, negative_prompt`);
    } else {
      // FLUX.1 models: Full parameter support
      requestBody = {
        model,
        prompt,
        width: validatedWidth,
        height: validatedHeight,
        seed,
        steps: validatedSteps,
        n: 1,
      };

      // Add negative prompt if provided (Together.ai API parameter for FLUX.1 only)
      if (negativePrompt && negativePrompt.length > 0) {
        requestBody.negative_prompt = negativePrompt;
      }

      // Add guidance scale if provided (Together.ai API parameter for FLUX.1 only)
      if (guidanceScale) {
        requestBody.guidance_scale = guidanceScale;
      }
    }

    // Add image-to-image parameters if initImage provided (FLUX.1 only - FLUX.2-pro may not support)
    if (initImage && !isFlux2Pro) {
      // 🎯 GEOMETRY MODE: Convert SVG to PNG before sending to Together API
      // Together.ai expects PNG/JPEG, not SVG. If we detect SVG, rasterize it with sharp.
      let normalizedInitImage = initImage;

      if (typeof initImage === 'string' && initImage.startsWith('data:image/svg+xml')) {
        try {
          const sharp = require('sharp');
          console.log(`   🎯 [Geometry Mode] Detected SVG init_image - rasterizing to PNG...`);

          // Extract base64 SVG data
          const svgBase64 = initImage.split(',')[1];
          if (svgBase64) {
            const svgBuffer = Buffer.from(svgBase64, 'base64');

            // Determine target dimensions from request or use defaults
            const targetWidth = validatedWidth || 1500;
            const targetHeight = validatedHeight || 1500;

            // Rasterize SVG to PNG at target dimensions
            const pngBuffer = await sharp(svgBuffer)
              .resize(targetWidth, targetHeight, {
                fit: 'contain',
                background: { r: 0, g: 0, b: 0, alpha: 1 }, // Black background
              })
              .png()
              .toBuffer();

            normalizedInitImage = pngBuffer.toString('base64');
            console.log(
              `   ✅ [Geometry Mode] SVG rasterized to PNG: ${targetWidth}x${targetHeight}, ${(pngBuffer.length / 1024).toFixed(1)}KB`
            );
          }
        } catch (svgError) {
          console.warn(`   ⚠️ [Geometry Mode] SVG rasterization failed:`, svgError.message);
          console.warn(`   ⚠️ Falling back to original SVG (may fail with Together API)`);
          // Fall through to standard normalization
        }
      }

      // Standard normalization: Strip data URL prefix if present (Together.ai prefers raw base64)
      if (typeof normalizedInitImage === 'string' && normalizedInitImage.startsWith('data:')) {
        try {
          // Extract base64 data after comma (e.g., "data:image/jpeg;base64,<data>")
          const base64Data = normalizedInitImage.split(',')[1];
          if (base64Data) {
            normalizedInitImage = base64Data;
            console.log(
              `   🔧 Normalized init_image: stripped data URL prefix (${(initImage.length / 1024).toFixed(1)}KB → ${(normalizedInitImage.length / 1024).toFixed(1)}KB)`
            );
          }
        } catch (e) {
          // If parsing fails, use original
          console.warn(`   ⚠️ Failed to normalize init_image, using as-is:`, e.message);
        }
      }

      requestBody.init_image = normalizedInitImage; // Together.ai uses init_image field
      requestBody.image_strength = imageStrength; // Controls how much to preserve from init image
      console.log(
        `   🔄 Image-to-image mode: strength ${imageStrength} (preserves init image while synthesizing)`
      );
    } else if (initImage && isFlux2Pro) {
      console.log(`   ⚠️ FLUX.2-pro: img2img not verified - skipping init_image parameter`);
    }

    // Create AbortController for 3-minute timeout (FLUX.1-kontext-max can take 60-120s)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 180000); // 3 minutes

    try {
      const response = await fetch('https://api.together.xyz/v1/images/generations', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${togetherApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
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
      res.setHeader(
        'Access-Control-Expose-Headers',
        'retry-after, x-ratelimit-remaining, x-ratelimit-reset'
      );

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
        // Log full error details for debugging
        if (response.status === 500 || response.status === 503) {
          console.warn(
            `âš ï¸  [${modelLabel}] Together AI server error (${response.status}) - this is temporary`
          );
        } else if (response.status === 400) {
          // Bad Request - likely invalid parameters for this model
          console.error(`âŒ [${modelLabel}] Bad Request (400) - Invalid parameters for model`);
          console.error(`   Model: ${model}`);
          console.error(`   Request body keys: ${Object.keys(requestBody).join(', ')}`);
          console.error(`   Error response:`, JSON.stringify(data, null, 2));
        } else {
          console.error(`âŒ [${modelLabel}] generation error:`, data);
        }
        return res.status(response.status).json(data);
      }

      const imageUrl = data.data?.[0]?.url || data.output?.[0];

      if (imageUrl) {
        console.log(`âœ… [${modelLabel}] Image generated successfully (${generationMode})`);
        res.json({
          url: imageUrl,
          model: modelLabel,
          seed,
        });
      } else {
        console.error(`âŒ No image URL in ${modelLabel} response`);
        res.status(500).json({ error: 'No image generated' });
      }
    } catch (fetchError) {
      clearTimeout(timeoutId);

      // Handle timeout specifically
      if (fetchError.name === 'AbortError') {
        console.error(
          'âŒ FLUX.1 generation timeout (180s exceeded) - FLUX.1-kontext-max takes 60-120s normally'
        );
        return res.status(408).json({
          error: 'Image generation timed out',
          message: 'FLUX.1-kontext-max generation took longer than 3 minutes. Please try again.',
          timeout: true,
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
// TOGETHER EMBEDDINGS ENDPOINT
// ============================================================================

app.post('/api/together/embeddings', aiApiLimiter, async (req, res) => {
  const togetherApiKey = process.env.TOGETHER_API_KEY;

  if (!togetherApiKey) {
    console.error('âŒ Together API key not configured');
    return res.status(500).json({ error: 'Together API key not configured' });
  }

  try {
    const { model, input } = req.body;

    if (!input) {
      return res.status(400).json({ error: 'Input text is required' });
    }

    const embeddingModel = model || 'togethercomputer/m2-bert-80M-8k-retrieval';

    const response = await fetch('https://api.together.xyz/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${togetherApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: embeddingModel,
        input: Array.isArray(input) ? input : [input],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('âŒ Together embeddings error:', errorText);
      return res.status(response.status).json({
        error: `Together.ai API error: ${response.status}`,
        details: errorText,
      });
    }

    const data = await response.json();
    console.log('âœ… Embeddings generated successfully');
    return res.status(200).json(data);

  } catch (error) {
    console.error('âŒ Embeddings error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message,
    });
  }
});

// ============================================================================
// MESHY 3D ENDPOINTS - Text-to-3D model generation
// ============================================================================

// Meshy 3D generation endpoint
app.post('/api/meshy-generate-3d', aiApiLimiter, async (req, res) => {
  try {
    // Dynamically import the serverless function
    const { default: handler } = await import('./api/meshy-generate-3d.js');

    // Ensure consistent shape with Vercel runtime expectations
    if (!req.body) {
      req.body = {};
    }

    // Call the Vercel serverless function handler
    return await handler(req, res);
  } catch (error) {
    console.error('âŒ Meshy 3D generation error:', error);
    const hasApiKey = Boolean((process.env.MESHY_API_KEY || '').trim());
    res.status(500).json({
      error: error.message,
      message: hasApiKey
        ? `Meshy 3D generation failed: ${error.message}`
        : 'Meshy API key not configured. Set MESHY_API_KEY and restart the server.',
    });
  }
});

// Meshy status endpoint (for polling async jobs)
app.get('/api/meshy-status/:taskId', async (req, res) => {
  try {
    // Dynamically import the serverless function
    const { default: handler } = await import('./api/meshy-generate-3d.js');

    // Ensure consistent shape with Vercel runtime expectations
    if (!req.body) {
      req.body = {};
    }
    req.query = req.query || {};
    req.query.taskId = req.params.taskId;

    // Call the Vercel serverless function handler
    return await handler(req, res);
  } catch (error) {
    console.error('âŒ Meshy status check error:', error);
    const hasApiKey = Boolean((process.env.MESHY_API_KEY || '').trim());
    res.status(500).json({
      error: error.message,
      message: hasApiKey
        ? `Meshy status check failed: ${error.message}`
        : 'Meshy API key not configured. Set MESHY_API_KEY and restart the server.',
    });
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
fsPromises.mkdir(HISTORY_DIR, { recursive: true }).catch((err) => {
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
      console.error('âš ï¸ Path traversal attempt detected:', projectId);
      return res.status(403).json({ error: 'Access denied' });
    }
    await fsPromises.writeFile(filePath, JSON.stringify(context, null, 2));

    console.log(`âœ… [Design History] Saved: ${safeProjectId}`);
    res.json({ success: true, projectId: safeProjectId });
  } catch (error) {
    console.error('âŒ [Design History] Save failed:', error);
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
      console.error('âš ï¸ Path traversal attempt detected:', projectId);
      return res.status(403).json({ error: 'Access denied' });
    }

    try {
      const data = await fsPromises.readFile(filePath, 'utf8');
      const context = JSON.parse(data);

      console.log(`ðŸ“– [Design History] Retrieved: ${safeProjectId}`);
      res.json(context);
    } catch (readError) {
      if (readError.code === 'ENOENT') {
        return res.status(404).json({ error: 'Project not found' });
      }
      throw readError;
    }
  } catch (error) {
    console.error('âŒ [Design History] Retrieve failed:', error);
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
            floors: context.metadata?.floors,
          });
        } catch (err) {
          console.error(`Failed to read project file ${file}:`, err);
        }
      }
    }

    // Sort by timestamp (newest first)
    projects.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    console.log(`ðŸ“‹ [Design History] Listed ${projects.length} projects`);
    res.json({ projects });
  } catch (error) {
    console.error('âŒ [Design History] List failed:', error);
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
      console.error('âš ï¸ Path traversal attempt detected:', projectId);
      return res.status(403).json({ error: 'Access denied' });
    }

    try {
      await fsPromises.unlink(filePath);
      console.log(`ðŸ—‘ï¸  [Design History] Deleted: ${safeProjectId}`);
      res.json({ success: true, projectId: safeProjectId });
    } catch (deleteError) {
      if (deleteError.code === 'ENOENT') {
        return res.status(404).json({ error: 'Project not found' });
      }
      throw deleteError;
    }
  } catch (error) {
    console.error('âŒ [Design History] Delete failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// OVERPASS OSM API PROXY ENDPOINT
// Handles OSM queries with failover, caching, and CORS bypass
// ============================================================================

const crypto = require('crypto');

// Overpass API endpoints in priority order
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
];

// In-memory cache for Overpass responses
const overpassResponseCache = new Map();
const OVERPASS_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const OVERPASS_REQUEST_TIMEOUT_MS = 20000; // 20 seconds
const OVERPASS_MAX_RETRIES = 2;

function generateOverpassCacheKey(query, bbox) {
  const normalizedQuery = query.trim().replace(/\s+/g, ' ');
  const bboxStr = bbox ? bbox.join(',') : '';
  const hash = crypto.createHash('sha256').update(`${normalizedQuery}|${bboxStr}`).digest('hex');
  return `overpass_${hash.substring(0, 16)}`;
}

function getOverpassCachedResponse(cacheKey) {
  const cached = overpassResponseCache.get(cacheKey);
  if (!cached) return null;

  const age = Date.now() - cached.timestamp;
  if (age > OVERPASS_CACHE_TTL_MS) {
    overpassResponseCache.delete(cacheKey);
    return null;
  }

  return cached.data;
}

function setOverpassCachedResponse(cacheKey, data) {
  // Limit cache size
  if (overpassResponseCache.size > 100) {
    const entries = Array.from(overpassResponseCache.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    for (let i = 0; i < 20; i++) {
      overpassResponseCache.delete(entries[i][0]);
    }
  }

  overpassResponseCache.set(cacheKey, { data, timestamp: Date.now() });
}

async function fetchFromOverpassEndpoint(endpoint, query, retries = OVERPASS_MAX_RETRIES) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), OVERPASS_REQUEST_TIMEOUT_MS);

    try {
      console.log(`[Overpass] Trying ${endpoint} (attempt ${attempt + 1}/${retries + 1})`);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'ArchiAI/1.0 (architectural design platform)',
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        console.warn(`[Overpass] ${endpoint} returned ${response.status}: ${errorText.substring(0, 200)}`);

        if (response.status === 429 || response.status === 504 || response.status === 503) {
          throw new Error(`HTTP ${response.status}`);
        }

        if (response.status === 400) {
          return { error: true, status: 400, message: 'Invalid Overpass query', details: errorText };
        }

        throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 100)}`);
      }

      const contentType = response.headers.get('content-type') || '';
      let data;

      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        try {
          data = JSON.parse(text);
        } catch {
          data = { raw: text, format: 'xml' };
        }
      }

      console.log(`[Overpass] Success from ${endpoint}`);
      return { success: true, data, endpoint };

    } catch (error) {
      clearTimeout(timeoutId);

      const isTimeout = error.name === 'AbortError';
      const isNetworkError = error.message?.includes('fetch') || error.code === 'ECONNREFUSED';

      console.warn(`[Overpass] ${endpoint} failed (attempt ${attempt + 1}):`,
        isTimeout ? 'timeout' : error.message);

      if ((isTimeout || isNetworkError) && attempt < retries) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }

      throw error;
    }
  }

  throw new Error('Max retries exceeded');
}

async function fetchOverpassWithFailover(query) {
  const errors = [];

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const result = await fetchFromOverpassEndpoint(endpoint, query);
      if (result.error) return result;
      return result;
    } catch (error) {
      errors.push({ endpoint, error: error.message });
      console.log(`[Overpass] Failover: ${endpoint} failed, trying next...`);
    }
  }

  return {
    error: true,
    status: 503,
    message: 'All Overpass endpoints failed',
    details: errors,
  };
}

app.post('/api/osm/overpass', async (req, res) => {
  try {
    const { query, bbox } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        error: 'Missing or invalid query parameter',
        expected: { query: 'string (Overpass QL)', bbox: '[south, west, north, east] (optional)' }
      });
    }

    const cacheKey = generateOverpassCacheKey(query, bbox);

    // Check cache
    const cached = getOverpassCachedResponse(cacheKey);
    if (cached) {
      console.log(`[Overpass] Cache hit for ${cacheKey}`);
      return res.status(200).json({
        ...cached,
        _cached: true,
        _cacheKey: cacheKey,
      });
    }

    console.log(`[Overpass] Cache miss, fetching for ${cacheKey}`);

    const result = await fetchOverpassWithFailover(query);

    if (result.error) {
      return res.status(result.status || 500).json(result);
    }

    // Cache successful response
    setOverpassCachedResponse(cacheKey, result.data);

    return res.status(200).json({
      ...result.data,
      _cached: false,
      _endpoint: result.endpoint,
    });

  } catch (error) {
    console.error('[Overpass] Unexpected error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message,
    });
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

    console.log(`ðŸ—ºï¸  [Google Places] Details for place_id: ${place_id}`);

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

    console.log(`ðŸ—ºï¸  [Google Places] Nearby search at ${location}`);

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
// Upscales A1 sheet images to true 300 DPI resolution (9933Ã—7016px landscape)
app.post('/api/upscale', async (req, res) => {
  try {
    const { imageUrl, targetWidth = 9933, targetHeight = 7016 } = req.body;

    if (!imageUrl) {
      return res.status(400).json({ error: 'imageUrl is required' });
    }

    // Try to use sharp if available (better quality)
    try {
      const sharp = require('sharp');

      console.log(`ðŸ”„ Upscaling image to ${targetWidth}Ã—${targetHeight}px...`);

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
          withoutEnlargement: false,
        })
        .png({ quality: 100, compressionLevel: 6 })
        .toBuffer();

      // Convert to data URL
      const base64 = upscaledBuffer.toString('base64');
      const dataUrl = `data:image/png;base64,${base64}`;

      console.log(`âœ… Upscaled successfully: ${targetWidth}Ã—${targetHeight}px`);

      return res.json({
        success: true,
        dataUrl,
        width: targetWidth,
        height: targetHeight,
        dpi: 300,
      });
    } catch (sharpError) {
      // Fallback: Return error suggesting client-side upscaling
      console.warn('Sharp not available, suggesting client-side upscaling:', sharpError.message);
      return res.status(503).json({
        error: 'Server-side upscaling not available (sharp not installed)',
        suggestion: 'Use client-side upscaling via imageUpscalingService',
        fallback: true,
      });
    }
  } catch (error) {
    console.error('Upscale endpoint error:', error);
    return res.status(500).json({
      error: 'Upscaling failed',
      message: error.message,
    });
  }
});

// ============================================================================
// A1 SHEET COMPOSITION ENDPOINT (V2 Pipeline)
// Uses BoardV2Layout, ControlKeyNormalizer, PanelCropper, PanelFitter
// ============================================================================

// A1 Layout Configuration - synced with BoardV2Layout.js
const WORKING_WIDTH = 1792;
const WORKING_HEIGHT = 1269;
// Final A1 landscape @300 DPI (approx 841×594mm)
const FINAL_WIDTH = 9933;
const FINAL_HEIGHT = 7016;

const A1_RESOLUTIONS = {
  working: { width: WORKING_WIDTH, height: WORKING_HEIGHT },
  final: { width: FINAL_WIDTH, height: FINAL_HEIGHT },
};

// Board V2 layout - matches BoardV2Layout.js (canonical keys)
const PANEL_LAYOUT_V2 = {
  // Top row
  site_diagram: { x: 0.02, y: 0.02, width: 0.18, height: 0.16 },
  hero_3d: { x: 0.21, y: 0.02, width: 0.36, height: 0.30 },
  interior_3d: { x: 0.58, y: 0.02, width: 0.28, height: 0.30 },
  material_palette: { x: 0.87, y: 0.02, width: 0.11, height: 0.16 },
  climate_card: { x: 0.87, y: 0.19, width: 0.11, height: 0.13 },
  // Axonometric view - right side of top row
  axonometric: { x: 0.02, y: 0.19, width: 0.18, height: 0.13 },

  // Middle row - Floor plans (canonical keys: plan_ground, plan_first, plan_level2)
  plan_ground: { x: 0.02, y: 0.33, width: 0.28, height: 0.24 },
  plan_first: { x: 0.31, y: 0.33, width: 0.28, height: 0.24 },
  plan_level2: { x: 0.60, y: 0.33, width: 0.26, height: 0.24 },
  // Schedules & notes panel - replaces plan_level2 for 2-floor buildings
  schedules_notes: { x: 0.60, y: 0.33, width: 0.26, height: 0.24 },

  // Lower row - Elevations
  elevation_north: { x: 0.02, y: 0.58, width: 0.23, height: 0.18 },
  elevation_south: { x: 0.26, y: 0.58, width: 0.23, height: 0.18 },
  elevation_east: { x: 0.50, y: 0.58, width: 0.23, height: 0.18 },
  elevation_west: { x: 0.74, y: 0.58, width: 0.24, height: 0.18 },

  // Bottom row - Sections
  section_AA: { x: 0.02, y: 0.77, width: 0.32, height: 0.21 },
  section_BB: { x: 0.35, y: 0.77, width: 0.32, height: 0.21 },
  title_block: { x: 0.68, y: 0.77, width: 0.30, height: 0.21 },
};

// Key normalization map (control image keys -> canonical keys)
const KEY_NORMALIZATION_MAP = {
  // Floor plans - legacy keys to canonical
  floor_plan_ground: 'plan_ground',
  floor_plan_first: 'plan_first',
  floor_plan_level2: 'plan_level2',
  ground_floor_plan: 'plan_ground',
  first_floor_plan: 'plan_first',
  second_floor_plan: 'plan_level2',
  // Pass-through canonical keys
  plan_ground: 'plan_ground',
  plan_first: 'plan_first',
  plan_level2: 'plan_level2',
  // 3D views
  site_diagram: 'site_diagram',
  hero_3d: 'hero_3d',
  interior_3d: 'interior_3d',
  axonometric: 'axonometric',
  axon: 'axonometric',
  axonometric_3d: 'axonometric',
  // Data panels
  material_palette: 'material_palette',
  climate_card: 'climate_card',
  schedules_notes: 'schedules_notes',
  schedules: 'schedules_notes',
  notes: 'schedules_notes',
  // Elevations
  elevation_north: 'elevation_north',
  elevation_south: 'elevation_south',
  elevation_east: 'elevation_east',
  elevation_west: 'elevation_west',
  // Sections
  section_AA: 'section_AA',
  section_BB: 'section_BB',
  section_aa: 'section_AA',
  section_bb: 'section_BB',
  // Title block
  title_block: 'title_block',
};

/**
 * Normalize panel key to canonical form
 * @param {string} key - Input panel key
 * @returns {string|null} Canonical key or null if unknown
 */
function normalizeKeyToCanonical(key) {
  if (!key) return null;
  const normalized = String(key).toLowerCase().trim().replace(/-/g, '_');
  return KEY_NORMALIZATION_MAP[normalized] || KEY_NORMALIZATION_MAP[key] || null;
}

/**
 * Auto-crop white borders from image buffer (simplified inline version)
 * @param {Buffer} buffer - Image buffer
 * @param {Object} sharp - Sharp module
 * @returns {Promise<Buffer>} Cropped buffer
 */
async function autoCropWhiteBorders(buffer, sharp) {
  try {
    // Use sharp's trim() to remove white borders
    const trimmed = await sharp(buffer)
      .trim({
        threshold: 10, // Tolerance for "white" detection
        background: { r: 255, g: 255, b: 255 },
      })
      .png()
      .toBuffer();

    return trimmed;
  } catch (e) {
    // If trim fails, return original
    console.warn('[A1 Compose] Auto-crop failed, using original:', e.message);
    return buffer;
  }
}

let didLogA1ComposeRuntime = false;
function logA1ComposeRuntimeOnce() {
  if (didLogA1ComposeRuntime) return;
  didLogA1ComposeRuntime = true;

  const info = {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    pid: process.pid,
    env: {
      NODE_ENV: process.env.NODE_ENV || null,
      NEXT_RUNTIME: process.env.NEXT_RUNTIME || null,
      VERCEL: process.env.VERCEL || null,
      VERCEL_ENV: process.env.VERCEL_ENV || null,
      VERCEL_REGION: process.env.VERCEL_REGION || null,
      AWS_REGION: process.env.AWS_REGION || null,
    },
  };

  console.log(`[A1 Compose][Runtime] ${JSON.stringify(info)}`);
}

let panelRegistry = null;
async function getPanelRegistry() {
  if (panelRegistry) return panelRegistry;
  try {
    panelRegistry = await import('./src/config/panelRegistry.js');
    return panelRegistry;
  } catch (e) {
    console.warn('[A1 Compose] Could not import panelRegistry:', e.message);
    return null;
  }
}

/**
 * POST /api/a1/compose
 * Compose individual panels into a complete A1 sheet
 */
app.post('/api/a1/compose', async (req, res) => {
  try {
    const {
      designId,
      siteOverlay = null,
      layoutConfig = 'board-v2',
      resolution = 'final',
    } = req.body;
    let panels = Array.isArray(req.body?.panels) ? req.body.panels : [];

    if (!panels || panels.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'NO_PANELS',
        message: 'No panels provided for composition',
        details: { designId: designId || null },
      });
    }

    console.log(`[A1 Compose] Composing ${panels.length} panels for design ${designId}...`);

    logA1ComposeRuntimeOnce();

    const registry = await getPanelRegistry();
    const unknownPanelTypes = [];

    // Normalize panel keys using built-in normalizer (fallback to registry)
    panels = panels
      .map((panel) => {
        // Try built-in normalizer first
        let canonical = normalizeKeyToCanonical(panel.type);

        // Fallback to registry if available
        if (!canonical && registry) {
          canonical = registry.normalizeToCanonical(panel.type);
        }

        if (!canonical) {
          unknownPanelTypes.push(panel.type);
          return null;
        }

        return { ...panel, type: canonical, originalType: panel.type };
      })
      .filter(Boolean);

    if (unknownPanelTypes.length > 0) {
      console.warn(`[A1 Compose] Ignoring unknown panel types: ${unknownPanelTypes.join(', ')}`);
    }

    if (!panels || panels.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'NO_PANELS',
        message: 'No valid panels provided after normalization',
        details: { designId: designId || null, unknownPanelTypes },
      });
    }

    const explicitFloorCount = Number(req.body.floorCount);
    const derivedFloorCount =
      panels.filter((p) => String(p.type || '').startsWith('floor_plan_')).length || 2;
    const floorCount =
      Number.isFinite(explicitFloorCount) && explicitFloorCount > 0
        ? explicitFloorCount
        : derivedFloorCount;

    // skipMissingPanelCheck: Allow composition with placeholders for missing panels (smoke tests, dev)
    const skipMissingPanelCheck = req.body.skipMissingPanelCheck === true || req.body.skipValidation === true;

    if (registry && !skipMissingPanelCheck) {
      const requiredPanels = typeof registry.getAIGeneratedPanels === 'function'
        ? registry.getAIGeneratedPanels(floorCount)
        : registry.getRequiredPanels(floorCount);
      const providedTypes = new Set(panels.map((p) => p.type));
      const missingPanels = requiredPanels.filter((type) => !providedTypes.has(type));

      if (missingPanels.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'MISSING_REQUIRED_PANELS',
          message: `Cannot compose A1 sheet - missing: ${missingPanels.join(', ')}`,
          details: { missingPanels, unknownPanelTypes },
        });
      }
    } else if (skipMissingPanelCheck) {
      console.log(`[A1 Compose] skipMissingPanelCheck=true - allowing composition with placeholders`);
    }

    // Try to load sharp
    let sharp;
    try {
      sharp = require('sharp');
    } catch (e) {
      console.warn('âš ï¸ Sharp not available for server-side composition');
      // Fallback to returning the first image (legacy behavior) or error
      return res.status(503).json({
        success: false,
        error: 'SHARP_UNAVAILABLE',
        message: 'Server-side composition unavailable (sharp not installed)',
        details: { fallback: true },
      });
    }

    // Prevent caching of compose results (panels vary per request)
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // 1. Create blank canvas
    const resolutionKey = String(resolution || 'final').toLowerCase();
    const { width, height } = A1_RESOLUTIONS[resolutionKey] || A1_RESOLUTIONS.final;

    const background = sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    }).png();

    // 2. Fetch and prepare all panel images
    const composites = [];
    const coordinates = {};
    const layout = PANEL_LAYOUT_V2; // Use V2 layout with canonical keys

    console.log('   â¬‡ï¸  Fetching panel images...');

    const processPanelPromises = panels.map(async (panel) => {
      try {
        const panelLayout = layout[panel.type];
        if (!panelLayout) {
          console.warn(`   âš ï¸  Unknown panel type: ${panel.type}`);
          return;
        }

        const imageUrl = panel.imageUrl || panel.url;
        if (!imageUrl) { return; }

        // Fetch image
        let buffer;
        if (imageUrl.startsWith('data:')) {
          // Handle data URL
          const base64Data = imageUrl.split(';base64,').pop();
          buffer = Buffer.from(base64Data, 'base64');
        } else {
          // Handle remote URL
          const response = await fetch(imageUrl);
          if (!response.ok) { throw new Error(`Failed to fetch ${imageUrl}`); }
          const arrayBuffer = await response.arrayBuffer();
          buffer = Buffer.from(arrayBuffer);
        }

        // Auto-crop white borders before fitting to panel
        let processedBuffer = buffer;
        try {
          processedBuffer = await autoCropWhiteBorders(buffer, sharp);
        } catch (cropErr) {
          // Use original buffer on crop failure
          processedBuffer = buffer;
        }

        // Calculate dimensions
        const x = Math.round(panelLayout.x * width);
        const y = Math.round(panelLayout.y * height);
        const panelWidth = Math.round(panelLayout.width * width);
        const panelHeight = Math.round(panelLayout.height * height);

        // Resize image (contain mode with solid white background)
        const resizedBuffer = await sharp(processedBuffer)
          .resize(panelWidth, panelHeight, {
            fit: 'contain',
            position: 'center',
            background: { r: 255, g: 255, b: 255, alpha: 1 },
          })
          .png()
          .toBuffer();

        composites.push({
          input: resizedBuffer,
          left: x,
          top: y,
        });

        coordinates[panel.type] = { x, y, width: panelWidth, height: panelHeight };
      } catch (err) {
        console.error(`   âŒ Failed to process panel ${panel.type}:`, err.message);
      }
    });

    await Promise.all(processPanelPromises);

    // 3. Composite final sheet
    console.log(`   ðŸŽ¨ Compositing ${composites.length} panels...`);

    const composedBuffer = await background.composite(composites).png().toBuffer();

    // 4. Return as data URL only when safe; otherwise write to disk and return a URL.
    const composedUrl = buildComposeSheetUrl({
      pngBuffer: composedBuffer,
      maxDataUrlBytes: A1_COMPOSE_MAX_DATAURL_BYTES,
      outputDir: A1_COMPOSE_OUTPUT_DIR,
      publicUrlBase: '/api/a1/compose-output',
      designId,
    });

    if (!composedUrl.sheetUrl) {
      return res.status(500).json({
        success: false,
        error: 'COMPOSITION_FAILED',
        message: composedUrl.message || 'A1 composition failed',
        details: composedUrl,
      });
    }

    const { sheetUrl, transport, outputFile, estimatedDataUrlBytes, sheetUrlBytes } = composedUrl;

    console.log(`âœ… [A1 Compose] Composition complete: ${width}x${height}px`);

    return res.status(200).json({
      success: true,
      sheetUrl, // REQUIRED
      composedSheetUrl: sheetUrl, // compat alias
      url: sheetUrl, // compat alias
      coordinates,
      metadata: {
        width,
        height,
        resolution: resolutionKey,
        panelCount: panels.length,
        layoutKey: layoutConfig,
        format: 'png',
        transport,
        pngBytes: composedBuffer.length,
        estimatedDataUrlBytes,
        sheetUrlBytes,
        outputFile,
      },
    });
  } catch (error) {
    console.error('âŒ [A1 Compose] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'COMPOSITION_FAILED',
      message: error.message || 'A1 composition failed',
      details: process.env.NODE_ENV === 'development' ? { stack: error.stack } : undefined,
    });
  }
});

function serializeGeometryJob(job) {
  if (!job) {
    return null;
  }

  return {
    jobId: job.id,
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    error: job.error || null,
    views: job.result?.views || [],
    manifest: job.result || null,
    logs:
      job.status === 'failed'
        ? {
          stdout: job.logs?.stdout?.slice(-2000) || '',
          stderr: job.logs?.stderr?.slice(-2000) || '',
        }
        : undefined,
  };
}

// ============================================================================
// GENARCH PIPELINE API ENDPOINTS
// Async job-based floor plan and A1 sheet generation
// ============================================================================

/**
 * POST /api/genarch/jobs
 * Create and start a new genarch pipeline job
 *
 * Request body:
 * - prompt: Natural language description (e.g., "modern villa 200sqm")
 * - constraintsPath: Path to constraints JSON (alternative to prompt)
 * - seed: Random seed for reproducibility
 * - skipPhase2: Skip Blender rendering (default: true)
 * - skipPhase4: Skip A1 PDF assembly (default: false)
 * - waitForResult: Wait for job to complete (default: false)
 */
app.post('/api/genarch/jobs', aiApiLimiter, genarchAuth, async (req, res) => {
  try {
    const {
      prompt,
      constraintsPath,
      seed,
      skipPhase2 = true,
      skipPhase3 = true,
      skipPhase4 = false,
      driftThreshold = 0.15,
      strict = false,
      blenderPath,
      waitForResult = false,
    } = req.body;

    // Validate input
    if (!prompt && !constraintsPath) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_INPUT',
        message: 'Either prompt or constraintsPath is required',
      });
    }

    console.log(`[Genarch] Creating job: ${prompt || constraintsPath}`);

    // Create job
    const job = genarchJobManager.createJob({
      prompt,
      constraintsPath,
      seed,
      skipPhase2,
      skipPhase3,
      skipPhase4,
      driftThreshold,
      strict,
      blenderPath,
    });

    // Run job
    if (waitForResult) {
      // Sync mode: wait for completion
      try {
        await genarchJobManager.runJob(job, { waitForResult: true });
      } catch (runError) {
        return res.status(500).json({
          success: false,
          error: 'JOB_FAILED',
          message: runError.message,
          job: genarchJobManager.serializeJob(job),
        });
      }
      return res.status(200).json({
        success: true,
        job: genarchJobManager.serializeJob(job),
      });
    }

    // Async mode: return immediately
    genarchJobManager.runJob(job, { waitForResult: false });

    return res.status(202).json({
      success: true,
      message: 'Job created and started',
      job: genarchJobManager.serializeJob(job),
    });
  } catch (error) {
    console.error('[Genarch] Job creation error:', error);
    return res.status(500).json({
      success: false,
      error: 'JOB_CREATION_FAILED',
      message: error.message,
    });
  }
});

/**
 * GET /api/genarch/jobs
 * List all jobs (optionally filtered by status)
 */
app.get('/api/genarch/jobs', genarchAuth, (req, res) => {
  try {
    const { status } = req.query;
    const jobs = genarchJobManager.listJobs(status || null);

    return res.status(200).json({
      success: true,
      jobs,
      count: jobs.length,
    });
  } catch (error) {
    console.error('[Genarch] List jobs error:', error);
    return res.status(500).json({
      success: false,
      error: 'LIST_FAILED',
      message: error.message,
    });
  }
});

/**
 * GET /api/genarch/jobs/:jobId
 * Get job status and progress
 */
app.get('/api/genarch/jobs/:jobId', genarchAuth, (req, res) => {
  try {
    const { jobId } = req.params;
    const job = genarchJobManager.getJob(jobId);

    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'JOB_NOT_FOUND',
        message: `Job ${jobId} not found`,
      });
    }

    return res.status(200).json({
      success: true,
      job: genarchJobManager.serializeJob(job),
    });
  } catch (error) {
    console.error('[Genarch] Get job error:', error);
    return res.status(500).json({
      success: false,
      error: 'GET_JOB_FAILED',
      message: error.message,
    });
  }
});

/**
 * DELETE /api/genarch/jobs/:jobId
 * Cancel a running job
 */
app.delete('/api/genarch/jobs/:jobId', genarchAuth, (req, res) => {
  try {
    const { jobId } = req.params;
    const cancelled = genarchJobManager.cancelJob(jobId);

    if (!cancelled) {
      const job = genarchJobManager.getJob(jobId);
      if (!job) {
        return res.status(404).json({
          success: false,
          error: 'JOB_NOT_FOUND',
          message: `Job ${jobId} not found`,
        });
      }
      return res.status(400).json({
        success: false,
        error: 'CANNOT_CANCEL',
        message: `Job ${jobId} is not running (status: ${job.status})`,
      });
    }

    return res.status(200).json({
      success: true,
      message: `Job ${jobId} cancelled`,
    });
  } catch (error) {
    console.error('[Genarch] Cancel job error:', error);
    return res.status(500).json({
      success: false,
      error: 'CANCEL_FAILED',
      message: error.message,
    });
  }
});

// Genarch runs file serving - using regex pattern to avoid path-to-regexp issues
app.get(/^\/api\/genarch\/runs\/([^/]+)\/(.+)$/, genarchAuth, (req, res) => {
  try {
    const jobId = req.params[0];
    const filePath = req.params[1];

    if (!filePath) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_PATH',
        message: 'File path is required',
      });
    }

    // Validate file path to prevent directory traversal
    const normalizedPath = path.normalize(filePath);
    if (normalizedPath.startsWith('..') || path.isAbsolute(normalizedPath)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_PATH',
        message: 'Invalid file path',
      });
    }

    const runPath = genarchJobManager.getJobRunPath(jobId);
    if (!runPath) {
      return res.status(404).json({
        success: false,
        error: 'JOB_NOT_FOUND',
        message: `Job ${jobId} not found`,
      });
    }

    const fullPath = path.join(runPath, normalizedPath);

    // Ensure the resolved path is within the run folder
    if (!fullPath.startsWith(path.resolve(runPath))) {
      return res.status(403).json({
        success: false,
        error: 'ACCESS_DENIED',
        message: 'Access denied',
      });
    }

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({
        success: false,
        error: 'FILE_NOT_FOUND',
        message: `File not found: ${filePath}`,
      });
    }

    // Set appropriate content type
    const ext = path.extname(fullPath).toLowerCase();
    const contentTypes = {
      '.pdf': 'application/pdf',
      '.json': 'application/json',
      '.dxf': 'application/dxf',
      '.glb': 'model/gltf-binary',
      '.obj': 'text/plain',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
    };

    const contentType = contentTypes[ext] || 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${path.basename(fullPath)}"`);
    res.setHeader('Cache-Control', 'public, max-age=3600');

    res.sendFile(fullPath);
  } catch (error) {
    console.error('[Genarch] Serve file error:', error);
    return res.status(500).json({
      success: false,
      error: 'SERVE_FAILED',
      message: error.message,
    });
  }
});

// Global error handler for unhandled errors
app.use((err, req, res, next) => {
  console.error('âŒ Unhandled error:', err);
  console.error('Error stack:', err.stack);
  console.error('Request URL:', req.url);
  console.error('Request method:', req.method);

  // Don't send error response if headers already sent
  if (res.headersSent) {
    return next(err);
  }

  const isProduction = process.env.NODE_ENV === 'production';
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    ...(isProduction ? {} : { stack: err.stack }),
  });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('âŒ Unhandled Promise Rejection:', reason);
  console.error('Promise:', promise);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('âŒ Uncaught Exception:', error);
  console.error('Error stack:', error.stack);
  // Don't exit in production - let the error handler deal with it
  if (process.env.NODE_ENV !== 'production') {
    process.exit(1);
  }
});

app.listen(PORT, () => {
  console.log(`ðŸš€ API Proxy Server running on http://localhost:${PORT}`);
  console.log('\nðŸ“¡ API Provider Status:');
  console.log(
    `   ðŸ§  Claude (Primary Reasoning): ${process.env.ANTHROPIC_API_KEY ? 'Configured âœ…' : 'Missing âŒ'}`
  );
  console.log(
    `   ðŸŽ¨ Together AI (FLUX Images): ${process.env.TOGETHER_API_KEY ? 'Configured âœ…' : 'Missing âŒ'}`
  );
  console.log(
    `   ðŸ—ï¸  Meshy (3D Models): ${process.env.MESHY_API_KEY ? 'Configured âœ…' : 'Optional âšª'}`
  );
  console.log(
    `   ðŸ“ OpenAI (Fallback): ${process.env.OPENAI_REASONING_API_KEY ? 'Configured âœ…' : 'Optional âšª'}`
  );
  // Check genarch availability
  const genarchDir = path.join(process.cwd(), 'genarch');
  const hasGenarch = fs.existsSync(genarchDir);
  console.log(`\n[Genarch Pipeline] ${hasGenarch ? 'Available' : 'Not installed'}`);
  if (hasGenarch) {
    console.log(`   POST /api/genarch/jobs - Create floor plan job`);
    console.log(`   GET  /api/genarch/jobs/:id - Get job status`);
    console.log(`   GET  /api/genarch/runs/:id/* - Download artifacts`);
  }

  console.log('\n[Architecture Engine] Claude + FLUX + GeometryDNA Pipeline');
});
