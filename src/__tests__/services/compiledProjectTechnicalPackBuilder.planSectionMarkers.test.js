/**
 * fix/a1-vernacular-elevation-and-plan-section-markers regression coverage.
 *
 * The W2 ProjectGraph validation showed `cad-section-marker` and
 * `id="plan-section-markers"` absent from the composed A1 sheet even though
 * `compiledProject.sectionCuts.candidates` was populated by the section-cut
 * planner. Root cause: the canonical projectGeometry coercer drops
 * `sectionCuts` (different shape/key), so renderPlanSvg's `geometry.sections`
 * was always empty.
 *
 * Fix: `buildPlanSectionsFromCompiledProject` adapts the planner output to
 * the renderer's expected shape, with a deterministic footprint-centroid
 * fallback for the case where the planner produced no usable cutLine.
 *
 * These tests pin:
 *   1. The adapter prefers `sectionCuts.byType.{longitudinal,transverse}`.
 *   2. It falls back to a centroid cut when the candidate's cutLine does
 *      not overlap the footprint bbox.
 *   3. It falls back to a centroid cut when no candidate exists for a type.
 *   4. The renderPlanSvg pipeline emits `<g id="plan-section-markers">` and
 *      `class="cad-section-marker"` with letters A-A and B-B.
 *   5. Markers render on every level when `level_id` is unset (multi-level).
 */

import {
  buildCompiledProjectTechnicalPanels,
  buildPlanSectionsFromCompiledProject,
} from "../../services/canonical/compiledProjectTechnicalPackBuilder.js";
import { renderPlanSvg } from "../../services/drawing/svgPlanRenderer.js";

function makeFootprintBbox(width = 8, depth = 9.563) {
  // W2-shape bbox: depth-major (long axis Y).
  return {
    min_x: -width / 2,
    min_y: -depth / 2,
    max_x: width / 2,
    max_y: depth / 2,
    width,
    height: depth,
  };
}

function makeCompiledProjectWithCutCandidates({
  longitudinalCutLine = null,
  transverseCutLine = null,
  bbox = makeFootprintBbox(),
} = {}) {
  const candidates = [];
  if (longitudinalCutLine) {
    candidates.push({
      id: "section-long-real",
      sectionType: "longitudinal",
      cutLine: longitudinalCutLine,
    });
  }
  if (transverseCutLine) {
    candidates.push({
      id: "section-trans-real",
      sectionType: "transverse",
      cutLine: transverseCutLine,
    });
  }
  return {
    footprint: { bbox },
    envelope: { bbox },
    sectionCuts: {
      byType: {
        longitudinal: longitudinalCutLine ? "section-long-real" : null,
        transverse: transverseCutLine ? "section-trans-real" : null,
      },
      candidates,
    },
  };
}

describe("buildPlanSectionsFromCompiledProject — adapter behaviour", () => {
  test("uses real candidate cutLines when they overlap the footprint bbox", () => {
    const bbox = makeFootprintBbox();
    const compiled = makeCompiledProjectWithCutCandidates({
      bbox,
      longitudinalCutLine: { from: { x: 0, y: -4 }, to: { x: 0, y: 4 } },
      transverseCutLine: { from: { x: -3, y: 0 }, to: { x: 3, y: 0 } },
    });
    const sections = buildPlanSectionsFromCompiledProject(compiled);
    expect(sections).toHaveLength(2);
    const longSection = sections.find((s) => s.sectionType === "longitudinal");
    const transSection = sections.find((s) => s.sectionType === "transverse");
    expect(longSection.id).toBe("section-long-real");
    expect(longSection.source).toBe("compiled_project_section_cuts");
    expect(longSection.cutLine).toEqual({
      from: { x: 0, y: -4 },
      to: { x: 0, y: 4 },
    });
    expect(transSection.id).toBe("section-trans-real");
    expect(transSection.source).toBe("compiled_project_section_cuts");
  });

  test("fallback to centroid when candidate cutLine is outside the footprint bbox (W2 case)", () => {
    // Mirrors the actual W2 shape: planner-supplied cutLines sit way off
    // the plan's drawing bbox (longitudinal at x=6 when footprint x range
    // is [-2.479, 5.521]; transverse at y=max_y).
    const bbox = makeFootprintBbox(8, 9.563);
    const compiled = makeCompiledProjectWithCutCandidates({
      bbox,
      longitudinalCutLine: { from: { x: 60, y: 0 }, to: { x: 60, y: 10 } },
      transverseCutLine: { from: { x: 0, y: 60 }, to: { x: 12, y: 60 } },
    });
    const sections = buildPlanSectionsFromCompiledProject(compiled);
    expect(sections).toHaveLength(2);
    sections.forEach((section) => {
      expect(section.source).toBe(
        "compiled_project_section_cuts_fallback_centroid",
      );
    });
    const longSection = sections.find((s) => s.sectionType === "longitudinal");
    // Depth-major bbox → longitudinal cut runs along Y at centre X=0.
    expect(longSection.cutLine.from.x).toBe(0);
    expect(longSection.cutLine.to.x).toBe(0);
    expect(longSection.cutLine.from.y).toBeCloseTo(bbox.min_y, 5);
    expect(longSection.cutLine.to.y).toBeCloseTo(bbox.max_y, 5);
    const transSection = sections.find((s) => s.sectionType === "transverse");
    // Transverse cut runs along X at centre Y=0.
    expect(transSection.cutLine.from.y).toBe(0);
    expect(transSection.cutLine.to.y).toBe(0);
    expect(transSection.cutLine.from.x).toBeCloseTo(bbox.min_x, 5);
    expect(transSection.cutLine.to.x).toBeCloseTo(bbox.max_x, 5);
  });

  test("centroid fallback when no candidate exists for the type", () => {
    const bbox = makeFootprintBbox();
    const compiled = makeCompiledProjectWithCutCandidates({
      bbox,
      longitudinalCutLine: null,
      transverseCutLine: null,
    });
    const sections = buildPlanSectionsFromCompiledProject(compiled);
    expect(sections).toHaveLength(2);
    sections.forEach((section) => {
      expect(section.source).toBe("footprint_centroid_fallback");
      expect(section.id).toMatch(
        /^plan-marker-(longitudinal|transverse)-fallback$/,
      );
    });
  });

  test("returns [] when no footprint bbox is available (no fallback possible)", () => {
    const compiled = { sectionCuts: { byType: {}, candidates: [] } };
    const sections = buildPlanSectionsFromCompiledProject(compiled);
    expect(sections).toEqual([]);
  });

  test("level_id is left unset so the marker renders on every storey", () => {
    const bbox = makeFootprintBbox();
    const compiled = makeCompiledProjectWithCutCandidates({ bbox });
    const sections = buildPlanSectionsFromCompiledProject(compiled);
    sections.forEach((section) => {
      expect(section.level_id).toBeUndefined();
    });
  });

  test("does not duplicate markers when the same id appears multiple times", () => {
    const bbox = makeFootprintBbox();
    const compiled = {
      footprint: { bbox },
      envelope: { bbox },
      sectionCuts: {
        byType: { longitudinal: "section-x", transverse: "section-y" },
        candidates: [
          {
            id: "section-x",
            sectionType: "longitudinal",
            cutLine: { from: { x: 0, y: -4 }, to: { x: 0, y: 4 } },
          },
          {
            id: "section-x", // duplicate id
            sectionType: "longitudinal",
            cutLine: { from: { x: 0, y: -4 }, to: { x: 0, y: 4 } },
          },
          {
            id: "section-y",
            sectionType: "transverse",
            cutLine: { from: { x: -3, y: 0 }, to: { x: 3, y: 0 } },
          },
        ],
      },
    };
    const sections = buildPlanSectionsFromCompiledProject(compiled);
    // Exactly one per type.
    expect(sections).toHaveLength(2);
    expect(
      sections.filter((s) => s.sectionType === "longitudinal"),
    ).toHaveLength(1);
    expect(sections.filter((s) => s.sectionType === "transverse")).toHaveLength(
      1,
    );
  });
});

describe("renderPlanSvg — options.sections is honoured", () => {
  function rect(minX, minY, maxX, maxY) {
    return [
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY },
    ];
  }

  function makeMinimalGeometry() {
    return {
      schema_version: "v1",
      project_id: "test",
      site: { north_orientation_deg: 0 },
      levels: [
        { id: "ground", level_number: 0, name: "Ground" },
        { id: "first", level_number: 1, name: "First" },
      ],
      rooms: [
        {
          id: "room-g",
          level_id: "ground",
          name: "Living",
          actual_area: 24 * 16,
          polygon: rect(0, 0, 24, 16),
          bbox: { min_x: 0, min_y: 0, max_x: 24, max_y: 16 },
          centroid: { x: 12, y: 8 },
        },
        {
          id: "room-f",
          level_id: "first",
          name: "Bedroom",
          actual_area: 24 * 16,
          polygon: rect(0, 0, 24, 16),
          bbox: { min_x: 0, min_y: 0, max_x: 24, max_y: 16 },
          centroid: { x: 12, y: 8 },
        },
      ],
      walls: [
        {
          id: "wall-g-s",
          level_id: "ground",
          exterior: true,
          thickness_m: 0.3,
          start: { x: 0, y: 0 },
          end: { x: 24, y: 0 },
        },
        {
          id: "wall-g-e",
          level_id: "ground",
          exterior: true,
          thickness_m: 0.3,
          start: { x: 24, y: 0 },
          end: { x: 24, y: 16 },
        },
        {
          id: "wall-g-n",
          level_id: "ground",
          exterior: true,
          thickness_m: 0.3,
          start: { x: 24, y: 16 },
          end: { x: 0, y: 16 },
        },
        {
          id: "wall-g-w",
          level_id: "ground",
          exterior: true,
          thickness_m: 0.3,
          start: { x: 0, y: 16 },
          end: { x: 0, y: 0 },
        },
      ],
      footprints: [
        {
          id: "fp-g",
          level_id: "ground",
          polygon: rect(0, 0, 24, 16),
        },
        {
          id: "fp-f",
          level_id: "first",
          polygon: rect(0, 0, 24, 16),
        },
      ],
      sections: [],
    };
  }

  test("options.sections drives plan-section-markers when geometry.sections is empty", () => {
    const geometry = makeMinimalGeometry();
    const result = renderPlanSvg(geometry, {
      width: 1200,
      height: 900,
      levelId: "ground",
      sections: [
        {
          id: "fix-long",
          sectionType: "longitudinal",
          cutLine: { from: { x: 12, y: 0 }, to: { x: 12, y: 16 } },
        },
        {
          id: "fix-trans",
          sectionType: "transverse",
          cutLine: { from: { x: 0, y: 8 }, to: { x: 24, y: 8 } },
        },
      ],
    });
    expect(result.svg).toContain('id="plan-section-markers"');
    expect(result.svg).toContain('class="section-marker cad-section-marker');
    expect(result.svg).toContain('data-section-letter="A"');
    expect(result.svg).toContain('data-section-letter="B"');
    expect(result.svg).toContain('data-section-label="A-A"');
    expect(result.svg).toContain('data-section-label="B-B"');
  });

  test("options.sections takes precedence over geometry.sections", () => {
    const geometry = makeMinimalGeometry();
    geometry.sections = [
      {
        id: "ignored-by-renderer",
        sectionType: "longitudinal",
        cutLine: { from: { x: 4, y: 0 }, to: { x: 4, y: 16 } },
      },
    ];
    const result = renderPlanSvg(geometry, {
      width: 1200,
      height: 900,
      levelId: "ground",
      sections: [
        {
          id: "from-options",
          sectionType: "transverse",
          cutLine: { from: { x: 0, y: 8 }, to: { x: 24, y: 8 } },
        },
      ],
    });
    expect(result.svg).toContain('data-section-id="from-options"');
    expect(result.svg).not.toContain('data-section-id="ignored-by-renderer"');
  });

  test("markers render on each level (level_id unset)", () => {
    const geometry = makeMinimalGeometry();
    const sections = [
      {
        id: "S-L",
        sectionType: "longitudinal",
        cutLine: { from: { x: 12, y: 0 }, to: { x: 12, y: 16 } },
      },
      {
        id: "S-T",
        sectionType: "transverse",
        cutLine: { from: { x: 0, y: 8 }, to: { x: 24, y: 8 } },
      },
    ];
    const ground = renderPlanSvg(geometry, {
      width: 1200,
      height: 900,
      levelId: "ground",
      sections,
    });
    const first = renderPlanSvg(geometry, {
      width: 1200,
      height: 900,
      levelId: "first",
      sections,
    });
    expect(ground.svg).toContain('id="plan-section-markers"');
    expect(first.svg).toContain('id="plan-section-markers"');
    // Both markers visible on both levels.
    expect(ground.svg).toContain('data-section-id="S-L"');
    expect(ground.svg).toContain('data-section-id="S-T"');
    expect(first.svg).toContain('data-section-id="S-L"');
    expect(first.svg).toContain('data-section-id="S-T"');
  });

  test("level_id-scoped section only appears on the matching level", () => {
    const geometry = makeMinimalGeometry();
    const sections = [
      {
        id: "ground-only",
        sectionType: "longitudinal",
        cutLine: { from: { x: 12, y: 0 }, to: { x: 12, y: 16 } },
        level_id: "ground",
      },
    ];
    const ground = renderPlanSvg(geometry, {
      width: 1200,
      height: 900,
      levelId: "ground",
      sections,
    });
    const first = renderPlanSvg(geometry, {
      width: 1200,
      height: 900,
      levelId: "first",
      sections,
    });
    expect(ground.svg).toContain('data-section-id="ground-only"');
    expect(first.svg).not.toContain('data-section-id="ground-only"');
  });
});

describe("buildCompiledProjectTechnicalPanels — end-to-end plan markers", () => {
  // Lightweight compiledProject schema fixture sufficient for the technical
  // pack builder + plan renderer to produce a non-blocked SVG.
  function makeCompiledProjectFixture() {
    const bbox = {
      min_x: 0,
      min_y: 0,
      max_x: 24,
      max_y: 16,
      width: 24,
      height: 16,
    };
    return {
      schema_version: "compiled-project-v1",
      metadata: { source: "test_fixture" },
      geometryHash: "test-hash",
      site: { north_orientation_deg: 0 },
      footprint: {
        polygon: [
          { x: 0, y: 0 },
          { x: 24, y: 0 },
          { x: 24, y: 16 },
          { x: 0, y: 16 },
        ],
        bbox,
        area_m2: 384,
      },
      envelope: { bbox, width_m: 24, depth_m: 16, height_m: 6, level_count: 2 },
      levels: [
        {
          id: "level-0",
          level_number: 0,
          name: "Ground Floor",
          height_m: 3.0,
          footprint: {
            polygon: [
              { x: 0, y: 0 },
              { x: 24, y: 0 },
              { x: 24, y: 16 },
              { x: 0, y: 16 },
            ],
            bbox,
          },
        },
        {
          id: "level-1",
          level_number: 1,
          name: "First Floor",
          height_m: 3.0,
          footprint: {
            polygon: [
              { x: 0, y: 0 },
              { x: 24, y: 0 },
              { x: 24, y: 16 },
              { x: 0, y: 16 },
            ],
            bbox,
          },
        },
      ],
      rooms: [
        {
          id: "room-g",
          level_id: "level-0",
          name: "Living",
          actual_area: 384,
          polygon: [
            { x: 0, y: 0 },
            { x: 24, y: 0 },
            { x: 24, y: 16 },
            { x: 0, y: 16 },
          ],
          bbox,
          centroid: { x: 12, y: 8 },
        },
        {
          id: "room-f",
          level_id: "level-1",
          name: "Bedroom",
          actual_area: 384,
          polygon: [
            { x: 0, y: 0 },
            { x: 24, y: 0 },
            { x: 24, y: 16 },
            { x: 0, y: 16 },
          ],
          bbox,
          centroid: { x: 12, y: 8 },
        },
      ],
      walls: [
        {
          id: "wall-g-s",
          level_id: "level-0",
          room_ids: ["room-g"],
          exterior: true,
          thickness_m: 0.3,
          start: { x: 0, y: 0 },
          end: { x: 24, y: 0 },
        },
        {
          id: "wall-g-e",
          level_id: "level-0",
          room_ids: ["room-g"],
          exterior: true,
          thickness_m: 0.3,
          start: { x: 24, y: 0 },
          end: { x: 24, y: 16 },
        },
        {
          id: "wall-g-n",
          level_id: "level-0",
          room_ids: ["room-g"],
          exterior: true,
          thickness_m: 0.3,
          start: { x: 24, y: 16 },
          end: { x: 0, y: 16 },
        },
        {
          id: "wall-g-w",
          level_id: "level-0",
          room_ids: ["room-g"],
          exterior: true,
          thickness_m: 0.3,
          start: { x: 0, y: 16 },
          end: { x: 0, y: 0 },
        },
        {
          id: "wall-f-s",
          level_id: "level-1",
          room_ids: ["room-f"],
          exterior: true,
          thickness_m: 0.3,
          start: { x: 0, y: 0 },
          end: { x: 24, y: 0 },
        },
        {
          id: "wall-f-e",
          level_id: "level-1",
          room_ids: ["room-f"],
          exterior: true,
          thickness_m: 0.3,
          start: { x: 24, y: 0 },
          end: { x: 24, y: 16 },
        },
        {
          id: "wall-f-n",
          level_id: "level-1",
          room_ids: ["room-f"],
          exterior: true,
          thickness_m: 0.3,
          start: { x: 24, y: 16 },
          end: { x: 0, y: 16 },
        },
        {
          id: "wall-f-w",
          level_id: "level-1",
          room_ids: ["room-f"],
          exterior: true,
          thickness_m: 0.3,
          start: { x: 0, y: 16 },
          end: { x: 0, y: 0 },
        },
      ],
      openings: [],
      stairs: [],
      sectionCuts: {
        byType: {
          longitudinal: "long-1",
          transverse: "trans-1",
        },
        candidates: [
          {
            id: "long-1",
            sectionType: "longitudinal",
            cutLine: { from: { x: 12, y: 0 }, to: { x: 12, y: 16 } },
          },
          {
            id: "trans-1",
            sectionType: "transverse",
            cutLine: { from: { x: 0, y: 8 }, to: { x: 24, y: 8 } },
          },
        ],
      },
    };
  }

  test("technical pack floor plan emits plan-section-markers when sectionCuts are populated", () => {
    const result = buildCompiledProjectTechnicalPanels(
      makeCompiledProjectFixture(),
      { layoutTemplate: "presentation-v3" },
    );
    expect(result.ok).toBe(true);
    const groundPlan =
      result.technicalPanels?.floor_plan_ground ||
      result.technicalPanels?.floor_plan_level1 ||
      null;
    expect(groundPlan).toBeTruthy();
    expect(groundPlan.svgString).toContain('id="plan-section-markers"');
    expect(groundPlan.svgString).toContain(
      'class="section-marker cad-section-marker',
    );
    expect(groundPlan.svgString).toContain('data-section-letter="A"');
    expect(groundPlan.svgString).toContain('data-section-letter="B"');
    expect(groundPlan.svgString).toContain('data-section-label="A-A"');
    expect(groundPlan.svgString).toContain('data-section-label="B-B"');
  });

  test("technical pack emits deterministic provenance on floor plan, elevation, and section artifacts", () => {
    const result = buildCompiledProjectTechnicalPanels(
      makeCompiledProjectFixture(),
      { layoutTemplate: "presentation-v3" },
    );

    expect(result.ok).toBe(true);
    for (const panelType of [
      "floor_plan_ground",
      "elevation_north",
      "section_AA",
    ]) {
      const panel = result.technicalPanels?.[panelType];
      expect(panel).toEqual(
        expect.objectContaining({
          technicalDrawing: true,
          renderer: "deterministic_svg",
          imageProviderUsed: "none",
          providerUsed: "deterministic_svg",
          provider: "deterministic",
          geometryHash: "test-hash",
          sourceGeometryHash: "test-hash",
          source_model_hash: "test-hash",
          svgHash: expect.any(String),
        }),
      );
      expect(panel.metadata).toEqual(
        expect.objectContaining({
          technicalDrawing: true,
          renderer: "deterministic_svg",
          imageProviderUsed: "none",
          providerUsed: "deterministic_svg",
          provider: "deterministic",
          geometryHash: "test-hash",
          sourceGeometryHash: "test-hash",
          source_model_hash: "test-hash",
          svgHash: panel.svgHash,
        }),
      );
    }
  });
});
