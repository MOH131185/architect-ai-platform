import logger from '../utils/logger.js';

/**
 * Image Upscaling Service
 *
 * Upscales generated A1 sheet images to improve text readability
 * Uses high-quality canvas-based interpolation for 2x or 3x upscaling
 */

/**
 * Upscale an image using canvas-based bicubic interpolation
 * @param {string} imageUrl - URL or base64 of the image to upscale
 * @param {number} scaleFactor - Scale multiplier (2 = 2x, 3 = 3x, etc.)
 * @returns {Promise<string>} Base64 data URL of upscaled image
 */
export async function upscaleImage(imageUrl, scaleFactor = 2) {
  logger.info(`🔍 [Upscaling Service] Starting upscaling with factor ${scaleFactor}x...`);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // Enable CORS for external images

    img.onload = () => {
      try {
        const originalWidth = img.width;
        const originalHeight = img.height;
        const targetWidth = originalWidth * scaleFactor;
        const targetHeight = originalHeight * scaleFactor;

        logger.info(`   📐 Original: ${originalWidth}×${originalHeight}px`);
        logger.info(`   📐 Target: ${targetWidth}×${targetHeight}px`);

        // Create canvas for upscaling
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');

        // Use high-quality image smoothing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high'; // 'high' uses bicubic interpolation

        // Draw upscaled image
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

        // Convert to base64
        const upscaledDataUrl = canvas.toDataURL('image/png', 1.0); // Maximum quality

        logger.success(` [Upscaling Service] Upscaling complete`);
        logger.info(`   📊 Data URL size: ${(upscaledDataUrl.length / 1024 / 1024).toFixed(2)}MB`);

        resolve(upscaledDataUrl);
      } catch (error) {
        logger.error('❌ [Upscaling Service] Failed to upscale:', error);
        reject(error);
      }
    };

    img.onerror = (error) => {
      logger.error('❌ [Upscaling Service] Failed to load image:', error);
      reject(new Error('Failed to load image for upscaling'));
    };

    img.src = imageUrl;
  });
}

/**
 * Progressive upscaling for better quality
 * Upscales in multiple steps (2x → 2x instead of direct 4x)
 * @param {string} imageUrl - URL or base64 of the image to upscale
 * @param {number} targetScale - Final scale multiplier
 * @returns {Promise<string>} Base64 data URL of upscaled image
 */
export async function upscaleImageProgressive(imageUrl, targetScale = 4) {
  logger.info(`🔍 [Upscaling Service] Starting progressive upscaling to ${targetScale}x...`);

  let currentUrl = imageUrl;
  let currentScale = 1;

  // Upscale in 2x steps for better quality
  while (currentScale < targetScale) {
    const stepScale = Math.min(2, targetScale / currentScale);
    logger.info(`   🔄 Step: ${currentScale}x → ${currentScale * stepScale}x`);
    currentUrl = await upscaleImage(currentUrl, stepScale);
    currentScale *= stepScale;
  }

  logger.success(` [Upscaling Service] Progressive upscaling complete: ${targetScale}x`);
  return currentUrl;
}

/**
 * Upscale A1 sheet to print-quality resolution
 * Targets 300 DPI equivalent for A1 landscape (9933×7016px) or portrait (7016×9933px)
 * @param {string} imageUrl - URL or base64 of the A1 sheet
 * @param {number} currentWidth - Current image width (default: 1792 for landscape)
 * @param {number} currentHeight - Current image height (default: 1264 for landscape)
 * @param {string} orientation - 'landscape' (default) or 'portrait'
 * @returns {Promise<Object>} { url: string, width: number, height: number, scale: number }
 */
export async function upscaleA1SheetForPrint(imageUrl, currentWidth = 1792, currentHeight = 1264, orientation = 'landscape') {
  logger.info(`🖨️  [Upscaling Service] Upscaling A1 sheet for print quality (300 DPI ${orientation})...`);

  // A1 @ 300 DPI: Landscape = 9933×7016px, Portrait = 7016×9933px
  const isLandscape = orientation === 'landscape' || currentWidth > currentHeight;
  const targetWidth = isLandscape ? 9933 : 7016;
  const targetHeight = isLandscape ? 7016 : 9933;

  const scaleX = targetWidth / currentWidth;
  const scaleY = targetHeight / currentHeight;
  const scaleFactor = Math.min(scaleX, scaleY); // Use smaller scale to maintain aspect ratio

  logger.info(`   📐 Current: ${currentWidth}×${currentHeight}px (~60 DPI)`);
  logger.info(`   📐 Target: ${targetWidth}×${targetHeight}px (300 DPI)`);
  logger.info(`   🔢 Scale factor: ${scaleFactor.toFixed(2)}x`);

  // For very large scales (>4x), use progressive upscaling
  let upscaledUrl;
  if (scaleFactor > 4) {
    logger.info(`   ⚠️  Large scale detected (${scaleFactor.toFixed(2)}x), using progressive upscaling...`);
    upscaledUrl = await upscaleImageProgressive(imageUrl, Math.floor(scaleFactor));
    // Fine-tune to exact dimensions if needed
    if (Math.floor(scaleFactor) !== scaleFactor) {
      const remainingScale = scaleFactor / Math.floor(scaleFactor);
      upscaledUrl = await upscaleImage(upscaledUrl, remainingScale);
    }
  } else {
    upscaledUrl = await upscaleImage(imageUrl, scaleFactor);
  }

  return {
    url: upscaledUrl,
    width: Math.round(currentWidth * scaleFactor),
    height: Math.round(currentHeight * scaleFactor),
    scale: scaleFactor,
    dpi: Math.round(scaleFactor * 60), // Approximate DPI (assuming original was ~60 DPI)
    printReady: scaleFactor >= 4.5 // 300 DPI / 60 DPI ≈ 5x
  };
}

/**
 * Smart upscaling for display
 * Upscales to 2x for better on-screen text clarity without massive file size
 * @param {string} imageUrl - URL or base64 of the A1 sheet
 * @param {number} currentWidth - Current image width (default: 1792 for landscape)
 * @param {number} currentHeight - Current image height (default: 1264 for landscape)
 * @returns {Promise<Object>} { url: string, width: number, height: number, scale: number }
 */
export async function upscaleA1SheetForDisplay(imageUrl, currentWidth = 1792, currentHeight = 1264) {
  logger.info(`🖥️  [Upscaling Service] Upscaling A1 sheet for display (2x for text clarity)...`);

  const scaleFactor = 2; // 2x upscaling balances quality and file size

  logger.info(`   📐 Original: ${currentWidth}×${currentHeight}px`);
  logger.info(`   📐 Upscaled: ${currentWidth * scaleFactor}×${currentHeight * scaleFactor}px`);

  const upscaledUrl = await upscaleImage(imageUrl, scaleFactor);

  return {
    url: upscaledUrl,
    width: currentWidth * scaleFactor,
    height: currentHeight * scaleFactor,
    scale: scaleFactor,
    purpose: 'display',
    estimatedDPI: 120 // ~60 DPI × 2
  };
}

/**
 * Sharpen image to enhance text clarity
 * Applies unsharp mask filter via canvas
 * @param {string} imageUrl - URL or base64 of the image
 * @param {number} amount - Sharpening strength (0-1, default 0.5)
 * @returns {Promise<string>} Base64 data URL of sharpened image
 */
export async function sharpenImage(imageUrl, amount = 0.5) {
  logger.info(`✨ [Upscaling Service] Applying sharpening filter (amount: ${amount})...`);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');

        // Draw original
        ctx.drawImage(img, 0, 0);

        // Get image data
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // Simple sharpening kernel (unsharp mask approximation)
        const kernel = [
          0, -amount, 0,
          -amount, 1 + 4 * amount, -amount,
          0, -amount, 0
        ];

        // Apply convolution (simplified for performance)
        const tempData = new Uint8ClampedArray(data);
        for (let y = 1; y < canvas.height - 1; y++) {
          for (let x = 1; x < canvas.width - 1; x++) {
            for (let c = 0; c < 3; c++) { // RGB only, skip alpha
              const i = (y * canvas.width + x) * 4 + c;
              let sum = 0;
              sum += tempData[i - canvas.width * 4 - 4] * kernel[0];
              sum += tempData[i - canvas.width * 4] * kernel[1];
              sum += tempData[i - canvas.width * 4 + 4] * kernel[2];
              sum += tempData[i - 4] * kernel[3];
              sum += tempData[i] * kernel[4];
              sum += tempData[i + 4] * kernel[5];
              sum += tempData[i + canvas.width * 4 - 4] * kernel[6];
              sum += tempData[i + canvas.width * 4] * kernel[7];
              sum += tempData[i + canvas.width * 4 + 4] * kernel[8];
              data[i] = Math.max(0, Math.min(255, sum));
            }
          }
        }

        ctx.putImageData(imageData, 0, 0);

        const sharpenedDataUrl = canvas.toDataURL('image/png', 1.0);
        logger.success(` [Upscaling Service] Sharpening complete`);
        resolve(sharpenedDataUrl);
      } catch (error) {
        logger.error('❌ [Upscaling Service] Failed to sharpen:', error);
        reject(error);
      }
    };

    img.onerror = (error) => {
      logger.error('❌ [Upscaling Service] Failed to load image for sharpening:', error);
      reject(new Error('Failed to load image for sharpening'));
    };

    img.src = imageUrl;
  });
}

/**
 * Comprehensive enhancement pipeline: upscale + sharpen
 * @param {string} imageUrl - URL or base64 of the A1 sheet
 * @param {Object} options - { mode: 'display'|'print', sharpen: boolean, currentWidth, currentHeight }
 * @returns {Promise<Object>} Enhanced image with metadata
 */
export async function enhanceA1Sheet(imageUrl, options = {}) {
  const {
    mode = 'display', // 'display' (2x) or 'print' (5x+)
    sharpen = true,
    currentWidth = 1792, // Default landscape dimensions
    currentHeight = 1264,
    orientation = 'landscape' // Default landscape
  } = options;

  logger.info(`🎨 [Upscaling Service] Starting comprehensive A1 enhancement (${mode} mode)...`);

  let result;

  // Step 1: Upscale
  if (mode === 'print') {
    result = await upscaleA1SheetForPrint(imageUrl, currentWidth, currentHeight, orientation);
  } else {
    result = await upscaleA1SheetForDisplay(imageUrl, currentWidth, currentHeight);
  }

  // Step 2: Sharpen (optional but recommended for text clarity)
  if (sharpen) {
    logger.info(`   ✨ Applying sharpening for text clarity...`);
    result.url = await sharpenImage(result.url, 0.4); // Moderate sharpening
    result.sharpened = true;
  }

  logger.success(` [Upscaling Service] Enhancement complete!`);
  logger.info(`   📐 Final dimensions: ${result.width}×${result.height}px`);
  logger.info(`   🔢 Scale: ${result.scale}x`);
  logger.info(`   ✨ Sharpened: ${result.sharpened ? 'Yes' : 'No'}`);
  if (result.dpi) logger.info(`   🖨️  Estimated DPI: ${result.dpi}`);

  return result;
}

export default {
  upscaleImage,
  upscaleImageProgressive,
  upscaleA1SheetForPrint,
  upscaleA1SheetForDisplay,
  sharpenImage,
  enhanceA1Sheet
};
