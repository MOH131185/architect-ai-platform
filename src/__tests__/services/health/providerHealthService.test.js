import {
  buildProviderHealthSnapshot,
  HEALTH_STATUS,
  __providerHealthInternals,
} from "../../../services/health/providerHealthService.js";

const {
  checkOpenAIKey,
  checkOpenAIImageEditAccess,
  checkArtifactStorageHealth,
  checkDwgConverter,
  checkIfcEngine,
  rollupOverall,
} = __providerHealthInternals;

function fakeFetch(scriptedResponses) {
  const calls = [];
  return {
    calls,
    fn: async (url, init) => {
      calls.push({ url, init });
      const next = scriptedResponses.shift() || {
        status: 500,
        headers: { get: () => null },
      };
      if (typeof next === "function") return next();
      return next;
    },
  };
}

function fakeAdapter(caps = {}) {
  return {
    adapterCapabilities: {
      adapter: "memory",
      persistent: false,
      signedUrls: false,
      delete: true,
      list: true,
      retention: true,
      ...caps,
    },
  };
}

describe("providerHealthService — checkOpenAIKey", () => {
  test("missing key returns missing_config and never calls fetch", async () => {
    const f = fakeFetch([]);
    const result = await checkOpenAIKey({ key: null, fetchImpl: f.fn });
    expect(result.status).toBe(HEALTH_STATUS.MISSING_CONFIG);
    expect(f.calls).toHaveLength(0);
  });

  test("200 returns ok with last4 of key + requestId", async () => {
    const f = fakeFetch([
      {
        status: 200,
        headers: { get: (h) => (h === "x-request-id" ? "req-123" : null) },
      },
    ]);
    const result = await checkOpenAIKey({
      key: "sk-test-abcdEFGH",
      fetchImpl: f.fn,
    });
    expect(result.status).toBe(HEALTH_STATUS.OK);
    expect(result.keyLast4).toBe("EFGH");
    expect(result.requestId).toBe("req-123");
    // Must NOT echo the full key
    expect(JSON.stringify(result)).not.toContain("sk-test-abcdEFGH");
  });

  test("401 / 403 → unavailable", async () => {
    const f = fakeFetch([{ status: 401, headers: { get: () => null } }]);
    const result = await checkOpenAIKey({ key: "sk-bad", fetchImpl: f.fn });
    expect(result.status).toBe(HEALTH_STATUS.UNAVAILABLE);
    expect(result.upstreamStatus).toBe(401);
  });

  test("5xx → degraded", async () => {
    const f = fakeFetch([{ status: 503, headers: { get: () => null } }]);
    const result = await checkOpenAIKey({ key: "sk-x", fetchImpl: f.fn });
    expect(result.status).toBe(HEALTH_STATUS.DEGRADED);
    expect(result.upstreamStatus).toBe(503);
  });

  test("network error → degraded", async () => {
    const f = fakeFetch([
      () => Promise.reject(new TypeError("Failed to fetch")),
    ]);
    const result = await checkOpenAIKey({ key: "sk-x", fetchImpl: f.fn });
    expect(result.status).toBe(HEALTH_STATUS.DEGRADED);
    expect(result.error.code).toBe("NETWORK_ERROR");
  });
});

describe("providerHealthService — checkOpenAIImageEditAccess", () => {
  test("missing model → missing_config", async () => {
    const f = fakeFetch([]);
    const result = await checkOpenAIImageEditAccess({
      key: "sk-x",
      model: null,
      fetchImpl: f.fn,
    });
    expect(result.status).toBe(HEALTH_STATUS.MISSING_CONFIG);
    expect(f.calls).toHaveLength(0);
  });

  test("404 → unavailable (model not accessible)", async () => {
    const f = fakeFetch([{ status: 404, headers: { get: () => null } }]);
    const result = await checkOpenAIImageEditAccess({
      key: "sk-x",
      model: "gpt-image-2",
      fetchImpl: f.fn,
    });
    expect(result.status).toBe(HEALTH_STATUS.UNAVAILABLE);
    expect(result.reason).toMatch(/not accessible/i);
    expect(result.model).toBe("gpt-image-2");
  });

  test("200 → ok with model + last4", async () => {
    const f = fakeFetch([{ status: 200, headers: { get: () => "req-img-1" } }]);
    const result = await checkOpenAIImageEditAccess({
      key: "sk-test-1234ZYXW",
      model: "gpt-image-2",
      fetchImpl: f.fn,
    });
    expect(result.status).toBe(HEALTH_STATUS.OK);
    expect(result.keyLast4).toBe("ZYXW");
    expect(result.model).toBe("gpt-image-2");
    expect(JSON.stringify(result)).not.toContain("sk-test-1234ZYXW");
  });
});

describe("providerHealthService — checkArtifactStorageHealth", () => {
  test("no adapter → missing_config", () => {
    const result = checkArtifactStorageHealth({ adapter: null });
    expect(result.status).toBe(HEALTH_STATUS.MISSING_CONFIG);
  });

  test("memory adapter without signed-url secret → degraded", () => {
    const result = checkArtifactStorageHealth({
      adapter: fakeAdapter({ signedUrls: false }),
    });
    expect(result.status).toBe(HEALTH_STATUS.DEGRADED);
    expect(result.reason).toMatch(/signed URLs/i);
  });

  test("adapter with signed-url support → ok", () => {
    const result = checkArtifactStorageHealth({
      adapter: fakeAdapter({
        signedUrls: true,
        persistent: true,
        adapter: "s3",
      }),
    });
    expect(result.status).toBe(HEALTH_STATUS.OK);
    expect(result.adapter).toBe("s3");
    expect(result.persistent).toBe(true);
  });
});

describe("providerHealthService — DWG / IFC", () => {
  test("DWG: no env → missing_config", () => {
    expect(checkDwgConverter({ env: {} }).status).toBe(
      HEALTH_STATUS.MISSING_CONFIG,
    );
  });
  test("DWG: env present → ok", () => {
    expect(
      checkDwgConverter({ env: { DWG_CONVERTER_URL: "http://x" } }).status,
    ).toBe(HEALTH_STATUS.OK);
  });
  test("IFC: missing env is missing_config (optional, not unavailable)", () => {
    expect(checkIfcEngine({ env: {} }).status).toBe(
      HEALTH_STATUS.MISSING_CONFIG,
    );
  });
});

describe("providerHealthService — rollupOverall", () => {
  test("any unavailable → unavailable", () => {
    expect(
      rollupOverall({
        a: { status: HEALTH_STATUS.OK },
        b: { status: HEALTH_STATUS.UNAVAILABLE },
        c: { status: HEALTH_STATUS.DEGRADED },
      }),
    ).toBe(HEALTH_STATUS.UNAVAILABLE);
  });
  test("any degraded (no unavailable) → degraded", () => {
    expect(
      rollupOverall({
        a: { status: HEALTH_STATUS.OK },
        b: { status: HEALTH_STATUS.DEGRADED },
        c: { status: HEALTH_STATUS.MISSING_CONFIG },
      }),
    ).toBe(HEALTH_STATUS.DEGRADED);
  });
  test("all ok → ok", () => {
    expect(
      rollupOverall({
        a: { status: HEALTH_STATUS.OK },
        b: { status: HEALTH_STATUS.OK },
      }),
    ).toBe(HEALTH_STATUS.OK);
  });
});

describe("providerHealthService — buildProviderHealthSnapshot", () => {
  test("composes all five checks and returns rollup status + checkedAt", async () => {
    const f = fakeFetch([
      { status: 200, headers: { get: () => "req-r" } }, // reasoning
      { status: 200, headers: { get: () => "req-i" } }, // images
    ]);
    const env = {
      OPENAI_REASONING_API_KEY: "sk-reasoning-abcd",
      OPENAI_IMAGES_API_KEY: "sk-images-wxyz",
      OPENAI_IMAGE_MODEL: "gpt-image-2",
      DWG_CONVERTER_URL: "http://dwg.example",
    };
    const snapshot = await buildProviderHealthSnapshot({
      env,
      fetchImpl: f.fn,
      adapter: fakeAdapter({ signedUrls: true }),
    });

    expect(snapshot.status).toBe(HEALTH_STATUS.MISSING_CONFIG); // ifcEngine
    expect(snapshot.checks.openaiReasoning.status).toBe(HEALTH_STATUS.OK);
    expect(snapshot.checks.openaiImages.status).toBe(HEALTH_STATUS.OK);
    expect(snapshot.checks.artifactStorage.status).toBe(HEALTH_STATUS.OK);
    expect(snapshot.checks.dwgConverter.status).toBe(HEALTH_STATUS.OK);
    expect(snapshot.checks.ifcEngine.status).toBe(HEALTH_STATUS.MISSING_CONFIG);
    expect(snapshot.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // No raw keys / Authorization headers / sk- in serialised snapshot
    const json = JSON.stringify(snapshot);
    expect(json).not.toContain("sk-reasoning-abcd");
    expect(json).not.toContain("sk-images-wxyz");
    expect(json).not.toContain("Bearer ");
    expect(json).not.toContain("Authorization");
  });
});
