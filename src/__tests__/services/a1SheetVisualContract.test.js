import { renderElevationSvg } from "../../services/drawing/svgElevationRenderer.js";
import { buildSectionWallDetailMarkup } from "../../services/drawing/sectionWallDetailService.js";
import { renderPlanSvg } from "../../services/drawing/svgPlanRenderer.js";
import { renderSectionSvg } from "../../services/drawing/svgSectionRenderer.js";
import {
  buildTitleBlockPanelArtifact,
  resolvePresentationLayoutTemplate,
  __projectGraphVerticalSliceInternals,
} from "../../services/project/projectGraphVerticalSliceService.js";

const { buildPanelPlacements, buildSheetSvg, buildSiteContextPanelArtifact } =
  __projectGraphVerticalSliceInternals;

const GEOMETRY_HASH = "visual-contract-geometry-hash";

function rect(minX, minY, maxX, maxY) {
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
}

function room(id, levelId, name, minX, minY, maxX, maxY) {
  return {
    id,
    level_id: levelId,
    name,
    actual_area: (maxX - minX) * (maxY - minY),
    polygon: rect(minX, minY, maxX, maxY),
    bbox: { min_x: minX, min_y: minY, max_x: maxX, max_y: maxY },
    centroid: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
  };
}

function wall(id, levelId, sx, sy, ex, ey) {
  return {
    id,
    level_id: levelId,
    exterior: true,
    thickness_m: 0.3,
    start: { x: sx, y: sy },
    end: { x: ex, y: ey },
  };
}

function terracedGeometry() {
  const footprint = rect(0, 0, 7.2, 13.4);
  const groundWalls = [
    wall("g-s", "ground", 0, 0, 7.2, 0),
    wall("g-n", "ground", 0, 13.4, 7.2, 13.4),
    wall("g-e", "ground", 7.2, 0, 7.2, 13.4),
    wall("g-w", "ground", 0, 0, 0, 13.4),
  ];
  const firstWalls = groundWalls.map((entry) => ({
    ...entry,
    id: entry.id.replace("g-", "f-"),
    level_id: "first",
  }));
  return {
    schema_version: "canonical-project-geometry-v2",
    project_id: "a1-visual-contract-terrace",
    geometryHash: GEOMETRY_HASH,
    site: {
      boundary_bbox: {
        min_x: -3,
        min_y: -5,
        max_x: 11,
        max_y: 20,
        width: 14,
        height: 25,
      },
      buildable_bbox: {
        min_x: 0,
        min_y: 0,
        max_x: 7.2,
        max_y: 13.4,
        width: 7.2,
        height: 13.4,
      },
      boundary_polygon: rect(-3, -5, 11, 20),
      buildable_polygon: footprint,
      north_orientation_deg: 0,
    },
    metadata: { geometry_rules: { roof_pitch_degrees: 38 } },
    footprints: [
      {
        id: "fp-ground",
        level_id: "ground",
        polygon: footprint,
        bbox: { min_x: 0, min_y: 0, max_x: 7.2, max_y: 13.4 },
      },
      {
        id: "fp-first",
        level_id: "first",
        polygon: footprint,
        bbox: { min_x: 0, min_y: 0, max_x: 7.2, max_y: 13.4 },
      },
    ],
    levels: [
      {
        id: "ground",
        level_number: 0,
        name: "Ground Floor",
        height_m: 3.05,
        footprint_id: "fp-ground",
      },
      {
        id: "first",
        level_number: 1,
        name: "First Floor",
        height_m: 3.0,
        footprint_id: "fp-first",
      },
    ],
    rooms: [
      room("living", "ground", "LIVING_ROOM", 0, 0, 3.5, 4.2),
      room("kitchen", "ground", "KITCHEN_DINING", 3.5, 0, 7.2, 4.2),
      room("hall", "ground", "HALL", 0, 4.2, 2.2, 13.4),
      room("bath-g", "ground", "BATH", 2.2, 4.2, 4.5, 7.2),
      room("utility", "ground", "UTILITY", 4.5, 4.2, 7.2, 7.2),
      room("study", "ground", "STUDY", 2.2, 7.2, 7.2, 13.4),
      room("bed-a", "first", "BEDROOM_1", 0, 0, 3.6, 4.4),
      room("bed-b", "first", "BEDROOM_2", 3.6, 0, 7.2, 4.4),
      room("landing", "first", "LANDING_1", 0, 4.4, 2.2, 13.4),
      room("bath-f", "first", "BATHROOM", 2.2, 4.4, 4.5, 7.4),
      room("bed-c", "first", "BEDROOM_3", 4.5, 4.4, 7.2, 13.4),
    ],
    walls: [...groundWalls, ...firstWalls],
    doors: [
      {
        id: "front-door",
        level_id: "ground",
        wall_id: "g-s",
        position_m: { x: 1.1, y: 0 },
        width_m: 0.95,
        head_height_m: 2.1,
      },
    ],
    windows: [
      {
        id: "living-window",
        level_id: "ground",
        wall_id: "g-s",
        position_m: { x: 4.9, y: 0 },
        width_m: 1.5,
        sill_height_m: 0.85,
        head_height_m: 2.1,
      },
      {
        id: "bed-window-a",
        level_id: "first",
        wall_id: "f-s",
        position_m: { x: 2.1, y: 0 },
        width_m: 1.2,
        sill_height_m: 0.85,
        head_height_m: 2.1,
      },
      {
        id: "bed-window-b",
        level_id: "first",
        wall_id: "f-s",
        position_m: { x: 5.4, y: 0 },
        width_m: 1.2,
        sill_height_m: 0.85,
        head_height_m: 2.1,
      },
    ],
    stairs: [
      {
        id: "stair",
        level_id: "ground",
        bbox: { min_x: 0.35, min_y: 7.4, max_x: 2.0, max_y: 12.6 },
      },
    ],
    sections: [
      {
        id: "section-aa",
        sectionType: "longitudinal",
        cutLine: { from: { x: 3.6, y: 0 }, to: { x: 3.6, y: 13.4 } },
      },
      {
        id: "section-bb",
        sectionType: "transverse",
        cutLine: { from: { x: 0, y: 6.7 }, to: { x: 7.2, y: 6.7 } },
      },
    ],
  };
}

function viewBox(svg) {
  return String(svg).match(/viewBox="([^"]+)"/)?.[1] || "0 0 1000 700";
}

function artifact(panelType, svgString, metadata = {}) {
  return {
    asset_id: `asset-${panelType}`,
    asset_type: "drawing_svg",
    panel_type: panelType,
    panelType,
    source_model_hash: GEOMETRY_HASH,
    geometryHash: GEOMETRY_HASH,
    svgHash: `svg-${panelType}`,
    width: Number(String(svgString).match(/width="(\d+)/)?.[1] || 1000),
    height: Number(String(svgString).match(/height="(\d+)/)?.[1] || 700),
    normalizedViewBox: viewBox(svgString),
    svgString,
    metadata: {
      providerUsed: "deterministic_svg",
      source: "compiled_project_technical_panel",
      geometryHash: GEOMETRY_HASH,
      ...metadata,
    },
    ...metadata,
  };
}

function dummyArtifact(panelType, label) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="700" viewBox="0 0 1000 700"><rect width="1000" height="700" fill="#fff"/><text x="80" y="130" font-size="54">${label}</text></svg>`;
  return artifact(panelType, svg, {
    providerUsed: "deterministic",
    imageRenderFallback: true,
    imageRenderFallbackReason: "test_fixture",
  });
}

test("terraced-house A1 sheet carries the visual contract chrome and technical SVG evidence", () => {
  const oldFooter = process.env.A1_SHOW_PROVENANCE_FOOTER;
  delete process.env.A1_SHOW_PROVENANCE_FOOTER;

  try {
    const brief = {
      programme: "Terraced House",
      property_type: "terraced-house",
      site_input: { address: "17 Kensington Road, Scunthorpe DN15 8BQ" },
      target_storeys: 2,
      target_gia_m2: 132,
    };
    const geometry = terracedGeometry();
    const styleDNA = { roof_language: "pitched gable" };
    const sitePanel = buildSiteContextPanelArtifact({
      projectGraphId: "project-a1-visual-contract",
      site: {
        local_boundary_polygon: rect(-3, -5, 11, 20),
        buildable_polygon: rect(0, 0, 7.2, 13.4),
        area_m2: 350,
        boundary_authoritative: false,
        boundary_estimated: true,
        boundary_source: "deterministic_context",
        boundary_confidence: 0.4,
        address: "17 Kensington Road, Scunthorpe DN15 8BQ",
        streetName: "Kensington Road",
        main_entry: {
          orientation: "south",
          source: "fallback",
          bearingDeg: 180,
        },
      },
      geometryHash: GEOMETRY_HASH,
    });
    const planGround = renderPlanSvg(geometry, {
      width: 1200,
      height: 900,
      levelId: "ground",
      sheetMode: true,
      sections: geometry.sections,
    });
    const planFirst = renderPlanSvg(geometry, {
      width: 1200,
      height: 900,
      levelId: "first",
      sheetMode: true,
      sections: geometry.sections,
    });
    const sectionAA = renderSectionSvg(geometry, styleDNA, {
      width: 1200,
      height: 760,
      sectionType: "longitudinal",
      sheetMode: true,
    });
    const sectionBB = renderSectionSvg(geometry, styleDNA, {
      width: 1200,
      height: 760,
      sectionType: "transverse",
      sheetMode: true,
    });
    const panels = [
      sitePanel,
      artifact("floor_plan_ground", planGround.svg, {
        technicalQualityMetadata: planGround.technical_quality_metadata,
      }),
      artifact("floor_plan_first", planFirst.svg, {
        technicalQualityMetadata: planFirst.technical_quality_metadata,
      }),
      ...["north", "south", "east", "west"].map((orientation) => {
        const result = renderElevationSvg(geometry, styleDNA, {
          width: 1000,
          height: 520,
          orientation,
          sheetMode: true,
          allowWeakFacadeFallback: true,
        });
        return artifact(`elevation_${orientation}`, result.svg, {
          technicalQualityMetadata: result.technical_quality_metadata,
        });
      }),
      artifact("section_AA", sectionAA.svg, {
        technicalQualityMetadata: sectionAA.technical_quality_metadata,
      }),
      artifact("section_BB", sectionBB.svg, {
        technicalQualityMetadata: sectionBB.technical_quality_metadata,
      }),
      dummyArtifact("hero_3d", "EXTERIOR"),
      dummyArtifact("axonometric", "AXONOMETRIC"),
      dummyArtifact("interior_3d", "INTERIOR"),
      dummyArtifact("material_palette", "MATERIALS"),
      dummyArtifact("key_notes", "KEY NOTES"),
      buildTitleBlockPanelArtifact({
        projectGraphId: "project-a1-visual-contract",
        brief,
        geometryHash: GEOMETRY_HASH,
        sheetPlan: { sheet_number: "A1-01", label: "RIBA Stage 2" },
      }),
    ];
    const panelArtifacts = Object.fromEntries(
      panels.map((panel) => [panel.asset_id, panel]),
    );
    const layoutTemplate = resolvePresentationLayoutTemplate(brief);
    const panelPlacements = buildPanelPlacements({
      drawingSet: { drawings: [] },
      panelArtifacts,
      targetStoreys: 2,
      layoutTemplate,
      geometryHash: GEOMETRY_HASH,
      briefInputHash: "brief-visual-contract",
    });
    const svg = buildSheetSvg({
      projectGraphId: "project-a1-visual-contract",
      brief,
      geometryHash: GEOMETRY_HASH,
      panelPlacements,
      panelArtifacts,
      qaStatus: "pending",
      sheetNumber: "A1-01",
      sheetLabel: "RIBA Stage 2",
      layoutTemplate,
    });

    expect(svg).toContain('data-layout-template="presentation-v3"');
    expect(svg).toContain('data-sheet-title-bar="true"');
    expect(svg).not.toContain('data-provenance-footer="true"');
    expect(
      (svg.match(/cad-dimension-chain/g) || []).length,
    ).toBeGreaterThanOrEqual(4);
    expect(
      (svg.match(/cad-text-room-area/g) || []).length,
    ).toBeGreaterThanOrEqual(3);
    expect(svg).toContain('data-datum-role="ffl"');
    expect(svg).toContain('data-datum-role="eaves"');
    expect(svg).toContain('data-datum-role="ridge"');
    expect(svg).toContain('data-datum-role="foundation"');
    expect(svg).toContain('id="phase3-section-ground-hatch"');
    expect(svg).toContain('data-site-zone-fill="lawn"');
    expect(svg).not.toContain(">BEDROOM 1<");
    expect(svg).not.toContain(">LANDING 1<");
    expect(svg).not.toContain("ARCHIAI PROJECT");
  } finally {
    if (oldFooter === undefined) {
      delete process.env.A1_SHOW_PROVENANCE_FOOTER;
    } else {
      process.env.A1_SHOW_PROVENANCE_FOOTER = oldFooter;
    }
  }
});

test("section wall detail caps broad interior poche opacity while preserving cut-wall hierarchy", () => {
  const { markup } = buildSectionWallDetailMarkup({
    walls: [
      {
        id: "broad-upper-room-zone",
        x: 20,
        y: 40,
        width: 128,
        height: 132,
        truthState: "direct",
        clipGeometry: {
          truthKind: "cut_profile",
          bandCoverageRatio: 1,
        },
      },
      {
        id: "thin-cut-wall",
        x: 180,
        y: 40,
        width: 18,
        height: 132,
        truthState: "direct",
        clipGeometry: {
          truthKind: "cut_profile",
          bandCoverageRatio: 1,
        },
      },
    ],
    lineweights: { cutOutline: 2, guide: 0.7, hatch: 0.7 },
  });

  const backgroundMatch = markup.match(
    /id="phase13-section-cut-wall-broad-upper-room-zone"[\s\S]*?data-poche-zone="interior-background" data-poche-opacity="([^"]+)"/,
  );
  const cutWallMatch = markup.match(
    /id="phase13-section-cut-wall-thin-cut-wall"[\s\S]*?data-poche-zone="cut-wall" data-poche-opacity="([^"]+)"/,
  );

  expect(backgroundMatch).toBeTruthy();
  expect(Number(backgroundMatch[1])).toBeLessThanOrEqual(0.38);
  expect(cutWallMatch).toBeTruthy();
  expect(Number(cutWallMatch[1])).toBeGreaterThan(0.7);
  expect(markup).toContain('stroke="#111"');
});
