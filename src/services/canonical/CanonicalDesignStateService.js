/**
 * Canonical Design State Service
 *
 * Checks if the design state is ready for panel generation.
 * This is a stub implementation for testing purposes.
 */

/**
 * Check if the design state is ready for panel generation
 * @param {Object} designState - The current design state
 * @returns {{ ready: boolean, missing: string[] }} - Readiness status
 */
export function isReadyForPanelGeneration(designState) {
  const missing = [];

  if (!designState) {
    return { ready: false, missing: ["designState"] };
  }

  if (!designState.masterDNA) {
    missing.push("masterDNA");
  }

  return {
    ready: missing.length === 0,
    missing,
  };
}

export default {
  isReadyForPanelGeneration,
};
