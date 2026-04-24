import { setCorsHeaders, handlePreflight } from "../_shared/cors.js";
import { buildProjectPipelineV2Bundle } from "../../src/services/project/projectPipelineV2Service.js";

export default async function handler(req, res) {
  if (handlePreflight(req, res, { methods: "POST, OPTIONS" })) return;
  setCorsHeaders(req, res, { methods: "POST, OPTIONS" });

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const bundle = await buildProjectPipelineV2Bundle(req.body || {});
    return res.status(bundle?.supported === false ? 422 : 200).json({
      success: Boolean(bundle?.supported),
      pipelineVersion: bundle?.pipelineVersion || null,
      geometryHash: bundle?.compiledProject?.geometryHash || null,
      confidence: bundle?.confidence || null,
      validation: bundle?.validation || null,
      authorityReadiness: bundle?.authorityReadiness || null,
      deliveryStages: bundle?.deliveryStages || null,
      exportManifest: bundle?.exportManifest || null,
      reviewSurface: bundle?.reviewSurface || null,
      blockers: bundle?.blockers || [],
      bundle,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || "Project compilation failed",
    });
  }
}
