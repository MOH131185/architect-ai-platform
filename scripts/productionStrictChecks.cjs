/**
 * Production-strict environment validation.
 *
 * Pure functions that take an env object and return { errors, warnings }
 * arrays. Designed so check-env.cjs can call them with process.env AND so
 * jest tests can call them with synthetic envs without spawning a child.
 *
 * Hard rules enforced when env.NODE_ENV === "production":
 *   - REACT_APP_OPENAI_API_KEY must NOT be set (frontend keys leak via the
 *     bundled JS; the OpenAI proxy is server-only).
 *   - ARTIFACT_STORAGE_PROVIDER, when "s3", requires bucket + region + keys.
 *   - ARTIFACT_PACKAGE_RETENTION_DAYS, when set, must parse to a positive
 *     integer.
 *   - MAX_ACTIVE_JOBS_PER_USER / MAX_GLOBAL_ACTIVE_JOBS, when set, must
 *     parse to positive integers.
 *
 * Soft warnings (any env):
 *   - ARTIFACT_PACKAGE_SIGNING_SECRET unset → signed-URL downloads
 *     unavailable (panel falls back to direct route).
 *   - ADMIN_HEALTH_TOKEN unset in production → admin endpoint returns 503.
 *
 * Returns { errors: string[], warnings: string[] }. check-env.cjs prints
 * both and exits non-zero on any error.
 */

function isProduction(env) {
  return String(env.NODE_ENV || "").toLowerCase() === "production";
}

function isSet(env, name) {
  return Boolean(String(env[name] || "").trim());
}

function isPositiveInt(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && Math.floor(n) === n;
}

function checkProductionFrontendKey(env) {
  const errors = [];
  if (!isProduction(env)) return errors;
  if (isSet(env, "REACT_APP_OPENAI_API_KEY")) {
    errors.push(
      "REACT_APP_OPENAI_API_KEY MUST NOT be set in production. " +
        "Frontend OpenAI keys leak via the bundled JS — the OpenAI proxy " +
        "is server-only. Move the key to OPENAI_API_KEY (or " +
        "OPENAI_REASONING_API_KEY / OPENAI_IMAGES_API_KEY for split " +
        "credentials) and remove the REACT_APP_ variant.",
    );
  }
  return errors;
}

function checkStorageProviderConsistency(env) {
  const errors = [];
  const provider = String(env.ARTIFACT_STORAGE_PROVIDER || "").toLowerCase();
  if (!provider) return errors;
  if (provider === "memory" || provider === "filesystem") {
    if (provider === "filesystem" && !isSet(env, "ARTIFACT_STORAGE_DIR")) {
      errors.push(
        "ARTIFACT_STORAGE_PROVIDER=filesystem requires ARTIFACT_STORAGE_DIR " +
          "to point at a writable directory.",
      );
    }
    return errors;
  }
  if (provider === "s3") {
    const required = [
      "ARTIFACT_STORAGE_S3_BUCKET",
      "ARTIFACT_STORAGE_S3_REGION",
      "AWS_ACCESS_KEY_ID",
      "AWS_SECRET_ACCESS_KEY",
    ];
    const missing = required.filter((name) => !isSet(env, name));
    if (missing.length > 0) {
      errors.push(
        `ARTIFACT_STORAGE_PROVIDER=s3 requires ${missing.join(", ")}. ` +
          "Set all four to enable S3 storage; otherwise switch to " +
          "ARTIFACT_STORAGE_PROVIDER=memory or filesystem.",
      );
    }
    return errors;
  }
  errors.push(
    `ARTIFACT_STORAGE_PROVIDER="${provider}" is not recognised. ` +
      "Use memory, filesystem, or s3.",
  );
  return errors;
}

function checkRetentionEnv(env) {
  const errors = [];
  const candidates = [
    "ARTIFACT_PACKAGE_RETENTION_DAYS",
    "ARTIFACT_RETENTION_DAYS",
    "ARTIFACT_SIGNED_URL_TTL_SECONDS",
  ];
  for (const name of candidates) {
    if (!isSet(env, name)) continue;
    if (!isPositiveInt(env[name])) {
      errors.push(
        `${name}="${env[name]}" must be a positive integer (got non-integer or non-positive).`,
      );
    }
  }
  return errors;
}

function checkQueueAndConcurrencyEnv(env) {
  const errors = [];
  const candidates = [
    "GENERATION_WORKER_CONCURRENCY",
    "OPENAI_IMAGE_CONCURRENCY",
    "OPENAI_REASONING_CONCURRENCY",
    "MAX_ACTIVE_JOBS_PER_USER",
    "MAX_GLOBAL_ACTIVE_JOBS",
  ];
  for (const name of candidates) {
    if (!isSet(env, name)) continue;
    if (!isPositiveInt(env[name])) {
      errors.push(
        `${name}="${env[name]}" must be a positive integer (got non-integer or non-positive).`,
      );
    }
  }
  return errors;
}

function checkSoftWarnings(env) {
  const warnings = [];
  if (!isSet(env, "ARTIFACT_PACKAGE_SIGNING_SECRET")) {
    warnings.push(
      "ARTIFACT_PACKAGE_SIGNING_SECRET unset — signed-URL downloads " +
        "unavailable. The panel falls back to the direct download route " +
        "(works, but admin token is the only access gate).",
    );
  }
  if (isProduction(env) && !isSet(env, "ADMIN_HEALTH_TOKEN")) {
    warnings.push(
      "ADMIN_HEALTH_TOKEN unset in production — /api/admin/provider-health " +
        "returns 503 ADMIN_TOKEN_NOT_CONFIGURED. Set the token or accept " +
        "that admin health checks are unavailable in production.",
    );
  }
  return warnings;
}

function runProductionStrictChecks(env = process.env) {
  const errors = [
    ...checkProductionFrontendKey(env),
    ...checkStorageProviderConsistency(env),
    ...checkRetentionEnv(env),
    ...checkQueueAndConcurrencyEnv(env),
  ];
  const warnings = checkSoftWarnings(env);
  return { errors, warnings };
}

module.exports = {
  runProductionStrictChecks,
  // exported for unit tests:
  __internals: {
    checkProductionFrontendKey,
    checkStorageProviderConsistency,
    checkRetentionEnv,
    checkQueueAndConcurrencyEnv,
    checkSoftWarnings,
    isProduction,
    isPositiveInt,
  },
};
