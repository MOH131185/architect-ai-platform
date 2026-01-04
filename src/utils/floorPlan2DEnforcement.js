/**
 * Floor Plan 2D Enforcement Utility
 * Post-processes 3D axonometric floor plans to enforce 2D blueprint appearance
 */

/**
 * Convert 3D axonometric floor plan to flat 2D blueprint style
 * @param {string} imageUrl - DALL·E 3 generated floor plan image URL
 * @param {Object} options - Processing options
 * @returns {Promise<string>} Data URL of processed 2D blueprint image
 */
export async function enforce2DFloorPlan(imageUrl, options = {}) {
  const {
    applyBlueprintTint = true,
    contrastBoost = 1.5,
    desaturate = true,
    lineThickness = 1.2,
    maxSize = 2048
  } = options;

  try {
    console.log('🔧 Starting 2D floor plan enforcement...');

    // 1. Proxy the image URL to bypass CORS (only for OpenAI DALL·E 3 images)
    let processedUrl = imageUrl;
    if (imageUrl.includes('oaidalleapiprodscus.blob.core.windows.net')) {
      // Detect dev/prod environment
      const isDev = process.env.NODE_ENV !== 'production';
      const proxyUrl = isDev
        ? `http://localhost:3001/api/proxy/image?url=${encodeURIComponent(imageUrl)}`
        : `/api/proxy-image?url=${encodeURIComponent(imageUrl)}`;
      console.log(`   Using proxied URL to bypass CORS (${isDev ? 'dev' : 'prod'})`);
      processedUrl = proxyUrl;
    }

    // 2. Load image
    const img = await loadImage(processedUrl);
    console.log(`   Loaded image: ${img.width}x${img.height}px`);

    // 2. Create canvas
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // Scale if needed
    const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
    canvas.width = img.width * scale;
    canvas.height = img.height * scale;

    // 3. Draw original image
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // 4. Get image data for pixel manipulation
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    // 5. Process pixels
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      // Calculate luminance (perceived brightness)
      const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

      if (desaturate) {
        // Convert to greyscale
        data[i] = luminance;
        data[i + 1] = luminance;
        data[i + 2] = luminance;
      }

      // Apply contrast boost to emphasize lines
      const contrastValue = (luminance - 128) * contrastBoost + 128;
      const boosted = Math.max(0, Math.min(255, contrastValue));

      if (applyBlueprintTint) {
        // Blueprint style: dark blue background, white/cyan lines
        // Invert: dark becomes light, light becomes dark
        const inverted = 255 - boosted;

        // Apply blue tint
        if (inverted > 128) {
          // Lines (bright areas after inversion) -> white/cyan
          data[i] = Math.min(255, inverted * 0.9 + 50);     // R: slight blue
          data[i + 1] = Math.min(255, inverted * 0.95 + 30); // G: cyan tint
          data[i + 2] = 255;                                 // B: full blue
        } else {
          // Background (dark areas) -> dark blue
          data[i] = inverted * 0.3;     // R: minimal
          data[i + 1] = inverted * 0.4; // G: slight
          data[i + 2] = inverted * 0.6 + 60; // B: blue base
        }
      } else {
        // Pure black and white blueprint
        const threshold = 128;
        const binary = boosted > threshold ? 255 : 0;
        data[i] = binary;
        data[i + 1] = binary;
        data[i + 2] = binary;
      }
    }

    // 6. Put processed image data back
    ctx.putImageData(imageData, 0, 0);

    // 7. Optional: Apply line sharpening
    if (lineThickness > 1) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = (lineThickness - 1) * 0.3;
      ctx.drawImage(canvas, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }

    // 8. Convert to data URL
    const processedDataUrl = canvas.toDataURL('image/png', 0.95);

    console.log('✅ Floor plan converted to 2D blueprint style');
    console.log(`   Settings: blueprint=${applyBlueprintTint}, contrast=${contrastBoost}, thickness=${lineThickness}`);

    return processedDataUrl;

  } catch (error) {
    console.error('❌ Floor plan 2D enforcement failed:', error);
    console.warn('⚠️ Returning original image URL');
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
    img.crossOrigin = 'anonymous'; // Enable CORS for external URLs

    img.onload = () => resolve(img);
    img.onerror = (err) => reject(new Error(`Failed to load image: ${err.message}`));

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
    lineThickness: 1.5
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
    lineThickness: 1.1
  });
}
