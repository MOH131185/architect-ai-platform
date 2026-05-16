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

  // Phase 2 audit response: the route must thread the structural/MEP
  // flags from the request body. Without this, a generation that asked
  // for arch-only still gets S-/E-/P-/M- layers from server env. The
  // exporter applies the explicit-false-wins rule end-to-end.
  test("forwards structuralDrawingsEnabled / mepDrawingsEnabled from request body", async () => {
    const originalStructural = process.env.STRUCTURAL_DRAWINGS_ENABLED;
    const originalMep = process.env.MEP_DRAWINGS_ENABLED;
    process.env.STRUCTURAL_DRAWINGS_ENABLED = "true";
    process.env.MEP_DRAWINGS_ENABLED = "true";
    try {
      const req = {
        method: "POST",
        headers: {},
        body: {
          compiledProject: compiledProjectFixture(),
          projectName: "AuditResponse",
          structuralDrawingsEnabled: false,
          mepDrawingsEnabled: false,
        },
      };
      const res = createMockResponse();
      await handler(req, res);
      expect(res.statusCode).toBe(200);
      const body = String(res.body || "");
      // With explicit-false flags, no S-/E-/P-/M- layer entries should
      // appear in the entity stream — even though env says both are on.
      expect(body).not.toMatch(/^  8\nS-FOUNDATION$/m);
      expect(body).not.toMatch(/^  8\nE-LIGHT$/m);
      expect(body).not.toMatch(/^  8\nM-DUCT$/m);
    } finally {
      if (originalStructural === undefined)
        delete process.env.STRUCTURAL_DRAWINGS_ENABLED;
      else process.env.STRUCTURAL_DRAWINGS_ENABLED = originalStructural;
      if (originalMep === undefined) delete process.env.MEP_DRAWINGS_ENABLED;
      else process.env.MEP_DRAWINGS_ENABLED = originalMep;
    }
  });

  test("emits structural/MEP DXF disclaimer comments inside HEADER when the flags are on", async () => {
    const req = {
      method: "POST",
      headers: {},
      body: {
        compiledProject: compiledProjectFixture(),
        projectName: "AuditResponse",
        structuralDrawingsEnabled: true,
        mepDrawingsEnabled: true,
      },
    };
    const res = createMockResponse();
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    const body = String(res.body || "");
    // Re-audit fix: file still starts with "  0\nSECTION" (parser
    // contract). Disclaimers now live INSIDE the HEADER section as
    // group-code 999 comment lines.
    expect(body.startsWith("  0\nSECTION")).toBe(true);
    const headerStart = body.indexOf("  2\nHEADER\n");
    const headerEnd = body.indexOf("  0\nENDSEC\n", headerStart);
    expect(headerStart).toBeGreaterThan(-1);
    expect(headerEnd).toBeGreaterThan(headerStart);
    const headerBlock = body.slice(headerStart, headerEnd);
    expect(headerBlock).toMatch(/  999\n/);
    expect(headerBlock).toContain("STRUCTURAL_REVIEW_DISCLAIMER");
    expect(headerBlock).toContain("MEP_REVIEW_DISCLAIMER");
  });
});
