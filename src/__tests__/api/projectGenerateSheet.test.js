jest.mock("../../../src/services/project/projectPipelineV2Service.js", () => ({
  buildProjectPipelineV2Bundle: jest.fn(),
}));

jest.mock("../../../src/services/dnaWorkflowOrchestrator.js", () => ({
  __esModule: true,
  default: {
    runMultiPanelA1Workflow: jest.fn(),
  },
}));

import handler from "../../../api/project/generate-sheet.js";
import dnaWorkflowOrchestrator from "../../../src/services/dnaWorkflowOrchestrator.js";
import { buildProjectPipelineV2Bundle } from "../../../src/services/project/projectPipelineV2Service.js";

function createResponseMock() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
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
      return this;
    },
  };
}

describe("/api/project/generate-sheet", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns technical authority and verification metadata on success", async () => {
    buildProjectPipelineV2Bundle.mockResolvedValue({
      supported: true,
      pipelineVersion: "uk-residential-v2",
      confidence: { score: 0.82 },
      validation: { valid: true, blockers: [], warnings: [] },
      programBrief: { levelCount: 2, spaces: [] },
      siteEvidence: {},
      localStyleEvidence: {},
      portfolioStyleEvidence: {},
      styleBlendSpec: {},
      projectGeometry: { levels: [{}, {}] },
      populatedGeometry: null,
      blendedStyle: {},
      technicalPack: {
        geometryHash: "geom-shared-123",
        source: "compiled_project",
        ready: true,
        fallbackUsed: false,
        blockers: [],
      },
      layoutQuality: {
        source: "runtime_layout_geometry",
        fallbackUsed: true,
      },
      compiledProject: {
        geometryHash: "geom-shared-123",
        technicalPack: {
          geometryHash: "geom-shared-123",
          source: "compiled_project",
          ready: true,
          fallbackUsed: false,
          blockers: [],
        },
        layoutQuality: {
          source: "runtime_layout_geometry",
          fallbackUsed: true,
        },
      },
      projectQuantityTakeoff: { items: [] },
    });

    dnaWorkflowOrchestrator.runMultiPanelA1Workflow.mockResolvedValue({
      success: true,
      verification: {
        phase: "post_compose",
        overall: "pass",
      },
      technicalCredibility: {
        status: "pass",
        blockers: [],
      },
      publishability: {
        status: "publishable",
        verificationPhase: "post_compose",
      },
    });

    const req = {
      method: "POST",
      headers: {},
      body: {
        projectDetails: {
          category: "residential",
          subType: "detached-house",
          program: "detached-house",
          area: 180,
        },
      },
    };
    const res = createResponseMock();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.technicalAuthority).toEqual({
      geometryHash: "geom-shared-123",
      ready: true,
      source: "post_compose_verification",
      fallbackUsed: true,
      blockers: [],
    });
    expect(res.body.verification).toEqual({
      phase: "post_compose",
      overall: "pass",
    });
    expect(res.body.result.technicalAuthority.geometryHash).toBe(
      "geom-shared-123",
    );
    expect(res.body.result.verification.phase).toBe("post_compose");
  });
});
