import logger from "../../utils/logger.js";
import {
  ARCHITECTURAL_ELEMENT_FAMILIES,
  ARCHITECTURAL_SCHEMA_DEFINITIONS,
  createEmptyArchitecturalGeometry,
  createEmptyLevel,
  createNormalizedElement,
  inferElementFamily,
  normalizeLevelName,
  normalizeFootprint,
  safeNumber,
} from "./architecturalSchema.js";
import { registerOpenSourceAdapter } from "../models/openSourceModelRouter.js";

function bucketElement(geometry, element) {
  const family = element.family;
  if (!Array.isArray(geometry[family])) {
    geometry[family] = [];
  }
  geometry[family].push(element);
}

function updateStats(geometry) {
  geometry.stats = {
    level_count: geometry.levels.length,
    room_count: geometry.rooms.length,
    wall_count: geometry.walls.length,
    door_count: geometry.doors.length,
    window_count: geometry.windows.length,
    stair_count: geometry.stairs.length,
  };
  return geometry;
}

function normalizeLevelElements(level, levelIndex, options = {}) {
  const normalized = createEmptyLevel(level, levelIndex);
  const source = options.source || "normalized-level";

  ARCHITECTURAL_ELEMENT_FAMILIES.forEach((family) => {
    const rawItems = Array.isArray(level[family]) ? level[family] : [];
    normalized[family] = rawItems.map((item, itemIndex) =>
      createNormalizedElement(item, family, {
        id: item.id || `${normalized.id}-${family}-${itemIndex}`,
        level_id: normalized.id,
        source,
      }),
    );
  });

  return normalized;
}

function bucketFlatElements(geometry, elements = [], options = {}) {
  elements.forEach((rawElement, index) => {
    const family = inferElementFamily(rawElement.type, rawElement.semantic);
    const element = createNormalizedElement(rawElement, family, {
      id: rawElement.id || `${family}-${index}`,
      level_id: rawElement.level_id || rawElement.level || "ground",
      source: options.source || "flat-elements",
    });
    bucketElement(geometry, element);
  });
}

function ensureLevelContainers(geometry) {
  geometry.levels.forEach((level) => {
    ARCHITECTURAL_ELEMENT_FAMILIES.forEach((family) => {
      if (!Array.isArray(level[family])) {
        level[family] = [];
      }
    });
  });
  return geometry;
}

function distributeElementsToLevels(geometry) {
  const levelMap = new Map(geometry.levels.map((level) => [level.id, level]));

  if (!levelMap.size) {
    const ground = createEmptyLevel({ id: "ground", name: "ground" }, 0);
    geometry.levels.push(ground);
    levelMap.set("ground", ground);
  }

  ARCHITECTURAL_ELEMENT_FAMILIES.forEach((family) => {
    geometry[family].forEach((element) => {
      const levelId = element.level_id || "ground";
      if (!levelMap.has(levelId)) {
        const newLevel = createEmptyLevel(
          {
            id: levelId,
            name: normalizeLevelName(levelId, geometry.levels.length),
          },
          geometry.levels.length,
        );
        geometry.levels.push(newLevel);
        levelMap.set(levelId, newLevel);
      }
      const levelCollection = levelMap.get(levelId)[family];
      if (!levelCollection.some((entry) => entry.id === element.id)) {
        levelCollection.push(element);
      }
    });
  });

  return geometry;
}

/**
 * Normalize structured architectural data into a stable internal geometry
 * contract. This is the CAD-understanding entry point for ArchiAI's local MVP.
 */
export function normalizeArchitecturalGeometry(input = {}, options = {}) {
  const projectId = input.project_id || input.projectId || "archiai-project";
  const geometry = createEmptyArchitecturalGeometry(projectId, {
    source: input.source || options.source || "cad-normalizer",
    units: input.units || options.units || "meters",
    technical_constraints:
      input.technical_constraints || input.technicalConstraints || [],
  });

  const levelInputs = Array.isArray(input.levels) ? input.levels : [];
  geometry.levels = levelInputs.map((level, index) =>
    normalizeLevelElements(level, index, options),
  );

  if (!geometry.levels.length && Array.isArray(input.floors)) {
    geometry.levels = input.floors.map((level, index) =>
      normalizeLevelElements(level, index, options),
    );
  }

  if (geometry.levels.length) {
    ARCHITECTURAL_ELEMENT_FAMILIES.forEach((family) => {
      geometry[family] = geometry.levels.flatMap((level) => level[family]);
    });
  }

  if (Array.isArray(input.elements)) {
    bucketFlatElements(geometry, input.elements, options);
  }

  if (input.archcad_sample && Array.isArray(input.archcad_sample.elements)) {
    bucketFlatElements(geometry, input.archcad_sample.elements, {
      source: "archcad-sample",
    });
  }

  geometry.footprints = Array.isArray(input.footprints)
    ? input.footprints.map(normalizeFootprint)
    : input.footprint
      ? [normalizeFootprint(input.footprint)]
      : [];
  geometry.elevations = Array.isArray(input.elevations) ? input.elevations : [];
  geometry.sections = Array.isArray(input.sections) ? input.sections : [];
  geometry.metadata.source_summary = {
    levels: geometry.levels.length,
    flat_elements: Array.isArray(input.elements) ? input.elements.length : 0,
    archcad_elements: Array.isArray(input.archcad_sample?.elements)
      ? input.archcad_sample.elements.length
      : 0,
  };

  ensureLevelContainers(geometry);
  distributeElementsToLevels(geometry);
  updateStats(geometry);

  logger.debug("[CAD] Normalized architectural geometry", {
    projectId,
    levels: geometry.stats.level_count,
    rooms: geometry.stats.room_count,
    walls: geometry.stats.wall_count,
  });

  return geometry;
}

export function normalizeFootprints(footprints = []) {
  return Array.isArray(footprints) ? footprints.map(normalizeFootprint) : [];
}

export function normalizeArchitecturalElement(rawElement = {}, options = {}) {
  const family = inferElementFamily(rawElement.type, rawElement.semantic);
  return createNormalizedElement(rawElement, family, {
    level_id: rawElement.level_id || options.level_id || "ground",
    source: options.source || "single-element",
  });
}

export function buildCadSemanticIndex(geometry = {}) {
  const index = {};
  ARCHITECTURAL_ELEMENT_FAMILIES.forEach((family) => {
    const elements = Array.isArray(geometry[family]) ? geometry[family] : [];
    elements.forEach((element) => {
      const key = String(element.semantic || family).toLowerCase();
      index[key] = (index[key] || 0) + 1;
    });
  });
  return index;
}

export function getArchitecturalSchemaContract() {
  return {
    schema_version: "open-source-geometry-v1",
    definitions: ARCHITECTURAL_SCHEMA_DEFINITIONS,
  };
}

registerOpenSourceAdapter(
  "cadUnderstanding",
  "arch-structured-normalizer",
  async (payload) => ({
    status: "ready",
    adapterId: "arch-structured-normalizer",
    provider: "local",
    geometry: normalizeArchitecturalGeometry(payload),
  }),
);

export default {
  normalizeArchitecturalGeometry,
  normalizeArchitecturalElement,
  normalizeFootprints,
  buildCadSemanticIndex,
  getArchitecturalSchemaContract,
};
