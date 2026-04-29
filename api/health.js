/**
 * Health Check API Endpoint
 *
 * Returns the health status of the API and configured services.
 */

import { setCorsHeaders, handlePreflight } from "./_shared/cors.js";
import {
  GENARCH_CONTRACT_VERSION,
  GENARCH_VERSION_HEADER,
} from "../src/services/genarch/genarchContract.js";
import openaiEnv from "../server/utils/openaiEnv.cjs";

export default async function handler(req, res) {
  // CORS
  if (handlePreflight(req, res, { methods: "GET, OPTIONS" })) return;
  setCorsHeaders(req, res, { methods: "GET, OPTIONS" });
  res.setHeader(GENARCH_VERSION_HEADER, GENARCH_CONTRACT_VERSION);

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const openaiDiagnostics = openaiEnv.getOpenAIProviderDiagnostics(process.env);
  const health = {
    status: "ok",
    timestamp: new Date().toISOString(),
    services: {
      openai: openaiDiagnostics.openaiConfigured,
      openaiReasoning: openaiDiagnostics.reasoning.configured,
      openaiImages: openaiDiagnostics.images.configured,
      togetherLegacy: !!process.env.TOGETHER_API_KEY,
      genarch:
        !!process.env.RUNPOD_GENARCH_URL && !!process.env.GENARCH_API_KEY,
    },
    contracts: {
      genarchApi: GENARCH_CONTRACT_VERSION,
    },
    productSurface: {
      genarchApi: "backend-only",
      genarchFrontend: "supported-residential-review",
    },
    env: {
      RUNPOD_GENARCH_URL: process.env.RUNPOD_GENARCH_URL
        ? "configured"
        : "missing",
      GENARCH_API_KEY: process.env.GENARCH_API_KEY ? "configured" : "missing",
      OPENAI_REASONING_KEY_SOURCE:
        openaiDiagnostics.reasoning.keySource || "missing",
      OPENAI_IMAGES_KEY_SOURCE: openaiDiagnostics.images.keySource || "missing",
      PROJECT_GRAPH_IMAGE_GEN_ENABLED: openaiDiagnostics.imageGenerationEnabled
        ? "true"
        : "false",
      OPENAI_STRICT_IMAGE_GEN: openaiDiagnostics.strictImageGeneration
        ? "true"
        : "false",
      OPENAI_ORG_ID: openaiDiagnostics.orgConfigured ? "configured" : "missing",
      OPENAI_PROJECT_ID: openaiDiagnostics.projectConfigured
        ? "configured"
        : "missing",
    },
  };

  return res.status(200).json(health);
}
