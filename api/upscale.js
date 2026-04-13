/**
 * Upscale API Endpoint - Vercel Serverless Function
 *
 * Upscales A1 sheet images to true 300 DPI resolution (9933×7016px landscape)
 * Uses sharp for high-quality Lanczos3 upscaling
 *
 * POST /api/upscale
 * Body: { imageUrl: string, targetWidth: number, targetHeight: number }
 */

import { setCorsHeaders, handlePreflight } from "./_shared/cors.js";

export const config = {
  runtime: "nodejs",
  maxDuration: 30, // 30 seconds for upscaling
};

export default async function handler(req, res) {
  // Enable CORS
  if (handlePreflight(req, res, { methods: "POST, OPTIONS" })) return;
  setCorsHeaders(req, res, { methods: "POST, OPTIONS" });

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  try {
    // 🔒 LANDSCAPE ENFORCEMENT: A1 sheets are ALWAYS landscape (width > height)
    let { imageUrl, targetWidth = 9933, targetHeight = 7016 } = req.body;

    if (!imageUrl) {
      return res.status(400).json({ error: "imageUrl is required" });
    }

    // Validate landscape orientation
    if (targetWidth <= targetHeight) {
      console.warn(
        `⚠️  Warning: Target dimensions ${targetWidth}×${targetHeight} appear to be portrait. Forcing landscape...`,
      );
      // Swap if portrait dimensions were provided
      [targetWidth, targetHeight] = [targetHeight, targetWidth];
    }

    console.log(
      `🔄 Upscaling image to ${targetWidth}×${targetHeight}px (300 DPI A1 landscape)...`,
    );
    console.log(
      `   📐 Target aspect ratio: ${(targetWidth / targetHeight).toFixed(3)} (A1 landscape: 1.414)`,
    );

    // Fetch the image
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch image: ${imageResponse.status}`);
    }

    const imageBuffer = await imageResponse.arrayBuffer();
    const buffer = Buffer.from(imageBuffer);

    // Try to use sharp if available, otherwise return error
    let sharp;
    try {
      sharp = require("sharp");
    } catch (e) {
      console.error("Sharp not available - upscaling requires sharp package");
      return res.status(501).json({
        error: "Upscaling not available",
        message:
          "Sharp package required for upscaling. Install: npm install sharp",
        fallback: "Use client-side canvas upscaling or external service",
      });
    }

    // Upscale using Lanczos3 (high quality)
    const upscaledBuffer = await sharp(buffer)
      .resize(targetWidth, targetHeight, {
        kernel: sharp.kernel.lanczos3,
        fit: "fill",
        withoutEnlargement: false,
      })
      .png({ quality: 100, compressionLevel: 6 })
      .toBuffer();

    console.log(
      `✅ Image upscaled successfully (${upscaledBuffer.length} bytes)`,
    );

    // Convert to base64 data URL
    const base64 = upscaledBuffer.toString("base64");
    const dataUrl = `data:image/png;base64,${base64}`;

    res.status(200).json({
      success: true,
      dataUrl,
      width: targetWidth,
      height: targetHeight,
      dpi: 300,
      format: "A1 landscape (841×594mm @ 300 DPI)",
      orientation: "landscape",
      aspectRatio: (targetWidth / targetHeight).toFixed(3),
      isoStandard: "841×594mm",
      sizeBytes: upscaledBuffer.length,
      sizeMB: (upscaledBuffer.length / 1024 / 1024).toFixed(2),
    });
  } catch (error) {
    console.error("Upscale error:", error);
    res.status(500).json({
      error: "Upscaling failed",
      message: error.message,
    });
  }
}
