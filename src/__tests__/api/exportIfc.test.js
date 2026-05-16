/**
 * IFC export endpoint — validates real ISO-10303-21 STEP output, the
 * project/site/building/storey hierarchy, deterministic GUIDs, geometry
 * hash provenance, and the IFC_GEOMETRY_INSUFFICIENT 400 gate.
 */

import handler from "../../../api/project/export/ifc.js";

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

function fixture(overrides = {}) {
  return {
    geometryHash: "ifc-fixture-geom-hash-001",
    metadata: { source: "test-fixture" },
    site: { area_m2: 200 },
    levels: [
      {
        id: "L0",
        level_number: 0,
        elevation_m: 0,
        height_m: 3,
        name: "Ground",
      },
      { id: "L1", level_number: 1, elevation_m: 3, height_m: 3, name: "First" },
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
        bbox: { min_x: 0, min_y: 0, max_x: 10, max_y: 8 },
      },
    ],
    openings: [
      {
        id: "d1",
        levelId: "L0",
        type: "door",
        position_m: { x: 5, y: 0 },
        width_m: 0.9,
        head_height_m: 2.1,
      },
      {
        id: "win1",
        levelId: "L0",
        type: "window",
        position_m: { x: 2, y: 0 },
        width_m: 1.2,
        head_height_m: 1.5,
      },
    ],
    stairs: [],
    rooms: [
      {
        id: "r1",
        levelId: "L0",
        name: "Office",
        actual_area_m2: 80,
        bbox: { min_x: 0, min_y: 0, max_x: 10, max_y: 8 },
      },
    ],
    ...overrides,
  };
}

describe("api/project/export/ifc", () => {
  test("emits valid ISO-10303-21 with project/site/building/storey + walls", async () => {
    const req = {
      method: "POST",
      headers: {},
      body: { compiledProject: fixture(), projectName: "IFC Fixture" },
    };
    const res = createMockResponse();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Type"]).toBe("application/octet-stream");
    const body = String(res.body || "");
    expect(body.startsWith("ISO-10303-21;")).toBe(true);
    expect(body.trim().endsWith("END-ISO-10303-21;")).toBe(true);
    expect(body).toContain("IFCPROJECT");
    expect(body).toContain("IFCSITE");
    expect(body).toContain("IFCBUILDING");
    expect(body).toContain("IFCBUILDINGSTOREY");
    expect(body).toContain("IFCWALL");
    expect(body).toContain("IFCDOOR");
    expect(body).toContain("IFCWINDOW");
    expect(body).toContain("ifc-fixture-geom-hash-001");
  });

  test("deterministic — same input produces identical bytes", async () => {
    const compiledProject = fixture();
    const responses = await Promise.all(
      [0, 0].map(async () => {
        const req = {
          method: "POST",
          headers: {},
          body: { compiledProject, projectName: "Det" },
        };
        const res = createMockResponse();
        await handler(req, res);
        return res.body;
      }),
    );
    expect(responses[0]).toBe(responses[1]);
  });

  test("400 with IFC_GEOMETRY_INSUFFICIENT when walls empty", async () => {
    const req = {
      method: "POST",
      headers: {},
      body: {
        compiledProject: fixture({ walls: [] }),
        projectName: "Empty Walls",
      },
    };
    const res = createMockResponse();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body?.code).toBe("IFC_GEOMETRY_INSUFFICIENT");
  });

  test("400 with IFC_GEOMETRY_INSUFFICIENT when levels empty", async () => {
    const req = {
      method: "POST",
      headers: {},
      body: {
        compiledProject: fixture({ levels: [] }),
        projectName: "Empty Levels",
      },
    };
    const res = createMockResponse();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body?.code).toBe("IFC_GEOMETRY_INSUFFICIENT");
  });

  test("400 with GEOMETRY_HASH_MISSING when compiledProject has no geometryHash", async () => {
    const req = {
      method: "POST",
      headers: {},
      body: { compiledProject: { walls: [], levels: [] } },
    };
    const res = createMockResponse();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body?.code).toBe("GEOMETRY_HASH_MISSING");
  });

  // Phase 2 audit response: the route threads structural/MEP flags into
  // the IFC export. Explicit false in the body MUST override env true.
  test("forwards structuralDrawingsEnabled false and suppresses IfcColumn/IfcBeam even when env is true", async () => {
    const originalStructural = process.env.STRUCTURAL_DRAWINGS_ENABLED;
    process.env.STRUCTURAL_DRAWINGS_ENABLED = "true";
    try {
      const req = {
        method: "POST",
        headers: {},
        body: {
          compiledProject: fixture({
            columns: [
              {
                id: "c1",
                memberId: "C1",
                levelId: "L0",
                type: "preliminary",
                position: { x: 5, y: 5 },
                width_m: 0.3,
                depth_m: 0.3,
              },
            ],
            beams: [
              {
                id: "b1",
                memberId: "B1",
                levelId: "L0",
                type: "preliminary",
                start: { x: 0, y: 5 },
                end: { x: 10, y: 5 },
              },
            ],
          }),
          projectName: "AuditResponseIfc",
          structuralDrawingsEnabled: false,
        },
      };
      const res = createMockResponse();
      await handler(req, res);
      expect(res.statusCode).toBe(200);
      const body = String(res.body || "");
      expect(body).not.toContain("IFCCOLUMN(");
      expect(body).not.toContain("IFCBEAM(");
    } finally {
      if (originalStructural === undefined)
        delete process.env.STRUCTURAL_DRAWINGS_ENABLED;
      else process.env.STRUCTURAL_DRAWINGS_ENABLED = originalStructural;
    }
  });

  // Re-audit fix: the route now forwards BOTH alias names. Codex caught
  // that `includeStructuralDrawings` / `includeMepDrawings` in the
  // request body were ignored, so an arch-only request still emitted
  // IfcColumn/IfcBeam when env was true.
  test("forwards includeStructuralDrawings:false and suppresses IfcColumn/IfcBeam even when env is true", async () => {
    const originalStructural = process.env.STRUCTURAL_DRAWINGS_ENABLED;
    process.env.STRUCTURAL_DRAWINGS_ENABLED = "true";
    try {
      const req = {
        method: "POST",
        headers: {},
        body: {
          compiledProject: fixture({
            columns: [
              {
                id: "c1",
                memberId: "C1",
                levelId: "L0",
                type: "preliminary",
                position: { x: 5, y: 5 },
                width_m: 0.3,
                depth_m: 0.3,
              },
            ],
          }),
          projectName: "AuditAliasIfc",
          includeStructuralDrawings: false,
        },
      };
      const res = createMockResponse();
      await handler(req, res);
      expect(res.statusCode).toBe(200);
      const body = String(res.body || "");
      expect(body).not.toContain("IFCCOLUMN(");
    } finally {
      if (originalStructural === undefined)
        delete process.env.STRUCTURAL_DRAWINGS_ENABLED;
      else process.env.STRUCTURAL_DRAWINGS_ENABLED = originalStructural;
    }
  });

  test("forwards includeMepDrawings:false and suppresses MEP_REVIEW_DISCLAIMER even when env is true", async () => {
    const originalMep = process.env.MEP_DRAWINGS_ENABLED;
    process.env.MEP_DRAWINGS_ENABLED = "true";
    try {
      const req = {
        method: "POST",
        headers: {},
        body: {
          compiledProject: fixture(),
          projectName: "AuditAliasIfc",
          includeMepDrawings: false,
        },
      };
      const res = createMockResponse();
      await handler(req, res);
      expect(res.statusCode).toBe(200);
      const body = String(res.body || "");
      expect(body).not.toContain("MEP_REVIEW_DISCLAIMER");
    } finally {
      if (originalMep === undefined) delete process.env.MEP_DRAWINGS_ENABLED;
      else process.env.MEP_DRAWINGS_ENABLED = originalMep;
    }
  });

  test("structuralDrawingsEnabled true emits IfcColumn/IfcBeam with IfcExtrudedAreaSolid representation", async () => {
    const req = {
      method: "POST",
      headers: {},
      body: {
        compiledProject: fixture({
          columns: [
            {
              id: "c1",
              memberId: "C1",
              levelId: "L0",
              type: "preliminary_column",
              position: { x: 5, y: 5 },
              width_m: 0.3,
              depth_m: 0.3,
            },
          ],
          beams: [
            {
              id: "b1",
              memberId: "B1",
              levelId: "L0",
              type: "preliminary_beam",
              start: { x: 0, y: 5 },
              end: { x: 10, y: 5 },
            },
          ],
        }),
        projectName: "AuditResponseIfc",
        structuralDrawingsEnabled: true,
      },
    };
    const res = createMockResponse();
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    const body = String(res.body || "");
    expect(body).toContain("IFCCOLUMN(");
    expect(body).toContain("IFCBEAM(");
    expect(body).toContain("IFCEXTRUDEDAREASOLID(");
    expect(body).toContain("'SweptSolid'");
    expect(body).toContain("PRELIMINARY");
  });
});
