// PR2 of the A1 defect remediation plan. England Nationally Described
// Space Standard (NDSS) validator plus a defensive aspect-ratio cap.
// Used by projectGraphVerticalSliceService.js after layoutRoomsForLevel
// to reject programmes whose generated rooms would breach the standard
// (the reviewed A1 sheet shipped 3.9 × 2.1 m bedrooms at 8.2 m² and a
// 3.6 × 1.1 m "WC" — both unbuildable).
//
// Sources:
//   - Technical housing standards — nationally described space standard
//     (DCLG, 2015; reissued by MHCLG 2019). Single bedroom ≥ 7.5 m²
//     with min width 2.15 m. Double / twin bedroom ≥ 11.5 m² with min
//     width 2.55 m. Built-in storage ≥ 1.5 m².
//   - Approved Document M Vol 1, M4(1) Category 1 visitable dwellings.
//     WC compartment ≥ 1.8 m², door 0.9 m clear width.
//   - Approved Document M Vol 1, M4(2). Bathroom ≥ 4.5 m².
//
// Aspect-ratio cap of 2.5 is a defensive heuristic, not an NDSS clause:
// it kills long-thin layout artefacts like 3.6 × 1.1 m WCs that a
// proportional area allocator can produce when a room's footprint slot
// is narrow.

export const NDSS_ROOM_RULES = Object.freeze({
  bedroom_single: { minAreaM2: 7.5, minWidthM: 2.15 },
  bedroom_double: { minAreaM2: 11.5, minWidthM: 2.55 },
  bathroom: { minAreaM2: 4.5, minWidthM: 1.7 },
  wc: { minAreaM2: 1.8, minWidthM: 0.9 },
  storage: { minAreaM2: 1.5, minWidthM: 0.6 },
  utility: { minAreaM2: 2.5, minWidthM: 1.4 },
  kitchen: { minAreaM2: 8.0, minWidthM: 2.4 },
  living: { minAreaM2: 11.0, minWidthM: 2.8 },
});

export const NDSS_ASPECT_RATIO_MAX = 2.5;

export class ProgrammeNDSSViolationError extends Error {
  constructor(violations = []) {
    const summary = violations
      .map(
        (v) =>
          `${v.roomName || v.roomId || "(unnamed)"} [${v.ruleKey}]: ${v.message}`,
      )
      .join("; ");
    super(
      `Programme NDSS violation${violations.length > 1 ? "s" : ""}: ${summary || "(no detail)"}`,
    );
    this.name = "ProgrammeNDSSViolationError";
    this.violations = violations;
  }
}

// Map a room.name / room.type / room.function string to one of the keys in
// NDSS_ROOM_RULES. Returns null when the room type is not subject to NDSS
// (e.g. circulation, hallway, stair, plant, garden) — those rooms are skipped
// by the validator. Conservative: when in doubt, return null rather than
// over-applying a rule.
export function resolveNdssRuleKey(room = {}, occupancy = null) {
  const name = String(room.name || "").toLowerCase();
  const fn = String(room.function || "").toLowerCase();
  const type = String(room.type || room.program_type || "").toLowerCase();
  const haystack = `${name} ${fn} ${type}`;

  if (/\bwc\b|water\s*closet|cloak/.test(haystack)) return "wc";
  if (/utility|laundry/.test(haystack)) return "utility";
  if (/bathroom|shower|ensuite|en[-\s]?suite/.test(haystack)) return "bathroom";
  if (/store|storage|airing|cupboard|larder|pantry/.test(haystack))
    return "storage";
  if (/kitchen/.test(haystack)) return "kitchen";
  if (/living|lounge|family\s*room|reception/.test(haystack)) return "living";
  // Principal / Master / Bedroom 1 are always rated against the double
  // standard. Bedroom 2..N default to single (UK convention treats anything
  // beyond the principal as ambiguous; many family houses have a single
  // third bedroom). The caller can override via `occupancy` ("single" or
  // "double") or via room.name containing "double"/"twin"/"master".
  if (/^principal\b|\bmaster\b|\bbedroom\s*1\b/.test(haystack)) {
    return "bedroom_double";
  }
  if (/\bdouble\b|\btwin\b/.test(haystack)) {
    return "bedroom_double";
  }
  if (/bedroom/.test(haystack)) {
    if (occupancy === "double") return "bedroom_double";
    return "bedroom_single";
  }
  // Circulation, hall, landing, stair, plant, garden, etc. — not validated.
  return null;
}

function resolveRoomDimensions(room = {}) {
  if (
    room?.bbox &&
    Number.isFinite(Number(room.bbox.width)) &&
    Number.isFinite(Number(room.bbox.height))
  ) {
    return {
      widthM: Math.abs(Number(room.bbox.width)),
      depthM: Math.abs(Number(room.bbox.height)),
    };
  }
  if (
    Number.isFinite(Number(room.width_m)) &&
    Number.isFinite(Number(room.depth_m))
  ) {
    return {
      widthM: Math.abs(Number(room.width_m)),
      depthM: Math.abs(Number(room.depth_m)),
    };
  }
  const polygon = Array.isArray(room?.polygon) ? room.polygon : null;
  if (polygon && polygon.length >= 3) {
    const xs = polygon.map((p) => Number(p?.x ?? 0));
    const ys = polygon.map((p) => Number(p?.y ?? 0));
    return {
      widthM: Math.max(...xs) - Math.min(...xs),
      depthM: Math.max(...ys) - Math.min(...ys),
    };
  }
  return { widthM: 0, depthM: 0 };
}

function resolveRoomAreaM2(room = {}, dims) {
  const declared = Number(
    room?.actual_area_m2 ?? room?.actual_area ?? room?.target_area_m2 ?? NaN,
  );
  if (Number.isFinite(declared) && declared > 0) return declared;
  if (dims && dims.widthM > 0 && dims.depthM > 0) {
    return dims.widthM * dims.depthM;
  }
  return 0;
}

// Pure function. Returns {ok, violations, ruleKey, minAreaM2, minWidthM}.
// Rooms that don't map to an NDSS rule (circulation, plant, etc.) always
// return ok: true with ruleKey: null — they're outside the standard's
// scope. The aspect-ratio cap is checked for every room with valid
// dimensions regardless of rule.
export function validateRoomAgainstNDSS(room = {}, occupancy = null) {
  const ruleKey = resolveNdssRuleKey(room, occupancy);
  const dims = resolveRoomDimensions(room);
  const areaM2 = resolveRoomAreaM2(room, dims);
  const violations = [];

  if (ruleKey) {
    const rule = NDSS_ROOM_RULES[ruleKey];
    if (rule) {
      const minDim = Math.min(dims.widthM, dims.depthM);
      if (areaM2 > 0 && areaM2 < rule.minAreaM2) {
        violations.push({
          roomId: room.id || null,
          roomName: room.name || null,
          ruleKey,
          kind: "min_area",
          observedM2: Number(areaM2.toFixed(2)),
          requiredM2: rule.minAreaM2,
          message: `area ${areaM2.toFixed(2)} m² is below NDSS minimum ${rule.minAreaM2} m²`,
        });
      }
      if (minDim > 0 && minDim < rule.minWidthM) {
        violations.push({
          roomId: room.id || null,
          roomName: room.name || null,
          ruleKey,
          kind: "min_width",
          observedM: Number(minDim.toFixed(2)),
          requiredM: rule.minWidthM,
          message: `min width ${minDim.toFixed(2)} m is below NDSS minimum ${rule.minWidthM} m`,
        });
      }
    }
  }

  if (dims.widthM > 0 && dims.depthM > 0) {
    const longest = Math.max(dims.widthM, dims.depthM);
    const shortest = Math.min(dims.widthM, dims.depthM);
    const aspect = longest / shortest;
    if (aspect > NDSS_ASPECT_RATIO_MAX) {
      violations.push({
        roomId: room.id || null,
        roomName: room.name || null,
        ruleKey: ruleKey || "aspect_ratio",
        kind: "aspect_ratio",
        observedAspect: Number(aspect.toFixed(2)),
        maxAspect: NDSS_ASPECT_RATIO_MAX,
        message: `aspect ratio ${aspect.toFixed(2)}:1 exceeds defensive cap ${NDSS_ASPECT_RATIO_MAX}:1 (long-thin layout artefact)`,
      });
    }
  }

  return {
    ok: violations.length === 0,
    violations,
    ruleKey,
    minAreaM2: ruleKey ? NDSS_ROOM_RULES[ruleKey].minAreaM2 : null,
    minWidthM: ruleKey ? NDSS_ROOM_RULES[ruleKey].minWidthM : null,
  };
}

// Convenience: validate a collection. Returns a flat violations[] across all
// rooms. The caller decides whether to throw.
export function validateRoomsAgainstNDSS(rooms = [], occupancyHints = {}) {
  const violations = [];
  for (const room of rooms) {
    const occupancy = occupancyHints[room?.id] || null;
    const result = validateRoomAgainstNDSS(room, occupancy);
    if (!result.ok) violations.push(...result.violations);
  }
  return violations;
}
