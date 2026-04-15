/**
 * ControlNet Compositor
 *
 * Composites multiple Blender render passes (depth, lineart, AO) into
 * a single optimized control image for ControlNet conditioning.
 *
 * Dual-environment: Sharp (server) / Canvas (client).
 * Pattern follows cannyEdgeExtractor.js:83-91.
 *
 * @module services/controlnet/ControlNetCompositor
 */

import logger from "../../utils/logger.js";

/**
 * Composite two PNG data URLs into one control image.
 *
 * @param {string} baseDataUrl - Base layer PNG data URL (e.g., depth map)
 * @param {string} overlayDataUrl - Overlay layer PNG data URL (e.g., lineart)
 * @param {number} [overlayOpacity=0.3] - Overlay opacity (0-1)
 * @param {string} [blendMode='multiply'] - Blend mode for overlay
 * @param {Object} [options]
 * @param {number} [options.width=1024] - Output width
 * @param {number} [options.height=1024] - Output height
 * @returns {Promise<string>} Composited PNG as data URL
 */
export async function compositeControlImage(
  baseDataUrl,
  overlayDataUrl,
  overlayOpacity = 0.3,
  blendMode = "multiply",
  options = {},
) {
  const { width = 1024, height = 1024 } = options;

  if (!baseDataUrl) {
    throw new Error("compositeControlImage: baseDataUrl is required");
  }

  // If no overlay, just return base (optionally resized/grayscaled)
  if (!overlayDataUrl) {
    return normalizeToGrayscale(baseDataUrl, { width, height });
  }

  const isServer =
    typeof document === "undefined" || typeof window === "undefined";

  if (isServer) {
    return compositeWithSharp(
      baseDataUrl,
      overlayDataUrl,
      overlayOpacity,
      blendMode,
      width,
      height,
    );
  }
  return compositeWithCanvas(
    baseDataUrl,
    overlayDataUrl,
    overlayOpacity,
    blendMode,
    width,
    height,
  );
}

/**
 * Normalize an image to grayscale (ControlNet convention).
 *
 * @param {string} dataUrl - PNG data URL
 * @param {Object} [options]
 * @param {number} [options.width=1024]
 * @param {number} [options.height=1024]
 * @returns {Promise<string>} Grayscale PNG data URL
 */
export async function normalizeToGrayscale(dataUrl, options = {}) {
  const { width = 1024, height = 1024 } = options;

  if (!dataUrl) return null;

  const isServer =
    typeof document === "undefined" || typeof window === "undefined";

  if (isServer) {
    try {
      const sharp = (await import(/* webpackIgnore: true */ "sharp")).default;
      const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, "");
      const buffer = await sharp(Buffer.from(base64, "base64"))
        .resize(width, height, {
          fit: "contain",
          background: { r: 0, g: 0, b: 0 },
        })
        .grayscale()
        .png()
        .toBuffer();
      return `data:image/png;base64,${buffer.toString("base64")}`;
    } catch (err) {
      logger.warn(`Grayscale normalization failed: ${err.message}`);
      return dataUrl;
    }
  }

  // Client-side: Canvas grayscale
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, width, height);
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const gray =
          0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        data[i] = data[i + 1] = data[i + 2] = gray;
      }
      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// ========== Server-side (Sharp) ==========

async function compositeWithSharp(
  baseDataUrl,
  overlayDataUrl,
  overlayOpacity,
  blendMode,
  width,
  height,
) {
  try {
    const sharp = (await import(/* webpackIgnore: true */ "sharp")).default;

    const baseBase64 = baseDataUrl.replace(/^data:image\/\w+;base64,/, "");
    const overlayBase64 = overlayDataUrl.replace(
      /^data:image\/\w+;base64,/,
      "",
    );

    // Resize base to target dimensions, grayscale
    const baseBuffer = await sharp(Buffer.from(baseBase64, "base64"))
      .resize(width, height, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0 },
      })
      .grayscale()
      .png()
      .toBuffer();

    // Prepare overlay with opacity
    const overlayBuffer = await sharp(Buffer.from(overlayBase64, "base64"))
      .resize(width, height, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0 },
      })
      .grayscale()
      .ensureAlpha()
      .composite([
        {
          input: Buffer.from([255, 255, 255, Math.round(overlayOpacity * 255)]),
          raw: { width: 1, height: 1, channels: 4 },
          tile: true,
          blend: "dest-in",
        },
      ])
      .png()
      .toBuffer();

    // Composite overlay onto base
    const sharpBlend = blendMode === "multiply" ? "multiply" : "over";
    const result = await sharp(baseBuffer)
      .composite([{ input: overlayBuffer, blend: sharpBlend }])
      .png()
      .toBuffer();

    logger.info(
      `[Compositor] Sharp composite: ${width}x${height}, blend=${blendMode}, opacity=${overlayOpacity}`,
    );

    return `data:image/png;base64,${result.toString("base64")}`;
  } catch (err) {
    logger.warn(
      `[Compositor] Sharp composite failed: ${err.message}, returning base`,
    );
    return normalizeToGrayscale(baseDataUrl, { width, height });
  }
}

// ========== Client-side (Canvas) ==========

function compositeWithCanvas(
  baseDataUrl,
  overlayDataUrl,
  overlayOpacity,
  blendMode,
  width,
  height,
) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    // Black background
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, width, height);

    const baseImg = new Image();
    baseImg.onload = () => {
      // Draw base layer
      ctx.drawImage(baseImg, 0, 0, width, height);

      // Draw overlay with blend mode and opacity
      const overlayImg = new Image();
      overlayImg.onload = () => {
        ctx.globalCompositeOperation =
          blendMode === "multiply" ? "multiply" : "source-over";
        ctx.globalAlpha = overlayOpacity;
        ctx.drawImage(overlayImg, 0, 0, width, height);

        // Reset composite state
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1.0;

        // Convert to grayscale
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          const gray =
            0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          data[i] = data[i + 1] = data[i + 2] = gray;
        }
        ctx.putImageData(imageData, 0, 0);

        resolve(canvas.toDataURL("image/png"));
      };
      overlayImg.onerror = () => {
        // If overlay fails, return base only
        resolve(canvas.toDataURL("image/png"));
      };
      overlayImg.src = overlayDataUrl;
    };
    baseImg.onerror = (err) =>
      reject(new Error(`Base image load failed: ${err}`));
    baseImg.src = baseDataUrl;
  });
}

export default { compositeControlImage, normalizeToGrayscale };
