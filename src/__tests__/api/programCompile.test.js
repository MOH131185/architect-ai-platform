import programCompileHandler from "../../../api/program/compile.js";

function createMockResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) {
      this.headers[name] = value;
      return this;
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
  };
}

describe("/api/program/compile", () => {
  test("compiles non-residential ProjectGraph programme spaces", async () => {
    const req = {
      method: "POST",
      headers: {},
      body: {
        category: "commercial",
        subType: "retail",
        totalAreaM2: 900,
        floorCount: 2,
        floorCountLocked: true,
      },
    };
    const res = createMockResponse();

    await programCompileHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.pipelineVersion).toBe("project-graph-project-types-v1");
    expect(res.body.programSpaces.length).toBeGreaterThan(0);
    expect(res.body.programSpaces[0]).toEqual(
      expect.objectContaining({
        name: expect.any(String),
        area: expect.any(Number),
        levelIndex: expect.any(Number),
      }),
    );
  });

  test("unsupported project type fails clearly before generation", async () => {
    const req = {
      method: "POST",
      headers: {},
      body: {
        category: "commercial",
        subType: "casino",
        totalAreaM2: 900,
      },
    };
    const res = createMockResponse();

    await programCompileHandler(req, res);

    expect(res.statusCode).toBe(422);
    expect(res.body).toEqual(
      expect.objectContaining({
        success: false,
        code: "PROJECT_TYPE_UNSUPPORTED",
      }),
    );
  });
});
