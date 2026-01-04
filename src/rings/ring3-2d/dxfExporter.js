function formatVertex({ x, y }) {
  return `10\n${x.toFixed(3)}\n20\n${y.toFixed(3)}\n30\n0.0`;
}

export function convertFootprintToDXF(footprint) {
  if (!Array.isArray(footprint) || footprint.length === 0) {
    return '';
  }

  const vertices = footprint.map(formatVertex).join('\n');

  return [
    '0',
    'SECTION',
    '2',
    'ENTITIES',
    '0',
    'LWPOLYLINE',
    '8',
    'FLOOR_PLAN',
    '90',
    footprint.length.toString(),
    vertices,
    '0',
    'ENDSEC',
    '0',
    'EOF'
  ].join('\n');
}

