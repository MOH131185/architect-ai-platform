import logger from '../utils/logger.js';

/**
 * Image Compression Service for img2img modifications
 *
 * Together.ai has a limit on init_image size (~1.5MB base64)
 * This service compresses images to stay under the limit
 */

class ImageCompressor {
  /**
   * Compress an image data URL to stay under size limit
   * @param {string} dataUrl - Base64 encoded image data URL
   * @param {number} maxSizeMB - Maximum size in MB (default 1.0 for safety)
   * @param {number} targetQuality - Initial quality to try (0-1)
   * @returns {Promise<string>} Compressed data URL
   */
  async compressImage(dataUrl, maxSizeMB = 1.0, targetQuality = 0.8) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        // Calculate target dimensions to reduce file size
        const maxSize = maxSizeMB * 1024 * 1024; // Convert to bytes
        const currentSize = dataUrl.length;

        // If already small enough, return as-is
        if (currentSize <= maxSize) {
          resolve(dataUrl);
          return;
        }

        // Calculate scale factor based on size ratio
        const sizeRatio = Math.sqrt(maxSize / currentSize);

        // Scale dimensions (but not below 512px for quality)
        let targetWidth = Math.max(512, Math.floor(img.width * sizeRatio));
        let targetHeight = Math.max(512, Math.floor(img.height * sizeRatio));

        // Maintain aspect ratio
        const aspectRatio = img.width / img.height;
        if (targetWidth / targetHeight !== aspectRatio) {
          if (targetWidth / targetHeight > aspectRatio) {
            targetWidth = Math.floor(targetHeight * aspectRatio);
          } else {
            targetHeight = Math.floor(targetWidth / aspectRatio);
          }
        }

        // Create canvas for compression
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;

        const ctx = canvas.getContext('2d');

        // Use better image smoothing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Draw scaled image
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

        // Try different quality levels until size is acceptable
        let quality = targetQuality;
        let compressed = null;
        let attempts = 0;
        const maxAttempts = 10;

        while (attempts < maxAttempts) {
          compressed = canvas.toDataURL('image/jpeg', quality);

          if (compressed.length <= maxSize) {
            logger.info(`✅ Image compressed: ${(currentSize / 1024).toFixed(0)}KB → ${(compressed.length / 1024).toFixed(0)}KB`);
            logger.info(`   Dimensions: ${img.width}×${img.height} → ${targetWidth}×${targetHeight}`);
            logger.info(`   Quality: ${(quality * 100).toFixed(0)}%`);
            resolve(compressed);
            return;
          }

          // Reduce quality or size for next attempt
          if (quality > 0.3) {
            quality -= 0.1;
          } else {
            // If quality is too low, reduce dimensions instead
            targetWidth = Math.max(256, Math.floor(targetWidth * 0.8));
            targetHeight = Math.max(256, Math.floor(targetHeight * 0.8));
            canvas.width = targetWidth;
            canvas.height = targetHeight;
            ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
            quality = targetQuality; // Reset quality for new size
          }

          attempts++;
        }

        // If still too large after all attempts, use minimum settings
        canvas.width = 256;
        canvas.height = Math.floor(256 / aspectRatio);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        compressed = canvas.toDataURL('image/jpeg', 0.3);

        logger.info(`⚠️ Maximum compression applied: ${(compressed.length / 1024).toFixed(0)}KB`);
        resolve(compressed);
      };

      img.onerror = (error) => {
        logger.error('Failed to load image for compression:', error);
        reject(new Error('Image compression failed'));
      };

      img.src = dataUrl;
    });
  }

  /**
   * Get size of data URL in KB
   * @param {string} dataUrl - Base64 encoded data URL
   * @returns {number} Size in KB
   */
  getDataUrlSizeKB(dataUrl) {
    return Math.round(dataUrl.length / 1024);
  }

  /**
   * Check if image needs compression
   * @param {string} dataUrl - Base64 encoded data URL
   * @param {number} maxSizeMB - Maximum size in MB
   * @returns {boolean} True if compression needed
   */
  needsCompression(dataUrl, maxSizeMB = 1.0) {
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    return dataUrl.length > maxSizeBytes;
  }

  /**
   * Resize image to exact dimensions with letterboxing (white padding)
   * Ensures init image matches requested dimensions for Together.ai img2img
   * @param {string} dataUrl - Base64 encoded image data URL
   * @param {number} targetWidth - Target width in pixels
   * @param {number} targetHeight - Target height in pixels
   * @param {number} maxSizeMB - Maximum size in MB (default 1.0)
   * @param {number} quality - JPEG quality (0-1, default 0.8)
   * @returns {Promise<string>} Resized and padded data URL
   */
  async resizeToExact(dataUrl, targetWidth, targetHeight, maxSizeMB = 1.0, quality = 0.8) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        // Create canvas with exact target dimensions
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;

        const ctx = canvas.getContext('2d');

        // Fill with white background (letterbox color)
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, targetWidth, targetHeight);

        // Calculate aspect ratios
        const imgAspect = img.width / img.height;
        const targetAspect = targetWidth / targetHeight;

        let drawWidth, drawHeight, offsetX, offsetY;

        if (imgAspect > targetAspect) {
          // Image is wider - fit to width
          drawWidth = targetWidth;
          drawHeight = targetWidth / imgAspect;
          offsetX = 0;
          offsetY = (targetHeight - drawHeight) / 2;
        } else {
          // Image is taller - fit to height
          drawHeight = targetHeight;
          drawWidth = targetHeight * imgAspect;
          offsetX = (targetWidth - drawWidth) / 2;
          offsetY = 0;
        }

        // Use better image smoothing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Draw centered image
        ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);

        // Try compression if needed
        let result = canvas.toDataURL('image/jpeg', quality);
        const maxSize = maxSizeMB * 1024 * 1024;
        let currentQuality = quality;
        let attempts = 0;
        const maxAttempts = 5;

        while (result.length > maxSize && attempts < maxAttempts) {
          currentQuality -= 0.1;
          if (currentQuality < 0.3) {
            currentQuality = 0.3;
            break;
          }
          result = canvas.toDataURL('image/jpeg', currentQuality);
          attempts++;
        }

        const finalSizeKB = (result.length / 1024).toFixed(1);
        logger.info(`✅ Image resized to exact dimensions: ${targetWidth}×${targetHeight}px, ${finalSizeKB}KB`);
        logger.info(`   Original: ${img.width}×${img.height}px, Quality: ${(currentQuality * 100).toFixed(0)}%`);

        resolve(result);
      };

      img.onerror = (error) => {
        logger.error('Failed to load image for resizing:', error);
        reject(new Error('Image resize failed'));
      };

      img.src = dataUrl;
    });
  }
}

// Export singleton instance
export default new ImageCompressor();