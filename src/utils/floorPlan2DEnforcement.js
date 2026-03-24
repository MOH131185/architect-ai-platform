/**
 * Floor Plan 2D Enforcement Utility
 * Post-processes AI-generated floor plans to enforce 2D blueprint appearance.
 *
 * Pipeline: Desaturate → Contrast → Sharpen → Adaptive Threshold → Tint/Binary → Dilate
 */

/**
 * Compute optimal binary threshold using Otsu's method.
 * Maximizes inter-class variance between foreground and background.
 * @param {Uint8ClampedArray} data - RGBA pixel data
 * @param {number} width
 * @param {number} height
 * @param {number} contrastBoost - contrast multiplier applied before histogram
 * @returns {number} Optimal threshold (0-255)
 */
function computeOtsuThreshold(data, width, height, contrastBoost) {
  // Build 256-bin histogram from contrast-boosted luminance
  const histogram = new Int32Array(256);
  const totalPixels = width * height;

  for (let i = 0; i < data.length; i += 4) {
    const luminance =
      0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const boosted = Math.max(
      0,
      Math.min(255, (luminance - 128) * contrastBoost + 128),
    );
    histogram[Math.round(boosted)]++;
  }

  // Otsu sweep: find threshold that maximizes inter-class variance
  let sumTotal = 0;
  for (let i = 0; i < 256; i++) sumTotal += i * histogram[i];

  let sumBg = 0;
  let weightBg = 0;
  let maxVariance = 0;
  let bestThreshold = 128; // fallback

  for (let t = 0; t < 256; t++) {
    weightBg += histogram[t];
    if (weightBg === 0) continue;

    const weightFg = totalPixels - weightBg;
    if (weightFg === 0) break;

    sumBg += t * histogram[t];
    const meanBg = sumBg / weightBg;
    const meanFg = (sumTotal - sumBg) / weightFg;

    const variance =
      weightBg * weightFg * (meanBg - meanFg) * (meanBg - meanFg);
    if (variance > maxVariance) {
      maxVariance = variance;
      bestThreshold = t;
    }
  }

  return bestThreshold;
}

/**
 * Apply 3x3 Laplacian sharpening kernel to grayscale luminance buffer.
 * Kernel: [0,-1,0; -1,5,-1; 0,-1,0]
 * Uses separate output buffer to avoid read-after-write hazard.
 * @param {Float32Array} src - Source luminance buffer (width*height)
 * @param {number} width
 * @param {number} height
 * @returns {Float32Array} Sharpened luminance buffer
 */
function applySharpeningKernel(src, width, height) {
  const dst = new Float32Array(src.length);
  // Copy border pixels unchanged
  for (let x = 0; x < width; x++) {
    dst[x] = src[x];
    dst[(height - 1) * width + x] = src[(height - 1) * width + x];
  }
  for (let y = 0; y < height; y++) {
    dst[y * width] = src[y * width];
    dst[y * width + width - 1] = src[y * width + width - 1];
  }

  // Apply kernel to interior pixels
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const val =
        -src[(y - 1) * width + x] + // top
        -src[y * width + (x - 1)] + // left
        5 * src[idx] + // center
        -src[y * width + (x + 1)] + // right
        -src[(y + 1) * width + x]; // bottom

      dst[idx] = Math.max(0, Math.min(255, val));
    }
  }

  return dst;
}

/**
 * Morphological dilation: grow line pixels by 1px in all 8 directions per iteration.
 * @param {Uint8ClampedArray} data - RGBA pixel data (modified in place)
 * @param {number} width
 * @param {number} height
 * @param {number} iterations - Number of dilation passes
 * @param {number} threshold - Values <= threshold are "line" (dark), > threshold are "background"
 * @param {boolean} isBlueprintMode - If true, dilate bright lines; if false, dilate dark lines
 */
function morphologicalDilate(
  data,
  width,
  height,
  iterations,
  threshold,
  isBlueprintMode,
) {
  if (iterations < 1) return;

  for (let iter = 0; iter < iterations; iter++) {
    // Build boolean "isLine" grid from current pixel data
    const isLine = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        // In blueprint mode, lines are bright (cyan/white); in B/W mode, lines are dark (0)
        if (isBlueprintMode) {
          const luminance =
            0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
          isLine[y * width + x] = luminance > threshold ? 1 : 0;
        } else {
          isLine[y * width + x] = data[idx] === 0 ? 1 : 0;
        }
      }
    }

    // Dilate: for each line pixel, mark 8 neighbors
    const dilated = new Uint8Array(isLine);
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        if (isLine[y * width + x]) {
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              dilated[(y + dy) * width + (x + dx)] = 1;
            }
          }
        }
      }
    }

    // Write dilated pixels back to image data
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pi = (y * width + x) * 4;
        const wasLine = isLine[y * width + x];
        const nowLine = dilated[y * width + x];

        if (!wasLine && nowLine) {
          // Newly dilated pixel: copy color from nearest line neighbor
          if (isBlueprintMode) {
            // In blueprint mode, new line pixels get cyan
            data[pi] = Math.min(255, data[pi] + 80);
            data[pi + 1] = Math.min(255, data[pi + 1] + 80);
            data[pi + 2] = 255;
          } else {
            // In B/W mode, new line pixels are black
            data[pi] = 0;
            data[pi + 1] = 0;
            data[pi + 2] = 0;
          }
        }
      }
    }
  }
}

/**
 * Convert AI-generated floor plan to flat 2D blueprint style
 * @param {string} imageUrl - AI generated floor plan image URL
 * @param {Object} options - Processing options
 * @returns {Promise<string>} Data URL of processed 2D blueprint image
 */
export async function enforce2DFloorPlan(imageUrl, options = {}) {
  const {
    applyBlueprintTint = true,
    contrastBoost = 1.5,
    desaturate = true,
    lineThickness = 1.2,
    maxSize = 2048,
  } = options;

  try {
    console.log("🔧 Starting 2D floor plan enforcement...");

    // 1. Proxy the image URL to bypass CORS (only for OpenAI DALL·E 3 images)
    let processedUrl = imageUrl;
    if (imageUrl.includes("oaidalleapiprodscus.blob.core.windows.net")) {
      const isDev = process.env.NODE_ENV !== "production";
      const proxyUrl = isDev
        ? `http://localhost:3001/api/proxy/image?url=${encodeURIComponent(imageUrl)}`
        : `/api/proxy-image?url=${encodeURIComponent(imageUrl)}`;
      console.log(
        `   Using proxied URL to bypass CORS (${isDev ? "dev" : "prod"})`,
      );
      processedUrl = proxyUrl;
    }

    // 2. Load image
    const img = await loadImage(processedUrl);
    console.log(`   Loaded image: ${img.width}x${img.height}px`);

    // 3. Create canvas
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const w = canvas.width;
    const h = canvas.height;

    // 4. Draw original image
    ctx.drawImage(img, 0, 0, w, h);

    // 5. Get image data for pixel manipulation
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;

    // 6. Desaturate + contrast boost → build grayscale luminance buffer
    const luminanceBuffer = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const luminance =
          0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        const boosted = Math.max(
          0,
          Math.min(255, (luminance - 128) * contrastBoost + 128),
        );
        luminanceBuffer[y * w + x] = boosted;

        if (desaturate) {
          data[i] = luminance;
          data[i + 1] = luminance;
          data[i + 2] = luminance;
        }
      }
    }

    // 7. Apply 3x3 sharpening kernel to crisp up line edges
    const sharpened = applySharpeningKernel(luminanceBuffer, w, h);

    // 8. Compute adaptive threshold via Otsu's method
    //    (We compute from the contrast-boosted data; Otsu finds optimal split)
    const otsuThreshold = computeOtsuThreshold(data, w, h, contrastBoost);
    console.log(`   Otsu threshold: ${otsuThreshold} (vs hardcoded 128)`);

    // 9. Apply blueprint tint or binary thresholding using sharpened + adaptive threshold
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const val = sharpened[y * w + x];

        if (applyBlueprintTint) {
          // Blueprint style: dark blue background, white/cyan lines
          const inverted = 255 - val;

          if (inverted > otsuThreshold) {
            // Lines (bright after inversion) → white/cyan
            data[i] = Math.min(255, inverted * 0.9 + 50);
            data[i + 1] = Math.min(255, inverted * 0.95 + 30);
            data[i + 2] = 255;
          } else {
            // Background → dark blue
            data[i] = inverted * 0.3;
            data[i + 1] = inverted * 0.4;
            data[i + 2] = inverted * 0.6 + 60;
          }
        } else {
          // Pure black and white: adaptive binary threshold
          const binary = val > otsuThreshold ? 255 : 0;
          data[i] = binary;
          data[i + 1] = binary;
          data[i + 2] = binary;
        }
      }
    }

    // 10. Put processed image data back
    ctx.putImageData(imageData, 0, 0);

    // 11. Morphological dilation for line thickening (replaces crude multiply composite)
    if (lineThickness > 1) {
      const dilateIterations = Math.max(1, Math.round(lineThickness - 1));
      const postData = ctx.getImageData(0, 0, w, h);
      morphologicalDilate(
        postData.data,
        w,
        h,
        dilateIterations,
        otsuThreshold,
        applyBlueprintTint,
      );
      ctx.putImageData(postData, 0, 0);
    }

    // 12. Convert to data URL
    const processedDataUrl = canvas.toDataURL("image/png", 0.95);

    console.log("✅ Floor plan converted to 2D blueprint style");
    console.log(
      `   Settings: blueprint=${applyBlueprintTint}, contrast=${contrastBoost}, thickness=${lineThickness}, otsu=${otsuThreshold}`,
    );

    return processedDataUrl;
  } catch (error) {
    console.error("❌ Floor plan 2D enforcement failed:", error);
    console.warn("⚠️ Returning original image URL");
    return imageUrl; // Fallback to original
  }
}

/**
 * Helper: Load image from URL
 * @param {string} url - Image URL
 * @returns {Promise<HTMLImageElement>}
 */
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => resolve(img);
    img.onerror = (err) =>
      reject(new Error(`Failed to load image: ${err.message}`));

    img.src = url;
  });
}

/**
 * Alternative: Enforce pure linework (no tint)
 * @param {string} imageUrl - Floor plan image URL
 * @returns {Promise<string>} Data URL of processed image
 */
export async function enforce2DLinework(imageUrl) {
  return enforce2DFloorPlan(imageUrl, {
    applyBlueprintTint: false,
    contrastBoost: 2.0,
    desaturate: true,
    lineThickness: 1.5,
  });
}

/**
 * Alternative: Subtle enhancement (preserve colors but flatten perspective)
 * @param {string} imageUrl - Floor plan image URL
 * @returns {Promise<string>} Data URL of processed image
 */
export async function enforce2DSubtle(imageUrl) {
  return enforce2DFloorPlan(imageUrl, {
    applyBlueprintTint: false,
    contrastBoost: 1.3,
    desaturate: false,
    lineThickness: 1.1,
  });
}
