/**
 * A1 Sheet Compositor Service
 *
 * Composites captured site plans onto AI-generated A1 sheets
 * since FLUX.1-dev doesn't support direct image attachments.
 *
 * This service:
 * 1. Takes the generated A1 sheet
 * 2. Takes the captured site plan
 * 3. Composites them together with proper positioning
 */

import logger from '../utils/logger';

class A1SheetCompositor {
  constructor() {
    this.SITE_PLAN_POSITION = {
      x: 0.02, // 2% from left
      y: 0.02, // 2% from top
      width: 0.25, // 25% of sheet width
      height: 0.20 // 20% of sheet height
    };

    logger.info('A1 Sheet Compositor initialized', null, '🎨');
  }

  /**
   * Composite site plan onto A1 sheet
   * @param {string} sheetUrl - URL or data URL of the generated A1 sheet
   * @param {string} sitePlanDataUrl - Data URL of the captured site plan
   * @param {Object} options - Compositing options
   * @returns {Promise<string>} - Data URL of composited sheet
   */
  async compositeSitePlan(sheetUrl, sitePlanDataUrl, options = {}) {
    if (!sheetUrl || !sitePlanDataUrl) {
      logger.warn('Missing sheet or site plan for compositing');
      return sheetUrl; // Return original if no site plan
    }

    logger.info('Starting site plan compositing', null, '🖼️');

    try {
      // Create canvas
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      // Load A1 sheet
      const sheetImg = await this.loadImage(sheetUrl);
      canvas.width = sheetImg.width;
      canvas.height = sheetImg.height;

      // Draw A1 sheet as base
      ctx.drawImage(sheetImg, 0, 0);

      // Load site plan
      const sitePlanImg = await this.loadImage(sitePlanDataUrl);

      // Calculate position and size for site plan
      const position = options.position || this.SITE_PLAN_POSITION;
      const sitePlanX = Math.floor(canvas.width * position.x);
      const sitePlanY = Math.floor(canvas.height * position.y);
      const sitePlanWidth = Math.floor(canvas.width * position.width);
      const sitePlanHeight = Math.floor(canvas.height * position.height);

      // Draw white background for site plan area (in case of transparency)
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(sitePlanX, sitePlanY, sitePlanWidth, sitePlanHeight);

      // Draw site plan with border
      ctx.drawImage(
        sitePlanImg,
        sitePlanX,
        sitePlanY,
        sitePlanWidth,
        sitePlanHeight
      );

      // Add border around site plan
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      ctx.strokeRect(sitePlanX, sitePlanY, sitePlanWidth, sitePlanHeight);

      // Add "SITE PLAN" label
      const labelHeight = 30;
      ctx.fillStyle = '#000000';
      ctx.fillRect(sitePlanX, sitePlanY, sitePlanWidth, labelHeight);

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 16px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('SITE PLAN', sitePlanX + sitePlanWidth / 2, sitePlanY + labelHeight / 2);

      // Add north arrow
      this.drawNorthArrow(ctx, sitePlanX + sitePlanWidth - 40, sitePlanY + 40);

      // Add scale label
      ctx.fillStyle = '#000000';
      ctx.font = '12px Arial, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('Scale: 1:500', sitePlanX + 5, sitePlanY + sitePlanHeight - 5);

      // Convert to data URL
      const compositedDataUrl = canvas.toDataURL('image/png', 0.95);

      logger.success('Site plan composited successfully', {
        sheetSize: `${canvas.width}×${canvas.height}`,
        sitePlanSize: `${sitePlanWidth}×${sitePlanHeight}`,
        position: `${sitePlanX},${sitePlanY}`
      });

      return compositedDataUrl;

    } catch (error) {
      logger.error('Site plan compositing failed', error);
      return sheetUrl; // Return original on error
    }
  }

  /**
   * Load image from URL
   * @private
   */
  loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load image'));

      img.src = url;
    });
  }

  /**
   * Draw north arrow
   * @private
   */
  drawNorthArrow(ctx, x, y) {
    ctx.save();

    // Circle background
    ctx.beginPath();
    ctx.arc(x, y, 20, 0, 2 * Math.PI);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Arrow
    ctx.beginPath();
    ctx.moveTo(x, y + 12);
    ctx.lineTo(x - 5, y + 5);
    ctx.lineTo(x, y - 12);
    ctx.lineTo(x + 5, y + 5);
    ctx.closePath();
    ctx.fillStyle = '#000000';
    ctx.fill();

    // N label
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', x, y - 30);

    ctx.restore();
  }

  /**
   * Check if site plan area needs to be preserved during modification
   * @param {Object} modificationRequest - The modification request
   * @returns {boolean} - True if site plan should be locked
   */
  shouldLockSitePlan(modificationRequest) {
    // Always lock site plan unless explicitly modifying it
    const modifyingSitePlan =
      modificationRequest.deltaPrompt?.toLowerCase().includes('site plan') ||
      modificationRequest.deltaPrompt?.toLowerCase().includes('site map') ||
      modificationRequest.quickToggles?.modifySitePlan;

    return !modifyingSitePlan;
  }

  /**
   * Extract site plan from existing A1 sheet for reuse
   * @param {string} sheetUrl - URL of existing A1 sheet
   * @returns {Promise<string|null>} - Data URL of extracted site plan or null
   */
  async extractSitePlan(sheetUrl) {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      const sheetImg = await this.loadImage(sheetUrl);

      // Calculate extraction area
      const extractX = Math.floor(sheetImg.width * this.SITE_PLAN_POSITION.x);
      const extractY = Math.floor(sheetImg.height * this.SITE_PLAN_POSITION.y);
      const extractWidth = Math.floor(sheetImg.width * this.SITE_PLAN_POSITION.width);
      const extractHeight = Math.floor(sheetImg.height * this.SITE_PLAN_POSITION.height);

      // Set canvas to extracted size
      canvas.width = extractWidth;
      canvas.height = extractHeight;

      // Extract site plan area
      ctx.drawImage(
        sheetImg,
        extractX, extractY, extractWidth, extractHeight,
        0, 0, extractWidth, extractHeight
      );

      return canvas.toDataURL('image/png');

    } catch (error) {
      logger.error('Failed to extract site plan', error);
      return null;
    }
  }
}

// Export singleton
const a1SheetCompositor = new A1SheetCompositor();

export default a1SheetCompositor;
export { A1SheetCompositor };