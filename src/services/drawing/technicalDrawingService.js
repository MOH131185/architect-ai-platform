import logger from "../../utils/logger.js";
import { isFeatureEnabled } from "../../config/featureFlags.js";
import {
  invokeOpenSourceAdapter,
  registerOpenSourceAdapter,
} from "../models/openSourceModelRouter.js";
import { coerceToCanonicalProjectGeometry } from "../cad/geometryFactory.js";
import { renderPlanSvg } from "./svgPlanRenderer.js";
import { renderElevationSvg } from "./svgElevationRenderer.js";
import { renderSectionSvg } from "./svgSectionRenderer.js";
import {
  buildValidationDisabledReport,
  validateProject,
} from "../validation/projectValidationEngine.js";
import { buildFacadeGrammar } from "../facade/facadeGrammarEngine.js";
import { buildStructuralGrid } from "../structure/structuralGridService.js";
import { createStableHash } from "../cad/projectGeometrySchema.js";
import { planA1Panels } from "../a1/a1PanelPlanningService.js";

function normalizeDrawingTypes(payload = {}) {
  return Array.isArray(payload.drawingTypes) && payload.drawingTypes.length
    ? payload.drawingTypes
    : ["plan", "elevation", "section"];
}

function buildA1IntegrationHooks(
  geometry = {},
  drawings = {},
  requestedDrawingTypes = [],
) {
  const panelPlan = planA1Panels({
    projectGeometry: geometry,
    drawings,
  });
  return {
    a1: {
      ready: true,
      geometry_signature: createStableHash(
        JSON.stringify({
          project_id: geometry.project_id,
          levels: geometry.levels,
          rooms: geometry.rooms,
          walls: geometry.walls,
          windows: geometry.windows,
          roof: geometry.roof,
        }),
      ),
      panel_candidates: [
        ...(requestedDrawingTypes.includes("plan") ? ["floor_plans"] : []),
        ...(requestedDrawingTypes.includes("elevation") ? ["elevations"] : []),
        ...(requestedDrawingTypes.includes("section") ? ["sections"] : []),
      ],
      panel_counts: {
        floor_plans: drawings.plan?.length || 0,
        elevations: drawings.elevation?.length || 0,
        sections: drawings.section?.length || 0,
      },
      panel_plan: panelPlan,
      titles: {
        floor_plans: (drawings.plan || []).map((entry) => entry.title),
        elevations: (drawings.elevation || []).map((entry) => entry.title),
        sections: (drawings.section || []).map((entry) => entry.title),
      },
    },
  };
}

async function renderLocalTechnicalDrawings(payload = {}) {
  const geometry = coerceToCanonicalProjectGeometry(
    payload.projectGeometry || payload.geometry || payload,
  );
  const styleDNA = payload.styleDNA || {};
  const requestedDrawingTypes = normalizeDrawingTypes(payload);
  const deterministicSvgEnabled = isFeatureEnabled("useDeterministicSvgPlans");
  const structuralGrid =
    payload.structuralGrid ||
    geometry.metadata?.structural_grid ||
    (isFeatureEnabled("useStructuralSanityLayer")
      ? buildStructuralGrid(geometry)
      : null);
  const facadeGrammar =
    payload.facadeGrammar ||
    geometry.metadata?.facade_grammar ||
    (isFeatureEnabled("useFacadeGrammarEngine")
      ? buildFacadeGrammar(geometry, styleDNA)
      : null);

  if (structuralGrid || facadeGrammar) {
    geometry.metadata = {
      ...(geometry.metadata || {}),
      ...(structuralGrid ? { structural_grid: structuralGrid } : {}),
      ...(facadeGrammar ? { facade_grammar: facadeGrammar } : {}),
    };
  }

  const outputs = {
    floor_plans: [],
    elevations: [],
    sections: [],
  };

  if (requestedDrawingTypes.includes("plan")) {
    outputs.floor_plans = geometry.levels.map((level) =>
      renderPlanSvg(geometry, {
        ...payload.options,
        levelId: level.id,
        showStructuralGrid: Boolean(structuralGrid),
      }),
    );
  }

  if (requestedDrawingTypes.includes("elevation")) {
    const orientations =
      Array.isArray(payload.orientations) && payload.orientations.length
        ? payload.orientations
        : ["north", "south", "east", "west"];
    outputs.elevations = orientations.map((orientation) =>
      renderElevationSvg(geometry, styleDNA, {
        ...payload.options,
        orientation,
        facadeGrammar,
      }),
    );
  }

  if (requestedDrawingTypes.includes("section")) {
    const sectionTypes =
      Array.isArray(payload.sectionTypes) && payload.sectionTypes.length
        ? payload.sectionTypes
        : ["longitudinal", "transverse"];
    outputs.sections = sectionTypes.map((sectionType) =>
      renderSectionSvg(geometry, styleDNA, {
        ...payload.options,
        sectionType,
        structuralGrid,
      }),
    );
  }

  const drawings = {
    plan: outputs.floor_plans,
    elevation: outputs.elevations,
    section: outputs.sections,
  };
  const integrationHooks = buildA1IntegrationHooks(
    geometry,
    drawings,
    requestedDrawingTypes,
  );
  const validationReport = isFeatureEnabled("useGeometryValidationEngine")
    ? validateProject({
        projectGeometry: geometry,
        drawings,
        drawingTypes: requestedDrawingTypes,
        facadeGrammar,
        structuralGrid,
      })
    : buildValidationDisabledReport(geometry, requestedDrawingTypes);

  return {
    status: validationReport?.status || "valid",
    adapterId: "svg-vector-engine",
    provider: "local",
    projectGeometry: geometry,
    drawings,
    outputs,
    validationReport,
    facadeGrammar,
    structuralGrid,
    integrationHooks,
    metadata: {
      annotation_ready: true,
      lineart_stylization_ready: true,
      deterministic: true,
      deterministic_svg_enabled: deterministicSvgEnabled,
      level_count: geometry.levels.length,
      drawing_types: requestedDrawingTypes,
      phase3_layers: {
        facadeGrammar: Boolean(facadeGrammar),
        structuralGrid: Boolean(structuralGrid),
      },
      integration_hooks: integrationHooks,
      notes: [
        "Deterministic SVG linework generated directly from canonical project geometry.",
        "Plans, elevations, and sections use the same geometry source of truth.",
        "A1 composition hooks are attached so downstream board composition can preserve geometry signatures and panel intent.",
        ...(facadeGrammar
          ? ["Facade grammar was applied to the elevation renderer."]
          : []),
        ...(structuralGrid
          ? ["Structural grid markers were included in technical drawings."]
          : []),
        ...(deterministicSvgEnabled
          ? []
          : [
              "useDeterministicSvgPlans is disabled, but the explicit technical drawing endpoint still uses the local SVG renderer as a safe fallback.",
            ]),
      ],
    },
    warnings: validationReport?.warnings || [],
  };
}

registerOpenSourceAdapter(
  "technicalDrawing",
  "svg-vector-engine",
  async (payload) => renderLocalTechnicalDrawings(payload),
);

export async function generateTechnicalDrawings(payload = {}, options = {}) {
  const enabled = isFeatureEnabled("useTechnicalDrawingEngine");

  if (!enabled) {
    logger.warn(
      "[Drawing] Technical drawing flag disabled, using local SVG engine for explicit endpoint call",
    );
  }

  const routed = await invokeOpenSourceAdapter(
    "technicalDrawing",
    payload,
    options,
  );
  if (routed?.outputs) {
    return {
      success: routed.status !== "invalid",
      ...routed,
      validation_notes:
        routed.validationReport?.warnings || routed.metadata?.notes || [],
    };
  }

  const fallback = await renderLocalTechnicalDrawings(payload);
  return {
    success: fallback.status !== "invalid",
    ...fallback,
    validation_notes:
      fallback.validationReport?.warnings || fallback.metadata?.notes || [],
    warnings: [
      ...(fallback.warnings || []),
      ...(Array.isArray(routed?.notes) ? routed.notes : []),
    ],
  };
}

export default {
  generateTechnicalDrawings,
};
