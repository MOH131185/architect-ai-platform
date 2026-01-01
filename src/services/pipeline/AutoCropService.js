/**
 * AutoCropService
 *
 * Handles automatic trimming of white margins from panel images.
 * Used before A1 composition to ensure clean, centered panels.
 *
 * CORRECTIONS (per mandatory requirements):
 * - Uses sharp.trim({ background:'#ffffff', threshold:10, lineArt:true }) for technical drawings
 * - Uses toBuffer({ resolveWithObject:true }) to avoid double metadata decode
 * - Adds small padding after trim for clean presentation
 *
 * Part of Phase 1: Meshy + Blender + OpenAI Pipeline Refactor
 */

import logger from '../core/logger.js';

/**
 * Default configuration for auto-crop
 */
const DEFAULT_CONFIG = {
  threshold: 10, // RGB tolerance for "white" (0-255)
  background: '#ffffff', // Background color to trim
  lineArt: true, // Better for technical drawings with thin lines
  minWidth: 50, // Minimum output width (prevent over-trimming)
  minHeight: 50, // Minimum output height
  padding: 8, // Pixels of padding to add after trim
  enabled: true, // Global enable/disable
};

/**
 * Panel-type specific configurations
 * Technical drawings use lineArt mode for better edge detection
 */
const PANEL_CONFIGS = {
  // Technical drawings - strict trimming with lineArt
  floor_plan_ground: { lineArt: true, padding: 12 },
  floor_plan_first: { lineArt: true, padding: 12 },
  floor_plan_upper: { lineArt: true, padding: 12 },
  elevation_north: { lineArt: true, padding: 10 },
  elevation_south: { lineArt: true, padding: 10 },
  elevation_east: { lineArt: true, padding: 10 },
  elevation_west: { lineArt: true, padding: 10 },
  section_AA: { lineArt: true, padding: 10 },
  section_BB: { lineArt: true, padding: 10 },
  axonometric: { lineArt: true, padding: 8 },
  site_plan: { lineArt: true, padding: 12 },

  // Rendered 3D views - softer trimming without lineArt
  hero_3d: { lineArt: false, padding: 4, threshold: 15 },
  interior_3d: { lineArt: false, padding: 4, threshold: 15 },

  // Info panels - minimal trimming
  material_palette: { lineArt: false, padding: 6 },
  climate_card: { lineArt: false, padding: 6 },
  title_block: { lineArt: false, padding: 2 },
};

/**
 * AutoCropService class
 * Provides reusable auto-crop functionality for panel images
 */
export class AutoCropService {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get panel-specific configuration
   * @param {string} panelType - Panel type identifier
   * @returns {Object} Merged configuration
   */
  getPanelConfig(panelType) {
    const panelConfig = PANEL_CONFIGS[panelType] || {};
    return { ...this.config, ...panelConfig };
  }

  /**
   * Trim white margins from a single image buffer
   * Uses toBuffer({ resolveWithObject: true }) to avoid double metadata decode
   *
   * @param {Function} sharp - Sharp module instance
   * @param {Buffer} imageBuffer - Input image buffer
   * @param {Object} options - Override options
   * @returns {Promise<{buffer: Buffer, trimmed: boolean, dimensions: Object}>}
   */
  async trimWhiteMargins(sharp, imageBuffer, options = {}) {
    const panelType = options.panelType || 'unknown';
    const opts = { ...this.getPanelConfig(panelType), ...options };

    if (!opts.enabled) {
      return {
        buffer: imageBuffer,
        trimmed: false,
        dimensions: null,
        reason: 'disabled',
      };
    }

    // Get original dimensions
    let originalMeta;
    try {
      originalMeta = await sharp(imageBuffer).metadata();
    } catch (err) {
      logger.warn(`[AutoCrop] [${panelType}] Failed to read metadata:`, err.message);
      return {
        buffer: imageBuffer,
        trimmed: false,
        dimensions: null,
        reason: 'metadata_error',
      };
    }

    try {
      // Build trim options based on panel type
      const trimOptions = {
        threshold: opts.threshold,
        background: opts.background,
      };

      // Add lineArt option for technical drawings
      if (opts.lineArt) {
        trimOptions.lineArt = true;
      }

      // Perform trim operation with resolveWithObject to get dimensions in one call
      const trimResult = await sharp(imageBuffer)
        .trim(trimOptions)
        .toBuffer({ resolveWithObject: true });

      const trimmedBuffer = trimResult.data;
      const trimmedInfo = trimResult.info;

      // Validate trimmed result
      if (trimmedInfo.width < opts.minWidth || trimmedInfo.height < opts.minHeight) {
        logger.debug(`[AutoCrop] [${panelType}] Trimmed result too small, using original`);
        return {
          buffer: imageBuffer,
          trimmed: false,
          dimensions: {
            original: { width: originalMeta.width, height: originalMeta.height },
            trimmed: null,
          },
          reason: 'result_too_small',
        };
      }

      // Add padding after trim if specified
      let finalBuffer = trimmedBuffer;
      let finalWidth = trimmedInfo.width;
      let finalHeight = trimmedInfo.height;

      if (opts.padding > 0) {
        const paddedResult = await sharp(trimmedBuffer)
          .extend({
            top: opts.padding,
            bottom: opts.padding,
            left: opts.padding,
            right: opts.padding,
            background: opts.background,
          })
          .toBuffer({ resolveWithObject: true });

        finalBuffer = paddedResult.data;
        finalWidth = paddedResult.info.width;
        finalHeight = paddedResult.info.height;
      }

      const dimensions = {
        original: {
          width: originalMeta.width,
          height: originalMeta.height,
        },
        trimmed: {
          width: trimmedInfo.width,
          height: trimmedInfo.height,
        },
        // NEW: Persist trim offsets for debugging crop anomalies
        // See: https://sharp.pixelplumbing.com/api-resize#trim
        trimOffset: {
          left: trimmedInfo.trimOffsetLeft || 0,
          top: trimmedInfo.trimOffsetTop || 0,
        },
        final: {
          width: finalWidth,
          height: finalHeight,
        },
        padding: opts.padding,
        reduction: {
          width: originalMeta.width - finalWidth,
          height: originalMeta.height - finalHeight,
          percentage: (
            (1 - (finalWidth * finalHeight) / (originalMeta.width * originalMeta.height)) *
            100
          ).toFixed(1),
        },
      };

      logger.debug(`[AutoCrop] [${panelType}] Trimmed successfully:`, {
        original: `${originalMeta.width}x${originalMeta.height}`,
        final: `${finalWidth}x${finalHeight}`,
        padding: opts.padding,
        lineArt: opts.lineArt,
      });

      return {
        buffer: finalBuffer,
        trimmed: true,
        dimensions,
        reason: 'success',
      };
    } catch (trimError) {
      // Trim operation failed - return original
      logger.warn(`[AutoCrop] [${panelType}] Trim failed:`, trimError.message);
      return {
        buffer: imageBuffer,
        trimmed: false,
        dimensions: {
          original: { width: originalMeta.width, height: originalMeta.height },
        },
        reason: 'trim_error',
        error: trimError.message,
      };
    }
  }

  /**
   * Batch trim multiple panel images
   *
   * @param {Function} sharp - Sharp module instance
   * @param {Object} panels - Object mapping panel types to buffers
   * @param {Object} options - Override options
   * @returns {Promise<{panels: Object, stats: Object}>}
   */
  async cropAllPanels(sharp, panels, options = {}) {
    const results = {};
    const stats = {
      total: 0,
      trimmed: 0,
      unchanged: 0,
      errors: 0,
      details: [],
    };

    for (const [panelType, panelData] of Object.entries(panels)) {
      stats.total++;

      // Extract buffer from various panel formats
      const buffer = panelData?.buffer || panelData;

      if (!Buffer.isBuffer(buffer)) {
        results[panelType] = panelData; // Pass through non-buffer data
        stats.unchanged++;
        stats.details.push({ panel: panelType, status: 'skipped', reason: 'not_buffer' });
        continue;
      }

      const result = await this.trimWhiteMargins(sharp, buffer, {
        ...options,
        panelType,
      });

      if (result.trimmed) {
        stats.trimmed++;
        stats.details.push({
          panel: panelType,
          status: 'trimmed',
          original: result.dimensions?.original,
          final: result.dimensions?.final,
          reduction: result.dimensions?.reduction?.percentage + '%',
        });
      } else if (result.reason === 'trim_error') {
        stats.errors++;
        stats.details.push({ panel: panelType, status: 'error', error: result.error });
      } else {
        stats.unchanged++;
        stats.details.push({ panel: panelType, status: 'unchanged', reason: result.reason });
      }

      // Preserve original panel structure, just update buffer
      if (typeof panelData === 'object' && panelData !== null) {
        results[panelType] = {
          ...panelData,
          buffer: result.buffer,
          autoCropped: result.trimmed,
          autoCropDimensions: result.dimensions,
        };
      } else {
        results[panelType] = result.buffer;
      }
    }

    logger.info('[AutoCrop] Batch complete:', {
      total: stats.total,
      trimmed: stats.trimmed,
      unchanged: stats.unchanged,
      errors: stats.errors,
    });

    return { panels: results, stats };
  }

  /**
   * Check if an image has significant white margins
   * Useful for debugging or conditional processing
   *
   * @param {Function} sharp - Sharp module instance
   * @param {Buffer} imageBuffer - Input image buffer
   * @param {number} marginThreshold - Minimum margin size to consider "significant"
   * @returns {Promise<{hasMargins: boolean, margins: Object}>}
   */
  async detectMargins(sharp, imageBuffer, marginThreshold = 20) {
    try {
      const original = await sharp(imageBuffer).metadata();

      // Use resolveWithObject for efficiency
      const trimResult = await sharp(imageBuffer)
        .trim({ threshold: this.config.threshold, lineArt: true })
        .toBuffer({ resolveWithObject: true });

      const trimmedInfo = trimResult.info;

      // Calculate approximate margins (trim is not symmetric)
      const totalWidthMargin = original.width - trimmedInfo.width;
      const totalHeightMargin = original.height - trimmedInfo.height;

      const margins = {
        horizontal: totalWidthMargin,
        vertical: totalHeightMargin,
        estimatedLeft: Math.floor(totalWidthMargin / 2),
        estimatedRight: Math.ceil(totalWidthMargin / 2),
        estimatedTop: Math.floor(totalHeightMargin / 2),
        estimatedBottom: Math.ceil(totalHeightMargin / 2),
      };

      const hasMargins =
        margins.horizontal > marginThreshold * 2 || margins.vertical > marginThreshold * 2;

      return { hasMargins, margins, original, trimmed: trimmedInfo };
    } catch (err) {
      return { hasMargins: false, margins: null, error: err.message };
    }
  }
}

// Export singleton instance
export const autoCropService = new AutoCropService();

// Export class for custom instances
export default AutoCropService;
