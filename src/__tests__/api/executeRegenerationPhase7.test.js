import generateProjectHandler from "../../../api/models/generate-project.js";
import executeRegenerationHandler from "../../../api/models/execute-regeneration.js";
import { resetFeatureFlags } from "../../config/featureFlags.js";

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

describe("Phase 7 execute-regeneration route", () => {
  afterEach(() => {
    resetFeatureFlags();
  });

  test("executes an approved minimum-scope regeneration plan", async () => {
    const projectReq = {
      method: "POST",
      headers: {},
      body: {
        project_id: "route-phase7-execution",
        footprint: { width_m: 14, depth_m: 10 },
        room_program: [
          {
            name: "Living Room",
            target_area_m2: 24,
            adjacency: ["Kitchen"],
          },
          {
            name: "Kitchen",
            target_area_m2: 16,
            adjacency: ["Living Room"],
          },
        ],
        styleDNA: {
          facade_language: "rhythmic-openings-with-solid-masonry",
        },
      },
    };
    const projectRes = createMockResponse();
    await generateProjectHandler(projectReq, projectRes);
    const levelId = projectRes.body.projectGeometry.levels[0].id;

    const req = {
      method: "POST",
      headers: {},
      body: {
        projectGeometry: projectRes.body.projectGeometry,
        drawings: {
          plan: [
            {
              level_id: levelId,
              title: "Ground",
            },
          ],
        },
        approvedPlan: {
          targetLayer: "drawings",
          minimumSafeScope: {
            geometryFragments: [],
            drawingFragments: [`drawing:plan:${levelId}`],
            facadeFragments: [],
            visualFragments: [],
            panelFragments: [],
            readinessFragments: ["readiness:default"],
          },
        },
      },
    };
    const res = createMockResponse();

    await executeRegenerationHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.freshnessUpdates.refreshedFragments).toContain(
      `drawing:plan:${levelId}`,
    );
    expect(res.body.meta.endpoint).toBe("execute-regeneration");
  });

  test("rejects malformed approved plans before execution", async () => {
    const req = {
      method: "POST",
      headers: {},
      body: {
        projectGeometry: {
          project_id: "bad-regen-plan",
          schema_version: "canonical-project-geometry-v2",
          site: {},
          levels: [],
          rooms: [],
          walls: [],
          doors: [],
          windows: [],
          stairs: [],
        },
        approvedPlan: {
          targetLayer: "drawings",
          minimumSafeScope: {
            drawingFragments: "drawing:plan:ground",
          },
        },
      },
    };
    const res = createMockResponse();

    await executeRegenerationHandler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("INVALID_REQUEST");
    expect(res.body.message).toContain(
      "approvedPlan.minimumSafeScope.drawingFragments must be an array of strings.",
    );
  });
});
