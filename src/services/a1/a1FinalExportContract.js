import {
  A1_HEIGHT,
  A1_WIDTH,
  WORKING_HEIGHT,
  WORKING_WIDTH,
} from "./composeCore.js";
import { resolvePreComposeRegressionPolicy } from "./a1PreComposeRegressionPolicy.js";

export const PREVIEW_RENDER_INTENT = "preview";
export const FINAL_A1_RENDER_INTENT = "final_a1";
export const A1_PHYSICAL_SHEET_SIZE_MM = {
  width: 841,
  height: 594,
  orientation: "landscape",
};
export const FINAL_A1_PNG_DIMENSIONS = {
  width: A1_WIDTH,
  height: A1_HEIGHT,
};
export const PREVIEW_PNG_DIMENSIONS = {
  width: WORKING_WIDTH,
  height: WORKING_HEIGHT,
};

const TOFU_GLYPH_REGEX = /[□▯�]/g;
const TOFU_RUN_REGEX = /[□▯�]{2,}/g;
const MAX_TEXT_CONTRACT_LABELS = 80;
const DENSE_PANEL_THRESHOLD = 18;
const DENSE_LABEL_THRESHOLD = 52;

function unique(items = []) {
  return [...new Set((items || []).filter(Boolean))];
}

function normalizeText(value = "") {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function humanizePanelType(type = "") {
  return normalizeText(type).toUpperCase();
}

function pushLabel(labels, value) {
  const normalized = normalizeText(value);
  if (normalized && normalized.length >= 2) {
    labels.push(normalized);
  }
}

function collectRoomLabels(masterDNA = {}, projectContext = {}) {
  const rooms =
    masterDNA?.rooms ||
    masterDNA?.program?.rooms ||
    projectContext?.programSpaces ||
    projectContext?.buildingProgram?.spaces ||
    [];
  return (Array.isArray(rooms) ? rooms : [])
    .map((room) => room?.name || room?.label || room?.type)
    .filter(Boolean)
    .slice(0, 16);
}

export function resolveA1RenderContract(requestBody = {}) {
  const explicitIntent = String(requestBody?.renderIntent || "").toLowerCase();
  const isFinalA1 =
    explicitIntent === FINAL_A1_RENDER_INTENT ||
    requestBody?.printMaster === true;
  const renderIntent = isFinalA1
    ? FINAL_A1_RENDER_INTENT
    : PREVIEW_RENDER_INTENT;
  const highRes = isFinalA1 || requestBody?.highRes === true;
  const printMaster = isFinalA1 || requestBody?.printMaster === true;

  return {
    version: "phase22-a1-render-contract-v1",
    renderIntent,
    isFinalA1,
    highRes,
    printMaster,
    enforcePreComposeVerification:
      isFinalA1 || requestBody?.enforcePreComposeVerification === true,
    enforcePostComposeVerification:
      isFinalA1 || requestBody?.enforcePostComposeVerification === true,
    enforceRenderedText: isFinalA1 || requestBody?.enforceRenderedText === true,
    includePdf: isFinalA1 || (highRes && requestBody?.skipPdf !== true),
    physicalSheetSizeMm: A1_PHYSICAL_SHEET_SIZE_MM,
    pngDimensions: isFinalA1
      ? FINAL_A1_PNG_DIMENSIONS
      : highRes
        ? FINAL_A1_PNG_DIMENSIONS
        : PREVIEW_PNG_DIMENSIONS,
  };
}

export function buildSheetTextContract({
  panels = [],
  titleBlock = null,
  masterDNA = null,
  projectContext = null,
  extraLabels = [],
  renderIntent = FINAL_A1_RENDER_INTENT,
} = {}) {
  const labels = [];

  for (const panel of panels || []) {
    pushLabel(labels, panel?.label || humanizePanelType(panel?.type));
    if (panel?.drawingNumber) {
      pushLabel(labels, panel.drawingNumber);
    }
  }

  for (const label of [
    "PROJECT",
    "SCALE",
    "DATE",
    "A1",
    "MATERIAL PALETTE",
    "CLIMATE ANALYSIS",
    "SCHEDULES & NOTES",
    titleBlock?.projectName,
    titleBlock?.buildingTypeLabel,
    titleBlock?.locationDesc,
    titleBlock?.scale,
    titleBlock?.date,
    projectContext?.projectName,
    projectContext?.address,
    projectContext?.buildingCategory,
    projectContext?.buildingSubType,
    ...collectRoomLabels(masterDNA, projectContext),
    ...extraLabels,
  ]) {
    pushLabel(labels, label);
  }

  const requiredLabels = unique(labels).slice(0, MAX_TEXT_CONTRACT_LABELS);

  return {
    version: "phase22-a1-sheet-text-contract-v1",
    renderIntent,
    minPhysicalTextMm: renderIntent === FINAL_A1_RENDER_INTENT ? 2.2 : 1.2,
    requiredLabels,
    requiredLabelCount: requiredLabels.length,
    source:
      "panel_captions_title_block_data_panels_project_context_and_svg_text",
  };
}

export function normalizeSheetTextContract(
  contract = null,
  fallbackInput = {},
) {
  const fallback = buildSheetTextContract(fallbackInput);
  if (!contract || typeof contract !== "object") {
    return fallback;
  }

  const requiredLabels = unique([
    ...(Array.isArray(contract.requiredLabels) ? contract.requiredLabels : []),
    ...(Array.isArray(contract.labels) ? contract.labels : []),
    ...(Array.isArray(contract.expectedLabels) ? contract.expectedLabels : []),
    ...(fallback.requiredLabels || []),
  ])
    .map(normalizeText)
    .filter(Boolean)
    .slice(0, MAX_TEXT_CONTRACT_LABELS);

  return {
    ...fallback,
    ...contract,
    version: contract.version || fallback.version,
    requiredLabels,
    requiredLabelCount: requiredLabels.length,
    minPhysicalTextMm:
      Number(contract.minPhysicalTextMm || 0) > 0
        ? Number(contract.minPhysicalTextMm)
        : fallback.minPhysicalTextMm,
  };
}

export function detectA1GlyphIntegrity({
  sheetSvg = "",
  sheetTextContract = null,
} = {}) {
  const svg = String(sheetSvg || "");
  const tofuMatches = svg.match(TOFU_GLYPH_REGEX) || [];
  const tofuRuns = svg.match(TOFU_RUN_REGEX) || [];
  const blockers = [];

  if (tofuMatches.length > 0) {
    blockers.push(
      "Final sheet SVG contains tofu/square replacement glyphs and cannot be exported.",
    );
  }
  if (tofuRuns.length > 0) {
    blockers.push(
      "Final sheet SVG contains repeated square-glyph runs, indicating broken text rendering.",
    );
  }

  return {
    version: "phase22-a1-glyph-integrity-v1",
    status: blockers.length ? "blocked" : "pass",
    passed: blockers.length === 0,
    tofuGlyphCount: tofuMatches.length,
    repeatedTofuRunCount: tofuRuns.length,
    requiredLabelCount: sheetTextContract?.requiredLabelCount || 0,
    blockers: unique(blockers),
  };
}

// ---------------------------------------------------------------------------
// Phase A: post-rasterisation tofu detector
//
// detectA1GlyphIntegrity above scans the SVG SOURCE for literal tofu codepoints
// (`[□▯�]`). Sharp/librsvg renders missing glyphs as `.notdef`
// boxes that NEVER appear as those codepoints in the source — so the SVG-only
// gate is structurally blind to that failure mode.
//
// detectA1RasterGlyphIntegrity samples the rendered PNG inside the panel
// caption bands (where labels like SITE PLAN / NORTH ELEVATION live) and
// flags zones whose pixel pattern matches the tofu signature: high dark
// coverage + low transition density per row (a few wide solid boxes vs.
// real text's many narrow strokes).
// ---------------------------------------------------------------------------

const RASTER_INTEGRITY_VERSION = "phase22-a1-raster-glyph-integrity-v1";
const DARK_PIXEL_THRESHOLD = 110; // 0-255; below = ink
// Tofu signature: solid filled rectangles → high dark coverage with very low
// edge density per dark pixel (each "letter" is one big blob). Real text has
// many narrow strokes → many transitions per dark pixel.
const TOFU_DARK_RATIO_MIN = 0.25;
const TOFU_RUNS_PER_DARK_PIXEL_MAX = 0.05;
const REAL_TEXT_RUNS_PER_DARK_PIXEL_MIN = 0.08;
const MIN_DARK_RATIO_FOR_TEXT = 0.005;
const MIN_ZONE_HEIGHT_PX = 6;
const MIN_ZONE_WIDTH_PX = 24;

function clampInt(value, min, max) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function deriveLabelBandsFromCoordinates(panelLabelCoordinates = {}) {
  const bands = [];
  for (const [panelType, coord] of Object.entries(
    panelLabelCoordinates || {},
  )) {
    if (!coord) continue;
    const labelHeight = Number(coord.labelHeight) || 26;
    const x = Number(coord.x);
    const y = Number(coord.y);
    const width = Number(coord.width);
    const height = Number(coord.height);
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(width) ||
      !Number.isFinite(height)
    ) {
      continue;
    }
    const bandTop = y + Math.max(0, height - labelHeight);
    bands.push({
      panelType,
      left: x,
      top: bandTop,
      width,
      height: labelHeight,
    });
  }
  return bands;
}

async function analyseLabelBand(sharp, pngBuffer, band, imageMeta) {
  const left = clampInt(band.left, 0, imageMeta.width - 1);
  const top = clampInt(band.top, 0, imageMeta.height - 1);
  const width = clampInt(band.width, MIN_ZONE_WIDTH_PX, imageMeta.width - left);
  const height = clampInt(
    band.height,
    MIN_ZONE_HEIGHT_PX,
    imageMeta.height - top,
  );

  if (width < MIN_ZONE_WIDTH_PX || height < MIN_ZONE_HEIGHT_PX) {
    return {
      panelType: band.panelType,
      bandRect: { left, top, width, height },
      sampled: false,
      reason: "zone_too_small",
    };
  }

  const raw = await sharp(pngBuffer)
    .extract({ left, top, width, height })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { data, info } = raw;
  const stride = info.channels || 1;
  const w = info.width;
  const h = info.height;
  if (!w || !h) {
    return {
      panelType: band.panelType,
      bandRect: { left, top, width, height },
      sampled: false,
      reason: "empty_extract",
    };
  }

  let darkPixels = 0;
  let darkRunsTotal = 0;
  for (let y = 0; y < h; y++) {
    let inDark = false;
    for (let x = 0; x < w; x++) {
      const value = data[(y * w + x) * stride];
      const isDark = value < DARK_PIXEL_THRESHOLD;
      if (isDark) {
        darkPixels += 1;
        if (!inDark) {
          darkRunsTotal += 1;
          inDark = true;
        }
      } else if (inDark) {
        inDark = false;
      }
    }
  }
  const totalPixels = w * h;
  const darkRatio = darkPixels / totalPixels;
  const runsPerRow = darkRunsTotal / h;
  // Edge density per ink pixel: real text has many narrow strokes (high), tofu
  // has wide solid runs (low). This is the primary discriminator and is far
  // more robust than raw runs-per-row across font sizes and panel widths.
  const runsPerDarkPixel = darkPixels > 0 ? darkRunsTotal / darkPixels : 0;
  const matchesTofuSignature =
    darkRatio >= TOFU_DARK_RATIO_MIN &&
    runsPerDarkPixel < TOFU_RUNS_PER_DARK_PIXEL_MAX;
  const matchesRealTextSignature =
    darkRatio >= MIN_DARK_RATIO_FOR_TEXT &&
    runsPerDarkPixel >= REAL_TEXT_RUNS_PER_DARK_PIXEL_MIN;

  return {
    panelType: band.panelType,
    bandRect: { left, top, width, height },
    sampled: true,
    darkRatio: Number(darkRatio.toFixed(4)),
    runsPerRow: Number(runsPerRow.toFixed(2)),
    runsPerDarkPixel: Number(runsPerDarkPixel.toFixed(4)),
    darkRunsTotal,
    matchesTofuSignature,
    matchesRealTextSignature,
  };
}

export async function detectA1RasterGlyphIntegrity({
  pngBuffer,
  sharp,
  panelLabelCoordinates = null,
  zones = null,
  sheetTextContract = null,
} = {}) {
  if (!pngBuffer || (Buffer.isBuffer(pngBuffer) && pngBuffer.length === 0)) {
    return {
      version: RASTER_INTEGRITY_VERSION,
      status: "not_run",
      passed: false,
      sampledCount: 0,
      suspectZones: [],
      blockers: [
        "Raster glyph integrity not run: pngBuffer is empty or missing.",
      ],
      requiredLabelCount: sheetTextContract?.requiredLabelCount || 0,
    };
  }
  if (typeof sharp !== "function") {
    return {
      version: RASTER_INTEGRITY_VERSION,
      status: "not_run",
      passed: false,
      sampledCount: 0,
      suspectZones: [],
      blockers: ["Raster glyph integrity not run: sharp module unavailable."],
      requiredLabelCount: sheetTextContract?.requiredLabelCount || 0,
    };
  }

  let imageMeta = { width: 0, height: 0 };
  try {
    imageMeta = await sharp(pngBuffer).metadata();
  } catch (err) {
    return {
      version: RASTER_INTEGRITY_VERSION,
      status: "not_run",
      passed: false,
      sampledCount: 0,
      suspectZones: [],
      blockers: [
        `Raster glyph integrity not run: sharp metadata failed (${err?.message || "unknown"}).`,
      ],
      requiredLabelCount: sheetTextContract?.requiredLabelCount || 0,
    };
  }
  if (!imageMeta?.width || !imageMeta?.height) {
    return {
      version: RASTER_INTEGRITY_VERSION,
      status: "not_run",
      passed: false,
      sampledCount: 0,
      suspectZones: [],
      blockers: [
        "Raster glyph integrity not run: sharp returned no width/height.",
      ],
      requiredLabelCount: sheetTextContract?.requiredLabelCount || 0,
    };
  }

  const bands = Array.isArray(zones)
    ? zones
    : deriveLabelBandsFromCoordinates(panelLabelCoordinates || {});
  if (bands.length === 0) {
    return {
      version: RASTER_INTEGRITY_VERSION,
      status: "not_run",
      passed: false,
      sampledCount: 0,
      suspectZones: [],
      blockers: [
        "Raster glyph integrity not run: no panel label zones provided.",
      ],
      requiredLabelCount: sheetTextContract?.requiredLabelCount || 0,
    };
  }

  const results = [];
  for (const band of bands) {
    try {
      const analysis = await analyseLabelBand(
        sharp,
        pngBuffer,
        band,
        imageMeta,
      );
      results.push(analysis);
    } catch (err) {
      results.push({
        panelType: band.panelType,
        sampled: false,
        reason: `extract_failed: ${err?.message || "unknown"}`,
      });
    }
  }

  const sampled = results.filter((r) => r.sampled);
  const suspectZones = sampled.filter((r) => r.matchesTofuSignature);
  const realTextZones = sampled.filter((r) => r.matchesRealTextSignature);
  const blockers = [];
  const warnings = [];

  if (suspectZones.length > 0) {
    blockers.push(
      `Rendered PNG has ${suspectZones.length} panel label band(s) matching the tofu signature (high dark coverage with very few transitions). Panel(s): ${suspectZones
        .map((z) => z.panelType)
        .join(", ")}.`,
    );
  }
  if (
    sampled.length > 0 &&
    realTextZones.length === 0 &&
    suspectZones.length === 0
  ) {
    // Sampled but nothing looks like real text either. Could be a blank/
    // featureless panel (legitimate when a test fixture renders synthetic
    // panels with no captions) OR a different rendering failure. Surface as
    // a warning, not a block, because the genuine tofu failure mode the user
    // hit is already caught by the suspectZones check above.
    warnings.push(
      `Rendered PNG label bands have neither tofu nor real text signatures across ${sampled.length} sampled zone(s); panels appear blank or featureless. Verify visually before publishing.`,
    );
  }

  let status = "pass";
  if (blockers.length > 0) {
    status = "blocked";
  } else if (warnings.length > 0 || sampled.length === 0) {
    status = "warning";
  }

  return {
    version: RASTER_INTEGRITY_VERSION,
    status,
    passed: status === "pass",
    sampledCount: sampled.length,
    suspectZones: suspectZones.map((z) => ({
      panelType: z.panelType,
      darkRatio: z.darkRatio,
      runsPerRow: z.runsPerRow,
      runsPerDarkPixel: z.runsPerDarkPixel,
      bandRect: z.bandRect,
    })),
    realTextZoneCount: realTextZones.length,
    bandCount: bands.length,
    blockers: unique(blockers),
    warnings: unique(warnings),
    requiredLabelCount: sheetTextContract?.requiredLabelCount || 0,
  };
}

export function buildA1SheetSetPlan({
  panels = [],
  sheetTextContract = null,
} = {}) {
  const panelCount = Array.isArray(panels) ? panels.length : 0;
  const requiredLabelCount = Number(sheetTextContract?.requiredLabelCount || 0);
  const requiresSheetSet =
    panelCount > DENSE_PANEL_THRESHOLD ||
    requiredLabelCount > DENSE_LABEL_THRESHOLD;

  return {
    version: "phase22-a1-sheet-set-plan-v1",
    required: requiresSheetSet,
    reason: requiresSheetSet
      ? "A1-01 is too dense for readable print export; overflow content must be split to A1-02."
      : null,
    density: {
      panelCount,
      requiredLabelCount,
      panelThreshold: DENSE_PANEL_THRESHOLD,
      labelThreshold: DENSE_LABEL_THRESHOLD,
    },
    sheets: requiresSheetSet
      ? [
          {
            id: "A1-01",
            role: "visuals",
            contents: ["2D drawings", "3D projections", "primary context"],
          },
          {
            id: "A1-02",
            role: "technical-data",
            contents: [
              "schedules",
              "materials",
              "climate",
              "regulation",
              "QA",
              "provenance",
            ],
          },
        ]
      : [{ id: "A1-01", role: "complete-board", contents: ["all panels"] }],
  };
}

export function evaluateFinalA1ExportGate({
  renderContract,
  pdfUrl = null,
  finalSheetRegression = null,
  postComposeVerification = null,
  glyphIntegrity = null,
  sheetSetPlan = null,
} = {}) {
  if (!renderContract?.isFinalA1) {
    return {
      version: "phase22-a1-final-export-gate-v1",
      status: "not_applicable",
      allowed: true,
      blockers: [],
    };
  }

  const blockers = [];
  const renderedTextZone = postComposeVerification?.renderedTextZone || null;
  const preComposeRegressionPolicy = resolvePreComposeRegressionPolicy({
    finalSheetRegression,
    enforcePostComposeVerification: Boolean(postComposeVerification),
  });

  if (!pdfUrl) {
    blockers.push("Final A1 export requires a print-ready PDF artifact.");
  }
  if (glyphIntegrity?.status === "blocked") {
    blockers.push(...(glyphIntegrity.blockers || []));
  }
  if (sheetSetPlan?.required && sheetSetPlan?.generated !== true) {
    blockers.push(
      sheetSetPlan.reason ||
        "A1-01 overflow requires an A1-02 companion sheet artifact.",
    );
  }
  if (!finalSheetRegression) {
    blockers.push("Final A1 export requires pre-compose sheet regression.");
  } else if (finalSheetRegression.finalSheetRegressionReady === false) {
    blockers.push(...(preComposeRegressionPolicy.hardBlockers || []));
  }
  if (!postComposeVerification) {
    blockers.push(
      "Final A1 export requires post-compose rendered verification.",
    );
  } else {
    if (postComposeVerification?.publishability?.status === "blocked") {
      blockers.push(...(postComposeVerification.publishability.blockers || []));
    }
    if (renderedTextZone?.status === "block") {
      blockers.push(...(renderedTextZone.blockers || []));
    }
    if (renderContract.enforceRenderedText) {
      if (renderedTextZone?.ocr?.available !== true) {
        blockers.push(
          "Final A1 export requires OCR evidence; OCR was unavailable for the rendered PNG.",
        );
      } else if (renderedTextZone?.ocrEvidenceQuality !== "verified") {
        blockers.push(
          "Final A1 export requires verified OCR evidence for required sheet labels.",
        );
      }
    }
  }

  return {
    version: "phase22-a1-final-export-gate-v1",
    status: blockers.length ? "blocked" : "allowed",
    allowed: blockers.length === 0,
    blockers: unique(blockers),
    preComposeRegressionPolicy,
  };
}

export default {
  A1_PHYSICAL_SHEET_SIZE_MM,
  FINAL_A1_PNG_DIMENSIONS,
  PREVIEW_PNG_DIMENSIONS,
  buildA1SheetSetPlan,
  buildSheetTextContract,
  detectA1GlyphIntegrity,
  evaluateFinalA1ExportGate,
  normalizeSheetTextContract,
  resolveA1RenderContract,
};
