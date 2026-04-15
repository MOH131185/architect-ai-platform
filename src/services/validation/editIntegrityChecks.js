import {
  getLayerImpactSet,
  normalizeProjectLocks,
} from "../editing/projectLockManager.js";

function deepEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function runEditIntegrityChecks({
  previousProjectGeometry = null,
  projectGeometry = null,
  locks = {},
  targetLayer = null,
} = {}) {
  const normalizedLocks = normalizeProjectLocks(locks);
  const warnings = [];
  const errors = [];
  const repairHints = [];
  const affectedEntities = [];

  if (!previousProjectGeometry || !projectGeometry) {
    return {
      valid: true,
      warnings,
      errors,
      repairHints,
      affectedEntities,
    };
  }

  const previousMetadata = previousProjectGeometry.metadata || {};
  const nextMetadata = projectGeometry.metadata || {};

  if (
    normalizedLocks.lockedLayers.includes("site") &&
    !deepEqual(previousProjectGeometry.site, projectGeometry.site)
  ) {
    errors.push("Site geometry changed despite the site layer being locked.");
    repairHints.push("Restore the locked site geometry.");
  }

  if (
    normalizedLocks.lockedLayers.includes("levels") &&
    !deepEqual(previousProjectGeometry.levels, projectGeometry.levels)
  ) {
    errors.push(
      "Level definitions changed despite the levels layer being locked.",
    );
    repairHints.push("Restore the locked level definitions.");
  }

  if (
    normalizedLocks.lockedLayers.includes("room_layout") &&
    !deepEqual(previousProjectGeometry.rooms, projectGeometry.rooms)
  ) {
    errors.push(
      "Room layout changed despite the room_layout layer being locked.",
    );
    repairHints.push("Restore the locked room geometry.");
  }

  if (
    normalizedLocks.lockedLayers.includes("openings") &&
    (!deepEqual(previousProjectGeometry.doors, projectGeometry.doors) ||
      !deepEqual(previousProjectGeometry.windows, projectGeometry.windows))
  ) {
    errors.push("Openings changed despite the openings layer being locked.");
    repairHints.push("Restore locked doors and windows.");
  }

  if (
    normalizedLocks.lockedLayers.includes("structural_grid") &&
    !deepEqual(previousMetadata.structural_grid, nextMetadata.structural_grid)
  ) {
    errors.push(
      "Structural grid changed despite the structural_grid layer being locked.",
    );
    repairHints.push("Restore the locked structural grid.");
  }

  if (
    normalizedLocks.lockedLayers.includes("facade_grammar") &&
    !deepEqual(previousMetadata.facade_grammar, nextMetadata.facade_grammar)
  ) {
    errors.push(
      "Facade grammar changed despite the facade_grammar layer being locked.",
    );
    repairHints.push("Restore the locked facade grammar.");
  }

  if (
    targetLayer &&
    getLayerImpactSet(targetLayer).some((entry) =>
      normalizedLocks.lockedLayers.includes(entry),
    )
  ) {
    errors.push(
      `Requested target layer "${targetLayer}" conflicts with locked layers.`,
    );
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
    repairHints: [...new Set(repairHints)],
    affectedEntities,
  };
}

export default {
  runEditIntegrityChecks,
};
