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

  test("auto-corrects DNA dimensions when program slightly exceeds envelope", () => {
    const dna = createMasterDNA();
    const lock = buildProgramLock(
      [{ name: "Living Room", area: 120, floor: "ground", count: 1 }],
      { floors: 1 },
    );

    const result = GenerationPreflight.validate(dna, lock, {
      strict: false,
      cds: { hash: "cds-test" },
    });

    // Should auto-correct (scale ~1.27 is under 1.5× cap)
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings.join(" ")).toMatch(/Auto-corrected DNA dimensions/i);
    // DNA dimensions should have been expanded in-place
    expect(dna.dimensions.length).toBeGreaterThan(10);
    expect(dna.dimensions.width).toBeGreaterThan(10);
  });

  test("returns error when program far exceeds envelope (>1.5× expansion needed)", () => {
    const dna = createMasterDNA();
    const lock = buildProgramLock(
      [{ name: "Hall", area: 300, floor: "ground", count: 1 }],
      { floors: 1 },
    );

    const result = GenerationPreflight.validate(dna, lock, {
      strict: false,
      cds: { hash: "cds-test" },
    });

    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/envelope expansion/i);
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
