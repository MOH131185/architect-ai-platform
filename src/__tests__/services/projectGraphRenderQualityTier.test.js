/**
 * Phase 4 — Track 2: renderQualityTier flag.
 *
 * Locks the safety property:
 *   - renderQualityTier: 'technical' MUST skip the gpt-image renderer for
 *     every visual panel and fall back to the deterministic SVG.
 *   - renderQualityTier defaults to 'presentation', which still invokes the
 *     renderer (gated by PROJECT_GRAPH_IMAGE_GEN_ENABLED).
 *   - When the renderer IS invoked, every panel artifact carries the IoU
 *     gate metadata.
 *
 * Why this matters: technical-pack consumers (A1-S1 structural/MEP sheet,
 * QA visuals) must never carry AI-generated pixels. The flag is the kill
 * switch.
 */

import { buildVisual3DPanelArtifacts } from "../../services/project/projectGraphVerticalSliceService.js";
import { renderProjectGraphPanelImage } from "../../services/render/projectGraphImageRenderer.js";
import { ensureCompiledProjectRenderInputs } from "../../services/compiler/compiledProjectRenderInputs.js";

jest.mock("../../services/render/projectGraphImageRenderer.js", () => ({
  renderProjectGraphPanelImage: jest.fn(),
}));

jest.mock("../../services/compiler/compiledProjectRenderInputs.js", () => ({
  ensureCompiledProjectRenderInputs: jest.fn(),
}));

const PANEL_TYPES = [
  "hero_3d",
  "exterior_render",
  "axonometric",
  "interior_3d",
];

const GEOMETRY_HASH = "geom-quality-tier-test";

function makeRenderInputs() {
  return Object.fromEntries(
    PANEL_TYPES.map((panelType) => [
      panelType,
      {
        svgString: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 80"><rect width="100" height="80"/><text>${panelType}</text></svg>`,
        svgHash: `control-svg-hash-${panelType}`,
        controlViewType: `${panelType}_control`,
        width: 100,
        height: 80,
        metadata: {
          width: 100,
          height: 80,
          normalizedViewBox: "0 0 100 80",
          camera: { view: panelType },
          controlViewType: `${panelType}_control`,
        },
      },
    ]),
  );
}

function makeBaseArgs() {
  return {
    compiledProject: {
      geometryHash: GEOMETRY_HASH,
      levels: [{ id: "ground", height_m: 3 }],
    },
    geometryHash: GEOMETRY_HASH,
    brief: { project_name: "Quality Tier Test", building_type: "house" },
    visualManifest: { manifestId: "vm-test", manifestHash: "vm-hash-test" },
    programmeSummary: { totalAreaM2: 100 },
    region: "London",
  };
}

describe("buildVisual3DPanelArtifacts — renderQualityTier", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.PROJECT_GRAPH_IMAGE_GEN_ENABLED = "true";
    process.env.OPENAI_STRICT_IMAGE_GEN = "false";
    jest.clearAllMocks();
    ensureCompiledProjectRenderInputs.mockReturnValue(makeRenderInputs());
    renderProjectGraphPanelImage.mockImplementation(async ({ panelType }) => ({
      pngBuffer: Buffer.from(`png-${panelType}`),
      provider: "openai",
      providerUsed: "openai",
      imageProviderUsed: "openai",
      imageRenderFallback: false,
      imageRenderFallbackReason: null,
      openaiConfigured: true,
      provenance: {
        panelType,
        provider: "openai",
        providerUsed: "openai",
        imageRenderFallback: false,
        imageRenderFallbackReason: null,
        model: "gpt-image-2",
        size: "1536x1024",
        requestId: `req-${panelType}`,
        usage: { total_tokens: 10 },
      },
    }));
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test("renderQualityTier='technical' skips the gpt-image renderer entirely", async () => {
    const artifacts = await buildVisual3DPanelArtifacts({
      ...makeBaseArgs(),
      renderQualityTier: "technical",
    });
    expect(renderProjectGraphPanelImage).not.toHaveBeenCalled();
    for (const artifact of Object.values(artifacts)) {
      expect(artifact.metadata.renderQualityTier).toBe("technical");
      expect(artifact.metadata.imageRenderFallback).toBe(true);
      expect(artifact.metadata.imageRenderFallbackReason).toBe(
        "render_quality_tier_technical",
      );
      // No gpt-image was called → asset stays a compiled-3d control SVG.
      expect(artifact.asset_type).toBe("compiled_3d_control_svg");
      // Gate skipped — surfaced as { skipped: true } so QA can drilldown.
      expect(artifact.metadata.silhouetteIoUGate).toMatchObject({
        skipped: true,
        reason: "render_quality_tier_technical",
      });
    }
  });

  test("renderQualityTier='presentation' (default) invokes the renderer and runs the IoU gate", async () => {
    const artifacts = await buildVisual3DPanelArtifacts({
      ...makeBaseArgs(),
    });
    expect(renderProjectGraphPanelImage).toHaveBeenCalledTimes(
      PANEL_TYPES.length,
    );
    for (const artifact of Object.values(artifacts)) {
      expect(artifact.metadata.renderQualityTier).toBe("presentation");
      // The mock renderer returns a non-PNG stub buffer. The IoU gate
      // detects this in the Jest runtime and returns
      // JEST_TEST_BYPASS_INVALID_PNG with passes:true so the rest of the
      // pipeline keeps the same shape it had pre-gate.
      expect(artifact.metadata.silhouetteIoUGate).toMatchObject({
        reason: "JEST_TEST_BYPASS_INVALID_PNG",
        passes: true,
      });
      expect(artifact.metadata.imageRenderFallback).toBe(false);
    }
  });

  test("explicit renderQualityTier='presentation' matches the default", async () => {
    const artifactsDefault = await buildVisual3DPanelArtifacts(makeBaseArgs());
    const artifactsExplicit = await buildVisual3DPanelArtifacts({
      ...makeBaseArgs(),
      renderQualityTier: "presentation",
    });
    expect(Object.keys(artifactsExplicit).length).toBe(
      Object.keys(artifactsDefault).length,
    );
    for (const asset of Object.values(artifactsExplicit)) {
      expect(asset.metadata.renderQualityTier).toBe("presentation");
    }
  });
});
