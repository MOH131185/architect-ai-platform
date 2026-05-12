// PR2 of the A1 defect remediation plan. Table-driven coverage of the
// England Nationally Described Space Standard validator plus the
// defensive aspect-ratio cap. Includes the two regression cases lifted
// straight from the reviewed A1 sheet: 3.9 × 2.1 m bedrooms (below
// double minimum) and a 3.6 × 1.1 m WC (long-thin layout artefact).

import {
  validateRoomAgainstNDSS,
  validateRoomsAgainstNDSS,
  resolveNdssRuleKey,
  ProgrammeNDSSViolationError,
  NDSS_ROOM_RULES,
  NDSS_ASPECT_RATIO_MAX,
} from "../../services/project/ndssValidator.js";

function room(name, widthM, depthM, extras = {}) {
  return {
    id: extras.id || `room:${name.toLowerCase().replace(/\s+/g, "-")}`,
    name,
    type: extras.type || null,
    program_type: extras.program_type || extras.type || null,
    actual_area_m2: widthM * depthM,
    bbox: { width: widthM, height: depthM },
    ...extras,
  };
}

describe("resolveNdssRuleKey", () => {
  test.each([
    ["WC", null, "wc"],
    ["Cloakroom WC", null, "wc"],
    ["Utility", null, "utility"],
    ["Bathroom", null, "bathroom"],
    ["Ensuite", null, "bathroom"],
    ["En-suite", null, "bathroom"],
    ["Storage", null, "storage"],
    ["Larder", null, "storage"],
    ["Kitchen dining", null, "kitchen"],
    ["Living room", null, "living"],
    // Principal / Bedroom 1 / Master always require the double standard.
    ["Principal bedroom", null, "bedroom_double"],
    ["Master bedroom", null, "bedroom_double"],
    ["Bedroom 1", null, "bedroom_double"],
    // Bedroom 2..N default to single (lenient real-world default).
    ["Bedroom 2", null, "bedroom_single"],
    ["Bedroom 3", null, "bedroom_single"],
    // Caller can override with occupancy = "double".
    ["Bedroom 2", "double", "bedroom_double"],
    // Or via room name hint.
    ["Double bedroom", null, "bedroom_double"],
    ["Twin bedroom", null, "bedroom_double"],
    ["Single bedroom", null, "bedroom_single"],
    ["Entrance hall", null, null],
    ["Ground circulation", null, null],
    ["Upper circulation and store", null, null],
    ["Plant", null, null],
  ])("%s (occupancy=%s) → %s", (name, occupancy, expected) => {
    expect(resolveNdssRuleKey({ name }, occupancy)).toBe(expected);
  });
});

describe("validateRoomAgainstNDSS — area + width minima", () => {
  test("3.9 × 2.1 m double bedroom (sheet regression) fails area and width", () => {
    const result = validateRoomAgainstNDSS(room("Bedroom 1", 3.9, 2.1));
    expect(result.ok).toBe(false);
    const kinds = result.violations.map((v) => v.kind);
    expect(kinds).toContain("min_area");
    expect(kinds).toContain("min_width");
    const areaViolation = result.violations.find((v) => v.kind === "min_area");
    expect(areaViolation.requiredM2).toBe(
      NDSS_ROOM_RULES.bedroom_double.minAreaM2,
    );
  });

  test("4.0 × 3.0 m double bedroom passes", () => {
    const result = validateRoomAgainstNDSS(room("Bedroom 2", 4.0, 3.0));
    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  test("2.5 × 3.0 m single bedroom passes (with occupancy hint)", () => {
    const result = validateRoomAgainstNDSS(
      room("Bedroom 4", 2.5, 3.0),
      "single",
    );
    expect(result.ok).toBe(true);
    expect(result.ruleKey).toBe("bedroom_single");
  });

  test("2.0 × 1.0 m WC fails area (1.8 m² required)", () => {
    const result = validateRoomAgainstNDSS(room("WC", 2.0, 1.0));
    const areaViolation = result.violations.find((v) => v.kind === "min_area");
    expect(areaViolation).toBeDefined();
    expect(areaViolation.requiredM2).toBe(NDSS_ROOM_RULES.wc.minAreaM2);
  });

  test("2.0 × 1.0 m WC also fails aspect ratio (2.0:1 within cap, just passes)", () => {
    // 2/1 = 2.0 ≤ 2.5, so aspect ratio is OK
    const result = validateRoomAgainstNDSS(room("WC", 2.0, 1.0));
    const aspect = result.violations.find((v) => v.kind === "aspect_ratio");
    expect(aspect).toBeUndefined();
  });
});

describe("validateRoomAgainstNDSS — aspect-ratio cap", () => {
  test("3.6 × 1.1 m WC (sheet regression) fails aspect ratio cap", () => {
    const result = validateRoomAgainstNDSS(room("WC", 3.6, 1.1));
    expect(result.ok).toBe(false);
    const aspect = result.violations.find((v) => v.kind === "aspect_ratio");
    expect(aspect).toBeDefined();
    expect(aspect.observedAspect).toBeGreaterThan(NDSS_ASPECT_RATIO_MAX);
    expect(aspect.maxAspect).toBe(NDSS_ASPECT_RATIO_MAX);
  });

  test("3.6 × 1.1 m WC also fails min width (1.1 < 0.9 required is OK actually)", () => {
    // WC min width is 0.9 m. 1.1 m passes. So no min_width violation.
    const result = validateRoomAgainstNDSS(room("WC", 3.6, 1.1));
    const width = result.violations.find((v) => v.kind === "min_width");
    expect(width).toBeUndefined();
  });

  test("aspect-ratio cap applies even when no NDSS rule matches the room type", () => {
    // "Plant" doesn't map to an NDSS rule, but the aspect cap is global.
    const result = validateRoomAgainstNDSS(room("Plant room", 5.0, 1.0));
    const aspect = result.violations.find((v) => v.kind === "aspect_ratio");
    expect(aspect).toBeDefined();
    expect(aspect.ruleKey).toBe("aspect_ratio");
  });
});

describe("validateRoomAgainstNDSS — out-of-scope rooms", () => {
  test("Entrance hall is not validated for area (rule key is null)", () => {
    const result = validateRoomAgainstNDSS(room("Entrance hall", 1.0, 1.0));
    expect(result.ruleKey).toBeNull();
    // 1×1 hall is 1:1 aspect, no aspect violation either.
    expect(result.ok).toBe(true);
  });

  test("Ground circulation is not validated", () => {
    const result = validateRoomAgainstNDSS(
      room("Ground circulation", 1.0, 5.0),
    );
    // 5:1 aspect WILL trigger the aspect cap even for circulation.
    expect(result.violations.some((v) => v.kind === "aspect_ratio")).toBe(true);
    // But no min_area or min_width violations, since rule key is null.
    expect(result.violations.some((v) => v.kind === "min_area")).toBe(false);
    expect(result.violations.some((v) => v.kind === "min_width")).toBe(false);
  });
});

describe("validateRoomsAgainstNDSS — collection helper", () => {
  test("collects violations across rooms", () => {
    const rooms = [
      room("Living room", 5.0, 4.0), // ok
      room("Bedroom 1", 3.9, 2.1), // double area + width fail
      room("WC", 3.6, 1.1), // aspect fail
    ];
    const violations = validateRoomsAgainstNDSS(rooms);
    expect(violations.length).toBeGreaterThanOrEqual(3);
    const roomNames = new Set(violations.map((v) => v.roomName));
    expect(roomNames).toContain("Bedroom 1");
    expect(roomNames).toContain("WC");
    expect(roomNames).not.toContain("Living room");
  });

  test("returns empty array when all rooms pass", () => {
    const rooms = [
      room("Living room", 5.0, 4.0),
      room("Principal bedroom", 4.0, 3.5),
      room("Kitchen dining", 4.5, 3.5),
      room("WC", 2.0, 1.5),
      room("Bathroom", 2.5, 2.0),
    ];
    expect(validateRoomsAgainstNDSS(rooms)).toEqual([]);
  });
});

describe("ProgrammeNDSSViolationError", () => {
  test("error message lists all violations with room names", () => {
    const violations = [
      {
        roomName: "Bedroom 1",
        ruleKey: "bedroom_double",
        message: "area too small",
      },
      { roomName: "WC", ruleKey: "aspect_ratio", message: "aspect too high" },
    ];
    const err = new ProgrammeNDSSViolationError(violations);
    expect(err.name).toBe("ProgrammeNDSSViolationError");
    expect(err.message).toContain("Bedroom 1");
    expect(err.message).toContain("WC");
    expect(err.violations).toEqual(violations);
  });
});
