import {
  buildBoundingBoxFromPolygon,
  computeCentroid,
  computePolygonArea,
  normalizePolygon,
  rectangleToPolygon,
  roundMetric,
} from "../cad/projectGeometrySchema.js";
import { coerceToCanonicalProjectGeometry } from "../cad/geometryFactory.js";
import {
  buildSectionEvidence,
  buildSectionEvidenceSummary,
} from "../drawing/sectionEvidenceService.js";
import { selectSectionCandidates } from "../drawing/sectionCutPlanner.js";
import { buildFacadeGrammar } from "../facade/facadeGrammarEngine.js";
import { extractSideFacade } from "../facade/sideFacadeExtractor.js";
import { computeCDSHashSync } from "../validation/cdsHash.js";
import { ensureCompiledProjectRenderInputs } from "./compiledProjectRenderInputs.js";

export const COMPILED_PROJECT_SCHEMA_VERSION = "compiled-project-v1";

const DEFAULT_SIDE_ORDER = ["north", "south", "east", "west"];

function cloneData(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function round(value, precision = 3) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  const factor = 10 ** precision;
  return Math.round(numeric * factor) / factor;
}

function clamp(value, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, Number(value || 0)));
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function sortStrings(values = []) {
  return [
    ...new Set(values.filter(Boolean).map((value) => String(value).trim())),
  ]
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
}

function deepMerge(...sources) {
  return sources.reduce((accumulator, source) => {
    if (!isPlainObject(source)) {
      return accumulator;
    }

    Object.entries(source).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        accumulator[key] = cloneData(value);
        return;
      }
      if (isPlainObject(value)) {
        accumulator[key] = deepMerge(
          isPlainObject(accumulator[key]) ? accumulator[key] : {},
          value,
        );
        return;
      }
      if (value !== undefined) {
        accumulator[key] = value;
      }
    });

    return accumulator;
  }, {});
}

function contentId(prefix, payload) {
  return `${prefix}-${computeCDSHashSync(payload).slice(0, 12)}`;
}

function compareByJson(left, right) {
  return JSON.stringify(left).localeCompare(JSON.stringify(right));
}

function compareById(left = {}, right = {}) {
  return String(left.id || "").localeCompare(String(right.id || ""));
}

function firstObject(candidates = []) {
  return candidates.find((candidate) => isPlainObject(candidate)) || {};
}

function resolveSourcePathLabel(input = {}) {
  if (isPlainObject(input.projectGeometry)) return "projectGeometry";
  if (isPlainObject(input.geometry)) return "geometry";
  if (isPlainObject(input.canonicalGeometry)) return "canonicalGeometry";
  if (isPlainObject(input.populatedGeometry)) return "populatedGeometry";
  if (isPlainObject(input.dnaSnapshot?.projectGeometry)) {
    return "dnaSnapshot.projectGeometry";
  }
  if (isPlainObject(input.masterDNA?.projectGeometry)) {
    return "masterDNA.projectGeometry";
  }
  if (isPlainObject(input.masterDNA?.populatedGeometry)) {
    return "masterDNA.populatedGeometry";
  }
  return "root_input";
}

function resolveGeometrySeed(input = {}) {
  return firstObject([
    input.projectGeometry,
    input.geometry,
    input.canonicalGeometry,
    input.populatedGeometry,
    input.dnaSnapshot?.projectGeometry,
    input.masterDNA?.projectGeometry,
    input.masterDNA?.populatedGeometry,
    input.masterDNA?.canonicalGeometry,
    input.masterDNA?.geometry,
    input,
  ]);
}

function resolveMasterDNA(input = {}) {
  return firstObject([input.masterDNA, input.dnaSnapshot, input.dna, input]);
}

function resolveStyleDNA(input = {}) {
  const masterDNA = resolveMasterDNA(input);
  return deepMerge(
    firstObject([
      input.projectGeometry?.metadata?.style_dna,
      input.geometry?.metadata?.style_dna,
      input.canonicalGeometry?.metadata?.style_dna,
    ]),
    firstObject([
      masterDNA.styleDNA,
      masterDNA.style_dna,
      masterDNA.style,
      masterDNA.style_blend,
    ]),
    firstObject([
      input.styleDNA,
      input.style_dna,
      input.style,
      input.style_blend,
    ]),
  );
}

function resolveLocationData(input = {}) {
  const masterDNA = resolveMasterDNA(input);
  return deepMerge(
    firstObject([
      input.locationData,
      input.location,
      input.siteSnapshot,
      input.projectContext?.location,
    ]),
    firstObject([
      masterDNA.locationData,
      masterDNA.location,
      masterDNA.siteSnapshot,
    ]),
  );
}

function resolveClimateData(input = {}, locationData = {}) {
  const masterDNA = resolveMasterDNA(input);
  return deepMerge(
    firstObject([
      locationData.climate,
      input.climate,
      input.climateData,
      masterDNA.site?.climate,
      masterDNA.climate,
    ]),
    firstObject([masterDNA.climateDesign]),
  );
}

function resolveBBox(entry = {}) {
  if (isPlainObject(entry.bbox)) {
    const minX = Number(entry.bbox.min_x ?? entry.bbox.x ?? 0);
    const minY = Number(entry.bbox.min_y ?? entry.bbox.y ?? 0);
    const maxX = Number(
      entry.bbox.max_x ?? minX + Number(entry.bbox.width || 0),
    );
    const maxY = Number(
      entry.bbox.max_y ?? minY + Number(entry.bbox.height || 0),
    );
    return {
      min_x: roundMetric(minX),
      min_y: roundMetric(minY),
      max_x: roundMetric(maxX),
      max_y: roundMetric(maxY),
      width: roundMetric(Math.max(0, maxX - minX)),
      height: roundMetric(Math.max(0, maxY - minY)),
    };
  }

  if (entry.start && entry.end) {
    return buildBoundingBoxFromPolygon([entry.start, entry.end]);
  }

  const polygon = [
    normalizePolygon(entry.polygon),
    normalizePolygon(entry.vertices),
    normalizePolygon(entry.footprint?.polygon),
    normalizePolygon(entry.footprint),
  ].find((candidate) => candidate.length >= 3);
  return buildBoundingBoxFromPolygon(polygon);
}

function polygonFromBBox(bbox = {}) {
  const minX = Number(bbox.min_x ?? bbox.x ?? 0);
  const minY = Number(bbox.min_y ?? bbox.y ?? 0);
  const maxX = Number(bbox.max_x ?? minX + Number(bbox.width || 0));
  const maxY = Number(bbox.max_y ?? minY + Number(bbox.height || 0));
  const width = Number(bbox.width ?? Math.max(0, maxX - minX));
  const height = Number(bbox.height ?? Math.max(0, maxY - minY));
  return rectangleToPolygon(minX, minY, width, height);
}

function resolvePolygon(entry = {}) {
  const polygon = [
    normalizePolygon(entry.polygon),
    normalizePolygon(entry.vertices),
    normalizePolygon(entry.footprint?.polygon),
    normalizePolygon(entry.footprint),
  ].find((candidate) => candidate.length >= 3);

  if (polygon?.length >= 3) {
    return polygon;
  }

  const bbox = resolveBBox(entry);
  return bbox.width > 0 || bbox.height > 0 ? polygonFromBBox(bbox) : [];
}

function resolvePosition(entry = {}) {
  if (isPlainObject(entry.position_m)) {
    return {
      x: round(entry.position_m.x),
      y: round(entry.position_m.y),
    };
  }
  if (isPlainObject(entry.position)) {
    return {
      x: round(entry.position.x),
      y: round(entry.position.y),
    };
  }

  const bbox = resolveBBox(entry);
  return {
    x: round((Number(bbox.min_x || 0) + Number(bbox.max_x || 0)) / 2),
    y: round((Number(bbox.min_y || 0) + Number(bbox.max_y || 0)) / 2),
  };
}

function resolveLength(entry = {}) {
  if (Number.isFinite(Number(entry.length_m))) {
    return round(entry.length_m);
  }
  if (entry.start && entry.end) {
    const deltaX = Number(entry.end.x || 0) - Number(entry.start.x || 0);
    const deltaY = Number(entry.end.y || 0) - Number(entry.start.y || 0);
    return round(Math.hypot(deltaX, deltaY));
  }
  const bbox = resolveBBox(entry);
  return round(Math.max(bbox.width || 0, bbox.height || 0));
}

function buildLevelProfiles(projectGeometry = {}) {
  let offset = 0;
  return toArray(projectGeometry.levels)
    .slice()
    .sort(
      (left, right) =>
        Number(left.level_number || 0) - Number(right.level_number || 0),
    )
    .map((level, index) => {
      const heightM = round(level.height_m ?? 3.2);
      const profile = {
        id:
          level.id ||
          contentId("level", { index, level_number: level.level_number }),
        sourceId: level.id || null,
        name:
          level.name ||
          (Number(level.level_number || 0) === 0
            ? "Ground Floor"
            : `Level ${level.level_number}`),
        level_number: Number(level.level_number ?? index),
        elevation_m: round(level.elevation_m ?? offset),
        height_m: heightM || 3.2,
        bottom_m: round(offset),
        top_m: round(offset + (heightM || 3.2)),
        raw: level,
      };
      offset += profile.height_m;
      return profile;
    });
}

function resolveLevelFootprint(levelProfile = {}, projectGeometry = {}) {
  const rawLevel = levelProfile.raw || {};
  const explicitFootprint = toArray(rawLevel.footprint).length
    ? normalizePolygon(rawLevel.footprint)
    : normalizePolygon(rawLevel.footprint?.polygon);
  if (explicitFootprint.length >= 3) {
    return explicitFootprint;
  }

  const matchingFootprint =
    toArray(projectGeometry.footprints).find(
      (footprint) =>
        footprint.id === rawLevel.footprint_id ||
        footprint.level_id === rawLevel.id ||
        footprint.level_id === levelProfile.id,
    ) || null;
  if (matchingFootprint) {
    const polygon = resolvePolygon(matchingFootprint);
    if (polygon.length >= 3) {
      return polygon;
    }
  }

  const roomPoints = toArray(projectGeometry.rooms)
    .filter(
      (room) =>
        room.level_id === rawLevel.id ||
        room.level_id === levelProfile.id ||
        room.level === levelProfile.level_number ||
        room.level_number === levelProfile.level_number,
    )
    .flatMap((room) => resolvePolygon(room));
  if (roomPoints.length >= 3) {
    return polygonFromBBox(buildBoundingBoxFromPolygon(roomPoints));
  }

  const wallPoints = toArray(projectGeometry.walls)
    .filter(
      (wall) =>
        wall.level_id === rawLevel.id ||
        wall.level_id === levelProfile.id ||
        wall.level === levelProfile.level_number ||
        wall.level_number === levelProfile.level_number,
    )
    .flatMap((wall) => [wall.start, wall.end].filter(Boolean));
  if (wallPoints.length >= 2) {
    return polygonFromBBox(buildBoundingBoxFromPolygon(wallPoints));
  }

  const sitePolygon = normalizePolygon(
    projectGeometry.site?.buildable_polygon ||
      projectGeometry.site?.boundary_polygon ||
      [],
  );
  return sitePolygon.length >= 3
    ? sitePolygon
    : rectangleToPolygon(0, 0, 12, 10);
}

function compileRooms(projectGeometry = {}, levelProfiles = []) {
  const roomIdMap = new Map();
  const items = toArray(projectGeometry.rooms)
    .map((room) => {
      const polygon = resolvePolygon(room);
      const bbox = buildBoundingBoxFromPolygon(polygon);
      const compiled = {
        id: contentId("room", {
          level_id: room.level_id,
          name: room.name,
          type: room.type || room.program_type,
          polygon,
        }),
        sourceId: room.id || null,
        levelId:
          levelProfiles.find(
            (level) =>
              level.sourceId === room.level_id || level.id === room.level_id,
          )?.id ||
          room.level_id ||
          null,
        name: room.name || room.id || "Room",
        type: room.type || room.program_type || "room",
        zone: room.zone || "unspecified",
        polygon,
        bbox,
        centroid: computeCentroid(polygon),
        actual_area_m2: round(
          room.actual_area ??
            room.actual_area_m2 ??
            computePolygonArea(polygon),
        ),
        target_area_m2: round(
          room.target_area ?? room.target_area_m2 ?? room.actual_area ?? 0,
        ),
        privacy_level: Number(room.privacy_level || 0),
        requires_daylight: room.requires_daylight !== false,
        wet_zone: room.wet_zone === true,
        metadata: {
          source: room.provenance?.source || room.source || "project_geometry",
        },
      };
      if (room.id) {
        roomIdMap.set(room.id, compiled.id);
      }
      return compiled;
    })
    .sort(compareById);

  return { items, roomIdMap };
}

function compileWalls(
  projectGeometry = {},
  levelProfiles = [],
  roomIdMap = new Map(),
) {
  const wallIdMap = new Map();
  const items = toArray(projectGeometry.walls)
    .map((wall) => {
      const start = wall.start
        ? { x: round(wall.start.x), y: round(wall.start.y) }
        : null;
      const end = wall.end
        ? { x: round(wall.end.x), y: round(wall.end.y) }
        : null;
      const bbox = resolveBBox(wall);
      const roomIds = sortStrings(
        toArray(wall.room_ids).map((roomId) => roomIdMap.get(roomId) || roomId),
      );
      const compiled = {
        id: contentId("wall", {
          level_id: wall.level_id,
          start,
          end,
          thickness_m: wall.thickness_m,
          exterior: wall.exterior === true,
        }),
        sourceId: wall.id || null,
        levelId:
          levelProfiles.find(
            (level) =>
              level.sourceId === wall.level_id || level.id === wall.level_id,
          )?.id ||
          wall.level_id ||
          null,
        kind: wall.kind || (wall.exterior ? "exterior" : "interior"),
        exterior: wall.exterior === true,
        roomIds,
        start,
        end,
        orientation: wall.orientation || null,
        side: wall.metadata?.side || wall.side || null,
        thickness_m: round(wall.thickness_m || 0.2),
        length_m: resolveLength(wall),
        bbox,
        metadata: {
          source: wall.provenance?.source || wall.source || "project_geometry",
        },
      };
      if (wall.id) {
        wallIdMap.set(wall.id, compiled.id);
      }
      return compiled;
    })
    .sort(compareById);

  return { items, wallIdMap };
}

function compileOpenings(
  projectGeometry = {},
  levelProfiles = [],
  wallIdMap = new Map(),
  roomIdMap = new Map(),
) {
  const openingFamilies = [
    { type: "door", entries: toArray(projectGeometry.doors) },
    { type: "window", entries: toArray(projectGeometry.windows) },
  ];

  return openingFamilies
    .flatMap(({ type, entries }) =>
      entries.map((opening) => {
        const position = resolvePosition(opening);
        const widthM = round(
          opening.width_m ?? opening.width ?? resolveBBox(opening).width,
        );
        const sillHeightM = round(
          opening.sill_height_m ??
            opening.sillHeightM ??
            (type === "window" ? 0.9 : 0),
        );
        const headHeightM = round(
          opening.head_height_m ??
            opening.headHeightM ??
            (type === "window" ? 2.1 : 2.2),
        );
        const compiled = {
          id: contentId("opening", {
            type,
            level_id: opening.level_id,
            wall_id: opening.wall_id,
            position,
            width_m: widthM,
            sill_height_m: sillHeightM,
            head_height_m: headHeightM,
          }),
          sourceId: opening.id || null,
          type,
          kind: opening.kind || type,
          levelId:
            levelProfiles.find(
              (level) =>
                level.sourceId === opening.level_id ||
                level.id === opening.level_id,
            )?.id ||
            opening.level_id ||
            null,
          wallId: wallIdMap.get(opening.wall_id) || opening.wall_id || null,
          roomIds: sortStrings(
            toArray(opening.room_ids).map(
              (roomId) => roomIdMap.get(roomId) || roomId,
            ),
          ),
          position_m: position,
          width_m: widthM,
          sill_height_m: sillHeightM,
          head_height_m: headHeightM,
          height_m: round(Math.max(0, headHeightM - sillHeightM)),
          swing: opening.metadata?.swing || opening.swing || null,
          bbox: resolveBBox(opening),
          metadata: {
            source:
              opening.provenance?.source ||
              opening.source ||
              "project_geometry",
            exact_position: Boolean(opening.position_m || opening.position),
          },
        };
        return compiled;
      }),
    )
    .sort(compareById);
}

function compileStairs(projectGeometry = {}, levelProfiles = []) {
  return toArray(projectGeometry.stairs)
    .map((stair) => {
      const polygon = resolvePolygon(stair);
      const bbox = buildBoundingBoxFromPolygon(polygon);
      return {
        id: contentId("stair", {
          level_id: stair.level_id,
          type: stair.type,
          polygon,
        }),
        sourceId: stair.id || null,
        levelId:
          levelProfiles.find(
            (level) =>
              level.sourceId === stair.level_id || level.id === stair.level_id,
          )?.id ||
          stair.level_id ||
          null,
        type: stair.type || "straight_run",
        polygon,
        bbox,
        width_m: round(stair.width_m ?? stair.width ?? bbox.width),
        depth_m: round(stair.depth_m ?? stair.height ?? bbox.height),
        connects_to_level: stair.connects_to_level ?? null,
        metadata: {
          source:
            stair.provenance?.source || stair.source || "project_geometry",
        },
      };
    })
    .sort(compareById);
}

function compileSlabs(projectGeometry = {}, levelProfiles = []) {
  const explicitSlabs = toArray(projectGeometry.slabs);
  if (explicitSlabs.length) {
    return explicitSlabs
      .map((slab) => {
        const polygon = resolvePolygon(slab);
        const bbox = buildBoundingBoxFromPolygon(polygon);
        return {
          id: contentId("slab", {
            level_id: slab.level_id,
            polygon,
            thickness_m: slab.thickness_m,
          }),
          sourceId: slab.id || null,
          levelId:
            levelProfiles.find(
              (level) =>
                level.sourceId === slab.level_id || level.id === slab.level_id,
            )?.id ||
            slab.level_id ||
            null,
          polygon,
          bbox,
          area_m2: round(computePolygonArea(polygon)),
          thickness_m: round(slab.thickness_m ?? 0.2),
          elevation_m: round(slab.elevation_m ?? slab.z ?? 0),
          metadata: {
            source:
              slab.provenance?.source || slab.source || "project_geometry",
          },
        };
      })
      .sort(compareById);
  }

  return levelProfiles
    .map((level) => {
      const polygon = resolveLevelFootprint(level, projectGeometry);
      const bbox = buildBoundingBoxFromPolygon(polygon);
      return {
        id: contentId("slab", {
          level_id: level.id,
          polygon,
          thickness_m: 0.2,
        }),
        sourceId: null,
        levelId: level.id,
        polygon,
        bbox,
        area_m2: round(computePolygonArea(polygon)),
        thickness_m: 0.2,
        elevation_m: level.bottom_m,
        metadata: {
          source: "compiled_project_fallback",
        },
      };
    })
    .sort(compareById);
}

function normalizeRoofPrimitive(entry = {}) {
  const family = String(entry.primitive_family || entry.type || "roof_plane")
    .trim()
    .toLowerCase();
  const polygon = resolvePolygon(entry);
  const bbox = buildBoundingBoxFromPolygon(polygon);
  return {
    id: contentId("roof-primitive", {
      family,
      polygon,
      start: entry.start || null,
      end: entry.end || null,
      bbox,
    }),
    sourceId: entry.id || null,
    primitive_family: family,
    type: entry.type || family,
    support_mode: entry.support_mode || "explicit_generated",
    polygon,
    bbox,
    start: entry.start
      ? { x: round(entry.start.x), y: round(entry.start.y) }
      : null,
    end: entry.end ? { x: round(entry.end.x), y: round(entry.end.y) } : null,
    slope_deg: round(entry.slope_deg ?? entry.pitch_deg ?? entry.pitch ?? 0),
    eave_depth_m: round(entry.eave_depth_m ?? entry.eaveDepthM ?? 0),
    ridge_height_m: round(entry.ridge_height_m ?? entry.ridgeHeightM ?? 0),
    metadata: {
      source: entry.provenance?.source || entry.source || "project_geometry",
      side: entry.side || entry.orientation || entry.metadata?.side || null,
    },
  };
}

function bucketRoofPrimitive(family = "") {
  if (family.includes("ridge")) return "ridges";
  if (family.includes("eave") || family.includes("roof_edge")) return "eaves";
  if (family.includes("hip")) return "hips";
  if (family.includes("valley")) return "valleys";
  if (family.includes("parapet")) return "parapets";
  if (family.includes("dormer")) return "dormers";
  return "planes";
}

function compileRoof(projectGeometry = {}, styleDNA = {}) {
  const primitives = toArray(projectGeometry.roof_primitives).map(
    normalizeRoofPrimitive,
  );
  const buckets = {
    planes: [],
    ridges: [],
    eaves: [],
    hips: [],
    valleys: [],
    parapets: [],
    dormers: [],
  };

  primitives.forEach((primitive) => {
    buckets[bucketRoofPrimitive(primitive.primitive_family)].push(primitive);
  });

  if (!primitives.length && projectGeometry.roof) {
    const fallbackPrimitive = normalizeRoofPrimitive({
      ...projectGeometry.roof,
      primitive_family: "roof_plane",
      type: projectGeometry.roof.type || "roof_plane",
      support_mode:
        projectGeometry.metadata?.canonical_construction_truth?.roof
          ?.support_mode || "derived_profile_only",
    });
    buckets.planes.push(fallbackPrimitive);
  }

  Object.keys(buckets).forEach((key) => {
    buckets[key] = buckets[key].sort(compareById);
  });

  return {
    type: projectGeometry.roof?.type || styleDNA.roof_language || "unknown",
    support_mode:
      projectGeometry.metadata?.canonical_construction_truth?.roof
        ?.support_mode ||
      (buckets.planes.length ? "explicit_generated" : "missing"),
    planes: buckets.planes,
    ridges: buckets.ridges,
    eaves: buckets.eaves,
    hips: buckets.hips,
    valleys: buckets.valleys,
    parapets: buckets.parapets,
    dormers: buckets.dormers,
    summary: {
      plane_count: buckets.planes.length,
      ridge_count: buckets.ridges.length,
      eave_count: buckets.eaves.length,
      hip_count: buckets.hips.length,
      valley_count: buckets.valleys.length,
      parapet_count: buckets.parapets.length,
      dormer_count: buckets.dormers.length,
    },
  };
}

function summarizeFacade(sideFacade = {}) {
  const projectedWindows = toArray(sideFacade.projectedWindows).map(
    (entry) => ({
      id:
        entry.id ||
        contentId("facade-window", {
          center_m: entry.center_m,
          width_m: entry.width_m,
          levelId: entry.levelId,
        }),
      kind: "window",
      levelId: entry.levelId || null,
      center_m: round(entry.center_m),
      width_m: round(entry.width_m),
      sill_height_m: round(entry.sill_height_m),
      head_height_m: round(entry.head_height_m),
    }),
  );
  const projectedDoors = toArray(sideFacade.projectedDoors).map((entry) => ({
    id:
      entry.id ||
      contentId("facade-door", {
        center_m: entry.center_m,
        width_m: entry.width_m,
        levelId: entry.levelId,
      }),
    kind: "door",
    levelId: entry.levelId || null,
    center_m: round(entry.center_m),
    width_m: round(entry.width_m),
    sill_height_m: round(entry.sill_height_m),
    head_height_m: round(entry.head_height_m),
  }));

  return {
    side: sideFacade.side || "south",
    status: sideFacade.status || "warning",
    geometrySource: sideFacade.geometrySource || "unknown",
    explicitCoverageRatio: round(sideFacade.explicitCoverageRatio || 0),
    richnessScore: round(sideFacade.richnessScore || 0),
    metrics: {
      width_m: round(sideFacade.metrics?.width_m || 0),
      total_height_m: round(sideFacade.metrics?.total_height_m || 0),
      level_count: Number(sideFacade.metrics?.level_count || 0),
    },
    roofLanguage: sideFacade.roofLanguage || "unknown",
    rhythmCount: Number(sideFacade.rhythmCount || 0),
    materialZones: cloneData(toArray(sideFacade.materialZones)).sort(
      compareByJson,
    ),
    projectedWindows: projectedWindows.sort(compareById),
    projectedDoors: projectedDoors.sort(compareById),
    projectedOpenings: [...projectedWindows, ...projectedDoors].sort(
      (left, right) => {
        if (left.center_m !== right.center_m) {
          return left.center_m - right.center_m;
        }
        return left.kind.localeCompare(right.kind);
      },
    ),
    featureFamilies: sortStrings(
      toArray(sideFacade.featureFamilies).map((entry) =>
        typeof entry === "string" ? entry : entry?.type || entry?.name,
      ),
    ),
    warnings: sortStrings(sideFacade.warnings || []),
    blockingReasons: sortStrings(sideFacade.blockingReasons || []),
    evidenceSummary: isPlainObject(sideFacade.sideFacadeEvidence)
      ? cloneData(sideFacade.sideFacadeEvidence)
      : null,
  };
}

function compileFacades(projectGeometry = {}, styleDNA = {}, options = {}) {
  let facadeGrammar = null;
  try {
    facadeGrammar =
      options.facadeGrammar ||
      projectGeometry.metadata?.facade_grammar ||
      buildFacadeGrammar(projectGeometry, styleDNA, {});
  } catch (error) {
    facadeGrammar = projectGeometry.metadata?.facade_grammar || null;
  }

  const list = DEFAULT_SIDE_ORDER.map((side) => {
    try {
      return summarizeFacade(
        extractSideFacade(projectGeometry, styleDNA, {
          side,
          orientation: side,
          facadeGrammar,
        }),
      );
    } catch (error) {
      return {
        side,
        status: "block",
        geometrySource: "compiler_error",
        explicitCoverageRatio: 0,
        richnessScore: 0,
        metrics: {
          width_m: 0,
          total_height_m: 0,
          level_count: 0,
        },
        roofLanguage: "unknown",
        rhythmCount: 0,
        materialZones: [],
        projectedWindows: [],
        projectedDoors: [],
        projectedOpenings: [],
        featureFamilies: [],
        warnings: [],
        blockingReasons: [
          `Facade compilation failed for ${side}: ${error.message}`,
        ],
        evidenceSummary: null,
      };
    }
  }).sort((left, right) => left.side.localeCompare(right.side));

  return {
    grammarVersion: facadeGrammar?.schema_version || null,
    byOrientation: list.reduce((accumulator, facade) => {
      accumulator[facade.side] = facade;
      return accumulator;
    }, {}),
    list,
  };
}

function summarizeSectionCandidate(
  candidate = {},
  evidence = {},
  summary = {},
) {
  return {
    id: contentId("section", {
      sectionType: candidate.sectionType,
      cutLine: candidate.cutLine,
      focusEntityIds: candidate.focusEntityIds || [],
    }),
    sourceId: candidate.id || null,
    sectionType: candidate.sectionType || "longitudinal",
    title: candidate.title || "Section",
    score: round(candidate.score || 0),
    semanticGoal: candidate.semanticGoal || null,
    focusEntityIds: sortStrings(candidate.focusEntityIds || []),
    rationale: sortStrings(candidate.rationale || []),
    cutLine: cloneData(candidate.cutLine || null),
    evidence: {
      quality: summary.evidenceQuality || "block",
      usefulnessScore: round(summary.usefulnessScore || 0),
      cutSpecificity: round(summary.cutSpecificity || 0),
      communicationValue: round(summary.communicationValue || 0),
      directEvidenceQuality: summary.directEvidenceQuality || "blocked",
      inferredEvidenceQuality: summary.inferredEvidenceQuality || "blocked",
      blockers: sortStrings(evidence.blockers || []),
      summary: {
        directClipCount: Number(summary.directClipCount || 0),
        cutRoomCount: Number(summary.cutRoomCount || 0),
        nearRoomCount: Number(summary.nearRoomCount || 0),
        cutWallCount: Number(summary.cutWallCount || 0),
        nearWallCount: Number(summary.nearWallCount || 0),
        cutOpeningCount: Number(summary.cutOpeningCount || 0),
        nearOpeningCount: Number(summary.nearOpeningCount || 0),
        cutStairCount: Number(summary.cutStairCount || 0),
        nearStairCount: Number(summary.nearStairCount || 0),
        directSlabCount: Number(summary.directSlabCount || 0),
        nearSlabCount: Number(summary.nearSlabCount || 0),
        directRoofCount: Number(summary.directRoofCount || 0),
        nearRoofCount: Number(summary.nearRoofCount || 0),
        directFoundationCount: Number(summary.directFoundationCount || 0),
        nearFoundationCount: Number(summary.nearFoundationCount || 0),
        wallSectionClipQuality: summary.wallSectionClipQuality || "provisional",
        openingSectionClipQuality:
          summary.openingSectionClipQuality || "provisional",
        stairSectionClipQuality:
          summary.stairSectionClipQuality || "provisional",
        slabSectionClipQuality: summary.slabSectionClipQuality || "provisional",
        roofSectionClipQuality: summary.roofSectionClipQuality || "provisional",
        foundationSectionClipQuality:
          summary.foundationSectionClipQuality || "provisional",
      },
    },
  };
}

function compileSectionCuts(projectGeometry = {}, options = {}) {
  const planner = selectSectionCandidates(
    projectGeometry,
    options.sectionOptions || {},
  );
  const candidates = toArray(planner.candidates)
    .map((candidate) => {
      try {
        const evidence = buildSectionEvidence(projectGeometry, candidate);
        const summary = buildSectionEvidenceSummary(evidence);
        return summarizeSectionCandidate(candidate, evidence, summary);
      } catch (error) {
        return summarizeSectionCandidate(
          candidate,
          { blockers: [error.message] },
          { evidenceQuality: "block" },
        );
      }
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.id.localeCompare(right.id);
    });

  const longitudinal =
    candidates.find((candidate) => candidate.sectionType === "longitudinal") ||
    null;
  const transverse =
    candidates.find((candidate) => candidate.sectionType === "transverse") ||
    null;

  return {
    plannerVersion: planner.version || null,
    primaryId: candidates[0]?.id || null,
    byType: {
      longitudinal: longitudinal?.id || null,
      transverse: transverse?.id || null,
    },
    candidates,
    chosenStrategy: planner.chosenStrategy || null,
    rejectedAlternatives: cloneData(planner.rejectedAlternatives || []),
  };
}

function extractMaterialLabels(values = []) {
  return values
    .flatMap((entry) => {
      if (typeof entry === "string") {
        return [entry];
      }
      if (!isPlainObject(entry)) {
        return [];
      }
      return [
        entry.material,
        entry.name,
        entry.type,
        entry.label,
        entry.primary,
      ].filter(Boolean);
    })
    .map((entry) => String(entry).trim())
    .filter(Boolean);
}

function compileClimateStrategy(input = {}, masterDNA = {}, locationData = {}) {
  const climateData = resolveClimateData(input, locationData);
  const environmental = firstObject([
    masterDNA.environmental,
    input.environmental,
  ]);
  const envelopeTargets = environmental.uValues || {};
  return {
    type:
      climateData.type ||
      climateData.zone ||
      climateData.climate_type ||
      "unspecified",
    zone: climateData.zone || climateData.koppen || climateData.type || null,
    thermal: {
      strategy:
        climateData.thermal?.strategy ||
        masterDNA.climateDesign?.thermal?.strategy ||
        null,
      heating_priority: climateData.thermal?.heating_priority || null,
      cooling_priority: climateData.thermal?.cooling_priority || null,
    },
    passive: {
      shading:
        climateData.passive?.shading ||
        masterDNA.climateDesign?.solar?.shading ||
        masterDNA.climateDesign?.shading ||
        null,
      ventilation:
        climateData.passive?.ventilation ||
        masterDNA.climateDesign?.ventilation?.strategy ||
        null,
      daylight:
        climateData.passive?.daylight ||
        masterDNA.climateDesign?.daylight?.strategy ||
        null,
    },
    envelope: {
      wall_u_value: round(envelopeTargets.wall || 0),
      roof_u_value: round(envelopeTargets.roof || 0),
      glazing_u_value: round(envelopeTargets.glazing || 0),
      floor_u_value: round(envelopeTargets.floor || 0),
    },
    orientation_deg: round(
      masterDNA.buildingOrientation ||
        input.buildingOrientation ||
        locationData.optimalOrientation ||
        0,
    ),
    source: {
      climate:
        climateData.type || climateData.zone
          ? "location_or_input"
          : "master_dna",
      environmental: Object.keys(envelopeTargets).length
        ? "master_dna.environmental"
        : null,
    },
  };
}

function compileLocaleStyle(
  styleDNA = {},
  locationData = {},
  projectGeometry = {},
) {
  return {
    name:
      locationData.recommendedStyle ||
      styleDNA.localStyle ||
      styleDNA.localeStyle ||
      styleDNA.vernacularStyle ||
      "unspecified",
    vernacular:
      styleDNA.vernacularStyle ||
      styleDNA.vernacular ||
      locationData.recommendedStyle ||
      null,
    region:
      [locationData.city, locationData.region, locationData.country]
        .filter(Boolean)
        .join(", ") || null,
    roof_language: styleDNA.roof_language || projectGeometry.roof?.type || null,
    facade_language: styleDNA.facade_language || null,
    window_language: styleDNA.window_language || null,
    local_materials: sortStrings(
      extractMaterialLabels([
        ...(locationData.localMaterials || []),
        ...(styleDNA.local_materials || []),
      ]),
    ),
  };
}

function compilePortfolioBlend(input = {}, masterDNA = {}, styleDNA = {}) {
  const styleWeights = firstObject([
    masterDNA.styleWeights,
    styleDNA.styleWeights,
  ]);
  const percentWeight = Number(masterDNA.portfolioBlendPercent);
  const rawPortfolioWeight =
    styleWeights.portfolio ??
    input.portfolioWeight ??
    masterDNA.portfolioWeight ??
    (Number.isFinite(percentWeight) ? percentWeight / 100 : undefined) ??
    styleDNA.portfolioWeight ??
    0;
  const portfolioWeight = clamp(rawPortfolioWeight);
  const localWeight =
    styleWeights.local !== undefined
      ? clamp(styleWeights.local)
      : round(1 - portfolioWeight);

  return {
    localWeight: round(localWeight),
    portfolioWeight: round(portfolioWeight),
    dominantInfluence:
      styleWeights.dominantInfluence ||
      (localWeight >= portfolioWeight ? "local" : "portfolio"),
    localStyle:
      styleWeights.localStyle ||
      styleDNA.localStyle ||
      styleDNA.vernacularStyle ||
      null,
    portfolioStyle:
      styleWeights.portfolioStyle ||
      input.portfolioAnalysis?.dominantStyle ||
      styleDNA.portfolioStyle ||
      null,
  };
}

function compileMaterials(
  input = {},
  styleDNA = {},
  locationData = {},
  facades = {},
) {
  const materialPriority = firstObject([input.materialPriority]);
  const facadeZoneMaterials = facades.list.flatMap((facade) =>
    extractMaterialLabels(facade.materialZones),
  );
  const palette = sortStrings(
    extractMaterialLabels([
      materialPriority.primary,
      materialPriority.secondary,
      ...(styleDNA.materials || []),
      ...(locationData.localMaterials || []),
      ...facadeZoneMaterials,
    ]),
  );

  return {
    primary: materialPriority.primary || palette[0] || null,
    secondary: materialPriority.secondary || palette[1] || null,
    palette,
    facadeZoneMaterials: sortStrings(facadeZoneMaterials),
    roof: {
      primary: styleDNA.roof_material || null,
      secondary: styleDNA.secondary_roof_material || null,
    },
  };
}

function buildValidationSummary({
  footprint,
  levels,
  slabs,
  rooms,
  walls,
  openings,
  roof,
  facades,
  sectionCuts,
} = {}) {
  const warnings = [];
  const blockers = [];

  if (!footprint?.polygon?.length) {
    blockers.push("Compiled project has no resolved building footprint.");
  }
  if (!levels.length) {
    blockers.push("Compiled project has no resolved levels.");
  }
  if (!walls.length) {
    blockers.push("Compiled project has no resolved wall segments.");
  }
  if (!rooms.length) {
    warnings.push("Compiled project has no named room polygons.");
  }
  if (!openings.length) {
    warnings.push("Compiled project has no resolved doors or windows.");
  }
  if (!roof.planes.length) {
    warnings.push("Compiled project has no explicit roof planes.");
  }
  if (facades.list.some((facade) => facade.status === "block")) {
    warnings.push("One or more facade summaries remain blocked.");
  }
  if (!sectionCuts.candidates.length) {
    warnings.push("No deterministic section cuts were compiled.");
  }
  if (
    sectionCuts.candidates.length &&
    sectionCuts.candidates.every(
      (candidate) => candidate.evidence.quality === "block",
    )
  ) {
    warnings.push("All compiled section cuts remain blocked by thin evidence.");
  }

  return {
    valid: blockers.length === 0,
    deterministic: true,
    warnings: sortStrings(warnings),
    blockers: sortStrings(blockers),
    counts: {
      level_count: levels.length,
      slab_count: slabs.length,
      room_count: rooms.length,
      wall_count: walls.length,
      opening_count: openings.length,
      roof_plane_count: roof.planes.length,
      facade_count: facades.list.length,
      section_candidate_count: sectionCuts.candidates.length,
    },
  };
}

function buildGeometryHashPayload(compiledProject = {}) {
  const levelNumbers = new Map(
    toArray(compiledProject.levels).map((level) => [
      level.id,
      level.level_number,
    ]),
  );

  return {
    footprint: {
      polygon: compiledProject.footprint?.polygon || [],
      bbox: compiledProject.footprint?.bbox || null,
      area_m2: compiledProject.footprint?.area_m2 || 0,
    },
    envelope: {
      bbox: compiledProject.envelope?.bbox || null,
      width_m: compiledProject.envelope?.width_m || 0,
      depth_m: compiledProject.envelope?.depth_m || 0,
      height_m: compiledProject.envelope?.height_m || 0,
      level_count: compiledProject.envelope?.level_count || 0,
    },
    levels: toArray(compiledProject.levels).map((level) => ({
      level_number: level.level_number,
      elevation_m: level.elevation_m,
      height_m: level.height_m,
      footprint: level.footprint,
    })),
    slabs: toArray(compiledProject.slabs).map((slab) => ({
      level_number: levelNumbers.get(slab.levelId) ?? null,
      polygon: slab.polygon,
      thickness_m: slab.thickness_m,
      elevation_m: slab.elevation_m,
    })),
    rooms: toArray(compiledProject.rooms).map((room) => ({
      level_number: levelNumbers.get(room.levelId) ?? null,
      name: room.name,
      type: room.type,
      zone: room.zone,
      polygon: room.polygon,
      actual_area_m2: room.actual_area_m2,
      target_area_m2: room.target_area_m2,
      wet_zone: room.wet_zone,
    })),
    walls: toArray(compiledProject.walls).map((wall) => ({
      level_number: levelNumbers.get(wall.levelId) ?? null,
      kind: wall.kind,
      exterior: wall.exterior,
      side: wall.side,
      start: wall.start,
      end: wall.end,
      thickness_m: wall.thickness_m,
      length_m: wall.length_m,
    })),
    openings: toArray(compiledProject.openings).map((opening) => ({
      level_number: levelNumbers.get(opening.levelId) ?? null,
      type: opening.type,
      position_m: opening.position_m,
      width_m: opening.width_m,
      sill_height_m: opening.sill_height_m,
      head_height_m: opening.head_height_m,
      height_m: opening.height_m,
    })),
    stairs: toArray(compiledProject.stairs).map((stair) => ({
      level_number: levelNumbers.get(stair.levelId) ?? null,
      type: stair.type,
      polygon: stair.polygon,
      width_m: stair.width_m,
      depth_m: stair.depth_m,
    })),
    roof: {
      type: compiledProject.roof?.type || "unknown",
      support_mode: compiledProject.roof?.support_mode || "missing",
      planes: toArray(compiledProject.roof?.planes).map((entry) => ({
        primitive_family: entry.primitive_family,
        polygon: entry.polygon,
        bbox: entry.bbox,
        slope_deg: entry.slope_deg,
        eave_depth_m: entry.eave_depth_m,
      })),
      ridges: toArray(compiledProject.roof?.ridges).map((entry) => ({
        start: entry.start,
        end: entry.end,
        ridge_height_m: entry.ridge_height_m,
      })),
      eaves: toArray(compiledProject.roof?.eaves).map((entry) => ({
        start: entry.start,
        end: entry.end,
        side: entry.metadata?.side || null,
      })),
      hips: toArray(compiledProject.roof?.hips).map((entry) => ({
        start: entry.start,
        end: entry.end,
      })),
      valleys: toArray(compiledProject.roof?.valleys).map((entry) => ({
        start: entry.start,
        end: entry.end,
      })),
      parapets: toArray(compiledProject.roof?.parapets).map((entry) => ({
        polygon: entry.polygon,
        bbox: entry.bbox,
      })),
      dormers: toArray(compiledProject.roof?.dormers).map((entry) => ({
        polygon: entry.polygon,
        bbox: entry.bbox,
      })),
    },
  };
}

export function compileProject(input = {}, options = {}) {
  const sourcePath = resolveSourcePathLabel(input);
  const masterDNA = resolveMasterDNA(input);
  const styleDNA = resolveStyleDNA(input);
  const locationData = resolveLocationData(input);
  const geometrySeed = cloneData(resolveGeometrySeed(input));

  geometrySeed.metadata = deepMerge(geometrySeed.metadata || {}, {
    style_dna: styleDNA,
  });
  if (locationData?.climate && !geometrySeed.site?.climate) {
    geometrySeed.site = deepMerge(geometrySeed.site || {}, {
      climate: locationData.climate,
    });
  }

  const projectGeometry = coerceToCanonicalProjectGeometry(geometrySeed);
  const levelProfiles = buildLevelProfiles(projectGeometry);
  const compiledRooms = compileRooms(projectGeometry, levelProfiles);
  const compiledWalls = compileWalls(
    projectGeometry,
    levelProfiles,
    compiledRooms.roomIdMap,
  );
  const openings = compileOpenings(
    projectGeometry,
    levelProfiles,
    compiledWalls.wallIdMap,
    compiledRooms.roomIdMap,
  );
  const stairs = compileStairs(projectGeometry, levelProfiles);
  const slabs = compileSlabs(projectGeometry, levelProfiles);

  const levels = levelProfiles
    .map((level) => {
      const footprintPolygon = resolveLevelFootprint(level, projectGeometry);
      const bbox = buildBoundingBoxFromPolygon(footprintPolygon);
      return {
        id: contentId("level", {
          level_number: level.level_number,
          footprint: footprintPolygon,
          height_m: level.height_m,
        }),
        sourceId: level.sourceId,
        name: level.name,
        level_number: level.level_number,
        elevation_m: level.elevation_m,
        height_m: level.height_m,
        bottom_m: level.bottom_m,
        top_m: level.top_m,
        footprint: {
          polygon: footprintPolygon,
          bbox,
          area_m2: round(computePolygonArea(footprintPolygon)),
        },
        roomIds: compiledRooms.items
          .filter(
            (room) =>
              room.levelId === (level.sourceId || level.id) ||
              room.levelId ===
                contentId("level", {
                  level_number: level.level_number,
                  footprint: footprintPolygon,
                  height_m: level.height_m,
                }),
          )
          .map((room) => room.id)
          .sort(),
        wallIds: compiledWalls.items
          .filter(
            (wall) =>
              wall.levelId === (level.sourceId || level.id) ||
              wall.levelId ===
                contentId("level", {
                  level_number: level.level_number,
                  footprint: footprintPolygon,
                  height_m: level.height_m,
                }),
          )
          .map((wall) => wall.id)
          .sort(),
        openingIds: openings
          .filter((opening) => opening.levelId === (level.sourceId || level.id))
          .map((opening) => opening.id)
          .sort(),
        stairIds: stairs
          .filter((stair) => stair.levelId === (level.sourceId || level.id))
          .map((stair) => stair.id)
          .sort(),
        slabIds: slabs
          .filter((slab) => slab.levelId === (level.sourceId || level.id))
          .map((slab) => slab.id)
          .sort(),
      };
    })
    .sort((left, right) => left.level_number - right.level_number);

  const levelIdBySourceId = new Map(
    levels
      .filter((level) => level.sourceId)
      .map((level) => [level.sourceId, level.id]),
  );

  const relinkedRooms = compiledRooms.items
    .map((room) => ({
      ...room,
      levelId: levelIdBySourceId.get(room.levelId) || room.levelId,
    }))
    .sort(compareById);
  const relinkedWalls = compiledWalls.items
    .map((wall) => ({
      ...wall,
      levelId: levelIdBySourceId.get(wall.levelId) || wall.levelId,
    }))
    .sort(compareById);
  const relinkedOpenings = openings
    .map((opening) => ({
      ...opening,
      levelId: levelIdBySourceId.get(opening.levelId) || opening.levelId,
    }))
    .sort(compareById);
  const relinkedStairs = stairs
    .map((stair) => ({
      ...stair,
      levelId: levelIdBySourceId.get(stair.levelId) || stair.levelId,
    }))
    .sort(compareById);
  const relinkedSlabs = slabs
    .map((slab) => ({
      ...slab,
      levelId: levelIdBySourceId.get(slab.levelId) || slab.levelId,
    }))
    .sort(compareById);

  const primaryFootprint = levels[0]?.footprint || {
    polygon: resolveLevelFootprint(levelProfiles[0] || {}, projectGeometry),
    bbox: buildBoundingBoxFromPolygon(
      resolveLevelFootprint(levelProfiles[0] || {}, projectGeometry),
    ),
    area_m2: round(
      computePolygonArea(
        resolveLevelFootprint(levelProfiles[0] || {}, projectGeometry),
      ),
    ),
  };
  const totalHeight = levels.length
    ? round(Math.max(...levels.map((level) => level.top_m)))
    : 0;
  const envelope = {
    bbox: primaryFootprint.bbox,
    width_m: round(primaryFootprint.bbox.width || 0),
    depth_m: round(primaryFootprint.bbox.height || 0),
    height_m: totalHeight,
    level_count: levels.length,
    min_z_m: 0,
    max_z_m: totalHeight,
  };

  const roof = compileRoof(projectGeometry, styleDNA);
  const facades = compileFacades(projectGeometry, styleDNA, options);
  const sectionCuts = compileSectionCuts(projectGeometry, options);
  const climateStrategy = compileClimateStrategy(
    input,
    masterDNA,
    locationData,
  );
  const localeStyle = compileLocaleStyle(
    styleDNA,
    locationData,
    projectGeometry,
  );
  const portfolioBlend = compilePortfolioBlend(input, masterDNA, styleDNA);
  const materials = compileMaterials(input, styleDNA, locationData, facades);

  const compiledProject = {
    schema_version: COMPILED_PROJECT_SCHEMA_VERSION,
    metadata: {
      source: "compiled_project",
      project_id:
        projectGeometry.project_id || input.project_id || "compiled-project",
      deterministic: true,
      canonical_geometry_schema: projectGeometry.schema_version || null,
      geometry_source_path: sourcePath,
      compiler: "compiledProjectCompiler",
    },
    geometryHash: "",
    site: cloneData(projectGeometry.site || {}),
    climateStrategy,
    localeStyle,
    portfolioBlend,
    footprint: primaryFootprint,
    envelope,
    levels,
    slabs: relinkedSlabs,
    rooms: relinkedRooms,
    walls: relinkedWalls,
    openings: relinkedOpenings,
    stairs: relinkedStairs,
    roof,
    facades,
    sectionCuts,
    materials,
    validation: {},
    provenance: {
      geometry: {
        source_path: sourcePath,
        schema_version: projectGeometry.schema_version || null,
        project_id: projectGeometry.project_id || null,
      },
      style: {
        has_style_dna: Object.keys(styleDNA).length > 0,
      },
      sections: {
        planner: "sectionCutPlanner",
        evidence: "sectionEvidenceService",
      },
      facades: {
        grammar: "facadeGrammarEngine",
        extractor: "sideFacadeExtractor",
      },
    },
  };

  compiledProject.geometryHash = computeCDSHashSync(
    buildGeometryHashPayload(compiledProject),
  );
  compiledProject.renderInputs = ensureCompiledProjectRenderInputs(
    compiledProject,
    {
      geometryHash: compiledProject.geometryHash,
    },
  );
  compiledProject.artifacts = {
    controlRenders: Object.fromEntries(
      Object.entries(compiledProject.renderInputs || {}).map(
        ([panelType, entry]) => [
          panelType,
          {
            sourceType: entry.sourceType || "compiled_render_input",
            svgHash: entry.svgHash || null,
            width: entry.width || null,
            height: entry.height || null,
          },
        ],
      ),
    ),
    modelGlb: null,
  };
  compiledProject.validation = buildValidationSummary({
    footprint: compiledProject.footprint,
    levels: compiledProject.levels,
    slabs: compiledProject.slabs,
    rooms: compiledProject.rooms,
    walls: compiledProject.walls,
    openings: compiledProject.openings,
    roof: compiledProject.roof,
    facades: compiledProject.facades,
    sectionCuts: compiledProject.sectionCuts,
  });

  return compiledProject;
}

export default {
  COMPILED_PROJECT_SCHEMA_VERSION,
  compileProject,
};
