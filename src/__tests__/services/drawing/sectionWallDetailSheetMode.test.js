/**
 * Section-mode poche softening — the heavy `#151515` cut-fill at 0.86–
 * 0.96 opacity used in standalone drafting view was dominating the
 * Office Studio section B-B band. In sheet-mode the fill must use the
 * softened graphite + capped opacity while still preserving the
 * cut-truth hierarchy.
 */

import { buildSectionWallDetailMarkup } from "../../../services/drawing/sectionWallDetailService.js";

function cutWall(overrides = {}) {
  return {
    id: "wall-1",
    x: 20,
    y: 40,
    width: 30, // narrow — not an interior-background zone
    height: 80,
    truthState: "direct",
    clipGeometry: {
      truthKind: "cut_profile",
      bandCoverageRatio: 1,
      nearBoolean: true,
      profileSegments: [{ a: 0 }, { a: 1 }],
      profileContinuity: 1,
    },
    ...overrides,
  };
}

function parseFillAndOpacity(markup, wallId) {
  // First <rect> inside the wall group is the poche fill rect.
  const re = new RegExp(
    `<g id="phase13-section-cut-wall-${wallId}"[^>]*>\\s*<rect[^/]*?fill="(#[0-9a-fA-F]+)"[^/]*?fill-opacity="([0-9.]+)"`,
  );
  const m = markup.match(re);
  if (!m) return null;
  return { fill: m[1], opacity: Number(m[2]) };
}

describe("buildSectionWallDetailMarkup — sheet-mode poche softening", () => {
  test("standalone mode uses heavy #151515 fill with high opacity", () => {
    const result = buildSectionWallDetailMarkup({
      walls: [cutWall({ id: "wall-standalone" })],
    });
    const parsed = parseFillAndOpacity(result.markup, "wall-standalone");
    expect(parsed).not.toBeNull();
    expect(parsed.fill).toBe("#151515");
    expect(parsed.opacity).toBeGreaterThan(0.7);
  });

  test("sheet mode uses softened #2a2a2a fill with capped opacity", () => {
    const result = buildSectionWallDetailMarkup({
      walls: [cutWall({ id: "wall-sheet" })],
      sheetMode: true,
    });
    const parsed = parseFillAndOpacity(result.markup, "wall-sheet");
    expect(parsed).not.toBeNull();
    expect(parsed.fill).toBe("#2a2a2a");
    // Cap is 0.62; floor is 0.36. The cut_profile case lands inside the
    // softened range — must be at most 0.62 so the black band stops
    // dominating the panel.
    expect(parsed.opacity).toBeLessThanOrEqual(0.62);
    expect(parsed.opacity).toBeGreaterThanOrEqual(0.36);
  });

  test("sheet mode preserves cut-truth hierarchy: cut_face ≥ cut_profile opacity", () => {
    const result = buildSectionWallDetailMarkup({
      walls: [
        cutWall({
          id: "face",
          clipGeometry: { ...cutWall().clipGeometry, truthKind: "cut_face" },
        }),
        cutWall({
          id: "profile",
          clipGeometry: { ...cutWall().clipGeometry, truthKind: "cut_profile" },
        }),
      ],
      sheetMode: true,
    });
    const face = parseFillAndOpacity(result.markup, "face");
    const profile = parseFillAndOpacity(result.markup, "profile");
    expect(face).not.toBeNull();
    expect(profile).not.toBeNull();
    // cut_face must remain ≥ cut_profile opacity to preserve hierarchy.
    expect(face.opacity).toBeGreaterThanOrEqual(profile.opacity);
  });

  test("wide interior-background zone keeps its light fill regardless of sheet mode", () => {
    const wide = cutWall({ id: "wide", width: 200, height: 200 });
    const standalone = buildSectionWallDetailMarkup({ walls: [wide] });
    const sheet = buildSectionWallDetailMarkup({
      walls: [wide],
      sheetMode: true,
    });
    const standaloneFill = parseFillAndOpacity(standalone.markup, "wide");
    const sheetFill = parseFillAndOpacity(sheet.markup, "wide");
    // Both should use the interior-background light fill (#f4f5f6) and
    // its dedicated opacity — sheet mode does not override label-
    // readable backgrounds.
    expect(standaloneFill.fill).toBe("#f4f5f6");
    expect(sheetFill.fill).toBe("#f4f5f6");
  });
});
