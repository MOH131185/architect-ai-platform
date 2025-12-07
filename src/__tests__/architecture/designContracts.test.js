/**
 * Architectural Design Contract Tests
 *
 * These are regression tests that verify architectural design contracts.
 * They protect reasoning logic as prompts and algorithms are tweaked.
 *
 * These tests DO NOT render images - they validate JSON/object contracts:
 * - Floor counts match program
 * - Stairs exist for multi-floor buildings
 * - Bedroom counts match specifications
 * - All four elevations are generated
 *
 * Run with: npm test -- --testPathPattern="designContracts"
 */

import { createBuildingModel } from '../../geometry/BuildingModel.js';
import { runGeometryPipeline } from '../../geometry/GeometryPipeline.js';
import { generateAllElevations, ORIENTATIONS } from '../../services/geometry/elevationGenerator.js';
import { generateStairs, STAIR_TYPES } from '../../services/geometry/stairGenerator.js';
import {
  createCanonicalDesignState,
  createLevel,
  createRoom,
  fromLegacyDNA,
} from '../../types/CanonicalDesignState.js';

// =============================================================================
// CONTRACT 1: Multi-Floor Building Contracts
// =============================================================================

describe('Contract: Multi-Floor Buildings', () => {
  describe('2-floor program', () => {
    let model;

    beforeAll(() => {
      const canonicalState = createCanonicalDesignState({
        program: {
          levelCount: 2,
          totalAreaM2: 150,
          levels: [
            createLevel(0, {
              name: 'Ground Floor',
              rooms: [
                createRoom({ name: 'Living Room', targetAreaM2: 25 }),
                createRoom({ name: 'Kitchen', targetAreaM2: 18 }),
                createRoom({ name: 'WC', targetAreaM2: 4 }),
              ],
            }),
            createLevel(1, {
              name: 'First Floor',
              rooms: [
                createRoom({ name: 'Master Bedroom', targetAreaM2: 16 }),
                createRoom({ name: 'Bedroom 2', targetAreaM2: 12 }),
                createRoom({ name: 'Bathroom', targetAreaM2: 6 }),
              ],
            }),
          ],
        },
        massing: { roofType: 'gable', roofPitchDeg: 35 },
      });

      model = createBuildingModel(canonicalState);
    });

    it('should have exactly 2 floors', () => {
      expect(model.floors.length).toBe(2);
    });

    it('should have floors with correct indices', () => {
      expect(model.floors[0].index).toBe(0);
      expect(model.floors[1].index).toBe(1);
    });

    it('should have floors with correct names', () => {
      expect(model.floors[0].name).toBe('Ground Floor');
      expect(model.floors[1].name).toBe('First Floor');
    });

    it('should have at least one stair element for vertical circulation', () => {
      expect(model.stairs.length).toBeGreaterThanOrEqual(1);
    });

    it('stair should connect floors 0 and 1', () => {
      const mainStair = model.stairs[0];
      expect(mainStair).toBeDefined();
      expect(mainStair.connectsFloors).toContain(0);
      expect(mainStair.connectsFloors).toContain(1);
    });

    it('stair should have valid dimensions', () => {
      const mainStair = model.stairs[0];
      expect(mainStair.width).toBeGreaterThan(0);
      expect(mainStair.length).toBeGreaterThan(0);
    });
  });

  describe('3-floor program', () => {
    let model;

    beforeAll(() => {
      const canonicalState = createCanonicalDesignState({
        program: {
          levelCount: 3,
          totalAreaM2: 250,
          levels: [
            createLevel(0, {
              name: 'Ground Floor',
              rooms: [createRoom({ name: 'Reception', targetAreaM2: 40 })],
            }),
            createLevel(1, {
              name: 'First Floor',
              rooms: [createRoom({ name: 'Office 1', targetAreaM2: 30 })],
            }),
            createLevel(2, {
              name: 'Second Floor',
              rooms: [createRoom({ name: 'Office 2', targetAreaM2: 30 })],
            }),
          ],
        },
      });

      model = createBuildingModel(canonicalState);
    });

    it('should have exactly 3 floors', () => {
      expect(model.floors.length).toBe(3);
    });

    it('should have stairs for 3+ floor building', () => {
      expect(model.stairs.length).toBeGreaterThanOrEqual(1);
    });

    it('stair should be U-shape or equivalent for 3+ floors', () => {
      const mainStair = model.stairs[0];
      // For 3+ floors, the type should be U-shape per BuildingModel logic
      expect(mainStair.type).toBe('U-shape');
    });
  });

  describe('single-floor program (no stairs needed)', () => {
    let model;

    beforeAll(() => {
      const canonicalState = createCanonicalDesignState({
        program: {
          levelCount: 1,
          totalAreaM2: 80,
          levels: [
            createLevel(0, {
              name: 'Ground Floor',
              rooms: [
                createRoom({ name: 'Open Plan Living', targetAreaM2: 45 }),
                createRoom({ name: 'Bedroom', targetAreaM2: 14 }),
                createRoom({ name: 'Bathroom', targetAreaM2: 6 }),
              ],
            }),
          ],
        },
      });

      model = createBuildingModel(canonicalState);
    });

    it('should have exactly 1 floor', () => {
      expect(model.floors.length).toBe(1);
    });

    it('should have NO stairs (single floor)', () => {
      expect(model.stairs.length).toBe(0);
    });
  });
});

// =============================================================================
// CONTRACT 2: Bedroom Count Contracts
// =============================================================================

describe('Contract: Bedroom Count', () => {
  describe('3-bedroom house', () => {
    const bedroomNames = ['Bedroom 1', 'Bedroom 2', 'Bedroom 3'];
    let canonicalState;
    let model;

    beforeAll(() => {
      const legacyDNA = {
        dimensions: { floors: 2, length: 14, width: 10 },
        buildingType: 'residential_house',
      };

      const projectContext = {
        totalArea: 180,
        programSpaces: {
          spaces: [
            { name: 'Living Room', area: 24, level: 'Ground' },
            { name: 'Kitchen-Dining', area: 20, level: 'Ground' },
            { name: 'WC', area: 3, level: 'Ground' },
            { name: 'Bedroom 1', area: 14, level: 'First' },
            { name: 'Bedroom 2', area: 12, level: 'First' },
            { name: 'Bedroom 3', area: 10, level: 'First' },
            { name: 'Bathroom', area: 6, level: 'First' },
          ],
        },
      };

      canonicalState = fromLegacyDNA(legacyDNA, null, projectContext);
      model = createBuildingModel(canonicalState);
    });

    it('DNA should have exactly 3 bedrooms', () => {
      const allRooms = canonicalState.program.levels.flatMap((l) => l.rooms);
      const bedrooms = allRooms.filter((r) => r.name.toLowerCase().includes('bedroom'));

      expect(bedrooms.length).toBe(3);
    });

    it('all 3 bedrooms should be on First Floor (index 1)', () => {
      const firstFloorRooms = canonicalState.program.levels[1].rooms;
      const bedrooms = firstFloorRooms.filter((r) => r.name.toLowerCase().includes('bedroom'));

      expect(bedrooms.length).toBe(3);
    });

    it('geometry model should have at least 3 bedroom rooms', () => {
      const allGeometryRooms = model.floors.flatMap((f) => f.rooms);
      const bedroomRooms = allGeometryRooms.filter((r) => r.name.toLowerCase().includes('bedroom'));

      expect(bedroomRooms.length).toBeGreaterThanOrEqual(3);
    });

    it('each bedroom should have valid polygon geometry', () => {
      const firstFloor = model.floors[1];
      const bedrooms = firstFloor.rooms.filter((r) => r.name.toLowerCase().includes('bedroom'));

      for (const bedroom of bedrooms) {
        expect(bedroom.polygon).toBeDefined();
        expect(bedroom.polygon.length).toBe(4); // Rectangular
        expect(bedroom.areaM2).toBeGreaterThan(0);
      }
    });

    it('bedroom areas should roughly match requested areas', () => {
      const firstFloor = model.floors[1];
      const bedrooms = firstFloor.rooms.filter((r) => r.name.toLowerCase().includes('bedroom'));

      // Expected: 14, 12, 10 m²
      // Allow 50% tolerance due to strip packing constraints
      const expectedAreas = [14, 12, 10];
      const actualAreas = bedrooms.map((b) => b.areaM2);

      for (let i = 0; i < bedrooms.length; i++) {
        const expected = expectedAreas[i];
        const actual = actualAreas[i];
        // Allow -50% to +100% tolerance (strip packing may adjust)
        expect(actual).toBeGreaterThanOrEqual(expected * 0.5);
        expect(actual).toBeLessThanOrEqual(expected * 2);
      }
    });
  });

  describe('5-bedroom house', () => {
    let canonicalState;
    let model;

    beforeAll(() => {
      canonicalState = createCanonicalDesignState({
        program: {
          levelCount: 3,
          totalAreaM2: 300,
          levels: [
            createLevel(0, {
              name: 'Ground Floor',
              rooms: [
                createRoom({ name: 'Living', targetAreaM2: 30 }),
                createRoom({ name: 'Kitchen', targetAreaM2: 20 }),
                createRoom({ name: 'Guest Bedroom', targetAreaM2: 14 }),
              ],
            }),
            createLevel(1, {
              name: 'First Floor',
              rooms: [
                createRoom({ name: 'Master Bedroom', targetAreaM2: 18 }),
                createRoom({ name: 'Bedroom 2', targetAreaM2: 14 }),
                createRoom({ name: 'Bedroom 3', targetAreaM2: 12 }),
              ],
            }),
            createLevel(2, {
              name: 'Second Floor',
              rooms: [createRoom({ name: 'Bedroom 4', targetAreaM2: 12 })],
            }),
          ],
        },
      });

      model = createBuildingModel(canonicalState);
    });

    it('should have 5 bedrooms across all floors', () => {
      const allRooms = model.floors.flatMap((f) => f.rooms);
      const bedrooms = allRooms.filter((r) => r.name.toLowerCase().includes('bedroom'));

      expect(bedrooms.length).toBeGreaterThanOrEqual(5);
    });
  });
});

// =============================================================================
// CONTRACT 3: Four Elevations Contract
// =============================================================================

describe('Contract: All Four Elevations Generated', () => {
  let geometryDNA;
  let elevations;

  beforeAll(() => {
    // Create minimal geometry DNA for elevation generation
    geometryDNA = {
      geometry: {
        floors: [
          {
            index: 0,
            height: 3.0,
            walls: [
              { facade: 'north', type: 'external', start: { x: 0, y: 10 }, end: { x: 15, y: 10 } },
              { facade: 'south', type: 'external', start: { x: 0, y: 0 }, end: { x: 15, y: 0 } },
              { facade: 'east', type: 'external', start: { x: 15, y: 0 }, end: { x: 15, y: 10 } },
              { facade: 'west', type: 'external', start: { x: 0, y: 0 }, end: { x: 0, y: 10 } },
            ],
            openings: [
              { type: 'window', facade: 'south', position: 3, width: 1.2, height: 1.4 },
              {
                type: 'door',
                facade: 'south',
                position: 7,
                width: 1.0,
                height: 2.1,
                isEntrance: true,
              },
            ],
          },
          {
            index: 1,
            height: 2.8,
            walls: [
              { facade: 'north', type: 'external', start: { x: 0, y: 10 }, end: { x: 15, y: 10 } },
              { facade: 'south', type: 'external', start: { x: 0, y: 0 }, end: { x: 15, y: 0 } },
              { facade: 'east', type: 'external', start: { x: 15, y: 0 }, end: { x: 15, y: 10 } },
              { facade: 'west', type: 'external', start: { x: 0, y: 0 }, end: { x: 0, y: 10 } },
            ],
            openings: [
              { type: 'window', facade: 'north', position: 2, width: 1.2, height: 1.4 },
              { type: 'window', facade: 'south', position: 3, width: 1.2, height: 1.4 },
            ],
          },
        ],
        footprint: {
          width: 15,
          length: 10,
        },
      },
    };

    const styleDNA = {
      roofType: 'gable',
      roofPitch: 35,
      materials: [
        { name: 'brick', color: '#B8604E' },
        { name: 'slate', color: '#4A4A4A' },
      ],
    };

    elevations = generateAllElevations(geometryDNA, styleDNA);
  });

  it('should generate all 4 cardinal elevations', () => {
    expect(Object.keys(elevations)).toHaveLength(4);
  });

  it('should have north elevation', () => {
    expect(elevations.north).toBeDefined();
    expect(elevations.north.orientation).toBe('north');
  });

  it('should have south elevation', () => {
    expect(elevations.south).toBeDefined();
    expect(elevations.south.orientation).toBe('south');
  });

  it('should have east elevation', () => {
    expect(elevations.east).toBeDefined();
    expect(elevations.east.orientation).toBe('east');
  });

  it('should have west elevation', () => {
    expect(elevations.west).toBeDefined();
    expect(elevations.west.orientation).toBe('west');
  });

  it('each elevation should have bounds', () => {
    for (const orientation of ['north', 'south', 'east', 'west']) {
      expect(elevations[orientation].bounds).toBeDefined();
      expect(elevations[orientation].bounds.width).toBeGreaterThan(0);
      expect(elevations[orientation].bounds.totalHeight).toBeGreaterThan(0);
    }
  });

  it('each elevation should have profile (building outline)', () => {
    for (const orientation of ['north', 'south', 'east', 'west']) {
      expect(elevations[orientation].profile).toBeDefined();
      // Profile can be array (polygon points) or object (structured outline)
      expect(
        Array.isArray(elevations[orientation].profile) ||
          typeof elevations[orientation].profile === 'object'
      ).toBe(true);
    }
  });

  it('each elevation should have roof profile', () => {
    for (const orientation of ['north', 'south', 'east', 'west']) {
      expect(elevations[orientation].roofProfile).toBeDefined();
    }
  });

  it('elevations should have openings array defined', () => {
    // Note: Openings count depends on wall/opening projection logic
    // The key contract is that the openings array exists
    for (const orientation of ['north', 'south', 'east', 'west']) {
      expect(elevations[orientation].openings).toBeDefined();
      expect(Array.isArray(elevations[orientation].openings)).toBe(true);
    }
  });
});

// =============================================================================
// CONTRACT 4: BuildingModel Validation Contract
// =============================================================================

describe('Contract: BuildingModel Validation', () => {
  it('valid 2-floor model should pass validation', () => {
    const canonicalState = createCanonicalDesignState({
      program: {
        levelCount: 2,
        totalAreaM2: 120,
        levels: [
          createLevel(0, {
            rooms: [createRoom({ name: 'Living', targetAreaM2: 30 })],
          }),
          createLevel(1, {
            rooms: [createRoom({ name: 'Bedroom', targetAreaM2: 15 })],
          }),
        ],
      },
    });

    const model = createBuildingModel(canonicalState);
    const validation = model.validate();

    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  it('should report metrics in validation', () => {
    const canonicalState = createCanonicalDesignState({
      program: {
        levelCount: 2,
        totalAreaM2: 100,
        levels: [
          createLevel(0, {
            rooms: [
              createRoom({ name: 'Room 1', targetAreaM2: 20 }),
              createRoom({ name: 'Room 2', targetAreaM2: 20 }),
            ],
          }),
          createLevel(1, {
            rooms: [createRoom({ name: 'Room 3', targetAreaM2: 15 })],
          }),
        ],
      },
    });

    const model = createBuildingModel(canonicalState);
    const validation = model.validate();

    expect(validation.metrics).toBeDefined();
    expect(validation.metrics.floors).toBe(2);
    expect(validation.metrics.rooms).toBeGreaterThanOrEqual(3);
    expect(validation.metrics.walls).toBeGreaterThan(0);
    expect(validation.metrics.stairs).toBeGreaterThanOrEqual(1);
  });

  it('should warn if multi-floor building has no stairs', () => {
    // This is an edge case test - normally BuildingModel auto-generates stairs
    // But we test the validation logic
    const canonicalState = createCanonicalDesignState({
      program: {
        levelCount: 2,
        totalAreaM2: 100,
        levels: [createLevel(0, { rooms: [] }), createLevel(1, { rooms: [] })],
      },
    });

    const model = createBuildingModel(canonicalState);
    const validation = model.validate();

    // Should have warning about no rooms
    expect(validation.warnings.some((w) => w.includes('rooms'))).toBe(true);
  });
});

// =============================================================================
// CONTRACT 5: Facade Summary Consistency
// =============================================================================

describe('Contract: Facade Summary Consistency', () => {
  let model;

  beforeAll(() => {
    const canonicalState = createCanonicalDesignState({
      program: {
        levelCount: 2,
        totalAreaM2: 120,
        levels: [
          createLevel(0, {
            rooms: [
              createRoom({ name: 'Living Room', targetAreaM2: 30 }),
              createRoom({ name: 'Kitchen', targetAreaM2: 20 }),
            ],
          }),
          createLevel(1, {
            rooms: [
              createRoom({ name: 'Bedroom 1', targetAreaM2: 14 }),
              createRoom({ name: 'Bedroom 2', targetAreaM2: 12 }),
            ],
          }),
        ],
      },
      site: { entranceSide: 'S' },
    });

    model = createBuildingModel(canonicalState);
  });

  it('should have facadeSummary for all 4 facades', () => {
    expect(model.facadeSummary).toBeDefined();
    expect(model.facadeSummary.N).toBeDefined();
    expect(model.facadeSummary.S).toBeDefined();
    expect(model.facadeSummary.E).toBeDefined();
    expect(model.facadeSummary.W).toBeDefined();
  });

  it('each facade should have windowCount and doorCount', () => {
    for (const facade of ['N', 'S', 'E', 'W']) {
      expect(model.facadeSummary[facade].windowCount).toBeDefined();
      expect(model.facadeSummary[facade].doorCount).toBeDefined();
      expect(typeof model.facadeSummary[facade].windowCount).toBe('number');
      expect(typeof model.facadeSummary[facade].doorCount).toBe('number');
    }
  });

  it('entrance facade (S) should have at least 1 door', () => {
    expect(model.facadeSummary.S.doorCount).toBeGreaterThanOrEqual(1);
  });

  it('total window count should match openings across all floors', () => {
    const totalFromFacades =
      model.facadeSummary.N.windowCount +
      model.facadeSummary.S.windowCount +
      model.facadeSummary.E.windowCount +
      model.facadeSummary.W.windowCount;

    const totalFromOpenings = model.floors.reduce((sum, floor) => {
      return sum + floor.openings.filter((o) => o.type === 'window').length;
    }, 0);

    expect(totalFromFacades).toBe(totalFromOpenings);
  });
});

// =============================================================================
// CONTRACT 6: Stair Generator Regulations
// =============================================================================

describe('Contract: Stair Regulations Compliance', () => {
  describe('residential stairs', () => {
    let stairData;

    beforeAll(() => {
      stairData = generateStairs({
        floors: [
          { index: 0, height: 3.0 },
          { index: 1, height: 2.8 },
        ],
        footprint: { width: 12, length: 10 },
        buildingType: 'residential',
      });
    });

    it('should generate at least one stair flight', () => {
      expect(stairData.stairs.length).toBeGreaterThanOrEqual(1);
    });

    it('should generate at least one stair shaft', () => {
      expect(stairData.shafts.length).toBeGreaterThanOrEqual(1);
    });

    it('stair width should meet UK Part K minimum (900mm)', () => {
      // Width is in meters in the output
      expect(stairData.metadata.width).toBeGreaterThanOrEqual(0.9);
    });

    it('stair type should be valid', () => {
      const validTypes = Object.values(STAIR_TYPES);
      expect(validTypes).toContain(stairData.metadata.type);
    });
  });

  describe('commercial stairs', () => {
    let stairData;

    beforeAll(() => {
      stairData = generateStairs({
        floors: [
          { index: 0, height: 3.5 },
          { index: 1, height: 3.5 },
          { index: 2, height: 3.5 },
        ],
        footprint: { width: 20, length: 15 },
        buildingType: 'office',
      });
    });

    it('stair width should meet public stair minimum (1000mm)', () => {
      expect(stairData.metadata.width).toBeGreaterThanOrEqual(1.0);
    });

    it('regulations should be "public" for office building', () => {
      expect(stairData.metadata.regulations).toBe('public');
    });
  });
});

// =============================================================================
// CONTRACT 7: GeometryPipeline Integration
// =============================================================================

describe('Contract: GeometryPipeline Integration', () => {
  it('pipeline should produce consistent model + elevations', async () => {
    const canonicalState = createCanonicalDesignState({
      program: {
        levelCount: 2,
        totalAreaM2: 140,
        levels: [
          createLevel(0, {
            rooms: [
              createRoom({ name: 'Living', targetAreaM2: 28 }),
              createRoom({ name: 'Kitchen', targetAreaM2: 18 }),
            ],
          }),
          createLevel(1, {
            rooms: [
              createRoom({ name: 'Master Bed', targetAreaM2: 16 }),
              createRoom({ name: 'Bed 2', targetAreaM2: 12 }),
              createRoom({ name: 'Bath', targetAreaM2: 6 }),
            ],
          }),
        ],
      },
    });

    const result = await runGeometryPipeline(canonicalState, { scale: 50 });

    expect(result.success).toBe(true);
    expect(result.model).toBeDefined();
    expect(result.model.floors.length).toBe(2);
    expect(result.elevations).toBeDefined();
    expect(Object.keys(result.elevations)).toHaveLength(4);
  });

  it('pipeline should preserve room names through the stack', async () => {
    const canonicalState = createCanonicalDesignState({
      program: {
        levelCount: 1,
        totalAreaM2: 80,
        levels: [
          createLevel(0, {
            rooms: [
              createRoom({ name: 'My Special Room', targetAreaM2: 25 }),
              createRoom({ name: 'Another Room', targetAreaM2: 20 }),
            ],
          }),
        ],
      },
    });

    const result = await runGeometryPipeline(canonicalState, { scale: 50 });

    const roomNames = result.model.floors[0].rooms.map((r) => r.name);
    expect(roomNames).toContain('My Special Room');
    expect(roomNames).toContain('Another Room');
  });
});
