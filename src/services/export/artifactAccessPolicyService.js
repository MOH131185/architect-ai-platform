/* global globalThis */

export const ARTIFACT_ACCESS_DENIED = "ARTIFACT_ACCESS_DENIED";
export const ARTIFACT_ACCESS_PROJECT_REQUIRED =
  "ARTIFACT_ACCESS_PROJECT_REQUIRED";
export const ARTIFACT_ACCESS_USER_REQUIRED = "ARTIFACT_ACCESS_USER_REQUIRED";

function headerValue(headers = {}, name) {
  const target = String(name).toLowerCase();
  const key = Object.keys(headers || {}).find(
    (candidate) => candidate.toLowerCase() === target,
  );
  return key ? headers[key] : null;
}

function cleanString(value) {
  const text = String(value || "").trim();
  return text || null;
}

function splitList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(cleanString).filter(Boolean);
  return String(value).split(",").map(cleanString).filter(Boolean);
}

function resolveServiceBypass(
  headers = {},
  env = globalThis.process?.env || {},
) {
  const configuredToken =
    env.ARTIFACT_SERVICE_ROLE_TOKEN ||
    env.ARTIFACT_STORAGE_SERVICE_TOKEN ||
    null;
  if (!configuredToken) return false;
  const suppliedToken =
    headerValue(headers, "x-artifact-service-token") ||
    headerValue(headers, "x-service-role-token") ||
    null;
  return suppliedToken === configuredToken;
}

export function resolveArtifactAccessContext(
  req = {},
  body = {},
  env = globalThis.process?.env || {},
) {
  const headers = req.headers || {};
  const userId =
    cleanString(headerValue(headers, "x-user-id")) ||
    cleanString(body.userId) ||
    cleanString(body.metadata?.userId) ||
    null;
  const projectId =
    cleanString(headerValue(headers, "x-project-id")) ||
    cleanString(body.projectId) ||
    cleanString(body.project_id) ||
    cleanString(body.metadata?.projectId) ||
    cleanString(req.query?.projectId) ||
    cleanString(req.query?.project_id) ||
    null;
  const accessibleProjectIds = splitList(
    body.accessibleProjectIds ||
      body.metadata?.accessibleProjectIds ||
      headerValue(headers, "x-accessible-project-ids"),
  );
  const storageProvider = cleanString(env.ARTIFACT_STORAGE_PROVIDER);
  const strictAccess =
    env.ARTIFACT_ACCESS_CONTROL_STRICT === "true" ||
    (env.NODE_ENV === "production" && storageProvider === "s3");

  return {
    userId,
    projectId,
    accessibleProjectIds,
    serviceRole: resolveServiceBypass(headers, env),
    strictAccess,
  };
}

function allowLocalAnonymous(context = {}) {
  return !context.strictAccess && !context.userId && !context.projectId;
}

function projectAllowed(context = {}, projectId = null) {
  if (!projectId) return true;
  if (context.projectId && context.projectId !== projectId) return false;
  if (
    Array.isArray(context.accessibleProjectIds) &&
    context.accessibleProjectIds.length > 0
  ) {
    return context.accessibleProjectIds.includes(projectId);
  }
  return true;
}

export function canStoreArtifactPackage(context = {}, packageInput = {}) {
  if (context.serviceRole) return { allowed: true };
  if (allowLocalAnonymous(context)) return { allowed: true };

  const projectId = cleanString(packageInput.projectId);
  const requestedUserId = cleanString(packageInput.userId);

  if (context.strictAccess && !context.userId) {
    return {
      allowed: false,
      code: ARTIFACT_ACCESS_USER_REQUIRED,
      status: 403,
    };
  }
  if (context.strictAccess && !projectId) {
    return {
      allowed: false,
      code: ARTIFACT_ACCESS_PROJECT_REQUIRED,
      status: 403,
    };
  }
  if (requestedUserId && context.userId && requestedUserId !== context.userId) {
    return { allowed: false, code: ARTIFACT_ACCESS_DENIED, status: 403 };
  }
  if (!projectAllowed(context, projectId)) {
    return { allowed: false, code: ARTIFACT_ACCESS_DENIED, status: 403 };
  }
  return { allowed: true };
}

export function canListArtifactHistory(context = {}, { projectId } = {}) {
  if (context.serviceRole) return { allowed: true };
  if (allowLocalAnonymous(context)) return { allowed: true };
  if (context.strictAccess && !context.userId) {
    return {
      allowed: false,
      code: ARTIFACT_ACCESS_USER_REQUIRED,
      status: 403,
    };
  }
  if (context.strictAccess && !projectId) {
    return {
      allowed: false,
      code: ARTIFACT_ACCESS_PROJECT_REQUIRED,
      status: 403,
    };
  }
  if (!projectAllowed(context, projectId)) {
    return { allowed: false, code: ARTIFACT_ACCESS_DENIED, status: 403 };
  }
  return { allowed: true };
}

export function canReadArtifactPackage(context = {}, record = {}) {
  if (context.serviceRole || context.signedUrlVerified) {
    return { allowed: true };
  }
  if (allowLocalAnonymous(context)) return { allowed: true };

  const manifest = record.manifest || {};
  const metadata = record.metadata || {};
  const ownerUserId = cleanString(metadata.userId);
  const projectId = cleanString(manifest.projectId);

  if (context.strictAccess && !context.userId) {
    return {
      allowed: false,
      code: ARTIFACT_ACCESS_USER_REQUIRED,
      status: 404,
    };
  }
  if (context.strictAccess && !projectId) {
    return {
      allowed: false,
      code: ARTIFACT_ACCESS_PROJECT_REQUIRED,
      status: 404,
    };
  }
  if (ownerUserId && context.userId && ownerUserId !== context.userId) {
    return { allowed: false, code: ARTIFACT_ACCESS_DENIED, status: 404 };
  }
  if (!projectAllowed(context, projectId)) {
    return { allowed: false, code: ARTIFACT_ACCESS_DENIED, status: 404 };
  }
  return { allowed: true };
}

export function accessDeniedResponse(res, decision = {}) {
  return res.status(decision.status || 403).json({
    error: "Artifact package is not accessible",
    code: decision.code || ARTIFACT_ACCESS_DENIED,
  });
}

export default {
  ARTIFACT_ACCESS_DENIED,
  ARTIFACT_ACCESS_PROJECT_REQUIRED,
  ARTIFACT_ACCESS_USER_REQUIRED,
  resolveArtifactAccessContext,
  canStoreArtifactPackage,
  canListArtifactHistory,
  canReadArtifactPackage,
  accessDeniedResponse,
};
