/**
 * DNA Prompt Context — ADAPTER
 *
 * Re-exports from the canonical implementation at ../dnaPromptContext.js.
 * Exists so that design/panelGenerationService.js can import from a sibling
 * path without reaching outside the design/ directory.
 *
 * Canonical source: src/services/dnaPromptContext.js
 */

import dnaPromptContext from "../dnaPromptContext.js";

export {
  build3DPanelPrompt,
  buildPlanPrompt,
  buildElevationPrompt,
  buildSectionPrompt,
  buildNegativePrompt,
  buildStructuredDNAContext,
} from "../dnaPromptContext.js";

export default dnaPromptContext;
