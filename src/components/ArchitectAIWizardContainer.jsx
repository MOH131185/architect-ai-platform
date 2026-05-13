/**
 * Architect AI Wizard Container
 *
 * Main container component that orchestrates the wizard flow.
 * Redesigned with new UI components and design system.
 */

import React, {
  Suspense,
  lazy,
  useRef,
  useCallback,
  useEffect,
  useState,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, X } from "lucide-react";
import { useArchitectAIWorkflow } from "../hooks/useArchitectAIWorkflow.js";
import { useWizardState } from "../hooks/useWizardState.js";
import { getDemoProject, buildDemoResult } from "../data/demoProjects.js";
import { normalizeSiteSnapshot } from "../types/schemas.js";
import { computeSiteMetrics } from "../utils/geometry.js";
import {
  buildEntranceAutoTriggerHeldLogKey,
  shouldAutoTriggerEntranceDetection,
} from "../utils/entranceAutoTriggerGate.js";
import {
  buildEntranceDetectionUnavailableResult,
  buildMainEntryForWizard,
  normalizeMainEntryDirectionCode,
  resolveEntranceSitePolygonForWizard,
} from "../utils/mainEntryWizard.js";
import { locationIntelligence } from "../services/locationIntelligence.js";
import siteAnalysisService from "../services/siteAnalysisService.js";
import autoLevelAssignmentService from "../services/autoLevelAssignmentService.js";
import logger from "../utils/logger.js";
import {
  processPortfolioUploadFiles,
  releasePortfolioFilePreviewUrls,
} from "../utils/portfolioFileProcessing.js";
import { isFeatureEnabled } from "../config/featureFlags.js";
import {
  getCurrentPipelineMode,
  PIPELINE_MODE,
} from "../config/pipelineMode.js";
import { sanitizePromptInput } from "../utils/promptSanitizer.js";
import buildingFootprintService from "../services/buildingFootprintService.js";
import { resolveUiSiteBoundaryAuthority } from "../services/siteBoundaryUiAuthority.js";
import { selectContextualBoundaryPolygon } from "../services/siteBoundaryAutoDetectPolicy.js";
import {
  BOUNDARY_POLICY_VERSION,
  normalizeBoundaryAreaFields,
} from "../services/site/boundaryPolicy.js";
import { buildSiteContext } from "../rings/ring1-site/siteContextBuilder.js";
import { captureSnapshotForPersistence } from "../services/siteMapSnapshotService.js";
import { buildProjectPipelineV2Bundle } from "../services/project/projectPipelineV2Service.js";
import {
  generateResidentialProgramBrief,
  normalizeResidentialProgramSpaces,
} from "../services/project/residentialProgramEngine.js";
import { UK_RESIDENTIAL_V2_PIPELINE_VERSION } from "../services/project/v2ProjectContracts.js";
import {
  buildProjectTypeSupportMetadata,
  getProjectTypeSupportForDetails,
  PROJECT_GRAPH_PROJECT_TYPE_PIPELINE_VERSION,
  PROJECT_TYPE_ROUTES,
} from "../services/project/projectTypeSupportRegistry.js";
import { runProgramPreflight } from "../services/project/programPreflight.js";
import {
  resolveAuthoritativeFloorCount,
  syncProgramToFloorCount,
} from "../services/project/floorCountAuthority.js";
import { normalizeProgramSpaces } from "../services/project/levelUtils.js";
import { generateDeterministicProgramSpaces } from "../services/project/programmeSpaceGenerator.js";
import DesignHistoryMenu from "./DesignHistoryMenu.jsx";

// Landing page (kept eager — first paint)
import LandingPage from "./LandingPage.jsx";

// Suspense fallback for lazy step + page chunks
import StepLoadingSkeleton from "./StepLoadingSkeleton.jsx";

// Import new UI components and layout
import { Card, Modal } from "./ui";
import Button from "./ui/Button.jsx";
import { AppShell, PageTransition } from "./layout";
import "../styles/deepgram.css";
import {
  AuthSignInButton,
  AuthSignedIn,
  AuthSignedOut,
  clerkAuthConfigured,
} from "../services/auth/clerkFacade.js";

// Step components and full-page views — lazy-loaded so the initial
// landing-page bundle stays lean. Each becomes its own async chunk;
// webpackChunkName hints keep build output readable in source-map-explorer.
const LocationStep = lazy(
  () =>
    import(/* webpackChunkName: "step-location" */ "./steps/LocationStep.jsx"),
);
const IntelligenceStep = lazy(
  () =>
    import(
      /* webpackChunkName: "step-intelligence" */ "./steps/IntelligenceStep.jsx"
    ),
);
const PortfolioStep = lazy(
  () =>
    import(
      /* webpackChunkName: "step-portfolio" */ "./steps/PortfolioStep.jsx"
    ),
);
const SpecsStep = lazy(
  () => import(/* webpackChunkName: "step-specs" */ "./steps/SpecsStep.jsx"),
);
const GenerateStep = lazy(
  () =>
    import(/* webpackChunkName: "step-generate" */ "./steps/GenerateStep.jsx"),
);
const ResultsStep = lazy(
  () =>
    import(/* webpackChunkName: "step-results" */ "./steps/ResultsStep.jsx"),
);
const PricingPage = lazy(
  () => import(/* webpackChunkName: "page-pricing" */ "./PricingPage.jsx"),
);

const MAX_PROGRAMME_AREA_M2 = 100000;

export function sanitizeProgrammeAreaInput(value) {
  if (value == null || value === "") return null;
  const numericToken = String(value)
    .replace(/,/g, "")
    .match(/\d+(?:\.\d+)?/);
  const parsed = numericToken ? parseFloat(numericToken[0]) : NaN;
  if (
    !Number.isFinite(parsed) ||
    parsed <= 0 ||
    parsed > MAX_PROGRAMME_AREA_M2
  ) {
    return null;
  }
  return Math.round(parsed * 100) / 100;
}

function logCompileBreadcrumb(label, payload) {
  if (process.env.NODE_ENV === "production") return;
  console.info(`[compileProgram] ${label}`, payload);
}

function normalizeUiProgramSpaces(spaces = [], source = "programme_compile") {
  const normalized = (Array.isArray(spaces) ? spaces : []).map(
    (space, index) => {
      const name = String(space?.name || space?.label || `Space ${index + 1}`);
      const rawLevelIndex = Number(space?.levelIndex ?? space?.level_index);
      const fallbackType =
        space?.type || space?.spaceType || space?.category || "generic";
      return {
        ...space,
        id: space?.id || `space_${source}_${index + 1}`,
        name,
        label: String(space?.label || name),
        area: Math.max(0, Number(space?.area || 0)),
        count: Math.max(1, Number(space?.count || 1)),
        type: fallbackType,
        category: space?.category || fallbackType,
        spaceType: space?.spaceType || fallbackType,
        level: space?.level || "Ground",
        levelIndex: Number.isFinite(rawLevelIndex) ? rawLevelIndex : undefined,
        level_index: Number.isFinite(rawLevelIndex) ? rawLevelIndex : undefined,
        source: space?.source || source,
      };
    },
  );
  normalized._calculatedFloorCount = spaces?._calculatedFloorCount;
  normalized._floorMetrics = spaces?._floorMetrics ?? null;
  return normalized;
}

function uniqueProgramWarnings(...groups) {
  return Array.from(new Set(groups.flat().filter(Boolean)));
}

function programSpacesCoverFloorCount(spaces = [], floorCount = 1) {
  const safeFloorCount = Math.max(1, Math.floor(Number(floorCount) || 1));
  if (!Array.isArray(spaces) || spaces.length === 0) return false;
  const calculated = Number(spaces._calculatedFloorCount);
  const levels = new Set(
    spaces
      .map((space) => Number(space?.levelIndex ?? space?.level_index))
      .filter(Number.isFinite),
  );
  return (
    calculated === safeFloorCount &&
    Array.from({ length: safeFloorCount }, (_, index) => index).every((index) =>
      levels.has(index),
    )
  );
}

// Step Progress Bar Component — compact form on mobile, full circles on md+
const StepProgressBar = ({ steps, currentStep }) => {
  const total = steps.length;
  const activeStep = steps[currentStep - 1];
  const percentage = Math.round((currentStep / total) * 100);

  return (
    <nav aria-label="Wizard progress" className="relative">
      {/* Mobile: compact "Step X / N — Label" + thin progress bar */}
      <div className="md:hidden">
        <div className="mb-2 flex items-baseline justify-between">
          <p className="text-xs font-medium uppercase tracking-wider text-white/55 tabular-nums">
            Step {currentStep} of {total}
          </p>
          <p className="text-xs tabular-nums text-white/45">{percentage}%</p>
        </div>
        <p className="mb-3 text-base font-semibold text-white">
          {activeStep?.label}
        </p>
        <div
          className="h-1.5 overflow-hidden rounded-full bg-white/8"
          role="progressbar"
          aria-valuenow={percentage}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Step ${currentStep} of ${total}`}
        >
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-royal-500 to-royal-300"
            initial={{ width: 0 }}
            animate={{ width: `${percentage}%` }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>
      </div>

      {/* Desktop: full 5-circle row */}
      <ol className="mx-auto hidden max-w-4xl items-center justify-between md:flex">
        {steps.map((step, index) => {
          const isActive = index + 1 === currentStep;
          const isCompleted = index + 1 < currentStep;

          return (
            <li
              key={index}
              className="relative flex-1"
              aria-current={isActive ? "step" : undefined}
            >
              <div className="flex flex-col items-center">
                <motion.div
                  className={`flex h-11 w-11 items-center justify-center rounded-full text-sm font-semibold transition-all duration-300 ${
                    isActive
                      ? "bg-royal-500 text-white shadow-brand-sm ring-4 ring-royal-500/20"
                      : isCompleted
                        ? "bg-royal-500 text-white"
                        : "border border-white/10 bg-navy-900 text-white/45"
                  }`}
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: index * 0.06 }}
                >
                  {isCompleted ? "✓" : index + 1}
                </motion.div>

                <div className="mt-3 text-center">
                  <p
                    className={`text-xs font-semibold tracking-tight ${
                      isActive ? "text-white" : "text-white/55"
                    }`}
                  >
                    {step.label}
                  </p>
                  <p className="mt-0.5 text-[11px] text-white/40">
                    {step.description}
                  </p>
                </div>
              </div>

              {index < steps.length - 1 && (
                <div
                  aria-hidden="true"
                  className="absolute left-[calc(50%+1.375rem)] right-[calc(-50%+1.375rem)] top-[1.375rem] h-px bg-white/10"
                >
                  <motion.div
                    className="h-full bg-royal-500"
                    initial={{ scaleX: 0, originX: 0 }}
                    animate={{ scaleX: isCompleted ? 1 : 0 }}
                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

const polygonsEqual = (polygonA = [], polygonB = []) => {
  if (polygonA === polygonB) return true;
  if (!Array.isArray(polygonA) || !Array.isArray(polygonB)) return false;
  if (polygonA.length !== polygonB.length) return false;

  return polygonA.every((pointA, index) => {
    const pointB = polygonB[index];
    return pointA?.lat === pointB?.lat && pointA?.lng === pointB?.lng;
  });
};

const toFiniteCoordinate = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const normalizeLatLngPoint = (point) => {
  if (!point || typeof point !== "object") return null;
  const lat = toFiniteCoordinate(point.lat);
  const lng = toFiniteCoordinate(point.lng ?? point.lon);
  if (lat === null || lng === null) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
};

const normalizeSitePolygonForUi = (polygon = []) => {
  if (!Array.isArray(polygon)) return [];
  const normalized = polygon.map(normalizeLatLngPoint).filter(Boolean);
  return normalized.length >= 3 ? normalized : [];
};

export function resolveWizardProjectTypeSupport(projectDetails = {}) {
  return getProjectTypeSupportForDetails(projectDetails);
}

export function assertProjectTypeSupportedForGeneration(projectDetails = {}) {
  const support = resolveWizardProjectTypeSupport(projectDetails);
  if (!projectDetails.category || !projectDetails.subType) {
    throw new Error("Choose a supported project type before generation.");
  }
  if (support.enabledInUi !== true || !support.route) {
    throw new Error(
      support.message ||
        "This project type is not enabled for production generation.",
    );
  }
  return support;
}

export function shouldUseResidentialV2Route(
  projectDetails = {},
  { residentialV2Enabled = true } = {},
) {
  const support = resolveWizardProjectTypeSupport(projectDetails);
  return (
    residentialV2Enabled === true &&
    support.route === PROJECT_TYPE_ROUTES.RESIDENTIAL_V2
  );
}

const ArchitectAIWizardContainer = () => {
  // Top-level view: 'wizard' | 'pricing'
  const [view, setView] = useState("wizard");

  // Workflow hook
  const {
    loading,
    error,
    result,
    progress,
    generateSheet,
    modifySheetWorkflow,
    exportSheetWorkflow,
    loadDesign,
    listDesigns,
    clearError,
    loadDemoResult,
  } = useArchitectAIWorkflow();

  // Use the custom hook for state management
  const {
    // Step
    currentStep,
    setCurrentStep,

    // Location
    address,
    setAddress,
    isDetectingLocation,
    setIsDetectingLocation,
    locationData,
    setLocationData,
    sitePolygon,
    setSitePolygon,
    siteMetrics,
    setSiteMetrics,
    locationAccuracy,
    setLocationAccuracy,
    // Note: drawingMode, precisionMode available from useWizardState if needed

    // Portfolio
    portfolioFiles,
    setPortfolioFiles,
    materialWeight,
    setMaterialWeight,
    characteristicWeight,
    setCharacteristicWeight,
    isUploading,
    setIsUploading,

    // Specs
    projectDetails,
    setProjectDetails,
    programSpaces,
    setProgramSpaces,
    programWarnings,
    setProgramWarnings,
    isGeneratingSpaces,
    setIsGeneratingSpaces,
    isDetectingEntrance,
    setIsDetectingEntrance,
    autoDetectResult,
    setAutoDetectResult,

    // Result
    generatedDesignId,
    setGeneratedDesignId,
  } = useWizardState();

  // Refs
  const fileInputRef = useRef(null);
  const mapRef = useRef(null);
  const lastEntranceGateHeldLogKeyRef = useRef(null);
  const portfolioFilesRef = useRef(portfolioFiles);
  const [generationStartAtMs, setGenerationStartAtMs] = useState(null);
  const [generationElapsedSeconds, setGenerationElapsedSeconds] = useState(0);
  const [isGenerationTimerRunning, setIsGenerationTimerRunning] =
    useState(false);
  // Surfaces PDF conversion failures via Modal instead of native alert().
  const [pdfErrorState, setPdfErrorState] = useState(null);
  const residentialV2Enabled = isFeatureEnabled("ukResidentialV2");

  const hasA1Output = Boolean(
    result?.a1Sheet?.url ||
    result?.a1Sheet?.composedSheetUrl ||
    result?.composedSheetUrl ||
    result?.url,
  );

  const hasPanelOutput = Boolean(
    (Array.isArray(result?.panels) && result.panels.length > 0) ||
    (result?.panelMap && Object.keys(result.panelMap).length > 0) ||
    (Array.isArray(result?.a1Sheet?.panels) &&
      result.a1Sheet.panels.length > 0) ||
    (result?.a1Sheet?.panelMap &&
      Object.keys(result.a1Sheet.panelMap).length > 0),
  );

  // Warm the first lazy step chunk while the user reads the landing page,
  // so clicking "Start designing" feels instant. No-op past step 0; uses
  // requestIdleCallback so slow networks aren't penalised.
  useEffect(() => {
    if (currentStep !== 0 || typeof window === "undefined") {
      return undefined;
    }
    const prefetch = () => {
      import(
        /* webpackChunkName: "step-location" */ "./steps/LocationStep.jsx"
      ).catch(() => {});
    };
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(prefetch, { timeout: 2500 });
      return () => {
        if (typeof window.cancelIdleCallback === "function") {
          window.cancelIdleCallback(handle);
        }
      };
    }
    const timer = window.setTimeout(prefetch, 1500);
    return () => window.clearTimeout(timer);
  }, [currentStep]);

  // Real-time timer while generation is in progress
  useEffect(() => {
    if (!isGenerationTimerRunning || !generationStartAtMs) {
      return undefined;
    }

    setGenerationElapsedSeconds(
      Math.floor((Date.now() - generationStartAtMs) / 1000),
    );

    const intervalId = window.setInterval(() => {
      setGenerationElapsedSeconds(
        Math.floor((Date.now() - generationStartAtMs) / 1000),
      );
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [generationStartAtMs, isGenerationTimerRunning]);

  // Stop timer only when results step is active and both A1 + panels are available
  useEffect(() => {
    if (!isGenerationTimerRunning || !generationStartAtMs) {
      return undefined;
    }

    if (currentStep !== 6 || !hasA1Output || !hasPanelOutput) {
      return undefined;
    }

    const stopTimeoutId = window.setTimeout(() => {
      const finalElapsedSeconds = Math.floor(
        (Date.now() - generationStartAtMs) / 1000,
      );
      setGenerationElapsedSeconds(finalElapsedSeconds);
      setIsGenerationTimerRunning(false);
      logger.info(
        "Generation timer stopped",
        { elapsedSeconds: finalElapsedSeconds },
        "⏱️",
      );
    }, 250);

    return () => window.clearTimeout(stopTimeoutId);
  }, [
    currentStep,
    generationStartAtMs,
    hasA1Output,
    hasPanelOutput,
    isGenerationTimerRunning,
  ]);

  // --- Demo mode: skip straight to results with pre-generated output ---
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("demo") === "true") {
      sessionStorage.setItem("investorDemo", "true");
      const project = getDemoProject("demo_residential_001");
      const demoResult = buildDemoResult(project);
      loadDemoResult(demoResult);
      setGeneratedDesignId("demo_residential_001");
      setGenerationElapsedSeconds(175);
      setCurrentStep(6);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    portfolioFilesRef.current = portfolioFiles;
  }, [portfolioFiles]);

  /**
   * Cleanup object URLs on unmount to prevent memory leaks
   */
  useEffect(() => {
    return () => {
      portfolioFilesRef.current.forEach(releasePortfolioFilePreviewUrls);
    };
  }, []);

  // Auto-detect optimal floor count from site + area (unless locked by user).
  // Input priority: sum of current programme spaces (when populated) →
  // projectDetails.area as a fallback before Compile has run. The compile-time
  // call sites also use the sum-of-spaces input, so this keeps live and
  // post-Compile auto-detect in lock-step.
  useEffect(() => {
    const siteArea = siteMetrics?.areaM2;
    const programmeAreaSum = Array.isArray(programSpaces)
      ? programSpaces.reduce(
          (sum, space) =>
            sum +
            Math.max(0, parseFloat(space?.area || 0)) *
              Math.max(1, parseInt(space?.count || 1, 10) || 1),
          0,
        )
      : 0;
    const totalArea =
      programmeAreaSum > 0
        ? programmeAreaSum
        : parseFloat(projectDetails?.area);

    const hasInputs =
      typeof siteArea === "number" &&
      Number.isFinite(siteArea) &&
      siteArea > 0 &&
      Number.isFinite(totalArea) &&
      totalArea > 0;

    if (!hasInputs) {
      setProjectDetails((prev) => {
        if (!prev) return prev;
        if (prev.autoDetectedFloorCount === null && prev.floorMetrics === null)
          return prev;
        return { ...prev, autoDetectedFloorCount: null, floorMetrics: null };
      });
      return;
    }

    const buildingType =
      sanitizePromptInput(
        projectDetails.program ||
          projectDetails.subType ||
          projectDetails.category,
        {
          maxLength: 120,
          allowNewlines: false,
        },
      ) || "mixed-use";

    try {
      const floorMetrics = autoLevelAssignmentService.calculateOptimalLevels(
        totalArea,
        siteArea,
        {
          buildingType,
          subType: projectDetails.subType || null,
          circulationFactor: 1.0, // total area already includes circulation allowance
        },
      );

      // Service may return optimalFloors=null when its own siteArea guard
      // trips (e.g. siteMetrics flipped to 0 between render and effect).
      // Treat that as "no auto value" — do not stomp the previous count.
      if (floorMetrics.optimalFloors == null) {
        setProjectDetails((prev) => {
          if (!prev) return prev;
          if (
            prev.autoDetectedFloorCount === null &&
            prev.floorMetrics === null
          )
            return prev;
          return { ...prev, autoDetectedFloorCount: null, floorMetrics: null };
        });
        return;
      }

      setProjectDetails((prev) => {
        if (!prev) return prev;

        const next = {
          ...prev,
          autoDetectedFloorCount: floorMetrics.optimalFloors,
          floorMetrics,
        };

        if (!prev.floorCountLocked) {
          next.floorCount = floorMetrics.optimalFloors;
        }

        const unchanged =
          prev.floorCount === next.floorCount &&
          prev.autoDetectedFloorCount === next.autoDetectedFloorCount &&
          prev.floorCountLocked === next.floorCountLocked &&
          prev.floorMetrics?.optimalFloors ===
            next.floorMetrics?.optimalFloors &&
          prev.floorMetrics?.siteCoveragePercent ===
            next.floorMetrics?.siteCoveragePercent &&
          prev.floorMetrics?.actualFootprint ===
            next.floorMetrics?.actualFootprint &&
          prev.floorMetrics?.maxFloorsAllowed ===
            next.floorMetrics?.maxFloorsAllowed &&
          prev.floorMetrics?.programToSiteRatio ===
            next.floorMetrics?.programToSiteRatio &&
          prev.floorMetrics?.exceedsSubtypeCap ===
            next.floorMetrics?.exceedsSubtypeCap;

        return unchanged ? prev : next;
      });
    } catch (err) {
      logger.warn("Auto floor detection failed", err?.message || err);
    }
  }, [
    projectDetails?.area,
    projectDetails?.program,
    projectDetails?.subType,
    projectDetails?.category,
    programSpaces,
    projectDetails?.floorCountLocked,
    siteMetrics?.areaM2,
    setProjectDetails,
  ]);

  // When the auto-detected floor count changes and the user has not locked
  // the count, redistribute any existing programme rows so the schedule
  // matches the new authoritative count without needing a re-Compile.
  // We deliberately omit `programSpaces` from the dep array to avoid an
  // infinite loop (this effect itself calls setProgramSpaces).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (projectDetails?.floorCountLocked) return;
    const autoCount = Number(projectDetails?.autoDetectedFloorCount);
    if (!Number.isFinite(autoCount) || autoCount < 1) return;
    if (!Array.isArray(programSpaces) || programSpaces.length === 0) return;
    const currentCalculated = Number(programSpaces._calculatedFloorCount);
    const currentLevels = new Set(
      programSpaces
        .map((space) => Number(space?.levelIndex))
        .filter(Number.isFinite),
    );
    const hasEveryAutoLevel = Array.from(
      { length: autoCount },
      (_, index) => index,
    ).every((index) => currentLevels.has(index));
    if (
      Number.isFinite(currentCalculated) &&
      currentCalculated === autoCount &&
      hasEveryAutoLevel
    ) {
      return;
    }
    const buildingType =
      projectDetails.program ||
      projectDetails.subType ||
      projectDetails.category ||
      "mixed-use";
    const syncResult = syncProgramToFloorCount(programSpaces, autoCount, {
      buildingType,
      projectDetails,
    });
    if (syncResult.changed) {
      setProgramSpaces(syncResult.spaces);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    projectDetails?.autoDetectedFloorCount,
    projectDetails?.floorCountLocked,
  ]);

  // Step definitions
  const steps = [
    { label: "Location", description: "Set your site" },
    { label: "Intelligence", description: "Analysis" },
    { label: "Portfolio", description: "Style blend" },
    { label: "Specs", description: "Requirements" },
    { label: "Generate", description: "Create design" },
  ];

  /**
   * Location handlers
   */
  const detectUserLocation = useCallback(async () => {
    setIsDetectingLocation(true);
    try {
      if (!navigator.geolocation) {
        throw new Error("Geolocation not supported");
      }

      // Use enhanced location service for better accuracy
      const enhancedLocationService = (
        await import("../services/enhancedLocationService")
      ).default;

      const locationResult =
        await enhancedLocationService.getUserLocationWithAddress(
          process.env.REACT_APP_GOOGLE_MAPS_API_KEY,
        );

      logger.info(
        "Enhanced location detected",
        {
          address: locationResult.address,
          accuracy: `${locationResult.accuracy.toFixed(1)}m`,
          qualityScore: locationResult.qualityScore,
        },
        "✅",
      );

      // Set the detected address
      setAddress(locationResult.address);

      // Store accuracy info
      setLocationAccuracy({
        accuracy: locationResult.accuracy,
        qualityScore: locationResult.qualityScore,
        addressType: locationResult.addressType,
      });

      // Show quality feedback in console
      const quality = enhancedLocationService.getLocationQuality(
        locationResult.qualityScore,
      );
      const accuracyText = enhancedLocationService.formatAccuracy(
        locationResult.accuracy,
      );

      if (quality.level === "fair" || quality.level === "poor") {
        logger.warn(
          `Location accuracy: ${quality.description} (${accuracyText})`,
        );
      }
    } catch (err) {
      logger.error("Enhanced location detection failed", err);
      setLocationAccuracy(null);
    } finally {
      setIsDetectingLocation(false);
    }
  }, [setAddress, setIsDetectingLocation, setLocationAccuracy]);

  /**
   * Get seasonal climate, sun path, and wind from OpenWeather
   */
  const fetchClimateWindSun = useCallback(async (lat, lng) => {
    try {
      const response = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&units=metric&appid=${process.env.REACT_APP_OPENWEATHER_API_KEY}`,
      );
      const weatherData = await response.json();

      if (!weatherData || !weatherData.main) {
        throw new Error("Weather data unavailable");
      }

      const currentTemp = weatherData.main.temp;
      const windData = weatherData.wind || {};
      const windSpeed = windData.speed || 0;
      const windDeg = windData.deg || 0;

      const directions = [
        "N",
        "NNE",
        "NE",
        "ENE",
        "E",
        "ESE",
        "SE",
        "SSE",
        "S",
        "SSW",
        "SW",
        "WSW",
        "W",
        "WNW",
        "NW",
        "NNW",
      ];
      const windDirection = directions[Math.round(windDeg / 22.5) % 16];
      const toKmh = (mps) => (mps * 3.6).toFixed(1);
      const tempVariation = 15;

      const fallbackSunAngles = {
        summer: {
          azimuth: 180,
          altitude: Math.max(45, 65 - Math.abs(lat) * 0.2),
        },
        winter: {
          azimuth: 180,
          altitude: Math.max(10, 30 - Math.abs(lat) * 0.1),
        },
      };

      return {
        climate: {
          type: weatherData.weather?.[0]?.main?.toLowerCase() || "temperate",
          seasonal: {
            winter: {
              avgTemp: `${(currentTemp - tempVariation).toFixed(1)}°C`,
              precipitation: "Moderate",
              solar: "40-50%",
            },
            spring: {
              avgTemp: `${(currentTemp - 5).toFixed(1)}°C`,
              precipitation: "Moderate",
              solar: "60-70%",
            },
            summer: {
              avgTemp: `${(currentTemp + tempVariation).toFixed(1)}°C`,
              precipitation: "Low",
              solar: "80-90%",
            },
            fall: {
              avgTemp: `${(currentTemp + 5).toFixed(1)}°C`,
              precipitation: "Moderate-High",
              solar: "50-60%",
            },
          },
          prevailingWind: windDirection,
          prevailing_wind: windDirection,
        },
        wind: {
          speed: `${toKmh(windSpeed)} km/h`,
          speedMs: windSpeed,
          direction: windDirection,
          directionDeg: windDeg,
          prevailing: windDirection,
        },
        sunPath: {
          optimalOrientation: windDirection === "N" ? "S" : "S-SE",
          summer: fallbackSunAngles.summer,
          winter: fallbackSunAngles.winter,
          notes: {
            summer: "Long days, high sun angle",
            winter: "Short days, low sun angle",
          },
        },
      };
    } catch (error) {
      logger.warn("Could not retrieve seasonal climate data", error);
      return {
        climate: { type: "temperate", seasonal: {} },
        wind: {
          speed: "N/A",
          direction: "N/A",
          directionDeg: 0,
          prevailing: "SW",
        },
        sunPath: {
          optimalOrientation: "S",
          summer: { azimuth: 180, altitude: 60 },
          winter: { azimuth: 180, altitude: 20 },
        },
      };
    }
  }, []);

  const analyzeLocation = useCallback(async () => {
    if (!address) return;

    setIsDetectingLocation(true);
    clearError();

    try {
      logger.info("Analyzing location", { address }, "📍");

      const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${process.env.REACT_APP_GOOGLE_MAPS_API_KEY}`;
      const geocodeResponse = await fetch(geocodeUrl);
      const geocodeData = await geocodeResponse.json();

      if (
        geocodeData.status !== "OK" ||
        !geocodeData.results ||
        geocodeData.results.length === 0
      ) {
        throw new Error("Failed to geocode address");
      }

      const location = geocodeData.results[0];
      const coordinates = location.geometry.location;

      // Weather + wind + sun
      const climateBundle = await fetchClimateWindSun(
        coordinates.lat,
        coordinates.lng,
      );

      // Primary site analysis (parcel, road, constraints)
      const siteAnalysisResult = await siteAnalysisService.analyzeSiteContext(
        address,
        coordinates,
      );
      const siteAnalysis = siteAnalysisResult.success
        ? siteAnalysisResult.siteAnalysis
        : {};

      // Building footprint detection for tighter fit
      let detectedFootprint = null;
      let detectedShape = null;
      if (process.env.REACT_APP_GOOGLE_MAPS_API_KEY) {
        try {
          const footprintResult =
            await buildingFootprintService.detectAddressShape(
              address,
              process.env.REACT_APP_GOOGLE_MAPS_API_KEY,
            );
          const normalizedFootprint = normalizeSitePolygonForUi(
            footprintResult?.polygon,
          );
          if (footprintResult?.success && normalizedFootprint.length >= 3) {
            detectedFootprint = normalizedFootprint;
            detectedShape = footprintResult.shape;
          } else if (footprintResult?.success) {
            logger.warn(
              "Building footprint ignored because polygon is invalid",
              {
                vertices: footprintResult?.polygon?.length || 0,
              },
            );
          }
        } catch (fpErr) {
          logger.warn("Building footprint detection failed", fpErr);
        }
      }

      const normalizedAnalysisBoundary = normalizeSitePolygonForUi(
        siteAnalysis.siteBoundary,
      );
      const normalizedEstimatedBoundary = normalizeSitePolygonForUi(
        siteAnalysis.estimatedSiteBoundary ||
          siteAnalysis.contextualSiteBoundary,
      );
      const normalizedExistingPolygon = normalizeSitePolygonForUi(sitePolygon);
      const boundaryResolution = resolveUiSiteBoundaryAuthority({
        siteAnalysis,
        analysisBoundary: normalizedAnalysisBoundary,
        estimatedBoundary: normalizedEstimatedBoundary,
        existingPolygon: normalizedExistingPolygon,
        detectedBuildingFootprint: detectedFootprint,
      });
      const polygon = boundaryResolution.sitePolygon;
      const contextualEstimatedBoundary =
        boundaryResolution.contextualEstimatedBoundary;
      const contextualDisplayPolygon =
        boundaryResolution.contextualDisplayPolygon ||
        contextualEstimatedBoundary;
      const contextualDisplayRole =
        boundaryResolution.contextualDisplayRole || "context_only";
      const contextualDisplaySource =
        boundaryResolution.contextualDisplaySource || null;
      const siteBoundaryWarning = boundaryResolution.siteBoundaryWarning;

      const siteDNA = buildSiteContext({
        location: { address, coordinates },
        sitePolygon: polygon,
        detectedBuildingFootprint: detectedFootprint,
        siteAnalysis,
        climate: climateBundle.climate,
        seasonalClimate: climateBundle,
        streetContext: siteAnalysis?.streetContext,
        allowBuildingFootprintAsSitePolygon: false,
      });

      const hasAuthoritativePolygon =
        boundaryResolution.boundaryAuthoritative &&
        Array.isArray(polygon) &&
        polygon.length >= 3;
      if (hasAuthoritativePolygon) {
        setSitePolygon(polygon);
      } else {
        setSitePolygon([]);
      }
      const derivedMetrics = hasAuthoritativePolygon
        ? siteDNA?.metrics || computeSiteMetrics(polygon)
        : null;
      if (derivedMetrics) {
        setSiteMetrics(derivedMetrics);
      } else if (!hasAuthoritativePolygon) {
        setSiteMetrics(null);
      }
      if (siteBoundaryWarning) {
        logger.warn(siteBoundaryWarning, {
          boundarySource: siteAnalysis?.boundarySource,
          boundaryConfidence: siteAnalysis?.boundaryConfidence,
          fallbackReason: siteAnalysis?.fallbackReason,
        });
        setProgramWarnings((prev) =>
          prev.includes(siteBoundaryWarning)
            ? prev
            : [...prev, siteBoundaryWarning],
        );
      }

      const styleRecommendations =
        await locationIntelligence.recommendArchitecturalStyle(
          location,
          climateBundle.climate,
          {},
        );

      const combinedData = {
        address,
        coordinates,
        location,
        climate: {
          ...climateBundle.climate,
          prevailingWind: climateBundle.wind.direction,
        },
        wind: climateBundle.wind,
        sunPath: siteDNA?.solar || climateBundle.sunPath,
        siteDNA,
        siteAnalysis,
        buildingFootprint: detectedFootprint,
        buildingFootprintAreaM2:
          detectedFootprint?.length >= 3
            ? computeSiteMetrics(detectedFootprint).areaM2
            : null,
        detectedShape,
        boundaryAuthoritative: boundaryResolution.boundaryAuthoritative,
        boundaryEstimated: boundaryResolution.boundaryEstimated,
        boundaryWarning: siteBoundaryWarning,
        boundaryWarningCode: siteAnalysis?.boundaryWarningCode || null,
        boundarySource: siteAnalysis?.boundarySource || null,
        boundaryConfidence: siteAnalysis?.boundaryConfidence || null,
        estimatedSiteBoundary: contextualEstimatedBoundary,
        contextualSiteBoundary: contextualDisplayPolygon,
        contextualBoundaryRole: contextualDisplayRole,
        contextualBoundarySource: contextualDisplaySource,
        contextualSurfaceAreaM2:
          contextualDisplayPolygon?.length >= 3
            ? computeSiteMetrics(contextualDisplayPolygon).areaM2
            : null,
        estimatedSurfaceArea: siteAnalysis.estimatedSurfaceArea || null,
        recommendedStyle: styleRecommendations.recommendedStyle,
        localStyles: styleRecommendations.localStyles || [],
        localMaterials: styleRecommendations.materials || [],
        materialContext: styleRecommendations.materialContext || {},
        zoning: siteAnalysis.constraints || {},
        siteBoundary: polygon,
        surfaceArea: boundaryResolution.boundaryAuthoritative
          ? siteAnalysis.surfaceArea
          : null,
        areaM2: boundaryResolution.boundaryAuthoritative
          ? siteAnalysis.areaM2 || siteAnalysis.surfaceArea
          : null,
        surfaceAreaM2: boundaryResolution.boundaryAuthoritative
          ? siteAnalysis.surfaceAreaM2 || siteAnalysis.surfaceArea
          : null,
        policyVersion: siteAnalysis?.policyVersion || BOUNDARY_POLICY_VERSION,
        climateSummary: {
          prevailingWind: climateBundle.wind.direction,
          avgSummerTemp: climateBundle.climate?.seasonal?.summer?.avgTemp || "",
          avgWinterTemp: climateBundle.climate?.seasonal?.winter?.avgTemp || "",
        },
      };

      setLocationData(combinedData);

      // Stay on step 1 to show the SiteBoundaryEditor
      // User will click "Continue" to go to step 2

      logger.success("Location analysis complete");
    } catch (err) {
      logger.error("Location analysis failed", err);
    } finally {
      setIsDetectingLocation(false);
    }
  }, [
    address,
    clearError,
    fetchClimateWindSun,
    setIsDetectingLocation,
    setLocationData,
    setProgramWarnings,
    setSiteMetrics,
    setSitePolygon,
    sitePolygon,
  ]);

  const handleSitePolygonChange = useCallback(
    (polygon) => {
      const normalizedPolygon = normalizeSitePolygonForUi(polygon);
      setSitePolygon(normalizedPolygon);
      if (normalizedPolygon.length >= 3) {
        const metrics = computeSiteMetrics(normalizedPolygon);
        setSiteMetrics(metrics);
      } else {
        setSiteMetrics(null);
      }
    },
    [setSiteMetrics, setSitePolygon],
  );

  // Handle boundary updates from SiteBoundaryEditor
  const handleBoundaryUpdated = useCallback(
    (boundaryData) => {
      if (!boundaryData) return;

      const normalizedBoundary = normalizeBoundaryAreaFields(boundaryData);
      if (normalizedBoundary.invalid) {
        const warning =
          normalizedBoundary.warnings?.[0] ||
          "Manual boundary is invalid and was not saved as verified.";
        // PR-C re-review blocker 1: when the editor signals
        // clearManualVerified (polygon was cleared, became invalid, or
        // self-intersected) drop ANY previously stored manual_verified
        // boundary from authoritative state so the parent does not keep
        // a stale verified polygon.
        const shouldClearManualVerified =
          boundaryData.clearManualVerified === true ||
          normalizedBoundary.clearManualVerified === true ||
          normalizedBoundary.manualVerified === false;
        setLocationData((prev) => {
          const prevSiteAnalysis = prev?.siteAnalysis || {};
          const wasManualVerified =
            prev?.manualVerifiedBoundary != null ||
            prev?.boundarySource === "manual_verified" ||
            prevSiteAnalysis.boundarySource === "manual_verified";
          const clearManualState =
            shouldClearManualVerified && wasManualVerified;
          return {
            ...(prev || {}),
            manualBoundaryInvalid: true,
            manualBoundaryWarning: warning,
            ...(clearManualState
              ? {
                  manualVerifiedBoundary: null,
                  boundaryAuthoritative: false,
                  boundarySource: null,
                  boundaryConfidence: null,
                  surfaceArea: null,
                  areaM2: null,
                  surfaceAreaM2: null,
                }
              : {
                  boundaryAuthoritative: prev?.boundaryAuthoritative || false,
                }),
            siteAnalysis: {
              ...prevSiteAnalysis,
              manualBoundaryInvalid: true,
              manualBoundaryWarning: warning,
              ...(clearManualState
                ? {
                    manualVerifiedBoundary: null,
                    authoritativeSiteBoundary: null,
                    boundaryAuthoritative: false,
                    boundarySource: null,
                    boundaryConfidence: null,
                    surfaceArea: null,
                    areaM2: null,
                    surfaceAreaM2: null,
                    authoritativeSurfaceArea: null,
                  }
                : {}),
            },
          };
        });
        if (shouldClearManualVerified) {
          setSitePolygon([]);
          setSiteMetrics(null);
        }
        return;
      }

      const polygon = normalizeSitePolygonForUi(boundaryData.polygon || []);
      const isManualVerified =
        normalizedBoundary.boundarySource === "manual_verified" &&
        normalizedBoundary.boundaryAuthoritative === true;
      if (polygonsEqual(sitePolygon, polygon) && !isManualVerified) {
        return;
      }

      const baseMetrics =
        polygon && polygon.length >= 3 ? computeSiteMetrics(polygon) : null;
      const nextMetrics = baseMetrics
        ? {
            ...baseMetrics,
            areaM2: normalizedBoundary.areaM2 || baseMetrics.areaM2,
            area: normalizedBoundary.areaM2 || baseMetrics.areaM2,
            surfaceAreaM2:
              normalizedBoundary.surfaceAreaM2 ||
              normalizedBoundary.areaM2 ||
              baseMetrics.areaM2,
            perimeterM: normalizedBoundary.perimeterM || baseMetrics.perimeterM,
            boundaryAuthoritative:
              normalizedBoundary.boundaryAuthoritative === true,
            boundarySource: normalizedBoundary.boundarySource,
            boundaryConfidence: normalizedBoundary.boundaryConfidence,
            boundaryHash: normalizedBoundary.hash || null,
            policyVersion:
              normalizedBoundary.policyVersion || BOUNDARY_POLICY_VERSION,
          }
        : null;

      setSitePolygon(polygon);
      setSiteMetrics(nextMetrics);

      if (isManualVerified) {
        setLocationData((prev) => ({
          ...(prev || {}),
          siteBoundary: polygon,
          surfaceArea: normalizedBoundary.areaM2,
          areaM2: normalizedBoundary.areaM2,
          surfaceAreaM2: normalizedBoundary.surfaceAreaM2,
          boundaryAuthoritative: true,
          boundaryEstimated: false,
          boundarySource: "manual_verified",
          boundaryConfidence: 1,
          manualBoundaryInvalid: false,
          manualBoundaryWarning: null,
          manualVerifiedBoundary: normalizedBoundary,
          siteAnalysis: {
            ...(prev?.siteAnalysis || {}),
            siteBoundary: polygon,
            authoritativeSiteBoundary: polygon,
            estimatedSiteBoundary: null,
            contextualSiteBoundary: prev?.siteAnalysis?.contextualSiteBoundary,
            area: normalizedBoundary.areaM2,
            areaM2: normalizedBoundary.areaM2,
            surfaceArea: normalizedBoundary.areaM2,
            surfaceAreaM2: normalizedBoundary.surfaceAreaM2,
            authoritativeSurfaceArea: normalizedBoundary.areaM2,
            estimatedSurfaceArea: null,
            boundaryAuthoritative: true,
            boundaryEstimated: false,
            estimatedOnly: false,
            boundarySource: "manual_verified",
            boundaryConfidence: 1,
            fallbackReason: null,
            estimateReason: null,
            boundaryWarning: null,
            boundaryWarningCode: null,
            manualVerifiedBoundary: normalizedBoundary,
          },
        }));
      }
    },
    [setLocationData, setSiteMetrics, setSitePolygon, sitePolygon],
  );

  /**
   * Portfolio handlers
   */
  const handleRemovePortfolioFile = useCallback(
    (index) => {
      setPortfolioFiles((prev) => {
        const newFiles = [...prev];
        releasePortfolioFilePreviewUrls(newFiles[index]);
        newFiles.splice(index, 1);
        logger.info("Portfolio file removed", { index });
        return newFiles;
      });
    },
    [setPortfolioFiles],
  );

  const handlePortfolioUpload = useCallback(
    async (eventOrFiles) => {
      // Handle both event object and files array
      let files;
      if (Array.isArray(eventOrFiles)) {
        files = eventOrFiles;
      } else if (eventOrFiles?.target?.files) {
        files = Array.from(eventOrFiles.target.files);
      } else {
        return;
      }

      if (files.length === 0) return;

      setIsUploading(true);

      try {
        const { processedFiles, errors } = await processPortfolioUploadFiles(
          files,
          { maxPdfThumbnailPages: 3 },
        );

        if (errors.length > 0) {
          const firstError = errors[0];
          logger.warn("Portfolio file processing failed", firstError);
          setPdfErrorState({
            fileName: firstError.fileName,
            message: firstError.message,
          });
        }

        if (processedFiles.length > 0) {
          setPdfErrorState(null);
          setPortfolioFiles((prev) => [...prev, ...processedFiles]);
          logger.success("Portfolio files uploaded", {
            count: processedFiles.length,
          });
        }
      } catch (err) {
        logger.error("Portfolio upload failed", err);
      } finally {
        setIsUploading(false);
      }
    },
    [setIsUploading, setPortfolioFiles],
  );

  /**
   * Specs handlers
   */
  const handleGenerateSpaces = useCallback(async () => {
    if (!projectDetails.category || !projectDetails.area) return;

    setIsGeneratingSpaces(true);
    setProgramWarnings([]);

    try {
      const projectTypeSupport =
        resolveWizardProjectTypeSupport(projectDetails);
      const subType = projectDetails.subType || projectDetails.program;
      const isSupportedResidentialV2 = shouldUseResidentialV2Route(
        projectDetails,
        { residentialV2Enabled },
      );
      const canonicalProgram =
        projectTypeSupport.canonicalBuildingType ||
        projectDetails.program ||
        projectDetails.subType ||
        projectDetails.category;
      const sanitizedProgram = sanitizePromptInput(canonicalProgram, {
        maxLength: 120,
        allowNewlines: false,
      });
      const sanitizedArea = sanitizeProgrammeAreaInput(projectDetails.area);
      const siteArea = siteMetrics?.areaM2 || 0;
      // Single source of truth for floor count. Every downstream call -
      // residential engine, generic AI prompt, post-gen sync, setProjectDetails -
      // must use this value. Locked > autoDetected > manual > fallback.
      const auth = resolveAuthoritativeFloorCount(projectDetails, {
        fallback: 2,
        maxFloors: projectDetails?.floorMetrics?.maxFloorsAllowed || null,
      });
      const authoritativeFloorCount = auth.floorCount;
      const compileAuthorityLog = {
        floorCountLocked: !!projectDetails.floorCountLocked,
        floorCount: projectDetails.floorCount,
        autoDetectedFloorCount: projectDetails.autoDetectedFloorCount,
        authoritativeFloorCount,
        authoritySource: auth.source,
      };

      console.info(
        `[compileProgram] Compiling programme using ${authoritativeFloorCount} level${authoritativeFloorCount === 1 ? "" : "s"} from ${
          auth.source === "auto"
            ? "auto recommendation"
            : auth.source === "locked"
              ? "manual lock"
              : auth.source
        }`,
        compileAuthorityLog,
      );
      logCompileBreadcrumb("projectTypeSupport", {
        categoryId: projectTypeSupport.categoryId,
        subtypeId: projectTypeSupport.subtypeId,
        route: projectTypeSupport.route,
        supportStatus: projectTypeSupport.supportStatus,
        enabledInUi: projectTypeSupport.enabledInUi,
      });
      logCompileBreadcrumb("canonicalBuildingType", {
        canonicalBuildingType: projectTypeSupport.canonicalBuildingType,
      });

      if (!sanitizedProgram || !sanitizedArea) {
        setProgramWarnings([
          "Provide a supported building type and a valid total area to generate a program.",
        ]);
        return;
      }

      if (
        projectTypeSupport.enabledInUi !== true ||
        !projectTypeSupport.route
      ) {
        setProgramWarnings([
          projectTypeSupport.message ||
            "This project type is not enabled for production generation.",
        ]);
        setProgramSpaces([]);
        return [];
      }

      if (isSupportedResidentialV2) {
        const requestedTotalArea = parseFloat(sanitizedArea);
        const siteFitFloorMetrics =
          siteArea > 0
            ? autoLevelAssignmentService.calculateOptimalLevels(
                requestedTotalArea,
                siteArea,
                {
                  buildingType: sanitizedProgram,
                  subType,
                  circulationFactor: 1.0,
                },
              )
            : null;
        const siteFitFloorCount = siteFitFloorMetrics?.optimalFloors || null;
        // The override is ALWAYS the authoritative floor count. siteFit is
        // informational only and surfaces as a "recommended N" warning.
        const programBrief = generateResidentialProgramBrief({
          subType,
          totalAreaM2: requestedTotalArea,
          siteAreaM2: siteArea,
          levelCountOverride: authoritativeFloorCount,
          entranceDirection: projectDetails.entranceDirection || "S",
          qualityTier: "mid",
          customNotes: projectDetails.customNotes || "",
        });

        let spaces = normalizeResidentialProgramSpaces(programBrief.spaces).map(
          (space, index) => ({
            ...space,
            id: space.id || `space_${Date.now()}_${index}`,
            spaceType: space.spaceType || space.type || space.name,
            name: String(space.name || space.label || `Space ${index + 1}`),
            label: String(space.label || space.name || `Space ${index + 1}`),
            area: Math.max(0, parseFloat(space.area) || 0),
            count: Math.max(1, parseInt(space.count, 10) || 1),
            level: space.level || "Ground",
            notes: space.notes || "",
          }),
        );

        const recommendedFloorCount = Math.max(
          1,
          siteFitFloorCount || programBrief.levelCount || 1,
        );
        const totalProgramArea = spaces.reduce(
          (sum, space) =>
            sum + Number(space.area || 0) * Number(space.count || 1),
          0,
        );
        let floorMetrics =
          siteArea > 0
            ? autoLevelAssignmentService.calculateOptimalLevels(
                totalProgramArea,
                siteArea,
                {
                  buildingType: sanitizedProgram,
                  subType,
                  circulationFactor: 1.0,
                },
              )
            : null;
        if (floorMetrics) {
          const selectedFootprint =
            totalProgramArea / Math.max(1, authoritativeFloorCount);
          floorMetrics = {
            ...floorMetrics,
            selectedFloors: authoritativeFloorCount,
            recommendedFloors: recommendedFloorCount,
            actualFootprint: selectedFootprint,
            siteCoveragePercent: (selectedFootprint / siteArea) * 100,
            fitsWithinSite: selectedFootprint <= floorMetrics.maxFootprintArea,
            reasoning:
              auth.source === "locked"
                ? `Locked at ${authoritativeFloorCount} level${authoritativeFloorCount === 1 ? "" : "s"} (site-fit recommendation is ${recommendedFloorCount}).`
                : auth.source === "auto"
                  ? `Using auto-detected ${authoritativeFloorCount} level${authoritativeFloorCount === 1 ? "" : "s"}.`
                  : floorMetrics.reasoning,
          };
        }

        // Single redistribution path. syncProgramToFloorCount handles all
        // cases: clamping levelIndex, rebalancing across the requested
        // floor count, ensuring every upper level has at least one room,
        // adding stairs/circulation, and stamping diagnostic metadata.
        const syncResult = syncProgramToFloorCount(
          spaces,
          authoritativeFloorCount,
          {
            buildingType: subType,
            projectDetails: { ...projectDetails, floorMetrics },
          },
        );
        spaces = syncResult.spaces;
        spaces._floorMetrics = floorMetrics;

        console.info("[compileProgram] generatedProgram", {
          ...compileAuthorityLog,
          generatedProgramLevelCount: programBrief.levelCount,
          finalProgramLevels: Array.from(
            new Set(spaces.map((s) => Number(s.levelIndex) || 0)),
          ).sort((a, b) => a - b),
        });

        setProjectDetails((prev) => {
          const next = {
            ...prev,
            autoDetectedFloorCount: recommendedFloorCount,
            floorMetrics,
            qualityTier: prev.qualityTier || "mid",
            program: subType,
            pipelineVersion: UK_RESIDENTIAL_V2_PIPELINE_VERSION,
            canonicalBuildingType: projectTypeSupport.canonicalBuildingType,
            projectTypeRoute: projectTypeSupport.route,
            supportStatus: projectTypeSupport.supportStatus,
            programmeTemplateKey: projectTypeSupport.programmeTemplateKey,
            projectTypeSupport:
              buildProjectTypeSupportMetadata(projectTypeSupport),
          };
          // Only overwrite floorCount when the resolver pulled it from the
          // auto-detected source. Locked / manual values are the user's
          // authority and must not be stomped by engine output.
          if (
            auth.source === "auto" &&
            prev.floorCount !== authoritativeFloorCount
          ) {
            next.floorCount = authoritativeFloorCount;
          }
          return next;
        });
        setProgramSpaces(spaces);
        const baseWarnings = [
          `Compiled deterministic UK residential program with ${spaces.length} spaces across ${authoritativeFloorCount} level${authoritativeFloorCount === 1 ? "" : "s"}.`,
        ];
        if (recommendedFloorCount !== authoritativeFloorCount) {
          baseWarnings.push(
            `Site-fit recommends ${recommendedFloorCount} level${recommendedFloorCount === 1 ? "" : "s"}; programme uses ${authoritativeFloorCount} (${auth.source}).`,
          );
        }
        if (
          floorMetrics?.exceedsSubtypeCap &&
          Number.isFinite(floorMetrics?.demandFloors) &&
          Number.isFinite(floorMetrics?.maxFloorsAllowed)
        ) {
          const ratioText = Number.isFinite(floorMetrics?.programToSiteRatio)
            ? floorMetrics.programToSiteRatio.toFixed(2)
            : "n/a";
          baseWarnings.push(
            `Programme density (ratio ${ratioText}) demands ${floorMetrics.demandFloors} storey${floorMetrics.demandFloors === 1 ? "" : "s"} but ${subType} caps at ${floorMetrics.maxFloorsAllowed} — trim programme or pick a denser subtype.`,
          );
        }
        if (programBrief.clampedBy === "subtype-max") {
          baseWarnings.push(
            `${subType} subtype is limited to ${programBrief.levelCount} levels; programme uses ${programBrief.levelCount} even though ${programBrief.requestedLevelCount} were requested.`,
          );
        } else if (
          Number(programBrief.levelCount) &&
          Number(programBrief.levelCount) !== authoritativeFloorCount
        ) {
          baseWarnings.push(
            `Programme engine returned ${programBrief.levelCount} levels but authority is ${authoritativeFloorCount} (${auth.source}); spaces have been re-synced.`,
          );
        }
        setProgramWarnings([
          ...baseWarnings,
          ...syncResult.warnings,
          ...(programBrief.warnings || []),
        ]);

        logger.success("Residential V2 program compiled", {
          subtype: subType,
          spaces: spaces.length,
          floors: authoritativeFloorCount,
          source: auth.source,
        });
        return spaces;
      }

      // ProjectGraph non-residential programme rows must appear without
      // waiting on model availability. The deterministic template is the
      // runtime source for the visible UI schedule; downstream ProjectGraph
      // generation receives these rows as the programme lock.
      const floorCountForProgram = authoritativeFloorCount;
      const deterministic = generateDeterministicProgramSpaces({
        projectDetails,
        projectTypeSupport,
        floorCount: floorCountForProgram,
        targetAreaM2: sanitizedArea,
      });
      const programSource = deterministic.source;

      let spaces = normalizeUiProgramSpaces(
        deterministic.spaces,
        programSource,
      );
      if (spaces.length === 0) {
        const emptyErr = new Error(
          "Supported project type returned no programme spaces.",
        );
        emptyErr.code = "PROGRAMME_SPACES_EMPTY";
        throw emptyErr;
      }

      // Auto level assignment. We always run syncProgramToFloorCount with
      // the authoritative count so that manual floor counts work even when
      // siteArea is missing (Bug 4 in the hotfix brief).
      let floorMetrics = projectDetails.floorMetrics || null;
      let autoFloors = projectDetails.autoDetectedFloorCount || null;
      if (siteArea > 0 && spaces.length > 0) {
        const hasExplicitCirculation = spaces.some((s) => {
          const name = String(s.name || s.label || "").toLowerCase();
          return (
            name.includes("circulation") ||
            name.includes("corridor") ||
            name.includes("hallway") ||
            name.includes("stairs") ||
            name.includes("staircase")
          );
        });

        const totalProgramArea = spaces.reduce(
          (sum, s) => sum + parseFloat(s.area || 0) * (s.count || 1),
          0,
        );

        floorMetrics = autoLevelAssignmentService.calculateOptimalLevels(
          totalProgramArea,
          siteArea,
          {
            buildingType: sanitizedProgram,
            subType: projectDetails.subType || null,
            circulationFactor: hasExplicitCirculation ? 1.0 : 1.15,
          },
        );
        autoFloors = floorMetrics?.optimalFloors || autoFloors;
      }

      let syncResult = { spaces, warnings: [], changed: false };
      if (!programSpacesCoverFloorCount(spaces, authoritativeFloorCount)) {
        syncResult = syncProgramToFloorCount(spaces, authoritativeFloorCount, {
          buildingType: sanitizedProgram,
          projectDetails: { ...projectDetails, floorMetrics },
        });
        spaces = normalizeUiProgramSpaces(syncResult.spaces, programSource);
      }
      spaces._floorMetrics = floorMetrics;
      logCompileBreadcrumb("generatorSource", {
        generatorSource: programSource,
        spacesCount: spaces.length,
      });

      console.info("[compileProgram] generatedProgram", {
        ...compileAuthorityLog,
        generatedProgramLevelCount: null,
        finalProgramLevels: Array.from(
          new Set(spaces.map((s) => Number(s.levelIndex) || 0)),
        ).sort((a, b) => a - b),
      });

      setProjectDetails((prev) => {
        const next = { ...prev };
        if (autoFloors) {
          next.autoDetectedFloorCount = autoFloors;
        }
        if (floorMetrics) {
          next.floorMetrics = floorMetrics;
        }
        next.canonicalBuildingType = projectTypeSupport.canonicalBuildingType;
        next.projectTypeRoute = projectTypeSupport.route;
        next.supportStatus = projectTypeSupport.supportStatus;
        next.programmeTemplateKey = projectTypeSupport.programmeTemplateKey;
        next.projectTypeSupport =
          buildProjectTypeSupportMetadata(projectTypeSupport);
        next.pipelineVersion =
          projectTypeSupport.route === PROJECT_TYPE_ROUTES.PROJECT_GRAPH
            ? PROJECT_GRAPH_PROJECT_TYPE_PIPELINE_VERSION
            : prev.pipelineVersion;
        // Only auto-source overwrites floorCount; locked/manual are the
        // user's authority and must not be stomped.
        if (
          auth.source === "auto" &&
          prev.floorCount !== authoritativeFloorCount
        ) {
          next.floorCount = authoritativeFloorCount;
        }
        return next;
      });

      const genericWarnings = [];
      if (autoFloors && autoFloors !== authoritativeFloorCount) {
        genericWarnings.push(
          `Site fit recommends ${autoFloors} level${autoFloors === 1 ? "" : "s"}; programme uses ${authoritativeFloorCount} (${auth.source}).`,
        );
      } else if (autoFloors) {
        genericWarnings.push(
          `Auto-detected ${autoFloors} level${autoFloors === 1 ? "" : "s"} from ${Math.round(siteArea)} m² site.`,
        );
      }
      if (
        floorMetrics?.exceedsSubtypeCap &&
        Number.isFinite(floorMetrics?.demandFloors) &&
        Number.isFinite(floorMetrics?.maxFloorsAllowed)
      ) {
        const ratioText = Number.isFinite(floorMetrics?.programToSiteRatio)
          ? floorMetrics.programToSiteRatio.toFixed(2)
          : "n/a";
        const subtypeLabel =
          projectDetails.subType || sanitizedProgram || "subtype";
        genericWarnings.push(
          `Programme density (ratio ${ratioText}) demands ${floorMetrics.demandFloors} storey${floorMetrics.demandFloors === 1 ? "" : "s"} but ${subtypeLabel} caps at ${floorMetrics.maxFloorsAllowed} — trim programme or pick a denser subtype.`,
        );
      }
      setProgramWarnings((prev) =>
        uniqueProgramWarnings(
          prev,
          genericWarnings,
          deterministic.warnings,
          syncResult.warnings,
        ),
      );

      setProgramSpaces(spaces);

      logger.success("Program spaces generated", {
        count: spaces.length,
        floors: authoritativeFloorCount,
        source: auth.source,
      });
      return spaces; // Return for callers that need immediate access
    } catch (err) {
      logger.error("Space generation failed", err);
      setProgramWarnings([
        err?.code === "PROJECT_TYPE_UNSUPPORTED"
          ? err.message ||
            "This project type is not enabled for production generation."
          : "Programme spaces could not be generated for this project type. Check the building type and area, then try again.",
      ]);
      setProgramSpaces([]);
      return [];
    } finally {
      setIsGeneratingSpaces(false);
    }
  }, [
    projectDetails,
    setIsGeneratingSpaces,
    setProgramSpaces,
    setProgramWarnings,
    setProjectDetails,
    siteMetrics,
    residentialV2Enabled,
  ]);

  const handleProgramSpacesChange = useCallback(
    (spaces) => {
      const auth = resolveAuthoritativeFloorCount(projectDetails, {
        fallback: 2,
        maxFloors: projectDetails?.floorMetrics?.maxFloorsAllowed || null,
      });
      let normalizedSpaces = (spaces || []).map((space, index) => ({
        ...space,
        id: space.id || `space_${Date.now()}_${index}`,
        name: String(space.name || space.label || `Space ${index + 1}`),
        label: String(space.label || space.name || `Space ${index + 1}`),
        area: Math.max(0, parseFloat(space.area) || 0),
        count: Math.max(1, parseInt(space.count, 10) || 1),
        level: space.level || "Ground",
      }));

      normalizedSpaces = normalizeProgramSpaces(
        normalizedSpaces,
        auth.floorCount,
      );
      normalizedSpaces._calculatedFloorCount = auth.floorCount;
      normalizedSpaces._floorMetrics =
        spaces?._floorMetrics || projectDetails.floorMetrics || null;

      setProgramSpaces(normalizedSpaces);
    },
    [projectDetails, setProgramSpaces],
  );

  const handleImportProgram = useCallback(async () => {
    try {
      const ProgramImportExportService = (
        await import("../services/ProgramImportExportService")
      ).default;

      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".xlsx,.xls,.csv";

      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
          const result = await ProgramImportExportService.importProgram(file);

          if (result.success) {
            let normalizedSpaces = (result.spaces || []).map(
              (space, index) => ({
                ...space,
                id: space.id || `space_${Date.now()}_${index}`,
                name: String(space.name || space.label || `Space ${index + 1}`),
                label: String(
                  space.label || space.name || `Space ${index + 1}`,
                ),
                area: Math.max(0, parseFloat(space.area) || 0),
                count: Math.max(1, parseInt(space.count, 10) || 1),
                level: space.level || "Ground",
              }),
            );
            const auth = resolveAuthoritativeFloorCount(projectDetails, {
              fallback: 2,
              maxFloors: projectDetails?.floorMetrics?.maxFloorsAllowed || null,
            });
            const buildingType =
              projectDetails.program ||
              projectDetails.subType ||
              projectDetails.category ||
              "mixed-use";
            const syncResult = syncProgramToFloorCount(
              normalizedSpaces,
              auth.floorCount,
              {
                buildingType,
                projectDetails,
              },
            );
            normalizedSpaces = syncResult.spaces;

            setProgramSpaces(normalizedSpaces);
            logger.success("Program imported", { count: result.spaces.length });

            const importWarnings = [
              ...(result.warnings || []),
              ...syncResult.warnings,
            ];
            if (importWarnings.length > 0) {
              setProgramWarnings(importWarnings);
            }
          } else {
            logger.error("Import failed", { errors: result.errors });
          }
        } catch (err) {
          logger.error("Import failed", err);
        }
      };

      input.click();
    } catch (err) {
      logger.error("Import failed", err);
    }
  }, [projectDetails, setProgramSpaces, setProgramWarnings]);

  const handleExportProgram = useCallback(async () => {
    try {
      const ProgramImportExportService = (
        await import("../services/ProgramImportExportService")
      ).default;
      const auth = resolveAuthoritativeFloorCount(projectDetails, {
        fallback: 2,
        maxFloors: projectDetails?.floorMetrics?.maxFloorsAllowed || null,
      });

      const metadata = {
        buildingType: `${projectDetails.category}_${projectDetails.subType}`,
        area: projectDetails.area,
        floorCount: auth.floorCount,
      };

      await ProgramImportExportService.exportProgram(
        programSpaces,
        "xlsx",
        metadata,
      );
      logger.success("Program exported");
    } catch (err) {
      logger.error("Export failed", err);
    }
  }, [programSpaces, projectDetails]);

  const handleAutoDetectEntrance = useCallback(
    async (options = {}) => {
      const autoDetectOptions =
        options &&
        typeof options === "object" &&
        Object.prototype.hasOwnProperty.call(options, "ignoreManualOverride")
          ? options
          : {};
      const ignoreManualOverride =
        autoDetectOptions.ignoreManualOverride !== false;

      const entranceSitePolygonResolution = resolveEntranceSitePolygonForWizard(
        {
          sitePolygon,
          locationData,
        },
      );
      const entranceSitePolygon = entranceSitePolygonResolution.sitePolygon;

      if (!entranceSitePolygon || entranceSitePolygon.length < 3) {
        const unavailableResult = buildEntranceDetectionUnavailableResult({
          polygonLength: sitePolygon?.length || 0,
        });
        setAutoDetectResult(unavailableResult);
        logger.info("[Entrance] auto-detect skipped — site polygon not ready", {
          polygonLength: sitePolygon?.length || 0,
          entrancePolygonSource: entranceSitePolygonResolution.source,
          resultCode: unavailableResult.code,
        });
        return;
      }

      setIsDetectingEntrance(true);
      logger.info("[Entrance] auto-detect starting", {
        polygonLength: entranceSitePolygon.length,
        polygonSource: entranceSitePolygonResolution.source,
        boundaryAuthoritative:
          entranceSitePolygonResolution.boundaryAuthoritative === true,
        hasSunPath: Boolean(locationData?.sunPath),
        centroid: siteMetrics?.centroid || locationData?.coordinates || null,
        ignoreManualOverride,
      });

      try {
        let roadSegments = null;
        let roadLookupOk = false;
        try {
          const queryPoint = siteMetrics?.centroid || locationData?.coordinates;
          if (queryPoint?.lat && queryPoint?.lng) {
            const url = `/api/google/places/nearby?location=${queryPoint.lat},${queryPoint.lng}&radius=80&type=route`;
            const resp = await fetch(url);
            const data = await resp.json();

            if (data?.status === "OK" && Array.isArray(data?.results)) {
              roadSegments = data.results
                .map((road) => ({
                  name: road.name,
                  midpoint: road.geometry?.location || null,
                }))
                .filter(
                  (road) =>
                    road.midpoint &&
                    typeof road.midpoint.lat === "number" &&
                    typeof road.midpoint.lng === "number",
                );
              roadLookupOk = true;
            } else {
              logger.info("[Entrance] road lookup returned non-OK status", {
                status: data?.status || "unknown",
              });
            }
          }
        } catch (roadErr) {
          logger.debug(
            "[Entrance] road lookup unavailable, falling back to geometry-only detection",
            roadErr?.message || roadErr,
          );
        }

        const result = buildMainEntryForWizard({
          projectDetails,
          sitePolygon: entranceSitePolygon,
          roadSegments,
          sunPath: locationData?.sunPath,
          ignoreManualOverride,
        });
        if (entranceSitePolygonResolution.warning) {
          result.warnings = Array.from(
            new Set([
              ...(Array.isArray(result.warnings) ? result.warnings : []),
              entranceSitePolygonResolution.warning,
            ]),
          );
          result.boundaryAuthoritative =
            entranceSitePolygonResolution.boundaryAuthoritative === true;
          result.entrancePolygonSource = entranceSitePolygonResolution.source;
        }

        logger.info("[Entrance] resolveMainEntryDirection returned", {
          orientation: result?.orientation,
          bearingDeg: result?.bearingDeg,
          source: result?.source,
          polygonSource: entranceSitePolygonResolution.source,
          confidence: result?.confidence,
          rationale: result?.rationale?.[0]?.message || null,
          roadSegmentsUsed: roadLookupOk
            ? roadSegments?.length || 0
            : "lookup-failed",
        });

        setAutoDetectResult(result);

        // Apply the auto-detected direction at confidence ≥ 0.5. Below 0.7
        // we still apply but mark `entranceNeedsReview = true` so the
        // EntranceDirectionSelector shows a "Please confirm" badge — the
        // user can override on the compass without having to discover the
        // auto-detect button. Manual selection always wins (the
        // SpecsStep.handleEntranceChange path clears `entranceAutoDetected`
        // implicitly because the user typed a direction).
        if (result.confidence >= 0.5) {
          logger.info("[Entrance] applying auto-detected direction", {
            orientation: result.orientation,
            bearingDeg: result.bearingDeg,
            source: result.source,
            confidence: result.confidence,
            needsReview: result.confidence < 0.7,
          });
          setProjectDetails((prev) => ({
            ...prev,
            entranceDirection: normalizeMainEntryDirectionCode(
              result.orientation,
            ),
            entranceAutoDetected: result.source !== "manual",
            entranceConfidence: result.confidence,
            entranceNeedsReview: result.confidence < 0.7,
            mainEntry: result,
            mainEntryDirection: result,
            mainEntryBearingDeg: result.bearingDeg,
            frontageEdgeId: result.frontageEdgeId,
            mainEntryEdgeId: result.mainEntryEdgeId,
          }));
          setLocationData((prev) => ({
            ...(prev || {}),
            mainEntry: result,
            mainEntryDirection: result,
            siteAnalysis: {
              ...(prev?.siteAnalysis || {}),
              mainEntry: result,
              mainEntryDirection: result,
            },
          }));
        } else {
          logger.warn(
            "[Entrance] auto-detected confidence below 0.5 threshold — direction NOT applied; user must pick manually",
            {
              orientation: result.orientation,
              bearingDeg: result.bearingDeg,
              confidence: result.confidence,
            },
          );
        }

        logger.success("Entrance orientation detected", {
          orientation: result.orientation,
          bearingDeg: result.bearingDeg,
          source: result.source,
          confidence: result.confidence,
        });
      } catch (err) {
        logger.error("[Entrance] detection failed", err);
      } finally {
        setIsDetectingEntrance(false);
      }
    },
    [
      locationData,
      projectDetails,
      setAutoDetectResult,
      setIsDetectingEntrance,
      setLocationData,
      setProjectDetails,
      siteMetrics,
      sitePolygon,
    ],
  );

  // Auto-trigger entrance orientation detection once a site polygon is
  // available. The gating logic is extracted into
  // `shouldAutoTriggerEntranceDetection` so it can be unit-tested without
  // rendering the wizard, and so that user-reported "not working" cases
  // are diagnosable from a single logger.info line per state transition.
  // Manual override still wins — once the user picks a non-default
  // direction the gate returns `manual_direction_set` and stops re-firing.
  useEffect(() => {
    const decision = shouldAutoTriggerEntranceDetection({
      sitePolygon,
      isDetectingEntrance,
      projectDetails,
    });
    if (!decision.shouldFire) {
      // Only emit the log line when the polygon is present (otherwise
      // every render before location-detect finishes spams the console).
      if (sitePolygon?.length >= 3) {
        const heldLogKey = buildEntranceAutoTriggerHeldLogKey({
          decision,
          isDetectingEntrance,
          projectDetails,
        });
        if (heldLogKey !== lastEntranceGateHeldLogKeyRef.current) {
          logger.info("[Entrance] auto-trigger gate held", decision);
          lastEntranceGateHeldLogKeyRef.current = heldLogKey;
        }
      }
      return;
    }
    logger.info("[Entrance] auto-trigger gate firing — polygon ready", {
      polygonLength: sitePolygon.length,
    });
    handleAutoDetectEntrance({ ignoreManualOverride: false });
  }, [
    sitePolygon,
    handleAutoDetectEntrance,
    isDetectingEntrance,
    projectDetails,
  ]);

  /**
   * Generation handler
   */
  const handleGenerate = useCallback(async () => {
    const startedAt = Date.now();
    setGenerationStartAtMs(startedAt);
    setGenerationElapsedSeconds(0);
    setIsGenerationTimerRunning(true);

    try {
      const projectTypeSupport =
        assertProjectTypeSupportedForGeneration(projectDetails);
      const projectTypeSupportMetadata =
        buildProjectTypeSupportMetadata(projectTypeSupport);
      const selectedSubType = projectDetails.subType || projectDetails.program;
      const canUseResidentialV2 = shouldUseResidentialV2Route(projectDetails, {
        residentialV2Enabled,
      });
      const projectTypePipelineVersion =
        projectTypeSupport.route === PROJECT_TYPE_ROUTES.PROJECT_GRAPH
          ? PROJECT_GRAPH_PROJECT_TYPE_PIPELINE_VERSION
          : UK_RESIDENTIAL_V2_PIPELINE_VERSION;

      // Auto-generate program spaces if user skipped "Generate Program" button.
      // The ProgramComplianceGate requires programSpaces to build ProgramLock + CDS.
      // React setState is async so we capture the returned array for immediate use.
      let effectiveProgramSpaces = programSpaces;
      if (
        programSpaces.length === 0 &&
        projectDetails.category &&
        projectDetails.area
      ) {
        logger.info(
          "Auto-generating program spaces before generation...",
          null,
          "📋",
        );
        try {
          const generated = await handleGenerateSpaces();
          if (generated && generated.length > 0) {
            effectiveProgramSpaces = generated;
            logger.success(`Auto-generated ${generated.length} program spaces`);
          } else {
            throw new Error(
              "Programme generation returned no spaces. Choose a supported project type or edit the programme before generation.",
            );
          }
        } catch (spaceErr) {
          logger.warn("Auto-generation of program spaces failed", spaceErr);
          setIsGenerationTimerRunning(false);
          throw spaceErr;
        }
      }

      // Programme preflight gate. Blocks generation if levels are empty,
      // areas are out of tolerance, or any space cannot be normalised onto
      // the requested floor count. The normalised array is what we ship
      // downstream so manual level edits do not get re-collapsed.
      if (effectiveProgramSpaces && effectiveProgramSpaces.length > 0) {
        const preflightAuth = resolveAuthoritativeFloorCount(projectDetails, {
          fallback: 2,
        });
        const preflight = runProgramPreflight({
          projectDetails,
          programSpaces: effectiveProgramSpaces,
          floorCount: preflightAuth.floorCount,
        });
        if (!preflight.ok) {
          setProgramWarnings([...preflight.errors, ...preflight.warnings]);
          logger.warn("Programme preflight blocked generation", {
            errors: preflight.errors,
            warnings: preflight.warnings,
          });
          setIsGenerationTimerRunning(false);
          throw new Error(
            `Programme preflight failed: ${preflight.errors.join(" ")}`,
          );
        }
        if (preflight.warnings.length > 0) {
          setProgramWarnings(preflight.warnings);
        }
        effectiveProgramSpaces = preflight.normalizedProgramSpaces;
        // Persist the normalised array so the displayed table also reflects
        // the canonical level/levelIndex values.
        setProgramSpaces(preflight.normalizedProgramSpaces);
      }

      logger.info("Starting generation workflow", null, "🚀");

      const authoritativeSnapshotPolygon =
        normalizeSitePolygonForUi(sitePolygon);
      const contextualSnapshotPolygon = normalizeSitePolygonForUi(
        selectContextualBoundaryPolygon(locationData),
      );
      const contextualSnapshotIsBuildingFootprint =
        contextualSnapshotPolygon.length >= 3 &&
        polygonsEqual(
          contextualSnapshotPolygon,
          normalizeSitePolygonForUi(locationData?.buildingFootprint),
        );
      const hasAuthoritativeSnapshotPolygon =
        authoritativeSnapshotPolygon.length >= 3;
      const siteSnapshotDisplayPolygon = hasAuthoritativeSnapshotPolygon
        ? authoritativeSnapshotPolygon
        : contextualSnapshotPolygon;
      const siteSnapshotBoundaryAuthoritative = hasAuthoritativeSnapshotPolygon;
      const siteSnapshotMode = siteSnapshotBoundaryAuthoritative
        ? "authoritative_boundary"
        : contextualSnapshotIsBuildingFootprint
          ? "contextual_building_footprint"
          : siteSnapshotDisplayPolygon.length >= 3
            ? "contextual_estimated_boundary"
            : "context_only";
      const siteSnapshotPolygonSource = siteSnapshotBoundaryAuthoritative
        ? locationData?.boundarySource ||
          locationData?.siteAnalysis?.boundarySource ||
          null
        : contextualSnapshotIsBuildingFootprint
          ? "google_building_outline"
          : locationData?.boundarySource ||
            locationData?.siteAnalysis?.boundarySource ||
            null;
      const siteSnapshotMapType = "roadmap";

      let capturedSnapshot = null;
      try {
        capturedSnapshot = await captureSnapshotForPersistence({
          coordinates: locationData?.coordinates,
          polygon: siteSnapshotDisplayPolygon,
          // Always overlay the polygon when we have one — the user wants
          // to see the auto-detected boundary even when it is non-
          // authoritative. The metadata flag below preserves the
          // estimated semantic for downstream gating.
          drawPolygonOverlay: Boolean(
            siteSnapshotDisplayPolygon &&
            siteSnapshotDisplayPolygon.length >= 3,
          ),
          polygonStyle: siteSnapshotBoundaryAuthoritative
            ? {
                strokeColor: "#1976D2",
                strokeWeight: 3,
                fillColor: "#1976D2",
                fillOpacity: 0.18,
              }
            : {
                strokeColor: "#F59E0B",
                strokeWeight: 2,
                fillColor: "#F59E0B",
                fillOpacity: 0.08,
                strokeDasharray: "8 6",
              },
          zoom: locationData?.mapZoom || 17,
          mapType: siteSnapshotMapType,
          size: { width: 640, height: 400 },
        });
      } catch (snapshotError) {
        logger.warn(
          "Site snapshot capture failed, continuing without overlay",
          snapshotError,
        );
      }

      const siteSnapshot = normalizeSiteSnapshot({
        address: locationData.address,
        coordinates: locationData.coordinates,
        sitePolygon: siteSnapshotDisplayPolygon,
        climate: locationData.climate,
        zoning: locationData.zoning,
        dataUrl: capturedSnapshot?.dataUrl || null,
        center: capturedSnapshot?.center || locationData.coordinates,
        zoom: capturedSnapshot?.zoom || locationData?.mapZoom || 17,
        mapType: capturedSnapshot?.mapType || siteSnapshotMapType,
        size: capturedSnapshot?.size || { width: 640, height: 400 },
        drawPolygonOverlay:
          capturedSnapshot?.drawPolygonOverlay ??
          siteSnapshotBoundaryAuthoritative,
        sha256: capturedSnapshot?.sha256 || null,
        source: capturedSnapshot?.source || "google-static-maps-api",
        sourceUrl: capturedSnapshot?.source || "google-static-maps-api",
        attribution: "Map data © Google",
        metadata: {
          siteMetrics,
          sitePlanMode: siteSnapshotMode,
          boundaryAuthoritative: siteSnapshotBoundaryAuthoritative,
          boundaryEstimated:
            !siteSnapshotBoundaryAuthoritative &&
            siteSnapshotDisplayPolygon.length >= 3,
          boundarySource:
            locationData?.boundarySource ||
            locationData?.siteAnalysis?.boundarySource ||
            null,
          boundaryConfidence:
            locationData?.boundaryConfidence ??
            locationData?.siteAnalysis?.boundaryConfidence ??
            null,
          siteSnapshotPolygonRole: siteSnapshotMode,
          siteSnapshotPolygonSource,
          contextualBoundarySource: siteSnapshotPolygonSource,
          contextualBoundaryOverlayUsed:
            !siteSnapshotBoundaryAuthoritative &&
            siteSnapshotDisplayPolygon.length >= 3,
          contextualBoundaryPolygon: contextualSnapshotPolygon,
          source: capturedSnapshot?.source || "google-static-maps-api",
          attribution: "Map data © Google",
          capturedAt: capturedSnapshot?.capturedAt || null,
          sunPath: locationData.sunPath,
          wind: locationData.wind,
          climateAnalysis: locationData.climate,
          siteAnalysis: locationData.siteAnalysis,
          siteDNA: locationData.siteDNA,
          mainEntry: projectDetails.mainEntry || locationData.mainEntry || null,
          mainEntryDirection:
            projectDetails.mainEntryDirection ||
            locationData.mainEntryDirection ||
            null,
          climateSummary: locationData.climateSummary,
        },
      });

      let v2Bundle = null;
      if (
        projectTypeSupport.route === PROJECT_TYPE_ROUTES.RESIDENTIAL_V2 &&
        !canUseResidentialV2
      ) {
        throw new Error(
          "Residential V2 generation is disabled by feature flag.",
        );
      }

      const isProjectGraphMode =
        getCurrentPipelineMode() === PIPELINE_MODE.PROJECT_GRAPH;

      if (canUseResidentialV2) {
        v2Bundle = await buildProjectPipelineV2Bundle({
          projectDetails: {
            ...projectDetails,
            program: selectedSubType,
          },
          programSpaces: effectiveProgramSpaces,
          locationData,
          sitePolygon,
          siteMetrics,
          materialWeight,
          characteristicWeight,
          portfolioFiles,
        });

        if (!v2Bundle?.supported) {
          throw new Error(
            v2Bundle?.blockers?.[0] ||
              "Project is outside the supported UK Residential V2 scope.",
          );
        }

        if (!isProjectGraphMode && v2Bundle?.validation?.valid === false) {
          throw new Error(
            v2Bundle.validation.blockers?.[0] ||
              "Compiled project validation failed before sheet generation.",
          );
        }

        effectiveProgramSpaces =
          normalizeResidentialProgramSpaces(
            v2Bundle.programBrief?.spaces || [],
          ) || effectiveProgramSpaces;
      }
      const portfolioFileSummaries = portfolioFiles.map((file) => ({
        name: file.name,
        size: file.size,
        type: file.type,
        isPdf: Boolean(file.isPdf),
        convertedFromPdf: Boolean(file.convertedFromPdf),
        pdf: file.pdf
          ? {
              pageCount: file.pdf.pageCount,
              textExtracted: file.pdf.textExtracted,
              textCharCount: file.pdf.textCharCount,
              sourceGaps: file.pdf.sourceGaps || [],
            }
          : null,
        sourceGaps: file.sourceGaps || [],
        portfolioStyleEvidence: file.portfolioStyleEvidence || null,
      }));
      const portfolioFilesForDesignSpec = isProjectGraphMode
        ? portfolioFileSummaries
        : portfolioFiles.map((file) => ({
            name: file.name,
            size: file.size,
            preview: file.preview,
            dataUrl: file.dataUrl,
            file: file.file,
            type: file.type,
            isPdf: Boolean(file.isPdf),
            convertedFromPdf: file.convertedFromPdf,
            pdf: file.pdf
              ? {
                  pageCount: file.pdf.pageCount,
                  textExtracted: file.pdf.textExtracted,
                  textCharCount: file.pdf.textCharCount,
                  sourceGaps: file.pdf.sourceGaps || [],
                }
              : null,
            sourceGaps: file.sourceGaps || [],
            portfolioStyleEvidence: file.portfolioStyleEvidence || null,
          }));
      const designFloorAuth = resolveAuthoritativeFloorCount(projectDetails, {
        fallback: 2,
        maxFloors: projectDetails?.floorMetrics?.maxFloorsAllowed || null,
      });
      const designFloorCount = designFloorAuth.floorCount;
      const generationMainEntry =
        projectDetails.mainEntry ||
        locationData?.mainEntry ||
        buildMainEntryForWizard({
          projectDetails,
          sitePolygon,
          sunPath: locationData?.sunPath || locationData?.siteDNA?.solar,
        });
      const generationSiteMetrics = siteMetrics
        ? {
            ...siteMetrics,
            boundarySource:
              siteMetrics.boundarySource ||
              locationData?.boundarySource ||
              locationData?.siteAnalysis?.boundarySource ||
              null,
            boundaryConfidence:
              siteMetrics.boundaryConfidence ??
              locationData?.boundaryConfidence ??
              locationData?.siteAnalysis?.boundaryConfidence ??
              null,
            boundaryAuthoritative:
              siteMetrics.boundaryAuthoritative ??
              locationData?.boundaryAuthoritative ??
              locationData?.siteAnalysis?.boundaryAuthoritative ??
              null,
            policyVersion:
              siteMetrics.policyVersion ||
              locationData?.policyVersion ||
              locationData?.siteAnalysis?.policyVersion ||
              BOUNDARY_POLICY_VERSION,
          }
        : siteMetrics;

      const designSpec = {
        buildingProgram:
          projectTypeSupport.label ||
          selectedSubType ||
          projectDetails.category,
        buildingCategory: projectDetails.category,
        buildingSubType: projectDetails.subType,
        originalCategory: projectDetails.category,
        originalSubtype: projectDetails.subType,
        buildingType: projectTypeSupport.canonicalBuildingType,
        canonicalBuildingType: projectTypeSupport.canonicalBuildingType,
        projectTypeRoute: projectTypeSupport.route,
        supportStatus: projectTypeSupport.supportStatus,
        programmeTemplateKey: projectTypeSupport.programmeTemplateKey,
        projectTypeSupport: projectTypeSupportMetadata,
        buildingNotes: projectDetails.customNotes,
        floorArea: parseFloat(projectDetails.area),
        area: parseFloat(projectDetails.area), // Alias for services expecting `area`
        floorCount: designFloorCount,
        floors: designFloorCount, // Alias for services expecting `floors`
        floorCountLocked: Boolean(projectDetails.floorCountLocked),
        autoDetectedFloorCount: projectDetails.autoDetectedFloorCount ?? null,
        floorCountAuthoritySource: designFloorAuth.source,
        entranceOrientation:
          generationMainEntry?.orientation || projectDetails.entranceDirection,
        entranceDirection: projectDetails.entranceDirection, // Maintain backward compatibility
        mainEntry: generationMainEntry,
        mainEntryDirection: generationMainEntry,
        mainEntryBearingDeg: generationMainEntry?.bearingDeg ?? null,
        frontageEdgeId: generationMainEntry?.frontageEdgeId || null,
        mainEntryEdgeId: generationMainEntry?.mainEntryEdgeId || null,
        programSpaces: effectiveProgramSpaces,
        programGeneratorMeta: {
          autoDetected: projectDetails.entranceAutoDetected,
          confidence: projectDetails.entranceConfidence,
          warnings: programWarnings,
          pipelineVersion:
            v2Bundle?.pipelineVersion || projectTypePipelineVersion,
        },
        sitePolygon,
        siteMetrics: generationSiteMetrics, // Alias for downstream generators expecting `siteMetrics`
        sitePolygonMetrics: generationSiteMetrics,
        pipelineVersion:
          v2Bundle?.pipelineVersion || projectTypePipelineVersion,
        portfolioBlend: {
          materialWeight,
          characteristicWeight,
          portfolioFiles: portfolioFilesForDesignSpec,
          localStyle: locationData?.recommendedStyle,
          climateStyle: locationData?.climate?.type,
        },
        siteAnalysis: {
          ...(locationData?.siteAnalysis || {}),
          mainEntry: generationMainEntry,
          mainEntryDirection: generationMainEntry,
        },
        location: {
          ...(locationData || {}),
          address: locationData?.address || address || null,
          siteAddress:
            locationData?.siteAddress ||
            locationData?.address ||
            address ||
            null,
          coordinates: locationData?.coordinates || null,
          sitePolygon,
          siteBoundary: sitePolygon,
          manualVerifiedBoundary: locationData?.manualVerifiedBoundary || null,
          manual_verified_boundary:
            locationData?.manualVerifiedBoundary || null,
          boundarySource:
            locationData?.boundarySource ||
            locationData?.siteAnalysis?.boundarySource ||
            generationSiteMetrics?.boundarySource ||
            null,
          boundaryConfidence:
            locationData?.boundaryConfidence ??
            locationData?.siteAnalysis?.boundaryConfidence ??
            generationSiteMetrics?.boundaryConfidence ??
            null,
          boundaryAuthoritative:
            locationData?.boundaryAuthoritative ??
            locationData?.siteAnalysis?.boundaryAuthoritative ??
            generationSiteMetrics?.boundaryAuthoritative ??
            null,
          locationMetadata: {
            ...(locationData?.locationMetadata || {}),
            address: locationData?.address || address || null,
            boundarySource:
              locationData?.boundarySource ||
              locationData?.siteAnalysis?.boundarySource ||
              generationSiteMetrics?.boundarySource ||
              null,
          },
          climate: locationData?.climate,
          sunPath: locationData?.sunPath || locationData?.siteDNA?.solar,
          wind: locationData?.wind,
        },
        siteDNA: locationData?.siteDNA,
        localMaterials: locationData?.localMaterials,
        programBrief: v2Bundle?.programBrief || null,
        confidence: v2Bundle?.confidence || null,
        validation: v2Bundle?.validation || null,
        ...(isProjectGraphMode
          ? {}
          : {
              siteEvidence: v2Bundle?.siteEvidence || null,
              localStyleEvidence: v2Bundle?.localStyleEvidence || null,
              portfolioStyleEvidence: v2Bundle?.portfolioStyleEvidence || null,
              styleBlendSpec: v2Bundle?.styleBlendSpec || null,
              projectGeometry: v2Bundle?.projectGeometry || null,
              populatedGeometry: v2Bundle?.populatedGeometry || null,
              compiledProject: v2Bundle?.compiledProject || null,
              projectQuantityTakeoff: v2Bundle?.projectQuantityTakeoff || null,
              blendedStyle: v2Bundle?.blendedStyle || null,
              v2Bundle,
            }),
        sheetConfig: {
          size: "A1",
          orientation: "landscape",
          dpi: 300,
          format: "PNG",
        },
      };

      const sheetResult = await generateSheet({
        designSpec,
        siteSnapshot,
        featureFlags: {},
        seed: isProjectGraphMode ? undefined : Date.now(),
        sheetType: "ARCH",
        overlays: [],
      });

      setGeneratedDesignId(sheetResult.designId);
      setCurrentStep(6);

      logger.success("Generation complete", { designId: sheetResult.designId });
    } catch (err) {
      logger.error(`Generation failed: ${err.message}`);
      if (err.stack) {
        logger.error(
          `   Stack: ${err.stack.split("\n").slice(0, 3).join("\n")}`,
        );
      }
      setIsGenerationTimerRunning(false);
    }
  }, [
    address,
    characteristicWeight,
    generateSheet,
    handleGenerateSpaces,
    locationData,
    materialWeight,
    portfolioFiles,
    programSpaces,
    programWarnings,
    projectDetails,
    residentialV2Enabled,
    setCurrentStep,
    setGeneratedDesignId,
    setProgramSpaces,
    setProgramWarnings,
    siteMetrics,
    sitePolygon,
  ]);

  /**
   * Modify handler
   */
  const handleModify = useCallback(
    async (modifyRequest) => {
      try {
        logger.info("Starting modification workflow", null, "🔧");

        const modifyResult = await modifySheetWorkflow({
          designId: generatedDesignId,
          sheetId: "default",
          modifyRequest,
        });

        logger.success("Modification complete", {
          versionId: modifyResult.versionId,
          driftScore: modifyResult.driftScore,
        });
      } catch (err) {
        logger.error("Modification failed", err);
      }
    },
    [generatedDesignId, modifySheetWorkflow],
  );

  /**
   * Export handlers
   */
  // Phase 1 export-fix: do NOT swallow export errors here. The caller in
  // ExportPanel.handleExport relies on a thrown error to surface the failure
  // state (red toast, no "complete" status). Catching silently was producing
  // false-success UX when the underlying server route 413'd or returned an
  // invalid blob. We still log for observability, then rethrow.
  const handleExport = useCallback(
    async (format) => {
      if (!result) return;

      try {
        return await exportSheetWorkflow({
          sheet: result,
          format,
        });
      } catch (err) {
        logger.error("Export failed", err);
        throw err;
      }
    },
    [result, exportSheetWorkflow],
  );

  const handleExportCAD = useCallback(
    async (format) => {
      if (!result) return;

      try {
        const { default: exportService } =
          await import("../services/exportService");
        return await exportService.exportCAD({ sheet: result, format });
      } catch (err) {
        logger.error("CAD export failed", err);
        throw err;
      }
    },
    [result],
  );

  const handleExportBIM = useCallback(
    async (format) => {
      if (!result) return;

      try {
        const { default: exportService } =
          await import("../services/exportService");
        return await exportService.exportBIM({ sheet: result, format });
      } catch (err) {
        logger.error("BIM export failed", err);
        throw err;
      }
    },
    [result],
  );

  const handleLoadDesignFromHistory = useCallback(
    async (designId) => {
      const restoredResult = await loadDesign(designId);
      const restoredDesignId =
        restoredResult?.designId || restoredResult?.id || designId;
      setGeneratedDesignId(restoredDesignId);
      setGenerationStartAtMs(null);
      setGenerationElapsedSeconds(0);
      setIsGenerationTimerRunning(false);
      setView("wizard");
      setCurrentStep(6);

      logger.success("Design restored from history", {
        designId: restoredDesignId,
      });

      return restoredResult;
    },
    [
      loadDesign,
      setCurrentStep,
      setGeneratedDesignId,
      setGenerationElapsedSeconds,
      setGenerationStartAtMs,
      setIsGenerationTimerRunning,
    ],
  );

  /**
   * Navigation handlers
   */
  const handleNext = useCallback(() => {
    setCurrentStep((prev) => Math.min(prev + 1, 6));
  }, [setCurrentStep]);

  const handleBack = useCallback(() => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  }, [setCurrentStep]);

  const handleStartNew = useCallback(() => {
    portfolioFilesRef.current.forEach(releasePortfolioFilePreviewUrls);
    setCurrentStep(0);
    setAddress("");
    setLocationData(null);
    setSitePolygon([]);
    setSiteMetrics(null);
    setPortfolioFiles([]);
    setProjectDetails({
      category: "",
      subType: "",
      customNotes: "",
      area: "",
      floorCount: 2,
      floorCountLocked: false,
      autoDetectedFloorCount: null,
      floorMetrics: null,
      footprintArea: "",
      entranceDirection: "N",
      entranceManualOverride: false,
      entranceAutoDetected: false,
      entranceConfidence: 0,
      mainEntry: null,
      mainEntryDirection: null,
      mainEntryBearingDeg: null,
      frontageEdgeId: null,
      mainEntryEdgeId: null,
      program: "",
      qualityTier: "mid",
      pipelineVersion: UK_RESIDENTIAL_V2_PIPELINE_VERSION,
    });
    setProgramSpaces([]);
    setProgramWarnings([]);
    setGeneratedDesignId(null);
    setGenerationStartAtMs(null);
    setGenerationElapsedSeconds(0);
    setIsGenerationTimerRunning(false);
  }, [
    setAddress,
    setCurrentStep,
    setGeneratedDesignId,
    setGenerationElapsedSeconds,
    setGenerationStartAtMs,
    setIsGenerationTimerRunning,
    setLocationData,
    setPortfolioFiles,
    setProgramSpaces,
    setProgramWarnings,
    setProjectDetails,
    setSiteMetrics,
    setSitePolygon,
  ]);

  const historyControl = (
    <DesignHistoryMenu
      listDesigns={listDesigns}
      onLoadDesign={handleLoadDesignFromHistory}
    />
  );

  /**
   * Render current step.
   *
   * Wizard steps (1–5), ResultsStep (6) and PricingPage are React.lazy
   * chunks. A single Suspense boundary here covers every case; LandingPage
   * (case 0 / default) is eager so the fallback never paints on first load.
   */
  const renderStep = () => {
    let content;
    switch (currentStep) {
      case 0:
        content = (
          <LandingPage
            onStart={() => setCurrentStep(1)}
            onDemo={() => {
              window.location.search = "?demo=true";
            }}
            historyControl={historyControl}
          />
        );
        break;

      case 1:
        content = (
          <LocationStep
            address={address}
            isDetectingLocation={isDetectingLocation}
            locationData={locationData}
            sitePolygon={sitePolygon}
            locationAccuracy={locationAccuracy}
            onAddressChange={setAddress}
            onAnalyzeLocation={analyzeLocation}
            onDetectUserLocation={detectUserLocation}
            onBoundaryUpdated={handleBoundaryUpdated}
            onNext={handleNext}
            error={error}
          />
        );
        break;

      case 2:
        content = (
          <IntelligenceStep
            locationData={locationData}
            sitePolygon={sitePolygon}
            siteMetrics={siteMetrics}
            onNext={handleNext}
            onBack={handleBack}
            MapViewComponent={null}
            mapRef={mapRef}
            onSitePolygonChange={handleSitePolygonChange}
          />
        );
        break;

      case 3:
        content = (
          <PortfolioStep
            portfolioFiles={portfolioFiles}
            materialWeight={materialWeight}
            characteristicWeight={characteristicWeight}
            locationData={locationData}
            isUploading={isUploading}
            onPortfolioUpload={handlePortfolioUpload}
            onRemoveFile={handleRemovePortfolioFile}
            onMaterialWeightChange={setMaterialWeight}
            onCharacteristicWeightChange={setCharacteristicWeight}
            onNext={handleNext}
            onBack={handleBack}
            fileInputRef={fileInputRef}
          />
        );
        break;

      case 4:
        content = (
          <SpecsStep
            projectDetails={projectDetails}
            programSpaces={programSpaces}
            programWarnings={programWarnings}
            isGeneratingSpaces={isGeneratingSpaces}
            isDetectingEntrance={isDetectingEntrance}
            autoDetectResult={autoDetectResult}
            validationState={{}}
            onProjectDetailsChange={setProjectDetails}
            onProgramSpacesChange={handleProgramSpacesChange}
            onGenerateProgramSpaces={handleGenerateSpaces}
            onImportProgram={handleImportProgram}
            onExportProgram={handleExportProgram}
            onAutoDetectEntrance={handleAutoDetectEntrance}
            onNext={handleNext}
            onBack={handleBack}
          />
        );
        break;

      case 5:
        content = (
          <GenerateStep
            isGenerating={loading}
            progress={progress}
            elapsedSeconds={generationElapsedSeconds}
            generationComplete={!!result}
            onGenerate={handleGenerate}
            onBack={handleBack}
            onViewResults={() => setCurrentStep(6)}
          />
        );
        break;

      case 6:
        content = (
          <ResultsStep
            result={result}
            designId={generatedDesignId}
            generationElapsedSeconds={generationElapsedSeconds}
            onModify={handleModify}
            onExport={handleExport}
            onExportCAD={handleExportCAD}
            onExportBIM={handleExportBIM}
            onBack={handleBack}
            onStartNew={handleStartNew}
          />
        );
        break;

      default:
        content = (
          <LandingPage
            onStart={() => setCurrentStep(1)}
            historyControl={historyControl}
          />
        );
    }
    return (
      <Suspense
        fallback={
          <StepLoadingSkeleton
            label={
              currentStep === 6
                ? "Preparing results workspace..."
                : "Loading..."
            }
          />
        }
      >
        {content}
      </Suspense>
    );
  };

  // Pricing view (full-page, no auth gate needed — users can browse plans)
  if (view === "pricing") {
    return (
      <AppShell
        showNav={true}
        showFooter={false}
        navProps={{
          onNewDesign: () => setView("wizard"),
          onPricing: () => setView("pricing"),
          showNewDesign: true,
        }}
        background="default"
        noise={true}
      >
        <Suspense fallback={<StepLoadingSkeleton label="Loading pricing..." />}>
          <PricingPage onBack={() => setView("wizard")} />
        </Suspense>
      </AppShell>
    );
  }

  return (
    <AppShell
      showNav={currentStep > 0}
      showFooter={currentStep === 0}
      navProps={{
        onNewDesign: handleStartNew,
        onPricing: () => setView("pricing"),
        historyControl,
        showNewDesign: currentStep > 0,
      }}
      background={currentStep === 0 ? "default" : "gradient"}
      noise={true}
    >
      <PageTransition
        pageKey={currentStep}
        background={currentStep === 0 ? "default" : "blueprint"}
      >
        <div className="container mx-auto px-4 py-8">
          {/* Progress Indicator */}
          {currentStep > 0 && currentStep < 6 && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-8"
            >
              <StepProgressBar steps={steps} currentStep={currentStep} />
            </motion.div>
          )}

          {/* Wizard steps gated behind Clerk auth when configured */}
          {!clerkAuthConfigured ? (
            renderStep()
          ) : (
            <>
              <AuthSignedIn>{renderStep()}</AuthSignedIn>
              <AuthSignedOut>
                {currentStep === 0 ? (
                  renderStep()
                ) : (
                  <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center">
                    <h2 className="text-2xl font-bold text-white">
                      Sign in to continue
                    </h2>
                    <p className="text-gray-400 max-w-sm">
                      Create a free account to generate professional
                      architectural designs with AI.
                    </p>
                    <AuthSignInButton mode="modal">
                      <button className="px-6 py-3 bg-royal-600 hover:bg-royal-500 text-white font-semibold rounded-xl transition-colors">
                        Sign In / Sign Up
                      </button>
                    </AuthSignInButton>
                  </div>
                )}
              </AuthSignedOut>
            </>
          )}

          {/* PDF processing error modal (replaces window.alert) */}
          <Modal
            open={!!pdfErrorState}
            onClose={() => setPdfErrorState(null)}
            title="Portfolio file couldn't be read"
            description="We couldn't read this portfolio file. Try a different PDF, JPG, or PNG."
            size="sm"
            footer={
              <Button
                variant="primary"
                size="sm"
                onClick={() => setPdfErrorState(null)}
              >
                Got it
              </Button>
            }
          >
            {pdfErrorState && (
              <div className="space-y-2">
                <p>
                  <span className="text-xs uppercase tracking-wider text-white/50">
                    File
                  </span>
                  <br />
                  <span className="font-mono text-sm text-white/85">
                    {pdfErrorState.fileName}
                  </span>
                </p>
                <p className="text-white/60">{pdfErrorState.message}</p>
              </div>
            )}
          </Modal>

          {/* Global Error Display */}
          <AnimatePresence>
            {error && currentStep !== 1 && (
              <motion.div
                initial={{ opacity: 0, y: 50 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 50 }}
                className="fixed bottom-8 right-8 max-w-md z-50"
              >
                <Card
                  variant="elevated"
                  padding="md"
                  className="bg-red-900/90 border-red-700 backdrop-blur-lg"
                >
                  <div className="flex items-start">
                    <AlertCircle className="w-5 h-5 mr-3 flex-shrink-0 mt-0.5 text-red-400" />
                    <div className="flex-1">
                      <p className="font-semibold mb-1 text-white">Error</p>
                      <p className="text-sm text-gray-200">{error}</p>
                      {error.upgradeUrl && (
                        <button
                          onClick={() => setView("pricing")}
                          className="mt-2 text-xs underline text-royal-400 hover:text-royal-300"
                        >
                          View pricing plans
                        </button>
                      )}
                    </div>
                    <button
                      onClick={clearError}
                      className="ml-3 p-1 hover:bg-white/10 rounded transition-colors text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </PageTransition>
    </AppShell>
  );
};

export default ArchitectAIWizardContainer;
