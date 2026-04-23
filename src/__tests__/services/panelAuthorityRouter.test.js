import {
  getCanonicalPackSource,
  isCompiledProjectCanonicalPack,
  getCompiledCanonicalPackReadiness,
  isTechnicalPanel,
  isBlueprintLikePanel,
  isDirectDeterministicPanel,
  resolveDirectPanelRoute,
  resolveVisualPanelAuthority,
} from "../../services/design/panelAuthorityRouter.js";

describe("panelAuthorityRouter", () => {
  const compiledPack = {
    metadata: {
      source: "compiled_project",
      authoritySource: "compiled_project",
      compiledProjectSchemaVersion: "compiled-project-v1",
      technicalAuthorityReady: true,
      technicalAuthoritySummary: { ready: true, reasons: [] },
    },
  };

  const weakCompiledPack = {
    metadata: {
      source: "compiled_project",
      authoritySource: "compiled_project",
      compiledProjectSchemaVersion: "compiled-project-v1",
      technicalAuthorityReady: false,
      technicalAuthoritySummary: {
        ready: false,
        reasons: [
          "compiled project resolved too few wall segments for technical authority",
        ],
      },
    },
  };

  const mislabeledPack = {
    metadata: { source: "compiled_project" },
  };

  const legacyPack = {
    metadata: { source: "canonical_geometry_pack_v1" },
  };

  test("detects compiled-project canonical packs", () => {
    expect(getCanonicalPackSource(compiledPack)).toBe("compiled_project");
    expect(isCompiledProjectCanonicalPack(compiledPack)).toBe(true);
    expect(getCompiledCanonicalPackReadiness(compiledPack).ready).toBe(true);
    expect(getCompiledCanonicalPackReadiness(weakCompiledPack).ready).toBe(
      false,
    );
    expect(isCompiledProjectCanonicalPack(mislabeledPack)).toBe(false);
    expect(isCompiledProjectCanonicalPack(legacyPack)).toBe(false);
  });

  test("classifies technical and blueprint-like panels", () => {
    expect(isTechnicalPanel("floor_plan_ground")).toBe(true);
    expect(isTechnicalPanel("elevation_north")).toBe(true);
    expect(isTechnicalPanel("section_AA")).toBe(true);
    expect(isTechnicalPanel("hero_3d")).toBe(false);

    expect(isBlueprintLikePanel("site_diagram")).toBe(true);
    expect(isBlueprintLikePanel("hero_3d")).toBe(false);

    expect(isDirectDeterministicPanel("site_diagram")).toBe(true);
    expect(isDirectDeterministicPanel("floor_plan_ground")).toBe(true);
    expect(isDirectDeterministicPanel("hero_3d")).toBe(false);
  });

  test("routes technical panels to compiled-project canonical SVG when available", () => {
    const decision = resolveDirectPanelRoute("elevation_north", {
      canonicalPack: compiledPack,
      hasCompiledCanonicalAsset: true,
    });

    expect(decision.direct).toBe(true);
    expect(decision.useFlux).toBe(false);
    expect(decision.authority).toBe("compiled_project_canonical_pack");
    expect(decision.useCompiledCanonicalAsset).toBe(true);
  });

  test("blocks legacy technical packs instead of falling back to deterministic SVG", () => {
    const decision = resolveDirectPanelRoute("section_AA", {
      canonicalPack: legacyPack,
      hasCompiledCanonicalAsset: true,
    });

    expect(decision.direct).toBe(false);
    expect(decision.blocked).toBe(true);
    expect(decision.useFlux).toBe(false);
    expect(decision.authority).toBe("technical_authority_blocked");
    expect(decision.useCompiledCanonicalAsset).toBe(false);
    expect(decision.reason).toMatch(/compiled-project authority pack/i);
  });

  test("blocks weak compiled-project technical packs", () => {
    const decision = resolveDirectPanelRoute("section_AA", {
      canonicalPack: weakCompiledPack,
      hasCompiledCanonicalAsset: true,
    });

    expect(decision.direct).toBe(false);
    expect(decision.blocked).toBe(true);
    expect(decision.useFlux).toBe(false);
    expect(decision.authority).toBe("technical_authority_blocked");
    expect(decision.useCompiledCanonicalAsset).toBe(false);
    expect(decision.reason).toMatch(/too few wall segments/i);
  });

  test("blocks technical panels when compiled canonical asset is missing", () => {
    const decision = resolveDirectPanelRoute("floor_plan_ground", {
      canonicalPack: compiledPack,
      hasCompiledCanonicalAsset: false,
    });

    expect(decision.direct).toBe(false);
    expect(decision.blocked).toBe(true);
    expect(decision.authority).toBe("technical_authority_blocked");
    expect(decision.reason).toMatch(/asset is missing/i);
  });

  test("routes blueprint-like panels to deterministic SVG", () => {
    const decision = resolveDirectPanelRoute("site_diagram", {
      canonicalPack: compiledPack,
      hasCompiledCanonicalAsset: true,
    });

    expect(decision.direct).toBe(true);
    expect(decision.useFlux).toBe(false);
    expect(decision.authority).toBe("deterministic_svg");
  });

  test("uses compiled-project canonical controls for 3D panels when present", () => {
    const decision = resolveVisualPanelAuthority("hero_3d", {
      canonicalPack: compiledPack,
      geometryRender: {
        url: "data:image/png;base64,AAA",
        type: "compiled_project_canonical_pack",
      },
    });

    expect(decision.route).toBe("flux");
    expect(decision.authority).toBe("compiled_project_canonical_pack");
  });

  test("uses geometry-derived controls for 3D panels when compiled-project controls are absent", () => {
    const decision = resolveVisualPanelAuthority("hero_3d", {
      canonicalPack: legacyPack,
      geometryRender: {
        url: "data:image/png;base64,BBB",
        type: "blender_3d",
      },
    });

    expect(decision.route).toBe("flux");
    expect(decision.authority).toBe("geometry_derived:blender_3d");
  });

  test("ignores weak compiled-project canonical controls for 3D panels", () => {
    const decision = resolveVisualPanelAuthority("hero_3d", {
      canonicalPack: weakCompiledPack,
      geometryRender: {
        url: "data:image/png;base64,CCC",
        type: "compiled_project_canonical_pack",
      },
    });

    expect(decision.route).toBe("flux");
    expect(decision.authority).toBe(
      "geometry_derived:compiled_project_canonical_pack",
    );
  });

  test("marks legacy canonical packs as ignored for visual control authority", () => {
    const decision = resolveVisualPanelAuthority("interior_3d", {
      canonicalPack: legacyPack,
      geometryRender: null,
    });

    expect(decision.route).toBe("flux");
    expect(decision.authority).toBe("prompt_only");
    expect(decision.reason).toMatch(/legacy canonical pack source/);
  });
});
