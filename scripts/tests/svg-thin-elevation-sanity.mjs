/**
 * SVG Thin Elevation Sanity Check Test
 *
 * This test reproduces the "thin elevations/sections" bug where the drawing
 * bounding box is much smaller than the canvas, resulting in collapsed/thin outputs.
 *
 * SANITY CHECKS:
 * 1. Drawing bounding box width >= 25% of canvas width
 * 2. Drawing area coverage >= 10% of canvas area
 *
 * Run: node scripts/tests/svg-thin-elevation-sanity.mjs
 */

import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..', '..');

// Helper to create file:// URLs for Windows compatibility
function toFileUrl(path) {
  return pathToFileURL(path).href;
}

// =============================================================================
// SANITY CHECK THRESHOLDS
// =============================================================================

const MIN_DRAWING_WIDTH_RATIO = 0.25;  // 25% of canvas width
const MIN_DRAWING_AREA_COVERAGE = 0.10; // 10% of canvas area

// =============================================================================
// PANEL OUTPUT SIZES
// =============================================================================

const PANEL_OUTPUT_SIZES = {
  elevation_north: { width: 1200, height: 800 },
  elevation_south: { width: 1200, height: 800 },
  elevation_east: { width: 1200, height: 800 },
  elevation_west: { width: 1200, height: 800 },
  section_longitudinal: { width: 1200, height: 800 },
  section_transverse: { width: 1200, height: 800 },
  default: { width: 1024, height: 1024 },
};

// =============================================================================
// MOCK DETACHED 2-FLOOR HOUSE INPUT
// =============================================================================

function createMockDetached2F() {
  const lengthM = 12;
  const widthM = 10;
  const heightM = 7;

  return {
    envelope: {
      footprint: {
        lengthM,
        widthM,
      },
    },

    floors: [
      {
        level: 0,
        rooms: [
          { name: 'Living Room', areaM2: 35, polygon: [
            { x: 0, y: 0 }, { x: 6000, y: 0 }, { x: 6000, y: 5000 }, { x: 0, y: 5000 }
          ]},
          { name: 'Kitchen', areaM2: 20, polygon: [
            { x: 6000, y: 0 }, { x: 10000, y: 0 }, { x: 10000, y: 5000 }, { x: 6000, y: 5000 }
          ]},
        ],
        walls: [
          { start: { x: 0, y: 0 }, end: { x: 12000, y: 0 }, isExternal: true },
          { start: { x: 12000, y: 0 }, end: { x: 12000, y: 10000 }, isExternal: true },
          { start: { x: 12000, y: 10000 }, end: { x: 0, y: 10000 }, isExternal: true },
          { start: { x: 0, y: 10000 }, end: { x: 0, y: 0 }, isExternal: true },
        ],
        openings: [
          { type: 'door', widthMM: 900, heightMM: 2100, centerX: 5000, centerY: 10000 },
          { type: 'window', widthMM: 1200, heightMM: 1400, centerX: 3000, centerY: 0 },
        ],
      },
      {
        level: 1,
        rooms: [
          { name: 'Master Bedroom', areaM2: 20, polygon: [
            { x: 0, y: 0 }, { x: 5000, y: 0 }, { x: 5000, y: 5000 }, { x: 0, y: 5000 }
          ]},
          { name: 'Bedroom 2', areaM2: 15, polygon: [
            { x: 5000, y: 0 }, { x: 10000, y: 0 }, { x: 10000, y: 4000 }, { x: 5000, y: 4000 }
          ]},
        ],
        walls: [
          { start: { x: 0, y: 0 }, end: { x: 12000, y: 0 }, isExternal: true },
          { start: { x: 12000, y: 0 }, end: { x: 12000, y: 10000 }, isExternal: true },
          { start: { x: 12000, y: 10000 }, end: { x: 0, y: 10000 }, isExternal: true },
          { start: { x: 0, y: 10000 }, end: { x: 0, y: 0 }, isExternal: true },
        ],
        openings: [
          { type: 'window', widthMM: 1200, heightMM: 1400, centerX: 2500, centerY: 0 },
          { type: 'window', widthMM: 1000, heightMM: 1200, centerX: 7500, centerY: 0 },
        ],
      },
    ],

    getDimensionsMeters() {
      return { length: lengthM, width: widthM, height: heightM };
    },

    getFloor(index) {
      return this.floors[index] || null;
    },

    getRoofProfile(orientation) {
      const roofHeight = 2.5;
      if (['N', 'S'].includes(orientation)) {
        return [
          { x: 0, z: 0 },
          { x: lengthM / 2, z: roofHeight },
          { x: lengthM, z: 0 },
        ];
      }
      return [
        { x: 0, z: roofHeight },
        { x: widthM, z: roofHeight },
      ];
    },

    getOpeningsForFacade(orientation) {
      return [
        { type: 'window', widthMM: 1200, heightMM: 1400, position: { x: 0.25, z: 1.5 } },
        { type: 'window', widthMM: 1200, heightMM: 1400, position: { x: 0.75, z: 1.5 } },
        { type: 'window', widthMM: 1000, heightMM: 1200, position: { x: 0.25, z: 4.5 } },
        { type: 'window', widthMM: 1000, heightMM: 1200, position: { x: 0.75, z: 4.5 } },
      ];
    },
  };
}

// =============================================================================
// SVG BOUNDS CALCULATION (from SVGRasterizer)
// =============================================================================

function calculateSVGBounds(svgString) {
  const bounds = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  };

  // Parse rect elements (both attribute orders)
  const rectRegex = /<rect[^>]*?(?:x="([^"]*)"[^>]*?y="([^"]*)"[^>]*?width="([^"]*)"[^>]*?height="([^"]*)"|width="([^"]*)"[^>]*?height="([^"]*)"[^>]*?x="([^"]*)"[^>]*?y="([^"]*)")/gi;
  let match;
  while ((match = rectRegex.exec(svgString)) !== null) {
    let x, y, w, h;
    if (match[1] !== undefined) {
      x = parseFloat(match[1]) || 0;
      y = parseFloat(match[2]) || 0;
      w = parseFloat(match[3]) || 0;
      h = parseFloat(match[4]) || 0;
    } else {
      w = parseFloat(match[5]) || 0;
      h = parseFloat(match[6]) || 0;
      x = parseFloat(match[7]) || 0;
      y = parseFloat(match[8]) || 0;
    }

    // Skip full-size background rects
    if (match[0].includes('100%')) continue;
    if (w === 0 || h === 0) continue;

    bounds.minX = Math.min(bounds.minX, x);
    bounds.minY = Math.min(bounds.minY, y);
    bounds.maxX = Math.max(bounds.maxX, x + w);
    bounds.maxY = Math.max(bounds.maxY, y + h);
  }

  // Parse line elements
  const lineRegex = /<line[^>]*x1="([^"]*)"[^>]*y1="([^"]*)"[^>]*x2="([^"]*)"[^>]*y2="([^"]*)"/gi;
  while ((match = lineRegex.exec(svgString)) !== null) {
    const x1 = parseFloat(match[1]) || 0;
    const y1 = parseFloat(match[2]) || 0;
    const x2 = parseFloat(match[3]) || 0;
    const y2 = parseFloat(match[4]) || 0;

    bounds.minX = Math.min(bounds.minX, x1, x2);
    bounds.minY = Math.min(bounds.minY, y1, y2);
    bounds.maxX = Math.max(bounds.maxX, x1, x2);
    bounds.maxY = Math.max(bounds.maxY, y1, y2);
  }

  // Parse polygon elements
  const polygonRegex = /<polygon[^>]*points="([^"]*)"/gi;
  while ((match = polygonRegex.exec(svgString)) !== null) {
    const points = match[1].trim().split(/[\s,]+/);
    for (let i = 0; i < points.length - 1; i += 2) {
      const x = parseFloat(points[i]) || 0;
      const y = parseFloat(points[i + 1]) || 0;
      bounds.minX = Math.min(bounds.minX, x);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxX = Math.max(bounds.maxX, x);
      bounds.maxY = Math.max(bounds.maxY, y);
    }
  }

  // Parse path elements
  const pathRegex = /<path[^>]*d="([^"]*)"/gi;
  while ((match = pathRegex.exec(svgString)) !== null) {
    const pathData = match[1];
    const coords = pathData.match(/[-+]?[0-9]*\.?[0-9]+/g);
    if (coords) {
      for (let i = 0; i < coords.length - 1; i += 2) {
        const x = parseFloat(coords[i]) || 0;
        const y = parseFloat(coords[i + 1]) || 0;
        bounds.minX = Math.min(bounds.minX, x);
        bounds.minY = Math.min(bounds.minY, y);
        bounds.maxX = Math.max(bounds.maxX, x);
        bounds.maxY = Math.max(bounds.maxY, y);
      }
    }
  }

  // Handle case where no bounds found
  if (bounds.minX === Infinity) {
    const viewBoxMatch = svgString.match(/viewBox="([^"]*)"/i);
    if (viewBoxMatch) {
      const [vbMinX, vbMinY, vbWidth, vbHeight] = viewBoxMatch[1].split(/\s+/).map(Number);
      bounds.minX = vbMinX;
      bounds.minY = vbMinY;
      bounds.maxX = vbMinX + vbWidth;
      bounds.maxY = vbMinY + vbHeight;
    } else {
      bounds.minX = 0;
      bounds.minY = 0;
      bounds.maxX = 1024;
      bounds.maxY = 1024;
    }
  }

  bounds.width = bounds.maxX - bounds.minX;
  bounds.height = bounds.maxY - bounds.minY;

  return bounds;
}

// =============================================================================
// SANITY CHECK FUNCTION
// =============================================================================

function performRasterizerSanityCheck(svgString, panelType) {
  const issues = [];
  const metrics = {};

  // Get canvas size (use viewBox dimensions from SVG)
  const viewBoxMatch = svgString.match(/viewBox="([^"]*)"/i);
  let canvasWidth, canvasHeight;

  if (viewBoxMatch) {
    const parts = viewBoxMatch[1].split(/\s+/).map(Number);
    canvasWidth = parts[2];
    canvasHeight = parts[3];
  } else {
    const panelSize = PANEL_OUTPUT_SIZES[panelType] || PANEL_OUTPUT_SIZES.default;
    canvasWidth = panelSize.width;
    canvasHeight = panelSize.height;
  }

  const canvasArea = canvasWidth * canvasHeight;

  // Calculate actual content bounds
  const bounds = calculateSVGBounds(svgString);
  metrics.bounds = bounds;
  metrics.canvasWidth = canvasWidth;
  metrics.canvasHeight = canvasHeight;

  // SANITY CHECK 1: Drawing width ratio
  const drawingWidthRatio = bounds.width / canvasWidth;
  metrics.drawingWidthRatio = drawingWidthRatio;

  if (drawingWidthRatio < MIN_DRAWING_WIDTH_RATIO) {
    issues.push(
      `THIN DRAWING: Drawing width (${bounds.width.toFixed(0)}px) is only ${(drawingWidthRatio * 100).toFixed(1)}% ` +
      `of canvas width (${canvasWidth}px). Minimum required: ${MIN_DRAWING_WIDTH_RATIO * 100}%`
    );
  }

  // SANITY CHECK 2: Drawing area coverage
  const drawingArea = bounds.width * bounds.height;
  const drawingAreaCoverage = drawingArea / canvasArea;
  metrics.drawingArea = drawingArea;
  metrics.drawingAreaCoverage = drawingAreaCoverage;

  if (drawingAreaCoverage < MIN_DRAWING_AREA_COVERAGE) {
    issues.push(
      `LOW COVERAGE: Drawing area (${drawingArea.toFixed(0)}px²) covers only ${(drawingAreaCoverage * 100).toFixed(1)}% ` +
      `of canvas area (${canvasArea}px²). Minimum required: ${MIN_DRAWING_AREA_COVERAGE * 100}%`
    );
  }

  // SANITY CHECK 3: Drawing height ratio
  const drawingHeightRatio = bounds.height / canvasHeight;
  metrics.drawingHeightRatio = drawingHeightRatio;

  if (drawingHeightRatio < MIN_DRAWING_WIDTH_RATIO) {
    issues.push(
      `COLLAPSED HEIGHT: Drawing height (${bounds.height.toFixed(0)}px) is only ${(drawingHeightRatio * 100).toFixed(1)}% ` +
      `of canvas height (${canvasHeight}px). Minimum required: ${MIN_DRAWING_WIDTH_RATIO * 100}%`
    );
  }

  return {
    passed: issues.length === 0,
    issues,
    metrics,
  };
}

// =============================================================================
// TEST RUNNER
// =============================================================================

class TestRunner {
  constructor() {
    this.results = [];
  }

  async test(name, fn) {
    try {
      await fn();
      this.results.push({ name, passed: true });
      console.log(`  ✅ ${name}`);
    } catch (error) {
      this.results.push({ name, passed: false, error: error.message });
      console.log(`  ❌ ${name}`);
      console.log(`     Error: ${error.message}`);
    }
  }

  assert(condition, message) {
    if (!condition) {
      throw new Error(message);
    }
  }

  summary() {
    const passed = this.results.filter(r => r.passed).length;
    const total = this.results.length;
    console.log(`\n${'='.repeat(60)}`);
    console.log(`SVG THIN ELEVATION SANITY TESTS: ${passed}/${total} passed`);
    console.log(`${'='.repeat(60)}`);
    return passed === total;
  }
}

// =============================================================================
// TESTS
// =============================================================================

async function runTests() {
  const runner = new TestRunner();

  console.log('\n' + '='.repeat(60));
  console.log('SVG THIN ELEVATION SANITY CHECK TEST');
  console.log('='.repeat(60) + '\n');

  // Import GeometryConditioner
  let GeometryConditioner;
  try {
    GeometryConditioner = await import(toFileUrl(join(projectRoot, 'src/geometry/GeometryConditioner.js')));
  } catch (error) {
    console.error('Failed to import GeometryConditioner:', error.message);
    process.exit(1);
  }

  const mockModel = createMockDetached2F();

  console.log('\n--- ELEVATION TESTS ---\n');

  // Test all 4 elevations
  for (const orientation of ['S', 'N', 'E', 'W']) {
    await runner.test(`${orientation} elevation drawing width >= 25% of canvas`, async () => {
      const condition = GeometryConditioner.generateElevationCondition(mockModel, orientation, {
        width: 1024,
        height: 1024,
      });

      runner.assert(condition && condition.svg, `${orientation} elevation should be generated`);

      const sanityCheck = performRasterizerSanityCheck(condition.svg, `elevation_${orientation.toLowerCase()}`);

      if (!sanityCheck.passed) {
        console.log(`     viewBox metrics: width=${sanityCheck.metrics.canvasWidth}, height=${sanityCheck.metrics.canvasHeight}`);
        console.log(`     bounds: width=${sanityCheck.metrics.bounds.width.toFixed(0)}, height=${sanityCheck.metrics.bounds.height.toFixed(0)}`);
        console.log(`     widthRatio=${(sanityCheck.metrics.drawingWidthRatio * 100).toFixed(1)}%`);
        console.log(`     coverage=${(sanityCheck.metrics.drawingAreaCoverage * 100).toFixed(1)}%`);
      }

      runner.assert(sanityCheck.passed, sanityCheck.issues.join('; '));
    });
  }

  console.log('\n--- SECTION TESTS ---\n');

  // Test sections
  for (const sectionType of ['longitudinal', 'transverse']) {
    await runner.test(`${sectionType} section drawing width >= 25% of canvas`, async () => {
      const condition = GeometryConditioner.generateSectionCondition(mockModel, sectionType, {
        width: 1024,
        height: 1024,
      });

      runner.assert(condition && condition.svg, `${sectionType} section should be generated`);

      const sanityCheck = performRasterizerSanityCheck(condition.svg, `section_${sectionType}`);

      if (!sanityCheck.passed) {
        console.log(`     viewBox metrics: width=${sanityCheck.metrics.canvasWidth}, height=${sanityCheck.metrics.canvasHeight}`);
        console.log(`     bounds: width=${sanityCheck.metrics.bounds.width.toFixed(0)}, height=${sanityCheck.metrics.bounds.height.toFixed(0)}`);
        console.log(`     widthRatio=${(sanityCheck.metrics.drawingWidthRatio * 100).toFixed(1)}%`);
      }

      runner.assert(sanityCheck.passed, sanityCheck.issues.join('; '));
    });
  }

  console.log('\n--- COLLAPSED CONTENT DETECTION ---\n');

  await runner.test('Detects thin elevation (10% width)', async () => {
    const badSvg = `<svg viewBox="0 0 1024 1024">
      <rect x="460" y="300" width="100" height="400" fill="black"/>
    </svg>`;

    const sanityCheck = performRasterizerSanityCheck(badSvg, 'elevation_south');

    runner.assert(!sanityCheck.passed, 'Should detect thin elevation');
    runner.assert(sanityCheck.issues[0].includes('THIN DRAWING'), 'Should identify THIN DRAWING issue');
  });

  await runner.test('Passes for good SVG (80% width)', async () => {
    const goodSvg = `<svg viewBox="0 0 1200 800">
      <rect x="100" y="100" width="1000" height="600" fill="none" stroke="black"/>
      <rect x="200" y="200" width="100" height="150" fill="white" stroke="black"/>
    </svg>`;

    const sanityCheck = performRasterizerSanityCheck(goodSvg, 'elevation_south');

    runner.assert(sanityCheck.passed, 'Good SVG should pass sanity check');
  });

  return runner.summary();
}

// =============================================================================
// MAIN
// =============================================================================

runTests()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Test runner failed:', error);
    process.exit(1);
  });
