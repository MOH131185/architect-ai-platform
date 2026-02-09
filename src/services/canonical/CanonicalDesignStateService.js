/**
 * Canonical Design State Service
 *
 * Checks if the design state is ready for panel generation.
 * Now delegates to the real CDS module for validation.
 */

import { verifyCDSSync } from "../validation/CanonicalDesignState.js";

/**
 * Check if the design state is ready for panel generation
 * @param {Object} designState - The current design state
 * @returns {{ ready: boolean, missing: string[] }}
 */
export function isReadyForPanelGeneration(designState) {
  const missing = [];

  if (!designState) {
    return { ready: false, missing: ["designState"] };
  }

  if (!designState.masterDNA) {
    missing.push("masterDNA");
  }

  // P0: Check for CDS when required
  if (designState.canonicalDesignState) {
    if (!verifyCDSSync(designState.canonicalDesignState)) {
      missing.push("canonicalDesignState.hash (integrity check failed)");
    }
  }

  // P0: Check for ProgramLock when present
  if (designState.programLock) {
    if (
      !designState.programLock.spaces ||
      designState.programLock.spaces.length === 0
    ) {
      missing.push("programLock.spaces");
    }
    if (!designState.programLock.hash) {
      missing.push("programLock.hash");
    }
  }

  return {
    ready: missing.length === 0,
    missing,
  };
}

export default {
  isReadyForPanelGeneration,
};
