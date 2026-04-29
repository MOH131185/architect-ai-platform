import {
  getProjectGraphImageProviderConfig,
  renderProjectGraphPanelImage,
} from "../../services/render/projectGraphImageRenderer.js";
import { rasteriseSvgToPng } from "../../services/render/svgRasteriser.js";

jest.mock("../../services/render/svgRasteriser.js", () => ({
  rasteriseSvgToPng: jest.fn(),
}));

describe("projectGraphImageRenderer OpenAI provider behavior", () => {
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.OPENAI_IMAGES_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_REASONING_API_KEY;
    delete process.env.REACT_APP_OPENAI_API_KEY;
    delete process.env.PROJECT_GRAPH_IMAGE_GEN_ENABLED;
    delete process.env.OPENAI_STRICT_IMAGE_GEN;
    delete process.env.OPENAI_PROJECT_ID;
    delete process.env.OPENAI_ORG_ID;
    global.fetch = jest.fn();
    rasteriseSvgToPng.mockResolvedValue({
      pngBuffer: Buffer.from("reference-png"),
    });
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  test("PROJECT_GRAPH_IMAGE_GEN_ENABLED=false skips OpenAI with gate_disabled metadata", async () => {
    process.env.PROJECT_GRAPH_IMAGE_GEN_ENABLED = "false";
    process.env.OPENAI_IMAGES_API_KEY = "sk-image-1234";

    const result = await renderProjectGraphPanelImage({
      panelType: "hero_3d",
      deterministicSvg: "<svg><rect width='10' height='10'/></svg>",
      prompt: "Render a building",
      geometryHash: "geo-hash",
    });

    expect(result.pngBuffer).toBeNull();
    expect(result.imageProviderUsed).toBe("deterministic");
    expect(result.imageRenderFallbackReason).toBe("gate_disabled");
    expect(result.openaiConfigured).toBe(true);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(rasteriseSvgToPng).not.toHaveBeenCalled();
  });

  test("image generation enabled without a server-side key records missing_api_key fallback", async () => {
    process.env.PROJECT_GRAPH_IMAGE_GEN_ENABLED = "true";
    process.env.REACT_APP_OPENAI_API_KEY = "sk-browser-only";

    const result = await renderProjectGraphPanelImage({
      panelType: "hero_3d",
      deterministicSvg: "<svg><rect width='10' height='10'/></svg>",
      prompt: "Render a building",
      geometryHash: "geo-hash",
    });

    expect(result.pngBuffer).toBeNull();
    expect(result.openaiConfigured).toBe(false);
    expect(result.imageRenderFallbackReason).toBe("missing_api_key");
    expect(result.provenance.keySource).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("image generation enabled captures OpenAI request id and usage", async () => {
    process.env.PROJECT_GRAPH_IMAGE_GEN_ENABLED = "true";
    process.env.OPENAI_IMAGES_API_KEY = "sk-image-1234";
    process.env.OPENAI_PROJECT_ID = "proj_test";

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: (name) => (name === "x-request-id" ? "req_img_123" : null),
      },
      json: async () => ({
        data: [
          {
            b64_json: Buffer.from("generated-png").toString("base64"),
            revised_prompt: "Revised render prompt",
          },
        ],
        usage: { total_tokens: 1 },
      }),
    });

    const result = await renderProjectGraphPanelImage({
      panelType: "hero_3d",
      deterministicSvg: "<svg><rect width='10' height='10'/></svg>",
      prompt: "Render a building",
      geometryHash: "geo-hash",
    });

    expect(result.pngBuffer.equals(Buffer.from("generated-png"))).toBe(true);
    expect(result.imageProviderUsed).toBe("openai");
    expect(result.imageRenderFallback).toBe(false);
    expect(result.provenance.requestId).toBe("req_img_123");
    expect(result.provenance.usage).toEqual({ total_tokens: 1 });
    expect(result.provenance.keySource).toBe("OPENAI_IMAGES_API_KEY");
    expect(result.provenance.projectConfigured).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.openai.com/v1/images/edits",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer sk-image-1234",
          "OpenAI-Project": "proj_test",
        }),
      }),
    );
  });

  test("strict image generation fails instead of silently falling back", async () => {
    process.env.PROJECT_GRAPH_IMAGE_GEN_ENABLED = "true";
    process.env.OPENAI_STRICT_IMAGE_GEN = "true";

    await expect(
      renderProjectGraphPanelImage({
        panelType: "hero_3d",
        deterministicSvg: "<svg><rect width='10' height='10'/></svg>",
        prompt: "Render a building",
        geometryHash: "geo-hash",
      }),
    ).rejects.toMatchObject({
      code: "OPENAI_STRICT_IMAGE_GEN_FAILED",
      fallbackReason: "missing_api_key",
      strictImageGeneration: true,
    });
  });

  test("provider config reports image key precedence without REACT_APP fallback", () => {
    process.env.PROJECT_GRAPH_IMAGE_GEN_ENABLED = "true";
    process.env.REACT_APP_OPENAI_API_KEY = "sk-browser";
    process.env.OPENAI_API_KEY = "sk-base-5678";
    process.env.OPENAI_IMAGES_API_KEY = "sk-image-1234";

    expect(getProjectGraphImageProviderConfig()).toMatchObject({
      imageGenEnabled: true,
      openaiConfigured: true,
      keySource: "OPENAI_IMAGES_API_KEY",
      keyLast4: "1234",
    });
  });
});
