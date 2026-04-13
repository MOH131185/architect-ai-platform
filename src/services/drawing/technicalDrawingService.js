import logger from "../../utils/logger.js";
import { isFeatureEnabled } from "../../config/featureFlags.js";
import {
  invokeOpenSourceAdapter,
  registerOpenSourceAdapter,
} from "../models/openSourceModelRouter.js";
import { normalizeArchitecturalGeometry } from "../cad/archElementNormalizer.js";
import { renderPlanSvg } from "./svgPlanRenderer.js";
import { renderElevationSvg } from "./svgElevationRenderer.js";
import { renderSectionSvg } from "./svgSectionRenderer.js";

async function renderLocalTechnicalDrawings(payload = {}) {
  const geometry = normalizeArchitecturalGeometry(
    payload.projectGeometry || payload.geometry || payload,
    {
      source: "technical-drawing-local-engine",
    },
  );
  const styleDNA = payload.styleDNA || {};
  const requestedDrawingTypes = Array.isArray(payload.drawingTypes)
    ? payload.drawingTypes
    : ["plan", "elevation", "section"];

  const outputs = {
    floor_plans: [],
    elevations: [],
    sections: [],
  };

  if (requestedDrawingTypes.includes("plan")) {
    outputs.floor_plans = geometry.levels.map((level) =>
      renderPlanSvg(geometry, { ...payload.options, levelId: level.id }),
    );
  }

  if (requestedDrawingTypes.includes("elevation")) {
    const orientations = payload.orientations || [
      "north",
      "south",
      "east",
      "west",
    ];
    outputs.elevations = orientations.map((orientation) =>
      renderElevationSvg(geometry, styleDNA, {
        ...payload.options,
        orientation,
      }),
    );
  }

  if (requestedDrawingTypes.includes("section")) {
    const sectionTypes = payload.sectionTypes || ["longitudinal", "transverse"];
    outputs.sections = sectionTypes.map((sectionType) =>
      renderSectionSvg(geometry, styleDNA, { ...payload.options, sectionType }),
    );
  }

  return {
    status: "ready",
    adapterId: "svg-vector-engine",
    provider: "local",
    drawings: {
      plan: outputs.floor_plans,
      elevation: outputs.elevations,
      section: outputs.sections,
    },
    outputs,
    metadata: {
      annotation_ready: true,
      lineart_stylization_ready: true,
      level_count: geometry.levels.length,
      drawing_types: requestedDrawingTypes,
      notes: [
        "Deterministic SVG linework generated from structured geometry.",
        "TODO: optional stylization pass can be inserted after SVG export.",
      ],
    },
  };
}

registerOpenSourceAdapter(
  "technicalDrawing",
  "svg-vector-engine",
  async (payload) => renderLocalTechnicalDrawings(payload),
);

/**
 * Contract: generateTechnicalDrawings()
 */
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
      success: true,
      ...routed,
      validation_notes: routed.metadata?.notes || [],
    };
  }

  const fallback = await renderLocalTechnicalDrawings(payload);
  return {
    success: true,
    ...fallback,
    validation_notes: fallback.metadata?.notes || [],
    warnings: Array.isArray(routed?.notes) ? routed.notes : [],
  };
}

export default {
  generateTechnicalDrawings,
};
