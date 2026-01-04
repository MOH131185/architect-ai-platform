/**
 * Architectural Elevation Generator
 *
 * Generates detailed architectural elevation SVGs with:
 * - Material patterns (brick, timber, render, stone, slate)
 * - Window details with glazing bars and sills
 * - Door details with panels and hardware
 * - Ground line with context
 * - Roof details with tiles/slates
 * - Level markers and dimension lines
 *
 * @module ArchitecturalElevationGenerator
 */

// Material Pattern Definitions
const MATERIAL_PATTERNS = {
  brick: {
    id: 'brick-pattern',
    width: 20,
    height: 8,
    create: (color = '#B8604E') => `
      <pattern id="brick-pattern" patternUnits="userSpaceOnUse" width="20" height="8">
        <rect width="20" height="8" fill="${color}"/>
        <line x1="0" y1="4" x2="20" y2="4" stroke="#8B4513" stroke-width="0.5"/>
        <line x1="10" y1="0" x2="10" y2="4" stroke="#8B4513" stroke-width="0.5"/>
        <line x1="0" y1="0" x2="0" y2="4" stroke="#8B4513" stroke-width="0.5"/>
        <line x1="20" y1="0" x2="20" y2="4" stroke="#8B4513" stroke-width="0.5"/>
        <line x1="5" y1="4" x2="5" y2="8" stroke="#8B4513" stroke-width="0.5"/>
        <line x1="15" y1="4" x2="15" y2="8" stroke="#8B4513" stroke-width="0.5"/>
      </pattern>
    `,
  },

  timber: {
    id: 'timber-pattern',
    width: 30,
    height: 200,
    create: (color = '#DEB887') => `
      <pattern id="timber-pattern" patternUnits="userSpaceOnUse" width="30" height="200">
        <rect width="30" height="200" fill="${color}"/>
        <line x1="0" y1="0" x2="0" y2="200" stroke="#A0522D" stroke-width="0.5"/>
        <line x1="30" y1="0" x2="30" y2="200" stroke="#A0522D" stroke-width="0.5"/>
        <path d="M5,0 Q8,50 5,100 Q3,150 6,200" stroke="#A0522D" stroke-width="0.3" fill="none"/>
        <path d="M15,0 Q12,60 15,120 Q18,180 15,200" stroke="#A0522D" stroke-width="0.3" fill="none"/>
        <path d="M25,0 Q23,40 25,80 Q28,140 24,200" stroke="#A0522D" stroke-width="0.3" fill="none"/>
      </pattern>
    `,
  },

  render: {
    id: 'render-pattern',
    width: 4,
    height: 4,
    create: (color = '#F5F5DC') => `
      <pattern id="render-pattern" patternUnits="userSpaceOnUse" width="4" height="4">
        <rect width="4" height="4" fill="${color}"/>
        <circle cx="1" cy="1" r="0.3" fill="#E8E8D0"/>
        <circle cx="3" cy="3" r="0.2" fill="#E8E8D0"/>
      </pattern>
    `,
  },

  stone: {
    id: 'stone-pattern',
    width: 40,
    height: 25,
    create: (color = '#D3D3D3') => `
      <pattern id="stone-pattern" patternUnits="userSpaceOnUse" width="40" height="25">
        <rect width="40" height="25" fill="${color}"/>
        <path d="M0,12.5 L40,12.5" stroke="#A9A9A9" stroke-width="0.5"/>
        <path d="M20,0 L20,12.5" stroke="#A9A9A9" stroke-width="0.5"/>
        <path d="M0,0 L0,12.5" stroke="#A9A9A9" stroke-width="0.5"/>
        <path d="M40,0 L40,12.5" stroke="#A9A9A9" stroke-width="0.5"/>
        <path d="M10,12.5 L10,25" stroke="#A9A9A9" stroke-width="0.5"/>
        <path d="M30,12.5 L30,25" stroke="#A9A9A9" stroke-width="0.5"/>
      </pattern>
    `,
  },

  slate: {
    id: 'slate-pattern',
    width: 15,
    height: 10,
    create: (color = '#708090') => `
      <pattern id="slate-pattern" patternUnits="userSpaceOnUse" width="15" height="10">
        <rect width="15" height="10" fill="${color}"/>
        <line x1="0" y1="10" x2="15" y2="10" stroke="#4A5568" stroke-width="0.5"/>
        <line x1="7.5" y1="0" x2="7.5" y2="10" stroke="#4A5568" stroke-width="0.3"/>
      </pattern>
    `,
  },

  tiles: {
    id: 'tiles-pattern',
    width: 12,
    height: 15,
    create: (color = '#8B4513') => `
      <pattern id="tiles-pattern" patternUnits="userSpaceOnUse" width="12" height="15">
        <rect width="12" height="15" fill="${color}"/>
        <path d="M0,15 Q6,12 12,15" stroke="#6B3000" stroke-width="0.5" fill="none"/>
        <path d="M6,0 Q12,-3 18,0" stroke="#6B3000" stroke-width="0.5" fill="none" transform="translate(-6,7.5)"/>
      </pattern>
    `,
  },

  glass: {
    id: 'glass-pattern',
    width: 10,
    height: 10,
    create: (color = '#87CEEB') => `
      <pattern id="glass-pattern" patternUnits="userSpaceOnUse" width="10" height="10">
        <rect width="10" height="10" fill="${color}" fill-opacity="0.3"/>
        <line x1="0" y1="0" x2="10" y2="10" stroke="#ADD8E6" stroke-width="0.2"/>
      </pattern>
    `,
  },
};

// Window Style Configurations
const WINDOW_STYLES = {
  casement: {
    glazingBars: true,
    divisions: { horizontal: 2, vertical: 1 },
    frameWidth: 3,
    sillProjection: 4,
    sillDepth: 2,
  },
  sash: {
    glazingBars: true,
    divisions: { horizontal: 3, vertical: 2 },
    frameWidth: 4,
    sillProjection: 5,
    sillDepth: 3,
  },
  fixed: {
    glazingBars: false,
    divisions: { horizontal: 1, vertical: 1 },
    frameWidth: 2,
    sillProjection: 3,
    sillDepth: 2,
  },
  picture: {
    glazingBars: false,
    divisions: { horizontal: 1, vertical: 1 },
    frameWidth: 5,
    sillProjection: 0,
    sillDepth: 0,
  },
};

// Door Style Configurations
const DOOR_STYLES = {
  panelled: {
    panels: 6,
    hasGlazing: false,
    handleSide: 'right',
    frameWidth: 5,
  },
  glazed: {
    panels: 2,
    hasGlazing: true,
    glazingRatio: 0.6,
    handleSide: 'right',
    frameWidth: 5,
  },
  solid: {
    panels: 0,
    hasGlazing: false,
    handleSide: 'right',
    frameWidth: 4,
  },
  french: {
    panels: 0,
    hasGlazing: true,
    glazingRatio: 0.8,
    handleSide: 'center',
    frameWidth: 4,
    doubleDoor: true,
  },
};

// Roof Types
const ROOF_TYPES = {
  gable: {
    overhang: 15,
    fasciaDepth: 8,
    soffit: true,
  },
  hip: {
    overhang: 12,
    fasciaDepth: 8,
    soffit: true,
  },
  flat: {
    overhang: 5,
    parapet: true,
    parapetHeight: 20,
  },
  mansard: {
    overhang: 10,
    fasciaDepth: 6,
    lowerPitch: 70,
    upperPitch: 30,
  },
};

/**
 * Generate architectural elevation SVG
 * @param {Object} elevationData - Elevation configuration
 * @param {Object} dna - Design DNA with materials and dimensions
 * @param {Object} options - Generation options
 * @returns {string} SVG string
 */
function generate(elevationData, dna, options = {}) {
  const {
    scale = 50, // pixels per meter (reduced from 100 for better fit)
    orientation = 'north',
    showDimensions = true,
    showLevelMarkers = true,
    showGroundContext = true,
    showMaterialPatterns = true,
  } = options;

  const building = elevationData.building || {};
  const materials = dna?.materials || [];
  const roofType = dna?.geometry_rules?.roof_type || 'gable';

  // Extract dimensions - prioritize DNA dimensions for consistency
  const buildingWidthMeters =
    building.width || dna?.dimensions?.width || dna?.dimensions?.length || 10;
  const buildingHeightMeters = building.height || dna?.dimensions?.height || 7;
  const floorHeightMeters = building.floorHeight || dna?.dimensions?.floorHeights?.[0] || 2.7;

  const buildingWidth = buildingWidthMeters * scale;
  const buildingHeight = buildingHeightMeters * scale;
  const floorHeight = floorHeightMeters * scale;

  // CRITICAL: Get floor count from canonical geometry (same source as sections)
  // Priority: 1) building.floors 2) dna.geometry.floors.length 3) dna.dimensions.floors 4) derive from height
  let floors = building.floors;
  if (!floors && dna?.geometry?.floors?.length) {
    floors = dna.geometry.floors.length;
  }
  if (!floors && dna?.dimensions?.floors) {
    floors = dna.dimensions.floors;
  }
  if (!floors) {
    // Derive from building height / floor height
    floors = Math.max(1, Math.round(buildingHeightMeters / floorHeightMeters));
  }

  // CRITICAL FIX: Calculate SVG dimensions based on building size + margins
  // This ensures elevations are LANDSCAPE (wider than tall) for typical buildings
  const marginLeft = 120; // Left margin for dimension labels
  const marginRight = 80; // Right margin
  const marginTop = 100; // Top margin for title and roof
  const marginBottom = 80; // Bottom margin for ground context

  // Estimate roof height addition (for gable roof with typical pitch)
  const roofPitch = dna?.geometry_rules?.roof_pitch || 35;
  const roofHeightAddition =
    roofType === 'flat' ? 0 : (buildingWidth / 2) * Math.tan((roofPitch * Math.PI) / 180) * 0.4;

  // Calculate SVG dimensions to fit the building with proper margins
  // Ensure minimum size and proper aspect ratio
  const svgWidth = Math.max(600, marginLeft + buildingWidth + marginRight);
  const svgHeight = Math.max(400, marginTop + buildingHeight + roofHeightAddition + marginBottom);

  const groundLevel = marginTop + buildingHeight + roofHeightAddition;

  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="0 0 ${svgWidth} ${svgHeight}"
     width="${svgWidth}" height="${svgHeight}"
     shape-rendering="crispEdges">

  <!-- Definitions -->
  <defs>
    ${generatePatternDefs(materials, showMaterialPatterns)}
    ${generateFilterDefs()}
  </defs>

  <!-- Background -->
  <rect width="${svgWidth}" height="${svgHeight}" fill="#FFFFFF"/>

  <!-- Title -->
  <text x="${svgWidth / 2}" y="30" font-family="Arial, sans-serif" font-size="16" font-weight="bold"
        text-anchor="middle" fill="#1a1a1a">${orientation.toUpperCase()} ELEVATION</text>

  <!-- Scale indicator -->
  <text x="${svgWidth / 2}" y="50" font-family="Arial, sans-serif" font-size="10"
        text-anchor="middle" fill="#666">Scale 1:${Math.round(1000 / scale)}</text>
`;

  // Draw ground context if enabled
  if (showGroundContext) {
    svg += drawGroundContext(marginLeft, groundLevel, buildingWidth, svgWidth, svgHeight);
  }

  // Draw main building wall
  svg += drawBuildingWall(
    marginLeft,
    marginTop,
    buildingWidth,
    buildingHeight,
    materials,
    roofType,
    scale
  );

  // Draw roof
  svg += drawRoof(marginLeft, marginTop, buildingWidth, roofType, materials, scale);

  // Draw windows
  const windows = elevationData.windows || [];
  windows.forEach((win) => {
    svg += drawWindow(win, marginLeft, marginTop, scale, floorHeight, groundLevel);
  });

  // Draw doors
  const doors = elevationData.doors || [];
  doors.forEach((door) => {
    svg += drawDoor(door, marginLeft, groundLevel, scale);
  });

  // Draw level markers if enabled
  if (showLevelMarkers) {
    svg += drawLevelMarkers(
      marginLeft,
      marginTop,
      buildingWidth,
      buildingHeight,
      floors,
      floorHeight,
      scale
    );
  }

  // Draw dimensions if enabled
  if (showDimensions) {
    svg += drawDimensions(marginLeft, marginTop, buildingWidth, buildingHeight, scale, building);
  }

  // Draw orientation indicator
  svg += drawOrientationIndicator(svgWidth - 60, svgHeight - 60, orientation);

  svg += `
</svg>`;

  return svg;
}

/**
 * Generate pattern definitions
 */
function generatePatternDefs(materials, showPatterns) {
  if (!showPatterns) {
    return '';
  }

  let defs = '';

  // Add all material patterns
  Object.entries(MATERIAL_PATTERNS).forEach(([name, pattern]) => {
    const material = materials.find(
      (m) => m.name?.toLowerCase().includes(name) || m.application?.toLowerCase().includes(name)
    );
    const color = material?.hexColor || undefined;
    defs += pattern.create(color);
  });

  return defs;
}

/**
 * Generate filter definitions for shadows and effects
 */
function generateFilterDefs() {
  return `
    <!-- Drop shadow filter -->
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="2" dy="2" stdDeviation="2" flood-opacity="0.3"/>
    </filter>

    <!-- Emboss filter for depth -->
    <filter id="emboss">
      <feConvolveMatrix kernelMatrix="1 0 0 0 0 0 0 0 -1" />
    </filter>

    <!-- Glass reflection -->
    <linearGradient id="glass-reflection" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#FFFFFF;stop-opacity:0.4"/>
      <stop offset="50%" style="stop-color:#87CEEB;stop-opacity:0.2"/>
      <stop offset="100%" style="stop-color:#FFFFFF;stop-opacity:0.1"/>
    </linearGradient>
  `;
}

/**
 * Draw ground context
 */
function drawGroundContext(x, groundY, buildingWidth, svgWidth, svgHeight) {
  const groundHeight = svgHeight - groundY - 20;

  return `
  <!-- Ground Context -->
  <g id="ground-context">
    <!-- Ground line -->
    <line x1="20" y1="${groundY}" x2="${svgWidth - 20}" y2="${groundY}"
          stroke="#333" stroke-width="2"/>

    <!-- Ground hatch (below grade) -->
    <pattern id="ground-hatch" patternUnits="userSpaceOnUse" width="10" height="10">
      <path d="M0,10 L10,0" stroke="#666" stroke-width="0.5"/>
    </pattern>
    <rect x="20" y="${groundY}" width="${svgWidth - 40}" height="${groundHeight}"
          fill="url(#ground-hatch)"/>

    <!-- Landscape elements -->
    <g id="landscape">
      <!-- Grass texture near building -->
      <ellipse cx="${x - 30}" cy="${groundY + 5}" rx="25" ry="8" fill="#228B22" opacity="0.6"/>
      <ellipse cx="${x + buildingWidth + 30}" cy="${groundY + 5}" rx="25" ry="8" fill="#228B22" opacity="0.6"/>

      <!-- Simple shrub on left -->
      <ellipse cx="${x - 40}" cy="${groundY - 15}" rx="15" ry="20" fill="#2E8B57"/>

      <!-- Simple shrub on right -->
      <ellipse cx="${x + buildingWidth + 40}" cy="${groundY - 12}" rx="12" ry="16" fill="#2E8B57"/>
    </g>

    <!-- Ground level label -->
    <text x="30" y="${groundY + 15}" font-family="Arial" font-size="8" fill="#666">GL ±0.000</text>
  </g>
`;
}

/**
 * Draw main building wall with material
 */
function drawBuildingWall(x, y, width, height, materials, roofType, scale) {
  // Determine wall material
  const wallMaterial = materials.find(
    (m) =>
      m.application?.toLowerCase().includes('wall') ||
      m.application?.toLowerCase().includes('facade')
  );

  let patternId = 'render-pattern'; // Default
  if (wallMaterial) {
    const name = wallMaterial.name?.toLowerCase() || '';
    if (name.includes('brick')) {
      patternId = 'brick-pattern';
    } else if (name.includes('timber') || name.includes('wood')) {
      patternId = 'timber-pattern';
    } else if (name.includes('stone')) {
      patternId = 'stone-pattern';
    } else if (name.includes('render') || name.includes('stucco')) {
      patternId = 'render-pattern';
    }
  }

  return `
  <!-- Main Building Wall -->
  <g id="building-wall">
    <!-- Wall with material pattern -->
    <rect x="${x}" y="${y}" width="${width}" height="${height}"
          fill="url(#${patternId})" stroke="#333" stroke-width="1.5"/>

    <!-- Wall outline for clarity -->
    <rect x="${x}" y="${y}" width="${width}" height="${height}"
          fill="none" stroke="#222" stroke-width="2"/>

    <!-- Corner quoins (if stone or brick) -->
    ${
      patternId === 'stone-pattern' || patternId === 'brick-pattern'
        ? `
    <g id="quoins" fill="#A9A9A9" stroke="#666" stroke-width="0.5">
      <!-- Left quoins -->
      <rect x="${x}" y="${y}" width="15" height="25"/>
      <rect x="${x}" y="${y + 30}" width="12" height="20"/>
      <rect x="${x}" y="${y + 55}" width="15" height="25"/>
      <rect x="${x}" y="${y + height - 50}" width="12" height="20"/>
      <rect x="${x}" y="${y + height - 25}" width="15" height="25"/>

      <!-- Right quoins -->
      <rect x="${x + width - 15}" y="${y}" width="15" height="25"/>
      <rect x="${x + width - 12}" y="${y + 30}" width="12" height="20"/>
      <rect x="${x + width - 15}" y="${y + 55}" width="15" height="25"/>
      <rect x="${x + width - 12}" y="${y + height - 50}" width="12" height="20"/>
      <rect x="${x + width - 15}" y="${y + height - 25}" width="15" height="25"/>
    </g>
    `
        : ''
    }
  </g>
`;
}

/**
 * Draw roof based on type
 */
function drawRoof(x, y, width, roofType, materials, scale) {
  const config = ROOF_TYPES[roofType] || ROOF_TYPES.gable;
  const overhang = config.overhang;

  // Determine roof material
  const roofMaterial = materials.find((m) => m.application?.toLowerCase().includes('roof'));

  let patternId = 'tiles-pattern'; // Default
  if (roofMaterial) {
    const name = roofMaterial.name?.toLowerCase() || '';
    if (name.includes('slate')) {
      patternId = 'slate-pattern';
    } else if (name.includes('tile')) {
      patternId = 'tiles-pattern';
    }
  }

  let svg = `
  <!-- Roof -->
  <g id="roof">
`;

  if (roofType === 'gable') {
    const roofPeakY = y - 80;
    const roofPeakX = x + width / 2;

    svg += `
    <!-- Gable roof -->
    <polygon points="${x - overhang},${y} ${roofPeakX},${roofPeakY} ${x + width + overhang},${y}"
             fill="url(#${patternId})" stroke="#333" stroke-width="2"/>

    <!-- Fascia board -->
    <line x1="${x - overhang}" y1="${y}" x2="${x - overhang - 5}" y2="${y + config.fasciaDepth}"
          stroke="#8B4513" stroke-width="3"/>
    <line x1="${x + width + overhang}" y1="${y}" x2="${x + width + overhang + 5}" y2="${y + config.fasciaDepth}"
          stroke="#8B4513" stroke-width="3"/>

    <!-- Ridge line -->
    <line x1="${roofPeakX - 20}" y1="${roofPeakY}" x2="${roofPeakX + 20}" y2="${roofPeakY}"
          stroke="#555" stroke-width="3"/>

    <!-- Eaves detail -->
    <line x1="${x - overhang}" y1="${y}" x2="${x + width + overhang}" y2="${y}"
          stroke="#8B4513" stroke-width="4"/>
`;
  } else if (roofType === 'hip') {
    const roofPeakY = y - 60;

    svg += `
    <!-- Hip roof (shown in elevation as trapezoid) -->
    <polygon points="${x - overhang},${y} ${x + 40},${roofPeakY} ${x + width - 40},${roofPeakY} ${x + width + overhang},${y}"
             fill="url(#${patternId})" stroke="#333" stroke-width="2"/>

    <!-- Ridge -->
    <line x1="${x + 40}" y1="${roofPeakY}" x2="${x + width - 40}" y2="${roofPeakY}"
          stroke="#555" stroke-width="3"/>

    <!-- Eaves -->
    <line x1="${x - overhang}" y1="${y}" x2="${x + width + overhang}" y2="${y}"
          stroke="#8B4513" stroke-width="4"/>
`;
  } else if (roofType === 'flat') {
    svg += `
    <!-- Flat roof with parapet -->
    <rect x="${x - 5}" y="${y - config.parapetHeight}" width="${width + 10}" height="${config.parapetHeight}"
          fill="#D3D3D3" stroke="#333" stroke-width="1.5"/>

    <!-- Parapet coping -->
    <rect x="${x - 8}" y="${y - config.parapetHeight - 5}" width="${width + 16}" height="5"
          fill="#A9A9A9" stroke="#333" stroke-width="1"/>

    <!-- Roof membrane indication -->
    <line x1="${x}" y1="${y - 2}" x2="${x + width}" y2="${y - 2}"
          stroke="#666" stroke-width="1" stroke-dasharray="5,3"/>
`;
  } else if (roofType === 'mansard') {
    const lowerHeight = 50;
    const upperHeight = 30;

    svg += `
    <!-- Mansard roof -->
    <polygon points="${x - overhang},${y} ${x + 10},${y - lowerHeight} ${x + width - 10},${y - lowerHeight} ${x + width + overhang},${y}"
             fill="url(#${patternId})" stroke="#333" stroke-width="2"/>
    <polygon points="${x + 10},${y - lowerHeight} ${x + width / 2},${y - lowerHeight - upperHeight} ${x + width - 10},${y - lowerHeight}"
             fill="url(#${patternId})" stroke="#333" stroke-width="2"/>

    <!-- Dormer windows in mansard -->
    <rect x="${x + width / 2 - 25}" y="${y - lowerHeight + 10}" width="50" height="35"
          fill="#87CEEB" stroke="#333" stroke-width="1"/>
    <polygon points="${x + width / 2 - 30},${y - lowerHeight + 10} ${x + width / 2},${y - lowerHeight - 10} ${x + width / 2 + 30},${y - lowerHeight + 10}"
             fill="url(#${patternId})" stroke="#333" stroke-width="1"/>
`;
  }

  svg += `
  </g>
`;

  return svg;
}

/**
 * Draw detailed window
 */
function drawWindow(win, baseX, baseY, scale, floorHeight, groundLevel) {
  const x = baseX + (win.x || 0) * scale;
  const floor = win.floor || 0;
  const y = groundLevel - (floor + 1) * floorHeight + (win.y || 0.3) * scale;
  const width = (win.width || 1.2) * scale;
  const height = (win.height || 1.5) * scale;

  // Normalize style name and provide fallback to casement
  const styleName = (win.style || 'casement').toLowerCase();
  const matchedStyle = styleName.includes('sash')
    ? 'sash'
    : styleName.includes('fixed')
      ? 'fixed'
      : styleName.includes('picture')
        ? 'picture'
        : 'casement';
  const style = WINDOW_STYLES[matchedStyle] || WINDOW_STYLES.casement;

  const frameWidth = style.frameWidth || 3;
  const innerWidth = width - frameWidth * 2;
  const innerHeight = height - frameWidth * 2;

  let svg = `
  <!-- Window at floor ${floor} -->
  <g id="window-${floor}-${win.x}" transform="translate(${x}, ${y})">
    <!-- Window reveal/recess -->
    <rect x="-3" y="-3" width="${width + 6}" height="${height + 6}"
          fill="#888" stroke="none"/>

    <!-- Window frame -->
    <rect x="0" y="0" width="${width}" height="${height}"
          fill="#FFFFFF" stroke="#333" stroke-width="1.5"/>

    <!-- Frame inner edge -->
    <rect x="${frameWidth}" y="${frameWidth}" width="${innerWidth}" height="${innerHeight}"
          fill="url(#glass-reflection)" stroke="#666" stroke-width="1"/>
`;

  // Add glazing bars if style requires
  if (style.glazingBars) {
    const hDivisions = style.divisions.horizontal;
    const vDivisions = style.divisions.vertical;

    // Horizontal glazing bars
    for (let i = 1; i < hDivisions; i++) {
      const barY = frameWidth + (innerHeight / hDivisions) * i;
      svg += `
    <line x1="${frameWidth}" y1="${barY}" x2="${width - frameWidth}" y2="${barY}"
          stroke="#666" stroke-width="2"/>`;
    }

    // Vertical glazing bars
    for (let i = 1; i < vDivisions; i++) {
      const barX = frameWidth + (innerWidth / vDivisions) * i;
      svg += `
    <line x1="${barX}" y1="${frameWidth}" x2="${barX}" y2="${height - frameWidth}"
          stroke="#666" stroke-width="2"/>`;
    }

    // Center meeting rail for sash windows
    if (win.style === 'sash') {
      svg += `
    <line x1="${frameWidth - 2}" y1="${height / 2}" x2="${width - frameWidth + 2}" y2="${height / 2}"
          stroke="#444" stroke-width="4"/>`;
    }
  }

  // Add sill projection
  if (style.sillProjection > 0) {
    svg += `
    <!-- Window sill -->
    <rect x="-${style.sillProjection}" y="${height}" width="${width + style.sillProjection * 2}" height="${style.sillDepth}"
          fill="#A9A9A9" stroke="#666" stroke-width="1"/>
    <!-- Sill drip edge -->
    <line x1="-${style.sillProjection}" y1="${height + style.sillDepth + 1}"
          x2="${width + style.sillProjection}" y2="${height + style.sillDepth + 1}"
          stroke="#888" stroke-width="1"/>`;
  }

  // Add lintel/header
  svg += `
    <!-- Lintel -->
    <rect x="-2" y="-8" width="${width + 4}" height="6"
          fill="#8B7355" stroke="#666" stroke-width="0.5"/>
`;

  svg += `
  </g>
`;

  return svg;
}

/**
 * Draw detailed door
 */
function drawDoor(door, baseX, groundLevel, scale) {
  const x = baseX + (door.x || 0) * scale;
  const width = (door.width || 0.9) * scale;
  const height = (door.height || 2.1) * scale;
  const y = groundLevel - height;

  // Normalize style name and provide fallback to panelled
  const styleName = (door.style || 'panelled').toLowerCase();
  const matchedStyle = styleName.includes('glazed')
    ? 'glazed'
    : styleName.includes('solid')
      ? 'solid'
      : styleName.includes('french')
        ? 'french'
        : 'panelled';
  const style = DOOR_STYLES[matchedStyle] || DOOR_STYLES.panelled;

  const frameWidth = style.frameWidth || 5;
  const innerWidth = width - frameWidth * 2;
  const innerHeight = height - frameWidth * 2;

  let svg = `
  <!-- Main Entry Door -->
  <g id="door" transform="translate(${x}, ${y})">
    <!-- Door reveal -->
    <rect x="-5" y="-5" width="${width + 10}" height="${height + 5}"
          fill="#555" stroke="none"/>

    <!-- Door frame -->
    <rect x="0" y="0" width="${width}" height="${height}"
          fill="#5C4033" stroke="#333" stroke-width="2"/>

    <!-- Door panel area -->
    <rect x="${frameWidth}" y="${frameWidth}" width="${innerWidth}" height="${innerHeight}"
          fill="#6B4423" stroke="#4A3520" stroke-width="1"/>
`;

  // Add panels or glazing based on style
  if (style.hasGlazing) {
    const glazingHeight = innerHeight * style.glazingRatio;
    svg += `
    <!-- Door glazing -->
    <rect x="${frameWidth + 5}" y="${frameWidth + 5}" width="${innerWidth - 10}" height="${glazingHeight - 10}"
          fill="url(#glass-reflection)" stroke="#444" stroke-width="1"/>
    <!-- Glazing bars -->
    <line x1="${width / 2}" y1="${frameWidth + 5}" x2="${width / 2}" y2="${frameWidth + glazingHeight - 5}"
          stroke="#444" stroke-width="2"/>
    <line x1="${frameWidth + 5}" y1="${frameWidth + glazingHeight / 2}"
          x2="${width - frameWidth - 5}" y2="${frameWidth + glazingHeight / 2}"
          stroke="#444" stroke-width="2"/>
`;
  } else if (style.panels > 0) {
    // Draw traditional panel layout
    const panelRows = style.panels > 4 ? 3 : 2;
    const panelCols = 2;
    const panelWidth = (innerWidth - 15) / panelCols;
    const panelHeight = (innerHeight - 20) / panelRows;

    for (let row = 0; row < panelRows; row++) {
      for (let col = 0; col < panelCols; col++) {
        const px = frameWidth + 5 + col * (panelWidth + 5);
        const py = frameWidth + 5 + row * (panelHeight + 5);
        svg += `
    <rect x="${px}" y="${py}" width="${panelWidth}" height="${panelHeight}"
          fill="#5C4033" stroke="#4A3520" stroke-width="1"/>
    <rect x="${px + 3}" y="${py + 3}" width="${panelWidth - 6}" height="${panelHeight - 6}"
          fill="#6B4423" stroke="#5C4033" stroke-width="0.5"/>`;
      }
    }
  }

  // Add door hardware
  const handleX = style.handleSide === 'right' ? width - frameWidth - 15 : frameWidth + 5;
  const handleY = height / 2;

  svg += `
    <!-- Door handle -->
    <ellipse cx="${handleX}" cy="${handleY}" rx="5" ry="5" fill="#C0C0C0" stroke="#888" stroke-width="0.5"/>
    <rect x="${handleX - 2}" y="${handleY + 5}" width="4" height="15" fill="#C0C0C0" stroke="#888" stroke-width="0.5"/>

    <!-- Door knocker/letterbox -->
    <rect x="${width / 2 - 15}" y="${handleY - 40}" width="30" height="10" fill="#C0C0C0" stroke="#888" stroke-width="0.5"/>
`;

  // Add threshold
  svg += `
    <!-- Threshold -->
    <rect x="-3" y="${height}" width="${width + 6}" height="5"
          fill="#8B7355" stroke="#666" stroke-width="1"/>

    <!-- Step -->
    <rect x="-10" y="${height + 5}" width="${width + 20}" height="8"
          fill="#A9A9A9" stroke="#666" stroke-width="1"/>
`;

  // Add transom light above door if height allows
  if (height > 200) {
    svg += `
    <!-- Transom light -->
    <rect x="${frameWidth}" y="-25" width="${innerWidth}" height="20"
          fill="url(#glass-reflection)" stroke="#5C4033" stroke-width="2"/>
    <line x1="${width / 2}" y1="-25" x2="${width / 2}" y2="-5" stroke="#5C4033" stroke-width="2"/>
`;
  }

  svg += `
  </g>
`;

  return svg;
}

/**
 * Draw level markers
 */
function drawLevelMarkers(x, y, width, height, floors, floorHeight, scale) {
  const markerX = x - 50;
  let svg = `
  <!-- Level Markers -->
  <g id="level-markers">
`;

  // Ground level
  svg += `
    <g transform="translate(${markerX}, ${y + height})">
      <line x1="0" y1="0" x2="40" y2="0" stroke="#333" stroke-width="1"/>
      <polygon points="35,-3 40,0 35,3" fill="#333"/>
      <text x="-5" y="4" font-family="Arial" font-size="8" text-anchor="end" fill="#333">GL</text>
      <text x="-5" y="14" font-family="Arial" font-size="7" text-anchor="end" fill="#666">±0.000</text>
    </g>
`;

  // Floor levels
  for (let i = 1; i <= floors; i++) {
    const levelY = y + height - i * floorHeight;
    const levelLabel = i === 1 ? 'FFL' : `L${i}`;
    const levelHeight = (i * (floorHeight / scale)).toFixed(3);

    svg += `
    <g transform="translate(${markerX}, ${levelY})">
      <line x1="0" y1="0" x2="40" y2="0" stroke="#333" stroke-width="1" stroke-dasharray="5,3"/>
      <polygon points="35,-3 40,0 35,3" fill="#333"/>
      <text x="-5" y="4" font-family="Arial" font-size="8" text-anchor="end" fill="#333">${levelLabel}</text>
      <text x="-5" y="14" font-family="Arial" font-size="7" text-anchor="end" fill="#666">+${levelHeight}</text>
    </g>
`;
  }

  // Ridge/roof level
  svg += `
    <g transform="translate(${markerX}, ${y - 80})">
      <line x1="0" y1="0" x2="40" y2="0" stroke="#333" stroke-width="1" stroke-dasharray="2,2"/>
      <text x="-5" y="4" font-family="Arial" font-size="8" text-anchor="end" fill="#333">RIDGE</text>
    </g>
`;

  svg += `
  </g>
`;

  return svg;
}

/**
 * Draw dimensions
 */
function drawDimensions(x, y, width, height, scale, building) {
  const dimOffset = 30;
  const buildingWidthM = (building.width || width / scale).toFixed(2);
  const buildingHeightM = (building.height || height / scale).toFixed(2);

  return `
  <!-- Dimensions -->
  <g id="dimensions" stroke="#333" stroke-width="0.5" fill="#333" font-family="Arial" font-size="9">
    <!-- Width dimension -->
    <g transform="translate(${x}, ${y + height + dimOffset})">
      <!-- Dimension line -->
      <line x1="0" y1="0" x2="${width}" y2="0"/>
      <!-- End ticks -->
      <line x1="0" y1="-5" x2="0" y2="5"/>
      <line x1="${width}" y1="-5" x2="${width}" y2="5"/>
      <!-- Extension lines -->
      <line x1="0" y1="${-dimOffset + 5}" x2="0" y2="-5" stroke-dasharray="2,2"/>
      <line x1="${width}" y1="${-dimOffset + 5}" x2="${width}" y2="-5" stroke-dasharray="2,2"/>
      <!-- Dimension text -->
      <text x="${width / 2}" y="-5" text-anchor="middle">${buildingWidthM}m</text>
    </g>

    <!-- Height dimension -->
    <g transform="translate(${x + width + dimOffset}, ${y})">
      <!-- Dimension line -->
      <line x1="0" y1="0" x2="0" y2="${height}"/>
      <!-- End ticks -->
      <line x1="-5" y1="0" x2="5" y2="0"/>
      <line x1="-5" y1="${height}" x2="5" y2="${height}"/>
      <!-- Extension lines -->
      <line x1="${-dimOffset + 5}" y1="0" x2="-5" y2="0" stroke-dasharray="2,2"/>
      <line x1="${-dimOffset + 5}" y1="${height}" x2="-5" y2="${height}" stroke-dasharray="2,2"/>
      <!-- Dimension text -->
      <text x="10" y="${height / 2}" text-anchor="start" transform="rotate(90, 10, ${height / 2})">${buildingHeightM}m</text>
    </g>
  </g>
`;
}

/**
 * Draw orientation indicator
 */
function drawOrientationIndicator(x, y, orientation) {
  const arrows = {
    north: 0,
    east: 90,
    south: 180,
    west: 270,
  };
  const rotation = arrows[orientation.toLowerCase()] || 0;

  return `
  <!-- Orientation Indicator -->
  <g transform="translate(${x}, ${y})">
    <circle cx="0" cy="0" r="25" fill="none" stroke="#333" stroke-width="1"/>
    <g transform="rotate(${rotation})">
      <!-- Arrow pointing to viewing direction -->
      <polygon points="0,-20 -8,-5 0,-10 8,-5" fill="#333"/>
      <line x1="0" y1="-10" x2="0" y2="15" stroke="#333" stroke-width="2"/>
    </g>
    <text x="0" y="35" font-family="Arial" font-size="10" text-anchor="middle" fill="#333">
      ${orientation.toUpperCase()}
    </text>
    <text x="0" y="45" font-family="Arial" font-size="8" text-anchor="middle" fill="#666">
      ELEVATION
    </text>
  </g>
`;
}

/**
 * Generate elevation from DNA
 * @param {Object} dna - Design DNA
 * @param {string} orientation - Elevation orientation (north, south, east, west)
 * @param {Object} options - Generation options
 * @returns {string} SVG string
 */
function generateFromDNA(dna, orientation = 'north', options = {}) {
  // CRITICAL: Get floor count from canonical geometry (same source as sections)
  // Priority: 1) geometry.floors.length 2) dimensions.floors 3) rooms 4) derive from height
  let floors = dna?.geometry?.floors?.length;

  if (!floors && dna?.dimensions?.floors) {
    floors = dna.dimensions.floors;
  }

  // Derive from rooms distribution if available
  if (!floors && (dna?.rooms || dna?.program?.rooms)) {
    const rooms = dna?.rooms || dna?.program?.rooms || [];
    const maxFloor = rooms.reduce((max, room) => {
      const roomFloor =
        room.floor ??
        (room.level === 'ground' ? 0 : room.level === 'first' ? 1 : (room.level ?? 0));
      return Math.max(max, roomFloor);
    }, 0);
    floors = maxFloor + 1;
  }

  // Fallback: derive from height
  if (!floors) {
    const totalHeight = dna?.dimensions?.height || 7;
    const typicalFloorHeight = dna?.dimensions?.floorHeights?.[0] || 2.7;
    floors = Math.max(1, Math.round(totalHeight / typicalFloorHeight));
  }

  const building = {
    width: dna?.dimensions?.width || dna?.dimensions?.length || 10,
    height: dna?.dimensions?.height || 7,
    floorHeight: dna?.dimensions?.floorHeights?.[0] || 2.7,
    floors,
  };

  // Get view-specific features
  const viewFeatures = dna?.viewSpecificFeatures?.[orientation.toLowerCase()] || {};

  // Build window array from view features
  const windows = [];
  const windowCount = viewFeatures.windows || 4;
  const hasEntrance = viewFeatures.mainEntrance || viewFeatures.entrance;

  // Distribute windows across the facade
  const windowSpacing = building.width / (windowCount + 1);
  for (let i = 0; i < windowCount; i++) {
    // Skip window position if door is there
    const windowX = windowSpacing * (i + 1) - 0.6; // Center window
    if (hasEntrance && Math.abs(windowX - building.width / 2) < 1) {
      continue;
    }

    windows.push({
      x: windowX,
      floor: i % 2, // Alternate between floors
      width: 1.2,
      height: 1.5,
      style: dna?.style?.windowStyle || 'casement',
    });
  }

  // Add upper floor windows
  for (let i = 0; i < windowCount; i++) {
    const windowX = windowSpacing * (i + 1) - 0.6;
    windows.push({
      x: windowX,
      floor: 1,
      width: 1.0,
      height: 1.2,
      style: dna?.style?.windowStyle || 'sash',
    });
  }

  // Build door array
  const doors = [];
  if (hasEntrance) {
    doors.push({
      x: building.width / 2 - 0.45, // Center door
      width: 0.9,
      height: 2.1,
      style: viewFeatures.doorStyle || 'panelled',
    });
  }

  // Check for patio doors
  if (viewFeatures.patioDoors) {
    doors.push({
      x: building.width * 0.7,
      width: 1.8,
      height: 2.1,
      style: 'french',
    });
  }

  const elevationData = {
    building,
    windows,
    doors,
  };

  return generate(elevationData, dna, { ...options, orientation });
}

// Export functions
export { generate, generateFromDNA, MATERIAL_PATTERNS, WINDOW_STYLES, DOOR_STYLES, ROOF_TYPES };

export default {
  generate,
  generateFromDNA,
  MATERIAL_PATTERNS,
  WINDOW_STYLES,
  DOOR_STYLES,
  ROOF_TYPES,
};
