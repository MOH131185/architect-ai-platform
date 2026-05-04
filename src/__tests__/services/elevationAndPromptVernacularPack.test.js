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
import {
  buildHero3DPrompt,
  buildExteriorRenderPrompt,
} from "../../services/a1/panelPromptBuilders.js";
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
});
