import Replicate from "replicate";

const STYLE_TOKEN = "ARCHSTYLE";
const SDXL_TRAINING_OWNER = "stability-ai";
const SDXL_TRAINING_MODEL = "sdxl";
const SDXL_TRAINING_VERSION =
  "39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b";
const SDXL_CONTROLNET_LORA_VERSION =
  "fofr/sdxl-multi-controlnet-lora:89eb212b3d1366a83e949c12a4b45dfe6b6b313b594cb8268e864931ac9ffb16";
const DESTINATION_MODEL_HARDWARE = "gpu-a40-large";
const DEFAULT_ESTIMATED_TRAINING_SECONDS = 15 * 60;
const DEFAULT_CONTROLNET_TYPE = "lineart";
const DEFAULT_CONTROLNET_CONDITIONING_SCALE = 0.75;
const DEFAULT_POLL_INTERVAL_MS = 2000;
const DEFAULT_POLL_ATTEMPTS = 90;
const IMAGE_COUNT_MIN = 10;
const IMAGE_COUNT_MAX = 20;

const encoder = new TextEncoder();
const imageExtensionByMimeType = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

class NamedBlob extends Blob {
  constructor(parts, name, options = {}) {
    super(parts, options);
    Object.defineProperty(this, "name", {
      configurable: false,
      enumerable: true,
      value: name,
      writable: false,
    });
  }
}

function assertServerOnly() {
  if (typeof window !== "undefined") {
    throw new Error(
      "loraTrainingService is server-only. Call it from the Express/Vercel server, not the browser bundle.",
    );
  }
}

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function getReplicateClient() {
  return new Replicate({
    auth: getRequiredEnv("REPLICATE_API_TOKEN"),
    useFileOutput: false,
  });
}

function sanitizeUserId(userId) {
  const slug = String(userId || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!slug) {
    throw new Error("userId must resolve to a valid destination model name");
  }

  return slug.slice(0, 48);
}

function normalizeImageUrls(imageUrls) {
  if (!Array.isArray(imageUrls)) {
    throw new Error("imageUrls must be an array");
  }

  if (
    imageUrls.length < IMAGE_COUNT_MIN ||
    imageUrls.length > IMAGE_COUNT_MAX
  ) {
    throw new Error(
      `imageUrls must contain between ${IMAGE_COUNT_MIN} and ${IMAGE_COUNT_MAX} images`,
    );
  }

  return imageUrls.map((imageUrl, index) => {
    if (typeof imageUrl !== "string" || !imageUrl.trim()) {
      throw new Error(`imageUrls[${index}] must be a non-empty string`);
    }

    try {
      return new URL(imageUrl).toString();
    } catch {
      throw new Error(`imageUrls[${index}] must be a valid URL`);
    }
  });
}

function inferImageExtension(url, contentType) {
  const mimeType = String(contentType || "")
    .split(";")[0]
    .trim()
    .toLowerCase();

  if (mimeType && imageExtensionByMimeType[mimeType]) {
    return imageExtensionByMimeType[mimeType];
  }

  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\.([a-z0-9]+)$/i);
    if (match) {
      return match[1].toLowerCase();
    }
  } catch {
    // Ignore parse fallback; validation happens earlier.
  }

  return "jpg";
}

function writeString(target, offset, length, value) {
  const bytes = encoder.encode(String(value || ""));
  target.set(bytes.subarray(0, length), offset);
}

function writeOctal(target, offset, length, value) {
  const safeValue = Math.max(0, Math.floor(Number(value) || 0));
  const encoded = safeValue.toString(8).padStart(length - 1, "0");
  writeString(target, offset, length - 1, encoded);
  target[offset + length - 1] = 0;
}

function writeChecksum(target, offset, length, value) {
  const encoded = Math.max(0, Math.floor(value))
    .toString(8)
    .padStart(length - 2, "0");
  writeString(target, offset, length - 2, encoded);
  target[offset + length - 2] = 0;
  target[offset + length - 1] = 0x20;
}

function buildTarHeader(name, size, mtimeMs = Date.now()) {
  const header = new Uint8Array(512);
  const normalizedName = String(name).slice(0, 100);

  writeString(header, 0, 100, normalizedName);
  writeOctal(header, 100, 8, 0o644);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, size);
  writeOctal(header, 136, 12, Math.floor(mtimeMs / 1000));

  header.fill(0x20, 148, 156);
  header[156] = "0".charCodeAt(0);
  writeString(header, 257, 6, "ustar");
  header[262] = 0;
  writeString(header, 263, 2, "00");

  const checksum = header.reduce((sum, value) => sum + value, 0);
  writeChecksum(header, 148, 8, checksum);

  return header;
}

function buildTarArchive(files) {
  const archiveParts = [];

  files.forEach((file) => {
    const bytes =
      file.bytes instanceof Uint8Array
        ? file.bytes
        : new Uint8Array(file.bytes);
    archiveParts.push(
      buildTarHeader(file.name, bytes.byteLength, file.mtimeMs),
    );
    archiveParts.push(bytes);

    const remainder = bytes.byteLength % 512;
    if (remainder) {
      archiveParts.push(new Uint8Array(512 - remainder));
    }
  });

  archiveParts.push(new Uint8Array(1024));

  return new NamedBlob(archiveParts, "portfolio-images.tar", {
    type: "application/x-tar",
  });
}

async function fetchTrainingImages(imageUrls) {
  return Promise.all(
    imageUrls.map(async (imageUrl, index) => {
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch portfolio image ${index + 1}: ${response.status} ${response.statusText}`,
        );
      }

      const contentType = response.headers.get("content-type") || "";
      if (contentType && !contentType.toLowerCase().startsWith("image/")) {
        throw new Error(
          `Portfolio image ${index + 1} is not an image: ${contentType}`,
        );
      }

      return {
        bytes: new Uint8Array(await response.arrayBuffer()),
        mtimeMs: Date.now(),
        name: `image-${String(index + 1).padStart(2, "0")}.${inferImageExtension(
          imageUrl,
          contentType,
        )}`,
      };
    }),
  );
}

async function uploadTrainingArchive(replicate, userId, imageUrls) {
  const images = await fetchTrainingImages(imageUrls);
  const archive = buildTarArchive(images);
  const uploaded = await replicate.files.create(archive, {
    kind: "style-training",
    styleToken: STYLE_TOKEN,
    userId: String(userId),
  });

  return uploaded.urls.get;
}

function isNotFoundError(error) {
  return error?.status === 404 || error?.name === "NotFoundError";
}

async function ensureDestinationModel(replicate, username, modelName) {
  try {
    return await replicate.models.get(username, modelName);
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw error;
    }
  }

  return replicate.models.create(username, modelName, {
    description: `Private architectural style LoRA for ${modelName}`,
    hardware: DESTINATION_MODEL_HARDWARE,
    visibility: "private",
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toStatusResponse(training) {
  return {
    logs: training?.logs || "",
    loraUrl:
      training?.status === "succeeded"
        ? training?.output?.weights || null
        : null,
    status: training?.status || "unknown",
  };
}

function buildStylePrompt(prompt) {
  const normalizedPrompt = String(prompt || "").trim();
  if (!normalizedPrompt) {
    throw new Error("prompt is required");
  }

  return new RegExp(`\\b${STYLE_TOKEN}\\b`, "i").test(normalizedPrompt)
    ? normalizedPrompt
    : `${STYLE_TOKEN} style, ${normalizedPrompt}`;
}

function normalizeBlendWeight(blendWeight) {
  const numeric = Number(blendWeight);
  if (!Number.isFinite(numeric)) {
    throw new Error("blendWeight must be a number between 0.0 and 1.0");
  }

  return Math.min(1, Math.max(0, numeric));
}

async function pollPredictionUntilComplete(replicate, predictionId) {
  let prediction = await replicate.predictions.get(predictionId);

  for (let attempt = 0; attempt < DEFAULT_POLL_ATTEMPTS; attempt += 1) {
    if (prediction.status === "succeeded") {
      return prediction;
    }

    if (prediction.status === "failed" || prediction.status === "canceled") {
      throw new Error(
        `Replicate prediction ${prediction.status}: ${prediction.error || "unknown error"}`,
      );
    }

    await delay(DEFAULT_POLL_INTERVAL_MS);
    prediction = await replicate.predictions.get(predictionId);
  }

  throw new Error("Replicate generation timed out before completion");
}

export async function trainUserLoRA(userId, imageUrls) {
  assertServerOnly();

  const normalizedImageUrls = normalizeImageUrls(imageUrls);
  const replicate = getReplicateClient();
  const username = getRequiredEnv("REPLICATE_USERNAME");
  const modelName = `style-${sanitizeUserId(userId)}`;

  await ensureDestinationModel(replicate, username, modelName);

  const trainingArchiveUrl = await uploadTrainingArchive(
    replicate,
    userId,
    normalizedImageUrls,
  );
  const training = await replicate.trainings.create(
    SDXL_TRAINING_OWNER,
    SDXL_TRAINING_MODEL,
    SDXL_TRAINING_VERSION,
    {
      destination: `${username}/${modelName}`,
      input: {
        input_images: trainingArchiveUrl,
        lora_rank: 32,
        max_train_steps: 1000,
        token_string: STYLE_TOKEN,
      },
    },
  );

  return {
    estimatedTime:
      Math.max(
        Math.ceil(Number(training?.metrics?.total_time || 0)),
        DEFAULT_ESTIMATED_TRAINING_SECONDS,
      ) || DEFAULT_ESTIMATED_TRAINING_SECONDS,
    status: training.status,
    trainingId: training.id,
  };
}

export async function getTrainingStatus(trainingId) {
  assertServerOnly();

  if (!trainingId || typeof trainingId !== "string") {
    throw new Error("trainingId is required");
  }

  const replicate = getReplicateClient();
  const training = await replicate.trainings.get(trainingId);

  return toStatusResponse(training);
}

export async function generateWithStyleLoRA(
  prompt,
  controlImageUrl,
  loraUrl,
  blendWeight,
) {
  assertServerOnly();

  if (!controlImageUrl || typeof controlImageUrl !== "string") {
    throw new Error("controlImageUrl is required");
  }

  if (!loraUrl || typeof loraUrl !== "string") {
    throw new Error("loraUrl is required");
  }

  const replicate = getReplicateClient();
  const prediction = await replicate.predictions.create({
    input: {
      apply_watermark: false,
      controlnet_1: DEFAULT_CONTROLNET_TYPE,
      controlnet_1_conditioning_scale: DEFAULT_CONTROLNET_CONDITIONING_SCALE,
      controlnet_1_image: controlImageUrl,
      guidance_scale: 7.5,
      lora_scale: normalizeBlendWeight(blendWeight),
      lora_weights: loraUrl,
      num_inference_steps: 30,
      num_outputs: 1,
      prompt: buildStylePrompt(prompt),
    },
    version: SDXL_CONTROLNET_LORA_VERSION,
  });

  const result = await pollPredictionUntilComplete(replicate, prediction.id);
  const output = Array.isArray(result.output)
    ? result.output[0]
    : result.output;

  if (typeof output !== "string" || !output) {
    throw new Error(
      "Replicate returned no image URL for the styled generation",
    );
  }

  return output;
}

export default {
  generateWithStyleLoRA,
  getTrainingStatus,
  trainUserLoRA,
};
