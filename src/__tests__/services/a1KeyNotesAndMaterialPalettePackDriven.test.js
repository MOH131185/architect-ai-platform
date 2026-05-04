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
