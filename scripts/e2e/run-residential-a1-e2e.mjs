#!/usr/bin/env node

import axios from "axios";
import dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "../..");

dotenv.config({ path: path.join(PROJECT_ROOT, ".env") });

let buildingFootprintService;
let getClimateData;
let locationIntelligence;
let buildSiteContext;
let siteAnalysisService;
let captureSnapshotForPersistence;
let normalizeSiteSnapshot;
let computeSiteMetrics;

const DEFAULT_ADDRESS = "Burn Road, Immingham DN40, UK";
const DEFAULT_SUBTYPE = "detached-house";
const DEFAULT_AREA = 185;
const DEFAULT_MANUAL_FLOORS = 3;
const DEFAULT_SERVER = "http://localhost:3001";

function parseArgs(argv = []) {
  const args = {
    address: DEFAULT_ADDRESS,
    subType: DEFAULT_SUBTYPE,
    area: DEFAULT_AREA,
    manualFloors: DEFAULT_MANUAL_FLOORS,
    output: path.join(PROJECT_ROOT, "outputs", "e2e"),
    server: DEFAULT_SERVER,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];

    if (token === "--address" && next) {
      args.address = next;
      index += 1;
      continue;
    }

    if (token === "--subtype" && next) {
      args.subType = next;
      index += 1;
      continue;
    }

    if (token === "--area" && next) {
      args.area = Number(next);
      index += 1;
      continue;
    }

    if (token === "--manual-floors" && next) {
      args.manualFloors = Number(next);
      index += 1;
      continue;
    }

    if (token === "--output" && next) {
      args.output = path.resolve(PROJECT_ROOT, next);
      index += 1;
      continue;
    }

    if (token === "--server" && next) {
      args.server = next.replace(/\/+$/, "");
      index += 1;
    }
  }

  return args;
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function loadRuntimeModules() {
  if (
    buildingFootprintService &&
    getClimateData &&
    locationIntelligence &&
    buildSiteContext &&
    siteAnalysisService &&
    captureSnapshotForPersistence &&
    normalizeSiteSnapshot &&
    computeSiteMetrics
  ) {
    return;
  }

  const [
    buildingFootprintModule,
    climateModule,
    locationIntelligenceModule,
    siteContextBuilderModule,
    siteAnalysisModule,
    siteSnapshotModule,
    schemaModule,
    geometryModule,
  ] = await Promise.all([
    import("../../src/services/buildingFootprintService.js"),
    import("../../src/services/climateService.js"),
    import("../../src/services/locationIntelligence.js"),
    import("../../src/rings/ring1-site/siteContextBuilder.js"),
    import("../../src/services/siteAnalysisService.js"),
    import("../../src/services/siteMapSnapshotService.js"),
    import("../../src/types/schemas.js"),
    import("../../src/utils/geometry.js"),
  ]);

  buildingFootprintService = buildingFootprintModule.default;
  getClimateData = climateModule.getClimateData;
  locationIntelligence = locationIntelligenceModule.locationIntelligence;
  buildSiteContext = siteContextBuilderModule.buildSiteContext;
  siteAnalysisService = siteAnalysisModule.default;
  captureSnapshotForPersistence =
    siteSnapshotModule.captureSnapshotForPersistence;
  normalizeSiteSnapshot = schemaModule.normalizeSiteSnapshot;
  computeSiteMetrics = geometryModule.computeSiteMetrics;
}

function buildLevelBreakdown(spaces = []) {
  return spaces.reduce((accumulator, space) => {
    const key = String(space?.level || `Level ${space?.levelIndex || 0}`);
    const entry = accumulator[key] || {
      count: 0,
      area: 0,
      spaces: [],
    };
    entry.count += Number(space?.count || 1);
    entry.area += Number(space?.area || 0) * Number(space?.count || 1);
    entry.spaces.push(space?.name || space?.label || "Space");
    accumulator[key] = entry;
    return accumulator;
  }, {});
}

async function ensureServer(serverBaseUrl) {
  const response = await fetch(`${serverBaseUrl}/api/health`);
  if (!response.ok) {
    throw new Error(
      `Local API server health check failed with ${response.status}`,
    );
  }
  return response.json();
}

async function geocodeAddress(address) {
  const apiKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY || "";
  if (!apiKey) {
    throw new Error("REACT_APP_GOOGLE_MAPS_API_KEY is required");
  }

  const response = await axios.get(
    "https://maps.googleapis.com/maps/api/geocode/json",
    {
      params: {
        address,
        key: apiKey,
      },
    },
  );

  if (
    response.data.status !== "OK" ||
    !Array.isArray(response.data.results) ||
    response.data.results.length === 0
  ) {
    throw new Error(`Geocoding failed for "${address}": ${response.data.status}`);
  }

  return response.data.results[0];
}

function buildLocationData({
  address,
  geocodeResult,
  climateData,
  siteAnalysis,
  sitePolygon,
  siteMetrics,
  siteDNA,
  styleRecommendations,
  buildingFootprint,
}) {
  return {
    address,
    coordinates: geocodeResult.geometry.location,
    location: geocodeResult,
    climate: {
      ...climateData.climate,
      prevailingWind:
        climateData.wind?.direction ||
        climateData.climate?.prevailing_wind?.direction ||
        null,
    },
    wind: climateData.wind || climateData.climate?.prevailing_wind || null,
    sunPath: climateData.sunPath || climateData.climate?.sun_path || null,
    siteDNA,
    siteAnalysis,
    siteBoundary: sitePolygon,
    siteMetrics,
    buildingFootprint,
    recommendedStyle:
      styleRecommendations?.primary ||
      styleRecommendations?.recommendedStyle ||
      "Contemporary Local",
    localStyles: styleRecommendations?.alternatives || [],
    localMaterials: (styleRecommendations?.materials || []).map((entry) =>
      typeof entry === "string" ? entry : entry?.name || String(entry || ""),
    ),
    materialContext: styleRecommendations?.materialContext || {},
    zoning: siteAnalysis?.constraints || {},
    climateSummary: {
      prevailingWind:
        climateData.wind?.direction ||
        climateData.climate?.prevailing_wind?.direction ||
        "",
      avgSummerTemp:
        climateData.climate?.seasonal?.summer?.avgTemp ||
        climateData.climate?.avg_temp_c?.summer ||
        "",
      avgWinterTemp:
        climateData.climate?.seasonal?.winter?.avgTemp ||
        climateData.climate?.avg_temp_c?.winter ||
        "",
    },
  };
}

async function resolveLiveLocationBundle(address) {
  const geocodeResult = await geocodeAddress(address);
  const coordinates = geocodeResult.geometry.location;
  const climateData = await getClimateData(coordinates.lat, coordinates.lng);
  const siteAnalysisResult = await siteAnalysisService.analyzeSiteContext(
    geocodeResult.formatted_address || address,
    coordinates,
  );
  const footprintResult = await buildingFootprintService.detectAddressShape(
    address,
    process.env.REACT_APP_GOOGLE_MAPS_API_KEY || "",
  );

  const sitePolygon =
    (footprintResult?.success && footprintResult.polygon) ||
    siteAnalysisResult?.siteAnalysis?.siteBoundary ||
    [];

  const siteMetrics =
    Array.isArray(sitePolygon) && sitePolygon.length >= 3
      ? computeSiteMetrics(sitePolygon)
      : {
          areaM2: Number(siteAnalysisResult?.siteAnalysis?.surfaceArea || 0),
          source: siteAnalysisResult?.siteAnalysis?.boundarySource || "unknown",
        };

  const styleRecommendations =
    await locationIntelligence.recommendArchitecturalStyle(
      geocodeResult,
      climateData.climate,
      { projectType: "residential" },
    );

  const siteDNA = buildSiteContext({
    location: { address, coordinates },
    sitePolygon,
    detectedBuildingFootprint:
      footprintResult?.success === true ? footprintResult.polygon : null,
    siteAnalysis: siteAnalysisResult?.siteAnalysis || {},
    climate: climateData.climate,
    seasonalClimate: climateData,
    streetContext: siteAnalysisResult?.siteAnalysis?.streetContext,
  });

  const capturedSnapshot = await captureSnapshotForPersistence({
    coordinates,
    zoom: 18,
    mapType: "hybrid",
    size: { width: 640, height: 400 },
    polygon: sitePolygon,
  });

  const locationData = buildLocationData({
    address,
    geocodeResult,
    climateData,
    siteAnalysis: siteAnalysisResult?.siteAnalysis || {},
    sitePolygon,
    siteMetrics,
    siteDNA,
    styleRecommendations,
    buildingFootprint:
      footprintResult?.success === true ? footprintResult.polygon : null,
  });

  const siteSnapshot = normalizeSiteSnapshot({
    address,
    coordinates,
    sitePolygon,
    climate: locationData.climate,
    zoning: locationData.zoning,
    dataUrl: capturedSnapshot?.dataUrl || null,
    center: capturedSnapshot?.center || coordinates,
    zoom: capturedSnapshot?.zoom || 18,
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

  return {
    geocodeResult,
    climateData,
    siteAnalysisResult,
    footprintResult,
    sitePolygon,
    siteMetrics,
    siteSnapshot,
    locationData,
  };
}

async function postJson(serverBaseUrl, route, body) {
  const response = await fetch(`${serverBaseUrl}${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const payload = await response.json();
  if (!response.ok) {
    const reason =
      payload?.error ||
      payload?.validation?.blockers?.[0] ||
      payload?.blockers?.[0] ||
      `HTTP ${response.status}`;
    throw new Error(`${route} failed: ${reason}`);
  }

  return payload;
}

async function saveJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function saveDataArtifact(sourceUrl, filePath) {
  if (!sourceUrl) {
    return null;
  }

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(
      `Artifact download failed with ${response.status} for ${sourceUrl}`,
    );
  }
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (buffer.length === 0) {
    throw new Error(`Artifact download produced no bytes for ${sourceUrl}`);
  }
  const tempFilePath = `${filePath}.tmp`;
  await fs.writeFile(tempFilePath, buffer);
  await fs.rename(tempFilePath, filePath);
  return filePath;
}

function buildProjectDetails({
  subType,
  area,
  floorCount = null,
  floorCountLocked = false,
}) {
  return {
    category: "residential",
    subType,
    program: subType,
    area: Number(area),
    floorCount: floorCount || 2,
    floorCountLocked,
    entranceDirection: "S",
    customNotes:
      "Target an architect-grade UK A1 sheet with readable technical drawings and context-aware local material language.",
  };
}

function summarizeCompileResult(name, compileResponse = {}) {
  const bundle = compileResponse.bundle || {};
  const authority = bundle.authorityReadiness || {};
  const programBrief = bundle.programBrief || {};

  return {
    scenario: name,
    supported: bundle.supported === true,
    pipelineVersion: bundle.pipelineVersion || compileResponse.pipelineVersion,
    geometryHash: bundle.compiledProject?.geometryHash || null,
    authorityReady: authority.ready === true,
    authorityBlockers: authority.blockers || [],
    requestedFloorCount: authority.requested?.floorCount || null,
    resolvedFloorCount: authority.evidence?.levelCount || null,
    programLevelCount: programBrief.levelCount || null,
    programBreakdown: buildLevelBreakdown(programBrief.spaces || []),
    technicalPanelTypes: bundle.technicalPack?.panelTypes || [],
  };
}

function summarizeGenerationResult(generationResponse = {}) {
  const result = generationResponse.result || {};
  const verification =
    generationResponse.verification ||
    result.verification ||
    result.verificationBundle?.verification ||
    null;
  const publishability =
    result.publishability ||
    result.metadata?.publishability ||
    result.publishabilityReport ||
    null;

  return {
    success: generationResponse.success === true,
    geometryHash: generationResponse.geometryHash || null,
    authorityReady:
      generationResponse.authorityReadiness?.ready === true ||
      result.authorityReadiness?.ready === true,
    technicalAuthority: generationResponse.technicalAuthority || null,
    verification,
    publishability,
    composedSheetUrl:
      result.composedSheetUrl || generationResponse.result?.url || null,
    panelCount:
      (Array.isArray(result.panels) && result.panels.length) ||
      Object.keys(result.panelMap || {}).length ||
      0,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const runDir = path.join(args.output, stamp());

  await loadRuntimeModules();

  console.log(`[E2E] Ensuring local API server at ${args.server}`);
  const health = await ensureServer(args.server);

  console.log(`[E2E] Resolving live location data for ${args.address}`);
  const locationBundle = await resolveLiveLocationBundle(args.address);

  const autoProjectDetails = buildProjectDetails({
    subType: args.subType,
    area: args.area,
  });
  const lockedProjectDetails = buildProjectDetails({
    subType: args.subType,
    area: args.area,
    floorCount: args.manualFloors,
    floorCountLocked: true,
  });

  console.log("[E2E] Running compile scenario: auto");
  const autoCompile = await postJson(args.server, "/api/project/compile", {
    projectDetails: autoProjectDetails,
    locationData: locationBundle.locationData,
    sitePolygon: locationBundle.sitePolygon,
    siteMetrics: locationBundle.siteMetrics,
    programSpaces: [],
    portfolioFiles: [],
    materialWeight: 0.45,
    characteristicWeight: 0.55,
  });

  console.log("[E2E] Running compile scenario: manual floor lock");
  const manualCompile = await postJson(args.server, "/api/project/compile", {
    projectDetails: lockedProjectDetails,
    locationData: locationBundle.locationData,
    sitePolygon: locationBundle.sitePolygon,
    siteMetrics: locationBundle.siteMetrics,
    programSpaces: autoCompile.bundle?.programBrief?.spaces || [],
    portfolioFiles: [],
    materialWeight: 0.45,
    characteristicWeight: 0.55,
  });

  console.log("[E2E] Running live sheet generation");
  const generation = await postJson(args.server, "/api/project/generate-sheet", {
    projectDetails: lockedProjectDetails,
    programSpaces: manualCompile.bundle?.programBrief?.spaces || [],
    locationData: locationBundle.locationData,
    sitePolygon: locationBundle.sitePolygon,
    siteMetrics: locationBundle.siteMetrics,
    siteSnapshot: locationBundle.siteSnapshot,
    portfolioFiles: [],
    materialWeight: 0.45,
    characteristicWeight: 0.55,
    baseSeed: Date.now(),
  });

  const autoSummary = summarizeCompileResult("auto", autoCompile);
  const manualSummary = summarizeCompileResult("manual", manualCompile);
  const generationSummary = summarizeGenerationResult(generation);

  const report = {
    runAt: new Date().toISOString(),
    serverHealth: health,
    inputs: args,
    location: {
      formattedAddress:
        locationBundle.geocodeResult?.formatted_address || args.address,
      coordinates: locationBundle.geocodeResult?.geometry?.location || null,
      climateType: locationBundle.locationData?.climate?.type || null,
      recommendedStyle: locationBundle.locationData?.recommendedStyle || null,
      siteBoundarySource:
        locationBundle.siteAnalysisResult?.siteAnalysis?.boundarySource ||
        (locationBundle.footprintResult?.success ? "google_building_outline" : null),
      siteAreaM2:
        Number(locationBundle.siteMetrics?.areaM2 || 0) ||
        Number(locationBundle.siteAnalysisResult?.siteAnalysis?.surfaceArea || 0),
      footprintDetected: locationBundle.footprintResult?.success === true,
    },
    scenarios: {
      auto: autoSummary,
      manual: manualSummary,
    },
    generation: generationSummary,
  };

  const sheetPath = generationSummary.composedSheetUrl
    ? path.join(runDir, "a1-sheet.png")
    : null;
  const siteSnapshotPath = locationBundle.siteSnapshot?.dataUrl
    ? path.join(runDir, "site-snapshot.png")
    : null;

  if (sheetPath) {
    await saveDataArtifact(generationSummary.composedSheetUrl, sheetPath);
  }
  if (siteSnapshotPath) {
    await saveDataArtifact(locationBundle.siteSnapshot.dataUrl, siteSnapshotPath);
  }

  await saveJson(path.join(runDir, "report.json"), report);
  await saveJson(path.join(runDir, "location-bundle.json"), {
    geocodeResult: locationBundle.geocodeResult,
    climateData: locationBundle.climateData,
    siteAnalysisResult: locationBundle.siteAnalysisResult,
    footprintResult: locationBundle.footprintResult,
    sitePolygon: locationBundle.sitePolygon,
    siteMetrics: locationBundle.siteMetrics,
    locationData: locationBundle.locationData,
    siteSnapshot: locationBundle.siteSnapshot,
  });
  await saveJson(path.join(runDir, "compile-auto.json"), autoCompile);
  await saveJson(path.join(runDir, "compile-manual.json"), manualCompile);
  await saveJson(path.join(runDir, "generate-sheet.json"), generation);

  console.log(
    JSON.stringify(
      {
        runDir,
        auto: autoSummary,
        manual: manualSummary,
        generation: generationSummary,
        artifacts: {
          sheetPath,
          siteSnapshotPath,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        error: error.message,
        stack: error.stack?.split("\n").slice(0, 6),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
