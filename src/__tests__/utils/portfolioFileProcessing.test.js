const mockExtractPdfPortfolioEvidence = jest.fn();

jest.mock("../../utils/pdfToImages.js", () => ({
  PDF_TEXT_NOT_SELECTABLE: "PDF_TEXT_NOT_SELECTABLE",
  extractPdfPortfolioEvidence: (...args) =>
    mockExtractPdfPortfolioEvidence(...args),
}));

import {
  processPortfolioUploadFiles,
  releasePortfolioFilePreviewUrls,
} from "../../utils/portfolioFileProcessing.js";

function makePdfEvidence(overrides = {}) {
  return {
    fileName: "reference.pdf",
    mimeType: "application/pdf",
    pageCount: 2,
    thumbnails: [
      {
        pageNumber: 1,
        pageIndex: 0,
        width: 320,
        height: 420,
        byteLength: 1024,
        preview: "blob:pdf-page-1",
        blob: new Blob(["png"], { type: "image/png" }),
      },
    ],
    text: {
      extracted: true,
      charCount: 64,
      sample: "timber school section",
      pageCharCounts: [{ pageNumber: 1, charCount: 64 }],
    },
    sourceGaps: [],
    portfolioStyleEvidence: {
      source: "pdf_selectable_text",
      materials: ["timber"],
      colours: [],
      styleKeywords: [],
      presentationKeywords: ["section"],
      buildingTypes: ["school"],
      drawingTypes: ["section"],
    },
    ...overrides,
  };
}

describe("portfolio file processing", () => {
  beforeEach(() => {
    mockExtractPdfPortfolioEvidence.mockReset();
    global.URL.createObjectURL = jest.fn(() => "blob:image-preview");
    global.URL.revokeObjectURL = jest.fn();
  });

  test("processes PDF-only uploads without storing raw PDF bytes or base64", async () => {
    mockExtractPdfPortfolioEvidence.mockResolvedValue(makePdfEvidence());
    const pdf = new File(["raw-pdf-bytes"], "reference.pdf", {
      type: "application/pdf",
    });

    const { processedFiles, errors } = await processPortfolioUploadFiles([pdf]);

    expect(errors).toEqual([]);
    expect(processedFiles).toHaveLength(1);
    expect(processedFiles[0]).toEqual(
      expect.objectContaining({
        name: "reference.pdf",
        type: "application/pdf",
        file: null,
        dataUrl: null,
        preview: "blob:pdf-page-1",
        isPdf: true,
      }),
    );
    expect(processedFiles[0].pdf).toEqual(
      expect.objectContaining({
        pageCount: 2,
        textExtracted: true,
        textCharCount: 64,
      }),
    );
    expect(JSON.stringify(processedFiles[0])).not.toMatch(
      /data:application\/pdf|raw-pdf-bytes/i,
    );
  });

  test("processes mixed image and PDF uploads", async () => {
    mockExtractPdfPortfolioEvidence.mockResolvedValue(makePdfEvidence());
    const image = new File(["image-bytes"], "front.png", {
      type: "image/png",
    });
    const pdf = new File(["pdf-bytes"], "reference.pdf", {
      type: "application/pdf",
    });

    const { processedFiles, errors } = await processPortfolioUploadFiles([
      image,
      pdf,
    ]);

    expect(errors).toEqual([]);
    expect(processedFiles).toHaveLength(2);
    expect(processedFiles[0]).toEqual(
      expect.objectContaining({
        name: "front.png",
        type: "image/png",
        isPdf: false,
      }),
    );
    expect(processedFiles[0].dataUrl).toMatch(/^data:image\/png;base64,/);
    expect(processedFiles[1]).toEqual(
      expect.objectContaining({
        name: "reference.pdf",
        type: "application/pdf",
        dataUrl: null,
        isPdf: true,
      }),
    );
  });

  test("revokes PDF preview and page thumbnail object URLs", () => {
    releasePortfolioFilePreviewUrls({
      preview: "blob:pdf-page-1",
      thumbnails: [{ preview: "blob:pdf-page-1" }, { preview: "blob:pdf-2" }],
    });

    expect(global.URL.revokeObjectURL).toHaveBeenCalledTimes(2);
    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith("blob:pdf-page-1");
    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith("blob:pdf-2");
  });
});
