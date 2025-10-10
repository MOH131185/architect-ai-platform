/**
 * BIM Service for Parametric Building Models
 * Creates unified 3D building geometry from project specifications
 * Derives 2D floor plans, elevations, sections, and 3D views from single model
 */

class BIMService {
  constructor() {
    console.log('BIM Service initialized');
  }

  /**
   * Generate parametric building model from project context
   * This creates a unified 3D representation that can be used to derive all views
   * @param {Object} projectContext - Complete project specifications
   * @returns {Object} Parametric building model with geometry and metadata
   */
  generateParametricModel(projectContext) {
    const {
      buildingProgram = 'house',
      floorArea = 200,
      architecturalStyle = 'contemporary',
      materials = 'brick and glass',
      entranceDirection = 'N',
      blendedStyle
    } = projectContext;

    console.log('🏗️ Generating parametric building model...');

    // Calculate building dimensions based on program and area
    const dimensions = this.calculateBuildingDimensions(floorArea, buildingProgram);

    // Generate floor geometry
    const floorCount = this.calculateFloorCount(floorArea, buildingProgram);
    const floors = this.generateFloorGeometry(dimensions, floorCount, buildingProgram);

    // Generate structural elements
    const structure = this.generateStructuralElements(dimensions, floorCount, architecturalStyle);

    // Generate envelope (walls, windows, doors)
    const envelope = this.generateBuildingEnvelope(dimensions, floorCount, entranceDirection, architecturalStyle, blendedStyle);

    // Generate roof geometry
    const roof = this.generateRoofGeometry(dimensions, architecturalStyle);

    // Generate spatial organization
    const spaces = this.generateSpaceLayout(dimensions, floorCount, buildingProgram);

    const model = {
      metadata: {
        buildingProgram,
        floorArea,
        architecturalStyle,
        materials,
        entranceDirection,
        floorCount,
        generated: new Date().toISOString()
      },
      geometry: {
        dimensions,
        floors,
        structure,
        envelope,
        roof,
        spaces
      },
      // Provide methods to derive different views
      views: {
        floorPlans: this.deriveFloorPlans(floors, spaces, dimensions),
        elevations: this.deriveElevations(envelope, dimensions, floorCount),
        sections: this.deriveSections(structure, floors, dimensions, floorCount),
        axonometric: this.deriveAxonometric(dimensions, floorCount, envelope)
      }
    };

    console.log('✅ Parametric model generated:', {
      dimensions: `${dimensions.length}m × ${dimensions.width}m`,
      floors: floorCount,
      spaces: spaces.length
    });

    return model;
  }

  /**
   * Calculate optimal building dimensions based on area and program
   */
  calculateBuildingDimensions(totalArea, buildingProgram) {
    // Determine optimal proportions based on building type
    let aspectRatio = 1.5; // Default length:width ratio

    if (buildingProgram.includes('villa') || buildingProgram.includes('house')) {
      aspectRatio = 1.4; // More compact
    } else if (buildingProgram.includes('office')) {
      aspectRatio = 1.8; // More elongated
    } else if (buildingProgram.includes('apartment')) {
      aspectRatio = 2.0; // Linear
    }

    // Calculate footprint (assuming standard floor height of 3.5m)
    const floorCount = this.calculateFloorCount(totalArea, buildingProgram);
    const footprintArea = totalArea / floorCount;

    // Calculate width and length from aspect ratio
    const width = Math.sqrt(footprintArea / aspectRatio);
    const length = width * aspectRatio;

    return {
      length: Math.round(length * 10) / 10,
      width: Math.round(width * 10) / 10,
      height: floorCount * 3.5,
      floorHeight: 3.5,
      floorCount
    };
  }

  /**
   * Calculate number of floors based on area and building type
   */
  calculateFloorCount(area, buildingType) {
    if (buildingType.includes('cottage') || buildingType.includes('bungalow')) {
      return 1;
    }
    if (area < 150) return 1;
    if (area < 300) return 2;
    if (area < 500) return 3;
    return Math.min(Math.ceil(area / 200), 5);
  }

  /**
   * Generate floor geometry for each level
   */
  generateFloorGeometry(dimensions, floorCount, buildingProgram) {
    const floors = [];

    for (let i = 0; i < floorCount; i++) {
      const floor = {
        level: i,
        elevation: i * dimensions.floorHeight,
        outline: this.generateFloorOutline(dimensions),
        type: i === 0 ? 'ground' : i === floorCount - 1 ? 'top' : 'typical',
        slab: {
          thickness: i === 0 ? 0.2 : 0.18, // Ground floor thicker
          material: 'reinforced concrete'
        }
      };
      floors.push(floor);
    }

    return floors;
  }

  /**
   * Generate floor outline (footprint) as polygon
   */
  generateFloorOutline(dimensions) {
    // Simple rectangular footprint for now
    // Future enhancement: Add complexity based on style
    return {
      type: 'rectangle',
      points: [
        { x: 0, y: 0 },
        { x: dimensions.length, y: 0 },
        { x: dimensions.length, y: dimensions.width },
        { x: 0, y: dimensions.width }
      ],
      area: dimensions.length * dimensions.width
    };
  }

  /**
   * Generate structural elements (columns, beams, walls)
   */
  generateStructuralElements(dimensions, floorCount, architecturalStyle) {
    const { length, width, floorHeight } = dimensions;

    // Generate structural grid
    const columnSpacing = architecturalStyle.includes('modern') ? 6.0 : 4.5;
    const columns = [];
    const beams = [];

    // Place columns on grid
    for (let x = 0; x <= length; x += columnSpacing) {
      for (let y = 0; y <= width; y += columnSpacing) {
        if (x <= length && y <= width) {
          columns.push({
            position: { x, y },
            height: floorCount * floorHeight,
            size: { width: 0.4, depth: 0.4 },
            material: 'reinforced concrete'
          });
        }
      }
    }

    // Generate beams connecting columns
    // Simplified: just mark beam locations

    return {
      columns,
      beams,
      system: architecturalStyle.includes('steel') ? 'steel frame' : 'concrete frame',
      gridSpacing: columnSpacing
    };
  }

  /**
   * Generate building envelope (walls, windows, doors)
   */
  generateBuildingEnvelope(dimensions, floorCount, entranceDirection, architecturalStyle, blendedStyle) {
    const { length, width, floorHeight } = dimensions;

    // Determine window-to-wall ratio based on style
    const windowRatio = this.getWindowRatio(architecturalStyle, blendedStyle);

    // Generate walls for each facade
    const facades = {
      north: this.generateFacade('north', length, floorCount * floorHeight, windowRatio, entranceDirection === 'N'),
      south: this.generateFacade('south', length, floorCount * floorHeight, windowRatio, entranceDirection === 'S'),
      east: this.generateFacade('east', width, floorCount * floorHeight, windowRatio, entranceDirection === 'E'),
      west: this.generateFacade('west', width, floorCount * floorHeight, windowRatio, entranceDirection === 'W')
    };

    return {
      facades,
      wallThickness: 0.3,
      insulationValue: 'R-30',
      materials: blendedStyle?.materials || ['brick', 'glass', 'metal panels']
    };
  }

  /**
   * Determine window-to-wall ratio based on architectural style
   */
  getWindowRatio(architecturalStyle, blendedStyle) {
    const style = (architecturalStyle + ' ' + (blendedStyle?.styleName || '')).toLowerCase();

    if (style.includes('modern') || style.includes('contemporary')) {
      return 0.4; // 40% glazing
    } else if (style.includes('traditional') || style.includes('vernacular')) {
      return 0.25; // 25% glazing
    } else if (style.includes('sustainable') || style.includes('passive')) {
      return 0.35; // Balanced for passive solar
    }

    return 0.3; // Default
  }

  /**
   * Generate facade with windows and doors
   */
  generateFacade(direction, length, height, windowRatio, hasEntrance) {
    const facade = {
      direction,
      length,
      height,
      windowRatio,
      windows: [],
      doors: []
    };

    // Generate windows on each floor
    const floorCount = Math.round(height / 3.5);
    const windowWidth = 1.5;
    const windowHeight = 2.0;
    const windowSpacing = length / Math.ceil(length / 3.0); // Window every ~3m

    for (let floor = 0; floor < floorCount; floor++) {
      const windowSillHeight = floor * 3.5 + 1.0;

      for (let x = windowSpacing / 2; x < length; x += windowSpacing) {
        facade.windows.push({
          position: { x, y: windowSillHeight },
          width: windowWidth,
          height: windowHeight,
          floor,
          type: 'casement'
        });
      }
    }

    // Add entrance door if this is entrance facade
    if (hasEntrance) {
      facade.doors.push({
        position: { x: length / 2, y: 0 },
        width: 1.2,
        height: 2.4,
        type: 'main entrance'
      });
    }

    return facade;
  }

  /**
   * Generate roof geometry based on architectural style
   */
  generateRoofGeometry(dimensions, architecturalStyle) {
    const style = architecturalStyle.toLowerCase();

    let roofType = 'flat';
    let slope = 0;

    if (style.includes('traditional') || style.includes('vernacular')) {
      roofType = 'pitched';
      slope = 30; // degrees
    } else if (style.includes('modern') || style.includes('contemporary')) {
      roofType = 'flat';
      slope = 2; // minimum drainage slope
    }

    return {
      type: roofType,
      slope,
      material: roofType === 'flat' ? 'membrane' : 'tiles',
      overhang: roofType === 'pitched' ? 0.6 : 0.2,
      area: dimensions.length * dimensions.width
    };
  }

  /**
   * Generate space layout based on building program
   */
  generateSpaceLayout(dimensions, floorCount, buildingProgram) {
    const spaces = [];
    const { length, width } = dimensions;

    // Different layouts based on program
    if (buildingProgram.includes('house') || buildingProgram.includes('villa')) {
      // Ground floor: Living, kitchen, dining
      if (floorCount >= 1) {
        spaces.push(
          { name: 'Living Room', floor: 0, area: length * width * 0.3, position: { x: 0, y: 0 } },
          { name: 'Kitchen', floor: 0, area: length * width * 0.2, position: { x: length * 0.6, y: 0 } },
          { name: 'Dining', floor: 0, area: length * width * 0.15, position: { x: length * 0.3, y: 0 } }
        );
      }
      // Upper floors: Bedrooms
      if (floorCount >= 2) {
        spaces.push(
          { name: 'Master Bedroom', floor: 1, area: length * width * 0.25, position: { x: 0, y: 0 } },
          { name: 'Bedroom 2', floor: 1, area: length * width * 0.15, position: { x: length * 0.5, y: 0 } },
          { name: 'Bathroom', floor: 1, area: length * width * 0.1, position: { x: length * 0.7, y: width * 0.5 } }
        );
      }
    } else if (buildingProgram.includes('office')) {
      spaces.push(
        { name: 'Open Office', floor: 0, area: length * width * 0.5, position: { x: 0, y: 0 } },
        { name: 'Meeting Rooms', floor: 0, area: length * width * 0.2, position: { x: length * 0.6, y: 0 } },
        { name: 'Reception', floor: 0, area: length * width * 0.15, position: { x: length * 0.8, y: 0 } }
      );
    } else if (buildingProgram.includes('clinic')) {
      spaces.push(
        { name: 'Reception', floor: 0, area: length * width * 0.15, position: { x: 0, y: 0 } },
        { name: 'Waiting Area', floor: 0, area: length * width * 0.2, position: { x: length * 0.2, y: 0 } },
        { name: 'Consultation Room 1', floor: 0, area: length * width * 0.1, position: { x: length * 0.5, y: 0 } },
        { name: 'Consultation Room 2', floor: 0, area: length * width * 0.1, position: { x: length * 0.65, y: 0 } }
      );
    }

    return spaces;
  }

  /**
   * Derive 2D floor plans from parametric model
   */
  deriveFloorPlans(floors, spaces, dimensions) {
    const plans = {};

    floors.forEach((floor, index) => {
      const levelSpaces = spaces.filter(s => s.floor === index);

      plans[`floor_${index}`] = {
        level: index,
        elevation: floor.elevation,
        outline: floor.outline,
        spaces: levelSpaces,
        dimensions: {
          length: dimensions.length,
          width: dimensions.width
        },
        // SVG-like representation for 2D rendering
        elements: this.generateFloorPlanElements(floor.outline, levelSpaces, dimensions)
      };
    });

    return plans;
  }

  /**
   * Generate floor plan elements (walls, doors, windows as 2D shapes)
   */
  generateFloorPlanElements(outline, spaces, dimensions) {
    const elements = [];

    // Outer walls
    elements.push({
      type: 'wall',
      points: outline.points,
      thickness: 0.3,
      style: 'exterior'
    });

    // Space divisions (simplified)
    spaces.forEach(space => {
      elements.push({
        type: 'space',
        name: space.name,
        position: space.position,
        area: space.area,
        label: `${space.name}\n${Math.round(space.area)}m²`
      });
    });

    return elements;
  }

  /**
   * Derive elevations from building envelope
   */
  deriveElevations(envelope, dimensions, floorCount) {
    const elevations = {};

    ['north', 'south', 'east', 'west'].forEach(direction => {
      const facade = envelope.facades[direction];

      elevations[direction] = {
        direction,
        width: facade.length,
        height: floorCount * dimensions.floorHeight,
        windows: facade.windows,
        doors: facade.doors,
        materials: envelope.materials,
        // 2D projection data
        projection: this.generateElevationProjection(facade, dimensions, floorCount)
      };
    });

    return elevations;
  }

  /**
   * Generate elevation projection (2D orthographic view)
   */
  generateElevationProjection(facade, dimensions, floorCount) {
    const elements = [];

    // Ground line
    elements.push({
      type: 'line',
      points: [{ x: 0, y: 0 }, { x: facade.length, y: 0 }],
      style: 'ground'
    });

    // Floor lines
    for (let i = 1; i <= floorCount; i++) {
      elements.push({
        type: 'line',
        points: [{ x: 0, y: i * 3.5 }, { x: facade.length, y: i * 3.5 }],
        style: 'floor'
      });
    }

    // Windows
    facade.windows.forEach(window => {
      elements.push({
        type: 'rectangle',
        position: window.position,
        width: window.width,
        height: window.height,
        style: 'window'
      });
    });

    // Doors
    facade.doors.forEach(door => {
      elements.push({
        type: 'rectangle',
        position: door.position,
        width: door.width,
        height: door.height,
        style: 'door'
      });
    });

    return elements;
  }

  /**
   * Derive sections from structure and floors
   */
  deriveSections(structure, floors, dimensions, floorCount) {
    return {
      longitudinal: this.generateSectionView('longitudinal', dimensions, floors, structure, floorCount),
      cross: this.generateSectionView('cross', dimensions, floors, structure, floorCount)
    };
  }

  /**
   * Generate section view (cut-through)
   */
  generateSectionView(type, dimensions, floors, structure, floorCount) {
    const width = type === 'longitudinal' ? dimensions.length : dimensions.width;
    const elements = [];

    // Foundation
    elements.push({
      type: 'rectangle',
      position: { x: 0, y: -0.5 },
      width: width,
      height: 0.5,
      style: 'foundation',
      fill: 'solid'
    });

    // Floor slabs
    floors.forEach(floor => {
      elements.push({
        type: 'line',
        points: [{ x: 0, y: floor.elevation }, { x: width, y: floor.elevation }],
        thickness: floor.slab.thickness,
        style: 'slab',
        fill: 'poche'
      });
    });

    // Roof
    elements.push({
      type: 'line',
      points: [{ x: 0, y: floorCount * 3.5 }, { x: width, y: floorCount * 3.5 }],
      thickness: 0.2,
      style: 'roof'
    });

    // Columns (cut through)
    structure.columns.forEach(col => {
      const xPos = type === 'longitudinal' ? col.position.x : col.position.y;
      elements.push({
        type: 'rectangle',
        position: { x: xPos - col.size.width / 2, y: 0 },
        width: col.size.width,
        height: col.height,
        style: 'column',
        fill: 'poche'
      });
    });

    return {
      type,
      width,
      height: floorCount * 3.5 + 0.5,
      elements
    };
  }

  /**
   * Derive axonometric view from BIM model
   * Generates an SVG-based 3D isometric projection
   * @param {Object} bimModel - Complete BIM model or dimensions
   * @param {Object} options - Rendering options (angle, scale, etc.)
   * @returns {String} Data URL of SVG image
   */
  deriveAxonometric(bimModel, options = {}) {
    try {
      // Extract geometry from model or use direct parameters
      const geometry = bimModel?.geometry || bimModel;
      const dimensions = geometry?.dimensions || bimModel;
      const floorCount = geometry?.floors?.length || bimModel?.floorCount || 1;
      const envelope = geometry?.envelope || bimModel?.envelope || {};

      const {
        angle = 30, // isometric angle in degrees
        scale = 1.0
        // showGrid and showDimensions are reserved for future use
        // showGrid = false,
        // showDimensions = false
      } = options;

      console.log('🎨 Generating BIM-derived axonometric view...');
      console.log('   Dimensions:', dimensions.length, 'x', dimensions.width, 'x', dimensions.height);
      console.log('   Floors:', floorCount);

      // Calculate SVG dimensions
      const svgWidth = 800;
      const svgHeight = 600;
      const padding = 50;

      // Isometric projection matrix (30° angle, 2:1 ratio)
      const cos30 = Math.cos(angle * Math.PI / 180);
      const sin30 = Math.sin(angle * Math.PI / 180);

      // Project 3D point to 2D isometric
      const project = (x, y, z) => {
        const isoX = (x - y) * cos30;
        const isoY = (x + y) * sin30 - z;
        return {
          x: isoX * scale + svgWidth / 2,
          y: svgHeight - (isoY * scale + padding)
        };
      };

      // Building dimensions (scale to fit)
      const maxDim = Math.max(dimensions.length, dimensions.width, dimensions.height);
      const buildingScale = (Math.min(svgWidth, svgHeight) - 2 * padding) / maxDim * 0.6;

      const L = dimensions.length * buildingScale;
      const W = dimensions.width * buildingScale;
      const H = dimensions.height * buildingScale;
      const floorHeight = dimensions.floorHeight * buildingScale || H / floorCount;

      // Generate SVG paths
      let svgPaths = '';

      // Ground plane (base)
      const p1 = project(0, 0, 0);
      const p2 = project(L, 0, 0);
      const p3 = project(L, W, 0);
      const p4 = project(0, W, 0);

      svgPaths += `<polygon points="${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y} ${p4.x},${p4.y}"
                   fill="#e8e8e8" stroke="#666" stroke-width="1.5" opacity="0.7"/>`;

      // Building mass (each floor)
      for (let floor = 0; floor < floorCount; floor++) {
        const z1 = floor * floorHeight;
        const z2 = (floor + 1) * floorHeight;

        // Front face
        const ff1 = project(0, 0, z1);
        const ff2 = project(L, 0, z1);
        const ff3 = project(L, 0, z2);
        const ff4 = project(0, 0, z2);
        svgPaths += `<polygon points="${ff1.x},${ff1.y} ${ff2.x},${ff2.y} ${ff3.x},${ff3.y} ${ff4.x},${ff4.y}"
                     fill="#f0f0f0" stroke="#444" stroke-width="1.5"/>`;

        // Right face
        const rf1 = project(L, 0, z1);
        const rf2 = project(L, W, z1);
        const rf3 = project(L, W, z2);
        const rf4 = project(L, 0, z2);
        svgPaths += `<polygon points="${rf1.x},${rf1.y} ${rf2.x},${rf2.y} ${rf3.x},${rf3.y} ${rf4.x},${rf4.y}"
                     fill="#d8d8d8" stroke="#444" stroke-width="1.5"/>`;

        // Top face (only on last floor)
        if (floor === floorCount - 1) {
          const tf1 = project(0, 0, z2);
          const tf2 = project(L, 0, z2);
          const tf3 = project(L, W, z2);
          const tf4 = project(0, W, z2);
          svgPaths += `<polygon points="${tf1.x},${tf1.y} ${tf2.x},${tf2.y} ${tf3.x},${tf3.y} ${tf4.x},${tf4.y}"
                       fill="#c0c0c0" stroke="#444" stroke-width="1.5"/>`;
        }

        // Floor line (horizontal separator)
        const fl1 = project(0, 0, z2);
        const fl2 = project(L, 0, z2);
        const fl3 = project(L, W, z2);
        svgPaths += `<line x1="${fl1.x}" y1="${fl1.y}" x2="${fl2.x}" y2="${fl2.y}"
                     stroke="#666" stroke-width="1" stroke-dasharray="3,3"/>`;
        svgPaths += `<line x1="${fl2.x}" y1="${fl2.y}" x2="${fl3.x}" y2="${fl3.y}"
                     stroke="#666" stroke-width="1" stroke-dasharray="3,3"/>`;
      }

      // Add windows (simplified as rectangles on facades)
      if (envelope.facades) {
        const windowColor = '#87CEEB';
        const windowsPerFace = 3;
        const windowWidth = L / (windowsPerFace + 1) * 0.3;
        const windowHeight = floorHeight * 0.4;

        for (let floor = 0; floor < floorCount; floor++) {
          const z = floor * floorHeight + floorHeight / 2;

          // Front facade windows
          for (let i = 1; i <= windowsPerFace; i++) {
            const x = (L / (windowsPerFace + 1)) * i;
            const w1 = project(x - windowWidth/2, 0, z - windowHeight/2);
            const w2 = project(x + windowWidth/2, 0, z - windowHeight/2);
            const w3 = project(x + windowWidth/2, 0, z + windowHeight/2);
            const w4 = project(x - windowWidth/2, 0, z + windowHeight/2);
            svgPaths += `<polygon points="${w1.x},${w1.y} ${w2.x},${w2.y} ${w3.x},${w3.y} ${w4.x},${w4.y}"
                         fill="${windowColor}" stroke="#333" stroke-width="0.5" opacity="0.7"/>`;
          }
        }
      }

      // Create complete SVG
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">
        <defs>
          <style>
            text { font-family: Arial, sans-serif; font-size: 12px; fill: #333; }
            .dimension { font-size: 10px; fill: #666; }
          </style>
        </defs>
        <rect width="100%" height="100%" fill="#ffffff"/>

        ${svgPaths}

        <!-- Title -->
        <text x="${svgWidth/2}" y="30" text-anchor="middle" font-size="14" font-weight="bold">
          Axonometric View (BIM-Derived)
        </text>

        <!-- Dimensions label -->
        <text x="${svgWidth/2}" y="${svgHeight - 10}" text-anchor="middle" class="dimension">
          ${dimensions.length.toFixed(1)}m × ${dimensions.width.toFixed(1)}m × ${dimensions.height.toFixed(1)}m | ${floorCount} floor${floorCount > 1 ? 's' : ''}
        </text>

        <!-- Metadata -->
        <text x="10" y="${svgHeight - 10}" class="dimension">
          Generated from BIM model | Angle: ${angle}°
        </text>
      </svg>`;

      // Convert SVG to data URL
      const svgData = encodeURIComponent(svg);
      const dataUrl = `data:image/svg+xml,${svgData}`;

      console.log('✅ BIM axonometric view generated successfully');

      return dataUrl;

    } catch (error) {
      console.error('❌ BIM axonometric generation failed:', error.message);
      throw error;
    }
  }

  /**
   * Export model to IFC format (Industry Foundation Classes)
   * Enhanced version with proper geometry
   */
  exportToIFC(model) {
    const { metadata, geometry } = model;

    let ifc = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ArchitectAI Parametric Building Model'),'2;1');
FILE_NAME('${metadata.buildingProgram}.ifc','${metadata.generated}',('ArchitectAI'),('AI Architecture Platform'),'IFC4','ArchitectAI BIM Export','');
FILE_SCHEMA(('IFC4'));
ENDSEC;

DATA;
/* Project */
#1=IFCPROJECT('${this.generateGUID()}',#2,'${metadata.buildingProgram} - ${metadata.floorArea}m²',$,$,$,$,(#10),#11);
#2=IFCOWNERHISTORY(#3,#4,$,.ADDED.,$,$,$,${Date.now()});
#3=IFCPERSONANDORGANIZATION(#5,#6,$);
#4=IFCAPPLICATION(#6,'1.0','ArchitectAI','ArchitectAI Platform');
#5=IFCPERSON($,'AI','ArchitectAI',$,$,$,$,$);
#6=IFCORGANIZATION($,'ArchitectAI','AI-Powered Architecture',$,$);

/* Units */
#10=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#20,$);
#11=IFCUNITASSIGNMENT((#12,#13,#14));
#12=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);
#13=IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.);
#14=IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.);
#20=IFCAXIS2PLACEMENT3D(#21,$,$);
#21=IFCCARTESIANPOINT((0.,0.,0.));

/* Building */
#100=IFCBUILDING('${this.generateGUID()}',#2,'${metadata.buildingProgram}',$,$,#101,$,$,.ELEMENT.,$,$,$);
#101=IFCLOCALPLACEMENT($,#102);
#102=IFCAXIS2PLACEMENT3D(#21,$,$);

/* Building Storeys */\n`;

    let entityId = 200;
    geometry.floors.forEach((floor, index) => {
      ifc += `#${entityId}=IFCBUILDINGSTOREY('${this.generateGUID()}',#2,'Level ${floor.level}','Floor at elevation ${floor.elevation}m',$,#${entityId + 1},$,$,.ELEMENT.,${floor.elevation});\n`;
      ifc += `#${entityId + 1}=IFCLOCALPLACEMENT(#101,#${entityId + 2});\n`;
      ifc += `#${entityId + 2}=IFCAXIS2PLACEMENT3D(#${entityId + 3},$,$);\n`;
      ifc += `#${entityId + 3}=IFCCARTESIANPOINT((0.,0.,${floor.elevation}));\n`;
      entityId += 10;
    });

    // Add spaces
    geometry.spaces.forEach(space => {
      ifc += `#${entityId}=IFCSPACE('${this.generateGUID()}',#2,'${space.name}','Area: ${Math.round(space.area)}m²',$,#${entityId + 1},$,$,.ELEMENT.,$,$,$);\n`;
      ifc += `#${entityId + 1}=IFCLOCALPLACEMENT($,#${entityId + 2});\n`;
      ifc += `#${entityId + 2}=IFCAXIS2PLACEMENT3D(#${entityId + 3},$,$);\n`;
      ifc += `#${entityId + 3}=IFCCARTESIANPOINT((${space.position.x},${space.position.y},${space.floor * 3.5}));\n`;
      entityId += 10;
    });

    ifc += `\nENDSEC;\nEND-ISO-10303-21;`;

    return ifc;
  }

  /**
   * Generate GUID for IFC entities
   */
  generateGUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : ((r & 0x3) | 0x8);
      return v.toString(16);
    });
  }

  /**
   * Export model to DWG-like format (AutoCAD-compatible text representation)
   */
  exportToDWG(model) {
    const { metadata, geometry, views } = model;

    let dwg = `AutoCAD Drawing Exchange Format
Generated by ArchitectAI BIM Service
Project: ${metadata.buildingProgram}
Date: ${metadata.generated}

DIMENSIONS:
Length: ${geometry.dimensions.length}m
Width: ${geometry.dimensions.width}m
Height: ${geometry.dimensions.height}m
Floors: ${metadata.floorCount}

LAYERS:\n`;

    // Define layers for different element types
    const layers = ['WALLS', 'WINDOWS', 'DOORS', 'STRUCTURE', 'DIMENSIONS', 'TEXT'];
    layers.forEach(layer => {
      dwg += `LAYER: ${layer}\n`;
    });

    dwg += `\nFLOOR PLANS:\n`;
    Object.keys(views.floorPlans).forEach(key => {
      const plan = views.floorPlans[key];
      dwg += `\nLevel ${plan.level} (Elevation ${plan.elevation}m):\n`;
      dwg += `  Outline: ${plan.dimensions.length}m x ${plan.dimensions.width}m\n`;
      plan.spaces.forEach(space => {
        dwg += `  - ${space.name}: ${Math.round(space.area)}m²\n`;
      });
    });

    dwg += `\nELEVATIONS:\n`;
    Object.keys(views.elevations).forEach(direction => {
      const elev = views.elevations[direction];
      dwg += `${direction.toUpperCase()}: ${elev.width}m x ${elev.height}m\n`;
      dwg += `  Windows: ${elev.windows.length}\n`;
      dwg += `  Doors: ${elev.doors.length}\n`;
    });

    return dwg;
  }
}

const bimService = new BIMService();
export default bimService;
