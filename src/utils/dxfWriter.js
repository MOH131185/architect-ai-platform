/**
 * DXF writer for vector floor plans
 * Generates AutoCAD-compatible DXF files with proper layers and entities
 */

/**
 * Export vector floor plans to DXF format
 * @param {Object} vectorPlan - Vector plan data from vectorPlanGenerator
 * @param {Object} metadata - Project metadata
 * @returns {string} DXF content
 */
export function exportToDXF(vectorPlan, metadata = {}) {
  let dxf = '';
  let entityHandle = 100;

  // Header section
  dxf += '0\nSECTION\n2\nHEADER\n';
  dxf += '9\n$ACADVER\n1\nAC1021\n'; // AutoCAD 2007
  dxf += '9\n$INSUNITS\n70\n6\n'; // Meters
  dxf += '0\nENDSEC\n';

  // Tables section (layers)
  dxf += '0\nSECTION\n2\nTABLES\n';
  dxf += '0\nTABLE\n2\nLAYER\n70\n6\n'; // 6 layers

  const layers = [
    { name: 'WALLS', color: 7 },      // White
    { name: 'DOORS', color: 3 },      // Green
    { name: 'WINDOWS', color: 5 },    // Blue
    { name: 'LABELS', color: 7 },     // White
    { name: 'DIMENSIONS', color: 1 }, // Red
    { name: 'ANNOTATIONS', color: 8 } // Gray
  ];

  layers.forEach(layer => {
    dxf += `0\nLAYER\n2\n${layer.name}\n70\n0\n62\n${layer.color}\n6\nCONTINUOUS\n`;
  });

  dxf += '0\nENDTABLE\n0\nENDSEC\n';

  // Entities section
  dxf += '0\nSECTION\n2\nENTITIES\n';

  vectorPlan.floors.forEach((floor, floorIndex) => {
    const zLevel = floor.elevation;

    // Walls
    floor.layers.walls.forEach(wall => {
      dxf += `0\nLINE\n5\n${(entityHandle++).toString(16)}\n8\nWALLS\n`;
      dxf += `10\n${wall.x1.toFixed(4)}\n20\n${wall.y1.toFixed(4)}\n30\n${zLevel.toFixed(4)}\n`;
      dxf += `11\n${wall.x2.toFixed(4)}\n21\n${wall.y2.toFixed(4)}\n31\n${zLevel.toFixed(4)}\n`;
    });

    // Doors (as arcs)
    floor.layers.doors.forEach(door => {
      const radius = door.width;
      dxf += `0\nARC\n5\n${(entityHandle++).toString(16)}\n8\nDOORS\n`;
      dxf += `10\n${door.x.toFixed(4)}\n20\n${door.y.toFixed(4)}\n30\n${zLevel.toFixed(4)}\n`;
      dxf += `40\n${radius.toFixed(4)}\n`; // Radius
      dxf += `50\n0\n51\n90\n`; // Start angle 0, end angle 90
    });

    // Windows (as lines)
    floor.layers.windows.forEach(window => {
      const halfWidth = window.width / 2;
      dxf += `0\nLINE\n5\n${(entityHandle++).toString(16)}\n8\nWINDOWS\n`;
      dxf += `10\n${(window.x - halfWidth).toFixed(4)}\n20\n${window.y.toFixed(4)}\n30\n${zLevel.toFixed(4)}\n`;
      dxf += `11\n${(window.x + halfWidth).toFixed(4)}\n21\n${window.y.toFixed(4)}\n31\n${zLevel.toFixed(4)}\n`;
    });

    // Labels (as text)
    floor.layers.labels.forEach(label => {
      dxf += `0\nTEXT\n5\n${(entityHandle++).toString(16)}\n8\nLABELS\n`;
      dxf += `10\n${label.x.toFixed(4)}\n20\n${label.y.toFixed(4)}\n30\n${zLevel.toFixed(4)}\n`;
      dxf += `40\n0.3\n`; // Text height
      dxf += `1\n${label.text}\n`;
      dxf += `72\n1\n`; // Horizontal justification (center)
      dxf += `11\n${label.x.toFixed(4)}\n21\n${label.y.toFixed(4)}\n31\n${zLevel.toFixed(4)}\n`;
    });

    // Dimensions
    floor.layers.dimensions.forEach(dim => {
      // Dimension line
      dxf += `0\nLINE\n5\n${(entityHandle++).toString(16)}\n8\nDIMENSIONS\n`;
      dxf += `10\n${dim.x1.toFixed(4)}\n20\n${dim.y1.toFixed(4)}\n30\n${zLevel.toFixed(4)}\n`;
      dxf += `11\n${dim.x2.toFixed(4)}\n21\n${dim.y2.toFixed(4)}\n31\n${zLevel.toFixed(4)}\n`;

      // Dimension text
      const midX = (dim.x1 + dim.x2) / 2;
      const midY = (dim.y1 + dim.y2) / 2;
      dxf += `0\nTEXT\n5\n${(entityHandle++).toString(16)}\n8\nDIMENSIONS\n`;
      dxf += `10\n${midX.toFixed(4)}\n20\n${midY.toFixed(4)}\n30\n${zLevel.toFixed(4)}\n`;
      dxf += `40\n0.2\n`; // Text height
      dxf += `1\n${dim.label}\n`;
      dxf += `72\n1\n`; // Center justified
      dxf += `11\n${midX.toFixed(4)}\n21\n${midY.toFixed(4)}\n31\n${zLevel.toFixed(4)}\n`;
    });

    // Floor title annotation
    dxf += `0\nTEXT\n5\n${(entityHandle++).toString(16)}\n8\nANNOTATIONS\n`;
    dxf += `10\n${floor.bounds.minX.toFixed(4)}\n20\n${floor.bounds.maxY.toFixed(4)}\n30\n${zLevel.toFixed(4)}\n`;
    dxf += `40\n0.5\n`; // Text height
    dxf += `1\n${floor.name}\n`;
  });

  dxf += '0\nENDSEC\n';

  // EOF
  dxf += '0\nEOF\n';

  return dxf;
}

