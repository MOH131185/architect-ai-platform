/**
 * CL-1: provider-abstraction tests for projectGraphImageRenderer.
 *
 * These tests cover the NEW behaviour introduced by the registry seam —
 * mock provider, replicate stub, unknown provider, and the structured
 * `sourceGaps` field. Pre-existing OpenAI behaviour is covered in
 * `../projectGraphImageRenderer.test.js`; both suites must stay green.
 */

import { renderProjectGraphPanelImage } from "../../../services/render/projectGraphImageRenderer.js";
import {
  selectProvider,
  describeProviderRegistry,
  KNOWN_PROVIDER_NAMES,
  RENDER_PROVIDER_ENV_VAR,
} from "../../../services/render/providers/renderProviderRegistry.js";
import { rasteriseSvgToPng } from "../../../services/render/svgRasteriser.js";
import { validateTechnicalPanelAuthority } from "../../../services/validation/drawingConsistencyChecks.js";

jest.mock("../../../services/render/svgRasteriser.js", () => ({
  rasteriseSvgToPng: jest.fn(),
}));

const REFERENCE_PNG = Buffer.from("rasterised-control-svg-bytes");
const VALID_ARGS = {
  panelType: "hero_3d",
  deterministicSvg: "<svg><rect width='10' height='10'/></svg>",
  prompt: "Render a 1.5-storey UK vernacular brick farmhouse",
  geometryHash: "geo-hash-abc",
};

describe("renderProjectGraphPanelImage provider abstraction (CL-1)", () => {
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
    delete process.env.PROJECT_GRAPH_RENDER_PROVIDER;
    global.fetch = jest.fn(() => {
      throw new Error("fetch should not be invoked when provider != openai");
    });
    rasteriseSvgToPng.mockResolvedValue({ pngBuffer: REFERENCE_PNG });
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  describe("registry", () => {
    test("known providers", () => {
      expect(KNOWN_PROVIDER_NAMES).toEqual(
        expect.arrayContaining(["openai", "mock", "replicate"]),
      );
    });

    test("no env → gate_disabled (no provider selected)", () => {
      const selection = selectProvider({ env: {} });
      expect(selection.provider).toBeNull();
      expect(selection.reason).toBe("gate_disabled");
    });

    test("PROJECT_GRAPH_IMAGE_GEN_ENABLED=true (no explicit) → legacy_implicit openai", () => {
      const selection = selectProvider({
        env: { PROJECT_GRAPH_IMAGE_GEN_ENABLED: "true" },
      });
      expect(selection.resolvedName).toBe("openai");
      expect(selection.reason).toBe("legacy_implicit");
    });

    test("PROJECT_GRAPH_RENDER_PROVIDER=mock → explicit mock", () => {
      const selection = selectProvider({
        env: { [RENDER_PROVIDER_ENV_VAR]: "mock" },
      });
      expect(selection.resolvedName).toBe("mock");
      expect(selection.reason).toBe("explicit");
    });

    test("PROJECT_GRAPH_RENDER_PROVIDER=foo → unknown_provider", () => {
      const selection = selectProvider({
        env: { [RENDER_PROVIDER_ENV_VAR]: "foo" },
      });
      expect(selection.provider).toBeNull();
      expect(selection.reason).toBe("unknown_provider");
      expect(selection.explicitRequest).toBe("foo");
    });

    test("describeProviderRegistry returns diagnostics", () => {
      const description = describeProviderRegistry({
        PROJECT_GRAPH_RENDER_PROVIDER: "mock",
      });
      expect(description.selectedProvider).toBe("mock");
      expect(description.selectionReason).toBe("explicit");
      expect(description.providers.mock.configured).toBe(true);
      expect(description.providers.replicate.configured).toBe(false);
    });
  });

  describe("renderer dispatch", () => {
    test("PROJECT_GRAPH_RENDER_PROVIDER=mock returns null PNG + deterministic markers (no synthetic render)", async () => {
      // Audit fix: mock must NEVER masquerade as a successful render. It
      // returns the deterministic-fallback shape so the slice service keeps
      // the compiled control SVG as the panel asset.
      process.env.PROJECT_GRAPH_RENDER_PROVIDER = "mock";

      const result = await renderProjectGraphPanelImage(VALID_ARGS);

      expect(result.pngBuffer).toBeNull();
      expect(result.provider).toBe("mock");
      expect(result.providerUsed).toBe("deterministic");
      expect(result.imageProviderUsed).toBe("deterministic");
      expect(result.imageRenderFallback).toBe(true);
      expect(result.imageRenderFallbackReason).toBe("mock_provider");
      expect(result.fallbackReason).toBe("mock_provider");
      expect(result.sourceGaps).toEqual(["MOCK_PROVIDER_NO_RENDER"]);
      expect(result.provenance.sourceGeometryHash).toBe("geo-hash-abc");
      expect(global.fetch).not.toHaveBeenCalled();
      // No rasterisation either — mock unavailable short-circuits before the
      // orchestrator's rasteriseSvgToPng call.
      expect(rasteriseSvgToPng).not.toHaveBeenCalled();
    });

    test("mock provenance mirrors deterministic stamps so the slice service stamps providerUsed=deterministic", async () => {
      // The slice service uses
      //   const provider = renderProvenance ? "openai" : "deterministic";
      // at projectGraphVerticalSliceService.js:9757 to decide artifact
      // metadata. renderProvenance is set only when renderResult.pngBuffer
      // is truthy AND the IoU gate passes. With pngBuffer=null the slice
      // service breaks the render loop early (line 9641) and renderProvenance
      // stays null → "deterministic" everywhere.
      process.env.PROJECT_GRAPH_RENDER_PROVIDER = "mock";

      const result = await renderProjectGraphPanelImage(VALID_ARGS);

      // Reproduce the slice service's gating condition verbatim.
      const sliceRenderProvenance = result.pngBuffer ? result.provenance : null;
      expect(sliceRenderProvenance).toBeNull();

      // What the slice would stamp under that condition.
      const sliceArtifactProvider = sliceRenderProvenance
        ? "openai"
        : "deterministic";
      const sliceArtifactAssetType = sliceRenderProvenance
        ? "geometry_locked_presentation_svg"
        : "compiled_3d_control_svg";

      expect(sliceArtifactProvider).toBe("deterministic");
      expect(sliceArtifactAssetType).toBe("compiled_3d_control_svg");
      // And the renderer's own metadata must not advertise openai/photoreal.
      expect(result.providerUsed).not.toBe("openai");
      expect(result.imageProviderUsed).not.toBe("openai");
      expect(result.provenance.providerUsed).toBe("deterministic");
      expect(result.provenance.imageProviderUsed).toBe("deterministic");
    });

    test("PROJECT_GRAPH_RENDER_PROVIDER=replicate stub falls back with PROVIDER_NOT_IMPLEMENTED gap", async () => {
      process.env.PROJECT_GRAPH_RENDER_PROVIDER = "replicate";

      const result = await renderProjectGraphPanelImage(VALID_ARGS);

      expect(result.pngBuffer).toBeNull();
      expect(result.provider).toBe("replicate");
      expect(result.imageProviderUsed).toBe("deterministic");
      expect(result.imageRenderFallbackReason).toBe("PROVIDER_NOT_IMPLEMENTED");
      expect(result.sourceGaps).toEqual(["PROVIDER_NOT_IMPLEMENTED"]);
      expect(global.fetch).not.toHaveBeenCalled();
      expect(rasteriseSvgToPng).not.toHaveBeenCalled();
    });

    test("PROJECT_GRAPH_RENDER_PROVIDER=foo (unknown) returns UNKNOWN_PROVIDER gap", async () => {
      process.env.PROJECT_GRAPH_RENDER_PROVIDER = "foo";

      const result = await renderProjectGraphPanelImage(VALID_ARGS);

      expect(result.pngBuffer).toBeNull();
      expect(result.imageRenderFallbackReason).toBe("unknown_provider");
      expect(result.sourceGaps).toEqual(["UNKNOWN_PROVIDER:foo"]);
      expect(rasteriseSvgToPng).not.toHaveBeenCalled();
    });

    test("no env at all → gate_disabled with IMAGE_GEN_DISABLED gap", async () => {
      const result = await renderProjectGraphPanelImage(VALID_ARGS);

      expect(result.pngBuffer).toBeNull();
      expect(result.imageProviderUsed).toBe("deterministic");
      expect(result.imageRenderFallbackReason).toBe("gate_disabled");
      expect(result.sourceGaps).toEqual(["IMAGE_GEN_DISABLED"]);
      expect(rasteriseSvgToPng).not.toHaveBeenCalled();
    });

    test("explicit mock with missing deterministicSvg falls back without rasterising", async () => {
      process.env.PROJECT_GRAPH_RENDER_PROVIDER = "mock";

      const result = await renderProjectGraphPanelImage({
        ...VALID_ARGS,
        deterministicSvg: "",
      });

      expect(result.pngBuffer).toBeNull();
      expect(result.imageRenderFallbackReason).toBe("missing_control_svg");
      expect(result.provider).toBe("mock");
      expect(rasteriseSvgToPng).not.toHaveBeenCalled();
    });

    test("strict mode does NOT throw for explicit mock provider failures", async () => {
      // Strict mode is OpenAI-specific; selecting mock explicitly should
      // never escalate to a strict throw even when the gate flag is set.
      process.env.PROJECT_GRAPH_RENDER_PROVIDER = "mock";
      process.env.OPENAI_STRICT_IMAGE_GEN = "true";

      const result = await renderProjectGraphPanelImage({
        ...VALID_ARGS,
        prompt: "",
      });

      expect(result.imageRenderFallbackReason).toBe("missing_prompt");
      expect(result.provider).toBe("mock");
    });

    test("rendered result always carries geometryHash + deterministic provenance for mock", async () => {
      process.env.PROJECT_GRAPH_RENDER_PROVIDER = "mock";

      const result = await renderProjectGraphPanelImage(VALID_ARGS);

      expect(result.provenance).toMatchObject({
        sourceGeometryHash: "geo-hash-abc",
        provider: "mock",
        providerUsed: "deterministic",
        imageProviderUsed: "deterministic",
        imageRenderFallback: true,
        imageRenderFallbackReason: "mock_provider",
        referenceSource: "compiled_3d_control_svg",
      });
    });
  });

  describe("technical-panel non-contamination (regression)", () => {
    // CL-1 refactor must not change the drawing-consistency contract: any
    // technical panel stamped with an image-model provider stays a blocker,
    // and a clean deterministic-SVG technical panel passes.
    const TECHNICAL_GEOMETRY_HASH = "tech-geo-hash-1";
    const TECHNICAL_SVG =
      '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>';

    function cleanTechnicalPanels(overrides = {}) {
      const make = (type) => ({
        type,
        svg: TECHNICAL_SVG,
        geometryHash: TECHNICAL_GEOMETRY_HASH,
        sourceGeometryHash: TECHNICAL_GEOMETRY_HASH,
        source_model_hash: TECHNICAL_GEOMETRY_HASH,
        technicalDrawing: true,
        renderer: "deterministic_svg",
        providerUsed: "deterministic_svg",
        imageProviderUsed: "none",
        source: "compiled_project_technical_panel",
        ...(overrides[type] || {}),
      });
      return [
        make("floor_plan_ground"),
        make("elevation_north"),
        make("section_AA"),
      ];
    }

    test("clean deterministic-SVG technical panels pass after CL-1", () => {
      const result = validateTechnicalPanelAuthority({
        technicalPanels: cleanTechnicalPanels(),
        expectedGeometryHash: TECHNICAL_GEOMETRY_HASH,
      });
      expect(result.errors).toEqual([]);
    });

    test("technical panel stamped imageProviderUsed=openai still trips TECHNICAL_PANEL_IMAGE_MODEL_USED", () => {
      const result = validateTechnicalPanelAuthority({
        technicalPanels: cleanTechnicalPanels({
          floor_plan_ground: {
            providerUsed: "openai",
            imageProviderUsed: "openai",
          },
        }),
        expectedGeometryHash: TECHNICAL_GEOMETRY_HASH,
      });
      expect(result.errors.map((error) => error.code)).toContain(
        "TECHNICAL_PANEL_IMAGE_MODEL_USED",
      );
    });
  });
});
