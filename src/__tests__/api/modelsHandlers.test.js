import generateDrawingsHandler from "../../../api/models/generate-drawings.js";
import generateFacadeHandler from "../../../api/models/generate-facade.js";
import generateFloorplanHandler from "../../../api/models/generate-floorplan.js";
import generateProjectHandler from "../../../api/models/generate-project.js";
import planA1PanelsHandler from "../../../api/models/plan-a1-panels.js";
import projectReadinessHandler from "../../../api/models/project-readiness.js";
import repairProjectHandler from "../../../api/models/repair-project.js";
import generateStyleHandler from "../../../api/models/generate-style.js";
import generateVisualPackageHandler from "../../../api/models/generate-visual-package.js";
import regenerateLayerHandler from "../../../api/models/regenerate-layer.js";
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

  test("generate-project returns a canonical project package", async () => {
    const req = {
      method: "POST",
      headers: {},
      body: {
        project_id: "phase3-project-route",
        level_count: 2,
        footprint: { width_m: 16, depth_m: 12 },
        room_program: [
          { name: "Living Room", target_area_m2: 24, adjacency: ["Kitchen"] },
          { name: "Kitchen", target_area_m2: 16, adjacency: ["Living Room"] },
          { name: "Bedroom 1", target_area_m2: 15, level: 1 },
        ],
        styleDNA: {
          region: "UK",
          climate_zone: "marine-temperate",
          facade_language: "rhythmic-openings-with-solid-masonry",
          roof_language: "pitched-gable-or-hip",
        },
      },
    };
    const res = createMockResponse();

    await generateProjectHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.projectGeometry.schema_version).toBe(
      "canonical-project-geometry-v2",
    );
    expect(res.body.facadeGrammar).toBeTruthy();
    expect(res.body.structuralGrid).toBeTruthy();
    expect(res.body.drawings.plan.length).toBeGreaterThan(0);
    expect(res.body.integrationHooks.a1.ready).toBe(true);
  });

  test("generate-facade returns facade grammar from canonical geometry", async () => {
    const floorplanReq = {
      method: "POST",
      headers: {},
      body: {
        project_id: "phase3-facade-route",
        footprint: { width_m: 14, depth_m: 10 },
        room_program: [
          { name: "Living Room", target_area_m2: 24, adjacency: ["Kitchen"] },
          { name: "Kitchen", target_area_m2: 16, adjacency: ["Living Room"] },
        ],
      },
    };
    const floorplanRes = createMockResponse();
    await generateFloorplanHandler(floorplanReq, floorplanRes);

    const req = {
      method: "POST",
      headers: {},
      body: {
        projectGeometry: floorplanRes.body.projectGeometry,
        styleDNA: {
          region: "UK",
          climate_zone: "marine-temperate",
          facade_language: "rhythmic-openings-with-solid-masonry",
        },
      },
    };
    const res = createMockResponse();

    await generateFacadeHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.facadeGrammar.orientations).toHaveLength(4);
  });

  test("generate-visual-package returns geometry-locked control references", async () => {
    const floorplanReq = {
      method: "POST",
      headers: {},
      body: {
        project_id: "phase3-visual-route",
        footprint: { width_m: 14, depth_m: 10 },
        room_program: [
          { name: "Living Room", target_area_m2: 24, adjacency: ["Kitchen"] },
          { name: "Kitchen", target_area_m2: 16, adjacency: ["Living Room"] },
        ],
      },
    };
    const floorplanRes = createMockResponse();
    await generateFloorplanHandler(floorplanReq, floorplanRes);

    const req = {
      method: "POST",
      headers: {},
      body: {
        projectGeometry: floorplanRes.body.projectGeometry,
        styleDNA: {
          facade_language: "rhythmic-openings-with-solid-masonry",
          roof_language: "pitched-gable-or-hip",
        },
        viewType: "hero_3d",
      },
    };
    const res = createMockResponse();

    await generateVisualPackageHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.visualPackage.validation.valid).toBe(true);
    expect(
      res.body.visualPackage.controlReferences.references.length,
    ).toBeGreaterThan(0);
  });

  test("project-readiness reports ready projects from canonical package state", async () => {
    const projectReq = {
      method: "POST",
      headers: {},
      body: {
        project_id: "phase4-project-readiness-route",
        footprint: { width_m: 14, depth_m: 10 },
        room_program: [
          { name: "Living Room", target_area_m2: 24, adjacency: ["Kitchen"] },
          { name: "Kitchen", target_area_m2: 16, adjacency: ["Living Room"] },
        ],
        styleDNA: {
          facade_language: "rhythmic-openings-with-solid-masonry",
          roof_language: "pitched-gable-or-hip",
        },
      },
    };
    const projectRes = createMockResponse();
    await generateProjectHandler(projectReq, projectRes);

    const req = {
      method: "POST",
      headers: {},
      body: {
        projectGeometry: projectRes.body.projectGeometry,
        drawings: projectRes.body.drawings,
        visualPackage: projectRes.body.visualPackage,
        facadeGrammar: projectRes.body.facadeGrammar,
        validationReport: projectRes.body.validationReport,
      },
    };
    const res = createMockResponse();

    await projectReadinessHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.ready).toBe(true);
    expect(res.body.composeReady).toBe(true);
    expect(res.body.panelCandidates.length).toBeGreaterThan(0);
    expect(res.body.meta.endpoint).toBe("project-readiness");
  });

  test("generate-project rejects malformed styleDNA payloads early", async () => {
    const req = {
      method: "POST",
      headers: {},
      body: {
        project_id: "phase4-invalid-styledna-route",
        room_program: [{ name: "Living Room", target_area_m2: 24 }],
        styleDNA: "not-an-object",
      },
    };
    const res = createMockResponse();

    await generateProjectHandler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("INVALID_REQUEST");
    expect(res.body.message).toContain("styleDNA must be an object");
  });

  test("plan-a1-panels returns filtered panel candidates", async () => {
    const projectReq = {
      method: "POST",
      headers: {},
      body: {
        project_id: "phase4-panel-plan-route",
        footprint: { width_m: 14, depth_m: 10 },
        room_program: [
          { name: "Living Room", target_area_m2: 24, adjacency: ["Kitchen"] },
          { name: "Kitchen", target_area_m2: 16, adjacency: ["Living Room"] },
        ],
        styleDNA: {
          facade_language: "rhythmic-openings-with-solid-masonry",
        },
      },
    };
    const projectRes = createMockResponse();
    await generateProjectHandler(projectReq, projectRes);

    const req = {
      method: "POST",
      headers: {},
      body: {
        projectGeometry: projectRes.body.projectGeometry,
        drawings: projectRes.body.drawings,
        visualPackage: projectRes.body.visualPackage,
        requestedPanels: ["floor_plan", "visual"],
      },
    };
    const res = createMockResponse();

    await planA1PanelsHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.validPanelCount).toBeGreaterThan(0);
    expect(res.body.freshPanels.length).toBeGreaterThan(0);
    expect(
      res.body.panelCandidates.every((candidate) =>
        ["floor_plan", "visual"].includes(candidate.type),
      ),
    ).toBe(true);
    expect(res.body.meta.endpoint).toBe("plan-a1-panels");
  });

  test("generate-project exposes deprecated alias metadata for the Phase 4 public contract", async () => {
    const req = {
      method: "POST",
      headers: {},
      body: {
        project_id: "phase4-api-contract-meta",
        room_program: [{ name: "Living Room", target_area_m2: 24 }],
        styleDNA: {},
      },
    };
    const res = createMockResponse();

    await generateProjectHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.meta.publicApiVersion).toBe(
      "phase5-repair-dependency-compose-v1",
    );
    expect(res.body.meta.deprecatedAliases).toContain("projectId");
    expect(res.body.meta.deprecatedAliases).toContain("roomProgram");
  });

  test("repair-project returns deterministic repair candidates from canonical geometry", async () => {
    const projectReq = {
      method: "POST",
      headers: {},
      body: {
        project_id: "phase5-repair-project-route",
        footprint: { width_m: 14, depth_m: 10 },
        room_program: [
          { name: "Living Room", target_area_m2: 24, adjacency: ["Kitchen"] },
          { name: "Kitchen", target_area_m2: 16, adjacency: ["Living Room"] },
        ],
        styleDNA: {},
      },
    };
    const projectRes = createMockResponse();
    await generateProjectHandler(projectReq, projectRes);

    const req = {
      method: "POST",
      headers: {},
      body: {
        projectGeometry: projectRes.body.projectGeometry,
        validationReport: projectRes.body.validationReport,
      },
    };
    const res = createMockResponse();

    await repairProjectHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.contractVersion).toBe(
      "phase5-repair-dependency-compose-v1",
    );
    expect(res.body.repairCandidates.length).toBeGreaterThan(0);
    expect(res.body.selectedRepair).toBeTruthy();
  });

  test("regenerate-layer preserves room layout during facade-only edits", async () => {
    const floorplanReq = {
      method: "POST",
      headers: {},
      body: {
        project_id: "phase3-regen-route",
        footprint: { width_m: 14, depth_m: 10 },
        room_program: [
          { name: "Living Room", target_area_m2: 24, adjacency: ["Kitchen"] },
          { name: "Kitchen", target_area_m2: 16, adjacency: ["Living Room"] },
        ],
      },
    };
    const floorplanRes = createMockResponse();
    await generateFloorplanHandler(floorplanReq, floorplanRes);

    const req = {
      method: "POST",
      headers: {},
      body: {
        projectGeometry: floorplanRes.body.projectGeometry,
        targetLayer: "facade",
        locks: { room_layout: true },
        styleDNA: {
          region: "UK",
          climate_zone: "marine-temperate",
          facade_language: "rhythmic-openings-with-solid-masonry",
        },
      },
    };
    const res = createMockResponse();

    await regenerateLayerHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.validationReport.status).toMatch(/valid/);
    expect(res.body.diff.metadataChanged).toBe(true);
  });

  test("regenerate-layer rejects facade edits when facade_grammar is locked", async () => {
    const floorplanReq = {
      method: "POST",
      headers: {},
      body: {
        project_id: "phase3-regen-lock-route",
        footprint: { width_m: 14, depth_m: 10 },
        room_program: [
          { name: "Living Room", target_area_m2: 24, adjacency: ["Kitchen"] },
          { name: "Kitchen", target_area_m2: 16, adjacency: ["Living Room"] },
        ],
      },
    };
    const floorplanRes = createMockResponse();
    await generateFloorplanHandler(floorplanReq, floorplanRes);

    const req = {
      method: "POST",
      headers: {},
      body: {
        projectGeometry: floorplanRes.body.projectGeometry,
        targetLayer: "facade",
        locks: { facade_grammar: true },
        styleDNA: {
          region: "UK",
          climate_zone: "marine-temperate",
          facade_language: "rhythmic-openings-with-solid-masonry",
        },
      },
    };
    const res = createMockResponse();

    await regenerateLayerHandler(req, res);

    expect(res.statusCode).toBe(409);
    expect(res.body.error).toBe("LAYER_LOCKED");
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
    expect(res.body.status.phase3.multiLevelEngine).toBe(true);

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
