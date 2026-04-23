/**
 * Hybrid 3D Pipeline
 *
 * Orchestrates geometry-conditioned 3D visualization while keeping compiled
 * geometry as the single authority for all view consistency.
 *
 * Control hierarchy:
 * - Elevations: FGL > compiled geometry render > deterministic geometry render
 * - 3D views: compiled geometry render > deterministic geometry render
 * - Meshy: optional reference only, never canonical control
 */

import { isFeatureEnabled } from "../../config/featureFlags.js";
import logger from "../../utils/logger.js";
import {
  attachGeometryAuthority,
  assertGeometryHashContinuity,
  assertSourceMetadata,
  isTechnicalDrawingView,
  requestCompiledModelRenders,
  resolveCompiledGeometryAuthority,
} from "./unifiedGeometryPipeline.js";

let claudeReasoningService = null;
let meshy3DService = null;
let geometryRenderService = null;
let facadeGenerationLayer = null;

async function getFGLService() {
  if (!facadeGenerationLayer) {
    try {
      const module = await import("../facade/facadeGenerationLayer.js");
      facadeGenerationLayer = module;
    } catch (error) {
      logger.warn(
        `[Hybrid3D] Facade Generation Layer not available: ${error.message}`,
      );
    }
  }
  return facadeGenerationLayer;
}

async function getClaudeService() {
  if (!claudeReasoningService) {
    try {
      const module = await import("../ai/claudeReasoningService.js");
      claudeReasoningService = module.default;
    } catch (error) {
      logger.warn(
        `[Hybrid3D] Claude reasoning service not available: ${error.message}`,
      );
    }
  }
  return claudeReasoningService;
}

async function getMeshyService() {
  if (!meshy3DService) {
    try {
      const module = await import("../geometry/meshy3DService.js");
      meshy3DService = module.default;
    } catch (error) {
      logger.warn(
        `[Hybrid3D] Meshy 3D service not available: ${error.message}`,
      );
    }
  }
  return meshy3DService;
}

async function getGeometryRenderer() {
  if (!geometryRenderService) {
    try {
      const module = await import("../geometryRenderService.js");
      geometryRenderService = module.default;
    } catch (error) {
      logger.warn(
        `[Hybrid3D] Geometry render service not available: ${error.message}`,
      );
    }
  }
  return geometryRenderService;
}

const PIPELINE_CONFIG = {
  controlStrength: {
    fgl: 0.85,
    geometry: 0.7,
  },
  quality: {
    preview: { steps: 20, size: 1024 },
    standard: { steps: 35, size: 1536 },
    high: { steps: 50, size: 2048 },
  },
};

const PANEL_3D_TYPES = [
  "hero_3d",
  "interior_3d",
  "axonometric",
  "site_context",
  "aerial_view",
];
const PANEL_ELEVATION_TYPES = [
  "elevation_north",
  "elevation_south",
  "elevation_east",
  "elevation_west",
];

function createNoneControl(authority, panelType, meshyReference = null) {
  return attachGeometryAuthority(
    {
      panelType,
      viewType: panelType,
      controlStrength: 0,
      source: "none",
      dataUrl: null,
      url: null,
      styleReference: meshyReference || null,
    },
    authority,
    panelType,
    {
      sourceType: "none",
      stylizationMode: isTechnicalDrawingView(panelType)
        ? "deterministic_missing_control"
        : "geometry_control_missing",
      meshyRole: meshyReference ? "optional_reference" : null,
    },
  );
}

export class Hybrid3DPipeline {
  constructor() {
    this.config = PIPELINE_CONFIG;
    this.cache = new Map();
  }

  async generateAll(geometryDNA, projectContext = {}, options = {}) {
    const {
      quality = "standard",
      useClaude = isFeatureEnabled("useClaudeReasoning"),
      useMeshy = isFeatureEnabled("meshy3DMode"),
      useGeometry = isFeatureEnabled("geometryDNAv2") !== false,
      useFGL = isFeatureEnabled("facadeGenerationLayer"),
      blendedStyle = null,
      compiledProject = projectContext.compiledProject || null,
      panels = [...PANEL_3D_TYPES, ...PANEL_ELEVATION_TYPES],
    } = options;

    logger.info("[Hybrid3D] Starting compiled-geometry-first pipeline");

    const geometryAuthority = await resolveCompiledGeometryAuthority(
      geometryDNA,
      {
        ...options,
        compiledProject,
        projectContext,
        views: panels,
      },
    );

    const results = {
      panels: {},
      controlImages: {},
      geometryAuthority: {
        authorityType: geometryAuthority.authorityType,
        geometryHash: geometryAuthority.geometryHash,
        cdsHash: geometryAuthority.cdsHash || null,
        designFingerprint: geometryAuthority.designFingerprint || null,
        projectId: geometryAuthority.projectId || null,
      },
      meshyBaseline: null,
      fglResults: null,
      geometryRenders: {},
      constraints: null,
      metadata: {
        timestamp: new Date().toISOString(),
        pipeline: "hybrid3D-compiled-geometry-first",
        quality,
        geometryHash: geometryAuthority.geometryHash,
        steps: ["compiled-geometry-authority"],
      },
    };

    if (useClaude && geometryDNA?.constraints) {
      results.constraints = await this.validateConstraints(
        geometryDNA.constraints,
      );
      results.metadata.steps.push("constraints");
    }

    if (useFGL && geometryDNA?.version === "2.0") {
      results.fglResults = await this.generateFGLControlImages(
        geometryDNA,
        blendedStyle,
        geometryAuthority,
      );
      if (results.fglResults?.success) {
        results.metadata.steps.push("fgl");
      }
    }

    if (
      useGeometry ||
      Object.keys(geometryAuthority.renderInputs || {}).length > 0
    ) {
      results.geometryRenders = await this.generateGeometryRenders(
        geometryDNA,
        panels,
        geometryAuthority,
      );
      results.metadata.steps.push("geometry");
    }

    if (useMeshy) {
      const meshyResult = await this.generateMeshyModel(
        geometryDNA,
        projectContext,
        geometryAuthority,
      );
      if (meshyResult?.success) {
        results.meshyBaseline = meshyResult;
        results.metadata.steps.push("meshy-reference");
      }
    }

    results.controlImages = this.buildControlHierarchy(
      results.geometryRenders,
      results.meshyBaseline?.mappedRenders || null,
      results.fglResults?.controlImages || null,
      panels,
      geometryAuthority,
    );
    results.metadata.steps.push("control-hierarchy");

    results.panels = this.prepareFluxGeneration(
      geometryDNA,
      results.controlImages,
      panels,
      quality,
      results.fglResults,
      geometryAuthority,
    );
    results.metadata.steps.push("flux-prep");

    assertGeometryHashContinuity(
      results.controlImages,
      geometryAuthority.geometryHash,
      "hybrid pipeline control continuity",
    );
    assertGeometryHashContinuity(
      results.panels,
      geometryAuthority.geometryHash,
      "hybrid pipeline prepared panel continuity",
    );
    Object.entries(results.controlImages).forEach(([panelType, entry]) => {
      assertSourceMetadata(entry, panelType);
    });
    Object.entries(results.panels).forEach(([panelType, entry]) => {
      assertSourceMetadata(entry, panelType);
    });

    logger.info(
      `[Hybrid3D] Complete with geometryHash=${geometryAuthority.geometryHash?.slice(0, 12) || "missing"}`,
    );
    return results;
  }

  async validateConstraints(constraints) {
    try {
      const claude = await getClaudeService();
      return claude ? constraints : constraints;
    } catch (error) {
      logger.warn(`[Hybrid3D] Constraint validation failed: ${error.message}`);
      return constraints;
    }
  }

  async generateFGLControlImages(geometryDNA, blendedStyle = {}, authority) {
    try {
      const fglModule = await getFGLService();
      if (!fglModule?.createFacadeGenerationLayer) {
        return { success: false, error: "FGL module not available" };
      }

      const { createFacadeGenerationLayer, extractOpeningEnumeration } =
        fglModule;
      const fgl = createFacadeGenerationLayer(geometryDNA, blendedStyle || {});
      const fglResults = await fgl.generate();

      const controlImages = {};
      const openingEnumerations = {};

      ["N", "S", "E", "W"].forEach((direction) => {
        const panelType =
          direction === "N"
            ? "elevation_north"
            : direction === "S"
              ? "elevation_south"
              : direction === "E"
                ? "elevation_east"
                : "elevation_west";

        if (!fglResults?.controlImages?.[direction]) return;

        controlImages[panelType] = attachGeometryAuthority(
          {
            dataUrl: fglResults.controlImages[direction].dataUrl,
            svg: fglResults.elevationSVGs?.[direction] || null,
            controlStrength: this.config.controlStrength.fgl,
            direction,
            openingCount: fglResults.controlImages[direction].openingCount || 0,
          },
          authority,
          panelType,
          {
            sourceType: "fgl_control",
            stylizationMode: "deterministic_passthrough",
          },
        );

        if (
          fglResults.windowPlacements &&
          typeof extractOpeningEnumeration === "function"
        ) {
          openingEnumerations[panelType] = extractOpeningEnumeration(
            fglResults.windowPlacements,
            direction,
          );
        }
      });

      return {
        success: Object.keys(controlImages).length > 0,
        controlImages,
        openingEnumerations,
        roofProfile: fglResults.roofProfile,
        facadeRooms: fglResults.facadeRooms,
        windowPlacements: fglResults.windowPlacements,
        buildingDimensions: fglResults.buildingDimensions,
        metadata: fglResults.metadata,
      };
    } catch (error) {
      logger.warn(
        `[Hybrid3D] FGL control image generation failed: ${error.message}`,
      );
      return { success: false, error: error.message };
    }
  }

  async generateGeometryRenders(geometryDNA, panels, authority) {
    const renders = {};

    Object.entries(authority.renderInputs || {}).forEach(
      ([panelType, entry]) => {
        if (!panels.includes(panelType)) return;
        renders[panelType] = attachGeometryAuthority(
          entry,
          authority,
          panelType,
          {
            sourceType:
              entry.sourceType ||
              authority.defaultSourceType ||
              "compiled_render_input",
            stylizationMode: isTechnicalDrawingView(panelType)
              ? "deterministic_passthrough"
              : null,
          },
        );
      },
    );

    const missingViews = panels.filter((panelType) => !renders[panelType]);
    if (missingViews.length > 0 && authority.modelUrl) {
      const compiledModelRenders = await requestCompiledModelRenders(
        authority.modelUrl,
        missingViews,
        authority,
      );
      Object.entries(compiledModelRenders).forEach(([panelType, entry]) => {
        if (entry) {
          renders[panelType] = entry;
        }
      });
    }

    const stillMissing = panels.filter((panelType) => !renders[panelType]);
    if (stillMissing.length === 0) {
      return renders;
    }

    try {
      const renderer = await getGeometryRenderer();
      if (!renderer) {
        return renders;
      }

      for (const panelType of stillMissing) {
        try {
          if (
            PANEL_ELEVATION_TYPES.includes(panelType) &&
            typeof renderer.renderElevation === "function"
          ) {
            const orientation = panelType.replace("elevation_", "");
            const render = await renderer.renderElevation(
              geometryDNA,
              orientation,
            );
            if (render) {
              renders[panelType] = attachGeometryAuthority(
                render,
                authority,
                panelType,
                {
                  sourceType: "deterministic_geometry_render",
                  stylizationMode: "deterministic_passthrough",
                },
              );
            }
          } else if (
            panelType === "axonometric" &&
            typeof renderer.renderAxonometric === "function"
          ) {
            const render = await renderer.renderAxonometric(geometryDNA);
            if (render) {
              renders[panelType] = attachGeometryAuthority(
                render,
                authority,
                panelType,
                {
                  sourceType: "deterministic_geometry_render",
                },
              );
            }
          }
        } catch (error) {
          logger.warn(
            `[Hybrid3D] Deterministic render failed for ${panelType}: ${error.message}`,
          );
        }
      }
    } catch (error) {
      logger.warn(`[Hybrid3D] Geometry rendering failed: ${error.message}`);
    }

    return renders;
  }

  async generateMeshyModel(geometryDNA, projectContext, authority) {
    const meshyService = await getMeshyService();
    if (!meshyService?.isAvailable || !meshyService.isAvailable()) {
      return { success: false, error: "Meshy service not available" };
    }

    try {
      const geometry = geometryDNA?.geometry || {};
      const volumeSpec = {
        dimensions: {
          length: (geometryDNA?.facades?.north?.width || 12000) / 1000,
          width: (geometryDNA?.facades?.east?.width || 10000) / 1000,
          height: (geometryDNA?.facades?.north?.height || 7000) / 1000,
        },
        floors: geometry.floors?.length || 2,
        roof: {
          type: geometry.roof?.type || "gable",
          pitch: geometry.roof?.pitch || 35,
          ridgeDirection: geometry.roof?.ridgeDirection || "east-west",
        },
      };

      const result = await meshyService.generate3DFromDNA(
        geometryDNA,
        volumeSpec,
        {
          artStyle: "realistic",
          seed: geometryDNA.seed || null,
        },
      );

      if (!result?.success) {
        return result || { success: false, error: "Meshy generation failed" };
      }

      const mappedRenders = Object.fromEntries(
        Object.entries(result.mappedRenders || {}).map(([panelType, entry]) => [
          panelType,
          attachGeometryAuthority(entry, authority, panelType, {
            sourceType: "meshy_reference",
            stylizationMode: "reference_only",
            meshyRole: "optional_reference",
          }),
        ]),
      );

      return {
        ...result,
        mappedRenders,
        isCanonical: false,
        styleReferenceOnly: true,
        projectContext,
      };
    } catch (error) {
      logger.warn(`[Hybrid3D] Meshy generation failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  buildControlHierarchy(
    geometryRenders,
    meshyRenders,
    fglRenders,
    panels,
    authority,
  ) {
    const hierarchy = {};

    for (const panelType of panels) {
      const isElevation = PANEL_ELEVATION_TYPES.includes(panelType);

      if (isElevation && fglRenders?.[panelType]) {
        hierarchy[panelType] = attachGeometryAuthority(
          fglRenders[panelType],
          authority,
          panelType,
          {
            sourceType: "fgl_control",
            stylizationMode: "deterministic_passthrough",
          },
        );
        continue;
      }

      if (geometryRenders?.[panelType]) {
        hierarchy[panelType] = attachGeometryAuthority(
          geometryRenders[panelType],
          authority,
          panelType,
          {
            sourceType:
              geometryRenders[panelType].sourceType ||
              geometryRenders[panelType].sourceMetadata?.sourceType ||
              authority.defaultSourceType,
          },
        );
        continue;
      }

      hierarchy[panelType] = createNoneControl(
        authority,
        panelType,
        meshyRenders?.[panelType] || null,
      );
    }

    return hierarchy;
  }

  prepareFluxGeneration(
    geometryDNA,
    controlImages,
    panels,
    quality,
    fglResults = null,
    authority,
  ) {
    const qualityConfig =
      this.config.quality[quality] || this.config.quality.standard;
    const prepared = {};

    for (const panelType of panels) {
      if (
        panelType === "hero_3d" &&
        authority?.heroFinalization?.heroReady !== true
      ) {
        throw new Error(
          authority?.heroFinalization?.blockingReasons?.length
            ? `Hero generation is blocked until finalized design authority is present: ${authority.heroFinalization.blockingReasons.join(", ")}.`
            : "Hero generation is blocked until finalized design authority is present.",
        );
      }

      const control =
        controlImages[panelType] || createNoneControl(authority, panelType);
      const isElevation = PANEL_ELEVATION_TYPES.includes(panelType);
      const is3D = PANEL_3D_TYPES.includes(panelType);
      const controlImage = control.url || control.dataUrl || null;

      prepared[panelType] = attachGeometryAuthority(
        {
          panelType,
          viewType: panelType,
          flux: {
            steps: is3D
              ? qualityConfig.steps
              : Math.floor(qualityConfig.steps * 0.7),
            size: isElevation ? 1536 : qualityConfig.size,
            guidanceScale: 7.5,
            imageModelAllowed: !isTechnicalDrawingView(panelType),
          },
          controlImage,
          controlStrength: control.controlStrength || 0,
          controlSource:
            control.sourceMetadata?.sourceType || control.source || "none",
          category: is3D ? "3d" : "technical",
          orientation: isElevation ? panelType.replace("elevation_", "") : null,
          dnaRef: {
            style: geometryDNA?.style,
            materials: geometryDNA?.style?.materials,
            facades: geometryDNA?.facades,
            roof: geometryDNA?.geometry?.roof,
          },
          styleReference: control.styleReference || null,
          fglData:
            isElevation && fglResults?.success
              ? {
                  openings: fglResults.openingEnumerations?.[panelType] || null,
                  roofProfile: fglResults.roofProfile || null,
                  windowPlacements: fglResults.windowPlacements || null,
                  source: "fgl",
                }
              : null,
        },
        authority,
        panelType,
        {
          sourceType:
            control.sourceMetadata?.sourceType || control.source || "none",
          stylizationMode: isTechnicalDrawingView(panelType)
            ? "deterministic_passthrough"
            : controlImage
              ? "image_edit_locked"
              : "geometry_control_missing",
        },
      );
    }

    return prepared;
  }

  async generateSinglePanel(panelType, geometryDNA, options = {}) {
    const fullResult = await this.generateAll(
      geometryDNA,
      options.projectContext || {},
      {
        ...options,
        panels: [panelType],
      },
    );

    return {
      panel: fullResult.panels[panelType],
      controlImage: fullResult.controlImages[panelType],
    };
  }

  async getControlImage(panelType, geometryDNA) {
    const cacheKey = `${geometryDNA.designId || geometryDNA.projectId || "default"}_${panelType}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const authority = await resolveCompiledGeometryAuthority(geometryDNA, {
      views: [panelType],
    });
    const renders = await this.generateGeometryRenders(
      geometryDNA,
      [panelType],
      authority,
    );
    const control =
      renders[panelType] || createNoneControl(authority, panelType);
    this.cache.set(cacheKey, control);
    return control;
  }

  clearCache() {
    this.cache.clear();
    logger.info("[Hybrid3D] Cache cleared");
  }
}

const hybrid3DPipeline = new Hybrid3DPipeline();

export const generateAll = (geometryDNA, projectContext, options) =>
  hybrid3DPipeline.generateAll(geometryDNA, projectContext, options);
export const generateSinglePanel = (panelType, geometryDNA, options) =>
  hybrid3DPipeline.generateSinglePanel(panelType, geometryDNA, options);
export const getControlImage = (panelType, geometryDNA) =>
  hybrid3DPipeline.getControlImage(panelType, geometryDNA);
export const clearCache = () => hybrid3DPipeline.clearCache();

export const PANEL_3D_TYPES_LIST = PANEL_3D_TYPES;
export const PANEL_ELEVATION_TYPES_LIST = PANEL_ELEVATION_TYPES;

export default hybrid3DPipeline;
