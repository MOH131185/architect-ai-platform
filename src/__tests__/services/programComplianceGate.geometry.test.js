import { buildProgramLock } from "../../services/validation/programLockSchema.js";
import {
  validateBuildingGeometryAgainstProgram,
  validatePanelsAgainstProgram,
} from "../../services/validation/ProgramComplianceGate.js";

describe("ProgramComplianceGate geometry fidelity", () => {
  function createProgramLock() {
    return buildProgramLock(
      [{ name: "Living Room", area: 20, floor: "ground", count: 1 }],
      { floors: 1 },
    );
  }

  function createPanels() {
    return [
      { type: "floor_plan_ground", imageUrl: "https://example.com/a.png" },
    ];
  }

  test("fails when geometry model is required but missing", () => {
    const lock = createProgramLock();
    const result = validatePanelsAgainstProgram(createPanels(), lock, {
      strict: false,
      buildingModel: null,
      requireGeometryModel: true,
      enforceRoomAreaFromGeometry: true,
      requireAdjacencyModel: false,
    });

    expect(result.valid).toBe(false);
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "Geometry fidelity check enabled but no BuildingModel",
        ),
      ]),
    );
  });

  test("fails when geometry room area drifts beyond tolerance", () => {
    const lock = createProgramLock();
    const buildingModel = {
      floors: [{ index: 0, rooms: [{ name: "Living Room", areaM2: 45 }] }],
    };

    const result = validatePanelsAgainstProgram(createPanels(), lock, {
      strict: false,
      buildingModel,
      requireGeometryModel: true,
      enforceRoomAreaFromGeometry: true,
      requireAdjacencyModel: false,
    });

    expect(result.valid).toBe(false);
    expect(result.violations.join(" ")).toContain(
      'Geometry area tolerance exceeded for "Living Room"',
    );
  });

  test("validateBuildingGeometryAgainstProgram reports direct area violation", () => {
    const lock = createProgramLock();
    const buildingModel = {
      floors: [{ index: 0, rooms: [{ name: "Living Room", areaM2: 32 }] }],
    };

    const result = validateBuildingGeometryAgainstProgram(buildingModel, lock, {
      areaTolerance: 0.05,
    });

    expect(result.valid).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.perSpace[0].space).toBe("Living Room");
  });
});
