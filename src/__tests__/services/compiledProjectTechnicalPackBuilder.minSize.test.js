/**
 * Panel minimum-size floors.
 *
 * The readability work in this PR bumps the elevation minimum readable
 * footprint from 560×320 to 640×400 so ridge / level datum labels
 * survive board-v2 sheet-mode polish on non-residential sheets. Plans
 * and sections stay at their existing floors to preserve the
 * residential deterministic path.
 */

import { getTechnicalPanelRenderSize } from "../../services/canonical/compiledProjectTechnicalPackBuilder.js";

describe("getTechnicalPanelRenderSize — readability floors", () => {
  test("elevation_north meets the new 640×400 readability floor", () => {
    const size = getTechnicalPanelRenderSize("elevation_north", 2, "board-v2");
    expect(size.width).toBeGreaterThanOrEqual(640);
    expect(size.height).toBeGreaterThanOrEqual(400);
  });

  test("elevation_south meets the new 640×400 readability floor", () => {
    const size = getTechnicalPanelRenderSize("elevation_south", 2, "board-v2");
    expect(size.width).toBeGreaterThanOrEqual(640);
    expect(size.height).toBeGreaterThanOrEqual(400);
  });

  test("floor_plan_ground still meets the 760×420 floor (no residential regression)", () => {
    const size = getTechnicalPanelRenderSize(
      "floor_plan_ground",
      2,
      "board-v2",
    );
    expect(size.width).toBeGreaterThanOrEqual(760);
    expect(size.height).toBeGreaterThanOrEqual(420);
  });

  test("section_AA still meets the 720×400 floor (no residential regression)", () => {
    const size = getTechnicalPanelRenderSize("section_AA", 2, "board-v2");
    expect(size.width).toBeGreaterThanOrEqual(720);
    expect(size.height).toBeGreaterThanOrEqual(400);
  });

  test("presentation-v3 (residential) elevations also meet the new floor", () => {
    const size = getTechnicalPanelRenderSize(
      "elevation_north",
      2,
      "presentation-v3",
    );
    expect(size.width).toBeGreaterThanOrEqual(640);
    expect(size.height).toBeGreaterThanOrEqual(400);
  });
});
