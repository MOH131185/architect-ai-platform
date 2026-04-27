import {
  getCurrentPipelineMode,
  PIPELINE_MODE,
} from "../config/pipelineMode.js";

export const LEGACY_MODEL_ROUTE_ISSUE_CODE = "LEGACY_MODEL_ROUTE_USED";

function normalizeMode(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[-\s]/g, "_");
}

function isTruthy(value) {
  return ["1", "true", "yes", "on"].includes(
    String(value || "")
      .trim()
      .toLowerCase(),
  );
}

function readEnv(env, key) {
  return env && typeof env[key] === "string" ? env[key] : "";
}

export function isLegacyPipelineMode(value) {
  const mode = normalizeMode(value);
  return mode === PIPELINE_MODE.MULTI_PANEL || mode === "multipanel";
}

export function isLegacyModelRouteEnabled({
  env = typeof process !== "undefined" ? process.env : {},
  context = {},
} = {}) {
  const contextMode =
    context.pipelineMode ||
    context.workflow ||
    context.mode ||
    context.metadata?.pipelineMode ||
    context.metadata?.workflow ||
    context.request?.pipelineMode ||
    context.request?.workflow ||
    null;

  if (isLegacyPipelineMode(contextMode)) {
    return true;
  }

  if (
    isLegacyPipelineMode(readEnv(env, "REACT_APP_PIPELINE_MODE")) ||
    isLegacyPipelineMode(readEnv(env, "PIPELINE_MODE"))
  ) {
    return true;
  }

  if (
    isTruthy(readEnv(env, "REACT_APP_USE_TOGETHER")) ||
    isTruthy(readEnv(env, "USE_TOGETHER"))
  ) {
    return true;
  }

  try {
    return getCurrentPipelineMode() === PIPELINE_MODE.MULTI_PANEL;
  } catch {
    return false;
  }
}

export function createLegacyModelRouteError(route, context = {}) {
  const error = new Error(
    `${LEGACY_MODEL_ROUTE_ISSUE_CODE}: ${route} is a legacy Together/DNA route. ` +
      `Set PIPELINE_MODE=multi_panel or REACT_APP_USE_TOGETHER=true to use it explicitly.`,
  );
  error.name = "LegacyModelRouteError";
  error.code = LEGACY_MODEL_ROUTE_ISSUE_CODE;
  error.details = {
    route,
    requestedPipelineMode:
      context.pipelineMode ||
      context.workflow ||
      context.metadata?.workflow ||
      null,
  };
  return error;
}

export function assertLegacyModelRouteAllowed(route, context = {}) {
  if (!isLegacyModelRouteEnabled({ context })) {
    throw createLegacyModelRouteError(route, context);
  }
}

export default {
  LEGACY_MODEL_ROUTE_ISSUE_CODE,
  assertLegacyModelRouteAllowed,
  createLegacyModelRouteError,
  isLegacyModelRouteEnabled,
  isLegacyPipelineMode,
};
