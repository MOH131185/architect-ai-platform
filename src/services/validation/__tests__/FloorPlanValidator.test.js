/**
 * Floor Plan Validator Tests
 */

import {
  FloorPlanValidator,
  FloorPlanValidationError,
} from "../FloorPlanValidator.js";

describe("FloorPlanValidator", () => {
  let validator;

  beforeEach(() => {
    validator = new FloorPlanValidator();
  });

  describe("validateConnectivity", () => {
    it("should pass when all rooms are connected via doors", () => {
      const floors = [
        {
          index: 0,
          rooms: [
            { id: "lobby", name: "Lobby", isEntrance: true },
            { id: "living", name: "Living Room" },
            { id: "kitchen", name: "Kitchen" },
          ],
          doors: [
            { room1: "lobby", room2: "living" },
            { room1: "living", room2: "kitchen" },
          ],
        },
      ];

      const result = validator.validateConnectivity(floors);

      expect(result.valid).toBe(true);
      expect(result.disconnectedRooms).toHaveLength(0);
    });

    it("should fail when a room is disconnected", () => {
      const floors = [
        {
          index: 0,
          rooms: [
            { id: "lobby", name: "Lobby", isEntrance: true },
            { id: "living", name: "Living Room" },
            { id: "isolated", name: "Isolated Room" },
          ],
          doors: [{ room1: "lobby", room2: "living" }],
        },
      ];

      const result = validator.validateConnectivity(floors);

      expect(result.valid).toBe(false);
      expect(result.disconnectedRooms).toContain("Isolated Room (Floor 0)");
    });

    it("should handle rooms with adjacentTo property", () => {
      const floors = [
        {
          index: 0,
          rooms: [
            { id: "lobby", name: "Lobby", isEntrance: true },
            { id: "living", name: "Living Room", adjacentTo: ["lobby"] },
          ],
          doors: [],
        },
      ];

      const result = validator.validateConnectivity(floors);

      expect(result.valid).toBe(true);
    });
  });

  describe("validateNoOverlaps", () => {
    it("should pass when rooms do not overlap", () => {
      const floorPlanResult = {
        floors: [
          {
            rooms: [
              {
                id: "room1",
                name: "Room 1",
                polygon: [
                  { x: 0, y: 0 },
                  { x: 5, y: 0 },
                  { x: 5, y: 4 },
                  { x: 0, y: 4 },
                ],
              },
              {
                id: "room2",
                name: "Room 2",
                polygon: [
                  { x: 6, y: 0 },
                  { x: 10, y: 0 },
                  { x: 10, y: 4 },
                  { x: 6, y: 4 },
                ],
              },
            ],
          },
        ],
      };

      const result = validator.validateNoOverlaps(floorPlanResult);

      expect(result.valid).toBe(true);
      expect(result.overlappingPairs).toHaveLength(0);
    });

    it("should fail when rooms overlap", () => {
      const floorPlanResult = {
        floors: [
          {
            rooms: [
              {
                id: "room1",
                name: "Room 1",
                polygon: [
                  { x: 0, y: 0 },
                  { x: 5, y: 0 },
                  { x: 5, y: 4 },
                  { x: 0, y: 4 },
                ],
              },
              {
                id: "room2",
                name: "Room 2",
                polygon: [
                  { x: 3, y: 0 },
                  { x: 8, y: 0 },
                  { x: 8, y: 4 },
                  { x: 3, y: 4 },
                ],
              },
            ],
          },
        ],
      };

      const result = validator.validateNoOverlaps(floorPlanResult);

      expect(result.valid).toBe(false);
      expect(result.overlappingPairs).toHaveLength(1);
      expect(result.overlappingPairs[0]).toContain("Room 1");
      expect(result.overlappingPairs[0]).toContain("Room 2");
    });
  });

  describe("validateStairAlignment", () => {
    it("should pass for single floor", () => {
      const floors = [{ index: 0, stairs: [] }];

      const result = validator.validateStairAlignment(floors);

      expect(result.valid).toBe(true);
    });

    it("should pass when stairs align across floors", () => {
      const floors = [
        {
          index: 0,
          stairs: [{ id: "stair1", position: { x: 5, y: 5 } }],
        },
        {
          index: 1,
          stairs: [{ id: "stair2", position: { x: 5, y: 5 } }],
        },
      ];

      const result = validator.validateStairAlignment(floors);

      expect(result.valid).toBe(true);
    });

    it("should fail when stairs are misaligned", () => {
      const floors = [
        {
          index: 0,
          stairs: [{ id: "stair1", position: { x: 5, y: 5 } }],
        },
        {
          index: 1,
          stairs: [{ id: "stair2", position: { x: 10, y: 10 } }],
        },
      ];

      const result = validator.validateStairAlignment(floors);

      expect(result.valid).toBe(false);
      expect(result.misalignedStairs.length).toBeGreaterThan(0);
    });
  });

  describe("validateAreaTolerance", () => {
    it("should pass when rooms are within tolerance", () => {
      const rooms = [
        { name: "Living Room", area: 25 },
        { name: "Kitchen", area: 14 },
      ];

      const programSpaces = [
        { name: "Living Room", area: 24 },
        { name: "Kitchen", area: 15 },
      ];

      const result = validator.validateAreaTolerance(rooms, programSpaces);

      expect(result.valid).toBe(true);
    });

    it("should fail when room exceeds tolerance", () => {
      const rooms = [{ name: "Living Room", area: 30 }];

      const programSpaces = [{ name: "Living Room", area: 20 }];

      const result = validator.validateAreaTolerance(rooms, programSpaces, 0.15);

      expect(result.valid).toBe(false);
      expect(result.outOfTolerance).toHaveLength(1);
      expect(result.outOfTolerance[0].room).toBe("Living Room");
    });

    it("should pass with no program spaces", () => {
      const rooms = [{ name: "Room", area: 20 }];

      const result = validator.validateAreaTolerance(rooms, []);

      expect(result.valid).toBe(true);
    });
  });

  describe("calculatePolygonArea", () => {
    it("should calculate area of rectangle correctly", () => {
      const polygon = [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 3 },
        { x: 0, y: 3 },
      ];

      const area = validator.calculatePolygonArea(polygon);

      expect(area).toBe(12);
    });

    it("should handle array format coordinates", () => {
      const polygon = [
        [0, 0],
        [5, 0],
        [5, 5],
        [0, 5],
      ];

      const area = validator.calculatePolygonArea(polygon);

      expect(area).toBe(25);
    });

    it("should return 0 for invalid polygon", () => {
      expect(validator.calculatePolygonArea(null)).toBe(0);
      expect(validator.calculatePolygonArea([])).toBe(0);
      expect(validator.calculatePolygonArea([{ x: 0, y: 0 }])).toBe(0);
    });
  });

  describe("validate (full validation)", () => {
    it("should run all validations and return aggregate result", () => {
      const floorPlanResult = {
        floors: [
          {
            index: 0,
            rooms: [
              {
                id: "lobby",
                name: "Lobby",
                isEntrance: true,
                area: 20,
                polygon: [
                  { x: 0, y: 0 },
                  { x: 5, y: 0 },
                  { x: 5, y: 4 },
                  { x: 0, y: 4 },
                ],
              },
              {
                id: "living",
                name: "Living Room",
                area: 25,
                polygon: [
                  { x: 6, y: 0 },
                  { x: 11, y: 0 },
                  { x: 11, y: 5 },
                  { x: 6, y: 5 },
                ],
              },
            ],
            doors: [{ room1: "lobby", room2: "living" }],
            stairs: [],
          },
        ],
      };

      const programSpaces = [
        { name: "Lobby", area: 20 },
        { name: "Living Room", area: 25 },
      ];

      const result = validator.validate(floorPlanResult, programSpaces);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.details.connectivity).toBeDefined();
      expect(result.details.overlaps).toBeDefined();
      expect(result.details.stairs).toBeDefined();
      expect(result.details.areas).toBeDefined();
    });

    it("should collect errors from all validators", () => {
      const floorPlanResult = {
        floors: [
          {
            index: 0,
            rooms: [
              {
                id: "room1",
                name: "Room 1",
                isEntrance: true,
                polygon: [
                  { x: 0, y: 0 },
                  { x: 5, y: 0 },
                  { x: 5, y: 4 },
                  { x: 0, y: 4 },
                ],
              },
              {
                id: "room2",
                name: "Room 2",
                polygon: [
                  { x: 3, y: 0 },
                  { x: 8, y: 0 },
                  { x: 8, y: 4 },
                  { x: 3, y: 4 },
                ],
              },
              { id: "isolated", name: "Isolated", polygon: [] },
            ],
            doors: [{ room1: "room1", room2: "room2" }],
          },
        ],
      };

      const result = validator.validate(floorPlanResult, []);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe("FloorPlanValidationError", () => {
    it("should create error with errors and warnings", () => {
      const error = new FloorPlanValidationError(
        ["Room overlap detected"],
        ["Area slightly off"]
      );

      expect(error.name).toBe("FloorPlanValidationError");
      expect(error.errors).toContain("Room overlap detected");
      expect(error.warnings).toContain("Area slightly off");
      expect(error.recoverable).toBe(false);
    });

    it("should be recoverable when only warnings exist", () => {
      const error = new FloorPlanValidationError([], ["Minor warning"]);

      expect(error.recoverable).toBe(true);
    });
  });
});
