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

export default async function handler(req, res) {
  // CORS
  if (handlePreflight(req, res, { methods: "GET, OPTIONS" })) return;
  setCorsHeaders(req, res, { methods: "GET, OPTIONS" });
  res.setHeader(GENARCH_VERSION_HEADER, GENARCH_CONTRACT_VERSION);

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const health = {
    status: "ok",
    timestamp: new Date().toISOString(),
    services: {
      openai:
        !!process.env.OPENAI_API_KEY || !!process.env.OPENAI_REASONING_API_KEY,
      openaiImages:
        !!process.env.OPENAI_IMAGES_API_KEY || !!process.env.OPENAI_API_KEY,
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
    },
  };

  return res.status(200).json(health);
}
