/**
 * CORS-Safe Image Proxy Middleware
 *
 * Proxies external images to enable canvas operations without CORS issues.
 * Used by fingerprint validation (pHash/SSIM) which needs to draw images to canvas.
 */

const rateLimit = require('express-rate-limit');

// Rate limiter for image proxy
const imageProxyLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // Max 100 image proxies per minute
  message: { error: 'Too many image proxy requests' },
});

// Allowlist of trusted image hosts
const TRUSTED_HOSTS = [
  'api.together.xyz',
  'together.xyz',
  'replicate.delivery',
  'replicate.com',
  'oaidalleapiprodscus.blob.core.windows.net', // OpenAI DALL-E
  'storage.googleapis.com',
  'firebasestorage.googleapis.com',
  'localhost',
  '127.0.0.1',
];

/**
 * Image proxy handler
 */
async function imageProxyHandler(req, res) {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  // Validate URL format
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  // Only allow HTTPS URLs (except localhost for dev)
  if (parsedUrl.protocol !== 'https:' && !parsedUrl.hostname.includes('localhost')) {
    return res.status(400).json({ error: 'Only HTTPS URLs allowed' });
  }

  // Check if host is trusted
  const isHostTrusted = TRUSTED_HOSTS.some(
    (host) => parsedUrl.hostname === host || parsedUrl.hostname.endsWith('.' + host)
  );

  if (!isHostTrusted) {
    console.warn(`[ImageProxy] Blocked untrusted host: ${parsedUrl.hostname}`);
    return res.status(403).json({ error: 'Host not in allowlist' });
  }

  try {
    console.log(`[ImageProxy] Fetching: ${url.substring(0, 80)}...`);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'ArchiAI-ImageProxy/1.0',
        Accept: 'image/*',
      },
    });

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Upstream error: ${response.status}`,
      });
    }

    // Get content type from response
    const contentType = response.headers.get('content-type') || 'image/png';

    // Validate it's actually an image
    if (!contentType.startsWith('image/')) {
      return res.status(400).json({ error: 'URL does not return an image' });
    }

    // Set CORS headers to allow canvas usage
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour

    // Stream the image to response
    const buffer = Buffer.from(await response.arrayBuffer());
    res.send(buffer);

    console.log(`[ImageProxy] Served ${buffer.length} bytes (${contentType})`);
  } catch (error) {
    console.error('[ImageProxy] Error:', error.message);
    res.status(500).json({
      error: 'Failed to fetch image',
      message: error.message,
    });
  }
}

/**
 * Mount image proxy routes on an Express app
 *
 * @param {Express} app - Express app instance
 */
function mountImageProxy(app) {
  app.get('/api/image-proxy', imageProxyLimiter, imageProxyHandler);
  console.log('[ImageProxy] Mounted at /api/image-proxy');
}

module.exports = {
  imageProxyLimiter,
  imageProxyHandler,
  mountImageProxy,
  TRUSTED_HOSTS,
};
