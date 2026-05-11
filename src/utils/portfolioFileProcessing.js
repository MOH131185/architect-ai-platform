import {
  extractPdfPortfolioEvidence,
  PDF_TEXT_NOT_SELECTABLE,
} from "./pdfToImages.js";

const DEFAULT_MAX_PDF_THUMBNAIL_PAGES = 3;

function isPdfFile(file) {
  return (
    file?.type === "application/pdf" ||
    String(file?.name || "")
      .toLowerCase()
      .endsWith(".pdf")
  );
}

function isImageFile(file) {
  return String(file?.type || "").startsWith("image/");
}

function formatFileSize(size = 0) {
  return `${(Number(size || 0) / 1024 / 1024).toFixed(2)} MB`;
}

function createObjectUrl(blob) {
  if (
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function" ||
    !blob
  ) {
    return null;
  }
  return URL.createObjectURL(blob);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(reader.error || new Error("File read failed"));
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

function stripThumbnailBlob(thumbnail = {}) {
  return {
    pageNumber: thumbnail.pageNumber,
    pageIndex: thumbnail.pageIndex,
    width: thumbnail.width,
    height: thumbnail.height,
    byteLength: thumbnail.byteLength,
    preview: thumbnail.preview || null,
  };
}

function buildPdfRecord(file, evidence) {
  const thumbnails = (evidence.thumbnails || []).map(stripThumbnailBlob);
  const firstPreview = thumbnails.find((thumbnail) => thumbnail.preview);
  return {
    name: file.name || evidence.fileName || "portfolio.pdf",
    size: formatFileSize(file.size),
    type: "application/pdf",
    file: null,
    dataUrl: null,
    preview: firstPreview?.preview || null,
    isPdf: true,
    convertedFromPdf: false,
    thumbnails,
    pdf: {
      pageCount: evidence.pageCount,
      textExtracted: evidence.text?.extracted === true,
      textCharCount: Number(evidence.text?.charCount || 0),
      textSample: String(evidence.text?.sample || "").slice(0, 700),
      pageCharCounts: evidence.text?.pageCharCounts || [],
      sourceGaps: evidence.sourceGaps || [],
    },
    sourceGaps: evidence.sourceGaps || [],
    portfolioStyleEvidence: evidence.portfolioStyleEvidence || null,
  };
}

export function releasePortfolioFilePreviewUrls(record) {
  if (!record) return;
  const urls = new Set();
  if (record.preview) urls.add(record.preview);
  (record.thumbnails || []).forEach((thumbnail) => {
    if (thumbnail?.preview) urls.add(thumbnail.preview);
  });
  urls.forEach((url) => {
    if (typeof url !== "string" || !url.startsWith("blob:")) return;
    try {
      URL.revokeObjectURL(url);
    } catch {
      // Object URL cleanup must never break navigation or state reset.
    }
  });
}

export async function processPortfolioFile(file, options = {}) {
  if (!file) return null;

  if (isPdfFile(file)) {
    const evidence = await extractPdfPortfolioEvidence(file, {
      maxThumbnailPages:
        options.maxPdfThumbnailPages ?? DEFAULT_MAX_PDF_THUMBNAIL_PAGES,
      thumbnailMaxSize: options.pdfThumbnailMaxSize,
    });
    return buildPdfRecord(file, evidence);
  }

  if (isImageFile(file)) {
    const preview = createObjectUrl(file);
    const dataUrl = await readFileAsDataUrl(file);
    return {
      name: file.name,
      size: formatFileSize(file.size),
      type: file.type,
      file,
      preview,
      dataUrl,
      isPdf: false,
      convertedFromPdf: false,
      sourceGaps: [],
      portfolioStyleEvidence: null,
    };
  }

  throw new Error(`Unsupported portfolio file type: ${file.type || file.name}`);
}

export async function processPortfolioUploadFiles(files = [], options = {}) {
  const processedFiles = [];
  const errors = [];

  for (const file of Array.from(files || [])) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const processed = await processPortfolioFile(file, options);
      if (processed) processedFiles.push(processed);
    } catch (error) {
      errors.push({
        fileName: file?.name || "unknown",
        message: error?.message || "Portfolio file could not be processed",
        code: isPdfFile(file)
          ? "PDF_PROCESSING_FAILED"
          : "FILE_PROCESSING_FAILED",
      });
    }
  }

  return { processedFiles, errors };
}

export { PDF_TEXT_NOT_SELECTABLE };
