import {
  getSynchronizedFeatureFlagNames,
  isFeatureEnabled,
} from "../../src/config/featureFlags.js";
import { validateNamedSchema } from "../../src/services/contracts/schemaValidationService.js";

export const config = {
  runtime: "nodejs",
  maxDuration: 60,
};

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:3001",
  "https://www.archiaisolution.pro",
  "https://archiaisolution.pro",
  /^https:\/\/architect-ai-platform-[a-z0-9]+-[a-z0-9]+\.vercel\.app\/?$/,
];

function normalizeOrigin(origin) {
  return typeof origin === "string" ? origin.replace(/\/$/, "") : "";
}

function getAllowedOrigins() {
  if (
    typeof process !== "undefined" &&
    process.env &&
    typeof process.env.ALLOWED_ORIGINS === "string" &&
    process.env.ALLOWED_ORIGINS.trim()
  ) {
    return process.env.ALLOWED_ORIGINS.split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return DEFAULT_ALLOWED_ORIGINS;
}

function isAllowedOrigin(origin) {
  if (!origin) return true;

  const normalizedOrigin = normalizeOrigin(origin);
  return getAllowedOrigins().some((allowedOrigin) => {
    if (allowedOrigin instanceof RegExp) {
      return allowedOrigin.test(origin) || allowedOrigin.test(normalizedOrigin);
    }

    return normalizeOrigin(allowedOrigin) === normalizedOrigin;
  });
}

function buildErrorPayload(status, error, message, details = null, meta = {}) {
  return {
    success: false,
    error,
    errorCode: error,
    message,
    statusCode: status,
    details,
    meta,
  };
}

export function setCors(req, res, methods = "POST, OPTIONS") {
  const origin = req?.headers?.origin || null;

  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", methods);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (!origin) {
    return true;
  }

  if (!isAllowedOrigin(origin)) {
    return false;
  }

  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  return true;
}

export function handleOptions(req, res, methods = "POST, OPTIONS") {
  if (req.method !== "OPTIONS") {
    return false;
  }

  const allowed = setCors(req, res, methods);
  if (!allowed) {
    res
      .status(403)
      .json(
        buildErrorPayload(
          403,
          "ORIGIN_NOT_ALLOWED",
          "Origin is not allowed for this endpoint.",
        ),
      );
    return true;
  }

  res.status(204).end();
  return true;
}

export function rejectInvalidMethod(req, res, method = "POST") {
  if (req.method !== method) {
    res.setHeader("Allow", `${method}, OPTIONS`);
    res
      .status(405)
      .json(
        buildErrorPayload(
          405,
          "METHOD_NOT_ALLOWED",
          `Use ${method} for this endpoint.`,
          { allowedMethod: method },
        ),
      );
    return true;
  }
  return false;
}

export function ensureFeatureEnabled(
  res,
  featureFlagNames = [],
  endpoint = "phase1-endpoint",
) {
  const expandedFlags = [
    ...new Set(
      featureFlagNames
        .flatMap((flagName) => getSynchronizedFeatureFlagNames(flagName))
        .filter(Boolean),
    ),
  ];
  const disabledFlags = expandedFlags.filter(
    (flagName) => !isFeatureEnabled(flagName),
  );

  if (!disabledFlags.length) {
    return true;
  }

  res.status(503).json(
    buildErrorPayload(
      503,
      "FEATURE_DISABLED",
      `The ${endpoint} endpoint is disabled by feature flag configuration.`,
      {
        disabledFlags,
        requiredFlags: expandedFlags,
      },
      {
        endpoint,
        featureFlags: expandedFlags,
      },
    ),
  );
  return false;
}

export function sendError(
  res,
  status,
  error,
  message,
  details = null,
  meta = {},
) {
  return res
    .status(status)
    .json(buildErrorPayload(status, error, message, details, meta));
}

export function enforceSchemaValidation(
  res,
  schemaName,
  payload,
  endpoint,
  featureFlags = [],
) {
  if (
    !isFeatureEnabled("useFormalSchemaValidation") &&
    !isFeatureEnabled("useFormalSchemaEngine")
  ) {
    return { valid: true, errors: [], warnings: [] };
  }

  const validation = validateNamedSchema(schemaName, payload);
  if (validation.valid) {
    return validation;
  }

  sendError(
    res,
    400,
    "SCHEMA_VALIDATION_FAILED",
    validation.errors.join(" "),
    validation,
    {
      endpoint,
      featureFlags,
      schemaName,
      schemaVersion: validation.schemaVersion || null,
      schemaEngineVersion: validation.schemaEngineVersion || null,
    },
  );
  return validation;
}
