/**
 * Overlay Composition API Endpoint
 * 
 * Server-side overlay composition for site maps and other overlays.
 * Ensures deterministic, pixel-perfect overlay placement.
 */

import { createCanvas, loadImage } from 'canvas';

/**
 * Composite overlay onto base image
 * @param {Image} baseImage - Base image
 * @param {Image} overlayImage - Overlay image
 * @param {Object} position - Position { x, y, width, height } (normalized 0-1)
 * @param {number} baseWidth - Base image width
 * @param {number} baseHeight - Base image height
 * @returns {Canvas} Composited canvas
 */
function compositeOverlay(baseImage, overlayImage, position, baseWidth, baseHeight) {
  const canvas = createCanvas(baseWidth, baseHeight);
  const ctx = canvas.getContext('2d');
  
  // Draw base image
  ctx.drawImage(baseImage, 0, 0, baseWidth, baseHeight);
  
  // Calculate overlay position in pixels
  const overlayX = Math.round(position.x * baseWidth);
  const overlayY = Math.round(position.y * baseHeight);
  const overlayWidth = Math.round(position.width * baseWidth);
  const overlayHeight = Math.round(position.height * baseHeight);
  
  // Draw overlay
  ctx.drawImage(overlayImage, overlayX, overlayY, overlayWidth, overlayHeight);
  
  return canvas;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const { baseImageUrl, overlays = [], format = 'png' } = req.body;
    
    if (!baseImageUrl) {
      return res.status(400).json({ error: 'baseImageUrl required' });
    }
    
    // Load base image
    const baseImage = await loadImage(baseImageUrl);
    const baseWidth = baseImage.width;
    const baseHeight = baseImage.height;
    
    // Start with base image
    let currentCanvas = createCanvas(baseWidth, baseHeight);
    let currentCtx = currentCanvas.getContext('2d');
    currentCtx.drawImage(baseImage, 0, 0);
    
    // Apply overlays in order
    for (const overlay of overlays) {
      if (!overlay.dataUrl) {
        console.warn('Overlay missing dataUrl, skipping:', overlay.id);
        continue;
      }
      
      const overlayImage = await loadImage(overlay.dataUrl);
      
      currentCanvas = compositeOverlay(
        currentCanvas,
        overlayImage,
        overlay.position || { x: 0, y: 0, width: 1, height: 1 },
        baseWidth,
        baseHeight
      );
    }
    
    // Convert to buffer
    const buffer = currentCanvas.toBuffer(format === 'png' ? 'image/png' : 'image/jpeg');
    
    // Return as data URL
    const dataUrl = `data:image/${format};base64,${buffer.toString('base64')}`;
    
    return res.status(200).json({
      url: dataUrl,
      width: baseWidth,
      height: baseHeight,
      overlaysApplied: overlays.length,
      format
    });
    
  } catch (error) {
    console.error('Overlay composition error:', error);
    return res.status(500).json({ error: error.message });
  }
}

