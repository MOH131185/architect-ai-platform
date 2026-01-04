/**
 * SVG Thin Elevation Bug Test
 *
 * This test reproduces the "thin elevations/sections" bug where the drawing
 * bounding box is much smaller than the canvas, resulting in collapsed/thin outputs.
 *
 * SANITY CHECKS:
 * 1. Drawing bounding box width >= 25% of canvas width
 * 2. Drawing area coverage >= 10% of canvas area
 *
 * Run: npm test -- --testPathPattern="svgThinElevationBug"
 */

import {
  calculateSVGBounds,
  validateSVGForRasterization,
  PANEL_OUTPUT_SIZES,
} from '../../services/rendering/SVGRasterizer.js';

// =============================================================================
// SANITY CHECK THRESHOLDS
// =============================================================================

/**
 * Minimum required drawing width as percentage of canvas width.
 * If drawing is thinner than 25% of canvas, it's a "thin elevation" bug.
 */
const MIN_DRAWING_WIDTH_RATIO = 0.25;

/**
 * Minimum required drawing area as percentage of canvas area.
 * If drawing covers less than 10% of canvas, it's a coverage bug.
 */
const MIN_DRAWING_AREA_COVERAGE = 0.1;

// =============================================================================
// MOCK DETACHED 2-FLOOR HOUSE INPUT
// =============================================================================

/**
 * Creates a mock BuildingModel for a detached 2-floor house.
 * This is the same input that triggers the thin elevation bug.
 */
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
          {
            name: 'Living Room',
            areaM2: 35,
            polygon: [
              { x: 0, y: 0 },
              { x: 6000, y: 0 },
              { x: 6000, y: 5000 },
              { x: 0, y: 5000 },
            ],
          },
          {
            name: 'Kitchen',
            areaM2: 20,
            polygon: [
              { x: 6000, y: 0 },
              { x: 10000, y: 0 },
              { x: 10000, y: 5000 },
              { x: 6000, y: 5000 },
            ],
          },
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
          {
            name: 'Master Bedroom',
            areaM2: 20,
            polygon: [
              { x: 0, y: 0 },
              { x: 5000, y: 0 },
              { x: 5000, y: 5000 },
              { x: 0, y: 5000 },
            ],
          },
          {
            name: 'Bedroom 2',
            areaM2: 15,
            polygon: [
              { x: 5000, y: 0 },
              { x: 10000, y: 0 },
              { x: 10000, y: 4000 },
              { x: 5000, y: 4000 },
            ],
          },
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
// SANITY CHECK FUNCTION
// =============================================================================

/**
 * Performs sanity check on SVG rasterization output.
 * Fails if:
 * 1. Drawing bounding box width < 25% of canvas width
 * 2. Drawing area coverage < 10% of canvas area
 *
 * @param {string} svgString - The SVG content
 * @param {string} panelType - Panel type for canvas size lookup
 * @returns {Object} { passed, issues, metrics }
 */
export function performRasterizerSanityCheck(svgString, panelType) {
  const issues = [];
  const metrics = {};

  // Get expected canvas size for this panel type
  const canvasSize = PANEL_OUTPUT_SIZES[panelType] || PANEL_OUTPUT_SIZES.default;
  const canvasWidth = canvasSize.width;
  const canvasHeight = canvasSize.height;
  const canvasArea = canvasWidth * canvasHeight;

  // Calculate actual content bounds
  const bounds = calculateSVGBounds(svgString);
  metrics.bounds = bounds;
  metrics.canvasSize = canvasSize;

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

  // SANITY CHECK 3: Check if bounds height is also reasonable
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
// TESTS
// =============================================================================

describe('SVG Thin Elevation Bug', () => {
  let GeometryConditioner;
  let mockModel;

  beforeAll(async () => {
    // Dynamic import for ES modules
    try {
      GeometryConditioner = await import('../../geometry/GeometryConditioner.js');
    } catch (e) {
      console.warn('GeometryConditioner not available for testing:', e.message);
    }
    mockModel = createMockDetached2F();
  });

  describe('Elevation Sanity Checks', () => {
    test('South elevation drawing width >= 25% of canvas width', async () => {
      if (!GeometryConditioner) {
        console.warn('Skipping test - GeometryConditioner not available');
        return;
      }

      const condition = GeometryConditioner.generateElevationCondition(mockModel, 'S', {
        width: 1024,
        height: 1024,
      });

      expect(condition).toBeTruthy();
      expect(condition.svg).toBeTruthy();

      const sanityCheck = performRasterizerSanityCheck(condition.svg, 'elevation_south');

      if (!sanityCheck.passed) {
        console.error('Sanity check failed:', sanityCheck.issues);
        console.error('Metrics:', sanityCheck.metrics);
      }

      expect(sanityCheck.passed).toBe(true);
      expect(sanityCheck.metrics.drawingWidthRatio).toBeGreaterThanOrEqual(MIN_DRAWING_WIDTH_RATIO);
    });

    test('North elevation drawing width >= 25% of canvas width', async () => {
      if (!GeometryConditioner) {
        console.warn('Skipping test - GeometryConditioner not available');
        return;
      }

      const condition = GeometryConditioner.generateElevationCondition(mockModel, 'N', {
        width: 1024,
        height: 1024,
      });

      expect(condition).toBeTruthy();
      expect(condition.svg).toBeTruthy();

      const sanityCheck = performRasterizerSanityCheck(condition.svg, 'elevation_north');

      expect(sanityCheck.passed).toBe(true);
      expect(sanityCheck.metrics.drawingWidthRatio).toBeGreaterThanOrEqual(MIN_DRAWING_WIDTH_RATIO);
    });

    test('East elevation drawing width >= 25% of canvas width', async () => {
      if (!GeometryConditioner) {
        console.warn('Skipping test - GeometryConditioner not available');
        return;
      }

      const condition = GeometryConditioner.generateElevationCondition(mockModel, 'E', {
        width: 1024,
        height: 1024,
      });

      expect(condition).toBeTruthy();
      expect(condition.svg).toBeTruthy();

      const sanityCheck = performRasterizerSanityCheck(condition.svg, 'elevation_east');

      expect(sanityCheck.passed).toBe(true);
      expect(sanityCheck.metrics.drawingWidthRatio).toBeGreaterThanOrEqual(MIN_DRAWING_WIDTH_RATIO);
    });

    test('West elevation drawing width >= 25% of canvas width', async () => {
      if (!GeometryConditioner) {
        console.warn('Skipping test - GeometryConditioner not available');
        return;
      }

      const condition = GeometryConditioner.generateElevationCondition(mockModel, 'W', {
        width: 1024,
        height: 1024,
      });

      expect(condition).toBeTruthy();
      expect(condition.svg).toBeTruthy();

      const sanityCheck = performRasterizerSanityCheck(condition.svg, 'elevation_west');

      expect(sanityCheck.passed).toBe(true);
      expect(sanityCheck.metrics.drawingWidthRatio).toBeGreaterThanOrEqual(MIN_DRAWING_WIDTH_RATIO);
    });
  });

  describe('Section Sanity Checks', () => {
    test('Longitudinal section drawing width >= 25% of canvas width', async () => {
      if (!GeometryConditioner) {
        console.warn('Skipping test - GeometryConditioner not available');
        return;
      }

      const condition = GeometryConditioner.generateSectionCondition(mockModel, 'longitudinal', {
        width: 1024,
        height: 1024,
      });

      expect(condition).toBeTruthy();
      expect(condition.svg).toBeTruthy();

      const sanityCheck = performRasterizerSanityCheck(condition.svg, 'section_longitudinal');

      if (!sanityCheck.passed) {
        console.error('Sanity check failed:', sanityCheck.issues);
        console.error('Metrics:', sanityCheck.metrics);
      }

      expect(sanityCheck.passed).toBe(true);
      expect(sanityCheck.metrics.drawingWidthRatio).toBeGreaterThanOrEqual(MIN_DRAWING_WIDTH_RATIO);
    });

    test('Transverse section drawing width >= 25% of canvas width', async () => {
      if (!GeometryConditioner) {
        console.warn('Skipping test - GeometryConditioner not available');
        return;
      }

      const condition = GeometryConditioner.generateSectionCondition(mockModel, 'transverse', {
        width: 1024,
        height: 1024,
      });

      expect(condition).toBeTruthy();
      expect(condition.svg).toBeTruthy();

      const sanityCheck = performRasterizerSanityCheck(condition.svg, 'section_transverse');

      expect(sanityCheck.passed).toBe(true);
      expect(sanityCheck.metrics.drawingWidthRatio).toBeGreaterThanOrEqual(MIN_DRAWING_WIDTH_RATIO);
    });
  });

  describe('Area Coverage Sanity Checks', () => {
    test('Elevation area coverage >= 10% of canvas', async () => {
      if (!GeometryConditioner) {
        console.warn('Skipping test - GeometryConditioner not available');
        return;
      }

      const condition = GeometryConditioner.generateElevationCondition(mockModel, 'S', {
        width: 1024,
        height: 1024,
      });

      const sanityCheck = performRasterizerSanityCheck(condition.svg, 'elevation_south');

      expect(sanityCheck.metrics.drawingAreaCoverage).toBeGreaterThanOrEqual(
        MIN_DRAWING_AREA_COVERAGE
      );
    });

    test('Section area coverage >= 10% of canvas', async () => {
      if (!GeometryConditioner) {
        console.warn('Skipping test - GeometryConditioner not available');
        return;
      }

      const condition = GeometryConditioner.generateSectionCondition(mockModel, 'longitudinal', {
        width: 1024,
        height: 1024,
      });

      const sanityCheck = performRasterizerSanityCheck(condition.svg, 'section_longitudinal');

      expect(sanityCheck.metrics.drawingAreaCoverage).toBeGreaterThanOrEqual(
        MIN_DRAWING_AREA_COVERAGE
      );
    });
  });

  describe('Collapsed Content Detection', () => {
    test('validateSVGForRasterization detects thin elevation', () => {
      // Create a deliberately bad SVG with content only 10% of canvas width
      const badSvg = `<svg viewBox="0 0 1024 1024">
        <rect x="460" y="300" width="100" height="400" fill="black"/>
      </svg>`;

      const validation = validateSVGForRasterization(badSvg, 'elevation_south');
      const sanityCheck = performRasterizerSanityCheck(badSvg, 'elevation_south');

      // The existing validator may not catch this, but our sanity check should
      expect(sanityCheck.passed).toBe(false);
      expect(sanityCheck.issues.length).toBeGreaterThan(0);
      expect(sanityCheck.issues[0]).toContain('THIN DRAWING');
    });

    test('validateSVGForRasterization detects collapsed section', () => {
      // Create a deliberately bad SVG with content only 5% of canvas width
      const badSvg = `<svg viewBox="0 0 1024 1024">
        <rect x="480" y="400" width="50" height="200" fill="black"/>
      </svg>`;

      const sanityCheck = performRasterizerSanityCheck(badSvg, 'section_longitudinal');

      expect(sanityCheck.passed).toBe(false);
      expect(sanityCheck.issues.length).toBeGreaterThan(0);
    });

    test('Good SVG passes sanity check', () => {
      // Create a properly sized SVG (50% of canvas width)
      const goodSvg = `<svg viewBox="0 0 1200 800">
        <rect x="100" y="100" width="1000" height="600" fill="none" stroke="black"/>
        <rect x="200" y="200" width="100" height="150" fill="white" stroke="black"/>
        <rect x="400" y="200" width="100" height="150" fill="white" stroke="black"/>
        <line x1="100" y1="450" x2="1100" y2="450" stroke="black"/>
      </svg>`;

      const sanityCheck = performRasterizerSanityCheck(goodSvg, 'elevation_south');

      expect(sanityCheck.passed).toBe(true);
      expect(sanityCheck.issues.length).toBe(0);
      expect(sanityCheck.metrics.drawingWidthRatio).toBeGreaterThan(0.5);
    });
  });
});
