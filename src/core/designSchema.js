/**
 * Design Schema - Single Source of Truth
 * All components read/write from this unified structure
 */

/**
 * Validate and create a design object
 */
export function createDesign(partial = {}) {
  return {
    design_id: partial.design_id || `proj_${Date.now()}`,
    version: '1.0',
    timestamp: new Date().toISOString(),

    // Site context
    site: {
      address: partial.site?.address || '',
      lat: partial.site?.lat || 0,
      lon: partial.site?.lon || 0,
      north: partial.site?.north || 0, // degrees from true north
      areaM2: partial.site?.areaM2 || null,
      polygon: partial.site?.polygon || null
    },

    // DNA = Design tokens
    dna: {
      seed: partial.dna?.seed || Math.floor(Math.random() * 1000000),
      style: partial.dna?.style || 'Modern',
      module_mm: partial.dna?.module_mm || 300,
      wwr: partial.dna?.wwr || 0.32, // window-to-wall ratio
      roof: {
        type: partial.dna?.roof?.type || 'gable',
        pitch: partial.dna?.roof?.pitch || 35,
        material: partial.dna?.roof?.material || 'tiles',
        color: partial.dna?.roof?.color || '#654321'
      },
      materials: partial.dna?.materials || {
        exterior: { primary: 'Brick', color: '#8B4513', texture: 'textured' },
        windows: { type: 'Casement', frame: 'UPVC', color: '#FFFFFF' },
        doors: { main: { type: 'Panel', color: '#2C3E50' } },
        trim: { color: '#FFFFFF', material: 'UPVC' }
      },
      climate: partial.dna?.climate || {
        hdd: 2800,
        cdd: 120,
        prevailing_wind: 'SW'
      }
    },

    // Geometric specification
    dimensions: {
      length: partial.dimensions?.length || 15, // meters
      width: partial.dimensions?.width || 10,
      height: partial.dimensions?.height || 6.5,
      floorCount: partial.dimensions?.floorCount || 2
    },

    // Floor levels
    levels: partial.levels || [
      { z: 0, height_mm: 2700 },       // Ground floor
      { z: 2700, height_mm: 2600 }     // Upper floor
    ],

    // Rooms with polygons (coordinates in millimeters)
    rooms: partial.rooms || [],
    // Format: { id, name, level, poly: [[x,y], [x,y], ...], area }

    // Doors
    doors: partial.doors || [],
    // Format: { id, room_a, room_b, at: [x,y], width_mm, swing: 'L'|'R' }

    // Windows
    windows: partial.windows || [],
    // Format: { id, room, wall: 'N'|'S'|'E'|'W', center: [x,y], width_mm, sill_mm }

    // Camera configurations for views
    cameras: {
      axon: {
        type: 'ortho',
        az: 45,    // azimuth degrees
        el: 35,    // elevation degrees
        dist: 22,  // distance multiplier
        fov: 20
      },
      persp: {
        type: 'persp',
        az: 60,
        el: 20,
        dist: 26,
        fov: 60
      },
      interior_main: {
        type: 'persp',
        target: 'living',
        fov: 70
      }
    },

    // Generated outputs (URLs to rendered images)
    visualizations: partial.visualizations || {
      floorPlans: [],
      elevations: [],
      sections: [],
      exterior3D: [],
      interior3D: []
    }
  };
}

/**
 * Validate design structure
 */
export function validateDesignSchema(design) {
  const errors = [];

  if (!design.design_id) errors.push('Missing design_id');
  if (!design.dna) errors.push('Missing DNA');
  if (!design.dimensions) errors.push('Missing dimensions');
  if (!Array.isArray(design.levels)) errors.push('levels must be array');
  if (!Array.isArray(design.rooms)) errors.push('rooms must be array');

  if (errors.length > 0) {
    throw new Error(`Invalid design schema: ${errors.join(', ')}`);
  }

  return true;
}

/**
 * Convert legacy DNA format to new design.json format
 */
export function convertLegacyDNAToDesign(masterDNA, projectContext = {}, location = {}, siteMetrics = {}) {
  return createDesign({
    design_id: `converted_${masterDNA.projectID || Date.now()}`,
    site: {
      address: location?.address,
      lat: location?.coordinates?.lat,
      lon: location?.coordinates?.lng,
      north: siteMetrics?.orientationDeg || 0,
      areaM2: siteMetrics?.areaM2,
      polygon: siteMetrics?.polygon
    },
    dna: {
      seed: masterDNA.seed,
      style: masterDNA.materials?.exterior?.primary || 'Modern',
      module_mm: 300,
      wwr: 0.32,
      roof: {
        type: masterDNA.materials?.roof?.type || 'gable',
        pitch: parseFloat(masterDNA.materials?.roof?.pitch) || 35,
        material: masterDNA.materials?.roof?.material || 'tiles',
        color: masterDNA.materials?.roof?.color || '#654321'
      },
      materials: masterDNA.materials,
      climate: projectContext.climate
    },
    dimensions: {
      length: masterDNA.dimensions?.length || 15,
      width: masterDNA.dimensions?.width || 10,
      height: masterDNA.dimensions?.totalHeight || 6.5,
      floorCount: masterDNA.dimensions?.floorCount || 2
    },
    levels: [
      {
        z: 0,
        height_mm: parseFloat(masterDNA.dimensions?.groundFloorHeight) * 1000 || 2700
      },
      {
        z: parseFloat(masterDNA.dimensions?.groundFloorHeight) * 1000 || 2700,
        height_mm: parseFloat(masterDNA.dimensions?.upperFloorHeight) * 1000 || 2600
      }
    ],
    rooms: extractRoomsFromDNA(masterDNA),
    doors: extractDoorsFromDNA(masterDNA),
    windows: extractWindowsFromDNA(masterDNA)
  });
}

/**
 * Extract rooms from legacy DNA
 */
function extractRoomsFromDNA(dna) {
  const rooms = [];
  let roomId = 0;

  // Ground floor rooms
  if (dna.floorPlans?.ground?.rooms) {
    dna.floorPlans.ground.rooms.forEach(room => {
      const [length, width] = parseDimensions(room.dimensions);
      rooms.push({
        id: `rm_ground_${roomId++}`,
        name: room.name,
        level: 0,
        poly: simpleRectPoly(length, width), // TODO: spatial layout
        area: parseFloat(room.area) || (length * width)
      });
    });
  }

  // Upper floor rooms
  if (dna.floorPlans?.upper?.rooms) {
    dna.floorPlans.upper.rooms.forEach(room => {
      const [length, width] = parseDimensions(room.dimensions);
      rooms.push({
        id: `rm_upper_${roomId++}`,
        name: room.name,
        level: 1,
        poly: simpleRectPoly(length, width),
        area: parseFloat(room.area) || (length * width)
      });
    });
  }

  return rooms;
}

/**
 * Parse dimension string like "5.5m × 4.0m"
 */
function parseDimensions(dimStr) {
  if (!dimStr) return [5, 4];
  const match = dimStr.match(/(\d+\.?\d*)m?\s*×\s*(\d+\.?\d*)m?/);
  if (match) {
    return [parseFloat(match[1]), parseFloat(match[2])];
  }
  return [5, 4];
}

/**
 * Create simple rectangular polygon (in mm)
 */
function simpleRectPoly(lengthM, widthM) {
  const length = lengthM * 1000;
  const width = widthM * 1000;
  return [
    [0, 0],
    [length, 0],
    [length, width],
    [0, width]
  ];
}

/**
 * Extract doors from legacy DNA
 */
function extractDoorsFromDNA(dna) {
  // TODO: Parse door specifications from DNA
  // For now return empty array - will be enhanced in Phase 2
  return [];
}

/**
 * Extract windows from legacy DNA
 */
function extractWindowsFromDNA(dna) {
  // TODO: Parse window specifications from DNA
  // For now return empty array - will be enhanced in Phase 2
  return [];
}
