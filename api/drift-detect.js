/**
 * Drift Detection API Endpoint
 * 
 * Server-side SSIM and pHash computation for drift detection.
 * Compares baseline and candidate images at whole-sheet and per-panel levels.
 * 
 * Uses sharp + pixelmatch (already in deps) instead of canvas
 */

import sharp from 'sharp';
import pixelmatch from 'pixelmatch';

/**
 * Compute SSIM-like similarity using pixelmatch
 * Returns value between 0 (different) and 1 (identical)
 */
function computeSimilarity(img1Data, img2Data, width, height) {
  if (!img1Data || !img2Data || img1Data.length !== img2Data.length) {
    return 0;
  }

  try {
    // pixelmatch returns number of different pixels
    const diffPixels = pixelmatch(img1Data, img2Data, null, width, height, {
      threshold: 0.1
    });

    const totalPixels = width * height;
    const similarity = 1 - (diffPixels / totalPixels);

    return Math.max(0, Math.min(1, similarity));
  } catch (error) {
    console.warn('Similarity computation failed:', error.message);
    return 0;
  }
}

/**
 * Compute simple perceptual hash from image data
 */
function computePHash(imgData, width, height) {
  try {
    // Simplified perceptual hash: reduce to 8x8 grayscale, compute DCT-like hash
    const blockSize = Math.max(1, Math.floor(Math.min(width, height) / 8));
    let hash = '';

    for (let by = 0; by < 8; by++) {
      for (let bx = 0; bx < 8; bx++) {
        let sum = 0;
        let count = 0;

        for (let y = by * blockSize; y < (by + 1) * blockSize && y < height; y++) {
          for (let x = bx * blockSize; x < (bx + 1) * blockSize && x < width; x++) {
            const idx = (y * width + x) * 4;
            // Grayscale: 0.299R + 0.587G + 0.114B
            sum += imgData[idx] * 0.299 + imgData[idx + 1] * 0.587 + imgData[idx + 2] * 0.114;
            count++;
          }
        }

        const avg = count > 0 ? sum / count : 0;
        hash += avg > 128 ? '1' : '0';
      }
    }

    return hash;
  } catch (error) {
    console.warn('PHash computation failed:', error.message);
    return '0'.repeat(64);
  }
}

/**
 * Compute Hamming distance between two hashes
 */
function hammingDistance(hash1, hash2) {
  if (!hash1 || !hash2) { return 64; }

  const len = Math.max(hash1.length, hash2.length);
  let distance = 0;

  for (let i = 0; i < len; i++) {
    if ((hash1[i] || '0') !== (hash2[i] || '0')) {
      distance++;
    }
  }

  return distance;
}

/**
 * Load image and extract raw pixel data using sharp
 */
async function loadImageData(urlOrBuffer) {
  try {
    let input;

    if (Buffer.isBuffer(urlOrBuffer)) {
      input = urlOrBuffer;
    } else if (typeof urlOrBuffer === 'string') {
      if (urlOrBuffer.startsWith('data:')) {
        // Data URL
        const base64Data = urlOrBuffer.split(',')[1];
        input = Buffer.from(base64Data, 'base64');
      } else if (urlOrBuffer.startsWith('http')) {
        // Remote URL - fetch it
        const response = await fetch(urlOrBuffer);
        if (!response.ok) {
          throw new Error(`Failed to fetch image: ${response.status}`);
        }
        input = Buffer.from(await response.arrayBuffer());
      } else {
        // Local file path
        input = urlOrBuffer;
      }
    } else {
      throw new Error('Invalid image input');
    }

    const image = sharp(input);
    const metadata = await image.metadata();
    const { data, info } = await image.raw().ensureAlpha().toBuffer({ resolveWithObject: true });

    return {
      data,
      width: info.width,
      height: info.height,
      channels: info.channels,
    };
  } catch (error) {
    throw new Error(`Failed to load image: ${error.message}`);
  }
}

/**
 * Extract region from image data
 */
function extractRegion(imageData, fullWidth, x, y, width, height) {
  const regionData = Buffer.alloc(width * height * 4);

  for (let row = 0; row < height; row++) {
    const srcOffset = ((y + row) * fullWidth + x) * 4;
    const dstOffset = row * width * 4;
    imageData.data.copy(regionData, dstOffset, srcOffset, srcOffset + width * 4);
  }

  return {
    data: regionData,
    width,
    height,
  };
}

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { baselineUrl, candidateUrl, panelCoordinates = [] } = req.body;

    if (!baselineUrl || !candidateUrl) {
      return res.status(400).json({
        error: 'baselineUrl and candidateUrl required',
        degraded: false
      });
    }

    // Load images
    let baselineImg, candidateImg;
    try {
      [baselineImg, candidateImg] = await Promise.all([
        loadImageData(baselineUrl),
        loadImageData(candidateUrl),
      ]);
    } catch (loadError) {
      console.error('Failed to load images for drift detection:', loadError.message);
      // Return degraded result instead of silently passing
      return res.status(200).json({
        degraded: true,
        degradedReason: `Image load failed: ${loadError.message}`,
        wholeSheet: {
          ssim: null,
          pHash: null,
          passed: null,
          warning: 'Drift detection unavailable - images could not be loaded'
        },
        panels: [],
        summary: {
          totalPanels: 0,
          passedPanels: 0,
          failedPanels: 0,
          warning: 'QA degraded - manual review recommended'
        }
      });
    }

    // Check dimensions match
    if (baselineImg.width !== candidateImg.width || baselineImg.height !== candidateImg.height) {
      return res.status(200).json({
        degraded: true,
        degradedReason: 'Image dimensions mismatch',
        wholeSheet: {
          ssim: 0,
          pHash: 64,
          passed: false,
          warning: 'Baseline and candidate have different dimensions'
        },
        panels: [],
        summary: {
          totalPanels: 0,
          passedPanels: 0,
          failedPanels: 0
        }
      });
    }

    // Compute whole-sheet metrics
    const wholeSheetSimilarity = computeSimilarity(
      baselineImg.data,
      candidateImg.data,
      baselineImg.width,
      baselineImg.height
    );
    const baselinePHash = computePHash(baselineImg.data, baselineImg.width, baselineImg.height);
    const candidatePHash = computePHash(candidateImg.data, candidateImg.width, candidateImg.height);
    const pHashDistance = hammingDistance(baselinePHash, candidatePHash);

    // Compute per-panel metrics
    const panelMetrics = [];

    for (const panel of panelCoordinates) {
      try {
        // Validate coordinates
        const x = Math.max(0, Math.min(panel.x, baselineImg.width - 1));
        const y = Math.max(0, Math.min(panel.y, baselineImg.height - 1));
        const width = Math.min(panel.width, baselineImg.width - x);
        const height = Math.min(panel.height, baselineImg.height - y);

        if (width <= 0 || height <= 0) {
          panelMetrics.push({
            id: panel.id,
            name: panel.name,
            ssim: null,
            pHashDistance: null,
            passed: null,
            warning: 'Invalid panel coordinates'
          });
          continue;
        }

        const baselineRegion = extractRegion(baselineImg, baselineImg.width, x, y, width, height);
        const candidateRegion = extractRegion(candidateImg, candidateImg.width, x, y, width, height);

        const panelSimilarity = computeSimilarity(
          baselineRegion.data,
          candidateRegion.data,
          width,
          height
        );
        const panelBaseHash = computePHash(baselineRegion.data, width, height);
        const panelCandHash = computePHash(candidateRegion.data, width, height);
        const panelPHashDist = hammingDistance(panelBaseHash, panelCandHash);

        panelMetrics.push({
          id: panel.id,
          name: panel.name,
          ssim: panelSimilarity,
          pHashDistance: panelPHashDist,
          passed: panelSimilarity >= 0.95 && panelPHashDist <= 5
        });
      } catch (panelError) {
        panelMetrics.push({
          id: panel.id,
          name: panel.name,
          ssim: null,
          pHashDistance: null,
          passed: null,
          warning: panelError.message
        });
      }
    }

    return res.status(200).json({
      degraded: false,
      wholeSheet: {
        ssim: wholeSheetSimilarity,
        pHash: pHashDistance,
        passed: wholeSheetSimilarity >= 0.92
      },
      panels: panelMetrics,
      summary: {
        totalPanels: panelMetrics.length,
        passedPanels: panelMetrics.filter(p => p.passed === true).length,
        failedPanels: panelMetrics.filter(p => p.passed === false).length,
        unknownPanels: panelMetrics.filter(p => p.passed === null).length
      }
    });

  } catch (error) {
    console.error('Drift detection error:', error);
    // Return degraded result with warning instead of silently passing
    return res.status(200).json({
      degraded: true,
      degradedReason: error.message,
      wholeSheet: {
        ssim: null,
        pHash: null,
        passed: null,
        warning: `Drift detection failed: ${error.message}`
      },
      panels: [],
      summary: {
        totalPanels: 0,
        passedPanels: 0,
        failedPanels: 0,
        warning: 'QA degraded - manual review recommended'
      }
    });
  }
}
