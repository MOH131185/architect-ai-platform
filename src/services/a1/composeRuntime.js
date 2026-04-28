import path from "path";

import { PDFDocument } from "pdf-lib";

import { A1_WIDTH, A1_HEIGHT } from "./composeCore.js";

// Phase A close-out: final A1 PDFs must embed a 300 DPI raster of the A1
// sheet (~9933 x 7016 px). Anything below 95% of that is preview density and
// must not be tagged or surfaced as a final A1 export.
const FINAL_A1_PDF_DPI = 300;
const PREVIEW_A1_PDF_DPI = 144;
const FINAL_A1_PDF_MIN_DPI = 280;
const FINAL_A1_PDF_MIN_RATIO = 0.95;

let opusSheetCritic = null;
let qaGates = null;
let panelRegistry = null;
let layoutConstants = null;
let crossViewImageValidator = null;
let renderSanityValidator = null;
let didLogRuntime = false;

export async function getOpusSheetCritic() {
  if (opusSheetCritic) return opusSheetCritic;
  try {
    const module = await import("../qa/OpusSheetCritic.js");
    opusSheetCritic = module.OpusSheetCritic || module.default;
    return opusSheetCritic;
  } catch (error) {
    console.warn("[A1 Compose] OpusSheetCritic not available:", error.message);
    return null;
  }
}

export async function getQAGates() {
  if (qaGates) return qaGates;
  try {
    qaGates = await import("../qa/QAGates.js");
    return qaGates;
  } catch (error) {
    console.warn("[A1 Compose] QAGates not available:", error.message);
    return null;
  }
}

function normalizeHashValue(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function readRequestHashes(body = {}) {
  const metadata = body?.metadata || body?.meta || {};
  return {
    dnaHash: normalizeHashValue(
      body?.dnaHash || body?.dna_hash || metadata.dnaHash || metadata.dna_hash,
    ),
    geometryHash: normalizeHashValue(
      body?.geometryHash ||
        body?.geometry_hash ||
        metadata.geometryHash ||
        metadata.geometry_hash,
    ),
    programHash: normalizeHashValue(
      body?.programHash ||
        body?.program_hash ||
        metadata.programHash ||
        metadata.program_hash,
    ),
  };
}

export function collectPanelGeometryHashes(panels = []) {
  const hashes = [];
  for (const panel of panels) {
    const panelHash = normalizeHashValue(
      panel?.geometryHash ||
        panel?.geometry_hash ||
        panel?.meta?.geometryHash ||
        panel?.meta?.geometry_hash,
    );
    if (panelHash) hashes.push(panelHash);
  }
  return [...new Set(hashes)];
}

export function isTechnicalComposePanel(panelType) {
  if (typeof panelType !== "string" || panelType.length === 0) {
    return false;
  }

  return (
    panelType.startsWith("floor_plan_") ||
    panelType.startsWith("elevation_") ||
    panelType.startsWith("section_")
  );
}

export function isDeterministicComposeDrawingPanel(panelType) {
  return (
    isTechnicalComposePanel(panelType) ||
    panelType === "site_diagram" ||
    panelType === "site_plan"
  );
}

export function collectTechnicalPanelGeometryHashes(panels = []) {
  return collectPanelGeometryHashes(
    panels.filter((panel) => isTechnicalComposePanel(panel?.type)),
  );
}

export function findTechnicalPanelsMissingGeometryHash(panels = []) {
  return panels
    .filter((panel) => isTechnicalComposePanel(panel?.type))
    .filter((panel) => {
      const panelHash = normalizeHashValue(
        panel?.geometryHash ||
          panel?.geometry_hash ||
          panel?.meta?.geometryHash ||
          panel?.meta?.geometry_hash,
      );
      return !panelHash;
    })
    .map((panel) => panel.type);
}

function normalizeAuthorityValue(value) {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function readPanelAuthorityMetadata(panel = {}) {
  const meta = panel?.meta || {};
  const authorityUsed = normalizeAuthorityValue(
    panel?.authorityUsed || meta?.authorityUsed || meta?.authority || null,
  );
  const authoritySource = normalizeAuthorityValue(
    panel?.authoritySource ||
      meta?.authoritySource ||
      (authorityUsed?.startsWith("compiled_project")
        ? "compiled_project"
        : null),
  );

  return {
    authorityUsed,
    authoritySource,
    panelAuthorityReason: normalizeAuthorityValue(
      panel?.panelAuthorityReason || meta?.panelAuthorityReason || null,
    ),
    generatorUsed: normalizeAuthorityValue(
      panel?.generatorUsed || meta?.generatorUsed || null,
    ),
    sourceType: normalizeAuthorityValue(
      panel?.sourceType || meta?.sourceType || null,
    ),
    compiledProjectSchemaVersion: normalizeAuthorityValue(
      panel?.compiledProjectSchemaVersion ||
        meta?.compiledProjectSchemaVersion ||
        meta?.compiled_project_schema_version ||
        null,
    ),
    geometryHash: normalizeHashValue(
      panel?.geometryHash ||
        panel?.geometry_hash ||
        meta?.geometryHash ||
        meta?.geometry_hash,
    ),
    svgHash: normalizeHashValue(panel?.svgHash || meta?.svgHash),
  };
}

export function findTechnicalPanelsMissingAuthorityMetadata(panels = []) {
  return panels
    .filter((panel) => isDeterministicComposeDrawingPanel(panel?.type))
    .map((panel) => {
      const authority = readPanelAuthorityMetadata(panel);
      const missing = [];

      if (!authority.authorityUsed) {
        missing.push("authorityUsed");
      }
      if (!authority.authoritySource) {
        missing.push("authoritySource");
      }
      if (
        isTechnicalComposePanel(panel?.type) &&
        !authority.compiledProjectSchemaVersion
      ) {
        missing.push("compiledProjectSchemaVersion");
      }

      return missing.length > 0
        ? {
            panelType: panel.type,
            missing,
          }
        : null;
    })
    .filter(Boolean);
}

export function findPanelsWithDisallowedTechnicalAuthority(panels = []) {
  return panels
    .filter((panel) => isDeterministicComposeDrawingPanel(panel?.type))
    .map((panel) => {
      const authority = readPanelAuthorityMetadata(panel);
      const isSiteDrawing =
        panel?.type === "site_diagram" || panel?.type === "site_plan";
      const allowedAuthorityUsed = isSiteDrawing
        ? new Set(["deterministic_svg", "compiled_project_canonical_pack"])
        : new Set(["compiled_project_canonical_pack"]);
      const allowedAuthoritySource = isSiteDrawing
        ? new Set(["compiled_project", "deterministic_svg", "site_evidence"])
        : new Set(["compiled_project"]);

      if (
        authority.authorityUsed &&
        authority.authoritySource &&
        allowedAuthorityUsed.has(authority.authorityUsed) &&
        allowedAuthoritySource.has(authority.authoritySource)
      ) {
        return null;
      }

      return {
        panelType: panel.type,
        authorityUsed: authority.authorityUsed,
        authoritySource: authority.authoritySource,
        generatorUsed: authority.generatorUsed,
        panelAuthorityReason: authority.panelAuthorityReason,
      };
    })
    .filter(Boolean);
}

/**
 * Phase A close-out: validate the requested PDF build and compute the
 * pdfMetadata shape that `buildPrintReadyPdfFromPng` will return. This is
 * exported so tests can exercise the intent / dimensions / integrity rules
 * without going through pdf-lib's PNG embed (which is brittle under jsdom).
 *
 * Throws on the same conditions as `buildPrintReadyPdfFromPng`:
 *  - rasterIntegrityStatus === "blocked"
 *  - textRenderMode === "font_face_only"
 *  - isFinalA1 === true but raster is preview density
 *
 * @param {{
 *   widthPx: number,
 *   heightPx: number,
 *   dpi?: number,
 *   textRenderMode?: "font_paths" | "font_face_only" | "unknown",
 *   rasterIntegrityStatus?: "pass" | "warning" | "blocked" | "not_run",
 *   isFinalA1?: boolean,
 * }} options
 * @returns {{ widthPx, heightPx, widthPt, heightPt, dpi, isFinalA1, textRenderMode, rasterIntegrityStatus, pdfMetadata }}
 */
export function planPrintReadyPdfBuild(options = {}) {
  const widthPx = Number(options.widthPx);
  const heightPx = Number(options.heightPx);
  const dpi = Number(options.dpi) || FINAL_A1_PDF_DPI;
  const isFinalA1 = options.isFinalA1 === true;
  if (
    !Number.isFinite(widthPx) ||
    !Number.isFinite(heightPx) ||
    widthPx <= 0 ||
    heightPx <= 0
  ) {
    throw new Error("Invalid width/height for PDF");
  }

  const textRenderMode =
    options.textRenderMode === "font_paths" ||
    options.textRenderMode === "font_face_only" ||
    options.textRenderMode === "unknown"
      ? options.textRenderMode
      : "unknown";
  const rasterIntegrityStatus =
    options.rasterIntegrityStatus === "pass" ||
    options.rasterIntegrityStatus === "warning" ||
    options.rasterIntegrityStatus === "blocked" ||
    options.rasterIntegrityStatus === "not_run"
      ? options.rasterIntegrityStatus
      : "not_run";

  if (rasterIntegrityStatus === "blocked") {
    throw new Error(
      "buildPrintReadyPdfFromPng refused: rasterIntegrityStatus is blocked.",
    );
  }
  if (textRenderMode === "font_face_only") {
    throw new Error(
      "buildPrintReadyPdfFromPng refused: textRenderMode is font_face_only " +
        "(Phase A defensive fallback). Upstream prep must convert text to paths.",
    );
  }
  if (isFinalA1) {
    const widthRatio = widthPx / A1_WIDTH;
    const heightRatio = heightPx / A1_HEIGHT;
    if (
      widthRatio < FINAL_A1_PDF_MIN_RATIO ||
      heightRatio < FINAL_A1_PDF_MIN_RATIO ||
      dpi < FINAL_A1_PDF_MIN_DPI
    ) {
      throw new Error(
        "buildPrintReadyPdfFromPng refused: isFinalA1=true but raster is " +
          `preview density. Got ${widthPx}x${heightPx}px at ${dpi} DPI; final ` +
          `A1 requires at least ${Math.round(
            A1_WIDTH * FINAL_A1_PDF_MIN_RATIO,
          )}x${Math.round(
            A1_HEIGHT * FINAL_A1_PDF_MIN_RATIO,
          )}px at ≥ ${FINAL_A1_PDF_MIN_DPI} DPI (target ${A1_WIDTH}x${A1_HEIGHT}px @ ${FINAL_A1_PDF_DPI} DPI).`,
      );
    }
  }

  const widthPt = (widthPx / dpi) * 72;
  const heightPt = (heightPx / dpi) * 72;
  const pdfRenderMode =
    textRenderMode === "font_paths"
      ? isFinalA1
        ? "raster_textpaths_300dpi"
        : "raster_textpaths_preview_144dpi"
      : "raster_textembed_300dpi";

  return {
    widthPx,
    heightPx,
    widthPt,
    heightPt,
    dpi,
    isFinalA1,
    textRenderMode,
    rasterIntegrityStatus,
    pdfMetadata: {
      version: "a1-pdf-metadata-v1",
      pdfRenderMode,
      isRasterPdf: true,
      isVectorPdf: false,
      isHybridPdf: false,
      isFinalA1,
      renderIntent: isFinalA1 ? "final_a1" : "preview",
      dpi,
      widthPx,
      heightPx,
      widthPt,
      heightPt,
      textRenderMode,
      rasterIntegrityStatus,
      hybridVectorPdfFollowUp: true,
      pdfBytes: 0, // populated after PDF is rendered
    },
  };
}

/**
 * Build a print-ready A1 PDF from a rasterised PNG.
 *
 * Validation lives in `planPrintReadyPdfBuild`; this function only does the
 * actual pdf-lib emission once the plan succeeds.
 *
 * @param {Buffer} pngBuffer
 * @param {{
 *   widthPx: number,
 *   heightPx: number,
 *   dpi?: number,
 *   textRenderMode?: "font_paths" | "font_face_only" | "unknown",
 *   rasterIntegrityStatus?: "pass" | "warning" | "blocked" | "not_run",
 *   isFinalA1?: boolean,
 * }} options
 * @returns {Promise<{ pdfBuffer: Buffer, pdfMetadata: object }>}
 */
export async function buildPrintReadyPdfFromPng(pngBuffer, options = {}) {
  if (!Buffer.isBuffer(pngBuffer) || pngBuffer.length === 0) {
    throw new Error("pngBuffer is required to build PDF");
  }

  const plan = planPrintReadyPdfBuild(options);

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([plan.widthPt, plan.heightPt]);
  const image = await pdf.embedPng(pngBuffer);
  page.drawImage(image, {
    x: 0,
    y: 0,
    width: plan.widthPt,
    height: plan.heightPt,
  });
  const pdfBuffer = Buffer.from(await pdf.save({ useObjectStreams: false }));

  return {
    pdfBuffer,
    pdfMetadata: { ...plan.pdfMetadata, pdfBytes: pdfBuffer.length },
  };
}

export function resolveComposeOutputDir() {
  if (process.env.A1_COMPOSE_OUTPUT_DIR) {
    return process.env.A1_COMPOSE_OUTPUT_DIR;
  }

  if (process.env.VERCEL || process.env.AWS_REGION) {
    const baseDir = process.platform === "win32" ? process.cwd() : "/tmp";
    return path.join(baseDir, "a1_compose_outputs");
  }

  return path.join(process.cwd(), "qa_results", "a1_compose_outputs");
}

export function logRuntimeOnce() {
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

export async function getPanelRegistry() {
  if (panelRegistry) {
    return panelRegistry;
  }

  try {
    panelRegistry = await import("../../config/panelRegistry.js");
    return panelRegistry;
  } catch (error) {
    console.warn("[A1 Compose] Could not import panelRegistry:", error.message);
    return null;
  }
}

export async function getCrossViewImageValidator() {
  if (crossViewImageValidator) {
    return crossViewImageValidator;
  }

  try {
    crossViewImageValidator =
      await import("../validation/crossViewImageValidator.js");
    return crossViewImageValidator;
  } catch (error) {
    console.warn(
      "[A1 Compose] Could not import crossViewImageValidator:",
      error.message,
    );
    return null;
  }
}

export async function getRenderSanityValidator() {
  if (renderSanityValidator) {
    return renderSanityValidator;
  }

  try {
    renderSanityValidator = await import("../qa/RenderSanityValidator.js");
    return renderSanityValidator;
  } catch (error) {
    console.warn(
      "[A1 Compose] Could not import RenderSanityValidator:",
      error.message,
    );
    return null;
  }
}

function getFallbackConstants() {
  const A1_WIDTH = 9933;
  const A1_HEIGHT = 7016;
  const WORKING_WIDTH = 1792;
  const WORKING_HEIGHT = 1269;
  const LABEL_HEIGHT = 32;
  const LABEL_PADDING = 6;
  const CAPTION_FONT_SIZE = 12;
  const CAPTION_FONT_FAMILY = "Arial, Helvetica, sans-serif";
  const FRAME_STROKE_WIDTH = 2;
  const FRAME_STROKE_COLOR = "#d1d5db";
  const FRAME_RADIUS = 4;

  const GRID_SPEC = {
    site_diagram: { x: 0.02, y: 0.02, width: 0.22, height: 0.22 },
    hero_3d: { x: 0.26, y: 0.02, width: 0.34, height: 0.22 },
    interior_3d: { x: 0.62, y: 0.02, width: 0.22, height: 0.22 },
    material_palette: { x: 0.86, y: 0.02, width: 0.12, height: 0.18 },
    climate_card: { x: 0.86, y: 0.21, width: 0.12, height: 0.18 },
    floor_plan_ground: { x: 0.02, y: 0.26, width: 0.32, height: 0.22 },
    floor_plan_first: { x: 0.36, y: 0.26, width: 0.32, height: 0.22 },
    floor_plan_level2: { x: 0.7, y: 0.26, width: 0.28, height: 0.22 },
    elevation_north: { x: 0.02, y: 0.5, width: 0.23, height: 0.18 },
    elevation_south: { x: 0.27, y: 0.5, width: 0.23, height: 0.18 },
    elevation_east: { x: 0.52, y: 0.5, width: 0.23, height: 0.18 },
    elevation_west: { x: 0.77, y: 0.5, width: 0.21, height: 0.18 },
    section_AA: { x: 0.02, y: 0.7, width: 0.32, height: 0.26 },
    section_BB: { x: 0.36, y: 0.7, width: 0.32, height: 0.26 },
    schedules_notes: { x: 0.7, y: 0.7, width: 0.14, height: 0.26 },
    title_block: { x: 0.85, y: 0.7, width: 0.13, height: 0.26 },
  };

  const TARGET_BOARD_GRID_SPEC = {
    hero_3d: { x: 0.02, y: 0.02, width: 0.36, height: 0.26 },
    interior_3d: { x: 0.4, y: 0.02, width: 0.28, height: 0.26 },
    axonometric: { x: 0.7, y: 0.02, width: 0.14, height: 0.12 },
    site_diagram: { x: 0.7, y: 0.15, width: 0.14, height: 0.13 },
    material_palette: { x: 0.86, y: 0.02, width: 0.12, height: 0.18 },
    climate_card: { x: 0.86, y: 0.21, width: 0.12, height: 0.18 },
    floor_plan_ground: { x: 0.02, y: 0.3, width: 0.34, height: 0.25 },
    floor_plan_first: { x: 0.38, y: 0.3, width: 0.34, height: 0.25 },
    floor_plan_level2: { x: 0.74, y: 0.3, width: 0.24, height: 0.25 },
    elevation_north: { x: 0.02, y: 0.57, width: 0.235, height: 0.15 },
    elevation_south: { x: 0.265, y: 0.57, width: 0.235, height: 0.15 },
    elevation_east: { x: 0.51, y: 0.57, width: 0.235, height: 0.15 },
    elevation_west: { x: 0.755, y: 0.57, width: 0.235, height: 0.15 },
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
    A1_WIDTH,
    A1_HEIGHT,
    WORKING_WIDTH,
    WORKING_HEIGHT,
    LABEL_HEIGHT,
    LABEL_PADDING,
    CAPTION_FONT_SIZE,
    CAPTION_FONT_FAMILY,
    FRAME_STROKE_WIDTH,
    FRAME_STROKE_COLOR,
    FRAME_RADIUS,
    GRID_SPEC,
    TARGET_BOARD_GRID_SPEC,
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
    validatePanelLayout: (panels, options = {}) => {
      const providedTypes = new Set(panels.map((p) => p.type));
      const floorCount = options.floorCount || 2;
      const adjustedRequired = REQUIRED_PANELS.filter((type) => {
        if (type === "floor_plan_level2" && floorCount < 3) {
          return false;
        }
        return true;
      });

      const missingPanels = adjustedRequired.filter(
        (type) => !providedTypes.has(type),
      );

      return {
        valid: true,
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

export async function getLayoutConstants() {
  if (layoutConstants) {
    return layoutConstants;
  }

  try {
    layoutConstants = await import("./a1LayoutConstants.js");
    return layoutConstants;
  } catch (error) {
    console.warn(
      "[A1 Compose] Could not import shared constants, using fallback:",
      error.message,
    );
    return getFallbackConstants();
  }
}
