/**
 * Image Comparison Utilities
 * 
 * Provides SSIM and pHash computation for drift detection.
 * Uses sharp for image processing and custom algorithms for comparison.
 */

/**
 * Compute perceptual hash (pHash) of an image
 * @param {Buffer} imageBuffer - Image buffer
 * @returns {Promise<string>} pHash string
 */
async function computePHash(imageBuffer) {
  const sharp = require('sharp');
  
  // Resize to 8×8 grayscale for pHash
  const resized = await sharp(imageBuffer)
    .resize(8, 8, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer();
  
  // Compute DCT and hash
  const pixels = Array.from(resized);
  const avg = pixels.reduce((sum, val) => sum + val, 0) / pixels.length;
  
  // Create hash based on whether each pixel is above/below average
  let hash = '';
  for (const pixel of pixels) {
    hash += pixel > avg ? '1' : '0';
  }
  
  return hash;
}

/**
 * Compute Hamming distance between two pHash strings
 * @param {string} hash1 - First pHash
 * @param {string} hash2 - Second pHash
 * @returns {number} Hamming distance (0 = identical)
 */
function pHashDistance(hash1, hash2) {
  if (hash1.length !== hash2.length) {
    return Infinity;
  }
  
  let distance = 0;
  for (let i = 0; i < hash1.length; i++) {
    if (hash1[i] !== hash2[i]) {
      distance++;
    }
  }
  
  return distance;
}

/**
 * Compute SSIM (Structural Similarity Index) between two images
 * Simplified implementation for performance
 * @param {Buffer} img1Buffer - First image buffer
 * @param {Buffer} img2Buffer - Second image buffer
 * @returns {Promise<number>} SSIM score (0-1, 1 = identical)
 */
async function computeSSIM(img1Buffer, img2Buffer) {
  const sharp = require('sharp');
  
  // Resize both images to same dimensions for comparison
  const width = 256;
  const height = 256;
  
  const img1 = await sharp(img1Buffer)
    .resize(width, height, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer();
  
  const img2 = await sharp(img2Buffer)
    .resize(width, height, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer();
  
  // Compute mean and variance
  const pixels1 = Array.from(img1);
  const pixels2 = Array.from(img2);
  
  const mean1 = pixels1.reduce((sum, val) => sum + val, 0) / pixels1.length;
  const mean2 = pixels2.reduce((sum, val) => sum + val, 0) / pixels2.length;
  
  let variance1 = 0;
  let variance2 = 0;
  let covariance = 0;
  
  for (let i = 0; i < pixels1.length; i++) {
    const diff1 = pixels1[i] - mean1;
    const diff2 = pixels2[i] - mean2;
    variance1 += diff1 * diff1;
    variance2 += diff2 * diff2;
    covariance += diff1 * diff2;
  }
  
  variance1 /= pixels1.length;
  variance2 /= pixels2.length;
  covariance /= pixels1.length;
  
  // SSIM formula (simplified)
  const c1 = 6.5025; // (0.01 * 255)^2
  const c2 = 58.5225; // (0.03 * 255)^2
  
  const numerator = (2 * mean1 * mean2 + c1) * (2 * covariance + c2);
  const denominator = (mean1 * mean1 + mean2 * mean2 + c1) * (variance1 + variance2 + c2);
  
  const ssim = numerator / denominator;
  
  return Math.max(0, Math.min(1, ssim));
}

/**
 * Compare two images and compute drift metrics
 * @param {Buffer} baseline - Baseline image buffer
 * @param {Buffer} candidate - Candidate image buffer
 * @param {Object} options - Options
 * @param {Array} options.panelCoordinates - Panel coordinates for per-panel analysis
 * @returns {Promise<Object>} Drift metrics
 */
async function compareImages(baseline, candidate, options = {}) {
  const { panelCoordinates = [] } = options;
  
  // Compute whole-sheet metrics
  const ssim = await computeSSIM(baseline, candidate);
  const hash1 = await computePHash(baseline);
  const hash2 = await computePHash(candidate);
  const pHashDist = pHashDistance(hash1, hash2);
  
  const wholeSheet = {
    ssim,
    pHash: pHashDist,
    passed: ssim >= 0.92 && pHashDist <= 5
  };
  
  // Compute per-panel metrics if coordinates provided
  const panels = [];
  
  if (panelCoordinates.length > 0) {
    const sharp = require('sharp');
    
    for (const panel of panelCoordinates) {
      try {
        // Extract panel regions
        const baselinePanel = await sharp(baseline)
          .extract({
            left: Math.round(panel.x),
            top: Math.round(panel.y),
            width: Math.round(panel.width),
            height: Math.round(panel.height)
          })
          .toBuffer();
        
        const candidatePanel = await sharp(candidate)
          .extract({
            left: Math.round(panel.x),
            top: Math.round(panel.y),
            width: Math.round(panel.width),
            height: Math.round(panel.height)
          })
          .toBuffer();
        
        // Compute panel SSIM
        const panelSSIM = await computeSSIM(baselinePanel, candidatePanel);
        const panelHash1 = await computePHash(baselinePanel);
        const panelHash2 = await computePHash(candidatePanel);
        const panelPHashDist = pHashDistance(panelHash1, panelHash2);
        
        panels.push({
          id: panel.id,
          name: panel.name,
          ssim: panelSSIM,
          pHashDistance: panelPHashDist,
          passed: panelSSIM >= 0.95 && panelPHashDist <= 2
        });
      } catch (panelError) {
        console.warn(`Failed to analyze panel ${panel.id}:`, panelError.message);
        panels.push({
          id: panel.id,
          name: panel.name,
          ssim: 0,
          pHashDistance: Infinity,
          passed: false,
          error: panelError.message
        });
      }
    }
  }
  
  return {
    wholeSheet,
    panels,
    summary: {
      totalPanels: panels.length,
      passedPanels: panels.filter(p => p.passed).length,
      failedPanels: panels.filter(p => !p.passed).length
    }
  };
}

module.exports = {
  computePHash,
  pHashDistance,
  computeSSIM,
  compareImages
};

