/**
 * Sheet Consistency Guard
 *
 * Computes perceptual hash (pHash) and SSIM between baseline and modified A1 sheets
 * Retries with stronger lock if unintended drift detected
 *
 * Uses image hashing for fast comparison and visual similarity detection
 */

import logger from '../utils/logger.js';

class SheetConsistencyGuard {
  constructor() {
    this.ssimThreshold = 0.92; // Minimum SSIM score for acceptable consistency (raised from 0.85)
    this.ssimRetryThreshold = 0.95; // Threshold for retry (stricter)
    this.pHashThreshold = 5; // Maximum Hamming distance for perceptual similarity (stricter, lowered from 8)
    this.pHashRetryThreshold = 3; // Threshold for retry (stricter)
    this.maxRetries = 3; // Maximum retry attempts with stronger locks
  }

  /**
   * Validate consistency for specific zones (Hybrid A1 mode)
   * Crops each zone from both sheets and compares individually
   * @param {string} baselineImageUrl - URL of original A1 sheet
   * @param {string} modifiedImageUrl - URL of modified A1 sheet
   * @param {Array} zones - Array of { id, x, y, width, height } zone definitions
   * @param {Object} options - Validation options
   * @returns {Promise<Object>} { consistent: boolean, zoneResults: {...}, overallScore: number }
   */
  async validateZoneConsistency(baselineImageUrl, modifiedImageUrl, zones, options = {}) {
    const {
      strictMode = true,
      unchangedPanels = [], // Array of panel IDs that should remain unchanged
      zoneThresholds = {} // Optional per-zone thresholds { zoneId: { ssim, pHash } }
    } = options;

    logger.info('Validating zone consistency (Hybrid A1 mode)', {
      zones: zones.length,
      unchangedPanels: unchangedPanels.length
    }, '🔍');

    const zoneResults = {};
    let overallConsistent = true;
    let totalScore = 0;
    let validatedZones = 0;
    const issues = [];

    try {
      // Load images as Image elements for cropping
      const [baselineImg, modifiedImg] = await Promise.all([
        this.loadImageAsImage(baselineImageUrl),
        this.loadImageAsImage(modifiedImageUrl)
      ]);

      // Validate each zone
      for (const zone of zones) {
        const shouldBeUnchanged = unchangedPanels.includes(zone.id);
        const thresholdConfig = zoneThresholds[zone.id] || {};
        const zoneSsimThreshold = typeof thresholdConfig.ssim === 'number' ? thresholdConfig.ssim : this.ssimThreshold;
        const zonePhashThreshold = typeof thresholdConfig.pHash === 'number' ? thresholdConfig.pHash : this.pHashThreshold;
        
        if (!shouldBeUnchanged) {
          // Skip validation for zones that are expected to change
          zoneResults[zone.id] = {
            consistent: true,
            score: 1.0,
            skipped: true,
            reason: 'Zone expected to change'
          };
          continue;
        }

        try {
          // Crop zone from both images (cropImage handles Image elements)
          const baselineZoneData = this.cropImage(baselineImg, zone.x, zone.y, zone.width, zone.height);
          const modifiedZoneData = this.cropImage(modifiedImg, zone.x, zone.y, zone.width, zone.height);

          // Normalize for comparison (resizeImage expects ImageData)
          const normalizedSize = Math.min(zone.width, zone.height, 256);
          const normalizedBaseline = this.resizeImage(baselineZoneData, normalizedSize, normalizedSize);
          const normalizedModified = this.resizeImage(modifiedZoneData, normalizedSize, normalizedSize);

          // Compute metrics
          const baselineHash = await this.computePerceptualHash(normalizedBaseline);
          const modifiedHash = await this.computePerceptualHash(normalizedModified);
          const hashDistance = this.hammingDistance(baselineHash, modifiedHash);
          const ssimScore = await this.computeSSIM(normalizedBaseline, normalizedModified);

          const zoneConsistent = hashDistance <= zonePhashThreshold && ssimScore >= zoneSsimThreshold;
          const zoneScore = (ssimScore * 0.7) + ((1 - hashDistance / 32) * 0.3);

          zoneResults[zone.id] = {
            consistent: zoneConsistent,
            score: zoneScore,
            ssimScore,
            hashDistance,
            thresholds: {
              ssim: zoneSsimThreshold,
              pHash: zonePhashThreshold
            },
            issues: []
          };

          if (!zoneConsistent) {
            overallConsistent = false;
            const issueText = `Zone ${zone.id}: hashDistance=${hashDistance} (≤${zonePhashThreshold}), ssim=${ssimScore.toFixed(3)} (≥${zoneSsimThreshold})`;
            issues.push(issueText);
            zoneResults[zone.id].issues.push(`Zone drifted: ${issueText}`);
          }

          totalScore += zoneScore;
          validatedZones += 1;

        } catch (error) {
          logger.warn(`Zone ${zone.id} validation failed`, error);
          zoneResults[zone.id] = {
            consistent: false,
            score: 0,
            error: error.message
          };
          overallConsistent = false;
        }
      }

      const averageScore = validatedZones > 0 ? totalScore / validatedZones : 0;

      return {
        consistent: overallConsistent,
        zoneResults,
        overallScore: averageScore,
        issues,
        recommendation: overallConsistent 
          ? 'All unchanged zones maintained consistency' 
          : 'Some unchanged zones drifted - consider retry with stronger lock'
      };

    } catch (error) {
      logger.error('Zone consistency validation failed', error);
      return {
        consistent: false,
        zoneResults: {},
        overallScore: 0,
        issues: [`Validation error: ${error.message}`]
      };
    }
  }

  /**
   * Crop image to specific region
   * @param {HTMLImageElement|ImageData} image - Source image (Image element or ImageData)
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @param {number} width - Width to crop
   * @param {number} height - Height to crop
   * @returns {ImageData} Cropped image data
   */
  cropImage(image, x, y, width, height) {
    // Create canvas for cropping
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    // Handle both Image elements and ImageData
    if (image instanceof Image || image instanceof HTMLImageElement) {
      // Draw cropped region from Image element
      ctx.drawImage(
        image,
        x, y, width, height,
        0, 0, width, height
      );
    } else {
      // Handle ImageData (create temporary canvas first)
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = image.width;
      tempCanvas.height = image.height;
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.putImageData(image, 0, 0);
      
      ctx.drawImage(
        tempCanvas,
        x, y, width, height,
        0, 0, width, height
      );
    }

    return ctx.getImageData(0, 0, width, height);
  }

  /**
   * Load image as HTMLImageElement (for zone cropping)
   * @param {string} url - Image URL
   * @returns {Promise<HTMLImageElement>} Image element
   */
  async loadImageAsImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      
      // Use proxy for cross-origin URLs
      const needsProxy = url.startsWith('http') &&
                        !url.startsWith(window.location.origin) &&
                        !url.startsWith('http://localhost') &&
                        !url.startsWith('data:');
      
      const imageUrl = needsProxy
        ? `/api/proxy-image?url=${encodeURIComponent(url)}`
        : url;
      
      if (!needsProxy && url.startsWith('http')) {
        img.crossOrigin = 'anonymous';
      }
      
      img.onload = () => resolve(img);
      img.onerror = (e) => reject(new Error(`Failed to load image: ${url.substring(0, 100)}`));
      img.src = imageUrl;
    });
  }

  /**
   * Validate consistency between baseline and modified sheet
   * @param {string} baselineImageUrl - URL of original A1 sheet
   * @param {string} modifiedImageUrl - URL of modified A1 sheet
   * @param {Object} options - Validation options
   * @returns {Promise<Object>} { consistent: boolean, score: number, retryNeeded: boolean, issues: string[] }
   */
  async validateConsistency(baselineImageUrl, modifiedImageUrl, options = {}) {
    const {
      strictMode = true,
      allowedDrift = 'minimal' // 'minimal' | 'moderate' | 'any'
    } = options;

    logger.info('Validating A1 sheet consistency', {
      baseline: baselineImageUrl?.substring(0, 80),
      modified: modifiedImageUrl?.substring(0, 80)
    }, '🔍');

    try {
      // Load images for comparison
      const [baselineImg, modifiedImg] = await Promise.all([
        this.loadImage(baselineImageUrl),
        this.loadImage(modifiedImageUrl)
      ]);

      // Normalize image sizes before comparison (prevents false negatives from size differences)
      const normalizedSize = Math.min(baselineImg.width, baselineImg.height, modifiedImg.width, modifiedImg.height, 512);
      const normalizedBaseline = this.resizeImage(baselineImg, normalizedSize, normalizedSize);
      const normalizedModified = this.resizeImage(modifiedImg, normalizedSize, normalizedSize);

      // Compute perceptual hash (fast comparison) on normalized images
      const baselineHash = await this.computePerceptualHash(normalizedBaseline);
      const modifiedHash = await this.computePerceptualHash(normalizedModified);
      const hashDistance = this.hammingDistance(baselineHash, modifiedHash);

      logger.debug('Computed pHash distance', {
        hashDistance,
        threshold: this.pHashThreshold
      });

      // Compute SSIM (structural similarity) for detailed comparison on normalized images
      const ssimScore = await this.computeSSIM(normalizedBaseline, normalizedModified);
      logger.debug('Computed SSIM score', {
        ssimScore: ssimScore.toFixed(3),
        threshold: this.ssimThreshold,
        retryThreshold: this.ssimRetryThreshold,
        normalizedSize: `${normalizedSize}×${normalizedSize}px`
      });

      // Determine consistency based on thresholds
      const issues = [];
      let consistent = true;
      let retryNeeded = false;

      // Use stricter thresholds for retry decisions
      const needsRetry = hashDistance > this.pHashRetryThreshold || ssimScore < this.ssimRetryThreshold;
      const isAcceptable = hashDistance <= this.pHashThreshold && ssimScore >= this.ssimThreshold;

      if (hashDistance > this.pHashThreshold) {
        issues.push(`High perceptual hash distance: ${hashDistance} (threshold: ${this.pHashThreshold})`);
        if (strictMode && !isAcceptable) {
          consistent = false;
          retryNeeded = needsRetry;
        }
      }

      if (ssimScore < this.ssimThreshold) {
        issues.push(`Low SSIM score: ${ssimScore.toFixed(3)} (threshold: ${this.ssimThreshold})`);
        if (strictMode && !isAcceptable) {
          consistent = false;
          retryNeeded = needsRetry;
        }
      }

      // Adjust thresholds based on allowed drift
      if (allowedDrift === 'moderate') {
        if (hashDistance <= this.pHashThreshold * 1.5 && ssimScore >= this.ssimThreshold * 0.9) {
          consistent = true;
          retryNeeded = false;
        }
      } else if (allowedDrift === 'any') {
        // Allow any drift (user explicitly requested changes)
        consistent = true;
        retryNeeded = false;
      }

      const overallScore = (ssimScore * 0.7) + ((1 - hashDistance / 32) * 0.3); // Normalize hash distance

      return {
        consistent,
        score: overallScore,
        ssimScore,
        hashDistance,
        retryNeeded,
        issues,
        recommendation: retryNeeded ? 'Retry with stronger consistency lock' : 'Consistency acceptable'
      };

    } catch (error) {
      logger.error('Consistency validation failed', error);
      return {
        consistent: false,
        score: 0,
        ssimScore: 0,
        hashDistance: 0,
        retryNeeded: true,
        issues: [`Validation error: ${error.message}`],
        recommendation: 'Retry validation after fixing error'
      };
    }
  }

  /**
   * Load image from URL (works with both data URLs and HTTP URLs)
   * Uses proxy for cross-origin images to avoid CORS issues
   * @param {string} url - Image URL
   * @returns {Promise<ImageData>} Image data for analysis
   */
  async loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();

      // Determine if we need to use proxy
      const needsProxy = url.startsWith('http') &&
                        !url.startsWith(window.location.origin) &&
                        !url.startsWith('http://localhost') &&
                        !url.startsWith('data:');

      // Use proxy for cross-origin URLs to avoid CORS
      const imageUrl = needsProxy
        ? `/api/proxy-image?url=${encodeURIComponent(url)}`
        : url;

      logger.debug('Loading image', {
        method: needsProxy ? 'via proxy' : 'direct',
        originalUrl: url.substring(0, 100),
        proxyUrl: needsProxy ? imageUrl.substring(0, 150) : null
      }, '🖼️');

      // Only set crossOrigin for same-origin or proxy URLs
      if (!needsProxy && url.startsWith('http')) {
        img.crossOrigin = 'anonymous';
      }

      img.onload = () => {
        logger.debug('Image loaded successfully', { url: url.substring(0, 80) });
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, img.width, img.height);
          resolve(imageData);
        } catch (error) {
          logger.error('Canvas error', error);
          reject(error);
        }
      };

      img.onerror = (e) => {
        logger.error('Image load error', {
          method: needsProxy ? 'proxy' : 'direct',
          url: url.substring(0, 100),
          event: e
        });
        reject(new Error(`Failed to load image from ${needsProxy ? 'proxy' : 'direct'}: ${url.substring(0, 100)}`));
      };

      img.src = imageUrl;
    });
  }

  /**
   * Compute perceptual hash (pHash) for image
   * Simplified version using DCT (Discrete Cosine Transform)
   * @param {ImageData} imageData - Image data
   * @returns {Promise<string>} Perceptual hash string
   */
  async computePerceptualHash(imageData) {
    // Resize to 32x32 for fast hashing
    const resized = this.resizeImage(imageData, 32, 32);
    
    // Convert to grayscale
    const grayscale = this.toGrayscale(resized);
    
    // Compute DCT (simplified - using average block method)
    const dct = this.computeDCT(grayscale);
    
    // Extract top-left 8x8 (most significant frequencies)
    const hash = [];
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        hash.push(dct[i * 32 + j] > 0 ? '1' : '0');
      }
    }
    
    return hash.join('');
  }

  /**
   * Compute SSIM (Structural Similarity Index) between two images
   * @param {ImageData} img1 - First image
   * @param {ImageData} img2 - Second image
   * @returns {Promise<number>} SSIM score (0-1)
   */
  async computeSSIM(img1, img2) {
    // Resize to same size if needed
    const size = Math.min(img1.width, img2.width, img1.height, img2.height, 256);
    const resized1 = this.resizeImage(img1, size, size);
    const resized2 = this.resizeImage(img2, size, size);
    
    const gray1 = this.toGrayscale(resized1);
    const gray2 = this.toGrayscale(resized2);
    
    // Compute SSIM components
    const mean1 = this.mean(gray1);
    const mean2 = this.mean(gray2);
    
    const variance1 = this.variance(gray1, mean1);
    const variance2 = this.variance(gray2, mean2);
    const covariance = this.covariance(gray1, gray2, mean1, mean2);
    
    // SSIM constants
    const C1 = 0.01 ** 2;
    const C2 = 0.03 ** 2;
    
    const numerator = (2 * mean1 * mean2 + C1) * (2 * covariance + C2);
    const denominator = (mean1 ** 2 + mean2 ** 2 + C1) * (variance1 + variance2 + C2);
    
    return numerator / denominator;
  }

  /**
   * Compute Hamming distance between two hash strings
   * @param {string} hash1 - First hash
   * @param {string} hash2 - Second hash
   * @returns {number} Hamming distance
   */
  hammingDistance(hash1, hash2) {
    if (hash1.length !== hash2.length) return Infinity;
    let distance = 0;
    for (let i = 0; i < hash1.length; i++) {
      if (hash1[i] !== hash2[i]) distance++;
    }
    return distance;
  }

  /**
   * Resize image data
   * @param {ImageData} imageData - Source image
   * @param {number} width - Target width
   * @param {number} height - Target height
   * @returns {ImageData} Resized image data
   */
  resizeImage(imageData, width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = imageData.width;
    tempCanvas.height = imageData.height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.putImageData(imageData, 0, 0);
    
    ctx.drawImage(tempCanvas, 0, 0, width, height);
    return ctx.getImageData(0, 0, width, height);
  }

  /**
   * Convert image to grayscale
   * @param {ImageData} imageData - Color image
   * @returns {Uint8Array} Grayscale data
   */
  toGrayscale(imageData) {
    const data = imageData.data;
    const gray = new Uint8Array(imageData.width * imageData.height);
    
    for (let i = 0; i < gray.length; i++) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      gray[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    }
    
    return gray;
  }

  /**
   * Compute DCT (simplified block-based)
   * @param {Uint8Array} grayscale - Grayscale data
   * @returns {Float32Array} DCT coefficients
   */
  computeDCT(grayscale) {
    const size = Math.sqrt(grayscale.length);
    const dct = new Float32Array(grayscale.length);
    
    // Simplified DCT using block averages
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        let sum = 0;
        for (let x = 0; x < size; x++) {
          for (let y = 0; y < size; y++) {
            sum += grayscale[x * size + y] * Math.cos((Math.PI * (2 * x + 1) * i) / (2 * size)) *
                                              Math.cos((Math.PI * (2 * y + 1) * j) / (2 * size));
          }
        }
        dct[i * size + j] = sum / (size * size);
      }
    }
    
    return dct;
  }

  /**
   * Compute mean of array
   */
  mean(arr) {
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  /**
   * Compute variance
   */
  variance(arr, mean) {
    return arr.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / arr.length;
  }

  /**
   * Compute covariance
   */
  covariance(arr1, arr2, mean1, mean2) {
    let sum = 0;
    for (let i = 0; i < arr1.length; i++) {
      sum += (arr1[i] - mean1) * (arr2[i] - mean2);
    }
    return sum / arr1.length;
  }

  /**
   * Generate retry configuration with stronger consistency lock
   * @param {number} attempt - Current retry attempt (1-based)
   * @param {Object} originalConfig - Original generation config
   * @returns {Object} Enhanced config with stronger lock
   */
  generateRetryConfig(attempt, originalConfig) {
    const multiplier = 1 + (attempt * 0.2); // Increase lock strength by 20% per retry
    
    return {
      ...originalConfig,
      guidanceScale: (originalConfig.guidanceScale || 7.8) * multiplier,
      steps: Math.min((originalConfig.steps || 48) + (attempt * 4), 60), // Increase steps but cap at 60
      consistencyLockStrength: multiplier,
      enhancedNegativePrompt: `${originalConfig.negativePrompt || ''}
(consistency lock strength: ${multiplier.toFixed(1)}), (strict adherence to original:${multiplier.toFixed(1)}),
(do not modify unchanged elements:${multiplier.toFixed(1)})`
    };
  }
}

export default new SheetConsistencyGuard();

