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

import a1ComposePayload from "../../server/utils/a1ComposePayload.cjs";

// Shared compose core – single source of truth for layout grids, panel key
// normalisation, and per-panel fit policy.
import {
  normalizeKey as composeCoreNormalizeKey,
  resolveLayout as composeCoreResolveLayout,
  getPanelFitMode as composeCoreGetPanelFitMode,
  getDefaultMinSlotOccupancy as composeCoreGetDefaultMinSlotOccupancy,
} from "../../src/services/a1/composeCore.js";

import {
  EMBEDDED_FONT_STACK,
  embedFontInSVG,
  ensureFontsLoaded,
  getFontEmbeddingReadinessSync,
} from "../../src/utils/svgFontEmbedder.js";
import { isFeatureEnabled } from "../../src/config/featureFlags.js";
import {
  buildClimateCardBuffer,
  buildMaterialPaletteBuffer,
  buildSchedulesBuffer,
  escapeXml,
} from "../../src/services/a1/composeDataPanels.js";
import {
  buildPrintReadyPdfFromPng,
  collectPanelGeometryHashes,
  getCrossViewImageValidator,
  getLayoutConstants,
  getOpusSheetCritic,
  getPanelRegistry,
  getQAGates,
  getRenderSanityValidator,
  logRuntimeOnce,
  readRequestHashes,
  resolveComposeOutputDir,
} from "../../src/services/a1/composeRuntime.js";
import {
  applyComposeCors,
  applyComposeNoStoreHeaders,
  enforceComposePostMethod,
  handleComposePreflight,
  sendComposeUnhandledError,
} from "../../src/services/a1/composeTransport.js";
import {
  buildComposeSuccessPayload,
  buildPanelsByKey,
} from "../../src/services/a1/composeResponse.js";
import { runA1FinalSheetRegression } from "../../src/services/a1/a1FinalSheetRegressionService.js";
import { runA1PostComposeVerification } from "../../src/services/a1/a1PostComposeVerificationService.js";
import {
  buildComposeArtifactManifest,
  buildPublicArtifactUrl,
  createComposeTrace,
  logComposeEvent,
  writeComposeArtifactManifest,
} from "../../src/services/a1/composeTrace.js";

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

/**
 * Fetch image from URL and return buffer
 */
async function fetchImageBuffer(url) {
  if (!url) {
    throw new Error("Image URL is required");
  }

  // Handle raw SVG markup (sent as string to avoid base64 overhead in request body)
  if (url.startsWith("<svg") || url.startsWith("<?xml")) {
    const embedded = await embedFontInSVG(url);
    return Buffer.from(embedded, "utf8");
  }

  // Handle data URLs
  if (url.startsWith("data:")) {
    if (url.startsWith("data:image/svg+xml")) {
      const [, payload = ""] = url.split(",", 2);
      const svg = url.includes(";base64,")
        ? Buffer.from(payload, "base64").toString("utf8")
        : decodeURIComponent(payload);
      const embedded = await embedFontInSVG(svg);
      return Buffer.from(embedded, "utf8");
    }

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
    CAPTION_FONT_FAMILY = EMBEDDED_FONT_STACK,
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

  // North arrows on floor plan panels
  let northArrows = "";
  for (const [id, coord] of Object.entries(coordinates)) {
    if (id.startsWith("floor_plan_")) {
      const arrowX = coord.x + coord.width - 28;
      const arrowY = coord.y + 12;
      const arrowSize = 22;
      // Simple north arrow: filled triangle pointing up with "N" label
      northArrows += `<g transform="translate(${arrowX},${arrowY})">
        <circle cx="${arrowSize / 2}" cy="${arrowSize / 2}" r="${arrowSize / 2 + 4}" fill="white" fill-opacity="0.85" stroke="#475569" stroke-width="0.5"/>
        <polygon points="${arrowSize / 2},2 ${arrowSize - 4},${arrowSize - 4} ${arrowSize / 2},${arrowSize - 8} 4,${arrowSize - 4}" fill="#1e293b" stroke="#475569" stroke-width="0.5"/>
        <text x="${arrowSize / 2}" y="${arrowSize + 8}" font-family="${CAPTION_FONT_FAMILY}" font-size="8" font-weight="700" fill="#1e293b" text-anchor="middle">N</text>
      </g>`;
    }
  }

  // Scale bars on elevation and section panels
  let scaleBars = "";
  for (const [id, coord] of Object.entries(coordinates)) {
    if (id.startsWith("elevation_") || id.startsWith("section_")) {
      const barX = coord.x + 8;
      const barY = coord.y + coord.height - LABEL_HEIGHT - 14;
      const barWidth = Math.min(60, coord.width * 0.15);
      scaleBars += `<g>
        <line x1="${barX}" y1="${barY}" x2="${barX + barWidth}" y2="${barY}" stroke="#475569" stroke-width="1"/>
        <line x1="${barX}" y1="${barY - 3}" x2="${barX}" y2="${barY + 3}" stroke="#475569" stroke-width="1"/>
        <line x1="${barX + barWidth}" y1="${barY - 3}" x2="${barX + barWidth}" y2="${barY + 3}" stroke="#475569" stroke-width="1"/>
        <text x="${barX + barWidth / 2}" y="${barY - 5}" font-family="${CAPTION_FONT_FAMILY}" font-size="7" fill="#64748b" text-anchor="middle">5m</text>
      </g>`;
    }
  }

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    ${frames}
    ${labels}
    ${northArrows}
    ${scaleBars}
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
export function getPipelineModeForStamp(proof = null) {
  // If proof signals provided, use the resolved mode (truthful naming)
  if (proof?.resolvedMode) {
    return proof.resolvedMode;
  }

  // Fallback to env var, defaulting to the only supported mode
  const raw = (process.env.PIPELINE_MODE || "multi_panel").toLowerCase().trim();
  return raw;
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
  return str.substring(0, Math.max(0, maxChars - 3)) + "...";
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
  const meshyIndicator = meshyUsed ? "3D:Y" : "3D:N";
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

  const fontStack =
    "'EmbeddedSans', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

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
      OK
    </text>
  </svg>`;
}

function generateBoardSpecStampSvg({
  width,
  height,
  layoutTemplateUsed,
  boardSpecVersion,
}) {
  const fontStack =
    "'EmbeddedSans', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
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
  applyComposeCors(res);
  const trace = createComposeTrace(req?.body);

  if (handleComposePreflight(req, res)) {
    return;
  }

  if (enforceComposePostMethod(req, res)) {
    return;
  }

  try {
    return await handleComposeRequest(req, res, trace);
  } catch (error) {
    return sendComposeUnhandledError(res, error, trace);
  }
}

async function handleComposeRequest(req, res, trace) {
  const requestStartedMs = Date.now();
  const requestBody = req.body || {};

  // Pre-load embedded font for SVG rendering (awaited to prevent race condition)
  await ensureFontsLoaded();

  // Logging request details
  logComposeEvent(
    trace,
    "info",
    `Request for designId: ${requestBody.designId}`,
  );
  logComposeEvent(
    trace,
    "info",
    `Panels: ${requestBody.panels?.length || 0}, SiteOverlay: ${requestBody.siteOverlay ? "Yes" : "No"}`,
  );
  if (requestBody.masterDNA) {
    logComposeEvent(
      trace,
      "info",
      `MasterDNA: Rooms=${requestBody.masterDNA.rooms?.length || 0}, Materials=${requestBody.masterDNA.materials?.length || 0}`,
    );
  } else {
    logComposeEvent(trace, "warn", "MasterDNA missing from payload");
  }

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
    minSlotOccupancy: requestedMinSlotOccupancy = null,
    masterDNA = null,
    projectContext = null,
    locationData = null,
  } = requestBody;
  const requestedHashes = readRequestHashes(requestBody);
  let panels = Array.isArray(requestBody?.panels) ? requestBody.panels : [];
  const regressionContextAvailable = Boolean(
    requestBody.drawings || requestBody.technicalPanelQuality,
  );

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
  const expectedFingerprint = requestBody.designFingerprint || designId;
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

  const explicitFloorCount = Number(requestBody.floorCount);
  const derivedFloorCount =
    panels.filter((p) => String(p.type || "").startsWith("floor_plan_"))
      .length || 2;
  const floorCount =
    Number.isFinite(explicitFloorCount) && explicitFloorCount > 0
      ? explicitFloorCount
      : derivedFloorCount;

  // skipMissingPanelCheck: Allow composition with placeholders for missing panels (smoke tests, dev)
  const skipMissingPanelCheck = requestBody.skipMissingPanelCheck === true;

  if (registry && !skipMissingPanelCheck) {
    const requiredPanels =
      typeof registry.getRequiredPanels === "function"
        ? registry.getRequiredPanels(floorCount)
        : typeof registry.getAIGeneratedPanels === "function"
          ? registry.getAIGeneratedPanels(floorCount)
          : [];
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
    skipMissingPanelCheck || requestBody.skipValidation === true;
  const requireHashMetadata =
    requestBody.requireHashMetadata !== false && !skipValidation;
  const panelGeometryHashes = collectPanelGeometryHashes(panels);

  if (requireHashMetadata) {
    const missingHashFields = Object.entries(requestedHashes)
      .filter(([, value]) => !value)
      .map(([key]) => key);

    if (missingHashFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: "MISSING_HASH_METADATA",
        message: `Cannot compose A1 sheet - missing required hash metadata: ${missingHashFields.join(", ")}`,
        details: {
          required: ["dnaHash", "geometryHash", "programHash"],
          received: requestedHashes,
        },
      });
    }
  }

  if (skipValidation) {
    console.log(
      `[A1 Compose] ⚠️ skipValidation=true - skipping floor plan, geometry, and cross-view validation`,
    );
  }

  if (DEBUG_RUNS) {
    console.log("[DEBUG_RUNS] [A1 Compose] Starting pre-compose validation...");
  }

  if (!skipValidation) {
    if (panelGeometryHashes.length > 1) {
      return res.status(400).json({
        success: false,
        error: "PANEL_GEOMETRY_HASH_MISMATCH",
        message:
          "Cannot compose A1 sheet - panels contain multiple geometry hashes.",
        details: {
          panelGeometryHashes,
          recommendation:
            "Regenerate all panels from a single canonical geometry pack.",
        },
      });
    }

    if (requestedHashes.geometryHash) {
      if (panelGeometryHashes.length === 0) {
        return res.status(400).json({
          success: false,
          error: "MISSING_PANEL_GEOMETRY_HASH",
          message:
            "Cannot compose A1 sheet - requested geometryHash was provided but panels do not contain geometryHash metadata.",
          details: {
            expectedGeometryHash: requestedHashes.geometryHash,
          },
        });
      }

      if (panelGeometryHashes[0] !== requestedHashes.geometryHash) {
        return res.status(400).json({
          success: false,
          error: "GEOMETRY_HASH_MISMATCH",
          message:
            "Cannot compose A1 sheet - panel geometry hash does not match requested geometryHash.",
          details: {
            expectedGeometryHash: requestedHashes.geometryHash,
            panelGeometryHash: panelGeometryHashes[0],
          },
        });
      }
    }
  }

  const emptyFloorPlans = [];
  const floorPlanPanels = panels.filter((p) => p.type?.includes("floor_plan"));

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
  const elevationPanels = panels.filter((p) => p.type?.includes("elevation_"));

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
            geometryHash:
              panel.geometryHash ||
              panel.geometry_hash ||
              panel.meta?.geometryHash ||
              panel.meta?.geometry_hash ||
              null,
            cdsHash:
              panel.cdsHash ||
              panel.meta?.cdsHash ||
              panel.meta?.cds_hash ||
              null,
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
    requestBody.layoutTemplate || layoutConfig || "board-v2";
  const useHighRes =
    requestBody.highRes === true || requestBody.printMaster === true;

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
  const minSlotOccupancy = Number.isFinite(requestedMinSlotOccupancy)
    ? requestedMinSlotOccupancy
    : undefined;

  console.log(
    `[A1 Compose] Using ${layoutTemplate.toUpperCase()} layout (floors=${floorCount}, ${width}x${height}px)`,
  );
  console.log(`[A1 Compose] Layout resolved via composeCore SSOT`);

  if (useHighRes) {
    console.log(
      `[A1 Compose] HIGH-RES MODE: Using print master resolution ${A1_WIDTH}×${A1_HEIGHT}px (300 DPI)`,
    );
  }

  // Create warm architectural paper background (#FAF9F6)
  const background = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 250, g: 249, b: 246 },
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
        // svgPanel panels (material_palette, climate_card, schedules_notes)
        // are rendered server-side as SVG later in the pipeline — they don't
        // carry buffer/imageUrl but are still valid content.
        const hasContent = !!(
          panel?.buffer ||
          panel?.imageUrl ||
          panel?.svgPanel
        );
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
    if (
      type === "schedules_notes" ||
      type === "material_palette" ||
      type === "climate_card"
    ) {
      if (panel?.imageUrl && !panel?.svgPanel) {
        console.warn(
          `[A1 Compose] Ignoring raster ${type} panel and rendering deterministic SVG instead`,
        );
      }
      if (type === "schedules_notes") {
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
      if (type === "material_palette") {
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
        const buffer = panel.buffer || (await fetchImageBuffer(panel.imageUrl));
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
    requestBody.includeBuildStamp === true ||
    process.env.A1_COMPOSE_INCLUDE_BUILD_STAMP === "1";

  if (includeBuildStamp) {
    const buildTimestamp = new Date().toISOString();
    const shortHash = designId ? designId.substring(0, 8) : "N/A";
    const runIdFromRequest = requestBody.runId || requestBody.meta?.runId;

    // Extract flags from request body (passed from orchestrator)
    const flagsFromRequest = requestBody.flags || requestBody.meta?.flags || {};

    // Extract proof signals from request body (passed from orchestrator)
    // These contain truthful information about what generators were actually used
    const proofFromRequest = requestBody.proof || requestBody.meta?.proof || {};

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
  const includePdf = useHighRes && requestBody.skipPdf !== true;
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
        ? path.basename(outputFile, path.extname(outputFile))
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

  logComposeEvent(
    trace,
    "info",
    `Sheet composed: ${composites.length} elements, ${width}x${height}px (${transport})`,
  );

  const composedAt = new Date().toISOString();
  applyComposeNoStoreHeaders(res, {
    designFingerprint: expectedFingerprint || "unknown",
    composedAt,
    traceId: trace.traceId,
    runId: trace.runId,
  });
  logComposeEvent(
    trace,
    "info",
    "Response headers set: Cache-Control: no-store",
  );

  const panelsByKey = buildPanelsByKey(panels, coordinates);
  const panelLabelMap = Object.fromEntries(
    (panels || []).map((panel) => [panel.type, panel.label || panel.type]),
  );
  const finalSheetRegression = regressionContextAvailable
    ? runA1FinalSheetRegression({
        drawings: requestBody.drawings || {},
        technicalPanelQuality: requestBody.technicalPanelQuality || null,
        sheetSvg:
          typeof requestBody.finalSheetSvg === "string"
            ? requestBody.finalSheetSvg
            : "",
        fontReadiness: getFontEmbeddingReadinessSync(),
        expectedLabels: panels.map((panel) => panel.label || panel.type),
        coordinates,
        panelLabelMap,
        width,
        height,
      })
    : null;

  if (
    regressionContextAvailable &&
    requestBody.enforcePreComposeVerification === true &&
    isFeatureEnabled("useA1PreComposeVerificationPhase9") &&
    finalSheetRegression?.finalSheetRegressionReady === false
  ) {
    return res.status(409).json({
      success: false,
      error: "PRECOMPOSE_VERIFICATION_FAILED",
      message:
        "Phase 9 final-sheet regression verification blocked composition.",
      details: finalSheetRegression,
    });
  }

  const postComposeVerification =
    regressionContextAvailable &&
    isFeatureEnabled("usePostComposeVerificationPhase10")
      ? await runA1PostComposeVerification({
          drawings: requestBody.drawings || {},
          technicalPanelQuality: requestBody.technicalPanelQuality || null,
          sheetSvg:
            typeof requestBody.finalSheetSvg === "string"
              ? requestBody.finalSheetSvg
              : "",
          renderedBuffer: composedBuffer,
          fontReadiness: getFontEmbeddingReadinessSync(),
          expectedLabels: panels.map((panel) => panel.label || panel.type),
          coordinates,
          panelLabelMap,
          width,
          height,
        })
      : null;

  if (
    regressionContextAvailable &&
    requestBody.enforcePostComposeVerification === true &&
    isFeatureEnabled("usePostComposeVerificationPhase10") &&
    postComposeVerification?.publishability?.status === "blocked"
  ) {
    return res.status(409).json({
      success: false,
      error: "POSTCOMPOSE_VERIFICATION_FAILED",
      message:
        "Phase 10 post-compose verification blocked publication of the composed board.",
      details: postComposeVerification,
    });
  }

  // ====================================================================
  // QA GATES: Run automated quality assurance checks
  // ====================================================================
  let qaResults = null;
  let critiqueResults = null;
  const runQA = !skipValidation && requestBody.runQA !== false;

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
            skipContrastCheck: requestBody.skipContrastCheck,
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
    const runCritique = requestBody.runCritique !== false;
    if (runCritique && sheetUrl) {
      try {
        const criticExport = await getOpusSheetCritic();
        if (criticExport) {
          console.log("[A1 Compose] Running Opus Sheet Critic...");

          const critic =
            typeof criticExport === "function"
              ? new criticExport()
              : criticExport;
          if (typeof critic?.critiqueSheet !== "function") {
            throw new Error(
              "Opus Sheet Critic export does not implement critiqueSheet()",
            );
          }
          const requiredPanels = Object.keys(panelsByKey);

          // Pass design fingerprint if available
          const designFingerprint = expectedFingerprint || null;

          critiqueResults = await critic.critiqueSheet(
            sheetUrl,
            requiredPanels,
            {
              designFingerprint,
              layoutTemplate,
              strictMode: requestBody.strictCritique || false,
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
  const durationMs = Date.now() - requestStartedMs;
  const manifest = buildComposeArtifactManifest({
    trace,
    completedAt: composedAt,
    durationMs,
    layoutTemplate,
    transport,
    panelCount: panels.length,
    panelKeys: Object.keys(panelsByKey),
    designFingerprint: expectedFingerprint,
    dnaHash: requestedHashes.dnaHash || null,
    geometryHash:
      requestedHashes.geometryHash || panelGeometryHashes[0] || null,
    programHash: requestedHashes.programHash || null,
    pngBytes,
    pdfBytes,
    outputFile,
    pdfOutputFile,
    qaResults,
    critiqueResults,
  });
  const manifestFile = writeComposeArtifactManifest({
    manifest,
    outputFile,
    outputDir,
    pdfOutputFile,
  });
  const manifestUrl = buildPublicArtifactUrl(manifestFile, publicUrlBase);

  if (manifestFile) {
    logComposeEvent(trace, "info", `Compose manifest written: ${manifestFile}`);
  }

  const metadata = {
    width,
    height,
    panelCount: panels.length,
    composedAt,
    durationMs,
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
    traceId: trace.traceId,
    runId: trace.runId,
    manifestFile,
    manifestUrl,
    dnaHash: requestedHashes.dnaHash || null,
    geometryHash:
      requestedHashes.geometryHash || panelGeometryHashes[0] || null,
    programHash: requestedHashes.programHash || null,
    dna_hash: requestedHashes.dnaHash || null,
    geometry_hash:
      requestedHashes.geometryHash || panelGeometryHashes[0] || null,
    program_hash: requestedHashes.programHash || null,
    hashValidation: {
      required: requireHashMetadata,
      panelGeometryHashCount: panelGeometryHashes.length,
      panelGeometryHash: panelGeometryHashes[0] || null,
      matchedRequestedGeometryHash: requestedHashes.geometryHash
        ? panelGeometryHashes[0] === requestedHashes.geometryHash
        : null,
    },
    panelKeys: Object.keys(panelsByKey),
    qaAllPassed: qaResults?.allPassed ?? null,
    critiqueOverallPass: critiqueResults?.overall_pass ?? null,
    finalSheetRegression,
    postComposeVerification,
    renderedTextZone: postComposeVerification?.renderedTextZone || null,
    technicalCredibility: postComposeVerification?.technicalCredibility || null,
    publishability: postComposeVerification?.publishability || null,
  };

  return res.status(200).json(
    buildComposeSuccessPayload({
      sheetUrl,
      pdfUrl,
      coordinates,
      panelsByKey,
      qaResults,
      critiqueResults,
      metadata,
      traceId: trace.traceId,
      runId: trace.runId,
      manifestUrl,
    }),
  );
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

  // Pre-filter: strip content that inflates bounds but isn't structural geometry
  // 1. Remove <defs>...</defs> blocks (pattern definitions contain geometry)
  let cleanedSvg = svgText.replace(/<defs[\s>][\s\S]*?<\/defs>/gi, "");
  // 2. Remove known decorative groups by class (titles, scale bars, north arrows, etc.)
  cleanedSvg = cleanedSvg.replace(
    /<g[^>]*\bclass="(title|scale-bar|north-arrow|section-markers|ground-line|ground-context)"[^>]*>[\s\S]*?<\/g>/gi,
    "",
  );
  // 3. Remove known decorative groups by id
  cleanedSvg = cleanedSvg.replace(
    /<g[^>]*\bid="(ground-context|landscape)"[^>]*>[\s\S]*?<\/g>/gi,
    "",
  );

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
  const rectMatches = cleanedSvg.matchAll(/<rect[^>]*>/gi);
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
  const lineMatches = cleanedSvg.matchAll(
    /<line[^>]*?\bx1="([^"]*)"[^>]*?\by1="([^"]*)"[^>]*?\bx2="([^"]*)"[^>]*?\by2="([^"]*)"/gi,
  );
  for (const match of lineMatches) {
    expandBounds(parseFloat(match[1]) || 0, parseFloat(match[2]) || 0);
    expandBounds(parseFloat(match[3]) || 0, parseFloat(match[4]) || 0);
  }

  // Parse <polygon> and <polyline> elements
  const polyMatches = cleanedSvg.matchAll(
    /<poly(?:gon|line)[^>]*?\bpoints="([^"]*)"/gi,
  );
  for (const match of polyMatches) {
    const points = match[1].trim().split(/[\s,]+/);
    for (let i = 0; i < points.length - 1; i += 2) {
      expandBounds(parseFloat(points[i]), parseFloat(points[i + 1]));
    }
  }

  // Parse <path> elements - extract M, L, H, V coordinates
  const pathMatches = cleanedSvg.matchAll(/<path[^>]*?\bd="([^"]*)"/gi);
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
        default:
          break;
      }
    }
  }

  // Parse <circle> elements
  const circleMatches = cleanedSvg.matchAll(
    /<circle[^>]*?\bcx="([^"]*)"[^>]*?\bcy="([^"]*)"[^>]*?\br="([^"]*)"/gi,
  );
  for (const match of circleMatches) {
    const cx = parseFloat(match[1]) || 0;
    const cy = parseFloat(match[2]) || 0;
    const r = parseFloat(match[3]) || 0;
    expandBounds(cx - r, cy - r);
    expandBounds(cx + r, cy + r);
  }

  // Skip <text> elements - text is annotation/chrome, not structural geometry.
  // Board composer adds its own labels; including text inflates bounds with titles.

  // Validate bounds
  if (!isFinite(bounds.minX) || !isFinite(bounds.maxX)) {
    return null;
  }

  const result = {
    minX: bounds.minX,
    minY: bounds.minY,
    maxX: bounds.maxX,
    maxY: bounds.maxY,
    width: bounds.maxX - bounds.minX,
    height: bounds.maxY - bounds.minY,
  };

  // ViewBox sanity check: reject geometry bounds that wildly exceed the declared viewBox
  const viewBox = parseSvgViewBox(svgText);
  if (viewBox) {
    const vbWidth = viewBox.width;
    const vbHeight = viewBox.height;
    if (vbWidth > 0 && vbHeight > 0) {
      if (result.width > vbWidth * 1.1 || result.height > vbHeight * 1.1) {
        // Geometry bounds exceed viewBox by >10% - likely includes decorative bleed
        // Fall back to viewBox dimensions
        return {
          minX: viewBox.minX || 0,
          minY: viewBox.minY || 0,
          maxX: (viewBox.minX || 0) + vbWidth,
          maxY: (viewBox.minY || 0) + vbHeight,
          width: vbWidth,
          height: vbHeight,
        };
      }
    }
  }

  return result;
}

/**
 * QA validation: detect internal chrome that should have been stripped by sheetMode.
 * Logs warnings but does not block composition (defensive, not gatekeeping).
 *
 * @param {string} panelType - Panel type identifier (e.g. "floor_plan_ground")
 * @param {string} svgText - SVG content to validate
 * @returns {{ clean: boolean, issues: string[] }}
 */
function validateSheetModeStripped(panelType, svgText) {
  if (!svgText) return { clean: true, issues: [] };

  const issues = [];

  // Check for internal chrome groups that sheetMode should have removed
  const chromeClasses = [
    "title",
    "scale-bar",
    "north-arrow",
    "section-markers",
  ];
  for (const cls of chromeClasses) {
    if (svgText.includes(`class="${cls}"`)) {
      issues.push(`Panel ${panelType} still contains class="${cls}" group`);
    }
  }

  // Check for title-like text elements (font-size >= 14)
  const titleTextPattern =
    /<text[^>]*font-size="(\d+)"[^>]*>[^<]*(ELEVATION|SECTION|Scale 1:)[^<]*<\/text>/gi;
  let match;
  while ((match = titleTextPattern.exec(svgText)) !== null) {
    const fontSize = parseInt(match[1], 10);
    if (fontSize >= 14) {
      issues.push(
        `Panel ${panelType} contains title text: "${match[2]}" at font-size ${fontSize}`,
      );
    }
  }

  // Check for ground context groups
  if (
    svgText.includes('id="ground-context"') ||
    svgText.includes('id="landscape"')
  ) {
    issues.push(
      `Panel ${panelType} still contains ground context/landscape group`,
    );
  }

  // Check content-to-viewBox ratio (dead space detection)
  const viewBox = parseSvgViewBox(svgText);
  const geoBounds = computeSvgGeometryBounds(svgText);
  if (viewBox && geoBounds) {
    const vbArea = (viewBox.width || 0) * (viewBox.height || 0);
    const contentArea = geoBounds.width * geoBounds.height;
    if (vbArea > 0 && contentArea > 0) {
      const ratio = contentArea / vbArea;
      if (ratio < 0.5) {
        issues.push(
          `Panel ${panelType} has ${Math.round(ratio * 100)}% content fill (>50% dead space)`,
        );
      }
    }
  }

  if (issues.length > 0) {
    console.warn(
      `[QA:sheetMode] ${issues.length} issue(s) in ${panelType}:`,
      issues,
    );
  }

  return { clean: issues.length === 0, issues };
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
  // Determine if this is a technical drawing (for density & trim decisions)
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

  // SVG rasterization density: 200 DPI for technical drawings, 144 default, 300 high-res
  const svgDensity = qa?.useHighRes
    ? 300
    : isSvgInput && isTechnicalDrawing
      ? 200
      : 144;

  // Embed web font into SVG so Sharp/librsvg can render text correctly
  if (isSvgInput) {
    try {
      const svgStr = imageBuffer.toString("utf8");
      const fontedSvg = await embedFontInSVG(svgStr);
      imageBuffer = Buffer.from(fontedSvg, "utf8");
    } catch (fontErr) {
      // Non-fatal: proceed with original SVG
      console.warn(
        `[A1 Compose] Font embedding failed for ${panelType}:`,
        fontErr.message,
      );
    }
  }

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

      // QA: validate sheetMode chrome was stripped from SVG technical panels
      if (isSvgInput && isTechnicalDrawing) {
        const svgForQA = Buffer.isBuffer(imageBuffer)
          ? imageBuffer.toString("utf8")
          : String(imageBuffer || "");
        validateSheetModeStripped(panelType, svgForQA);
      }

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

  const getDefaultMinSlotOccupancy = () => {
    const slotAspect =
      Number.isFinite(targetWidth) &&
      Number.isFinite(targetHeight) &&
      targetWidth > 0 &&
      targetHeight > 0
        ? targetWidth / targetHeight
        : 1;
    return composeCoreGetDefaultMinSlotOccupancy(panelType, slotAspect);
  };

  // Optional auto-rotate to maximize slot usage (QA-driven)
  let rotated = false;
  const canAutoRotate =
    panelType.startsWith("floor_plan_") ||
    panelType.startsWith("elevation_") ||
    panelType.startsWith("section_");
  if (
    qa?.enabled &&
    qa?.rotateToFit &&
    mode !== "cover" &&
    canAutoRotate &&
    !isSvgInput
  ) {
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
    : getDefaultMinSlotOccupancy();
  // Skip occupancy check for SVG inputs — they are deterministic and correct by construction.
  // The check is designed to catch blank/tiny AI-generated images, not vector drawings.
  const shouldEnforceOccupancy =
    qa?.enabled &&
    mode !== "cover" &&
    !isSvgInput &&
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
        {
          originalWidth: inputWidth,
          originalHeight: inputHeight,
          slotWidth: targetWidth,
          slotHeight: targetHeight,
        },
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
        text-anchor="middle" fill="#9ca3af">PANEL MISSING - REGENERATE</text>
      <text x="${width / 2}" y="${height / 2 + 18}" font-size="14" font-family="Arial, sans-serif"
        text-anchor="middle" fill="#b91c1c">${(type || "").toUpperCase()}</text>
    </svg>
  `;
  const fontedSvg = await embedFontInSVG(svg);
  return sharp(Buffer.from(fontedSvg))
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
      .replace(/"/g, "&quot;")
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
      <text x="${width / 2 + 8}" y="262" font-family="Arial, sans-serif" font-size="10" font-weight="600" fill="#0f172a">${esc(tb.date || "-")}</text>

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

  const fontedSvg = await embedFontInSVG(svg);
  return sharp(Buffer.from(fontedSvg))
    .png()
    .resize(width, height, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255 },
    })
    .toBuffer();
}
