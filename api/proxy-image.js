/**
 * Vercel Serverless Function: Image Proxy
 * 
 * Proxies images from Together.ai and other trusted sources to bypass CORS restrictions.
 * Used by A1SheetViewer component for downloading PNG files.
 */

export default async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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

    // Prepare fetch headers (include Together.ai auth if needed)
    const fetchHeaders = {
      'User-Agent': 'Mozilla/5.0 (compatible; ArchitectAI/1.0)'
    };

    // Add Together.ai authorization for Together.ai URLs
    if (url.includes('api.together.ai') || url.includes('api.together.xyz')) {
      const togetherApiKey = process.env.TOGETHER_API_KEY;
      if (togetherApiKey) {
        fetchHeaders['Authorization'] = `Bearer ${togetherApiKey}`;
      }
    }

    // Fetch the image
    const response = await fetch(url, { headers: fetchHeaders });

    if (!response.ok) {
      console.error(`❌ Failed to fetch image: ${response.status} ${response.statusText}`);
      return res.status(response.status).json({ error: 'Failed to fetch image' });
    }

    // Get image buffer
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Set CORS headers to allow canvas access and proper content type
    const contentType = response.headers.get('content-type') || 'image/png';
    
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour

    console.log(`✅ Image proxied successfully (${(buffer.length / 1024).toFixed(2)} KB)`);
    res.send(buffer);

  } catch (error) {
    console.error('Image proxy error:', error);
    res.status(500).json({ error: error.message });
  }
}

