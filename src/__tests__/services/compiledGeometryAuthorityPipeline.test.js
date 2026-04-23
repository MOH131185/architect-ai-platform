import {
  assertGeometryHashContinuity,
  resolveCompiledGeometryAuthority,
  runUnifiedPipeline,
} from "../../services/pipeline/unifiedGeometryPipeline.js";
import hybrid3DPipeline from "../../services/pipeline/hybrid3DPipeline.js";
import { ImageStylerService } from "../../services/ai/ImageStylerService.js";
import { FEATURE_FLAGS, resetFeatureFlags } from "../../config/featureFlags.js";

const TINY_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO0lZuwAAAAASUVORK5CYII=";

function createCompiledProject(overrides = {}) {
  return {
    compiledProjectId: "compiled-project-1",
    projectId: "project-1",
    designFingerprint: "design-fingerprint-1",
    geometryHash: "geom-shared-123",
    footprint: {
      polygon: [
        { x: 0, y: 0 },
        { x: 12, y: 0 },
        { x: 12, y: 8 },
        { x: 0, y: 8 },
      ],
    },
    levels: [{ id: "ground", level_number: 0 }],
    walls: [{ id: "wall-1" }, { id: "wall-2" }],
    validation: { valid: true },
    facades: {
      list: [
        {
          side: "south",
          status: "pass",
          rhythmCount: 5,
          materialZones: [{ material: "brick" }, { material: "timber" }],
          featureFamilies: ["balcony"],
          evidenceSummary: { schemaCredibilityQuality: "pass" },
        },
      ],
    },
    materials: {
      primary: "brick",
      secondary: "timber",
      palette: ["brick", "timber", "slate"],
      facadeZoneMaterials: ["brick", "timber"],
    },
    renderInputs: {
      hero_3d: { dataUrl: TINY_PNG_DATA_URL },
      elevation_north: { dataUrl: TINY_PNG_DATA_URL },
      axonometric: { dataUrl: TINY_PNG_DATA_URL },
    },
    ...overrides,
  };
}

describe("compiled geometry authority continuity", () => {
  const originalFetch = global.fetch;
  const originalOpenAIStyler = FEATURE_FLAGS.openaiStyler;
  const originalGenerateMeshyModel = hybrid3DPipeline.generateMeshyModel;

  beforeEach(() => {
    resetFeatureFlags();
    FEATURE_FLAGS.openaiStyler = true;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        mode: "edit",
        geometryPreserved: true,
        data: [{ url: "https://example.com/stylized.png" }],
      }),
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    FEATURE_FLAGS.openaiStyler = originalOpenAIStyler;
    hybrid3DPipeline.generateMeshyModel = originalGenerateMeshyModel;
  });

  test("unified pipeline keeps 3D and technical outputs on the compiled geometry hash and skips image stylization for technical views", async () => {
    const compiledProject = createCompiledProject();

    const result = await runUnifiedPipeline(
      {
        style: { architecture: "contemporary" },
        program: { floors: 2, buildingType: "residential" },
      },
      {
        compiledProject,
        views: ["hero_3d", "elevation_north"],
        useMeshy: false,
      },
    );

    expect(result.success).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(result.results.metadata.geometryHash).toBe(
      compiledProject.geometryHash,
    );
    expect(result.results.stylizedViews.hero_3d.geometryHash).toBe(
      compiledProject.geometryHash,
    );
    expect(result.results.stylizedViews.elevation_north.geometryHash).toBe(
      compiledProject.geometryHash,
    );
    expect(
      result.results.stylizedViews.elevation_north.sourceMetadata
        .stylizationMode,
    ).toBe("deterministic_passthrough");
    expect(
      result.results.stylizedViews.hero_3d.sourceMetadata.authorityType,
    ).toBe("compiled_project");
    expect(() =>
      assertGeometryHashContinuity(
        result.results.stylizedViews,
        compiledProject.geometryHash,
        "test continuity",
      ),
    ).not.toThrow();
  });

  test("compiled 3D views do not fall back to canonical-pack aliases when compiled render inputs exist", async () => {
    const compiledProject = createCompiledProject();
    const canonicalPack = {
      geometryHash: compiledProject.geometryHash,
      cdsHash: "cds-shared-123",
      designFingerprint: compiledProject.designFingerprint,
      panels: {
        hero_3d: {
          dataUrl: "data:image/svg+xml;base64,Y2Fub25pY2FsLWhlcm8=",
          metadata: { aliasOf: "elevation_south" },
        },
        axonometric: {
          dataUrl: "data:image/svg+xml;base64,Y2Fub25pY2FsLWF4b24=",
          metadata: { aliasOf: "elevation_south" },
        },
        elevation_north: {
          dataUrl: TINY_PNG_DATA_URL,
        },
      },
    };

    const authority = await resolveCompiledGeometryAuthority(
      { designFingerprint: compiledProject.designFingerprint },
      {
        compiledProject,
        canonicalPack,
        views: ["hero_3d", "axonometric", "elevation_north"],
      },
    );

    expect(authority.authorityType).toBe("compiled_project");
    expect(authority.renderInputs.hero_3d.sourceType).toBe(
      "compiled_render_input",
    );
    expect(authority.renderInputs.axonometric.sourceType).toBe(
      "compiled_render_input",
    );
    expect(authority.renderInputs.hero_3d.dataUrl).toBe(
      compiledProject.renderInputs.hero_3d.dataUrl,
    );
    expect(authority.renderInputs.axonometric.dataUrl).toBe(
      compiledProject.renderInputs.axonometric.dataUrl,
    );
    expect(authority.renderInputs.elevation_north.sourceType).toBe(
      "compiled_render_input",
    );
  });

  test("unified pipeline blocks hero stylization until facade, material, and opening authority are finalized", async () => {
    const compiledProject = createCompiledProject({
      facades: { list: [] },
      materials: { palette: [] },
    });

    const result = await runUnifiedPipeline(
      {
        style: { architecture: "contemporary" },
        program: { floors: 2, buildingType: "residential" },
      },
      {
        compiledProject,
        views: ["hero_3d"],
        useMeshy: false,
      },
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Hero generation is blocked/i);
  });

  test("hybrid pipeline exposes compiled geometry metadata on every prepared panel and does not promote Meshy over compiled controls", async () => {
    const compiledProject = createCompiledProject();

    hybrid3DPipeline.generateMeshyModel = jest.fn().mockResolvedValue({
      success: true,
      mappedRenders: {
        hero_3d: { dataUrl: "data:image/png;base64,bWVzaHk=" },
      },
      styleReferenceOnly: true,
    });

    const result = await hybrid3DPipeline.generateAll(
      { designId: "design-1", style: { architecture: "contemporary" } },
      { compiledProject },
      {
        compiledProject,
        panels: ["hero_3d", "elevation_north", "axonometric"],
        useClaude: false,
        useFGL: false,
        useGeometry: false,
        useMeshy: true,
      },
    );

    expect(result.metadata.geometryHash).toBe(compiledProject.geometryHash);
    expect(result.controlImages.hero_3d.geometryHash).toBe(
      compiledProject.geometryHash,
    );
    expect(result.controlImages.elevation_north.geometryHash).toBe(
      compiledProject.geometryHash,
    );
    expect(result.panels.axonometric.geometryHash).toBe(
      compiledProject.geometryHash,
    );
    expect(result.controlImages.hero_3d.sourceMetadata.sourceType).toBe(
      "compiled_render_input",
    );
    expect(result.controlImages.hero_3d.dataUrl).toBe(
      compiledProject.renderInputs.hero_3d.dataUrl,
    );
    expect(result.meshyBaseline.styleReferenceOnly).toBe(true);
  });

  test("hybrid pipeline refuses to prepare hero generation without finalized design authority", async () => {
    const compiledProject = createCompiledProject({
      facades: { list: [] },
      materials: { palette: [] },
    });

    await expect(
      hybrid3DPipeline.generateAll(
        { designId: "design-1", style: { architecture: "contemporary" } },
        { compiledProject },
        {
          compiledProject,
          panels: ["hero_3d"],
          useClaude: false,
          useFGL: false,
          useGeometry: false,
          useMeshy: false,
        },
      ),
    ).rejects.toThrow(/Hero generation is blocked/i);
  });

  test("ImageStylerService requires authoritative source metadata and returns geometry-locked edit metadata", async () => {
    const service = new ImageStylerService({
      apiBaseUrl: "https://example.com",
      fallback: "dall-e-2",
    });

    const result = await service.generateStyledRender({
      panelType: "hero_3d",
      controlImage: TINY_PNG_DATA_URL,
      stylePrompt: "warm exterior daylight",
      dna: {
        style: { architecture: "modern", materials: [{ name: "brick" }] },
        program: { floors: 2, buildingType: "residential" },
      },
      sourceMetadata: {
        authorityType: "compiled_project",
        sourceType: "compiled_render_input",
        geometryHash: "geom-shared-123",
        compiledProjectId: "compiled-project-1",
      },
    });

    expect(result.success).toBe(true);
    expect(result.geometryHash).toBe("geom-shared-123");
    expect(result.metadata.mode).toBe("edit");
    expect(result.metadata.geometryLock).toEqual({
      silhouette: true,
      roofLines: true,
      openings: true,
      massing: true,
    });
    expect(result.metadata.sourceMetadata.authorityType).toBe(
      "compiled_project",
    );

    const requestBody = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(requestBody.image).toBeTruthy();

    await expect(
      service.generateStyledRender({
        panelType: "hero_3d",
        controlImage: TINY_PNG_DATA_URL,
        stylePrompt: "missing metadata",
        dna: {},
      }),
    ).rejects.toThrow(/geometryHash metadata/i);
  });
});
