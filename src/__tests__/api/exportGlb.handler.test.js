/**
 * Phase 6 follow-up — /api/project/export/glb handler.
 *
 * Codex's Phase 5 audit flagged the GLB endpoint as having no API-level
 * test (only the underlying writer was covered). Lock the response shape:
 *   - OPTIONS → 200 (CORS preflight)
 *   - non-POST → 405
 *   - missing compiledProject → 400
 *   - happy path → 200 model/gltf-binary + GLB bytes + headers carrying
 *     adapter version + mesh count + geometryHash
 *   - writer error → 500 with `{error}`
 */

import handler from "../../../api/project/export/glb.js";

jest.mock("../../../src/services/3d/compiledProjectGlbWriter.js", () => {
  const actual = jest.requireActual(
    "../../../src/services/3d/compiledProjectGlbWriter.js",
  );
  return {
    ...actual,
    buildCompiledProjectGlb: jest.fn(),
  };
});

import { buildCompiledProjectGlb } from "../../../src/services/3d/compiledProjectGlbWriter.js";

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
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

function makeReq(body, method = "POST") {
  return { method, body, headers: {} };
}

describe("/api/project/export/glb — handler", () => {
  beforeEach(() => {
    buildCompiledProjectGlb.mockReset();
  });

  test("OPTIONS preflight returns 200", async () => {
    const res = makeRes();
    await handler(makeReq(null, "OPTIONS"), res);
    expect(res.statusCode).toBe(200);
  });

  test("non-POST returns 405", async () => {
    const res = makeRes();
    await handler(makeReq(null, "GET"), res);
    expect(res.statusCode).toBe(405);
  });

  test("missing compiledProject returns 400", async () => {
    const res = makeRes();
    await handler(makeReq({}), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  test("happy path returns 200 + GLB bytes + adapter headers", async () => {
    const fakeGlb = Buffer.from([
      0x67, 0x6c, 0x54, 0x46, 0x02, 0x00, 0x00, 0x00,
    ]);
    buildCompiledProjectGlb.mockReturnValue({
      ok: true,
      glb: fakeGlb,
      glbByteLength: fakeGlb.length,
      meshCount: 9,
      meshKinds: [
        "wall",
        "wall",
        "wall",
        "wall",
        "slab",
        "door",
        "window",
        "roof",
        "slab",
      ],
      adapterVersion: "compiled-project-glb-writer-v2",
      geometryHash: "test-hash-001",
      extras: { geometryHash: "test-hash-001" },
    });
    const res = makeRes();
    await handler(
      makeReq({
        compiledProject: {
          geometryHash: "test-hash-001",
          walls: [],
          levels: [],
        },
        projectName: "PhaseSix Test",
      }),
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect(res.body.slice(0, 4).toString("ascii")).toBe("glTF");
    expect(res.headers["content-type"]).toBe("model/gltf-binary");
    expect(res.headers["content-disposition"]).toMatch(/PhaseSix_Test\.glb/);
    expect(res.headers["x-glb-adapter-version"]).toBe(
      "compiled-project-glb-writer-v2",
    );
    expect(res.headers["x-glb-mesh-count"]).toBe("9");
    expect(res.headers["x-glb-geometry-hash"]).toBe("test-hash-001");
  });

  test("writer error surfaces as 500 with structured message", async () => {
    buildCompiledProjectGlb.mockImplementation(() => {
      throw new Error("buildCompiledProjectGlb: no convertible primitives");
    });
    const res = makeRes();
    await handler(makeReq({ compiledProject: { geometryHash: "x" } }), res);
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toMatch(/no convertible primitives/);
  });
});
