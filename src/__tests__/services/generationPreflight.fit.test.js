import { buildProgramLock } from "../../services/validation/programLockSchema.js";
import { GenerationPreflight } from "../../services/validation/GenerationPreflight.js";

describe("GenerationPreflight envelope fit checks", () => {
  function createMasterDNA() {
    return {
      dimensions: { length: 10, width: 10, floors: 1 },
      materials: ["brick"],
      rooms: [{ name: "Living Room", floor: 0, area_m2: 20 }],
    };
  }

  test("returns error when level program area is infeasible for envelope", () => {
    const dna = createMasterDNA();
    const lock = buildProgramLock(
      [{ name: "Living Room", area: 120, floor: "ground", count: 1 }],
      { floors: 1 },
    );

    const result = GenerationPreflight.validate(dna, lock, {
      strict: false,
      cds: { hash: "cds-test" },
    });

    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/infeasible/i);
    expect(result.errors.join(" ")).toMatch(/exceeds usable envelope/i);
  });

  test("returns warning for highly dense but feasible level allocation", () => {
    const dna = createMasterDNA();
    const lock = buildProgramLock(
      [{ name: "Living Room", area: 72, floor: "ground", count: 1 }],
      { floors: 1 },
    );

    const result = GenerationPreflight.validate(dna, lock, {
      strict: false,
      cds: { hash: "cds-test" },
    });

    expect(result.errors).toHaveLength(0);
    expect(result.warnings.join(" ")).toMatch(/highly dense/i);
  });
});
