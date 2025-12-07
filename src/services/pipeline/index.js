/**
 * Pipeline Module
 *
 * Main orchestrator for the Architecture-AI Pipeline.
 * Use this module to generate complete architectural designs.
 *
 * @module services/pipeline
 *
 * @example
 * import { generateArchitecturalDesign } from './services/pipeline';
 *
 * const design = await generateArchitecturalDesign({
 *   buildingType: 'residential',
 *   totalArea: 150,
 *   floors: 2,
 *   sitePolygon: [...],
 * });
 *
 * // Access visualizations
 * const planSVG = design.visualizations.floorPlans.L0;
 *
 * // Export to DXF
 * const dxfContent = design.export.toDXF();
 *
 * // Export to IFC
 * const ifcContent = design.export.toIFC({ name: 'My Project' });
 */

export {
  default as architecturePipeline,
  generateArchitecturalDesign,
  generateProgramOnly,
  generateGeometryFromProgram,
  renderVisualizationsFromGeometry,
  exportDesign,
  validateDesign,
  getSuggestedRooms,
  getPipelineStatus,
  PIPELINE_CONFIG,
} from './architecturePipeline.js';

// Design Loop Engine with Multi-Pass Auto-Correction (Phase 4)
export {
  default as designLoopEngine,
  runDesignLoop,
  critiqueDesign,
  refineDesign,
  runMultiPassCorrection,
  quickCorrect,
  validateDesign as validateDesignLoop,
  calculateDriftScore,
  MULTIPASS_OPTIONS,
} from './designLoopEngine.js';

// Re-export from sub-modules for convenience
export * from '../program/index.js';
export * from '../geometry/index.js';
export * from '../visualization/index.js';
export * from '../export/index.js';

// ============================================================================
// NEW: Conditioned Image Pipeline (Phase 4/5)
// ============================================================================

/**
 * Conditioned Image Pipeline - New generation pathway
 *
 * When `conditionedImagePipeline` feature flag is enabled, use this module
 * for A1 sheet generation with geometry conditioning.
 *
 * @example
 * import { isFeatureEnabled } from '../../config/featureFlags.js';
 * import { initializePipeline, generateA1Views } from './pipeline';
 *
 * if (isFeatureEnabled('conditionedImagePipeline')) {
 *   const context = await initializePipeline(canonicalState, { seed: 12345 });
 *   const views = await generateA1Views(context);
 * }
 */
export {
  // Core pipeline functions
  initializePipeline,
  buildEnhancedPrompt,
  getViewGenerationParams,
  generateA1Views,
  // View type constants
  A1_VIEW_TYPES,
  VIEW_CONFIG,
} from './ConditionedImagePipeline.js';

// Geometry Conditioner exports
export {
  generateFloorPlanCondition,
  generateElevationCondition,
  generateSectionCondition,
  generateExterior3DCondition,
  generateAxonometricCondition,
  generateAllConditions,
  getConditionForView,
  CONDITIONING_TYPES,
  CONDITIONING_STRENGTHS,
} from '../../geometry/GeometryConditioner.js';

// StyleProfile exports
export {
  createStyleProfile,
  createMaterial,
  createMaterialPalette,
  createLocationStyle,
  createPortfolioStyle,
  generateStyleDescriptors,
  validateStyleProfile,
  STYLE_ARCHETYPES,
  MATERIAL_FINISHES,
  DEFAULT_BLEND_WEIGHTS,
} from '../../types/StyleProfile.js';
