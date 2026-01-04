/**
 * Geometry Reasoning Service
 *
 * Generates a structured geometry/volume DNA from site + master DNA context.
 * This is a fast, deterministic fallback (no remote calls) that can be replaced
 * later with a Qwen2.5-72B call. It resolves ambiguous roof/wings/stacking
 * into a single coherent strategy suitable for geometry builders/renderers.
 */

import logger from '../utils/logger.js';

function deriveRoofType(masterDNA = {}) {
  const style = (masterDNA.architecturalStyle || '').toLowerCase();
  if (masterDNA.roof?.type) return masterDNA.roof.type;
  if (style.includes('modern') || style.includes('contemporary')) return 'flat';
  if (style.includes('barn')) return 'gable';
  if (style.includes('craftsman')) return 'hip';
  return 'gable';
}

function deriveWings(sitePolygon = [], masterDNA = {}) {
  const area = masterDNA.dimensions?.totalArea || masterDNA.dimensions?.length * masterDNA.dimensions?.width || 200;
  if (area > 800) return ['L-shape', 'courtyard'];
  if (area > 400) return ['L-shape'];
  return ['bar'];
}

function deriveFloorHeights(dimensions = {}) {
  if (Array.isArray(dimensions.floorHeights) && dimensions.floorHeights.length) {
    return dimensions.floorHeights;
  }
  const floors = dimensions.floors || dimensions.floorCount || 2;
  return Array(floors).fill(3.2);
}

export function generateGeometryDNA({ masterDNA = {}, sitePolygon = [], climate = {}, style = '' }) {
  const dimensions = masterDNA.dimensions || {};
  const roofType = deriveRoofType(masterDNA);
  const wings = deriveWings(sitePolygon, masterDNA);
  const floorHeights = deriveFloorHeights(dimensions);

  const volumes = [
    {
      id: 'main',
      roofType,
      height: floorHeights.reduce((sum, h) => sum + h, 0),
      levels: floorHeights.length,
      footprint: {
        vertices: [
          { x: 0, y: 0 },
          { x: dimensions.length || 18, y: 0 },
          { x: dimensions.length || 18, y: dimensions.width || 12 },
          { x: 0, y: dimensions.width || 12 }
        ]
      }
    }
  ];

  const facadeOrientations = ['north', 'south', 'east', 'west'];
  const facades = facadeOrientations.map((orientation) => ({
    orientation,
    segments: [
      { band: 'base', height: 1.0 },
      { band: 'mid', height: 2.4 },
      { band: 'top', height: 0.8 }
    ],
    openings: [
      {
        type: 'window',
        count: 4,
        distribution: 'even',
        level: 1,
        width: 1.2,
        height: 1.5
      }
    ],
    roofEdge: roofType === 'flat' ? 'parapet' : 'eave'
  }));

  const geometryDNA = {
    roofType,
    wings,
    floorHeights,
    volumes,
    facades,
    stackingStrategy: wings.includes('courtyard') ? 'courtyard' : 'stacked',
    facadeOrientation: {
      entrance: masterDNA.entranceDirection || 'north',
      primary: 'south',
      secondary: 'east'
    },
    segmentation: {
      facadeBands: ['base', 'mid', 'top'],
      verticalGrid: 4
    },
    geometryRules: masterDNA.geometry_rules || masterDNA.geometryRules || {},
    metadata: {
      source: 'local_heuristic',
      climate: climate?.type || null,
      style: style || masterDNA.architecturalStyle || null,
      generatedAt: new Date().toISOString()
    }
  };

  logger.info('Generated geometry DNA (deterministic heuristic)', {
    roofType,
    wings,
    floors: floorHeights.length
  });

  return geometryDNA;
}

export default {
  generateGeometryDNA
};
