/* global globalThis */
import { setCorsHeaders, handlePreflight } from "../_shared/cors.js";
import { buildProviderHealthSnapshot } from "../../src/services/health/providerHealthService.js";

const ADMIN_TOKEN_ENV = "ADMIN_HEALTH_TOKEN";

function resolveAdminAuth(req) {
  const token =
    req.headers?.["x-admin-token"] ||
    req.headers?.["X-Admin-Token"] ||
    req.query?.adminToken ||
    null;
  const expected = globalThis.process?.env?.[ADMIN_TOKEN_ENV] || null;
  if (!expected) {
    // Local-dev posture: if no admin token is configured, allow only when
    // not running production (mirrors the artifact stack's local-anonymous
    // tolerance). Production deployments MUST set ADMIN_HEALTH_TOKEN.
    if (globalThis.process?.env?.NODE_ENV === "production") {
      return {
        ok: false,
        status: 503,
        code: "ADMIN_TOKEN_NOT_CONFIGURED",
        message:
          "Admin endpoint requires ADMIN_HEALTH_TOKEN env var in production",
      };
    }
    return { ok: true, mode: "local_anonymous" };
  }
  if (!token || token !== expected) {
    return {
      ok: false,
      status: 401,
      code: "ADMIN_TOKEN_INVALID",
      message: "Invalid or missing X-Admin-Token header",
    };
  }
  return { ok: true, mode: "token_authenticated" };
}

export default async function handler(req, res) {
  if (handlePreflight(req, res, { methods: "GET, OPTIONS" })) return;
  setCorsHeaders(req, res, { methods: "GET, OPTIONS" });

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const auth = resolveAdminAuth(req);
  if (!auth.ok) {
    return res
      .status(auth.status)
      .json({ error: auth.message, code: auth.code });
  }

  try {
    const snapshot = await buildProviderHealthSnapshot();
    return res.status(200).json({
      ...snapshot,
      authMode: auth.mode,
    });
  } catch (err) {
    return res.status(500).json({
      error: err?.message || "Failed to build provider health snapshot",
      code: "PROVIDER_HEALTH_FAILED",
    });
  }
}

export const __adminProviderHealthInternals = {
  resolveAdminAuth,
  ADMIN_TOKEN_ENV,
};
