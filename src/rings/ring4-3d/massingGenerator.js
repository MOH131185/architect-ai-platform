// TypeScript import - requires compilation
// import { buildGeometryFromDNA } from '../../geometry/buildGeometry.ts';

const DEFAULT_FLOOR_HEIGHT = 3.1;
const DEFAULT_FLOOR_COUNT = 2;

/**
 * Generate a simplified 3D massing model from Master DNA plus site context.
 * Returns geometry metadata, coverage metrics, and warnings if constraints are exceeded.
 */
export async function generateMassingModel({
  masterDNA,
  siteContext = null,
  options = {}
}) {
  if (!masterDNA) {
    throw new Error('Master DNA is required to generate massing.');
  }

  const geometryReadyDNA = prepareDNAForGeometry(masterDNA);

  // Lazy load TypeScript geometry builder
  let geometryModel;
  try {
    const { buildGeometryFromDNA } = await import('../../geometry/buildGeometry.ts');
    geometryModel = buildGeometryFromDNA(geometryReadyDNA);
  } catch (err) {
    console.warn('⚠️ Geometry builder not available (TypeScript not compiled), using fallback');
    // Return minimal massing without geometry
    return {
      summary: {
        footprintArea: (geometryReadyDNA.dimensions?.length || 15) * (geometryReadyDNA.dimensions?.width || 12),
        buildingHeight: geometryReadyDNA.dimensions?.height || geometryReadyDNA.dimensions?.totalHeight || 7,
        siteCoverage: null
      },
      preview: null,
      warnings: ['Geometry-first features require TypeScript compilation']
    };
  }

  const summary = summarizeMassing({
    geometryModel,
    dna: geometryReadyDNA,
    siteContext,
    coverageTarget: options.coverageTarget
  });

  const preview = {
    boundingBox: geometryModel.boundingBox,
    floors: geometryModel.floors.length,
    wallCount: geometryModel.walls.length,
    openingCount: geometryModel.openings.length,
    roof: geometryModel.roof
  };

  return {
    geometryModel,
    summary,
    preview,
    warnings: summary.warnings
  };
}

function prepareDNAForGeometry(masterDNA) {
  const dnaCopy = JSON.parse(JSON.stringify(masterDNA || {}));
  dnaCopy.materials = normalizeMaterialPalette(dnaCopy.materials);

  const dims = dnaCopy.dimensions || {};
  const floorCount =
    dims.floorCount ||
    dims.floor_count ||
    dims.floors ||
    (Array.isArray(dims.floorHeights) ? dims.floorHeights.length : null) ||
    DEFAULT_FLOOR_COUNT;

  const floorHeights = buildFloorHeights(dims, floorCount);
  const totalHeight = floorHeights.reduce((sum, h) => sum + h, 0);

  dnaCopy.dimensions = {
    ...dims,
    length: dims.length || 20,
    width: dims.width || 12,
    floorCount,
    floors: floorCount,
    floorHeights,
    totalHeight,
    height: totalHeight,
    wallThickness: dims.wallThickness || 0.3
  };

  return dnaCopy;
}

function buildFloorHeights(dimensions, floorCount) {
  if (Array.isArray(dimensions?.floorHeights) && dimensions.floorHeights.length === floorCount) {
    return dimensions.floorHeights.map(h => (Number.isFinite(h) ? h : DEFAULT_FLOOR_HEIGHT));
  }

  const fallbackHeight =
    dimensions?.floorHeight ||
    (dimensions?.totalHeight ? dimensions.totalHeight / floorCount : DEFAULT_FLOOR_HEIGHT);

  return Array.from({ length: floorCount }, () => Number.isFinite(fallbackHeight) ? fallbackHeight : DEFAULT_FLOOR_HEIGHT);
}

function normalizeMaterialPalette(materials) {
  if (!materials) {
    return {
      exterior: { id: 'brick', color: '#B8604E' },
      roof: { id: 'clay tiles', type: 'gable', pitch: 35 },
      windows: { id: 'glass' }
    };
  }

  if (!Array.isArray(materials)) {
    return materials;
  }

  const [primary, secondary, tertiary] = materials;

  return {
    exterior: {
      id: primary?.id || primary?.name || 'brick',
      color: primary?.hexColor || primary?.color_hex || primary?.color || '#B8604E'
    },
    roof: {
      id: secondary?.id || secondary?.name || 'roof tiles',
      type: secondary?.type || 'gable',
      pitch: secondary?.pitch || 35,
      color: secondary?.hexColor || '#8B4513'
    },
    windows: {
      id: tertiary?.id || tertiary?.name || 'glass',
      color: tertiary?.hexColor || '#FFFFFF'
    }
  };
}

function summarizeMassing({ geometryModel, dna, siteContext, coverageTarget }) {
  const footprintVertices = geometryModel?.floors?.[0]?.polygon?.vertices || [];
  const footprintArea = computePlanarPolygonArea(footprintVertices) ||
    (dna.dimensions.length * dna.dimensions.width);

  const totalFloorArea = footprintArea * geometryModel.floors.length;
  const buildingHeight = geometryModel.boundingBox?.height || dna.dimensions.totalHeight;
  const buildingVolume = footprintArea * buildingHeight;

  const siteArea = siteContext?.metrics?.areaM2 || null;
  const coverageRatio = siteArea ? footprintArea / siteArea : null;
  const normalizedCoverageTarget = normalizeCoverageTarget(coverageTarget || siteContext?.boundaries?.coverageLimit);

  const warnings = [];
  if (coverageRatio !== null && normalizedCoverageTarget !== null && coverageRatio > normalizedCoverageTarget) {
    warnings.push(
      `Site coverage ${formatPercent(coverageRatio)} exceeds target of ${formatPercent(normalizedCoverageTarget)}`
    );
  }

  return {
    footprintArea: roundNumber(footprintArea),
    totalFloorArea: roundNumber(totalFloorArea),
    grossVolume: roundNumber(buildingVolume),
    buildingHeight: roundNumber(buildingHeight),
    floors: geometryModel.floors.length,
    floorToFloor: roundNumber(buildingHeight / geometryModel.floors.length),
    siteArea: siteArea ? roundNumber(siteArea) : null,
    siteCoverage: coverageRatio !== null ? roundNumber(coverageRatio, 3) : null,
    coverageLimit: normalizedCoverageTarget !== null ? roundNumber(normalizedCoverageTarget, 3) : null,
    orientation: siteContext?.facadeOrientation ?? siteContext?.metrics?.orientationDeg ?? null,
    boundingBox: geometryModel.boundingBox,
    roof: geometryModel.roof,
    warnings
  };
}

function normalizeCoverageTarget(target) {
  if (target === null || target === undefined) return null;
  if (typeof target === 'string') {
    const numeric = parseFloat(target.replace('%', '').trim());
    if (!Number.isFinite(numeric)) return null;
    return target.includes('%') ? numeric / 100 : numeric;
  }
  if (Number.isFinite(target)) {
    return target > 1 ? target / 100 : target;
  }
  return null;
}

function computePlanarPolygonArea(vertices) {
  if (!Array.isArray(vertices) || vertices.length < 3) return null;
  let area = 0;
  for (let i = 0; i < vertices.length; i++) {
    const j = (i + 1) % vertices.length;
    area += vertices[i].x * vertices[j].y;
    area -= vertices[j].x * vertices[i].y;
  }
  return Math.abs(area / 2);
}

function roundNumber(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function formatPercent(value, digits = 1) {
  if (!Number.isFinite(value)) return 'N/A';
  return `${(value * 100).toFixed(digits)}%`;
}

export default {
  generateMassingModel
};

