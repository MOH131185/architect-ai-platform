import {
  normalizeAreaM2,
  readBoundaryAreaM2,
} from "../../utils/boundaryFields.js";

describe("boundaryFields.normalizeAreaM2", () => {
  test("prefers areaM2 when present", () => {
    const result = normalizeAreaM2({
      areaM2: 425,
      area: 999,
      surfaceAreaM2: 111,
    });
    expect(result.areaM2).toBe(425);
    expect(result.area).toBe(425);
    expect(result.surfaceAreaM2).toBe(425);
  });

  test("falls back to legacy `area` when areaM2 missing", () => {
    const result = normalizeAreaM2({ area: 320 });
    expect(result.areaM2).toBe(320);
    expect(result.area).toBe(320);
    expect(result.surfaceAreaM2).toBe(320);
  });

  test("reads from metadata.areaM2 when top-level missing", () => {
    const result = normalizeAreaM2({ metadata: { areaM2: 540 } });
    expect(result.areaM2).toBe(540);
  });

  test("returns 0 area when no candidate is finite", () => {
    const result = normalizeAreaM2({ shapeType: "rectangle" });
    expect(result.areaM2).toBe(0);
  });

  test("preserves all other fields (does not mutate input)", () => {
    const input = {
      area: 100,
      shapeType: "rectangle",
      polygon: [{ lat: 0, lng: 0 }],
    };
    const result = normalizeAreaM2(input);
    expect(result.shapeType).toBe("rectangle");
    expect(result.polygon).toBe(input.polygon);
    // input must not have been mutated
    expect(input.areaM2).toBeUndefined();
  });

  test("returns null for null input", () => {
    expect(normalizeAreaM2(null)).toBeNull();
    expect(normalizeAreaM2(undefined)).toBeNull();
  });
});

describe("boundaryFields.readBoundaryAreaM2", () => {
  test("returns areaM2 when set", () => {
    expect(readBoundaryAreaM2({ areaM2: 250 })).toBe(250);
  });

  test("falls back to area, then surfaceAreaM2, then 0", () => {
    expect(readBoundaryAreaM2({ area: 180 })).toBe(180);
    expect(readBoundaryAreaM2({ surfaceAreaM2: 90 })).toBe(90);
    expect(readBoundaryAreaM2({ shapeType: "x" })).toBe(0);
  });

  test("rejects non-finite numbers", () => {
    expect(readBoundaryAreaM2({ area: "not a number" })).toBe(0);
    expect(readBoundaryAreaM2({ area: NaN })).toBe(0);
  });
});
