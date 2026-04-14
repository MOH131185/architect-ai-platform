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

function normalizeDrawingTypes(payload = {}) {
  return Array.isArray(payload.drawingTypes) && payload.drawingTypes.length
    ? payload.drawingTypes
    : ["plan", "elevation", "section"];
}

async function renderLocalTechnicalDrawings(payload = {}) {
  const geometry = coerceToCanonicalProjectGeometry(
    payload.projectGeometry || payload.geometry || payload,
  );
  const styleDNA = payload.styleDNA || {};
  const requestedDrawingTypes = normalizeDrawingTypes(payload);
  const deterministicSvgEnabled = isFeatureEnabled("useDeterministicSvgPlans");

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
      }),
    );
  }

  const drawings = {
    plan: outputs.floor_plans,
    elevation: outputs.elevations,
    section: outputs.sections,
  };
  const validationReport = isFeatureEnabled("useGeometryValidationEngine")
    ? validateProject({
        projectGeometry: geometry,
        drawings,
        drawingTypes: requestedDrawingTypes,
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
    metadata: {
      annotation_ready: true,
      lineart_stylization_ready: true,
      deterministic: true,
      deterministic_svg_enabled: deterministicSvgEnabled,
      level_count: geometry.levels.length,
      drawing_types: requestedDrawingTypes,
      notes: [
        "Deterministic SVG linework generated directly from canonical project geometry.",
        "Plans, elevations, and sections use the same geometry source of truth.",
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
