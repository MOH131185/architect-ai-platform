/**
 * Vector Exporter
 * Generates SVG, DXF, and glTF exports from design geometry
 * Saves to public/technical/ directory
 */

import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter';

/**
 * Export floor plan as SVG with dimensions
 */
export function exportFloorPlanSVG(design, level = 0) {
  console.log(`📐 Exporting floor plan SVG (level ${level})...`);

  const rooms = design.rooms.filter(r => r.level === level);
  if (rooms.length === 0) {
    console.warn(`No rooms on level ${level}`);
    return null;
  }

  const footprintLength = design.dimensions.length * 1000; // mm
  const footprintWidth = design.dimensions.width * 1000;
  const scale = 0.1; // 1mm = 0.1 SVG units (1:10 scale)

  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="${footprintLength * scale}"
     height="${footprintWidth * scale}"
     viewBox="0 0 ${footprintLength * scale} ${footprintWidth * scale}">
  <defs>
    <style>
      .wall { fill: none; stroke: #000; stroke-width: 2; }
      .room-label { font-family: Arial; font-size: 12px; fill: #333; }
      .dimension { font-family: Arial; font-size: 10px; fill: #666; }
      .dimension-line { stroke: #999; stroke-width: 1; stroke-dasharray: 2,2; }
      .door { fill: none; stroke: #00f; stroke-width: 1.5; }
      .window { fill: none; stroke: #0af; stroke-width: 2; }
    </style>
  </defs>

  <!-- Background -->
  <rect width="100%" height="100%" fill="#fff"/>

  <!-- Title Block -->
  <text x="10" y="20" style="font-family: Arial; font-size: 14px; font-weight: bold;">
    Floor Plan - Level ${level} (Ground Floor)
  </text>
  <text x="10" y="35" class="dimension">
    Scale: 1:${1/scale} | Design ID: ${design.design_id}
  </text>

`;

  // Draw building outline
  svg += `  <!-- Building Outline -->\n`;
  svg += `  <rect x="0" y="0" width="${footprintLength * scale}" height="${footprintWidth * scale}"
        fill="none" stroke="#666" stroke-width="3"/>\n\n`;

  // Draw rooms
  svg += `  <!-- Rooms -->\n`;
  rooms.forEach(room => {
    if (!room.poly || room.poly.length < 3) return;

    const points = room.poly.map(([x, y]) => `${x * scale},${y * scale}`).join(' ');

    svg += `  <polygon points="${points}" class="wall"/>\n`;

    // Room label
    if (room.center) {
      const [cx, cy] = room.center;
      svg += `  <text x="${cx * scale}" y="${cy * scale}" class="room-label" text-anchor="middle">
    ${room.name}
  </text>\n`;
      svg += `  <text x="${cx * scale}" y="${cy * scale + 15}" class="dimension" text-anchor="middle">
    ${room.area.toFixed(1)} m²
  </text>\n`;
    }
  });

  // Draw doors
  if (design.doors && design.doors.length > 0) {
    svg += `\n  <!-- Doors -->\n`;
    design.doors.forEach(door => {
      if (!door.at) return;
      const [x, y] = door.at;
      const width = (door.width_mm || 900) * scale;

      // Door symbol (arc for swing)
      svg += `  <path d="M ${x * scale - width/2} ${y * scale}
                       Q ${x * scale} ${y * scale - width/2} ${x * scale + width/2} ${y * scale}"
              class="door"/>\n`;
    });
  }

  // Draw windows
  if (design.windows && design.windows.length > 0) {
    svg += `\n  <!-- Windows -->\n`;
    design.windows.forEach(window => {
      if (!window.center) return;
      const [x, y] = window.center;
      const width = (window.width_mm || 1200) * scale;

      // Window symbol (double line)
      svg += `  <line x1="${x * scale - width/2}" y1="${y * scale}"
                    x2="${x * scale + width/2}" y2="${y * scale}"
                    class="window"/>\n`;
    });
  }

  // Dimension lines
  svg += `\n  <!-- Overall Dimensions -->\n`;
  const dimY = footprintWidth * scale + 30;
  svg += `  <line x1="0" y1="${dimY}" x2="${footprintLength * scale}" y2="${dimY}" class="dimension-line"/>\n`;
  svg += `  <text x="${footprintLength * scale / 2}" y="${dimY + 15}" class="dimension" text-anchor="middle">
    ${design.dimensions.length.toFixed(2)}m
  </text>\n`;

  svg += `</svg>`;

  return svg;
}

/**
 * Export elevation as SVG
 */
export function exportElevationSVG(design, direction = 'north') {
  console.log(`📐 Exporting ${direction} elevation SVG...`);

  const length = direction === 'north' || direction === 'south'
    ? design.dimensions.length * 1000
    : design.dimensions.width * 1000;
  const height = design.dimensions.height * 1000;
  const scale = 0.1;

  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="${length * scale}"
     height="${height * scale}"
     viewBox="0 0 ${length * scale} ${height * scale}">
  <defs>
    <style>
      .outline { fill: none; stroke: #000; stroke-width: 2; }
      .window { fill: #add8e6; stroke: #000; stroke-width: 1; }
      .door { fill: #8b4513; stroke: #000; stroke-width: 1; }
      .roof { fill: #cd853f; stroke: #000; stroke-width: 2; }
      .label { font-family: Arial; font-size: 10px; fill: #333; }
    </style>
  </defs>

  <rect width="100%" height="100%" fill="#f0f0f0"/>

  <text x="10" y="15" style="font-family: Arial; font-size: 12px; font-weight: bold;">
    ${direction.toUpperCase()} Elevation
  </text>

  <!-- Building Outline -->
  <rect x="0" y="0" width="${length * scale}" height="${height * scale}" class="outline"/>

`;

  // Add windows for this elevation
  const elevWindows = (design.windows || []).filter(w => w.wall === direction[0].toUpperCase());
  elevWindows.forEach(window => {
    const [x] = window.center;
    const width = window.width_mm * scale;
    const windowHeight = window.height_mm * scale;
    const sill = (height - window.sill_mm - window.height_mm) * scale;

    svg += `  <rect x="${x * scale - width/2}" y="${sill}"
                width="${width}" height="${windowHeight}" class="window"/>\n`;
  });

  // Add door (if on this elevation)
  const entranceDoor = (design.doors || []).find(d => d.type === 'main_entrance');
  if (entranceDoor && direction === 'north') {
    const [x] = entranceDoor.at;
    const doorWidth = entranceDoor.width_mm * scale;
    const doorHeight = entranceDoor.height_mm * scale;
    const doorY = height * scale - doorHeight;

    svg += `  <rect x="${x * scale - doorWidth/2}" y="${doorY}"
                width="${doorWidth}" height="${doorHeight}" class="door"/>\n`;
  }

  // Add roof outline if present
  if (design.roof && design.roof.geometry) {
    const roof = design.roof.geometry;
    if (roof.type === 'gable' && (direction === 'east' || direction === 'west')) {
      const ridgeHeight = roof.ridge.start[2] * 1000 * scale;
      const baseY = height * scale;
      svg += `  <polygon points="0,${baseY} ${length * scale / 2},${baseY - ridgeHeight} ${length * scale},${baseY}"
                  class="roof"/>\n`;
    }
  }

  svg += `
  <text x="5" y="${height * scale + 15}" class="label">
    Height: ${design.dimensions.height.toFixed(2)}m
  </text>
</svg>`;

  return svg;
}

/**
 * Export section as SVG
 */
export function exportSectionSVG(design, type = 'longitudinal') {
  console.log(`📐 Exporting ${type} section SVG...`);

  const length = type === 'longitudinal'
    ? design.dimensions.length * 1000
    : design.dimensions.width * 1000;
  const height = design.dimensions.height * 1000;
  const scale = 0.1;

  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="${length * scale}"
     height="${height * scale}"
     viewBox="0 0 ${length * scale} ${height * scale}">
  <defs>
    <style>
      .cut { fill: #ddd; stroke: #000; stroke-width: 2; }
      .floor { fill: #999; stroke: #000; stroke-width: 1.5; }
      .level-line { stroke: #666; stroke-width: 1; stroke-dasharray: 3,3; }
      .label { font-family: Arial; font-size: 10px; fill: #333; }
    </style>
  </defs>

  <rect width="100%" height="100%" fill="#f9f9f9"/>

  <text x="10" y="15" style="font-family: Arial; font-size: 12px; font-weight: bold;">
    Section ${type === 'longitudinal' ? 'A-A' : 'B-B'} (${type})
  </text>

  <!-- Exterior walls -->
  <rect x="0" y="0" width="5" height="${height * scale}" class="cut"/>
  <rect x="${length * scale - 5}" y="0" width="5" height="${height * scale}" class="cut"/>

`;

  // Draw floor levels
  if (design.levels && design.levels.length > 0) {
    let currentZ = 0;
    design.levels.forEach((level, idx) => {
      const levelY = (height - currentZ) * scale;
      svg += `  <!-- Level ${idx} -->\n`;
      svg += `  <rect x="0" y="${levelY - 5}" width="${length * scale}" height="5" class="floor"/>\n`;
      svg += `  <line x1="0" y1="${levelY}" x2="${length * scale}" y2="${levelY}" class="level-line"/>\n`;
      svg += `  <text x="5" y="${levelY - 10}" class="label">Level ${idx} (${(currentZ / 1000).toFixed(2)}m)</text>\n`;

      currentZ += level.height_mm;
    });
  }

  // Roof profile
  if (design.roof && design.roof.geometry) {
    const roof = design.roof.geometry;
    if (roof.type === 'gable') {
      const ridgeHeight = roof.ridge.start[2] * 1000 * scale;
      const baseY = 0;
      svg += `  <polygon points="0,${baseY} ${length * scale / 2},${baseY - ridgeHeight} ${length * scale},${baseY}"
                  fill="#cd853f" stroke="#000" stroke-width="2"/>\n`;
    }
  }

  svg += `</svg>`;

  return svg;
}

/**
 * Export 3D model as glTF/GLB
 */
export function exportGLTF(scene, filename = 'model.glb') {
  return new Promise((resolve, reject) => {
    console.log('📦 Exporting glTF model...');

    const exporter = new GLTFExporter();

    const options = {
      binary: true, // Export as GLB (binary glTF)
      embedImages: true,
      maxTextureSize: 2048
    };

    exporter.parse(
      scene,
      (result) => {
        const blob = new Blob([result], { type: 'application/octet-stream' });
        console.log('✅ glTF export complete');
        resolve({ blob, filename });
      },
      (error) => {
        console.error('❌ glTF export failed:', error);
        reject(error);
      },
      options
    );
  });
}

/**
 * Export to DXF (simplified - basic polylines only)
 */
export function exportDXF(design) {
  console.log('📐 Exporting DXF...');

  // DXF header
  let dxf = `  0\nSECTION\n  2\nHEADER\n  9\n$ACADVER\n  1\nAC1015\n  0\nENDSEC\n`;

  // Entities section
  dxf += `  0\nSECTION\n  2\nENTITIES\n`;

  // Export rooms as polylines
  design.rooms.forEach((room, idx) => {
    if (!room.poly || room.poly.length < 3) return;

    dxf += `  0\nLWPOLYLINE\n  8\nROOMS\n 90\n${room.poly.length}\n 70\n1\n`; // Closed polyline

    room.poly.forEach(([x, y]) => {
      dxf += ` 10\n${x}\n 20\n${y}\n`;
    });

    // Room label as TEXT
    if (room.center) {
      const [cx, cy] = room.center;
      dxf += `  0\nTEXT\n  8\nLABELS\n 10\n${cx}\n 20\n${cy}\n 40\n500\n  1\n${room.name}\n`;
    }
  });

  // End entities section
  dxf += `  0\nENDSEC\n  0\nEOF\n`;

  return dxf;
}

/**
 * Save file to public/technical/ directory
 */
export function saveToTechnicalFolder(content, filename) {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);

  console.log(`✅ Saved: ${filename}`);
}

/**
 * Generate all exports for a design
 */
export async function exportAllTechnicalDrawings(design, scene) {
  console.log('📦 Generating all technical exports...');

  const designId = design.design_id;
  const exports = [];

  try {
    // Floor plans
    const groundPlan = exportFloorPlanSVG(design, 0);
    if (groundPlan) {
      saveToTechnicalFolder(groundPlan, `plan_ground_${designId}.svg`);
      exports.push({ type: 'floor_plan', level: 0, filename: `plan_ground_${designId}.svg` });
    }

    if (design.dimensions.floorCount > 1) {
      const upperPlan = exportFloorPlanSVG(design, 1);
      if (upperPlan) {
        saveToTechnicalFolder(upperPlan, `plan_upper_${designId}.svg`);
        exports.push({ type: 'floor_plan', level: 1, filename: `plan_upper_${designId}.svg` });
      }
    }

    // Elevations
    const directions = ['north', 'south', 'east', 'west'];
    directions.forEach(dir => {
      const elev = exportElevationSVG(design, dir);
      if (elev) {
        saveToTechnicalFolder(elev, `elev_${dir}_${designId}.svg`);
        exports.push({ type: 'elevation', direction: dir, filename: `elev_${dir}_${designId}.svg` });
      }
    });

    // Sections
    const longSection = exportSectionSVG(design, 'longitudinal');
    saveToTechnicalFolder(longSection, `section_AA_${designId}.svg`);
    exports.push({ type: 'section', name: 'A-A', filename: `section_AA_${designId}.svg` });

    const crossSection = exportSectionSVG(design, 'cross');
    saveToTechnicalFolder(crossSection, `section_BB_${designId}.svg`);
    exports.push({ type: 'section', name: 'B-B', filename: `section_BB_${designId}.svg` });

    // DXF
    const dxfContent = exportDXF(design);
    saveToTechnicalFolder(dxfContent, `plan_${designId}.dxf`);
    exports.push({ type: 'dxf', filename: `plan_${designId}.dxf` });

    // glTF (3D model)
    if (scene) {
      const { blob, filename } = await exportGLTF(scene, `model_${designId}.glb`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);

      exports.push({ type: 'gltf', filename });
    }

    console.log(`✅ Exported ${exports.length} technical drawings`);
    return exports;

  } catch (error) {
    console.error('❌ Export failed:', error);
    return exports;
  }
}
