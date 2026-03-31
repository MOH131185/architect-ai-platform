import designHistoryRepository from "../../services/designHistoryRepository.js";
import { StorageManager } from "../../utils/storageManager.js";

jest.mock("../../utils/logger.js", () => ({
  info: jest.fn(),
  success: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

class QuotaAwareStorageMock {
  constructor(limitBytes) {
    this.limitBytes = limitBytes;
    this.store = {};
  }

  getItem(key) {
    return Object.prototype.hasOwnProperty.call(this.store, key)
      ? this.store[key]
      : null;
  }

  setItem(key, value) {
    const serialized = String(value);
    const totalSize = Object.values(this.store).reduce(
      (sum, entry) => sum + String(entry).length,
      0,
    );

    // Deliberately pessimistic overwrite behavior to exercise same-key recovery.
    if (totalSize + serialized.length > this.limitBytes) {
      const error = new Error("Quota exceeded");
      error.name = "QuotaExceededError";
      throw error;
    }

    this.store[key] = serialized;
  }

  removeItem(key) {
    delete this.store[key];
  }

  clear() {
    this.store = {};
  }

  key(index) {
    return Object.keys(this.store)[index] || null;
  }

  get length() {
    return Object.keys(this.store).length;
  }
}

function installStorageMock(limitBytes) {
  const mock = new QuotaAwareStorageMock(limitBytes);
  Object.defineProperty(window, "localStorage", {
    value: mock,
    configurable: true,
    writable: true,
  });
  global.localStorage = mock;
  return mock;
}

function buildLargeDataUrl(sizeKB = 256) {
  return `data:image/png;base64,${"A".repeat(sizeKB * 1024)}`;
}

function buildLargePanelMap(imageUrl, count = 12) {
  return Object.fromEntries(
    Array.from({ length: count }, (_, index) => [
      `panel_${index}`,
      {
        imageUrl,
        seed: index + 1,
        prompt: `High detail architectural panel ${index} `.repeat(40),
        metadata: {
          notes: `Panel metadata ${index} `.repeat(30),
        },
      },
    ]),
  );
}

function buildLargeDesign(index, imageUrl) {
  const panelMap = buildLargePanelMap(imageUrl);

  return {
    designId: `design_${index}`,
    dna: {
      dimensions: { length: 13.3, width: 8.9, height: 6.4, floors: 2 },
      materials: Array.from({ length: 8 }, (_, materialIndex) => ({
        name: `Material ${materialIndex}`,
        hexColor: "#cccccc",
        application: `Application ${materialIndex}`,
      })),
      rooms: Array.from({ length: 10 }, (_, roomIndex) => ({
        name: `Room ${roomIndex}`,
        dimensions: "4m x 4m",
        floor: roomIndex < 5 ? "ground" : "first",
      })),
    },
    basePrompt: `Large design payload ${index}`,
    seed: 1000 + index,
    resultUrl: imageUrl,
    composedSheetUrl: imageUrl,
    panelMap,
    sheetMetadata: {
      width: 1792,
      height: 1269,
      model: "black-forest-labs/FLUX.1-schnell",
      panelMap,
    },
    projectContext: {
      buildingProgram: "detached-house",
      buildingCategory: "residential",
      siteAnalysis: {
        narrative: "Very large site analysis ".repeat(200),
      },
      portfolioBlend: {
        materialWeight: 0.7,
        characteristicWeight: 0.7,
        localStyle: "contemporary",
        climateStyle: "temperate",
        portfolioFiles: Array.from({ length: 6 }, (_, fileIndex) => ({
          name: `portfolio_${fileIndex}.png`,
          size: "0.50 MB",
          type: "image/png",
          dataUrl: imageUrl,
        })),
      },
    },
    locationData: {
      address: "DN15 8BQ",
      coordinates: { lat: 53.5912182, lng: -0.6883197 },
      siteAnalysis: {
        raw: "Location payload ".repeat(200),
      },
      siteMapUrl: imageUrl,
    },
    siteSnapshot: {
      address: "DN15 8BQ",
      coordinates: { lat: 53.5912182, lng: -0.6883197 },
      sitePolygon: [
        { lat: 53.5912, lng: -0.6883 },
        { lat: 53.5913, lng: -0.6883 },
        { lat: 53.5913, lng: -0.6882 },
      ],
      dataUrl: imageUrl,
      metadata: {
        siteMetrics: { area: 255 },
        climateSummary: "Temperate oceanic",
        siteAnalysis: { raw: "Snapshot analysis ".repeat(200) },
      },
    },
  };
}

describe("design history storage hardening", () => {
  beforeEach(async () => {
    installStorageMock(320_000);
    await designHistoryRepository.clearAllDesigns();
    jest.clearAllMocks();
  });

  it("compacts oversized history entries and keeps capped history writable", async () => {
    const imageUrl = buildLargeDataUrl(220);

    await expect(
      designHistoryRepository.saveDesign(buildLargeDesign(1, imageUrl)),
    ).resolves.toBe("design_1");
    await expect(
      designHistoryRepository.saveDesign(buildLargeDesign(2, imageUrl)),
    ).resolves.toBe("design_2");
    await expect(
      designHistoryRepository.saveDesign(buildLargeDesign(3, imageUrl)),
    ).resolves.toBe("design_3");

    const rawHistory = window.localStorage.getItem("archiAI_design_history");
    const designs = await designHistoryRepository.listDesigns();
    const storedDesign =
      await designHistoryRepository.getDesignById("design_3");
    const storedPortfolioFiles =
      storedDesign.projectContext?.portfolioBlend?.portfolioFiles || [];

    expect(rawHistory).toBeTruthy();
    expect(rawHistory.length).toBeLessThan(320_000);
    expect(designs).toHaveLength(2);
    expect(storedDesign.resultUrl.startsWith("data:")).toBe(false);
    expect(
      storedPortfolioFiles.every((file) => file?.dataUrl === undefined),
    ).toBe(true);
  });

  it("recovers same-key overwrites by removing the previous value first", async () => {
    installStorageMock(2_100);
    const manager = new StorageManager(50, 10);

    await expect(
      manager.setItem(
        "design_history",
        { payload: "x".repeat(700) },
        { addTimestamp: false },
      ),
    ).resolves.toBe(true);

    await expect(
      manager.setItem(
        "design_history",
        { payload: "y".repeat(1_100) },
        { addTimestamp: false },
      ),
    ).resolves.toBe(true);

    const stored = JSON.parse(
      window.localStorage.getItem("archiAI_design_history"),
    );
    expect(stored.payload).toHaveLength(1_100);
  });
});
