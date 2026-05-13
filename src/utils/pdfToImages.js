/**
 * PDF portfolio utilities (client-side).
 *
 * Uses pdfjs selectable text and page rendering only. OCR is intentionally not
 * used: image-only PDFs receive a sourceGap so downstream style prompts cannot
 * invent evidence.
 *
 * pdfjs-dist is loaded lazily on first PDF read — it's ~470 KB raw / ~140 KB
 * gzipped and is only needed for the optional portfolio-PDF upload path.
 */

export const PDF_TEXT_NOT_SELECTABLE = "PDF_TEXT_NOT_SELECTABLE";

const PDF_WORKER_FILE = "/pdf.worker.min.mjs";

let _pdfjsPromise = null;
async function loadPdfjs() {
  if (!_pdfjsPromise) {
    _pdfjsPromise = import(
      /* webpackChunkName: "pdfjs-dist" */ "pdfjs-dist/build/pdf.mjs"
    ).then((mod) => {
      if (
        typeof window !== "undefined" &&
        mod.GlobalWorkerOptions &&
        !mod.GlobalWorkerOptions.workerSrc
      ) {
        mod.GlobalWorkerOptions.workerSrc = `${window.location.origin}${PDF_WORKER_FILE}`;
      }
      return mod;
    });
  }
  return _pdfjsPromise;
}
const DEFAULT_THUMBNAIL_PAGES = 3;
const DEFAULT_THUMBNAIL_MAX_SIZE = 900;
const TEXT_SAMPLE_LIMIT = 700;

const KEYWORD_GROUPS = Object.freeze({
  materials: [
    "brick",
    "timber",
    "wood",
    "concrete",
    "stone",
    "glass",
    "steel",
    "zinc",
    "copper",
    "render",
    "stucco",
    "terracotta",
    "tile",
    "slate",
    "aluminium",
    "aluminum",
    "corten",
    "rammed earth",
  ],
  colours: [
    "white",
    "black",
    "grey",
    "gray",
    "red",
    "brown",
    "blue",
    "green",
    "cream",
    "beige",
    "ochre",
    "bronze",
    "terracotta",
  ],
  styleKeywords: [
    "modern",
    "contemporary",
    "minimal",
    "minimalist",
    "brutalist",
    "vernacular",
    "industrial",
    "scandinavian",
    "mediterranean",
    "victorian",
    "georgian",
    "art deco",
    "biophilic",
    "passive",
    "low-carbon",
    "modular",
    "courtyard",
    "atrium",
  ],
  presentationKeywords: [
    "axonometric",
    "isometric",
    "section",
    "elevation",
    "plan",
    "diagram",
    "render",
    "rendering",
    "collage",
    "presentation board",
    "exploded",
  ],
  buildingTypes: [
    "office",
    "school",
    "clinic",
    "hospital",
    "hotel",
    "warehouse",
    "retail",
    "museum",
    "library",
    "university",
    "kindergarten",
    "house",
    "apartment",
  ],
  drawingTypes: [
    "site plan",
    "floor plan",
    "plan",
    "section",
    "elevation",
    "axonometric",
    "isometric",
    "detail",
    "schedule",
    "diagram",
  ],
});

function compactText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values = []) {
  return [...new Set(values.map(compactText).filter(Boolean))];
}

function findTerms(text, terms) {
  const haystack = ` ${compactText(text).toLowerCase()} `;
  return unique(
    terms.filter((term) => {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i");
      return re.test(haystack);
    }),
  );
}

export function extractPortfolioEvidenceFromPdfText(text = "") {
  const compact = compactText(text);
  return {
    source: "pdf_selectable_text",
    materials: findTerms(compact, KEYWORD_GROUPS.materials),
    colours: findTerms(compact, KEYWORD_GROUPS.colours),
    styleKeywords: findTerms(compact, KEYWORD_GROUPS.styleKeywords),
    presentationKeywords: findTerms(
      compact,
      KEYWORD_GROUPS.presentationKeywords,
    ),
    buildingTypes: findTerms(compact, KEYWORD_GROUPS.buildingTypes),
    drawingTypes: findTerms(compact, KEYWORD_GROUPS.drawingTypes),
  };
}

async function loadPdfDocument(pdfFile) {
  const pdfjsLib = await loadPdfjs();
  const arrayBuffer = await pdfFile.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  return loadingTask.promise;
}

function scaleViewport(page, maxSize) {
  const viewport = page.getViewport({ scale: 1.0 });
  const scale = Math.min(maxSize / viewport.width, maxSize / viewport.height);
  return page.getViewport({ scale: Number.isFinite(scale) ? scale : 1 });
}

async function canvasToPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Failed to convert canvas to blob"));
      },
      "image/png",
      0.92,
    );
  });
}

async function renderPdfPageThumbnail(page, pageNumber, maxSize) {
  const viewport = scaleViewport(page, maxSize);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: context, viewport }).promise;
  const blob = await canvasToPngBlob(canvas);
  const preview =
    typeof URL !== "undefined" && typeof URL.createObjectURL === "function"
      ? URL.createObjectURL(blob)
      : null;
  return {
    pageNumber,
    pageIndex: pageNumber - 1,
    width: Math.round(viewport.width),
    height: Math.round(viewport.height),
    byteLength: blob.size || null,
    preview,
    blob,
  };
}

async function extractSelectableText(pdf) {
  const pageTexts = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    // eslint-disable-next-line no-await-in-loop
    const page = await pdf.getPage(pageNumber);
    // eslint-disable-next-line no-await-in-loop
    const textContent = await page.getTextContent();
    const pageText = compactText(
      (textContent?.items || []).map((item) => item.str || "").join(" "),
    );
    pageTexts.push({ pageNumber, text: pageText, charCount: pageText.length });
  }
  const fullText = compactText(pageTexts.map((page) => page.text).join(" "));
  return {
    fullText,
    pageTexts,
    charCount: fullText.length,
  };
}

export async function extractPdfPortfolioEvidence(
  pdfFile,
  {
    maxThumbnailPages = DEFAULT_THUMBNAIL_PAGES,
    thumbnailMaxSize = DEFAULT_THUMBNAIL_MAX_SIZE,
  } = {},
) {
  if (!pdfFile) {
    throw new Error("PDF file is required");
  }
  const pdf = await loadPdfDocument(pdfFile);
  const pageCount = Number(pdf.numPages || 0);
  const selectableText = await extractSelectableText(pdf);
  const textExtracted = selectableText.charCount > 0;
  const sourceGaps = textExtracted
    ? []
    : [
        {
          code: PDF_TEXT_NOT_SELECTABLE,
          severity: "warning",
          message:
            "PDF contains no selectable text; OCR is disabled so portfolio evidence is image-only.",
        },
      ];
  const thumbnails = [];
  const thumbnailCount = Math.min(
    Math.max(0, Number(maxThumbnailPages) || 0),
    pageCount,
  );
  for (let pageNumber = 1; pageNumber <= thumbnailCount; pageNumber += 1) {
    // eslint-disable-next-line no-await-in-loop
    const page = await pdf.getPage(pageNumber);
    // eslint-disable-next-line no-await-in-loop
    thumbnails.push(
      await renderPdfPageThumbnail(page, pageNumber, thumbnailMaxSize),
    );
  }
  const portfolioStyleEvidence = textExtracted
    ? extractPortfolioEvidenceFromPdfText(selectableText.fullText)
    : {
        source: "pdf_image_only",
        materials: [],
        colours: [],
        styleKeywords: [],
        presentationKeywords: [],
        buildingTypes: [],
        drawingTypes: [],
      };

  return {
    fileName: pdfFile.name || "portfolio.pdf",
    mimeType: pdfFile.type || "application/pdf",
    pageCount,
    thumbnails,
    text: {
      extracted: textExtracted,
      charCount: selectableText.charCount,
      pageCharCounts: selectableText.pageTexts.map((page) => ({
        pageNumber: page.pageNumber,
        charCount: page.charCount,
      })),
      sample: selectableText.fullText.slice(0, TEXT_SAMPLE_LIMIT),
    },
    sourceGaps,
    portfolioStyleEvidence,
  };
}

/**
 * Convert PDF file to PNG image (first page).
 * Kept for legacy callers; new portfolio flow uses extractPdfPortfolioEvidence.
 */
export async function convertPdfToImage(pdfFile, maxSize = 2048) {
  const evidence = await extractPdfPortfolioEvidence(pdfFile, {
    maxThumbnailPages: 1,
    thumbnailMaxSize: maxSize,
  });
  const first = evidence.thumbnails[0];
  if (!first?.blob) {
    throw new Error("PDF conversion failed: no thumbnail rendered");
  }
  if (
    first.preview &&
    typeof URL !== "undefined" &&
    typeof URL.revokeObjectURL === "function"
  ) {
    URL.revokeObjectURL(first.preview);
  }
  return first.blob;
}

/**
 * Convert PDF File object to PNG File object.
 * Kept for backwards compatibility with existing tests/callers.
 */
export async function convertPdfFileToImageFile(pdfFile) {
  const blob = await convertPdfToImage(pdfFile);
  const fileName = pdfFile.name.replace(/\.pdf$/i, ".png");
  return new File([blob], fileName, { type: "image/png" });
}
