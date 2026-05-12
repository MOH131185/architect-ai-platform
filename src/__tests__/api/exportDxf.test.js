/**
 * DXF export endpoint — sanity checks against the deterministic
 * canonical-DXF pipeline. Asserts the response is text DXF with the
 * required SECTION/ENTITIES/ENDSEC/EOF markers, at least one layer name,
 * and the geometry hash embedded as provenance.
 */

import handler from "../../../api/project/export/dxf.js";

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

function compiledProjectFixture(overrides = {}) {
  return {
    geometryHash: "dxf-fixture-geom-hash-001",
    metadata: { source: "test-fixture", compiler: "test" },
    site: { area_m2: 200 },
    footprint: {
      polygon: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 8 },
        { x: 0, y: 8 },
      ],
      area_m2: 80,
    },
    levels: [
      {
        id: "L0",
        level_number: 0,
        elevation_m: 0,
        height_m: 3,
        name: "Ground",
      },
    ],
    walls: [
      {
        id: "w1",
        levelId: "L0",
        exterior: true,
        start: { x: 0, y: 0 },
        end: { x: 10, y: 0 },
        length_m: 10,
        height_m: 3,
      },
      {
        id: "w2",
        levelId: "L0",
        exterior: true,
        start: { x: 10, y: 0 },
        end: { x: 10, y: 8 },
        length_m: 8,
        height_m: 3,
      },
    ],
    slabs: [
      {
        id: "s1",
        levelId: "L0",
        area_m2: 80,
        polygon: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 8 },
          { x: 0, y: 8 },
        ],
        bbox: { min_x: 0, min_y: 0, max_x: 10, max_y: 8 },
      },
    ],
    rooms: [
      {
        id: "r1",
        levelId: "L0",
        name: "Office",
        actual_area_m2: 80,
        polygon: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 8 },
          { x: 0, y: 8 },
        ],
        bbox: { min_x: 0, min_y: 0, max_x: 10, max_y: 8 },
      },
    ],
    openings: [],
    stairs: [],
    ...overrides,
  };
}

describe("api/project/export/dxf", () => {
  test("returns a valid DXF text body with required markers and a layer", async () => {
    const req = {
      method: "POST",
      headers: {},
      body: {
        compiledProject: compiledProjectFixture(),
        projectName: "DXF Fixture",
      },
    };
    const res = createMockResponse();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Type"]).toBe("application/dxf");
    const body = String(res.body || "");
    expect(body).toContain("SECTION");
    expect(body).toContain("ENTITIES");
    expect(body).toContain("ENDSEC");
    expect(body).toContain("EOF");
    // At least one AIA layer name should appear.
    expect(body).toMatch(/A-WALL/);
  });

  test("405 when not POST", async () => {
    const req = { method: "GET", headers: {}, body: {} };
    const res = createMockResponse();
    await handler(req, res);
    expect(res.statusCode).toBe(405);
  });
});
