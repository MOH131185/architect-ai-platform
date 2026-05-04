import { setCorsHeaders, handlePreflight } from "../_shared/cors.js";
import { buildArchitectureProjectVerticalSlice } from "../../src/services/project/projectGraphVerticalSliceService.js";

// Phase A close-out: 300 DPI A1 rasterisation + tofu QA + PDF embed needs
// substantially more than the previous 120s default. Vercel Pro allows up to
// 300s per function. Force Node runtime because Sharp/librsvg requires
// native modules that the Edge runtime cannot load.
export const runtime = "nodejs";
export const config = {
  runtime: "nodejs",
  maxDuration: 300,
};

// Step 02 / §6.2: tri-state policy for the UK context aggregator.
//   CONTEXT_PROVIDERS_ENABLED='true'  -> always enabled (this server runtime).
//   CONTEXT_PROVIDERS_ENABLED='false' -> always disabled.
//   unset                             -> enabled only on Vercel / production.
// Server-only by construction: this handler runs in a Node serverless function.
// The aggregator itself layers a browser guard for defence in depth.
export function shouldEnableContextProviders(env = process.env) {
  const flag =
    typeof env.CONTEXT_PROVIDERS_ENABLED === "string"
      ? env.CONTEXT_PROVIDERS_ENABLED.trim().toLowerCase()
      : "";
  if (flag === "true") return true;
  if (flag === "false") return false;
  return Boolean(env.VERCEL) || env.NODE_ENV === "production";
}

export default async function handler(req, res) {
  if (handlePreflight(req, res, { methods: "POST, OPTIONS" })) return;
  setCorsHeaders(req, res, { methods: "POST, OPTIONS" });

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = req.body || {};
    // Caller-provided contextProviders wins (lets integration tests pass an
    // explicit { useDefaultFetch: false } to keep the slice offline). Otherwise
    // inject a default per the tri-state env policy.
    const payload =
      body.contextProviders === undefined && shouldEnableContextProviders()
        ? { ...body, contextProviders: { useDefaultFetch: true } }
        : body;
    const result = await buildArchitectureProjectVerticalSlice(payload);
    return res.status(result.success ? 200 : 422).json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || "ProjectGraph vertical slice generation failed",
    });
  }
}
