import {
  buildStyleBlendManifest,
  evaluateStyleBlendQA,
  STYLE_BLEND_MANIFEST_VERSION,
} from "../../../services/style/styleBlendManifestService.js";
import { buildLocalStylePackV2 } from "../../../services/style/localStylePack.js";
import { loadJurisdictionPack } from "../../../services/jurisdiction/jurisdictionPackService.js";

function baseBrief(overrides = {}) {
  return {
    project_name: "Style Blend Test",
    building_type: "dwelling",
    target_storeys: 2,
    site_input: { address: "Scunthorpe, United Kingdom", postcode: "DN15" },
    user_intent: {
      style_keywords: ["contextual contemporary"],
      material_preferences: ["warm stock brick"],
      local_blend_strength: 0.65,
      innovation_strength: 0.35,
      portfolio_mood: "riba_stage2",
      ...(overrides.user_intent || {}),
    },
    ...overrides,
  };
}

function buildFixture({
  brief = baseBrief(),
  site = {},
  climate = { overheating: { risk_level: "low" } },
  jurisdictionPack = loadJurisdictionPack("uk"),
  portfolioItems = [],
  portfolioProfile = null,
  compiledProject = { geometryHash: "geom-style-001", levels: [{}, {}] },
  programme = { template_provenance: { source: "matched_template" } },
  regulations = { rule_summary: { hard_blocker_count: 0 } },
} = {}) {
  const localStyle = buildLocalStylePackV2({
    brief,
    site,
    climate,
    jurisdictionPack,
  });
  return buildStyleBlendManifest({
    brief,
    site,
    climate,
    localStyle,
    portfolioItems,
    portfolioProfile,
    jurisdictionPack,
    jurisdictionPackResolution: {
      source: "test",
      warnings: [],
      sourceGaps: [],
    },
    compiledProject,
    projectGraphId: "pg-style-001",
    programme,
    regulations,
  });
}

describe("StyleBlendManifest contract", () => {
  test("is deterministic for identical inputs", () => {
    const first = buildFixture();
    const second = buildFixture();
    expect(first.version).toBe(STYLE_BLEND_MANIFEST_VERSION);
    expect(first.manifestId).toBe(second.manifestId);
    expect(first.manifestHash).toBe(second.manifestHash);
    expect(first.authorityPriority).toEqual([
      "safety",
      "programme",
      "climate",
      "local",
      "user",
      "portfolio",
    ]);
  });

  test("does not invent portfolio identity when no portfolio evidence exists", () => {
    const manifest = buildFixture();
    expect(manifest.portfolioStyleEvidence.hasPortfolioEvidence).toBe(false);
    expect(manifest.blendWeights.portfolio).toBe(0);
    expect(manifest.qaWarnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "STYLE_BLEND_PORTFOLIO_EVIDENCE_EMPTY",
        }),
      ]),
    );
    expect(JSON.stringify(manifest.portfolioStyleEvidence)).not.toMatch(
      /restrained brick|riba_stage2/i,
    );
  });

  test("extracts explicit portfolio material/style evidence", () => {
    const manifest = buildFixture({
      portfolioItems: [
        {
          id: "p1",
          materials: ["brick", "timber"],
          tags: ["deep reveals"],
          style: "warm contemporary",
          buildingType: "terraced house",
        },
      ],
    });
    expect(manifest.portfolioStyleEvidence.hasPortfolioEvidence).toBe(true);
    expect(manifest.portfolioStyleEvidence.materials).toEqual(
      expect.arrayContaining(["brick", "timber"]),
    );
    expect(manifest.resolvedPalette.map((entry) => entry.name)).toEqual(
      expect.arrayContaining(["brick", "timber"]),
    );
  });

  test("climate rejects high-glass portfolio language under overheating risk", () => {
    const manifest = buildFixture({
      climate: { overheating: { risk_level: "high" } },
      portfolioItems: [
        {
          materials: ["all-glass curtain wall", "mirrored facade"],
          tags: ["fully glazed"],
          style: "glass box",
        },
      ],
    });
    expect(manifest.rejectedInfluences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rejectedBy: "climate",
        }),
      ]),
    );
    expect(manifest.blendWeights.portfolio).toBeLessThanOrEqual(0.05);
  });

  test("terraced context rejects detached portfolio typology", () => {
    const brief = baseBrief({
      original_subtype: "terraced-house",
      project_type_support: { subtypeId: "terraced-house" },
    });
    const manifest = buildFixture({
      brief,
      portfolioItems: [
        {
          buildingType: "detached villa",
          tags: ["freestanding open sides"],
          materials: ["timber"],
        },
      ],
      compiledProject: {
        geometryHash: "geom-terrace",
        partyWalls: [{ side: "left" }, { side: "right" }],
      },
    });
    expect(manifest.rejectedInfluences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          influence: "detached/freestanding portfolio typology",
        }),
      ]),
    );
  });

  test("France and Algeria use jurisdiction-local evidence without UK vernacular bleed", () => {
    const france = buildFixture({
      brief: baseBrief({
        site_input: { address: "Lyon, France" },
        jurisdiction: "france",
      }),
      jurisdictionPack: loadJurisdictionPack("france"),
    });
    const algeria = buildFixture({
      brief: baseBrief({
        site_input: { address: "Alger, Algeria" },
        jurisdiction: "algeria",
      }),
      climate: { overheating: { risk_level: "high" } },
      jurisdictionPack: loadJurisdictionPack("algeria"),
    });

    expect(france.localStyleEvidence.jurisdictionId).toBe("france");
    expect(france.localStyleEvidence.materials.join(",")).toMatch(
      /lime render|local stone/i,
    );
    expect(algeria.localStyleEvidence.jurisdictionId).toBe("algeria");
    expect(algeria.localStyleEvidence.materials.join(",")).toMatch(
      /light coloured render|thermal mass|shading screen/i,
    );
    expect(
      JSON.stringify([france.localStyleEvidence, algeria.localStyleEvidence]),
    ).not.toMatch(/ukVernacularPacks|London stucco|Manchester/i);
  });
});

describe("StyleBlendQA", () => {
  test("fails on visual manifest hash mismatch", () => {
    const styleBlendManifest = buildFixture();
    const report = evaluateStyleBlendQA({
      styleBlendManifest,
      visualManifest: {
        styleBlendManifestHash: "different",
      },
      sheetDesignContext: {
        styleBlendManifestHash: styleBlendManifest.manifestHash,
      },
    });
    expect(report.status).toBe("fail");
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "STYLE_BLEND_VISUAL_MANIFEST_HASH_MISMATCH",
        }),
      ]),
    );
  });

  test("catches A1 material palette drift", () => {
    const styleBlendManifest = buildFixture({
      portfolioItems: [{ materials: ["warm brick"], style: "contextual" }],
    });
    const report = evaluateStyleBlendQA({
      styleBlendManifest,
      visualManifest: {
        styleBlendManifestHash: styleBlendManifest.manifestHash,
      },
      a1MaterialPalette: [{ name: "mirror-polished chrome panel" }],
      strict: true,
    });
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "STYLE_BLEND_A1_PALETTE_DRIFT" }),
      ]),
    );
  });

  test("catches missing styleBlendManifestHash in prompt evidence", () => {
    const styleBlendManifest = buildFixture({
      portfolioItems: [{ materials: ["brick"], style: "contextual" }],
    });
    const report = evaluateStyleBlendQA({
      styleBlendManifest,
      promptEvidence: [
        {
          panelType: "hero_3d",
          finalPrompt: "GEOMETRY AND VISUAL AUTHORITY\ngeometryHash: geom",
        },
      ],
      strict: true,
    });
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "STYLE_BLEND_PROMPT_HASH_MISSING" }),
      ]),
    );
  });

  test("catches portfolio overweight in heritage/high-local context", () => {
    const styleBlendManifest = buildFixture({
      portfolioItems: [{ materials: ["brick"], style: "contextual" }],
    });
    const report = evaluateStyleBlendQA({
      styleBlendManifest: {
        ...styleBlendManifest,
        localStyleEvidence: {
          ...styleBlendManifest.localStyleEvidence,
          heritageFlags: ["conservation-area"],
        },
        blendWeights: {
          ...styleBlendManifest.blendWeights,
          local: 0.65,
          portfolio: 0.12,
        },
      },
      strict: true,
    });
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "STYLE_BLEND_PORTFOLIO_OVERWEIGHT" }),
      ]),
    );
  });

  test("catches rejected influence leakage into prompt evidence", () => {
    const styleBlendManifest = {
      ...buildFixture({
        portfolioItems: [{ materials: ["brick"], style: "contextual" }],
      }),
      rejectedInfluences: [
        {
          influence: "sci-fi glass facade",
          rejectedBy: "local",
          reason: "Heritage context.",
        },
      ],
    };
    const report = evaluateStyleBlendQA({
      styleBlendManifest,
      promptEvidence: [
        {
          panelType: "exterior_render",
          finalPrompt: `styleBlendManifestHash: ${styleBlendManifest.manifestHash}\nRender a sci-fi glass facade.`,
        },
      ],
      strict: true,
    });
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "STYLE_BLEND_REJECTED_INFLUENCE_LEAK",
        }),
      ]),
    );
  });

  test("catches France and Algeria UK vernacular bleed", () => {
    const france = buildFixture({
      brief: baseBrief({
        site_input: { address: "Lyon, France" },
        jurisdiction: "france",
      }),
      jurisdictionPack: loadJurisdictionPack("france"),
      portfolioItems: [{ materials: ["lime render"], style: "contextual" }],
    });
    const report = evaluateStyleBlendQA({
      styleBlendManifest: {
        ...france,
        localStyleEvidence: {
          ...france.localStyleEvidence,
          materials: ["london-stucco-terrace"],
        },
      },
      strict: true,
    });
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "STYLE_BLEND_JURISDICTION_VERNACULAR_BLEED",
        }),
      ]),
    );
  });

  test("valid UK terraced style blend passes strict QA", () => {
    const brief = baseBrief({
      original_subtype: "terraced-house",
      project_type_support: { subtypeId: "terraced-house" },
    });
    const styleBlendManifest = buildFixture({
      brief,
      portfolioItems: [
        {
          buildingType: "terraced house",
          materials: ["brick", "timber"],
          style: "warm contextual",
        },
      ],
      compiledProject: {
        geometryHash: "geom-terrace-valid",
        partyWalls: [{ side: "left" }, { side: "right" }],
      },
    });
    const report = evaluateStyleBlendQA({
      styleBlendManifest,
      visualManifest: {
        styleBlendManifestHash: styleBlendManifest.manifestHash,
      },
      sheetDesignContext: {
        styleBlendManifestHash: styleBlendManifest.manifestHash,
      },
      a1MaterialPalette: styleBlendManifest.resolvedPalette,
      promptEvidence: [
        {
          panelType: "hero_3d",
          finalPrompt: `styleBlendManifestHash: ${styleBlendManifest.manifestHash}\nContextual terraced project.`,
        },
      ],
      panelArtifacts: {
        hero_3d: {
          panelType: "hero_3d",
          promptHash: "prompt-hash",
          metadata: {
            styleBlendManifestHash: styleBlendManifest.manifestHash,
          },
        },
      },
      strict: true,
    });
    expect(report.status).toBe("pass");
  });

  test("valid France and Algeria style blends do not use UK vernacular names", () => {
    const france = buildFixture({
      brief: baseBrief({
        site_input: { address: "Lyon, France" },
        jurisdiction: "france",
      }),
      jurisdictionPack: loadJurisdictionPack("france"),
      portfolioItems: [{ materials: ["lime render"], style: "contextual" }],
    });
    const algeria = buildFixture({
      brief: baseBrief({
        site_input: { address: "Alger, Algeria" },
        jurisdiction: "algeria",
      }),
      climate: { overheating: { risk_level: "high" } },
      jurisdictionPack: loadJurisdictionPack("algeria"),
      portfolioItems: [
        { materials: ["shading screen"], style: "climate responsive" },
      ],
    });
    for (const styleBlendManifest of [france, algeria]) {
      const report = evaluateStyleBlendQA({
        styleBlendManifest,
        visualManifest: {
          styleBlendManifestHash: styleBlendManifest.manifestHash,
        },
        a1MaterialPalette: styleBlendManifest.resolvedPalette,
        promptEvidence: [
          {
            panelType: "hero_3d",
            finalPrompt: `styleBlendManifestHash: ${styleBlendManifest.manifestHash}\nLocal jurisdiction style.`,
          },
        ],
        strict: true,
      });
      expect(
        report.issues.some(
          (issue) => issue.code === "STYLE_BLEND_JURISDICTION_VERNACULAR_BLEED",
        ),
      ).toBe(false);
    }
  });
});
