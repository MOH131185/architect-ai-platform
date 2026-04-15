/**
 * Image Proxy API Endpoint - Vercel Serverless Function
 *
 * Proxies external images to avoid CORS issues.
 * This is essential for loading images from CDNs like Together.ai.
 *
 * GET /api/proxy-image?url=<encoded-url>
 *
 * @route GET /api/proxy-image
 */

import { getCorsHeaders } from "./_shared/cors.js";

export const config = {
  runtime: "edge",
  regions: ["iad1"], // Use a single region for consistency
};

export default async function handler(req) {
  const corsHeaders = getCorsHeaders(req, { methods: "GET, OPTIONS" });

  // Handle OPTIONS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const imageUrl = url.searchParams.get("url");

  if (!imageUrl) {
    return new Response(JSON.stringify({ error: "Missing url parameter" }), {
      status: 400,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  }

  try {
    // Decode and validate URL
    const decodedUrl = decodeURIComponent(imageUrl);

    // Basic URL validation
    let parsedUrl;
    try {
      parsedUrl = new URL(decodedUrl);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid URL" }), {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    }

    // Only allow HTTPS
    if (parsedUrl.protocol !== "https:") {
      return new Response(
        JSON.stringify({ error: "Only HTTPS URLs are allowed" }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    // Allowlist of trusted domains
    const trustedDomains = [
      "api.together.ai", // Together.ai main API domain
      "api.together.xyz", // Together.ai alternative domain
      "together.xyz",
      "together.ai", // Together.ai short URLs
      "replicate.delivery",
      "replicate.com",
      "pbxt.replicate.delivery",
      "oaidalleapiprodscus.blob.core.windows.net",
      "imgur.com",
      "i.imgur.com",
      "cloudflare-ipfs.com",
      "ipfs.io",
      "arweave.net",
    ];

    const isDomainTrusted = trustedDomains.some(
      (domain) =>
        parsedUrl.hostname === domain ||
        parsedUrl.hostname.endsWith(`.${domain}`),
    );

    if (!isDomainTrusted) {
      return new Response(
        JSON.stringify({ error: "Domain not in allowlist" }),
        {
          status: 403,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    // Fetch the image
    const response = await fetch(decodedUrl, {
      headers: {
        "User-Agent": "ArchitectAI-Proxy/1.0",
      },
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({
          error: `Upstream error: ${response.status}`,
          url: decodedUrl,
        }),
        {
          status: response.status,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    // Get content type
    const contentType = response.headers.get("content-type") || "image/png";

    // Stream the response
    return new Response(response.body, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400", // Cache for 24 hours
        "X-Proxy-Source": "architect-ai",
      },
    });
  } catch (error) {
    console.error("[Proxy Image] Error:", error);
    return new Response(
      JSON.stringify({
        error: "Proxy failed",
        message: error.message,
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
}
