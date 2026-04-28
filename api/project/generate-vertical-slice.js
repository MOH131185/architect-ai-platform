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

export default async function handler(req, res) {
  if (handlePreflight(req, res, { methods: "POST, OPTIONS" })) return;
  setCorsHeaders(req, res, { methods: "POST, OPTIONS" });

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const result = await buildArchitectureProjectVerticalSlice(req.body || {});
    return res.status(result.success ? 200 : 422).json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || "ProjectGraph vertical slice generation failed",
    });
  }
}
