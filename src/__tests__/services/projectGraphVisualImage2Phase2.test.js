import fs from "fs";
import path from "path";
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

const GEOMETRY_HASH = "geom-phase2-123";
const VISUAL_MANIFEST = {
  manifestId: "visual-manifest-phase2",
  manifestHash: "visual-manifest-hash-phase2",
  geometryHash: GEOMETRY_HASH,
  buildingType: "house",
  buildingTypology: "terraced/row-house dwelling",
  attachmentType: "terraced",
  partyWallSides: ["left", "right"],
  storeyCount: 2,
  roof: { form: "concealed parapet", materialName: "slate" },
  rooflights: { present: false, count: 0, source: "test" },
  primaryFacadeMaterial: {
    name: "London stock brick",
    hex: "#b89b72",
    application: "primary facade",
  },
  secondaryFacadeMaterial: {
    name: "Portland stone",
    hex: "#d8d2c3",
    application: "trim",
  },
  windowMaterial: "painted timber",
  doorMaterial: "painted timber",
  windowRhythm: "regular three-bay",
  windowRhythmFingerprint: { totalWindowCount: 6, bySide: { south: 6 } },
  entranceOrientation: "front-left approach",
};

function makeRenderInputs(overrides = {}) {
  const controlViewTypes = {
    hero_3d: "exterior_massing_opening_control",
    exterior_render: "exterior_massing_opening_control",
    axonometric: "axonometric_massing_opening_control",
    interior_3d: "interior_room_cutaway_control",
  };
  return Object.fromEntries(
    PANEL_TYPES.map((panelType) => [
      panelType,
      {
        svgString: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 80"><rect width="100" height="80"/><text>${panelType}</text></svg>`,
        svgHash: `control-svg-hash-${panelType}`,
        controlViewType: controlViewTypes[panelType],
        width: 100,
        height: 80,
        metadata: {
          width: 100,
          height: 80,
          normalizedViewBox: "0 0 100 80",
          camera: { view: panelType },
          primitiveCount: 6,
          surfaceCount: 6,
          controlViewType: controlViewTypes[panelType],
        },
        ...(overrides[panelType] || {}),
      },
    ]),
  );
}

function makeBaseArgs() {
  return {
    compiledProject: {
      geometryHash: GEOMETRY_HASH,
      levels: [{ id: "ground", height_m: 3.2 }],
      roof: { type: "concealed_parapet" },
    },
    geometryHash: GEOMETRY_HASH,
    brief: {
      project_name: "Phase 2 Visual Test",
      building_type: "house",
      target_storeys: 2,
    },
    visualManifest: VISUAL_MANIFEST,
    programmeSummary: { totalAreaM2: 120 },
    region: "London",
    sheetDesignContext: {
      contextHash: "sheet-design-context-hash",
      programSpaces: [
        { level: "Ground", name: "Living" },
        { level: "Ground", name: "Kitchen" },
      ],
    },
  };
}

async function buildVisuals(args = {}) {
  return buildVisual3DPanelArtifacts({
    ...makeBaseArgs(),
    ...args,
  });
}

describe("ProjectGraph visual image2 Phase 2", () => {
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
        imageProviderUsed: "openai",
        imageRenderFallback: false,
        imageRenderFallbackReason: null,
        model: "gpt-image-2",
        size: "1536x1024",
        requestId: `req-${panelType}`,
        usage: { total_tokens: 10 },
        sourceGeometryHash: GEOMETRY_HASH,
        referenceSource: "compiled_3d_control_svg",
      },
    }));
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test("calls renderProjectGraphPanelImage for every required visual panel", async () => {
    await buildVisuals();

    expect(renderProjectGraphPanelImage).toHaveBeenCalledTimes(4);
    for (const panelType of PANEL_TYPES) {
      expect(renderProjectGraphPanelImage).toHaveBeenCalledWith(
        expect.objectContaining({
          panelType,
          deterministicSvg: expect.stringContaining(panelType),
          geometryHash: GEOMETRY_HASH,
          prompt: expect.stringContaining("=== VISUAL IDENTITY LOCK"),
        }),
      );
    }
    for (const [call] of renderProjectGraphPanelImage.mock.calls) {
      expect(call.deterministicSvg).toContain(
        'data-control-identity-markers="true"',
      );
      expect(call.deterministicSvg).toContain(
        'data-attachment-type="terraced"',
      );
      expect(call.deterministicSvg).toContain("PARTY WALLS: left+right");
      expect(call.deterministicSvg).toContain("ROOFLIGHTS: NONE");
      expect(call.deterministicSvg).toContain("SAME WINDOW LOCATIONS");
    }

    const promptsByPanel = Object.fromEntries(
      renderProjectGraphPanelImage.mock.calls.map(([call]) => [
        call.panelType,
        call.prompt,
      ]),
    );
    expect(promptsByPanel.hero_3d).toMatch(
      /front-left architectural exterior/i,
    );
    expect(promptsByPanel.exterior_render).toMatch(
      /front-left architectural exterior/i,
    );
    expect(promptsByPanel.axonometric).toMatch(
      /technical axonometric\/isometric/i,
    );
    expect(promptsByPanel.interior_3d).toMatch(
      /derived from the same project programme/i,
    );
    expect(promptsByPanel.interior_3d).toContain(
      "VIEW-SPECIFIC HARD BLOCK - INTERIOR_3D",
    );
    expect(promptsByPanel.interior_3d).toContain(
      "Render an indoor interior view only",
    );
    expect(promptsByPanel.interior_3d).toContain(
      "Do not show an exterior facade",
    );
    expect(promptsByPanel.axonometric).toContain(
      "VIEW-SPECIFIC HARD BLOCK - AXONOMETRIC",
    );
    for (const prompt of Object.values(promptsByPanel)) {
      expect(prompt).toContain(`geometryHash: ${GEOMETRY_HASH}`);
      expect(prompt).toContain(
        `visualManifestHash: ${VISUAL_MANIFEST.manifestHash}`,
      );
    }
  });

  test("visual panel artifacts carry shared geometry, manifest, provider, control, and prompt metadata", async () => {
    const visualsByAsset = await buildVisuals();
    const visuals = Object.fromEntries(
      Object.values(visualsByAsset).map((artifact) => [
        artifact.panel_type,
        artifact,
      ]),
    );

    expect(Object.keys(visuals).sort()).toEqual(PANEL_TYPES.slice().sort());
    for (const panelType of PANEL_TYPES) {
      const artifact = visuals[panelType];
      expect(artifact).toMatchObject({
        panel_type: panelType,
        geometryHash: GEOMETRY_HASH,
        sourceGeometryHash: GEOMETRY_HASH,
        visualManifestHash: VISUAL_MANIFEST.manifestHash,
        visualManifestId: VISUAL_MANIFEST.manifestId,
        visualIdentityLocked: true,
        referenceSource: "compiled_3d_control_svg",
        provider: "openai",
        providerUsed: "openai",
        imageProviderUsed: "openai",
        imageRenderFallback: false,
        imageRenderFallbackReason: null,
        model: "gpt-image-2",
        requestId: `req-${panelType}`,
        usage: { total_tokens: 10 },
        controlSvgHash: expect.any(String),
        controlViewType:
          panelType === "interior_3d"
            ? "interior_room_cutaway_control"
            : panelType === "axonometric"
              ? "axonometric_massing_opening_control"
              : "exterior_massing_opening_control",
      });
      expect(artifact.promptHash).toEqual(expect.any(String));
      expect(artifact.metadata.visualControlConsistency).toMatchObject({
        rooflightsPresent: false,
        materialSplit: {
          primary: "London stock brick",
          secondary: "Portland stone",
          roof: "slate",
        },
        windowRhythm: "regular three-bay",
        windowCount: 6,
        attachmentType: "terraced",
      });
      expect(artifact.metadata).toMatchObject({
        geometryHash: GEOMETRY_HASH,
        sourceGeometryHash: GEOMETRY_HASH,
        visualManifestHash: VISUAL_MANIFEST.manifestHash,
        visualManifestId: VISUAL_MANIFEST.manifestId,
        visualIdentityLocked: true,
        referenceSource: "compiled_3d_control_svg",
        providerUsed: "openai",
        imageProviderUsed: "openai",
        imageRenderFallback: false,
        imageRenderFallbackReason: null,
        openaiImageUsed: true,
        openaiRequestId: `req-${panelType}`,
        openaiUsage: { total_tokens: 10 },
        controlSvgHash: expect.any(String),
        controlViewType: artifact.controlViewType,
        promptHash: artifact.promptHash,
      });
    }
  });

  test("strict image generation fails when a required control SVG is missing", async () => {
    process.env.OPENAI_STRICT_IMAGE_GEN = "true";
    ensureCompiledProjectRenderInputs.mockReturnValue({
      ...makeRenderInputs(),
      axonometric: {
        ...makeRenderInputs().axonometric,
        svgString: "",
        svgHash: null,
      },
    });

    await expect(buildVisuals()).rejects.toMatchObject({
      code: "OPENAI_STRICT_IMAGE_GEN_FAILED",
      panelType: "axonometric",
      fallbackReason: "missing_control_svg",
      strictImageGeneration: true,
    });
  });

  test("fallback mode marks deterministic panels without claiming OpenAI success", async () => {
    process.env.PROJECT_GRAPH_IMAGE_GEN_ENABLED = "false";
    renderProjectGraphPanelImage.mockImplementation(async ({ panelType }) => ({
      pngBuffer: null,
      provider: "openai",
      providerUsed: "deterministic",
      imageProviderUsed: "deterministic",
      imageRenderFallback: true,
      imageRenderFallbackReason: "gate_disabled",
      openaiConfigured: true,
      model: "gpt-image-2",
      provenance: {
        panelType,
        provider: "openai",
        providerUsed: "deterministic",
        imageProviderUsed: "deterministic",
        imageRenderFallback: true,
        imageRenderFallbackReason: "gate_disabled",
        sourceGeometryHash: GEOMETRY_HASH,
        referenceSource: "compiled_3d_control_svg",
        model: "gpt-image-2",
        requestId: null,
        usage: null,
      },
    }));

    const visuals = await buildVisuals();

    expect(renderProjectGraphPanelImage).toHaveBeenCalledTimes(4);
    for (const artifact of Object.values(visuals)) {
      expect(artifact.providerUsed).toBe("deterministic");
      expect(artifact.imageProviderUsed).toBe("deterministic");
      expect(artifact.imageRenderFallback).toBe(true);
      expect(artifact.imageRenderFallbackReason).toBe("gate_disabled");
      expect(artifact.metadata.openaiImageUsed).toBe(false);
      expect(artifact.metadata.visualRenderMode).toBe("deterministic_fallback");
    }
  });

  test("ProjectGraph visual path does not use text-only image generation", () => {
    const root = process.cwd();
    const files = [
      "src/services/project/projectGraphVerticalSliceService.js",
      "src/services/render/projectGraphImageRenderer.js",
    ];

    for (const file of files) {
      const text = fs.readFileSync(path.join(root, file), "utf8");
      expect(text).not.toMatch(/\/api\/openai-images/);
      expect(text).not.toMatch(/\/v1\/images\/generations/);
    }
  });
});
