import designHistoryRepository from "../../services/designHistoryRepository.js";
import designHistoryArtifactStore, {
  isDesignHistoryArtifactUrl,
  resolveDesignHistoryArtifactUrlToObjectUrl,
} from "../../services/designHistoryArtifactStore.js";
import { buildSheetResultFromDesignHistoryEntry } from "../../services/designHistoryResultHydrator.js";

jest.mock("../../utils/logger.js", () => ({
  info: jest.fn(),
  success: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const pngDataUrl = `data:image/png;base64,${Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]).toString("base64")}`;
const pdfDataUrl = `data:application/pdf;base64,${Buffer.from(
  "%PDF-1.7\n",
  "utf8",
).toString("base64")}`;
const panelSvg =
  '<svg xmlns="http://www.w3.org/2000/svg"><rect width="100" height="50"/></svg>';

describe("design history result hydration", () => {
  const createdBlobs = [];

  beforeEach(async () => {
    createdBlobs.length = 0;
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: jest.fn((blob) => {
        createdBlobs.push(blob);
        return `blob:history-artifact-${createdBlobs.length}`;
      }),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      writable: true,
      value: jest.fn(),
    });

    window.localStorage.clear();
    await designHistoryRepository.clearAllDesigns();
    await designHistoryArtifactStore.clearAllArtifacts();
  });

  it("rehydrates a saved A1 result and resolves artifact URLs from a fresh history read", async () => {
    await designHistoryRepository.saveDesign({
      designId: "restore_design",
      resultUrl: pngDataUrl,
      composedSheetUrl: pngDataUrl,
      pdfUrl: pdfDataUrl,
      sheetMetadata: {
        width: 1792,
        height: 1269,
        exportGate: { allowed: true },
        geometryHash: "geometry-hash-restore",
      },
      panelMap: {
        site_context: {
          label: "Site Context",
          imageUrl: pngDataUrl,
          svgString: panelSvg,
          width: 100,
          height: 50,
          metadata: { geometryHash: "geometry-hash-restore" },
        },
      },
      a1Sheet: {
        sheetId: "default",
        url: pngDataUrl,
        composedSheetUrl: pngDataUrl,
        pdfUrl: pdfDataUrl,
        metadata: {
          width: 1792,
          height: 1269,
          exportGate: { allowed: true },
          geometryHash: "geometry-hash-restore",
        },
        panelMap: {
          site_context: {
            label: "Site Context",
            imageUrl: pngDataUrl,
            width: 100,
            height: 50,
          },
        },
      },
    });

    const rawHistory = window.localStorage.getItem("archiAI_design_history");
    const storedDesign =
      await designHistoryRepository.getDesignById("restore_design");
    const restoredResult = buildSheetResultFromDesignHistoryEntry(storedDesign);

    expect(rawHistory).toBeTruthy();
    expect(rawHistory).not.toContain("data:image");
    expect(rawHistory).not.toContain("data:application/pdf");
    expect(restoredResult.restoredFromHistory).toBe(true);
    expect(isDesignHistoryArtifactUrl(restoredResult.a1Sheet.url)).toBe(true);
    expect(isDesignHistoryArtifactUrl(restoredResult.pdfUrl)).toBe(true);
    expect(
      isDesignHistoryArtifactUrl(restoredResult.panelMap.site_context.imageUrl),
    ).toBe(true);
    expect(restoredResult.panelsByKey.site_context.label).toBe("Site Context");
    expect(restoredResult.panels).toHaveLength(1);
    expect(restoredResult.metadata.exportGate.allowed).toBe(true);

    await expect(
      resolveDesignHistoryArtifactUrlToObjectUrl(restoredResult.a1Sheet.url),
    ).resolves.toBe("blob:history-artifact-1");
    await expect(
      resolveDesignHistoryArtifactUrlToObjectUrl(
        restoredResult.panelMap.site_context.imageUrl,
      ),
    ).resolves.toBe("blob:history-artifact-2");
    await expect(
      resolveDesignHistoryArtifactUrlToObjectUrl(restoredResult.pdfUrl),
    ).resolves.toBe("blob:history-artifact-3");

    expect(createdBlobs.map((blob) => blob.type)).toEqual([
      "image/png",
      "image/png",
      "application/pdf",
    ]);
  });
});
