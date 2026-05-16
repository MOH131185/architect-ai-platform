/**
 * Phase 4 — Track 2: outer perimeter dimension chain.
 *
 * Locks the contract:
 *  - `drawOuterDimensionChain` emits an SVG fragment for every requested side
 *    when the envelope polygon has ≥ 3 corners.
 *  - For a rectangular envelope, each side yields exactly two chains: the
 *    per-segment "segments" chain and the overall "overall" chain. For an
 *    L-shape, the side carrying the inflection point also yields per-segment
 *    chain entries.
 *  - Returns "" gracefully on missing model / floor / envelope.
 *
 * Note — the SVG output itself is the deterministic Projections2D pipeline.
 * Tests here assert structural ids and segment counts via id-prefix grep,
 * not pixel positions, so they stay robust against future styling tweaks.
 */

import { drawOuterDimensionChain } from "../../geometry/Projections2D.js";

function rectModel(width = 10, depth = 8) {
  return {
    envelope: {
      polygon: [
        { x: -width * 500, y: -depth * 500 },
        { x: width * 500, y: -depth * 500 },
        { x: width * 500, y: depth * 500 },
        { x: -width * 500, y: depth * 500 },
      ],
    },
    getDimensionsMeters() {
      return { width, depth };
    },
  };
}

function lShapeModel() {
  // L-shape: 10m x 8m main, 6m x 4m notch removed from top-right corner.
  return {
    envelope: {
      polygon: [
        { x: -5000, y: -4000 },
        { x: 5000, y: -4000 },
        { x: 5000, y: 0 },
        { x: -1000, y: 0 },
        { x: -1000, y: 4000 },
        { x: -5000, y: 4000 },
      ],
    },
    getDimensionsMeters() {
      return { width: 10, depth: 8 };
    },
  };
}

const STANDARD_ARGS = {
  floor: { index: 0 },
  offsetX: 500,
  offsetY: 400,
  scale: 50,
};

describe("drawOuterDimensionChain", () => {
  test("returns '' when model is null", () => {
    const result = drawOuterDimensionChain({
      ...STANDARD_ARGS,
      model: null,
    });
    expect(result).toBe("");
  });

  test("returns '' when envelope polygon is missing", () => {
    const model = { getDimensionsMeters: () => ({ width: 10, depth: 8 }) };
    const result = drawOuterDimensionChain({
      ...STANDARD_ARGS,
      model,
    });
    expect(result).toBe("");
  });

  test("rectangular envelope emits chains on requested sides only", () => {
    const model = rectModel();
    const result = drawOuterDimensionChain({
      ...STANDARD_ARGS,
      model,
      sides: ["S", "W"],
    });
    // South side (horizontal axis) and West side (vertical axis) each get
    // an "-overall" chain. Two corners means the per-segment chain is the
    // overall chain too, so only "-overall" id is present.
    expect(result).toMatch(/plan-dim-s-overall/);
    expect(result).toMatch(/plan-dim-w-overall/);
    expect(result).not.toMatch(/plan-dim-n-overall/);
    expect(result).not.toMatch(/plan-dim-e-overall/);
  });

  test("L-shape envelope yields per-segment chain on the inflected side", () => {
    const model = lShapeModel();
    const result = drawOuterDimensionChain({
      ...STANDARD_ARGS,
      model,
      sides: ["S", "W"],
    });
    // The west side (vertical axis) carries 3 unique y coordinates
    // (-4000, 0, 4000) → per-segment chain emitted.
    expect(result).toMatch(/plan-dim-w-segments/);
    expect(result).toMatch(/plan-dim-w-overall/);
    // The south side (horizontal axis) carries 3 unique x coordinates
    // (-5000, -1000, 5000) → per-segment chain emitted.
    expect(result).toMatch(/plan-dim-s-segments/);
    expect(result).toMatch(/plan-dim-s-overall/);
  });

  test("default sides ['S','W'] applied when sides arg omitted", () => {
    const model = rectModel();
    const result = drawOuterDimensionChain({
      ...STANDARD_ARGS,
      model,
    });
    expect(result).toMatch(/plan-dim-s-overall/);
    expect(result).toMatch(/plan-dim-w-overall/);
  });

  test("supports all four sides", () => {
    const model = rectModel();
    const result = drawOuterDimensionChain({
      ...STANDARD_ARGS,
      model,
      sides: ["N", "E", "S", "W"],
    });
    expect(result).toMatch(/plan-dim-n-overall/);
    expect(result).toMatch(/plan-dim-e-overall/);
    expect(result).toMatch(/plan-dim-s-overall/);
    expect(result).toMatch(/plan-dim-w-overall/);
  });

  test("duplicate sides ignored", () => {
    const model = rectModel();
    const result = drawOuterDimensionChain({
      ...STANDARD_ARGS,
      model,
      sides: ["S", "S", "S"],
    });
    const matches = result.match(/plan-dim-s-overall/g);
    expect(matches).toHaveLength(1);
  });
});
