import {
  resetFeatureFlags,
  setFeatureFlag,
} from "../../config/featureFlags.js";
import { coerceToCanonicalProjectGeometry } from "../../services/cad/geometryFactory.js";
import { buildSectionEvidence } from "../../services/drawing/sectionEvidenceService.js";
import { renderSectionSvg } from "../../services/drawing/svgSectionRenderer.js";
import { scoreTechnicalPanel } from "../../services/drawing/technicalPanelScoringService.js";
import { projectFacadeGeometry } from "../../services/facade/facadeProjectionService.js";
import { buildSideFacadeSchema } from "../../services/facade/facadeSchemaBuilder.js";
import { assembleFacadeSideSemantics } from "../../services/facade/facadeSemanticAssembler.js";
import { buildProjectReadinessResponse } from "../../services/models/architectureBackendContracts.js";

function rectangle(minX, minY, maxX, maxY) {
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
}

function createRawGeometry({
  roofType = "pitched gable",
  groundCondition = "level_ground",
  supportMode = null,
  gradeDeltaM = 0,
} = {}) {
  return {
    project_id: "phase16-rich-geometry",
    site: {
      boundary_bbox: {
        min_x: 0,
        min_y: 0,
        max_x: 12,
        max_y: 10,
        width: 12,
        height: 10,
      },
      buildable_bbox: {
        min_x: 0,
        min_y: 0,
        max_x: 12,
        max_y: 10,
        width: 12,
        height: 10,
      },
      boundary_polygon: rectangle(0, 0, 12, 10),
      buildable_polygon: rectangle(0, 0, 12, 10),
      ground_condition: groundCondition,
      support_mode: supportMode,
      grade_delta_m: gradeDeltaM,
      plinth_height_m: groundCondition.includes("step") ? 0.32 : 0.18,
    },
    roof: {
      id: "roof-main",
      type: roofType,
      polygon: rectangle(0, 0, 12, 10),
      bbox: { min_x: 0, min_y: 0, max_x: 12, max_y: 10, width: 12, height: 10 },
    },
    metadata: {
      facade_features: [
        {
          id: "dormer-north",
          type: "dormer",
          side: "north",
          width_m: 1.4,
          height_m: 0.9,
          center_x: 6,
          center_y: 2.2,
        },
      ],
    },
    levels: [
      {
        id: "ground",
        level_number: 0,
        name: "Ground Floor",
        height_m: 3.2,
        footprint: rectangle(0, 0, 12, 10),
      },
      {
        id: "first",
        level_number: 1,
        name: "First Floor",
        height_m: 3.1,
        footprint: rectangle(0, 0, 12, 10),
      },
    ],
    rooms: [
      {
        id: "living",
        name: "Living Room",
        level_id: "ground",
        actual_area: 28,
        polygon: rectangle(4.1, 0.8, 8.4, 5.4),
        bbox: { min_x: 4.1, min_y: 0.8, max_x: 8.4, max_y: 5.4 },
      },
    ],
    walls: [
      {
        id: "wall-core-ground",
        level_id: "ground",
        start: { x: 6, y: 0 },
        end: { x: 6, y: 10 },
        thickness_m: 0.22,
      },
      {
        id: "wall-core-first",
        level_id: "first",
        start: { x: 6, y: 0 },
        end: { x: 6, y: 10 },
        thickness_m: 0.22,
      },
      {
        id: "wall-north",
        level_id: "ground",
        start: { x: 0, y: 0 },
        end: { x: 12, y: 0 },
        thickness_m: 0.24,
        exterior: true,
        kind: "exterior",
        side: "north",
      },
      {
        id: "wall-south",
        level_id: "ground",
        start: { x: 0, y: 10 },
        end: { x: 12, y: 10 },
        thickness_m: 0.24,
        exterior: true,
        kind: "exterior",
        side: "south",
      },
    ],
    windows: [
      {
        id: "window-north-a",
        wall_id: "wall-north",
        level_id: "ground",
        position_m: { x: 3, y: 0 },
        width_m: 1.5,
        sill_height_m: 0.9,
        head_height_m: 2.1,
      },
      {
        id: "window-north-b",
        wall_id: "wall-north",
        level_id: "ground",
        position_m: { x: 8, y: 0 },
        width_m: 1.5,
        sill_height_m: 0.9,
        head_height_m: 2.1,
      },
    ],
    doors: [
      {
        id: "door-south",
        wall_id: "wall-south",
        level_id: "ground",
        position_m: { x: 6, y: 10 },
        width_m: 1.1,
        head_height_m: 2.2,
      },
    ],
    stairs: [
      {
        id: "main-stair",
        level_id: "ground",
        polygon: rectangle(5.2, 1.8, 6.8, 7.4),
        bbox: { min_x: 5.2, min_y: 1.8, max_x: 6.8, max_y: 7.4 },
      },
    ],
  };
}

describe("Phase 16 richer canonical roof and foundation geometry", () => {
  beforeEach(() => {
    resetFeatureFlags();
    setFeatureFlag("useRicherCanonicalRoofGeometryPhase16", true);
    setFeatureFlag("useRicherCanonicalFoundationGeometryPhase16", true);
    setFeatureFlag("useUpstreamConstructionPrimitivesPhase16", true);
    setFeatureFlag("useRoofFoundationTruthPhase16", true);
    setFeatureFlag("useRoofFoundationCredibilityGatePhase16", true);
    setFeatureFlag("useSectionConstructionTruthPhase14", true);
    setFeatureFlag("useDraftingGradeSectionGraphicsPhase14", true);
    setFeatureFlag("useClippedSectionGraphicsPhase13", true);
  });

  afterEach(() => {
    resetFeatureFlags();
  });

  test("coercion synthesizes richer roof primitive families and explicit roof truth", () => {
    const geometry = coerceToCanonicalProjectGeometry(createRawGeometry());
    const families = new Set(
      geometry.roof_primitives.map((entry) => entry.primitive_family),
    );

    expect(geometry.roof_primitives.length).toBeGreaterThanOrEqual(6);
    expect(families.has("roof_plane")).toBe(true);
    expect(families.has("ridge") || families.has("roof_break")).toBe(true);
    expect(families.has("roof_edge") || families.has("eave")).toBe(true);
    expect(
      geometry.metadata.canonical_construction_truth.roof.support_mode,
    ).toBe("explicit_generated");
  });

  test("coercion synthesizes richer ground relation primitives and explicit foundation truth", () => {
    const geometry = coerceToCanonicalProjectGeometry(
      createRawGeometry({
        groundCondition: "stepped_grade",
        supportMode: "stepped_grade",
        gradeDeltaM: 1.4,
      }),
    );
    const conditionTypes = new Set(
      geometry.base_conditions.map((entry) => entry.condition_type),
    );

    expect(conditionTypes.has("ground_line")).toBe(true);
    expect(conditionTypes.has("plinth_line")).toBe(true);
    expect(conditionTypes.has("slab_ground_interface")).toBe(true);
    expect(
      conditionTypes.has("step_line") || conditionTypes.has("grade_break"),
    ).toBe(true);
    expect(
      geometry.metadata.canonical_construction_truth.foundation.support_mode,
    ).toBe("explicit_ground_primitives");
  });

  test("section evidence exposes phase16 roof and foundation truth modes", () => {
    const geometry = coerceToCanonicalProjectGeometry(createRawGeometry());
    const evidence = buildSectionEvidence(geometry, {
      sectionType: "longitudinal",
      cutLine: { from: { x: 6, y: 0 }, to: { x: 6, y: 10 } },
      strategyId: "phase16-aligned",
      strategyName: "Phase 16 Aligned",
    });

    expect(evidence.summary.roofTruthMode).toBe("explicit_generated");
    expect(evidence.summary.foundationTruthMode).toBe(
      "explicit_ground_primitives",
    );
    expect(evidence.summary.explicitRoofEdgeCount).toBeGreaterThan(0);
    expect(evidence.summary.explicitGroundRelationCount).toBeGreaterThan(0);
  });

  test("facade projection and schema preserve richer roof seeds and support mode", () => {
    const geometry = coerceToCanonicalProjectGeometry(
      createRawGeometry({ roofType: "flat roof" }),
    );
    const projection = projectFacadeGeometry(geometry, "north");
    const semantics = assembleFacadeSideSemantics({
      side: "north",
      projection,
      facadeOrientation: {},
      roofLanguage: "flat roof",
      features: geometry.metadata.facade_features,
    });
    const schema = buildSideFacadeSchema({
      side: "north",
      projection,
      facadeOrientation: {},
      facadeSemantics: semantics,
      features: geometry.metadata.facade_features,
      roofLanguage: "flat roof",
    });

    expect(projection.roofEdgeSeeds.length).toBeGreaterThan(0);
    expect(projection.roofPrimitiveCount).toBeGreaterThan(0);
    expect(projection.roofSupportMode).toBe("explicit_generated");
    expect(schema.evidenceSummary.roofPrimitiveCount).toBeGreaterThan(0);
    expect(schema.evidenceSummary.roofSupportMode).toBe("explicit_generated");
  });

  test("renderer metadata carries phase16 roof and foundation truth modes", () => {
    const geometry = coerceToCanonicalProjectGeometry(createRawGeometry());
    const drawing = renderSectionSvg(
      geometry,
      {},
      {
        sectionType: "longitudinal",
        sectionProfile: {
          id: "phase16-section",
          sectionType: "longitudinal",
          cutLine: { from: { x: 6, y: 0 }, to: { x: 6, y: 10 } },
          strategyId: "phase16-aligned",
          strategyName: "Phase 16 Aligned",
        },
      },
    );

    expect(drawing.technical_quality_metadata.roof_truth_mode).toBe(
      "explicit_generated",
    );
    expect(drawing.technical_quality_metadata.foundation_truth_mode).toBe(
      "explicit_ground_primitives",
    );
    expect(drawing.technical_quality_metadata.roof_edge_count).toBeGreaterThan(
      0,
    );
    expect(
      drawing.technical_quality_metadata.explicit_ground_relation_count,
    ).toBeGreaterThan(0);
    expect(drawing.svg).toContain('data-truth-mode="explicit_generated"');
  });

  test("imported derived roof primitives stay derived_profile_only instead of overclaiming explicit roof truth", () => {
    const geometry = coerceToCanonicalProjectGeometry({
      ...createRawGeometry(),
      roof_primitives: [
        {
          primitive_family: "derived_roof_profile",
          type: "derived_roof_profile",
          start: { x: 0, y: 5 },
          end: { x: 12, y: 5 },
          support_mode: "derived_profile_only",
        },
      ],
    });
    const evidence = buildSectionEvidence(geometry, {
      sectionType: "longitudinal",
      cutLine: { from: { x: 6, y: 0 }, to: { x: 6, y: 10 } },
      strategyId: "phase16-derived-roof",
      strategyName: "Phase 16 Derived Roof",
    });

    expect(
      geometry.metadata.canonical_construction_truth.roof.support_mode,
    ).toBe("derived_profile_only");
    expect(evidence.sectionIntersections.roofTruthMode).toBe(
      "derived_profile_only",
    );
    expect(evidence.summary.roofTruthMode).toBe("derived_profile_only");
  });

  test("contextual base-condition truth stays contextual in rendering and gating instead of overblocking", () => {
    const geometry = coerceToCanonicalProjectGeometry({
      ...createRawGeometry(),
      foundations: [],
      base_conditions: [
        {
          condition_type: "level_ground",
          support_mode: "contextual_ground_relation",
          polygon: rectangle(0, 0, 12, 10),
          bbox: {
            min_x: 0,
            min_y: 0,
            max_x: 12,
            max_y: 10,
            width: 12,
            height: 10,
          },
        },
      ],
    });
    const drawing = renderSectionSvg(
      geometry,
      {},
      {
        sectionType: "longitudinal",
        sectionProfile: {
          id: "phase16-contextual-foundation",
          sectionType: "longitudinal",
          cutLine: { from: { x: 6, y: 0 }, to: { x: 6, y: 10 } },
          strategyId: "phase16-contextual-foundation",
          strategyName: "Phase 16 Contextual Foundation",
        },
      },
    );
    const scored = scoreTechnicalPanel({
      drawingType: "section",
      drawing,
      readability: { score: 0.88, warnings: [] },
      annotation: { warnings: [], errors: [] },
      annotationPlacement: {
        placementStable: true,
        warnings: [],
        errors: [],
      },
    });

    expect(
      geometry.metadata.canonical_construction_truth.foundation.support_mode,
    ).toBe("contextual_ground_relation");
    expect(drawing.technical_quality_metadata.foundation_truth_mode).toBe(
      "contextual_ground_relation",
    );
    expect(drawing.svg).toContain('data-truth-state="contextual"');
    expect(scored.verdict).not.toBe("block");
    expect(
      scored.warnings.some((entry) =>
        String(entry).includes("contextual ground relation"),
      ),
    ).toBe(true);
  });

  test("technical scoring blocks roof-language-only sections under phase16 gate", () => {
    const result = scoreTechnicalPanel({
      drawingType: "section",
      drawing: {
        title: "Weak Section",
        svg: "<svg />",
        technical_quality_metadata: {
          geometry_complete: true,
          annotation_guarantee: true,
          section_usefulness_score: 0.8,
          section_direct_evidence_quality: "verified",
          section_direct_evidence_score: 0.8,
          section_inferred_evidence_quality: "verified",
          section_construction_truth_quality: "verified",
          roof_truth_quality: "blocked",
          roof_truth_mode: "roof_language_only",
          foundation_truth_quality: "verified",
          foundation_truth_mode: "explicit_ground_primitives",
          level_label_count: 2,
          room_label_count: 1,
          cut_room_count: 1,
          section_direct_clip_count: 3,
          foundation_marker_count: 1,
          roof_profile_visible: true,
        },
      },
      readability: { score: 0.88, warnings: [] },
      annotation: { warnings: [], errors: [] },
      annotationPlacement: {
        placementStable: true,
        warnings: [],
        errors: [],
      },
    });

    expect(result.verdict).toBe("block");
    expect(
      result.blockers.some((entry) =>
        String(entry).includes("only communicates roof language"),
      ),
    ).toBe(true);
  });

  test("project-readiness contract exposes canonical roof and foundation truth modes", () => {
    const response = buildProjectReadinessResponse({
      result: {
        ready: false,
        composeReady: false,
        finalSheetRegression: {
          roofTruthMode: "derived_profile_only",
          foundationTruthMode: "contextual_ground_relation",
        },
        verificationBundle: {
          phase: "pre_compose",
          verification: {
            phase: "pre_compose",
            sectionDirectEvidenceQuality: "verified",
            sectionInferredEvidenceQuality: "verified",
            sectionConstructionTruthQuality: "verified",
            slabTruthQuality: "verified",
            roofTruthQuality: "verified",
            roofTruthMode: "explicit_generated",
            foundationTruthQuality: "verified",
            foundationTruthMode: "explicit_ground_primitives",
            renderedTextEvidenceQuality: "provisional",
            sectionEvidenceQuality: "verified",
            sideFacadeEvidenceQuality: "verified",
            publishabilityDecision: "provisional",
            provisional: true,
            decisive: false,
            overallDecision: "provisional",
            overallStatus: "warning",
            components: {},
          },
        },
      },
    });

    expect(response.roofTruthMode).toBe("explicit_generated");
    expect(response.foundationTruthMode).toBe("explicit_ground_primitives");
    expect(response.verification.roofTruthMode).toBe(response.roofTruthMode);
    expect(response.verification.foundationTruthMode).toBe(
      response.foundationTruthMode,
    );
  });
});
