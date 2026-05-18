/**
 * CL-1 (audit fix): vertical-slice contract for PROJECT_GRAPH_RENDER_PROVIDER=mock.
 *
 * The audit blocker was: an earlier mock implementation returned a pngBuffer +
 * provenance, and `projectGraphVerticalSliceService.js` treats any truthy
 * `renderProvenance` as a successful OpenAI photoreal render
 * (lines 9757-9760, 9804). That would have leaked mock output through as
 * `providerUsed=openai`, `imageProviderUsed=openai`,
 * `asset_type=geometry_locked_presentation_svg`.
 *
 * This test exercises the REAL `renderProjectGraphPanelImage` through
 * `buildVisual3DPanelArtifacts` with the mock provider selected and asserts
 * the artifact metadata is unambiguously deterministic — no photoreal stamps
 * anywhere. Any future regression that re-introduces a pngBuffer from the
 * mock path will trip these assertions.
 */

import {
  buildVisual3DPanelArtifacts,
  buildResultPanelMap,
} from "../../services/project/projectGraphVerticalSliceService.js";
import { ensureCompiledProjectRenderInputs } from "../../services/compiler/compiledProjectRenderInputs.js";
import { MOCK_PROVIDER_SOURCE_GAP } from "../../services/render/providers/mockProjectGraphRenderProvider.js";

jest.mock("../../services/compiler/compiledProjectRenderInputs.js", () => ({
  ensureCompiledProjectRenderInputs: jest.fn(),
}));

const PANEL_TYPES = [
  "hero_3d",
  "exterior_render",
  "axonometric",
  "interior_3d",
];
const GEOMETRY_HASH = "geom-mock-provider-contract";

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
    brief: { project_name: "Mock Provider Contract", building_type: "house" },
    visualManifest: { manifestId: "vm-mock", manifestHash: "vm-hash-mock" },
    programmeSummary: { totalAreaM2: 100 },
    region: "London",
  };
}

describe("buildVisual3DPanelArtifacts — PROJECT_GRAPH_RENDER_PROVIDER=mock contract", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    // Even with the legacy gate ON, the explicit mock provider must take
    // precedence and produce deterministic-fallback metadata.
    process.env.PROJECT_GRAPH_IMAGE_GEN_ENABLED = "true";
    process.env.PROJECT_GRAPH_RENDER_PROVIDER = "mock";
    process.env.OPENAI_STRICT_IMAGE_GEN = "false";
    // Set a key so the openai validateAvailable would pass — proves mock
    // wins over a fully-configured OpenAI environment.
    process.env.OPENAI_IMAGES_API_KEY = "sk-test-mock-contract";
    jest.clearAllMocks();
    ensureCompiledProjectRenderInputs.mockReturnValue(makeRenderInputs());
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test("each visual artifact carries deterministic stamps, never openai/photoreal", async () => {
    const artifacts = await buildVisual3DPanelArtifacts(makeBaseArgs());

    const artifactList = Object.values(artifacts);
    expect(artifactList.length).toBe(PANEL_TYPES.length);

    const observedPanelTypes = artifactList
      .map((a) => a.panel_type || a.panelType)
      .sort();
    expect(observedPanelTypes).toEqual([...PANEL_TYPES].sort());

    for (const artifact of artifactList) {
      const panelType = artifact.panel_type || artifact.panelType;

      // Asset type must remain the compiled control SVG — never the
      // geometry-locked photoreal wrapper.
      expect(artifact.asset_type).toBe("compiled_3d_control_svg");
      expect(artifact.asset_type).not.toBe("geometry_locked_presentation_svg");

      // Per-panel metadata stamps required by the audit.
      expect(artifact.metadata.imageRenderFallback).toBe(true);
      expect(artifact.metadata.imageRenderFallbackReason).toBe("mock_provider");
      expect(artifact.metadata.providerUsed).toBe("deterministic");
      expect(artifact.metadata.imageProviderUsed).toBe("deterministic");

      // Negative assertions: none of the photoreal markers may appear.
      expect(artifact.metadata.providerUsed).not.toBe("openai");
      expect(artifact.metadata.imageProviderUsed).not.toBe("openai");
      expect(artifact.metadata.visualRenderMode).not.toBe(
        "photoreal_image_gen",
      );
      expect(artifact.metadata.openaiImageUsed).not.toBe(true);

      // CL-1 (re-audit fix): sourceGaps must propagate through the artifact
      // top-level AND artifact.metadata so downstream UI/QA can explain WHY
      // the panel landed on deterministic fallback.
      expect(Array.isArray(artifact.sourceGaps)).toBe(true);
      expect(artifact.sourceGaps).toContain(MOCK_PROVIDER_SOURCE_GAP);
      expect(Array.isArray(artifact.metadata.sourceGaps)).toBe(true);
      expect(artifact.metadata.sourceGaps).toContain(MOCK_PROVIDER_SOURCE_GAP);
      // Literal pin so a refactor cannot rename the gap unnoticed.
      expect(MOCK_PROVIDER_SOURCE_GAP).toBe("MOCK_PROVIDER_NO_RENDER");

      // Sanity: panel_type is one of the four 3D types and geometry hash
      // chain is preserved.
      expect(panelType).toMatch(
        /^(hero_3d|exterior_render|axonometric|interior_3d)$/,
      );
      expect(
        artifact.metadata.sourceGeometryHash ||
          artifact.metadata.geometryHash ||
          artifact.geometryHash ||
          GEOMETRY_HASH,
      ).toBe(GEOMETRY_HASH);
    }
  });

  test("buildResultPanelMap propagates sourceGaps into the result panel projection", async () => {
    // CL-1 (re-audit fix): the panelMap projection consumed by the UI/result
    // builders must carry sourceGaps both at the top level and inside the
    // cloned metadata. Otherwise downstream consumers cannot tell mock
    // fallback from a real deterministic-fallback.
    const artifacts = await buildVisual3DPanelArtifacts(makeBaseArgs());
    const panelMap = buildResultPanelMap(artifacts);

    expect(Object.keys(panelMap).sort()).toEqual([...PANEL_TYPES].sort());

    for (const panelType of PANEL_TYPES) {
      const panel = panelMap[panelType];
      expect(panel).toBeDefined();
      expect(Array.isArray(panel.sourceGaps)).toBe(true);
      expect(panel.sourceGaps).toContain(MOCK_PROVIDER_SOURCE_GAP);
      expect(Array.isArray(panel.metadata.sourceGaps)).toBe(true);
      expect(panel.metadata.sourceGaps).toContain(MOCK_PROVIDER_SOURCE_GAP);

      // Negative: panelMap must not advertise photoreal markers either.
      expect(panel.metadata.providerUsed).not.toBe("openai");
      expect(panel.metadata.imageProviderUsed).not.toBe("openai");
      expect(panel.sourceType).toBe("compiled_3d_control_svg");
    }
  });
});
