/**
 * Geometry Builder (JS wrapper)
 *
 * Converts geometry DNA into a canonical geometry model + lightweight scene spec.
 * This is a placeholder wrapper around the partial TS builder, keeping the
 * interface stable for future Three.js-backed implementations.
 */

import logger from '../utils/logger.js';

export function buildGeometryModel(geometryDNA = {}, masterDNA = {}) {
  const dimensions = masterDNA.dimensions || {};
  const floors = geometryDNA.floorHeights?.length || dimensions.floors || dimensions.floorCount || 2;
  const floorHeights = geometryDNA.floorHeights || Array(floors).fill(3.2);
  const length = dimensions.length || 18;
  const width = dimensions.width || 12;

  const floorsSpec = [];
  const walls = [];
  const openings = [];

  for (let level = 0; level < floors; level++) {
    const elevation = floorHeights.slice(0, level).reduce((sum, h) => sum + h, 0);
    floorsSpec.push({
      id: `floor-${level}`,
      elevation,
      height: floorHeights[level] || 3.2,
      thickness: 0.3,
      polygon: {
        vertices: [
          { x: 0, y: 0 },
          { x: length, y: 0 },
          { x: length, y: width },
          { x: 0, y: width }
        ]
      }
    });

    // Four perimeter walls
    const wallDirs = ['north', 'east', 'south', 'west'];
    wallDirs.forEach((dir, idx) => {
      const start = idx === 0 ? { x: 0, y: 0 } :
        idx === 1 ? { x: length, y: 0 } :
        idx === 2 ? { x: length, y: width } :
        { x: 0, y: width };
      const end = idx === 0 ? { x: length, y: 0 } :
        idx === 1 ? { x: length, y: width } :
        idx === 2 ? { x: 0, y: width } :
        { x: 0, y: 0 };

      walls.push({
        id: `wall-${level}-${dir}`,
        direction: dir,
        start,
        end,
        elevation,
        height: floorHeights[level] || 3.2,
        thickness: dimensions.wallThickness || 0.3,
        openings: []
      });
    });
  }

  const boundingBox = {
    min: { x: 0, y: 0, z: 0 },
    max: { x: length, y: width, z: floorHeights.reduce((a, b) => a + b, 0) },
    width: length,
    depth: width,
    height: floorHeights.reduce((a, b) => a + b, 0)
  };

  const model = {
    geometryDNA,
    dimensions: { length, width, floors, floorHeights },
    floors: floorsSpec,
    walls,
    openings,
    roof: {
      type: geometryDNA.roofType || masterDNA.roof?.type || 'gable',
      pitch: masterDNA.roof?.pitch || 30
    },
    boundingBox,
    metadata: {
      generatedAt: new Date().toISOString(),
      source: geometryDNA?.metadata?.source || 'geometry_builder'
    }
  };

  logger.info('Built geometry model', {
    roof: model.roof.type,
    floors: model.dimensions.floors,
    length,
    width
  });

  return model;
}

export function createSceneSpec(model) {
  return {
    boundingBox: model.boundingBox,
    volumes: model.geometryDNA?.volumes || [],
    facades: model.geometryDNA?.facades || [],
    roof: model.roof,
    floors: model.floors,
    walls: model.walls
  };
}

export default {
  buildGeometryModel,
  createSceneSpec
};
