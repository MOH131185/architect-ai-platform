/**
 * Geometry Render Service
 *
 * Produces neutral/grayscale placeholder renders for geometry baselines.
 * This placeholder returns tiny data URLs so downstream storage and UI can
 * handle renders without requiring GPU/Three.js in this step.
 *
 * Future: replace with real Three.js renders using geometryBuilder + cameras.
 */

import logger from '../utils/logger.js';

function tinyDataUrl(label = '') {
  // 1x1 gray pixel with optional label embedded in metadata
  const base = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO0lZuwAAAAASUVORK5CYII=';
  return `data:image/png;base64,${base}#${encodeURIComponent(label)}`;
}

export function renderGeometryPlaceholders(sceneSpec, options = {}) {
  const {
    includePerspective = true,
    includeAxon = true
  } = options;

  const renders = [];

  const orthos = [
    { type: 'orthographic_north', camera: { orientation: 'north' } },
    { type: 'orthographic_south', camera: { orientation: 'south' } },
    { type: 'orthographic_east', camera: { orientation: 'east' } },
    { type: 'orthographic_west', camera: { orientation: 'west' } }
  ];

  orthos.forEach((o) => {
    renders.push({
      type: o.type,
      url: tinyDataUrl(o.type),
      camera: o.camera,
      model: 'placeholder'
    });
  });

  if (includeAxon) {
    renders.push({
      type: 'axonometric',
      url: tinyDataUrl('axonometric'),
      camera: { orientation: 'axon' },
      model: 'placeholder'
    });
  }

  if (includePerspective) {
    renders.push({
      type: 'perspective_hero',
      url: tinyDataUrl('perspective_hero'),
      camera: { orientation: 'hero' },
      model: 'placeholder'
    });
  }

  logger.info('Generated geometry placeholder renders', { count: renders.length });
  return renders;
}

export default {
  renderGeometryPlaceholders
};
