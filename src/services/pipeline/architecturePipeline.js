/**
 * Architecture Pipeline Orchestrator
 *
 * Main integration point for the modular architecture-AI pipeline.
 * Coordinates all 4 layers:
 *   Layer 1: Program Reasoning (ProgramDNA)
 *   Layer 2: Geometry Generation (GeometryDNA)
 *   Layer 3: Visualization (SVG renderings)
 *   Layer 4: Export (DXF, IFC)
 *
 * Usage in wizard workflow:
 *   const result = await generateArchitecturalDesign({
 *     buildingType: 'residential',
 *     totalArea: 150,
 *     sitePolygon: [...],
 *     styleDNA: {...}
 *   });
 */

import logger from '../core/logger.js';
// Layer 1: Program Reasoning
import { exportCompleteToDXF, exportToIFC, exportAll } from '../export/index.js';
// Layer 2: Geometry Generation
import {
  MVPFloorPlanGenerator,
  generateRoomPolygons as _generateRoomPolygons,
  generateWalls as _generateWalls,
  generateOpenings as _generateOpenings,
  generateAllElevations,
  generateStandardSections,
} from '../geometry/index.js';
import {
  MVPProgramReasoner,
  generateAdjacencyGraph as _generateAdjacencyGraph,
  solveAreaDistribution as _solveAreaDistribution,
} from '../program/index.js';
// Layer 3: Visualization
import {
  renderFloorPlan,
  renderElevation,
  renderSection,
  renderDrawingSet,
} from '../visualization/index.js';

// Layer 4: Export

/**
 * Pipeline configuration
 */
export const PIPELINE_CONFIG = {
  // Default options
  defaults: {
    floors: 2,
    floorHeight: 3.0,
    setbacks: { front: 3, back: 3, left: 3, right: 3 },
    gridSize: 0.1,
  },

  // Visualization defaults
  visualization: {
    scale: 100,
    showDimensions: true,
    showLabels: true,
    showGrid: false,
  },

  // Export defaults
  export: {
    dxf: { scale: '1:100', units: 'meters' },
    ifc: { schema: 'IFC4', includeOpenings: true },
  },
};

/**
 * Main pipeline entry point
 *
 * Generates a complete architectural design from user inputs.
 *
 * @param {Object} params - Input parameters
 * @param {string} params.buildingType - Building type (residential, office, clinic, etc.)
 * @param {string} [params.subType] - Building sub-type (detached, apartment, etc.)
 * @param {number} params.totalArea - Total gross area in m²
 * @param {number} [params.floors] - Number of floors
 * @param {Array} [params.sitePolygon] - Site boundary polygon [{x, y}, ...]
 * @param {Object} [params.styleDNA] - Style specifications
 * @param {Array} [params.customRooms] - Custom room list override
 * @param {Object} [params.options] - Additional options
 * @returns {Promise<Object>} Complete architectural design
 */
export async function generateArchitecturalDesign(params) {
  const startTime = Date.now();

  logger.info('=== Starting Architecture Pipeline ===');
  logger.info(
    `Building: ${params.buildingType} | Area: ${params.totalArea}m² | Floors: ${params.floors || 2}`
  );

  try {
    // ============ LAYER 1: PROGRAM REASONING ============
    logger.info('Layer 1: Generating program...');

    const programReasoner = new MVPProgramReasoner();
    const programDNA = await programReasoner.generateProgram({
      buildingType: params.buildingType,
      subType: params.subType,
      totalArea: params.totalArea,
      floors: params.floors || PIPELINE_CONFIG.defaults.floors,
      customRooms: params.customRooms,
      sitePolygon: params.sitePolygon,
      styleDNA: params.styleDNA,
    });

    logger.info(`Program generated: ${programDNA.rooms.length} rooms`);

    // ============ LAYER 2: GEOMETRY GENERATION ============
    logger.info('Layer 2: Generating geometry...');

    const geometryGenerator = new MVPFloorPlanGenerator({
      gridSize: PIPELINE_CONFIG.defaults.gridSize,
      floorHeight: params.floorHeight || PIPELINE_CONFIG.defaults.floorHeight,
    });

    const geometryDNA = await geometryGenerator.generateLayout(programDNA, {
      sitePolygon: params.sitePolygon,
      setbacks: params.setbacks || PIPELINE_CONFIG.defaults.setbacks,
    });

    // Generate elevations and sections
    const elevations = generateAllElevations(geometryDNA, params.styleDNA || {});
    const sections = generateStandardSections(geometryDNA, params.styleDNA || {});

    logger.info(`Geometry generated: ${geometryDNA.floors.length} floors`);

    // ============ LAYER 3: VISUALIZATION ============
    logger.info('Layer 3: Rendering visualizations...');

    const vizOptions = {
      ...PIPELINE_CONFIG.visualization,
      ...(params.options?.visualization || {}),
    };

    const visualizations = {
      floorPlans: {},
      elevations: {},
      sections: {},
    };

    // Render floor plans
    for (const floor of geometryDNA.floors) {
      visualizations.floorPlans[`L${floor.level}`] = renderFloorPlan({
        geometryDNA,
        floorLevel: floor.level,
        options: vizOptions,
      });
    }

    // Render elevations
    for (const [orientation, elevation] of Object.entries(elevations)) {
      visualizations.elevations[orientation] = renderElevation({
        elevation,
        options: vizOptions,
      });
    }

    // Render sections
    for (const [sectionId, section] of Object.entries(sections)) {
      visualizations.sections[sectionId] = renderSection({
        section,
        options: vizOptions,
      });
    }

    logger.info('Visualizations rendered');

    // ============ ASSEMBLE RESULT ============
    const result = {
      // Core DNA
      programDNA,
      geometryDNA,
      styleDNA: params.styleDNA || {},

      // Derived geometry
      elevations,
      sections,

      // Visualizations (SVG strings)
      visualizations,

      // Metadata
      metadata: {
        buildingType: params.buildingType,
        subType: params.subType,
        totalArea: params.totalArea,
        floors: geometryDNA.floors.length,
        roomCount: programDNA.rooms.length,
        generatedAt: new Date().toISOString(),
        generationTime: Date.now() - startTime,
        validation: geometryDNA.validation,
      },

      // Export helpers (lazy-loaded)
      export: {
        toDXF: (options = {}) =>
          exportCompleteToDXF(
            { geometry: geometryDNA, elevations, sections },
            { ...PIPELINE_CONFIG.export.dxf, ...options }
          ),
        toIFC: (projectInfo = {}, options = {}) =>
          exportToIFC({
            geometryDNA,
            programDNA,
            styleDNA: params.styleDNA,
            projectInfo,
            options: { ...PIPELINE_CONFIG.export.ifc, ...options },
          }),
        toAll: (projectInfo = {}, options = {}) =>
          exportAll(
            {
              geometry: geometryDNA,
              program: programDNA,
              style: params.styleDNA,
              elevations,
              sections,
            },
            projectInfo,
            options
          ),
      },
    };

    logger.info(`=== Pipeline Complete in ${result.metadata.generationTime}ms ===`);

    return result;
  } catch (error) {
    logger.error('Pipeline error:', error);
    throw new Error(`Architecture pipeline failed: ${error.message}`);
  }
}

/**
 * Generate program only (Layer 1)
 * Use when you need just the room program without geometry.
 */
export async function generateProgramOnly(params) {
  const reasoner = new MVPProgramReasoner();
  return reasoner.generateProgram({
    buildingType: params.buildingType,
    subType: params.subType,
    totalArea: params.totalArea,
    floors: params.floors || 2,
    customRooms: params.customRooms,
    sitePolygon: params.sitePolygon,
    styleDNA: params.styleDNA,
  });
}

/**
 * Generate geometry from existing program (Layer 2)
 * Use when you have a ProgramDNA and need geometry.
 */
export async function generateGeometryFromProgram(programDNA, constraints = {}) {
  const generator = new MVPFloorPlanGenerator();
  const geometryDNA = await generator.generateLayout(programDNA, constraints);

  // Add elevations and sections
  const elevations = generateAllElevations(geometryDNA, constraints.styleDNA || {});
  const sections = generateStandardSections(geometryDNA, constraints.styleDNA || {});

  return { geometryDNA, elevations, sections };
}

/**
 * Render visualizations from geometry (Layer 3)
 */
export function renderVisualizationsFromGeometry(geometryDNA, elevations, sections, options = {}) {
  return renderDrawingSet(
    { geometry: geometryDNA, elevations, sections },
    { ...PIPELINE_CONFIG.visualization, ...options }
  );
}

/**
 * Export design to files (Layer 4)
 */
export async function exportDesign(design, projectInfo = {}, formats = ['dxf', 'ifc']) {
  return exportAll(
    {
      geometry: design.geometryDNA,
      program: design.programDNA,
      style: design.styleDNA,
      elevations: design.elevations,
      sections: design.sections,
    },
    projectInfo,
    { formats }
  );
}

/**
 * Validate design against building codes
 */
export function validateDesign(design) {
  const programReasoner = new MVPProgramReasoner();
  return programReasoner.validateProgram(design.programDNA);
}

/**
 * Get suggested rooms for a building type
 */
export function getSuggestedRooms(buildingType, subType, totalArea, floors = 2) {
  const reasoner = new MVPProgramReasoner();
  return reasoner.getSuggestedRooms(buildingType, subType, totalArea, floors);
}

/**
 * Pipeline status check
 */
export function getPipelineStatus() {
  return {
    available: true,
    layers: {
      program: { status: 'ready', engine: 'MVPProgramReasoner' },
      geometry: { status: 'ready', engine: 'MVPFloorPlanGenerator' },
      visualization: { status: 'ready', engine: 'SVGRenderer' },
      export: { status: 'ready', formats: ['DXF', 'IFC'] },
    },
    buildingTypes: [
      'residential',
      'office',
      'clinic',
      'retail',
      'hospitality',
      'education',
      'industrial',
      'cultural',
      'religious',
      'mixed_use',
    ],
  };
}

const architecturePipeline = {
  generateArchitecturalDesign,
  generateProgramOnly,
  generateGeometryFromProgram,
  renderVisualizationsFromGeometry,
  exportDesign,
  validateDesign,
  getSuggestedRooms,
  getPipelineStatus,
  PIPELINE_CONFIG,
};

export default architecturePipeline;
