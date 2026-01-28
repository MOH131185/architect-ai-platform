/**
 * Cross-View Image Validator (Compose API)
 *
 * Validates that key *visual* panels (competition zone) belong to the same
 * design by comparing them against `hero_3d` using real image similarity.
 *
 * NOTE: This intentionally avoids importing higher-level validators with
 * optional/missing dependencies. It is designed to be self-contained and safe
 * for serverless environments.
 *
 * Compose expects:
 * - validateAllPanels(panelMap) -> { pass, overallScore, failedPanels: [{panelType,...}] }
 * - generateErrorReport(result) -> JSON error payload
 */

import pixelmatch from "pixelmatch";
import logger from "../core/logger.js";

const EXTERIOR_GROUP = [
  "hero_3d",
  "interior_3d",
  "axonometric",
  "site_diagram",
];

const DEFAULT_THRESHOLDS = {
  // Very lenient thresholds to avoid false blocks from different viewpoints.
  // We only fail when images are *extremely* dissimilar.
  maxPHashDistance: 34, // out of 64 (higher = more different)
  minCombinedSimilarity: 0.25, // 0..1 (higher = more similar)
  resize: 256,
  pixelmatchThreshold: 0.12,
};

function resolveBaseUrl() {
  const explicit =
    process.env.PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || null;
  if (explicit) return explicit;
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return null;
}

function resolveUrl(url, baseUrl) {
  const raw = String(url || "").trim();
  if (!raw || raw.startsWith("data:")) return raw;
  try {
    return new URL(raw, baseUrl || undefined).toString();
  } catch {
    return raw;
  }
}

async function fetchBuffer(url) {
  const raw = String(url || "").trim();
  if (!raw) {
    throw new Error("Missing image URL");
  }

  if (raw.startsWith("data:")) {
    const base64Data = raw.split(",")[1] || "";
    return Buffer.from(base64Data, "base64");
  }

  const fetchImpl =
    typeof fetch === "function" ? fetch : (await import("node-fetch")).default;

  const response = await fetchImpl(raw);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function getSharp() {
  const mod = await import("sharp");
  return mod.default || mod;
}

async function computePHash(imageBuffer, sharp, size = 8) {
  const resized = await sharp(imageBuffer)
    .resize(size, size, { fit: "fill" })
    .grayscale()
    .raw()
    .toBuffer();

  const pixels = Array.from(resized);
  const avg = pixels.reduce((sum, val) => sum + val, 0) / pixels.length;

  let hash = "";
  for (const pixel of pixels) {
    hash += pixel > avg ? "1" : "0";
  }
  return hash;
}

function hammingDistance(hash1, hash2) {
  if (!hash1 || !hash2 || hash1.length !== hash2.length) return 64;
  let distance = 0;
  for (let i = 0; i < hash1.length; i++) {
    if (hash1[i] !== hash2[i]) distance++;
  }
  return distance;
}

async function computePixelSimilarity(bufferA, bufferB, sharp, options) {
  const size = options.resize;

  const [imgA, imgB] = await Promise.all([
    sharp(bufferA)
      .resize(size, size, { fit: "fill" })
      .ensureAlpha()
      .raw()
      .toBuffer(),
    sharp(bufferB)
      .resize(size, size, { fit: "fill" })
      .ensureAlpha()
      .raw()
      .toBuffer(),
  ]);

  const diffPixels = pixelmatch(imgA, imgB, null, size, size, {
    threshold: options.pixelmatchThreshold,
    includeAA: true,
  });

  const totalPixels = size * size;
  return 1 - diffPixels / totalPixels;
}

function combinedSimilarity(hashDistance, pixelSimilarity) {
  const hashSimilarity = 1 - Math.min(64, Math.max(0, hashDistance)) / 64;
  const px = Math.max(0, Math.min(1, Number(pixelSimilarity)));
  return hashSimilarity * 0.7 + px * 0.3;
}

/**
 * Validate all panels for cross-view consistency.
 *
 * @param {Object<string, {url?: string, buffer?: Buffer}>} panelMap
 * @param {Object} [options]
 * @returns {Promise<{pass: boolean, overallScore: number, failedPanels: Array}>}
 */
export async function validateAllPanels(panelMap, options = {}) {
  if (!panelMap || typeof panelMap !== "object") {
    return {
      pass: false,
      overallScore: 0,
      failedPanels: [],
      error: "Invalid panelMap",
    };
  }

  const sharp = await getSharp();
  const thresholds = { ...DEFAULT_THRESHOLDS, ...(options.thresholds || {}) };
  const baseUrl = options.baseUrl || resolveBaseUrl();

  const heroEntry = panelMap.hero_3d || null;
  if (!heroEntry?.buffer && !heroEntry?.url) {
    logger.warn(
      "[CrossViewImageValidator] hero_3d missing; skipping validation",
    );
    return { pass: true, overallScore: 1, failedPanels: [], skipped: true };
  }

  const heroBuffer =
    heroEntry.buffer || (await fetchBuffer(resolveUrl(heroEntry.url, baseUrl)));
  const heroHash = await computePHash(heroBuffer, sharp);

  const comparisons = [];
  const failures = [];

  for (const panelType of EXTERIOR_GROUP) {
    if (panelType === "hero_3d") continue;
    const entry = panelMap[panelType];
    if (!entry?.buffer && !entry?.url) {
      continue;
    }

    try {
      const panelBuffer =
        entry.buffer || (await fetchBuffer(resolveUrl(entry.url, baseUrl)));
      const panelHash = await computePHash(panelBuffer, sharp);
      const pHashDistance = hammingDistance(heroHash, panelHash);
      const pxSim = await computePixelSimilarity(
        heroBuffer,
        panelBuffer,
        sharp,
        thresholds,
      );
      const score = combinedSimilarity(pHashDistance, pxSim);

      const pass =
        pHashDistance <= thresholds.maxPHashDistance ||
        score >= thresholds.minCombinedSimilarity;

      const reasons = [];
      if (!pass) {
        reasons.push(
          `Very low similarity to hero_3d (pHashDistance=${pHashDistance}/64, score=${score.toFixed(3)})`,
        );
      }

      comparisons.push({
        panelType,
        pHashDistance,
        pixelSimilarity: pxSim,
        combinedSimilarity: score,
        pass,
        reasons,
      });

      if (!pass) {
        failures.push({ panelType, score, reasons });
      }
    } catch (error) {
      // Fail closed for panels we *tried* to validate but couldn't load/compare
      failures.push({
        panelType,
        score: 0,
        reasons: [`Validation error: ${error.message}`],
      });
    }
  }

  const overallScore =
    comparisons.length > 0
      ? comparisons.reduce((sum, c) => sum + (c.combinedSimilarity || 0), 0) /
        comparisons.length
      : 1;

  return {
    pass: failures.length === 0,
    overallScore,
    failedPanels: failures,
    comparisons,
    thresholds,
  };
}

/**
 * Generate structured error payload for API responses.
 *
 * @param {Object} validationResult
 * @returns {Object}
 */
export function generateErrorReport(validationResult) {
  const failedPanels = Array.isArray(validationResult?.failedPanels)
    ? validationResult.failedPanels
    : [];

  const failedPanelTypes = failedPanels.map((p) => p.panelType).filter(Boolean);

  return {
    success: false,
    error: "CROSS_VIEW_VALIDATION_FAILED",
    message:
      failedPanelTypes.length > 0
        ? `Cross-view consistency validation failed for: ${failedPanelTypes.join(", ")}`
        : "Cross-view consistency validation failed",
    details: {
      overallScore:
        typeof validationResult?.overallScore === "number"
          ? validationResult.overallScore
          : null,
      failedPanels,
      recommendation:
        "Regenerate the failed panels (or regenerate all panels if hero_3d fails).",
    },
  };
}

export default {
  validateAllPanels,
  generateErrorReport,
};
