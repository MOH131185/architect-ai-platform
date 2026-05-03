/**
 * Enhanced Technical Drawing Adapter
 *
 * Bridge layer that connects the panelGenerationService to the enhanced SVG generators.
 * This adapter:
 * 1. Takes masterDNA (same interface as technicalDrawingGenerator.js)
 * 2. Creates geometry objects with floor plan data
 * 3. Calls enhanced generators for professional output
 *
 * Enhanced generators provide:
 * - Furniture symbols (beds, sofas, toilets, etc.)
 * - Door swings with 90° arcs
 * - Wall hatching (poche)
 * - Dimension lines
 * - Material patterns in elevations
 * - Structural details in sections
 *
 * @module enhancedTechnicalDrawingAdapter
 */

import { isFeatureEnabled } from "../../config/featureFlags.js";
import { embedFontInSVGSync } from "../../utils/svgFontEmbedder.js";
import logger from "../core/logger.js";
import { coerceToCanonicalProjectGeometry } from "../cad/geometryFactory.js";
import { CANONICAL_PROJECT_GEOMETRY_VERSION } from "../cad/projectGeometrySchema.js";
import { computeCDSHashSync } from "../validation/cdsHash.js";
import { buildFacadeGrammar } from "../facade/facadeGrammarEngine.js";
import { buildPlanGraphic } from "../drawing/planGraphicsService.js";
import { buildElevationGraphic } from "../drawing/elevationGraphicsService.js";
import { buildSectionGraphic } from "../drawing/sectionGraphicsService.js";
import {
  generateFromDNA as generateElevationFromDNA,
  MATERIAL_PATTERNS,
} from "../svg/ArchitecturalElevationGenerator.js";
import ArchitecturalFloorPlanGenerator, {
  FURNITURE_SYMBOLS,
  WALL_PATTERNS,
} from "../svg/ArchitecturalFloorPlanGenerator.js";

// Elevation and Section generators export functions directly (not classes)

import {
  generateFromDNA as generateSectionFromDNA,
  HATCH_PATTERNS,
} from "../svg/ArchitecturalSectionGenerator.js";

/**
 * Derive a facade grammar from masterDNA so the active elevation generator can
 * consume feature frames, balcony placeholders and material zones.  This is
 * intentionally defensive: if grammar construction fails we log and return
 * null so the generator falls back to its previous single-colour-panel path.
 */
function deriveFacadeGrammarForElevation(masterDNA) {
  if (!isFeatureEnabled("useFacadeGrammarElevation")) {
    return null;
  }
  const projectGeometry =
    masterDNA?.projectGeometry ||
    masterDNA?.canonicalGeometry ||
    masterDNA?.geometry ||
    {};
  const styleDNA =
    masterDNA?.styleDNA ||
    masterDNA?.style_dna ||
    masterDNA?.style ||
    masterDNA?.style_blend ||
    {};
  try {
    const grammar = buildFacadeGrammar(projectGeometry, styleDNA, {});
    if (!grammar || !Array.isArray(grammar.orientations)) {
      return null;
    }
    return grammar;
  } catch (error) {
    logger.warn(
      `[EnhancedAdapter] Facade grammar derivation failed: ${error.message}`,
    );
    return null;
  }
}

/**
 * Convert SVG string to data URL format
 * This matches the format expected by CleanPanelOrchestrator
 */
function svgToDataUrl(svg) {
  if (!svg) {
    return null;
  }
  try {
    // Use base64 encoding for reliable cross-browser support
    const encoded = btoa(unescape(encodeURIComponent(svg)));
    return `data:image/svg+xml;base64,${encoded}`;
  } catch (error) {
    logger.error("[EnhancedAdapter] Failed to encode SVG to data URL:", error);
    return null;
  }
}

/**
 * Default authority stamping for the canonical-geometry path. The compose
 * gate at api/a1/compose.js enforces these exact strings, so changes here
 * must stay in lock-step with composeRuntime.findPanelsWithDisallowedTechnicalAuthority.
 */
const CANONICAL_AUTHORITY_DEFAULTS = Object.freeze({
  authorityUsed: "compiled_project_canonical_pack",
  authoritySource: "compiled_project",
  panelAuthorityReason:
    "deterministic projection from compiled canonical geometry",
  generatorUsed: "enhancedTechnicalDrawingAdapter",
  sourceType: "deterministic_svg",
});

/**
 * Authority stamping for the enhanced-only fallback path (no canonical
 * geometry available). The compose gate will reject these; that is the
 * intended behaviour — final A1 must come from the canonical pack.
 */
const ENHANCED_FALLBACK_AUTHORITY = Object.freeze({
  authorityUsed: "enhanced_geometry_adapter",
  authoritySource: "masterDNA",
  panelAuthorityReason:
    "canonical geometry unavailable, rendered from enhanced geometry adapter",
  generatorUsed: "enhancedTechnicalDrawingAdapter",
  sourceType: "deterministic_svg_fallback",
});

/**
 * Compute a deterministic hash from a canonical project geometry object.
 * Uses computeCDSHashSync (the same hasher that CanonicalGeometryPackService
 * uses) so panels stamped here are comparable with panels stamped by the
 * canonical pack builder.
 */
function computeGeometryHashFromCanonical(canonicalGeometry) {
  if (!canonicalGeometry) {
    return null;
  }
  try {
    return computeCDSHashSync({
      schema_version:
        canonicalGeometry.schema_version || CANONICAL_PROJECT_GEOMETRY_VERSION,
      project_id: canonicalGeometry.project_id || null,
      levels: canonicalGeometry.levels || [],
      rooms: canonicalGeometry.rooms || [],
      walls: canonicalGeometry.walls || [],
      doors: canonicalGeometry.doors || [],
      windows: canonicalGeometry.windows || [],
      footprints: canonicalGeometry.footprints || [],
      roof_primitives: canonicalGeometry.roof_primitives || [],
      foundations: canonicalGeometry.foundations || [],
    });
  } catch (error) {
    logger.warn(
      `[EnhancedAdapter] Geometry hash computation failed: ${error.message}`,
    );
    return null;
  }
}

/**
 * Wrap SVG result in the format expected by CleanPanelOrchestrator and the
 * compose authority gate. Stamps geometryHash, svgHash, and authority fields
 * on BOTH the top-level result and result.metadata so
 * composeRuntime.readPanelAuthorityMetadata picks them up regardless of where
 * downstream code looks.
 *
 * @param {string} svg
 * @param {Object} metadata - drawing context. May include geometryHash,
 *   compiledProjectSchemaVersion, authorityUsed, authoritySource,
 *   panelAuthorityReason, generatorUsed, sourceType. When omitted, the
 *   canonical-pack defaults are used.
 */
function wrapSVGResult(svg, metadata = {}) {
  if (!svg) {
    return null;
  }
  const normalizedSvg = embedFontInSVGSync(svg);
  const dataUrl = svgToDataUrl(normalizedSvg);
  if (!dataUrl) {
    return null;
  }

  const isFallback =
    metadata.authorityUsed === ENHANCED_FALLBACK_AUTHORITY.authorityUsed;
  const defaults = isFallback
    ? ENHANCED_FALLBACK_AUTHORITY
    : CANONICAL_AUTHORITY_DEFAULTS;

  const authority = {
    geometryHash: metadata.geometryHash || null,
    compiledProjectSchemaVersion:
      metadata.compiledProjectSchemaVersion ||
      CANONICAL_PROJECT_GEOMETRY_VERSION,
    authorityUsed: metadata.authorityUsed || defaults.authorityUsed,
    authoritySource: metadata.authoritySource || defaults.authoritySource,
    panelAuthorityReason:
      metadata.panelAuthorityReason || defaults.panelAuthorityReason,
    generatorUsed: metadata.generatorUsed || defaults.generatorUsed,
    sourceType: metadata.sourceType || defaults.sourceType,
    svgHash: computeCDSHashSync(normalizedSvg),
  };

  return {
    dataUrl,
    svg: normalizedSvg,
    ...authority,
    metadata: {
      ...metadata,
      ...authority,
      generator: "enhanced",
      timestamp: Date.now(),
    },
  };
}

function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizePoint(point = {}, fallback = {}) {
  return {
    x: toFiniteNumber(point?.x, toFiniteNumber(fallback?.x, 0)),
    y: toFiniteNumber(point?.y, toFiniteNumber(fallback?.y, 0)),
  };
}

function normalizePolygon(points = []) {
  if (!Array.isArray(points) || points.length < 3) {
    return [];
  }
  return points.map((point) => normalizePoint(point));
}

function polygonFromBounds(bounds = {}, fallbackWidth = 1, fallbackHeight = 1) {
  const minX = toFiniteNumber(
    bounds.min_x ?? bounds.minX ?? bounds.x,
    toFiniteNumber(bounds.x, 0),
  );
  const minY = toFiniteNumber(
    bounds.min_y ?? bounds.minY ?? bounds.y,
    toFiniteNumber(bounds.y, 0),
  );
  const maxX = toFiniteNumber(
    bounds.max_x ?? bounds.maxX,
    minX + toFiniteNumber(bounds.width, fallbackWidth),
  );
  const maxY = toFiniteNumber(
    bounds.max_y ?? bounds.maxY,
    minY + toFiniteNumber(bounds.height, fallbackHeight),
  );
  const width = Math.max(
    maxX - minX,
    toFiniteNumber(bounds.width, fallbackWidth),
  );
  const height = Math.max(
    maxY - minY,
    toFiniteNumber(bounds.height, fallbackHeight),
  );
  return [
    { x: minX, y: minY },
    { x: minX + Math.max(width, 1), y: minY },
    { x: minX + Math.max(width, 1), y: minY + Math.max(height, 1) },
    { x: minX, y: minY + Math.max(height, 1) },
  ];
}

function computeBBoxFromPoints(points = []) {
  if (!Array.isArray(points) || points.length === 0) {
    return null;
  }
  const xs = points.map((point) => Number(point.x)).filter(Number.isFinite);
  const ys = points.map((point) => Number(point.y)).filter(Number.isFinite);
  if (!xs.length || !ys.length) {
    return null;
  }
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    min_x: minX,
    min_y: minY,
    max_x: maxX,
    max_y: maxY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
  };
}

function normalizeRoomPolygon(room = {}) {
  const polygon = normalizePolygon(room.polygon);
  if (polygon.length >= 3) {
    return polygon;
  }
  if (room.boundingBox || room.bbox) {
    return polygonFromBounds(
      room.boundingBox || room.bbox,
      room.width ?? room.length ?? 4,
      room.length ?? room.height ?? 3,
    );
  }
  return polygonFromBounds(
    {
      x: room.x ?? 0,
      y: room.y ?? 0,
      width: room.width ?? 4,
      height: room.length ?? room.height ?? 3,
    },
    room.width ?? 4,
    room.length ?? room.height ?? 3,
  );
}

function inferFootprintPolygon(floor = {}, dimensions = {}) {
  const explicitPolygon = [
    normalizePolygon(floor.polygon),
    normalizePolygon(floor.footprint?.polygon),
    normalizePolygon(floor.footprint?.vertices),
  ].find((polygon) => polygon.length >= 3);
  if (Array.isArray(explicitPolygon) && explicitPolygon.length >= 3) {
    return explicitPolygon;
  }

  const roomPoints = (floor.rooms || []).flatMap((room) =>
    normalizeRoomPolygon(room),
  );
  const wallPoints = (floor.walls || []).flatMap((wall) => {
    const points = [];
    if (wall.start) points.push(normalizePoint(wall.start));
    if (wall.end) points.push(normalizePoint(wall.end));
    return points;
  });
  const bbox = computeBBoxFromPoints([...roomPoints, ...wallPoints]);
  if (bbox) {
    return polygonFromBounds(bbox, bbox.width || 1, bbox.height || 1);
  }
  return polygonFromBounds(
    {
      x: 0,
      y: 0,
      width: dimensions.width || dimensions.length || 12,
      height: dimensions.depth || dimensions.width || 10,
    },
    dimensions.width || dimensions.length || 12,
    dimensions.depth || dimensions.width || 10,
  );
}

function inferWallSide(wall = {}, footprintPolygon = []) {
  const bbox = computeBBoxFromPoints(footprintPolygon);
  if (!bbox || !wall.start || !wall.end) {
    return null;
  }
  const start = normalizePoint(wall.start);
  const end = normalizePoint(wall.end);
  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;
  const horizontal = Math.abs(start.y - end.y) <= Math.abs(start.x - end.x);
  const epsilon = 0.25;
  if (horizontal) {
    if (Math.abs(midY - bbox.min_y) <= epsilon) return "north";
    if (Math.abs(midY - bbox.max_y) <= epsilon) return "south";
  } else {
    if (Math.abs(midX - bbox.max_x) <= epsilon) return "east";
    if (Math.abs(midX - bbox.min_x) <= epsilon) return "west";
  }
  return null;
}

function midpoint(start = {}, end = {}) {
  const startPoint = normalizePoint(start);
  const endPoint = normalizePoint(end);
  return {
    x: Number(((startPoint.x + endPoint.x) / 2).toFixed(3)),
    y: Number(((startPoint.y + endPoint.y) / 2).toFixed(3)),
  };
}

function normalizeLevelName(levelIndex = 0) {
  if (levelIndex === 0) return "Ground Floor";
  if (levelIndex === 1) return "First Floor";
  if (levelIndex === 2) return "Second Floor";
  return `Level ${levelIndex}`;
}

function extractStyleDNA(masterDNA = {}) {
  return (
    masterDNA?.styleDNA ||
    masterDNA?.style_dna ||
    masterDNA?.style ||
    masterDNA?.style_blend ||
    masterDNA ||
    {}
  );
}

function buildCanonicalTechnicalGeometry(masterDNA = {}, projectContext = {}) {
  const explicitGeometry =
    masterDNA?.projectGeometry ||
    masterDNA?.canonicalGeometry ||
    (masterDNA?.geometry?.levels?.length ? masterDNA.geometry : null);
  if (
    explicitGeometry &&
    (explicitGeometry.schema_version ||
      explicitGeometry.levels?.length ||
      explicitGeometry.rooms?.length)
  ) {
    return coerceToCanonicalProjectGeometry(explicitGeometry);
  }

  const adapter = new GeometryAdapter(masterDNA);
  const populatedFloors = Array.isArray(adapter.populatedGeometry?.floors)
    ? adapter.populatedGeometry.floors
    : Array.isArray(masterDNA?.floors)
      ? masterDNA.floors
      : [];
  if (!populatedFloors.length) {
    return null;
  }

  const styleDNA = extractStyleDNA(masterDNA);
  const facadeGrammar = deriveFacadeGrammarForElevation({
    ...masterDNA,
    styleDNA,
  });
  const floorIndices = Array.from(
    new Set([
      ...populatedFloors.map((floor) => Number(floor?.level ?? 0)),
      ...Object.keys(adapter.rooms || {}).map((floor) => Number(floor)),
      ...Object.keys(adapter.walls || {}).map((floor) => Number(floor)),
    ]),
  )
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const resolvedFloorCount = Math.max(
    floorIndices.length,
    toFiniteNumber(adapter.dimensions?.floors, floorIndices.length || 1),
    1,
  );
  const floorHeights = Array.from({ length: resolvedFloorCount }, (_, index) =>
    toFiniteNumber(adapter.dimensions?.floorHeights?.[index], 3),
  );

  const levels = Array.from({ length: resolvedFloorCount }, (_, levelIndex) => {
    const floor =
      populatedFloors.find(
        (entry) => Number(entry?.level ?? 0) === Number(levelIndex),
      ) || {};
    const footprintPolygon = inferFootprintPolygon(floor, adapter.dimensions);
    const footprintBBox = computeBBoxFromPoints(footprintPolygon);
    const wallRecords = (adapter.walls?.[levelIndex] || []).map((wall) => {
      const side = inferWallSide(wall, footprintPolygon);
      const start = normalizePoint(wall.start);
      const end = normalizePoint(wall.end);
      const exterior =
        wall.exterior === true ||
        String(wall.type || wall.kind || "").toLowerCase() !== "interior";
      return {
        id: wall.id || `wall-${levelIndex}-${start.x}-${start.y}`,
        start,
        end,
        thickness_m: toFiniteNumber(wall.thickness ?? wall.thickness_m, 0.3),
        exterior,
        kind: exterior ? "exterior" : "interior",
        side,
        room_ids: Array.isArray(wall.room_ids)
          ? wall.room_ids
          : Array.isArray(wall.adjacentRooms)
            ? wall.adjacentRooms
            : [],
        source: "enhanced-technical-adapter",
      };
    });
    const roomRecords = (adapter.rooms?.[levelIndex] || []).map(
      (room, index) => {
        const polygon = normalizeRoomPolygon(room);
        const roomBBox = computeBBoxFromPoints(polygon);
        return {
          id: room.id || `room-${levelIndex}-${index}`,
          name: room.name || `Room ${index + 1}`,
          type: room.type || room.program_type || "room",
          x: toFiniteNumber(room.x, roomBBox?.min_x ?? 0),
          y: toFiniteNumber(room.y, roomBBox?.min_y ?? 0),
          width:
            toFiniteNumber(room.width, roomBBox?.width ?? 0) ||
            toFiniteNumber(room.length, 4),
          height:
            toFiniteNumber(room.height, roomBBox?.height ?? 0) ||
            toFiniteNumber(room.length, 3),
          polygon,
          actual_area: toFiniteNumber(
            room.area ?? room.actual_area ?? room.actual_area_m2,
            (roomBBox?.width || 0) * (roomBBox?.height || 0),
          ),
          source: "enhanced-technical-adapter",
        };
      },
    );
    const openings = adapter.getFloorOpenings(levelIndex);
    const doorRecords = [];
    const windowRecords = [];
    openings.forEach((opening, index) => {
      const wallId = opening.wall_id || opening.wallId || null;
      const wall = wallRecords.find((entry) => entry.id === wallId) || null;
      const openingType = String(
        opening.type || opening.kind || opening.category || "window",
      ).toLowerCase();
      const normalizedOpening = {
        id:
          opening.id ||
          `${openingType}-${levelIndex}-${wallId || "free"}-${index}`,
        wall_id: wallId,
        position:
          opening.position_m ||
          opening.position ||
          opening.center ||
          opening.centroid ||
          (opening.wallStart && opening.wallEnd
            ? midpoint(opening.wallStart, opening.wallEnd)
            : wall
              ? midpoint(wall.start, wall.end)
              : { x: footprintBBox?.min_x ?? 0, y: footprintBBox?.min_y ?? 0 }),
        width_m: toFiniteNumber(
          opening.width_m ?? opening.width,
          openingType === "door" ? 1 : 1.2,
        ),
        height_m: toFiniteNumber(
          opening.height_m ?? opening.height,
          openingType === "door" ? 2.1 : 1.4,
        ),
        sill_height_m: toFiniteNumber(
          opening.sill_height_m ?? opening.sillHeight,
          openingType === "door" ? 0 : 0.9,
        ),
        room_ids: Array.isArray(opening.room_ids) ? opening.room_ids : [],
        source: "enhanced-technical-adapter",
      };
      if (openingType === "door") {
        doorRecords.push(normalizedOpening);
      } else {
        windowRecords.push(normalizedOpening);
      }
    });
    const stairRecords = (floor.stairs || []).map((stair, index) => {
      const polygon = normalizePolygon(stair.polygon);
      return {
        id: stair.id || `stair-${levelIndex}-${index}`,
        type: stair.type || "straight_run",
        polygon:
          polygon.length >= 3
            ? polygon
            : polygonFromBounds(
                stair.boundingBox || stair.bbox || stair,
                stair.width ?? stair.width_m ?? 2.4,
                stair.depth ?? stair.height ?? stair.depth_m ?? 4.2,
              ),
        width_m: toFiniteNumber(stair.width_m ?? stair.width, 2.4),
        depth_m: toFiniteNumber(
          stair.depth_m ?? stair.depth ?? stair.height,
          4.2,
        ),
        connects_to_level:
          stair.connects_to_level ??
          stair.connectsToLevel ??
          stair.toLevel ??
          levelIndex + 1,
        source: "enhanced-technical-adapter",
      };
    });

    return {
      id: floor.id || `level-${levelIndex}`,
      name: floor.name || normalizeLevelName(levelIndex),
      level_number: levelIndex,
      height_m: floorHeights[levelIndex] || 3,
      polygon: footprintPolygon,
      footprint: footprintPolygon,
      rooms: roomRecords,
      walls: wallRecords,
      doors: doorRecords,
      windows: windowRecords,
      stairs: stairRecords,
    };
  });

  const sitePolygon = normalizePolygon(
    projectContext?.sitePolygon ||
      masterDNA?.sitePolygon ||
      masterDNA?.site?.boundary_polygon ||
      [],
  );
  const boundaryPolygon =
    sitePolygon.length >= 3
      ? sitePolygon
      : inferFootprintPolygon(
          { polygon: levels[0]?.footprint || [] },
          {
            width: adapter.dimensions.width || adapter.dimensions.length || 12,
            depth: adapter.dimensions.depth || adapter.dimensions.width || 10,
          },
        );
  const roofType =
    masterDNA?.roof?.type ||
    masterDNA?.roof?.roof_language ||
    masterDNA?.geometry?.roofType ||
    masterDNA?.geometry?.roof?.type ||
    "gable";

  return coerceToCanonicalProjectGeometry({
    project_id:
      masterDNA?.designId ||
      masterDNA?.projectId ||
      masterDNA?.id ||
      "enhanced-technical-drawing",
    site: {
      boundary_polygon: boundaryPolygon,
      buildable_polygon: boundaryPolygon,
    },
    levels,
    roof: {
      type: roofType,
      roof_language: masterDNA?.roof?.roof_language || roofType,
    },
    metadata: {
      style_dna: styleDNA,
      facade_grammar: facadeGrammar,
      source: "enhanced-technical-adapter",
    },
  });
}

function tryBuildCanonicalPlanGraphic(
  masterDNA = {},
  floorIndex = 0,
  context = {},
) {
  const canonicalGeometry = buildCanonicalTechnicalGeometry(masterDNA, context);
  if (!canonicalGeometry?.levels?.length) {
    return null;
  }
  const level =
    canonicalGeometry.levels.find(
      (entry) => Number(entry.level_number) === Number(floorIndex),
    ) || canonicalGeometry.levels[floorIndex];
  if (!level) {
    return null;
  }
  const drawing = buildPlanGraphic(canonicalGeometry, {
    levelId: level.id,
    width: context.targetWidth,
    height: context.targetHeight,
  });
  if (!drawing?.svg) {
    return drawing;
  }
  return {
    ...drawing,
    geometryHash: computeGeometryHashFromCanonical(canonicalGeometry),
    compiledProjectSchemaVersion:
      canonicalGeometry.schema_version || CANONICAL_PROJECT_GEOMETRY_VERSION,
  };
}

function tryBuildCanonicalElevationGraphic(
  masterDNA = {},
  orientation = "south",
  context = {},
) {
  const canonicalGeometry = buildCanonicalTechnicalGeometry(masterDNA, context);
  if (!canonicalGeometry?.levels?.length) {
    return null;
  }
  const drawing = buildElevationGraphic(
    canonicalGeometry,
    extractStyleDNA(masterDNA),
    {
      orientation,
      width: context.targetWidth,
      height: context.targetHeight,
      facadeGrammar:
        canonicalGeometry.metadata?.facade_grammar ||
        deriveFacadeGrammarForElevation(masterDNA),
    },
  );
  if (!drawing?.svg) {
    return drawing;
  }
  return {
    ...drawing,
    geometryHash: computeGeometryHashFromCanonical(canonicalGeometry),
    compiledProjectSchemaVersion:
      canonicalGeometry.schema_version || CANONICAL_PROJECT_GEOMETRY_VERSION,
  };
}

function tryBuildCanonicalSectionGraphic(
  masterDNA = {},
  sectionType = "longitudinal",
  context = {},
) {
  const canonicalGeometry = buildCanonicalTechnicalGeometry(masterDNA, context);
  if (!canonicalGeometry?.levels?.length) {
    return null;
  }
  const drawing = buildSectionGraphic(
    canonicalGeometry,
    extractStyleDNA(masterDNA),
    {
      sectionType,
      width: context.targetWidth,
      height: context.targetHeight,
    },
  );
  if (!drawing?.svg) {
    return drawing;
  }
  return {
    ...drawing,
    geometryHash: computeGeometryHashFromCanonical(canonicalGeometry),
    compiledProjectSchemaVersion:
      canonicalGeometry.schema_version || CANONICAL_PROJECT_GEOMETRY_VERSION,
  };
}

/**
 * GeometryAdapter - Creates geometry-like objects from DNA for enhanced generators
 * This bridges the gap between DNA format and enhanced generator requirements
 */
class GeometryAdapter {
  constructor(masterDNA) {
    this.dna = masterDNA;
    // CRITICAL: Extract populatedGeometry which has room polygons, wall coordinates, opening positions
    // Check multiple sources:
    // 1. masterDNA.populatedGeometry (direct)
    // 2. masterDNA.geometryDNA (contains floors from spread populatedGeometry)
    // 3. masterDNA.geometry (legacy location)
    this.populatedGeometry = this.extractPopulatedGeometry(masterDNA);
    this.dimensions = this.extractDimensions();
    this.rooms = this.extractRooms();
    this.walls = this.extractWalls(); // NEW: Extract wall geometry
    this.materials = this.extractMaterials();
    this.openings = this.extractOpenings();

    // Debug logging to verify geometry data flow
    if (this.populatedGeometry?.floors?.length > 0) {
      const totalRooms = this.populatedGeometry.floors.reduce(
        (sum, f) => sum + (f.rooms?.length || 0),
        0,
      );
      const totalWalls = this.populatedGeometry.floors.reduce(
        (sum, f) => sum + (f.walls?.length || 0),
        0,
      );
      logger.info(
        `[GeometryAdapter] Using populatedGeometry: ${this.populatedGeometry.floors.length} floors, ${totalRooms} rooms, ${totalWalls} walls`,
      );
    } else {
      logger.warn(
        "[GeometryAdapter] No populatedGeometry found, falling back to DNA rooms",
      );
    }
  }

  /**
   * Extract populatedGeometry from multiple possible sources
   * The geometry data may be in different locations depending on how it was passed
   */
  extractPopulatedGeometry(masterDNA) {
    if (!masterDNA) {
      return null;
    }

    // Priority 1: Direct populatedGeometry property
    if (masterDNA.populatedGeometry?.floors?.length > 0) {
      logger.debug(
        "[GeometryAdapter] Found populatedGeometry directly on masterDNA",
      );
      return masterDNA.populatedGeometry;
    }

    // Priority 2: geometryDNA (populatedGeometry is spread into this by orchestrator)
    // geometryDNA.floors would have the room polygons and wall coordinates
    if (masterDNA.geometryDNA?.floors?.length > 0) {
      logger.debug(
        "[GeometryAdapter] Found floors in geometryDNA, using as populatedGeometry",
      );
      return masterDNA.geometryDNA;
    }

    // Priority 3: geometry property (legacy/alternate location)
    if (masterDNA.geometry?.floors?.length > 0) {
      logger.debug(
        "[GeometryAdapter] Found floors in geometry, using as populatedGeometry",
      );
      return masterDNA.geometry;
    }

    // Priority 4: Check for floors at top level (some pipelines put it there)
    if (masterDNA.floors?.length > 0) {
      logger.debug("[GeometryAdapter] Found floors at top level of masterDNA");
      return { floors: masterDNA.floors };
    }

    return null;
  }

  extractDimensions() {
    const dims = this.dna?.dimensions || this.dna?.geometry?.dimensions || {};

    // CRITICAL: Extract floor count from canonical geometry (same source as sections)
    // Priority: 1) masterGeometry.floors.length 2) dims.floors 3) rooms distribution 4) floorHeights.length
    let floors = dims.floors;

    // If no explicit floors, derive from geometry floors array
    if (!floors && this.dna?.geometry?.floors?.length) {
      floors = this.dna.geometry.floors.length;
    }

    // If still no floors, derive from rooms distribution
    if (!floors && (this.dna?.rooms || this.dna?.program?.rooms)) {
      const rooms = this.dna?.rooms || this.dna?.program?.rooms || [];
      const maxFloor = rooms.reduce((max, room) => {
        const roomFloor =
          room.floor ??
          (room.level === "ground"
            ? 0
            : room.level === "first"
              ? 1
              : (room.level ?? 0));
        return Math.max(max, roomFloor);
      }, 0);
      floors = maxFloor + 1; // Convert 0-indexed to count
    }

    // If still no floors, derive from floorHeights array length
    if (!floors && dims.floorHeights?.length) {
      floors = dims.floorHeights.length;
    }

    // Absolute fallback: calculate from total height and typical floor height
    if (!floors) {
      const totalHeight = dims.height || 7;
      const typicalFloorHeight = 2.7;
      floors = Math.max(1, Math.round(totalHeight / typicalFloorHeight));
      logger.warn(
        `[GeometryAdapter] No explicit floor count found, derived ${floors} floors from height ${totalHeight}m`,
      );
    }

    // Generate floorHeights array if not provided
    const floorHeights = dims.floorHeights || Array(floors).fill(2.7);

    return {
      width: dims.width || dims.length || 12,
      length: dims.depth || dims.length || 10,
      depth: dims.depth || dims.length || 10,
      height: dims.height || 7,
      floors,
      floorHeights,
      wallThickness: dims.wallThickness || 0.3,
      internalWallThickness: dims.internalWallThickness || 0.1,
    };
  }

  extractRooms() {
    const floorMap = {};

    // PRIORITY 1: Use populatedGeometry floors (has polygon data, wall coordinates, openings)
    if (this.populatedGeometry?.floors?.length > 0) {
      this.populatedGeometry.floors.forEach((floor) => {
        const level = floor.level ?? 0;
        floorMap[level] = (floor.rooms || []).map((room, index) => {
          // Extract dimensions from boundingBox or polygon
          let width, length, x, y;
          if (room.boundingBox) {
            width =
              room.boundingBox.width ||
              room.boundingBox.maxX - room.boundingBox.minX;
            length =
              room.boundingBox.height ||
              room.boundingBox.maxY - room.boundingBox.minY;
            x = room.boundingBox.minX ?? 0;
            y = room.boundingBox.minY ?? 0;
          } else if (room.polygon?.length >= 3) {
            // Calculate bounds from polygon
            const xs = room.polygon.map((p) => p.x);
            const ys = room.polygon.map((p) => p.y);
            x = Math.min(...xs);
            y = Math.min(...ys);
            width = Math.max(...xs) - x;
            length = Math.max(...ys) - y;
          } else {
            width = 4;
            length = 3;
            x = 0;
            y = 0;
          }

          return {
            name: room.name || room.id || `Room ${index + 1}`,
            type: this.normalizeRoomType(room.name || room.id),
            polygon: room.polygon, // CRITICAL: Keep polygon data!
            boundingBox: room.boundingBox,
            width: width,
            length: length,
            area: room.area || room.targetArea || width * length,
            x: x,
            y: y,
            windows: room.windows || this.estimateWindows(room.name, room.area),
            doors: room.doors || 1,
            features: room.features || [],
          };
        });
      });
      logger.debug(
        `[GeometryAdapter] Extracted rooms from populatedGeometry: ${JSON.stringify(Object.keys(floorMap).map((k) => `floor ${k}: ${floorMap[k].length} rooms`))}`,
      );
      return floorMap;
    }

    // FALLBACK: Use DNA rooms (no polygon data, will auto-layout)
    const rooms = this.dna?.rooms || this.dna?.program?.rooms || [];

    rooms.forEach((room, index) => {
      const floor = room.floor || (room.level === "ground" ? 0 : 1);
      if (!floorMap[floor]) {
        floorMap[floor] = [];
      }

      // Parse dimensions string like "5.5m × 4.0m" or use numeric values
      let width, length;
      if (typeof room.dimensions === "string") {
        const match = room.dimensions.match(/([\d.]+)m?\s*[×x]\s*([\d.]+)m?/i);
        if (match) {
          width = parseFloat(match[1]);
          length = parseFloat(match[2]);
        }
      } else if (room.dimensions) {
        width = room.dimensions.width || room.dimensions.x || 4;
        length = room.dimensions.length || room.dimensions.y || 3;
      }

      // Calculate area if not provided
      const area = room.area || (width && length ? width * length : 15);
      if (!width || !length) {
        // Estimate from area with golden ratio-ish proportions
        width = Math.sqrt(area * 1.3);
        length = area / width;
      }

      floorMap[floor].push({
        name: room.name || `Room ${index + 1}`,
        type: this.normalizeRoomType(room.name || room.type),
        width: width,
        length: length,
        area: area,
        x: room.x || 0,
        y: room.y || 0,
        windows: room.windows || this.estimateWindows(room.name, area),
        doors: room.doors || 1,
        features: room.features || [],
      });
    });

    return floorMap;
  }

  /**
   * Extract wall geometry from populatedGeometry
   * Walls have start/end coordinates and thickness
   */
  extractWalls() {
    if (!this.populatedGeometry?.floors) {
      return {};
    }

    const wallMap = {};
    this.populatedGeometry.floors.forEach((floor) => {
      const level = floor.level ?? 0;
      wallMap[level] = (floor.walls || []).map((wall) => ({
        id: wall.id,
        start: wall.start,
        end: wall.end,
        thickness: wall.thickness || 0.3,
        type: wall.type || "exterior",
        isLoadBearing: wall.isLoadBearing,
        adjacentRooms: wall.adjacentRooms,
        openings: wall.openings || [],
      }));
    });

    if (Object.keys(wallMap).length > 0) {
      const totalWalls = Object.values(wallMap).reduce(
        (sum, walls) => sum + walls.length,
        0,
      );
      logger.debug(
        `[GeometryAdapter] Extracted ${totalWalls} walls from populatedGeometry`,
      );
    }

    return wallMap;
  }

  normalizeRoomType(name) {
    // Map room names to furniture symbol keys
    const nameNorm = (name || "").toLowerCase();
    if (nameNorm.includes("living") || nameNorm.includes("lounge")) {
      return "Living Room";
    }
    if (nameNorm.includes("kitchen") && nameNorm.includes("din")) {
      return "Kitchen/Diner";
    }
    if (nameNorm.includes("kitchen")) {
      return "Kitchen";
    }
    if (nameNorm.includes("master") || nameNorm.includes("main bedroom")) {
      return "Master Bedroom";
    }
    if (nameNorm.includes("bedroom 2") || nameNorm.includes("bed 2")) {
      return "Bedroom 2";
    }
    if (nameNorm.includes("bedroom 3") || nameNorm.includes("bed 3")) {
      return "Bedroom 3";
    }
    if (nameNorm.includes("bedroom")) {
      return "Bedroom";
    }
    if (nameNorm.includes("family bath")) {
      return "Family Bathroom";
    }
    if (nameNorm.includes("en-suite") || nameNorm.includes("ensuite")) {
      return "En-Suite";
    }
    if (nameNorm.includes("bath")) {
      return "Bathroom";
    }
    if (nameNorm.includes("wc") || nameNorm.includes("toilet")) {
      return "WC";
    }
    if (nameNorm.includes("cloakroom")) {
      return "Cloakroom";
    }
    if (nameNorm.includes("dining")) {
      return "Dining Room";
    }
    if (nameNorm.includes("utility")) {
      return "Utility Room";
    }
    if (nameNorm.includes("study") || nameNorm.includes("office")) {
      return "Study";
    }
    if (nameNorm.includes("hall")) {
      return "Hallway";
    }
    if (nameNorm.includes("landing")) {
      return "Landing";
    }
    if (nameNorm.includes("garage")) {
      return "Garage";
    }
    return name; // Return as-is if no match
  }

  estimateWindows(roomName, area) {
    const name = (roomName || "").toLowerCase();
    if (name.includes("living") || name.includes("lounge")) {
      return 2;
    }
    if (name.includes("kitchen")) {
      return 1;
    }
    if (name.includes("bedroom")) {
      return 1;
    }
    if (name.includes("bath") || name.includes("wc")) {
      return 1;
    }
    if (name.includes("hall") || name.includes("landing")) {
      return 0;
    }
    return area > 15 ? 2 : 1;
  }

  extractMaterials() {
    const materials = this.dna?.materials || this.dna?.style?.materials || [];
    const result = {
      exterior: "#D4C4B0",
      roof: "#5C4033",
      windows: "#87CEEB",
      doors: "#8B4513",
      floor: "#DEB887",
    };

    materials.forEach((m) => {
      const app = (m.application || "").toLowerCase();
      if (
        app.includes("exterior") ||
        app.includes("wall") ||
        app.includes("facade")
      ) {
        result.exterior = m.hexColor || result.exterior;
      }
      if (app.includes("roof")) {
        result.roof = m.hexColor || result.roof;
      }
      if (app.includes("window")) {
        result.windows = m.hexColor || result.windows;
      }
      if (app.includes("door")) {
        result.doors = m.hexColor || result.doors;
      }
    });

    return result;
  }

  extractOpenings() {
    const viewFeatures = this.dna?.viewSpecificFeatures || {};
    const openings = [];

    ["north", "south", "east", "west"].forEach((orientation) => {
      const features = viewFeatures[orientation] || {};
      const windows = features.windows || features.windowCount || 2;
      const doors = features.doors || (features.mainEntrance ? 1 : 0);

      for (let i = 0; i < windows; i++) {
        openings.push({
          type: "window",
          facade: orientation,
          floor: Math.floor(i / 2),
          width: 1.2,
          height: 1.4,
          sillHeight: 0.9,
        });
      }

      if (doors) {
        openings.push({
          type: "door",
          facade: orientation,
          floor: 0,
          width: 1.0,
          height: 2.1,
        });
      }
    });

    return openings;
  }

  /**
   * Get floor plan data for a specific floor
   * This method is required by ArchitecturalFloorPlanGenerator
   *
   * ENHANCED: Now returns walls and openings from populatedGeometry
   */
  getFloorPlanData(floor = 0) {
    const rooms = this.rooms[floor] || [];
    const walls = this.walls?.[floor] || [];
    const openings = this.getFloorOpenings(floor);

    if (rooms.length === 0) {
      // Generate default rooms for any floor that has no explicit rooms.
      // Upper floors previously fell through silently and produced blank panels —
      // this ensures the generator has something plausible to draw when the
      // canonical geometry is incomplete. In strict modes, generateDefaultFloorPlan
      // returns null which propagates to the caller.
      if (floor !== 0) {
        logger.warn(
          `[GeometryAdapter] Floor ${floor}: no rooms in geometry; synthesising default upper-floor layout`,
        );
      }
      const defaultData = this.generateDefaultFloorPlan(floor);
      if (!defaultData) {
        return null;
      }
      return {
        ...defaultData,
        walls: walls,
        openings: openings,
      };
    }

    // Check if rooms already have polygon data (from populatedGeometry)
    // If yes, use them directly without auto-layout to preserve exact geometry
    const hasPolygons = rooms.some((r) => r.polygon?.length >= 3);
    const hasExplicitRoomLayout = rooms.every(
      (r) =>
        Number.isFinite(Number(r.x)) &&
        Number.isFinite(Number(r.y)) &&
        Number.isFinite(Number(r.width)) &&
        Number.isFinite(Number(r.length)),
    );

    const strictGeometryFidelity =
      isFeatureEnabled("strictGeometryMaskGate") ||
      isFeatureEnabled("strictCanonicalGeometryPack") ||
      isFeatureEnabled("programGeometryFidelityGate");

    // In strict mode, do not invent room layouts when authoritative geometry is missing.
    if (strictGeometryFidelity && !hasPolygons && !hasExplicitRoomLayout) {
      logger.warn(
        `[GeometryAdapter] Floor ${floor}: missing polygon/explicit room layout in strict geometry mode`,
      );
      return null;
    }

    const layoutRooms = hasPolygons
      ? rooms
      : hasExplicitRoomLayout
        ? rooms
        : this.autoLayoutRooms(rooms, floor);

    if (hasPolygons) {
      logger.debug(
        `[GeometryAdapter] Floor ${floor}: Using ${rooms.length} rooms with polygon data, ${walls.length} walls, ${openings.length} openings`,
      );
    }

    return {
      width: this.dimensions.width,
      length: this.dimensions.depth,
      rooms: layoutRooms,
      walls: walls, // NEW: Wall geometry from populatedGeometry
      openings: openings, // NEW: Door/window openings from populatedGeometry
      wallThickness: this.dimensions.wallThickness,
      internalWallThickness: this.dimensions.internalWallThickness,
    };
  }

  /**
   * Get openings (doors, windows) for a specific floor from populatedGeometry
   */
  getFloorOpenings(floor = 0) {
    if (!this.populatedGeometry?.floors) {
      return [];
    }

    const floorData = this.populatedGeometry.floors.find(
      (f) => (f.level ?? 0) === floor,
    );
    if (!floorData) {
      return [];
    }

    // Collect openings from floor-level openings array
    const floorOpenings = floorData.openings || [];

    // Also collect openings embedded in walls
    const wallOpenings = (floorData.walls || []).flatMap((wall) => {
      return (wall.openings || []).map((opening) => ({
        ...opening,
        wallId: wall.id,
        wallStart: wall.start,
        wallEnd: wall.end,
      }));
    });

    return [...floorOpenings, ...wallOpenings];
  }

  generateDefaultFloorPlan(floor) {
    // P0: In strict mode, do NOT generate default/fallback floor plans
    // They create ambiguous content that contradicts the programLock
    if (
      isFeatureEnabled("strictNoFallback") &&
      !isFeatureEnabled("allowTechnicalFallback")
    ) {
      logger.warn(
        `[EnhancedAdapter] generateDefaultFloorPlan(${floor}) blocked by strictNoFallback — no fallback allowed`,
      );
      return null;
    }

    const buildingType =
      this.dna?.buildingType ||
      this.dna?.program?.buildingType ||
      "Residential";

    // Default rooms based on building type
    const defaultRooms =
      floor === 0
        ? [
            {
              name: "Living Room",
              type: "Living Room",
              width: 5.5,
              length: 4.0,
              windows: 2,
            },
            {
              name: "Kitchen/Diner",
              type: "Kitchen/Diner",
              width: 4.5,
              length: 3.5,
              windows: 1,
            },
            {
              name: "Hallway",
              type: "Hallway",
              width: 3.0,
              length: 2.0,
              windows: 0,
            },
            { name: "WC", type: "WC", width: 1.5, length: 1.8, windows: 1 },
          ]
        : [
            {
              name: "Master Bedroom",
              type: "Master Bedroom",
              width: 4.5,
              length: 3.5,
              windows: 1,
            },
            {
              name: "Bedroom 2",
              type: "Bedroom 2",
              width: 3.5,
              length: 3.0,
              windows: 1,
            },
            {
              name: "Bedroom 3",
              type: "Bedroom 3",
              width: 3.0,
              length: 2.8,
              windows: 1,
            },
            {
              name: "Family Bathroom",
              type: "Family Bathroom",
              width: 2.5,
              length: 2.0,
              windows: 1,
            },
            {
              name: "Landing",
              type: "Landing",
              width: 2.0,
              length: 2.0,
              windows: 0,
            },
          ];

    return {
      width: this.dimensions.width,
      length: this.dimensions.depth,
      rooms: this.autoLayoutRooms(defaultRooms, floor),
      wallThickness: this.dimensions.wallThickness,
      internalWallThickness: this.dimensions.internalWallThickness,
    };
  }

  autoLayoutRooms(rooms, floor) {
    // Simple grid-based layout algorithm
    const buildingWidth = this.dimensions.width;
    const buildingDepth = this.dimensions.depth;
    const wallThick = this.dimensions.wallThickness;

    let currentX = wallThick;
    let currentY = wallThick;
    let rowHeight = 0;
    const layoutRooms = [];

    rooms.forEach((room, index) => {
      const roomWidth = room.width || 4;
      const roomLength = room.length || 3;

      // Check if room fits in current row
      if (currentX + roomWidth > buildingWidth - wallThick) {
        // Move to next row
        currentX = wallThick;
        currentY += rowHeight + this.dimensions.internalWallThickness;
        rowHeight = 0;
      }

      layoutRooms.push({
        ...room,
        x: currentX,
        y: currentY,
        width: roomWidth,
        length: roomLength,
        area: room.area || roomWidth * roomLength,
        doors: room.doors || 1,
      });

      currentX += roomWidth + this.dimensions.internalWallThickness;
      rowHeight = Math.max(rowHeight, roomLength);
    });

    return layoutRooms;
  }

  /**
   * Get elevation data for a specific orientation
   */
  getElevationData(orientation = "south") {
    const viewFeatures = this.dna?.viewSpecificFeatures?.[orientation] || {};

    return {
      orientation,
      width:
        orientation === "north" || orientation === "south"
          ? this.dimensions.width
          : this.dimensions.depth,
      height: this.dimensions.height,
      floors: this.dimensions.floors,
      floorHeights: this.dimensions.floorHeights,
      materials: this.materials,
      openings: this.openings.filter((o) => o.facade === orientation),
      roofType: this.dna?.style?.roofType || this.dna?.roofType || "gable",
      roofPitch: this.dna?.style?.roofPitch || 35,
      features: viewFeatures,
    };
  }

  /**
   * Get section data for a specific cut type
   */
  getSectionData(sectionType = "longitudinal") {
    const isLongitudinal =
      sectionType === "longitudinal" || sectionType === "long";

    return {
      type: sectionType,
      width: isLongitudinal ? this.dimensions.depth : this.dimensions.width,
      height: this.dimensions.height,
      floors: this.dimensions.floors,
      floorHeights: this.dimensions.floorHeights,
      wallThickness: this.dimensions.wallThickness,
      materials: this.materials,
      roofType: this.dna?.style?.roofType || "gable",
      roofPitch: this.dna?.style?.roofPitch || 35,
      foundationType: this.dna?.structure?.foundationType || "strip",
      rooms: isLongitudinal
        ? this.getSectionRooms("vertical")
        : this.getSectionRooms("horizontal"),
    };
  }

  getSectionRooms(direction) {
    // Get rooms that intersect with the section cut
    const result = [];
    Object.keys(this.rooms).forEach((floor) => {
      this.rooms[floor].forEach((room) => {
        result.push({
          ...room,
          floor: parseInt(floor),
        });
      });
    });
    return result;
  }
}

/**
 * Generate enhanced floor plan SVG from DNA
 * Drop-in replacement for technicalDrawingGenerator.generateFloorPlanSVG
 *
 * @param {Object} masterDNA - Design DNA
 * @param {string|number} floor - Floor level ('ground', 'first', 0, 1, etc.)
 * @param {Object} projectContext - Additional context
 * @returns {string} SVG string
 */
export function generateEnhancedFloorPlanSVG(
  masterDNA,
  floor = "ground",
  projectContext = {},
) {
  try {
    // Convert floor string to number
    const floorIndex =
      typeof floor === "string"
        ? floor === "ground"
          ? 0
          : floor === "first"
            ? 1
            : parseInt(floor.replace(/\D/g, "")) || 0
        : floor;

    const canonicalPlan = tryBuildCanonicalPlanGraphic(
      masterDNA,
      floorIndex,
      projectContext,
    );
    if (canonicalPlan?.svg) {
      logger.info(
        `[EnhancedAdapter] Generated canonical geometry floor plan for floor ${floorIndex}`,
      );
      return wrapSVGResult(canonicalPlan.svg, {
        type: "floor_plan",
        floor: floorIndex,
        renderer: canonicalPlan.renderer || "canonical-plan-graphic",
        geometryHash: canonicalPlan.geometryHash,
        compiledProjectSchemaVersion:
          canonicalPlan.compiledProjectSchemaVersion,
        technical_quality_metadata:
          canonicalPlan.technical_quality_metadata || null,
      });
    }

    if (!isFeatureEnabled("enhancedSVGGenerators")) {
      logger.debug(
        "[EnhancedAdapter] Feature flag disabled, falling back to basic generator",
      );
      return null; // Signal to use fallback
    }

    // Create geometry adapter from DNA
    const geometry = new GeometryAdapter(masterDNA);

    // Create enhanced generator with professional options
    const generator = new ArchitecturalFloorPlanGenerator({
      scale: projectContext.scale || 50,
      showFurniture: true,
      showDimensions: true,
      showDoorSwings: true,
      showRoomLabels: true,
      wallThickness: geometry.dimensions.wallThickness,
      internalWallThickness: geometry.dimensions.internalWallThickness,
      sheetMode: projectContext.sheetMode || false,
    });

    // Generate the SVG (pass target slot dimensions for aspect ratio matching)
    const svg = generator.generate(geometry, floorIndex, {
      targetWidth: projectContext.targetWidth,
      targetHeight: projectContext.targetHeight,
    });

    logger.info(
      `[EnhancedAdapter] Generated enhanced floor plan for floor ${floorIndex}`,
    );

    // CRITICAL FIX: Wrap SVG in expected format { dataUrl, svg, metadata }
    // CleanPanelOrchestrator checks for result?.dataUrl - plain strings fail this check
    return wrapSVGResult(svg, {
      type: "floor_plan",
      floor: floorIndex,
      authorityUsed: ENHANCED_FALLBACK_AUTHORITY.authorityUsed,
      authoritySource: ENHANCED_FALLBACK_AUTHORITY.authoritySource,
      panelAuthorityReason: ENHANCED_FALLBACK_AUTHORITY.panelAuthorityReason,
      generatorUsed: ENHANCED_FALLBACK_AUTHORITY.generatorUsed,
      sourceType: ENHANCED_FALLBACK_AUTHORITY.sourceType,
      geometryHash: computeCDSHashSync({
        kind: "enhanced_fallback_floor_plan",
        floor: floorIndex,
        rooms: geometry?.rooms || null,
        walls: geometry?.walls || null,
        dimensions: geometry?.dimensions || null,
      }),
    });
  } catch (error) {
    logger.error("[EnhancedAdapter] Floor plan generation failed:", error);
    return null; // Signal to use fallback
  }
}

/**
 * Generate enhanced elevation SVG from DNA
 * Drop-in replacement for technicalDrawingGenerator.generateElevationSVG
 *
 * Uses the ArchitecturalElevationGenerator which provides:
 * - Material patterns (brick, timber, render, stone, slate)
 * - Window details with glazing bars and sills
 * - Door details with panels
 * - Ground line with context
 * - Level markers and dimension lines
 *
 * @param {Object} masterDNA - Design DNA
 * @param {string} orientation - Facade orientation ('north', 'south', 'east', 'west')
 * @param {Object} projectContext - Additional context
 * @returns {string} SVG string
 */
export function generateEnhancedElevationSVG(
  masterDNA,
  orientation = "south",
  projectContext = {},
) {
  try {
    const canonicalElevation = tryBuildCanonicalElevationGraphic(
      masterDNA,
      orientation,
      projectContext,
    );
    if (canonicalElevation?.svg) {
      logger.info(
        `[EnhancedAdapter] Generated canonical geometry ${orientation} elevation`,
      );
      return wrapSVGResult(canonicalElevation.svg, {
        type: "elevation",
        orientation,
        renderer: canonicalElevation.renderer || "canonical-elevation-graphic",
        geometryHash: canonicalElevation.geometryHash,
        compiledProjectSchemaVersion:
          canonicalElevation.compiledProjectSchemaVersion,
        technical_quality_metadata:
          canonicalElevation.technical_quality_metadata || null,
      });
    }

    if (!isFeatureEnabled("enhancedSVGGenerators")) {
      logger.debug(
        "[EnhancedAdapter] Feature flag disabled, falling back to basic generator",
      );
      return null;
    }

    // Use the generateFromDNA function directly (elevation generator is function-based)
    const facadeGrammar = deriveFacadeGrammarForElevation(masterDNA);
    const svg = generateElevationFromDNA(masterDNA, orientation, {
      scale: projectContext.scale || 50,
      showDimensions: true,
      showMaterialPatterns: true,
      showGroundContext: true,
      showLevelMarkers: true,
      sheetMode: projectContext.sheetMode || false,
      targetWidth: projectContext.targetWidth,
      targetHeight: projectContext.targetHeight,
      facadeGrammar,
      canonicalPalette: projectContext.canonicalPalette || null,
    });

    logger.info(
      `[EnhancedAdapter] Generated enhanced ${orientation} elevation with material patterns`,
    );

    // CRITICAL FIX: Wrap SVG in expected format { dataUrl, svg, metadata }
    return wrapSVGResult(svg, {
      type: "elevation",
      orientation,
      authorityUsed: ENHANCED_FALLBACK_AUTHORITY.authorityUsed,
      authoritySource: ENHANCED_FALLBACK_AUTHORITY.authoritySource,
      panelAuthorityReason: ENHANCED_FALLBACK_AUTHORITY.panelAuthorityReason,
      generatorUsed: ENHANCED_FALLBACK_AUTHORITY.generatorUsed,
      sourceType: ENHANCED_FALLBACK_AUTHORITY.sourceType,
      geometryHash: computeCDSHashSync({
        kind: "enhanced_fallback_elevation",
        orientation,
        styleDNA: masterDNA?.styleDNA || masterDNA?.style_dna || null,
        dimensions: masterDNA?.dimensions || null,
      }),
    });
  } catch (error) {
    logger.error("[EnhancedAdapter] Elevation generation failed:", error);
    return null;
  }
}

/**
 * Generate enhanced section SVG from DNA
 * Drop-in replacement for technicalDrawingGenerator.generateSectionSVG
 *
 * Uses the ArchitecturalSectionGenerator which provides:
 * - Cut wall hatching (concrete, brick, etc.)
 * - Floor structure with slab thickness
 * - Roof structure details
 * - Foundation types (strip, raft, pile)
 * - Room labels and level markers
 * - Dimension lines
 *
 * @param {Object} masterDNA - Design DNA
 * @param {string} sectionType - Section type ('longitudinal', 'transverse')
 * @param {Object} projectContext - Additional context
 * @param {number} cutPosition - Position of cut (0.0 to 1.0)
 * @returns {string} SVG string
 */
export function generateEnhancedSectionSVG(
  masterDNA,
  sectionType = "longitudinal",
  projectContext = {},
  cutPosition = 0.5,
) {
  try {
    const canonicalSection = tryBuildCanonicalSectionGraphic(
      masterDNA,
      sectionType,
      projectContext,
    );
    if (canonicalSection?.svg) {
      logger.info(
        `[EnhancedAdapter] Generated canonical geometry ${sectionType} section`,
      );
      return wrapSVGResult(canonicalSection.svg, {
        type: "section",
        sectionType,
        renderer: canonicalSection.renderer || "canonical-section-graphic",
        geometryHash: canonicalSection.geometryHash,
        compiledProjectSchemaVersion:
          canonicalSection.compiledProjectSchemaVersion,
        technical_quality_metadata:
          canonicalSection.technical_quality_metadata || null,
      });
    }

    if (!isFeatureEnabled("enhancedSVGGenerators")) {
      logger.debug(
        "[EnhancedAdapter] Feature flag disabled, falling back to basic generator",
      );
      return null;
    }

    // Ensure populatedGeometry is accessible for room data extraction
    let dnaForSection = masterDNA;
    if (!masterDNA.populatedGeometry) {
      try {
        const adapter = new GeometryAdapter(masterDNA);
        if (adapter.populatedGeometry?.floors?.length > 0) {
          dnaForSection = {
            ...masterDNA,
            populatedGeometry: adapter.populatedGeometry,
          };
          logger.info(
            "[EnhancedAdapter] Enriched section DNA with populatedGeometry from GeometryAdapter",
          );
        }
      } catch (_) {
        // GeometryAdapter may fail if no geometry data — proceed with original DNA
      }
    }

    // Use the generateFromDNA function directly (section generator is function-based)
    // NOTE: generateFromDNA(dna, options) takes sectionType inside options, not as separate arg
    const svg = generateSectionFromDNA(dnaForSection, {
      sectionType,
      scale: projectContext.scale || 50,
      showStructure: true,
      showDimensions: true,
      showLevels: true,
      showRoomLabels: true,
      showFoundation: true,
      sheetMode: projectContext.sheetMode || false,
      targetWidth: projectContext.targetWidth,
      targetHeight: projectContext.targetHeight,
    });

    logger.info(
      `[EnhancedAdapter] Generated enhanced ${sectionType} section with structural details`,
    );

    // CRITICAL FIX: Wrap SVG in expected format { dataUrl, svg, metadata }
    return wrapSVGResult(svg, {
      type: "section",
      sectionType,
      authorityUsed: ENHANCED_FALLBACK_AUTHORITY.authorityUsed,
      authoritySource: ENHANCED_FALLBACK_AUTHORITY.authoritySource,
      panelAuthorityReason: ENHANCED_FALLBACK_AUTHORITY.panelAuthorityReason,
      generatorUsed: ENHANCED_FALLBACK_AUTHORITY.generatorUsed,
      sourceType: ENHANCED_FALLBACK_AUTHORITY.sourceType,
      geometryHash: computeCDSHashSync({
        kind: "enhanced_fallback_section",
        sectionType,
        cutPosition,
        populatedGeometry: dnaForSection?.populatedGeometry || null,
        dimensions: masterDNA?.dimensions || null,
      }),
    });
  } catch (error) {
    logger.error("[EnhancedAdapter] Section generation failed:", error);
    return null;
  }
}

/**
 * Generate all technical drawings (floor plans, elevations, sections)
 * Enhanced version with furniture, materials, and structural details
 *
 * @param {Object} masterDNA - Design DNA
 * @param {Object} projectContext - Additional context
 * @param {Object} options - Generation options
 * @returns {Object} Object containing all SVG strings
 */
export async function generateAllEnhancedDrawings(
  masterDNA,
  projectContext = {},
  options = {},
) {
  const results = {
    floorPlans: {},
    elevations: {},
    sections: {},
    metadata: {
      generator: "enhanced",
      timestamp: new Date().toISOString(),
      features: [
        "furniture",
        "dimensions",
        "doorSwings",
        "materials",
        "structure",
      ],
    },
  };

  const floors = masterDNA?.dimensions?.floors || 2;

  // Generate floor plans
  for (let floor = 0; floor < floors; floor++) {
    const floorName = floor === 0 ? "ground" : `floor_${floor}`;
    results.floorPlans[floorName] = generateEnhancedFloorPlanSVG(
      masterDNA,
      floor,
      projectContext,
    );
  }

  // Generate elevations
  ["north", "south", "east", "west"].forEach((orientation) => {
    results.elevations[orientation] = generateEnhancedElevationSVG(
      masterDNA,
      orientation,
      projectContext,
    );
  });

  // Generate sections
  ["longitudinal", "transverse"].forEach((sectionType) => {
    results.sections[sectionType] = generateEnhancedSectionSVG(
      masterDNA,
      sectionType,
      projectContext,
    );
  });

  return results;
}

/**
 * Check if enhanced generator can handle this panel type
 */
export function canGenerateEnhanced(panelType) {
  const enhancedPanels = [
    "floor_plan_ground",
    "floor_plan_first",
    "floor_plan_second",
    "floor_plan",
    "elevation_north",
    "elevation_south",
    "elevation_east",
    "elevation_west",
    "section_AA",
    "section_BB",
    "section_longitudinal",
    "section_transverse",
  ];

  return enhancedPanels.includes(panelType);
}

/**
 * Generate technical panel based on type
 * Unified entry point for enhanced generation
 */
export function generateEnhancedPanel(
  panelType,
  masterDNA,
  projectContext = {},
) {
  if (!canGenerateEnhanced(panelType)) {
    return null;
  }

  // Floor plans
  if (panelType.startsWith("floor_plan")) {
    const floorMatch = panelType.match(/floor_plan_(\w+)/);
    const floor = floorMatch ? floorMatch[1] : "ground";
    return generateEnhancedFloorPlanSVG(masterDNA, floor, projectContext);
  }

  // Elevations
  if (panelType.startsWith("elevation_")) {
    const orientation = panelType.replace("elevation_", "");
    return generateEnhancedElevationSVG(masterDNA, orientation, projectContext);
  }

  // Sections
  if (panelType.startsWith("section_")) {
    const sectionType =
      panelType.includes("AA") || panelType.includes("longitudinal")
        ? "longitudinal"
        : "transverse";
    return generateEnhancedSectionSVG(masterDNA, sectionType, projectContext);
  }

  return null;
}

// Export the GeometryAdapter and constants for testing and direct use
export {
  GeometryAdapter,
  FURNITURE_SYMBOLS,
  MATERIAL_PATTERNS,
  HATCH_PATTERNS,
};

export default {
  generateEnhancedFloorPlanSVG,
  generateEnhancedElevationSVG,
  generateEnhancedSectionSVG,
  generateAllEnhancedDrawings,
  generateEnhancedPanel,
  canGenerateEnhanced,
  GeometryAdapter,
  FURNITURE_SYMBOLS,
  MATERIAL_PATTERNS,
  HATCH_PATTERNS,
};
