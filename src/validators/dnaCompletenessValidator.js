import logger from '../utils/logger.js';

const REQUIRED_DIRECTIONS = ['north', 'south', 'east', 'west'];

function isPositiveNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function hasElevations(viewSpecificFeatures = {}) {
  return REQUIRED_DIRECTIONS.every(direction => {
    const info = viewSpecificFeatures[direction];
    return info && (info.description || info.features || info.windows);
  });
}

function hasSections(sections = {}) {
  const longitudinal = sections.longitudinal || sections.sectionAA || sections.section_a;
  const cross = sections.cross || sections.sectionBB || sections.section_b;
  return Boolean(longitudinal && cross);
}

export function evaluateDNACompleteness(dna = {}) {
  const missing = [];
  const warnings = [];
  
  // Check for new structured DNA format (preferred)
  const hasStructuredFormat = dna._structured || (dna.site && dna.program && dna.style && dna.geometry_rules);
  
  const details = {
    // New structured DNA checks (required top-level keys)
    site: Boolean(dna.site || dna._structured?.site),
    program: Boolean(dna.program || dna._structured?.program),
    style: Boolean(dna.style || dna._structured?.style),
    geometry_rules: Boolean(dna.geometry_rules || dna._structured?.geometry_rules),
    
    // Legacy checks (for backwards compatibility)
    siteConstraints: Boolean(dna.siteConstraints && typeof dna.siteConstraints === 'object'),
    climate: Boolean(dna.climateDesign || dna.climate || dna.environmentStrategy),
    materialPalette: Array.isArray(dna.materials) && dna.materials.length >= 3,
    footprint: isPositiveNumber(dna.dimensions?.length) && isPositiveNumber(dna.dimensions?.width),
    boundaryLock: Boolean(dna.boundaryValidation?.validated),
    elevations: hasElevations(dna.viewSpecificFeatures),
    sections: hasSections(dna.sections),
    
    // Format indicator
    hasStructuredFormat
  };

  // Prioritize structured format checks
  if (hasStructuredFormat) {
    if (!details.site) {
      missing.push('site');
    }
    if (!details.program) {
      missing.push('program');
    }
    if (!details.style) {
      missing.push('style');
    }
    if (!details.geometry_rules) {
      missing.push('geometry_rules');
    }
  } else {
    // Legacy format checks
    if (!details.siteConstraints) {
      missing.push('site constraints');
    }

    if (!details.climate) {
      missing.push('climate response');
    }

    if (!details.materialPalette) {
      missing.push('material palette');
    }

    if (!details.footprint) {
      missing.push('footprint dimensions');
    }

    if (!details.boundaryLock) {
      missing.push('boundary lock');
    }

    if (!details.elevations) {
      missing.push('elevation expectations');
    }

    if (!details.sections) {
      missing.push('section expectations');
    }
  }

  const isComplete = missing.length === 0;

  if (!isComplete) {
    logger.warn('DNA completeness check failed', { missing, dnaSnapshot: {
      hasSiteConstraints: details.siteConstraints,
      hasClimate: details.climate,
      hasMaterials: details.materialPalette,
      hasFootprint: details.footprint,
      hasBoundaryLock: details.boundaryLock,
      hasElevations: details.elevations,
      hasSections: details.sections
    }});
  }

  if (details.boundaryLock && dna.boundaryValidation && dna.boundaryValidation.compliancePercentage < 90) {
    warnings.push('Boundary compliance below 90%');
  }

  return {
    isComplete,
    missing,
    warnings,
    details
  };
}

export function assertDNACompleteness(dna) {
  const result = evaluateDNACompleteness(dna);
  if (!result.isComplete) {
    const message = `Design DNA incomplete: missing ${result.missing.join(', ')}.`;
    const error = new Error(message);
    error.code = 'DNA_INCOMPLETE';
    error.details = result;
    throw error;
  }
  return result;
}

export default {
  evaluateDNACompleteness,
  assertDNACompleteness
};
