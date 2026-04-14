import generateDrawingsHandler from "../../../api/models/generate-drawings.js";
import generateFloorplanHandler from "../../../api/models/generate-floorplan.js";
import generateStyleHandler from "../../../api/models/generate-style.js";
import searchPrecedentsHandler from "../../../api/models/search-precedents.js";
import statusHandler from "../../../api/models/status.js";
import validateProjectHandler from "../../../api/models/validate-project.js";
import {
  resetFeatureFlags,
  setFeatureFlag,
} from "../../config/featureFlags.js";

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

describe("Phase 1 model route handlers", () => {
  afterEach(() => {
    resetFeatureFlags();
  });

  test("generate-style allows configured origins and returns contract metadata", async () => {
    const req = {
      method: "POST",
      headers: { origin: "http://localhost:3000" },
      body: {
        styleIntent: "contextual contemporary brick house",
        location: { region: "UK", climate_zone: "marine-temperate" },
      },
    };
    const res = createMockResponse();

    await generateStyleHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.headers["Access-Control-Allow-Origin"]).toBe(
      "http://localhost:3000",
    );
    expect(res.body.success).toBe(true);
    expect(res.body.meta.endpoint).toBe("generate-style");
    expect(res.body.meta.featureFlags).toContain("useOpenSourceStyleEngine");
  });

  test("generate-style blocks disallowed origins", async () => {
    const req = {
      method: "POST",
      headers: { origin: "https://malicious.example.com" },
      body: { styleIntent: "anything" },
    };
    const res = createMockResponse();

    await generateStyleHandler(req, res);

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe("ORIGIN_NOT_ALLOWED");
  });

  test("generate-floorplan returns 503 when the feature flag group is disabled", async () => {
    setFeatureFlag("useFloorplanEngine", false);

    const req = {
      method: "POST",
      headers: {},
      body: {
        room_program: [{ id: "living", name: "Living", target_area_m2: 20 }],
      },
    };
    const res = createMockResponse();

    await generateFloorplanHandler(req, res);

    expect(res.statusCode).toBe(503);
    expect(res.body.error).toBe("FEATURE_DISABLED");
    expect(res.body.details.requiredFlags).toContain("useFloorplanGenerator");
  });

  test("generate-drawings filters unsupported drawing types and preserves a stable response shape", async () => {
    const req = {
      method: "POST",
      headers: {},
      body: {
        projectGeometry: {
          project_id: "drawing-demo",
          levels: [
            {
              id: "ground",
              name: "Ground Floor",
              rooms: [
                {
                  id: "living",
                  name: "Living Room",
                  bbox: { x: 0, y: 0, width: 6, height: 4 },
                },
              ],
            },
          ],
        },
        drawingTypes: ["plan", "axon", "section"],
      },
    };
    const res = createMockResponse();

    await generateDrawingsHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.drawings.plan).toHaveLength(1);
    expect(res.body.drawings.section).toHaveLength(2);
    expect(res.body.warnings[0]).toContain("Unsupported drawingTypes ignored");
    expect(res.body.meta.endpoint).toBe("generate-drawings");
    expect(res.body.projectGeometry.schema_version).toBe(
      "canonical-project-geometry-v2",
    );
    expect(res.body.validationReport.status).toMatch(/valid/);
  });

  test("generate-floorplan returns canonical geometry and validation status", async () => {
    const req = {
      method: "POST",
      headers: {},
      body: {
        project_id: "phase2-house",
        level_count: 2,
        footprint: { width_m: 14, depth_m: 10 },
        room_program: [
          {
            id: "living",
            name: "Living Room",
            target_area_m2: 24,
            adjacency: ["kitchen"],
          },
          {
            id: "kitchen",
            name: "Kitchen",
            target_area_m2: 16,
            adjacency: ["living"],
          },
          {
            id: "bedroom_1",
            name: "Bedroom 1",
            target_area_m2: 15,
            level: 1,
          },
        ],
      },
    };
    const res = createMockResponse();

    await generateFloorplanHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.projectGeometry.schema_version).toBe(
      "canonical-project-geometry-v2",
    );
    expect(res.body.status).toMatch(/valid/);
    expect(res.body.layoutGraph.nodes.length).toBeGreaterThan(0);
    expect(res.body.validationReport.summary.levelCount).toBe(2);
  });

  test("generate-floorplan preserves the legacy placeholder path when Phase 2 solver flags are disabled", async () => {
    setFeatureFlag("useCanonicalGeometryPhase2", false);

    const req = {
      method: "POST",
      headers: {},
      body: {
        project_id: "legacy-api-house",
        footprint: { width_m: 14, depth_m: 10 },
        room_program: [
          { id: "living", name: "Living Room", target_area_m2: 24 },
          { id: "kitchen", name: "Kitchen", target_area_m2: 16 },
        ],
      },
    };
    const res = createMockResponse();

    await generateFloorplanHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.projectGeometry).toBeNull();
    expect(
      res.body.warnings.some((entry) =>
        entry.includes("legacy deterministic placeholder layout"),
      ),
    ).toBe(true);
  });

  test("generate-floorplan fails closed for invalid geometry outputs", async () => {
    const req = {
      method: "POST",
      headers: {},
      body: {
        project_id: "constraint-conflict-house",
        footprint: { width_m: 14, depth_m: 10 },
        room_program: [
          {
            name: "Living Room",
            target_area_m2: 24,
            min_area_m2: 30,
            adjacency: ["kitchen"],
          },
          { name: "Kitchen", target_area_m2: 16, adjacency: ["living room"] },
        ],
      },
    };
    const res = createMockResponse();

    await generateFloorplanHandler(req, res);

    expect(res.statusCode).toBe(422);
    expect(res.body.error).toBe("PROJECT_VALIDATION_FAILED");
    expect(res.body.details.validationReport.status).toBe("invalid");
  });

  test("generate-drawings fails closed when the supplied geometry is invalid", async () => {
    const req = {
      method: "POST",
      headers: {},
      body: {
        projectGeometry: {
          project_id: "bad-drawing-geometry",
          site: {
            boundary_polygon: [
              { x: 0, y: 0 },
              { x: 12, y: 0 },
              { x: 12, y: 10 },
              { x: 0, y: 10 },
            ],
            buildable_polygon: [
              { x: 0, y: 0 },
              { x: 12, y: 0 },
              { x: 12, y: 10 },
              { x: 0, y: 10 },
            ],
          },
          levels: [
            {
              id: "ground",
              level_number: 0,
              rooms: [
                {
                  id: "living",
                  name: "Living Room",
                  bbox: { x: 0, y: 0, width: 8, height: 6 },
                },
              ],
              windows: [
                {
                  id: "window-bad",
                  wall_id: "missing-wall",
                  position_m: { x: 1, y: 1 },
                },
              ],
            },
          ],
        },
        drawingTypes: ["plan"],
      },
    };
    const res = createMockResponse();

    await generateDrawingsHandler(req, res);

    expect(res.statusCode).toBe(422);
    expect(res.body.error).toBe("DRAWING_VALIDATION_FAILED");
    expect(res.body.details.validationReport.status).toBe("invalid");
  });

  test("generate-drawings keeps a stable validation report when validation is disabled", async () => {
    setFeatureFlag("useGeometryValidationEngine", false);

    const req = {
      method: "POST",
      headers: {},
      body: {
        projectGeometry: {
          project_id: "drawing-validation-disabled",
          levels: [
            {
              id: "ground",
              name: "Ground Floor",
              rooms: [
                {
                  id: "living",
                  name: "Living Room",
                  bbox: { x: 0, y: 0, width: 6, height: 4 },
                },
              ],
            },
          ],
        },
        drawingTypes: ["plan"],
      },
    };
    const res = createMockResponse();

    await generateDrawingsHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.validationReport.status).toBe("valid_with_warnings");
    expect(res.body.validationReport.warnings).toContain(
      "Geometry validation engine is disabled by feature flag.",
    );
  });

  test("search-precedents returns matchExplanations and clamps oversized limits", async () => {
    const req = {
      method: "POST",
      headers: {},
      body: {
        query: "brick courtyard residential house",
        limit: 999,
        corpus: [
          {
            id: "precedent-brick",
            title: "Brick Courtyard House",
            description:
              "Contextual residential scheme with masonry and sheltered courtyard.",
            building_type: "residential",
            climate: "marine-temperate",
            style: "contextual contemporary",
            semantic_labels: ["wall", "door", "courtyard"],
            object_counts: { wall: 12, door: 6 },
          },
        ],
      },
    };
    const res = createMockResponse();

    await searchPrecedentsHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.matchExplanations).toHaveLength(1);
    expect(res.body.matchExplanation).toEqual(res.body.matchExplanations);
    expect(res.body.warnings[0]).toContain("limit reduced");
    expect(res.body.meta.endpoint).toBe("search-precedents");
  });

  test("status reports camelCase feature metadata and honest hook availability", async () => {
    const req = {
      method: "GET",
      headers: { origin: "http://localhost:3000" },
    };
    const res = createMockResponse();

    await statusHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.meta.contractVersion).toBe(
      "phase1-architecture-backend-v1",
    );
    expect(res.body.meta.runtimeVersion).toBe("phase2-geometry-validation-v1");
    expect(res.body.status.categories.floorplan_generation.featureFlag).toBe(
      "useFloorplanEngine",
    );
    expect(res.body.status.phase2.canonicalGeometry).toBe(true);

    const houseDiffusionHook =
      res.body.status.categories.floorplan_generation.availableModels.find(
        (entry) => entry.id === "house-diffusion-hook",
      );
    expect(houseDiffusionHook.handlerAvailable).toBe(false);
    expect(houseDiffusionHook.adapterConfig.id).toBe("house-diffusion-hook");
  });

  test("validate-project returns invalid status for overlapping geometry", async () => {
    const req = {
      method: "POST",
      headers: {},
      body: {
        projectGeometry: {
          project_id: "bad-geometry",
          site: {
            boundary_polygon: [
              { x: 0, y: 0 },
              { x: 12, y: 0 },
              { x: 12, y: 10 },
              { x: 0, y: 10 },
            ],
            buildable_polygon: [
              { x: 0, y: 0 },
              { x: 12, y: 0 },
              { x: 12, y: 10 },
              { x: 0, y: 10 },
            ],
          },
          levels: [
            {
              id: "ground",
              level_number: 0,
              rooms: [
                {
                  id: "living",
                  name: "Living Room",
                  bbox: { x: 0, y: 0, width: 8, height: 6 },
                },
                {
                  id: "kitchen",
                  name: "Kitchen",
                  bbox: { x: 4, y: 2, width: 6, height: 5 },
                },
              ],
            },
          ],
        },
      },
    };
    const res = createMockResponse();

    await validateProjectHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe("invalid");
    expect(res.body.errors.some((entry) => entry.includes("overlap"))).toBe(
      true,
    );
  });
});
