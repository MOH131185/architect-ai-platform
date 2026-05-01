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
import { locationIntelligence } from "../services/locationIntelligence.js";
import siteAnalysisService from "../services/siteAnalysisService.js";
import autoLevelAssignmentService from "../services/autoLevelAssignmentService.js";
import logger from "../utils/logger.js";
import { convertPdfFileToImageFile } from "../utils/pdfToImages.js";
import { isFeatureEnabled } from "../config/featureFlags.js";
import {
  getCurrentPipelineMode,
  PIPELINE_MODE,
} from "../config/pipelineMode.js";
import {
  sanitizePromptInput,
  sanitizeDimensionInput,
} from "../utils/promptSanitizer.js";
import buildingFootprintService from "../services/buildingFootprintService.js";
import { resolveUiSiteBoundaryAuthority } from "../services/siteBoundaryUiAuthority.js";
import { buildSiteContext } from "../rings/ring1-site/siteContextBuilder.js";
import { captureSnapshotForPersistence } from "../services/siteMapSnapshotService.js";
import { buildProjectPipelineV2Bundle } from "../services/project/projectPipelineV2Service.js";
import {
  generateResidentialProgramBrief,
  normalizeResidentialProgramSpaces,
} from "../services/project/residentialProgramEngine.js";
import {
  isSupportedResidentialV2SubType,
  UK_RESIDENTIAL_V2_PIPELINE_VERSION,
} from "../services/project/v2ProjectContracts.js";
import { runProgramPreflight } from "../services/project/programPreflight.js";
import {
  resolveAuthoritativeFloorCount,
  syncProgramToFloorCount,
} from "../services/project/floorCountAuthority.js";
import { normalizeProgramSpaces } from "../services/project/levelUtils.js";
import PricingPage from "./PricingPage.jsx";

// Step Components
import LocationStep from "./steps/LocationStep.jsx";
import IntelligenceStep from "./steps/IntelligenceStep.jsx";
import PortfolioStep from "./steps/PortfolioStep.jsx";
import SpecsStep from "./steps/SpecsStep.jsx";
import GenerateStep from "./steps/GenerateStep.jsx";

// Landing page
import LandingPage from "./LandingPage.jsx";

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

const ResultsStep = lazy(() => import("./steps/ResultsStep.jsx"));

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
  const [generationStartAtMs, setGenerationStartAtMs] = useState(null);
  const [generationElapsedSeconds, setGenerationElapsedSeconds] = useState(0);
  const [isGenerationTimerRunning, setIsGenerationTimerRunning] =
    useState(false);
  // Surfaces PDF conversion failures via Modal instead of native alert().
  const [pdfErrorState, setPdfErrorState] = useState(null);
  const residentialV2Enabled = isFeatureEnabled("ukResidentialV2");
  const restrictToResidentialV2 = isFeatureEnabled(
    "hideExperimentalBuildingTypes",
  );

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

  /**
   * Cleanup object URLs on unmount to prevent memory leaks
   */
  useEffect(() => {
    return () => {
      portfolioFiles.forEach((file) => {
        if (file.preview) {
          URL.revokeObjectURL(file.preview);
        }
      });
    };
  }, [portfolioFiles]);

  // Auto-detect optimal floor count from site + area (unless locked by user)
  useEffect(() => {
    const siteArea = siteMetrics?.areaM2;
    const totalArea = parseFloat(projectDetails?.area);

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
            next.floorMetrics?.maxFloorsAllowed;

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
        detectedShape,
        boundaryAuthoritative: boundaryResolution.boundaryAuthoritative,
        boundaryEstimated: boundaryResolution.boundaryEstimated,
        boundaryWarning: siteBoundaryWarning,
        boundaryWarningCode: siteAnalysis?.boundaryWarningCode || null,
        estimatedSiteBoundary: contextualEstimatedBoundary,
        contextualSiteBoundary: contextualEstimatedBoundary,
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

      const polygon = normalizeSitePolygonForUi(boundaryData.polygon || []);
      if (polygonsEqual(sitePolygon, polygon)) {
        return;
      }

      setSitePolygon(polygon);
      setSiteMetrics(
        polygon && polygon.length >= 3 ? computeSiteMetrics(polygon) : null,
      );
    },
    [setSiteMetrics, setSitePolygon, sitePolygon],
  );

  /**
   * Portfolio handlers
   */
  const handleRemovePortfolioFile = useCallback(
    (index) => {
      setPortfolioFiles((prev) => {
        const newFiles = [...prev];
        // Revoke object URL if it exists to prevent memory leak
        if (newFiles[index]?.preview) {
          URL.revokeObjectURL(newFiles[index].preview);
        }
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
        const processedFiles = [];

        for (const originalFile of files) {
          const isPdf =
            originalFile.type === "application/pdf" ||
            originalFile.name.toLowerCase().endsWith(".pdf");
          let preview = null;
          let dataUrl = null; // For API usage
          let storedFile = originalFile;

          if (isPdf) {
            try {
              logger.info("Converting PDF to PNG for preview", {
                fileName: originalFile.name,
              });
              const pngFile = await convertPdfFileToImageFile(originalFile);
              storedFile = pngFile;
              preview = URL.createObjectURL(pngFile);

              // Convert to base64 for API usage
              dataUrl = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.readAsDataURL(pngFile);
              });

              logger.info("PDF converted successfully", {
                fileName: pngFile.name,
              });
            } catch (pdfErr) {
              logger.warn("PDF conversion failed", pdfErr);
              setPdfErrorState({
                fileName: originalFile.name,
                message: pdfErr?.message || "Unknown error",
              });
              continue;
            }
          } else if (originalFile.type.startsWith("image/")) {
            preview = URL.createObjectURL(originalFile);

            // Convert to base64 for API usage
            dataUrl = await new Promise((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result);
              reader.readAsDataURL(originalFile);
            });
          }

          processedFiles.push({
            name: storedFile.name,
            size: `${(storedFile.size / 1024 / 1024).toFixed(2)} MB`,
            file: storedFile,
            preview, // Blob URL for UI preview
            dataUrl, // Base64 data URL for API usage
            type: storedFile.type,
            convertedFromPdf: isPdf,
          });
        }

        if (processedFiles.length > 0) {
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
      const subType = projectDetails.subType || projectDetails.program;
      const isSupportedResidentialV2 =
        residentialV2Enabled &&
        projectDetails.category === "residential" &&
        isSupportedResidentialV2SubType(subType);
      const sanitizedProgram = sanitizePromptInput(
        projectDetails.program ||
          projectDetails.subType ||
          projectDetails.category,
        { maxLength: 120, allowNewlines: false },
      );
      const sanitizedArea = sanitizeDimensionInput(projectDetails.area);
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

      if (!sanitizedProgram || !sanitizedArea) {
        setProgramWarnings([
          "Provide building type and area to generate a program.",
        ]);
        return;
      }

      if (restrictToResidentialV2 && !isSupportedResidentialV2) {
        setProgramWarnings([
          "UK Residential V2 currently supports low-rise residential types only.",
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
                  maxFloors: 4,
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
                  maxFloors: 4,
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

      const togetherAIReasoningService = (
        await import("../services/togetherAIReasoningService")
      ).default;
      // Generic AI path uses the same authoritative floor count as the
      // residential path. Locked > autoDetected > manual > fallback.
      const floorCountForPrompt = authoritativeFloorCount;

      const ordinal = (n) => {
        const mod10 = n % 10;
        const mod100 = n % 100;
        if (mod10 === 1 && mod100 !== 11) return `${n}st`;
        if (mod10 === 2 && mod100 !== 12) return `${n}nd`;
        if (mod10 === 3 && mod100 !== 13) return `${n}rd`;
        return `${n}th`;
      };

      const levelNames = (() => {
        const levels = ["Ground"];
        if (floorCountForPrompt >= 2) levels.push("First");
        if (floorCountForPrompt >= 3) levels.push("Second");
        if (floorCountForPrompt >= 4) levels.push("Third");
        for (let i = 5; i <= floorCountForPrompt; i++)
          levels.push(ordinal(i - 1));
        return levels;
      })();

      const prompt = `You are an architectural programming expert. Generate a JSON array of spaces for a ${sanitizedProgram} totaling ~${sanitizedArea} m². Ensure the total area (area×count sum) is within ±5% of ${sanitizedArea}. Assign each space to ONE of these level names only: ${levelNames.join(", ")}. Public/amenity spaces on Ground; private/sleeping spaces on upper levels. Return ONLY the JSON array, no commentary.`;

      const response = await togetherAIReasoningService.chatCompletion(
        [
          {
            role: "system",
            content:
              "Return ONLY a JSON array of objects with: name (string), area (number), count (number), level (string), notes (optional string).",
          },
          { role: "user", content: prompt },
        ],
        { max_tokens: 900, temperature: 0.55 },
      );

      const content =
        response?.choices?.[0]?.message?.content || response?.content || "[]";
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      let parsed = [];
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch (err) {
          logger.warn("Failed to parse AI program JSON, falling back", err);
        }
      }

      if (!Array.isArray(parsed) || parsed.length === 0) {
        const programSpaceAnalyzer = (
          await import("../services/programSpaceAnalyzer")
        ).default;
        const fallback = programSpaceAnalyzer.generateProgramFromSpecs({
          category: projectDetails.category,
          subType: projectDetails.subType,
          area: parseFloat(projectDetails.area),
          floorCount: floorCountForPrompt,
          climate: locationData?.climate,
          zoning: locationData?.zoning,
        });
        parsed = fallback.spaces;
      }

      // Map to UI schema
      let spaces = parsed.map((space, index) => ({
        id: `space_${Date.now()}_${index}`,
        spaceType: space.spaceType || space.type || space.name,
        name: String(space.name || space.label || `Space ${index + 1}`),
        label: String(space.label || space.name || `Space ${index + 1}`),
        area: Math.max(0, parseFloat(space.area) || 0),
        count: Math.max(1, parseInt(space.count, 10) || 1),
        level: space.level || "Ground",
        notes: space.notes || "",
      }));

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
            maxFloors: 10,
            circulationFactor: hasExplicitCirculation ? 1.0 : 1.15,
          },
        );
        autoFloors = floorMetrics?.optimalFloors || autoFloors;
      }

      const syncResult = syncProgramToFloorCount(
        spaces,
        authoritativeFloorCount,
        {
          buildingType: sanitizedProgram,
          projectDetails: { ...projectDetails, floorMetrics },
        },
      );
      spaces = syncResult.spaces;
      spaces._floorMetrics = floorMetrics;

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
      setProgramWarnings((prev) => [
        ...prev,
        ...genericWarnings,
        ...syncResult.warnings,
      ]);

      setProgramSpaces(spaces);

      logger.success("Program spaces generated", {
        count: spaces.length,
        floors: authoritativeFloorCount,
        source: auth.source,
      });
      return spaces; // Return for callers that need immediate access
    } catch (err) {
      logger.error("Space generation failed", err);
      setProgramSpaces([]);
      return [];
    } finally {
      setIsGeneratingSpaces(false);
    }
  }, [
    locationData,
    projectDetails,
    setIsGeneratingSpaces,
    setProgramSpaces,
    setProgramWarnings,
    setProjectDetails,
    siteMetrics,
    residentialV2Enabled,
    restrictToResidentialV2,
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

  const handleAutoDetectEntrance = useCallback(async () => {
    if (!sitePolygon || sitePolygon.length < 3) return;

    setIsDetectingEntrance(true);

    try {
      const { inferEntranceDirection } =
        await import("../utils/entranceOrientation");

      let roadSegments = null;
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
          }
        }
      } catch (roadErr) {
        logger.debug(
          "Road lookup unavailable, falling back to geometry-only entrance detection",
          roadErr?.message || roadErr,
        );
      }

      const result = inferEntranceDirection({
        sitePolygon,
        roadSegments,
        sunPath: locationData?.sunPath,
      });

      setAutoDetectResult(result);

      if (result.confidence > 0.6) {
        setProjectDetails((prev) => ({
          ...prev,
          entranceDirection: result.direction,
          entranceAutoDetected: true,
          entranceConfidence: result.confidence,
        }));
      }

      logger.success("Entrance orientation detected", {
        direction: result.direction,
        confidence: result.confidence,
      });
    } catch (err) {
      logger.error("Entrance detection failed", err);
    } finally {
      setIsDetectingEntrance(false);
    }
  }, [
    locationData,
    setAutoDetectResult,
    setIsDetectingEntrance,
    setProjectDetails,
    siteMetrics,
    sitePolygon,
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
          }
        } catch (spaceErr) {
          logger.warn(
            "Auto-generation of program spaces failed, continuing",
            spaceErr,
          );
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

      let capturedSnapshot = null;
      try {
        capturedSnapshot = await captureSnapshotForPersistence({
          coordinates: locationData?.coordinates,
          polygon: sitePolygon,
          zoom: locationData?.mapZoom || 17,
          mapType: "hybrid",
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
        sitePolygon,
        climate: locationData.climate,
        zoning: locationData.zoning,
        dataUrl: capturedSnapshot?.dataUrl || null,
        center: capturedSnapshot?.center || locationData.coordinates,
        zoom: capturedSnapshot?.zoom || locationData?.mapZoom || 17,
        mapType: capturedSnapshot?.mapType || "hybrid",
        size: capturedSnapshot?.size || { width: 640, height: 400 },
        sha256: capturedSnapshot?.sha256 || null,
        metadata: {
          siteMetrics,
          sunPath: locationData.sunPath,
          wind: locationData.wind,
          climateAnalysis: locationData.climate,
          siteAnalysis: locationData.siteAnalysis,
          siteDNA: locationData.siteDNA,
          climateSummary: locationData.climateSummary,
        },
      });

      let v2Bundle = null;
      const selectedSubType = projectDetails.subType || projectDetails.program;
      const canUseResidentialV2 =
        residentialV2Enabled &&
        projectDetails.category === "residential" &&
        isSupportedResidentialV2SubType(selectedSubType);

      if (restrictToResidentialV2 && !canUseResidentialV2) {
        throw new Error(
          "UK Residential V2 currently supports detached, semi-detached, terraced, villa, cottage, duplex, and small apartment residential projects only.",
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
        convertedFromPdf: file.convertedFromPdf,
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
            convertedFromPdf: file.convertedFromPdf,
          }));
      const designFloorAuth = resolveAuthoritativeFloorCount(projectDetails, {
        fallback: 2,
        maxFloors: projectDetails?.floorMetrics?.maxFloorsAllowed || null,
      });
      const designFloorCount = designFloorAuth.floorCount;

      const designSpec = {
        buildingProgram: selectedSubType || projectDetails.category,
        buildingCategory: projectDetails.category,
        buildingSubType: projectDetails.subType,
        buildingNotes: projectDetails.customNotes,
        floorArea: parseFloat(projectDetails.area),
        area: parseFloat(projectDetails.area), // Alias for services expecting `area`
        floorCount: designFloorCount,
        floors: designFloorCount, // Alias for services expecting `floors`
        floorCountLocked: Boolean(projectDetails.floorCountLocked),
        autoDetectedFloorCount: projectDetails.autoDetectedFloorCount ?? null,
        floorCountAuthoritySource: designFloorAuth.source,
        entranceOrientation: projectDetails.entranceDirection,
        entranceDirection: projectDetails.entranceDirection, // Maintain backward compatibility
        programSpaces: effectiveProgramSpaces,
        programGeneratorMeta: {
          autoDetected: projectDetails.entranceAutoDetected,
          confidence: projectDetails.entranceConfidence,
          warnings: programWarnings,
          pipelineVersion:
            v2Bundle?.pipelineVersion || UK_RESIDENTIAL_V2_PIPELINE_VERSION,
        },
        sitePolygon,
        siteMetrics, // Alias for downstream generators expecting `siteMetrics`
        sitePolygonMetrics: siteMetrics,
        pipelineVersion:
          v2Bundle?.pipelineVersion || UK_RESIDENTIAL_V2_PIPELINE_VERSION,
        portfolioBlend: {
          materialWeight,
          characteristicWeight,
          portfolioFiles: portfolioFilesForDesignSpec,
          localStyle: locationData?.recommendedStyle,
          climateStyle: locationData?.climate?.type,
        },
        siteAnalysis: locationData?.siteAnalysis,
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
              location: {
                ...locationData,
                climate: locationData?.climate,
                sunPath: locationData?.sunPath || locationData?.siteDNA?.solar,
                wind: locationData?.wind,
              },
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
        seed: Date.now(),
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
    restrictToResidentialV2,
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
  const handleExport = useCallback(
    async (format) => {
      if (!result) return;

      try {
        await exportSheetWorkflow({
          sheet: result,
          format,
        });
      } catch (err) {
        logger.error("Export failed", err);
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
        await exportService.exportCAD({ sheet: result, format });
      } catch (err) {
        logger.error("CAD export failed", err);
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
        await exportService.exportBIM({ sheet: result, format });
      } catch (err) {
        logger.error("BIM export failed", err);
      }
    },
    [result],
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
      entranceAutoDetected: false,
      entranceConfidence: 0,
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

  /**
   * Render current step
   */
  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <LandingPage
            onStart={() => setCurrentStep(1)}
            onDemo={() => {
              window.location.search = "?demo=true";
            }}
          />
        );

      case 1:
        return (
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

      case 2:
        return (
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

      case 3:
        return (
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

      case 4:
        return (
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

      case 5:
        return (
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

      case 6:
        return (
          <Suspense
            fallback={
              <Card className="border border-navy-700 bg-navy-950/70 p-8 text-center text-white">
                Preparing results workspace...
              </Card>
            }
          >
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
          </Suspense>
        );

      default:
        return <LandingPage onStart={() => setCurrentStep(1)} />;
    }
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
        <PricingPage onBack={() => setView("wizard")} />
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

          {/* PDF conversion error modal (replaces window.alert) */}
          <Modal
            open={!!pdfErrorState}
            onClose={() => setPdfErrorState(null)}
            title="PDF couldn't be converted"
            description="We couldn't render this PDF as an image. Try uploading a JPG or PNG instead."
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
