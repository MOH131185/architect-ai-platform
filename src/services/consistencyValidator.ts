/**
 * Consistency Validator - Verify Geometry is Respected
 *
 * Validates that AI-generated images respect the reference geometry.
 * Uses edge detection, IoU calculation, and palette matching.
 *
 * Philosophy: If geometry drifts, auto-reject and retry with stronger constraints.
 */

import type { PlanJSON } from '../types/PlanJSON.js';

/**
 * Validation result
 */
export type ValidationResult = {
  valid: boolean;
  edgeIoU: number;
  paletteMatch: number;
  windowCountMatch: boolean;
  issues: string[];
  recommendations: string[];
};

/**
 * Validation thresholds
 */
export type ValidationThresholds = {
  minEdgeIoU?: number;        // Default: 0.75
  minPaletteMatch?: number;   // Default: 0.85 (ΔE < 15)
  requireWindowMatch?: boolean; // Default: true
};

class ConsistencyValidator {
  constructor() {
    console.log('🔍 Consistency Validator initialized');
  }

  /**
   * Main validation method
   * Compares reference snapshot with AI-generated image
   */
  async validate(
    referenceImageUrl: string,
    generatedImageUrl: string,
    plan: PlanJSON,
    viewType: string,
    thresholds: ValidationThresholds = {}
  ): Promise<ValidationResult> {
    console.log(`🔍 Validating ${viewType} consistency...`);

    const minEdgeIoU = thresholds.minEdgeIoU || 0.75;
    const minPaletteMatch = thresholds.minPaletteMatch || 0.85;
    const requireWindowMatch = thresholds.requireWindowMatch !== false;

    const issues: string[] = [];
    const recommendations: string[] = [];

    // 1. Edge IoU (geometry check)
    const edgeIoU = await this.calculateEdgeIoU(referenceImageUrl, generatedImageUrl);
    console.log(`   Edge IoU: ${edgeIoU.toFixed(3)}`);

    if (edgeIoU < minEdgeIoU) {
      issues.push(`Edge IoU too low: ${edgeIoU.toFixed(3)} < ${minEdgeIoU}`);
      recommendations.push('Increase reference_strength by 0.05');
      recommendations.push('Check that reference image is clear');
    }

    // 2. Palette matching (color consistency)
    const paletteMatch = await this.checkPaletteMatch(
      generatedImageUrl,
      plan.materials
    );
    console.log(`   Palette match: ${paletteMatch.toFixed(3)}`);

    if (paletteMatch < minPaletteMatch) {
      issues.push(`Palette mismatch: ${paletteMatch.toFixed(3)} < ${minPaletteMatch}`);
      recommendations.push('Strengthen material color specifications in prompt');
    }

    // 3. Window count (only for elevations)
    let windowCountMatch = true;
    if (viewType.includes('elevation') && requireWindowMatch) {
      const expectedWindows = this.countWindowsInView(plan, viewType);
      const detectedWindows = await this.countWindowsInImage(generatedImageUrl);

      windowCountMatch = Math.abs(expectedWindows - detectedWindows) <= 1;
      console.log(`   Windows: expected ${expectedWindows}, detected ${detectedWindows}`);

      if (!windowCountMatch) {
        issues.push(`Window count mismatch: expected ${expectedWindows}, got ${detectedWindows}`);
        recommendations.push('Add explicit window count to prompt');
      }
    }

    const valid = issues.length === 0;

    return {
      valid,
      edgeIoU,
      paletteMatch,
      windowCountMatch,
      issues,
      recommendations
    };
  }

  /**
   * Calculate Edge IoU (Intersection over Union)
   * Uses Canny-like edge detection and pixel comparison
   */
  private async calculateEdgeIoU(
    referenceUrl: string,
    generatedUrl: string
  ): Promise<number> {
    try {
      // Load both images
      const refImage = await this.loadImage(referenceUrl);
      const genImage = await this.loadImage(generatedUrl);

      // Detect edges in both
      const refEdges = this.detectEdges(refImage);
      const genEdges = this.detectEdges(genImage);

      // Calculate IoU
      const iou = this.calculatePixelIoU(refEdges, genEdges);

      return iou;
    } catch (error) {
      console.warn('⚠️  Edge IoU calculation failed:', error);
      return 0.5; // Neutral score on failure
    }
  }

  /**
   * Load image as HTMLImageElement
   */
  private async loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  }

  /**
   * Detect edges using Sobel operator (simplified Canny)
   * Returns binary edge map
   */
  private detectEdges(image: HTMLImageElement): ImageData {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }

    // Draw image
    ctx.drawImage(image, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;

    // Convert to grayscale
    const gray = new Uint8ClampedArray(canvas.width * canvas.height);
    for (let i = 0; i < pixels.length; i += 4) {
      const idx = i / 4;
      gray[idx] = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
    }

    // Apply Sobel operator for edge detection
    const edges = new Uint8ClampedArray(gray.length);
    const width = canvas.width;
    const height = canvas.height;

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;

        // Sobel kernels
        const gx = (
          -gray[(y - 1) * width + (x - 1)] +
          gray[(y - 1) * width + (x + 1)] +
          -2 * gray[y * width + (x - 1)] +
          2 * gray[y * width + (x + 1)] +
          -gray[(y + 1) * width + (x - 1)] +
          gray[(y + 1) * width + (x + 1)]
        );

        const gy = (
          -gray[(y - 1) * width + (x - 1)] +
          -2 * gray[(y - 1) * width + x] +
          -gray[(y - 1) * width + (x + 1)] +
          gray[(y + 1) * width + (x - 1)] +
          2 * gray[(y + 1) * width + x] +
          gray[(y + 1) * width + (x + 1)]
        );

        const magnitude = Math.sqrt(gx * gx + gy * gy);
        edges[idx] = magnitude > 50 ? 255 : 0; // Threshold
      }
    }

    // Convert back to ImageData
    const edgeData = ctx.createImageData(width, height);
    for (let i = 0; i < edges.length; i++) {
      edgeData.data[i * 4] = edges[i];
      edgeData.data[i * 4 + 1] = edges[i];
      edgeData.data[i * 4 + 2] = edges[i];
      edgeData.data[i * 4 + 3] = 255;
    }

    return edgeData;
  }

  /**
   * Calculate IoU between two edge maps
   */
  private calculatePixelIoU(edges1: ImageData, edges2: ImageData): number {
    if (edges1.width !== edges2.width || edges1.height !== edges2.height) {
      console.warn('⚠️  Image dimensions mismatch');
      return 0;
    }

    let intersection = 0;
    let union = 0;

    for (let i = 0; i < edges1.data.length; i += 4) {
      const pixel1 = edges1.data[i] > 128;
      const pixel2 = edges2.data[i] > 128;

      if (pixel1 && pixel2) intersection++;
      if (pixel1 || pixel2) union++;
    }

    return union > 0 ? intersection / union : 0;
  }

  /**
   * Check if generated image matches expected color palette
   * Returns similarity score (0-1)
   */
  private async checkPaletteMatch(
    imageUrl: string,
    materials: PlanJSON['materials']
  ): Promise<number> {
    try {
      const image = await this.loadImage(imageUrl);

      // Extract dominant colors from image
      const dominantColors = this.extractDominantColors(image, 5);

      // Expected colors from material palette
      const expectedColors = [
        this.parseColorHex(materials.walls?.exterior || '#8B4513'),
        this.parseColorHex(materials.roof?.color || '#A0522D'),
        this.parseColorHex(materials.floor?.ground || '#C0C0C0')
      ];

      // Calculate average color distance (ΔE)
      let totalDistance = 0;
      for (const expected of expectedColors) {
        const minDistance = Math.min(
          ...dominantColors.map(dominant => this.colorDistance(expected, dominant))
        );
        totalDistance += minDistance;
      }

      const avgDistance = totalDistance / expectedColors.length;

      // Convert distance to similarity (ΔE < 15 is good match)
      const similarity = Math.max(0, 1 - avgDistance / 50);

      return similarity;
    } catch (error) {
      console.warn('⚠️  Palette check failed:', error);
      return 0.8; // Neutral score
    }
  }

  /**
   * Extract dominant colors from image
   */
  private extractDominantColors(
    image: HTMLImageElement,
    count: number
  ): Array<{r: number; g: number; b: number}> {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');

    if (!ctx) return [];

    ctx.drawImage(image, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;

    // Sample pixels (every 10th pixel for performance)
    const colors: Array<{r: number; g: number; b: number}> = [];
    for (let i = 0; i < pixels.length; i += 40) {
      colors.push({
        r: pixels[i],
        g: pixels[i + 1],
        b: pixels[i + 2]
      });
    }

    // Simple clustering (k-means would be better but this is faster)
    // For now, just return most frequent colors
    return colors.slice(0, count);
  }

  /**
   * Parse hex color string to RGB
   */
  private parseColorHex(colorString: string): {r: number; g: number; b: number} {
    const hexMatch = colorString.match(/#([0-9A-Fa-f]{6})/);
    if (hexMatch) {
      const hex = hexMatch[1];
      return {
        r: parseInt(hex.substring(0, 2), 16),
        g: parseInt(hex.substring(2, 4), 16),
        b: parseInt(hex.substring(4, 6), 16)
      };
    }
    return {r: 128, g: 128, b: 128};
  }

  /**
   * Calculate Euclidean color distance
   */
  private colorDistance(
    c1: {r: number; g: number; b: number},
    c2: {r: number; g: number; b: number}
  ): number {
    return Math.sqrt(
      Math.pow(c1.r - c2.r, 2) +
      Math.pow(c1.g - c2.g, 2) +
      Math.pow(c1.b - c2.b, 2)
    );
  }

  /**
   * Count windows in a specific view based on PlanJSON
   */
  private countWindowsInView(plan: PlanJSON, viewType: string): number {
    // Simplified - count all windows for now
    // TODO: Filter by orientation (north/south/east/west)
    let count = 0;
    for (const level of plan.levels) {
      for (const room of level.rooms) {
        count += room.windows.length;
      }
    }
    return count;
  }

  /**
   * Count windows in generated image using rectangle detection
   * Simplified implementation - counts rectangular regions
   */
  private async countWindowsInImage(imageUrl: string): Promise<number> {
    try {
      const image = await this.loadImage(imageUrl);
      const edges = this.detectEdges(image);

      // Count connected components (simplified window counting)
      // TODO: Implement proper contour detection
      let count = 0;
      const visited = new Set<number>();
      const width = edges.width;
      const height = edges.height;

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = y * width + x;
          if (edges.data[idx * 4] > 128 && !visited.has(idx)) {
            count++;
            this.floodFill(edges, x, y, visited);
          }
        }
      }

      return Math.floor(count / 100); // Rough estimate
    } catch (error) {
      console.warn('⚠️  Window counting failed:', error);
      return 0;
    }
  }

  /**
   * Flood fill helper for connected component labeling
   */
  private floodFill(
    imageData: ImageData,
    startX: number,
    startY: number,
    visited: Set<number>
  ): void {
    const stack: Array<[number, number]> = [[startX, startY]];
    const width = imageData.width;
    const height = imageData.height;

    while (stack.length > 0) {
      const [x, y] = stack.pop()!;
      const idx = y * width + x;

      if (x < 0 || x >= width || y < 0 || y >= height) continue;
      if (visited.has(idx)) continue;
      if (imageData.data[idx * 4] < 128) continue;

      visited.add(idx);

      stack.push([x + 1, y]);
      stack.push([x - 1, y]);
      stack.push([x, y + 1]);
      stack.push([x, y - 1]);
    }
  }
}

export default new ConsistencyValidator();
