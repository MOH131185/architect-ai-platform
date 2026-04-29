/**
 * Vercel Serverless Function - OpenAI Chat Proxy
 * Handles OpenAI API requests securely from the frontend
 */

import { setCorsHeaders, handlePreflight } from "./_shared/cors.js";
import openaiEnv from "../server/utils/openaiEnv.cjs";

const { resolveOpenAIReasoningApiKeyInfo, buildOpenAIRequestHeaders } =
  openaiEnv;

export default async function handler(req, res) {
  // CORS
  if (
    handlePreflight(req, res, {
      methods: "GET, OPTIONS, PATCH, DELETE, POST, PUT",
    })
  )
    return;
  setCorsHeaders(req, res, {
    methods: "GET, OPTIONS, PATCH, DELETE, POST, PUT",
  });
  res.setHeader("Access-Control-Allow-Credentials", "true");

  // Only allow POST requests
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Keep serverless env resolution aligned with server.cjs.
    const keyInfo = resolveOpenAIReasoningApiKeyInfo(process.env);

    if (!keyInfo.hasKey) {
      console.error("OpenAI API key not found in environment variables");
      return res.status(500).json({
        error: "OpenAI API key not configured",
        details:
          "Please set OPENAI_REASONING_API_KEY or OPENAI_API_KEY in Vercel environment variables",
        warning: keyInfo.warning,
      });
    }

    console.log(
      `[OpenAI] START chat route=/api/openai-chat model=${req.body?.model || "request-default"} keySource=${keyInfo.keySource}`,
    );
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: buildOpenAIRequestHeaders(keyInfo, process.env, { json: true }),
      body: JSON.stringify(req.body),
    });

    const requestId =
      response.headers?.get?.("x-request-id") ||
      response.headers?.get?.("openai-request-id") ||
      null;
    const data = await response.json();

    if (!response.ok) {
      console.warn(
        `[OpenAI] FAIL chat route=/api/openai-chat status=${response.status} requestId=${requestId || "none"}`,
      );
      return res.status(response.status).json(data);
    }

    console.log(
      `[OpenAI] OK chat route=/api/openai-chat requestId=${requestId || "none"} usage=${JSON.stringify(data.usage || {})}`,
    );
    data.requestId = data.requestId || requestId;
    data.keySource = keyInfo.keySource;
    res.status(200).json(data);
  } catch (error) {
    console.error("OpenAI proxy error:", error);
    res.status(500).json({ error: error.message });
  }
}
