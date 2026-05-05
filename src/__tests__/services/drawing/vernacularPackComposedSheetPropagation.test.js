/**
 * fix/a1-vernacular-elevation-and-plan-section-markers regression coverage.
 *
 * The W2 ProjectGraph validation (post PR #93 / PR #95 main) showed that
 * `data-vernacular-pack` and `data-pack-*` attributes were absent from the
 * composed A1 sheet SVG even though the pack object reached the renderer
 * (technicalQualityMetadata.vernacular_pack_id was correctly populated).
 *
 * Root cause: the renderers placed the pack attributes on the OUTER <svg>
 * element. The sheet composer at projectGraphVerticalSliceService.renderSheetPanel
 * unwraps the panel SVG body into a re-positioned <svg>/wrapping <g>, which
 * drops every attribute that lived on the original outer <svg>.
 *
 * Fix: emit a self-closing <g class="cad-vernacular-pack-attrs"> INSIDE the
 * panel SVG body so the pack attributes survive the unwrap.
 *
 * These tests pin that invariant for both the elevation and section
 * renderers, and verify the pre-existing "no pack" path still emits no
 * vernacular markup at all.
 */

import { renderElevationSvg } from "../../../services/drawing/svgElevationRenderer.js";
import { renderSectionSvg } from "../../../services/drawing/svgSectionRenderer.js";

function makeFixtureGeometry() {
  return {
    metadata: {},
    levels: [
      { id: "level-0", index: 0, height_m: 3.0 },
      { id: "level-1", index: 1, height_m: 3.0 },
    ],
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
    ],
    doors: [
      {
        id: "door-1",
        wallId: "wall-s",
        levelId: "level-0",
        position_m: 4.0,
        width_m: 0.9,
        head_height_m: 2.1,
      },
    ],
    openings: [],
    envelope: { min: { x: 0, y: 0 }, max: { x: 8, y: 6 } },
  };
}

const W2_PROPAGATED_PACK = Object.freeze({
  ukVernacularPackId: "london-stucco-terrace",
  packId: "london-stucco-terrace",
  packLabel: "London stucco terrace",
  label: "London stucco terrace",
  region: "London — Westminster / Kensington / Chelsea / Notting Hill",
  source: "ukVernacularPacks",
  materials: [
    "white stucco render",
    "yellow London stock brick base",
    "natural slate roof",
  ],
  facade_language: "stucco-fronted with rusticated ground floor and parapet",
  roof_language: "concealed-behind-parapet pitched slate",
  window_language:
    "tall sash windows, vertically proportioned, diminishing per floor",
  parapet_default: true,
  semi_basement_default: true,
  layout_archetype: "linear_side_hall",
  conservation_typical: true,
});

describe("renderElevationSvg — pack attrs survive composition unwrap", () => {
  test('W2 pack: inner <g class="cad-vernacular-pack-attrs"> carries the data-pack-* attrs', () => {
    const result = renderElevationSvg(
      makeFixtureGeometry(),
      {},
      {
        orientation: "south",
        vernacularPack: W2_PROPAGATED_PACK,
        sheetMode: true,
        allowWeakFacadeFallback: true,
      },
    );
    expect(result.svg).toBeTruthy();
    // Outer <svg> attrs (existing behaviour) still present.
    expect(result.svg).toContain(
      'data-vernacular-pack="london-stucco-terrace"',
    );
    expect(result.svg).toContain('data-pack-parapet="true"');
    expect(result.svg).toContain('data-pack-semi-basement="true"');
    expect(result.svg).toContain('data-pack-facade-stucco="true"');
    // Inner <g> mirror — survives the panel-to-sheet composition unwrap.
    expect(result.svg).toMatch(
      /<g class="cad-vernacular-pack-attrs"[^>]*data-vernacular-pack="london-stucco-terrace"/,
    );
    expect(result.svg).toMatch(
      /<g class="cad-vernacular-pack-attrs"[^>]*data-pack-parapet="true"/,
    );
    expect(result.svg).toMatch(
      /<g class="cad-vernacular-pack-attrs"[^>]*data-pack-semi-basement="true"/,
    );
    expect(result.svg).toMatch(
      /<g class="cad-vernacular-pack-attrs"[^>]*data-pack-facade-stucco="true"/,
    );
    // Existing structural cues remain (regression guard).
    expect(result.svg).toMatch(/cad-material-hatch/);
    expect(result.svg).toMatch(/\bFFL\b/);
    expect(result.svg).toMatch(/\beaves\b/i);
    expect(result.svg).toMatch(/\bridge\b/i);
  });

  test("inner pack-attrs <g> survives the sheet-composition unwrap simulation", () => {
    const result = renderElevationSvg(
      makeFixtureGeometry(),
      {},
      {
        orientation: "south",
        vernacularPack: W2_PROPAGATED_PACK,
        sheetMode: true,
        allowWeakFacadeFallback: true,
      },
    );
    // Mimic the composer (renderSheetPanel) which extracts the inner body
    // and re-wraps it in a fresh <svg>/<g>, dropping the original outer
    // <svg ...> attributes.
    const innerBody = result.svg
      .replace(/^[\s\S]*?<svg[^>]*>/, "")
      .replace(/<\/svg>\s*$/, "");
    expect(innerBody).not.toContain("<?xml");
    expect(innerBody).toMatch(
      /<g class="cad-vernacular-pack-attrs"[^>]*data-vernacular-pack="london-stucco-terrace"/,
    );
    expect(innerBody).toMatch(
      /<g class="cad-vernacular-pack-attrs"[^>]*data-pack-parapet="true"/,
    );
    expect(innerBody).toMatch(
      /<g class="cad-vernacular-pack-attrs"[^>]*data-pack-facade-stucco="true"/,
    );
  });

  test("no pack: inner pack-attrs <g> is NOT emitted (no leakage)", () => {
    const result = renderElevationSvg(
      makeFixtureGeometry(),
      {},
      {
        orientation: "south",
        sheetMode: true,
        allowWeakFacadeFallback: true,
      },
    );
    expect(result.svg).toBeTruthy();
    expect(result.svg).not.toContain("cad-vernacular-pack-attrs");
    expect(result.svg).not.toContain("data-vernacular-pack=");
    expect(result.svg).not.toContain("data-pack-parapet=");
  });

  test("buildingTypeDefault style_provenance: inner pack-attrs <g> NOT emitted", () => {
    const fallbackProvenance = {
      ukVernacularPackId: null,
      packId: null,
      packLabel: null,
      source: "buildingTypeDefault",
    };
    const result = renderElevationSvg(
      makeFixtureGeometry(),
      {},
      {
        orientation: "south",
        vernacularPack: fallbackProvenance,
        sheetMode: true,
        allowWeakFacadeFallback: true,
      },
    );
    expect(result.svg).toBeTruthy();
    expect(result.svg).not.toContain("cad-vernacular-pack-attrs");
    expect(result.svg).not.toContain("data-vernacular-pack=");
  });
});

describe("renderSectionSvg — pack attrs survive composition unwrap", () => {
  test('W2 pack: inner <g class="cad-vernacular-pack-attrs"> emits parapet attr', () => {
    const result = renderSectionSvg(
      makeFixtureGeometry(),
      {},
      {
        sectionType: "longitudinal",
        vernacularPack: W2_PROPAGATED_PACK,
        sheetMode: true,
        allowWeakSectionFallback: true,
      },
    );
    expect(result.svg).toBeTruthy();
    // Outer <svg> attrs (existing behaviour).
    expect(result.svg).toContain(
      'data-vernacular-pack="london-stucco-terrace"',
    );
    expect(result.svg).toContain('data-pack-parapet="true"');
    // Inner <g> mirror.
    expect(result.svg).toMatch(
      /<g class="cad-vernacular-pack-attrs"[^>]*data-vernacular-pack="london-stucco-terrace"/,
    );
    expect(result.svg).toMatch(
      /<g class="cad-vernacular-pack-attrs"[^>]*data-pack-parapet="true"/,
    );
  });

  test("no pack: inner pack-attrs <g> is NOT emitted on section either", () => {
    const result = renderSectionSvg(
      makeFixtureGeometry(),
      {},
      {
        sectionType: "longitudinal",
        sheetMode: true,
        allowWeakSectionFallback: true,
      },
    );
    expect(result.svg).toBeTruthy();
    expect(result.svg).not.toContain("cad-vernacular-pack-attrs");
  });
});
