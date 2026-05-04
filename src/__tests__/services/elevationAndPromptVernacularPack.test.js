/**
 * Commit 3 of feat/a1-surface-vernacular-qa-provenance:
 *
 * Verifies that:
 *   1. The deterministic SVG elevation renderer surfaces pack-driven hints
 *      (parapet roofline, semi-basement strip, stucco/sash labels, data
 *      attributes) when a UK regional vernacular pack is supplied via
 *      options.vernacularPack.
 *   2. The flag-off / no-pack path renders the existing canonical SVG with
 *      no vernacular markup so existing fixtures keep passing.
 *   3. Different packs (W2 vs EH8) produce visually distinguishable output.
 *   4. The hero/exterior LLM prompt builders inject a "REGIONAL VERNACULAR"
 *      block with the pack narrative + facade/window/material language when
 *      a pack is supplied, and remain pack-free when none is.
 *   5. Existing geometry-authority / fingerprint locks are preserved when
 *      the pack block is added.
 */

import { renderElevationSvg } from "../../services/drawing/svgElevationRenderer.js";
import { renderSectionSvg } from "../../services/drawing/svgSectionRenderer.js";
import {
  buildHero3DPrompt,
  buildExteriorRenderPrompt,
} from "../../services/a1/panelPromptBuilders.js";
import { buildProjectGraphRenderPrompt } from "../../services/project/projectGraphVerticalSliceService.js";
import { buildLocalStylePackV2 } from "../../services/style/localStylePack.js";
import { resolveUKVernacular } from "../../services/style/ukVernacularPacks.js";

// A minimal-but-valid compiled-project geometry: one level, one rectangular
// room, four exterior walls, two windows on the south face, one door. Enough
// for renderElevationSvg to succeed in non-blocked mode.
function makeFixtureGeometry() {
  return {
    metadata: {},
    levels: [{ id: "level-0", index: 0, height_m: 3.0 }],
    rooms: [
      {
        id: "room-1",
        levelId: "level-0",
        polygon: [
          { x: 0, y: 0 },
          { x: 8, y: 0 },
          { x: 8, y: 6 },
          { x: 0, y: 6 },
        ],
        bbox: { min: { x: 0, y: 0 }, max: { x: 8, y: 6 } },
      },
    ],
    walls: [
      {
        id: "wall-s",
        levelId: "level-0",
        start: { x: 0, y: 0 },
        end: { x: 8, y: 0 },
        height_m: 3.0,
        thickness_m: 0.24,
        exterior: true,
      },
      {
        id: "wall-e",
        levelId: "level-0",
        start: { x: 8, y: 0 },
        end: { x: 8, y: 6 },
        height_m: 3.0,
        thickness_m: 0.24,
        exterior: true,
      },
      {
        id: "wall-n",
        levelId: "level-0",
        start: { x: 8, y: 6 },
        end: { x: 0, y: 6 },
        height_m: 3.0,
        thickness_m: 0.24,
        exterior: true,
      },
      {
        id: "wall-w",
        levelId: "level-0",
        start: { x: 0, y: 6 },
        end: { x: 0, y: 0 },
        height_m: 3.0,
        thickness_m: 0.24,
        exterior: true,
      },
    ],
    windows: [
      {
        id: "win-1",
        wallId: "wall-s",
        levelId: "level-0",
        position_m: 1.5,
        width_m: 1.2,
        sill_height_m: 0.9,
        head_height_m: 2.1,
      },
      {
        id: "win-2",
        wallId: "wall-s",
        levelId: "level-0",
        position_m: 5.0,
        width_m: 1.2,
        sill_height_m: 0.9,
        head_height_m: 2.1,
      },
    ],
    doors: [
      {
        id: "door-1",
        wallId: "wall-s",
        levelId: "level-0",
        position_m: 3.0,
        width_m: 0.9,
        head_height_m: 2.1,
      },
    ],
    openings: [],
    envelope: { min: { x: 0, y: 0 }, max: { x: 8, y: 6 } },
  };
}

describe("renderElevationSvg — pack-driven hints", () => {
  test("london-stucco-terrace pack produces parapet + semi-basement + stucco cues", () => {
    const pack = resolveUKVernacular({ postcode: "W2 5SH" });
    expect(pack.packId).toBe("london-stucco-terrace");
    const result = renderElevationSvg(
      makeFixtureGeometry(),
      {},
      {
        orientation: "south",
        vernacularPack: pack,
        allowWeakFacadeFallback: true,
      },
    );
    expect(result.svg).toBeTruthy();
    expect(result.svg).toContain(
      'data-vernacular-pack="london-stucco-terrace"',
    );
    expect(result.svg).toContain('data-pack-parapet="true"');
    expect(result.svg).toContain('data-pack-semi-basement="true"');
    expect(result.svg).toContain('data-pack-facade-stucco="true"');
    expect(result.svg).toContain('data-vernacular-feature="semi_basement"');
    // Vernacular caption is omitted in sheetMode; default mode shows it.
    expect(result.svg).toContain("Vernacular: London stucco terrace");
    // Roofline language was overridden to parapet.
    expect(result.technical_quality_metadata.vernacular_pack_parapet).toBe(
      true,
    );
    expect(result.technical_quality_metadata.vernacular_pack_id).toBe(
      "london-stucco-terrace",
    );
  });

  test("no pack supplied: SVG carries no vernacular markup (flag-off fallback)", () => {
    const result = renderElevationSvg(
      makeFixtureGeometry(),
      {},
      { orientation: "south", allowWeakFacadeFallback: true },
    );
    expect(result.svg).toBeTruthy();
    expect(result.svg).not.toContain("data-vernacular-pack=");
    expect(result.svg).not.toContain("data-vernacular-feature=");
    expect(result.svg).not.toContain("Vernacular:");
    expect(result.technical_quality_metadata.vernacular_pack_id).toBeNull();
    expect(result.technical_quality_metadata.vernacular_pack_parapet).toBe(
      false,
    );
  });

  // Phase A regression: when buildLocalStylePackV2 propagates the FULL
  // provenance shape (post-Phase-A), the elevation renderer reading
  // localStyle.style_provenance must see parapet_default + semi_basement_default
  // + materials and emit the corresponding pack hints. PR #92 unit tests passed
  // with a full-pack fixture but production stripped these fields between
  // localStylePack and renderElevationSvg, leaving W2 elevations with the
  // generic gable. This test feeds the renderer the ACTUAL propagated shape
  // (mirrors what buildLocalStylePackV2 emits) and asserts the parapet override
  // fires end-to-end.
  test("propagated style_provenance shape (post-Phase-A) drives parapet override on elevation SVG", () => {
    const propagatedProvenance = {
      ukVernacularPackId: "london-stucco-terrace",
      packId: "london-stucco-terrace",
      packLabel: "London stucco terrace",
      label: "London stucco terrace",
      region: "London — Westminster / Kensington / Chelsea / Notting Hill",
      descriptive_narrative:
        "Early-19th-century Regency / Italianate stucco terrace …",
      historical_period: "Regency and early Victorian (c. 1820–1860)",
      resolution_source: "postcode",
      source: "ukVernacularPacks",
      materials: [
        "white stucco render",
        "yellow London stock brick base",
        "natural slate roof",
      ],
      facade_language:
        "stucco-fronted with rusticated ground floor and parapet",
      roof_language: "concealed-behind-parapet pitched slate",
      window_language:
        "tall sash windows, vertically proportioned, diminishing per floor",
      fenestration_rhythm: "regular bay rhythm",
      modernity_default: 0.3,
      parapet_default: true,
      semi_basement_default: true,
      layout_archetype: "linear_side_hall",
      conservation_typical: true,
    };
    const result = renderElevationSvg(
      makeFixtureGeometry(),
      {},
      {
        orientation: "south",
        vernacularPack: propagatedProvenance,
        allowWeakFacadeFallback: true,
      },
    );
    expect(result.svg).toBeTruthy();
    expect(result.svg).toContain(
      'data-vernacular-pack="london-stucco-terrace"',
    );
    expect(result.svg).toContain('data-pack-parapet="true"');
    expect(result.svg).toContain('data-pack-semi-basement="true"');
    expect(result.svg).toContain('data-pack-facade-stucco="true"');
    expect(result.technical_quality_metadata.vernacular_pack_parapet).toBe(
      true,
    );
    expect(
      result.technical_quality_metadata.vernacular_pack_semi_basement,
    ).toBe(true);
  });

  // Codex P1 regression: localStylePack.buildLocalStylePackV2 always emits a
  // style_provenance object — when no UK pack resolves the source field is
  // "buildingTypeDefault" with every other field null. A naive truthiness
  // gate would still treat that as a real pack and leak empty
  // data-vernacular-pack="" + data-pack-* attrs into legacy elevations. The
  // renderer must require source === "ukVernacularPacks" (or a non-empty
  // packId) before emitting any vernacular markup.
  test("buildingTypeDefault fallback style_provenance is treated as no-pack (no leaked attrs)", () => {
    const fallbackProvenance = {
      ukVernacularPackId: null,
      packLabel: null,
      region: null,
      descriptive_narrative: null,
      historical_period: null,
      resolution_source: null,
      source: "buildingTypeDefault",
    };
    const result = renderElevationSvg(
      makeFixtureGeometry(),
      {},
      {
        orientation: "south",
        vernacularPack: fallbackProvenance,
        allowWeakFacadeFallback: true,
      },
    );
    expect(result.svg).toBeTruthy();
    expect(result.svg).not.toContain("data-vernacular-pack=");
    expect(result.svg).not.toContain("data-pack-parapet=");
    expect(result.svg).not.toContain("data-pack-semi-basement=");
    expect(result.svg).not.toContain("data-pack-window-language=");
    expect(result.svg).not.toContain("data-pack-facade-stucco=");
    expect(result.svg).not.toContain("data-vernacular-feature=");
    expect(result.svg).not.toContain("Vernacular:");
    expect(result.technical_quality_metadata.vernacular_pack_id).toBeNull();
    expect(result.technical_quality_metadata.vernacular_pack_label).toBeNull();
    expect(result.technical_quality_metadata.vernacular_pack_parapet).toBe(
      false,
    );
    expect(
      result.technical_quality_metadata.vernacular_pack_semi_basement,
    ).toBe(false);
  });

  test("edinburgh-tenement pack produces sandstone + parapet hints, distinct from london", () => {
    const pack = resolveUKVernacular({ postcode: "EH8 9YL" });
    expect(pack.packId).toBe("edinburgh-tenement");
    const result = renderElevationSvg(
      makeFixtureGeometry(),
      {},
      {
        orientation: "south",
        vernacularPack: pack,
        allowWeakFacadeFallback: true,
      },
    );
    expect(result.svg).toContain('data-vernacular-pack="edinburgh-tenement"');
    // Edinburgh tenement is sandstone, not stucco — stucco flag must stay false.
    expect(result.svg).not.toContain('data-pack-facade-stucco="true"');
    expect(result.technical_quality_metadata.vernacular_pack_id).toBe(
      "edinburgh-tenement",
    );
    expect(result.technical_quality_metadata.vernacular_pack_label).toMatch(
      /Edinburgh/i,
    );
    expect(result.technical_quality_metadata.vernacular_pack_label).toMatch(
      /tenement/i,
    );
  });
});

describe("buildHero3DPrompt + buildExteriorRenderPrompt — pack injection", () => {
  const masterDNA = {
    architecturalStyle: "Contemporary",
    materials: [
      { name: "warm brick", hexColor: "#8c5a3a", application: "facade" },
    ],
    roof: { type: "gable" },
    dimensions: {
      length_m: 8,
      width_m: 6,
      height_m: 6,
      floor_count: 2,
    },
  };
  const locationData = { climate: { type: "temperate" } };
  const projectContext = { buildingProgram: "residential" };

  test("buildHero3DPrompt with London pack injects narrative, parapet, sash, materials", () => {
    const pack = resolveUKVernacular({ postcode: "W2 5SH" });
    const { prompt } = buildHero3DPrompt({
      masterDNA,
      locationData,
      projectContext,
      vernacularPack: pack,
    });
    expect(prompt).toContain("REGIONAL VERNACULAR (UK pack):");
    expect(prompt).toContain("London stucco terrace");
    expect(prompt).toContain("Regency");
    expect(prompt).toMatch(/parapet/i);
    expect(prompt).toMatch(/sash/i);
    expect(prompt).toMatch(/stucco|render/i);
    expect(prompt).toMatch(/semi.?basement|cast.?iron|york stone/i);
    // Geometry / massing constraints still present.
    expect(prompt).toContain("FLOOR COUNT: EXACTLY");
    expect(prompt).toContain("DESIGN SPECIFICATION");
  });

  test("buildExteriorRenderPrompt without a pack produces no London-specific text", () => {
    const { prompt } = buildExteriorRenderPrompt({
      masterDNA,
      locationData,
      projectContext,
    });
    expect(prompt).not.toContain("REGIONAL VERNACULAR");
    expect(prompt).not.toContain("London stucco terrace");
    expect(prompt).not.toContain("Notting Hill");
    // The existing baseline prompt structure is preserved.
    expect(prompt).toContain("Front-elevation hero render");
    expect(prompt).toContain("Photoreal architectural front-elevation render");
  });

  // Phase B floor-count clamp — when a pack implies a semi-basement and
  // the brief asks for ≤2 above-grade storeys, the LLM must be told the
  // basement is a stylistic plinth only, not a third habitable storey.
  // This was the root cause of the 3D-vs-2D floor-count mismatch the user
  // observed on the post-PR-92 W2 generation (axonometric / exterior
  // perspective showed 3 floors, plans/sections showed 2).
  // Phase D1 supersedes Phase B's clamp text. Positive constraints
  // ("BUILDING STOREYS: EXACTLY N", "Plinth at pavement level only") work on
  // LLMs where negative clamps ("Do NOT add a third floor") failed in the
  // post-PR-93 production W2 test (still rendered 3 storeys with basement).
  test("buildHero3DPrompt: Phase D1 storey-count + basement-scrub for pack.semi_basement_default && floors=2", () => {
    const pack = resolveUKVernacular({ postcode: "W2 5SH" });
    const dnaTwoFloors = {
      ...masterDNA,
      dimensions: { length_m: 8, width_m: 6, height_m: 6, floor_count: 2 },
    };
    const { prompt } = buildHero3DPrompt({
      masterDNA: dnaTwoFloors,
      locationData,
      projectContext,
      vernacularPack: pack,
    });
    // Hard storey-count line up front (positive constraint).
    expect(prompt).toMatch(
      /BUILDING STOREYS:\s*EXACTLY\s+2\s+above-grade\s+stor[ei]ys?/,
    );
    // The "no basement" disclaimer is part of the storey statement.
    expect(prompt).toMatch(
      /No semi-basement, no basement window band, no additional habitable floor below ground level/,
    );
    // Replacement bullet — pavement-level plinth only.
    expect(prompt).toMatch(
      /Plinth at pavement level only.*NO semi-basement.*NO front-area railings/,
    );
    // The descriptive narrative must NOT mention a semi-basement when the
    // clamp is active (LLMs read "semi-basement" as a third visible storey
    // regardless of any later negation).
    const narrativeMatch = prompt.match(/-\s*Narrative:[^\n]+/);
    expect(narrativeMatch).not.toBeNull();
    expect(narrativeMatch[0].toLowerCase()).not.toMatch(/semi[-\s]?basement/);
    expect(narrativeMatch[0].toLowerCase()).not.toMatch(/cast[-\s]?iron/);
    expect(narrativeMatch[0].toLowerCase()).not.toMatch(/york stone/);
  });

  test("buildExteriorRenderPrompt does NOT emit the clamp when target storeys >= 3 (clamp scope)", () => {
    const pack = resolveUKVernacular({ postcode: "EH8 9YL" });
    const dnaFourFloors = {
      ...masterDNA,
      dimensions: { length_m: 8, width_m: 6, height_m: 12, floor_count: 4 },
    };
    const { prompt } = buildExteriorRenderPrompt({
      masterDNA: dnaFourFloors,
      locationData,
      projectContext,
      vernacularPack: pack,
    });
    // Edinburgh tenement is multi-storey; keep the original semi-basement
    // language without the EXACTLY-N clamp.
    expect(prompt).not.toMatch(/STYLISTIC PLINTH/);
    expect(prompt).not.toMatch(/Do NOT add a third habitable floor/);
    expect(prompt).toMatch(/Semi-basement.*cast-iron/);
  });

  test("buildExteriorRenderPrompt skips the clamp when the pack has no semi-basement", () => {
    const pack = resolveUKVernacular({ postcode: "M14 5SH" });
    const dnaTwoFloors = {
      ...masterDNA,
      dimensions: { length_m: 8, width_m: 6, height_m: 6, floor_count: 2 },
    };
    const { prompt } = buildExteriorRenderPrompt({
      masterDNA: dnaTwoFloors,
      locationData,
      projectContext,
      vernacularPack: pack,
    });
    // Manchester back-to-back has semi_basement_default = false → no
    // semi-basement line should appear at all.
    expect(prompt).not.toMatch(/STYLISTIC PLINTH/);
    expect(prompt).not.toMatch(/Semi-basement/);
  });

  // Codex P1 regression: the buildingTypeDefault fallback object from
  // localStylePack should NOT trigger the REGIONAL VERNACULAR block — the
  // prompt must remain identical to the no-pack path.
  test("buildExteriorRenderPrompt with buildingTypeDefault fallback emits no REGIONAL VERNACULAR block", () => {
    const fallbackProvenance = {
      ukVernacularPackId: null,
      packLabel: null,
      region: null,
      descriptive_narrative: null,
      historical_period: null,
      resolution_source: null,
      source: "buildingTypeDefault",
    };
    const { prompt } = buildExteriorRenderPrompt({
      masterDNA,
      locationData,
      projectContext,
      vernacularPack: fallbackProvenance,
    });
    expect(prompt).not.toContain("REGIONAL VERNACULAR");
    expect(prompt).not.toContain("london-stucco-terrace");
    expect(prompt).not.toContain("edinburgh-tenement");
  });

  test("buildExteriorRenderPrompt preserves geometry constraint when pack is added", () => {
    const pack = resolveUKVernacular({ postcode: "EH8 9YL" });
    const geometryHint = { type: "tenement_block_4_storey" };
    const { prompt } = buildExteriorRenderPrompt({
      masterDNA,
      locationData,
      projectContext,
      geometryHint,
      vernacularPack: pack,
    });
    expect(prompt).toContain("REGIONAL VERNACULAR (UK pack):");
    expect(prompt).toMatch(/Edinburgh.*tenement/i);
    // Geometry authority must still appear despite the pack injection.
    expect(prompt).toContain("FOLLOW PROVIDED GEOMETRY silhouette");
    expect(prompt).toContain("(tenement_block_4_storey)");
    // Floor count + roof requirements still anchored.
    expect(prompt).toContain("FLOOR COUNT: EXACTLY");
  });

  test("buildProjectGraphRenderPrompt receives full propagated W2 styleProvenance", () => {
    const brief = {
      project_name: "W2 ProjectGraph Prompt",
      building_type: "dwelling",
      target_storeys: 2,
      site_input: { postcode: "W2 5SH" },
    };
    const pack = resolveUKVernacular({ postcode: "W2 5SH" });
    const localStyle = buildLocalStylePackV2({
      brief,
      site: { uk_vernacular_pack: pack },
      climate: { overheating: { risk_level: "low" } },
    });
    expect(localStyle.style_provenance).toMatchObject({
      ukVernacularPackId: "london-stucco-terrace",
      materials: expect.arrayContaining(["white stucco render"]),
      parapet_default: true,
      semi_basement_default: true,
      facade_language: expect.stringMatching(/stucco/i),
      roof_language: expect.stringMatching(/parapet/i),
      window_language: expect.stringMatching(/sash/i),
    });

    const prompt = buildProjectGraphRenderPrompt({
      panelType: "hero_3d",
      brief,
      compiledProject: makeFixtureGeometry(),
      climate: { weather_source: "test" },
      localStyle,
      styleDNA: {},
      programmeSummary: null,
      region: "London",
    });

    expect(prompt).toContain("REGIONAL VERNACULAR (UK pack):");
    expect(prompt).toContain("london-stucco-terrace");
    expect(prompt).toContain("white stucco render");
    expect(prompt).toMatch(/Facade language: .*stucco/i);
    expect(prompt).toMatch(/Roof language: .*parapet/i);
    expect(prompt).toMatch(/Window language: .*sash/i);
    expect(prompt).toMatch(/Roofline: parapet/i);
    expect(prompt).toMatch(/BUILDING STOREYS:\s*EXACTLY\s+2/);
    expect(prompt).toMatch(/No semi-basement, no basement window band/i);
    expect(prompt).toMatch(/Plinth at pavement level only/i);
  });
});

// Phase D2 — section renderer parapet awareness. The post-PR-93 W2 production
// test showed elevations rendered a flat parapet (PR #92 worked there) but
// sections still cut through a triangular gable, breaking section/elevation
// parity. The section renderer must mirror the elevation override: when
// pack.parapet_default is true, draw a horizontal coping band instead of a
// gable triangle.
describe("renderSectionSvg — Phase D2 parapet awareness", () => {
  test("london-stucco-terrace section forces flat parapet (no gable triangle), tags root attrs", () => {
    const pack = resolveUKVernacular({ postcode: "W2 5SH" });
    const result = renderSectionSvg(
      makeFixtureGeometry(),
      { roof_language: "pitched gable" },
      {
        sectionType: "longitudinal",
        vernacularPack: pack,
      },
    );
    expect(result.svg).toBeTruthy();
    expect(result.svg).toContain(
      'data-vernacular-pack="london-stucco-terrace"',
    );
    expect(result.svg).toContain('data-pack-parapet="true"');
    // Flat-roof path emits a roof-pitch-status="flat" attribute via
    // renderRoofPitchDataAttributes; gable path does not.
    expect(result.svg).toMatch(/data-roof-pitch-status="flat"/);
    // The flat path's renderRoof draws a horizontal coping rect at topY-12.
    // The gable path draws a triangle with M..L..L..Z. Confirm we got the
    // horizontal coping pattern, not the triangle.
    expect(result.svg).not.toMatch(/<path[^>]*data-roof-truth/);
    expect(result.technical_quality_metadata.vernacular_pack_parapet).toBe(
      true,
    );
    expect(result.technical_quality_metadata.vernacular_pack_id).toBe(
      "london-stucco-terrace",
    );
  });

  test("section without a pack keeps the gable / pitched roof unchanged (flag-off fallback)", () => {
    const result = renderSectionSvg(
      makeFixtureGeometry(),
      { roof_language: "pitched gable" },
      { sectionType: "longitudinal" },
    );
    expect(result.svg).toBeTruthy();
    expect(result.svg).not.toContain("data-vernacular-pack=");
    expect(result.svg).not.toContain("data-pack-parapet=");
    // Pitched roof should NOT show the flat-status data attr.
    expect(result.svg).not.toMatch(/data-roof-pitch-status="flat"/);
    expect(result.technical_quality_metadata.vernacular_pack_id).toBeNull();
    expect(result.technical_quality_metadata.vernacular_pack_parapet).toBe(
      false,
    );
  });

  test("buildingTypeDefault fallback provenance does NOT trigger parapet override on section", () => {
    const fallbackProvenance = {
      ukVernacularPackId: null,
      packId: null,
      packLabel: null,
      label: null,
      source: "buildingTypeDefault",
      parapet_default: false,
      semi_basement_default: false,
      materials: [],
    };
    const result = renderSectionSvg(
      makeFixtureGeometry(),
      { roof_language: "pitched gable" },
      {
        sectionType: "longitudinal",
        vernacularPack: fallbackProvenance,
      },
    );
    expect(result.svg).toBeTruthy();
    expect(result.svg).not.toContain("data-vernacular-pack=");
    expect(result.svg).not.toContain("data-pack-parapet=");
    expect(result.technical_quality_metadata.vernacular_pack_id).toBeNull();
  });

  test("edinburgh-tenement (parapet false) does NOT force flat coping", () => {
    const pack = resolveUKVernacular({ postcode: "EH8 9YL" });
    expect(pack.parapet_default).toBe(false);
    const result = renderSectionSvg(
      makeFixtureGeometry(),
      { roof_language: "pitched gable" },
      {
        sectionType: "longitudinal",
        vernacularPack: pack,
      },
    );
    expect(result.svg).toContain('data-vernacular-pack="edinburgh-tenement"');
    expect(result.svg).toContain('data-pack-parapet="false"');
    expect(result.svg).not.toMatch(/data-roof-pitch-status="flat"/);
    expect(result.technical_quality_metadata.vernacular_pack_parapet).toBe(
      false,
    );
  });
});
