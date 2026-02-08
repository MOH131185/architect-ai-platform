/**
 * Architect AI Wizard Container
 *
 * Main container component that orchestrates the wizard flow.
 * Redesigned with new UI components and design system.
 */

import React, { useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, X } from "lucide-react";
import { useArchitectAIWorkflow } from "../hooks/useArchitectAIWorkflow.js";
import { useWizardState } from "../hooks/useWizardState.js";
import { normalizeSiteSnapshot } from "../types/schemas.js";
import { computeSiteMetrics } from "../utils/geometry.js";
import { locationIntelligence } from "../services/locationIntelligence.js";
import siteAnalysisService from "../services/siteAnalysisService.js";
import autoLevelAssignmentService from "../services/autoLevelAssignmentService.js";
import logger from "../utils/logger.js";
import { convertPdfFileToImageFile } from "../utils/pdfToImages.js";
import {
  sanitizePromptInput,
  sanitizeDimensionInput,
} from "../utils/promptSanitizer.js";
import buildingFootprintService from "../services/buildingFootprintService.js";
import { buildSiteContext } from "../rings/ring1-site/siteContextBuilder.js";
import { captureSnapshotForPersistence } from "../services/siteMapSnapshotService.js";

// Step Components
import LocationStep from "./steps/LocationStep.jsx";
import IntelligenceStep from "./steps/IntelligenceStep.jsx";
import PortfolioStep from "./steps/PortfolioStep.jsx";
import SpecsStep from "./steps/SpecsStep.jsx";
import GenerateStep from "./steps/GenerateStep.jsx";
import ResultsStep from "./steps/ResultsStep.jsx";

// Landing page
import LandingPage from "./LandingPage.jsx";

// Import new UI components and layout
import { Card } from "./ui";
import { AppShell, PageTransition } from "./layout";
import "../styles/deepgram.css";

// Step Progress Bar Component
const StepProgressBar = ({ steps, currentStep }) => {
  return (
    <div className="relative">
      <div className="flex items-center justify-between max-w-4xl mx-auto">
        {steps.map((step, index) => {
          const isActive = index + 1 === currentStep;
          const isCompleted = index + 1 < currentStep;

          return (
            <div key={index} className="flex-1 relative">
              <div className="flex flex-col items-center">
                {/* Step Circle */}
                <motion.div
                  className={`w-12 h-12 rounded-full flex items-center justify-center font-bold transition-all duration-300 ${
                    isActive
                      ? "bg-gradient-to-br from-royal-600 to-royal-400 text-white shadow-glow"
                      : isCompleted
                        ? "bg-royal-600 text-white"
                        : "bg-navy-800 text-gray-500 border border-navy-700"
                  }`}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: index * 0.1 }}
                >
                  {isCompleted ? "✓" : index + 1}
                </motion.div>

                {/* Step Label */}
                <div className="mt-2 text-center">
                  <p
                    className={`text-sm font-semibold ${isActive ? "text-white" : "text-gray-400"}`}
                  >
                    {step.label}
                  </p>
                  <p className="text-xs text-gray-500">{step.description}</p>
                </div>
              </div>

              {/* Connector Line */}
              {index < steps.length - 1 && (
                <div className="absolute top-6 left-1/2 w-full h-0.5 bg-navy-800">
                  <motion.div
                    className="h-full bg-gradient-to-r from-royal-600 to-royal-400"
                    initial={{ width: "0%" }}
                    animate={{ width: isCompleted ? "100%" : "0%" }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
const ArchitectAIWizardContainer = () => {
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
  }, []);

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
          if (footprintResult?.success && footprintResult.polygon?.length > 0) {
            detectedFootprint = footprintResult.polygon;
            detectedShape = footprintResult.shape;
          }
        } catch (fpErr) {
          logger.warn("Building footprint detection failed", fpErr);
        }
      }

      // Select best polygon: footprint -> analysis boundary -> existing
      const polygon =
        detectedFootprint ||
        (siteAnalysis.siteBoundary && siteAnalysis.siteBoundary.length > 0
          ? siteAnalysis.siteBoundary
          : sitePolygon);

      const siteDNA = buildSiteContext({
        location: { address, coordinates },
        sitePolygon: polygon,
        detectedBuildingFootprint: detectedFootprint,
        siteAnalysis,
        climate: climateBundle.climate,
        seasonalClimate: climateBundle,
        streetContext: siteAnalysis?.streetContext,
      });

      if (polygon && polygon.length > 0) {
        setSitePolygon(polygon);
      }
      const derivedMetrics =
        siteDNA?.metrics || (polygon ? computeSiteMetrics(polygon) : null);
      if (derivedMetrics) {
        setSiteMetrics(derivedMetrics);
      } else if (!polygon) {
        setSiteMetrics(null);
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
        recommendedStyle: styleRecommendations.recommendedStyle,
        localStyles: styleRecommendations.localStyles || [],
        localMaterials: styleRecommendations.materials || [],
        materialContext: styleRecommendations.materialContext || {},
        zoning: siteAnalysis.constraints || {},
        siteBoundary: polygon,
        surfaceArea: siteAnalysis.surfaceArea,
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
  }, [address, clearError, sitePolygon]);

  const handleSitePolygonChange = useCallback((polygon) => {
    setSitePolygon(polygon);
    if (polygon && polygon.length > 0) {
      const metrics = computeSiteMetrics(polygon);
      setSiteMetrics(metrics);
    }
  }, []);

  // Handle boundary updates from SiteBoundaryEditor
  const handleBoundaryUpdated = useCallback((boundaryData) => {
    if (!boundaryData) return;

    const polygon = boundaryData.polygon || [];
    setSitePolygon(polygon);
    setSiteMetrics(
      polygon && polygon.length >= 3 ? computeSiteMetrics(polygon) : null,
    );
  }, []);

  /**
   * Portfolio handlers
   */
  const handleRemovePortfolioFile = useCallback((index) => {
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
  }, []);

  const handlePortfolioUpload = useCallback(async (eventOrFiles) => {
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
            alert(
              `Failed to convert PDF: ${originalFile.name}\n${pdfErr.message}`,
            );
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
  }, []);

  /**
   * Specs handlers
   */
  const handleGenerateSpaces = useCallback(async () => {
    if (!projectDetails.category || !projectDetails.area) return;

    setIsGeneratingSpaces(true);
    setProgramWarnings([]);

    try {
      const sanitizedProgram = sanitizePromptInput(
        projectDetails.program ||
          projectDetails.subType ||
          projectDetails.category,
        { maxLength: 120, allowNewlines: false },
      );
      const sanitizedArea = sanitizeDimensionInput(projectDetails.area);

      if (!sanitizedProgram || !sanitizedArea) {
        setProgramWarnings([
          "Provide building type and area to generate a program.",
        ]);
        return;
      }

      const togetherAIReasoningService = (
        await import("../services/togetherAIReasoningService")
      ).default;

      const isFloorCountLocked = !!projectDetails.floorCountLocked;
      const desiredFloorCount = Math.max(
        1,
        parseInt(projectDetails.floorCount, 10) || 1,
      );
      const suggestedFloorCount =
        projectDetails.autoDetectedFloorCount || desiredFloorCount || 2;
      const floorCountForPrompt = isFloorCountLocked
        ? desiredFloorCount
        : suggestedFloorCount;

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
          floorCount: projectDetails.floorCount || 2,
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

      // Auto level assignment with site area
      const siteArea = siteMetrics?.areaM2 || 0;
      const fallbackFloorCount = Math.max(
        1,
        parseInt(projectDetails.floorCount, 10) || 1,
      );
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

        const floorMetrics = autoLevelAssignmentService.calculateOptimalLevels(
          totalProgramArea,
          siteArea,
          {
            buildingType: sanitizedProgram,
            subType: projectDetails.subType || null,
            maxFloors: 10,
            circulationFactor: hasExplicitCirculation ? 1.0 : 1.15,
          },
        );

        const autoFloors = floorMetrics.optimalFloors;
        const floorCountToUse = isFloorCountLocked
          ? fallbackFloorCount
          : autoFloors || fallbackFloorCount;

        const assigned = autoLevelAssignmentService.autoAssignSpacesToLevels(
          spaces,
          floorCountToUse,
          sanitizedProgram,
        );

        assigned._calculatedFloorCount = floorCountToUse;
        assigned._floorMetrics = floorMetrics;
        spaces = assigned;

        setProjectDetails((prev) => {
          const next = {
            ...prev,
            autoDetectedFloorCount: autoFloors,
            floorMetrics,
          };
          if (!prev.floorCountLocked) {
            next.floorCount = floorCountToUse;
          }
          return next;
        });

        setProgramWarnings((prev) => [
          ...prev,
          isFloorCountLocked
            ? `Auto-detected ${autoFloors} levels from ${Math.round(siteArea)} m² site (locked to ${floorCountToUse})`
            : `Auto-detected ${floorCountToUse} levels from ${Math.round(siteArea)} m² site`,
        ]);
      } else {
        spaces._calculatedFloorCount = fallbackFloorCount;
        spaces._floorMetrics = projectDetails.floorMetrics || null;
      }

      setProgramSpaces(spaces);

      logger.success("Program spaces generated", { count: spaces.length });
    } catch (err) {
      logger.error("Space generation failed", err);
      setProgramSpaces([]);
    } finally {
      setIsGeneratingSpaces(false);
    }
  }, [projectDetails, locationData, siteMetrics]);

  const handleProgramSpacesChange = useCallback(
    (spaces) => {
      const normalizedSpaces = (spaces || []).map((space, index) => ({
        ...space,
        id: space.id || `space_${Date.now()}_${index}`,
        name: String(space.name || space.label || `Space ${index + 1}`),
        label: String(space.label || space.name || `Space ${index + 1}`),
        area: Math.max(0, parseFloat(space.area) || 0),
        count: Math.max(1, parseInt(space.count, 10) || 1),
        level: space.level || "Ground",
      }));

      normalizedSpaces._calculatedFloorCount =
        spaces?._calculatedFloorCount || projectDetails.floorCount || 2;
      normalizedSpaces._floorMetrics =
        spaces?._floorMetrics || projectDetails.floorMetrics || null;

      setProgramSpaces(normalizedSpaces);
    },
    [projectDetails.floorCount, projectDetails.floorMetrics],
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
            const normalizedSpaces = (result.spaces || []).map(
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

            setProgramSpaces(normalizedSpaces);
            logger.success("Program imported", { count: result.spaces.length });

            if (result.warnings.length > 0) {
              setProgramWarnings(result.warnings);
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
  }, []);

  const handleExportProgram = useCallback(async () => {
    try {
      const ProgramImportExportService = (
        await import("../services/ProgramImportExportService")
      ).default;

      const metadata = {
        buildingType: `${projectDetails.category}_${projectDetails.subType}`,
        area: projectDetails.area,
        floorCount: projectDetails.floorCount,
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
  }, [sitePolygon, locationData, siteMetrics]);

  /**
   * Generation handler
   */
  const handleGenerate = useCallback(async () => {
    try {
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

      const designSpec = {
        buildingProgram:
          projectDetails.program ||
          projectDetails.subType ||
          projectDetails.category,
        buildingCategory: projectDetails.category,
        buildingSubType: projectDetails.subType,
        buildingNotes: projectDetails.customNotes,
        floorArea: parseFloat(projectDetails.area),
        area: parseFloat(projectDetails.area), // Alias for services expecting `area`
        floorCount: projectDetails.floorCount || 2,
        floors: projectDetails.floorCount || 2, // Alias for services expecting `floors`
        entranceOrientation: projectDetails.entranceDirection,
        entranceDirection: projectDetails.entranceDirection, // Maintain backward compatibility
        programSpaces,
        programGeneratorMeta: {
          autoDetected: projectDetails.entranceAutoDetected,
          confidence: projectDetails.entranceConfidence,
          warnings: programWarnings,
        },
        sitePolygon,
        siteMetrics, // Alias for downstream generators expecting `siteMetrics`
        sitePolygonMetrics: siteMetrics,
        portfolioBlend: {
          materialWeight,
          characteristicWeight,
          portfolioFiles: portfolioFiles.map((file) => ({
            name: file.name,
            size: file.size,
            preview: file.preview,
            dataUrl: file.dataUrl, // Base64 for API usage (critical for vision AI)
            file: file.file,
            type: file.type,
            convertedFromPdf: file.convertedFromPdf,
          })),
          localStyle: locationData?.recommendedStyle,
          climateStyle: locationData?.climate?.type,
        },
        siteAnalysis: locationData?.siteAnalysis,
        siteDNA: locationData?.siteDNA,
        localMaterials: locationData?.localMaterials,
        location: {
          ...locationData,
          climate: locationData?.climate,
          sunPath: locationData?.sunPath || locationData?.siteDNA?.solar,
          wind: locationData?.wind,
        },
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
    }
  }, [
    locationData,
    sitePolygon,
    siteMetrics,
    projectDetails,
    programSpaces,
    materialWeight,
    characteristicWeight,
    generateSheet,
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
  }, []);

  const handleBack = useCallback(() => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  }, []);

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
      footprintArea: "",
      entranceDirection: "N",
      entranceAutoDetected: false,
      entranceConfidence: 0,
      program: "",
    });
    setProgramSpaces([]);
    setProgramWarnings([]);
    setGeneratedDesignId(null);
  }, []);

  /**
   * Render current step
   */
  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return <LandingPage onStart={() => setCurrentStep(1)} />;

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
            generationComplete={!!result}
            onGenerate={handleGenerate}
            onBack={handleBack}
            onViewResults={() => setCurrentStep(6)}
          />
        );

      case 6:
        return (
          <ResultsStep
            result={result}
            designId={generatedDesignId}
            onModify={handleModify}
            onExport={handleExport}
            onExportCAD={handleExportCAD}
            onExportBIM={handleExportBIM}
            onBack={handleBack}
            onStartNew={handleStartNew}
          />
        );

      default:
        return <LandingPage onStart={() => setCurrentStep(1)} />;
    }
  };

  return (
    <AppShell
      showNav={currentStep > 0}
      showFooter={currentStep === 0}
      navProps={{
        onNewDesign: handleStartNew,
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

          {/* Current Step */}
          {renderStep()}

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
