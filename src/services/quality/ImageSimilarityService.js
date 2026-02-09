/**
 * Image Similarity Service
 *
 * Lightweight byte-similarity fallback for control fidelity checks.
 * Works with data URLs and remote URLs.
 */

function decodeBase64(base64) {
  if (typeof atob === "function") {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  return new Uint8Array(Buffer.from(base64, "base64"));
}

async function toBytes(imageRef) {
  if (!imageRef) return new Uint8Array(0);

  if (imageRef instanceof Uint8Array) return imageRef;
  if (imageRef instanceof ArrayBuffer) return new Uint8Array(imageRef);

  if (typeof imageRef !== "string") return new Uint8Array(0);

  if (imageRef.startsWith("data:")) {
    const base64 = imageRef.split(";base64,")[1] || "";
    return decodeBase64(base64);
  }

  const response = await fetch(imageRef);
  if (!response.ok) {
    throw new Error(`Failed to fetch image for similarity: ${response.status}`);
  }
  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}

function computeSampledSimilarity(aBytes, bBytes) {
  const lenA = aBytes?.length || 0;
  const lenB = bBytes?.length || 0;
  if (lenA === 0 || lenB === 0) {
    return { similarity: 0, diffRatio: 1 };
  }

  const minLen = Math.min(lenA, lenB);
  const maxLen = Math.max(lenA, lenB);
  const step = Math.max(1, Math.floor(minLen / 4096));
  let compared = 0;
  let equal = 0;

  for (let i = 0; i < minLen; i += step) {
    compared++;
    if (aBytes[i] === bBytes[i]) equal++;
  }

  const matchRatio = compared > 0 ? equal / compared : 0;
  const lengthRatio = minLen / maxLen;
  const similarity = Math.max(
    0,
    Math.min(1, matchRatio * 0.7 + lengthRatio * 0.3),
  );

  return { similarity, diffRatio: 1 - similarity };
}

export const CONTROL_FIDELITY_THRESHOLDS = {
  strict: 0.12,
  high: 0.18,
  medium: 0.24,
  low: 0.3,
};

export const imageSimilarityService = {
  async compareImages(referenceImage, candidateImage) {
    const [refBytes, candBytes] = await Promise.all([
      toBytes(referenceImage),
      toBytes(candidateImage),
    ]);
    const { similarity, diffRatio } = computeSampledSimilarity(
      refBytes,
      candBytes,
    );
    return {
      similarity,
      similarityScore: similarity,
      diffRatio,
      referenceSize: refBytes.length,
      candidateSize: candBytes.length,
    };
  },
  async compare(referenceImage, candidateImage) {
    return this.compareImages(referenceImage, candidateImage);
  },
};

export class ControlFidelityGate {
  constructor(similarityService = imageSimilarityService, options = {}) {
    this.similarityService = similarityService;
    this.options = options;
  }

  getThreshold(controlStrength = 0.5) {
    const s = Math.max(0, Math.min(1, Number(controlStrength) || 0));
    // Stronger control image should enforce lower diff threshold.
    return Math.max(0.08, 0.32 - s * 0.2);
  }

  async validate({
    panelType,
    controlImage,
    outputImage,
    controlStrength = 0.5,
    prompt = "",
    regenerateFn = null,
  }) {
    try {
      const firstPass = await this.similarityService.compareImages(
        controlImage,
        outputImage,
      );
      const threshold = this.getThreshold(controlStrength);
      const metrics = {
        diffRatio: firstPass.diffRatio,
        threshold,
        similarityScore: firstPass.similarityScore,
      };

      if (firstPass.diffRatio <= threshold) {
        return {
          status: "PASS",
          passed: true,
          outputImage,
          metrics,
          retryAttempt: 0,
          message: `${panelType}: control fidelity passed`,
        };
      }

      if (typeof regenerateFn === "function") {
        const retryStrength = Math.min(0.95, controlStrength + 0.15);
        const retryResult = await regenerateFn({
          strength: retryStrength,
          prompt:
            "STRICT GEOMETRY LOCK: Preserve exact massing and opening placement from init image. " +
            prompt,
        });
        const retryImage =
          retryResult?.imageUrl || retryResult?.url || retryResult?.outputImage;

        if (retryImage) {
          const retryPass = await this.similarityService.compareImages(
            controlImage,
            retryImage,
          );
          const retryMetrics = {
            diffRatio: retryPass.diffRatio,
            threshold,
            similarityScore: retryPass.similarityScore,
          };

          if (retryPass.diffRatio <= threshold) {
            return {
              status: "PASS_RETRY",
              passed: true,
              outputImage: retryImage,
              metrics: retryMetrics,
              retryAttempt: 1,
              message: `${panelType}: control fidelity passed after retry`,
            };
          }
        }
      }

      return {
        status: "CONTROL_FALLBACK",
        passed: false,
        outputImage: controlImage,
        metrics,
        retryAttempt: typeof regenerateFn === "function" ? 1 : 0,
        message: `${panelType}: fidelity below threshold, using control fallback`,
      };
    } catch (error) {
      return {
        status: "CHECK_ERROR",
        passed: true,
        outputImage,
        metrics: null,
        retryAttempt: 0,
        message: `Control fidelity check skipped: ${error.message}`,
      };
    }
  }
}

export default {
  ControlFidelityGate,
  imageSimilarityService,
  CONTROL_FIDELITY_THRESHOLDS,
};
