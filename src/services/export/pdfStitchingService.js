/* global globalThis */

export const PDF_STITCHING_SERVICE_VERSION = "pdf-stitching-service-v1";
export const PDF_STITCHING_STRATEGY = "existing-pdfs-cover-index-sorted-v1";
export const PDF_STITCHING_UNAVAILABLE = "PDF_STITCHING_UNAVAILABLE";
export const PDF_STITCHING_FAILED = "PDF_STITCHING_FAILED";
export const PDF_STITCHING_NO_INPUT_PDFS = "PDF_STITCHING_NO_INPUT_PDFS";

const FIXED_PDF_DATE = new Date("1980-01-01T00:00:00.000Z");
const COVER_PAGE_SIZE = [595.28, 841.89];

function utf8Bytes(value) {
  const text = String(value ?? "");
  const Encoder = globalThis.TextEncoder;
  if (typeof Encoder === "function") return new Encoder().encode(text);
  const BufferCtor = globalThis.Buffer;
  if (BufferCtor?.from) return new Uint8Array(BufferCtor.from(text, "utf8"));
  const encoded = unescape(encodeURIComponent(text));
  const out = new Uint8Array(encoded.length);
  for (let i = 0; i < encoded.length; i += 1) out[i] = encoded.charCodeAt(i);
  return out;
}

function dataUriToBytes(value) {
  const comma = value.indexOf(",");
  if (comma === -1) return utf8Bytes(value);
  const meta = value.slice(0, comma).toLowerCase();
  const payload = value.slice(comma + 1);
  if (!meta.includes(";base64")) return utf8Bytes(decodeURIComponent(payload));
  const BufferCtor = globalThis.Buffer;
  if (BufferCtor?.from)
    return new Uint8Array(BufferCtor.from(payload, "base64"));
  const binary = globalThis.atob(payload);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

function normalizeBytes(value) {
  if (value == null) return null;
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (typeof value === "object" && Array.isArray(value.data)) {
    return new Uint8Array(value.data);
  }
  if (typeof value === "string") {
    return value.startsWith("data:") ? dataUriToBytes(value) : utf8Bytes(value);
  }
  return utf8Bytes(JSON.stringify(value));
}

function normalizeZipPath(value) {
  return String(value || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/{2,}/g, "/")
    .trim();
}

function safeName(value, fallback = "project") {
  const cleaned = String(value || fallback)
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return cleaned || fallback;
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : Object.values(value);
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

function pdfContent(candidate = {}) {
  return firstValue(
    candidate.bytes,
    candidate.contentBytes,
    candidate.content,
    candidate.dataUrl,
    candidate.dataUri,
    candidate.pdfDataUrl,
    candidate.pdfDataUri,
  );
}

function isPdfCandidate(candidate = {}) {
  const fileName = normalizeZipPath(candidate.fileName).toLowerCase();
  const mimeType = String(candidate.mimeType || "").toLowerCase();
  return (
    mimeType === "application/pdf" ||
    fileName.endsWith(".pdf") ||
    typeof candidate.pdfDataUrl === "string" ||
    typeof candidate.pdfDataUri === "string" ||
    String(candidate.dataUrl || candidate.dataUri || "").startsWith(
      "data:application/pdf",
    )
  );
}

function createPdfInput(candidate, defaults = {}) {
  if (!candidate || !isPdfCandidate({ ...defaults, ...candidate })) {
    return null;
  }
  const content = pdfContent(candidate);
  const bytes = normalizeBytes(content);
  if (!bytes?.byteLength) return null;
  const merged = { ...defaults, ...candidate };
  const fileName = normalizeZipPath(merged.fileName || defaults.fileName);
  if (!fileName) return null;
  return {
    fileName,
    bytes,
    sheetNumber: merged.sheetNumber || merged.sheet_number || null,
    role: merged.role || defaults.role || "pdf_artifact",
    discipline: merged.discipline || defaults.discipline || "architecture",
    source: merged.source || defaults.source || "existing_pdf_artifact",
    stitchOrder: Number.isFinite(Number(merged.stitchOrder))
      ? Number(merged.stitchOrder)
      : Number(defaults.stitchOrder || 1000),
  };
}

function comparePdfInputs(a, b) {
  return (
    a.stitchOrder - b.stitchOrder ||
    String(a.sheetNumber || "").localeCompare(String(b.sheetNumber || "")) ||
    a.fileName.localeCompare(b.fileName)
  );
}

export function collectPackagePdfInputs(input = {}) {
  const artifacts = input.artifacts || {};
  const projectSlug = safeName(
    input.projectName || input.projectId || input.projectGraphId || "project",
  );
  const pdfs = [];
  const seen = new Set();
  const add = (candidate, defaults) => {
    const pdf = createPdfInput(candidate, defaults);
    if (!pdf || seen.has(pdf.fileName)) return;
    seen.add(pdf.fileName);
    pdfs.push(pdf);
  };

  const a1Pdf = input.a1Pdf || artifacts.a1Pdf;
  add(a1Pdf, {
    fileName: `presentation/${projectSlug}-a1-sheet.pdf`,
    role: "a1_sheet",
    discipline: "architecture",
    source: "ProjectGraph A1 PDF artifact",
    stitchOrder: 10,
    sheetNumber: a1Pdf?.sheetNumber || "A1-001",
  });

  for (const drawing of asArray(
    input.technicalDrawings || artifacts.drawings,
  )) {
    const id = safeName(
      drawing.panelType || drawing.type || drawing.artifactId || "technical",
    );
    add(drawing, {
      fileName: `technical/${id}.pdf`,
      role: drawing.role || "technical_drawing",
      discipline: drawing.discipline || "architecture",
      source: drawing.source || "ProjectGraph technical drawing PDF artifact",
      stitchOrder: 20,
    });
  }

  for (const artifact of asArray(
    input.structuralArtifacts || artifacts.structuralArtifacts,
  )) {
    const id = safeName(
      artifact.fileStem || artifact.type || artifact.role || "structural",
    );
    add(artifact, {
      fileName: `technical/${id}.pdf`,
      role: artifact.role || "structural_sheet",
      discipline: "structure",
      source: artifact.source || "Existing structural PDF artifact",
      stitchOrder: 30,
    });
  }

  for (const artifact of asArray(
    input.mepArtifacts || artifacts.mepArtifacts,
  )) {
    const id = safeName(
      artifact.fileStem || artifact.type || artifact.role || "mep",
    );
    add(artifact, {
      fileName: `technical/${id}.pdf`,
      role: artifact.role || "mep_sheet",
      discipline: "mep",
      source: artifact.source || "Existing MEP PDF artifact",
      stitchOrder: 40,
    });
  }

  for (const artifact of asArray(
    input.detailArtifacts || artifacts.detailArtifacts,
  )) {
    const id = safeName(
      artifact.fileStem || artifact.type || artifact.role || "detail",
    );
    add(artifact, {
      fileName: `technical/${id}.pdf`,
      role: artifact.role || "construction_detail",
      discipline: "details",
      source: artifact.source || "Existing detail PDF artifact",
      stitchOrder: 50,
    });
  }

  asArray(input.existingArtifacts).forEach((artifact, index) => {
    add(artifact, {
      fileName:
        artifact.fileName || `presentation/existing-pdf-${index + 1}.pdf`,
      role: artifact.role || "existing_pdf",
      discipline: artifact.discipline || "architecture",
      source: artifact.source || "Existing PDF artifact",
      stitchOrder: Number.isFinite(Number(artifact.stitchOrder))
        ? Number(artifact.stitchOrder)
        : 60,
    });
  });

  return pdfs.sort(comparePdfInputs);
}

async function loadPdfLib() {
  return import("pdf-lib");
}

function applyDeterministicMetadata(pdfDoc, title) {
  pdfDoc.setTitle(title);
  pdfDoc.setSubject(
    "Deterministic deliverables PDF assembled from existing PDFs",
  );
  pdfDoc.setCreator("architect-ai-platform");
  pdfDoc.setProducer(PDF_STITCHING_SERVICE_VERSION);
  pdfDoc.setCreationDate(FIXED_PDF_DATE);
  pdfDoc.setModificationDate(FIXED_PDF_DATE);
  pdfDoc.setKeywords([PDF_STITCHING_STRATEGY]);
}

function drawTextLine(page, text, x, y, options) {
  page.drawText(String(text || ""), {
    x,
    y,
    font: options.font,
    size: options.size,
    color: options.color,
  });
}

async function addCoverPage(pdfDoc, pdfLib, pdfInputs, input, context) {
  const { StandardFonts, rgb } = pdfLib;
  const page = pdfDoc.addPage(COVER_PAGE_SIZE);
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.08, 0.1, 0.12);
  const muted = rgb(0.32, 0.36, 0.42);
  const accent = rgb(0.12, 0.28, 0.55);
  const projectName = input.projectName || input.projectId || "Project";

  drawTextLine(page, "Deliverables PDF Index", 48, 778, {
    font: bold,
    size: 22,
    color: ink,
  });
  drawTextLine(page, String(projectName), 48, 748, {
    font: regular,
    size: 14,
    color: accent,
  });

  const metadataRows = [
    ["Project", context.projectId],
    ["ProjectGraph", context.projectGraphId],
    ["Geometry", context.geometryHash],
    ["Visual", context.visualManifestHash],
    ["Style", context.styleBlendManifestHash],
    ["Jurisdiction", context.jurisdictionId || context.countryCode],
    ["Created at policy", "deterministic-fixed"],
  ].filter(([, value]) => value);

  let y = 704;
  for (const [label, value] of metadataRows) {
    drawTextLine(page, `${label}:`, 48, y, {
      font: bold,
      size: 9,
      color: muted,
    });
    drawTextLine(page, String(value).slice(0, 92), 132, y, {
      font: regular,
      size: 9,
      color: ink,
    });
    y -= 16;
  }

  y -= 16;
  drawTextLine(page, "Included PDF sources", 48, y, {
    font: bold,
    size: 13,
    color: ink,
  });
  y -= 22;

  pdfInputs.forEach((pdf, index) => {
    if (y < 70) return;
    const label = `${index + 1}. ${pdf.sheetNumber ? `${pdf.sheetNumber} - ` : ""}${pdf.fileName}`;
    drawTextLine(page, label.slice(0, 98), 58, y, {
      font: regular,
      size: 9,
      color: ink,
    });
    y -= 14;
  });
}

export async function buildStitchedPdfArtifact(input = {}, context = {}) {
  const projectSlug = safeName(
    input.projectName || input.projectId || context.projectGraphId || "project",
  );
  const fileName = `presentation/${projectSlug}-deliverables.pdf`;
  const pdfInputs = collectPackagePdfInputs(input);

  if (pdfInputs.length === 0) {
    return {
      artifact: null,
      pdfInputs,
      sourceGaps: [
        {
          code: PDF_STITCHING_NO_INPUT_PDFS,
          severity: "info",
          discipline: "architecture",
          fileName,
          omittedByFlag: false,
          message:
            "No existing generated PDF artifacts were supplied; no stitched PDF was created.",
          details: { strategy: PDF_STITCHING_STRATEGY },
        },
      ],
    };
  }

  let pdfLib;
  try {
    pdfLib = await loadPdfLib();
  } catch (error) {
    return {
      artifact: null,
      pdfInputs,
      sourceGaps: [
        {
          code: PDF_STITCHING_UNAVAILABLE,
          severity: "warning",
          discipline: "architecture",
          fileName,
          omittedByFlag: false,
          message:
            "PDF stitching library is unavailable; no stitched PDF was created.",
          details: { error: error.message, strategy: PDF_STITCHING_STRATEGY },
        },
      ],
    };
  }

  try {
    const { PDFDocument } = pdfLib;
    const merged = await PDFDocument.create();
    applyDeterministicMetadata(
      merged,
      `${input.projectName || "Project"} deliverables`,
    );

    if (input.includePdfCoverPage !== false) {
      await addCoverPage(merged, pdfLib, pdfInputs, input, context);
    }

    for (const pdf of pdfInputs) {
      const sourceDoc = await PDFDocument.load(pdf.bytes, {
        ignoreEncryption: false,
      });
      const copiedPages = await merged.copyPages(
        sourceDoc,
        sourceDoc.getPageIndices(),
      );
      copiedPages.forEach((page) => merged.addPage(page));
    }

    const bytes = await merged.save({
      useObjectStreams: false,
      addDefaultPage: false,
    });

    return {
      artifact: {
        type: "stitched_pdf_package",
        fileName,
        mimeType: "application/pdf",
        role: "stitched_deliverables_pdf",
        discipline: "architecture",
        source: "PDF stitching from existing generated PDF artifacts",
        content: bytes,
      },
      pdfInputs,
      sourceGaps: [],
    };
  } catch (error) {
    return {
      artifact: null,
      pdfInputs,
      sourceGaps: [
        {
          code: PDF_STITCHING_FAILED,
          severity: "warning",
          discipline: "architecture",
          fileName,
          omittedByFlag: false,
          message:
            "Existing generated PDFs could not be stitched; original PDFs remain packaged separately.",
          details: {
            error: error.message,
            strategy: PDF_STITCHING_STRATEGY,
            sourceFiles: pdfInputs.map((pdf) => pdf.fileName),
          },
        },
      ],
    };
  }
}

export default {
  PDF_STITCHING_SERVICE_VERSION,
  PDF_STITCHING_STRATEGY,
  PDF_STITCHING_UNAVAILABLE,
  PDF_STITCHING_FAILED,
  PDF_STITCHING_NO_INPUT_PDFS,
  buildStitchedPdfArtifact,
  collectPackagePdfInputs,
};
