import sharp from "sharp";

function round(value, precision = 3) {
  const factor = 10 ** precision;
  return Math.round(Number(value || 0) * factor) / factor;
}

function normalizeConfidence(value) {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(Number(value))
  ) {
    return null;
  }
  const numeric = Number(value);
  const normalized = numeric > 1 ? numeric / 100 : numeric;
  return Math.max(0, Math.min(1, normalized));
}

function resolveZoneBounds(zone = {}, width = null, height = null) {
  if (zone.bounds) {
    return {
      x: Number(zone.bounds.x || 0),
      y: Number(zone.bounds.y || 0),
      width: Number(zone.bounds.width || 0),
      height: Number(zone.bounds.height || 0),
    };
  }
  if (!width || !height || !zone.boundsNormalized) {
    return null;
  }
  return {
    x: Number(zone.boundsNormalized.x || 0) * width,
    y: Number(zone.boundsNormalized.y || 0) * height,
    width: Number(zone.boundsNormalized.width || 0) * width,
    height: Number(zone.boundsNormalized.height || 0) * height,
  };
}

async function extractZoneBuffer(
  renderedBuffer,
  bounds = null,
  width = null,
  height = null,
) {
  if (!renderedBuffer || !bounds || !width || !height) {
    return null;
  }
  const left = Math.max(0, Math.floor(bounds.x));
  const top = Math.max(0, Math.floor(bounds.y));
  if (left >= width || top >= height) {
    return null;
  }
  const region = {
    left,
    top,
    width: Math.max(
      1,
      Math.min(width - left, Math.max(0, Math.floor(bounds.width))),
    ),
    height: Math.max(
      1,
      Math.min(height - top, Math.max(0, Math.floor(bounds.height))),
    ),
  };
  if (region.width <= 0 || region.height <= 0) {
    return null;
  }

  return sharp(renderedBuffer)
    .extract(region)
    .grayscale()
    .normalize()
    .threshold(180)
    .png()
    .toBuffer();
}

let tesseractPromise = null;

async function resolveOCRAdapter(providedAdapter = null) {
  if (providedAdapter) {
    return {
      adapter: providedAdapter,
      available: true,
      source: "injected_adapter",
    };
  }

  if (!tesseractPromise) {
    tesseractPromise = import("tesseract.js")
      .then((module) => module)
      .catch(() => null);
  }

  const tesseract = await tesseractPromise;
  if (!tesseract?.recognize) {
    return {
      adapter: null,
      available: false,
      source: "unavailable",
    };
  }

  return {
    available: true,
    source: "tesseract.js",
    adapter: {
      async recognize(buffer) {
        const result = await tesseract.recognize(buffer, "eng", {
          logger: () => {},
        });
        return {
          text: result?.data?.text || "",
          confidence: Number(result?.data?.confidence || 0) / 100,
        };
      },
    },
  };
}

function normalizeText(text = "") {
  return String(text || "")
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchExpectedLabels(text = "", expectedLabels = []) {
  const normalizedText = normalizeText(text);
  return (expectedLabels || []).filter((label) =>
    normalizedText.includes(normalizeText(label)),
  );
}

function classifyOCREvidence({
  confidence = 0,
  matchedLabels = [],
  available = false,
} = {}) {
  if (!available) {
    return "provisional";
  }
  if (matchedLabels.length > 0 && confidence >= 0.72) {
    return "verified";
  }
  if (matchedLabels.length > 0 && confidence >= 0.45) {
    return "weak";
  }
  if (confidence >= 0.5) {
    return "weak";
  }
  return "provisional";
}

export async function recognizeA1ZoneText({
  renderedBuffer = null,
  zone = {},
  width = null,
  height = null,
  ocrAdapter = null,
} = {}) {
  const resolved = await resolveOCRAdapter(ocrAdapter);
  const bounds = resolveZoneBounds(zone, width, height);

  if (!renderedBuffer || !bounds) {
    return {
      available: resolved.available,
      source: resolved.source,
      text: "",
      confidence: null,
      matchedLabels: [],
      evidenceState: "provisional",
    };
  }

  if (!resolved.available || !resolved.adapter) {
    return {
      available: false,
      source: resolved.source,
      text: "",
      confidence: null,
      matchedLabels: [],
      evidenceState: "provisional",
    };
  }

  try {
    const zoneBuffer = await extractZoneBuffer(
      renderedBuffer,
      bounds,
      width,
      height,
    );
    if (!zoneBuffer) {
      return {
        available: true,
        source: resolved.source,
        text: "",
        confidence: null,
        matchedLabels: [],
        evidenceState: "provisional",
      };
    }

    const result = await resolved.adapter.recognize(zoneBuffer, {
      zone,
      expectedLabels: zone.expectedLabels || [],
    });
    const text = String(result?.text || "");
    const normalizedConfidence = normalizeConfidence(result?.confidence);
    const confidence =
      normalizedConfidence === null ? null : round(normalizedConfidence);
    const matchedLabels = matchExpectedLabels(text, zone.expectedLabels || []);
    return {
      available: true,
      source: resolved.source,
      text,
      confidence,
      matchedLabels,
      evidenceState: classifyOCREvidence({
        confidence,
        matchedLabels,
        available: true,
      }),
    };
  } catch (error) {
    return {
      available: false,
      source: "ocr_error",
      text: "",
      confidence: null,
      matchedLabels: [],
      evidenceState: "provisional",
      error: String(error?.message || error),
    };
  }
}

export async function recognizeA1RenderedZones({
  renderedBuffer = null,
  zones = [],
  width = null,
  height = null,
  ocrAdapter = null,
} = {}) {
  const results = [];
  for (const zone of zones || []) {
    results.push(
      await recognizeA1ZoneText({
        renderedBuffer,
        zone,
        width,
        height,
        ocrAdapter,
      }),
    );
  }

  const availableCount = results.filter((entry) => entry.available).length;
  const verifiedCount = results.filter(
    (entry) => entry.evidenceState === "verified",
  ).length;

  return {
    version: "phase12-a1-ocr-service-v1",
    available: availableCount > 0,
    fallbackUsed: availableCount === 0,
    zoneResults: results,
    summary: {
      availableCount,
      verifiedCount,
      weakCount: results.filter((entry) => entry.evidenceState === "weak")
        .length,
      provisionalCount: results.filter(
        (entry) => entry.evidenceState === "provisional",
      ).length,
    },
  };
}

export default {
  recognizeA1ZoneText,
  recognizeA1RenderedZones,
};
