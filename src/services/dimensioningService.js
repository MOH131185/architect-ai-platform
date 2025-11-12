/**
 * Dimensioning and Annotation Service
 * Adds measurements, labels, and technical annotations to floor plans and technical drawings
 * Post-processes generated images to add dimension lines, room labels, and scale bars
 */

class DimensioningService {
  constructor() {
    console.log('Dimensioning Service initialized');
  }

  /**
   * Add dimensions and annotations to a floor plan
   * @param {string} imageUrl - URL or base64 of the floor plan image
   * @param {Object} bimModel - BIM model containing geometry and dimensions
   * @param {string} floorLevel - Which floor level (ground, upper, roof)
   * @returns {Promise<Object>} Annotated image data with dimensions
   */
  async annotateFloorPlan(imageUrl, bimModel, floorLevel = 'ground') {
    console.log(`📐 Adding dimensions to ${floorLevel} floor plan...`);

    const { geometry, views } = bimModel;
    const floorPlan = views.floorPlans[`floor_${floorLevel === 'ground' ? 0 : floorLevel === 'upper' ? 1 : 2}`];

    if (!floorPlan) {
      console.warn(`Floor plan for ${floorLevel} not found in BIM model`);
      return { success: false, error: 'Floor plan not found' };
    }

    // Create SVG overlay with dimensions
    const annotations = this.generateFloorPlanAnnotations(floorPlan, geometry.dimensions);

    return {
      success: true,
      originalImage: imageUrl,
      annotations,
      dimensions: this.extractDimensions(floorPlan, geometry.dimensions),
      labels: this.generateSpaceLabels(floorPlan.spaces),
      scaleBar: this.generateScaleBar(geometry.dimensions.length)
    };
  }

  /**
   * Generate floor plan annotations (dimension lines, labels)
   */
  generateFloorPlanAnnotations(floorPlan, dimensions) {
    const annotations = [];

    // Overall dimensions
    annotations.push({
      type: 'dimension_horizontal',
      start: { x: 0, y: -1 },
      end: { x: dimensions.length, y: -1 },
      value: `${dimensions.length.toFixed(2)}m`,
      label: 'Length'
    });

    annotations.push({
      type: 'dimension_vertical',
      start: { x: -1, y: 0 },
      end: { x: -1, y: dimensions.width },
      value: `${dimensions.width.toFixed(2)}m`,
      label: 'Width'
    });

    // Space dimensions
    floorPlan.spaces.forEach(space => {
      // Estimate space dimensions (simplified - in real implementation would analyze geometry)
      const spaceWidth = Math.sqrt(space.area / 1.5);
      const spaceLength = space.area / spaceWidth;

      annotations.push({
        type: 'dimension_horizontal',
        start: { x: space.position.x, y: space.position.y - 0.3 },
        end: { x: space.position.x + spaceLength, y: space.position.y - 0.3 },
        value: `${spaceLength.toFixed(2)}m`,
        style: 'interior'
      });

      annotations.push({
        type: 'dimension_vertical',
        start: { x: space.position.x - 0.3, y: space.position.y },
        end: { x: space.position.x - 0.3, y: space.position.y + spaceWidth },
        value: `${spaceWidth.toFixed(2)}m`,
        style: 'interior'
      });
    });

    // North arrow
    annotations.push({
      type: 'north_arrow',
      position: { x: dimensions.length - 2, y: 1 },
      size: 0.8
    });

    return annotations;
  }

  /**
   * Extract key dimensions from floor plan
   */
  extractDimensions(floorPlan, overallDimensions) {
    const dims = {
      overall: {
        length: overallDimensions.length,
        width: overallDimensions.width,
        area: overallDimensions.length * overallDimensions.width
      },
      spaces: {}
    };

    floorPlan.spaces.forEach(space => {
      dims.spaces[space.name] = {
        area: space.area,
        // Estimate dimensions (in real implementation, derive from actual geometry)
        approximateWidth: Math.sqrt(space.area / 1.5),
        approximateLength: space.area / Math.sqrt(space.area / 1.5)
      };
    });

    return dims;
  }

  /**
   * Generate space labels with areas
   */
  generateSpaceLabels(spaces) {
    return spaces.map(space => ({
      name: space.name,
      position: {
        x: space.position.x + 1, // Offset from corner
        y: space.position.y + 1
      },
      text: `${space.name}\n${Math.round(space.area)}m²`,
      fontSize: '12pt',
      style: 'space_label'
    }));
  }

  /**
   * Generate scale bar
   */
  generateScaleBar(buildingLength) {
    // Scale bar represents 1/4 of building length
    const scaleLength = Math.ceil(buildingLength / 4);
    const segments = 4;

    return {
      position: { x: 1, y: -2 },
      totalLength: scaleLength,
      segments,
      unit: 'm',
      label: `Scale 1:${Math.round(buildingLength / 10 * 10)}`
    };
  }

  /**
   * Add dimensions to elevation drawing
   */
  async annotateElevation(imageUrl, bimModel, direction = 'north') {
    console.log(`📐 Adding dimensions to ${direction} elevation...`);

    const { geometry, views } = bimModel;
    const elevation = views.elevations[direction];

    if (!elevation) {
      return { success: false, error: 'Elevation not found' };
    }

    const annotations = this.generateElevationAnnotations(elevation, geometry.dimensions);

    return {
      success: true,
      originalImage: imageUrl,
      annotations,
      dimensions: this.extractElevationDimensions(elevation, geometry.dimensions),
      scaleBar: this.generateScaleBar(elevation.width)
    };
  }

  /**
   * Generate elevation annotations
   */
  generateElevationAnnotations(elevation, dimensions) {
    const annotations = [];

    // Overall width
    annotations.push({
      type: 'dimension_horizontal',
      start: { x: 0, y: -0.5 },
      end: { x: elevation.width, y: -0.5 },
      value: `${elevation.width.toFixed(2)}m`,
      label: 'Width'
    });

    // Overall height
    annotations.push({
      type: 'dimension_vertical',
      start: { x: -0.5, y: 0 },
      end: { x: -0.5, y: elevation.height },
      value: `${elevation.height.toFixed(2)}m`,
      label: 'Height'
    });

    // Floor heights
    const floorCount = Math.round(elevation.height / dimensions.floorHeight);
    for (let i = 1; i <= floorCount; i++) {
      const floorElev = i * dimensions.floorHeight;
      annotations.push({
        type: 'elevation_marker',
        position: { x: -1, y: floorElev },
        value: `+${floorElev.toFixed(2)}m`,
        label: `Level ${i}`
      });
    }

    // Window dimensions
    elevation.windows.slice(0, 3).forEach((window, idx) => {
      annotations.push({
        type: 'dimension_window',
        position: window.position,
        width: window.width,
        height: window.height,
        label: `W${idx + 1}: ${window.width}×${window.height}m`
      });
    });

    // Ground line label
    annotations.push({
      type: 'ground_line',
      position: { x: 0, y: 0 },
      label: '±0.00m (Ground Level)'
    });

    return annotations;
  }

  /**
   * Extract elevation dimensions
   */
  extractElevationDimensions(elevation, overallDimensions) {
    return {
      width: elevation.width,
      height: elevation.height,
      floorHeight: overallDimensions.floorHeight,
      windowCount: elevation.windows.length,
      doorCount: elevation.doors.length
    };
  }

  /**
   * Add dimensions to section drawing
   */
  async annotateSection(imageUrl, bimModel, sectionType = 'longitudinal') {
    console.log(`📐 Adding dimensions to ${sectionType} section...`);

    const { geometry, views } = bimModel;
    const section = views.sections[sectionType];

    if (!section) {
      return { success: false, error: 'Section not found' };
    }

    const annotations = this.generateSectionAnnotations(section, geometry.dimensions);

    return {
      success: true,
      originalImage: imageUrl,
      annotations,
      dimensions: this.extractSectionDimensions(section, geometry.dimensions),
      scaleBar: this.generateScaleBar(section.width)
    };
  }

  /**
   * Generate section annotations
   */
  generateSectionAnnotations(section, dimensions) {
    const annotations = [];

    // Overall width
    annotations.push({
      type: 'dimension_horizontal',
      start: { x: 0, y: -0.5 },
      end: { x: section.width, y: -0.5 },
      value: `${section.width.toFixed(2)}m`,
      label: section.type === 'longitudinal' ? 'Length' : 'Width'
    });

    // Overall height
    annotations.push({
      type: 'dimension_vertical',
      start: { x: -0.5, y: -0.5 },
      end: { x: -0.5, y: section.height },
      value: `${(section.height + 0.5).toFixed(2)}m`,
      label: 'Total Height (incl. foundation)'
    });

    // Floor-to-floor heights
    const floorCount = Math.round(section.height / dimensions.floorHeight);
    for (let i = 1; i <= floorCount; i++) {
      annotations.push({
        type: 'dimension_vertical',
        start: { x: section.width + 0.5, y: (i - 1) * dimensions.floorHeight },
        end: { x: section.width + 0.5, y: i * dimensions.floorHeight },
        value: `${dimensions.floorHeight.toFixed(2)}m`,
        label: `Floor ${i} height`
      });
    }

    // Foundation depth label
    annotations.push({
      type: 'label',
      position: { x: section.width / 2, y: -0.25 },
      text: 'Foundation: 0.5m depth',
      style: 'foundation_label'
    });

    // Section cut line indicator
    annotations.push({
      type: 'section_marker',
      position: { x: section.width / 2, y: section.height + 1 },
      label: `Section ${section.type.toUpperCase()}`,
      cutLine: true
    });

    return annotations;
  }

  /**
   * Extract section dimensions
   */
  extractSectionDimensions(section, overallDimensions) {
    return {
      width: section.width,
      height: section.height,
      floorHeight: overallDimensions.floorHeight,
      foundationDepth: 0.5,
      floorCount: Math.round(section.height / overallDimensions.floorHeight)
    };
  }

  /**
   * Convert annotations to SVG overlay
   * This can be rendered on top of the generated image
   */
  generateSVGOverlay(annotations, width, height) {
    const scale = 50; // pixels per meter
    let svg = `<svg width="${width * scale}" height="${height * scale}" xmlns="http://www.w3.org/2000/svg">\n`;
    svg += `  <defs>\n`;
    svg += `    <marker id="arrow" markerWidth="10" markerHeight="10" refX="5" refY="3" orient="auto" markerUnits="strokeWidth">\n`;
    svg += `      <path d="M0,0 L0,6 L9,3 z" fill="#000" />\n`;
    svg += `    </marker>\n`;
    svg += `  </defs>\n`;

    annotations.forEach(annotation => {
      switch (annotation.type) {
        case 'dimension_horizontal':
          svg += this.svgDimensionHorizontal(annotation, scale);
          break;
        case 'dimension_vertical':
          svg += this.svgDimensionVertical(annotation, scale);
          break;
        case 'north_arrow':
          svg += this.svgNorthArrow(annotation, scale);
          break;
        case 'label':
          svg += this.svgLabel(annotation, scale);
          break;
        case 'elevation_marker':
          svg += this.svgElevationMarker(annotation, scale);
          break;
        case 'ground_line':
          svg += this.svgGroundLine(annotation, scale);
          break;
        case 'section_marker':
          svg += this.svgSectionMarker(annotation, scale);
          break;
      }
    });

    svg += `</svg>`;
    return svg;
  }

  /**
   * Generate SVG for horizontal dimension
   */
  svgDimensionHorizontal(dim, scale) {
    const x1 = dim.start.x * scale;
    const y1 = dim.start.y * scale;
    const x2 = dim.end.x * scale;
    const y2 = dim.end.y * scale;
    const textX = (x1 + x2) / 2;
    const textY = y1 - 5;

    return `  <g class="dimension-horizontal">
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#000" stroke-width="1" marker-start="url(#arrow)" marker-end="url(#arrow)" />
    <text x="${textX}" y="${textY}" text-anchor="middle" font-size="10" font-family="Arial">${dim.value}</text>
  </g>\n`;
  }

  /**
   * Generate SVG for vertical dimension
   */
  svgDimensionVertical(dim, scale) {
    const x1 = dim.start.x * scale;
    const y1 = dim.start.y * scale;
    const x2 = dim.end.x * scale;
    const y2 = dim.end.y * scale;
    const textX = x1 - 20;
    const textY = (y1 + y2) / 2;

    return `  <g class="dimension-vertical">
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#000" stroke-width="1" marker-start="url(#arrow)" marker-end="url(#arrow)" />
    <text x="${textX}" y="${textY}" text-anchor="middle" font-size="10" font-family="Arial" transform="rotate(-90 ${textX} ${textY})">${dim.value}</text>
  </g>\n`;
  }

  /**
   * Generate SVG for north arrow
   */
  svgNorthArrow(arrow, scale) {
    const x = arrow.position.x * scale;
    const y = arrow.position.y * scale;
    const size = arrow.size * scale;

    return `  <g class="north-arrow">
    <polygon points="${x},${y - size} ${x + size / 3},${y} ${x},${y - size / 3} ${x - size / 3},${y}" fill="none" stroke="#000" stroke-width="1.5" />
    <text x="${x}" y="${y + size + 10}" text-anchor="middle" font-size="12" font-weight="bold" font-family="Arial">N</text>
  </g>\n`;
  }

  /**
   * Generate SVG for text label
   */
  svgLabel(label, scale) {
    const x = label.position.x * scale;
    const y = label.position.y * scale;

    return `  <text x="${x}" y="${y}" font-size="10" font-family="Arial" fill="#000">${label.text}</text>\n`;
  }

  /**
   * Generate SVG for elevation marker
   */
  svgElevationMarker(marker, scale) {
    const x = marker.position.x * scale;
    const y = marker.position.y * scale;

    return `  <g class="elevation-marker">
    <line x1="${x}" y1="${y}" x2="${x + 15}" y2="${y}" stroke="#000" stroke-width="1" />
    <text x="${x + 20}" y="${y + 4}" font-size="9" font-family="Arial">${marker.value}</text>
  </g>\n`;
  }

  /**
   * Generate SVG for ground line
   */
  svgGroundLine(line, scale) {
    const x = line.position.x * scale;
    const y = line.position.y * scale;

    return `  <text x="${x + 5}" y="${y - 5}" font-size="10" font-weight="bold" font-family="Arial">${line.label}</text>\n`;
  }

  /**
   * Generate SVG for section marker
   */
  svgSectionMarker(marker, scale) {
    const x = marker.position.x * scale;
    const y = marker.position.y * scale;

    let svg = `  <g class="section-marker">
    <circle cx="${x}" cy="${y}" r="15" fill="none" stroke="#000" stroke-width="2" />
    <text x="${x}" y="${y + 4}" text-anchor="middle" font-size="11" font-weight="bold" font-family="Arial">${marker.label}</text>\n`;

    if (marker.cutLine) {
      svg += `    <line x1="${x - 30}" y1="${y}" x2="${x + 30}" y2="${y}" stroke="#000" stroke-width="2" stroke-dasharray="5,5" />\n`;
    }

    svg += `  </g>\n`;
    return svg;
  }

  /**
   * Generate SVG overlay for a floor plan (simplified version for quick annotation)
   * @param {Object} params - Parameters
   * @param {number} params.width - SVG width in pixels
   * @param {number} params.height - SVG height in pixels
   * @param {number} params.area - Building area in m²
   * @param {string} params.program - Building program type
   * @param {Array} params.rooms - Array of rooms with dimensions
   * @param {Object} params.dimensions - Building dimensions (length, width, height)
   * @returns {string} SVG markup
   */
  generateSVGOverlay({ width, height, area, program, rooms = [], dimensions = {} }) {
    const buildingLength = dimensions?.length || Math.sqrt(area * 1.5);
    const buildingWidth = dimensions?.width || area / buildingLength;
    const buildingHeight = dimensions?.height || 7;

    let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg" style="position: absolute; top: 0; left: 0; pointer-events: none;">
  <defs>
    <marker id="arrowEnd" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
      <path d="M0,0 L0,8 L8,4 z" fill="#FF0000" />
    </marker>
    <marker id="arrowStart" markerWidth="8" markerHeight="8" refX="1" refY="4" orient="auto" markerUnits="strokeWidth">
      <path d="M8,0 L8,8 L0,4 z" fill="#FF0000" />
    </marker>
  </defs>
  <style>
    .dimension-line { stroke: #FF0000; stroke-width: 2; fill: none; }
    .dimension-text { fill: #FF0000; font-family: Arial, sans-serif; font-size: 14px; font-weight: bold; }
    .room-label { fill: #0066CC; font-family: Arial, sans-serif; font-size: 16px; font-weight: bold; }
    .area-text { fill: #0066CC; font-family: Arial, sans-serif; font-size: 12px; }
  </style>

  <!-- Overall Dimensions -->
  <!-- Horizontal dimension (top) -->
  <line x1="100" y1="50" x2="${width - 100}" y2="50" class="dimension-line" marker-start="url(#arrowStart)" marker-end="url(#arrowEnd)" />
  <text x="${width / 2}" y="40" text-anchor="middle" class="dimension-text">${buildingLength.toFixed(2)}m</text>

  <!-- Vertical dimension (left) -->
  <line x1="50" y1="100" x2="50" y2="${height - 100}" class="dimension-line" marker-start="url(#arrowStart)" marker-end="url(#arrowEnd)" />
  <text x="30" y="${height / 2}" text-anchor="middle" class="dimension-text" transform="rotate(-90, 30, ${height / 2})">${buildingWidth.toFixed(2)}m</text>

  <!-- North Arrow -->
  <g transform="translate(${width - 80}, 100)">
    <line x1="0" y1="0" x2="0" y2="-40" stroke="#000" stroke-width="2" />
    <polygon points="0,-40 -8,-25 8,-25" fill="#000" />
    <text x="0" y="15" text-anchor="middle" font-family="Arial" font-size="14" font-weight="bold">N</text>
  </g>

  <!-- Building Info -->
  <g transform="translate(80, ${height - 80})">
    <rect x="-5" y="-25" width="280" height="55" fill="white" opacity="0.9" stroke="#000" stroke-width="1" />
    <text x="0" y="0" font-family="Arial" font-size="14" font-weight="bold">Total Area: ${Math.round(area)}m²</text>
    <text x="0" y="20" font-family="Arial" font-size="12">Dimensions: ${buildingLength.toFixed(1)}m × ${buildingWidth.toFixed(1)}m × ${buildingHeight.toFixed(1)}m</text>
  </g>

  <!-- Scale Bar -->
  <g transform="translate(${width - 200}, ${height - 50})">
    <line x1="0" y1="0" x2="100" y2="0" stroke="#000" stroke-width="3" />
    <line x1="0" y1="-5" x2="0" y2="5" stroke="#000" stroke-width="2" />
    <line x1="50" y1="-3" x2="50" y2="3" stroke="#000" stroke-width="2" />
    <line x1="100" y1="-5" x2="100" y2="5" stroke="#000" stroke-width="2" />
    <text x="50" y="20" text-anchor="middle" font-family="Arial" font-size="12">Scale 1:100</text>
  </g>

  <!-- Room Labels (if available) -->`;

    if (rooms && rooms.length > 0) {
      rooms.forEach((room, index) => {
        const x = 150 + (index % 2) * 300;
        const y = 150 + Math.floor(index / 2) * 100;
        svg += `
  <g transform="translate(${x}, ${y})">
    <text x="0" y="0" class="room-label">${room.name || `Room ${index + 1}`}</text>
    <text x="0" y="20" class="area-text">${room.dimensions || room.area || 'N/A'}</text>
  </g>`;
      });
    }

    svg += `
</svg>`;

    return svg;
  }
}

export default new DimensioningService();
