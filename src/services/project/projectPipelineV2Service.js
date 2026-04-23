import { polygonToLocalXY } from "../../utils/geometry.js";
import {
  buildBoundingBoxFromPolygon,
  CANONICAL_PROJECT_GEOMETRY_VERSION,
  rectangleToPolygon,
} from "../cad/projectGeometrySchema.js";
import { compileProject } from "../compiler/index.js";
import { buildRuntimeProjectGeometryFromLayout } from "../compiler/runtimeProjectGeometryFromLayout.js";
import { buildProjectQuantityTakeoff } from "./projectQuantityTakeoffService.js";
import {
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
    const normalized = normalizeResidentialProgramSpaces(programSpaces);
    const generatedBrief = generateResidentialProgramBrief({
      subType,
      totalAreaM2,
      siteAreaM2,
      entranceDirection: projectDetails.entranceDirection || "S",
    });
    const inferredLevelCount = inferLevelCountFromSpaces(normalized);
    const resolvedLevelCount =
      lockedLevelCount ||
      Math.max(1, inferredLevelCount || Number(generatedBrief.levelCount || 1));
    return {
      ...generatedBrief,
      levelCount: resolvedLevelCount,
      spaces: normalized,
      confidence: {
        score: 0.76,
        sources: [
          "user-reviewed program spaces",
          "uk residential v2 normalization",
        ],
        fallbackReason: null,
      },
    };
  }

  const generatedBrief = generateResidentialProgramBrief({
    subType,
    totalAreaM2,
    siteAreaM2,
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
} = {}) {
  const buildableBbox = buildBoundingBoxFromPolygon(
    siteEvidence?.payload?.buildablePolygon || [],
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
      length: round(buildableBbox.width || 12),
      width: round(buildableBbox.height || 10),
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
  const buildablePolygon =
    siteEvidence?.payload?.buildablePolygon || buildFallbackSitePolygon(320);
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
      boundary_polygon:
        siteEvidence?.payload?.localBoundaryPolygon ||
        buildFallbackSitePolygon(320),
      buildable_polygon: footprintPolygon,
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
    },
  };

  const masterDNA = buildMasterDNASeed({
    projectDetails,
    siteEvidence,
    localStyleEvidence,
    styleBlendSpec,
    programBrief,
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
  const takeoff = buildProjectQuantityTakeoff(compiledProject, {
    pipelineVersion: UK_RESIDENTIAL_V2_PIPELINE_VERSION,
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
        compiledProject?.validation?.valid !== false &&
        siteEvidence.blockers.length === 0 &&
        (programBrief?.blockers || []).length === 0,
      blockers: [
        ...siteEvidence.blockers,
        ...(programBrief?.blockers || []),
        ...(compiledProject?.validation?.blockers || []),
      ],
      warnings: [
        ...siteEvidence.warnings,
        ...localStyleEvidence.warnings,
        ...portfolioStyleEvidence.warnings,
        ...(compiledProject?.validation?.warnings || []),
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
    compiledProject,
    projectQuantityTakeoff: takeoff,
  };
}

export default {
  buildProjectPipelineV2Bundle,
};
