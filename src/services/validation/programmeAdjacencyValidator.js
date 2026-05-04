/**
 * Programme Adjacency Validator
 *
 * Walks the compiled ProjectGraph (rooms + walls) and scores it against a
 * project-type-specific JSON rule pack. Rules cover positive adjacencies
 * ("kitchen must adjoin dining"), negative adjacencies ("bedroom must not
 * adjoin kitchen"), reachability via circulation, per-level minimum counts,
 * and wet-zone stacking.
 *
 * Detected adjacency comes from compiledProject.walls — a wall whose
 * `room_ids` array has length 2 connects those two rooms. No new geometry
 * analysis is performed.
 *
 * Returns the same shape as other QA validators in this codebase:
 *   { status: "pass" | "warn" | "fail", score: 0..100, checks: [], issues: [] }
 *
 * The validator is intentionally non-blocking by default — the wiring in
 * projectGraphVerticalSliceService.js promotes its issues to "warning" unless
 * the `programmeAdjacencyValidatorBlocking` feature flag is on.
 *
 * Backed by the Berkeley ML-for-architecture review (Zhuang et al. 2025) §4.2
 * recommendation that rule-based / decision-tree systems be used to inject
 * domain knowledge that ML models alone do not capture.
 */

import residentialRulePack from "./rulePacks/residential.json" with { type: "json" };
import defaultRulePack from "./rulePacks/_default.json" with { type: "json" };

const RULE_PACKS_BY_CANONICAL_TYPE = Object.freeze({
  dwelling: residentialRulePack,
  multi_residential: residentialRulePack,
});

const STATUS_PASS = "pass";
const STATUS_WARN = "warn";
const STATUS_FAIL = "fail";

const PASS_THRESHOLD = 85;
const WARN_THRESHOLD = 60;

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function toArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value === undefined || value === null) return [];
  return [value];
}

function normaliseRoomType(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

/**
 * Resolve the rule pack for a given canonical project type. Falls back to the
 * empty `_default` pack so that unsupported types pass silently rather than
 * generating false positives.
 */
export function resolveRulePack(canonicalType = "") {
  const key = String(canonicalType || "")
    .trim()
    .toLowerCase();
  return RULE_PACKS_BY_CANONICAL_TYPE[key] || defaultRulePack;
}

/**
 * Build a map of roomId → room record from the compiled project. Each room
 * record carries normalised `type` and the original `levelId`.
 */
function buildRoomIndex(compiledProject) {
  const rooms = toArray(compiledProject?.rooms);
  const byId = new Map();
  for (const room of rooms) {
    if (!room?.id) continue;
    byId.set(room.id, {
      id: room.id,
      sourceId: room.sourceId || null,
      name: String(room.name || "").trim(),
      type: normaliseRoomType(room.type),
      levelId: room.levelId || null,
      polygon: Array.isArray(room.polygon) ? room.polygon : [],
      bbox: room.bbox || null,
      area: isFiniteNumber(Number(room.actual_area_m2))
        ? Number(room.actual_area_m2)
        : 0,
      wetZone: room.wet_zone === true,
    });
  }
  return byId;
}

/**
 * Build the detected adjacency multimap: roomId → Set<roomId>. Source = walls
 * carrying exactly 2 room_ids (a partition between two rooms). Walls with only
 * one room_id are external walls and contribute no adjacency edge.
 */
function buildAdjacency(compiledProject, roomIndex) {
  const adjacency = new Map();
  const ensureSet = (id) => {
    let set = adjacency.get(id);
    if (!set) {
      set = new Set();
      adjacency.set(id, set);
    }
    return set;
  };
  const walls = toArray(compiledProject?.walls);
  for (const wall of walls) {
    const ids = toArray(wall?.room_ids).filter((id) => roomIndex.has(id));
    if (ids.length !== 2) continue;
    const [a, b] = ids;
    if (a === b) continue;
    ensureSet(a).add(b);
    ensureSet(b).add(a);
  }
  return adjacency;
}

function roomsByType(roomIndex) {
  const byType = new Map();
  for (const room of roomIndex.values()) {
    if (!room.type) continue;
    let bucket = byType.get(room.type);
    if (!bucket) {
      bucket = [];
      byType.set(room.type, bucket);
    }
    bucket.push(room);
  }
  return byType;
}

function adjacentTypes(roomId, adjacency, roomIndex) {
  const neighbours = adjacency.get(roomId);
  if (!neighbours) return new Set();
  const types = new Set();
  for (const otherId of neighbours) {
    const other = roomIndex.get(otherId);
    if (other?.type) types.add(other.type);
  }
  return types;
}

function pathExists(fromId, targetTypes, viaTypes, adjacency, roomIndex) {
  const target = new Set(targetTypes.map(normaliseRoomType));
  const via = new Set(viaTypes.map(normaliseRoomType));
  const visited = new Set([fromId]);
  const queue = [{ id: fromId, hops: 0 }];
  while (queue.length) {
    const { id, hops } = queue.shift();
    if (hops > 0) {
      const room = roomIndex.get(id);
      if (room && target.has(room.type)) return true;
    }
    const neighbours = adjacency.get(id);
    if (!neighbours) continue;
    for (const otherId of neighbours) {
      if (visited.has(otherId)) continue;
      visited.add(otherId);
      const other = roomIndex.get(otherId);
      if (!other) continue;
      // Allow target match at any depth; only require via to gate the path
      if (hops === 0 && via.size > 0 && !via.has(other.type)) {
        // For reach_via we still allow direct neighbours whose type IS the
        // target (e.g. an ensuite straight off a primary bedroom is fine);
        // only block traversal beyond a non-via, non-target neighbour.
        if (target.has(other.type)) return true;
        continue;
      }
      queue.push({ id: otherId, hops: hops + 1 });
    }
  }
  return false;
}

function levelCountFromProject(compiledProject) {
  const levels = toArray(
    compiledProject?.levels || compiledProject?.levelProfiles,
  );
  if (levels.length > 0) return levels.length;
  // Fallback: distinct levelIds on rooms
  const rooms = toArray(compiledProject?.rooms);
  const distinct = new Set(rooms.map((r) => r?.levelId).filter(Boolean));
  return distinct.size || 1;
}

function ruleApplies(rule, ctx) {
  const condition = rule?.appliesIf;
  if (!condition || typeof condition !== "object") return true;
  if (
    isFiniteNumber(Number(condition.levelCountAtLeast)) &&
    ctx.levelCount < Number(condition.levelCountAtLeast)
  ) {
    return false;
  }
  return true;
}

function evaluateMustAdjoin(rule, ctx) {
  const fromType = normaliseRoomType(rule.from);
  const toTypes = toArray(rule.to).map(normaliseRoomType);
  const fromRooms = ctx.roomsByType.get(fromType) || [];
  if (fromRooms.length === 0) {
    // No source room of this type → vacuously true (nothing to violate).
    return { passed: true, evidence: { reason: "no-source-rooms-of-type" } };
  }
  const violations = [];
  for (const room of fromRooms) {
    const neighbourTypes = adjacentTypes(room.id, ctx.adjacency, ctx.roomIndex);
    const ok = toTypes.some((t) => neighbourTypes.has(t));
    if (!ok) {
      violations.push({
        roomId: room.id,
        roomName: room.name,
        roomType: fromType,
        expectedAdjoin: toTypes,
        observedNeighbours: [...neighbourTypes].sort(),
      });
    }
  }
  return {
    passed: violations.length === 0,
    evidence: {
      sourceRoomCount: fromRooms.length,
      violations,
    },
  };
}

function evaluateMustNotAdjoin(rule, ctx) {
  const fromType = normaliseRoomType(rule.from);
  const toTypes = toArray(rule.to).map(normaliseRoomType);
  const fromRooms = ctx.roomsByType.get(fromType) || [];
  if (fromRooms.length === 0) {
    return { passed: true, evidence: { reason: "no-source-rooms-of-type" } };
  }
  const violations = [];
  for (const room of fromRooms) {
    const neighbourTypes = adjacentTypes(room.id, ctx.adjacency, ctx.roomIndex);
    const conflicts = toTypes.filter((t) => neighbourTypes.has(t));
    if (conflicts.length > 0) {
      violations.push({
        roomId: room.id,
        roomName: room.name,
        roomType: fromType,
        forbiddenAdjacent: conflicts,
      });
    }
  }
  return {
    passed: violations.length === 0,
    evidence: {
      sourceRoomCount: fromRooms.length,
      violations,
    },
  };
}

function evaluateReachVia(rule, ctx) {
  const fromType = normaliseRoomType(rule.from);
  const targetTypes = toArray(rule.to).map(normaliseRoomType);
  const viaTypes = toArray(rule.via).map(normaliseRoomType);
  const fromRooms = ctx.roomsByType.get(fromType) || [];
  if (fromRooms.length === 0) {
    return { passed: true, evidence: { reason: "no-source-rooms-of-type" } };
  }
  const violations = [];
  for (const room of fromRooms) {
    const reachable = pathExists(
      room.id,
      targetTypes.length ? targetTypes : viaTypes,
      viaTypes,
      ctx.adjacency,
      ctx.roomIndex,
    );
    if (!reachable) {
      violations.push({
        roomId: room.id,
        roomName: room.name,
        viaTypes,
        targetTypes,
      });
    }
  }
  return {
    passed: violations.length === 0,
    evidence: {
      sourceRoomCount: fromRooms.length,
      violations,
    },
  };
}

function evaluateMinPerLevel(rule, ctx) {
  const type = normaliseRoomType(rule.type);
  const minCount = Number(rule.minCount) || 1;
  if (!type) return { passed: true, evidence: { reason: "rule-missing-type" } };
  const rooms = ctx.roomsByType.get(type) || [];
  const byLevel = new Map();
  for (const room of rooms) {
    const key = room.levelId || "_unknown_";
    byLevel.set(key, (byLevel.get(key) || 0) + 1);
  }
  const levelIds = ctx.levelIds.length > 0 ? ctx.levelIds : ["_unknown_"];
  const violations = [];
  for (const levelId of levelIds) {
    const count = byLevel.get(levelId) || 0;
    if (count < minCount) {
      violations.push({ levelId, count, expectedAtLeast: minCount });
    }
  }
  return {
    passed: violations.length === 0,
    evidence: {
      type,
      minCount,
      violations,
    },
  };
}

function evaluateMinCount(rule, ctx) {
  const type = normaliseRoomType(rule.type);
  const minCount = Number(rule.minCount) || 1;
  const rooms = ctx.roomsByType.get(type) || [];
  return {
    passed: rooms.length >= minCount,
    evidence: {
      type,
      minCount,
      observed: rooms.length,
    },
  };
}

function evaluateWetZoneStacked(rule, ctx) {
  const minOverlap = Number(rule.minOverlapPct) || 0.4;
  // Group wet rooms by (levelId)
  const wetRoomsByLevel = new Map();
  for (const room of ctx.roomIndex.values()) {
    if (!room.wetZone) continue;
    const key = room.levelId || "_unknown_";
    let bucket = wetRoomsByLevel.get(key);
    if (!bucket) {
      bucket = [];
      wetRoomsByLevel.set(key, bucket);
    }
    bucket.push(room);
  }
  // Need at least 2 levels with wet rooms to evaluate
  if (wetRoomsByLevel.size < 2) {
    return {
      passed: true,
      evidence: { reason: "insufficient-levels-with-wet-rooms" },
    };
  }
  // Cheap heuristic: at least one wet-room pair must share a centroid x within
  // the min-overlap window. We do not have per-level vertical alignment data
  // here, so we use polygon bbox overlap as a proxy.
  const levels = [...wetRoomsByLevel.values()];
  let bestOverlap = 0;
  for (let i = 0; i < levels.length - 1; i += 1) {
    for (const upper of levels[i + 1]) {
      for (const lower of levels[i]) {
        const overlap = bboxOverlapRatio(upper.bbox, lower.bbox);
        if (overlap > bestOverlap) bestOverlap = overlap;
      }
    }
  }
  return {
    passed: bestOverlap >= minOverlap,
    evidence: {
      minOverlap,
      bestOverlap: Number(bestOverlap.toFixed(3)),
    },
  };
}

function bboxOverlapRatio(a, b) {
  if (!a || !b) return 0;
  const ax0 = Number(a.minX ?? a.min_x ?? a.x ?? 0);
  const ax1 = ax0 + Number(a.width ?? a.w ?? 0);
  const ay0 = Number(a.minY ?? a.min_y ?? a.y ?? 0);
  const ay1 = ay0 + Number(a.height ?? a.h ?? 0);
  const bx0 = Number(b.minX ?? b.min_x ?? b.x ?? 0);
  const bx1 = bx0 + Number(b.width ?? b.w ?? 0);
  const by0 = Number(b.minY ?? b.min_y ?? b.y ?? 0);
  const by1 = by0 + Number(b.height ?? b.h ?? 0);
  const interX = Math.max(0, Math.min(ax1, bx1) - Math.max(ax0, bx0));
  const interY = Math.max(0, Math.min(ay1, by1) - Math.max(ay0, by0));
  const interArea = interX * interY;
  const aArea = Math.max(0, ax1 - ax0) * Math.max(0, ay1 - ay0);
  const bArea = Math.max(0, bx1 - bx0) * Math.max(0, by1 - by0);
  const minArea = Math.min(aArea, bArea) || 1;
  return interArea / minArea;
}

const RULE_KIND_HANDLERS = Object.freeze({
  must_adjoin: evaluateMustAdjoin,
  must_not_adjoin: evaluateMustNotAdjoin,
  reach_via: evaluateReachVia,
  min_per_level: evaluateMinPerLevel,
  min_count: evaluateMinCount,
  wet_zone_stacked: evaluateWetZoneStacked,
});

function statusFromScore(score) {
  if (score >= PASS_THRESHOLD) return STATUS_PASS;
  if (score >= WARN_THRESHOLD) return STATUS_WARN;
  return STATUS_FAIL;
}

/**
 * Validate programme adjacency for a compiled project.
 *
 * @param {object} args
 * @param {object} args.compiledProject  Compiled project { rooms, walls, levels }
 * @param {string} [args.canonicalProjectType]  Canonical building type
 *   (`dwelling`, `multi_residential`, `office_studio`, …).
 * @param {object} [args.rulePack]  Override rule pack (used in tests).
 * @returns {{
 *   status: "pass" | "warn" | "fail",
 *   score: number,
 *   checks: Array<object>,
 *   issues: Array<object>,
 *   packId: string,
 *   ruleCount: number
 * }}
 */
export function validateProgrammeAdjacency({
  compiledProject = null,
  canonicalProjectType = "",
  rulePack = null,
} = {}) {
  const pack = rulePack || resolveRulePack(canonicalProjectType);
  const rules = toArray(pack?.rules);
  const checks = [];
  const issues = [];
  if (!compiledProject || rules.length === 0) {
    return {
      status: STATUS_PASS,
      score: 100,
      checks,
      issues,
      packId: pack?.packId || "default-empty",
      ruleCount: 0,
    };
  }

  const roomIndex = buildRoomIndex(compiledProject);
  const adjacency = buildAdjacency(compiledProject, roomIndex);
  const ctx = {
    compiledProject,
    roomIndex,
    adjacency,
    roomsByType: roomsByType(roomIndex),
    levelCount: levelCountFromProject(compiledProject),
    levelIds: [
      ...new Set(
        toArray(compiledProject?.rooms)
          .map((r) => r?.levelId)
          .filter(Boolean),
      ),
    ],
  };

  let weightTotal = 0;
  let weightPassed = 0;

  for (const rule of rules) {
    if (!rule || !rule.id || !rule.kind) continue;
    if (!ruleApplies(rule, ctx)) continue;
    const handler = RULE_KIND_HANDLERS[rule.kind];
    const code = `PROGRAMME_ADJACENCY_${String(rule.id || "rule")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")}`;
    if (!handler) {
      checks.push({
        code,
        status: "fail",
        details: { reason: "unknown-rule-kind", kind: rule.kind },
        category: "programme_adjacency",
        weight: 0,
      });
      continue;
    }
    const weight = Number(rule.weight) || 1;
    weightTotal += weight;
    const result = handler(rule, ctx);
    const passed = result.passed === true;
    if (passed) weightPassed += weight;
    checks.push({
      code,
      status: passed ? "pass" : "fail",
      details: {
        ruleId: rule.id,
        kind: rule.kind,
        rationale: rule.rationale || null,
        ...result.evidence,
      },
      category: "programme_adjacency",
      weight,
    });
    if (!passed) {
      const severity = rule.optional === true ? "warning" : "warning";
      issues.push({
        code,
        severity,
        message:
          rule.rationale ||
          `Programme adjacency rule ${rule.id} not satisfied.`,
        details: result.evidence,
      });
    }
  }

  const score =
    weightTotal === 0 ? 100 : Math.round((100 * weightPassed) / weightTotal);
  return {
    status: statusFromScore(score),
    score,
    checks,
    issues,
    packId: pack?.packId || "unknown",
    ruleCount: rules.length,
  };
}

export const __testing__ = {
  buildRoomIndex,
  buildAdjacency,
  pathExists,
  bboxOverlapRatio,
};
