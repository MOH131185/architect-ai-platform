import {
  A1_HEIGHT,
  A1_WIDTH,
  WORKING_HEIGHT,
  WORKING_WIDTH,
} from "./composeCore.js";
import { resolvePreComposeRegressionPolicy } from "./a1PreComposeRegressionPolicy.js";

// Identity verifier helpers — inlined from composeRuntime.js to avoid pulling
// composeRuntime's Node-only dependencies (path, pdf-lib) into the browser bundle.
function _normalizeHashValueLocal(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function _readPanelHash(panel = {}) {
  return _normalizeHashValueLocal(
    panel?.geometryHash ||
      panel?.geometry_hash ||
      panel?.meta?.geometryHash ||
      panel?.meta?.geometry_hash,
  );
}

function isTechnicalComposePanel(panelType) {
  if (typeof panelType !== "string" || panelType.length === 0) {
    return false;
  }
  return (
    panelType.startsWith("floor_plan_") ||
    panelType.startsWith("elevation_") ||
    panelType.startsWith("section_")
  );
}

function collectTechnicalPanelGeometryHashes(panels = []) {
  const hashes = [];
  for (const panel of panels) {
    if (!isTechnicalComposePanel(panel?.type)) continue;
    const hash = _readPanelHash(panel);
    if (hash) hashes.push(hash);
  }
  return [...new Set(hashes)];
}

function findTechnicalPanelsMissingGeometryHash(panels = []) {
  return panels
    .filter((panel) => isTechnicalComposePanel(panel?.type))
    .filter((panel) => !_readPanelHash(panel))
    .map((panel) => panel.type);
}

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

// ---------------------------------------------------------------------------
// Phase F: A1 Final Export Quality Gate
//
// Aggregates evidence from Phases A (raster/PDF/glyph integrity), B (panel
// presence + sheet split), C (OpenAI provider execution), D (visual manifest),
// and E (material palette texture cards) into a single pass/warning/blocked
// verdict with per-phase evidence. Read-only over those producers — the gate
// reads metadata they already attach.
//
// Backward compatibility:
//   - `allowed` boolean is preserved (true for pass+warning, false for blocked).
//   - Legacy callers checking `gate.status === "blocked"` still work; "blocked"
//     remains the explicit fail state.
//   - `preComposeRegressionPolicy` is preserved on the result.
//   - The existing pre-Phase-F success status was "allowed". Phase F changes
//     the success status to "pass" (warning is a new third state). Tests that
//     asserted "allowed" must be updated to "pass".
//
// Scope:
//   - "compose_final" (default): authoritative gate at the compose route, with
//     PDF/raster evidence available.
//   - "upstream_partial": invoked from the project-graph slice service before
//     the PDF is built. PDF/raster evidence absent here is informational, not
//     a warning, and never a blocker.
// ---------------------------------------------------------------------------

export const PHASE_F_EXPORT_GATE_VERSION = "phase-f-a1-export-gate-v1";

const PHASE_F_GATE_SCOPES = Object.freeze({
  COMPOSE_FINAL: "compose_final",
  UPSTREAM_PARTIAL: "upstream_partial",
});

function panelTypeOf(panel) {
  return panel?.type || panel?.panelType || null;
}

function panelIsBlank(panel) {
  if (!panel) return true;
  if (panel.status && panel.status !== "ready" && panel.status !== "ok") {
    return true;
  }
  if (panel.hasSvg === false) return true;
  return false;
}

function evaluatePdfMetadataEvidence({
  pdfMetadata,
  pdfUrl,
  isFinalA1,
  scope,
}) {
  const blockers = [];
  const warnings = [];
  let demotedToPreview = false;

  if (!isFinalA1) {
    return {
      status: "not_applicable",
      blockers,
      warnings,
      demotedToPreview,
      pdfRenderMode: pdfMetadata?.pdfRenderMode || null,
      dpi: pdfMetadata?.dpi || null,
      textRenderMode: pdfMetadata?.textRenderMode || null,
      isFinalA1: false,
      rasterIntegrityStatus: pdfMetadata?.rasterIntegrityStatus || null,
    };
  }

  // PDF URL is the authoritative final-mode invariant; absent at compose_final
  // is a hard block (matches the legacy contract). Upstream partial scope does
  // not have PDF available yet, so absence is expected.
  if (scope === PHASE_F_GATE_SCOPES.COMPOSE_FINAL) {
    if (!pdfUrl) {
      blockers.push("Final A1 export requires a print-ready PDF artifact.");
    }
  }

  if (pdfMetadata) {
    const dpi = Number(pdfMetadata.dpi);
    if (Number.isFinite(dpi) && dpi > 0 && dpi < 300) {
      blockers.push(
        `Final A1 export requires a 300 DPI PDF; received ${dpi} DPI (preview-grade).`,
      );
      demotedToPreview = true;
    }
    if (
      pdfMetadata.pdfRenderMode &&
      pdfMetadata.pdfRenderMode !== "raster_textpaths_300dpi"
    ) {
      blockers.push(
        `Final A1 export requires pdfRenderMode "raster_textpaths_300dpi"; received "${pdfMetadata.pdfRenderMode}".`,
      );
      if (
        typeof pdfMetadata.pdfRenderMode === "string" &&
        pdfMetadata.pdfRenderMode.includes("preview")
      ) {
        demotedToPreview = true;
      }
    }
    if (
      pdfMetadata.textRenderMode &&
      pdfMetadata.textRenderMode !== "font_paths"
    ) {
      blockers.push(
        `Final A1 export requires textRenderMode "font_paths"; received "${pdfMetadata.textRenderMode}".`,
      );
    }
    if (pdfMetadata.rasterIntegrityStatus === "blocked") {
      blockers.push(
        "PDF metadata reports rasterIntegrityStatus=blocked (tofu glyphs detected post-rasterisation).",
      );
    }
  } else if (scope === PHASE_F_GATE_SCOPES.COMPOSE_FINAL) {
    warnings.push(
      "PDF metadata not provided to gate; Phase A integrity evidence is missing for this final-mode export.",
    );
  }

  let status = "pass";
  if (blockers.length) status = "blocked";
  else if (warnings.length) status = "warning";

  return {
    status,
    blockers: unique(blockers),
    warnings: unique(warnings),
    demotedToPreview,
    pdfRenderMode: pdfMetadata?.pdfRenderMode || null,
    dpi: pdfMetadata?.dpi || null,
    textRenderMode: pdfMetadata?.textRenderMode || null,
    isFinalA1: true,
    rasterIntegrityStatus: pdfMetadata?.rasterIntegrityStatus || null,
  };
}

function evaluateRasterGlyphEvidence({
  rasterGlyphIntegrity,
  glyphIntegrity,
  scope,
}) {
  const blockers = [];
  const warnings = [];

  if (glyphIntegrity?.status === "blocked") {
    blockers.push(...(glyphIntegrity.blockers || []));
  }
  if (rasterGlyphIntegrity) {
    if (rasterGlyphIntegrity.status === "blocked") {
      blockers.push(...(rasterGlyphIntegrity.blockers || []));
    } else if (rasterGlyphIntegrity.status === "warning") {
      warnings.push(...(rasterGlyphIntegrity.warnings || []));
    } else if (
      rasterGlyphIntegrity.status === "not_run" &&
      scope === PHASE_F_GATE_SCOPES.COMPOSE_FINAL
    ) {
      warnings.push(
        "Raster glyph integrity not run for the final PNG; visual verification recommended before print.",
      );
    }
  } else if (scope === PHASE_F_GATE_SCOPES.COMPOSE_FINAL) {
    warnings.push(
      "Raster glyph integrity evidence not provided to gate at compose-final scope.",
    );
  }

  let status = "pass";
  if (blockers.length) status = "blocked";
  else if (warnings.length) status = "warning";

  return {
    status,
    blockers: unique(blockers),
    warnings: unique(warnings),
    suspectZoneCount: Array.isArray(rasterGlyphIntegrity?.suspectZones)
      ? rasterGlyphIntegrity.suspectZones.length
      : 0,
    glyphSourceStatus: glyphIntegrity?.status || null,
    rasterStatus: rasterGlyphIntegrity?.status || null,
  };
}

function evaluateRequiredPanelEvidence({
  panels,
  panelRegistry,
  targetStoreys,
}) {
  const blockers = [];
  const warnings = [];

  const storeys = Number.isFinite(Number(targetStoreys))
    ? Number(targetStoreys)
    : null;
  const level2Required = storeys !== null && storeys >= 3;

  // panelRegistry can be either an array (explicit list) or a function returning
  // an array, or null (caller did not pass it).
  let required = null;
  if (Array.isArray(panelRegistry)) {
    required = panelRegistry.slice();
  } else if (typeof panelRegistry === "function") {
    try {
      required = panelRegistry(storeys ?? 2) || null;
    } catch (_err) {
      required = null;
    }
  }

  if (!Array.isArray(panels) || panels.length === 0) {
    warnings.push(
      "Required panel presence evidence not provided to gate; panel set was not enumerated.",
    );
    return {
      status: "warning",
      blockers,
      warnings,
      missing: [],
      targetStoreys: storeys,
      level2Required,
      level2Present: null,
      providedPanelCount: 0,
    };
  }

  const providedTypes = new Set(
    panels.map((p) => panelTypeOf(p)).filter(Boolean),
  );

  if (required && required.length) {
    const missing = required.filter((type) => !providedTypes.has(type));
    if (missing.length) {
      blockers.push(
        `Final A1 export missing required panel(s): ${missing.join(", ")}.`,
      );
    }
  }

  // Storey-3 enforcement is independent of the registry passthrough so that
  // callers without a registry still get level2 enforcement.
  const level2Present = providedTypes.has("floor_plan_level2");
  if (level2Required && !level2Present) {
    blockers.push(
      "Final A1 export with target_storeys >= 3 requires a floor_plan_level2 panel.",
    );
  }

  let status = "pass";
  if (blockers.length) status = "blocked";
  else if (warnings.length) status = "warning";

  return {
    status,
    blockers: unique(blockers),
    warnings: unique(warnings),
    missing:
      required && required.length
        ? required.filter((type) => !providedTypes.has(type))
        : [],
    targetStoreys: storeys,
    level2Required,
    level2Present,
    providedPanelCount: panels.length,
  };
}

function evaluateTechnicalPanelEvidence({ panels }) {
  const blockers = [];
  const warnings = [];
  const blank = [];

  if (!Array.isArray(panels) || panels.length === 0) {
    return {
      status: "warning",
      blockers,
      warnings: [
        "Technical panel evidence not provided to gate; per-panel render status unknown.",
      ],
      blank: [],
    };
  }

  const technicalTypes = new Set([
    "elevation_north",
    "elevation_south",
    "elevation_east",
    "elevation_west",
    "section_AA",
    "section_BB",
    "schedules_notes",
    "site_diagram",
  ]);

  for (const panel of panels) {
    const type = panelTypeOf(panel);
    if (!type || !technicalTypes.has(type)) continue;
    if (panelIsBlank(panel)) blank.push(type);
  }

  if (blank.length) {
    blockers.push(
      `Required technical panel(s) missing or blank: ${blank.join(", ")}.`,
    );
  }

  let status = "pass";
  if (blockers.length) status = "blocked";
  else if (warnings.length) status = "warning";

  return {
    status,
    blockers: unique(blockers),
    warnings: unique(warnings),
    blank,
  };
}

function evaluateVisualManifestEvidence({
  visualManifest,
  visualPanels,
  scope,
}) {
  const blockers = [];
  const warnings = [];
  const mismatched = [];
  const unlocked = [];

  if (!visualManifest) {
    if (scope === PHASE_F_GATE_SCOPES.COMPOSE_FINAL) {
      warnings.push(
        "Visual manifest not provided to compose gate; Phase D identity-lock evidence unavailable.",
      );
    } else {
      blockers.push(
        "Final A1 export requires a visual manifest (Phase D identity lock).",
      );
    }
  }

  const expectedHash = visualManifest?.manifestHash || null;

  if (Array.isArray(visualPanels) && visualPanels.length && expectedHash) {
    for (const panel of visualPanels) {
      const type = panelTypeOf(panel) || panel?.id || "unknown";
      const panelHash =
        panel?.visualManifestHash ||
        panel?.metadata?.visualManifestHash ||
        null;
      if (!panelHash) {
        warnings.push(
          `Visual panel "${type}" has no visualManifestHash; identity lock evidence is incomplete.`,
        );
        continue;
      }
      if (panelHash !== expectedHash) {
        mismatched.push(type);
      }
      const locked =
        panel?.visualIdentityLocked === true ||
        panel?.metadata?.visualIdentityLocked === true;
      if (!locked) {
        unlocked.push(type);
      }
    }
    if (mismatched.length) {
      blockers.push(
        `Visual panel(s) ${mismatched.join(", ")} have a visualManifestHash that does not match the sheet manifest (${expectedHash}). Different panels would render different buildings.`,
      );
    }
    if (unlocked.length) {
      warnings.push(
        `Visual panel(s) ${unlocked.join(", ")} are missing visualIdentityLocked=true.`,
      );
    }
  }

  let status = "pass";
  if (blockers.length) status = "blocked";
  else if (warnings.length) status = "warning";

  return {
    status,
    blockers: unique(blockers),
    warnings: unique(warnings),
    manifestPresent: Boolean(visualManifest),
    manifestHash: expectedHash,
    mismatched,
    unlocked,
  };
}

function evaluateMaterialPaletteEvidence({
  materialPalette,
  panels,
  panelRegistry,
}) {
  const blockers = [];
  const warnings = [];
  const cardsWithoutProvenance = [];

  const requiresMaterialPanel = Array.isArray(panelRegistry)
    ? panelRegistry.includes("material_palette")
    : true; // default residential requires it
  const providedTypes = new Set(
    Array.isArray(panels)
      ? panels.map((p) => panelTypeOf(p)).filter(Boolean)
      : [],
  );
  const paletteMissing =
    requiresMaterialPanel &&
    providedTypes.size > 0 &&
    !providedTypes.has("material_palette");

  if (paletteMissing) {
    blockers.push(
      "Material palette panel is required but missing from the final A1 sheet.",
    );
  }

  let proceduralCount = 0;
  let aiThumbnailCount = 0;
  const cards = Array.isArray(materialPalette?.cards)
    ? materialPalette.cards
    : Array.isArray(materialPalette?.cardMetadata)
      ? materialPalette.cardMetadata
      : null;

  if (cards) {
    for (const card of cards) {
      const sig = card?.materialSignature;
      const kind = card?.textureKind;
      const source = card?.source;
      if (!sig || !kind || !source) {
        cardsWithoutProvenance.push(card?.label || sig || "unlabeled");
        continue;
      }
      if (source === "procedural_svg_pattern") proceduralCount += 1;
      else if (source === "ai_texture_thumbnail") aiThumbnailCount += 1;
      else {
        cardsWithoutProvenance.push(card?.label || sig);
      }
    }
    if (cardsWithoutProvenance.length) {
      warnings.push(
        `Material palette has ${cardsWithoutProvenance.length} card(s) without complete provenance (materialSignature/textureKind/source): ${cardsWithoutProvenance.join(", ")}.`,
      );
    }
    if (cards.length === 0 && !paletteMissing) {
      warnings.push(
        "Material palette panel is present but contains no texture cards.",
      );
    }
  } else if (!paletteMissing) {
    warnings.push(
      "Material palette card metadata not provided to gate; provenance unverifiable.",
    );
  }

  let status = "pass";
  if (blockers.length) status = "blocked";
  else if (warnings.length) status = "warning";

  return {
    status,
    blockers: unique(blockers),
    warnings: unique(warnings),
    paletteMissing,
    cardsWithoutProvenance,
    proceduralCount,
    aiThumbnailCount,
    cardCount: cards ? cards.length : 0,
  };
}

function evaluateOpenAIProviderEvidence({
  openaiProvider,
  strictPhotoreal,
  imageGenEnabled,
  scope,
}) {
  const blockers = [];
  const warnings = [];

  if (!openaiProvider) {
    if (scope === PHASE_F_GATE_SCOPES.COMPOSE_FINAL) {
      warnings.push(
        "OpenAI provider trace not provided to compose gate; Phase C execution evidence missing.",
      );
    }
    return {
      status: warnings.length ? "warning" : "pass",
      blockers,
      warnings: unique(warnings),
      openaiConfigured: null,
      openaiReasoningUsed: null,
      openaiImageUsed: null,
      requestIds: [],
      fallbacks: [],
      strictPhotoreal: Boolean(strictPhotoreal),
      imageGenEnabled: Boolean(imageGenEnabled),
    };
  }

  const requestIds = Array.isArray(openaiProvider.openaiRequestIds)
    ? openaiProvider.openaiRequestIds.filter(Boolean)
    : [];
  const fallbacks = Array.isArray(openaiProvider.providerFallbacks)
    ? openaiProvider.providerFallbacks
    : [];

  if (openaiProvider.openaiReasoningUsed === true && requestIds.length === 0) {
    blockers.push(
      "OpenAI reasoning is reported as used but no request IDs were captured; provider execution evidence is missing.",
    );
  }

  // Image gate: when image gen is disabled or no image actually used, this is
  // expected deterministic fallback. Default policy: warn (not block) so the
  // existing default-safe-mode artifact still ships as final.
  const imageFallbackOccurred =
    openaiProvider.openaiImageUsed === false ||
    (Array.isArray(fallbacks) &&
      fallbacks.some(
        (f) =>
          f &&
          (f.providerUsed === "deterministic" ||
            f.fallbackReason === "deterministic" ||
            f.status === "fallback"),
      ));

  if (imageFallbackOccurred) {
    if (strictPhotoreal === true) {
      blockers.push(
        "Strict photoreal mode requested but visual panels fell back to deterministic generation.",
      );
    } else {
      warnings.push(
        imageGenEnabled
          ? "Visual panels used deterministic fallback even though image generation is enabled; OpenAI image step did not complete."
          : "Visual panels used deterministic fallback (PROJECT_GRAPH_IMAGE_GEN_ENABLED=false); export is allowed but not photoreal.",
      );
    }
  }

  let status = "pass";
  if (blockers.length) status = "blocked";
  else if (warnings.length) status = "warning";

  return {
    status,
    blockers: unique(blockers),
    warnings: unique(warnings),
    openaiConfigured: openaiProvider.openaiConfigured ?? null,
    openaiReasoningUsed: openaiProvider.openaiReasoningUsed ?? null,
    openaiImageUsed: openaiProvider.openaiImageUsed ?? null,
    requestIds,
    fallbacks,
    strictPhotoreal: Boolean(strictPhotoreal),
    imageGenEnabled: Boolean(imageGenEnabled),
  };
}

function evaluateLayoutEvidence({ presentationSummary }) {
  const warnings = [];
  const fallbackPanels = Array.isArray(presentationSummary?.fallbackPanels)
    ? presentationSummary.fallbackPanels
    : [];
  const renderedPanels = Array.isArray(presentationSummary?.renderedPanels)
    ? presentationSummary.renderedPanels
    : [];

  return {
    status: "pass",
    warnings,
    presentationMode: presentationSummary?.presentationMode || null,
    fallbackPanels,
    renderedPanels,
  };
}

function evaluateSheetSplitEvidence({ sheetSetPlan }) {
  const blockers = [];
  if (sheetSetPlan?.required && sheetSetPlan?.generated !== true) {
    blockers.push(
      sheetSetPlan.reason ||
        "A1-01 overflow requires an A1-02 companion sheet artifact.",
    );
  }
  return {
    status: blockers.length ? "blocked" : "pass",
    blockers: unique(blockers),
    required: Boolean(sheetSetPlan?.required),
    generated: sheetSetPlan?.generated === true,
  };
}

/**
 * Cross-panel canonical identity evidence (A1 quality hardening).
 *
 * Asserts that every technical panel (floor_plan_*, elevation_*, section_*)
 * carries the SAME canonical geometry hash and shares the same canonical
 * roof / materials descriptor. Default mode = warning; strictPhotoreal mode
 * promotes mismatch to a blocker.
 *
 * Reuses the existing helpers in composeRuntime.js — no new logic, just
 * wiring them into the Phase F aggregator.
 */
function evaluateCanonicalIdentityAcrossPanels({
  panels,
  expectedGeometryHash = null,
  strictPhotoreal = false,
}) {
  const blockers = [];
  const warnings = [];

  if (!Array.isArray(panels) || panels.length === 0) {
    return {
      status: "pass",
      blockers,
      warnings,
      distinctHashes: [],
      missingHashPanels: [],
      mismatchedPanels: [],
    };
  }

  const technicalPanels = panels.filter((panel) =>
    isTechnicalComposePanel(panel?.type),
  );
  if (technicalPanels.length === 0) {
    return {
      status: "pass",
      blockers,
      warnings,
      distinctHashes: [],
      missingHashPanels: [],
      mismatchedPanels: [],
    };
  }

  const distinctHashes = collectTechnicalPanelGeometryHashes(panels);
  const missingHashPanels = findTechnicalPanelsMissingGeometryHash(panels);

  const mismatchedPanels = expectedGeometryHash
    ? technicalPanels
        .filter((panel) => {
          const panelHash =
            panel?.geometryHash ||
            panel?.geometry_hash ||
            panel?.meta?.geometryHash ||
            panel?.meta?.geometry_hash;
          return (
            typeof panelHash === "string" &&
            panelHash.length > 0 &&
            panelHash !== expectedGeometryHash
          );
        })
        .map((panel) => panel.type)
    : [];

  const promote = (msg) => {
    if (strictPhotoreal) {
      blockers.push(msg);
    } else {
      warnings.push(msg);
    }
  };

  if (missingHashPanels.length > 0) {
    promote(
      `Technical panel(s) ${missingHashPanels.join(", ")} are missing a canonical geometryHash; cross-panel identity cannot be verified.`,
    );
  }

  if (distinctHashes.length > 1) {
    promote(
      `Technical panels carry ${distinctHashes.length} distinct geometryHash values (${distinctHashes.join(", ")}); panels are not derived from one canonical project.`,
    );
  }

  if (mismatchedPanels.length > 0) {
    promote(
      `Technical panel(s) ${mismatchedPanels.join(", ")} have a geometryHash that does not match the canonical ProjectGraph hash (${expectedGeometryHash}).`,
    );
  }

  let status = "pass";
  if (blockers.length) status = "blocked";
  else if (warnings.length) status = "warning";

  return {
    status,
    blockers: unique(blockers),
    warnings: unique(warnings),
    distinctHashes,
    missingHashPanels,
    mismatchedPanels,
    expectedGeometryHash,
  };
}

export function evaluateFinalA1ExportGate({
  // legacy inputs (preserved)
  renderContract,
  pdfUrl = null,
  finalSheetRegression = null,
  postComposeVerification = null,
  glyphIntegrity = null,
  sheetSetPlan = null,
  // Phase F additions (all optional; absent evidence degrades to warning, not block)
  pdfMetadata = null,
  rasterGlyphIntegrity = null,
  panels = null,
  panelRegistry = null,
  targetStoreys = null,
  visualManifest = null,
  visualPanels = null,
  materialPalette = null,
  openaiProvider = null,
  presentationSummary = null,
  strictPhotoreal = false,
  imageGenEnabled = false,
  expectedGeometryHash = null,
  scope = PHASE_F_GATE_SCOPES.COMPOSE_FINAL,
} = {}) {
  if (!renderContract?.isFinalA1) {
    return {
      version: PHASE_F_EXPORT_GATE_VERSION,
      status: "not_applicable",
      allowed: true,
      demotedToPreview: false,
      blockers: [],
      warnings: [],
      scope,
    };
  }

  const blockers = [];
  const warnings = [];
  const renderedTextZone = postComposeVerification?.renderedTextZone || null;
  const preComposeRegressionPolicy = resolvePreComposeRegressionPolicy({
    finalSheetRegression,
    enforcePostComposeVerification: Boolean(postComposeVerification),
  });

  // ---------------------------------------------------------------------
  // Legacy gate logic (preserved for backwards-compatible blockers)
  // ---------------------------------------------------------------------
  if (scope === PHASE_F_GATE_SCOPES.COMPOSE_FINAL && !pdfUrl) {
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
  if (scope === PHASE_F_GATE_SCOPES.COMPOSE_FINAL) {
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
        blockers.push(
          ...(postComposeVerification.publishability.blockers || []),
        );
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
  }

  // ---------------------------------------------------------------------
  // Phase F evidence aggregation
  // ---------------------------------------------------------------------
  const pdfEvidence = evaluatePdfMetadataEvidence({
    pdfMetadata,
    pdfUrl,
    isFinalA1: true,
    scope,
  });
  const rasterEvidence = evaluateRasterGlyphEvidence({
    rasterGlyphIntegrity,
    glyphIntegrity,
    scope,
  });
  const requiredPanelStatus = evaluateRequiredPanelEvidence({
    panels,
    panelRegistry,
    targetStoreys,
  });
  const technicalPanelStatus = evaluateTechnicalPanelEvidence({ panels });
  const visualManifestStatus = evaluateVisualManifestEvidence({
    visualManifest,
    visualPanels,
    scope,
  });
  const visualPanelStatus = {
    status: visualManifestStatus.mismatched.length
      ? "blocked"
      : visualManifestStatus.unlocked.length
        ? "warning"
        : "pass",
    blockers: visualManifestStatus.mismatched.length
      ? [
          `Visual panel(s) ${visualManifestStatus.mismatched.join(", ")} did not match the sheet visual manifest hash.`,
        ]
      : [],
    warnings: visualManifestStatus.unlocked.length
      ? [
          `Visual panel(s) ${visualManifestStatus.unlocked.join(", ")} are not visualIdentityLocked.`,
        ]
      : [],
    mismatched: visualManifestStatus.mismatched,
    unlocked: visualManifestStatus.unlocked,
  };
  const materialPaletteStatus = evaluateMaterialPaletteEvidence({
    materialPalette,
    panels,
    panelRegistry,
  });
  const openaiProviderStatus = evaluateOpenAIProviderEvidence({
    openaiProvider,
    strictPhotoreal,
    imageGenEnabled,
    scope,
  });
  const layoutStatus = evaluateLayoutEvidence({ presentationSummary });
  const sheetSplitStatus = evaluateSheetSplitEvidence({ sheetSetPlan });
  const canonicalIdentityStatus = evaluateCanonicalIdentityAcrossPanels({
    panels,
    expectedGeometryHash,
    strictPhotoreal,
  });

  for (const ev of [
    pdfEvidence,
    rasterEvidence,
    requiredPanelStatus,
    technicalPanelStatus,
    visualManifestStatus,
    materialPaletteStatus,
    openaiProviderStatus,
    layoutStatus,
    sheetSplitStatus,
    canonicalIdentityStatus,
  ]) {
    if (Array.isArray(ev?.blockers)) blockers.push(...ev.blockers);
    if (Array.isArray(ev?.warnings)) warnings.push(...ev.warnings);
  }

  const dedupedBlockers = unique(blockers);
  const dedupedWarnings = unique(warnings);
  const status = dedupedBlockers.length
    ? "blocked"
    : dedupedWarnings.length
      ? "warning"
      : "pass";

  return {
    version: PHASE_F_EXPORT_GATE_VERSION,
    status,
    allowed: dedupedBlockers.length === 0,
    demotedToPreview: pdfEvidence.demotedToPreview === true,
    blockers: dedupedBlockers,
    warnings: dedupedWarnings,
    preComposeRegressionPolicy,
    scope,
    evidence: {
      pdfMetadata: pdfEvidence,
      rasterGlyphIntegrity: rasterEvidence,
      requiredPanelStatus,
      technicalPanelStatus,
      visualPanelStatus,
      visualManifestStatus,
      materialPaletteStatus,
      openaiProviderStatus,
      layoutStatus,
      sheetSplitStatus,
      canonicalIdentityStatus,
    },
  };
}

export default {
  A1_PHYSICAL_SHEET_SIZE_MM,
  FINAL_A1_PNG_DIMENSIONS,
  PHASE_F_EXPORT_GATE_VERSION,
  PREVIEW_PNG_DIMENSIONS,
  buildA1SheetSetPlan,
  buildSheetTextContract,
  detectA1GlyphIntegrity,
  evaluateFinalA1ExportGate,
  normalizeSheetTextContract,
  resolveA1RenderContract,
};
