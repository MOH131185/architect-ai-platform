import React, { act } from "react";
import { createRoot } from "react-dom/client";
import ArchitectAIWizardContainer, {
  sanitizeProgrammeAreaInput,
} from "../../components/ArchitectAIWizardContainer.jsx";
import { PROJECT_TYPE_ROUTES } from "../../services/project/projectTypeSupportRegistry.js";
import { UK_RESIDENTIAL_V2_PIPELINE_VERSION } from "../../services/project/v2ProjectContracts.js";

let mockInitialProjectDetails;
let mockSiteMetrics;
let mockLastProgramSpaces;
let mockLastProjectDetails;

jest.mock("framer-motion", () => {
  const ReactInner = require("react");
  const createMotionMock = (tagName = "div") => {
    const MotionMock = ReactInner.forwardRef(
      (
        {
          children,
          initial,
          animate,
          exit,
          transition,
          whileHover,
          whileTap,
          variants,
          layout,
          ...props
        },
        ref,
      ) => ReactInner.createElement(tagName, { ref, ...props }, children),
    );
    MotionMock.displayName = `MotionMock.${tagName}`;
    return MotionMock;
  };
  const motionMocks = new Map();
  return {
    motion: new Proxy(
      {},
      {
        get: (_target, property) => {
          const tagName = typeof property === "string" ? property : "div";
          if (!motionMocks.has(tagName)) {
            motionMocks.set(tagName, createMotionMock(tagName));
          }
          return motionMocks.get(tagName);
        },
      },
    ),
    AnimatePresence: ({ children }) => <>{children}</>,
    useMotionValue: () => ({ get: () => 0, set: () => {} }),
    useSpring: (value) => value,
    useTransform: () => 0,
  };
});

jest.mock("../../components/layout", () => ({
  AppShell: ({ children }) => <div>{children}</div>,
  PageTransition: ({ children }) => <div>{children}</div>,
}));

jest.mock("../../components/DesignHistoryMenu.jsx", () => () => null);

jest.mock("../../services/auth/clerkFacade.js", () => ({
  AuthSignInButton: ({ children }) => <>{children}</>,
  AuthSignedIn: ({ children }) => <>{children}</>,
  AuthSignedOut: ({ children }) => <>{children}</>,
  clerkAuthConfigured: false,
}));

jest.mock("../../utils/portfolioFileProcessing.js", () => ({
  processPortfolioUploadFiles: jest.fn(),
  releasePortfolioFilePreviewUrls: jest.fn(),
}));

jest.mock("../../hooks/useArchitectAIWorkflow.js", () => ({
  useArchitectAIWorkflow: () => ({
    loading: false,
    error: null,
    result: null,
    progress: {},
    generateSheet: jest.fn(),
    modifySheetWorkflow: jest.fn(),
    exportSheetWorkflow: jest.fn(),
    loadDesign: jest.fn(),
    listDesigns: jest.fn(() => []),
    clearError: jest.fn(),
    loadDemoResult: jest.fn(),
  }),
}));

jest.mock("../../hooks/useWizardState.js", () => {
  const ReactInner = require("react");
  return {
    useWizardState: () => {
      const [projectDetails, setProjectDetailsState] = ReactInner.useState(
        mockInitialProjectDetails,
      );
      const [programSpaces, setProgramSpacesState] = ReactInner.useState([]);
      const [programWarnings, setProgramWarnings] = ReactInner.useState([]);
      const [isGeneratingSpaces, setIsGeneratingSpaces] =
        ReactInner.useState(false);

      const setProjectDetails = (value) => {
        setProjectDetailsState((prev) => {
          const next = typeof value === "function" ? value(prev) : value;
          mockLastProjectDetails = next;
          return next;
        });
      };

      const setProgramSpaces = (value) => {
        setProgramSpacesState((prev) => {
          const next = typeof value === "function" ? value(prev) : value;
          mockLastProgramSpaces = next;
          return next;
        });
      };

      return {
        currentStep: 4,
        setCurrentStep: jest.fn(),
        address: "10 Downing Street, London, UK",
        setAddress: jest.fn(),
        isDetectingLocation: false,
        setIsDetectingLocation: jest.fn(),
        locationData: {
          coordinates: { lat: 51.5034, lng: -0.1276 },
          address: "10 Downing Street, London, UK",
        },
        setLocationData: jest.fn(),
        sitePolygon: [],
        setSitePolygon: jest.fn(),
        siteMetrics: mockSiteMetrics,
        setSiteMetrics: jest.fn(),
        locationAccuracy: null,
        setLocationAccuracy: jest.fn(),
        portfolioFiles: [],
        setPortfolioFiles: jest.fn(),
        materialWeight: 0.7,
        setMaterialWeight: jest.fn(),
        characteristicWeight: 0.7,
        setCharacteristicWeight: jest.fn(),
        isUploading: false,
        setIsUploading: jest.fn(),
        projectDetails,
        setProjectDetails,
        programSpaces,
        setProgramSpaces,
        programWarnings,
        setProgramWarnings,
        isGeneratingSpaces,
        setIsGeneratingSpaces,
        isDetectingEntrance: false,
        setIsDetectingEntrance: jest.fn(),
        autoDetectResult: null,
        setAutoDetectResult: jest.fn(),
        generatedDesignId: null,
        setGeneratedDesignId: jest.fn(),
      };
    },
  };
});

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function baseProjectDetails(overrides = {}) {
  return {
    category: "commercial",
    subType: "office",
    customNotes: "",
    area: 1200,
    floorCount: 3,
    floorCountLocked: true,
    autoDetectedFloorCount: null,
    floorMetrics: null,
    footprintArea: "",
    entranceDirection: "N",
    entranceManualOverride: true,
    entranceAutoDetected: false,
    entranceConfidence: 1,
    mainEntry: null,
    mainEntryDirection: null,
    mainEntryBearingDeg: null,
    frontageEdgeId: null,
    mainEntryEdgeId: null,
    program: "office",
    qualityTier: "mid",
    pipelineVersion: UK_RESIDENTIAL_V2_PIPELINE_VERSION,
    projectTypeExplicitlySetByUser: true,
    ...overrides,
  };
}

function renderComponent(projectDetails, { siteMetrics = null } = {}) {
  mockInitialProjectDetails = projectDetails;
  mockLastProjectDetails = projectDetails;
  mockLastProgramSpaces = [];
  mockSiteMetrics = siteMetrics;
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<ArchitectAIWizardContainer />);
  });
  return {
    container,
    unmount() {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

async function flushPromises() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function clickGenerate(container) {
  await flushPromises();
  const button = [...container.querySelectorAll("button")].find((entry) =>
    /Generate Program|Compile Program/.test(entry.textContent || ""),
  );
  expect(button).toBeTruthy();
  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
  });
  await flushPromises();
}

function expectProgrammeRows({
  floorCount,
  route = PROJECT_TYPE_ROUTES.PROJECT_GRAPH,
}) {
  expect(mockLastProgramSpaces.length).toBeGreaterThan(0);
  mockLastProgramSpaces.forEach((space) => {
    expect(space).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        name: expect.any(String),
        label: expect.any(String),
        area: expect.any(Number),
        count: expect.any(Number),
        type: expect.any(String),
        category: expect.any(String),
        spaceType: expect.any(String),
        level: expect.any(String),
        levelIndex: expect.any(Number),
        level_index: expect.any(Number),
      }),
    );
    expect(space.area).toBeGreaterThan(0);
    expect(space.levelIndex).toBeGreaterThanOrEqual(0);
    expect(space.levelIndex).toBeLessThan(floorCount);
    if (route === PROJECT_TYPE_ROUTES.PROJECT_GRAPH) {
      expect(space.source).toBe("deterministic_project_graph_template");
    }
  });
}

const supportedUiCases = [
  ["commercial > office", "commercial", "office", 1200, 3],
  ["healthcare > clinic", "healthcare", "clinic", 1300, 2],
  ["education > school", "education", "school", 1800, 3],
  ["commercial > retail", "commercial", "retail", 1400, 2],
  ["hospitality > hotel", "hospitality", "hotel", 2600, 4],
  ["industrial > warehouse", "industrial", "warehouse", 2200, 2],
];

describe("ArchitectAIWizardContainer programme UI flow", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn(() =>
      Promise.reject(new Error("OpenAI should not be required for UI rows")),
    );
  });

  afterEach(() => {
    global.fetch = originalFetch;
    document.body.innerHTML = "";
    jest.restoreAllMocks();
  });

  test("accepts realistic non-residential total areas above dimension limits", () => {
    expect(sanitizeProgrammeAreaInput(1200)).toBe(1200);
    expect(sanitizeProgrammeAreaInput("2600 m2")).toBe(2600);
    expect(sanitizeProgrammeAreaInput("")).toBeNull();
  });

  test.each(supportedUiCases)(
    "%s populates rendered programme rows through the wizard handler",
    async (_label, category, subType, area, floorCount) => {
      const { container, unmount } = renderComponent(
        baseProjectDetails({
          category,
          subType,
          program: subType,
          area,
          floorCount,
          floorCountLocked: true,
        }),
      );

      await clickGenerate(container);

      expectProgrammeRows({ floorCount });
      expect(mockLastProjectDetails).toEqual(
        expect.objectContaining({
          category,
          subType,
          projectTypeRoute: PROJECT_TYPE_ROUTES.PROJECT_GRAPH,
        }),
      );
      expect(container.querySelectorAll("tbody tr").length).toBe(
        mockLastProgramSpaces.length + 1,
      );
      expect(container.querySelectorAll("tbody select").length).toBe(
        mockLastProgramSpaces.length,
      );
      expect(global.fetch).not.toHaveBeenCalled();
      unmount();
    },
  );

  test("unsupported type fails clearly without silently returning empty rows", async () => {
    const { container, unmount } = renderComponent(
      baseProjectDetails({
        category: "commercial",
        subType: "casino",
        program: "casino",
        area: 1200,
      }),
    );

    await clickGenerate(container);

    expect(mockLastProgramSpaces).toEqual([]);
    expect(container.textContent).toMatch(/Experimental\/off|not enabled/i);
    unmount();
  });

  test("detached-house still uses Residential V2 deterministic compile", async () => {
    const { container, unmount } = renderComponent(
      baseProjectDetails({
        category: "residential",
        subType: "detached-house",
        program: "detached-house",
        area: 180,
        floorCount: 2,
      }),
    );

    await clickGenerate(container);

    expect(mockLastProgramSpaces.length).toBeGreaterThan(0);
    expect(mockLastProjectDetails).toEqual(
      expect.objectContaining({
        projectTypeRoute: PROJECT_TYPE_ROUTES.RESIDENTIAL_V2,
        pipelineVersion: UK_RESIDENTIAL_V2_PIPELINE_VERSION,
      }),
    );
    expect(container.textContent).toMatch(
      /Compiled deterministic UK residential program/i,
    );
    unmount();
  });

  test("OpenAI reasoning failure does not block non-residential deterministic rows", async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error("network down")));
    const { container, unmount } = renderComponent(
      baseProjectDetails({
        category: "healthcare",
        subType: "clinic",
        program: "clinic",
        area: 1300,
        floorCount: 2,
      }),
    );

    await clickGenerate(container);

    expectProgrammeRows({ floorCount: 2 });
    expect(global.fetch).not.toHaveBeenCalled();
    unmount();
  });

  test("auto floor-count sync keeps generated rows and level assignments", async () => {
    const { container, unmount } = renderComponent(
      baseProjectDetails({
        category: "education",
        subType: "school",
        program: "school",
        area: 1800,
        floorCount: 3,
        floorCountLocked: false,
      }),
      {
        siteMetrics: { areaM2: 900 },
      },
    );

    await clickGenerate(container);
    await flushPromises();

    expectProgrammeRows({
      floorCount: mockLastProjectDetails.autoDetectedFloorCount || 3,
    });
    expect(container.querySelectorAll("tbody tr").length).toBeGreaterThan(1);
    unmount();
  });

  test("live auto-detect effect resets to null when site area is 0", async () => {
    const { unmount } = renderComponent(
      baseProjectDetails({
        category: "commercial",
        subType: "office",
        program: "office",
        area: 1200,
        floorCount: 3,
        floorCountLocked: false,
        autoDetectedFloorCount: 4,
        floorMetrics: { optimalFloors: 4 },
      }),
      {
        siteMetrics: { areaM2: 0 },
      },
    );

    await flushPromises();

    expect(mockLastProjectDetails.autoDetectedFloorCount).toBeNull();
    expect(mockLastProjectDetails.floorMetrics).toBeNull();
    unmount();
  });

  test("live auto-detect surfaces programToSiteRatio + exceedsSubtypeCap for non-residential over-cap", async () => {
    // Warehouse cap = 2 storeys. With siteArea 600 m² and programme 2400 m²
    // even at circulation 1.0 the demand exceeds cap (2400 / (600 × 0.665) ≈ 6),
    // so exceedsSubtypeCap=true regardless of template variance.
    const { container, unmount } = renderComponent(
      baseProjectDetails({
        category: "industrial",
        subType: "warehouse",
        program: "warehouse",
        area: 2400,
        floorCount: 2,
        floorCountLocked: false,
      }),
      {
        siteMetrics: { areaM2: 600 },
      },
    );

    await clickGenerate(container);
    await flushPromises();

    expect(mockLastProjectDetails.floorMetrics).toEqual(
      expect.objectContaining({
        programToSiteRatio: expect.any(Number),
        setbackReduction: expect.any(Number),
        effectiveCoverage: expect.any(Number),
        exceedsSubtypeCap: true,
      }),
    );
    expect(container.textContent).toMatch(
      /Programme density.*demands.*warehouse caps at 2/i,
    );
    unmount();
  });
});
