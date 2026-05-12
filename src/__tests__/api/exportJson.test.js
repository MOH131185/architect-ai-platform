/**
 * Authority JSON export endpoint — validates the enriched payload and
 * the secret/binary sanitizers in buildAuthorityJsonPayload.
 */

import handler from "../../../api/project/export/json.js";

function createMockResponse() {
  return {
    headers: {},
    statusCode: 200,
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
    send(payload) {
      this.body = payload;
      return this;
    },
    end() {
      return this;
    },
  };
}

function compiledFixture(overrides = {}) {
  return {
    geometryHash: "json-fixture-geom-hash-001",
    levels: [{ id: "L0", elevation_m: 0 }],
    walls: [{ id: "w1" }, { id: "w2" }],
    slabs: [{ id: "s1", area_m2: 80 }],
    rooms: [
      { id: "r1", name: "Office", actual_area_m2: 50 },
      { id: "r2", name: "Lobby", actual_area_m2: 30 },
    ],
    openings: [{ id: "d1", type: "door" }],
    stairs: [],
    site: { area_m2: 200 },
    ...overrides,
  };
}

describe("api/project/export/json", () => {
  test("400 when compiledProject missing geometryHash", async () => {
    const req = { method: "POST", headers: {}, body: { compiledProject: {} } };
    const res = createMockResponse();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body?.code).toBe("GEOMETRY_HASH_MISSING");
  });

  test("emits enriched authority payload with required hashes and disclaimers", async () => {
    const req = {
      method: "POST",
      headers: {},
      body: {
        compiledProject: compiledFixture(),
        projectQuantityTakeoff: {
          items: [{ category: "areas", item: "GIA", quantity: 80, unit: "m2" }],
        },
        sheetArtifactManifest: {
          exportManifest: { exports: { dxf: { available: true } } },
          structuralAuthority: { status: "preliminary" },
        },
        designMetadata: {
          visualManifestHash: "vm-hash-1",
          styleBlendManifestHash: "sb-hash-1",
          jurisdictionPack: {
            id: "uk-residential-v2",
            countryCode: "GB",
            region: "midlands",
          },
          jurisdictionPackResolution: {
            sourceGaps: [{ part: "L", reason: "no source" }],
          },
        },
        qaSummary: { status: "pass", score: 88, blockers: [], warnings: [] },
        projectName: "Office Studio",
        pipelineVersion: "project-graph-vertical-slice-v1",
      },
    };
    const res = createMockResponse();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Type"]).toBe("application/json");
    const parsed = JSON.parse(String(res.body));
    expect(parsed.schema_version).toBe("compiled-export-authority-v1");
    expect(parsed.geometryHash).toBe("json-fixture-geom-hash-001");
    expect(parsed.visualManifestHash).toBe("vm-hash-1");
    expect(parsed.styleBlendManifestHash).toBe("sb-hash-1");
    expect(parsed.jurisdiction.id).toBe("uk-residential-v2");
    expect(parsed.jurisdiction.countryCode).toBe("GB");
    expect(parsed.compiledProjectSummary.walls).toBe(2);
    expect(parsed.compiledProjectSummary.rooms).toBe(2);
    expect(parsed.qaSummary.status).toBe("pass");
    expect(parsed.disclaimers.status).toBe("preliminary");
    expect(parsed.disclaimers.reviewRequired).toBe(true);
    expect(parsed.sourceGaps).toHaveLength(1);
    expect(parsed.exportManifest?.exports?.dxf?.available).toBe(true);
    expect(parsed.technicalAuthority?.structuralAuthority?.status).toBe(
      "preliminary",
    );
  });

  test("sanitizes secret-like keys and base64 payloads on compiledProject", async () => {
    const req = {
      method: "POST",
      headers: {},
      body: {
        compiledProject: compiledFixture({
          metadata: {
            api_key: "sk-should-never-leak",
            bearer_token: "leak-attempt",
            harmless: "ok",
          },
          thumbnail: `data:image/png;base64,AAAA${"X".repeat(50)}`,
        }),
        projectName: "Sanitize Me",
      },
    };
    const res = createMockResponse();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(String(res.body));
    expect(parsed.compiledProject.metadata.api_key).toBe("[redacted]");
    expect(parsed.compiledProject.metadata.bearer_token).toBe("[redacted]");
    expect(parsed.compiledProject.metadata.harmless).toBe("ok");
    expect(parsed.compiledProject.thumbnail).toBe("[binary omitted]");
  });

  test("405 when not POST", async () => {
    const req = { method: "GET", headers: {}, body: {} };
    const res = createMockResponse();
    await handler(req, res);
    expect(res.statusCode).toBe(405);
  });
});
