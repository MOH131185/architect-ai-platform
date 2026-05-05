import {
  stampGenerationLifecycleOnArtifacts,
  __projectGraphVerticalSliceInternals,
} from "../../services/project/projectGraphVerticalSliceService.js";

jest.setTimeout(240000);

const {
  normalizeBrief,
  buildSiteContext,
  buildClimatePack,
  buildLocalStylePack,
  buildProgramme,
  buildProjectGeometryFromProgramme,
  compileProject,
} = __projectGraphVerticalSliceInternals;

function createSeedLifecycleInput(overrides = {}) {
  const briefOverrides = overrides.brief || {};
  const input = {
    brief: {
      project_name: "Seed Lifecycle House",
      building_type: "residential",
      target_gia_m2: 180,
      target_storeys: 2,
      site_input: {
        postcode: "N1 1AA",
        lat: 51.5416,
        lon: -0.1022,
      },
      style_keywords: ["contextual brick", "calm modern"],
      ...briefOverrides,
    },
    sitePolygon: [
      { lat: 51.54175, lng: -0.1024 },
      { lat: 51.54175, lng: -0.10195 },
      { lat: 51.54145, lng: -0.10195 },
      { lat: 51.54145, lng: -0.1024 },
    ],
    siteMetrics: {
      areaM2: 1040,
      orientationDeg: 8,
    },
    contextProviders: { useDefaultFetch: false },
    ...overrides,
  };
  if (overrides.brief) {
    input.brief = {
      ...input.brief,
      ...briefOverrides,
    };
  }
  return input;
}

function buildCompiledGeometryHash(input) {
  const brief = normalizeBrief(input);
  const site = buildSiteContext({
    brief,
    sitePolygon: input.sitePolygon,
    siteMetrics: input.siteMetrics,
  });
  const climate = buildClimatePack(brief, site);
  const localStyle = buildLocalStylePack(brief, site, climate);
  const programme = buildProgramme({
    brief,
    programSpaces: input.programSpaces || [],
  });
  const projectGeometry = buildProjectGeometryFromProgramme({
    brief,
    site,
    programme,
    localStyle,
    climate,
  });
  const compiledProject = compileProject({
    projectGeometry,
    masterDNA: {
      projectName: brief.project_name,
      projectID: projectGeometry.project_id,
      styleDNA: projectGeometry.metadata.style_dna,
      rooms: programme.spaces,
    },
    locationData: {
      address: brief.site_input.address,
      coordinates: { lat: site.lat, lng: site.lon },
      climate: { type: climate.weather_source },
      localMaterials: localStyle.material_palette,
    },
  });
  return {
    brief,
    compiledProject,
    geometryHash: compiledProject.geometryHash,
  };
}

describe("ProjectGraph generation seed lifecycle", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.PROJECT_GRAPH_IMAGE_GEN_ENABLED = "false";
    process.env.OPENAI_STRICT_IMAGE_GEN = "false";
    process.env.OPENAI_API_KEY = "sk-test-openai-base";
    process.env.OPENAI_IMAGES_API_KEY = "sk-test-openai-images";
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test("new ProjectGraph requests without explicit seeds receive different generation seeds", () => {
    const first = normalizeBrief(createSeedLifecycleInput());
    const second = normalizeBrief(createSeedLifecycleInput());

    expect(first.generation_seed).toEqual(expect.any(Number));
    expect(second.generation_seed).toEqual(expect.any(Number));
    expect(second.generation_seed).not.toBe(first.generation_seed);
    expect(first.seedSource).toBe("auto_new_project");
    expect(first.variationMode).toBe("new_design");
  });

  test("same-project regeneration reuses the previous generation seed", () => {
    const brief = normalizeBrief(
      createSeedLifecycleInput({
        projectId: "project-existing",
        existingGeometryHash: "geom-existing",
        existingGenerationSeed: 918273,
      }),
    );

    expect(brief.generation_seed).toBe(918273);
    expect(brief.seedSource).toBe("reused_existing_project");
    expect(brief.variationMode).toBe("same_geometry_regen");
  });

  test("style-only modify keeps the compiled geometry hash stable", () => {
    const base = buildCompiledGeometryHash(
      createSeedLifecycleInput({ seed: 7001 }),
    );
    const styleOnly = buildCompiledGeometryHash(
      createSeedLifecycleInput({
        seed: 7001,
        projectId: "project-existing",
        existingGeometryHash: base.geometryHash,
        variationMode: "style_modify",
        modifyRequest: {
          customPrompt: "Use a warmer material palette",
          variationMode: "style_modify",
        },
      }),
    );

    expect(styleOnly.brief.variationMode).toBe("style_modify");
    expect(styleOnly.geometryHash).toBe(base.geometryHash);
  });

  test("layout modify creates a different compiled geometry hash", () => {
    const base = buildCompiledGeometryHash(
      createSeedLifecycleInput({ seed: 7101 }),
    );
    const layoutModified = buildCompiledGeometryHash(
      createSeedLifecycleInput({
        seed: 7101,
        projectId: "project-existing",
        existingGeometryHash: base.geometryHash,
        variationMode: "layout_modify",
        brief: {
          target_gia_m2: 240,
        },
      }),
    );

    expect(layoutModified.brief.variationMode).toBe("layout_modify");
    expect(layoutModified.geometryHash).not.toBe(base.geometryHash);
  });

  test("all panel artifacts in one result can be stamped with the same generation seed metadata", () => {
    const panelsByAsset = {
      "asset-floor": {
        asset_id: "asset-floor",
        panel_type: "floor_plan_ground",
        geometryHash: "geom-seed",
        metadata: {},
      },
      "asset-hero": {
        asset_id: "asset-hero",
        panel_type: "hero_3d",
        geometryHash: "geom-seed",
        metadata: { providerUsed: "deterministic" },
      },
    };
    const stamped = stampGenerationLifecycleOnArtifacts(panelsByAsset, {
      generationSeed: 812345,
      seedSource: "user",
      variationMode: "new_design",
    });

    const panels = Object.values(stamped);
    expect(panels.length).toBeGreaterThan(0);
    for (const panel of panels) {
      expect(panel.generationSeed).toBe(812345);
      expect(panel.metadata.generationSeed).toBe(812345);
      expect(panel.seedSource).toBe("user");
      expect(panel.variationMode).toBe("new_design");
      expect(panel.metadata.generationLifecycle).toEqual({
        generationSeed: 812345,
        seedSource: "user",
        variationMode: "new_design",
      });
    }
  });

  test("repeated same-geometry panel regeneration does not create a different building", () => {
    const base = buildCompiledGeometryHash(
      createSeedLifecycleInput({ seed: 9001 }),
    );
    const regenerated = buildCompiledGeometryHash(
      createSeedLifecycleInput({
        projectId: "project-existing",
        existingGeometryHash: base.geometryHash,
        existingGenerationSeed: 9001,
        variationMode: "same_geometry_regen",
      }),
    );

    expect(regenerated.brief.generation_seed).toBe(9001);
    expect(regenerated.brief.seedSource).toBe("reused_existing_project");
    expect(regenerated.geometryHash).toBe(base.geometryHash);
  });
});
