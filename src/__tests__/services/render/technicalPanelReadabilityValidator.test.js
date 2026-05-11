/**
 * Technical panel readability validator.
 *
 * Verifies the validator's pure-function contract: it must catch tiny
 * panels, clipped top/bottom content, low-occupancy panels, and obvious
 * elevation/section quality flags — without mutating panel SVGs or
 * authority metadata.
 */

import {
  validateTechnicalPanelReadability,
  READABILITY_CODES,
  TECHNICAL_PANEL_MIN_SIZE,
} from "../../../services/render/technicalPanelReadabilityValidator.js";

function panel(type, overrides = {}) {
  return {
    panelType: type,
    width: TECHNICAL_PANEL_MIN_SIZE.plan.width,
    height: TECHNICAL_PANEL_MIN_SIZE.plan.height,
    technical_quality_metadata: {},
    ...overrides,
  };
}

describe("validateTechnicalPanelReadability", () => {
  test("returns pass when every panel meets minimum size and no clipping flags", () => {
    const result = validateTechnicalPanelReadability({
      panels: [
        panel("floor_plan_ground", {
          width: 800,
          height: 500,
          technical_quality_metadata: { room_label_count: 6, wall_count: 24 },
        }),
        panel("elevation_north", {
          width: 700,
          height: 420,
          technical_quality_metadata: { roof_profile_visible: true },
        }),
      ],
    });
    expect(result.status).toBe("pass");
    expect(result.summary.errorCount).toBe(0);
    expect(result.summary.warningCount).toBe(0);
  });

  test("flags tiny plan with PANEL_BELOW_MIN_SIZE", () => {
    const result = validateTechnicalPanelReadability({
      panels: [
        panel("floor_plan_ground", {
          width: 400,
          height: 240,
          technical_quality_metadata: { room_label_count: 5, wall_count: 12 },
        }),
      ],
    });
    expect(result.status).toBe("fail");
    expect(
      result.issues.some(
        (i) => i.code === READABILITY_CODES.PANEL_BELOW_MIN_SIZE,
      ),
    ).toBe(true);
  });

  test("flags elevation with missing roof profile as ROOF_DATUM_MISSING", () => {
    const result = validateTechnicalPanelReadability({
      panels: [
        panel("elevation_south", {
          width: 800,
          height: 480,
          technical_quality_metadata: { roof_profile_visible: false },
        }),
      ],
    });
    expect(
      result.issues.some(
        (i) => i.code === READABILITY_CODES.ROOF_DATUM_MISSING,
      ),
    ).toBe(true);
  });

  test("flags clipped top content reported by the renderer", () => {
    const result = validateTechnicalPanelReadability({
      panels: [
        panel("elevation_north", {
          width: 800,
          height: 480,
          technical_quality_metadata: { content_clipped_top: true },
        }),
      ],
    });
    expect(result.status).toBe("fail");
    const codes = result.issues.map((i) => i.code);
    expect(codes).toContain(READABILITY_CODES.CONTENT_CLIPPED_TOP);
  });

  test("flags section poche obscuring labels", () => {
    const result = validateTechnicalPanelReadability({
      panels: [
        panel("section_BB", {
          width: 800,
          height: 480,
          technical_quality_metadata: {
            section_wall_cut_count: 4,
            poche_dominates_labels: true,
          },
        }),
      ],
    });
    expect(
      result.issues.some(
        (i) => i.code === READABILITY_CODES.POCHE_OBSCURES_LABELS,
      ),
    ).toBe(true);
  });

  test("ignores non-technical panels (hero_3d, material_palette, etc.)", () => {
    const result = validateTechnicalPanelReadability({
      panels: [
        { panelType: "hero_3d", width: 10, height: 10 },
        { panelType: "material_palette", width: 10, height: 10 },
      ],
    });
    expect(result.status).toBe("pass");
    expect(result.summary.evaluatedCount).toBe(0);
  });

  test("returns evaluatedCount equal to the number of technical panels", () => {
    const result = validateTechnicalPanelReadability({
      panels: [
        panel("floor_plan_ground", { width: 800, height: 500 }),
        panel("elevation_east", { width: 700, height: 420 }),
        { panelType: "hero_3d", width: 10, height: 10 },
      ],
    });
    expect(result.summary.evaluatedCount).toBe(2);
    expect(result.summary.panelCount).toBe(3);
  });

  test("low content occupancy raises a CONTENT_OCCUPANCY_LOW warning", () => {
    const result = validateTechnicalPanelReadability({
      panels: [
        panel("floor_plan_ground", {
          width: 800,
          height: 500,
          technical_quality_metadata: {
            room_label_count: 6,
            wall_count: 24,
            content_occupancy_ratio: 0.1,
          },
        }),
      ],
    });
    expect(
      result.issues.some(
        (i) => i.code === READABILITY_CODES.CONTENT_OCCUPANCY_LOW,
      ),
    ).toBe(true);
  });
});
