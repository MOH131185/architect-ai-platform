/**
 * OpenAI Reasoning Service
 *
 * Thin client-side wrapper around the server-side `/api/openai-reasoning`
 * proxy (server.cjs:892 / Vercel serverless). The proxy holds
 * `OPENAI_REASONING_API_KEY` so no key is ever required in the browser.
 *
 * API surface mirrors `togetherAIReasoningService.chatCompletion(messages, options)`
 * so callers in the wizard's program-spaces compile path can be swapped in place.
 */

import logger from "../utils/logger.js";

const PRIMARY_ENDPOINT = "/api/openai-reasoning";

const PROXY_BASE =
  process.env.REACT_APP_API_PROXY_URL ||
  (process.env.NODE_ENV === "production" ? "" : "http://localhost:3001");

function buildEndpoints() {
  return Array.from(
    new Set(
      [
        PRIMARY_ENDPOINT,
        `${PROXY_BASE}${PRIMARY_ENDPOINT}`.replace(/^\/+/, "/"),
      ].filter(Boolean),
    ),
  );
}

class OpenAIReasoningService {
  constructor() {
    logger.info("🧠 OpenAI Reasoning Service initialized");
    this.endpoints = buildEndpoints();
  }

  async chatCompletion(messages, options = {}) {
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error("OpenAI Reasoning: messages array is required");
    }

    const requestBody = {
      messages,
      max_tokens: options.max_tokens ?? 900,
      temperature: options.temperature ?? 0.3,
      task_type: options.task_type || "reasoning",
    };
    if (options.model) requestBody.model = options.model;
    if (options.response_format) {
      requestBody.response_format = options.response_format;
    }

    logger.info("🧠 [OpenAI Reasoning] Chat completion:", {
      messages: messages.length,
      task_type: requestBody.task_type,
      max_tokens: requestBody.max_tokens,
      temperature: requestBody.temperature,
    });

    let lastError = null;
    for (let i = 0; i < this.endpoints.length; i += 1) {
      const endpoint = this.endpoints[i];
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const detail =
            errorData?.details ||
            errorData?.error ||
            response.statusText ||
            "unknown error";
          const fallbackable =
            response.status === 404 || response.status === 502;
          const err = new Error(
            `OpenAI Reasoning error: ${response.status} - ${
              typeof detail === "string" ? detail : JSON.stringify(detail)
            }`,
          );
          err.status = response.status;
          err.requestId = errorData?.requestId || null;
          if (fallbackable && i < this.endpoints.length - 1) {
            logger.warn(
              `⚠️ [OpenAI Reasoning] Endpoint ${endpoint} unavailable (${response.status}) — trying fallback`,
            );
            lastError = err;
            continue;
          }
          throw err;
        }

        const result = await response.json();
        logger.info(
          `✅ [OpenAI Reasoning] Chat completion successful via ${endpoint}`,
        );
        return result;
      } catch (error) {
        const isNetworkError =
          error instanceof TypeError ||
          /fetch|network|ECONNREFUSED/i.test(error?.message || "");
        if (isNetworkError && i < this.endpoints.length - 1) {
          logger.warn(
            `⚠️ [OpenAI Reasoning] Endpoint ${endpoint} unreachable (${error?.message || "network error"}) — trying fallback`,
          );
          lastError = error;
          continue;
        }
        logger.error("❌ [OpenAI Reasoning] Chat completion error:", error);
        throw error;
      }
    }

    throw (
      lastError ||
      new Error("OpenAI Reasoning: all endpoints failed without a response")
    );
  }
}

const openaiReasoningService = new OpenAIReasoningService();

export { OpenAIReasoningService, openaiReasoningService };
export default openaiReasoningService;
