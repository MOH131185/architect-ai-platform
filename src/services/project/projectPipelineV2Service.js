import { polygonToLocalXY } from "../../utils/geometry.js";
import {
  buildBoundingBoxFromPolygon,
  CANONICAL_PROJECT_GEOMETRY_VERSION,
  rectangleToPolygon,
} from "../cad/projectGeometrySchema.js";
import {
  TECHNICAL_CANONICAL_PANEL_TYPES,
  TECHNICAL_ELEVATION_PANELS,
  TECHNICAL_FLOOR_PANEL_TYPES,
  TECHNICAL_SECTION_PANELS,
  buildCompiledProjectTechnicalPanels,
} from "../canonical/compiledProjectTechnicalPackBuilder.js";
import { compileProject } from "../compiler/index.js";
import { buildRuntimeProjectGeometryFromLayout } from "../compiler/runtimeProjectGeometryFromLayout.js";
import {
  getEnvelopeDrawingBoundsWithSource,
  getLevelDrawingBoundsWithSource,
} from "../drawing/drawingBounds.js";
import { buildProjectQuantityTakeoff } from "./projectQuantityTakeoffService.js";
import {
  createAuthorityReadinessManifest,
  createCompiledExportManifest,
  createDeliveryStages,
  createEvidenceStage,
  createStyleBlendSpec,
  isSupportedResidentialV2SubType,
  STYLE_BLEND_CHANNELS,
  UK_RESIDENTIAL_V2_PIPELINE_VERSION,
} from "./v2ProjectContracts.js";
import {
  generateResidentialProgramBrief,
  normalizeResidentialProgramSpaces,
} from "./residentialProgramEngine.js";
import {
  GENARCH_ARTIFACT_SPECS,
  GENARCH_JOB_DEFAULTS,
} from "../genarch/genarchContract.js";
import autoLevelAssignmentService from "../autoLevelAssignmentService.js";

function round(value, precision = 3) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  const factor = 10 ** precision;
  return Math.round(numeric * factor) / factor;
}

function clamp(value, minimum = 0, maximum = 1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return minimum;
  }
  return Math.max(minimum, Math.min(maximum, numeric));
}

function cloneData(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function slugify(value) {
  return String(value || "item")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function pick(values = [], fallback = null) {
  return values.find(Boolean) || fallback;
}

function resolveLockedLevelCount(projectDetails = {}) {
  if (!projectDetails?.floorCountLocked) {
    return null;
  }
  const parsed = Number.parseInt(projectDetails.floorCount, 10);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.max(1, parsed);
}

function inferLevelCountFromSpaces(spaces = []) {
  if (!Array.isArray(spaces) || spaces.length === 0) {
    return 0;
  }
  const maxLevelIndex = spaces.reduce((maxValue, space) => {
    const levelIndex = Number(space?.levelIndex);
    if (!Number.isFinite(levelIndex)) {
      return maxValue;
    }
    return Math.max(maxValue, Math.max(0, Math.floor(levelIndex)));
  }, 0);
  return maxLevelIndex + 1;
}

function stampProgramSpaceMetadata(spaces = [], metadata = {}) {
  if (!Array.isArray(spaces)) {
    return [];
  }
  spaces._calculatedFloorCount = Number(metadata.floorCount || 0) || 1;
  spaces._floorMetrics = metadata.floorMetrics || null;
  return spaces;
}

function alignProgramSpacesToResolvedLevels({
  spaces = [],
  resolvedLevelCount = 1,
  subType = "",
  siteAreaM2 = 0,
} = {}) {
  const normalizedSpaces = normalizeResidentialProgramSpaces(spaces);
  const inferredLevelCount = inferLevelCountFromSpaces(normalizedSpaces);
  const floorCount = Math.max(1, Number(resolvedLevelCount || 1));

  const totalProgramArea = normalizedSpaces.reduce(
    (sum, space) => sum + Number(space.area || 0) * Number(space.count || 1),
    0,
  );

  const floorMetrics =
    Number.isFinite(Number(siteAreaM2)) && Number(siteAreaM2) > 0
      ? autoLevelAssignmentService.calculateOptimalLevels(
          totalProgramArea,
          Number(siteAreaM2),
          {
            buildingType: subType || "residential",
            subType: subType || null,
            maxFloors: 4,
          },
        )
      : null;

  if (!normalizedSpaces.length) {
    return stampProgramSpaceMetadata(normalizedSpaces, {
      floorCount,
      floorMetrics,
    });
  }

  if (inferredLevelCount === floorCount) {
    return stampProgramSpaceMetadata(normalizedSpaces, {
      floorCount,
      floorMetrics,
    });
  }

  const reassigned = autoLevelAssignmentService.autoAssignSpacesToLevels(
    normalizedSpaces,
    floorCount,
    subType || "residential",
  );

  return stampProgramSpaceMetadata(reassigned, {
    floorCount,
    floorMetrics,
  });
}

const ELEVATION_PANEL_TO_ORIENTATION = Object.fromEntries(
  Object.entries(TECHNICAL_ELEVATION_PANELS).map(([orientation, panelType]) => [
    panelType,
    orientation,
  ]),
);

const SECTION_PANEL_TO_TYPE = Object.fromEntries(
  Object.entries(TECHNICAL_SECTION_PANELS).map(([sectionType, panelType]) => [
    panelType,
    sectionType,
  ]),
);

function uniqueStrings(values = []) {
  return [...new Set(values.filter(Boolean).map((value) => String(value)))];
}

function normalizeBounds(bounds = null) {
  if (!bounds || typeof bounds !== "object") {
    return null;
  }

  const minX = Number(bounds.min_x ?? bounds.minX ?? bounds.x);
  const minY = Number(bounds.min_y ?? bounds.minY ?? bounds.y);
  const maxX = Number(
    bounds.max_x ??
      bounds.maxX ??
      (Number.isFinite(minX) ? minX + Number(bounds.width || 0) : Number.NaN),
  );
  const maxY = Number(
    bounds.max_y ??
      bounds.maxY ??
      (Number.isFinite(minY) ? minY + Number(bounds.height || 0) : Number.NaN),
  );

  if (
    !Number.isFinite(minX) ||
    !Number.isFinite(minY) ||
    !Number.isFinite(maxX) ||
    !Number.isFinite(maxY) ||
    maxX <= minX ||
    maxY <= minY
  ) {
    return null;
  }

  return {
    min_x: round(minX),
    min_y: round(minY),
    max_x: round(maxX),
    max_y: round(maxY),
    width: round(maxX - minX),
    height: round(maxY - minY),
  };
}

function resolveCompiledProjectHeightM(compiledProject = {}) {
  const levels = Array.isArray(compiledProject?.levels)
    ? compiledProject.levels
    : [];

  const levelTop = levels.reduce((maximum, level) => {
    const bottom = Number(level?.elevation_m ?? level?.bottom_m ?? 0);
    const height = Number(level?.height_m || 0);
    return Math.max(maximum, bottom + Math.max(height, 0));
  }, 0);

  const roofHeight = Number(
    compiledProject?.roof?.height_m ||
      compiledProject?.roof?.ridge_height_m ||
      compiledProject?.roof?.ridgeHeightM ||
      0,
  );

  return round(Math.max(levelTop + Math.max(roofHeight, 0), levelTop, 0));
}

function resolveCompiledProjectSectionProfile(
  compiledProject = {},
  sectionType = "longitudinal",
) {
  const sectionCuts = compiledProject?.sectionCuts || {};
  const candidates = Array.isArray(sectionCuts.candidates)
    ? sectionCuts.candidates
    : [];
  const preferredId = sectionCuts.byType?.[sectionType] || null;

  if (preferredId) {
    const preferredMatch = candidates.find(
      (candidate) => candidate?.id === preferredId,
    );
    if (preferredMatch) {
      return cloneData(preferredMatch);
    }
  }

  const typedMatch = candidates.find(
    (candidate) => candidate?.sectionType === sectionType,
  );
  return typedMatch ? cloneData(typedMatch) : null;
}

function buildSectionViewBounds(bounds = null, heightM = 0, sectionType = "") {
  const normalized = normalizeBounds(bounds);
  if (!normalized) {
    return null;
  }

  const horizontalExtent =
    sectionType === "transverse"
      ? normalized.height || normalized.width
      : normalized.width || normalized.height;
  const verticalExtent = Math.max(heightM, 0.1);

  return {
    min_x: 0,
    min_y: 0,
    max_x: round(horizontalExtent),
    max_y: round(verticalExtent),
    width: round(horizontalExtent),
    height: round(verticalExtent),
  };
}

function buildTechnicalPackReadinessSummary(
  technicalBuild = {},
  technicalPanels = {},
) {
  const validation =
    technicalBuild?.compiledProjectSource?.validation ||
    technicalBuild?.compiledProject?.validation ||
    {};
  const counts = validation.counts || {};
  const reasons = [];

  const planPanels = Object.entries(technicalPanels).filter(([panelType]) =>
    panelType.startsWith("floor_plan_"),
  );
  const elevationPanels = Object.entries(technicalPanels).filter(
    ([panelType]) => panelType.startsWith("elevation_"),
  );
  const sectionPanels = Object.entries(technicalPanels).filter(([panelType]) =>
    panelType.startsWith("section_"),
  );

  const strongPlanCount = planPanels.filter(([, panel]) => {
    const quality = panel?.technicalQualityMetadata || {};
    return (
      quality.geometry_complete === true &&
      Number(quality.room_count || 0) >= 1 &&
      Number(quality.wall_count || 0) >= 4 &&
      Number(quality.slot_occupancy_ratio || 0) >= 0.3
    );
  }).length;

  const strongElevationCount = elevationPanels.filter(([, panel]) => {
    const quality = panel?.technicalQualityMetadata || {};
    return (
      quality.geometry_complete === true &&
      String(quality.side_facade_status || "").toLowerCase() !== "block" &&
      Number(quality.window_count || 0) + Number(quality.door_count || 0) >=
        1 &&
      Number(quality.facade_richness_score || 0) >= 0.26
    );
  }).length;

  const strongSectionCount = sectionPanels.filter(([, panel]) => {
    const quality = panel?.technicalQualityMetadata || {};
    return (
      quality.geometry_complete === true &&
      (Number(quality.cut_room_count || 0) >= 1 ||
        Number(quality.section_direct_evidence_count || 0) >= 1) &&
      Number(quality.section_usefulness_score || 0) >= 0.22
    );
  }).length;

  if (Number(counts.room_count || 0) < 3) {
    reasons.push(
      "compiled project resolved too few rooms for technical authority",
    );
  }
  if (Number(counts.wall_count || 0) < 6) {
    reasons.push(
      "compiled project resolved too few wall segments for technical authority",
    );
  }
  if (Number(counts.opening_count || 0) < 3) {
    reasons.push(
      "compiled project resolved too few openings for facade authority",
    );
  }
  if (strongPlanCount === 0) {
    reasons.push("no floor plan panel met geometry-complete readiness");
  }
  if (strongElevationCount === 0) {
    reasons.push("no elevation met facade-readiness thresholds");
  }
  if (strongSectionCount === 0) {
    reasons.push("no section panel met section-usefulness readiness");
  }
  if (validation.valid === false) {
    reasons.push("compiled project validation reported blockers");
  }

  const score = round(
    Math.max(
      0,
      Math.min(
        1,
        (validation.valid === false ? 0 : 0.18) +
          Math.min(0.18, Number(counts.room_count || 0) * 0.0225) +
          Math.min(0.18, Number(counts.wall_count || 0) * 0.0125) +
          Math.min(0.14, Number(counts.opening_count || 0) * 0.0175) +
          Math.min(0.16, strongPlanCount * 0.16) +
          Math.min(0.1, strongElevationCount * 0.05) +
          Math.min(0.06, strongSectionCount * 0.06),
      ),
    ),
  );

  return {
    ready: reasons.length === 0,
    score,
    reasons,
    counts: {
      ...counts,
      rendered_plan_count: planPanels.length,
      rendered_elevation_count: elevationPanels.length,
      rendered_section_count: sectionPanels.length,
      strong_plan_count: strongPlanCount,
      strong_elevation_count: strongElevationCount,
      strong_section_count: strongSectionCount,
    },
  };
}

function buildTechnicalPanelBlockers(panelType, panel = {}) {
  const quality = panel?.technicalQualityMetadata || {};
  const blockers = [];

  if (panel?.status && panel.status !== "ready") {
    blockers.push(`${panelType} status is ${panel.status}`);
  }
  if (quality.geometry_complete === false) {
    blockers.push(`${panelType} geometry is incomplete`);
  }

  if (panelType.startsWith("floor_plan_")) {
    if (Number(quality.room_count || 0) <= 0) {
      blockers.push(`${panelType} contains no rooms`);
    }
    if (Number(quality.wall_count || 0) < 4) {
      blockers.push(`${panelType} contains too few walls`);
    }
  }

  if (panelType.startsWith("elevation_")) {
    if (String(quality.side_facade_status || "").toLowerCase() === "block") {
      blockers.push(`${panelType} facade authority is blocked`);
    }
    if (
      Number(quality.window_count || 0) + Number(quality.door_count || 0) <=
      0
    ) {
      blockers.push(`${panelType} contains no facade openings`);
    }
  }

  if (panelType.startsWith("section_")) {
    const truthQuality = String(
      quality.section_construction_truth_quality || "",
    ).toLowerCase();
    const directEvidenceQuality = String(
      quality.section_direct_evidence_quality ||
        quality.section_evidence_quality ||
        "",
    ).toLowerCase();

    if (
      truthQuality &&
      ["weak", "blocked", "unsupported", "missing"].includes(truthQuality)
    ) {
      blockers.push(`${panelType} lacks exact construction-truth evidence`);
    }
    if (
      directEvidenceQuality &&
      ["weak", "blocked", "missing"].includes(directEvidenceQuality)
    ) {
      blockers.push(`${panelType} lacks direct section evidence`);
    }
    if (
      !Number.isFinite(Number(quality.cut_coordinate_m)) &&
      !panel?.cutLine &&
      !panel?.sectionCut
    ) {
      blockers.push(`${panelType} is missing section cut metadata`);
    }
  }

  return uniqueStrings(blockers);
}

function buildTechnicalPanelSummary(
  panelType,
  panel = {},
  compiledProject = {},
  technicalBuild = {},
) {
  const quality = panel?.technicalQualityMetadata || {};
  const levels = Array.isArray(technicalBuild?.compiledProject?.levels)
    ? technicalBuild.compiledProject.levels
    : Array.isArray(compiledProject?.levels)
      ? compiledProject.levels
      : [];
  const buildingHeightM = resolveCompiledProjectHeightM(compiledProject);

  let viewBbox = null;
  let boundsSource = quality.bounds_source || null;
  let sectionCut = null;
  let sectionType = null;
  let orientation = null;
  let levelId = null;

  if (panelType.startsWith("floor_plan_")) {
    const levelIndex = TECHNICAL_FLOOR_PANEL_TYPES.indexOf(panelType);
    const level = levels[levelIndex] || null;
    levelId = level?.id || null;
    const levelBounds = getLevelDrawingBoundsWithSource(
      compiledProject,
      levelId,
    );
    viewBbox = normalizeBounds(levelBounds?.bounds);
    boundsSource = levelBounds?.source || boundsSource;
  } else if (panelType.startsWith("elevation_")) {
    orientation = ELEVATION_PANEL_TO_ORIENTATION[panelType] || null;
    const envelopeBounds = getEnvelopeDrawingBoundsWithSource(compiledProject);
    viewBbox = normalizeBounds(envelopeBounds?.bounds);
    boundsSource = envelopeBounds?.source || boundsSource;
  } else if (panelType.startsWith("section_")) {
    sectionType = SECTION_PANEL_TO_TYPE[panelType] || null;
    const sectionProfile = resolveCompiledProjectSectionProfile(
      compiledProject,
      sectionType || "longitudinal",
    );
    const envelopeBounds = getEnvelopeDrawingBoundsWithSource(compiledProject);
    viewBbox = buildSectionViewBounds(
      envelopeBounds?.bounds,
      buildingHeightM,
      sectionType || "longitudinal",
    );
    boundsSource = envelopeBounds?.source || boundsSource;
    sectionCut = cloneData(sectionProfile?.cutLine || null);
  }

  return {
    panelType,
    drawingType: panel?.drawingType || quality.drawing_type || null,
    status: panel?.status || "ready",
    readiness: panel?.status === "ready" ? "ready" : "blocked",
    svgHash: panel?.svgHash || null,
    canvas: {
      width: Number(panel?.width || 0) || null,
      height: Number(panel?.height || 0) || null,
    },
    viewBbox,
    boundsSource,
    scaleBarMeters: Number(quality.scale_bar_meters || 0) || null,
    slotOccupancyRatio: round(Number(quality.slot_occupancy_ratio || 0), 4),
    levelId,
    orientation,
    sectionType,
    cutLine: sectionCut,
    cutCoordinateM: Number.isFinite(Number(quality.cut_coordinate_m))
      ? Number(quality.cut_coordinate_m)
      : null,
    quality: {
      geometryComplete: quality.geometry_complete === true,
      roomCount: Number(quality.room_count || quality.cut_room_count || 0),
      wallCount: Number(quality.wall_count || quality.wall_cut_count || 0),
      openingCount: Number(
        quality.window_count ||
          quality.door_count ||
          quality.cut_opening_count ||
          0,
      ),
      sideFacadeStatus: quality.side_facade_status || null,
      sectionEvidenceQuality:
        quality.section_direct_evidence_quality ||
        quality.section_evidence_quality ||
        null,
      sectionConstructionTruthQuality:
        quality.section_construction_truth_quality || null,
      sectionUsefulnessScore: Number(quality.section_usefulness_score || 0),
    },
    blockers: buildTechnicalPanelBlockers(panelType, panel),
  };
}

function buildTechnicalPackSummary(compiledProject = {}) {
  const geometryHash = compiledProject?.geometryHash || null;
  const technicalBuild = buildCompiledProjectTechnicalPanels(compiledProject);
  const technicalPanels = technicalBuild?.technicalPanels || {};
  const panelTypes = Object.keys(technicalPanels);
  const resolvedLevelCount = Math.max(
    1,
    Array.isArray(compiledProject?.levels) ? compiledProject.levels.length : 1,
  );
  const expectedPanelTypes = [
    ...TECHNICAL_FLOOR_PANEL_TYPES.slice(0, resolvedLevelCount),
    ...Object.values(TECHNICAL_ELEVATION_PANELS),
    ...Object.values(TECHNICAL_SECTION_PANELS),
  ];
  const missingPanelTypes = expectedPanelTypes.filter(
    (panelType) => !panelTypes.includes(panelType),
  );

  const panelSummaries = Object.fromEntries(
    panelTypes.map((panelType) => [
      panelType,
      buildTechnicalPanelSummary(
        panelType,
        technicalPanels[panelType],
        compiledProject,
        technicalBuild,
      ),
    ]),
  );

  const readiness = buildTechnicalPackReadinessSummary(
    technicalBuild,
    technicalPanels,
  );
  const failureMessages = (technicalBuild?.failures || []).map(
    (failure) => failure?.message || `${failure?.panelType} could not render`,
  );
  const blockers = uniqueStrings([
    ...readiness.reasons,
    ...failureMessages,
    ...(missingPanelTypes.length
      ? [`technical pack is missing panel(s): ${missingPanelTypes.join(", ")}`]
      : []),
  ]);

  return {
    geometryHash,
    source: "compiled_project",
    fallbackUsed: false,
    ready:
      technicalBuild?.ok === true &&
      missingPanelTypes.length === 0 &&
      readiness.ready === true,
    score: readiness.score,
    panelCount: panelTypes.length,
    expectedPanelCount: expectedPanelTypes.length,
    panelTypes,
    expectedPanelTypes,
    missingPanelTypes,
    blockers,
    counts: readiness.counts,
    panels: panelSummaries,
  };
}

function buildLayoutQuality({
  runtimeBundle = {},
  programBrief = {},
  technicalPack = {},
} = {}) {
  const requestedSpaceCount = Array.isArray(programBrief?.spaces)
    ? programBrief.spaces.length
    : 0;
  const placedRoomCount = Number(
    runtimeBundle?.metrics?.roomCount ||
      runtimeBundle?.projectGeometry?.metadata?.promoted_geometry_summary
        ?.room_count ||
      0,
  );
  const requestedLevelCount = Number(programBrief?.levelCount || 0);
  const resolvedLevelCount = Array.isArray(
    runtimeBundle?.projectGeometry?.levels,
  )
    ? runtimeBundle.projectGeometry.levels.length
    : 0;
  const placementScore =
    requestedSpaceCount > 0 ? clamp(placedRoomCount / requestedSpaceCount) : 1;
  const levelAlignmentScore =
    requestedLevelCount > 0
      ? clamp(resolvedLevelCount / Math.max(requestedLevelCount, 1))
      : 1;
  const score = round(
    placementScore * 0.45 +
      levelAlignmentScore * 0.25 +
      Number(technicalPack?.score || 0) * 0.3,
  );
  const source =
    runtimeBundle?.projectGeometry?.metadata?.source ||
    "runtime_layout_geometry";
  const fallbackUsed = source === "runtime_layout_geometry";

  return {
    source,
    fallbackUsed,
    score,
    requestedSpaceCount,
    placedRoomCount,
    requestedLevelCount,
    resolvedLevelCount,
    technicalAuthorityReady: technicalPack?.ready === true,
    blockers:
      technicalPack?.ready === true ? [] : technicalPack?.blockers || [],
    warnings: uniqueStrings(
      fallbackUsed
        ? [
            "Technical panel authority still originates from runtime layout promotion before workflow-level geometry enrichment.",
          ]
        : [],
    ),
    metrics: runtimeBundle?.metrics || null,
  };
}

function buildAuthorityReadiness({
  projectDetails = {},
  programBrief = {},
  compiledProject = {},
  technicalPack = {},
  layoutQuality = {},
} = {}) {
  const validation = compiledProject?.validation || {};
  const counts = validation?.counts || {};
  const requestedLevelCount = Math.max(
    1,
    Number(
      programBrief?.levelCount ||
        projectDetails?.floorCount ||
        projectDetails?.floors ||
        1,
    ) || 1,
  );
  const resolvedLevelCount = Array.isArray(compiledProject?.levels)
    ? compiledProject.levels.length
    : 0;
  const geometryHash =
    compiledProject?.geometryHash || technicalPack?.geometryHash || null;
  const compiledProjectSchemaVersion =
    compiledProject?.schema_version || compiledProject?.schemaVersion || null;
  const controlRenderCount = Object.keys(
    compiledProject?.renderInputs || {},
  ).length;

  const blockers = uniqueStrings([
    ...(programBrief?.blockers || []),
    ...(validation?.blockers || []),
    ...(technicalPack?.ready === true ? [] : technicalPack?.blockers || []),
    ...(geometryHash
      ? []
      : ["compiled project is missing geometry hash authority"]),
    ...(resolvedLevelCount >= requestedLevelCount
      ? []
      : [
          `compiled project resolved ${resolvedLevelCount} level(s) for a ${requestedLevelCount}-level brief`,
        ]),
  ]);

  const warnings = uniqueStrings([
    ...(validation?.warnings || []),
    ...(layoutQuality?.warnings || []),
    ...(controlRenderCount > 0
      ? []
      : [
          "compiled project has not produced geometry-locked visual control inputs",
        ]),
  ]);

  return createAuthorityReadinessManifest({
    ready:
      blockers.length === 0 &&
      technicalPack?.ready === true &&
      Boolean(geometryHash),
    geometryHash,
    authoritySource: "compiled_project",
    compiledProjectSchemaVersion,
    requested: {
      projectCategory: projectDetails?.category || "residential",
      residentialSubtype:
        projectDetails?.subType || projectDetails?.program || null,
      targetAreaM2: Number(
        projectDetails?.area || programBrief?.targetAreaM2 || 0,
      ),
      floorCount: requestedLevelCount,
      entranceOrientation: projectDetails?.entranceDirection || "S",
      programLocked: true,
      styleChannelsLockedToPresentation: [...STYLE_BLEND_CHANNELS],
      geometryOverridePolicy:
        "style prompts may influence massing, roof, openings, materials, and detailing only",
    },
    evidence: {
      roomCount: Number(counts?.room_count || 0),
      wallCount: Number(counts?.wall_count || 0),
      openingCount: Number(counts?.opening_count || 0),
      levelCount: resolvedLevelCount,
      technicalPanelCount: Number(technicalPack?.panelCount || 0),
      technicalReady: technicalPack?.ready === true,
      technicalScore: Number(technicalPack?.score || 0),
      controlRenderCount,
      layoutSource: layoutQuality?.source || null,
      fallbackUsed:
        technicalPack?.fallbackUsed === true ||
        layoutQuality?.fallbackUsed === true,
    },
    blockers,
    warnings,
  });
}

function buildResidentialReviewSurface({
  projectDetails = {},
  programBrief = {},
  compiledProject = {},
  authorityReadiness = {},
} = {}) {
  const geometryHash =
    compiledProject?.geometryHash || authorityReadiness?.geometryHash || null;
  const compiledProjectSchemaVersion =
    compiledProject?.schema_version ||
    authorityReadiness?.compiledProjectSchemaVersion ||
    null;
  const promptSegments = [
    projectDetails?.subType || projectDetails?.program || "residential project",
    projectDetails?.area ? `${projectDetails.area}sqm` : null,
    programBrief?.levelCount ? `${programBrief.levelCount} floors` : null,
    projectDetails?.entranceDirection
      ? `entrance ${projectDetails.entranceDirection}`
      : null,
  ].filter(Boolean);

  return {
    supported: true,
    surface: "residential_genarch_review",
    ready: authorityReadiness?.ready === true,
    backendBoundary: true,
    geometryHash,
    compiledProjectSchemaVersion,
    createJob: {
      method: "POST",
      endpoint: "/api/genarch/jobs",
      defaults: GENARCH_JOB_DEFAULTS,
      promptSeed: promptSegments.join(", "),
    },
    status: {
      method: "GET",
      endpointTemplate: "/api/genarch/jobs/:jobId",
    },
    cancel: {
      method: "DELETE",
      endpointTemplate: "/api/genarch/jobs/:jobId",
    },
    artifacts: GENARCH_ARTIFACT_SPECS.map((artifact) => ({
      key: artifact.key,
      relativePath: artifact.relativePath,
      contentType: artifact.contentType,
      urlTemplate: `/api/genarch/runs/:jobId/${artifact.relativePath}`,
    })),
  };
}

function buildResidentialDeliveryStages({
  authorityReadiness = {},
  programBrief = {},
  compiledProject = {},
  technicalPack = {},
} = {}) {
  const geometryHash =
    compiledProject?.geometryHash || authorityReadiness?.geometryHash || null;
  const controlRenderCount = Object.keys(
    compiledProject?.renderInputs || {},
  ).length;

  return createDeliveryStages({
    geometryHash,
    stages: [
      {
        id: "brief_locked",
        label: "Brief locked",
        status:
          (programBrief?.blockers || []).length > 0 ||
          programBrief?.supportedResidentialSubtype === false
            ? "block"
            : "pass",
        detail:
          (programBrief?.blockers || []).length > 0
            ? programBrief.blockers[0]
            : "Residential brief locked before geometry generation.",
      },
      {
        id: "compiled_project_ready",
        label: "Compiled project ready",
        status:
          compiledProject?.geometryHash &&
          compiledProject?.validation?.valid !== false
            ? "pass"
            : "block",
        detail: compiledProject?.geometryHash
          ? "Compiled-project geometry authority is available."
          : "Compiled-project geometry authority is missing.",
      },
      {
        id: "deterministic_technical_pack_ready",
        label: "Deterministic technical pack ready",
        status: technicalPack?.ready === true ? "pass" : "block",
        detail:
          technicalPack?.ready === true
            ? "Technical panels are compiled-geometry deterministic outputs."
            : technicalPack?.blockers?.[0] ||
              "Technical authority is incomplete.",
      },
      {
        id: "geometry_locked_visuals_ready",
        label: "Geometry-locked visuals ready",
        status: controlRenderCount > 0 ? "ready" : "warning",
        detail:
          controlRenderCount > 0
            ? `${controlRenderCount} compiled visual control render(s) are available.`
            : "No compiled visual control render was produced yet.",
      },
      {
        id: "compose_passed",
        label: "Compose passed",
        status: "pending",
        detail: "Awaiting A1 compose output.",
      },
      {
        id: "publishability_passed",
        label: "Publishability passed",
        status: "pending",
        detail: "Awaiting final publishability verification.",
      },
    ],
  });
}

function buildSourceLabelSet(
  locationData = {},
  siteMetrics = {},
  portfolioFiles = [],
) {
  const labels = [];
  if (locationData?.coordinates) labels.push("geocoded coordinates");
  if (locationData?.siteAnalysis?.boundarySource) {
    labels.push(`site boundary ${locationData.siteAnalysis.boundarySource}`);
  }
  if (siteMetrics?.areaM2) labels.push("site polygon metrics");
  if (locationData?.climate?.type) labels.push("climate context");
  if (locationData?.localMaterials?.length)
    labels.push("local material context");
  if (portfolioFiles.length) labels.push("portfolio files");
  return labels;
}

function deriveSetbacks(projectDetails = {}, siteMetrics = {}) {
  const area = Number(siteMetrics?.areaM2 || 0);
  if (area > 800) {
    return { front: 5, right: 2.5, rear: 4, left: 2.5 };
  }
  if (area > 350) {
    return { front: 4, right: 2, rear: 3, left: 2 };
  }
  return { front: 3, right: 1.5, rear: 3, left: 1.5 };
}

function buildFallbackSitePolygon(areaM2 = 320) {
  const width = Math.max(16, Math.sqrt(areaM2 * 1.35));
  const depth = Math.max(18, areaM2 / width);
  return rectangleToPolygon(0, 0, width, depth);
}

function resolveLocalBoundaryPolygon(
  sitePolygon = [],
  siteMetrics = {},
  locationData = {},
) {
  const centroid = pick(
    [
      siteMetrics?.centroid,
      locationData?.coordinates,
      locationData?.location?.geometry?.location,
    ],
    { lat: 0, lng: 0 },
  );

  if (Array.isArray(sitePolygon) && sitePolygon.length >= 3 && centroid?.lat) {
    return polygonToLocalXY(sitePolygon, centroid).map((point) => ({
      x: round(point.x),
      y: round(point.y),
    }));
  }

  return buildFallbackSitePolygon(siteMetrics?.areaM2 || 320);
}

function insetRectPolygon(polygon = [], inset = {}) {
  const bbox = buildBoundingBoxFromPolygon(polygon);
  const width = Math.max(
    8,
    Number(bbox.width || 0) -
      Number(inset.left || 0) -
      Number(inset.right || 0),
  );
  const depth = Math.max(
    8,
    Number(bbox.height || 0) -
      Number(inset.front || 0) -
      Number(inset.rear || 0),
  );
  return rectangleToPolygon(
    Number(bbox.min_x || 0) + Number(inset.left || 0),
    Number(bbox.min_y || 0) + Number(inset.front || 0),
    width,
    depth,
  );
}

function buildSiteEvidence({
  address,
  locationData = {},
  sitePolygon = [],
  siteMetrics = {},
  projectDetails = {},
} = {}) {
  const setbacks = deriveSetbacks(projectDetails, siteMetrics);
  const localBoundaryPolygon = resolveLocalBoundaryPolygon(
    sitePolygon,
    siteMetrics,
    locationData,
  );
  const buildablePolygon = insetRectPolygon(localBoundaryPolygon, setbacks);
  const score =
    (locationData?.coordinates ? 0.28 : 0) +
    (Array.isArray(sitePolygon) && sitePolygon.length >= 3 ? 0.26 : 0) +
    (siteMetrics?.areaM2 ? 0.18 : 0) +
    (locationData?.siteAnalysis?.constraints ? 0.16 : 0) +
    (locationData?.climate?.type ? 0.12 : 0);

  return createEvidenceStage({
    stage: "site_evidence",
    status: clamp(score) >= 0.45 ? "ready" : "fallback",
    confidence: {
      score,
      sources: buildSourceLabelSet(locationData, siteMetrics, []),
      fallbackReason:
        score >= 0.45
          ? null
          : "Site evidence is incomplete, using inferred UK residential defaults.",
      validation: {
        hasAddress: Boolean(address),
        hasPolygon: Array.isArray(sitePolygon) && sitePolygon.length >= 3,
        hasClimate: Boolean(locationData?.climate?.type),
      },
    },
    payload: {
      schema_version: "site-evidence-v1",
      address: address || locationData?.address || null,
      coordinates: locationData?.coordinates || null,
      sitePolygon,
      localBoundaryPolygon,
      buildablePolygon,
      setbacks,
      orientationDeg: Number(siteMetrics?.orientationDeg || 0),
      perimeterM: Number(siteMetrics?.perimeterM || 0),
      areaM2: Number(siteMetrics?.areaM2 || 0),
      centroid: siteMetrics?.centroid || null,
      climate: locationData?.climate || null,
      planningContext: {
        zoning: locationData?.zoning || null,
        roadType: locationData?.siteAnalysis?.roadType || null,
        cornerLot: locationData?.siteAnalysis?.isCornerLot || false,
      },
      sources: buildSourceLabelSet(locationData, siteMetrics, []),
    },
  });
}

function buildLocalStyleEvidence({
  locationData = {},
  siteEvidence = null,
} = {}) {
  const localMaterials = Array.isArray(locationData?.localMaterials)
    ? locationData.localMaterials
    : [];
  const styleName =
    pick(
      [
        locationData?.recommendedStyle,
        locationData?.localStyles?.[0],
        locationData?.materialContext?.surrounding?.dominantStyle,
      ],
      "Contemporary Local",
    ) || "Contemporary Local";
  const score =
    (styleName ? 0.4 : 0) +
    (localMaterials.length ? 0.25 : 0) +
    (locationData?.materialContext?.surrounding ? 0.2 : 0) +
    (siteEvidence?.confidence?.score ? 0.1 : 0);
  return createEvidenceStage({
    stage: "local_style_evidence",
    status: clamp(score) >= 0.4 ? "ready" : "fallback",
    confidence: {
      score,
      sources: [
        styleName ? "recommended local style" : null,
        localMaterials.length ? "local material palette" : null,
        locationData?.materialContext?.surrounding
          ? "surrounding context"
          : null,
      ],
      fallbackReason:
        score >= 0.4
          ? null
          : "Using generalized contemporary local vernacular rules.",
    },
    payload: {
      schema_version: "local-style-evidence-v1",
      primaryStyle: styleName,
      materials: localMaterials,
      contextPalette:
        locationData?.materialContext?.surrounding?.colorPalette ||
        locationData?.materialContext?.colorPalette ||
        [],
      climateResponse: locationData?.climate || null,
    },
  });
}

function buildPortfolioStyleEvidence({
  portfolioFiles = [],
  materialWeight = 0.5,
  characteristicWeight = 0.5,
} = {}) {
  const normalizedFiles = Array.isArray(portfolioFiles) ? portfolioFiles : [];
  const score =
    normalizedFiles.length >= 5
      ? 0.82
      : normalizedFiles.length >= 3
        ? 0.68
        : normalizedFiles.length >= 1
          ? 0.52
          : 0.12;
  return createEvidenceStage({
    stage: "portfolio_style_evidence",
    status: normalizedFiles.length ? "ready" : "fallback",
    confidence: {
      score,
      sources: normalizedFiles.length
        ? [`${normalizedFiles.length} portfolio references`]
        : [],
      fallbackReason: normalizedFiles.length
        ? null
        : "No portfolio uploaded; local style will dominate.",
    },
    payload: {
      schema_version: "portfolio-style-evidence-v1",
      fileCount: normalizedFiles.length,
      materialWeight: round(materialWeight),
      characteristicWeight: round(characteristicWeight),
      clusterSummary: {
        singleSource: normalizedFiles.length <= 2,
        mixedMedia: normalizedFiles.some((file) =>
          String(file.type || "").includes("pdf"),
        ),
      },
    },
  });
}

function buildStyleBlendSpec({
  localStyleEvidence,
  portfolioStyleEvidence,
  materialWeight = 0.5,
  characteristicWeight = 0.5,
} = {}) {
  const localConfidence = Number(localStyleEvidence?.confidence?.score || 0.4);
  const portfolioConfidence = Number(
    portfolioStyleEvidence?.confidence?.score || 0.1,
  );
  const balanceFactor =
    portfolioConfidence / Math.max(0.1, localConfidence + portfolioConfidence);
  const recommended = {};
  const approved = {};

  STYLE_BLEND_CHANNELS.forEach((channel) => {
    const portfolioBias =
      channel === "materials"
        ? clamp((Number(materialWeight) + balanceFactor) / 2, 0.15, 0.85)
        : clamp((Number(characteristicWeight) + balanceFactor) / 2, 0.1, 0.82);
    const localWeight = round(1 - portfolioBias);
    recommended[channel] = {
      localWeight,
      portfolioWeight: round(portfolioBias),
      rationale:
        channel === "materials"
          ? "Material blend follows uploaded references but stays grounded in local palette."
          : "Form/detail blend favors portfolio only when evidence is strong.",
    };
    approved[channel] = {
      localWeight,
      portfolioWeight: round(portfolioBias),
      source: "v2-default",
    };
  });

  return createStyleBlendSpec({
    recommended,
    approved,
    portfolioEvidence: portfolioStyleEvidence?.payload,
    localStyleEvidence: localStyleEvidence?.payload,
  });
}

function buildBlendedStyleSummary(
  localStyleEvidence,
  portfolioStyleEvidence,
  styleBlendSpec,
) {
  const materials = [
    ...(localStyleEvidence?.payload?.materials || []),
    ...(portfolioStyleEvidence?.payload?.recommendedMaterials || []),
  ]
    .filter(Boolean)
    .slice(0, 6);

  return {
    styleName: `${portfolioStyleEvidence?.payload?.fileCount ? "Portfolio-informed" : "Context-led"} ${localStyleEvidence?.payload?.primaryStyle || "Residential"}`,
    materials,
    characteristics: [
      `Massing ${(styleBlendSpec?.approved?.massing?.portfolioWeight || 0.5) >= 0.5 ? "leans portfolio" : "leans local"}`,
      `Roof ${(styleBlendSpec?.approved?.roof?.portfolioWeight || 0.5) >= 0.5 ? "leans portfolio" : "leans local"}`,
      `Detailing ${(styleBlendSpec?.approved?.detailing?.portfolioWeight || 0.5) >= 0.5 ? "leans portfolio" : "leans local"}`,
    ],
    styleBlendSpec,
  };
}

function buildProgramBrief({
  projectDetails = {},
  programSpaces = [],
  siteEvidence,
} = {}) {
  const totalAreaM2 = Number(projectDetails.area || 0);
  const siteAreaM2 = Number(siteEvidence?.payload?.areaM2 || 0);
  const subType = projectDetails.subType || projectDetails.program;
  const lockedLevelCount = resolveLockedLevelCount(projectDetails);
  if (!isSupportedResidentialV2SubType(subType)) {
    return {
      schema_version: "program-brief-v1",
      supportedResidentialSubtype: false,
      blockers: ["Unsupported building subtype for UK Residential V2."],
      spaces: normalizeResidentialProgramSpaces(programSpaces),
      confidence: {
        score: 0.2,
        sources: [],
        fallbackReason: "Unsupported subtype.",
      },
    };
  }

  if (Array.isArray(programSpaces) && programSpaces.length > 0) {
    const generatedBrief = generateResidentialProgramBrief({
      subType,
      totalAreaM2,
      siteAreaM2,
      levelCountOverride: lockedLevelCount || null,
      entranceDirection: projectDetails.entranceDirection || "S",
    });
    const resolvedLevelCount =
      lockedLevelCount ||
      Math.max(
        1,
        inferLevelCountFromSpaces(programSpaces) ||
          Number(generatedBrief.levelCount || 1),
      );
    const alignedSpaces = alignProgramSpacesToResolvedLevels({
      spaces: programSpaces,
      resolvedLevelCount,
      subType,
      siteAreaM2,
    });
    return {
      ...generatedBrief,
      levelCount: resolvedLevelCount,
      spaces: alignedSpaces,
      confidence: {
        score: 0.76,
        sources: [
          "user-reviewed program spaces",
          "uk residential v2 normalization",
          ...(lockedLevelCount
            ? ["manual floor-count lock reconciliation"]
            : []),
        ],
        fallbackReason: null,
      },
    };
  }

  const generatedBrief = generateResidentialProgramBrief({
    subType,
    totalAreaM2,
    siteAreaM2,
    levelCountOverride: lockedLevelCount || null,
    entranceDirection: projectDetails.entranceDirection || "S",
    customNotes: projectDetails.customNotes,
  });
  if (!lockedLevelCount) {
    return generatedBrief;
  }
  return {
    ...generatedBrief,
    levelCount: lockedLevelCount,
  };
}

function buildMasterDNASeed({
  projectDetails = {},
  siteEvidence,
  localStyleEvidence,
  styleBlendSpec,
  programBrief,
  footprintMetrics = null,
} = {}) {
  const buildableBbox = buildBoundingBoxFromPolygon(
    siteEvidence?.payload?.buildablePolygon || [],
  );
  const footprintWidth = Number(
    footprintMetrics?.widthM ?? footprintMetrics?.width ?? 0,
  );
  const footprintDepth = Number(
    footprintMetrics?.depthM ?? footprintMetrics?.depth ?? 0,
  );
  return {
    projectID: `v2-${slugify(projectDetails.subType || projectDetails.program || "project")}`,
    projectName:
      projectDetails.subType || projectDetails.program || "Residential Project",
    architecturalStyle:
      localStyleEvidence?.payload?.primaryStyle || "Contemporary Local",
    roofType: programBrief?.recommendedRoof || "gable",
    styleDNA: {
      localStyle:
        localStyleEvidence?.payload?.primaryStyle || "Contemporary Local",
      materials: localStyleEvidence?.payload?.materials || [],
      styleWeights: {
        local: styleBlendSpec?.approved?.materials?.localWeight ?? 0.5,
        portfolio: styleBlendSpec?.approved?.materials?.portfolioWeight ?? 0.5,
      },
      roof_language: programBrief?.recommendedRoof || "gable",
    },
    dimensions: {
      length: round(footprintWidth || buildableBbox.width || 12),
      width: round(footprintDepth || buildableBbox.height || 10),
      floorCount: Number(programBrief?.levelCount || 2),
    },
    rooms: programBrief?.spaces || [],
    portfolioBlendPercent: round(
      Object.values(styleBlendSpec?.approved || {}).reduce(
        (sum, channel) => sum + Number(channel.portfolioWeight || 0),
        0,
      ) / Math.max(1, STYLE_BLEND_CHANNELS.length),
    ),
  };
}

function buildLevelGroups(spaces = [], levelCount = 1) {
  const groups = Object.fromEntries(
    Array.from({ length: levelCount }, (_, index) => [index, []]),
  );
  const highestLevelIndex = Math.max(0, Number(levelCount || 1) - 1);
  const parseLevelFromName = (levelName) => {
    const normalized = String(levelName || "")
      .trim()
      .toLowerCase();
    if (!normalized) return null;
    if (normalized === "ground") return 0;
    if (normalized === "first") return 1;
    if (normalized === "second") return 2;
    if (normalized === "third") return 3;
    const levelMatch = normalized.match(/^level\s+(\d+)$/);
    if (levelMatch) {
      return Number(levelMatch[1]);
    }
    return null;
  };
  spaces.forEach((space) => {
    const explicitLevelIndex = Number(space.levelIndex);
    const derivedLevelIndex = parseLevelFromName(space.level);
    const rawLevelIndex =
      Number.isFinite(derivedLevelIndex) && derivedLevelIndex >= 0
        ? derivedLevelIndex
        : Number.isFinite(explicitLevelIndex)
          ? explicitLevelIndex
          : 0;
    const levelIndex = Math.min(
      highestLevelIndex,
      Math.max(0, Math.floor(rawLevelIndex)),
    );
    groups[levelIndex].push(space);
  });
  return groups;
}

function layoutSpacesForLevel({
  spaces = [],
  x = 0,
  y = 0,
  width = 12,
  depth = 10,
  includeStair = false,
}) {
  const floorMetadata = {
    rooms: [],
    doors: [],
    stairCore: null,
  };
  if (!spaces.length) {
    return floorMetadata;
  }

  const stairWidth = includeStair ? Math.min(2.4, width * 0.18) : 0;
  const circulationWidth = includeStair ? Math.max(1.4, width * 0.12) : 0;
  const coreWidth = stairWidth + circulationWidth;
  const usableWidth = Math.max(6, width - coreWidth);
  const frontBandDepth = Math.max(depth * 0.45, 4.4);
  const backBandDepth = Math.max(depth - frontBandDepth, 4.2);

  if (includeStair) {
    floorMetadata.stairCore = {
      bbox: {
        x: x + usableWidth,
        y: y + depth * 0.22,
        width: stairWidth,
        depth: Math.min(4.2, depth * 0.56),
      },
      polygon: rectangleToPolygon(
        x + usableWidth,
        y + depth * 0.22,
        stairWidth,
        Math.min(4.2, depth * 0.56),
      ),
    };
  }

  const sorted = [...spaces].sort(
    (left, right) => Number(right.area || 0) - Number(left.area || 0),
  );
  const frontSpaces = sorted.filter((space, index) => index % 2 === 0);
  const backSpaces = sorted.filter((space, index) => index % 2 === 1);
  const bands = [
    { spaces: frontSpaces, bandY: y, bandDepth: frontBandDepth },
    { spaces: backSpaces, bandY: y + frontBandDepth, bandDepth: backBandDepth },
  ];

  bands.forEach(({ spaces: bandSpaces, bandY, bandDepth }) => {
    if (!bandSpaces.length) return;
    const totalBandArea = bandSpaces.reduce(
      (sum, space) => sum + Number(space.area || 0),
      0,
    );
    let cursorX = x;
    bandSpaces.forEach((space, index) => {
      const share =
        totalBandArea > 0
          ? Number(space.area || 0) / totalBandArea
          : 1 / bandSpaces.length;
      const roomWidth =
        index === bandSpaces.length - 1
          ? x + usableWidth - cursorX
          : Math.max(2.8, usableWidth * share);
      const polygon = rectangleToPolygon(cursorX, bandY, roomWidth, bandDepth);
      floorMetadata.rooms.push({
        name: space.label,
        type: space.spaceType,
        area: space.area,
        polygon,
        bbox: {
          x: cursorX,
          y: bandY,
          width: roomWidth,
          depth: bandDepth,
        },
        zone: String(space.spaceType || "").includes("bedroom")
          ? "private"
          : "day",
      });
      floorMetadata.doors.push({
        roomName: space.label,
        position: {
          x: cursorX + roomWidth / 2,
          y: bandY + (bandDepth >= depth * 0.5 ? bandDepth * 0.85 : 0.1),
        },
        width: String(space.spaceType || "").includes("entrance") ? 1.1 : 0.9,
        isMainEntrance: String(space.spaceType || "").includes("entrance"),
        connectsTo: "circulation",
      });
      cursorX += roomWidth;
    });
  });

  if (!floorMetadata.doors.some((door) => door.isMainEntrance)) {
    floorMetadata.doors.push({
      roomName: "Entrance Hall",
      position: { x: x + usableWidth / 2, y: y + depth - 0.1 },
      width: 1.05,
      isMainEntrance: true,
      connectsTo: "circulation",
    });
  }

  return floorMetadata;
}

function buildRuntimeProjectGeometry({
  projectDetails,
  siteEvidence,
  localStyleEvidence,
  styleBlendSpec,
  programBrief,
}) {
  const siteBoundaryPolygon =
    siteEvidence?.payload?.localBoundaryPolygon ||
    buildFallbackSitePolygon(320);
  const buildablePolygon =
    siteEvidence?.payload?.buildablePolygon || siteBoundaryPolygon;
  const buildableBbox = buildBoundingBoxFromPolygon(buildablePolygon);
  const levelCount = Number(programBrief.levelCount || 2);
  const totalAreaM2 = Number(
    projectDetails.area || programBrief.targetAreaM2 || 140,
  );
  const targetFootprintArea = Math.min(
    totalAreaM2 / Math.max(1, levelCount),
    Number((siteEvidence?.payload?.areaM2 || 320) * 0.72),
  );
  const aspectRatio =
    (buildableBbox.width || 12) / Math.max(1, buildableBbox.height || 10);
  const buildingWidth = Math.min(
    buildableBbox.width || 12,
    Math.sqrt(targetFootprintArea * Math.max(0.75, aspectRatio)),
  );
  const buildingDepth = Math.min(
    buildableBbox.height || 10,
    targetFootprintArea / Math.max(4, buildingWidth),
  );
  const offsetX =
    Number(buildableBbox.min_x || 0) +
    Math.max(0, ((buildableBbox.width || buildingWidth) - buildingWidth) / 2);
  const offsetY =
    Number(buildableBbox.min_y || 0) +
    Math.max(0, ((buildableBbox.height || buildingDepth) - buildingDepth) / 2);
  const footprintPolygon = rectangleToPolygon(
    offsetX,
    offsetY,
    buildingWidth,
    buildingDepth,
  );
  const footprintBbox = buildBoundingBoxFromPolygon(footprintPolygon);
  const levelGroups = buildLevelGroups(programBrief.spaces, levelCount);
  const floorMetadata = {};

  for (let levelIndex = 0; levelIndex < levelCount; levelIndex += 1) {
    floorMetadata[levelIndex] = layoutSpacesForLevel({
      spaces: levelGroups[levelIndex] || [],
      x: offsetX,
      y: offsetY,
      width: buildingWidth,
      depth: buildingDepth,
      includeStair: levelCount > 1,
    });
  }

  const baseProjectGeometry = {
    schema_version: CANONICAL_PROJECT_GEOMETRY_VERSION,
    project_id: `v2-${slugify(projectDetails.subType || projectDetails.program || "project")}`,
    site: {
      boundary_polygon: siteBoundaryPolygon,
      buildable_polygon: buildablePolygon,
      setbacks: siteEvidence?.payload?.setbacks || {},
      orientation_deg: Number(siteEvidence?.payload?.orientationDeg || 0),
      area_m2: Number(siteEvidence?.payload?.areaM2 || 0),
    },
    metadata: {
      style_dna: {
        localStyle:
          localStyleEvidence?.payload?.primaryStyle || "Contemporary Local",
        materials: localStyleEvidence?.payload?.materials || [],
        styleWeights: {
          local: styleBlendSpec?.approved?.materials?.localWeight ?? 0.5,
          portfolio:
            styleBlendSpec?.approved?.materials?.portfolioWeight ?? 0.5,
        },
      },
      runtime_layout_seed: {
        footprint_polygon: footprintPolygon,
        footprint_bbox: footprintBbox,
      },
    },
  };

  const masterDNA = buildMasterDNASeed({
    projectDetails,
    siteEvidence,
    localStyleEvidence,
    styleBlendSpec,
    programBrief,
    footprintMetrics: {
      width: buildingWidth,
      depth: buildingDepth,
    },
  });
  const promotedGeometry = buildRuntimeProjectGeometryFromLayout({
    masterDNA,
    geometryMasks: { floorMetadata },
    baseProjectGeometry,
    designFingerprint: masterDNA.projectID,
  });

  return {
    masterDNA,
    projectGeometry: promotedGeometry?.projectGeometry || baseProjectGeometry,
    populatedGeometry: promotedGeometry?.populatedGeometry || null,
    footprintPolygon,
    floorMetadata,
    metrics: promotedGeometry?.metrics || null,
  };
}

export async function buildProjectPipelineV2Bundle({
  projectDetails = {},
  programSpaces = [],
  locationData = {},
  sitePolygon = [],
  siteMetrics = {},
  materialWeight = 0.5,
  characteristicWeight = 0.5,
  portfolioFiles = [],
} = {}) {
  const subType = projectDetails.subType || projectDetails.program;
  const supported = isSupportedResidentialV2SubType(subType);
  const siteEvidence = buildSiteEvidence({
    address: locationData?.address,
    locationData,
    sitePolygon,
    siteMetrics,
    projectDetails,
  });
  const localStyleEvidence = buildLocalStyleEvidence({
    locationData,
    siteEvidence,
  });
  const portfolioStyleEvidence = buildPortfolioStyleEvidence({
    portfolioFiles,
    materialWeight,
    characteristicWeight,
  });
  const styleBlendSpec = buildStyleBlendSpec({
    localStyleEvidence,
    portfolioStyleEvidence,
    materialWeight,
    characteristicWeight,
  });
  const programBrief = buildProgramBrief({
    projectDetails,
    programSpaces,
    siteEvidence,
  });

  if (!supported || programBrief.supportedResidentialSubtype === false) {
    return {
      supported: false,
      pipelineVersion: UK_RESIDENTIAL_V2_PIPELINE_VERSION,
      siteEvidence,
      localStyleEvidence,
      portfolioStyleEvidence,
      styleBlendSpec,
      programBrief,
      blockers: [
        "UK Residential V2 currently supports low-rise residential only.",
      ],
    };
  }

  const runtimeBundle = buildRuntimeProjectGeometry({
    projectDetails,
    siteEvidence,
    localStyleEvidence,
    styleBlendSpec,
    programBrief,
  });
  const locationContext = {
    ...(locationData || {}),
    localMaterials:
      localStyleEvidence?.payload?.materials ||
      locationData?.localMaterials ||
      [],
  };
  const compiledProject = compileProject({
    projectGeometry: runtimeBundle.projectGeometry,
    masterDNA: runtimeBundle.masterDNA,
    locationData: locationContext,
    styleBlendSpec,
    portfolioAnalysis: portfolioStyleEvidence.payload,
  });
  const technicalPack = buildTechnicalPackSummary(compiledProject);
  const layoutQuality = buildLayoutQuality({
    runtimeBundle,
    programBrief,
    technicalPack,
  });
  const authorityReadiness = buildAuthorityReadiness({
    projectDetails,
    programBrief,
    compiledProject,
    technicalPack,
    layoutQuality,
  });
  const compiledProjectWithDiagnostics = {
    ...compiledProject,
    authoritySource: "compiled_project",
    compiledProjectSchemaVersion:
      compiledProject?.schema_version || compiledProject?.schemaVersion || null,
    authorityReadiness,
    technicalPack,
    layoutQuality,
  };
  const takeoff = buildProjectQuantityTakeoff(compiledProject, {
    pipelineVersion: UK_RESIDENTIAL_V2_PIPELINE_VERSION,
  });
  const exportManifest = createCompiledExportManifest({
    geometryHash: compiledProjectWithDiagnostics.geometryHash,
    pipelineVersion: UK_RESIDENTIAL_V2_PIPELINE_VERSION,
    projectName:
      projectDetails?.projectName ||
      projectDetails?.name ||
      projectDetails?.subType ||
      "ArchiAI Project",
    compiledProject: compiledProjectWithDiagnostics,
    projectQuantityTakeoff: takeoff,
  });
  const reviewSurface = buildResidentialReviewSurface({
    projectDetails,
    programBrief,
    compiledProject: compiledProjectWithDiagnostics,
    authorityReadiness,
  });
  const deliveryStages = buildResidentialDeliveryStages({
    authorityReadiness,
    programBrief,
    compiledProject: compiledProjectWithDiagnostics,
    technicalPack,
  });
  const blendedStyle = buildBlendedStyleSummary(
    localStyleEvidence,
    portfolioStyleEvidence,
    styleBlendSpec,
  );

  const confidenceScore = round(
    Number(siteEvidence?.confidence?.score || 0) * 0.35 +
      Number(localStyleEvidence?.confidence?.score || 0) * 0.2 +
      Number(portfolioStyleEvidence?.confidence?.score || 0) * 0.15 +
      Number(programBrief?.confidence?.score || 0.8) * 0.3,
  );

  return {
    supported: true,
    pipelineVersion: UK_RESIDENTIAL_V2_PIPELINE_VERSION,
    confidence: {
      score: confidenceScore,
      sources: [
        ...siteEvidence.confidence.sources,
        ...localStyleEvidence.confidence.sources,
        ...portfolioStyleEvidence.confidence.sources,
        ...(programBrief?.confidence?.sources || []),
      ],
      fallbackReason:
        confidenceScore >= 0.6
          ? null
          : "One or more intake stages ran in fallback mode.",
    },
    validation: {
      valid:
        compiledProjectWithDiagnostics?.validation?.valid !== false &&
        authorityReadiness.ready === true &&
        siteEvidence.blockers.length === 0 &&
        (programBrief?.blockers || []).length === 0,
      blockers: [
        ...siteEvidence.blockers,
        ...(programBrief?.blockers || []),
        ...(authorityReadiness?.blockers || []),
        ...(compiledProjectWithDiagnostics?.validation?.blockers || []),
      ],
      warnings: [
        ...siteEvidence.warnings,
        ...localStyleEvidence.warnings,
        ...portfolioStyleEvidence.warnings,
        ...(authorityReadiness?.warnings || []),
        ...(compiledProjectWithDiagnostics?.validation?.warnings || []),
      ],
    },
    siteEvidence,
    localStyleEvidence,
    portfolioStyleEvidence,
    styleBlendSpec,
    programBrief,
    blendedStyle,
    projectGeometry: runtimeBundle.projectGeometry,
    populatedGeometry: runtimeBundle.populatedGeometry,
    masterDNASeed: runtimeBundle.masterDNA,
    technicalPack,
    layoutQuality,
    authorityReadiness,
    deliveryStages,
    exportManifest,
    reviewSurface,
    compiledProject: compiledProjectWithDiagnostics,
    projectQuantityTakeoff: takeoff,
  };
}

export default {
  buildProjectPipelineV2Bundle,
};
