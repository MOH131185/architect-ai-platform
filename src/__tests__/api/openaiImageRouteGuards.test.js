import openaiImageStylizeHandler from "../../../api/openai-image-stylize.js";
import openaiImagesHandler from "../../../api/openai-images.js";

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

describe("OpenAI image route project panel guards", () => {
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.OPENAI_IMAGES_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_REASONING_API_KEY;
    global.fetch = jest.fn();
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  test.each(["hero_3d", "exterior_render", "axonometric", "interior_3d"])(
    "openai-image-stylize requires a control image for %s",
    async (panelType) => {
      const req = {
        method: "POST",
        body: {
          prompt: "Render this ProjectGraph panel",
          panelType,
        },
      };
      const res = createMockResponse();

      await openaiImageStylizeHandler(req, res);

      expect(res.statusCode).toBe(422);
      expect(res.body).toMatchObject({
        error: "MISSING_GEOMETRY_CONTROL_IMAGE",
        panelType,
      });
      expect(global.fetch).not.toHaveBeenCalled();
    },
  );

  test("openai-image-stylize rejects unsupported panel types", async () => {
    const req = {
      method: "POST",
      body: {
        prompt: "Render unsupported panel",
        panelType: "site_plan",
        image: "data:image/png;base64,ZmFrZQ==",
      },
    };
    const res = createMockResponse();

    await openaiImageStylizeHandler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("INVALID_PANEL_TYPE");
    expect(res.body.message).toContain("exterior_render");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test.each(["floor_plan_ground", "section_AA", "hero_3d"])(
    "openai-images rejects text-only generation for project panel %s",
    async (panelType) => {
      const req = {
        method: "POST",
        headers: {},
        body: {
          prompt: "Generate an architectural project panel",
          panelType,
        },
      };
      const res = createMockResponse();

      await openaiImagesHandler(req, res);

      expect(res.statusCode).toBe(422);
      expect(res.body).toMatchObject({
        error: "PROJECT_PANEL_REQUIRES_GEOMETRY_LOCK",
      });
      expect(global.fetch).not.toHaveBeenCalled();
    },
  );

  test("openai-images rejects nested project panel metadata", async () => {
    const req = {
      method: "POST",
      headers: {},
      body: {
        prompt: "Generate an architectural visual",
        metadata: { panelType: "axonometric" },
      },
    };
    const res = createMockResponse();

    await openaiImagesHandler(req, res);

    expect(res.statusCode).toBe(422);
    expect(res.body.error).toBe("PROJECT_PANEL_REQUIRES_GEOMETRY_LOCK");
    expect(res.body.panelType).toBe("axonometric");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("openai-images keeps non-project image generation on the normal key path", async () => {
    const req = {
      method: "POST",
      headers: {},
      body: {
        prompt: "Generate a generic material mood image",
        panelType: "mood_image",
      },
    };
    const res = createMockResponse();

    await openaiImagesHandler(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe("OPENAI_IMAGE_API_KEY_MISSING");
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
