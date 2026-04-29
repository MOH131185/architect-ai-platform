import openaiEnv from "./openaiProviderEnv.cjs";

export const PROJECT_GRAPH_REASONING_STEP_IDS = [
  "BRIEF",
  "SITE",
  "CLIMATE",
  "REGS",
  "PROGRAMME",
  "PROJECT_GRAPH",
  "A1_SHEET",
  "QA",
];

const REASONING_STEP_SET = new Set(PROJECT_GRAPH_REASONING_STEP_IDS);
const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MAX_COMPLETION_TOKENS = 160;

function readEnv(env = {}, name) {
  return openaiEnv.readEnv(env, name);
}

function normalizeExecutionMode(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (!normalized) return null;
  if (
    ["1", "true", "on", "required", "live", "openai", "mock"].includes(
      normalized,
    )
  ) {
    return "required";
  }
  if (
    ["0", "false", "off", "disabled", "skip", "deterministic"].includes(
      normalized,
    )
  ) {
    return "disabled";
  }
  return null;
}

function isTestRuntime(env = {}) {
  return (
    readEnv(env, "NODE_ENV") === "test" ||
    Boolean(readEnv(env, "JEST_WORKER_ID"))
  );
}

export function resolveOpenAIReasoningExecutionConfig({
  env = process.env,
  execution = {},
} = {}) {
  const testRuntime = isTestRuntime(env);
  const explicitExecutionMode = normalizeExecutionMode(execution.mode);
  const explicitEnvMode = testRuntime
    ? null
    : normalizeExecutionMode(
        readEnv(env, "PROJECT_GRAPH_OPENAI_REASONING_MODE"),
      ) ||
      normalizeExecutionMode(
        readEnv(env, "PROJECT_GRAPH_OPENAI_EXECUTION_MODE"),
      );
  const explicitMode = explicitExecutionMode || explicitEnvMode;
  const mode = explicitMode || (testRuntime ? "disabled" : "required");
  const productionDisabled =
    readEnv(env, "NODE_ENV") === "production" && mode === "disabled";
  return {
    mode,
    explicitMode: Boolean(explicitMode),
    required: mode === "required" || productionDisabled,
    productionDisabled,
    skipReason: testRuntime
      ? "test_runtime_provider_mock_not_supplied"
      : "project_graph_openai_reasoning_disabled",
  };
}

function compactString(value, maxLength = 600) {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function safeJson(value, maxLength = 5000) {
  try {
    const json = JSON.stringify(value, (_key, entry) => {
      if (typeof entry === "string") return compactString(entry, 900);
      return entry;
    });
    return json.length > maxLength ? `${json.slice(0, maxLength)}...` : json;
  } catch {
    return "{}";
  }
}

function baseCall(route, overrides = {}) {
  return {
    stepId: route.stepId,
    provider: route.provider,
    model: route.model,
    apiKeyEnv: route.apiKeyEnv,
    keySource: null,
    providerUsed: "deterministic",
    reasoningProviderUsed: "deterministic",
    imageProviderUsed: null,
    status: "skipped",
    openaiUsed: false,
    deterministicFallback: false,
    deterministicReason: null,
    fallbackReason: null,
    requestId: null,
    usage: null,
    errorCode: null,
    httpStatus: null,
    secretsRedacted: true,
    ...overrides,
  };
}

function skippedCall(route, reason, details = {}) {
  return baseCall(route, {
    status: "skipped",
    providerUsed: "deterministic",
    reasoningProviderUsed: "deterministic",
    deterministicFallback: true,
    deterministicReason: reason,
    fallbackReason: reason,
    ...details,
  });
}

function blockedCall(route, reason, errorCode, details = {}) {
  return baseCall(route, {
    status: "blocked",
    providerUsed: "none",
    reasoningProviderUsed: "blocked",
    deterministicFallback: false,
    fallbackReason: reason,
    errorCode,
    ...details,
  });
}

function okCall(route, keyInfo, details = {}) {
  return baseCall(route, {
    status: "ok",
    providerUsed: "openai",
    reasoningProviderUsed: "openai",
    openaiUsed: true,
    deterministicFallback: false,
    deterministicReason: null,
    fallbackReason: null,
    keySource: keyInfo.keySource,
    ...details,
  });
}

function normalizeContent(content) {
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        typeof part === "string"
          ? part
          : part?.text || part?.content || part?.value || "",
      )
      .join(" ")
      .trim();
  }
  return "";
}

function stepPayload(stepId, context = {}) {
  const {
    brief = {},
    site = {},
    climate = {},
    regulations = {},
    programme = {},
    compiledProject = {},
    projectGraphId = null,
    geometryHash = null,
    programmeSummary = null,
    splitDecision = null,
    primarySheet = null,
    pdfArtifact = null,
    technicalBuild = null,
    visualFidelityStatus = null,
  } = context;
  const base = {
    projectGraphId,
    geometryHash,
    projectName: brief.project_name || null,
    buildingType: brief.building_type || null,
    targetGiaM2: brief.target_gia_m2 || null,
    targetStoreys: brief.target_storeys || null,
  };

  if (stepId === "BRIEF") {
    return {
      ...base,
      clientGoals: brief.client_goals || [],
      siteInput: brief.site_input || {},
      sustainabilityAmbition: brief.sustainability_ambition || null,
    };
  }
  if (stepId === "SITE") {
    return {
      ...base,
      site: {
        postcode: site.postcode || brief.site_input?.postcode || null,
        lat: site.lat ?? brief.site_input?.lat ?? null,
        lon: site.lon ?? brief.site_input?.lon ?? null,
        region: site.region || site.locationProfile?.region || null,
        areaM2: site.area_m2 || site.areaM2 || null,
      },
    };
  }
  if (stepId === "CLIMATE") {
    return {
      ...base,
      climate: {
        zone: climate.zone || climate.koppen || null,
        weatherSource: climate.weather_source || null,
        wind: climate.wind || null,
        sunPath: climate.sun_path || climate.sunPath || null,
        designRecommendations:
          climate.design_recommendations || climate.recommendations || null,
      },
    };
  }
  if (stepId === "REGS") {
    return {
      ...base,
      regulations: {
        jurisdiction: regulations.jurisdiction || null,
        applicableParts:
          regulations.applicable_parts || regulations.parts || [],
        ruleSummary: regulations.rule_summary || regulations.summary || null,
      },
    };
  }
  if (stepId === "PROGRAMME") {
    return {
      ...base,
      programme: {
        spaceCount: programme.spaces?.length || 0,
        grossInternalAreaM2:
          programme.area_summary?.gross_internal_area_m2 || null,
        levels: programmeSummary?.levels || programmeSummary || null,
      },
    };
  }
  if (stepId === "PROJECT_GRAPH") {
    return {
      ...base,
      compiledProject: {
        schemaVersion: compiledProject.schema_version || null,
        levelCount: compiledProject.levels?.length || 0,
        roomCount: compiledProject.rooms?.length || 0,
        wallCount: compiledProject.walls?.length || 0,
        openingCount: compiledProject.openings?.length || 0,
      },
    };
  }
  if (stepId === "A1_SHEET") {
    return {
      ...base,
      sheet: {
        splitReason: splitDecision?.reason || null,
        sheetCount: splitDecision?.sheets?.length || 0,
        layoutVersion: primarySheet?.layoutVersion || null,
        visualFidelityStatus,
        textRenderStatus: primarySheet?.textRenderStatus || null,
        pdfRenderPassed: pdfArtifact?.renderedProof?.passed ?? null,
      },
    };
  }
  if (stepId === "QA") {
    return {
      ...base,
      qaInputs: {
        technicalBuildOk: technicalBuild?.ok ?? null,
        technicalFailures: technicalBuild?.failures || [],
        pdfRenderPassed: pdfArtifact?.renderedProof?.passed ?? null,
        requiredMissingPanelCount:
          pdfArtifact?.renderedProof?.requiredMissingPanelCount ?? null,
      },
    };
  }
  return base;
}

function buildMessages(route, context) {
  const payload = stepPayload(route.stepId, context);
  return [
    {
      role: "system",
      content:
        "You are the OpenAI reasoning checkpoint for the ProjectGraph architecture pipeline. Do not create or alter 2D or 3D geometry. Verify only semantic consistency, labels, narrative intent, and QA readiness. Return concise JSON.",
    },
    {
      role: "user",
      content: `Checkpoint ${route.stepId}: review this ProjectGraph summary and return JSON with status, stepId, and notes. Summary: ${safeJson(payload)}`,
    },
  ];
}

async function postOpenAIChatCompletion({
  route,
  keyInfo,
  env,
  fetchImpl,
  context,
}) {
  const baseUrl = readEnv(env, "OPENAI_BASE_URL") || DEFAULT_OPENAI_BASE_URL;
  const maxTokens =
    Number.parseInt(readEnv(env, "PROJECT_GRAPH_OPENAI_MAX_TOKENS"), 10) ||
    DEFAULT_MAX_COMPLETION_TOKENS;
  const response = await fetchImpl(
    `${baseUrl.replace(/\/$/, "")}/chat/completions`,
    {
      method: "POST",
      headers: openaiEnv.buildOpenAIRequestHeaders(keyInfo, env, {
        json: true,
      }),
      body: JSON.stringify({
        model: route.model,
        messages: buildMessages(route, context),
        max_completion_tokens: maxTokens,
      }),
    },
  );
  const requestId =
    response.headers?.get?.("x-request-id") ||
    response.headers?.get?.("openai-request-id") ||
    null;
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    return blockedCall(
      route,
      "openai_error",
      data?.error?.code || "OPENAI_REASONING_REQUEST_FAILED",
      {
        httpStatus: response.status,
        requestId,
        usage: data?.usage || null,
        keySource: keyInfo.keySource,
        errorMessage: compactString(
          data?.error?.message || `OpenAI request failed: ${response.status}`,
        ),
      },
    );
  }

  const content = normalizeContent(data?.choices?.[0]?.message?.content);
  if (!content) {
    return blockedCall(
      route,
      "invalid_response",
      "OPENAI_REASONING_INVALID_RESPONSE",
      {
        httpStatus: response.status,
        requestId,
        usage: data?.usage || null,
        keySource: keyInfo.keySource,
      },
    );
  }

  return okCall(route, keyInfo, {
    requestId,
    usage: data?.usage || null,
  });
}

export async function executeProjectGraphReasoningSteps({
  modelRoutes = [],
  context = {},
  execution = {},
  env = process.env,
} = {}) {
  const config = resolveOpenAIReasoningExecutionConfig({ env, execution });
  const keyInfo = openaiEnv.resolveOpenAIReasoningApiKeyInfo(env);
  const fetchImpl = execution.fetchImpl || execution.fetch || global.fetch;
  const calls = [];

  for (const route of modelRoutes) {
    if (!REASONING_STEP_SET.has(route.stepId)) {
      calls.push(
        skippedCall(route, "project_graph_compiled_geometry_authority", {
          deterministicGeometry: route.deterministicGeometry === true,
        }),
      );
      continue;
    }

    if (config.productionDisabled) {
      calls.push(
        blockedCall(
          route,
          "disabled_not_allowed_production",
          "OPENAI_REASONING_DISABLED_IN_PRODUCTION",
        ),
      );
      continue;
    }

    if (config.mode === "disabled") {
      calls.push(
        skippedCall(route, config.skipReason, {
          executionMode: config.mode,
        }),
      );
      continue;
    }

    if (route.provider !== "openai") {
      calls.push(
        blockedCall(
          route,
          "unsupported_provider",
          "OPENAI_REASONING_UNSUPPORTED_PROVIDER",
        ),
      );
      continue;
    }

    if (!keyInfo.hasKey) {
      calls.push(
        blockedCall(
          route,
          "missing_api_key",
          "OPENAI_REASONING_API_KEY_MISSING",
          {
            warning: keyInfo.warning,
          },
        ),
      );
      continue;
    }

    if (typeof fetchImpl !== "function") {
      calls.push(
        blockedCall(
          route,
          "fetch_unavailable",
          "OPENAI_REASONING_FETCH_UNAVAILABLE",
          {
            keySource: keyInfo.keySource,
          },
        ),
      );
      continue;
    }

    try {
      calls.push(
        await postOpenAIChatCompletion({
          route,
          keyInfo,
          env,
          fetchImpl,
          context,
        }),
      );
    } catch (error) {
      calls.push(
        blockedCall(route, "network_error", "OPENAI_REASONING_NETWORK_ERROR", {
          keySource: keyInfo.keySource,
          errorMessage: compactString(error?.message || String(error)),
        }),
      );
    }
  }

  return calls;
}

export function getBlockedOpenAIReasoningCalls(providerCalls = []) {
  return providerCalls.filter(
    (call) =>
      PROJECT_GRAPH_REASONING_STEP_IDS.includes(call.stepId) &&
      call.status === "blocked",
  );
}
