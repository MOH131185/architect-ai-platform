import path from "path";
import openaiEnv from "../../src/services/openaiProviderEnv.cjs";

async function loadDotenvIfAvailable() {
  try {
    const dotenv = await import("dotenv");
    dotenv.config({ path: path.resolve(process.cwd(), ".env"), quiet: true });
  } catch {
    // dotenv is optional for this smoke script; process.env may already be set.
  }
}

function jsonOut(payload) {
  console.log(JSON.stringify(payload, null, 2));
}

function resolveModel() {
  return (
    openaiEnv.readEnv(process.env, "OPENAI_SMOKE_MODEL") ||
    openaiEnv.readEnv(process.env, "OPENAI_FAST_MODEL") ||
    openaiEnv.readEnv(process.env, "OPENAI_REASONING_MODEL") ||
    "gpt-5.4-mini"
  );
}

async function main() {
  await loadDotenvIfAvailable();

  if (typeof fetch === "undefined") {
    const nodeFetch = await import("node-fetch");
    global.fetch = nodeFetch.default;
  }

  const keyInfo = openaiEnv.resolveOpenAIReasoningApiKeyInfo(process.env);
  const diagnostics = openaiEnv.getOpenAIOrgProjectDiagnostics(process.env);
  const model = resolveModel();
  const baseUrl =
    openaiEnv.readEnv(process.env, "OPENAI_BASE_URL") ||
    "https://api.openai.com/v1";

  if (!keyInfo.hasKey) {
    jsonOut({
      success: false,
      provider: "openai",
      model,
      error: "OPENAI_API_KEY_MISSING",
      message:
        "Set OPENAI_API_KEY or OPENAI_REASONING_API_KEY before running this smoke test.",
      keySource: null,
      ...diagnostics,
      warning: keyInfo.warning,
    });
    process.exit(1);
  }

  const body = {
    model,
    messages: [
      {
        role: "user",
        content: "Reply with the single word: ok",
      },
    ],
    max_completion_tokens: 8,
  };

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: openaiEnv.buildOpenAIRequestHeaders(keyInfo, process.env, {
        json: true,
      }),
      body: JSON.stringify(body),
    });
    const requestId =
      response.headers?.get?.("x-request-id") ||
      response.headers?.get?.("openai-request-id") ||
      null;
    const data = await response.json().catch(async () => ({
      raw: await response.text().catch(() => ""),
    }));

    if (!response.ok) {
      jsonOut({
        success: false,
        provider: "openai",
        model,
        requestId,
        status: response.status,
        error: data?.error?.code || "OPENAI_SMOKE_REQUEST_FAILED",
        message: data?.error?.message || `OpenAI request failed: ${response.status}`,
        keySource: keyInfo.keySource,
        keyLast4: keyInfo.keyLast4,
        ...diagnostics,
      });
      process.exit(1);
    }

    jsonOut({
      success: true,
      provider: "openai",
      model: data.model || model,
      requestId,
      usage: data.usage || null,
      keySource: keyInfo.keySource,
      keyLast4: keyInfo.keyLast4,
      ...diagnostics,
    });
  } catch (error) {
    jsonOut({
      success: false,
      provider: "openai",
      model,
      error: "OPENAI_SMOKE_NETWORK_ERROR",
      message: error?.message || String(error),
      keySource: keyInfo.keySource,
      keyLast4: keyInfo.keyLast4,
      ...diagnostics,
    });
    process.exit(1);
  }
}

main();
