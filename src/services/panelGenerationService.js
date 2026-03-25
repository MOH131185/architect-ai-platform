/**
 * Panel Generation Service — ADAPTER (re-export facade)
 *
 * Thin re-export of the canonical implementation at
 * design/panelGenerationService.js. Exists so that dnaWorkflowOrchestrator.js
 * and other root-level callers can import from a sibling path.
 *
 * Canonical source: src/services/design/panelGenerationService.js
 */

export {
  planA1Panels,
  generateA1PanelsSequential,
  clearStyleCache,
} from "./design/panelGenerationService.js";
export { default } from "./design/panelGenerationService.js";
