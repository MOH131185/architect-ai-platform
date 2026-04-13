import generateDrawingsHandler from "../../../api/models/generate-drawings.js";
import generateFloorplanHandler from "../../../api/models/generate-floorplan.js";
import generateStyleHandler from "../../../api/models/generate-style.js";
import searchPrecedentsHandler from "../../../api/models/search-precedents.js";
import statusHandler from "../../../api/models/status.js";
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
    expect(res.body.status.categories.floorplan_generation.featureFlag).toBe(
      "useFloorplanEngine",
    );

    const houseDiffusionHook =
      res.body.status.categories.floorplan_generation.availableModels.find(
        (entry) => entry.id === "house-diffusion-hook",
      );
    expect(houseDiffusionHook.handlerAvailable).toBe(false);
    expect(houseDiffusionHook.adapterConfig.id).toBe("house-diffusion-hook");
  });
});
