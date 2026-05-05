import generateDrawingsHandler from "../../../api/models/generate-drawings.js";
import generateProjectHandler from "../../../api/models/generate-project.js";
import generateVisualPackageHandler from "../../../api/models/generate-visual-package.js";
import projectGraphProductionGuard from "../../../server/utils/projectGraphProductionGuard.cjs";

const {
  buildLegacyProjectGenerationDisabledPayload,
  shouldBlockLegacyProjectGeneration,
} = projectGraphProductionGuard;

function createMockResponse() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    ended: false,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
  };
}

describe("ProjectGraph production route guards", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.PIPELINE_MODE = "project_graph";
    delete process.env.REACT_APP_PIPELINE_MODE;
    delete process.env.ALLOW_LEGACY_GENERATION;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test.each([
    ["/api/models/generate-project", generateProjectHandler],
    ["/api/models/generate-drawings", generateDrawingsHandler],
    ["/api/models/generate-visual-package", generateVisualPackageHandler],
  ])(
    "%s is blocked when ProjectGraph is the production mode",
    async (route, handler) => {
      const req = {
        method: "POST",
        headers: {},
        body: {},
      };
      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(410);
      expect(res.body).toMatchObject({
        success: false,
        error: "LEGACY_GENERATION_DISABLED",
        details: {
          route,
          requiredRoute: "/api/project/generate-vertical-slice",
        },
        meta: {
          pipelineMode: "project_graph",
          legacyGenerationAllowed: false,
        },
      });
    },
  );

  test("legacy route lock can only be bypassed by explicit debug opt-in or multi_panel mode", () => {
    expect(
      shouldBlockLegacyProjectGeneration({
        env: { PIPELINE_MODE: "project_graph" },
      }),
    ).toBe(true);
    expect(
      shouldBlockLegacyProjectGeneration({
        env: {
          PIPELINE_MODE: "project_graph",
          ALLOW_LEGACY_GENERATION: "true",
        },
      }),
    ).toBe(false);
    expect(
      shouldBlockLegacyProjectGeneration({
        env: { PIPELINE_MODE: "multi_panel" },
      }),
    ).toBe(false);

    expect(
      buildLegacyProjectGenerationDisabledPayload(
        "/api/models/generate-project",
        { PIPELINE_MODE: "project_graph" },
      ),
    ).toMatchObject({
      error: "LEGACY_GENERATION_DISABLED",
      statusCode: 410,
      details: {
        allowLegacyEnv: "ALLOW_LEGACY_GENERATION=true",
      },
    });
  });
});
