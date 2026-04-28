import { inspectSvgTextPathStatus } from "../../utils/svgTextPathConverter.js";

const RENDERED_TEXT_PROOF_VERSION = "rendered-a1-text-proof-v1";
const DEFAULT_OCR_LABELS = [
  "SITE PLAN",
  "GROUND FLOOR PLAN",
  "FIRST FLOOR PLAN",
  "MATERIAL PALETTE",
  "KEY NOTES",
  "Drawing No.",
];

function normalizeBinaryBytes(value, label = "binary data") {
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (value instanceof Uint8Array) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  throw new Error(`${label} is not valid binary data`);
}

function normalizeLabel(value = "") {
  return String(value || "")
    .replace(/[^a-z0-9]+/gi, "")
    .toUpperCase();
}

function ocrEnabled() {
  const flag = String(process.env.PROJECT_GRAPH_A1_OCR_PROOF || "")
    .trim()
    .toLowerCase();
  return flag === "true" || flag === "1" || flag === "yes";
}

function ocrRequired() {
  const flag = String(process.env.PROJECT_GRAPH_A1_OCR_REQUIRED || "")
    .trim()
    .toLowerCase();
  return flag === "true" || flag === "1" || flag === "yes";
}

async function withTimeout(promise, timeoutMs, label) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

async function runOptionalOcr({ pngBuffer, expectedLabels }) {
  const required = ocrRequired();
  if (!ocrEnabled() && !required) {
    return {
      engine: "tesseract.js",
      available: false,
      skipped: true,
      required,
      reason: "PROJECT_GRAPH_A1_OCR_PROOF is not enabled",
      foundLabels: [],
      missingLabels: expectedLabels,
      textLength: 0,
    };
  }

  try {
    const sharp = (await import("sharp")).default;
    const proofPng = await sharp(Buffer.from(normalizeBinaryBytes(pngBuffer)))
      .resize({ width: 1800, withoutEnlargement: true })
      .greyscale()
      .png()
      .toBuffer();
    const tesseract = await import("tesseract.js");
    const recognize = tesseract.recognize || tesseract.default?.recognize;
    if (typeof recognize !== "function") {
      throw new Error("tesseract.js recognize() export is unavailable");
    }
    const result = await withTimeout(
      recognize(proofPng, "eng", { logger: () => {} }),
      Number(process.env.PROJECT_GRAPH_A1_OCR_TIMEOUT_MS || 18000),
      "A1 OCR proof",
    );
    const text = result?.data?.text || "";
    const normalizedText = normalizeLabel(text);
    const foundLabels = expectedLabels.filter((label) =>
      normalizedText.includes(normalizeLabel(label)),
    );
    return {
      engine: "tesseract.js",
      available: true,
      skipped: false,
      required,
      foundLabels,
      missingLabels: expectedLabels.filter(
        (label) => !foundLabels.includes(label),
      ),
      textLength: text.length,
    };
  } catch (error) {
    return {
      engine: "tesseract.js",
      available: false,
      skipped: false,
      required,
      reason: error?.message || String(error),
      foundLabels: [],
      missingLabels: expectedLabels,
      textLength: 0,
    };
  }
}

function groupSquareRuns(components) {
  const rows = [];
  for (const component of components) {
    const centerY = component.y + component.height / 2;
    let row = rows.find(
      (candidate) =>
        Math.abs(candidate.centerY - centerY) <=
        Math.max(4, component.height * 0.55),
    );
    if (!row) {
      row = { centerY, components: [] };
      rows.push(row);
    }
    row.components.push(component);
    row.centerY =
      (row.centerY * (row.components.length - 1) + centerY) /
      row.components.length;
  }

  let repeatedSquareRunCount = 0;
  const samples = [];
  for (const row of rows) {
    const sorted = row.components.sort((a, b) => a.x - b.x);
    let run = [];
    for (const component of sorted) {
      const previous = run[run.length - 1];
      const gap = previous ? component.x - (previous.x + previous.width) : 0;
      const sizeCompatible =
        !previous ||
        Math.abs(component.width - previous.width) <=
          Math.max(4, previous.width * 0.45);
      if (
        previous &&
        (gap < 0 || gap > Math.max(12, previous.width * 1.9) || !sizeCompatible)
      ) {
        if (run.length >= 4) {
          repeatedSquareRunCount += 1;
          samples.push(run.slice(0, 6));
        }
        run = [];
      }
      run.push(component);
    }
    if (run.length >= 4) {
      repeatedSquareRunCount += 1;
      samples.push(run.slice(0, 6));
    }
  }
  return { repeatedSquareRunCount, samples: samples.slice(0, 4) };
}

async function detectRenderedSquareGlyphRuns(pngBuffer) {
  try {
    const sharp = (await import("sharp")).default;
    const raw = await sharp(Buffer.from(normalizeBinaryBytes(pngBuffer)))
      .resize({ width: 1600, withoutEnlargement: true })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const { data, info } = raw;
    const width = info.width;
    const height = info.height;
    const visited = new Uint8Array(width * height);
    const darkThreshold = 82;
    const components = [];

    for (let index = 0; index < data.length; index += 1) {
      if (visited[index] || data[index] > darkThreshold) {
        continue;
      }
      let minX = width;
      let minY = height;
      let maxX = 0;
      let maxY = 0;
      let area = 0;
      const stack = [index];
      visited[index] = 1;

      while (stack.length) {
        const current = stack.pop();
        const x = current % width;
        const y = Math.floor(current / width);
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        area += 1;

        const neighbours = [
          current - 1,
          current + 1,
          current - width,
          current + width,
        ];
        for (const next of neighbours) {
          if (
            next < 0 ||
            next >= data.length ||
            visited[next] ||
            data[next] > darkThreshold
          ) {
            continue;
          }
          const nextX = next % width;
          if (Math.abs(nextX - x) > 1) {
            continue;
          }
          visited[next] = 1;
          stack.push(next);
        }
      }

      const componentWidth = maxX - minX + 1;
      const componentHeight = maxY - minY + 1;
      const aspect = componentWidth / Math.max(1, componentHeight);
      const fillRatio = area / Math.max(1, componentWidth * componentHeight);
      if (
        componentWidth >= 5 &&
        componentHeight >= 5 &&
        componentWidth <= 64 &&
        componentHeight <= 64 &&
        aspect >= 0.72 &&
        aspect <= 1.32 &&
        fillRatio >= 0.12 &&
        fillRatio <= 0.86
      ) {
        components.push({
          x: minX,
          y: minY,
          width: componentWidth,
          height: componentHeight,
          area,
          fillRatio: Number(fillRatio.toFixed(3)),
        });
      }
    }

    const { repeatedSquareRunCount, samples } = groupSquareRuns(components);
    return {
      status: repeatedSquareRunCount > 0 ? "blocked" : "pass",
      passed: repeatedSquareRunCount === 0,
      squareLikeComponentCount: components.length,
      repeatedSquareRunCount,
      samples,
      blockers:
        repeatedSquareRunCount > 0
          ? [
              "Rendered PNG contains repeated square-like glyph runs; text likely rasterized as tofu.",
            ]
          : [],
    };
  } catch (error) {
    return {
      status: "unavailable",
      passed: false,
      squareLikeComponentCount: 0,
      repeatedSquareRunCount: 0,
      samples: [],
      blockers: [],
      error: error?.message || String(error),
    };
  }
}

export async function analyseRenderedTextProof({
  pngBuffer,
  sheetSvg,
  requiredLabels = DEFAULT_OCR_LABELS,
} = {}) {
  const expectedLabels = [...new Set(requiredLabels.filter(Boolean))];
  const svgTextStatus = inspectSvgTextPathStatus(sheetSvg || "");
  const [squareGlyphProof, ocr] = await Promise.all([
    detectRenderedSquareGlyphRuns(pngBuffer),
    runOptionalOcr({ pngBuffer, expectedLabels }),
  ]);
  const squareGlyphProofIsAuthoritative =
    svgTextStatus.mode !== "font_paths" || svgTextStatus.textElementCount > 0;
  const blockers = [
    ...(svgTextStatus.blockers || []),
    ...(squareGlyphProofIsAuthoritative ? squareGlyphProof.blockers || [] : []),
  ];
  if (ocr.required && (!ocr.available || ocr.missingLabels.length > 0)) {
    blockers.push(
      "Rendered A1 OCR proof did not verify all required sheet labels.",
    );
  }
  const ocrEvidenceQuality = ocr.available
    ? ocr.missingLabels.length === 0
      ? "verified"
      : "partial"
    : "not_available";

  return {
    version: RENDERED_TEXT_PROOF_VERSION,
    status: blockers.length ? "blocked" : "pass",
    passed: blockers.length === 0,
    rasterTextMode: svgTextStatus.mode,
    svgTextStatus,
    squareGlyphProof,
    squareGlyphProofIsAuthoritative,
    ocr: {
      ...ocr,
      ocrEvidenceQuality,
    },
    blockers,
  };
}

export const __test = {
  detectRenderedSquareGlyphRuns,
  runOptionalOcr,
};
