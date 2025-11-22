/**
 * Drift Detection API Endpoint
 * 
 * Server-side SSIM and pHash computation for drift detection.
 * Compares baseline and candidate images at whole-sheet and per-panel levels.
 */

import { createCanvas, loadImage } from 'canvas';

// Simple SSIM implementation (production would use proper library)
function computeSSIM(img1Data, img2Data) {
  // Simplified SSIM calculation
  // In production, use a proper SSIM library like 'ssim.js'
  
  if (img1Data.length !== img2Data.length) {
    return 0;
  }
  
  let sum = 0;
  for (let i = 0; i < img1Data.length; i += 4) {
    const diff = Math.abs(img1Data[i] - img2Data[i]);
    sum += diff;
  }
  
  const avgDiff = sum / (img1Data.length / 4);
  const ssim = 1 - (avgDiff / 255);
  
  return Math.max(0, Math.min(1, ssim));
}

// Simple pHash implementation
function computePHash(imgData) {
  // Simplified perceptual hash
  // In production, use a proper pHash library
  
  let hash = 0;
  for (let i = 0; i < Math.min(imgData.length, 1000); i += 4) {
    hash = ((hash << 5) - hash) + imgData[i];
    hash = hash & hash;
  }
  
  return Math.abs(hash).toString(36);
}

function hammingDistance(hash1, hash2) {
  if (hash1.length !== hash2.length) {
    return Math.abs(hash1.length - hash2.length);
  }
  
  let distance = 0;
  for (let i = 0; i < hash1.length; i++) {
    if (hash1[i] !== hash2[i]) {
      distance++;
    }
  }
  
  return distance;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const { baselineUrl, candidateUrl, panelCoordinates = [] } = req.body;
    
    if (!baselineUrl || !candidateUrl) {
      return res.status(400).json({ error: 'baselineUrl and candidateUrl required' });
    }
    
    // Load images
    const baselineImg = await loadImage(baselineUrl);
    const candidateImg = await loadImage(candidateUrl);
    
    // Create canvases
    const baselineCanvas = createCanvas(baselineImg.width, baselineImg.height);
    const baselineCtx = baselineCanvas.getContext('2d');
    baselineCtx.drawImage(baselineImg, 0, 0);
    const baselineData = baselineCtx.getImageData(0, 0, baselineImg.width, baselineImg.height).data;
    
    const candidateCanvas = createCanvas(candidateImg.width, candidateImg.height);
    const candidateCtx = candidateCanvas.getContext('2d');
    candidateCtx.drawImage(candidateImg, 0, 0);
    const candidateData = candidateCtx.getImageData(0, 0, candidateImg.width, candidateImg.height).data;
    
    // Compute whole-sheet metrics
    const wholeSheetSSIM = computeSSIM(baselineData, candidateData);
    const baselinePHash = computePHash(baselineData);
    const candidatePHash = computePHash(candidateData);
    const pHashDistance = hammingDistance(baselinePHash, candidatePHash);
    
    // Compute per-panel metrics
    const panelMetrics = [];
    
    for (const panel of panelCoordinates) {
      const baselinePanelData = baselineCtx.getImageData(
        panel.x,
        panel.y,
        panel.width,
        panel.height
      ).data;
      
      const candidatePanelData = candidateCtx.getImageData(
        panel.x,
        panel.y,
        panel.width,
        panel.height
      ).data;
      
      const panelSSIM = computeSSIM(baselinePanelData, candidatePanelData);
      const panelBaseHash = computePHash(baselinePanelData);
      const panelCandHash = computePHash(candidatePanelData);
      const panelPHashDist = hammingDistance(panelBaseHash, panelCandHash);
      
      panelMetrics.push({
        id: panel.id,
        name: panel.name,
        ssim: panelSSIM,
        pHashDistance: panelPHashDist,
        passed: panelSSIM >= 0.95 && panelPHashDist <= 5
      });
    }
    
    return res.status(200).json({
      wholeSheet: {
        ssim: wholeSheetSSIM,
        pHash: pHashDistance,
        passed: wholeSheetSSIM >= 0.92
      },
      panels: panelMetrics,
      summary: {
        totalPanels: panelMetrics.length,
        passedPanels: panelMetrics.filter(p => p.passed).length,
        failedPanels: panelMetrics.filter(p => !p.passed).length
      }
    });
    
  } catch (error) {
    console.error('Drift detection error:', error);
    return res.status(500).json({ error: error.message });
  }
}

