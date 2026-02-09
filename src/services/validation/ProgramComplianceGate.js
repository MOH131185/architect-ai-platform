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

  // 2. Check that locked spaces are present in DNA rooms
  const dnaRooms = masterDNA.rooms || masterDNA.program?.rooms || [];
  const allowedLevels = getLevels(programLock);

  for (const lockedSpace of programLock.spaces) {
    const matchingRooms = dnaRooms.filter((r) => {
      const roomName = (r.name || "").toLowerCase();
      const spaceName = lockedSpace.name.toLowerCase();
      return roomName.includes(spaceName) || spaceName.includes(roomName);
    });

    if (matchingRooms.length === 0) {
      violations.push(
        `Locked space "${lockedSpace.name}" (level ${lockedSpace.lockedLevel}) not found in DNA rooms`,
      );
    }
  }

  // 3. Check DNA rooms don't reference unexpected levels
  if (programLock.invariants?.forbidUnexpectedLevels) {
    for (const room of dnaRooms) {
      const roomLevel = normaliseDNARoomLevel(room);
      if (roomLevel !== null && !allowedLevels.includes(roomLevel)) {
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

  return finish(violations, report, strict);
}

/**
 * CHECKPOINT 2: Post-Render validation
 *
 * Verifies that generated panels respect the program lock:
 * - No floor_plan panels for levels that don't exist in the lock
 * - 1-level programs don't have upper floor plans
 * - Section panels don't depict more levels than allowed
 *
 * @param {Array} panels - Generated panel results [{ panelType, ... }]
 * @param {Object} programLock
 * @returns {{ valid: boolean, violations: string[], report: Object }}
 */
export function validatePanelsAgainstProgram(
  panels,
  programLock,
  options = {},
) {
  const { strict = true } = options;
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
  const { strict = true } = options;
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

/**
 * Finalize gate result. Throws in strict mode if violations found.
 */
function finish(violations, report, strict) {
  const valid = violations.length === 0;
  report.violations = violations;
  report.valid = valid;

  if (!valid && strict) {
    throw new ProgramComplianceError(
      `ProgramComplianceGate FAILED at ${report.checkpoint}: ${violations.length} violation(s)\n` +
        violations.map((v, i) => `  ${i + 1}. ${v}`).join("\n"),
      violations,
      report.checkpoint,
    );
  }

  return { valid, violations, report };
}

export default {
  validateProgramLock,
  validatePanelsAgainstProgram,
  validateBeforeCompose,
  ProgramComplianceError,
};
