/**
 * useArchitectAIWorkflow Hook
 *
 * React hook for orchestrating A1 sheet generation and modification workflows.
 * Delegates to pure services (pureOrchestrator, pureModificationService, exportService).
 * Manages loading states, errors, and results.
 *
 * No direct service calls in components - all go through this hook.
 */

import { useState, useCallback, useRef } from "react";
import { useOptionalAuth } from "../services/auth/clerkFacade.js";
import { createEnvironmentAdapter } from "../services/environmentAdapter.js";
import * as generationGate from "../services/generationGate.js";
// runModifyWorkflow available from '../services/pureOrchestrator.js' if needed
import { modifySheet } from "../services/pureModificationService.js";
import exportService from "../services/exportService.js";
import designHistoryRepository from "../services/designHistoryRepository.js";
import dnaWorkflowOrchestrator from "../services/dnaWorkflowOrchestrator.js";
import logger from "../utils/logger.js";
import { normalizeMultiPanelResult } from "../types/schemas.js";
import { isFeatureEnabled } from "../config/featureFlags.js";
import {
  resolveWorkflowByMode,
  executeWorkflow,
  UnsupportedPipelineModeError,
} from "../services/workflowRouter.js";
import { PIPELINE_MODE } from "../config/pipelineMode.js";
import { createSheetArtifactManifest } from "../services/project/v2ProjectContracts.js";
import {
  levelIndexFromLabel,
  levelName,
  normalizeLevelIndex,
} from "../services/project/levelUtils.js";
import { resolveAuthoritativeFloorCount } from "../services/project/floorCountAuthority.js";
import {
  sanitizeInvalidSvgPaths,
  sanitizeSvgDataUrl,
} from "../utils/svgPathSanitizer.js";

const STAGES = Object.freeze([
  "analysis",
  "dna",
  "layout",
  "rendering",
  "finalizing",
]);
const PROJECT_GRAPH_REQUEST_SOFT_LIMIT_CHARS = 750_000;
const PROJECT_GRAPH_SITE_SNAPSHOT_DATA_URL_MAX_CHARS = 600_000;
const SITE_SNAPSHOT_IMAGE_DATA_URL_RE =
  /^data:image\/(?:png|jpe?g|webp);base64,[a-z0-9+/=\s]+$/i;

function isTruthyRequestFlag(value) {
  if (value === true) return true;
  if (value === false || value == null) return false;
  return [
    "1",
    "true",
    "yes",
    "on",
    "reference_match",
    "reference-match",
  ].includes(String(value).trim().toLowerCase());
}

const getStageForStep = (step) =>
  STAGES[Math.max(0, Math.min(STAGES.length - 1, Number(step || 0) - 1))] ||
  "analysis";

const getStepForStage = (stage) => {
  const index = STAGES.indexOf(stage);
  return index >= 0 ? index + 1 : 0;
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

function compactLatLngPolygon(polygon = []) {
  if (!Array.isArray(polygon)) {
    return [];
  }
  const normalized = polygon.map(normalizeLatLngPoint).filter(Boolean);
  return normalized.length >= 3 ? normalized : [];
}

function buildManifestPanels(multiPanelResult = {}) {
  const entries = {};
  const panelMap =
    multiPanelResult?.panelMap || multiPanelResult?.panelsByKey || {};
  Object.entries(panelMap).forEach(([panelType, panel]) => {
    entries[panelType] = {
      panelType,
      sourceType:
        panel?.sourceType ||
        panel?.metadata?.sourceType ||
        panel?.metadata?.authorityType ||
        "generated_panel",
      authorityUsed:
        panel?.authorityUsed || panel?.metadata?.authorityUsed || null,
      authoritySource:
        panel?.authoritySource || panel?.metadata?.authoritySource || null,
      panelAuthorityReason:
        panel?.panelAuthorityReason ||
        panel?.metadata?.panelAuthorityReason ||
        null,
      geometryHash:
        panel?.geometryHash ||
        panel?.metadata?.geometryHash ||
        multiPanelResult?.metadata?.geometryHash ||
        null,
      svgHash: panel?.svgHash || panel?.metadata?.svgHash || null,
      slotMetrics: panel?.slotMetrics || panel?.metadata?.slotMetrics || null,
      occupancyScore:
        panel?.occupancyScore ?? panel?.metadata?.occupancyScore ?? null,
      validation: panel?.validation || panel?.metadata?.validation || null,
    };
  });
  return entries;
}

export function sanitizeProjectGraphSvg(svgString = "") {
  if (typeof svgString !== "string") {
    return "";
  }

  return sanitizeInvalidSvgPaths(svgString);
}

function svgToDataUrl(svgString = "") {
  const safeSvgString = sanitizeProjectGraphSvg(svgString);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(safeSvgString)}`;
}

export function sanitizeProjectGraphPanelMap(panelMap = {}) {
  if (!panelMap || typeof panelMap !== "object" || Array.isArray(panelMap)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(panelMap).map(([panelType, panel]) => {
      const svgString =
        typeof panel?.svgString === "string"
          ? sanitizeProjectGraphSvg(panel.svgString)
          : null;
      const svg =
        typeof panel?.svg === "string"
          ? sanitizeProjectGraphSvg(panel.svg)
          : null;
      const url = svgString
        ? svgToDataUrl(svgString)
        : sanitizeSvgDataUrl(panel?.url || panel?.imageUrl || panel?.dataUrl);

      return [
        panelType,
        {
          ...panel,
          url: url || null,
          imageUrl: panel?.imageUrl ? sanitizeSvgDataUrl(panel.imageUrl) : null,
          dataUrl: panel?.dataUrl ? sanitizeSvgDataUrl(panel.dataUrl) : null,
          svgString,
          svg,
        },
      ];
    }),
  );
}

function compactSiteSnapshotForRequest(siteSnapshot = null) {
  if (!siteSnapshot || typeof siteSnapshot !== "object") {
    return null;
  }

  const dataUrl =
    typeof siteSnapshot.dataUrl === "string" &&
    SITE_SNAPSHOT_IMAGE_DATA_URL_RE.test(siteSnapshot.dataUrl) &&
    siteSnapshot.dataUrl.length <=
      PROJECT_GRAPH_SITE_SNAPSHOT_DATA_URL_MAX_CHARS
      ? siteSnapshot.dataUrl
      : null;
  const sourceLabel =
    siteSnapshot.sourceUrl ||
    siteSnapshot.source ||
    siteSnapshot.metadata?.source ||
    null;

  return {
    address: siteSnapshot.address || null,
    coordinates: siteSnapshot.coordinates || siteSnapshot.center || null,
    sitePolygon: compactLatLngPolygon(
      siteSnapshot.sitePolygon || siteSnapshot.polygon || [],
    ),
    climate: siteSnapshot.climate || null,
    zoning: siteSnapshot.zoning || null,
    center: siteSnapshot.center || siteSnapshot.coordinates || null,
    zoom: siteSnapshot.zoom || null,
    mapType: siteSnapshot.mapType || null,
    drawPolygonOverlay: siteSnapshot.drawPolygonOverlay !== false,
    size: siteSnapshot.size || null,
    sha256: siteSnapshot.sha256 || null,
    dataUrl,
    attribution:
      siteSnapshot.attribution || siteSnapshot.metadata?.attribution || null,
    sourceUrl:
      typeof sourceLabel === "string" && !sourceLabel.includes("key=")
        ? sourceLabel
        : null,
    capturedAt:
      siteSnapshot.capturedAt || siteSnapshot.metadata?.capturedAt || null,
    metadata: {
      source:
        typeof sourceLabel === "string" && !sourceLabel.includes("key=")
          ? sourceLabel
          : null,
      siteMetrics: siteSnapshot.metadata?.siteMetrics || null,
      sitePlanMode: siteSnapshot.metadata?.sitePlanMode || null,
      boundaryAuthoritative:
        siteSnapshot.metadata?.boundaryAuthoritative === true
          ? true
          : siteSnapshot.metadata?.boundaryAuthoritative === false
            ? false
            : null,
      boundaryEstimated: siteSnapshot.metadata?.boundaryEstimated === true,
      siteSnapshotPolygonRole:
        siteSnapshot.metadata?.siteSnapshotPolygonRole || null,
      contextualBoundaryOverlayUsed:
        siteSnapshot.metadata?.contextualBoundaryOverlayUsed === true,
      contextualBoundaryPolygon: compactLatLngPolygon(
        siteSnapshot.metadata?.contextualBoundaryPolygon || [],
      ),
      sunPath: siteSnapshot.metadata?.sunPath || null,
      wind: siteSnapshot.metadata?.wind || null,
      climateSummary: siteSnapshot.metadata?.climateSummary || null,
      dataUrlOmitted:
        Boolean(siteSnapshot.dataUrl) && dataUrl == null ? true : undefined,
    },
  };
}

function compactLocationDataForRequest(locationData = {}) {
  if (!locationData || typeof locationData !== "object") {
    return {};
  }

  return {
    address: locationData.address || null,
    postcode: locationData.postcode || null,
    coordinates: normalizeLatLngPoint(locationData.coordinates) || null,
    climate: locationData.climate || null,
    zoning: locationData.zoning || null,
    sunPath: locationData.sunPath || locationData.siteDNA?.solar || null,
    wind: locationData.wind || null,
    recommendedStyle: locationData.recommendedStyle || null,
    localMaterials: locationData.localMaterials || [],
    boundaryAuthoritative:
      locationData.boundaryAuthoritative === true
        ? true
        : locationData.boundaryAuthoritative === false
          ? false
          : null,
    boundaryEstimated: locationData.boundaryEstimated === true,
    boundaryWarningCode: locationData.boundaryWarningCode || null,
    boundarySource:
      locationData.boundarySource ||
      locationData.siteAnalysis?.boundarySource ||
      null,
    boundaryConfidence:
      locationData.boundaryConfidence ??
      locationData.siteAnalysis?.boundaryConfidence ??
      null,
    estimatedSiteBoundary: compactLatLngPolygon(
      locationData.estimatedSiteBoundary || [],
    ),
    contextualSiteBoundary: compactLatLngPolygon(
      locationData.contextualSiteBoundary || [],
    ),
    buildingFootprint: compactLatLngPolygon(
      locationData.buildingFootprint || [],
    ),
    siteAnalysis: locationData.siteAnalysis
      ? {
          area: locationData.siteAnalysis.area || null,
          shape: locationData.siteAnalysis.shape || null,
          confidence: locationData.siteAnalysis.confidence || null,
          source: locationData.siteAnalysis.source || null,
          boundarySource: locationData.siteAnalysis.boundarySource || null,
          boundaryConfidence:
            locationData.siteAnalysis.boundaryConfidence ?? null,
          boundaryAuthoritative:
            locationData.siteAnalysis.boundaryAuthoritative === true
              ? true
              : locationData.siteAnalysis.boundaryAuthoritative === false
                ? false
                : null,
          boundaryEstimated:
            locationData.siteAnalysis.boundaryEstimated === true ||
            locationData.siteAnalysis.estimatedOnly === true,
          estimatedOnly: locationData.siteAnalysis.estimatedOnly === true,
          fallbackReason: locationData.siteAnalysis.fallbackReason || null,
          surfaceArea: locationData.siteAnalysis.surfaceArea || null,
          estimatedSurfaceArea:
            locationData.siteAnalysis.estimatedSurfaceArea || null,
          estimatedSiteBoundary: compactLatLngPolygon(
            locationData.siteAnalysis.estimatedSiteBoundary || [],
          ),
          contextualSiteBoundary: compactLatLngPolygon(
            locationData.siteAnalysis.contextualSiteBoundary || [],
          ),
        }
      : null,
  };
}

function compactPortfolioBlendForRequest(portfolioBlend = {}) {
  return {
    materialWeight: portfolioBlend.materialWeight ?? null,
    characteristicWeight: portfolioBlend.characteristicWeight ?? null,
    localStyle: portfolioBlend.localStyle || null,
    climateStyle: portfolioBlend.climateStyle || null,
    portfolioFiles: (portfolioBlend.portfolioFiles || []).map((file) => ({
      name: file.name,
      size: file.size,
      type: file.type,
      convertedFromPdf: Boolean(file.convertedFromPdf),
    })),
  };
}

// Compaction now delegates level parsing/clamping to the canonical
// levelUtils module so manual UI selections, CSV imports, and residential
// templates all round-trip through the same logic. floorCount must be
// passed in so the clamp matches the brief's target_storeys; the backend
// in projectGraphVerticalSliceService.js performs an identical clamp via
// resolveLevelIndex(), but failing to align the two layers is what caused
// the original "Second collapses to Ground" regression.
function compactProgramSpacesForRequest(programSpaces = [], floorCount = 1) {
  const safeFloorCount = Math.max(1, Math.floor(Number(floorCount) || 1));
  return (Array.isArray(programSpaces) ? programSpaces : []).map(
    (space, index) => {
      const explicitNumeric = Number.isFinite(Number(space?.levelIndex))
        ? Number(space.levelIndex)
        : Number.isFinite(Number(space?.level_index))
          ? Number(space.level_index)
          : null;
      const rawIndex =
        explicitNumeric !== null
          ? explicitNumeric
          : levelIndexFromLabel(space?.level);
      const clampedIndex = normalizeLevelIndex(rawIndex, safeFloorCount);
      return {
        id: space.id || `space-${index}`,
        name: String(space.name || space.label || `Space ${index + 1}`),
        label: String(space.label || space.name || `Space ${index + 1}`),
        spaceType: space.spaceType || space.type || null,
        area: Number(space.area || 0),
        count: Math.max(1, Number(space.count || 1)),
        level: levelName(clampedIndex),
        levelIndex: clampedIndex,
        level_index: clampedIndex,
        notes: space.notes ? String(space.notes).slice(0, 500) : "",
      };
    },
  );
}

export function normalizeProjectGraphDrawingArtifacts(drawings = []) {
  if (Array.isArray(drawings)) {
    return drawings.filter(Boolean);
  }

  if (!drawings || typeof drawings !== "object") {
    return [];
  }

  if (Array.isArray(drawings.drawings)) {
    return drawings.drawings.filter(Boolean);
  }

  return Object.values(drawings).filter(Boolean);
}

export function buildProjectGraphVerticalSliceRequest(params = {}) {
  const designSpec = params.designSpec || {};
  const projectDetails =
    designSpec.projectDetails ||
    designSpec.specifications ||
    designSpec.project ||
    designSpec;
  const locationData =
    designSpec.location || params.locationData || params.siteSnapshot || {};
  const compactSiteSnapshot = compactSiteSnapshotForRequest(
    params.siteSnapshot || designSpec.siteSnapshot || null,
  );
  const compactSitePolygon = compactLatLngPolygon(designSpec.sitePolygon);
  const programSpaces =
    designSpec.programSpaces ||
    designSpec.programme?.spaces ||
    designSpec.program?.spaces ||
    designSpec.rooms ||
    [];

  // Single resolver across the workflow: ensures floorCountLocked /
  // autoDetectedFloorCount semantics are honoured even on replay/import paths
  // where projectDetails may have been reconstructed from a saved designSpec.
  const resolvedFloorCount = resolveAuthoritativeFloorCount(
    {
      ...projectDetails,
      floorCount:
        projectDetails.floorCount ??
        designSpec.floorCount ??
        designSpec.floors ??
        designSpec.targetStoreys,
      area:
        projectDetails.area ??
        projectDetails.targetAreaM2 ??
        designSpec.targetAreaM2 ??
        designSpec.area ??
        designSpec.floorArea,
      targetAreaM2:
        projectDetails.targetAreaM2 ??
        designSpec.targetAreaM2 ??
        projectDetails.area ??
        designSpec.area,
      buildingType:
        projectDetails.buildingType ||
        projectDetails.subType ||
        designSpec.buildingType ||
        designSpec.buildingSubType ||
        designSpec.buildingProgram ||
        projectDetails.category,
      subType:
        projectDetails.subType ||
        projectDetails.buildingSubType ||
        designSpec.buildingSubType,
      program:
        projectDetails.program ||
        designSpec.buildingProgram ||
        designSpec.buildingSubType,
      autoDetectedFloorCount:
        projectDetails.autoDetectedFloorCount ??
        designSpec.autoDetectedFloorCount,
      floorCountLocked:
        projectDetails.floorCountLocked ?? designSpec.floorCountLocked,
    },
    {
      fallback: 2,
      maxFloors:
        projectDetails.floorMetrics?.maxFloorsAllowed ||
        designSpec.floorMetrics?.maxFloorsAllowed ||
        null,
    },
  ).floorCount;
  const sourceProjectBrief =
    designSpec.brief || designSpec.projectBrief || null;
  const referenceMatch =
    isTruthyRequestFlag(params.referenceMatch) ||
    isTruthyRequestFlag(params.reference_match) ||
    isTruthyRequestFlag(params.a1ReferenceMatch) ||
    isTruthyRequestFlag(designSpec.referenceMatch) ||
    isTruthyRequestFlag(designSpec.reference_match) ||
    isTruthyRequestFlag(designSpec.a1ReferenceMatch) ||
    String(params.renderIntent || designSpec.renderIntent || "")
      .trim()
      .toLowerCase() === "reference_match_a1" ||
    String(params.qualityTarget || designSpec.qualityTarget || "")
      .trim()
      .toLowerCase() === "reference_match";
  const resolvedBrief = sourceProjectBrief
    ? {
        ...sourceProjectBrief,
        target_storeys: resolvedFloorCount,
        targetStoreys: resolvedFloorCount,
        referenceMatch,
        reference_match: referenceMatch,
        renderIntent: referenceMatch
          ? "reference_match_a1"
          : sourceProjectBrief.renderIntent,
      }
    : {
        project_name:
          projectDetails.projectName ||
          projectDetails.name ||
          designSpec.projectName ||
          "ArchiAI Project",
        target_gia_m2:
          projectDetails.area ??
          projectDetails.targetAreaM2 ??
          designSpec.targetAreaM2 ??
          designSpec.area ??
          180,
        target_storeys: resolvedFloorCount,
        targetStoreys: resolvedFloorCount,
        building_type:
          projectDetails.buildingType ||
          projectDetails.subType ||
          designSpec.buildingType ||
          "dwelling",
        required_spaces_text:
          projectDetails.requiredSpacesText ||
          designSpec.requiredSpacesText ||
          "",
        constraints_text:
          projectDetails.constraintsText || designSpec.constraintsText || "",
        referenceMatch,
        reference_match: referenceMatch,
        renderIntent: referenceMatch ? "reference_match_a1" : undefined,
      };
  const rawSiteMetrics =
    designSpec.siteMetrics ||
    designSpec.sitePolygonMetrics ||
    compactSiteSnapshot?.metadata?.siteMetrics ||
    {};
  const siteMetricsNonAuthoritative =
    rawSiteMetrics?.boundaryAuthoritative === false ||
    rawSiteMetrics?.estimatedOnly === true ||
    rawSiteMetrics?.source === "google_building_outline";
  const requestSiteMetrics = siteMetricsNonAuthoritative
    ? {
        ...rawSiteMetrics,
        areaM2: undefined,
        boundaryAuthoritative: false,
      }
    : rawSiteMetrics;
  const requestSitePolygon = siteMetricsNonAuthoritative
    ? []
    : compactSitePolygon.length >= 3
      ? compactSitePolygon
      : compactSiteSnapshot?.sitePolygon || [];

  return {
    referenceMatch,
    reference_match: referenceMatch,
    renderIntent: referenceMatch
      ? "reference_match_a1"
      : params.renderIntent || designSpec.renderIntent || "final_a1",
    qualityTarget: referenceMatch
      ? "reference_match"
      : params.qualityTarget || designSpec.qualityTarget || null,
    projectDetails: {
      category: projectDetails.category || designSpec.buildingCategory || null,
      subType: projectDetails.subType || designSpec.buildingSubType || null,
      program:
        projectDetails.program ||
        designSpec.buildingProgram ||
        designSpec.buildingSubType ||
        null,
      area: projectDetails.area ?? designSpec.area ?? designSpec.floorArea,
      floorCount: resolvedFloorCount,
      autoDetectedFloorCount:
        projectDetails.autoDetectedFloorCount ??
        designSpec.autoDetectedFloorCount ??
        null,
      floorCountLocked: Boolean(
        projectDetails.floorCountLocked ?? designSpec.floorCountLocked,
      ),
      customNotes: projectDetails.customNotes || designSpec.buildingNotes || "",
      entranceDirection:
        projectDetails.entranceDirection ||
        designSpec.entranceDirection ||
        designSpec.entranceOrientation ||
        null,
      pipelineVersion: designSpec.pipelineVersion || null,
    },
    locationData: compactLocationDataForRequest(locationData),
    siteSnapshot: compactSiteSnapshot,
    sitePolygon: requestSitePolygon,
    siteMetrics: requestSiteMetrics,
    programSpaces: compactProgramSpacesForRequest(
      programSpaces,
      resolvedFloorCount,
    ),
    programBrief: designSpec.programBrief || null,
    portfolioBlend: compactPortfolioBlendForRequest(
      designSpec.portfolioBlend || {},
    ),
    brief: resolvedBrief,
  };
}

async function runProjectGraphVerticalSliceWorkflow({
  params,
  env,
  onProgress,
  getToken,
}) {
  onProgress?.({
    stage: "analysis",
    percentage: 10,
    message: "Normalising brief and site context...",
  });

  const url =
    env?.api?.urls?.projectVerticalSlice ||
    env?.urls?.projectVerticalSlice ||
    "/api/project/generate-vertical-slice";
  const headers = { "Content-Type": "application/json" };

  try {
    const token = typeof getToken === "function" ? await getToken() : null;
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  } catch {
    // Anonymous generation is supported; token lookup failure should not block.
  }

  onProgress?.({
    stage: "dna",
    percentage: 30,
    message: "Building ProjectGraph source of truth...",
  });

  const requestBody = JSON.stringify(
    buildProjectGraphVerticalSliceRequest(params),
  );

  if (requestBody.length > PROJECT_GRAPH_REQUEST_SOFT_LIMIT_CHARS) {
    logger.error("ProjectGraph request payload failed client-size guard", {
      chars: requestBody.length,
      limit: PROJECT_GRAPH_REQUEST_SOFT_LIMIT_CHARS,
      containsDataImage: requestBody.includes("data:image"),
      containsBase64Marker: requestBody.includes(";base64,"),
    });
    throw new Error(
      "ProjectGraph vertical slice request is too large after compaction. Remove embedded image data from the request payload.",
    );
  }

  logger.info("ProjectGraph vertical slice payload prepared", {
    chars: requestBody.length,
  });

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: requestBody,
  });
  const verticalSlice = await response.json().catch(() => ({}));

  if (!response.ok || !verticalSlice?.success) {
    const issues = Array.isArray(verticalSlice?.qa?.issues)
      ? verticalSlice.qa.issues
      : [];
    const safeStringify = (value) => {
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    };
    const summarizePanelTypes = (entries) => {
      if (!Array.isArray(entries)) return null;
      const labels = entries
        .map((entry) => {
          if (typeof entry === "string") return entry;
          const panelType = entry?.panelType || entry?.type || "?";
          const reason = entry?.reason ? `:${entry.reason}` : "";
          return `${panelType}${reason}`;
        })
        .filter(Boolean);
      return labels.length ? labels.join(", ") : null;
    };
    const placeholderIssue = issues.find(
      (entry) => entry?.code === "PLACEHOLDER_3D_RENDER_USED",
    );
    if (placeholderIssue?.details?.placeholder3dPanels) {
      const summary = summarizePanelTypes(
        placeholderIssue.details.placeholder3dPanels,
      );
      console.error(
        `[ProjectGraph] PLACEHOLDER_3D_RENDER_USED panels=${summary || "?"}`,
      );
      console.error(
        "[ProjectGraph] PLACEHOLDER_3D_RENDER_USED detail",
        placeholderIssue.details.placeholder3dPanels,
      );
      console.error(
        "[ProjectGraph] PLACEHOLDER_3D_RENDER_USED detail (json)",
        safeStringify(placeholderIssue.details.placeholder3dPanels),
      );
    }
    const panelContentIssue = issues.find(
      (entry) => entry?.code === "A1_PANEL_CONTENT_MISSING",
    );
    if (panelContentIssue?.details) {
      const flatTypes =
        panelContentIssue.details.missingRequiredPanelTypes ||
        summarizePanelTypes(panelContentIssue.details.missingRequiredPanels);
      console.error(
        `[ProjectGraph] A1_PANEL_CONTENT_MISSING panels=${
          Array.isArray(flatTypes) ? flatTypes.join(", ") : flatTypes || "?"
        }`,
      );
      if (panelContentIssue.details.missingRequiredPanels) {
        console.error(
          "[ProjectGraph] A1_PANEL_CONTENT_MISSING detail",
          panelContentIssue.details.missingRequiredPanels,
        );
        console.error(
          "[ProjectGraph] A1_PANEL_CONTENT_MISSING detail (json)",
          safeStringify(panelContentIssue.details.missingRequiredPanels),
        );
      }
    }
    const errorIssues = issues.filter((entry) => entry?.severity === "error");
    if (errorIssues.length) {
      console.error("[ProjectGraph] vertical slice QA errors", errorIssues);
      errorIssues.forEach((entry) => {
        console.error(
          `[ProjectGraph] issue ${entry?.code || "UNKNOWN"}:`,
          entry?.message || "",
          entry?.details || {},
        );
        console.error(
          `[ProjectGraph] issue ${entry?.code || "UNKNOWN"} details (json)`,
          safeStringify(entry?.details || {}),
        );
      });
    }
    const issue = issues[0];
    throw new Error(
      verticalSlice?.error ||
        issue?.message ||
        `ProjectGraph vertical slice failed (${response.status})`,
    );
  }

  onProgress?.({
    stage: "rendering",
    percentage: 75,
    message: "Projecting 2D, 3D and A1 sheet from ProjectGraph...",
  });

  const sheetSvg = verticalSlice.artifacts?.a1Sheet?.svgString || "";
  const composedSheetUrl = sheetSvg ? svgToDataUrl(sheetSvg) : null;
  const serverPanelMap =
    verticalSlice.artifacts?.panelMap &&
    typeof verticalSlice.artifacts.panelMap === "object"
      ? sanitizeProjectGraphPanelMap(verticalSlice.artifacts.panelMap)
      : null;
  const drawingAssets = normalizeProjectGraphDrawingArtifacts(
    verticalSlice.artifacts?.drawings,
  );
  const panelMap =
    serverPanelMap ||
    Object.fromEntries(
      drawingAssets
        .map((drawing) => {
          const panelType =
            drawing.panel_type ||
            drawing.drawing_id ||
            drawing.asset_id ||
            drawing.type;
          if (!panelType) {
            return null;
          }
          const safeSvgString = drawing.svgString
            ? sanitizeProjectGraphSvg(drawing.svgString)
            : null;

          return [
            panelType,
            {
              panelType,
              url: safeSvgString ? svgToDataUrl(safeSvgString) : null,
              svgString: safeSvgString,
              sourceType: "project_graph_drawing_svg",
              authorityUsed: "ProjectGraph",
              authoritySource: "project_graph",
              geometryHash: verticalSlice.geometryHash,
              svgHash: drawing.svgHash || null,
              metadata: {
                sourceType: "project_graph_drawing_svg",
                authorityUsed: "ProjectGraph",
                authoritySource: "project_graph",
                geometryHash: verticalSlice.geometryHash,
                sourceModelHash: drawing.source_model_hash || null,
              },
            },
          ];
        })
        .filter(Boolean),
    );

  onProgress?.({
    stage: "finalizing",
    percentage: 95,
    message: "Validating ProjectGraph consistency...",
  });

  return {
    success: true,
    workflow: PIPELINE_MODE.PROJECT_GRAPH,
    composedSheetUrl,
    url: composedSheetUrl,
    pdfUrl: verticalSlice.artifacts?.a1Pdf?.dataUrl || null,
    sheetSeries: verticalSlice.artifacts?.sheetSeries || [],
    sheetSplitDecision: verticalSlice.artifacts?.sheetSplitDecision || null,
    projectGraph: verticalSlice.projectGraph,
    projectGraphId:
      verticalSlice.projectGraph?.project_graph_id ||
      verticalSlice.projectGraph?.project_id ||
      null,
    geometryHash: verticalSlice.geometryHash,
    compiledProject: verticalSlice.artifacts?.compiledProject || null,
    projectGeometry: verticalSlice.artifacts?.projectGeometry || null,
    panels: panelMap,
    panelMap,
    panelsByKey: panelMap,
    qa: verticalSlice.qa,
    artifacts: verticalSlice.artifacts,
    modelRegistry: verticalSlice.modelRegistry,
    metadata: {
      workflow: PIPELINE_MODE.PROJECT_GRAPH,
      pipelineVersion: verticalSlice.pipelineVersion,
      projectGraphId:
        verticalSlice.projectGraph?.project_graph_id ||
        verticalSlice.projectGraph?.project_id ||
        null,
      geometryHash: verticalSlice.geometryHash,
      panelCount: Object.keys(panelMap).length,
      sourceOfTruth: "ProjectGraph",
      sheetSizeMm: verticalSlice.artifacts?.a1Sheet?.sheet_size_mm || {
        width: 841,
        height: 594,
      },
      sheetSeries: verticalSlice.artifacts?.sheetSeries || [],
      sheetSplitDecision: verticalSlice.artifacts?.sheetSplitDecision || null,
      qaStatus: verticalSlice.qa?.status || null,
    },
  };
}

/**
 * useArchitectAIWorkflow Hook
 * @returns {Object} Workflow state and functions
 */
export function useArchitectAIWorkflow() {
  const { getToken, isSignedIn } = useOptionalAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  // Progress format includes both step/total AND stage/percentage for component compatibility
  const [progress, setProgress] = useState({
    step: 0,
    total: 5,
    message: "",
    stage: "analysis",
    percentage: 0,
  });

  const envRef = useRef(null);

  // Initialize environment adapter once
  if (!envRef.current) {
    envRef.current = createEnvironmentAdapter();
  }

  const previousGeometryDNA = result?.geometryDNA || null;
  const previousGeometryRenders = result?.geometryRenders || null;

  /**
   * Generate A1 sheet
   * @param {Object} params - Generation parameters
   * @param {Object} params.designSpec - Design specifications
   * @param {Object} params.siteSnapshot - Site snapshot
   * @param {Object} params.featureFlags - Feature flags
   * @param {number} params.seed - Generation seed
   * @param {string} params.sheetType - Sheet type (ARCH, STRUCTURE, MEP)
   * @param {Array} params.overlays - Overlays
   * @returns {Promise<SheetResult>} Sheet result
   */
  const generateSheet = useCallback(
    async (params) => {
      setLoading(true);
      setError(null);
      setProgress({
        step: 0,
        total: 5,
        message: "Starting generation...",
        stage: "analysis",
        percentage: 0,
      });

      try {
        // Resolve pipeline mode (fails explicitly on unsupported modes)
        const { mode: resolvedMode } = resolveWorkflowByMode();
        logger.info(`Using ${resolvedMode} pipeline workflow`, null, "🎨");

        const onProgress = (updateOrStep, legacyMessage) => {
          const total = 5;

          if (updateOrStep && typeof updateOrStep === "object") {
            const rawStage = updateOrStep.stage;
            const stage = STAGES.includes(rawStage) ? rawStage : "rendering";
            const rawPercent = updateOrStep.percentage ?? updateOrStep.percent;
            const percentage =
              typeof rawPercent === "number" && Number.isFinite(rawPercent)
                ? Math.max(0, Math.min(100, Math.round(rawPercent)))
                : Math.round((getStepForStage(stage) / total) * 100);

            setProgress({
              step: getStepForStage(stage),
              total,
              message: updateOrStep.message || legacyMessage || "",
              stage,
              percentage,
            });
            return;
          }

          const step = Number(updateOrStep || 0);
          const stage = getStageForStep(step);
          const percentage = Math.round((step / total) * 100);
          setProgress({
            step,
            total,
            message: legacyMessage || "",
            stage,
            percentage,
          });
        };

        const workflowLocationData =
          params.designSpec?.location ||
          params.locationData ||
          params.siteSnapshot ||
          null;

        // Check generation quota before making any paid API calls
        let generationId = null;
        if (isSignedIn) {
          const gateResult = await generationGate.start(getToken);
          generationId = gateResult.generationId;
        }

        let rawMultiPanelResult;
        try {
          rawMultiPanelResult =
            resolvedMode === PIPELINE_MODE.PROJECT_GRAPH
              ? await runProjectGraphVerticalSliceWorkflow({
                  params: {
                    ...params,
                    locationData: workflowLocationData,
                  },
                  env: envRef.current,
                  onProgress,
                  getToken,
                })
              : await executeWorkflow(
                  dnaWorkflowOrchestrator,
                  {
                    locationData: workflowLocationData,
                    projectContext: params.designSpec,
                    portfolioFiles:
                      params.designSpec?.portfolioBlend?.portfolioFiles || [],
                    siteSnapshot: params.siteSnapshot,
                    baseSeed: params.seed || Date.now(),
                  },
                  { onProgress },
                );
        } catch (workflowErr) {
          // Release the pending slot on failure so it doesn't count against quota
          if (generationId) {
            await generationGate.complete(generationId, {
              success: false,
              getToken,
            });
          }
          throw workflowErr;
        }

        const multiPanelResult =
          resolvedMode === PIPELINE_MODE.PROJECT_GRAPH
            ? rawMultiPanelResult
            : normalizeMultiPanelResult(rawMultiPanelResult);

        if (!multiPanelResult?.success || !multiPanelResult?.composedSheetUrl) {
          throw new Error(
            multiPanelResult?.error || "Project generation failed",
          );
        }

        const compiledProject =
          params.designSpec?.compiledProject ||
          params.designSpec?.v2Bundle?.compiledProject ||
          null;
        const projectQuantityTakeoff =
          params.designSpec?.projectQuantityTakeoff ||
          params.designSpec?.v2Bundle?.projectQuantityTakeoff ||
          null;
        const geometryHash =
          compiledProject?.geometryHash ||
          multiPanelResult?.metadata?.geometryHash ||
          null;
        const pipelineVersion =
          params.designSpec?.pipelineVersion ||
          params.designSpec?.v2Bundle?.pipelineVersion ||
          multiPanelResult?.metadata?.pipelineVersion ||
          null;
        const confidence =
          params.designSpec?.confidence ||
          params.designSpec?.v2Bundle?.confidence ||
          null;
        const validation =
          params.designSpec?.validation ||
          params.designSpec?.v2Bundle?.validation ||
          compiledProject?.validation ||
          null;
        const authorityReadiness =
          multiPanelResult?.metadata?.authorityReadiness ||
          params.designSpec?.authorityReadiness ||
          params.designSpec?.v2Bundle?.authorityReadiness ||
          null;
        const deliveryStages =
          multiPanelResult?.metadata?.deliveryStages ||
          params.designSpec?.deliveryStages ||
          params.designSpec?.v2Bundle?.deliveryStages ||
          null;
        const exportManifest =
          multiPanelResult?.metadata?.exportManifest ||
          params.designSpec?.exportManifest ||
          params.designSpec?.v2Bundle?.exportManifest ||
          null;
        const reviewSurface =
          multiPanelResult?.metadata?.reviewSurface ||
          params.designSpec?.reviewSurface ||
          params.designSpec?.v2Bundle?.reviewSurface ||
          null;
        const sheetArtifactManifest = createSheetArtifactManifest({
          geometryHash,
          pipelineVersion,
          panels: buildManifestPanels(multiPanelResult),
          confidence: confidence || {},
          validation: validation || {},
          authorityReadiness,
          deliveryStages,
          exportManifest,
          reviewSurface,
        });

        const sheetResult = {
          ...multiPanelResult,
          url: multiPanelResult.composedSheetUrl,
          composedSheetUrl: multiPanelResult.composedSheetUrl,
          workflow: resolvedMode,
          pipelineVersion,
          geometryHash,
          compiledProject,
          projectGeometry:
            params.designSpec?.projectGeometry ||
            params.designSpec?.v2Bundle?.projectGeometry ||
            null,
          populatedGeometry:
            params.designSpec?.populatedGeometry ||
            params.designSpec?.v2Bundle?.populatedGeometry ||
            null,
          projectQuantityTakeoff,
          siteEvidence:
            params.designSpec?.siteEvidence ||
            params.designSpec?.v2Bundle?.siteEvidence ||
            null,
          localStyleEvidence:
            params.designSpec?.localStyleEvidence ||
            params.designSpec?.v2Bundle?.localStyleEvidence ||
            null,
          portfolioStyleEvidence:
            params.designSpec?.portfolioStyleEvidence ||
            params.designSpec?.v2Bundle?.portfolioStyleEvidence ||
            null,
          styleBlendSpec:
            params.designSpec?.styleBlendSpec ||
            params.designSpec?.v2Bundle?.styleBlendSpec ||
            null,
          programBrief:
            params.designSpec?.programBrief ||
            params.designSpec?.v2Bundle?.programBrief ||
            null,
          confidence,
          validation,
          authorityReadiness,
          deliveryStages,
          exportManifest,
          reviewSurface,
          sheetArtifactManifest,
          panelCoordinates:
            multiPanelResult.panelCoordinates || multiPanelResult.coordinates,
          metadata: {
            ...multiPanelResult.metadata,
            workflow: resolvedMode,
            pipelineVersion,
            geometryHash,
            confidence,
            validation,
            authorityReadiness,
            deliveryStages,
            exportManifest,
            reviewSurface,
            sheetArtifactManifest,
            panelCount:
              multiPanelResult.metadata?.panelCount ||
              (multiPanelResult.panelMap
                ? Object.keys(multiPanelResult.panelMap).length
                : 0),
          },
        };

        // Save to design history
        const designId = await designHistoryRepository.saveDesign({
          designId: sheetResult.designId || undefined,
          sheetId: sheetResult.sheetId || undefined,
          dna: sheetResult.dna,
          basePrompt: sheetResult.prompt,
          seed: sheetResult.seed,
          sheetType: params.sheetType || "ARCH",
          sheetMetadata: sheetResult.metadata,
          overlays: params.overlays || [],
          projectContext: params.designSpec,
          locationData: workflowLocationData,
          siteSnapshot: params.siteSnapshot,
          resultUrl: sheetResult.composedSheetUrl,
          composedSheetUrl: sheetResult.composedSheetUrl,
          pdfUrl: sheetResult.pdfUrl || null,
          compiledProject,
          projectQuantityTakeoff,
          panels: sheetResult.panelMap || sheetResult.panels,
          panelMap: sheetResult.panelMap || sheetResult.panels,
          panelCoordinates: sheetResult.panelCoordinates,
          qa: sheetResult.qa || null,
          critique: sheetResult.critique || null,
          trace: sheetResult.trace || null,
          baselineBundle: sheetResult.baselineBundle || null,
          a1Sheet: {
            sheetId: sheetResult.sheetId || undefined,
            url: sheetResult.composedSheetUrl,
            composedSheetUrl: sheetResult.composedSheetUrl,
            pdfUrl: sheetResult.pdfUrl || null,
            metadata: sheetResult.metadata,
            panels: sheetResult.panelMap || sheetResult.panels,
            panelMap: sheetResult.panelMap || sheetResult.panels,
            coordinates: sheetResult.panelCoordinates,
            compiledProject,
            projectQuantityTakeoff,
            qa: sheetResult.qa || null,
            critique: sheetResult.critique || null,
            trace: sheetResult.trace || null,
          },
        });

        sheetResult.designId = designId;

        setResult(sheetResult);
        setProgress({
          step: 5,
          total: 5,
          message: "Complete!",
          stage: "finalizing",
          percentage: 100,
        });

        logger.success("Sheet generation complete", { designId });

        // Record successful generation for quota tracking
        if (generationId) {
          await generationGate.complete(generationId, {
            success: true,
            getToken,
            a1SheetUrl: sheetResult.composedSheetUrl || null,
          });
          // Notify UsageChip to refresh
          window.dispatchEvent(new Event("archiai:generation-complete"));
        }

        return sheetResult;
      } catch (err) {
        // Quota exceeded — surface upgrade CTA
        if (err.isQuotaError) {
          const msg = err.message;
          logger.error(msg);
          const quotaErr = new Error(msg);
          quotaErr.upgradeUrl = err.upgradeUrl;
          setError(quotaErr);
          return null;
        }
        // Unsupported pipeline mode — fail fast, do not retry
        if (err instanceof UnsupportedPipelineModeError) {
          const msg = `Configuration error: ${err.message}. Use PIPELINE_MODE="project_graph" for the RIBA A1 ProjectGraph path or "multi_panel" for the legacy path.`;
          logger.error(msg);
          setError(msg);
          return null;
        }
        logger.error(`Sheet generation failed: ${err.message}`);
        if (err.stack) {
          logger.error(
            `   Stack: ${err.stack.split("\n").slice(0, 3).join("\n")}`,
          );
        }
        // User-friendly error messages for common failure modes
        const msg = err.message || "";
        if (msg.includes("429") || msg.toLowerCase().includes("rate limit")) {
          setError(
            "API rate limit reached. Please wait 60 seconds and try again.",
          );
        } else if (
          msg.includes("401") ||
          msg.toLowerCase().includes("unauthorized")
        ) {
          setError(
            "API key invalid or expired. Check the OpenAI/Vercel environment configuration.",
          );
        } else if (
          msg.toLowerCase().includes("timeout") ||
          msg.includes("ETIMEDOUT")
        ) {
          setError(
            "Generation timed out. The AI service may be under heavy load — try again shortly.",
          );
        } else {
          setError(msg);
        }
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [getToken, isSignedIn],
  );

  /**
   * Modify A1 sheet
   * @param {Object} params - Modification parameters
   * @param {string} params.designId - Design ID
   * @param {string} params.sheetId - Sheet ID
   * @param {Object} params.modifyRequest - Modification request
   * @returns {Promise<ModifyResult>} Modification result
   */
  const modifySheetWorkflow = useCallback(
    async (params) => {
      setLoading(true);
      setError(null);
      setProgress({
        step: 0,
        total: 6,
        message: "Starting modification...",
        stage: "analysis",
        percentage: 0,
      });

      try {
        setProgress({
          step: 1,
          total: 6,
          message: "Loading baseline...",
          stage: "analysis",
          percentage: 17,
        });

        const modifyResult = await modifySheet({
          designRef: {
            id: params.designId,
            sheetId: params.sheetId || "default",
          },
          baseSheet: null, // Will be loaded from baseline
          dna: null, // Will be loaded from baseline
          modifyRequest: params.modifyRequest,
          env: envRef.current,
          featureFlags: {
            geometryVolumeFirst: isFeatureEnabled("geometryVolumeFirst"),
            ...(params.featureFlags || {}),
          },
          seed: null, // Will use baseline seed
        });

        const normalizedModifyResult = {
          ...modifyResult,
          url: modifyResult.sheet?.composedSheetUrl || modifyResult.sheet?.url,
          composedSheetUrl:
            modifyResult.sheet?.composedSheetUrl || modifyResult.sheet?.url,
          geometryDNA:
            modifyResult.geometryDNA ||
            modifyResult.sheet?.geometryDNA ||
            previousGeometryDNA ||
            null,
          geometryRenders:
            modifyResult.geometryRenders ||
            modifyResult.sheet?.geometryRenders ||
            previousGeometryRenders ||
            null,
          a1Sheet: modifyResult.sheet
            ? {
                ...modifyResult.sheet,
                url: modifyResult.sheet.url,
                composedSheetUrl:
                  modifyResult.sheet.composedSheetUrl || modifyResult.sheet.url,
              }
            : modifyResult.a1Sheet,
        };

        // Save version to design history
        await designHistoryRepository.updateDesignVersion(params.designId, {
          resultUrl:
            normalizedModifyResult.sheet.url ||
            normalizedModifyResult.sheet.composedSheetUrl,
          composedSheetUrl:
            normalizedModifyResult.sheet.composedSheetUrl ||
            normalizedModifyResult.sheet.url,
          deltaPrompt: params.modifyRequest.customPrompt,
          quickToggles: params.modifyRequest.quickToggles,
          seed: normalizedModifyResult.sheet.seed,
          driftScore: normalizedModifyResult.driftScore,
          consistencyScore: 1 - normalizedModifyResult.driftScore,
          panelMap:
            normalizedModifyResult.sheet.panelMap ||
            normalizedModifyResult.sheet.panels ||
            null,
          panels:
            normalizedModifyResult.sheet.panelMap ||
            normalizedModifyResult.sheet.panels ||
            null,
          panelCoordinates:
            normalizedModifyResult.sheet.panelCoordinates ||
            normalizedModifyResult.sheet.coordinates ||
            normalizedModifyResult.sheet.metadata?.coordinates ||
            null,
          geometryDNA:
            normalizedModifyResult.geometryDNA ||
            normalizedModifyResult.sheet.geometryDNA ||
            previousGeometryDNA ||
            null,
          geometryRenders:
            normalizedModifyResult.geometryRenders ||
            normalizedModifyResult.sheet.geometryRenders ||
            previousGeometryRenders ||
            null,
          metadata: {
            ...(normalizedModifyResult.versionMetadata || {}),
            panelMap:
              normalizedModifyResult.sheet.panelMap ||
              normalizedModifyResult.sheet.panels ||
              null,
            coordinates:
              normalizedModifyResult.sheet.panelCoordinates ||
              normalizedModifyResult.sheet.coordinates ||
              normalizedModifyResult.sheet.metadata?.coordinates ||
              null,
          },
        });

        setResult(normalizedModifyResult);
        setProgress({
          step: 6,
          total: 6,
          message: "Complete!",
          stage: "finalizing",
          percentage: 100,
        });

        logger.success("Sheet modification complete", {
          versionId: normalizedModifyResult.versionId,
          driftScore: normalizedModifyResult.driftScore,
        });

        return normalizedModifyResult;
      } catch (err) {
        logger.error("Sheet modification failed", err);
        setError(err.message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [previousGeometryDNA, previousGeometryRenders],
  );

  /**
   * Export sheet
   * @param {Object} params - Export parameters
   * @param {SheetResult} params.sheet - Sheet to export
   * @param {string} params.format - Format (PNG, PDF, SVG)
   * @returns {Promise<Object>} Export result
   */
  const exportSheetWorkflow = useCallback(async (params) => {
    setLoading(true);
    setError(null);

    try {
      const exportResult = await exportService.exportSheet({
        sheet: params.sheet,
        format: params.format || "PNG",
        env: envRef.current,
      });

      logger.success("Sheet export complete", { format: params.format });

      return exportResult;
    } catch (err) {
      logger.error("Sheet export failed", err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Load design from history
   * @param {string} designId - Design ID
   * @returns {Promise<Object>} Design
   */
  const loadDesign = useCallback(async (designId) => {
    try {
      const design = await designHistoryRepository.getDesignById(designId);

      if (!design) {
        throw new Error(`Design ${designId} not found`);
      }

      return design;
    } catch (err) {
      logger.error("Failed to load design", err);
      setError(err.message);
      throw err;
    }
  }, []);

  /**
   * List all designs
   * @returns {Promise<Array>} Design list
   */
  const listDesigns = useCallback(async () => {
    try {
      return await designHistoryRepository.listDesigns();
    } catch (err) {
      logger.error("Failed to list designs", err);
      return [];
    }
  }, []);

  /**
   * Clear error
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /**
   * Reset workflow
   */
  const reset = useCallback(() => {
    setLoading(false);
    setError(null);
    setResult(null);
    setProgress({
      step: 0,
      total: 5,
      message: "",
      stage: "analysis",
      percentage: 0,
    });
  }, []);

  /**
   * Load a pre-built result (used by demo mode to bypass live generation).
   * @param {Object} demoResult - A result object matching the SheetResult shape
   */
  const loadDemoResult = useCallback((demoResult) => {
    setResult(demoResult);
    setProgress({
      step: 5,
      total: 5,
      message: "Demo loaded",
      stage: "finalizing",
      percentage: 100,
    });
  }, []);

  return {
    // State
    loading,
    error,
    result,
    progress,

    // Functions
    generateSheet,
    modifySheetWorkflow,
    exportSheetWorkflow,
    loadDesign,
    listDesigns,
    clearError,
    reset,
    loadDemoResult,

    // Environment
    env: envRef.current,
  };
}

export default useArchitectAIWorkflow;
