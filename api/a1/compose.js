/**
 * A1 Sheet Compose API Endpoint
 *
 * Composes individual panel images into a complete A1 architectural sheet.
 * Uses sharp for server-side image composition.
 *
 * POST /api/a1/compose
 * Body: {
 *   designId: string,
 *   panels: [{ type, imageUrl, buffer?, label }],
 *   siteOverlay?: { imageUrl },
 *   layoutConfig?: string,
 *   titleBlock?: { projectName, buildingTypeLabel, locationDesc, scale, date }
 * }
 * Returns: {
 *   sheetUrl: string (base64 data URL),
 *   composedSheetUrl: string (alias for backwards compat),
 *   coordinates: object,
 *   metadata: object,
 *   missingPanels?: string[]
 * }
 */

import fs from "fs";
import path from "path";

import fetch from "node-fetch";
import { PDFDocument } from "pdf-lib";

import a1ComposePayload from "../../server/utils/a1ComposePayload.cjs";

// Shared compose core – single source of truth for layout grids, panel key
// normalisation, and per-panel fit policy.
import {
  normalizeKey as composeCoreNormalizeKey,
  resolveLayout as composeCoreResolveLayout,
  getPanelFitMode as composeCoreGetPanelFitMode,
} from "../../src/services/a1/composeCore.js";

// QA System imports (lazy-loaded for Vercel compatibility)
let OpusSheetCritic = null;
let QAGates = null;

async function getOpusSheetCritic() {
  if (OpusSheetCritic) return OpusSheetCritic;
  try {
    const module = await import("../../src/services/qa/OpusSheetCritic.js");
    OpusSheetCritic = module.default || module.OpusSheetCritic;
    return OpusSheetCritic;
  } catch (e) {
    console.warn("[A1 Compose] OpusSheetCritic not available:", e.message);
    return null;
  }
}

async function getQAGates() {
  if (QAGates) return QAGates;
  try {
    const module = await import("../../src/services/qa/QAGates.js");
    QAGates = module;
    return QAGates;
  } catch (e) {
    console.warn("[A1 Compose] QAGates not available:", e.message);
    return null;
  }
}

// A1GridSpec12Column lazy-load removed – GRID_12COL is imported from
// composeCore.js (the SSOT) and A1GridSpec12Column re-exports it.
// All callsites that used getA1GridSpec() have been replaced with
// composeCoreGetPanelFitMode / composeCore imports.

// Fit policy is now sourced from composeCore.getPanelFitMode() (SSOT).
// SCALE_TO_FILL_CONFIG removed – panels are generated at slot aspect ratio
// so contain fits without cropping or letterboxing.

// CRITICAL: Force Node.js runtime for Sharp image processing
// Without this, Vercel uses Edge runtime which doesn't support Sharp
export const runtime = "nodejs";
export const config = {
  runtime: "nodejs",
  maxDuration: 120,
};

const { buildComposeSheetUrl } = a1ComposePayload;
const DEFAULT_MAX_DATAURL_BYTES = 4.5 * 1024 * 1024;
const DEFAULT_PUBLIC_URL_BASE = "/api/a1/compose-output";

async function buildPrintReadyPdfFromPng(pngBuffer, options = {}) {
  if (!Buffer.isBuffer(pngBuffer) || pngBuffer.length === 0) {
    throw new Error("pngBuffer is required to build PDF");
  }

  const widthPx = Number(options.widthPx);
  const heightPx = Number(options.heightPx);
  const dpi = Number(options.dpi) || 300;
  if (
    !Number.isFinite(widthPx) ||
    !Number.isFinite(heightPx) ||
    widthPx <= 0 ||
    heightPx <= 0
  ) {
    throw new Error("Invalid width/height for PDF");
  }

  const widthPt = (widthPx / dpi) * 72;
  const heightPt = (heightPx / dpi) * 72;

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([widthPt, heightPt]);
  const image = await pdf.embedPng(pngBuffer);
  page.drawImage(image, { x: 0, y: 0, width: widthPt, height: heightPt });
  return Buffer.from(await pdf.save({ useObjectStreams: false }));
}

function resolveComposeOutputDir() {
  if (process.env.A1_COMPOSE_OUTPUT_DIR) {
    return process.env.A1_COMPOSE_OUTPUT_DIR;
  }

  if (process.env.VERCEL || process.env.AWS_REGION) {
    const baseDir = process.platform === "win32" ? process.cwd() : "/tmp";
    return path.join(baseDir, "a1_compose_outputs");
  }

  return path.join(process.cwd(), "qa_results", "a1_compose_outputs");
}

// PANEL_REGISTRY: Single Source of Truth for all panel types
// This import provides canonical panel types and validation
let panelRegistry = null;

// Import shared constants from service layer
// Note: In Vercel, we need to use dynamic import for ES modules from src/
let layoutConstants = null;
let crossViewImageValidator = null;
// A1BoardSpec removed – file never existed; fit/QA policy sourced from composeCore.
let renderSanityValidator = null;

let didLogRuntime = false;
function logRuntimeOnce() {
  if (didLogRuntime) {
    return;
  }
  didLogRuntime = true;

  const info = {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    pid: process.pid,
    env: {
      NODE_ENV: process.env.NODE_ENV || null,
      NEXT_RUNTIME: process.env.NEXT_RUNTIME || null,
      VERCEL: process.env.VERCEL || null,
      VERCEL_ENV: process.env.VERCEL_ENV || null,
      VERCEL_REGION: process.env.VERCEL_REGION || null,
      AWS_REGION: process.env.AWS_REGION || null,
    },
  };

  console.log(`[A1 Compose][Runtime] ${JSON.stringify(info)}`);
}

/**
 * Get PANEL_REGISTRY (lazy-loaded for Vercel compatibility)
 */
async function getPanelRegistry() {
  if (panelRegistry) {
    return panelRegistry;
  }

  try {
    panelRegistry = await import("../../src/config/panelRegistry.js");
    return panelRegistry;
  } catch (e) {
    console.warn("[A1 Compose] Could not import panelRegistry:", e.message);
    return null;
  }
}

/**
 * Get cross-view image validator (real image comparison module)
 * Uses SSIM, pHash, pixelmatch for actual pixel-level comparison
 */
async function getCrossViewImageValidator() {
  if (crossViewImageValidator) {
    return crossViewImageValidator;
  }

  try {
    // NEW: Use real image comparison module instead of heuristic validator
    crossViewImageValidator =
      await import("../../src/services/validation/crossViewImageValidator.js");
    return crossViewImageValidator;
  } catch (e) {
    console.warn(
      "[A1 Compose] Could not import crossViewImageValidator:",
      e.message,
    );
    return null;
  }
}

async function getRenderSanityValidator() {
  if (renderSanityValidator) {
    return renderSanityValidator;
  }

  try {
    renderSanityValidator =
      await import("../../src/services/qa/RenderSanityValidator.js");
    return renderSanityValidator;
  } catch (e) {
    console.warn(
      "[A1 Compose] Could not import RenderSanityValidator:",
      e.message,
    );
    return null;
  }
}

async function getLayoutConstants() {
  if (layoutConstants) {
    return layoutConstants;
  }

  // Try dynamic import of shared constants
  try {
    layoutConstants =
      await import("../../src/services/a1/a1LayoutConstants.js");
    return layoutConstants;
  } catch (e) {
    console.warn(
      "[A1 Compose] Could not import shared constants, using fallback:",
      e.message,
    );
    // Fallback inline constants (should match a1LayoutConstants.js)
    return getFallbackConstants();
  }
}

function getFallbackConstants() {
  // A1 sheet dimensions at 300 DPI (landscape orientation) - PRINT MASTER
  const A1_WIDTH = 9933;
  const A1_HEIGHT = 7016;
  // Working resolution (for faster composition, upscale on export)
  const WORKING_WIDTH = 1792;
  const WORKING_HEIGHT = 1269;
  // Caption/label dimensions (enhanced for better legibility)
  const LABEL_HEIGHT = 32; // Increased from 26px for better visibility
  const LABEL_PADDING = 6;
  const CAPTION_FONT_SIZE = 12; // Font size for panel captions
  const CAPTION_FONT_FAMILY = "Arial, Helvetica, sans-serif";
  // Frame styling (2px stroke, 4px radius per plan spec)
  const FRAME_STROKE_WIDTH = 2;
  const FRAME_STROKE_COLOR = "#d1d5db";
  const FRAME_RADIUS = 4;

  const GRID_SPEC = {
    // Row 1 (y: 0.02 to 0.24)
    site_diagram: { x: 0.02, y: 0.02, width: 0.22, height: 0.22 },
    hero_3d: { x: 0.26, y: 0.02, width: 0.34, height: 0.22 },
    interior_3d: { x: 0.62, y: 0.02, width: 0.22, height: 0.22 },
    // Data panels (enlarged for legibility - ~2.2% sheet area each)
    material_palette: { x: 0.86, y: 0.02, width: 0.12, height: 0.18 },
    climate_card: { x: 0.86, y: 0.21, width: 0.12, height: 0.18 },
    // Row 2 (y: 0.26 to 0.48)
    floor_plan_ground: { x: 0.02, y: 0.26, width: 0.32, height: 0.22 },
    floor_plan_first: { x: 0.36, y: 0.26, width: 0.32, height: 0.22 },
    floor_plan_level2: { x: 0.7, y: 0.26, width: 0.28, height: 0.22 },
    // Row 3 (y: 0.50 to 0.68)
    elevation_north: { x: 0.02, y: 0.5, width: 0.23, height: 0.18 },
    elevation_south: { x: 0.27, y: 0.5, width: 0.23, height: 0.18 },
    elevation_east: { x: 0.52, y: 0.5, width: 0.23, height: 0.18 },
    elevation_west: { x: 0.77, y: 0.5, width: 0.21, height: 0.18 },
    // Row 4 (y: 0.70 to 0.96)
    section_AA: { x: 0.02, y: 0.7, width: 0.32, height: 0.26 },
    section_BB: { x: 0.36, y: 0.7, width: 0.32, height: 0.26 },
    schedules_notes: { x: 0.7, y: 0.7, width: 0.14, height: 0.26 },
    title_block: { x: 0.85, y: 0.7, width: 0.13, height: 0.26 },
  };

  // TARGET BOARD LAYOUT - Phase 2: Professional presentation board style
  // Features: Large hero, centered floor plans, compact elevation grid
  const TARGET_BOARD_GRID_SPEC = {
    // Row 1: Hero + Interior + Right Sidebar (y: 0.02 to 0.28)
    hero_3d: { x: 0.02, y: 0.02, width: 0.36, height: 0.26 },
    interior_3d: { x: 0.4, y: 0.02, width: 0.28, height: 0.26 },
    axonometric: { x: 0.7, y: 0.02, width: 0.14, height: 0.12 },
    site_diagram: { x: 0.7, y: 0.15, width: 0.14, height: 0.13 },
    // Data panels (enlarged for legibility - ~2.2% sheet area each)
    material_palette: { x: 0.86, y: 0.02, width: 0.12, height: 0.18 },
    climate_card: { x: 0.86, y: 0.21, width: 0.12, height: 0.18 },
    // Row 2: Floor Plans - Larger (y: 0.30 to 0.55)
    floor_plan_ground: { x: 0.02, y: 0.3, width: 0.34, height: 0.25 },
    floor_plan_first: { x: 0.38, y: 0.3, width: 0.34, height: 0.25 },
    floor_plan_level2: { x: 0.74, y: 0.3, width: 0.24, height: 0.25 },
    // Row 3: Elevations - Compact 4-grid (y: 0.57 to 0.72)
    elevation_north: { x: 0.02, y: 0.57, width: 0.235, height: 0.15 },
    elevation_south: { x: 0.265, y: 0.57, width: 0.235, height: 0.15 },
    elevation_east: { x: 0.51, y: 0.57, width: 0.235, height: 0.15 },
    elevation_west: { x: 0.755, y: 0.57, width: 0.235, height: 0.15 },
    // Row 4: Sections + Title Block (y: 0.74 to 0.98)
    section_AA: { x: 0.02, y: 0.74, width: 0.38, height: 0.24 },
    section_BB: { x: 0.42, y: 0.74, width: 0.38, height: 0.24 },
    title_block: { x: 0.82, y: 0.74, width: 0.16, height: 0.24 },
  };

  const PANEL_LABELS = {
    hero_3d: "HERO 3D VIEW",
    interior_3d: "INTERIOR 3D VIEW",
    site_diagram: "SITE DIAGRAM",
    floor_plan_ground: "GROUND FLOOR PLAN",
    floor_plan_first: "FIRST FLOOR PLAN",
    floor_plan_level2: "SECOND FLOOR PLAN",
    elevation_north: "NORTH ELEVATION",
    elevation_south: "SOUTH ELEVATION",
    elevation_east: "EAST ELEVATION",
    elevation_west: "WEST ELEVATION",
    section_AA: "SECTION A-A",
    section_BB: "SECTION B-B",
    schedules_notes: "SCHEDULES & NOTES",
    title_block: "PROJECT INFO",
    material_palette: "MATERIAL PALETTE",
    climate_card: "CLIMATE ANALYSIS",
    materials: "MATERIALS",
  };

  // Professional drawing numbers (RIBA standard format)
  const DRAWING_NUMBERS = {
    hero_3d: "3D-01",
    interior_3d: "3D-02",
    site_diagram: "SP-01",
    floor_plan_ground: "GA-00-01",
    floor_plan_first: "GA-01-01",
    floor_plan_level2: "GA-02-01",
    elevation_north: "EL-N-01",
    elevation_south: "EL-S-01",
    elevation_east: "EL-E-01",
    elevation_west: "EL-W-01",
    section_AA: "SC-AA-01",
    section_BB: "SC-BB-01",
    schedules_notes: "SC-01",
    material_palette: "MP-01",
    climate_card: "AN-01",
  };

  // Professional scales per view type
  const PANEL_SCALES = {
    hero_3d: "NTS",
    interior_3d: "NTS",
    site_diagram: "1:500",
    floor_plan_ground: "1:100",
    floor_plan_first: "1:100",
    floor_plan_level2: "1:100",
    elevation_north: "1:100",
    elevation_south: "1:100",
    elevation_east: "1:100",
    elevation_west: "1:100",
    section_AA: "1:50",
    section_BB: "1:50",
    schedules_notes: "N/A",
    material_palette: "N/A",
    climate_card: "N/A",
  };

  const REQUIRED_PANELS = [
    "hero_3d",
    "interior_3d",
    "site_diagram",
    "floor_plan_ground",
    "floor_plan_first",
    "floor_plan_level2",
    "elevation_north",
    "elevation_south",
    "elevation_east",
    "elevation_west",
    "section_AA",
    "section_BB",
    "material_palette",
    "climate_card",
  ];

  const COVER_FIT_PANELS = ["hero_3d", "interior_3d", "site_diagram"];

  // RIBA-compliant title block template
  const TITLE_BLOCK_TEMPLATE = {
    projectName: "",
    projectNumber: "",
    clientName: "",
    siteAddress: "",
    drawingTitle: "A1 DESIGN SHEET",
    sheetNumber: "A1-001",
    revision: "P01",
    status: "PRELIMINARY",
    scale: "AS NOTED",
    date: "",
    drawnBy: "AI ARCHITECT",
    checkedBy: "",
    practiceName: "ArchiAI Solutions",
    practiceAddress: "",
    arbNumber: "",
    ribaStage: "STAGE 2",
    standardsRef: "BS EN ISO 7200",
    copyrightNote: "© 2024 ArchiAI Solutions",
    designId: "",
    seedValue: "",
    consistencyScore: 0,
    generationTimestamp: "",
  };

  // Helper functions
  const getPanelAnnotation = (panelType) => {
    const label = PANEL_LABELS[panelType] || panelType.toUpperCase();
    const drawingNumber = DRAWING_NUMBERS[panelType] || "";
    const scale = PANEL_SCALES[panelType] || "NTS";
    return {
      label,
      drawingNumber,
      scale,
      fullAnnotation: `${drawingNumber}  ${label}  SCALE: ${scale}`,
    };
  };

  const buildTitleBlockData = (context = {}) => {
    const now = new Date();
    return {
      ...TITLE_BLOCK_TEMPLATE,
      projectName: context.projectName || "Untitled Project",
      projectNumber:
        context.projectNumber ||
        `P${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
      clientName: context.clientName || "",
      siteAddress: context.address || context.siteAddress || "",
      drawingTitle: context.buildingType
        ? `${context.buildingType.toUpperCase()} - A1 DESIGN SHEET`
        : "A1 DESIGN SHEET",
      date: now
        .toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
        .toUpperCase(),
      ribaStage: context.ribaStage || "STAGE 2",
      designId: context.designId || "",
      seedValue: context.seed ? String(context.seed) : "",
      consistencyScore: context.consistencyScore || 0,
      generationTimestamp: now.toISOString(),
    };
  };

  return {
    // Print master resolution (300 DPI)
    A1_WIDTH,
    A1_HEIGHT,
    // Working resolution (preview)
    WORKING_WIDTH,
    WORKING_HEIGHT,
    // Caption/label styling
    LABEL_HEIGHT,
    LABEL_PADDING,
    CAPTION_FONT_SIZE,
    CAPTION_FONT_FAMILY,
    // Frame styling
    FRAME_STROKE_WIDTH,
    FRAME_STROKE_COLOR,
    FRAME_RADIUS,
    GRID_SPEC,
    TARGET_BOARD_GRID_SPEC, // Phase 2: Professional presentation layout
    PANEL_LABELS,
    DRAWING_NUMBERS,
    PANEL_SCALES,
    REQUIRED_PANELS,
    COVER_FIT_PANELS,
    TITLE_BLOCK_TEMPLATE,
    toPixelRect: (layoutEntry, width, height) => ({
      x: Math.round(layoutEntry.x * width),
      y: Math.round(layoutEntry.y * height),
      width: Math.round(layoutEntry.width * width),
      height: Math.round(layoutEntry.height * height),
    }),
    getPanelFitMode: (panelType) =>
      COVER_FIT_PANELS.includes(panelType) ? "cover" : "contain",
    getPanelAnnotation,
    buildTitleBlockData,
    // Phase 2: Resilient validation - allow missing panels with placeholder
    validatePanelLayout: (panels, options = {}) => {
      const providedTypes = new Set(panels.map((p) => p.type));
      const floorCount = options.floorCount || 2;

      // Adjust required panels based on floor count
      const adjustedRequired = REQUIRED_PANELS.filter((type) => {
        if (type === "floor_plan_level2" && floorCount < 3) {
          return false;
        }
        return true;
      });

      const missingPanels = adjustedRequired.filter(
        (type) => !providedTypes.has(type),
      );

      // CORRECTION E: Be resilient to missing panels - warn but don't block
      // Missing panels will be shown as placeholders
      return {
        valid: true, // Always valid - missing panels get placeholders
        errors: [],
        warnings:
          missingPanels.length > 0
            ? [
                `Missing panels (will use placeholders): ${missingPanels.join(", ")}`,
              ]
            : [],
        panelCount: panels.length,
        missingPanels,
        hasPlaceholders: missingPanels.length > 0,
      };
    },
  };
}

/**
 * Fetch image from URL and return buffer
 */
async function fetchImageBuffer(url) {
  if (!url) {
    throw new Error("Image URL is required");
  }

  // Handle data URLs
  if (url.startsWith("data:")) {
    const base64Data = url.split(",")[1];
    return Buffer.from(base64Data, "base64");
  }

  // Fetch from URL
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`);
  }

  const buf = Buffer.from(await response.arrayBuffer());

  // Guard: reject HTML/text responses that slipped through a 200 OK
  // (e.g. CDN error pages). Sharp would try SVG-parse them and crash.
  if (buf.length > 4) {
    const head = buf.slice(0, 64).toString("utf8").trim().toLowerCase();
    if (head.startsWith("<!doctype") || head.startsWith("<html")) {
      throw new Error("Received HTML instead of image data");
    }
  }

  return buf;
}

function generateOverlaySvg(coordinates, width, height, constants) {
  const {
    LABEL_HEIGHT,
    FRAME_STROKE_WIDTH = 2,
    FRAME_STROKE_COLOR,
    FRAME_RADIUS,
    CAPTION_FONT_SIZE = 12,
    CAPTION_FONT_FAMILY = "Arial, Helvetica, sans-serif",
    getPanelAnnotation,
  } = constants;
  let frames = "";
  let labels = "";

  for (const [id, coord] of Object.entries(coordinates)) {
    const annotation = getPanelAnnotation(id);
    const labelY = coord.y + coord.height - Math.round(LABEL_HEIGHT / 2) + 4;
    const labelTop = coord.y + coord.height - LABEL_HEIGHT;

    // Panel frame (2px stroke per plan spec)
    frames += `<rect x="${coord.x}" y="${coord.y}" width="${coord.width}" height="${coord.height}"
      fill="none" stroke="${FRAME_STROKE_COLOR}" stroke-width="${FRAME_STROKE_WIDTH}" rx="${FRAME_RADIUS}" ry="${FRAME_RADIUS}" />`;

    // Caption background band (32px height)
    labels += `<rect x="${coord.x}" y="${labelTop}" width="${coord.width}" height="${LABEL_HEIGHT}"
      fill="#f8fafc" fill-opacity="0.95" />`;

    // Drawing number (left-aligned)
    if (annotation.drawingNumber) {
      labels += `<text x="${coord.x + 8}" y="${labelY}"
        font-family="${CAPTION_FONT_FAMILY}" font-size="${CAPTION_FONT_SIZE - 1}" font-weight="600" fill="#475569"
        dominant-baseline="middle" text-anchor="start">${escapeXml(annotation.drawingNumber)}</text>`;
    }

    // Panel label (centered)
    labels += `<text x="${coord.x + coord.width / 2}" y="${labelY}"
      font-family="${CAPTION_FONT_FAMILY}" font-size="${CAPTION_FONT_SIZE}" font-weight="700" fill="#0f172a"
      dominant-baseline="middle" text-anchor="middle">${escapeXml(annotation.label)}</text>`;

    // Scale (right-aligned) - only for scaled drawings
    if (annotation.scale && annotation.scale !== "N/A") {
      labels += `<text x="${coord.x + coord.width - 8}" y="${labelY}"
        font-family="${CAPTION_FONT_FAMILY}" font-size="${CAPTION_FONT_SIZE - 2}" fill="#64748b"
        dominant-baseline="middle" text-anchor="end">${escapeXml(annotation.scale)}</text>`;
    }
  }

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    ${frames}
    ${labels}
  </svg>`;
}

/**
 * Get commit hash for build stamp
 * Checks environment variables set by CI/CD systems
 * @returns {string} 7-character commit hash or 'dev'
 */
function getCommitHashForStamp() {
  // Check Vercel first
  if (process.env.VERCEL_GIT_COMMIT_SHA) {
    return process.env.VERCEL_GIT_COMMIT_SHA.substring(0, 7);
  }
  // Check GitHub Actions
  if (process.env.GITHUB_SHA) {
    return process.env.GITHUB_SHA.substring(0, 7);
  }
  // Check custom env var
  if (process.env.COMMIT_HASH) {
    return process.env.COMMIT_HASH.substring(0, 7);
  }
  // Local development
  return "dev";
}

/**
 * Get pipeline mode for build stamp
 * If proof signals are provided, use resolvedMode for truthful naming
 *
 * @param {Object} [proof] - Proof signals from generation
 * @returns {string} Pipeline mode
 */
function getPipelineModeForStamp(proof = null) {
  // If proof signals provided, use the resolved mode (truthful naming)
  if (proof?.resolvedMode) {
    return proof.resolvedMode;
  }

  // Fallback to env var / defaults
  if (process.env.PIPELINE_MODE) {
    const mode = process.env.PIPELINE_MODE.toUpperCase();
    // Normalize legacy aliases
    if (mode === "OPTION2" || mode === "MESHY_DALLE3") {
      return "HYBRID_OPENAI";
    }
    return mode;
  }
  // Default
  return "HYBRID_OPENAI";
}

/**
 * Safely truncate model name for stamp display
 * Bulletproof: handles null, undefined, non-strings, empty strings
 * @param {string} model - Full model name
 * @param {number} maxChars - Max characters (default 18)
 * @returns {string} - Truncated model name (never empty)
 */
function truncateModelName(model, maxChars = 18) {
  const str = String(model ?? "").trim();
  if (!str) {
    return "unknown";
  }
  if (str.length <= maxChars) {
    return str;
  }
  return str.substring(0, maxChars - 1) + "…";
}

/**
 * Generate build stamp SVG for bottom-right corner
 * DELIVERABLE A: Build Stamp (visual proof)
 *
 * Contains:
 * - RESOLVED PIPELINE_MODE (truthful naming: svg_openai_*, meshy_openai_*, or legacy)
 * - Commit hash (7 chars)
 * - runId (from designId)
 * - Timestamp
 * - OpenAI model used
 * - Meshy indicator (used/not used)
 * - Key feature flags summary
 *
 * @param {Object} params
 * @param {number} params.width - Sheet width
 * @param {number} params.height - Sheet height
 * @param {string} params.designId - Short design ID hash (used as runId)
 * @param {string} params.runId - Explicit run ID (preferred over designId)
 * @param {string} params.timestamp - Build timestamp
 * @param {string} params.layoutTemplate - Layout template name
 * @param {number} params.panelCount - Number of panels composed
 * @param {Object} [params.flags] - Feature flags snapshot
 * @param {Object} [params.proof] - Proof signals from generation
 * @param {string} [params.proof.resolvedMode] - Actual resolved mode (svg_openai_*, meshy_openai_*, legacy)
 * @param {string} [params.proof.openaiModelUsed] - OpenAI model actually used
 * @param {boolean} [params.proof.meshyUsed] - Whether Meshy 3D was actually used
 * @returns {string} SVG string
 */
function generateBuildStampSvg({
  width,
  height,
  designId,
  runId,
  timestamp,
  layoutTemplate,
  panelCount,
  flags = {},
  proof = {},
}) {
  // Position: bottom-right corner, larger to fit all info
  const stampWidth = 240;
  const stampHeight = 82;
  const x = width - stampWidth - 8;
  const y = height - stampHeight - 8;

  // Get build metadata - use proof signals if available (truthful naming)
  const commitHash = getCommitHashForStamp();
  const pipelineMode = getPipelineModeForStamp(proof);
  const effectiveRunId = runId || designId || "unknown";

  // Extract proof signals with defaults
  const openaiModel = proof?.openaiModelUsed || "gpt-image-1";
  const meshyUsed = proof?.meshyUsed || false;

  // Format timestamp to be more compact
  const date = new Date(timestamp);
  const dateStr = date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
  const timeStr = date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  // Build flags summary (compact)
  const flagsSummary = [];
  if (flags.blenderTechnical) {
    flagsSummary.push("BL");
  }
  if (flags.openaiStyler) {
    flagsSummary.push("OA");
  }
  if (flags.autoCropPanels) {
    flagsSummary.push("AC");
  }
  if (flags.geometryFirst) {
    flagsSummary.push("GF");
  }
  const flagsStr = flagsSummary.length > 0 ? flagsSummary.join("+") : "STD";

  // Pipeline mode color based on resolved mode
  // Green (#22c55e): meshy_openai_* modes (Meshy actually used)
  // Blue (#3b82f6): svg_openai_* modes (SVG + OpenAI, no Meshy)
  // Amber (#f59e0b): legacy mode
  let modeColor;
  if (pipelineMode.startsWith("meshy_")) {
    modeColor = "#22c55e"; // Green - Meshy 3D was used
  } else if (pipelineMode.startsWith("svg_")) {
    modeColor = "#3b82f6"; // Blue - SVG + OpenAI (no Meshy)
  } else if (pipelineMode === "legacy") {
    modeColor = "#f59e0b"; // Amber - Legacy mode
  } else {
    modeColor = "#6366f1"; // Indigo - fallback for unknown modes
  }

  // Truncate mode for display (max 22 chars)
  const displayMode =
    pipelineMode.length > 22
      ? pipelineMode.substring(0, 20) + ".."
      : pipelineMode;
  const modeBadgeWidth = 100;

  // Meshy indicator
  const meshyIndicator = meshyUsed ? "3D:✓" : "3D:✗";
  const meshyColor = meshyUsed ? "#22c55e" : "#94a3b8";

  // Layout constants for Row 4 (robust positioning)
  const leftX = x + 8;
  const rightX = x + stampWidth - 8;
  const reservedMeshyWidth = 36; // "3D:✓" needs ~36px
  const availableOaiWidth = rightX - leftX - reservedMeshyWidth - 4; // 4px gap
  // Guard against negative/too-small width (SVG textLength quirks)
  const safeOaiWidth = Math.max(availableOaiWidth, 10);

  // Truncate model name for display
  const displayModel = truncateModelName(openaiModel, 18);

  // Professional font stack (system-safe, no web fonts)
  const fontStack = "'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <!-- Build Stamp Background -->
    <rect x="${x}" y="${y}" width="${stampWidth}" height="${stampHeight}"
      fill="#f8fafc" fill-opacity="0.97" stroke="#e2e8f0" stroke-width="1" rx="4" ry="4" />

    <!-- Row 1: Brand + Pipeline Mode Badge -->
    <text x="${leftX}" y="${y + 14}" font-family="${fontStack}" font-size="9" font-weight="700" fill="#0f172a">
      ARCHI.AI
    </text>

    <!-- Pipeline Mode Badge (resolved mode) -->
    <rect x="${x + stampWidth - modeBadgeWidth - 8}" y="${y + 4}" width="${modeBadgeWidth}" height="16"
      fill="${modeColor}" rx="3" ry="3" />
    <text x="${x + stampWidth - modeBadgeWidth / 2 - 8}" y="${y + 15}" font-family="${fontStack}" font-size="7" font-weight="700" fill="white" text-anchor="middle">
      ${displayMode}
    </text>

    <!-- Row 2: Commit + RunId -->
    <text x="${leftX}" y="${y + 28}" font-family="monospace" font-size="7" fill="#64748b">
      ${commitHash}
    </text>
    <text x="${x + 50}" y="${y + 28}" font-family="monospace" font-size="7" fill="#475569">
      run:${effectiveRunId.substring(0, 12)}
    </text>

    <!-- Row 3: Timestamp -->
    <text x="${leftX}" y="${y + 42}" font-family="${fontStack}" font-size="7" fill="#475569">
      ${dateStr} ${timeStr}
    </text>

    <!-- Row 4: OpenAI Model + Meshy indicator (right-aligned) -->
    <!-- textLength is best-effort overflow protection; truncation is primary defense -->
    <text x="${leftX}" y="${y + 56}" font-family="${fontStack}" font-size="7" fill="#475569" dominant-baseline="alphabetic" textLength="${safeOaiWidth}" lengthAdjust="spacingAndGlyphs">
      <tspan font-weight="400">OAI:</tspan><tspan font-weight="600">${displayModel}</tspan>
    </text>
    <text x="${rightX}" y="${y + 56}" font-family="${fontStack}" font-size="7" font-weight="600" fill="${meshyColor}" text-anchor="end" dominant-baseline="alphabetic">
      ${meshyIndicator}
    </text>

    <!-- Row 5: Layout + Panels + Flags -->
    <text x="${leftX}" y="${y + 70}" font-family="${fontStack}" font-size="6" fill="#94a3b8">
      ${layoutTemplate} | ${panelCount}P | ${flagsStr}
    </text>

    <!-- Verification Badge -->
    <circle cx="${x + stampWidth - 16}" cy="${y + 64}" r="10" fill="${modeColor}" />
    <text x="${x + stampWidth - 16}" y="${y + 68}" font-family="${fontStack}" font-size="10" font-weight="700" fill="white" text-anchor="middle">
      ✓
    </text>
  </svg>`;
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function generateBoardSpecStampSvg({
  width,
  height,
  layoutTemplateUsed,
  boardSpecVersion,
}) {
  const fontStack = "'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  const text = `${layoutTemplateUsed || "unknown"} | spec ${boardSpecVersion || "unknown"}`;
  const x = 10;
  const y = Math.max(12, height - 10);
  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <text x="${x}" y="${y}" font-family="${fontStack}" font-size="8" fill="#94a3b8" fill-opacity="0.85">
      ${escapeXml(text)}
    </text>
  </svg>`;
}

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "METHOD_NOT_ALLOWED",
      message: "Method not allowed",
    });
  }

  try {
    // Runtime proof (Node vs Edge/other)
    logRuntimeOnce();

    // Get shared constants (with fallback)
    const constants = await getLayoutConstants();
    const {
      // Print master resolution (300 DPI)
      A1_WIDTH,
      A1_HEIGHT,
      // Working resolution (preview)
      WORKING_WIDTH,
      WORKING_HEIGHT,
      LABEL_HEIGHT,
      LABEL_PADDING,
      FRAME_STROKE_COLOR,
      FRAME_RADIUS,
      GRID_SPEC,
      REQUIRED_PANELS,
      toPixelRect,
      getPanelFitMode: _legacyFitMode, // shadowed by composeCore SSOT below
      getGridSpec,
      validatePanelLayout,
    } = constants;

    // Use composeCore fit policy as SSOT (replaces legacy + boardSpec + SCALE_TO_FILL)
    const getPanelFitMode = composeCoreGetPanelFitMode;

    const {
      designId,
      siteOverlay = null,
      layoutConfig = "board-v2",
      titleBlock = null,
      masterDNA = null,
      projectContext = null,
      locationData = null,
    } = req.body;
    let panels = Array.isArray(req.body?.panels) ? req.body.panels : [];

    if (!panels || panels.length === 0) {
      return res.status(400).json({
        success: false,
        error: "NO_PANELS",
        message: "No panels provided",
      });
    }

    console.log(
      `[A1 Compose] Composing ${panels.length} panels for design ${designId}`,
    );

    // ====================================================================
    // CRITICAL: DESIGN FINGERPRINT VALIDATION
    // ====================================================================
    // Ensure all panels belong to the same design run.
    // This prevents mixing panels from different concurrent generations.
    const expectedFingerprint = req.body.designFingerprint || designId;
    const fingerprintMismatches = [];

    for (const panel of panels) {
      const panelFingerprint =
        panel.designFingerprint || panel.meta?.designFingerprint;
      if (panelFingerprint && panelFingerprint !== expectedFingerprint) {
        fingerprintMismatches.push({
          panelType: panel.type,
          expectedFingerprint,
          actualFingerprint: panelFingerprint,
        });
      }
    }

    if (fingerprintMismatches.length > 0) {
      console.error(`[A1 Compose] ❌ DESIGN FINGERPRINT MISMATCH DETECTED!`);
      console.error(`   Expected: ${expectedFingerprint}`);
      console.error(`   Mismatches: ${JSON.stringify(fingerprintMismatches)}`);

      return res.status(400).json({
        success: false,
        error: "FINGERPRINT_MISMATCH",
        message: `Panels from different design runs cannot be composed together. Expected fingerprint: ${expectedFingerprint}`,
        details: {
          mismatches: fingerprintMismatches,
          recommendation:
            "This indicates a race condition in concurrent generation. Please regenerate all panels together.",
        },
      });
    }

    console.log(
      `[A1 Compose] ✅ Fingerprint validation passed: ${expectedFingerprint}`,
    );

    // ====================================================================
    // CRITICAL: PANEL_REGISTRY VALIDATION (Runtime Assertion)
    // ====================================================================
    // Uses SSOT from panelRegistry.js to normalize panel types and enforce required panels.
    // Unknown panel types are ignored with warnings to avoid blocking composition on legacy extras.
    const registry = await getPanelRegistry();
    const unknownPanelTypes = [];

    if (registry) {
      const normalizedPanels = panels
        .map((panel) => {
          const canonical = registry.normalizeToCanonical(panel.type);
          if (!canonical) {
            unknownPanelTypes.push(panel.type);
            return null;
          }
          return { ...panel, type: canonical };
        })
        .filter(Boolean);

      if (unknownPanelTypes.length > 0) {
        console.warn(
          `[A1 Compose] Ignoring unknown panel types: ${unknownPanelTypes.join(", ")}`,
        );
      }

      panels = normalizedPanels;
    } else {
      // Fallback: use composeCore normalizeKey when panelRegistry is unavailable
      console.warn(
        "[A1 Compose] PANEL_REGISTRY not available, using composeCore normalizeKey fallback",
      );
      panels = panels.map((panel) => ({
        ...panel,
        type: composeCoreNormalizeKey(panel.type),
      }));
    }

    if (!panels || panels.length === 0) {
      return res.status(400).json({
        success: false,
        error: "NO_PANELS",
        message: "No valid panels provided after normalization",
        details: {
          unknownPanelTypes,
        },
      });
    }

    const explicitFloorCount = Number(req.body.floorCount);
    const derivedFloorCount =
      panels.filter((p) => String(p.type || "").startsWith("floor_plan_"))
        .length || 2;
    const floorCount =
      Number.isFinite(explicitFloorCount) && explicitFloorCount > 0
        ? explicitFloorCount
        : derivedFloorCount;

    // skipMissingPanelCheck: Allow composition with placeholders for missing panels (smoke tests, dev)
    const skipMissingPanelCheck = req.body.skipMissingPanelCheck === true;

    if (registry && !skipMissingPanelCheck) {
      const requiredPanels =
        typeof registry.getAIGeneratedPanels === "function"
          ? registry.getAIGeneratedPanels(floorCount)
          : registry.getRequiredPanels(floorCount);
      const providedTypes = new Set(panels.map((p) => p.type));
      const missingPanels = requiredPanels.filter(
        (type) => !providedTypes.has(type),
      );

      if (missingPanels.length > 0) {
        console.warn(
          `[A1 Compose] Missing required panels: ${missingPanels.join(", ")}`,
        );
        return res.status(400).json({
          success: false,
          error: "MISSING_REQUIRED_PANELS",
          message: `Cannot compose A1 sheet - missing: ${missingPanels.join(", ")}. Please regenerate missing panels first.`,
          details: {
            missingPanels,
            unknownPanelTypes,
          },
        });
      }
    } else if (skipMissingPanelCheck) {
      console.log(
        `[A1 Compose] skipMissingPanelCheck=true - allowing composition with placeholders`,
      );
    }

    panels = panels.map((panel) => {
      if (!panel) {
        return panel;
      }
      if (!panel.imageUrl && panel.url) {
        return { ...panel, imageUrl: panel.url };
      }
      return panel;
    });

    // Validate panel layout BEFORE proceeding (legacy validation as backup)
    const validation = validatePanelLayout(panels, { floorCount });

    if (!validation.valid) {
      const missingPanels = validation.missingPanels || [];
      const nonMissingErrors = validation.errors.filter(
        (err) => !err.startsWith("Missing panels:"),
      );
      const blockingMissing = registry
        ? missingPanels.filter((type) => {
            const entry = registry.getRegistryEntry
              ? registry.getRegistryEntry(type)
              : null;
            return entry ? entry.generator !== "data" : true;
          })
        : missingPanels;

      if (blockingMissing.length > 0 || nonMissingErrors.length > 0) {
        console.warn(
          `[A1 Compose] Layout validation failed: ${validation.errors.join("; ")}`,
        );
        return res.status(400).json({
          success: false,
          error: "PANEL_VALIDATION_FAILED",
          message: validation.errors.join("; "),
          details: {
            missingPanels: blockingMissing,
            unknownPanelTypes,
          },
        });
      }

      if (missingPanels.length > 0) {
        console.warn(
          `[A1 Compose] Optional panels missing: ${missingPanels.join(", ")}`,
        );
      }
    }

    // ====================================================================
    // PRE-COMPOSE GATE: FLOOR PLAN ROOM COUNT VALIDATION (BLOCKING)
    // ====================================================================
    // Ensures no floor plan has 0 rooms (which would result in empty borders)
    const DEBUG_RUNS = process.env.DEBUG_RUNS === "1";

    // skipValidation: Skip ALL validation gates (for smoke tests, dev mode)
    const skipValidation =
      skipMissingPanelCheck || req.body.skipValidation === true;

    if (skipValidation) {
      console.log(
        `[A1 Compose] ⚠️ skipValidation=true - skipping floor plan, geometry, and cross-view validation`,
      );
    }

    if (DEBUG_RUNS) {
      console.log(
        "[DEBUG_RUNS] [A1 Compose] Starting pre-compose validation...",
      );
    }

    const emptyFloorPlans = [];
    const floorPlanPanels = panels.filter((p) =>
      p.type?.includes("floor_plan"),
    );

    for (const panel of floorPlanPanels) {
      const roomCount = panel.meta?.roomCount || panel.roomCount || 0;
      const wallCount = panel.meta?.wallCount || panel.wallCount || 0;

      if (DEBUG_RUNS) {
        console.log(`[DEBUG_RUNS] [A1 Compose] Floor plan ${panel.type}:`, {
          roomCount,
          wallCount,
          hasBuffer: !!panel.buffer,
          hasImageUrl: !!panel.imageUrl,
          runId: panel.meta?.runId || panel.runId,
        });
      }

      // Check for empty floor plan (0 rooms indicates geometry failure)
      if (roomCount === 0) {
        emptyFloorPlans.push({
          panelType: panel.type,
          roomCount,
          wallCount,
          runId: panel.meta?.runId || panel.runId,
        });
      }
    }

    if (emptyFloorPlans.length > 0 && !skipValidation) {
      console.error(`[A1 Compose] ❌ EMPTY FLOOR PLANS DETECTED!`);
      console.error(
        `   Empty plans: ${emptyFloorPlans.map((p) => p.panelType).join(", ")}`,
      );

      return res.status(400).json({
        success: false,
        error: "EMPTY_FLOOR_PLANS",
        message:
          "Cannot compose A1 sheet - one or more floor plans have 0 rooms, which indicates a room assignment failure.",
        details: {
          emptyFloorPlans,
          recommendation:
            "This typically means rooms were not distributed to upper floors. Check the program configuration and ensure rooms are assigned to all requested floors.",
        },
      });
    } else if (emptyFloorPlans.length > 0) {
      console.warn(
        `[A1 Compose] ⚠️ Empty floor plans skipped (skipValidation=true): ${emptyFloorPlans.map((p) => p.panelType).join(", ")}`,
      );
    }

    console.log(
      `[A1 Compose] ✅ Floor plan room validation passed (${floorPlanPanels.length} plans checked)`,
    );

    // ====================================================================
    // PRE-COMPOSE GATE: GEOMETRY PACK CONSISTENCY (BLOCKING)
    // ====================================================================
    // Ensures hero_3d and elevations share the same geometry runId
    const hero3dPanel = panels.find((p) => p.type === "hero_3d");
    const elevationPanels = panels.filter((p) =>
      p.type?.includes("elevation_"),
    );

    if (hero3dPanel && elevationPanels.length > 0) {
      const hero3dRunId = hero3dPanel.meta?.runId || hero3dPanel.runId;
      const elevationRunIds = elevationPanels
        .map((p) => p.meta?.runId || p.runId)
        .filter(Boolean);

      if (DEBUG_RUNS) {
        console.log(
          `[DEBUG_RUNS] [A1 Compose] Geometry pack consistency check:`,
          {
            hero3dRunId,
            elevationRunIds,
          },
        );
      }

      if (hero3dRunId && elevationRunIds.length > 0) {
        const mismatches = elevationRunIds.filter((id) => id !== hero3dRunId);

        if (mismatches.length > 0 && !skipValidation) {
          console.error(`[A1 Compose] ❌ GEOMETRY PACK MISMATCH DETECTED!`);
          console.error(`   hero_3d runId: ${hero3dRunId}`);
          console.error(
            `   Mismatched elevation runIds: ${[...new Set(mismatches)].join(", ")}`,
          );

          return res.status(400).json({
            success: false,
            error: "GEOMETRY_PACK_MISMATCH",
            message:
              "Cannot compose A1 sheet - hero_3d and elevations were generated from different geometry packs.",
            details: {
              hero3dRunId,
              elevationRunIds: [...new Set(elevationRunIds)],
              recommendation:
                "Ensure all panels are generated from the same canonical geometry in a single run.",
            },
          });
        } else if (mismatches.length > 0) {
          console.warn(
            `[A1 Compose] ⚠️ Geometry pack mismatch skipped (skipValidation=true)`,
          );
        }

        console.log(
          `[A1 Compose] ✅ Geometry pack consistency passed (runId: ${hero3dRunId})`,
        );
      }
    }

    // ====================================================================
    // CROSS-VIEW CONSISTENCY GATE (BLOCKING - unless skipValidation)
    // ====================================================================
    // Panels must show the SAME building - reject if cross-view fails
    // Uses real image comparison: SSIM, pHash, pixelmatch
    if (!skipValidation) {
      const imageValidator = await getCrossViewImageValidator();
      if (imageValidator) {
        console.log(
          "[A1 Compose] Running real image cross-view consistency validation (SSIM/pHash/pixelmatch)...",
        );

        // Build panel map from request panels
        const panelMap = {};
        for (const panel of panels) {
          if (panel.type && (panel.imageUrl || panel.buffer)) {
            panelMap[panel.type] = {
              url: panel.imageUrl,
              buffer: panel.buffer,
            };
          }
        }

        try {
          // NEW: Use real image comparison instead of heuristic validation
          const crossViewResult =
            await imageValidator.validateAllPanels(panelMap);

          if (!crossViewResult.pass) {
            console.error(`[A1 Compose] Cross-view validation FAILED`);
            console.error(
              `   Overall Score: ${(crossViewResult.overallScore * 100).toFixed(1)}%`,
            );
            console.error(
              `   Failed Panels: ${crossViewResult.failedPanels.map((fp) => fp.panelType).join(", ")}`,
            );

            // Generate structured error report
            const errorReport =
              imageValidator.generateErrorReport(crossViewResult);

            return res.status(400).json(errorReport);
          }

          console.log(
            `[A1 Compose] Cross-view validation PASSED (score: ${(crossViewResult.overallScore * 100).toFixed(1)}%)`,
          );
        } catch (crossViewError) {
          console.error(
            "[A1 Compose] Cross-view validation error:",
            crossViewError.message,
          );
          // Fail closed on validation errors (conservative approach)
          return res.status(500).json({
            success: false,
            error: "CROSS_VIEW_VALIDATION_ERROR",
            message: crossViewError.message,
            details: {
              recommendation: "Validation system error. Please retry.",
            },
          });
        }
      } else {
        // FAIL-CLOSED: If validator module can't be loaded, reject the composition
        // This prevents A1 sheets from being exported without cross-view verification
        console.error(
          "[A1 Compose] Cross-view image validator not available - BLOCKING",
        );
        return res.status(500).json({
          success: false,
          error: "CROSS_VIEW_VALIDATOR_UNAVAILABLE",
          message:
            "Cannot compose A1 sheet without cross-view consistency validation. Validator module failed to load.",
          details: {
            recommendation:
              "Check server deployment - ensure crossViewImageValidator.js is bundled correctly with sharp and pixelmatch.",
          },
        });
      }
    } else {
      console.log(
        `[A1 Compose] ⚠️ Cross-view validation SKIPPED (skipValidation=true)`,
      );
    }

    // Dynamic import of sharp (server-side only)
    let sharp;
    try {
      sharp = (await import("sharp")).default;
    } catch (e) {
      console.error("[A1 Compose] sharp not available:", e.message);
      return res.status(500).json({
        success: false,
        error: "SHARP_UNAVAILABLE",
        message:
          "Server-side composition not available - sharp module not installed",
        details: {
          originalError: e.message,
          recommendation:
            'Ensure api/a1/compose.js has runtime = "nodejs" and sharp is in dependencies.',
        },
      });
    }

    // LAYOUT TEMPLATE SELECTION – delegate to shared composeCore (SSOT)
    const layoutTemplateRaw =
      req.body.layoutTemplate || layoutConfig || "board-v2";
    const useHighRes =
      req.body.highRes === true || req.body.printMaster === true;

    // Use composeCore for normalisation and grid resolution
    const composeCoreResolved = composeCoreResolveLayout({
      layoutTemplate: layoutTemplateRaw,
      floorCount,
      highRes: useHighRes,
    });

    let layoutTemplate = composeCoreResolved.layoutTemplate;
    let layout = composeCoreResolved.layout;
    const width = composeCoreResolved.width;
    const height = composeCoreResolved.height;

    // QA defaults (A1BoardSpec removed – composeCore is SSOT for fit/layout)
    const boardSpecVersion = null;
    const qaEnabled = !skipValidation;
    const rotateToFit = qaEnabled;
    const minSlotOccupancy = 0.4;

    console.log(
      `[A1 Compose] Using ${layoutTemplate.toUpperCase()} layout (floors=${floorCount}, ${width}x${height}px)`,
    );
    console.log(`[A1 Compose] Layout resolved via composeCore SSOT`);

    if (useHighRes) {
      console.log(
        `[A1 Compose] HIGH-RES MODE: Using print master resolution ${A1_WIDTH}×${A1_HEIGHT}px (300 DPI)`,
      );
    }

    // Create white background
    const background = sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    }).png();

    // Prepare composite operations
    const composites = [];
    const coordinates = {};

    const panelMap = new Map(panels.map((p) => [p.type, p]));

    // HARD QA GATE: Completeness (fail closed)
    if (qaEnabled) {
      const missingSlotContent = Object.keys(layout)
        .filter((type) => type !== "title_block")
        .filter((type) => {
          const panel = panelMap.get(type);
          const hasContent = !!(panel?.buffer || panel?.imageUrl);
          return !hasContent;
        });

      if (missingSlotContent.length > 0) {
        console.error(
          `[A1 Compose] ❌ Missing slot content: ${missingSlotContent.join(", ")}`,
        );
        return res.status(400).json({
          success: false,
          error: "MISSING_SLOT_CONTENT",
          message: `Cannot compose A1 sheet - missing panel content for: ${missingSlotContent.join(", ")}`,
          details: {
            missingPanels: missingSlotContent,
            layoutTemplate,
            floorCount,
          },
        });
      }
    }

    // Process each panel
    for (const [type, slot] of Object.entries(layout)) {
      const slotRect = toPixelRect(slot, width, height);
      coordinates[type] = { ...slotRect, labelHeight: LABEL_HEIGHT };

      const mode = getPanelFitMode(type);
      const panel = panelMap.get(type);

      if (type === "title_block") {
        if (panel?.imageUrl || panel?.buffer) {
          try {
            const buffer =
              panel.buffer || (await fetchImageBuffer(panel.imageUrl));
            const resized = await placePanelImage({
              sharp,
              imageBuffer: buffer,
              slotRect,
              mode,
              constants,
              panelType: type,
              qa: {
                enabled: qaEnabled,
                rotateToFit,
                minSlotOccupancy,
                useHighRes,
                layoutTemplate,
              },
            });
            composites.push({
              input: resized,
              left: slotRect.x,
              top: slotRect.y,
            });
            continue;
          } catch (err) {
            console.error(
              `[A1 Compose] Failed to process panel ${type}:`,
              err.message,
            );
            if (qaEnabled) {
              return res.status(400).json({
                success: false,
                error: "PANEL_PROCESSING_FAILED",
                message: `Panel ${type} failed QA/placement: ${err.message}`,
                details: {
                  panelType: type,
                  layoutTemplate,
                  floorCount,
                  ...err.details,
                },
              });
            }
          }
        }

        const titleBuffer = await buildTitleBlockBuffer(
          sharp,
          slotRect.width,
          slotRect.height - LABEL_HEIGHT - LABEL_PADDING,
          { ...(titleBlock || {}), designId: expectedFingerprint },
          constants,
        );
        composites.push({
          input: titleBuffer,
          left: slotRect.x,
          top: slotRect.y,
        });
        continue;
      }

      // DATA PANELS: Render deterministic SVG instead of using FLUX-generated images
      // These panels contain text-heavy data (room schedules, material swatches, climate info)
      // that FLUX renders as semi-legible gibberish. SVG gives crisp, perfectly readable output.
      const svgHeight = slotRect.height - LABEL_HEIGHT - LABEL_PADDING;
      if (type === "schedules_notes" && (!panel?.imageUrl || panel?.svgPanel)) {
        const schedulesBuffer = await buildSchedulesBuffer(
          sharp,
          slotRect.width,
          svgHeight,
          masterDNA,
          projectContext,
          constants,
        );
        composites.push({
          input: schedulesBuffer,
          left: slotRect.x,
          top: slotRect.y,
        });
        continue;
      }
      if (
        type === "material_palette" &&
        (!panel?.imageUrl || panel?.svgPanel)
      ) {
        const materialBuffer = await buildMaterialPaletteBuffer(
          sharp,
          slotRect.width,
          svgHeight,
          masterDNA,
          constants,
        );
        composites.push({
          input: materialBuffer,
          left: slotRect.x,
          top: slotRect.y,
        });
        continue;
      }
      if (type === "climate_card" && (!panel?.imageUrl || panel?.svgPanel)) {
        const climateBuffer = await buildClimateCardBuffer(
          sharp,
          slotRect.width,
          svgHeight,
          locationData,
          constants,
        );
        composites.push({
          input: climateBuffer,
          left: slotRect.x,
          top: slotRect.y,
        });
        continue;
      }

      if (panel?.imageUrl || panel?.buffer) {
        try {
          const buffer =
            panel.buffer || (await fetchImageBuffer(panel.imageUrl));
          const resized = await placePanelImage({
            sharp,
            imageBuffer: buffer,
            slotRect,
            mode,
            constants,
            panelType: type, // Pass panel type for debug logging
            qa: {
              enabled: qaEnabled,
              rotateToFit,
              minSlotOccupancy,
              useHighRes,
              layoutTemplate,
            },
          });
          composites.push({
            input: resized,
            left: slotRect.x,
            top: slotRect.y,
          });
          continue;
        } catch (err) {
          console.error(
            `[A1 Compose] Failed to process panel ${type}:`,
            err.message,
          );
          if (qaEnabled) {
            return res.status(400).json({
              success: false,
              error: "PANEL_PROCESSING_FAILED",
              message: `Panel ${type} failed QA/placement: ${err.message}`,
              details: {
                panelType: type,
                layoutTemplate,
                floorCount,
                ...err.details,
              },
            });
          }
        }
      }

      // Build placeholder for missing panel
      if (qaEnabled) {
        return res.status(400).json({
          success: false,
          error: "MISSING_SLOT_CONTENT",
          message: `Cannot compose A1 sheet - missing panel content for: ${type}`,
          details: { panelType: type, layoutTemplate, floorCount },
        });
      }
      const placeholder = await buildPlaceholder(
        sharp,
        slotRect.width,
        slotRect.height - LABEL_HEIGHT - LABEL_PADDING,
        type,
        constants,
      );
      composites.push({
        input: placeholder,
        left: slotRect.x,
        top: slotRect.y,
      });
    }

    // Add site overlay if provided
    if (siteOverlay?.imageUrl) {
      const siteLayout = layout.site_diagram || GRID_SPEC.site_diagram;
      const slotRect = toPixelRect(siteLayout, width, height);
      const targetHeight = slotRect.height - LABEL_HEIGHT - LABEL_PADDING;

      try {
        const overlayBuffer = await fetchImageBuffer(siteOverlay.imageUrl);

        // Debug logging for site overlay
        if (DEBUG_RUNS) {
          const metadata = await sharp(overlayBuffer).metadata();
          console.log(`[A1 Compose] Site overlay resize:`, {
            input: { width: metadata.width, height: metadata.height },
            output: { width: slotRect.width, height: targetHeight },
            fit: "contain",
          });
        }

        // CRITICAL: Use fit:'contain' to prevent cropping site overlays
        const resizedOverlay = await sharp(overlayBuffer)
          .resize(slotRect.width, targetHeight, {
            fit: "contain", // ALWAYS contain - never crop
            position: "centre", // Center within slot
            background: { r: 255, g: 255, b: 255, alpha: 1 }, // White letterbox padding
          })
          .png()
          .toBuffer();

        composites.push({
          input: resizedOverlay,
          left: slotRect.x,
          top: slotRect.y,
        });

        coordinates.site_overlay = { ...slotRect, labelHeight: LABEL_HEIGHT };
        console.log(
          `[A1 Compose] Added site overlay at (${slotRect.x}, ${slotRect.y})`,
        );
      } catch (err) {
        console.error("[A1 Compose] Failed to add site overlay:", err.message);
      }
    }

    // Draw panel borders and labels
    const borderSvg = generateOverlaySvg(coordinates, width, height, constants);
    composites.push({
      input: Buffer.from(borderSvg),
      left: 0,
      top: 0,
    });

    // Layout guarantee stamp (always-on): layoutTemplateUsed + boardSpecVersion
    const specStampSvg = generateBoardSpecStampSvg({
      width,
      height,
      layoutTemplateUsed: layoutTemplate,
      boardSpecVersion,
    });
    composites.push({
      input: Buffer.from(specStampSvg),
      left: 0,
      top: 0,
    });

    // BUILD STAMP: Optional stamp in bottom-right corner with build info
    // DELIVERABLE A: Build Stamp (visual proof)
    // Contains: RESOLVED PIPELINE_MODE (truthful), commit hash, runId, timestamp, OpenAI model, Meshy indicator
    const includeBuildStamp =
      req.body.includeBuildStamp === true ||
      process.env.A1_COMPOSE_INCLUDE_BUILD_STAMP === "1";

    if (includeBuildStamp) {
      const buildTimestamp = new Date().toISOString();
      const shortHash = designId ? designId.substring(0, 8) : "N/A";
      const runIdFromRequest = req.body.runId || req.body.meta?.runId;

      // Extract flags from request body (passed from orchestrator)
      const flagsFromRequest = req.body.flags || req.body.meta?.flags || {};

      // Extract proof signals from request body (passed from orchestrator)
      // These contain truthful information about what generators were actually used
      const proofFromRequest = req.body.proof || req.body.meta?.proof || {};

      const buildStampSvg = generateBuildStampSvg({
        width,
        height,
        designId: shortHash,
        runId: runIdFromRequest,
        timestamp: buildTimestamp,
        layoutTemplate,
        panelCount: panels.length,
        flags: flagsFromRequest,
        proof: proofFromRequest,
      });

      const resolvedMode = getPipelineModeForStamp(proofFromRequest);
      console.log(
        `[A1 Compose] Build stamp: pipeline=${resolvedMode}, openaiModel=${proofFromRequest.openaiModelUsed || "gpt-image-1"}, meshyUsed=${proofFromRequest.meshyUsed || false}, commit=${getCommitHashForStamp()}, runId=${runIdFromRequest || shortHash}`,
      );
      composites.push({
        input: Buffer.from(buildStampSvg),
        left: 0,
        top: 0,
      });
    }

    // Compose all panels onto background
    const composedBuffer = await background
      .composite(composites)
      .png()
      .toBuffer();

    const maxDataUrlBytes =
      parseInt(process.env.A1_COMPOSE_MAX_DATAURL_BYTES || "", 10) ||
      DEFAULT_MAX_DATAURL_BYTES;
    const outputDir = resolveComposeOutputDir();
    const publicUrlBase =
      process.env.A1_COMPOSE_PUBLIC_URL_BASE || DEFAULT_PUBLIC_URL_BASE;

    const composePayload = buildComposeSheetUrl({
      pngBuffer: composedBuffer,
      maxDataUrlBytes,
      outputDir,
      publicUrlBase,
      designId,
    });

    if (!composePayload.sheetUrl) {
      return res.status(413).json({
        success: false,
        error: composePayload.error || "PAYLOAD_TOO_LARGE",
        message:
          composePayload.message ||
          "Composed sheet is too large to return as a base64 data URL. Configure external storage for composed PNGs.",
        details: {
          ...composePayload,
          maxDataUrlBytes,
        },
      });
    }

    const {
      sheetUrl,
      transport,
      pngBytes,
      estimatedDataUrlBytes,
      sheetUrlBytes,
      outputFile,
    } = composePayload;

    // Print-ready PDF (A1 landscape) generated alongside high-res PNG exports
    const includePdf = useHighRes && req.body.skipPdf !== true;
    let pdfUrl = null;
    let pdfBytes = 0;
    let pdfOutputFile = null;

    if (includePdf) {
      try {
        const pdfBuffer = await buildPrintReadyPdfFromPng(composedBuffer, {
          widthPx: width,
          heightPx: height,
          dpi: 300,
        });

        const safeDesignId =
          String(designId || "unknown")
            .replace(/[^a-z0-9_-]/gi, "")
            .slice(0, 60) || "unknown";
        const baseName = outputFile
          ? outputFile.replace(/\.png$/i, "")
          : `a1_${safeDesignId}_${Date.now()}`;

        pdfOutputFile = `${baseName}.pdf`;
        fs.mkdirSync(outputDir, { recursive: true });
        fs.writeFileSync(path.join(outputDir, pdfOutputFile), pdfBuffer);

        const base = String(publicUrlBase || DEFAULT_PUBLIC_URL_BASE).replace(
          /\/$/,
          "",
        );
        pdfUrl = `${base}/${pdfOutputFile}`;
        pdfBytes = pdfBuffer.length;
      } catch (pdfError) {
        console.error("[A1 Compose] PDF generation failed:", pdfError.message);
        // Fail closed for print exports unless explicitly skipping validation
        if (!skipValidation) {
          return res.status(500).json({
            success: false,
            error: "PDF_GENERATION_FAILED",
            message: pdfError.message,
          });
        }
      }
    }

    console.log(
      `[A1 Compose] Sheet composed: ${composites.length} elements, ${width}x${height}px (${transport})`,
    );

    // ====================================================================
    // CACHE-BUSTING: Prevent browser/Vercel caching collisions
    // ====================================================================
    // These headers ensure:
    // - Browser doesn't cache the response (no-store)
    // - Vercel edge doesn't cache the response (CDN-Cache-Control)
    // - Each request gets fresh composition (no stale panels)
    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate",
    );
    res.setHeader("CDN-Cache-Control", "no-store");
    res.setHeader("Vercel-CDN-Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    // Add design fingerprint header for debugging
    res.setHeader("X-Design-Fingerprint", expectedFingerprint || "unknown");
    res.setHeader("X-Composition-Timestamp", new Date().toISOString());

    console.log(`[A1 Compose] Response headers set: Cache-Control: no-store`);

    // TASK 4: Build panelsByKey map for print export persistence
    // This ensures print export can access the exact panels used in composition
    const panelsByKey = {};
    for (const panel of panels) {
      if (panel.type) {
        panelsByKey[panel.type] = {
          type: panel.type,
          url: panel.imageUrl || null,
          hasBuffer: !!panel.buffer,
          coordinates: coordinates[panel.type] || null,
        };
      }
    }

    // ====================================================================
    // QA GATES: Run automated quality assurance checks
    // ====================================================================
    let qaResults = null;
    let critiqueResults = null;
    const runQA = !skipValidation && req.body.runQA !== false;

    if (runQA) {
      try {
        const qaGatesModule = await getQAGates();
        if (qaGatesModule && qaGatesModule.runAllQAGates) {
          console.log("[A1 Compose] Running QA gates...");

          // Build panel data for QA gates
          const qaPanels = panels.map((p) => ({
            type: p.type,
            buffer: p.buffer || null,
            pHash: p.pHash || null,
            rect: coordinates[p.type]
              ? {
                  width: Math.round(coordinates[p.type].width),
                  height: Math.round(coordinates[p.type].height),
                }
              : null,
          }));

          const sheetDimensions = { width, height };
          qaResults = await qaGatesModule.runAllQAGates(
            qaPanels,
            sheetDimensions,
            {
              skipContrastCheck: req.body.skipContrastCheck,
            },
          );

          console.log(
            `[A1 Compose] QA gates complete: ${qaResults.summary?.passed}/${qaResults.summary?.total} passed`,
          );

          if (qaResults.failures?.length > 0) {
            console.warn(
              `[A1 Compose] QA failures: ${qaResults.failures.map((f) => f.gate).join(", ")}`,
            );
          }
        }
      } catch (qaError) {
        console.warn("[A1 Compose] QA gates failed:", qaError.message);
        qaResults = { error: qaError.message, skipped: true };
      }

      // ====================================================================
      // OPUS SHEET CRITIC: AI-powered sheet validation
      // ====================================================================
      const runCritique = req.body.runCritique !== false;
      if (runCritique && sheetUrl) {
        try {
          const CriticClass = await getOpusSheetCritic();
          if (CriticClass) {
            console.log("[A1 Compose] Running Opus Sheet Critic...");

            const critic = new CriticClass();
            const requiredPanels = Object.keys(panelsByKey);

            // Pass design fingerprint if available
            const designFingerprint = expectedFingerprint || null;

            critiqueResults = await critic.critiqueSheet(
              sheetUrl,
              requiredPanels,
              {
                designFingerprint,
                layoutTemplate,
                strictMode: req.body.strictCritique || false,
              },
            );

            console.log(
              `[A1 Compose] Opus critique complete: overall_pass=${critiqueResults.overall_pass}`,
            );

            if (!critiqueResults.overall_pass) {
              console.warn(
                `[A1 Compose] Critique issues: ${critiqueResults.layout_issues?.length || 0} layout, ${critiqueResults.regenerate_panels?.length || 0} regen`,
              );
            }
          }
        } catch (critiqueError) {
          console.warn(
            "[A1 Compose] Opus Sheet Critic failed:",
            critiqueError.message,
          );
          critiqueResults = { error: critiqueError.message, skipped: true };
        }
      }
    }

    // Return the composition result
    // STANDARD CONTRACT: { success, sheetUrl, composedSheetUrl (alias), coordinates, metadata, panelsByKey, qa, critique }
    return res.status(200).json({
      success: true,
      sheetUrl,
      composedSheetUrl: sheetUrl, // backwards compat alias
      url: sheetUrl, // additional alias for client normalizer
      pdfUrl,
      coordinates,
      // TASK 4: Include panelsByKey for print export
      panelsByKey,
      // QA Results (automated gates)
      qa: qaResults
        ? {
            allPassed: qaResults.allPassed,
            summary: qaResults.summary,
            failures: qaResults.failures || [],
            warnings: qaResults.warnings || [],
            skipped: qaResults.skipped || false,
            error: qaResults.error || null,
          }
        : null,
      // Opus Sheet Critic results (AI-powered validation)
      critique: critiqueResults
        ? {
            overallPass: critiqueResults.overall_pass,
            layoutIssues: critiqueResults.layout_issues || [],
            missingItems: critiqueResults.missing_items || [],
            illegibleItems: critiqueResults.illegible_items || [],
            regeneratePanels: critiqueResults.regenerate_panels || [],
            ribaCompliance: critiqueResults.riba_compliance || null,
            visualScore: critiqueResults.visual_score || null,
            skipped: critiqueResults.skipped || false,
            error: critiqueResults.error || null,
          }
        : null,
      metadata: {
        width,
        height,
        panelCount: panels.length,
        composedAt: new Date().toISOString(),
        layoutTemplate,
        layoutTemplateUsed: layoutTemplate,
        boardSpecVersion,
        layoutConfig,
        designId,
        designFingerprint: expectedFingerprint,
        transport,
        pngBytes,
        estimatedDataUrlBytes,
        sheetUrlBytes,
        outputFile,
        pdfBytes,
        pdfOutputFile,
        // TASK 4: Add panel keys list for export verification
        panelKeys: Object.keys(panelsByKey),
        // QA summary flags for quick checks
        qaAllPassed: qaResults?.allPassed ?? null,
        critiqueOverallPass: critiqueResults?.overall_pass ?? null,
      },
    });
  } catch (error) {
    console.error("[A1 Compose] Error:", error);
    return res.status(500).json({
      success: false,
      error: "COMPOSITION_FAILED",
      message: error.message,
      details:
        process.env.NODE_ENV === "development"
          ? { stack: error.stack }
          : undefined,
    });
  }
}

function computeSafeCoverCropRect(
  sourceW,
  sourceH,
  targetW,
  targetH,
  { xAlign = 0.5, yAlign = 0.5 } = {},
) {
  if (
    !Number.isFinite(sourceW) ||
    !Number.isFinite(sourceH) ||
    !Number.isFinite(targetW) ||
    !Number.isFinite(targetH) ||
    sourceW <= 0 ||
    sourceH <= 0 ||
    targetW <= 0 ||
    targetH <= 0
  ) {
    return null;
  }

  const targetAspect = targetW / targetH;
  const sourceAspect = sourceW / sourceH;

  const clamp01 = (v) => Math.max(0, Math.min(1, Number(v)));
  const ax = clamp01(xAlign);
  const ay = clamp01(yAlign);

  if (Math.abs(sourceAspect - targetAspect) < 1e-3) {
    return null;
  }

  if (sourceAspect > targetAspect) {
    // Crop width
    const cropW = Math.max(1, Math.round(sourceH * targetAspect));
    const left = Math.round((sourceW - cropW) * ax);
    return {
      left: Math.max(0, Math.min(sourceW - cropW, left)),
      top: 0,
      width: cropW,
      height: sourceH,
    };
  }

  // Crop height
  const cropH = Math.max(1, Math.round(sourceW / targetAspect));
  const top = Math.round((sourceH - cropH) * ay);
  return {
    left: 0,
    top: Math.max(0, Math.min(sourceH - cropH, top)),
    width: sourceW,
    height: cropH,
  };
}

/**
 * TASK 1: Geometry-based SVG bounds calculation
 * Parses SVG elements directly for accurate content bounds.
 * This is more accurate than pixel-based detection for technical drawings.
 *
 * @param {string} svgText - SVG string to analyze
 * @returns {{ minX: number, minY: number, maxX: number, maxY: number, width: number, height: number } | null}
 */
function computeSvgGeometryBounds(svgText) {
  if (!svgText) {
    return null;
  }

  const bounds = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  };

  const expandBounds = (x, y) => {
    if (isFinite(x) && isFinite(y)) {
      bounds.minX = Math.min(bounds.minX, x);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxX = Math.max(bounds.maxX, x);
      bounds.maxY = Math.max(bounds.maxY, y);
    }
  };

  // Parse <rect> elements (skip background rects)
  const rectMatches = svgText.matchAll(/<rect[^>]*>/gi);
  for (const match of rectMatches) {
    const fullMatch = match[0];
    // Skip background rects (100% or very large)
    if (fullMatch.includes("100%") || fullMatch.includes('fill-opacity="0"')) {
      continue;
    }

    const xMatch = fullMatch.match(/\bx="([^"]*)"/);
    const yMatch = fullMatch.match(/\by="([^"]*)"/);
    const wMatch = fullMatch.match(/\bwidth="([^"]*)"/);
    const hMatch = fullMatch.match(/\bheight="([^"]*)"/);

    const x = xMatch ? parseFloat(xMatch[1]) : 0;
    const y = yMatch ? parseFloat(yMatch[1]) : 0;
    const w = wMatch ? parseFloat(wMatch[1]) : 0;
    const h = hMatch ? parseFloat(hMatch[1]) : 0;

    // Skip massive rects (likely backgrounds)
    if (w > 5000 && h > 5000) {
      continue;
    }
    if (w === 0 || h === 0) {
      continue;
    }

    expandBounds(x, y);
    expandBounds(x + w, y + h);
  }

  // Parse <line> elements
  const lineMatches = svgText.matchAll(
    /<line[^>]*?\bx1="([^"]*)"[^>]*?\by1="([^"]*)"[^>]*?\bx2="([^"]*)"[^>]*?\by2="([^"]*)"/gi,
  );
  for (const match of lineMatches) {
    expandBounds(parseFloat(match[1]) || 0, parseFloat(match[2]) || 0);
    expandBounds(parseFloat(match[3]) || 0, parseFloat(match[4]) || 0);
  }

  // Parse <polygon> and <polyline> elements
  const polyMatches = svgText.matchAll(
    /<poly(?:gon|line)[^>]*?\bpoints="([^"]*)"/gi,
  );
  for (const match of polyMatches) {
    const points = match[1].trim().split(/[\s,]+/);
    for (let i = 0; i < points.length - 1; i += 2) {
      expandBounds(parseFloat(points[i]), parseFloat(points[i + 1]));
    }
  }

  // Parse <path> elements - extract M, L, H, V coordinates
  const pathMatches = svgText.matchAll(/<path[^>]*?\bd="([^"]*)"/gi);
  for (const match of pathMatches) {
    const pathData = match[1];
    let currentX = 0;
    let currentY = 0;

    const cmdRegex = /([MLHVCSQTAZ])\s*([-\d.,\s]*)/gi;
    let cmdMatch;
    while ((cmdMatch = cmdRegex.exec(pathData)) !== null) {
      const cmd = cmdMatch[1].toUpperCase();
      const nums = (cmdMatch[2].match(/[-+]?[\d.]+/g) || []).map(Number);

      switch (cmd) {
        case "M":
        case "L":
          for (let i = 0; i < nums.length - 1; i += 2) {
            currentX = nums[i];
            currentY = nums[i + 1];
            expandBounds(currentX, currentY);
          }
          break;
        case "H":
          for (const x of nums) {
            currentX = x;
            expandBounds(currentX, currentY);
          }
          break;
        case "V":
          for (const y of nums) {
            currentY = y;
            expandBounds(currentX, currentY);
          }
          break;
        case "C": // Cubic bezier
          for (let i = 0; i < nums.length - 5; i += 6) {
            expandBounds(nums[i], nums[i + 1]); // Control point 1
            expandBounds(nums[i + 2], nums[i + 3]); // Control point 2
            currentX = nums[i + 4];
            currentY = nums[i + 5];
            expandBounds(currentX, currentY); // End point
          }
          break;
        case "Q": // Quadratic bezier
          for (let i = 0; i < nums.length - 3; i += 4) {
            expandBounds(nums[i], nums[i + 1]); // Control point
            currentX = nums[i + 2];
            currentY = nums[i + 3];
            expandBounds(currentX, currentY); // End point
          }
          break;
      }
    }
  }

  // Parse <circle> elements
  const circleMatches = svgText.matchAll(
    /<circle[^>]*?\bcx="([^"]*)"[^>]*?\bcy="([^"]*)"[^>]*?\br="([^"]*)"/gi,
  );
  for (const match of circleMatches) {
    const cx = parseFloat(match[1]) || 0;
    const cy = parseFloat(match[2]) || 0;
    const r = parseFloat(match[3]) || 0;
    expandBounds(cx - r, cy - r);
    expandBounds(cx + r, cy + r);
  }

  // Parse <text> elements (approximate bounds)
  const textMatches = svgText.matchAll(
    /<text[^>]*?\bx="([^"]*)"[^>]*?\by="([^"]*)"/gi,
  );
  for (const match of textMatches) {
    expandBounds(parseFloat(match[1]) || 0, parseFloat(match[2]) || 0);
  }

  // Validate bounds
  if (!isFinite(bounds.minX) || !isFinite(bounds.maxX)) {
    return null;
  }

  return {
    minX: bounds.minX,
    minY: bounds.minY,
    maxX: bounds.maxX,
    maxY: bounds.maxY,
    width: bounds.maxX - bounds.minX,
    height: bounds.maxY - bounds.minY,
  };
}

function parseSvgViewBox(svgText) {
  if (!svgText) {
    return null;
  }

  const viewBoxMatch = svgText.match(/viewBox\s*=\s*["']([^"']+)["']/i);
  if (viewBoxMatch) {
    const parts = viewBoxMatch[1]
      .trim()
      .split(/\s+/)
      .map((p) => Number.parseFloat(p));
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
      return {
        minX: parts[0],
        minY: parts[1],
        width: parts[2],
        height: parts[3],
        hasViewBox: true,
      };
    }
  }

  const widthMatch = svgText.match(/\bwidth\s*=\s*["']([^"']+)["']/i);
  const heightMatch = svgText.match(/\bheight\s*=\s*["']([^"']+)["']/i);
  const w = widthMatch ? Number.parseFloat(widthMatch[1]) : NaN;
  const h = heightMatch ? Number.parseFloat(heightMatch[1]) : NaN;
  if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
    return { minX: 0, minY: 0, width: w, height: h, hasViewBox: false };
  }

  return null;
}

function rewriteSvgViewBox(svgText, viewBoxValue) {
  if (!svgText || !viewBoxValue) {
    return svgText;
  }

  if (/viewBox\s*=\s*["'][^"']*["']/i.test(svgText)) {
    return svgText.replace(
      /viewBox\s*=\s*["'][^"']*["']/i,
      `viewBox="${viewBoxValue}"`,
    );
  }

  return svgText.replace(/<svg\b/i, `<svg viewBox="${viewBoxValue}"`);
}

function computeForegroundBBoxFromRaw(
  data,
  width,
  height,
  channels,
  options = {},
) {
  const alphaThreshold = Number.isFinite(options.alphaThreshold)
    ? options.alphaThreshold
    : 8;
  const diffThreshold = Number.isFinite(options.diffThreshold)
    ? options.diffThreshold
    : 24;

  const samplePoints = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
    [Math.floor(width / 2), 0],
    [Math.floor(width / 2), height - 1],
    [0, Math.floor(height / 2)],
    [width - 1, Math.floor(height / 2)],
  ].filter(([x, y]) => x >= 0 && y >= 0 && x < width && y < height);

  const bgSamples = [];
  for (const [x, y] of samplePoints) {
    const idx = (y * width + x) * channels;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const a = channels >= 4 ? data[idx + 3] : 255;
    if (a > alphaThreshold) {
      bgSamples.push([r, g, b]);
    }
  }

  const bg = bgSamples.length
    ? bgSamples.reduce(
        (acc, [r, g, b]) => ({ r: acc.r + r, g: acc.g + g, b: acc.b + b }),
        {
          r: 0,
          g: 0,
          b: 0,
        },
      )
    : { r: 255, g: 255, b: 255 };

  const bgR = bgSamples.length ? bg.r / bgSamples.length : 255;
  const bgG = bgSamples.length ? bg.g / bgSamples.length : 255;
  const bgB = bgSamples.length ? bg.b / bgSamples.length : 255;

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * channels;
      const a = channels >= 4 ? data[idx + 3] : 255;
      if (a <= alphaThreshold) {
        continue;
      }

      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const diff = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB);
      if (diff <= diffThreshold) {
        continue;
      }

      if (x < minX) {
        minX = x;
      }
      if (y < minY) {
        minY = y;
      }
      if (x > maxX) {
        maxX = x;
      }
      if (y > maxY) {
        maxY = y;
      }
    }
  }

  if (maxX < 0 || maxY < 0) {
    return null;
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    bg: { r: bgR, g: bgG, b: bgB },
  };
}

/**
 * TASK 1: Enhanced SVG viewBox rewriter
 * Now uses geometry-based bounds calculation as PRIMARY method,
 * with pixel-based fallback for edge cases.
 */
async function rewriteSvgViewBoxToContent({
  sharp,
  svgBuffer,
  analysisDensity = 144,
  analysisMaxSize = 512,
  diffThreshold = 16, // REDUCED from 24 for better line detection
  padRatio = 0.025, // INCREASED from 0.012 for better padding
  useGeometryFirst = true, // TASK 1: Prefer geometry-based bounds
}) {
  const svgText = Buffer.isBuffer(svgBuffer)
    ? svgBuffer.toString("utf8")
    : String(svgBuffer || "");
  if (!svgText || !svgText.includes("<svg")) {
    return { buffer: svgBuffer, changed: false };
  }

  const parsed = parseSvgViewBox(svgText);
  if (
    !parsed ||
    !Number.isFinite(parsed.width) ||
    !Number.isFinite(parsed.height)
  ) {
    return { buffer: svgBuffer, changed: false };
  }

  // TASK 1: Try geometry-based bounds first (more accurate for technical drawings)
  if (useGeometryFirst) {
    const geoBounds = computeSvgGeometryBounds(svgText);
    if (geoBounds && geoBounds.width > 10 && geoBounds.height > 10) {
      // Check if content is significantly smaller than viewBox (needs cropping)
      const widthRatio = geoBounds.width / parsed.width;
      const heightRatio = geoBounds.height / parsed.height;

      // Only rewrite if content uses less than 90% of viewBox
      if (widthRatio < 0.9 || heightRatio < 0.9) {
        const padX = Math.max(0, geoBounds.width * padRatio);
        const padY = Math.max(0, geoBounds.height * padRatio);

        const newMinX = Math.max(parsed.minX, geoBounds.minX - padX);
        const newMinY = Math.max(parsed.minY, geoBounds.minY - padY);
        const newMaxX = Math.min(
          parsed.minX + parsed.width,
          geoBounds.maxX + padX,
        );
        const newMaxY = Math.min(
          parsed.minY + parsed.height,
          geoBounds.maxY + padY,
        );

        const finalW = Math.max(1, newMaxX - newMinX);
        const finalH = Math.max(1, newMaxY - newMinY);
        const viewBoxValue = `${newMinX.toFixed(3)} ${newMinY.toFixed(3)} ${finalW.toFixed(3)} ${finalH.toFixed(3)}`;

        const rewritten = rewriteSvgViewBox(svgText, viewBoxValue);
        if (rewritten && rewritten !== svgText) {
          return {
            buffer: Buffer.from(rewritten),
            changed: true,
            viewBox: viewBoxValue,
            method: "geometry", // Indicate method used
          };
        }
      }
    }
  }

  // Fallback to pixel-based analysis
  const raster = await sharp(svgBuffer, { density: analysisDensity })
    .png()
    .toBuffer({ resolveWithObject: true });

  const rasterW = raster.info.width || 0;
  const rasterH = raster.info.height || 0;
  if (!rasterW || !rasterH) {
    return { buffer: svgBuffer, changed: false };
  }

  const analysis = await sharp(raster.data)
    .resize(analysisMaxSize, analysisMaxSize, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const bbox = computeForegroundBBoxFromRaw(
    analysis.data,
    analysis.info.width,
    analysis.info.height,
    analysis.info.channels,
    { diffThreshold },
  );

  if (!bbox) {
    return { buffer: svgBuffer, changed: false };
  }

  // TASK 1: Lowered threshold from 0.985 to 0.92 to allow more cropping
  const coversAlmostAll =
    bbox.width / analysis.info.width > 0.92 &&
    bbox.height / analysis.info.height > 0.92;
  if (coversAlmostAll) {
    return { buffer: svgBuffer, changed: false };
  }

  const scaleX = rasterW / analysis.info.width;
  const scaleY = rasterH / analysis.info.height;
  const minXpx = Math.floor(bbox.minX * scaleX);
  const minYpx = Math.floor(bbox.minY * scaleY);
  const maxXpx = Math.ceil((bbox.maxX + 1) * scaleX) - 1;
  const maxYpx = Math.ceil((bbox.maxY + 1) * scaleY) - 1;

  const vbMinX = parsed.minX;
  const vbMinY = parsed.minY;
  const vbW = parsed.width;
  const vbH = parsed.height;

  const newMinX = vbMinX + (minXpx / rasterW) * vbW;
  const newMinY = vbMinY + (minYpx / rasterH) * vbH;
  const newW = ((maxXpx - minXpx + 1) / rasterW) * vbW;
  const newH = ((maxYpx - minYpx + 1) / rasterH) * vbH;

  const padX = Math.max(0, newW * padRatio);
  const padY = Math.max(0, newH * padRatio);

  const clampedMinX = Math.max(vbMinX, newMinX - padX);
  const clampedMinY = Math.max(vbMinY, newMinY - padY);
  const maxXvb = vbMinX + vbW;
  const maxYvb = vbMinY + vbH;
  const clampedMaxX = Math.min(maxXvb, newMinX + newW + padX);
  const clampedMaxY = Math.min(maxYvb, newMinY + newH + padY);

  const finalW = Math.max(1e-6, clampedMaxX - clampedMinX);
  const finalH = Math.max(1e-6, clampedMaxY - clampedMinY);
  const viewBoxValue = `${clampedMinX.toFixed(3)} ${clampedMinY.toFixed(3)} ${finalW.toFixed(3)} ${finalH.toFixed(3)}`;

  const rewritten = rewriteSvgViewBox(svgText, viewBoxValue);
  if (!rewritten || rewritten === svgText) {
    return { buffer: svgBuffer, changed: false };
  }

  return {
    buffer: Buffer.from(rewritten),
    changed: true,
    viewBox: viewBoxValue,
  };
}

/**
 * Place panel image into slot with aspect-ratio-preserving resize
 *
 * SHARP OPTIONS USED:
 * - fit: 'contain' - Preserves aspect ratio, letterboxes with padding (NO CROPPING)
 * - position: 'centre' - Centers the image within the slot
 * - background: { r: 255, g: 255, b: 255, alpha: 1 } - White padding for letterbox areas
 *
 * @param {Object} params - Parameters
 * @param {Function} params.sharp - Sharp module
 * @param {Buffer} params.imageBuffer - Input image buffer
 * @param {Object} params.slotRect - Target slot rectangle {x, y, width, height}
 * @param {'contain'|'cover'} params.mode - Fit mode ('cover' for hero/interior, 'contain' for drawings)
 * @param {Object} params.constants - Layout constants
 * @param {string} [params.panelType] - Panel type for debug logging
 * @param {Object} [params.qa] - QA options (occupancy/rotate gates)
 * @returns {Promise<Buffer>} Resized image buffer
 */
async function placePanelImage({
  sharp,
  imageBuffer,
  slotRect,
  mode,
  constants,
  panelType = "unknown",
  qa = null,
}) {
  const { LABEL_HEIGHT, LABEL_PADDING } = constants;
  const targetWidth = slotRect.width;
  const targetHeight = Math.max(
    10,
    slotRect.height - LABEL_HEIGHT - LABEL_PADDING,
  );
  const DEBUG_RUNS =
    process.env.DEBUG_RUNS === "1" || process.env.ARCHIAI_DEBUG === "1";

  const headerSample = Buffer.isBuffer(imageBuffer)
    ? imageBuffer.slice(0, 512).toString("utf8").toLowerCase()
    : "";
  const isSvgInput =
    headerSample.includes("<svg") ||
    (headerSample.includes("<?xml") && headerSample.includes("svg"));
  const svgDensity = qa?.useHighRes ? 300 : 144;
  const sharpForInput = (buf) =>
    isSvgInput
      ? sharp(buf, { density: svgDensity })
      : sharp(buf, { failOnError: false });

  // Get input image dimensions for debug logging
  let inputWidth = 0;
  let inputHeight = 0;
  try {
    const metadata = await sharpForInput(imageBuffer).metadata();
    inputWidth = metadata.width || 0;
    inputHeight = metadata.height || 0;

    if (DEBUG_RUNS) {
      console.log(`[A1 Compose] Panel ${panelType} resize:`, {
        input: { width: inputWidth, height: inputHeight },
        output: { width: targetWidth, height: targetHeight },
        inputAspect:
          inputWidth && inputHeight
            ? (inputWidth / inputHeight).toFixed(3)
            : "N/A",
        outputAspect: (targetWidth / targetHeight).toFixed(3),
        fit: mode === "cover" ? "cover" : "contain",
        willLetterbox:
          inputWidth && inputHeight
            ? Math.abs(inputWidth / inputHeight - targetWidth / targetHeight) >
              0.01
            : false,
      });
    }
  } catch (metaError) {
    if (DEBUG_RUNS) {
      console.warn(
        `[A1 Compose] Could not read metadata for ${panelType}:`,
        metaError.message,
      );
    }
  }

  // AUTO-CROP: Trim white margins before resize (Phase 1 of Meshy+Blender pipeline)
  // MANDATORY CORRECTION B: Use lineArt:true for technical drawings, toBuffer({resolveWithObject:true})
  // This removes excessive whitespace from panels, producing cleaner compositions
  let processedBuffer = imageBuffer;

  // Determine if this is a technical drawing (uses lineArt mode for better edge detection)
  const isTechnicalDrawing = [
    "floor_plan_ground",
    "floor_plan_first",
    "floor_plan_level2",
    "floor_plan_upper",
    "elevation_north",
    "elevation_south",
    "elevation_east",
    "elevation_west",
    "section_AA",
    "section_BB",
    "axonometric",
    "site_plan",
    "site_diagram",
  ].includes(panelType);

  // Panel-specific padding after trim
  const TRIM_PADDING = {
    floor_plan_ground: 12,
    floor_plan_first: 12,
    floor_plan_level2: 12,
    floor_plan_upper: 12,
    elevation_north: 10,
    elevation_south: 10,
    elevation_east: 10,
    elevation_west: 10,
    section_AA: 10,
    section_BB: 10,
    axonometric: 8,
    site_plan: 12,
    site_diagram: 12,
    hero_3d: 4,
    interior_3d: 4,
    material_palette: 6,
    climate_card: 6,
    title_block: 2,
  };
  const padding = TRIM_PADDING[panelType] || 8;

  const shouldTrimToContent = isTechnicalDrawing && mode !== "cover";
  let viewBoxRewrite = null;

  if (shouldTrimToContent) {
    try {
      let bufferForTrim = imageBuffer;

      // SVG viewBox rewrite (best-effort): preserves crispness by re-rasterizing
      // the *cropped* viewBox at print density instead of scaling up a tiny trim.
      if (isSvgInput) {
        const rewritten = await rewriteSvgViewBoxToContent({
          sharp,
          svgBuffer: imageBuffer,
          analysisDensity: qa?.useHighRes ? 144 : 96,
        });
        if (rewritten?.changed && rewritten?.buffer) {
          bufferForTrim = rewritten.buffer;
          viewBoxRewrite = rewritten.viewBox || null;
        }
      }

      // PNG bbox crop (trim-to-content). Flatten ensures transparent margins trim correctly.
      const trimOptions = { threshold: 12, lineArt: true };
      const trimResult = await sharpForInput(bufferForTrim)
        .flatten({ background: "#ffffff" })
        .trim(trimOptions)
        .png()
        .toBuffer({ resolveWithObject: true });

      const trimmedBuffer = trimResult.data;
      const trimmedInfo = trimResult.info;

      if (trimmedInfo.width <= 50 || trimmedInfo.height <= 50) {
        const err = new Error(
          "Trim-to-content produced an invalid (too small) result",
        );
        err.code = "DRAWING_PREFLIGHT_TRIM_INVALID";
        err.details = {
          code: err.code,
          panelType,
          viewBoxRewrite,
          trimmed: { width: trimmedInfo.width, height: trimmedInfo.height },
        };
        throw err;
      }

      if (padding > 0) {
        const paddedResult = await sharp(trimmedBuffer)
          .extend({
            top: padding,
            bottom: padding,
            left: padding,
            right: padding,
            background: "#ffffff",
          })
          .png()
          .toBuffer({ resolveWithObject: true });

        processedBuffer = paddedResult.data;
        inputWidth = paddedResult.info.width;
        inputHeight = paddedResult.info.height;
      } else {
        processedBuffer = trimmedBuffer;
        inputWidth = trimmedInfo.width;
        inputHeight = trimmedInfo.height;
      }

      if (DEBUG_RUNS) {
        console.log(`[A1 Compose] Panel ${panelType} trim-to-content:`, {
          viewBoxRewrite,
          trimmed: { width: trimmedInfo.width, height: trimmedInfo.height },
          padded: { width: inputWidth, height: inputHeight },
          padding,
        });
      }
    } catch (trimError) {
      if (qa?.enabled) {
        const err = new Error(`Trim-to-content failed: ${trimError.message}`);
        err.code = trimError.code || "DRAWING_PREFLIGHT_TRIM_FAILED";
        err.details = {
          code: err.code,
          panelType,
          viewBoxRewrite,
          originalError: trimError.message,
          ...(trimError.details || {}),
        };
        throw err;
      }

      if (DEBUG_RUNS) {
        console.warn(
          `[A1 Compose] Trim-to-content skipped for ${panelType}:`,
          trimError.message,
        );
      }
    }
  }

  const computeContainOccupancy = (imgW, imgH) => {
    if (
      !Number.isFinite(imgW) ||
      !Number.isFinite(imgH) ||
      imgW <= 0 ||
      imgH <= 0
    ) {
      return 0;
    }
    const scale = Math.min(targetWidth / imgW, targetHeight / imgH);
    const drawnW = imgW * scale;
    const drawnH = imgH * scale;
    const occ = (drawnW * drawnH) / (targetWidth * targetHeight);
    return Math.max(0, Math.min(1, occ));
  };

  // Optional auto-rotate to maximize slot usage (QA-driven)
  let rotated = false;
  const canAutoRotate =
    panelType.startsWith("floor_plan_") ||
    panelType.startsWith("elevation_") ||
    panelType.startsWith("section_");
  if (qa?.enabled && qa?.rotateToFit && mode !== "cover" && canAutoRotate) {
    const occ0 = computeContainOccupancy(inputWidth, inputHeight);
    const occ90 = computeContainOccupancy(inputHeight, inputWidth);
    if (occ90 > occ0 + 0.08) {
      const rotatedResult = await sharp(processedBuffer)
        .rotate(90)
        .png()
        .toBuffer({ resolveWithObject: true });
      processedBuffer = rotatedResult.data;
      inputWidth = rotatedResult.info.width;
      inputHeight = rotatedResult.info.height;
      rotated = true;
      if (DEBUG_RUNS) {
        console.log(
          `[A1 Compose] Panel ${panelType} auto-rotated for occupancy`,
          {
            occ0: occ0.toFixed(3),
            occ90: occ90.toFixed(3),
          },
        );
      }
    }
  }

  // HARD QA GATE: Occupancy (fail closed on undersized drawings)
  const minSlotOccupancy = Number.isFinite(qa?.minSlotOccupancy)
    ? qa.minSlotOccupancy
    : 0.4; // Lowered from 0.55 – AI-generated panels rarely match slot aspect exactly
  const shouldEnforceOccupancy =
    qa?.enabled &&
    mode !== "cover" &&
    (panelType.startsWith("floor_plan_") ||
      panelType.startsWith("elevation_") ||
      panelType.startsWith("section_"));
  const slotOccupancy =
    mode === "cover" ? 1 : computeContainOccupancy(inputWidth, inputHeight);
  if (shouldEnforceOccupancy && slotOccupancy < minSlotOccupancy) {
    const err = new Error(
      `Low slot occupancy ${(slotOccupancy * 100).toFixed(1)}% (min ${(minSlotOccupancy * 100).toFixed(1)}%)`,
    );
    err.code = "DRAWING_SLOT_OCCUPANCY_LOW";
    err.details = {
      code: err.code,
      panelType,
      slotOccupancy,
      minSlotOccupancy,
      rotated,
      viewBoxRewrite,
      input: { width: inputWidth, height: inputHeight, isSvgInput, svgDensity },
      target: { width: targetWidth, height: targetHeight },
      qa: { layoutTemplate: qa?.layoutTemplate || null },
    };
    throw err;
  }

  // Create white canvas for the slot
  const canvas = sharp({
    create: {
      width: targetWidth,
      height: targetHeight,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  });

  let resizedImage;

  if (mode === "cover") {
    // Safe crop for photos: deterministic aspect crop + slight top bias for hero exterior.
    const yAlign = panelType === "hero_3d" ? 0.35 : 0.5;
    const cropRect = computeSafeCoverCropRect(
      inputWidth,
      inputHeight,
      targetWidth,
      targetHeight,
      {
        xAlign: 0.5,
        yAlign,
      },
    );

    const pipeline = sharp(processedBuffer, { failOnError: false });
    resizedImage = cropRect
      ? await pipeline
          .extract(cropRect)
          .resize(targetWidth, targetHeight, { fit: "fill" })
          .png()
          .toBuffer()
      : await pipeline
          .resize(targetWidth, targetHeight, {
            fit: "cover",
            position: "centre",
          })
          .png()
          .toBuffer();
  } else {
    // Contain mode: letterbox inside slot with white margins.
    // Panels are generated at slot aspect ratio, so contain should fill
    // with minimal or no letterboxing. No scale-to-fill center-crop needed.
    resizedImage = await sharp(processedBuffer, { failOnError: false })
      .resize(targetWidth, targetHeight, {
        fit: "contain",
        position: "centre",
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      })
      .png()
      .toBuffer();
  }

  const finalBuffer = await canvas
    .composite([{ input: resizedImage, left: 0, top: 0 }])
    .png()
    .toBuffer();

  // HARD QA GATE: Render sanity for drawings (detect thin strips / near-empty content).
  if (shouldEnforceOccupancy && qa?.enabled) {
    const sanityModule = await getRenderSanityValidator();
    if (typeof sanityModule?.validateRenderSanity === "function") {
      const sanity = await sanityModule.validateRenderSanity(
        finalBuffer,
        panelType,
        { originalWidth: inputWidth, originalHeight: inputHeight },
      );
      if (sanity && sanity.isValid === false) {
        const err = new Error(
          sanity.blockerMessage || `Render sanity failed for ${panelType}`,
        );
        err.code = "DRAWING_RENDER_SANITY_FAILED";
        err.details = {
          code: err.code,
          panelType,
          rotated,
          viewBoxRewrite,
          slotOccupancy,
          minSlotOccupancy,
          sanity,
        };
        throw err;
      }
    }
  }

  return finalBuffer;
}

async function buildPlaceholder(sharp, width, height, type, constants) {
  const { FRAME_STROKE_COLOR, FRAME_RADIUS } = constants;
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${width}" height="${height}" fill="#f5f5f5" stroke="${FRAME_STROKE_COLOR}" stroke-width="2" rx="${FRAME_RADIUS}" ry="${FRAME_RADIUS}" />
      <text x="${width / 2}" y="${height / 2 - 4}" font-size="18" font-family="Arial, sans-serif" font-weight="700"
        text-anchor="middle" fill="#9ca3af">PANEL MISSING – REGENERATE</text>
      <text x="${width / 2}" y="${height / 2 + 18}" font-size="14" font-family="Arial, sans-serif"
        text-anchor="middle" fill="#b91c1c">${(type || "").toUpperCase()}</text>
    </svg>
  `;
  return sharp(Buffer.from(svg))
    .png()
    .resize(width, height, {
      fit: "contain",
      background: { r: 245, g: 245, b: 245 },
    })
    .toBuffer();
}

async function buildTitleBlockBuffer(
  sharp,
  width,
  height,
  titleBlockInput = {},
  constants,
) {
  const { FRAME_STROKE_COLOR, FRAME_RADIUS, buildTitleBlockData } = constants;

  // Merge input with comprehensive RIBA template
  const tb = buildTitleBlockData(titleBlockInput || {});
  const esc = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  const leftMargin = 12;
  const rightMargin = width - 12;

  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <!-- Background -->
      <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff" stroke="${FRAME_STROKE_COLOR}" stroke-width="2" rx="${FRAME_RADIUS}" ry="${FRAME_RADIUS}" />

      <!-- Practice Logo Area -->
      <rect x="8" y="8" width="${width - 16}" height="40" fill="#f1f5f9" rx="2" />
      <text x="${width / 2}" y="34" font-family="Arial, sans-serif" font-size="14" font-weight="700" fill="#0f172a"
        text-anchor="middle">${esc(tb.practiceName)}</text>

      <!-- Project Information Section -->
      <line x1="8" y1="56" x2="${width - 8}" y2="56" stroke="#e2e8f0" stroke-width="1" />
      <text x="${leftMargin}" y="74" font-family="Arial, sans-serif" font-size="8" fill="#64748b">PROJECT</text>
      <text x="${leftMargin}" y="90" font-family="Arial, sans-serif" font-size="12" font-weight="700" fill="#0f172a">${esc(tb.projectName)}</text>
      <text x="${leftMargin}" y="106" font-family="Arial, sans-serif" font-size="9" fill="#475569">${esc(tb.projectNumber)}</text>

      <!-- Site Address -->
      <line x1="8" y1="114" x2="${width - 8}" y2="114" stroke="#e2e8f0" stroke-width="1" />
      <text x="${leftMargin}" y="130" font-family="Arial, sans-serif" font-size="8" fill="#64748b">SITE ADDRESS</text>
      <text x="${leftMargin}" y="146" font-family="Arial, sans-serif" font-size="9" fill="#1f2937">${esc(tb.siteAddress || "TBD")}</text>

      <!-- Drawing Information -->
      <line x1="8" y1="158" x2="${width - 8}" y2="158" stroke="#e2e8f0" stroke-width="1" />
      <text x="${leftMargin}" y="174" font-family="Arial, sans-serif" font-size="8" fill="#64748b">DRAWING TITLE</text>
      <text x="${leftMargin}" y="190" font-family="Arial, sans-serif" font-size="11" font-weight="600" fill="#0f172a">${esc(tb.drawingTitle)}</text>

      <!-- Sheet / Revision Row -->
      <rect x="8" y="200" width="${(width - 24) / 2}" height="32" fill="#f8fafc" rx="2" />
      <text x="${leftMargin + 4}" y="214" font-family="Arial, sans-serif" font-size="7" fill="#64748b">SHEET NO.</text>
      <text x="${leftMargin + 4}" y="226" font-family="Arial, sans-serif" font-size="10" font-weight="600" fill="#0f172a">${esc(tb.sheetNumber)}</text>        

      <rect x="${width / 2 + 4}" y="200" width="${(width - 24) / 2}" height="32" fill="#f8fafc" rx="2" />
      <text x="${width / 2 + 8}" y="214" font-family="Arial, sans-serif" font-size="7" fill="#64748b">REVISION</text>
      <text x="${width / 2 + 8}" y="226" font-family="Arial, sans-serif" font-size="10" font-weight="600" fill="#0f172a">${esc(tb.revision)}</text>

      <!-- Scale / Date Row -->
      <rect x="8" y="236" width="${(width - 24) / 2}" height="32" fill="#f8fafc" rx="2" />
      <text x="${leftMargin + 4}" y="250" font-family="Arial, sans-serif" font-size="7" fill="#64748b">SCALE</text>
      <text x="${leftMargin + 4}" y="262" font-family="Arial, sans-serif" font-size="10" font-weight="600" fill="#0f172a">${esc(tb.scale)}</text>

      <rect x="${width / 2 + 4}" y="236" width="${(width - 24) / 2}" height="32" fill="#f8fafc" rx="2" />
      <text x="${width / 2 + 8}" y="250" font-family="Arial, sans-serif" font-size="7" fill="#64748b">DATE</text>
      <text x="${width / 2 + 8}" y="262" font-family="Arial, sans-serif" font-size="10" font-weight="600" fill="#0f172a">${esc(tb.date || "—")}</text>

      <!-- RIBA Stage / Status -->
      <line x1="8" y1="276" x2="${width - 8}" y2="276" stroke="#e2e8f0" stroke-width="1" />
      <text x="${leftMargin}" y="292" font-family="Arial, sans-serif" font-size="8" fill="#64748b">RIBA STAGE</text>
      <text x="${rightMargin}" y="292" font-family="Arial, sans-serif" font-size="9" font-weight="500" fill="#0f172a"
        text-anchor="end">${esc(tb.ribaStage)}</text>
      <text x="${leftMargin}" y="306" font-family="Arial, sans-serif" font-size="8" fill="#64748b">STATUS</text>
      <text x="${rightMargin}" y="306" font-family="Arial, sans-serif" font-size="9" font-weight="500" fill="#0891b2"
        text-anchor="end">${esc(tb.status)}</text>

      <!-- AI Generation Metadata -->
      ${
        tb.designId
          ? `
      <line x1="8" y1="${height - 44}" x2="${width - 8}" y2="${height - 44}" stroke="#e2e8f0" stroke-width="1" />
      <text x="${leftMargin}" y="${height - 28}" font-family="Arial, sans-serif" font-size="7" fill="#94a3b8">DESIGN ID: ${esc(tb.designId)}</text>
      <text x="${leftMargin}" y="${height - 16}" font-family="Arial, sans-serif" font-size="7" fill="#94a3b8">SEED: ${esc(tb.seedValue || "N/A")}</text>       
      `
          : ""
      }

      <!-- Copyright -->
      <text x="${width / 2}" y="${height - 6}" font-family="Arial, sans-serif" font-size="6" fill="#94a3b8"
        text-anchor="middle">${esc(tb.copyrightNote)}</text>
    </svg>
  `;

  return sharp(Buffer.from(svg))
    .png()
    .resize(width, height, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255 },
    })
    .toBuffer();
}

/**
 * Build deterministic SVG for Schedules & Notes panel
 * Renders room schedule table + materials schedule from DNA data.
 * Follows the same pattern as buildTitleBlockBuffer.
 */
async function buildSchedulesBuffer(
  sharp,
  width,
  height,
  masterDNA,
  projectContext,
  constants,
) {
  const { FRAME_STROKE_COLOR, FRAME_RADIUS } = constants || {};
  const esc = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const rooms =
    masterDNA?.rooms ||
    masterDNA?.program?.rooms ||
    projectContext?.programSpaces ||
    [];
  const materials = masterDNA?.materials || [];
  const leftMargin = 12;
  const colArea = Math.round(width * 0.55);
  const colFloor = Math.round(width * 0.8);
  const rowHeight = 18;
  const headerY = 40;

  // Room schedule rows
  let roomRows = "";
  const displayRooms = (Array.isArray(rooms) ? rooms : []).slice(0, 12);
  displayRooms.forEach((room, idx) => {
    const y = headerY + 20 + idx * rowHeight;
    const name =
      typeof room === "string"
        ? room
        : room.name || room.type || `Room ${idx + 1}`;
    const area = room.dimensions || room.area || "";
    const floor =
      room.floor != null ? (room.floor === 0 ? "GF" : `L${room.floor}`) : "";
    roomRows += `
      <text x="${leftMargin}" y="${y}" font-family="Arial, sans-serif" font-size="9" fill="#1f2937">${idx + 1}.</text>
      <text x="${leftMargin + 20}" y="${y}" font-family="Arial, sans-serif" font-size="9" fill="#1f2937">${esc(name)}</text>
      <text x="${colArea}" y="${y}" font-family="Arial, sans-serif" font-size="9" fill="#475569">${esc(String(area))}</text>
      <text x="${colFloor}" y="${y}" font-family="Arial, sans-serif" font-size="9" fill="#475569">${esc(floor)}</text>`;
  });

  const roomsEndY = headerY + 20 + displayRooms.length * rowHeight + 10;

  // Materials schedule
  let matRows = "";
  const displayMats = (Array.isArray(materials) ? materials : []).slice(0, 6);
  displayMats.forEach((mat, idx) => {
    const y = roomsEndY + 36 + idx * rowHeight;
    const name =
      typeof mat === "string"
        ? mat
        : mat.name || mat.type || `Material ${idx + 1}`;
    const application = mat.application || "";
    matRows += `
      <text x="${leftMargin}" y="${y}" font-family="Arial, sans-serif" font-size="9" fill="#1f2937">${idx + 1}. ${esc(name)}</text>
      <text x="${colArea}" y="${y}" font-family="Arial, sans-serif" font-size="9" fill="#475569">${esc(application)}</text>`;
  });

  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff" stroke="${FRAME_STROKE_COLOR || "#cbd5e1"}" stroke-width="2" rx="${FRAME_RADIUS || 4}" ry="${FRAME_RADIUS || 4}" />

      <!-- Room Schedule Header -->
      <rect x="8" y="8" width="${width - 16}" height="24" fill="#f1f5f9" rx="2" />
      <text x="${width / 2}" y="24" font-family="Arial, sans-serif" font-size="11" font-weight="700" fill="#0f172a" text-anchor="middle">ROOM SCHEDULE</text>

      <!-- Column Headers -->
      <text x="${leftMargin}" y="${headerY}" font-family="Arial, sans-serif" font-size="8" font-weight="700" fill="#64748b">NO.</text>
      <text x="${leftMargin + 20}" y="${headerY}" font-family="Arial, sans-serif" font-size="8" font-weight="700" fill="#64748b">ROOM</text>
      <text x="${colArea}" y="${headerY}" font-family="Arial, sans-serif" font-size="8" font-weight="700" fill="#64748b">AREA</text>
      <text x="${colFloor}" y="${headerY}" font-family="Arial, sans-serif" font-size="8" font-weight="700" fill="#64748b">FLOOR</text>
      <line x1="8" y1="${headerY + 4}" x2="${width - 8}" y2="${headerY + 4}" stroke="#e2e8f0" stroke-width="1" />

      ${roomRows}

      <!-- Materials Schedule Header -->
      <line x1="8" y1="${roomsEndY}" x2="${width - 8}" y2="${roomsEndY}" stroke="#e2e8f0" stroke-width="1" />
      <rect x="8" y="${roomsEndY + 4}" width="${width - 16}" height="24" fill="#f1f5f9" rx="2" />
      <text x="${width / 2}" y="${roomsEndY + 20}" font-family="Arial, sans-serif" font-size="11" font-weight="700" fill="#0f172a" text-anchor="middle">MATERIALS SCHEDULE</text>

      ${matRows}
    </svg>
  `;

  return sharp(Buffer.from(svg))
    .png()
    .resize(width, height, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255 },
    })
    .toBuffer();
}

/**
 * Build deterministic SVG for Material Palette panel
 * Renders colored material swatches with hex codes and application labels.
 */
async function buildMaterialPaletteBuffer(
  sharp,
  width,
  height,
  masterDNA,
  constants,
) {
  const { FRAME_STROKE_COLOR, FRAME_RADIUS } = constants || {};
  const esc = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const materials = masterDNA?.materials || [];
  const displayMats = (Array.isArray(materials) ? materials : []).slice(0, 8);

  // Grid layout: 2 columns
  const cols = 2;
  const margin = 12;
  const headerH = 36;
  const swatchW = Math.floor((width - margin * 3) / cols);
  const swatchH = 40;
  const gap = 8;

  let swatches = "";
  displayMats.forEach((mat, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const x = margin + col * (swatchW + margin);
    const y = headerH + 12 + row * (swatchH + gap + 20);

    const name =
      typeof mat === "string"
        ? mat
        : mat.name || mat.type || `Material ${idx + 1}`;
    const hexColor = mat.hexColor || "#cccccc";
    const application = mat.application || "";

    swatches += `
      <rect x="${x}" y="${y}" width="${swatchW}" height="${swatchH}" fill="${esc(hexColor)}" stroke="#e2e8f0" stroke-width="1" rx="3" />
      <text x="${x}" y="${y + swatchH + 12}" font-family="Arial, sans-serif" font-size="9" font-weight="600" fill="#1f2937">${esc(name)}</text>
      <text x="${x}" y="${y + swatchH + 24}" font-family="Arial, sans-serif" font-size="8" fill="#64748b">${esc(hexColor)} — ${esc(application)}</text>`;
  });

  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff" stroke="${FRAME_STROKE_COLOR || "#cbd5e1"}" stroke-width="2" rx="${FRAME_RADIUS || 4}" ry="${FRAME_RADIUS || 4}" />

      <!-- Header -->
      <rect x="8" y="8" width="${width - 16}" height="24" fill="#f1f5f9" rx="2" />
      <text x="${width / 2}" y="24" font-family="Arial, sans-serif" font-size="11" font-weight="700" fill="#0f172a" text-anchor="middle">MATERIAL PALETTE</text>

      ${swatches}
    </svg>
  `;

  return sharp(Buffer.from(svg))
    .png()
    .resize(width, height, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255 },
    })
    .toBuffer();
}

/**
 * Build deterministic SVG for Climate Card panel
 * Renders climate summary text: location, climate type, temperatures, orientation.
 */
async function buildClimateCardBuffer(
  sharp,
  width,
  height,
  locationData,
  constants,
) {
  const { FRAME_STROKE_COLOR, FRAME_RADIUS } = constants || {};
  const esc = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const climate = locationData?.climate || {};
  const sunPath = locationData?.sunPath || {};
  const address = locationData?.address || "Location TBD";
  const climateType = climate.type || climate.zone || "Temperate";
  const seasonal = climate.seasonal || {};
  const orientation = sunPath.optimalOrientation || "South-facing";

  const leftMargin = 12;
  const lineH = 20;
  let y = 46;

  const rows = [
    { label: "LOCATION", value: address },
    { label: "CLIMATE TYPE", value: climateType },
    { label: "OPTIMAL ORIENTATION", value: orientation },
  ];

  // Add seasonal data if available
  if (seasonal.summer) {
    rows.push({
      label: "SUMMER",
      value:
        typeof seasonal.summer === "string"
          ? seasonal.summer
          : `${seasonal.summer.tempHigh || seasonal.summer.avgTemp || "—"}°C`,
    });
  }
  if (seasonal.winter) {
    rows.push({
      label: "WINTER",
      value:
        typeof seasonal.winter === "string"
          ? seasonal.winter
          : `${seasonal.winter.tempLow || seasonal.winter.avgTemp || "—"}°C`,
    });
  }
  if (sunPath.summer) {
    rows.push({ label: "SUMMER SUN PATH", value: sunPath.summer });
  }
  if (sunPath.winter) {
    rows.push({ label: "WINTER SUN PATH", value: sunPath.winter });
  }

  let dataRows = "";
  rows.forEach((row) => {
    dataRows += `
      <text x="${leftMargin}" y="${y}" font-family="Arial, sans-serif" font-size="8" font-weight="700" fill="#64748b">${esc(row.label)}</text>
      <text x="${leftMargin}" y="${y + 13}" font-family="Arial, sans-serif" font-size="10" fill="#1f2937">${esc(String(row.value).substring(0, 60))}</text>
      <line x1="8" y1="${y + 18}" x2="${width - 8}" y2="${y + 18}" stroke="#f1f5f9" stroke-width="1" />`;
    y += lineH + 16;
  });

  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff" stroke="${FRAME_STROKE_COLOR || "#cbd5e1"}" stroke-width="2" rx="${FRAME_RADIUS || 4}" ry="${FRAME_RADIUS || 4}" />

      <!-- Header -->
      <rect x="8" y="8" width="${width - 16}" height="24" fill="#f1f5f9" rx="2" />
      <text x="${width / 2}" y="24" font-family="Arial, sans-serif" font-size="11" font-weight="700" fill="#0f172a" text-anchor="middle">CLIMATE &amp; ENVIRONMENT</text>

      ${dataRows}
    </svg>
  `;

  return sharp(Buffer.from(svg))
    .png()
    .resize(width, height, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255 },
    })
    .toBuffer();
}
