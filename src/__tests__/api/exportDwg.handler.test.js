/**
 * Phase 5 — /api/project/export/dwg handler.
 *
 * Locks the structured response contract:
 *   - env-missing ⇒ 503 with `{ code: "DWG_CONVERSION_UNAVAILABLE", docsUrl }`
 *   - runtime failure ⇒ 502 with the captured stderr + structured code
 *   - happy path ⇒ 200 application/acad + DWG bytes
 *
 * The adapter is mocked so the test runs in CI without the real ODA File
 * Converter binary.
 */

import handler from "../../../api/project/export/dwg.js";

jest.mock("../../../src/services/cad/dwgConversionAdapter.js", () => {
  const actual = jest.requireActual(
    "../../../src/services/cad/dwgConversionAdapter.js",
  );
  return {
    ...actual,
    convertDxfToDwg: jest.fn(),
  };
});

import {
  convertDxfToDwg,
  DwgConversionUnavailableError,
  DwgConversionRuntimeError,
  DWG_CONVERSION_UNAVAILABLE,
  DWG_CONVERTER_NOT_INSTALLED,
  DWG_CONVERTER_NON_ZERO_EXIT,
} from "../../../src/services/cad/dwgConversionAdapter.js";

function makeRes() {
  const res = {
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
  return res;
}

function makeReq(body, method = "POST") {
  return {
    method,
    body,
    headers: {},
  };
}

const SAMPLE_DXF = "0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nEOF\n";

describe("/api/project/export/dwg — handler", () => {
  beforeEach(() => {
    convertDxfToDwg.mockReset();
  });

  test("OPTIONS preflight returns 200 (CORS handled by handlePreflight)", async () => {
    const req = makeReq(null, "OPTIONS");
    const res = makeRes();
    await handler(req, res);
    expect(res.statusCode).toBe(200);
  });

  test("non-POST returns 405", async () => {
    const req = makeReq(null, "GET");
    const res = makeRes();
    await handler(req, res);
    expect(res.statusCode).toBe(405);
  });

  test("missing dxf + missing compiledProject ⇒ 400", async () => {
    const req = makeReq({});
    const res = makeRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  test("env-missing path returns 503 + DWG_CONVERSION_UNAVAILABLE", async () => {
    convertDxfToDwg.mockImplementation(async () => {
      throw new DwgConversionUnavailableError(
        "DWG conversion is disabled. DXF is the guaranteed CAD output.",
        { code: DWG_CONVERSION_UNAVAILABLE, provider: null },
      );
    });
    const req = makeReq({ dxf: SAMPLE_DXF, projectName: "Phase5" });
    const res = makeRes();
    await handler(req, res);
    expect(res.statusCode).toBe(503);
    expect(res.body.code).toBe(DWG_CONVERSION_UNAVAILABLE);
    expect(res.body.docsUrl).toMatch(/opendesign\.com/);
    expect(res.body.guidance).toMatch(/Install ODA/);
  });

  test("converter not installed at configured path ⇒ 502 + DWG_CONVERTER_NOT_INSTALLED", async () => {
    convertDxfToDwg.mockImplementation(async () => {
      throw new DwgConversionRuntimeError("spawn ENOENT", {
        code: DWG_CONVERTER_NOT_INSTALLED,
      });
    });
    const req = makeReq({ dxf: SAMPLE_DXF });
    const res = makeRes();
    await handler(req, res);
    expect(res.statusCode).toBe(502);
    expect(res.body.code).toBe(DWG_CONVERTER_NOT_INSTALLED);
  });

  test("runtime failure ⇒ 502 + DWG_CONVERTER_NON_ZERO_EXIT with stderr", async () => {
    convertDxfToDwg.mockImplementation(async () => {
      throw new DwgConversionRuntimeError("oda exited 2", {
        code: DWG_CONVERTER_NON_ZERO_EXIT,
        exitCode: 2,
        signal: null,
        stderr: "boom from oda",
      });
    });
    const req = makeReq({ dxf: SAMPLE_DXF });
    const res = makeRes();
    await handler(req, res);
    expect(res.statusCode).toBe(502);
    expect(res.body.code).toBe(DWG_CONVERTER_NON_ZERO_EXIT);
    expect(res.body.details.exitCode).toBe(2);
    expect(res.body.details.stderr).toMatch(/boom from oda/);
  });

  test("happy path returns 200 with DWG bytes", async () => {
    convertDxfToDwg.mockImplementation(async () => ({
      ok: true,
      dwg: Buffer.from("AC1027" + "\0".repeat(32), "binary"),
      adapterVersion: "dwg-conversion-adapter-v2",
      stdout: "",
      stderr: "",
      inputBytes: 100,
      outputBytes: 38,
    }));
    const req = makeReq({ dxf: SAMPLE_DXF, projectName: "Phase5-Test" });
    const res = makeRes();
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect(res.headers["content-type"]).toBe("application/acad");
    expect(res.headers["content-disposition"]).toMatch(/Phase5-Test\.dwg/);
    expect(res.headers["x-dwg-adapter-version"]).toMatch(
      /dwg-conversion-adapter/,
    );
  });
});
