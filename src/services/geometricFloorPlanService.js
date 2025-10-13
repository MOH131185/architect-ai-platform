/**
 * Geometric Floor Plan Service
 * Generates actual 2D architectural floor plans programmatically using Canvas API
 * This service creates REAL floor plans instead of relying on AI models that can't generate technical drawings
 */

import logger from '../utils/productionLogger';

class GeometricFloorPlanService {
  /**
   * Generate a real 2D floor plan image
   * @param {Object} projectDNA - Project DNA specification
   * @param {number} floorIndex - Floor index (0 = ground, 1 = first, etc.)
   * @returns {Promise<string>} Data URL of generated floor plan image
   */
  async generateFloorPlan(projectDNA, floorIndex) {
    logger.info(`🏗️ Generating geometric floor plan for floor ${floorIndex}...`);

    try {
      const floor = projectDNA.floorPlans[floorIndex];

      // Create canvas
      const canvas = document.createElement('canvas');
      canvas.width = 1536;
      canvas.height = 1536;
      const ctx = canvas.getContext('2d');

      // White background
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Calculate scale (fit floor plan within 1200x1200 with margins)
      // ProjectDNA uses dimensions.buildingFootprint.length and .width
      const buildingLength = projectDNA.dimensions?.buildingFootprint?.length ||
                            projectDNA.dimensions?.length || 12;
      const buildingWidth = projectDNA.dimensions?.buildingFootprint?.width ||
                           projectDNA.dimensions?.width || 10;

      const maxDimension = Math.max(buildingLength, buildingWidth);
      const scale = 1200 / maxDimension; // pixels per meter

      // Center the floor plan
      const offsetX = (canvas.width - buildingLength * scale) / 2;
      const offsetY = (canvas.height - buildingWidth * scale) / 2;

      // Draw title and info
      this.drawHeader(ctx, floor, projectDNA);

      // Layout and draw rooms
      const rooms = this.layoutRooms(floor.rooms, buildingLength, buildingWidth, scale, offsetX, offsetY);
      this.drawRooms(ctx, rooms, scale);

      // Draw doors between rooms
      this.drawDoors(ctx, rooms, scale);

      // Draw windows on exterior walls
      this.drawWindows(ctx, rooms, buildingLength, buildingWidth, scale, offsetX, offsetY);

      // Draw dimensions
      this.drawDimensions(ctx, buildingLength, buildingWidth, scale, offsetX, offsetY);

      // Draw annotations (north arrow, scale, legend)
      this.drawAnnotations(ctx, floor, scale);

      // Convert to data URL
      const dataURL = canvas.toDataURL('image/png');

      logger.info(`✅ Floor plan generated successfully: ${floor.level}`);
      return dataURL;

    } catch (error) {
      logger.error(`❌ Failed to generate floor plan for floor ${floorIndex}:`, error);
      return this.generateFallbackFloorPlan(projectDNA, floorIndex);
    }
  }

  /**
   * Draw header with floor information
   */
  drawHeader(ctx, floor, projectDNA) {
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 28px Arial';
    ctx.fillText(`${floor.level}`, 50, 50);

    ctx.font = '18px Arial';
    ctx.fillText(`${projectDNA.buildingType} | ${floor.area}m² | Scale 1:${Math.round(100 / 12)}`, 50, 85);

    ctx.font = '14px Arial';
    ctx.fillText(`${floor.program}`, 50, 110);

    // Draw horizontal line
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(50, 125);
    ctx.lineTo(ctx.canvas.width - 50, 125);
    ctx.stroke();
  }

  /**
   * Layout rooms using simple rectangular packing algorithm
   */
  layoutRooms(rooms, totalWidth, totalDepth, scale, offsetX, offsetY) {
    const layouted = [];

    // Sort rooms by area (largest first for better packing)
    const sortedRooms = [...rooms].sort((a, b) => b.area - a.area);

    // Simple grid-based layout
    const cols = Math.ceil(Math.sqrt(sortedRooms.length));
    const rows = Math.ceil(sortedRooms.length / cols);

    const cellWidth = totalWidth / cols;
    const cellHeight = totalDepth / rows;

    sortedRooms.forEach((room, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);

      // Calculate room size based on its area proportion
      const areaRatio = Math.sqrt(room.area / (totalWidth * totalDepth));
      const roomWidth = cellWidth * (0.8 + areaRatio * 0.2); // Vary size by area
      const roomHeight = cellHeight * (0.8 + areaRatio * 0.2);

      // Position in grid
      const x = offsetX + (col * cellWidth * scale) + (cellWidth * scale - roomWidth * scale) / 2;
      const y = offsetY + (row * cellHeight * scale) + (cellHeight * scale - roomHeight * scale) / 2;

      layouted.push({
        name: room.name,
        area: room.area,
        x: x,
        y: y,
        width: roomWidth * scale,
        height: roomHeight * scale,
        col: col,
        row: row
      });
    });

    return layouted;
  }

  /**
   * Draw rooms with walls, labels, and area annotations
   */
  drawRooms(ctx, rooms, scale) {
    rooms.forEach(room => {
      // Draw room outline (walls)
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 4;
      ctx.strokeRect(room.x, room.y, room.width, room.height);

      // Fill room with light color
      ctx.fillStyle = '#F5F5F5';
      ctx.fillRect(room.x + 2, room.y + 2, room.width - 4, room.height - 4);

      // Draw room name (centered)
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 16px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const centerX = room.x + room.width / 2;
      const centerY = room.y + room.height / 2;

      // Wrap text if too long
      const roomName = room.name.toUpperCase();
      if (roomName.length > 15) {
        const words = roomName.split(' ');
        const line1 = words[0];
        const line2 = words.slice(1).join(' ');
        ctx.fillText(line1, centerX, centerY - 10);
        ctx.fillText(line2, centerX, centerY + 10);
      } else {
        ctx.fillText(roomName, centerX, centerY - 10);
      }

      // Draw area
      ctx.font = '14px Arial';
      ctx.fillText(`${room.area}m²`, centerX, centerY + 20);
    });

    // Reset text alignment
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  /**
   * Draw doors between adjacent rooms
   */
  drawDoors(ctx, rooms, scale) {
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;

    rooms.forEach((room, i) => {
      rooms.slice(i + 1).forEach(otherRoom => {
        // Check if rooms are adjacent (share a wall)
        const adjacent = this.areRoomsAdjacent(room, otherRoom);

        if (adjacent) {
          const doorPos = this.calculateDoorPosition(room, otherRoom, adjacent);

          if (doorPos) {
            // Draw door swing (arc)
            ctx.beginPath();
            ctx.arc(doorPos.x, doorPos.y, 30, doorPos.startAngle, doorPos.endAngle);
            ctx.stroke();

            // Draw door line
            ctx.beginPath();
            ctx.moveTo(doorPos.x, doorPos.y);
            ctx.lineTo(doorPos.x + 30 * Math.cos(doorPos.endAngle),
                      doorPos.y + 30 * Math.sin(doorPos.endAngle));
            ctx.stroke();
          }
        }
      });
    });
  }

  /**
   * Check if two rooms are adjacent
   */
  areRoomsAdjacent(room1, room2) {
    const tolerance = 10; // pixels

    // Check horizontal adjacency (left-right)
    if (Math.abs(room1.x + room1.width - room2.x) < tolerance ||
        Math.abs(room2.x + room2.width - room1.x) < tolerance) {
      // Check if they overlap vertically
      if (!(room1.y + room1.height < room2.y || room2.y + room2.height < room1.y)) {
        return 'horizontal';
      }
    }

    // Check vertical adjacency (top-bottom)
    if (Math.abs(room1.y + room1.height - room2.y) < tolerance ||
        Math.abs(room2.y + room2.height - room1.y) < tolerance) {
      // Check if they overlap horizontally
      if (!(room1.x + room1.width < room2.x || room2.x + room2.width < room1.x)) {
        return 'vertical';
      }
    }

    return null;
  }

  /**
   * Calculate door position between adjacent rooms
   */
  calculateDoorPosition(room1, room2, direction) {
    if (direction === 'horizontal') {
      // Door on vertical wall
      const x = room1.x + room1.width < room2.x ? room1.x + room1.width : room2.x + room2.width;
      const minY = Math.max(room1.y, room2.y);
      const maxY = Math.min(room1.y + room1.height, room2.y + room2.height);
      const y = (minY + maxY) / 2;

      return {
        x: x,
        y: y,
        startAngle: 0,
        endAngle: Math.PI / 2
      };
    } else if (direction === 'vertical') {
      // Door on horizontal wall
      const minX = Math.max(room1.x, room2.x);
      const maxX = Math.min(room1.x + room1.width, room2.x + room2.width);
      const x = (minX + maxX) / 2;
      const y = room1.y + room1.height < room2.y ? room1.y + room1.height : room2.y + room2.height;

      return {
        x: x,
        y: y,
        startAngle: -Math.PI / 2,
        endAngle: 0
      };
    }

    return null;
  }

  /**
   * Draw windows on exterior walls
   */
  drawWindows(ctx, rooms, buildingLength, buildingWidth, scale, offsetX, offsetY) {
    ctx.strokeStyle = '#0066CC';
    ctx.lineWidth = 3;

    // Find exterior walls and add windows
    const exteriorLeft = offsetX;
    const exteriorRight = offsetX + buildingLength * scale;
    const exteriorTop = offsetY;
    const exteriorBottom = offsetY + buildingWidth * scale;

    const tolerance = 10;

    rooms.forEach(room => {
      // Check each wall
      // Left wall
      if (Math.abs(room.x - exteriorLeft) < tolerance) {
        this.drawWindow(ctx, room.x - 2, room.y + room.height / 2 - 20, 4, 40, 'vertical');
      }
      // Right wall
      if (Math.abs(room.x + room.width - exteriorRight) < tolerance) {
        this.drawWindow(ctx, room.x + room.width - 2, room.y + room.height / 2 - 20, 4, 40, 'vertical');
      }
      // Top wall
      if (Math.abs(room.y - exteriorTop) < tolerance) {
        this.drawWindow(ctx, room.x + room.width / 2 - 20, room.y - 2, 40, 4, 'horizontal');
      }
      // Bottom wall
      if (Math.abs(room.y + room.height - exteriorBottom) < tolerance) {
        this.drawWindow(ctx, room.x + room.width / 2 - 20, room.y + room.height - 2, 40, 4, 'horizontal');
      }
    });
  }

  /**
   * Draw a single window
   */
  drawWindow(ctx, x, y, width, height, orientation) {
    ctx.fillStyle = '#B3D9FF';
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = '#0066CC';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, width, height);

    // Draw window divider
    if (orientation === 'vertical') {
      ctx.beginPath();
      ctx.moveTo(x + width / 2, y);
      ctx.lineTo(x + width / 2, y + height);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(x, y + height / 2);
      ctx.lineTo(x + width, y + height / 2);
      ctx.stroke();
    }
  }

  /**
   * Draw dimension lines
   */
  drawDimensions(ctx, buildingLength, buildingWidth, scale, offsetX, offsetY) {
    ctx.strokeStyle = '#666666';
    ctx.fillStyle = '#666666';
    ctx.lineWidth = 1;
    ctx.font = '12px Arial';

    // Horizontal dimension (length)
    const dimY = offsetY + buildingWidth * scale + 40;
    this.drawDimensionLine(ctx, offsetX, dimY, offsetX + buildingLength * scale, dimY, `${buildingLength.toFixed(1)}m`, 'horizontal');

    // Vertical dimension (width)
    const dimX = offsetX + buildingLength * scale + 40;
    this.drawDimensionLine(ctx, dimX, offsetY, dimX, offsetY + buildingWidth * scale, `${buildingWidth.toFixed(1)}m`, 'vertical');
  }

  /**
   * Draw a dimension line with arrows and text
   */
  drawDimensionLine(ctx, x1, y1, x2, y2, text, orientation) {
    // Draw line
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // Draw arrows
    const arrowSize = 8;
    if (orientation === 'horizontal') {
      // Left arrow
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x1 + arrowSize, y1 - arrowSize / 2);
      ctx.lineTo(x1 + arrowSize, y1 + arrowSize / 2);
      ctx.closePath();
      ctx.fill();

      // Right arrow
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - arrowSize, y2 - arrowSize / 2);
      ctx.lineTo(x2 - arrowSize, y2 + arrowSize / 2);
      ctx.closePath();
      ctx.fill();

      // Text
      ctx.textAlign = 'center';
      ctx.fillText(text, (x1 + x2) / 2, y1 - 10);
    } else {
      // Top arrow
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x1 - arrowSize / 2, y1 + arrowSize);
      ctx.lineTo(x1 + arrowSize / 2, y1 + arrowSize);
      ctx.closePath();
      ctx.fill();

      // Bottom arrow
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - arrowSize / 2, y2 - arrowSize);
      ctx.lineTo(x2 + arrowSize / 2, y2 - arrowSize);
      ctx.closePath();
      ctx.fill();

      // Text (rotated)
      ctx.save();
      ctx.translate(x1 + 20, (y1 + y2) / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center';
      ctx.fillText(text, 0, 0);
      ctx.restore();
    }

    ctx.textAlign = 'left';
  }

  /**
   * Draw annotations (north arrow, scale, legend)
   */
  drawAnnotations(ctx, floor, scale) {
    const canvasWidth = ctx.canvas.width;
    const canvasHeight = ctx.canvas.height;

    // Draw north arrow
    const northX = canvasWidth - 100;
    const northY = canvasHeight - 100;
    this.drawNorthArrow(ctx, northX, northY);

    // Draw scale bar
    const scaleX = 50;
    const scaleY = canvasHeight - 80;
    this.drawScaleBar(ctx, scaleX, scaleY, scale);

    // Draw legend
    const legendX = canvasWidth - 250;
    const legendY = 150;
    this.drawLegend(ctx, legendX, legendY);
  }

  /**
   * Draw north arrow
   */
  drawNorthArrow(ctx, x, y) {
    ctx.strokeStyle = '#000000';
    ctx.fillStyle = '#000000';
    ctx.lineWidth = 2;

    // Arrow shaft
    ctx.beginPath();
    ctx.moveTo(x, y + 30);
    ctx.lineTo(x, y - 30);
    ctx.stroke();

    // Arrow head
    ctx.beginPath();
    ctx.moveTo(x, y - 30);
    ctx.lineTo(x - 10, y - 15);
    ctx.lineTo(x + 10, y - 15);
    ctx.closePath();
    ctx.fill();

    // 'N' label
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('N', x, y - 45);

    ctx.textAlign = 'left';
  }

  /**
   * Draw scale bar
   */
  drawScaleBar(ctx, x, y, scale) {
    ctx.strokeStyle = '#000000';
    ctx.fillStyle = '#000000';
    ctx.lineWidth = 2;

    // Calculate scale (5 meters)
    const scaleLength = 5 * scale;

    // Draw scale bar
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + scaleLength, y);
    ctx.stroke();

    // Draw ticks
    ctx.beginPath();
    ctx.moveTo(x, y - 5);
    ctx.lineTo(x, y + 5);
    ctx.moveTo(x + scaleLength, y - 5);
    ctx.lineTo(x + scaleLength, y + 5);
    ctx.stroke();

    // Labels
    ctx.font = '12px Arial';
    ctx.fillText('0', x - 5, y + 20);
    ctx.fillText('5m', x + scaleLength - 10, y + 20);
    ctx.fillText(`Scale 1:${Math.round(100 / scale)}`, x + scaleLength / 2 - 30, y - 10);
  }

  /**
   * Draw legend
   */
  drawLegend(ctx, x, y) {
    ctx.font = 'bold 14px Arial';
    ctx.fillStyle = '#000000';
    ctx.fillText('LEGEND', x, y);

    ctx.font = '12px Arial';
    let currentY = y + 25;

    // Wall
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#000000';
    ctx.beginPath();
    ctx.moveTo(x, currentY);
    ctx.lineTo(x + 30, currentY);
    ctx.stroke();
    ctx.fillText('Wall', x + 40, currentY + 5);
    currentY += 25;

    // Door
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x + 15, currentY, 15, 0, Math.PI / 2);
    ctx.stroke();
    ctx.fillText('Door', x + 40, currentY + 5);
    currentY += 25;

    // Window
    ctx.strokeStyle = '#0066CC';
    ctx.lineWidth = 3;
    ctx.fillStyle = '#B3D9FF';
    ctx.fillRect(x, currentY - 8, 30, 16);
    ctx.strokeRect(x, currentY - 8, 30, 16);
    ctx.fillStyle = '#000000';
    ctx.fillText('Window', x + 40, currentY + 5);
  }

  /**
   * Generate fallback floor plan if generation fails
   */
  generateFallbackFloorPlan(projectDNA, floorIndex) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#F0F0F0';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#000000';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Floor Plan Generation Error', canvas.width / 2, canvas.height / 2 - 20);

    ctx.font = '16px Arial';
    ctx.fillText(`Floor ${floorIndex + 1}`, canvas.width / 2, canvas.height / 2 + 20);

    return canvas.toDataURL('image/png');
  }
}

const geometricFloorPlanService = new GeometricFloorPlanService();
export default geometricFloorPlanService;