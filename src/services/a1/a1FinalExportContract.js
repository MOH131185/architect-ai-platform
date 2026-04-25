import {
  A1_HEIGHT,
  A1_WIDTH,
  WORKING_HEIGHT,
  WORKING_WIDTH,
} from "./composeCore.js";

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
    enforceRenderedText:
      isFinalA1 || requestBody?.enforceRenderedText === true,
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
    blockers.push(...(finalSheetRegression.blockers || []));
  }
  if (!postComposeVerification) {
    blockers.push("Final A1 export requires post-compose rendered verification.");
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
