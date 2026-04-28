import crypto from "crypto";
import fs from "fs";
import path from "path";

import {
  A1_HEIGHT,
  A1_WIDTH,
  WORKING_HEIGHT,
  WORKING_WIDTH,
} from "./composeCore.js";
import {
  EMBEDDED_FONT_STACK,
  FINAL_SHEET_MIN_FONT_SIZE_PX,
  prepareFinalSheetSvgForRasterizationWithReport,
} from "../../utils/svgFontEmbedder.js";

const DEFAULT_PUBLIC_URL_BASE = "/api/a1/compose-output";

function escapeXml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function sanitizeIdentifier(value, fallback = "unknown", maxLength = 60) {
  const sanitized = String(value || "")
    .replace(/[^a-z0-9_-]/gi, "")
    .slice(0, maxLength);
  return sanitized || fallback;
}

function physicalScale(width = A1_WIDTH) {
  return Math.max(0.16, Number(width || A1_WIDTH) / A1_WIDTH);
}

function fontPx(basePx, width = A1_WIDTH) {
  return Math.max(
    FINAL_SHEET_MIN_FONT_SIZE_PX,
    Math.round(basePx * physicalScale(width)),
  );
}

function normalizeItems(items = []) {
  return (items || [])
    .map((item) =>
      String(item || "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);
}

function clipItems(items = [], limit = 12) {
  const normalized = normalizeItems(items);
  if (normalized.length <= limit) {
    return normalized;
  }
  return [
    ...normalized.slice(0, limit - 1),
    `${normalized.length - limit + 1} additional items recorded in manifest`,
  ];
}

function materialLines(masterDNA = {}, projectContext = {}) {
  const materials =
    masterDNA?.materials ||
    masterDNA?.style?.materials ||
    projectContext?.materialPack?.materials ||
    projectContext?.materials ||
    [];
  if (Array.isArray(materials) && materials.length) {
    return clipItems(
      materials.map((material) =>
        typeof material === "string"
          ? material
          : [
              material?.name || material?.type || "material",
              material?.application || material?.use || "",
            ]
              .filter(Boolean)
              .join(" - "),
      ),
    );
  }
  return ["Material schedule unavailable in compose payload"];
}

function programmeLines(masterDNA = {}, projectContext = {}) {
  const rooms =
    masterDNA?.rooms ||
    masterDNA?.program?.rooms ||
    projectContext?.programSpaces ||
    projectContext?.buildingProgram?.spaces ||
    [];
  if (Array.isArray(rooms) && rooms.length) {
    return clipItems(
      rooms.map((room) =>
        [
          room?.name || room?.label || room?.type || "space",
          room?.area ? `${room.area} m2` : "",
          Number.isFinite(Number(room?.floor ?? room?.level))
            ? `L${room.floor ?? room.level}`
            : "",
        ]
          .filter(Boolean)
          .join(" - "),
      ),
      16,
    );
  }
  return ["Programme schedule unavailable in compose payload"];
}

function climateLines(locationData = {}, projectContext = {}) {
  const climate = locationData?.climate || projectContext?.climatePack || {};
  const lines = [
    climate?.summary,
    climate?.zone ? `Climate zone: ${climate.zone}` : null,
    climate?.annualTemperature
      ? `Annual temperature: ${climate.annualTemperature}`
      : null,
    climate?.prevailingWind
      ? `Prevailing wind: ${climate.prevailingWind}`
      : null,
    climate?.orientationStrategy
      ? `Orientation: ${climate.orientationStrategy}`
      : null,
  ];
  return normalizeItems(lines).length
    ? normalizeItems(lines)
    : ["Climate pack unavailable in compose payload"];
}

function regulationLines(projectContext = {}) {
  const pack =
    projectContext?.regulationPack ||
    projectContext?.regulations ||
    projectContext?.planningConstraints ||
    {};
  if (Array.isArray(pack)) {
    return clipItems(pack);
  }
  const lines = [
    pack?.summary,
    pack?.jurisdiction ? `Jurisdiction: ${pack.jurisdiction}` : null,
    pack?.planningUseClass ? `Use class: ${pack.planningUseClass}` : null,
    pack?.fireStrategy ? `Fire strategy: ${pack.fireStrategy}` : null,
    pack?.accessibility ? `Accessibility: ${pack.accessibility}` : null,
    pack?.energy ? `Energy: ${pack.energy}` : null,
  ];
  return normalizeItems(lines).length
    ? normalizeItems(lines)
    : ["Regulation pack unavailable in compose payload"];
}

function verificationLines({
  finalSheetRegression = null,
  postComposeVerification = null,
  glyphIntegrity = null,
  sheetTextContract = null,
} = {}) {
  return normalizeItems([
    finalSheetRegression
      ? `Pre-compose: ${finalSheetRegression.status || "unknown"}`
      : "Pre-compose: unavailable",
    postComposeVerification
      ? `Post-compose: ${postComposeVerification.status || "unknown"}`
      : "Post-compose: unavailable",
    postComposeVerification?.publishability?.status
      ? `Publishability: ${postComposeVerification.publishability.status}`
      : null,
    postComposeVerification?.renderedTextZone?.ocrEvidenceQuality
      ? `OCR evidence: ${postComposeVerification.renderedTextZone.ocrEvidenceQuality}`
      : null,
    glyphIntegrity?.status ? `Glyph integrity: ${glyphIntegrity.status}` : null,
    sheetTextContract?.requiredLabelCount
      ? `Required text labels: ${sheetTextContract.requiredLabelCount}`
      : null,
  ]);
}

function provenanceLines({
  designId = null,
  trace = null,
  layoutTemplate = null,
  renderIntent = null,
  sheetSetPlan = null,
  projectContext = {},
} = {}) {
  return normalizeItems([
    designId ? `Design: ${designId}` : null,
    trace?.traceId ? `Trace: ${trace.traceId}` : null,
    trace?.runId ? `Run: ${trace.runId}` : null,
    layoutTemplate ? `Layout: ${layoutTemplate}` : null,
    renderIntent ? `Render intent: ${renderIntent}` : null,
    projectContext?.geometryHash
      ? `Geometry: ${projectContext.geometryHash}`
      : null,
    sheetSetPlan?.reason || null,
  ]);
}

function buildSections(input = {}) {
  return [
    {
      title: "Programme Schedule",
      lines: programmeLines(input.masterDNA, input.projectContext),
    },
    {
      title: "Materials / Construction",
      lines: materialLines(input.masterDNA, input.projectContext),
    },
    {
      title: "Climate Pack",
      lines: climateLines(input.locationData, input.projectContext),
    },
    { title: "Regulation Pack", lines: regulationLines(input.projectContext) },
    { title: "QA / Verification", lines: verificationLines(input) },
    { title: "Provenance", lines: provenanceLines(input) },
  ];
}

function wrapText(text = "", maxChars = 72) {
  const words = String(text || "")
    .split(/\s+/)
    .filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines.length ? lines : [""];
}

function renderSection({ section, x, y, width, sectionIndex, sheetWidth }) {
  const scale = physicalScale(sheetWidth);
  const titleFont = fontPx(42, sheetWidth);
  const bodyFont = fontPx(30, sheetWidth);
  const lineHeight = Math.round(bodyFont * 1.42);
  const titleHeight = Math.round(titleFont * 1.45);
  const maxChars = Math.max(28, Math.floor(width / (bodyFont * 0.48)));
  const lines = clipItems(section.lines || [], 18).flatMap((line) =>
    wrapText(line, maxChars),
  );
  const blockHeight = titleHeight + lines.length * lineHeight + 50 * scale;
  const fill = sectionIndex % 2 === 0 ? "#f6f7f4" : "#ffffff";

  let svg = `<g data-section="${escapeXml(section.title)}">`;
  svg += `<rect x="${x}" y="${y}" width="${width}" height="${blockHeight}" rx="${22 * scale}" fill="${fill}" stroke="#1f2a2e" stroke-width="${Math.max(1, 3 * scale)}"/>`;
  svg += `<text x="${x + 32 * scale}" y="${y + 52 * scale}" font-family="${EMBEDDED_FONT_STACK}" font-size="${titleFont}" font-weight="700" fill="#142126">${escapeXml(section.title)}</text>`;
  lines.forEach((line, index) => {
    svg += `<text x="${x + 42 * scale}" y="${y + titleHeight + 46 * scale + index * lineHeight}" font-family="${EMBEDDED_FONT_STACK}" font-size="${bodyFont}" fill="#26363b">${escapeXml(line)}</text>`;
  });
  svg += `</g>`;
  return { svg, height: blockHeight };
}

export function buildA1OverflowSheetSvg({
  width = A1_WIDTH,
  height = A1_HEIGHT,
  sheetId = "A1-02",
  designId = null,
  trace = null,
  layoutTemplate = null,
  renderIntent = "final_a1",
  masterDNA = {},
  projectContext = {},
  locationData = {},
  finalSheetRegression = null,
  postComposeVerification = null,
  glyphIntegrity = null,
  sheetTextContract = null,
  sheetSetPlan = null,
} = {}) {
  const scale = physicalScale(width);
  const margin = Math.round(220 * scale);
  const gutter = Math.round(100 * scale);
  const titleFont = fontPx(72, width);
  const subFont = fontPx(34, width);
  const columnWidth = Math.floor((width - margin * 2 - gutter) / 2);
  const sections = buildSections({
    designId,
    trace,
    layoutTemplate,
    renderIntent,
    masterDNA,
    projectContext,
    locationData,
    finalSheetRegression,
    postComposeVerification,
    glyphIntegrity,
    sheetTextContract,
    sheetSetPlan,
  });

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" data-sheet-id="${sheetId}" data-render-intent="${escapeXml(renderIntent)}">`;
  svg += `<rect width="${width}" height="${height}" fill="#faf9f2"/>`;
  svg += `<rect x="${margin}" y="${margin}" width="${width - margin * 2}" height="${height - margin * 2}" fill="none" stroke="#142126" stroke-width="${Math.max(2, 5 * scale)}"/>`;
  svg += `<text x="${margin + 40 * scale}" y="${margin + 110 * scale}" font-family="${EMBEDDED_FONT_STACK}" font-size="${titleFont}" font-weight="800" fill="#142126">${sheetId} TECHNICAL DATA / QA / PROVENANCE</text>`;
  svg += `<text x="${margin + 42 * scale}" y="${margin + 168 * scale}" font-family="${EMBEDDED_FONT_STACK}" font-size="${subFont}" fill="#526166">Overflow companion sheet generated to preserve A1-01 drawing readability.</text>`;

  const startY = margin + Math.round(260 * scale);
  const positions = [
    { x: margin + Math.round(40 * scale), y: startY },
    { x: margin + Math.round(40 * scale) + columnWidth + gutter, y: startY },
  ];
  sections.forEach((section, index) => {
    const column = index % 2;
    const rendered = renderSection({
      section,
      x: positions[column].x,
      y: positions[column].y,
      width: columnWidth,
      sectionIndex: index,
      sheetWidth: width,
    });
    svg += rendered.svg;
    positions[column].y += rendered.height + Math.round(60 * scale);
  });

  svg += `<text x="${width - margin - 620 * scale}" y="${height - margin + 88 * scale}" font-family="${EMBEDDED_FONT_STACK}" font-size="${fontPx(34, width)}" font-weight="700" fill="#142126">${sheetId}</text>`;
  svg += `</svg>`;
  return svg;
}

export async function writeA1OverflowSheetArtifacts({
  sharp,
  width = A1_WIDTH,
  height = A1_HEIGHT,
  outputDir,
  publicUrlBase = DEFAULT_PUBLIC_URL_BASE,
  designId = "unknown",
  buildPdfFromPng = null,
  dpi = 300,
  ...svgInput
} = {}) {
  if (!sharp) {
    return {
      version: "phase22-a1-overflow-sheet-artifacts-v1",
      generated: false,
      error: "SHARP_REQUIRED",
    };
  }
  if (!outputDir) {
    return {
      version: "phase22-a1-overflow-sheet-artifacts-v1",
      generated: false,
      error: "OUTPUT_DIR_REQUIRED",
    };
  }

  const sheetId = "A1-02";
  const rawSvg = buildA1OverflowSheetSvg({
    width,
    height,
    sheetId,
    designId,
    ...svgInput,
  });
  const { svgString: preparedSvg, textRenderStatus: overflowTextRenderStatus } =
    await prepareFinalSheetSvgForRasterizationWithReport(rawSvg, {
      minimumFontSizePx: FINAL_SHEET_MIN_FONT_SIZE_PX,
      textToPath: true,
    });
  if (
    overflowTextRenderStatus?.status === "blocked" ||
    overflowTextRenderStatus?.rasterSafe === false
  ) {
    throw new Error(
      `A1-02 overflow sheet text-to-path conversion failed: ${
        (overflowTextRenderStatus.blockers || []).join("; ") ||
        "raster-safe text conversion unavailable"
      }`,
    );
  }
  const pngBuffer = await sharp(Buffer.from(preparedSvg, "utf8"))
    .png()
    .toBuffer();
  const safeDesignId = sanitizeIdentifier(designId);
  const hash = crypto
    .createHash("md5")
    .update(pngBuffer)
    .digest("hex")
    .slice(0, 8);
  const timestamp = Date.now();
  const pngOutputFile = `a1-02-${safeDesignId}-${timestamp}-${hash}.png`;
  const pdfOutputFile = `a1-02-${safeDesignId}-${timestamp}-${hash}.pdf`;
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, pngOutputFile), pngBuffer);

  let pdfBytes = 0;
  let pdfUrl = null;
  if (typeof buildPdfFromPng === "function") {
    const pdfBuffer = await buildPdfFromPng(pngBuffer, {
      widthPx: width,
      heightPx: height,
      dpi,
    });
    pdfBytes = pdfBuffer.length;
    fs.writeFileSync(path.join(outputDir, pdfOutputFile), pdfBuffer);
    pdfUrl = `${String(publicUrlBase || DEFAULT_PUBLIC_URL_BASE).replace(/\/$/, "")}/${pdfOutputFile}`;
  }

  const base = String(publicUrlBase || DEFAULT_PUBLIC_URL_BASE).replace(
    /\/$/,
    "",
  );
  return {
    version: "phase22-a1-overflow-sheet-artifacts-v1",
    generated: true,
    sheetId,
    pngUrl: `${base}/${pngOutputFile}`,
    pdfUrl,
    pngOutputFile: path.join(outputDir, pngOutputFile),
    pdfOutputFile: pdfUrl ? path.join(outputDir, pdfOutputFile) : null,
    pngBytes: pngBuffer.length,
    pdfBytes,
    dimensions: { width, height },
    previewDimensions:
      width === WORKING_WIDTH && height === WORKING_HEIGHT
        ? { width: WORKING_WIDTH, height: WORKING_HEIGHT }
        : null,
  };
}

export default {
  buildA1OverflowSheetSvg,
  writeA1OverflowSheetArtifacts,
};
