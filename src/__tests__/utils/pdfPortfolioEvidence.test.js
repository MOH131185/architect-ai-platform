const mockGetDocument = jest.fn();

jest.mock("pdfjs-dist/build/pdf.mjs", () => ({
  GlobalWorkerOptions: {},
  getDocument: (...args) => mockGetDocument(...args),
}));

import {
  extractPdfPortfolioEvidence,
  PDF_TEXT_NOT_SELECTABLE,
} from "../../utils/pdfToImages.js";

function makePdfFile(name = "portfolio.pdf") {
  return {
    name,
    type: "application/pdf",
    size: 128,
    arrayBuffer: jest.fn(async () => new ArrayBuffer(8)),
  };
}

function installPdfDocument(textPages = []) {
  const pages = textPages.map((text) => ({
    getViewport: jest.fn(({ scale }) => ({
      width: 600 * scale,
      height: 800 * scale,
    })),
    getTextContent: jest.fn(async () => ({
      items: String(text || "")
        .split(/\s+/)
        .filter(Boolean)
        .map((str) => ({ str })),
    })),
    render: jest.fn(() => ({ promise: Promise.resolve() })),
  }));
  const pdf = {
    numPages: pages.length,
    getPage: jest.fn(async (pageNumber) => pages[pageNumber - 1]),
  };
  mockGetDocument.mockReturnValue({ promise: Promise.resolve(pdf) });
  return { pdf, pages };
}

describe("PDF portfolio evidence extraction", () => {
  beforeEach(() => {
    mockGetDocument.mockReset();
    global.URL.createObjectURL = jest.fn(
      (_blob) =>
        `blob:pdf-thumb-${global.URL.createObjectURL.mock.calls.length}`,
    );
    HTMLCanvasElement.prototype.getContext = jest.fn(() => ({}));
    HTMLCanvasElement.prototype.toBlob = jest.fn((callback) => {
      callback(new Blob(["png"], { type: "image/png" }));
    });
  });

  test("extracts selectable text, page thumbnails, and compact style evidence", async () => {
    const { pdf } = installPdfDocument([
      "Biophilic school axonometric with timber structure and green courtyard.",
      "Concrete section and elevation studies for university learning spaces.",
      "Presentation board with floor plan diagrams.",
    ]);

    const evidence = await extractPdfPortfolioEvidence(makePdfFile(), {
      maxThumbnailPages: 2,
      thumbnailMaxSize: 400,
    });

    expect(pdf.getPage).toHaveBeenCalledWith(1);
    expect(pdf.getPage).toHaveBeenCalledWith(2);
    expect(evidence.pageCount).toBe(3);
    expect(evidence.thumbnails).toHaveLength(2);
    expect(evidence.text.extracted).toBe(true);
    expect(evidence.sourceGaps).toEqual([]);
    expect(evidence.portfolioStyleEvidence.materials).toEqual(
      expect.arrayContaining(["timber", "concrete"]),
    );
    expect(evidence.portfolioStyleEvidence.colours).toEqual(
      expect.arrayContaining(["green"]),
    );
    expect(evidence.portfolioStyleEvidence.styleKeywords).toEqual(
      expect.arrayContaining(["biophilic"]),
    );
    expect(evidence.portfolioStyleEvidence.presentationKeywords).toEqual(
      expect.arrayContaining(["axonometric", "section", "elevation"]),
    );
    expect(evidence.portfolioStyleEvidence.buildingTypes).toEqual(
      expect.arrayContaining(["school", "university"]),
    );
    expect(evidence.portfolioStyleEvidence.drawingTypes).toEqual(
      expect.arrayContaining(["section", "elevation", "floor plan"]),
    );
  });

  test("marks image-only PDFs with a source gap and no invented evidence", async () => {
    installPdfDocument(["", ""]);

    const evidence = await extractPdfPortfolioEvidence(makePdfFile(), {
      maxThumbnailPages: 1,
    });

    expect(evidence.text.extracted).toBe(false);
    expect(evidence.sourceGaps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: PDF_TEXT_NOT_SELECTABLE }),
      ]),
    );
    expect(evidence.portfolioStyleEvidence.materials).toEqual([]);
    expect(evidence.portfolioStyleEvidence.styleKeywords).toEqual([]);
  });
});
