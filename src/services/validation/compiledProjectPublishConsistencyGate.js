const TECHNICAL_PANEL_TYPE_PREFIXES = ["floor_plan_", "elevation_", "section_"];

const CARDINAL_ALIASES = {
  n: "N",
  north: "N",
  s: "S",
  south: "S",
  e: "E",
  east: "E",
  w: "W",
  west: "W",
};

export const COMPILED_PROJECT_PUBLISH_CONSISTENCY_VERSION =
  "compiled-project-publish-consistency-gate-v1";

export const COMPILED_PROJECT_PUBLISH_CONSISTENCY_CODES = {
  GEOMETRY_HASH_MISMATCH_2D_3D: "GEOMETRY_HASH_MISMATCH_2D_3D",
  FACADE_OPENING_COUNT_MISMATCH: "FACADE_OPENING_COUNT_MISMATCH",
  ROOF_SILHOUETTE_MISMATCH: "ROOF_SILHOUETTE_MISMATCH",
  SECTION_CUT_MISSING_GEOMETRY: "SECTION_CUT_MISSING_GEOMETRY",
  TECHNICAL_PANEL_NOT_DETERMINISTIC_SVG:
    "TECHNICAL_PANEL_NOT_DETERMINISTIC_SVG",
  BOARD_QUALITY_BELOW_THRESHOLD: "BOARD_QUALITY_BELOW_THRESHOLD",
};

export const DEFAULT_BOARD_QUALITY_THRESHOLDS = Object.freeze({
  minOccupancyRatio: 0.45,
  minReadabilityScore: 0.68,
});

function firstFinite(...values) {
  for (const value of values.flat()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }
  return null;
}

function hasPositiveFinite(...values) {
  return values
    .flat()
    .some((value) => Number.isFinite(Number(value)) && Number(value) > 0);
}

function firstNonEmptyString(...values) {
  for (const value of values.flat()) {
    if (typeof value !== "string") {
      continue;
    }
    const trimmed = value.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return null;
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeCardinal(value) {
  if (!value && value !== 0) {
    return null;
  }
  const normalized = String(value).trim().toLowerCase();
  if (CARDINAL_ALIASES[normalized]) {
    return CARDINAL_ALIASES[normalized];
  }
  if (normalized.startsWith("elevation_")) {
    return normalizeCardinal(normalized.replace("elevation_", ""));
  }
  return null;
}

function cardinalToWord(value) {
  switch (normalizeCardinal(value)) {
    case "N":
      return "north";
    case "S":
      return "south";
    case "E":
      return "east";
    case "W":
      return "west";
    default:
      return null;
  }
}

function buildIssue(code, message, details = {}) {
  return {
    code,
    severity: "error",
    message,
    details,
  };
}

function resolveCompiledGeometry(compiledProject = {}) {
  return (
    compiledProject.compiledGeometry ||
    compiledProject.compiled_geometry ||
    compiledProject.geometryCompilation ||
    compiledProject.geometry_compilation ||
    null
  );
}

function resolveProjectGeometry(compiledProject = {}, options = {}) {
  return (
    options.projectGeometry ||
    compiledProject.projectGeometry ||
    compiledProject.project_geometry ||
    compiledProject.geometry ||
    compiledProject.project ||
    null
  );
}

function resolvePanelType(entry = {}, fallback = "panel") {
  const explicit =
    entry.type ||
    entry.panelType ||
    entry.panel_type ||
    entry.viewType ||
    entry.view_type;
  if (explicit) {
    return String(explicit);
  }

  if (entry.orientation || entry.side) {
    const word = cardinalToWord(entry.orientation || entry.side);
    if (word) {
      return `elevation_${word}`;
    }
  }

  if (entry.section_type || entry.sectionType) {
    return `section_${String(entry.section_type || entry.sectionType)}`;
  }

  if (entry.level_id || entry.levelId) {
    return `floor_plan_${String(entry.level_id || entry.levelId)}`;
  }

  return fallback;
}

function resolveTechnicalPanels(compiledProject = {}) {
  const panels = [];
  const seen = new Set();

  const addPanel = (entry, fallbackType) => {
    if (!entry || typeof entry !== "object") {
      return;
    }
    const panelType = resolvePanelType(entry, fallbackType);
    const technical =
      TECHNICAL_PANEL_TYPE_PREFIXES.some((prefix) =>
        panelType.startsWith(prefix),
      ) ||
      entry.drawingType === "plan" ||
      entry.drawingType === "elevation" ||
      entry.drawingType === "section";
    if (!technical) {
      return;
    }

    const stableKey =
      entry.id ||
      entry.panelId ||
      entry.sourceArtifact ||
      `${panelType}:${entry.orientation || entry.section_type || entry.level_id || panels.length}`;
    if (seen.has(stableKey)) {
      return;
    }
    seen.add(stableKey);
    panels.push({
      ...entry,
      panelType,
    });
  };

  toArray(compiledProject.panels).forEach((entry) => addPanel(entry));
  toArray(compiledProject.drawings?.plan).forEach((entry, index) =>
    addPanel(entry, `floor_plan_${entry.level_id || index}`),
  );
  toArray(compiledProject.drawings?.elevation).forEach((entry, index) =>
    addPanel(
      entry,
      `elevation_${cardinalToWord(entry.orientation || entry.side) || index}`,
    ),
  );
  toArray(compiledProject.drawings?.section).forEach((entry, index) =>
    addPanel(entry, `section_${entry.section_type || index}`),
  );

  return panels;
}

function resolveElevationEntries(compiledProject = {}) {
  return resolveTechnicalPanels(compiledProject).filter((entry) =>
    String(entry.panelType || "").startsWith("elevation_"),
  );
}

function resolveSectionEntries(compiledProject = {}) {
  return resolveTechnicalPanels(compiledProject).filter((entry) =>
    String(entry.panelType || "").startsWith("section_"),
  );
}

function resolveVisualPanels(compiledProject = {}) {
  const panels = [];
  const seen = new Set();
  const add = (entry, panelType) => {
    if (!entry || typeof entry !== "object") {
      return;
    }
    const stableKey = entry.id || entry.panelId || panelType;
    if (seen.has(stableKey)) {
      return;
    }
    seen.add(stableKey);
    panels.push({
      ...entry,
      panelType: resolvePanelType(entry, panelType),
    });
  };

  add(compiledProject.hero, "hero_3d");
  add(compiledProject.hero3d, "hero_3d");
  add(compiledProject.visualPackage, compiledProject.visualPackage?.viewType);
  toArray(compiledProject.panels)
    .filter((entry) =>
      ["hero_3d", "axonometric", "interior_3d"].includes(
        String(resolvePanelType(entry, "") || ""),
      ),
    )
    .forEach((entry) => add(entry));

  return panels;
}

function extractGeometryHash(entry = {}) {
  return firstNonEmptyString(
    entry.geometryHash,
    entry.geometry_hash,
    entry.meta?.geometryHash,
    entry.meta?.geometry_hash,
    entry.metadata?.geometryHash,
    entry.metadata?.geometry_hash,
  );
}

function resolveGeometryHashes(compiledProject = {}, options = {}) {
  const technicalPanels = resolveTechnicalPanels(compiledProject);
  const visualPanels = resolveVisualPanels(compiledProject);

  return {
    twoD: firstNonEmptyString(
      compiledProject.geometryHashes?.twoD,
      compiledProject.geometryHashes?.two_d,
      compiledProject.geometryHashes?.geometry2d,
      compiledProject.hashes?.twoD,
      compiledProject.hashes?.two_d,
      compiledProject.hashes?.geometry2d,
      compiledProject.twoD?.geometryHash,
      compiledProject.two_d?.geometryHash,
      technicalPanels.map((entry) => extractGeometryHash(entry)),
      options.pack?.geometryHash,
      options.canonicalPack?.geometryHash,
    ),
    threeD: firstNonEmptyString(
      compiledProject.geometryHashes?.threeD,
      compiledProject.geometryHashes?.three_d,
      compiledProject.geometryHashes?.geometry3d,
      compiledProject.hashes?.threeD,
      compiledProject.hashes?.three_d,
      compiledProject.hashes?.geometry3d,
      compiledProject.threeD?.geometryHash,
      compiledProject.three_d?.geometryHash,
      compiledProject.hero?.geometryHash,
      compiledProject.hero3d?.geometryHash,
      visualPanels.map((entry) => extractGeometryHash(entry)),
    ),
  };
}

function extractOpeningCount(entry = {}) {
  if (typeof entry === "number") {
    return entry;
  }
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const explicit = firstFinite(
    entry.openingCount,
    entry.opening_count,
    entry.totalOpenings,
    entry.total_openings,
    entry.openings,
    entry.total,
  );
  if (explicit !== null) {
    return explicit;
  }

  const windowCount = firstFinite(entry.windowCount, entry.window_count);
  const doorCount = firstFinite(entry.doorCount, entry.door_count);

  if (windowCount !== null || doorCount !== null) {
    return Number(windowCount || 0) + Number(doorCount || 0);
  }

  return null;
}

function normalizeOpeningCountsByFacade(rawCounts = {}) {
  const normalized = {};
  Object.entries(rawCounts || {}).forEach(([key, value]) => {
    const side = normalizeCardinal(key);
    if (!side) {
      return;
    }
    const count = extractOpeningCount(value);
    if (count !== null) {
      normalized[side] = count;
    }
  });
  return normalized;
}

function computeGeometryFacadeOpeningCounts(projectGeometry = {}) {
  const fromSummary = normalizeOpeningCountsByFacade(
    projectGeometry.facadeSummary || projectGeometry.facade_summary || {},
  );
  if (Object.keys(fromSummary).length > 0) {
    return fromSummary;
  }

  const hasOpeningArrays =
    Object.prototype.hasOwnProperty.call(projectGeometry, "windows") ||
    Object.prototype.hasOwnProperty.call(projectGeometry, "doors") ||
    Object.prototype.hasOwnProperty.call(projectGeometry, "walls");
  if (!hasOpeningArrays) {
    return {};
  }

  const counts = { N: 0, S: 0, E: 0, W: 0 };
  const wallSides = new Map(
    toArray(projectGeometry.walls).map((wall) => [
      wall.id,
      normalizeCardinal(
        wall.facade ||
          wall.side ||
          wall.metadata?.side ||
          wall.metadata?.orientation,
      ),
    ]),
  );

  const countOpening = (opening = {}) => {
    const side = normalizeCardinal(
      opening.facade ||
        opening.side ||
        opening.orientation ||
        wallSides.get(opening.wall_id),
    );
    if (!side) {
      return;
    }
    counts[side] += 1;
  };

  toArray(projectGeometry.windows).forEach(countOpening);
  toArray(projectGeometry.doors).forEach(countOpening);

  return counts;
}

function resolveGeometryFacadeOpeningCounts(
  compiledProject = {},
  options = {},
) {
  const compiledGeometry = resolveCompiledGeometry(compiledProject);
  const explicit = normalizeOpeningCountsByFacade(
    compiledGeometry?.facadeOpeningCounts ||
      compiledGeometry?.facade_opening_counts ||
      compiledProject.facadeOpeningCounts ||
      compiledProject.facade_opening_counts ||
      {},
  );
  if (Object.keys(explicit).length > 0) {
    return explicit;
  }

  return computeGeometryFacadeOpeningCounts(
    resolveProjectGeometry(compiledProject, options) || {},
  );
}

function resolveElevationFacadeOpeningCounts(compiledProject = {}) {
  const counts = {};

  resolveElevationEntries(compiledProject).forEach((entry) => {
    const side = normalizeCardinal(
      entry.orientation || entry.side || entry.panelType,
    );
    if (!side) {
      return;
    }

    const explicit = extractOpeningCount({
      openingCount:
        entry.openingCount ||
        entry.opening_count ||
        entry.technical_quality_metadata?.opening_count ||
        entry.technical_quality_metadata?.openingCount,
      windowCount:
        entry.windowCount ||
        entry.window_count ||
        entry.technical_quality_metadata?.window_count ||
        entry.technical_quality_metadata?.windowCount,
      doorCount:
        entry.doorCount ||
        entry.door_count ||
        entry.technical_quality_metadata?.door_count ||
        entry.technical_quality_metadata?.doorCount,
    });

    if (explicit !== null) {
      counts[side] = explicit;
    }
  });

  return counts;
}

function extractRoofSilhouetteSignature(entry = {}) {
  return firstNonEmptyString(
    entry.roofSilhouetteHash,
    entry.roofSilhouetteSignature,
    entry.roof_silhouette_hash,
    entry.roof_silhouette_signature,
    entry.meta?.roofSilhouetteHash,
    entry.meta?.roofSilhouetteSignature,
    entry.metadata?.roofSilhouetteHash,
    entry.metadata?.roofSilhouetteSignature,
    entry.technical_quality_metadata?.roof_silhouette_hash,
    entry.technical_quality_metadata?.roof_silhouette_signature,
    entry.validation?.roofSilhouetteHash,
    entry.validation?.roofSilhouetteSignature,
  );
}

function resolveRoofSilhouetteObservations(compiledProject = {}) {
  const observations = [];
  const compiledGeometry = resolveCompiledGeometry(compiledProject);
  const compiledReference = firstNonEmptyString(
    compiledProject.roof?.silhouetteHash,
    compiledProject.roof?.silhouetteSignature,
    compiledProject.roofSilhouetteHash,
    compiledProject.roofSilhouetteSignature,
    extractRoofSilhouetteSignature(compiledGeometry || {}),
    resolveProjectGeometry(compiledProject)?.metadata?.roofSilhouetteHash,
  );

  if (compiledReference) {
    observations.push({
      viewType: "compiled_geometry",
      signature: compiledReference,
      reference: true,
    });
  }

  resolveVisualPanels(compiledProject).forEach((entry) => {
    const signature = extractRoofSilhouetteSignature(entry);
    if (signature) {
      observations.push({
        viewType: entry.panelType,
        signature,
        reference: false,
      });
    }
  });

  resolveElevationEntries(compiledProject).forEach((entry) => {
    const signature = extractRoofSilhouetteSignature(entry);
    if (signature) {
      observations.push({
        viewType: entry.panelType,
        signature,
        reference: false,
      });
    }
  });

  resolveSectionEntries(compiledProject).forEach((entry) => {
    const signature = extractRoofSilhouetteSignature(entry);
    if (signature) {
      observations.push({
        viewType: entry.panelType,
        signature,
        reference: false,
      });
    }
  });

  return observations;
}

function resolveBoardMetrics(compiledProject = {}) {
  return {
    occupancyRatio: firstFinite(
      compiledProject.board?.occupancyRatio,
      compiledProject.board?.metrics?.occupancyRatio,
      compiledProject.board?.metrics?.occupancy,
      compiledProject.boardMetrics?.occupancyRatio,
      compiledProject.board_metrics?.occupancyRatio,
      compiledProject.publishability?.boardOccupancyRatio,
      compiledProject.publishability?.boardOccupancy,
    ),
    readabilityScore: firstFinite(
      compiledProject.board?.readabilityScore,
      compiledProject.board?.metrics?.readabilityScore,
      compiledProject.board?.readability?.score,
      compiledProject.boardMetrics?.readabilityScore,
      compiledProject.board_metrics?.readabilityScore,
      compiledProject.publishability?.boardReadabilityScore,
      compiledProject.publishability?.readability?.score,
    ),
  };
}

function readSvgPayload(entry = {}) {
  return firstNonEmptyString(entry.svg, entry.svgString, entry.content?.svg);
}

function isDeterministicSvgPanel(entry = {}) {
  const svgPayload = readSvgPayload(entry);
  const imageUrl = firstNonEmptyString(
    entry.imageUrl,
    entry.image_url,
    entry.dataUrl,
    entry.data_url,
    entry.url,
  );
  const format = String(
    firstNonEmptyString(
      entry.format,
      entry.meta?.format,
      entry.metadata?.format,
    ) || "",
  ).toLowerCase();
  const renderer = String(
    firstNonEmptyString(
      entry.renderer,
      entry.meta?.renderer,
      entry.metadata?.renderer,
      entry.generationMode,
      entry.generation_mode,
    ) || "",
  ).toLowerCase();
  const generationMethod = String(
    firstNonEmptyString(
      entry.generationMethod,
      entry.generation_method,
      entry.meta?.generationMethod,
      entry.meta?.generation_method,
    ) || "",
  ).toLowerCase();

  const hasSvgPayload =
    Boolean(svgPayload && svgPayload.includes("<svg")) ||
    String(imageUrl || "").startsWith("data:image/svg+xml");
  const deterministic =
    entry.deterministic === true ||
    renderer.includes("deterministic") ||
    generationMethod === "vector" ||
    generationMethod === "deterministic_svg" ||
    (format === "svg" &&
      !renderer.includes("diffusion") &&
      !generationMethod.includes("diffusion"));

  return {
    valid: hasSvgPayload && deterministic,
    hasSvgPayload,
    deterministic,
    renderer: renderer || null,
    generationMethod: generationMethod || null,
    format: format || null,
  };
}

function sectionHasDirectIntersection(entry = {}) {
  const metadata = entry.technical_quality_metadata || {};
  const explicitFalse =
    entry.sectionCutIntersectsGeometry === false ||
    entry.section_cut_intersects_geometry === false ||
    metadata.sectionCutIntersectsGeometry === false ||
    metadata.section_cut_intersects_geometry === false ||
    entry.intersectsRealGeometry === false ||
    entry.intersects_real_geometry === false;
  if (explicitFalse) {
    return false;
  }

  return hasPositiveFinite(
    metadata.section_direct_evidence_count,
    metadata.section_exact_construction_clip_count,
    metadata.section_exact_profile_clip_count,
    metadata.section_near_boolean_clip_count,
    metadata.section_cut_room_count,
    metadata.section_cut_opening_count,
    metadata.section_direct_construction_truth_count,
    metadata.cut_wall_direct_truth_count,
    metadata.cut_opening_direct_truth_count,
    metadata.stair_direct_truth_count,
    metadata.slab_exact_clip_count,
    metadata.roof_exact_clip_count,
    metadata.foundation_direct_clip_count,
    metadata.base_condition_direct_clip_count,
    entry.section_evidence?.summary?.directEvidenceCount,
    entry.section_evidence?.summary?.directClipCount,
    entry.section_evidence?.summary?.cutFaceConstructionTruthCount,
    entry.section_evidence?.summary?.sectionFaceCutFaceCount,
    entry.sectionFaceSummary?.cutFaceCount,
  );
}

function summarizeIssueCodes(issues = []) {
  return [...new Set(issues.map((issue) => issue.code))];
}

export function validateCompiledProjectPublishConsistency(
  compiledProject = {},
  options = {},
) {
  const issues = [];
  const thresholds = {
    ...DEFAULT_BOARD_QUALITY_THRESHOLDS,
    ...(options.boardThresholds || {}),
  };

  const geometryHashes = resolveGeometryHashes(compiledProject, options);
  if (
    geometryHashes.twoD &&
    geometryHashes.threeD &&
    geometryHashes.twoD !== geometryHashes.threeD
  ) {
    issues.push(
      buildIssue(
        COMPILED_PROJECT_PUBLISH_CONSISTENCY_CODES.GEOMETRY_HASH_MISMATCH_2D_3D,
        "Compiled 2D and 3D geometry hashes differ.",
        {
          geometryHash2D: geometryHashes.twoD,
          geometryHash3D: geometryHashes.threeD,
        },
      ),
    );
  }

  const geometryFacadeCounts = resolveGeometryFacadeOpeningCounts(
    compiledProject,
    options,
  );
  const elevationFacadeCounts =
    resolveElevationFacadeOpeningCounts(compiledProject);
  Object.keys(elevationFacadeCounts).forEach((side) => {
    const expected = geometryFacadeCounts[side];
    const observed = elevationFacadeCounts[side];
    if (
      Number.isFinite(expected) &&
      Number.isFinite(observed) &&
      expected !== observed
    ) {
      issues.push(
        buildIssue(
          COMPILED_PROJECT_PUBLISH_CONSISTENCY_CODES.FACADE_OPENING_COUNT_MISMATCH,
          `Elevation ${cardinalToWord(side)} opening count does not match compiled geometry.`,
          {
            facade: side,
            geometryOpeningCount: expected,
            elevationOpeningCount: observed,
          },
        ),
      );
    }
  });

  const roofObservations = resolveRoofSilhouetteObservations(compiledProject);
  const roofSignatures = new Map();
  roofObservations.forEach((observation) => {
    const key = observation.signature;
    if (!roofSignatures.has(key)) {
      roofSignatures.set(key, []);
    }
    roofSignatures.get(key).push(observation.viewType);
  });
  if (roofSignatures.size > 1) {
    issues.push(
      buildIssue(
        COMPILED_PROJECT_PUBLISH_CONSISTENCY_CODES.ROOF_SILHOUETTE_MISMATCH,
        "Roof silhouette signatures disagree across compiled geometry, hero, elevations, or sections.",
        {
          signatures: [...roofSignatures.entries()].map(
            ([signature, views]) => ({
              signature,
              views,
            }),
          ),
        },
      ),
    );
  }

  resolveSectionEntries(compiledProject).forEach((entry) => {
    if (sectionHasDirectIntersection(entry)) {
      return;
    }

    issues.push(
      buildIssue(
        COMPILED_PROJECT_PUBLISH_CONSISTENCY_CODES.SECTION_CUT_MISSING_GEOMETRY,
        `${entry.panelType || "section"} does not intersect real geometry.`,
        {
          panelType: entry.panelType || null,
          sectionType: entry.section_type || entry.sectionType || null,
          technicalQualityMetadata: entry.technical_quality_metadata || null,
        },
      ),
    );
  });

  resolveTechnicalPanels(compiledProject).forEach((entry) => {
    const validation = isDeterministicSvgPanel(entry);
    if (validation.valid) {
      return;
    }

    issues.push(
      buildIssue(
        COMPILED_PROJECT_PUBLISH_CONSISTENCY_CODES.TECHNICAL_PANEL_NOT_DETERMINISTIC_SVG,
        `${entry.panelType || "technical_panel"} is not a deterministic SVG technical panel.`,
        {
          panelType: entry.panelType || null,
          hasSvgPayload: validation.hasSvgPayload,
          deterministic: validation.deterministic,
          renderer: validation.renderer,
          generationMethod: validation.generationMethod,
          format: validation.format,
        },
      ),
    );
  });

  const boardMetrics = resolveBoardMetrics(compiledProject);
  const failedBoardMetrics = [];
  if (
    boardMetrics.occupancyRatio !== null &&
    boardMetrics.occupancyRatio < thresholds.minOccupancyRatio
  ) {
    failedBoardMetrics.push({
      metric: "occupancyRatio",
      actual: boardMetrics.occupancyRatio,
      minimum: thresholds.minOccupancyRatio,
    });
  }
  if (
    boardMetrics.readabilityScore !== null &&
    boardMetrics.readabilityScore < thresholds.minReadabilityScore
  ) {
    failedBoardMetrics.push({
      metric: "readabilityScore",
      actual: boardMetrics.readabilityScore,
      minimum: thresholds.minReadabilityScore,
    });
  }
  if (failedBoardMetrics.length > 0) {
    issues.push(
      buildIssue(
        COMPILED_PROJECT_PUBLISH_CONSISTENCY_CODES.BOARD_QUALITY_BELOW_THRESHOLD,
        "Compiled board occupancy/readability is below the minimum publish threshold.",
        {
          failedMetrics: failedBoardMetrics,
          occupancyRatio: boardMetrics.occupancyRatio,
          readabilityScore: boardMetrics.readabilityScore,
          thresholds,
        },
      ),
    );
  }

  return {
    valid: issues.length === 0,
    status: issues.length === 0 ? "pass" : "block",
    version: COMPILED_PROJECT_PUBLISH_CONSISTENCY_VERSION,
    issues,
    warnings: [],
    summary: {
      issueCount: issues.length,
      issueCodes: summarizeIssueCodes(issues),
      checkedElevations: Object.keys(elevationFacadeCounts).length,
      checkedSections: resolveSectionEntries(compiledProject).length,
      checkedTechnicalPanels: resolveTechnicalPanels(compiledProject).length,
      roofObservationCount: roofObservations.length,
      boardMetrics,
    },
  };
}

export default {
  COMPILED_PROJECT_PUBLISH_CONSISTENCY_VERSION,
  COMPILED_PROJECT_PUBLISH_CONSISTENCY_CODES,
  DEFAULT_BOARD_QUALITY_THRESHOLDS,
  validateCompiledProjectPublishConsistency,
};
