import {
  resetFeatureFlags,
  setFeatureFlag,
} from "../../config/featureFlags.js";
import { resolveEntityImpact } from "../../services/editing/entityImpactResolver.js";
import { executeApprovedRegeneration } from "../../services/editing/regenerationExecutionService.js";
import { buildPlanGraphic } from "../../services/drawing/planGraphicsService.js";
import { buildSectionGraphic } from "../../services/drawing/sectionGraphicsService.js";
import { selectSectionCandidates } from "../../services/drawing/sectionCutPlanner.js";
import { evaluateTechnicalPanels } from "../../services/drawing/panelTechnicalQualityService.js";
import { buildA1RecoveryExecutionBridge } from "../../services/a1/a1RecoveryExecutionBridge.js";

function rectangle(minX, minY, maxX, maxY) {
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
}

function createProjectGeometry() {
  return {
    schema_version: "canonical-project-geometry-v2",
    project_id: "phase7-tech-package",
    site: {
      boundary_polygon: rectangle(0, 0, 12, 10),
      buildable_polygon: rectangle(0.5, 0.5, 11.5, 9.5),
      boundary_bbox: {
        min_x: 0,
        min_y: 0,
        max_x: 12,
        max_y: 10,
        width: 12,
        height: 10,
      },
      buildable_bbox: {
        min_x: 0.5,
        min_y: 0.5,
        max_x: 11.5,
        max_y: 9.5,
        width: 11,
        height: 9,
      },
      north_orientation_deg: 0,
    },
    levels: [
      {
        id: "ground",
        level_number: 0,
        name: "Ground Floor",
        height_m: 3.2,
        footprint_id: "fp-ground",
      },
      {
        id: "first",
        level_number: 1,
        name: "First Floor",
        height_m: 3.1,
        footprint_id: "fp-first",
      },
    ],
    footprints: [
      {
        id: "fp-ground",
        polygon: rectangle(1, 1, 11, 8.5),
        bbox: {
          min_x: 1,
          min_y: 1,
          max_x: 11,
          max_y: 8.5,
          width: 10,
          height: 7.5,
        },
      },
      {
        id: "fp-first",
        polygon: rectangle(1, 1, 11, 8.5),
        bbox: {
          min_x: 1,
          min_y: 1,
          max_x: 11,
          max_y: 8.5,
          width: 10,
          height: 7.5,
        },
      },
    ],
    rooms: [
      {
        id: "living",
        name: "Living Room",
        level_id: "ground",
        zone: "public",
        actual_area: 22,
        centroid: { x: 4, y: 4 },
        polygon: rectangle(1, 1, 7, 5.5),
        bbox: { min_x: 1, min_y: 1, max_x: 7, max_y: 5.5 },
      },
      {
        id: "kitchen",
        name: "Kitchen",
        level_id: "ground",
        zone: "service",
        actual_area: 14,
        centroid: { x: 4, y: 4 },
        polygon: rectangle(6.5, 1, 11, 5.5),
        bbox: { min_x: 6.5, min_y: 1, max_x: 11, max_y: 5.5 },
        wet_zone: true,
      },
      {
        id: "bedroom-1",
        name: "Bedroom 1",
        level_id: "first",
        zone: "private",
        actual_area: 16,
        centroid: { x: 4, y: 4 },
        polygon: rectangle(1, 1, 7, 5.5),
        bbox: { min_x: 1, min_y: 1, max_x: 7, max_y: 5.5 },
      },
    ],
    walls: [
      {
        id: "wall-north-ground",
        level_id: "ground",
        start: { x: 1, y: 1 },
        end: { x: 11, y: 1 },
        exterior: true,
        orientation: "horizontal",
        room_ids: ["living", "kitchen"],
        metadata: { side: "north" },
      },
      {
        id: "wall-south-ground",
        level_id: "ground",
        start: { x: 1, y: 8.5 },
        end: { x: 11, y: 8.5 },
        exterior: true,
        orientation: "horizontal",
        room_ids: ["living", "kitchen"],
        metadata: { side: "south" },
      },
      {
        id: "wall-east-ground",
        level_id: "ground",
        start: { x: 11, y: 1 },
        end: { x: 11, y: 8.5 },
        exterior: true,
        orientation: "vertical",
        room_ids: ["kitchen"],
        metadata: { side: "east" },
      },
      {
        id: "wall-west-ground",
        level_id: "ground",
        start: { x: 1, y: 1 },
        end: { x: 1, y: 8.5 },
        exterior: true,
        orientation: "vertical",
        room_ids: ["living"],
        metadata: { side: "west" },
      },
    ],
    doors: [
      {
        id: "door-ground",
        level_id: "ground",
        wall_id: "wall-south-ground",
        position_m: { x: 4.5, y: 8.5 },
      },
    ],
    windows: [
      {
        id: "window-ground",
        level_id: "ground",
        wall_id: "wall-north-ground",
        position_m: { x: 6, y: 1 },
        width_m: 1.8,
        sill_height_m: 0.9,
        head_height_m: 2.1,
      },
    ],
    stairs: [
      {
        id: "main-stair",
        name: "Main Stair",
        level_id: "ground",
        bbox: { min_x: 8, min_y: 5.8, max_x: 10, max_y: 8.2 },
      },
    ],
    circulation: [
      {
        id: "circ-ground",
        level_id: "ground",
        polyline: [
          { x: 2, y: 7.8 },
          { x: 5, y: 7.8 },
          { x: 8.5, y: 7.8 },
        ],
      },
    ],
    metadata: {},
  };
}

describe("Phase 7 technical drawing execution", () => {
  afterEach(() => {
    resetFeatureFlags();
  });

  test("resolves entity-level impacts for a facade-side regeneration request", () => {
    const geometry = createProjectGeometry();
    const result = resolveEntityImpact({
      targetLayer: "facade_grammar",
      projectGeometry: geometry,
      drawings: {
        elevation: [
          {
            orientation: "north",
            title: "North Elevation",
            svg: "<svg><text>North</text></svg>",
          },
        ],
        section: [
          {
            section_type: "longitudinal",
            title: "Section",
            svg: "<svg><text>Section</text></svg>",
          },
        ],
      },
      options: { side: "north" },
    });

    expect(result.impactedEntities.some((entry) => entry.type === "wall")).toBe(
      true,
    );
    expect(result.impactedFragments).toContain("drawing:elevation:north");
  });

  test("limits section dependencies to the section candidates an entity actually intersects", () => {
    const geometry = createProjectGeometry();
    const result = resolveEntityImpact({
      targetLayer: "room_layout",
      projectGeometry: geometry,
      drawings: {
        section: [
          {
            section_type: "longitudinal",
            title: "Longitudinal Section",
            svg: "<svg><text>Longitudinal</text></svg>",
          },
          {
            section_type: "transverse",
            title: "Transverse Section",
            svg: "<svg><text>Transverse</text></svg>",
          },
        ],
      },
      options: { entityIds: ["entity:room:kitchen"] },
    });

    expect(result.impactedFragments).toContain("drawing:section:longitudinal");
    expect(result.impactedFragments).not.toContain(
      "drawing:section:transverse",
    );
  });

  test("builds plan graphics with deterministic fallback annotation placement", () => {
    const graphic = buildPlanGraphic(createProjectGeometry(), {
      levelId: "ground",
    });

    expect(graphic.annotation_layout.placements.length).toBeGreaterThan(1);
    expect(
      graphic.annotation_validation.fallbackPlacementCount,
    ).toBeGreaterThan(0);
    expect(graphic.svg).toContain("phase7-scale-bar");
    expect(graphic.svg).toContain("phase7-section-markers");
  });

  test("selects stair-focused section candidates and enriches section graphics", () => {
    const geometry = createProjectGeometry();
    const sectionPlan = selectSectionCandidates(geometry);
    const sectionGraphic = buildSectionGraphic(
      geometry,
      {},
      {
        sectionType: "longitudinal",
      },
    );

    expect(sectionPlan.candidates[0].focusEntityIds).toContain(
      "entity:stair:main-stair",
    );
    expect(
      sectionGraphic.technical_quality_metadata.section_usefulness_score,
    ).toBeGreaterThan(0.7);
    expect(sectionGraphic.svg).toContain("phase7-section-semantics");
  });

  test("scores weak technical panels against phase 7 thresholds", () => {
    setFeatureFlag("useTechnicalPanelScoringPhase7", true);

    const result = evaluateTechnicalPanels({
      drawings: {
        plan: [
          {
            level_id: "ground",
            title: "Weak Plan",
            room_count: 2,
            svg: '<svg><path d="undefined"/></svg>',
            technical_quality_metadata: {
              line_hierarchy: { exterior_wall: 4, interior_wall: 4 },
              room_label_count: 0,
              wall_count: 1,
            },
          },
        ],
      },
    });

    expect(result.blockingPanels).toHaveLength(1);
    expect(result.panels[0].score.thresholds.blocking).toBeGreaterThan(0);
    expect(result.panels[0].blockers.length).toBeGreaterThan(0);
  });

  test("bridges blocked A1 panels to targeted regeneration plans", () => {
    const geometry = createProjectGeometry();
    const bridge = buildA1RecoveryExecutionBridge({
      projectGeometry: geometry,
      drawings: {
        plan: [
          {
            level_id: "ground",
            title: "Ground Plan",
            svg: "<svg><text>Ground</text></svg>",
            technical_quality_metadata: {
              line_hierarchy: { exterior_wall: 6, interior_wall: 4 },
              room_label_count: 2,
              wall_count: 4,
              window_count: 1,
              stair_count: 1,
              has_title_block: true,
              has_north_arrow: true,
              has_legend: true,
            },
          },
        ],
      },
      panelCandidates: [
        {
          id: "panel:floor-plan:ground",
          type: "floor_plan",
          title: "Ground Plan",
          sourceArtifacts: ["drawing:plan:ground"],
        },
      ],
      freshness: {
        stalePanels: [{ id: "panel:floor-plan:ground" }],
        missingPanels: [],
      },
      technicalPanelGate: {
        blockingPanels: ["panel:floor-plan:ground"],
      },
    });

    expect(bridge.blockedPanelIds).toContain("panel:floor-plan:ground");
    expect(
      bridge.repairPlanner.repairs[0].plan.minimumSafeScope.drawingFragments,
    ).toContain("drawing:plan:ground");
    expect(
      bridge.repairPlanner.repairs[0].impactedEntities.length,
    ).toBeGreaterThan(0);
  });

  test("blocks technical panels when quality data is missing for a candidate", () => {
    const bridge = buildA1RecoveryExecutionBridge({
      projectGeometry: createProjectGeometry(),
      drawings: {
        plan: [],
      },
      panelCandidates: [
        {
          id: "panel:floor-plan:ground",
          type: "floor_plan",
          title: "Ground Plan",
          sourceArtifacts: ["drawing:plan:ground"],
        },
      ],
      technicalPanelGate: {
        blockingPanels: ["panel:floor-plan:ground"],
      },
      freshness: {
        stalePanels: [],
        missingPanels: [{ id: "panel:floor-plan:ground" }],
      },
    });

    expect(bridge.blockedPanelIds).toContain("panel:floor-plan:ground");
    expect(bridge.repairPlanner.repairs).toHaveLength(1);
  });

  test("executes minimum-scope regeneration and reports freshness updates", async () => {
    const geometry = createProjectGeometry();
    const result = await executeApprovedRegeneration({
      projectGeometry: geometry,
      drawings: {
        plan: [
          {
            level_id: "ground",
            title: "Legacy Ground",
            svg: "",
          },
          {
            level_id: "first",
            title: "Legacy First",
            svg: "<svg><text>First</text></svg>",
          },
        ],
      },
      approvedPlan: {
        targetLayer: "drawings",
        minimumSafeScope: {
          geometryFragments: [],
          drawingFragments: ["drawing:plan:ground"],
          facadeFragments: [],
          visualFragments: [],
          panelFragments: [],
          readinessFragments: ["readiness:default"],
        },
      },
    });

    expect(
      result.drawings.plan.find((entry) => entry.level_id === "ground").svg,
    ).toContain("<svg");
    expect(
      result.drawings.plan.find((entry) => entry.level_id === "first").title,
    ).toBe("Legacy First");
    expect(result.freshnessUpdates.refreshedFragments).toContain(
      "drawing:plan:ground",
    );
    expect(result.artifactFreshness.staleFragments).not.toContain(
      "drawing:plan:ground",
    );
  });

  test("executes multiple requested drawing fragments instead of only the first one", async () => {
    const geometry = createProjectGeometry();
    const result = await executeApprovedRegeneration({
      projectGeometry: geometry,
      drawings: {
        plan: [
          {
            level_id: "ground",
            title: "Legacy Ground",
            svg: "",
          },
          {
            level_id: "first",
            title: "Legacy First",
            svg: "",
          },
        ],
      },
      approvedPlan: {
        targetLayer: "drawings",
        minimumSafeScope: {
          geometryFragments: [],
          drawingFragments: ["drawing:plan:ground", "drawing:plan:first"],
          facadeFragments: [],
          visualFragments: [],
          panelFragments: [],
          readinessFragments: ["readiness:default"],
        },
      },
    });

    expect(result.drawings.plan).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ level_id: "ground" }),
        expect.objectContaining({ level_id: "first" }),
      ]),
    );
    expect(result.freshnessUpdates.refreshedFragments).toEqual(
      expect.arrayContaining(["drawing:plan:ground", "drawing:plan:first"]),
    );
  });
});
