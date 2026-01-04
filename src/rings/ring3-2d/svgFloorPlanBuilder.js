import { polygonToLocalXY } from '../../utils/geometry.js';

const DEFAULT_SCALE = 50; // pixels per meter
const DEFAULT_PADDING = 40; // px

function ensureFootprint(dna) {
  if (dna?.geometry?.footprint?.vertices?.length >= 3) {
    return dna.geometry.footprint.vertices;
  }

  const length = dna?.geometry?.footprint?.length || dna?.dimensions?.length || 20;
  const width = dna?.geometry?.footprint?.width || dna?.dimensions?.width || 12;

  return [
    { x: 0, y: 0 },
    { x: length, y: 0 },
    { x: length, y: width },
    { x: 0, y: width }
  ];
}

function createPolygonPath(vertices, scale, padding) {
  if (!vertices || vertices.length === 0) {
    return '';
  }

  const commands = vertices.map((vertex, index) => {
    const prefix = index === 0 ? 'M' : 'L';
    return `${prefix}${(vertex.x * scale + padding).toFixed(2)} ${(vertex.y * scale + padding).toFixed(2)}`;
  });

  commands.push('Z');
  return commands.join(' ');
}

function buildRoomShapes(rooms, scale, padding) {
  if (!Array.isArray(rooms)) {
    return '';
  }

  return rooms
    .filter(room => Array.isArray(room.vertices) && room.vertices.length >= 3)
    .map(room => {
      const path = createPolygonPath(room.vertices, scale, padding);
      const centerX = room.vertices.reduce((acc, v) => acc + v.x, 0) / room.vertices.length;
      const centerY = room.vertices.reduce((acc, v) => acc + v.y, 0) / room.vertices.length;
      return `
        <path d="${path}" fill="#f6f6f6" stroke="#333" stroke-width="1.5" />
        <text x="${(centerX * scale + padding).toFixed(2)}" y="${(centerY * scale + padding).toFixed(2)}"
          font-size="12" text-anchor="middle" fill="#111">${room.name || 'Room'}</text>
      `;
    })
    .join('\n');
}

function encodeSvg(svg) {
  if (typeof window !== 'undefined' && typeof window.btoa === 'function') {
    return `data:image/svg+xml;base64,${window.btoa(unescape(encodeURIComponent(svg)))}`;
  }
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

export function buildSVGFloorPlan(dna, level = 0, options = {}) {
  const scale = options.scale || DEFAULT_SCALE;
  const padding = options.padding || DEFAULT_PADDING;

  const footprint = ensureFootprint(dna);
  const footprintPath = createPolygonPath(footprint, scale, padding);

  const rooms = (dna?.rooms || []).filter(room => room.level === level);
  const roomShapes = buildRoomShapes(rooms, scale, padding);

  const maxX = Math.max(...footprint.map(vertex => vertex.x));
  const maxY = Math.max(...footprint.map(vertex => vertex.y));
  const widthPx = maxX * scale + padding * 2;
  const heightPx = maxY * scale + padding * 2;

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${widthPx}" height="${heightPx}" viewBox="0 0 ${widthPx} ${heightPx}">
      <rect x="0" y="0" width="${widthPx}" height="${heightPx}" fill="#fff" />
      <path d="${footprintPath}" fill="none" stroke="#111" stroke-width="2.5" />
      ${roomShapes}
    </svg>
  `.trim();

  return {
    svg,
    dataUrl: encodeSvg(svg),
    meta: {
      widthPx,
      heightPx,
      scale,
      padding
    }
  };
}

