/**
 * ProgramComplianceGate - Hard gate for program compliance
 *
 * Validates at 3 checkpoints:
 *   1. POST-DNA:   validateProgramLock(masterDNA, programLock)
 *   2. POST-RENDER: validatePanelsAgainstProgram(panels, programLock)
 *   3. PRE-COMPOSE: validateBeforeCompose(panels, programLock, cds)
 *
 * Any violation blocks the pipeline (fail-fast).
 */

import {
  getLevels,
  validatePanelPlanAgainstLock,
} from "./programLockSchema.js";
import { verifyCDSHashSync } from "./cdsHash.js";
import { FEATURE_FLAGS } from "../../config/featureFlags.js";

/**
 * Custom error thrown when ProgramComplianceGate fails.
 */
export class ProgramComplianceError extends Error {
  constructor(message, violations = [], checkpoint = "") {
    super(message);
    this.name = "ProgramComplianceError";
    this.violations = violations;
    this.checkpoint = checkpoint;
  }
}

/**
 * CHECKPOINT 1: Post-DNA validation
 *
 * Verifies that the generated masterDNA respects the programLock:
 * - Floor count matches
 * - All locked spaces are present in DNA rooms
 * - No DNA rooms appear on levels not in the lock
 *
 * @param {Object} masterDNA - Generated master DNA
 * @param {Object} programLock - Built ProgramSpacesLock
 * @returns {{ valid: boolean, violations: string[], report: Object }}
 * @throws {ProgramComplianceError} in strict mode
 */
export function validateProgramLock(masterDNA, programLock, options = {}) {
  const { strict = true } = options;
  const violations = [];
  const report = {
    checkpoint: "post-dna",
    timestamp: new Date().toISOString(),
    programLockHash: programLock?.hash || null,
  };

  if (!programLock || !programLock.spaces) {
    violations.push("ProgramLock is missing or has no spaces");
    return finish(violations, report, strict);
  }

  if (!masterDNA) {
    violations.push("masterDNA is missing");
    return finish(violations, report, strict);
  }

  // 1. Floor count
  const dnaFloors =
    masterDNA.dimensions?.floors ||
    masterDNA.dimensions?.floorCount ||
    masterDNA.floors ||
    1;

  if (dnaFloors !== programLock.levelCount) {
    violations.push(
      `DNA floor count (${dnaFloors}) does not match programLock levelCount (${programLock.levelCount})`,
    );
  }

  // 2. Per-space level + count validation
  const dnaRooms = masterDNA.rooms || masterDNA.program?.rooms || [];
  const allowedLevels = getLevels(programLock);
  const perSpaceReport = [];
  const areaTolerance = programLock.invariants?.areaTolerance ?? 0.35;

  for (const lockedSpace of programLock.spaces) {
    const spaceName = lockedSpace.name.toLowerCase();
    const expectedLevel = lockedSpace.lockedLevel;
    const expectedCount = lockedSpace.count || 1;

    // Find matching rooms: prefer instance ID match, fall back to name match
    const matchingRooms = dnaRooms.filter((r) => {
      // Instance ID match (exact, from DNA v2)
      if (r.instanceId && lockedSpace.instanceIds?.length > 0) {
        if (lockedSpace.instanceIds.includes(r.instanceId)) return true;
      }
      // Case-insensitive name match (fallback)
      const roomName = (r.name || "").toLowerCase();
      return roomName.includes(spaceName) || spaceName.includes(roomName);
    });

    // Check: space must exist in DNA
    if (matchingRooms.length === 0) {
      violations.push(
        `Locked space "${lockedSpace.name}" (level ${expectedLevel}) not found in DNA rooms`,
      );
      perSpaceReport.push({
        space: lockedSpace.name,
        expectedLevel,
        expectedCount,
        foundCount: 0,
        foundLevels: [],
        match: false,
      });
      continue;
    }

    // Check: matching rooms must be on the correct level
    const roomsOnCorrectLevel = matchingRooms.filter((r) => {
      const roomLevel = normaliseDNARoomLevel(r);
      return roomLevel === expectedLevel;
    });

    if (roomsOnCorrectLevel.length < expectedCount) {
      const foundLevels = matchingRooms
        .map((r) => normaliseDNARoomLevel(r))
        .filter((l) => l !== null);
      violations.push(
        `Locked space "${lockedSpace.name}": expected ${expectedCount} on level ${expectedLevel}, ` +
          `found ${roomsOnCorrectLevel.length} (rooms found on levels: ${foundLevels.length > 0 ? foundLevels.join(",") : "none"})`,
      );
      perSpaceReport.push({
        space: lockedSpace.name,
        expectedLevel,
        expectedCount,
        foundCount: roomsOnCorrectLevel.length,
        foundLevels,
        match: false,
      });
    } else {
      perSpaceReport.push({
        space: lockedSpace.name,
        expectedLevel,
        expectedCount,
        foundCount: roomsOnCorrectLevel.length,
        foundLevels: [expectedLevel],
        match: true,
      });
    }

    // Area tolerance validation (strict mode only)
    if (strict && lockedSpace.targetAreaM2 > 0) {
      for (const room of roomsOnCorrectLevel) {
        const roomArea = parseFloat(room.area_m2 || room.area) || 0;
        if (roomArea > 0) {
          const deviation =
            Math.abs(roomArea - lockedSpace.targetAreaM2) /
            lockedSpace.targetAreaM2;
          if (deviation > areaTolerance) {
            violations.push(
              `Area tolerance exceeded for "${lockedSpace.name}": DNA area ${roomArea}m² vs locked ${lockedSpace.targetAreaM2}m² ` +
                `(${(deviation * 100).toFixed(1)}% deviation, tolerance ${(areaTolerance * 100).toFixed(0)}%)`,
            );
          }
        }
      }
    }
  }

  // 2b. Instance count enforcement per level (strict mode)
  if (strict) {
    for (const level of allowedLevels) {
      const expectedOnLevel = programLock.spaces
        .filter((s) => s.lockedLevel === level)
        .reduce((sum, s) => sum + (s.count || 1), 0);
      const dnaOnLevel = dnaRooms.filter((r) => {
        return normaliseDNARoomLevel(r) === level;
      }).length;
      if (dnaOnLevel < expectedOnLevel) {
        violations.push(
          `Level ${level}: expected ${expectedOnLevel} rooms from lock, found ${dnaOnLevel} in DNA (missing ${expectedOnLevel - dnaOnLevel})`,
        );
      }
      if (dnaOnLevel > expectedOnLevel) {
        violations.push(
          `Level ${level}: expected ${expectedOnLevel} rooms from lock, found ${dnaOnLevel} in DNA (${dnaOnLevel - expectedOnLevel} extra)`,
        );
      }
    }
  }

  // 3. Check DNA rooms don't reference unexpected levels
  if (programLock.invariants?.forbidUnexpectedLevels) {
    for (const room of dnaRooms) {
      const roomLevel = normaliseDNARoomLevel(room);
      // In strict mode, rooms with no level metadata are violations
      if (roomLevel === null) {
        violations.push(
          `DNA room "${room.name}" has no level metadata (floor/level field missing)`,
        );
      } else if (!allowedLevels.includes(roomLevel)) {
        violations.push(
          `DNA room "${room.name}" is on level ${roomLevel} which is not in the program lock (allowed: ${allowedLevels.join(",")})`,
        );
      }
    }
  }

  report.dnaFloors = dnaFloors;
  report.lockLevelCount = programLock.levelCount;
  report.dnaRoomCount = dnaRooms.length;
  report.lockedSpaceCount = programLock.spaces.length;
  report.perSpaceReport = perSpaceReport;

  return finish(violations, report, strict);
}

/**
 * CHECKPOINT 2: Post-Render validation
 *
 * Verifies that generated panels respect the program lock:
 * - No floor_plan panels for levels that don't exist in the lock
 * - 1-level programs don't have upper floor plans
 * - Section panels don't depict more levels than allowed
 * - Required room adjacencies are satisfied (when BuildingModel is provided)
 *
 * @param {Array} panels - Generated panel results [{ panelType, ... }]
 * @param {Object} programLock
 * @param {Object} [options]
 * @param {Object} [options.buildingModel] - BuildingModel for adjacency checks
 * @param {boolean} [options.requireAdjacencyModel=false] - Fail if adjacencies exist but model is unavailable
 * @returns {{ valid: boolean, violations: string[], report: Object }}
 */
export function validatePanelsAgainstProgram(
  panels,
  programLock,
  options = {},
) {
  const {
    strict = true,
    buildingModel = null,
    requireAdjacencyModel = false,
    requireGeometryModel = FEATURE_FLAGS.geometryAuthorityMandatory === true ||
      FEATURE_FLAGS.strictCanonicalGeometryPack === true ||
      FEATURE_FLAGS.programGeometryFidelityGate === true,
    enforceRoomAreaFromGeometry = FEATURE_FLAGS.programGeometryFidelityGate !==
      false,
  } = options;
  const violations = [];
  const report = {
    checkpoint: "post-render",
    timestamp: new Date().toISOString(),
    panelCount: panels?.length || 0,
    programLockHash: programLock?.hash || null,
  };

  if (!programLock) {
    violations.push("ProgramLock is missing");
    return finish(violations, report, strict);
  }

  if (!panels || panels.length === 0) {
    violations.push("No panels to validate");
    return finish(violations, report, strict);
  }

  // Map panels to plan format for the schema validator
  const panelPlan = panels.map((p) => ({
    panelType: p.panelType || p.type,
    levelIndex: extractLevelFromPanelType(p.panelType || p.type),
  }));

  const planResult = validatePanelPlanAgainstLock(programLock, panelPlan);
  violations.push(...planResult.violations);

  // Additional: check that required floor plan panels exist
  const floorPlanPanels = panelPlan.filter((p) =>
    p.panelType?.startsWith("floor_plan_"),
  );
  const expectedLevels = getLevels(programLock).filter((l) => l >= 0); // exclude basement for now

  if (floorPlanPanels.length < expectedLevels.length) {
    // Not a hard violation but a warning
    report.warning = `Only ${floorPlanPanels.length} floor plan panels for ${expectedLevels.length} levels`;
  }

  // Enforce program adjacency constraints when available.
  const adjacencyRequirements = programLock?.adjacencyRequirements || [];
  if (adjacencyRequirements.length > 0) {
    report.adjacencyRequirements = adjacencyRequirements.length;

    if (!buildingModel) {
      const message =
        "Adjacency requirements exist but no BuildingModel was provided for validation";
      report.adjacency = {
        valid: false,
        violations: [message],
        warnings: [],
      };

      if (requireAdjacencyModel) {
        violations.push(message);
      } else {
        report.warning = report.warning
          ? `${report.warning}; ${message}`
          : message;
      }
    } else {
      const adjacencyResult = validateAdjacency(buildingModel, programLock, {
        strict: false,
      });
      report.adjacency = adjacencyResult;
      violations.push(...(adjacencyResult.violations || []));
      if (adjacencyResult.warnings?.length > 0) {
        report.adjacencyWarnings = adjacencyResult.warnings;
      }
    }
  }

  // Enforce geometric program fidelity (areas + counts from built room geometry).
  if (enforceRoomAreaFromGeometry) {
    if (!buildingModel) {
      const message =
        "Geometry fidelity check enabled but no BuildingModel was provided";
      report.geometryValidation = {
        valid: false,
        violations: [message],
        warnings: [],
      };
      if (requireGeometryModel) {
        violations.push(message);
      } else {
        report.warning = report.warning
          ? `${report.warning}; ${message}`
          : message;
      }
    } else {
      const geometryResult = validateBuildingGeometryAgainstProgram(
        buildingModel,
        programLock,
        {
          areaTolerance:
            programLock?.invariants?.areaTolerance ??
            FEATURE_FLAGS.areaTolerance ??
            0.03,
        },
      );
      report.geometryValidation = geometryResult;
      violations.push(...(geometryResult.violations || []));
      if (geometryResult.warnings?.length > 0) {
        report.geometryWarnings = geometryResult.warnings;
      }
    }
  }

  report.floorPlanPanelCount = floorPlanPanels.length;
  report.expectedLevels = expectedLevels;

  return finish(violations, report, strict);
}

/**
 * CHECKPOINT 3: Pre-Compose validation
 *
 * Final gate before A1 composition. Verifies:
 * - CDS hash integrity
 * - Program compliance (panels vs lock)
 * - No unexpected level representations
 *
 * @param {Array} panels
 * @param {Object} programLock
 * @param {Object} cds - Canonical Design State
 * @returns {{ valid: boolean, violations: string[], report: Object }}
 */
export function validateBeforeCompose(panels, programLock, cds, options = {}) {
  const {
    strict = true,
    buildingModel = null,
    requireAdjacencyModel = false,
    requireGeometryModel = FEATURE_FLAGS.programGeometryFidelityGate !== false,
  } = options;
  const violations = [];
  const report = {
    checkpoint: "pre-compose",
    timestamp: new Date().toISOString(),
  };

  // 1. CDS hash integrity
  if (cds) {
    if (!verifyCDSHashSync(cds)) {
      violations.push(
        "CDS hash integrity check failed — design state may have been tampered with",
      );
    }
    report.cdsHash = cds.hash;
    report.cdsDesignId = cds.designId;

    // Verify CDS program matches lock
    if (cds.program?.lockHash && programLock?.hash) {
      if (cds.program.lockHash !== programLock.hash) {
        violations.push(
          `CDS program lockHash (${cds.program.lockHash}) differs from current programLock hash (${programLock.hash})`,
        );
      }
    }
  }

  // 2. Re-run panel compliance
  const panelResult = validatePanelsAgainstProgram(panels, programLock, {
    strict: false,
    buildingModel,
    requireAdjacencyModel,
    requireGeometryModel,
    enforceRoomAreaFromGeometry:
      FEATURE_FLAGS.programGeometryFidelityGate !== false,
  });
  violations.push(...panelResult.violations);
  report.panelReport = panelResult.report;

  report.programLockHash = programLock?.hash || null;

  return finish(violations, report, strict);
}

/**
 * Extract level index from panel type string.
 * e.g. "floor_plan_ground" -> 0, "floor_plan_first" -> 1, "floor_plan_level2" -> 2
 */
function extractLevelFromPanelType(panelType) {
  if (!panelType) return undefined;
  if (panelType === "floor_plan_ground") return 0;
  if (panelType === "floor_plan_first") return 1;
  if (panelType === "floor_plan_level2") return 2;
  if (panelType === "floor_plan_level3") return 3;
  const match = panelType.match(/floor_plan_level(\d+)/);
  if (match) return parseInt(match[1], 10);
  return undefined;
}

/**
 * Normalise a DNA room's floor/level to a 0-based index.
 */
function normaliseDNARoomLevel(room) {
  const raw = room.floor ?? room.level ?? room.lockedLevel;
  if (raw === undefined || raw === null) return null;
  if (typeof raw === "number") return raw;
  const s = String(raw).trim().toLowerCase();
  if (s === "ground" || s === "g" || s === "0") return 0;
  if (s === "basement" || s === "b" || s === "-1") return -1;
  if (s === "1" || s === "1st" || s === "first") return 1;
  if (s === "2" || s === "2nd" || s === "second") return 2;
  if (s === "3" || s === "3rd" || s === "third") return 3;
  const num = parseInt(s, 10);
  return isNaN(num) ? null : num;
}

function normaliseModelRoomLevel(floor, fallbackIndex) {
  const raw =
    floor?.index ?? floor?.level ?? floor?.levelIndex ?? floor?.floor ?? null;
  if (raw === null || raw === undefined) return fallbackIndex ?? 0;
  if (typeof raw === "number") return raw;
  return normaliseDNARoomLevel({ level: raw }) ?? fallbackIndex ?? 0;
}

function toAreaM2(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  // Heuristic: values > 10,000 are almost certainly mm², convert to m².
  if (n > 10000) return n / 1_000_000;
  return n;
}

function normaliseName(name) {
  return String(name || "")
    .trim()
    .toLowerCase();
}

function roomNameMatchesLock(roomName, lockName) {
  const a = normaliseName(roomName);
  const b = normaliseName(lockName);
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}

function selectBestAreaMatches(rooms, targetArea, count) {
  if (!Array.isArray(rooms) || rooms.length === 0) return [];
  const desired = Math.max(1, Number(count) || 1);
  return [...rooms]
    .sort((a, b) => {
      const da = Math.abs((a.areaM2 || 0) - targetArea);
      const db = Math.abs((b.areaM2 || 0) - targetArea);
      return da - db;
    })
    .slice(0, desired);
}

/**
 * Validate that built geometry rooms respect program lock areas and counts.
 *
 * @param {Object} buildingModel
 * @param {Object} programLock
 * @param {Object} [options]
 * @returns {{ valid: boolean, violations: string[], warnings: string[], perSpace: Array }}
 */
export function validateBuildingGeometryAgainstProgram(
  buildingModel,
  programLock,
  options = {},
) {
  const violations = [];
  const warnings = [];
  const perSpace = [];
  const areaTolerance = Number(options.areaTolerance ?? 0.1);

  if (!buildingModel || !Array.isArray(buildingModel.floors)) {
    return {
      valid: false,
      violations: ["BuildingModel is missing floors for geometry validation"],
      warnings,
      perSpace,
      areaTolerance,
    };
  }

  const modelRooms = [];
  buildingModel.floors.forEach((floor, idx) => {
    const level = normaliseModelRoomLevel(floor, idx);
    const rooms = Array.isArray(floor?.rooms) ? floor.rooms : [];
    rooms.forEach((room) => {
      const areaM2 = toAreaM2(room?.areaM2 || room?.area);
      modelRooms.push({
        level,
        name: room?.name || room?.id || "Room",
        areaM2,
        targetAreaM2: toAreaM2(room?.targetAreaM2),
      });
    });
  });

  if (modelRooms.length === 0) {
    return {
      valid: false,
      violations: ["BuildingModel has no rooms for geometry validation"],
      warnings,
      perSpace,
      areaTolerance,
    };
  }

  for (const lockedSpace of programLock?.spaces || []) {
    const expectedLevel = lockedSpace.lockedLevel;
    const expectedCount = Math.max(1, Number(lockedSpace.count) || 1);
    const targetArea = Number(lockedSpace.targetAreaM2) || 0;

    const matchingRooms = modelRooms.filter(
      (room) =>
        room.level === expectedLevel &&
        roomNameMatchesLock(room.name, lockedSpace.name),
    );

    if (matchingRooms.length < expectedCount) {
      violations.push(
        `Geometry rooms for "${lockedSpace.name}" on level ${expectedLevel}: expected ${expectedCount}, found ${matchingRooms.length}`,
      );
      perSpace.push({
        space: lockedSpace.name,
        level: expectedLevel,
        expectedCount,
        foundCount: matchingRooms.length,
        targetAreaM2: targetArea,
        match: false,
      });
      continue;
    }

    const selectedRooms = selectBestAreaMatches(
      matchingRooms,
      targetArea,
      expectedCount,
    );
    const deviations = selectedRooms.map((room) => {
      if (!targetArea || !room.areaM2) return 0;
      return Math.abs(room.areaM2 - targetArea) / targetArea;
    });

    const areaViolations = [];
    deviations.forEach((deviation, idx) => {
      if (targetArea > 0 && deviation > areaTolerance) {
        const room = selectedRooms[idx];
        areaViolations.push(
          `${room.name}: ${room.areaM2.toFixed(2)}m² vs target ${targetArea.toFixed(2)}m² (${(deviation * 100).toFixed(1)}% deviation)`,
        );
      }
    });

    if (areaViolations.length > 0) {
      violations.push(
        `Geometry area tolerance exceeded for "${lockedSpace.name}" on level ${expectedLevel}: ${areaViolations.join("; ")}`,
      );
    }

    perSpace.push({
      space: lockedSpace.name,
      level: expectedLevel,
      expectedCount,
      foundCount: matchingRooms.length,
      targetAreaM2: targetArea,
      actualAreasM2: selectedRooms.map((r) => r.areaM2),
      deviations,
      maxDeviation: deviations.length > 0 ? Math.max(...deviations) : 0,
      match: areaViolations.length === 0,
    });
  }

  const valid = violations.length === 0;
  return { valid, violations, warnings, perSpace, areaTolerance };
}

/**
 * CHECKPOINT 2b: Post-Render adjacency validation
 *
 * Validates that rooms which must be adjacent (per the programLock's
 * adjacencyRequirements) actually share a wall in the built geometry.
 * Can only be checked after geometry is built (POST-RENDER).
 *
 * @param {Object} buildingModel - BuildingModel instance with getAdjacencyReport()
 * @param {Object} programLock - ProgramSpacesLock with adjacencyRequirements
 * @param {Object} [options]
 * @param {boolean} [options.strict=true] - Throw on required violations
 * @returns {{ valid: boolean, violations: string[], warnings: string[] }}
 * @throws {ProgramComplianceError} in strict mode when required adjacency is violated
 */
export function validateAdjacency(buildingModel, programLock, options = {}) {
  const { strict = true } = options;
  const violations = [];
  const warnings = [];

  const requirements = programLock?.adjacencyRequirements || [];
  if (requirements.length === 0)
    return { valid: true, violations: [], warnings: [] };

  if (
    !buildingModel ||
    typeof buildingModel.getAdjacencyReport !== "function"
  ) {
    return {
      valid: true,
      violations: [],
      warnings: ["BuildingModel does not support adjacency report"],
    };
  }

  const report = buildingModel.getAdjacencyReport();

  for (const req of requirements) {
    const pair = report.pairs.find(
      (p) =>
        (p.roomA.includes(req.spaceA) && p.roomB.includes(req.spaceB)) ||
        (p.roomA.includes(req.spaceB) && p.roomB.includes(req.spaceA)),
    );

    if (!pair) continue; // rooms not both present (caught by other checks)

    if (!pair.adjacent) {
      if (req.priority === "required") {
        violations.push(
          `Required adjacency: "${req.spaceA}" and "${req.spaceB}" are not adjacent`,
        );
      } else {
        warnings.push(
          `Preferred adjacency: "${req.spaceA}" and "${req.spaceB}" are not adjacent`,
        );
      }
    }
  }

  const valid = violations.length === 0;
  if (!valid && strict) {
    throw new ProgramComplianceError(
      `Adjacency violations: ${violations.join("; ")}`,
      violations,
      "post-render-adjacency",
    );
  }
  return { valid, violations, warnings };
}

/**
 * Finalize gate result. Throws in strict mode if violations exceed tolerance.
 *
 * Reads FEATURE_FLAGS.maxProgramViolations (default 0 = zero tolerance).
 * When tolerance > 0, that many violations are allowed before blocking.
 */
function finish(violations, report, strict) {
  const maxAllowed = Number(FEATURE_FLAGS.maxProgramViolations) || 0;
  const valid = violations.length <= maxAllowed;
  report.violations = violations;
  report.valid = valid;
  report.maxProgramViolations = maxAllowed;

  if (!valid && strict) {
    throw new ProgramComplianceError(
      `ProgramComplianceGate FAILED at ${report.checkpoint}: ${violations.length} violation(s) (max allowed: ${maxAllowed})\n` +
        violations.map((v, i) => `  ${i + 1}. ${v}`).join("\n"),
      violations,
      report.checkpoint,
    );
  }

  return { valid, violations, report };
}

const ProgramComplianceGateExports = {
  validateProgramLock,
  validatePanelsAgainstProgram,
  validateBeforeCompose,
  validateAdjacency,
  ProgramComplianceError,
};

export default ProgramComplianceGateExports;
