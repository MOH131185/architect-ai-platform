const REACT_APP_SERVER_FALLBACK_FLAG = "OPENAI_ALLOW_REACT_APP_SERVER_KEY";

function readEnv(env = {}, name) {
  const value = env?.[name];
  return typeof value === "string" ? value.trim() : "";
}

function isTruthy(value) {
  return ["1", "true", "yes", "on"].includes(
    String(value || "").trim().toLowerCase(),
  );
}

function keyLast4(value) {
  const clean = String(value || "").trim();
  return clean.length >= 4 ? clean.slice(-4) : "";
}

function isReactAppServerFallbackAllowed(env = {}, options = {}) {
  const nodeEnv = readEnv(env, "NODE_ENV").toLowerCase();
  if (nodeEnv === "production") return false;
  return (
    options.allowReactAppFallback === true ||
    isTruthy(readEnv(env, REACT_APP_SERVER_FALLBACK_FLAG))
  );
}

function resolveApiKeyInfo(env = {}, sources = [], options = {}) {
  for (const source of sources) {
    const value = readEnv(env, source);
    if (value) {
      return {
        apiKey: value,
        hasKey: true,
        keySource: source,
        keyLast4: keyLast4(value),
        usedReactAppServerFallback: false,
        warning: null,
      };
    }
  }

  const reactAppValue = readEnv(env, "REACT_APP_OPENAI_API_KEY");
  if (reactAppValue && isReactAppServerFallbackAllowed(env, options)) {
    return {
      apiKey: reactAppValue,
      hasKey: true,
      keySource: "REACT_APP_OPENAI_API_KEY",
      keyLast4: keyLast4(reactAppValue),
      usedReactAppServerFallback: true,
      warning:
        "Using REACT_APP_OPENAI_API_KEY server-side because OPENAI_ALLOW_REACT_APP_SERVER_KEY is enabled outside production.",
    };
  }

  return {
    apiKey: "",
    hasKey: false,
    keySource: null,
    keyLast4: "",
    usedReactAppServerFallback: false,
    warning: reactAppValue
      ? "REACT_APP_OPENAI_API_KEY is ignored for server-side OpenAI calls unless OPENAI_ALLOW_REACT_APP_SERVER_KEY=true outside production."
      : null,
  };
}

function resolveOpenAIReasoningApiKeyInfo(env = process.env, options = {}) {
  return resolveApiKeyInfo(
    env,
    ["OPENAI_REASONING_API_KEY", "OPENAI_API_KEY"],
    options,
  );
}

function resolveOpenAIImageApiKeyInfo(env = process.env, options = {}) {
  return resolveApiKeyInfo(
    env,
    ["OPENAI_IMAGES_API_KEY", "OPENAI_API_KEY", "OPENAI_REASONING_API_KEY"],
    options,
  );
}

function resolveOpenAIReasoningApiKey(env = process.env, options = {}) {
  return resolveOpenAIReasoningApiKeyInfo(env, options).apiKey;
}

function resolveOpenAIImageApiKey(env = process.env, options = {}) {
  return resolveOpenAIImageApiKeyInfo(env, options).apiKey;
}

function getOpenAIOrgProjectDiagnostics(env = process.env) {
  return {
    orgConfigured: Boolean(readEnv(env, "OPENAI_ORG_ID")),
    projectConfigured: Boolean(readEnv(env, "OPENAI_PROJECT_ID")),
  };
}

function buildOpenAIRequestHeaders(
  apiKeyOrInfo,
  env = process.env,
  { json = false } = {},
) {
  const apiKey =
    typeof apiKeyOrInfo === "string"
      ? apiKeyOrInfo
      : apiKeyOrInfo?.apiKey || "";
  const headers = {
    Authorization: `Bearer ${apiKey}`,
  };
  if (json) {
    headers["Content-Type"] = "application/json";
  }
  const orgId = readEnv(env, "OPENAI_ORG_ID");
  const projectId = readEnv(env, "OPENAI_PROJECT_ID");
  if (orgId) headers["OpenAI-Organization"] = orgId;
  if (projectId) headers["OpenAI-Project"] = projectId;
  return headers;
}

function getOpenAIProviderDiagnostics(env = process.env, options = {}) {
  const reasoning = resolveOpenAIReasoningApiKeyInfo(env, options);
  const images = resolveOpenAIImageApiKeyInfo(env, options);
  const orgProject = getOpenAIOrgProjectDiagnostics(env);
  return {
    openaiConfigured: reasoning.hasKey || images.hasKey,
    reasoning: {
      configured: reasoning.hasKey,
      keySource: reasoning.keySource,
      keyLast4: reasoning.keyLast4,
      usedReactAppServerFallback: reasoning.usedReactAppServerFallback,
      warning: reasoning.warning,
    },
    images: {
      configured: images.hasKey,
      keySource: images.keySource,
      keyLast4: images.keyLast4,
      usedReactAppServerFallback: images.usedReactAppServerFallback,
      warning: images.warning,
    },
    ...orgProject,
    imageGenerationEnabled: isTruthy(readEnv(env, "PROJECT_GRAPH_IMAGE_GEN_ENABLED")),
    strictImageGeneration: isTruthy(readEnv(env, "OPENAI_STRICT_IMAGE_GEN")),
  };
}

module.exports = {
  REACT_APP_SERVER_FALLBACK_FLAG,
  readEnv,
  isTruthy,
  keyLast4,
  isReactAppServerFallbackAllowed,
  resolveOpenAIReasoningApiKeyInfo,
  resolveOpenAIImageApiKeyInfo,
  resolveOpenAIReasoningApiKey,
  resolveOpenAIImageApiKey,
  getOpenAIOrgProjectDiagnostics,
  getOpenAIProviderDiagnostics,
  buildOpenAIRequestHeaders,
};
