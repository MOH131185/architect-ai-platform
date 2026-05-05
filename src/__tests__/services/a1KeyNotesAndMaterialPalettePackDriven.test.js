/**
 * Commit 2 of feat/a1-surface-vernacular-qa-provenance:
 *
 * Verifies that the Key Notes panel surfaces the resolved UK vernacular pack
 * (paper §4.3) and the QA summary (paper §4.6) when those data are available,
 * and that the Material Palette panel leads with pack materials before the
 * canonical 8-material top-up.
 *
 * All assertions are at the function level — orchestrator wiring is covered
 * by the existing slice tests; here we want to confirm the panels themselves
 * react correctly to the pack/QA inputs.
 */

import {
  buildKeyNoteItems,
  buildKeyNotesPanelArtifact,
  buildMaterialPalettePanelArtifact,
  __projectGraphVerticalSliceInternals,
} from "../../services/project/projectGraphVerticalSliceService.js";
import { resolveUKVernacular } from "../../services/style/ukVernacularPacks.js";

function makeLocalStyleWithPack(pack) {
  return {
    primary_style: "test",
    material_palette: ["yellow London stock brick", "natural slate"],
    avoid_keywords: [],
    local_blend_strength: 0.5,
    innovation_strength: 0.5,
    style_provenance: pack
      ? {
          ukVernacularPackId: pack.packId,
          packLabel: pack.label,
          region: pack.region,
          descriptive_narrative: pack.descriptive_narrative,
          historical_period: pack.historical_period,
          source: "ukVernacularPacks",
          materials: pack.materials,
        }
      : null,
  };
}

const baseBrief = {
  building_type: "dwelling",
  canonical_building_type: "dwelling",
  target_storeys: 2,
  target_gia_m2: 150,
  project_name: "test-house",
};
const baseSite = { region: "London" };
const baseClimate = {};
const baseRegulations = {};

describe("buildKeyNoteItems — style provenance group", () => {
  test("emits a 'Style provenance' group when localStyle carries a vernacular pack", () => {
    const pack = resolveUKVernacular({ postcode: "W2 5SH" });
    expect(pack.packId).toBe("london-stucco-terrace");
    const groups = buildKeyNoteItems({
      brief: baseBrief,
      site: baseSite,
      climate: baseClimate,
      regulations: baseRegulations,
      localStyle: makeLocalStyleWithPack(pack),
    });
    const provenanceGroup = groups.find((g) => g.id === "style_provenance");
    expect(provenanceGroup).toBeDefined();
    expect(provenanceGroup.heading).toBe("Style provenance");
    const allText = provenanceGroup.lines.join(" ");
    expect(allText).toMatch(/London stucco terrace/);
    expect(allText).toMatch(/Regency/);
    // Narrative should mention something concrete from the pack.
    expect(allText).toMatch(/parapet|stucco|sash/i);
  });

  test("omits the 'Style provenance' group entirely when no pack is resolved", () => {
    const groups = buildKeyNoteItems({
      brief: baseBrief,
      site: baseSite,
      climate: baseClimate,
      regulations: baseRegulations,
      localStyle: makeLocalStyleWithPack(null),
    });
    const provenanceGroup = groups.find((g) => g.id === "style_provenance");
    expect(provenanceGroup).toBeUndefined();
  });
});

describe("buildKeyNoteItems — QA summary group", () => {
  test("emits a 'QA summary' group when qaSummary carries adjacency + quantitative scores", () => {
    const groups = buildKeyNoteItems({
      brief: baseBrief,
      site: baseSite,
      climate: baseClimate,
      regulations: baseRegulations,
      localStyle: makeLocalStyleWithPack(null),
      qaSummary: {
        programmeAdjacency: {
          score: 64,
          status: "warn",
          packId: "residential-v1",
          ruleCount: 12,
        },
        quantitative: { score: 63 },
      },
    });
    const qaGroup = groups.find((g) => g.id === "qa_summary");
    expect(qaGroup).toBeDefined();
    expect(qaGroup.heading).toBe("QA summary");
    const allText = qaGroup.lines.join(" ");
    expect(allText).toMatch(/Quantitative QA: 63\/100/);
    expect(allText).toMatch(/Programme adjacency: 64\/100/);
    expect(allText).toMatch(/warn/);
    expect(allText).toMatch(/residential-v1/);
    expect(allText).toMatch(/12 rules/);
  });

  test("omits the 'QA summary' group when qaSummary is null (panel built before QA)", () => {
    const groups = buildKeyNoteItems({
      brief: baseBrief,
      site: baseSite,
      climate: baseClimate,
      regulations: baseRegulations,
      localStyle: makeLocalStyleWithPack(null),
      qaSummary: null,
    });
    const qaGroup = groups.find((g) => g.id === "qa_summary");
    expect(qaGroup).toBeUndefined();
  });
});

describe("ArchitectReasoningManifest — Key Notes design rationale", () => {
  test("builds a deterministic compact sidecar manifest and Key Notes group", () => {
    const pack = resolveUKVernacular({ postcode: "W2 5SH" });
    const localStyle = makeLocalStyleWithPack(pack);
    const compiledProject = {
      geometryHash: "geometry-hash-w2",
      levels: [{ id: "ground" }, { id: "first" }],
      rooms: [
        { id: "living", name: "Living Room", zone: "day" },
        { id: "kitchen", name: "Kitchen", zone: "service" },
        { id: "landing", name: "Landing", zone: "circulation" },
      ],
      windows: [
        { id: "w1", orientation: "south" },
        { id: "w2", orientation: "west" },
      ],
      stairs: [{ id: "main-stair" }],
      sectionCuts: {
        candidates: [
          { sectionType: "longitudinal", strategyName: "stair/daylight cut" },
          { sectionType: "transverse", strategyName: "front-to-back cut" },
        ],
      },
    };
    const manifest =
      __projectGraphVerticalSliceInternals.buildArchitectReasoningManifest({
        projectGraphId: "pg-w2",
        brief: {
          ...baseBrief,
          site_input: { postcode: "W2 5SH" },
        },
        site: {
          postcode: "W2 5SH",
          north_angle_degrees: 8,
          boundary_source: "manual_verified",
          main_entry: { orientation: "south", source: "manual" },
        },
        climate: { source: "deterministic", zone: "UK temperate" },
        regulations: { parts: [{ part: "Part L" }, { part: "Part M" }] },
        localStyle,
        programmeSummary: {
          rooms_per_level: {
            ground: ["Living Room", "Kitchen", "WC"],
            first: ["Bedroom", "Bathroom"],
          },
        },
        compiledProject,
        technicalBuild: { technicalPanelTypes: ["section_AA", "section_BB"] },
        sheetDesignContext: {
          materials: [
            { name: "white stucco render" },
            { name: "natural slate" },
          ],
        },
      });

    expect(manifest).toEqual(
      expect.objectContaining({
        asset_type: "architect_reasoning_manifest_json",
        schema_version: "architect-reasoning-manifest-v1",
        source_model_hash: "geometry-hash-w2",
        geometryHash: "geometry-hash-w2",
        authoritySource: "project_graph_compiled_geometry",
        deterministic: true,
        manifestHash: expect.any(String),
      }),
    );
    expect(manifest.prompt_splice_lines.length).toBeGreaterThanOrEqual(6);
    expect(manifest.prompt_splice_lines.length).toBeLessThanOrEqual(8);
    expect(manifest.design_rationale).toEqual(
      expect.objectContaining({
        site_orientation: expect.stringMatching(/Site\/orientation/i),
        zoning: expect.stringMatching(/Zoning/i),
        circulation: expect.stringMatching(/Circulation/i),
        daylight: expect.stringMatching(/Daylight/i),
        facade_vernacular: expect.stringMatching(/London stucco terrace/i),
        section_cut: expect.stringMatching(/Section cuts/i),
        material: expect.stringMatching(/stucco|slate/i),
        qa_caveats: expect.stringMatching(/QA caveats/i),
      }),
    );
    expect(manifest.qa_caveats.join(" ")).toMatch(/warning-only/i);

    const groups = buildKeyNoteItems({
      brief: baseBrief,
      site: baseSite,
      climate: baseClimate,
      regulations: baseRegulations,
      localStyle,
      architectReasoningManifest: manifest,
    });
    const rationaleGroup = groups.find((g) => g.id === "design_rationale");
    expect(rationaleGroup).toEqual(
      expect.objectContaining({
        heading: "Design rationale",
        lines: manifest.key_note_lines,
      }),
    );
    expect(rationaleGroup.lines.length).toBeGreaterThanOrEqual(3);
    expect(rationaleGroup.lines.join(" ")).toMatch(
      /Site\/orientation|Circulation|Section cuts/i,
    );
  });
});

describe("buildKeyNotesPanelArtifact — embedded SVG carries style + QA when supplied", () => {
  test("SVG contains both 'Style provenance' and 'QA summary' headings when both inputs are present", () => {
    const pack = resolveUKVernacular({ postcode: "EH8 9YL" });
    expect(pack.packId).toBe("edinburgh-tenement");
    const artifact = buildKeyNotesPanelArtifact({
      projectGraphId: "pg-test",
      brief: baseBrief,
      site: baseSite,
      climate: baseClimate,
      regulations: baseRegulations,
      localStyle: makeLocalStyleWithPack(pack),
      geometryHash: "h-test-1234",
      qaSummary: {
        programmeAdjacency: {
          score: 78,
          status: "pass",
          packId: "residential-v1",
          ruleCount: 12,
        },
        quantitative: { score: 81 },
      },
    });
    expect(artifact.panel_type).toBe("key_notes");
    expect(artifact.svgString).toContain("Style provenance");
    expect(artifact.svgString).toContain("Edinburgh tenement");
    expect(artifact.svgString).toContain("QA summary");
    expect(artifact.svgString).toContain("78/100");
    expect(artifact.svgString).toContain("81/100");
  });
});

describe("buildMaterialPalettePanelArtifact — pack materials lead the grid", () => {
  test("W2 (london-stucco-terrace) pack materials appear before the canonical fallback", () => {
    const pack = resolveUKVernacular({ postcode: "W2 5SH" });
    const artifact = buildMaterialPalettePanelArtifact({
      projectGraphId: "pg-test",
      localStyle: makeLocalStyleWithPack(pack),
      compiledProject: null,
      styleDNA: null,
      brief: baseBrief,
      geometryHash: "h-test-mat-1",
      sheetDesignContext: null,
    });
    expect(artifact.panel_type).toBe("material_palette");
    expect(Array.isArray(artifact.cardMetadata)).toBe(true);
    const cardLabel = (card) =>
      String(card?.label || card?.name || "").toLowerCase();
    const packNamesLower = pack.materials.map((m) => m.toLowerCase());
    expect(packNamesLower).toContain(cardLabel(artifact.cardMetadata[0]));
    // At least 2 of the first 4 cards should come from the pack — the rest
    // can fall through to the canonical top-up.
    const firstFourLower = artifact.cardMetadata.slice(0, 4).map(cardLabel);
    const overlap = firstFourLower.filter((n) =>
      packNamesLower.includes(n),
    ).length;
    expect(overlap).toBeGreaterThanOrEqual(2);
  });

  test("falls back to the existing canonical palette when no pack is resolved", () => {
    const artifact = buildMaterialPalettePanelArtifact({
      projectGraphId: "pg-test",
      localStyle: makeLocalStyleWithPack(null),
      compiledProject: null,
      styleDNA: null,
      brief: baseBrief,
      geometryHash: "h-test-mat-2",
      sheetDesignContext: null,
    });
    expect(artifact.panel_type).toBe("material_palette");
    expect(artifact.cardMetadata.length).toBeGreaterThan(0);
    const firstFourNames = artifact.cardMetadata
      .slice(0, 4)
      .map((c) => String(c?.label || c?.name || "").toLowerCase());
    // No pack-source entries in cardMetadata when style_provenance is absent.
    expect(firstFourNames.some((n) => n.includes("white stucco render"))).toBe(
      false,
    );
  });
});
