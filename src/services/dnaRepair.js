/**
 * DNA Repair Service
 * 
 * Deterministic functions to fill missing DNA fields without AI calls.
 * Used to ensure DNA completeness before validation.
 */

import logger from '../utils/logger.js';

/**
 * Ensure all required sections exist in DNA
 * Adds empty/default sections if missing
 */
export function ensureRequiredSections(dna) {
  const repaired = { ...dna };

  // Ensure site section
  if (!repaired.site || typeof repaired.site !== 'object') {
    logger.warn('DNA missing site section, adding defaults');
    repaired.site = {
      polygon: [],
      area_m2: 150,
      orientation: 0,
      climate_zone: 'temperate',
      sun_path: 'south',
      wind_profile: 'moderate'
    };
  }

  // Ensure program section
  if (!repaired.program || typeof repaired.program !== 'object') {
    logger.warn('DNA missing program section, adding defaults');
    repaired.program = {
      floors: 2,
      rooms: []
    };
  }

  // Ensure style section
  if (!repaired.style || typeof repaired.style !== 'object') {
    logger.warn('DNA missing style section, adding defaults');
    repaired.style = {
      architecture: 'contemporary',
      materials: ['brick', 'wood', 'glass'],
      windows: {
        pattern: 'regular grid',
        proportion: '3:5'
      }
    };
  }

  // Ensure geometry_rules section
  if (!repaired.geometry_rules || typeof repaired.geometry_rules !== 'object') {
    logger.warn('DNA missing geometry_rules section, adding defaults');
    repaired.geometry_rules = {
      grid: '1m grid',
      max_span: '6m',
      roof_type: 'gable'
    };
  }

  return repaired;
}

/**
 * Fill missing site fields from location data
 */
export function fillMissingSiteFields(dna, locationData) {
  if (!dna.site) {
    dna.site = {};
  }

  const site = dna.site;

  // Fill polygon from location
  if (!Array.isArray(site.polygon) || site.polygon.length === 0) {
    if (locationData?.sitePolygon && Array.isArray(locationData.sitePolygon)) {
      site.polygon = locationData.sitePolygon;
      logger.info('Filled site.polygon from locationData');
    } else {
      // Ensure polygon is at least an empty array
      site.polygon = [];
    }
  }

  // Fill area from location or compute from polygon
  if (!site.area_m2 || site.area_m2 <= 0) {
    if (locationData?.siteAnalysis?.areaM2) {
      site.area_m2 = locationData.siteAnalysis.areaM2;
      logger.info('Filled site.area_m2 from locationData');
    } else if (Array.isArray(site.polygon) && site.polygon.length >= 3) {
      // Simple polygon area calculation (Shoelace formula)
      let area = 0;
      for (let i = 0; i < site.polygon.length; i++) {
        const j = (i + 1) % site.polygon.length;
        const p1 = site.polygon[i];
        const p2 = site.polygon[j];
        // Approximate: treat lat/lng as cartesian (good enough for small plots)
        area += (p1.lng || p1.lon || 0) * (p2.lat || 0);
        area -= (p2.lng || p2.lon || 0) * (p1.lat || 0);
      }
      site.area_m2 = Math.abs(area / 2) * 111000 * 111000; // Rough conversion
      logger.info('Computed site.area_m2 from polygon');
    } else {
      site.area_m2 = 150; // Default fallback
    }
  }

  // Fill climate zone
  if (!site.climate_zone) {
    site.climate_zone = locationData?.climate?.type || 'temperate';
    logger.info('Filled site.climate_zone from locationData');
  }

  // Fill sun path
  if (!site.sun_path) {
    site.sun_path = locationData?.sunPath?.optimalOrientation || 'south';
    logger.info('Filled site.sun_path from locationData');
  }

  // Fill wind profile
  if (!site.wind_profile) {
    site.wind_profile = locationData?.climate?.seasonal?.winter?.wind || 'moderate';
    logger.info('Filled site.wind_profile from locationData');
  }

  // Fill orientation
  if (typeof site.orientation !== 'number') {
    site.orientation = locationData?.siteAnalysis?.orientationDeg || 0;
  }

  return dna;
}

/**
 * Fill missing program fields from project spec
 */
export function fillProgramDefaults(dna, projectSpec) {
  if (!dna.program) {
    dna.program = {};
  }

  const program = dna.program;

  // Fill floors
  if (!program.floors || program.floors < 1) {
    program.floors = projectSpec?.floors || 2;
    logger.info('Filled program.floors from projectSpec');
  }

  // Fill rooms
  if (!Array.isArray(program.rooms) || program.rooms.length === 0) {
    if (Array.isArray(projectSpec?.programSpaces) && projectSpec.programSpaces.length > 0) {
      program.rooms = projectSpec.programSpaces.map(space => ({
        name: space.name || 'Room',
        area_m2: space.area || 20,
        floor: space.floor || 'ground',
        orientation: space.preferredOrientation || 'any'
      }));
      logger.info('Filled program.rooms from projectSpec');
    } else {
      // Generate default rooms based on floor count
      program.rooms = generateDefaultRooms(program.floors);
      logger.info('Generated default program.rooms');
    }
  }

  return dna;
}

/**
 * Generate default rooms for a given floor count
 */
function generateDefaultRooms(floors) {
  const rooms = [
    { name: 'Living Room', area_m2: 25, floor: 'ground', orientation: 'south' },
    { name: 'Kitchen', area_m2: 18, floor: 'ground', orientation: 'east' },
    { name: 'Entry', area_m2: 8, floor: 'ground', orientation: 'north' }
  ];

  if (floors > 1) {
    rooms.push(
      { name: 'Master Bedroom', area_m2: 20, floor: 'first', orientation: 'south' },
      { name: 'Bedroom 2', area_m2: 12, floor: 'first', orientation: 'south' },
      { name: 'Bathroom', area_m2: 6, floor: 'first', orientation: 'any' }
    );
  }

  if (floors > 2) {
    rooms.push(
      { name: 'Bedroom 3', area_m2: 12, floor: 'second', orientation: 'south' },
      { name: 'Study', area_m2: 10, floor: 'second', orientation: 'east' }
    );
  }

  return rooms;
}

/**
 * Fill missing style fields
 */
export function fillStyleDefaults(dna, portfolioSummary, locationData) {
  if (!dna.style) {
    dna.style = {};
  }

  const style = dna.style;

  // Fill architecture
  if (!style.architecture) {
    style.architecture = portfolioSummary?.dominantStyle 
      || locationData?.recommendedStyle 
      || 'contemporary';
    logger.info('Filled style.architecture');
  }

  // Fill materials
  if (!Array.isArray(style.materials) || style.materials.length === 0) {
    style.materials = portfolioSummary?.materials 
      || locationData?.localStyles?.[0]?.materials 
      || ['brick', 'wood', 'glass'];
    logger.info('Filled style.materials');
  }

  // Fill windows
  if (!style.windows || typeof style.windows !== 'object') {
    style.windows = {
      pattern: 'regular grid',
      proportion: '3:5'
    };
    logger.info('Filled style.windows');
  }

  return dna;
}

/**
 * Fill missing geometry_rules fields
 */
export function fillGeometryRulesDefaults(dna) {
  if (!dna.geometry_rules) {
    dna.geometry_rules = {};
  }

  const rules = dna.geometry_rules;

  if (!rules.grid) {
    rules.grid = '1m grid';
  }

  if (!rules.max_span) {
    rules.max_span = '6m';
  }

  if (!rules.roof_type) {
    rules.roof_type = 'gable';
  }

  return dna;
}

/**
 * Repair complete DNA
 * Orchestrates all repair functions
 */
export function repairDNA(dna, context = {}) {
  logger.info('Starting DNA repair...');

  let repaired = ensureRequiredSections(dna);
  repaired = fillMissingSiteFields(repaired, context.locationData);
  repaired = fillProgramDefaults(repaired, context.projectSpec);
  repaired = fillStyleDefaults(repaired, context.portfolioSummary, context.locationData);
  repaired = fillGeometryRulesDefaults(repaired);

  logger.success('DNA repair complete');

  return repaired;
}

export default {
  ensureRequiredSections,
  fillMissingSiteFields,
  fillProgramDefaults,
  fillStyleDefaults,
  fillGeometryRulesDefaults,
  repairDNA
};

