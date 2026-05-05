import path from "path";
import sharp from "sharp";
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

function fail(payload) {
  jsonOut({ success: false, ...payload });
  process.exitCode = 1;
}

function resolveImageApiKeyInfo(env = process.env) {
  const sources = ["OPENAI_IMAGES_API_KEY", "OPENAI_API_KEY"];
  for (const source of sources) {
    const apiKey = openaiEnv.readEnv(env, source);
    if (apiKey) {
      return {
        apiKey,
        hasKey: true,
        keySource: source,
        keyLast4: openaiEnv.keyLast4(apiKey),
      };
    }
  }
  return {
    apiKey: "",
    hasKey: false,
    keySource: null,
    keyLast4: "",
  };
}

function resolveImageModel(env = process.env) {
  return (
    openaiEnv.readEnv(env, "STEP_10_IMAGE_MODEL") ||
    openaiEnv.readEnv(env, "OPENAI_IMAGE_MODEL") ||
    "gpt-image-2"
  ).trim();
}

function providerMessageFrom(data, rawText, status) {
  return (
    data?.error?.message ||
    data?.message ||
    rawText ||
    `OpenAI images edit access check failed: ${status}`
  );
}

function providerCodeFrom(data, status) {
  return data?.error?.code || data?.error?.type || `HTTP_${status}`;
}

function isAccessDenied({ status, message = "", code = "" }) {
  const combined = `${code} ${message}`.toLowerCase();
  return (
    status === 401 ||
    status === 403 ||
    combined.includes("model") ||
    combined.includes("not verified") ||
    combined.includes("organization must be verified") ||
    combined.includes("not have access") ||
    combined.includes("does not have access") ||
    combined.includes("permission") ||
    combined.includes("unauthorized")
  );
}

async function buildTinyReferencePng() {
  return sharp({
    create: {
      width: 32,
      height: 32,
      channels: 4,
      background: { r: 245, g: 248, b: 252, alpha: 1 },
    },
  })
    .composite([
      {
        input: Buffer.from(
          '<svg width="32" height="32" xmlns="http://www.w3.org/2000/svg"><rect x="8" y="8" width="16" height="16" fill="#2563eb"/></svg>',
        ),
      },
    ])
    .png()
    .toBuffer();
}

async function buildImageEditForm({ model }) {
  if (typeof FormData === "undefined" || typeof Blob === "undefined") {
    throw new Error(
      "FormData/Blob unavailable in this runtime; use Node 18+ for the image edit access preflight.",
    );
  }

  const referencePng = await buildTinyReferencePng();
  const form = new FormData();
  form.set("model", model);
  form.set(
    "prompt",
    "Recreate this simple blue square test image on a plain light background.",
  );
  form.set("size", "1024x1024");
  form.set("n", "1");
  form.set(
    "image",
    new Blob([referencePng], { type: "image/png" }),
    "openai-image-edit-access-preflight.png",
  );
  return form;
}

async function main() {
  await loadDotenvIfAvailable();

  if (typeof fetch === "undefined") {
    const nodeFetch = await import("node-fetch");
    global.fetch = nodeFetch.default;
  }

  const keyInfo = resolveImageApiKeyInfo(process.env);
  const diagnostics = openaiEnv.getOpenAIOrgProjectDiagnostics(process.env);
  const model = resolveImageModel(process.env);
  const baseUrl =
    openaiEnv.readEnv(process.env, "OPENAI_BASE_URL") ||
    "https://api.openai.com/v1";

  const basePayload = {
    provider: "openai",
    endpoint: "/v1/images/edits",
    configuredModel: model,
    keySource: keyInfo.keySource,
    keyLast4: keyInfo.keyLast4,
    projectGraphImageGenEnabled: openaiEnv.readEnv(
      process.env,
      "PROJECT_GRAPH_IMAGE_GEN_ENABLED",
    ),
    openaiStrictImageGen: openaiEnv.readEnv(
      process.env,
      "OPENAI_STRICT_IMAGE_GEN",
    ),
    ...diagnostics,
  };

  if (!keyInfo.hasKey) {
    fail({
      ...basePayload,
      error: "OPENAI_IMAGE_EDIT_API_KEY_MISSING",
      message:
        "Set OPENAI_IMAGES_API_KEY or OPENAI_API_KEY before running this image-edit access preflight.",
      suggestedFix:
        "Configure OPENAI_IMAGES_API_KEY with image-edit access, or provide OPENAI_API_KEY for the preflight.",
    });
    return;
  }

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/images/edits`, {
      method: "POST",
      headers: openaiEnv.buildOpenAIRequestHeaders(keyInfo, process.env),
      body: await buildImageEditForm({ model }),
    });
    const requestId =
      response.headers?.get?.("x-request-id") ||
      response.headers?.get?.("openai-request-id") ||
      null;
    const rawText = await response.text().catch(() => "");
    let data = null;
    try {
      data = rawText ? JSON.parse(rawText) : null;
    } catch {
      data = null;
    }

    if (!response.ok) {
      const message = providerMessageFrom(data, rawText, response.status);
      const error = providerCodeFrom(data, response.status);
      const accessDenied = isAccessDenied({
        status: response.status,
        message,
        code: error,
      });
      fail({
        ...basePayload,
        status: response.status,
        requestId,
        error,
        accessDenied,
        providerMessage: message,
        suggestedFix: accessDenied
          ? "Verify the OpenAI organization for this image model or choose an allowed image-edit model."
          : "Review the provider message and retry with a neutral reference image/prompt or an allowed image-edit model.",
      });
      return;
    }

    const imageEntry = Array.isArray(data?.data) ? data.data[0] : null;
    if (!imageEntry?.b64_json && !imageEntry?.url) {
      fail({
        ...basePayload,
        status: response.status,
        requestId,
        error: "OPENAI_IMAGE_EDIT_EMPTY_RESPONSE",
        providerMessage:
          "OpenAI images edit access check returned success status but no image payload.",
        suggestedFix:
          "Retry the preflight or choose a known image-edit capable model.",
      });
      return;
    }

    jsonOut({
      success: true,
      ...basePayload,
      status: response.status,
      requestId,
      imagePayloadReturned: true,
      imagePayloadKind: imageEntry.b64_json ? "b64_json" : "url",
      usage: data?.usage || null,
      message: "Configured OpenAI image-edit model is accessible.",
    });
  } catch (error) {
    fail({
      ...basePayload,
      error: "OPENAI_IMAGE_EDIT_PREFLIGHT_FAILED",
      message: error?.message || String(error),
      suggestedFix:
        "Verify network access, organization/model access, or choose an allowed image-edit model.",
    });
  }
}

main();
